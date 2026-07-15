/**
 * Smart number parse/format for VN quote tool inputs.
 *
 * Rules:
 * - Xóa hết → 0 (parse empty = 0)
 * - Khi đang gõ: giữ chuỗi draft, không ép "0" chặn nhập tiếp
 * - Tiền: chỉ chữ số khi gõ; format chấm nghìn khi blur
 * - Số thập phân: chấp nhận "," hoặc "."
 * - Không giới hạn 4 chữ số (VND tới ~15 chữ số an toàn)
 */

import { formatSoVND } from '@/utils/format';

export type SmartNumberMode = 'int' | 'decimal' | 'currency';

/** VND thực tế không cần quá 15 chữ số; tránh Number overflow. */
export const MAX_CURRENCY_DIGITS = 15;
export const MAX_INT_DIGITS = 12;

export interface SmartNumberOptions {
  mode?: SmartNumberMode;
  /** Max decimal places (decimal mode). Default 3. */
  decimals?: number;
  min?: number;
  max?: number;
}

/** Parse any user string → finite number. Empty / invalid → 0. */
export function parseSmartNumber(
  raw: string | number | null | undefined,
  options: SmartNumberOptions = {},
): number {
  const mode = options.mode ?? 'decimal';
  if (typeof raw === 'number') {
    return clampFinite(raw, options);
  }
  if (raw == null) return clampFinite(0, options);

  const text = String(raw).trim();
  if (!text || text === '-' || text === '.' || text === ',') return clampFinite(0, options);

  let n: number;
  if (mode === 'currency' || mode === 'int') {
    // Chỉ lấy chữ số (và dấu trừ đầu nếu có). Bỏ chấm/phẩy phân cách nghìn.
    // "1.023.000" → 1023000  |  "1.023" → 1023  (không phải 1.023 thập phân)
    const neg = text.startsWith('-');
    let digits = text.replace(/\D/g, '');
    if (!digits) return clampFinite(0, options);
    const cap = mode === 'currency' ? MAX_CURRENCY_DIGITS : MAX_INT_DIGITS;
    if (digits.length > cap) digits = digits.slice(0, cap);
    n = Number(digits);
    if (neg) n = -n;
  } else {
    n = parseDecimalLoose(text);
  }

  if (!Number.isFinite(n)) n = 0;
  if (mode === 'currency' || mode === 'int') n = Math.trunc(n);
  if (mode === 'decimal' && options.decimals != null) {
    const f = 10 ** options.decimals;
    n = Math.round(n * f) / f;
  }
  return clampFinite(n, options);
}

function parseDecimalLoose(text: string): number {
  let s = text.replace(/\s/g, '').replace(/[^\d,.-]/g, '');
  if (!s || s === '-' || s === '.' || s === ',') return 0;

  const neg = s.startsWith('-');
  if (neg) s = s.slice(1);

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > lastDot) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    s = s.replace(',', '.');
  } else if (hasDot) {
    const parts = s.split('.');
    if (parts.length > 2) {
      // 1.234.567 nghìn VN → bỏ chấm
      s = s.replace(/\./g, '');
    }
  }

  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : 0;
}

function clampFinite(n: number, options: SmartNumberOptions): number {
  if (!Number.isFinite(n)) n = 0;
  if (options.min != null && n < options.min) n = options.min;
  if (options.max != null && n > options.max) n = options.max;
  return n;
}

/** Format number for blur / idle display. 0 → "" (placeholder shows 0). */
export function formatSmartNumber(
  value: number | null | undefined,
  options: SmartNumberOptions = {},
): string {
  const mode = options.mode ?? 'decimal';
  const n = value == null || !Number.isFinite(value) ? 0 : value;
  if (n === 0) return '';

  if (mode === 'currency') return formatSoVND(n);
  if (mode === 'int') return String(Math.trunc(n));

  const decimals = options.decimals ?? 3;
  const fixed = n.toFixed(decimals);
  return fixed.replace(/\.?0+$/, '');
}

/**
 * Sanitize live typing draft.
 * Currency/int: digits only (no live dots — dots chỉ lúc blur, tránh cảm giác "khoá 4 số").
 */
export function sanitizeSmartDraft(raw: string, mode: SmartNumberMode): string {
  if (mode === 'currency' || mode === 'int') {
    const neg = raw.trimStart().startsWith('-');
    let digits = raw.replace(/\D/g, '');
    const cap = mode === 'currency' ? MAX_CURRENCY_DIGITS : MAX_INT_DIGITS;
    if (digits.length > cap) digits = digits.slice(0, cap);
    if (!digits) return neg ? '-' : '';
    return neg ? `-${digits}` : digits;
  }

  let s = raw.replace(/\s/g, '');
  const neg = s.startsWith('-');
  if (neg) s = s.slice(1);
  s = s.replace(/[^\d.,]/g, '');

  let seenSep = false;
  let out = '';
  for (const ch of s) {
    if (ch === '.' || ch === ',') {
      if (seenSep) continue;
      seenSep = true;
      out += ch;
    } else {
      out += ch;
    }
  }
  return neg ? `-${out}` : out;
}
