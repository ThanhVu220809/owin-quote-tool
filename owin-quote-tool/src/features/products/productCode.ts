let entropyCounter: number | null = null;

function nextEntropy(): string {
  if (entropyCounter === null) {
    const randomBytes = new Uint16Array(1);
    crypto.getRandomValues(randomBytes);
    entropyCounter = randomBytes[0] % 10_000;
  } else {
    entropyCounter = (entropyCounter + 1) % 10_000;
  }
  return String(entropyCounter).padStart(4, '0');
}

/**
 * Time-based product code with client entropy.
 * Used for both new products and duplicates so codes never carry a "-COPY-" tag.
 * Pass `withMillis` for new/duplicated records. Milliseconds plus four random
 * digits prevent two logged-in machines from producing the same code.
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
  const entropy = nextEntropy();
  return withMillis
    ? `${base}${String(now.getMilliseconds()).padStart(3, '0')}${entropy}`
    : `${base}${entropy}`;
}
