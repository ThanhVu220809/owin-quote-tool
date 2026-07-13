import { describe, expect, it } from 'vitest';
import {
  privateQuoteImagePath,
  privateQuoteImageReference,
} from './imagesRepo';
import { imageStoreKeyFromPath, normalizeImagePath } from '@/utils/imagePaths';

describe('private quote image references', () => {
  it('round-trips a private Storage object path without exposing a public URL', () => {
    const reference = privateQuoteImageReference('/img/abc123.webp');

    expect(reference).toBe('quote-private:img/abc123.webp');
    expect(privateQuoteImagePath(reference)).toBe('img/abc123.webp');
    expect(normalizeImagePath(reference)).toBe(reference);
    expect(imageStoreKeyFromPath(reference)).toBe(reference);
    expect(reference).not.toMatch(/^https?:/);
  });

  it('does not treat product URLs as private quote images', () => {
    expect(privateQuoteImagePath('https://example.test/product.webp')).toBeNull();
  });
});
