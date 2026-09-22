export type PendingWorkScope = 'products' | 'quotes' | 'aluminum' | (string & {});

export type PendingWorkFlushHandler = () => void | boolean | Promise<void | boolean>;

type PendingTask = {
  scope: PendingWorkScope;
  promise: Promise<unknown>;
};

type RegisteredFlushHandler = {
  scope: PendingWorkScope;
  handler: PendingWorkFlushHandler;
};

export class PendingWorkError extends Error {
  override readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'PendingWorkError';
    this.cause = cause;
  }
}

function taskError(error: unknown): PendingWorkError {
  if (error instanceof PendingWorkError) return error;
  const detail = error instanceof Error ? error.message.trim() : '';
  return new PendingWorkError(
    detail
      ? `Chưa thể hoàn tất công việc đang chờ: ${detail}`
      : 'Chưa thể hoàn tất công việc đang chờ. Vui lòng thử lại.',
    error,
  );
}

/**
 * Coordinates browser work that must finish before leaving a form or signing out.
 *
 * Upload promises are settled first, then registered draft flushers run, and any
 * work started by those flushers is settled last. Flush calls are serialized so
 * two rapid navigation/logout clicks cannot race each other.
 */
export class PendingWorkCoordinator {
  private readonly tasks = new Map<symbol, PendingTask>();
  private readonly handlers = new Map<symbol, RegisteredFlushHandler>();
  private flushTail: Promise<void> = Promise.resolve();

  track<T>(scope: PendingWorkScope, promise: Promise<T>): Promise<T> {
    const id = Symbol(scope);
    const tracked = Promise.resolve(promise);
    this.tasks.set(id, { scope, promise: tracked });
    const remove = () => this.tasks.delete(id);
    void tracked.then(remove, remove);
    return tracked;
  }

  register(scope: PendingWorkScope, handler: PendingWorkFlushHandler): () => void {
    const id = Symbol(scope);
    this.handlers.set(id, { scope, handler });
    return () => this.handlers.delete(id);
  }

  flush(scope?: PendingWorkScope): Promise<void> {
    const run = this.flushTail.then(
      () => this.performFlush(scope),
      () => this.performFlush(scope),
    );
    this.flushTail = run.catch(() => undefined);
    return run;
  }

  private matches(candidate: PendingWorkScope, requested?: PendingWorkScope): boolean {
    return requested === undefined || candidate === requested;
  }

  private async settleTasks(scope?: PendingWorkScope): Promise<void> {
    for (;;) {
      const pending = [...this.tasks.values()]
        .filter((task) => this.matches(task.scope, scope))
        .map((task) => task.promise);
      if (pending.length === 0) return;

      const results = await Promise.allSettled(pending);
      const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
      if (rejected) throw taskError(rejected.reason);
    }
  }

  private async performFlush(scope?: PendingWorkScope): Promise<void> {
    await this.settleTasks(scope);

    // Let React commit state updates produced by a just-finished upload before a
    // draft flusher reads its latest refs. This does not depend on animation
    // frames, which may pause in a hidden browser tab.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await this.settleTasks(scope);

    const handlers = [...this.handlers.values()].filter((entry) => this.matches(entry.scope, scope));
    const results = await Promise.allSettled(handlers.map((entry) => entry.handler()));
    const failed = results.find((result) =>
      result.status === 'rejected' || (result.status === 'fulfilled' && result.value === false));
    if (failed) {
      if (failed.status === 'rejected') throw taskError(failed.reason);
      throw new PendingWorkError('Dữ liệu chưa lưu được lên Supabase. Vui lòng thử lại.');
    }

    await this.settleTasks(scope);
  }
}

const coordinator = new PendingWorkCoordinator();

export function trackPendingWork<T>(scope: PendingWorkScope, promise: Promise<T>): Promise<T> {
  return coordinator.track(scope, promise);
}

export function registerPendingWorkFlush(
  scope: PendingWorkScope,
  handler: PendingWorkFlushHandler,
): () => void {
  return coordinator.register(scope, handler);
}

export function flushPendingWork(scope?: PendingWorkScope): Promise<void> {
  return coordinator.flush(scope);
}
