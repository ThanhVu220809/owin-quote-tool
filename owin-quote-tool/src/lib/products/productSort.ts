import type { ProductRecord } from '@/types/models';

/** Thứ tự màu mặc định từ trên xuống — sửa danh sách này để đổi ưu tiên. */
export const COLOR_ORDER = ['trac', 'lim', 'ghi', 'xanh'];

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Rank a product by its "Màu" spec against COLOR_ORDER; unknown/empty colours go last. */
export function productColorRank(product: ProductRecord): number {
  const colorSpec = product.specs.find((spec) => stripAccents(spec.key).includes('mau'));
  const color = stripAccents(String(colorSpec?.value || ''));
  if (!color) return COLOR_ORDER.length + 1;
  const rank = COLOR_ORDER.findIndex((keyword) => color.includes(keyword));
  return rank === -1 ? COLOR_ORDER.length : rank;
}

/** Sort a stable copy by colour rank, keeping the original relative order within a colour. */
export function sortProductsByColor<T extends ProductRecord>(products: T[]): T[] {
  return products
    .map((product, index) => ({ product, index }))
    .sort((a, b) => productColorRank(a.product) - productColorRank(b.product) || a.index - b.index)
    .map((entry) => entry.product);
}
