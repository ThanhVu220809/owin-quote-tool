/**
 * Test tầng KHO SẢN PHẨM (logic tombstone BR-8 + updatedAt) — node + fake-indexeddb.
 * Phần UI (animation ẩn/hiện Rộng/Cao, auto-suggest, dropzone) verify ở browser thật.
 */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  seedIfEmpty,
  getAllProducts,
  getAllProductsRaw,
  getProduct,
  saveProduct,
  deleteProduct,
  bulkAdjustProductPrices,
  _clearAll,
} from '@/features/products/productStore';

beforeEach(async () => {
  await _clearAll();
});

describe('seed dữ liệu mẫu', () => {
  it('seedIfEmpty nạp bộ sản phẩm reference, chỉ chạy 1 lần', async () => {
    await seedIfEmpty();
    expect((await getAllProducts()).length).toBe(19);
    expect((await getAllProductsRaw())[0]).toEqual(
      expect.objectContaining({
        code: expect.any(String),
        name: expect.any(String),
        unit: expect.stringMatching(/^(BO|M2|METER)$/),
        unitPriceVnd: expect.any(Number),
        category: expect.any(String),
        rawSizeText: expect.any(String),
        fixedAccessoryPackage: expect.any(String),
      }),
    );
    // gọi lần 2 không nhân đôi
    await seedIfEmpty();
    expect((await getAllProducts()).length).toBe(19);
  });
});

describe('TEST 3.3 — xoá tombstone + sửa giá đổi updatedAt (BR-8)', () => {
  it('mã tự uppercase khi lưu', async () => {
    const p = await saveProduct({
      dvt: 'm²', ten: 'Test', ma: 's9', donGiaGoc: 1000, accessories: [],
    });
    expect(p.ma).toBe('S9');
    expect((await getAllProductsRaw()).find((x) => x.id === p.id)?.code).toBe('S9');
  });

  it('xoá → biến mất khỏi getAllProducts nhưng còn deleted:true trong store', async () => {
    const p = await saveProduct({
      dvt: 'm²', ten: 'X', ma: 'X1', donGiaGoc: 1000, accessories: [],
    });
    await deleteProduct(p.id);
    // không còn trong danh sách sống
    expect((await getAllProducts()).find((x) => x.id === p.id)).toBeUndefined();
    // nhưng record vẫn tồn tại với deleted:true
    const raw = await getProduct(p.id);
    expect(raw).not.toBeNull();
    expect(raw!.deleted).toBe(true);
    // và xuất hiện trong raw (cho sync)
    expect((await getAllProductsRaw()).find((x) => x.id === p.id)?.deleted).toBe(true);
  });

  it('sửa giá → updatedAt thay đổi (mới hơn)', async () => {
    const p = await saveProduct({
      dvt: 'm²', ten: 'Y', ma: 'Y1', donGiaGoc: 2000000, accessories: [],
    });
    const t1 = p.updatedAt;
    await new Promise((r) => setTimeout(r, 5));
    const p2 = await saveProduct({ ...p, donGiaGoc: 1900000 });
    expect(p2.id).toBe(p.id); // cùng sản phẩm
    expect(p2.donGiaGoc).toBe(1900000);
    expect(new Date(p2.updatedAt).getTime()).toBeGreaterThan(new Date(t1).getTime());
  });
});

describe('bulk price adjustment', () => {
  it('updates active products and leaves deleted tombstones untouched', async () => {
    const active = await saveProduct({ code: 'ACTIVE', name: 'Active', category: 'Cửa', unit: 'M2', unitPriceVnd: 1_000_000 });
    const deleted = await saveProduct({ code: 'DELETED', name: 'Deleted', category: 'Cửa', unit: 'M2', unitPriceVnd: 2_000_000 });
    await deleteProduct(deleted.id);
    await bulkAdjustProductPrices(10);
    const raw = await getAllProductsRaw();
    expect(raw.find((p) => p.id === active.id)?.unitPriceVnd).toBe(1_100_000);
    expect(raw.find((p) => p.id === deleted.id)?.unitPriceVnd).toBe(2_000_000);
    expect(raw.find((p) => p.id === deleted.id)?.deleted).toBe(true);
  });
});
