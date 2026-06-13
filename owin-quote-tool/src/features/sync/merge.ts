/**
 * SYNC MERGE ENGINE — per-entity LWW + tombstone + phát hiện conflict (BR-8).
 *
 *  - LWW (Last-Write-Wins) theo `updatedAt` cho từng entity (per-entity, không phải cả file).
 *  - Tombstone: `deleted:true` là một trạng thái như mọi trạng thái khác — bản mới hơn thắng,
 *    nên xoá (nếu mới hơn) KHÔNG bị bản cũ hồi sinh.
 *  - Conflict THẬT: cả local và remote CÙNG sửa một id (so với `base` = ảnh chụp lần sync trước)
 *    và nội dung khác nhau → KHÔNG tự nuốt, trả về danh sách conflict cho UI hiện dialog.
 *
 * `base` = trạng thái remote ở lần sync thành công trước (lưu local). Nếu không có base
 * (lần đầu), coi như mọi thứ là "đã đổi" → chỉ là conflict khi cả hai bên cùng có id đó với
 * nội dung khác nhau.
 */

import type { SyncEntity } from '@/types/models';

export interface Conflict<T extends SyncEntity> {
  id: string;
  local: T;
  remote: T;
}

export interface MergeResult<T extends SyncEntity> {
  /** Kết quả gộp (với conflict: tạm giữ bản LOCAL, chờ người chọn qua dialog). */
  merged: T[];
  conflicts: Conflict<T>[];
}

function byId<T extends SyncEntity>(arr: T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const e of arr) m.set(e.id, e);
  return m;
}

/** So sánh nội dung 2 entity, BỎ QUA updatedAt (chỉ quan tâm trạng thái thực). */
function sameContent<T extends SyncEntity>(a: T, b: T): boolean {
  const strip = (e: T) => {
    const rest: Partial<T> = { ...e };
    delete rest.updatedAt;
    return JSON.stringify(rest, Object.keys(rest).sort());
  };
  return strip(a) === strip(b);
}

function newer<T extends SyncEntity>(a: T, b: T): T {
  return new Date(a.updatedAt).getTime() >= new Date(b.updatedAt).getTime() ? a : b;
}

/** entity đã đổi so với base? (không có base → coi như đã đổi). */
function changedFromBase<T extends SyncEntity>(e: T, base: T | undefined): boolean {
  if (!base) return true;
  return e.updatedAt !== base.updatedAt || !sameContent(e, base);
}

/**
 * Gộp 2 danh sách entity.
 * @param local  bản trên máy này
 * @param remote bản trên Drive
 * @param base   ảnh chụp remote lần sync trước (để phát hiện conflict thật)
 */
export function mergeEntities<T extends SyncEntity>(
  local: T[],
  remote: T[],
  base: T[] = [],
): MergeResult<T> {
  const L = byId(local);
  const R = byId(remote);
  const B = byId(base);
  const allIds = new Set<string>([...L.keys(), ...R.keys()]);

  const merged: T[] = [];
  const conflicts: Conflict<T>[] = [];

  for (const id of allIds) {
    const l = L.get(id);
    const r = R.get(id);

    if (l && !r) {
      // Chỉ có local → giữ local (bản mới thêm hoặc remote chưa có).
      merged.push(l);
      continue;
    }
    if (!l && r) {
      // Chỉ có remote → lấy remote.
      merged.push(r);
      continue;
    }
    if (l && r) {
      if (sameContent(l, r)) {
        // Nội dung như nhau → lấy bản mới hơn (giữ updatedAt mới nhất).
        merged.push(newer(l, r));
        continue;
      }
      const b = B.get(id);
      const lChanged = changedFromBase(l, b);
      const rChanged = changedFromBase(r, b);

      if (lChanged && rChanged) {
        // CẢ HAI cùng sửa, nội dung khác → CONFLICT THẬT, không tự nuốt.
        conflicts.push({ id, local: l, remote: r });
        merged.push(l); // tạm giữ local, chờ dialog
      } else if (lChanged) {
        merged.push(l);
      } else if (rChanged) {
        merged.push(r);
      } else {
        // Không xác định được ai đổi → fallback LWW.
        merged.push(newer(l, r));
      }
    }
  }

  // Sắp xếp ổn định theo id cho dễ test/đọc.
  merged.sort((a, b) => a.id.localeCompare(b.id));
  return { merged, conflicts };
}

/** Áp lựa chọn của người dùng cho 1 conflict ('local' | 'remote'). */
export function resolveConflict<T extends SyncEntity>(
  merged: T[],
  conflict: Conflict<T>,
  choice: 'local' | 'remote',
): T[] {
  const pick = choice === 'local' ? conflict.local : conflict.remote;
  return merged.map((e) => (e.id === conflict.id ? pick : e));
}
