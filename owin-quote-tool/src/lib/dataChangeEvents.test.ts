import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOCAL_DATA_CHANGED_EVENT, notifyLocalDataChanged } from './dataChangeEvents';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('notifyLocalDataChanged', () => {
  it('phát tín hiệu để lớp auto-sync debounce một lần lưu local', () => {
    const browserWindow = new EventTarget();
    const listener = vi.fn();
    browserWindow.addEventListener(LOCAL_DATA_CHANGED_EVENT, listener);
    vi.stubGlobal('window', browserWindow);

    notifyLocalDataChanged();

    expect(listener).toHaveBeenCalledTimes(1);
  });
});
