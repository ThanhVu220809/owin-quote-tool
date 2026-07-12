/**
 * GOOGLE DRIVE (appDataFolder) CLIENT — Owin Quote Tool.
 *
 * BR-9: `owin_db.json` trên Drive CHỈ chứa metadata/giá (nhẹ). Ảnh là FILE RIÊNG
 *       (img_<id>) — chỉ upload khi đổi.
 * BR-7: mặc định mọi call đi qua ensureToken() (token owner, refresh ngầm qua backend).
 *
 * MỖI HÀM nhận `token?` tuỳ chọn: nếu truyền vào (vd token 1-lần của TÀI KHOẢN KHÁC
 * lấy qua GIS token flow) thì dùng token đó thay vì token owner — phục vụ tính năng
 * đẩy/lấy kho sang tài khoản Google khác mà KHÔNG đụng refresh_token của owner.
 */

import type { OwinDB } from '@/types/models';
import { ensureToken } from './googleAuth';
import { parseApiResponse } from './apiResponse';

const DRIVE_FILES = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const DB_FILENAME = 'owin_db.json';
const IMG_PREFIX = 'img_';

export interface DriveFileMetadata {
  id: string;
  name: string;
  modifiedTime?: string;
  version?: string;
  md5Checksum?: string;
}

async function authHeader(token?: string): Promise<Record<string, string>> {
  const t = token ?? (await ensureToken());
  return { Authorization: 'Bearer ' + t };
}

/** Tìm file theo tên trong appDataFolder → trả fileId hoặc null. */
export async function findFile(name: string, token?: string): Promise<string | null> {
  return (await findFileMetadata(name, token))?.id ?? null;
}

/** Đọc metadata nhẹ để polling không phải tải toàn bộ JSON/ảnh. */
export async function findFileMetadata(name: string, token?: string): Promise<DriveFileMetadata | null> {
  const headers = await authHeader(token);
  const q = encodeURIComponent(`name='${name}'`);
  const url = `${DRIVE_FILES}?spaces=appDataFolder&q=${q}&fields=files(id,name,modifiedTime,version,md5Checksum)`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error('Không đọc được metadata Google Drive: ' + res.status);
  const data = await parseApiResponse<{ files?: DriveFileMetadata[] }>(res);
  return data.files?.[0] ?? null;
}

export async function getDBMetadata(token?: string): Promise<DriveFileMetadata | null> {
  return findFileMetadata(DB_FILENAME, token);
}

/** Tải metadata DB (owin_db.json). null nếu chưa có. */
export async function downloadDB(token?: string): Promise<OwinDB | null> {
  const id = await findFile(DB_FILENAME, token);
  if (!id) return null;
  const headers = await authHeader(token);
  const res = await fetch(`${DRIVE_FILES}/${id}?alt=media`, { headers });
  if (!res.ok) return null;
  return parseApiResponse<OwinDB>(res);
}

/** Tạo/ghi đè owin_db.json (multipart: metadata + nội dung). */
export async function uploadDB(db: OwinDB, token?: string): Promise<void> {
  const id = await findFile(DB_FILENAME, token);
  const headers = await authHeader(token);
  const metadata = id ? {} : { name: DB_FILENAME, parents: ['appDataFolder'] };
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

/** Upload 1 ảnh (file riêng, BR-9). */
export async function uploadImage(imageId: string, blob: Blob, token?: string): Promise<void> {
  const name = IMG_PREFIX + imageId;
  const existing = await findFile(name, token);
  const headers = await authHeader(token);
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
export async function downloadImage(imageId: string, token?: string): Promise<Blob | null> {
  const id = await findFile(IMG_PREFIX + imageId, token);
  if (!id) return null;
  const headers = await authHeader(token);
  const res = await fetch(`${DRIVE_FILES}/${id}?alt=media`, { headers });
  if (!res.ok) return null;
  return res.blob();
}
