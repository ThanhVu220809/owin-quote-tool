import type { ProductRecord } from '@/types/models';
import type { CatalogueBlockRow } from '@/lib/catalogue/catalogueRows';

/** Danh sách loại cửa để lọc bảng giá — bỏ nhóm rỗng, giữ nguyên thứ tự xuất hiện. */
export function listCatalogueCategories(productRecords: ProductRecord[]): string[] {
  return Array.from(new Set(productRecords.map((p) => p.category).filter(Boolean)));
}

/** Lọc sản phẩm theo loại cửa đang chọn; 'all' = giữ nguyên toàn bộ danh sách. */
export function filterRecordsByCategory(
  productRecords: ProductRecord[],
  exportCategory: string,
): ProductRecord[] {
  return exportCategory === 'all' ? productRecords : productRecords.filter((p) => p.category === exportCategory);
}

/**
 * Gom hàng thành block để tiêu đề danh mục dính với sản phẩm đầu tiên và phụ kiện
 * dính với sản phẩm của nó — quyết định chỗ ngắt trang khi xuất PDF/Word.
 * Thứ tự hạng mục giữ nguyên như bản trong CatalogueView cũ.
 */
export function groupCatalogueBlocks(rows: CatalogueBlockRow[]): CatalogueBlockRow[][] {
  // Group so category stays with first product and accessories stay with product.
  const out: CatalogueBlockRow[][] = [];
  let current: CatalogueBlockRow[] | null = null;
  let hasProduct = false;
  rows.forEach((row) => {
    if (row.rowType === 'category') {
      if (current) out.push(current);
      current = [row];
      hasProduct = false;
      return;
    }
    if (row.rowType === 'product') {
      if (current && hasProduct) {
        out.push(current);
        current = [row];
      } else if (current) {
        current.push(row);
      } else {
        current = [row];
      }
      hasProduct = true;
      return;
    }
    if (!current) current = [];
    current.push(row);
  });
  if (current) out.push(current);
  return out;
}
