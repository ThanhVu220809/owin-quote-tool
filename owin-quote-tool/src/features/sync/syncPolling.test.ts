import { describe, expect, it, vi } from 'vitest';
import { createSyncPoller } from './syncPolling';

describe('sync polling', () => {
  it('poll 30s khi visible, 120s khi hidden và không chồng request', async () => {
    vi.useFakeTimers();
    let visible = true;
    let resolve: (() => void) | undefined;
    const check = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
    const poller = createSyncPoller({
      check,
      isVisible: () => visible,
      setTimeoutFn: (callback, delay) => setTimeout(callback, delay) as unknown as number,
      clearTimeoutFn: (handle) => clearTimeout(handle as unknown as ReturnType<typeof setTimeout>),
    });
    poller.start();
    expect(check).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(30_000);
    expect(check).toHaveBeenCalledTimes(1);
    resolve?.();
    await vi.runOnlyPendingTimersAsync();
    vi.advanceTimersByTime(30_000);
    expect(check).toHaveBeenCalledTimes(2);
    visible = false;
    resolve?.();
    await Promise.resolve();
    vi.advanceTimersByTime(30_000);
    expect(check).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(90_000);
    expect(check).toHaveBeenCalledTimes(3);
    poller.stop();
    vi.useRealTimers();
  });
});
