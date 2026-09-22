import { describe, expect, it } from 'vitest';
import { generateQuoteCode } from '@/features/quote/quoteCode';

describe('multi-client code generation', () => {
  it('keeps a readable quote prefix and adds a per-client suffix', () => {
    const date = new Date(2026, 6, 13, 10, 0, 0);
    const first = generateQuoteCode([], date);
    const second = generateQuoteCode([], date);

    expect(first).toMatch(/^OWIN-BG-20260713-0001-[A-F0-9]{4}$/);
    expect(second).toMatch(/^OWIN-BG-20260713-0001-[A-F0-9]{4}$/);
    expect(first).not.toBe(second);
  });
});
