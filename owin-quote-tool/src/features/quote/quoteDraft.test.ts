import { describe, expect, it } from 'vitest';
import type { QuoteInput, QuoteItemInput, QuoteRecord } from '@/types/models';
import {
  changedQuoteSaveInput,
  cleanItemAccessoriesForPersist,
  confirmNormalizeItem,
  makeItemCode,
  stripPhantomFixedPackage,
  withSyncedPackageQuantity,
} from '@/features/quote/quoteDraft';

/**
 * Khoá công thức của bản nháp báo giá sau khi tách ra khỏi QuoteView:
 * mã hạng mục, chuẩn hoá dòng kích thước, SL bộ phụ kiện và patch gửi lên Supabase
 * phải giữ đúng như bản cũ.
 */

function makeItem(patch: Partial<QuoteItemInput> = {}): QuoteItemInput {
  return {
    sourceType: 'CUSTOM',
    productId: null,
    sourceProductId: null,
    productCode: 'HM-01',
    quoteItemCode: 'HM-01',
    itemName: 'Cửa đi',
    productType: null,
    category: null,
    groupName: null,
    coverImagePath: null,
    image: null,
    imageReference: null,
    imageOverridePath: null,
    unit: 'M2',
    description: '',
    unitPriceVnd: 1_000_000,
    specs: [],
    dimensions: [],
    accessories: [],
    fixedAccessoryPackage: null,
    extraAccessories: null,
    numericId: null,
    ...patch,
  } as unknown as QuoteItemInput;
}

describe('mã hạng mục', () => {
  it('đánh số từ 1, đệm 2 chữ số', () => {
    expect(makeItemCode(0)).toBe('HM-01');
    expect(makeItemCode(8)).toBe('HM-09');
    expect(makeItemCode(11)).toBe('HM-12');
    expect(makeItemCode(99)).toBe('HM-100');
  });
});

describe('chuẩn hoá hạng mục khi thu gọn / lưu', () => {
  it('hạng mục rỗng vẫn còn đúng 1 dòng kích thước mặc định theo ĐVT', () => {
    const m2 = confirmNormalizeItem(makeItem({ unit: 'M2', dimensions: [] }));
    expect(m2.dimensions).toEqual([
      { unit: 'M2', widthM: 0, heightM: 0, quantity: 1, unitPriceVnd: 1_000_000, description: null },
    ]);

    const bo = confirmNormalizeItem(makeItem({ unit: 'BO', dimensions: [] }));
    expect(bo.dimensions).toEqual([
      { unit: 'BO', widthM: null, heightM: null, quantity: 1, unitPriceVnd: 1_000_000, description: null },
    ]);
  });

  it('bỏ dòng kích thước trắng, giữ dòng có bất kỳ giá trị nào', () => {
    const item = confirmNormalizeItem(
      makeItem({
        dimensions: [
          { unit: 'M2', widthM: 0, heightM: 0, quantity: 0, unitPriceVnd: 0, description: null },
          { unit: 'M2', widthM: 1.2, heightM: 2.2, quantity: 2, unitPriceVnd: 900_000, description: '  Ô thoáng  ' },
          { unit: 'M2', widthM: 0, heightM: 0, quantity: 0, unitPriceVnd: 0, description: 'Ghi chú' },
        ],
      }),
    );
    expect(item.dimensions).toHaveLength(2);
    expect(item.dimensions[0].description).toBe('Ô thoáng');
    expect(item.dimensions[1].quantity).toBe(0);
  });

  it('SL âm kéo về 0 và đơn giá dòng rơi về đơn giá hạng mục', () => {
    const item = confirmNormalizeItem(
      makeItem({
        dimensions: [
          { unit: 'M2', widthM: 1, heightM: 1, quantity: -3, unitPriceVnd: null, description: null },
        ],
      } as unknown as Partial<QuoteItemInput>),
    );
    expect(item.dimensions[0].quantity).toBe(0);
    expect(item.dimensions[0].unitPriceVnd).toBe(1_000_000);
  });

  it('tên trống thành "Hạng mục" và bỏ phụ kiện cũ không tên', () => {
    const item = confirmNormalizeItem(
      makeItem({
        itemName: '   ',
        accessories: [
          { name: 'Khoá', quantityPerSet: 1, unitPriceVnd: 50_000, note: null, isEnabled: true },
          { name: '  ', quantityPerSet: 1, unitPriceVnd: 10_000, note: null, isEnabled: true },
        ],
      } as unknown as Partial<QuoteItemInput>),
    );
    expect(item.itemName).toBe('Hạng mục');
    expect(item.accessories).toHaveLength(1);
  });

  it('giữ thông số có key kể cả khi giá trị rỗng, bỏ thông số không có key', () => {
    const item = confirmNormalizeItem(
      makeItem({
        specs: [
          { key: 'Màu', value: '', sortOrder: 0 },
          { key: '  ', value: 'Bỏ đi', sortOrder: 1 },
        ],
      } as unknown as Partial<QuoteItemInput>),
    );
    expect(item.specs).toEqual([{ key: 'Màu', value: '', sortOrder: 0 }]);
  });
});

