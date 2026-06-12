/**
 * GOOGLE DRIVE (appDataFolder) CLIENT — Owin Quote Tool.
 *
 * BR-9: `owin_db.json` trên Drive CHỈ chứa metadata/giá (nhẹ). Ảnh là FILE RIÊNG
 *       (img_<id>) — chỉ upload khi đổi. Hàm ở đây tách 2 loại rõ ràng.
 * BR-7: mọi call đi qua ensureToken() (refresh ngầm qua backend).
 *
 * ⚠️ Toàn bộ module này cần token Google thật → chỉ chạy được sau khi human tạo OAuth +
 *    deploy Apps Script + bấm consent (TASK 5.1/5.2). Code đã sẵn sàng.
 */

import type { OwinDB } from '@/types/models';
import { ensureToken } from './googleAuth';

const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const DB_FILENAME = 'owin_db.json';
const IMG_PREFIX = 'img_';

async function authHeader(): Promise<Record<string, string>> {
  const token = await ensureToken();
  return { Authorization: 'Bearer ' + token };
}

/** Tìm file theo tên trong appDataFolder → trả fileId hoặc null. */
export async function findFile(name: string): Promise<string | null> {
  const headers = await authHeader();
  const q = encodeURIComponent(`name='${name}'`);
  const url = `${DRIVE_FILES}?spaces=appDataFolder&q=${q}&fields=files(id,name)`;
  const res = await fetch(url, { headers });
  const data = await res.json();
  return data.files?.[0]?.id ?? null;
}

/** Tải metadata DB (owin_db.json). null nếu chưa có. */
export async function downloadDB(): Promise<OwinDB | null> {
  const id = await findFile(DB_FILENAME);
  if (!id) return null;
  const headers = await authHeader();
  const res = await fetch(`${DRIVE_FILES}/${id}?alt=media`, { headers });
  if (!res.ok) return null;
  return res.json();
}

/** Tạo/ghi đè owin_db.json (multipart: metadata + nội dung). */
export async function uploadDB(db: OwinDB): Promise<void> {
  const id = await findFile(DB_FILENAME);
  const headers = await authHeader();
  const metadata = id
    ? {} // update: không cần parents
    : { name: DB_FILENAME, parents: ['appDataFolder'] };
  const boundary = 'owin' + Date.now();
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
    JSON.stringify(metadata) +
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n` +
    JSON.stringify(db) +
    `\r\n--${boundary}--`;

  const method = id ? 'PATCH' : 'POST';
  const url = id
    ? `${DRIVE_UPLOAD}/${id}?uploadType=multipart`
    : `${DRIVE_UPLOAD}?uploadType=multipart`;
  const res = await fetch(url, {
    method,
    headers: { ...headers, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw new Error('uploadDB thất bại: ' + res.status);
}

/** Upload 1 ảnh (file riêng, BR-9). Trả fileId. */
export async function uploadImage(imageId: string, blob: Blob): Promise<void> {
  const name = IMG_PREFIX + imageId;
  const existing = await findFile(name);
  const headers = await authHeader();
  const metadata = existing ? {} : { name, parents: ['appDataFolder'] };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob);

  const method = existing ? 'PATCH' : 'POST';
  const url = existing
    ? `${DRIVE_UPLOAD}/${existing}?uploadType=multipart`
    : `${DRIVE_UPLOAD}?uploadType=multipart`;
  const res = await fetch(url, { method, headers, body: form });
  if (!res.ok) throw new Error('uploadImage thất bại: ' + res.status);
}

/** Tải 1 ảnh về (Blob). null nếu không có. */
export async function downloadImage(imageId: string): Promise<Blob | null> {
  const id = await findFile(IMG_PREFIX + imageId);
  if (!id) return null;
  const headers = await authHeader();
  const res = await fetch(`${DRIVE_FILES}/${id}?alt=media`, { headers });
  if (!res.ok) return null;
  return res.blob();
}
