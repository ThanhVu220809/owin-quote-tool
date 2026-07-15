/**
 * Vietnamese-friendly Title Case for product/category labels.
 * "cửa chính" → "Cửa Chính", "wc" → "WC", "vân gỗ trắc" → "Vân Gỗ Trắc".
 */

const CANONICAL_TITLE_TOKENS = new Map<string, string>([
  ['owin', 'OWIN'],
  ['koln', 'KOLN'],
  ['pvc', 'PVC'],
  ['cnc', 'CNC'],
  ['wc', 'WC'],
  ['vip', 'VIP'],
  ['kinlong', 'Kinlong'],
  ['daishin', 'Daishin'],
  ['m2', 'm²'],
  ['m²', 'm²'],
  ['md', 'md'],
  ['mm', 'mm'],
]);

function formatTitleToken(token: string): string {
  if (!token) return token;
  const leading = token.match(/^[^\p{L}\p{N}]+/u)?.[0] ?? '';
  const trailing = token.match(/[^\p{L}\p{N}]+$/u)?.[0] ?? '';
  const core = token.slice(leading.length, token.length - trailing.length);
  if (!core) return token;
  const lower = core.toLocaleLowerCase('vi-VN');
  const canonical = CANONICAL_TITLE_TOKENS.get(lower);
  if (canonical) return `${leading}${canonical}${trailing}`;
  // 2–4 letter all-alpha acronyms → UPPER (WC, PK, SL already handled if listed)
  if (/^[a-zA-Z]{2,4}$/.test(core) && core === core.toUpperCase()) {
    return `${leading}${core.toUpperCase()}${trailing}`;
  }
  if (/^x\d+$/i.test(core) || /^\d+(?:[.,]\d+)?(?:mm|cm|m|md|m2|m²)$/i.test(core)) {
    return `${leading}${lower.replace(/m2$/i, 'm²')}${trailing}`;
  }
  if (/^\d+(?:[.,]\d+)?$/.test(core)) return token;
  return `${leading}${core.charAt(0).toLocaleUpperCase('vi-VN')}${core.slice(1).toLocaleLowerCase('vi-VN')}${trailing}`;
}

/** Title-case mỗi từ (vi-VN). Bỏ qua email/URL/path. */
export function titleCaseVi(value: string | null | undefined): string {
  const clean = String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (!clean) return '';
  if (/@/.test(clean) || /^[a-z]+:\/\//i.test(clean) || /[\\/]/.test(clean)) return clean;
  // Split on spaces; keep punctuation attached to tokens (handled in formatTitleToken).
  return clean.split(' ').map(formatTitleToken).join(' ');
}
