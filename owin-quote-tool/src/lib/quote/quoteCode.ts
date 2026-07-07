import type { QuoteRecord } from '@/types/models';

function localDatePart(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

export function generateQuoteCode(existingQuotes: QuoteRecord[], date: Date = new Date()): string {
  const prefix = `OWIN-BG-${localDatePart(date)}-`;
  const used = new Set(existingQuotes.map((quote) => quote.code));
  let sequence = existingQuotes.filter((quote) => quote.code.startsWith(prefix)).length + 1;
  let code = `${prefix}${String(sequence).padStart(4, '0')}`;

  while (used.has(code)) {
    sequence += 1;
    code = `${prefix}${String(sequence).padStart(4, '0')}`;
  }

  return code;
}
