import { describe, expect, it } from 'vitest';
import { generateProductCode } from './products/productCode';
import { generateQuoteCode } from './quote/quoteCode';

describe('multi-client code generation', () => {
  it('adds enough entropy to product codes created in the same millisecond', () => {
    const first = generateProductCode(true);
    const second = generateProductCode(true);

    expect(first).toMatch(/^\d{21}$/);
    expect(second).toMatch(/^\d{21}$/);
    expect(first).not.toBe(second);
  });

  it('keeps a readable quote prefix and adds a per-client suffix', () => {
    const date = new Date(2026, 6, 13, 10, 0, 0);
    const first = generateQuoteCode([], date);
    const second = generateQuoteCode([], date);

    expect(first).toMatch(/^OWIN-BG-20260713-0001-[A-F0-9]{4}$/);
    expect(second).toMatch(/^OWIN-BG-20260713-0001-[A-F0-9]{4}$/);
    expect(first).not.toBe(second);
  });
});
