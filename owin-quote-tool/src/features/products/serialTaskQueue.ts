/**
 * Run async writes one at a time so an older, slower request can never finish
 * after a newer request and overwrite it.
 */
export class SerialTaskQueue {
  private tail: Promise<void> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  waitForIdle(): Promise<void> {
    return this.tail;
  }
}