describe('SL bộ phụ kiện bám theo tổng SL cửa', () => {
  const packageJson = (patch: Record<string, unknown> = {}) =>
    JSON.stringify({
      name: 'Bộ phụ kiện cửa đi',
      items: [{ id: 'a', name: 'Bản lề', quantity: 4 }],
      packageQuantity: 1,
      unit: 'BO',
      unitPrice: 500_000,
      packageQuantityPerUnit: 1,
      ...patch,
    });

  const quantityOf = (value: string | null | undefined) =>
    Number((JSON.parse(String(value)) as Record<string, unknown>).packageQuantity);

  it('force: SL bộ PK = perUnit × tổng SL cửa', () => {
    const next = withSyncedPackageQuantity(
      makeItem({
        fixedAccessoryPackage: packageJson({ packageQuantityPerUnit: 2 }),
        dimensions: [
          { unit: 'M2', widthM: 1, heightM: 1, quantity: 2, unitPriceVnd: 0, description: null },
          { unit: 'M2', widthM: 1, heightM: 1, quantity: 1, unitPriceVnd: 0, description: null },
        ],
      } as unknown as Partial<QuoteItemInput>),
    );
    expect(quantityOf(next.fixedAccessoryPackage)).toBe(6);
  });

  it('force bỏ qua cờ sửa tay, auto thì giữ nguyên số tay', () => {
    const manual = {
      fixedAccessoryPackage: packageJson({ packageQuantity: 9, packageQuantityManual: true }),
      dimensions: [
        { unit: 'M2', widthM: 1, heightM: 1, quantity: 3, unitPriceVnd: 0, description: null },
      ],
    } as unknown as Partial<QuoteItemInput>;

    expect(quantityOf(withSyncedPackageQuantity(makeItem(manual), 'auto').fixedAccessoryPackage)).toBe(9);
    expect(quantityOf(withSyncedPackageQuantity(makeItem(manual), 'force').fixedAccessoryPackage)).toBe(3);
  });

  it('auto không tự tạo bộ PK cho hạng mục chưa có', () => {
    const item = makeItem({
      dimensions: [{ unit: 'M2', widthM: 1, heightM: 1, quantity: 2, unitPriceVnd: 0, description: null }],
    } as unknown as Partial<QuoteItemInput>);
    expect(withSyncedPackageQuantity(item, 'auto').fixedAccessoryPackage).toBeNull();
    expect(withSyncedPackageQuantity(item, 'force').fixedAccessoryPackage).not.toBeNull();
  });

  it('mặc định không truyền mode là force', () => {
    const item = makeItem({
      fixedAccessoryPackage: packageJson({ packageQuantity: 9, packageQuantityManual: true }),
      dimensions: [{ unit: 'M2', widthM: 1, heightM: 1, quantity: 4, unitPriceVnd: 0, description: null }],
    } as unknown as Partial<QuoteItemInput>);
    expect(quantityOf(withSyncedPackageQuantity(item).fixedAccessoryPackage)).toBe(4);
  });
});

describe('bộ phụ kiện "ma" của báo giá cũ', () => {
  const phantom = JSON.stringify({
    name: 'Bộ phụ kiện đi kèm',
    unitPrice: 0,
    items: [{ name: 'Vật tư phụ', quantity: 0 }],
  });

  it('bỏ gói 0đ, tên mặc định, SL toàn 0', () => {
    expect(stripPhantomFixedPackage(phantom)).toBeNull();
    expect(stripPhantomFixedPackage(null)).toBeNull();
    expect(stripPhantomFixedPackage('')).toBeNull();
  });

  it('giữ gói thật (có giá, có tên riêng hoặc có SL)', () => {
    const priced = JSON.stringify({ name: 'Bộ phụ kiện đi kèm', unitPrice: 500_000, items: [{ name: 'Vật tư phụ', quantity: 0 }] });
    const named = JSON.stringify({ name: 'Bộ PK cửa sổ', unitPrice: 0, items: [{ name: 'Vật tư phụ', quantity: 0 }] });
    const filled = JSON.stringify({ name: '', unitPrice: 0, items: [{ name: 'Vật tư phụ', quantity: 2 }] });
    expect(stripPhantomFixedPackage(priced)).toBe(priced);
    expect(stripPhantomFixedPackage(named)).toBe(named);
    expect(stripPhantomFixedPackage(filled)).toBe(filled);
  });

  it('chuỗi hỏng JSON thì trả nguyên văn', () => {
    expect(stripPhantomFixedPackage('{khong-phai-json')).toBe('{khong-phai-json');
  });
});

