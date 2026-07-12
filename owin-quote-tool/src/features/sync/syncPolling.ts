export interface SyncPoller {
  start(): void;
  trigger(): void;
  stop(): void;
}

export interface SyncPollerOptions {
  check: () => Promise<void>;
  isVisible: () => boolean;
  visibleDelayMs?: number;
  hiddenDelayMs?: number;
  setTimeoutFn?: (callback: () => void, delay: number) => number;
  clearTimeoutFn?: (handle: number) => void;
}

/** Recursive polling: vòng trước xong mới lên lịch vòng sau, không dùng setInterval. */
export function createSyncPoller(options: SyncPollerOptions): SyncPoller {
  const setTimer = options.setTimeoutFn ?? ((callback, delay) => window.setTimeout(callback, delay));
  const clearTimer = options.clearTimeoutFn ?? ((handle) => window.clearTimeout(handle));
  const visibleDelay = options.visibleDelayMs ?? 30_000;
  const hiddenDelay = options.hiddenDelayMs ?? 120_000;
  let stopped = true;
  let running = false;
  let timer: number | null = null;

  const schedule = () => {
    if (stopped) return;
    if (timer !== null) clearTimer(timer);
    timer = setTimer(() => {
      timer = null;
      void run();
    }, options.isVisible() ? visibleDelay : hiddenDelay);
  };

  const run = async () => {
    if (stopped || running) return;
    running = true;
    try { await options.check(); } finally {
      running = false;
      schedule();
    }
  };

  return {
    start() { stopped = false; void run(); },
    trigger() { void run(); },
    stop() {
      stopped = true;
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
  };
}
