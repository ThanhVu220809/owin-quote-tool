/**
 * Time-based product code: `YYYYMMDDHHMMSS`.
 * Used for both new products and duplicates so codes never carry a "-COPY-" tag.
 * Pass `withMillis` when duplicating to stay unique across rapid double-clicks.
 */
export function generateProductCode(withMillis = false): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const base = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('');
  return withMillis ? `${base}${String(now.getMilliseconds()).padStart(3, '0')}` : base;
}
