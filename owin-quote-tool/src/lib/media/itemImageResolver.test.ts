import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProductRecord } from '@/types/models';
import { saveImage, imageStore } from '@/utils/imageStorage';
import { resolveItemImage } from './itemImageResolver';

const product = { id: 'p1', code: 'A-01', name: 'Cửa A', slug: 'cua-a', coverImagePath: 'products/a/cover.webp' } as ProductRecord;

describe('shared item image resolver', () => {
  beforeEach(async () => { await imageStore.clear(); });

  it('falls back from legacy item to source product blob and returns a revocable URL', async () => {
    await saveImage('products/a/cover.webp', new Blob(['image'], { type: 'image/png' }));
    const resolved = await resolveItemImage({ productCode: 'A-01', itemName: 'Cửa A' }, [product]);
    expect(resolved.source).toBe('product');
    expect(resolved.blob).toBeInstanceOf(Blob);
    expect(resolved.url).toMatch(/^blob:/);
    const revoke = vi.spyOn(URL, 'revokeObjectURL');
    if (resolved.revoke && resolved.url) URL.revokeObjectURL(resolved.url);
    expect(revoke).toHaveBeenCalledWith(resolved.url);
  });

  it('prioritizes quote override and supports data URLs', async () => {
    const resolved = await resolveItemImage({ imagePath: 'data:image/png;base64,AA==' }, [product]);
    expect(resolved.source).toBe('legacy');
    expect(resolved.url).toContain('data:image/png');
    expect(resolved.revoke).toBe(false);
  });
});
