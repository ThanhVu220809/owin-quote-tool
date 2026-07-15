/**
 * Smart number parse/format for VN quote tool inputs.
 *
 * Rules:
 * - Xóa hết → 0 (parse empty = 0)
 * - Khi đang gõ: giữ chuỗi draft, không ép "0" chặn nhập tiếp
 * - Tiền: chỉ chữ số, format chấm nghìn khi blur
 * - Số thập phân: chấp nhận "," hoặc "."
 */

import { formatSoVND } from '@/utils/format';

export type SmartNumberMode = 'int' | 'decimal' | 'currency';

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
    // Chỉ lấy chữ số (và dấu trừ đầu nếu có). Bỏ chấm/phẩy phân cách.
    const neg = text.startsWith('-');
    const digits = text.replace(/\D/g, '');
    if (!digits) return clampFinite(0, options);
    n = Number(digits);
    if (neg) n = -n;
  } else {
    // decimal: "1.234,5" (EU) hoặc "1,234.5" (US) hoặc "1.5" / "1,5"
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
    // Dấu xuất hiện sau cùng = thập phân
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > lastDot) {
      // 1.234,56
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // 1,234.56
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    // Một dấu phẩy: thập phân VN "1,5" hoặc nghìn "1,234" (3 digits after → nghìn)
    const parts = s.split(',');
    if (parts.length === 2 && parts[1].length === 3 && parts[0].length > 0 && !parts[0].includes('.')) {
      // ambiguous: treat as thousand only if no decimal intent — prefer decimal for quote dims
      // e.g. "1,5" height → 1.5; "1,500" could be 1.5 or 1500. For dims use decimal.
      s = parts[0] + '.' + parts[1];
    } else {
      s = s.replace(',', '.');
    }
  } else if (hasDot) {
    // Nhiều chấm → nghìn; một chấm → thập phân hoặc nghìn 1.500
    const parts = s.split('.');
    if (parts.length > 2) {
      // 1.234.567
      s = s.replace(/\./g, '');
    }
    // single dot kept as decimal (1.5 → 1.5; 1.500 → 1.5)
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
  // Trim trailing zeros but keep meaningful decimals
  const fixed = n.toFixed(decimals);
  return fixed.replace(/\.?0+$/, '');
}

/**
 * Sanitize live typing draft without forcing a number into the field.
 * Returns the cleaned draft string (may be "" while user cleared everything).
 */
export function sanitizeSmartDraft(raw: string, mode: SmartNumberMode): string {
  if (mode === 'currency' || mode === 'int') {
    // Allow optional leading minus + digits only; drop other chars.
    const neg = raw.trimStart().startsWith('-');
    const digits = raw.replace(/\D/g, '');
    if (!digits) return neg ? '-' : '';
    // Live thousand separators for currency (readability while typing)
    if (mode === 'currency') {
      const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
      return neg ? `-${grouped}` : grouped;
    }
    return neg ? `-${digits}` : digits;
  }

  // decimal: keep digits, one separators set, optional minus
  let s = raw.replace(/\s/g, '');
  const neg = s.startsWith('-');
  if (neg) s = s.slice(1);
  s = s.replace(/[^\d.,]/g, '');

  // Keep only first decimal separator (prefer last typed kind)
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
