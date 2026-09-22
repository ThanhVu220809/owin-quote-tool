import { describe, expect, it } from 'vitest';
import type { ProductRecord } from '@/types/models';
import type { CatalogueBlockRow, CatalogueBlockRowType } from '@/lib/catalogue/catalogueRows';
import {
  filterRecordsByCategory,
  groupCatalogueBlocks,
  listCatalogueCategories,
} from '@/features/catalogue/catalogueBlocks';

/**
 * Khoá cách gom block của bảng giá sau khi tách khỏi CatalogueView: mỗi block là một
 * tbody nên chỗ ngắt block chính là chỗ được phép ngắt trang khi xuất PDF/Word.
 */
function makeRow(rowType: CatalogueBlockRowType, productCode: string): CatalogueBlockRow {
  return {
    rowType,
    productCode,
    stt: '',
    imagePath: '',
    itemName: productCode,
    categoryName: rowType === 'category' ? productCode : '',
    descriptionLines: [],
    description: '',
    unit: '',
    width: '',
    height: '',
    weight: '',
    unitPriceVnd: null,
    amountVnd: null,
    completedTotalVnd: null,
  };
}

/** Rút gọn block thành "loại:mã" cho dễ đọc khi so sánh. */
function shape(blocks: CatalogueBlockRow[][]): string[][] {
  return blocks.map((block) => block.map((row) => `${row.rowType}:${row.productCode}`));
}

describe('gom hàng thành block', () => {
  it('không có hàng thì không có block', () => {
    expect(groupCatalogueBlocks([])).toEqual([]);
  });

  it('tiêu đề danh mục dính với sản phẩm đầu tiên và phụ kiện của nó', () => {
    const rows = [
      makeRow('category', 'Cửa đi'),
      makeRow('product', 'P1'),
      makeRow('accessory', 'P1'),
      makeRow('extraAccessory', 'P1'),
    ];
    expect(shape(groupCatalogueBlocks(rows))).toEqual([
      ['category:Cửa đi', 'product:P1', 'accessory:P1', 'extraAccessory:P1'],
    ]);
  });

  it('sản phẩm thứ hai mở block mới, phụ kiện theo sản phẩm của nó', () => {
    const rows = [
      makeRow('category', 'Cửa đi'),
      makeRow('product', 'P1'),
      makeRow('accessory', 'P1'),
      makeRow('product', 'P2'),
      makeRow('accessory', 'P2'),
    ];
    expect(shape(groupCatalogueBlocks(rows))).toEqual([
      ['category:Cửa đi', 'product:P1', 'accessory:P1'],
      ['product:P2', 'accessory:P2'],
    ]);
  });

  it('danh mục mới luôn cắt block, kể cả khi danh mục trước rỗng', () => {
    const rows = [
      makeRow('category', 'Cửa đi'),
      makeRow('category', 'Cửa sổ'),
      makeRow('product', 'P1'),
    ];
    expect(shape(groupCatalogueBlocks(rows))).toEqual([
      ['category:Cửa đi'],
      ['category:Cửa sổ', 'product:P1'],
    ]);
  });

  it('phụ kiện đứng trước sản phẩm đầu tiên vẫn mở được block', () => {
    const rows = [makeRow('accessory', 'P0'), makeRow('product', 'P1')];
    expect(shape(groupCatalogueBlocks(rows))).toEqual([['accessory:P0', 'product:P1']]);
  });
});

describe('lọc theo loại cửa', () => {
  const records = [
    { id: '1', category: 'Cửa đi' },
    { id: '2', category: '' },
    { id: '3', category: 'Cửa sổ' },
    { id: '4', category: 'Cửa đi' },
  ] as unknown as ProductRecord[];

  it('liệt kê danh mục không trùng, bỏ danh mục rỗng', () => {
    expect(listCatalogueCategories(records)).toEqual(['Cửa đi', 'Cửa sổ']);
  });

  it('"all" giữ nguyên danh sách gốc', () => {
    expect(filterRecordsByCategory(records, 'all')).toBe(records);
  });

  it('chọn một danh mục thì chỉ còn sản phẩm của danh mục đó', () => {
    expect(filterRecordsByCategory(records, 'Cửa sổ').map((p) => p.id)).toEqual(['3']);
  });
});
