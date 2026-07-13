import { describe, expect, it, vi } from 'vitest';
import { PendingWorkCoordinator, PendingWorkError } from './pendingWork';

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

describe('PendingWorkCoordinator', () => {
  it('waits for uploads before flushing the matching draft', async () => {
    const coordinator = new PendingWorkCoordinator();
    const upload = deferred<void>();
    const order: string[] = [];
    void coordinator.track('quotes', upload.promise.then(() => { order.push('upload'); }));
    coordinator.register('quotes', () => { order.push('flush'); });

    const flush = coordinator.flush('quotes');
    await Promise.resolve();
    expect(order).toEqual([]);
    upload.resolve();
    await flush;

    expect(order).toEqual(['upload', 'flush']);
  });

  it('keeps unrelated scopes out of a scoped flush and includes them globally', async () => {
    const coordinator = new PendingWorkCoordinator();
    const products = vi.fn();
    const quotes = vi.fn();
    coordinator.register('products', products);
    coordinator.register('quotes', quotes);

    await coordinator.flush('products');
    expect(products).toHaveBeenCalledTimes(1);
    expect(quotes).not.toHaveBeenCalled();

    await coordinator.flush();
    expect(products).toHaveBeenCalledTimes(2);
    expect(quotes).toHaveBeenCalledTimes(1);
  });

  it('rejects navigation when an upload or a draft flush fails', async () => {
    const uploadCoordinator = new PendingWorkCoordinator();
    const failedUpload = deferred<void>();
    void uploadCoordinator.track('products', failedUpload.promise).catch(() => undefined);
    const uploadFlush = uploadCoordinator.flush('products');
    failedUpload.reject(new Error('upload offline'));
    await expect(uploadFlush).rejects.toThrow('upload offline');

    const saveCoordinator = new PendingWorkCoordinator();
    saveCoordinator.register('products', () => false);
    await expect(saveCoordinator.flush('products')).rejects.toBeInstanceOf(PendingWorkError);
  });

  it('waits for work started by a flush handler', async () => {
    const coordinator = new PendingWorkCoordinator();
    const followup = deferred<void>();
    coordinator.register('aluminum', () => {
      void coordinator.track('aluminum', followup.promise);
    });

    let completed = false;
    const flush = coordinator.flush('aluminum').then(() => { completed = true; });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(completed).toBe(false);
    followup.resolve();
    await flush;
    expect(completed).toBe(true);
  });

  it('serializes rapid flush requests', async () => {
    const coordinator = new PendingWorkCoordinator();
    const first = deferred<void>();
    const order: string[] = [];
    let calls = 0;
    coordinator.register('quotes', async () => {
      calls += 1;
      order.push(`start-${calls}`);
      if (calls === 1) await first.promise;
      order.push(`end-${calls}`);
    });

    const flushOne = coordinator.flush('quotes');
    const flushTwo = coordinator.flush('quotes');
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(order).toEqual(['start-1']);
    first.resolve();
    await Promise.all([flushOne, flushTwo]);

    expect(order).toEqual(['start-1', 'end-1', 'start-2', 'end-2']);
  });
});