describe('patch gửi lên Supabase', () => {
  const form: QuoteInput = {
    customerId: null,
    customerName: 'Anh Nam',
    customerPhone: '0900',
    customerEmail: null,
    customerAddress: 'Hà Nội',
    quoteDate: '2026-01-01',
    depositVnd: 0,
    items: [],
  } as unknown as QuoteInput;

  const candidate = {
    id: 'q1',
    code: 'BG-01',
    status: 'SAVED',
    customerId: null,
    customerName: 'Anh Nam',
    customerPhone: '0900',
    customerEmail: null,
    customerAddress: 'Hà Nội',
    quoteDate: '2026-01-01',
    depositVnd: 1_000,
    subtotalProductVnd: 10,
    subtotalAccessoryVnd: 20,
    totalVnd: 30,
    roundedTotalVnd: 30,
    balanceVnd: 29,
    items: [{ id: 'i1' }],
    snapshot: { items: [] },
    snapshotJson: '{}',
    exports: [{ id: 'e1' }],
  } as unknown as Partial<QuoteRecord>;

  it('lần lưu đầu (chưa có form đã xác nhận) gửi trọn bản nháp', () => {
    expect(changedQuoteSaveInput(null, form, candidate, false)).toBe(candidate);
  });

  it('không đổi gì thì chỉ còn id + code + status', () => {
    expect(changedQuoteSaveInput(form, form, candidate, false)).toEqual({
      id: 'q1',
      code: 'BG-01',
      status: 'SAVED',
    });
  });

  it('đổi tạm ứng thì gửi trọn cụm tiền nhưng không gửi items', () => {
    const next = { ...form, depositVnd: 1_000 } as QuoteInput;
    const patch = changedQuoteSaveInput(form, next, candidate, false);
    expect(patch).toEqual({
      id: 'q1',
      code: 'BG-01',
      status: 'SAVED',
      depositVnd: 1_000,
      subtotalProductVnd: 10,
      subtotalAccessoryVnd: 20,
      totalVnd: 30,
      roundedTotalVnd: 30,
      balanceVnd: 29,
      snapshot: { items: [] },
      snapshotJson: '{}',
    });
    expect(patch.items).toBeUndefined();
  });

  it('đổi hạng mục thì gửi cả cụm tiền lẫn items', () => {
    const next = { ...form, items: [makeItem()] } as unknown as QuoteInput;
    const patch = changedQuoteSaveInput(form, next, candidate, false);
    expect(patch.items).toEqual([{ id: 'i1' }]);
    expect(patch.totalVnd).toBe(30);
  });

  it('chỉ kèm exports khi đường xuất file yêu cầu', () => {
    expect(changedQuoteSaveInput(form, form, candidate, false).exports).toBeUndefined();
    expect(changedQuoteSaveInput(form, form, candidate, true).exports).toEqual([{ id: 'e1' }]);
  });
});

describe('dọn phụ kiện trước khi tính / lưu', () => {
  it('gói rỗng vẫn là null — không dựng lại bộ phụ kiện "ma"', () => {
    const cleaned = cleanItemAccessoriesForPersist(makeItem());
    expect(cleaned.fixedAccessoryPackage).toBeNull();
  });

  it('đánh lại sortOrder của thông số theo thứ tự hiện tại', () => {
    const cleaned = cleanItemAccessoriesForPersist(
      makeItem({
        specs: [
          { key: ' Màu ', value: ' Trắng ', sortOrder: 7 },
          { key: 'Kính', value: '', sortOrder: 3 },
        ],
      } as unknown as Partial<QuoteItemInput>),
    );
    expect(cleaned.specs).toEqual([
      { key: 'Màu', value: 'Trắng', sortOrder: 0 },
      { key: 'Kính', value: '', sortOrder: 1 },
    ]);
  });
});
