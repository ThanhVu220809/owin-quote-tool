import { describe, expect, it } from 'vitest';
import { generateProductCode } from '@/features/products/productCode';

describe('product code generation', () => {
  it('adds enough entropy to product codes created in the same millisecond', () => {
    const first = generateProductCode(true);
    const second = generateProductCode(true);

    expect(first).toMatch(/^\d{21}$/);
    expect(second).toMatch(/^\d{21}$/);
    expect(first).not.toBe(second);
  });
});
