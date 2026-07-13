import { describe, expect, it } from 'vitest';
import { SerialTaskQueue } from './serialTaskQueue';

describe('SerialTaskQueue', () => {
  it('keeps writes in the order they were queued', async () => {
    const queue = new SerialTaskQueue();
    const events: string[] = [];
    let releaseFirst: (() => void) | undefined;

    const first = queue.run(async () => {
      events.push('first:start');
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      events.push('first:end');
      return 'first';
    });
    const second = queue.run(async () => {
      events.push('second:start');
      events.push('second:end');
      return 'second';
    });

    await Promise.resolve();
    expect(events).toEqual(['first:start']);
    releaseFirst?.();

    await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second']);
    expect(events).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
  });

  it('continues with the next write after a failed request', async () => {
    const queue = new SerialTaskQueue();
    const failed = queue.run(async () => {
      throw new Error('offline');
    });
    const recovered = queue.run(async () => 'saved');

    await expect(failed).rejects.toThrow('offline');
    await expect(recovered).resolves.toBe('saved');
    await expect(queue.waitForIdle()).resolves.toBeUndefined();
  });
});
