export const LOCAL_DATA_CHANGED_EVENT = 'owin-local-data-changed';

/** Báo cho lớp auto-sync biết dữ liệu người dùng vừa được lưu local. */
export function notifyLocalDataChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(LOCAL_DATA_CHANGED_EVENT));
  }
}
