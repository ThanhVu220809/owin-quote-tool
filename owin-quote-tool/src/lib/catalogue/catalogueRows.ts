import type { ProductRecord } from '@/types/models';
import { normalizeCategoryName, sortCategoryNames } from '@/lib/products/categoryOrder';
import { sortProductsForCatalog } from '@/lib/products/productSort';
import { titleCaseVi as titleCase } from '@/lib/format/titleCase';
import { buildCatalogueMoneyBlocks, formatCatalogueDecimal } from '@/lib/catalogue/catalogueMoney';

export type CatalogueBlockRowType = 'category' | 'product' | 'accessory' | 'extraAccessory';

export interface CatalogueBlockRow {
  rowType: CatalogueBlockRowType;
  productCode: string;
  numericId?: number | null;
  stt: string;
  sttRowSpan?: number;
  imagePath: string;
  imageRowSpan?: number;
  itemName: string;
  categoryName: string;
  descriptionLines: string[];
  description: string;
  unit: string;
  width: string;
  height: string;
  weight: string;
  unitPriceVnd: number | null;
  amountVnd: number | null;
  completedTotalVnd: number | null;
  completedTotalRowSpan?: number;
}

const roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
const SPEC_ORDER = [
  { label: 'Màu', keys: ['mau', 'màu'] },
  { label: 'Khung Bao', keys: ['khung bao'] },
  { label: 'Khuôn Bao', keys: ['khuon bao', 'khuôn bao'] },
  { label: 'Bản Cánh', keys: ['ban canh', 'bản cánh', 'canh', 'cánh'] },
  { label: 'Độ Dày', keys: ['do day', 'độ dày'] },
  { label: 'Loại Kính', keys: ['loai kinh', 'loại kính', 'kinh', 'kính'] },
  { label: 'Phào', keys: ['phao', 'phào'] },
  { label: 'Song Nhôm Bảo Vệ', keys: ['song nhom bao ve', 'song nhôm bảo vệ', 'bao ve', 'bảo vệ'] },
  { label: 'Ghi Chú', keys: ['ghi chu', 'ghi chú', 'note'] },
] as const;

function normalizeTextUncached(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

// Bỏ dấu + hạ chữ thường là việc đắt (NFD + regex). Tên spec lặp đi lặp lại giữa
// hàng trăm sản phẩm nên nhớ lại kết quả: 333 sản phẩm × 7 spec × 9 luật trước
// đây là hơn hai vạn lần chuẩn hoá, giờ chỉ còn vài chục.
const normalizedTextCache = new Map<string, string>();

function normalizeText(value: string): string {
  const cached = normalizedTextCache.get(value);
  if (cached !== undefined) return cached;

  const normalized = normalizeTextUncached(value);
  normalizedTextCache.set(value, normalized);
  return normalized;
}

// Ứng viên của SPEC_ORDER là hằng số — chuẩn hoá một lần lúc nạp module.
const SPEC_ORDER_NORMALIZED = SPEC_ORDER.map((rule) => ({
  label: rule.label,
  keys: rule.keys.map(normalizeText) as string[],
}));

function specMatches(key: string, candidates: readonly string[]): boolean {
  return candidates.includes(normalizeText(key));
}

function unitLabel(unit: string): string {
  if (unit === 'BO') return 'Bộ';
  if (unit === 'METER') return 'md';
  return 'm²';
}

function formatSpecLine(label: string, value: string): string {
  const key = titleCase(label.trim());
  const text = value.trim();
  // Empty value: keep the key only (no ugly trailing colon).
  return text ? `- ${key}: ${titleCase(text)}` : `- ${key}`;
}

function productDescription(product: ProductRecord): string[] {
  // Keep rows that have a key even when value is empty (e.g. "Song Nhôm Bảo Vệ").
  const specs = product.specs
    .map((spec, originalIndex) => ({ ...spec, originalIndex }))
    .filter((spec) => spec.key.trim());
  const used = new Set<number>();
  const lines = [titleCase(product.name)];

  SPEC_ORDER_NORMALIZED.forEach((rule) => {
    const match = specs.find((spec) => !used.has(spec.originalIndex) && specMatches(spec.key, rule.keys));
    if (!match) return;
    lines.push(formatSpecLine(rule.label, match.value));
    used.add(match.originalIndex);
  });

  specs.forEach((spec) => {
    if (!used.has(spec.originalIndex)) lines.push(formatSpecLine(spec.key, spec.value));
  });

  if (product.shortDesc?.trim()) lines.push(`- Ghi Chú: ${titleCase(product.shortDesc)}`);
  return lines;
}

function fixedAccessoryDescription(product: ProductRecord): string[] {
  if (product.fixedAccessoryPackage) {
    try {
      const fixed = JSON.parse(product.fixedAccessoryPackage) as {
        name?: string;
        items?: Array<{ name?: string; quantity?: number }>;
      };
      return [
        `${fixed.name || 'Bộ phụ kiện đi kèm'}:`,
        ...(fixed.items || []).map((item) =>
          Number(item.quantity || 0) > 1 ? `- ${titleCase(item.name || '')} x${item.quantity}` : `- ${titleCase(item.name || '')}`,
        ),
      ].filter((line) => line.trim());
    } catch {
      return ['Bộ phụ kiện đi kèm'];
    }
  }
  if (product.accessories.length === 0) return [];
  return [
    'Bộ Phụ Kiện Đi Kèm:',
    ...product.accessories.map((item) =>
      item.quantityPerSet > 1 ? `- ${titleCase(item.name)} x${item.quantityPerSet}` : `- ${titleCase(item.name)}`,
    ),
  ];
}

function extraAccessoryDescription(item: { name?: unknown }): string[] {
  const name = String(item.name || '').trim();
  return name ? [titleCase(name)] : [];
}

function formatCategoryHeading(categoryName: string, index: number): string {
  return `${roman[index] || String(index + 1)}. ${categoryName.toUpperCase()}`;
}

interface ProductCatalogueParts {
  money: ReturnType<typeof buildCatalogueMoneyBlocks>;
  descriptionLines: string[];
  description: string;
  accessoryLines: string[];
  accessoryDescription: string;
  itemName: string;
  unit: string;
}

/**
 * Phần nặng của mỗi sản phẩm — mô tả spec, danh sách phụ kiện, khối tiền — chỉ
 * phụ thuộc vào chính bản ghi chứ không phụ thuộc STT hay danh mục, nên nhớ lại
 * theo bản ghi: đổi bộ lọc loại cửa hay dựng lại bảng giá không phải tính lại.
 *
 * WeakMap nên bản ghi bị thay (sửa / realtime) là mục nhớ tự được thu hồi.
 */
const productPartsCache = new WeakMap<ProductRecord, ProductCatalogueParts>();

function catalogueParts(product: ProductRecord): ProductCatalogueParts {
  const cached = productPartsCache.get(product);
  if (cached) return cached;

  const descriptionLines = productDescription(product);
  const accessoryLines = fixedAccessoryDescription(product);
  const parts: ProductCatalogueParts = {
    money: buildCatalogueMoneyBlocks(product),
    descriptionLines,
    description: descriptionLines.join('\n'),
    accessoryLines,
    accessoryDescription: accessoryLines.join('\n'),
    itemName: titleCase(product.name),
    unit: unitLabel(product.unit),
  };
  productPartsCache.set(product, parts);
  return parts;
}

export function buildCatalogueBlockRows(products: ProductRecord[]): CatalogueBlockRow[] {
  // Nhóm → màu (Trắc→Lim→Ghi→Xanh) → giá cao→thấp.
  const sortedProducts = sortProductsForCatalog(products);
  // Gom theo danh mục một lượt, thay vì quét lại cả danh sách cho từng danh mục.
  const byCategory = new Map<string, ProductRecord[]>();
  sortedProducts.forEach((product) => {
    const categoryName = normalizeCategoryName(product.category);
    const group = byCategory.get(categoryName);
    if (group) group.push(product);
    else byCategory.set(categoryName, [product]);
  });
  const categories = Array.from(byCategory.keys()).sort(sortCategoryNames);
  const rows: CatalogueBlockRow[] = [];
  let displayIndex = 1;

  categories.forEach((categoryName, groupIndex) => {
    const heading = formatCategoryHeading(categoryName, groupIndex);
    rows.push({
      rowType: 'category',
      productCode: `category-${groupIndex + 1}`,
      stt: '',
      imagePath: '',
      itemName: '',
      categoryName: heading,
      descriptionLines: [heading],
      description: heading,
      unit: '',
      width: '',
      height: '',
      weight: '',
      unitPriceVnd: null,
      amountVnd: null,
      completedTotalVnd: null,
    });

    (byCategory.get(categoryName) ?? [])
      .forEach((product) => {
        const {
          money,
          descriptionLines,
          description,
          accessoryLines,
          accessoryDescription,
          itemName,
          unit,
        } = catalogueParts(product);
        const blockRowCount = 2 + money.extraRows.length;

        rows.push({
          rowType: 'product',
          productCode: product.code,
          numericId: product.numericId,
          stt: String(displayIndex++),
          sttRowSpan: blockRowCount,
          imagePath: product.coverImagePath || '',
          imageRowSpan: blockRowCount,
          itemName,
          categoryName,
          descriptionLines,
          description,
          unit,
          width: formatCatalogueDecimal(money.width, 2),
          height: formatCatalogueDecimal(money.height, 2),
          weight: formatCatalogueDecimal(money.productWeight, 3),
          unitPriceVnd: money.productUnitPrice,
          amountVnd: money.productAmount,
          completedTotalVnd: money.completedTotal,
          completedTotalRowSpan: blockRowCount,
        });

        rows.push({
          rowType: 'accessory',
          productCode: product.code,
          numericId: product.numericId,
          stt: '',
          imagePath: product.coverImagePath || '',
          itemName,
          categoryName,
          descriptionLines: accessoryLines,
          description: accessoryDescription,
          unit: accessoryLines.length > 0 ? 'Bộ' : '',
          width: '',
          height: '',
          weight: accessoryLines.length > 0 ? formatCatalogueDecimal(money.fixedQuantity || 1, 3) : '',
          unitPriceVnd: accessoryLines.length > 0 ? money.fixedUnitPrice || money.accessoryAmount : null,
          amountVnd: accessoryLines.length > 0 ? money.accessoryAmount : null,
          completedTotalVnd: null,
        });

        money.extraRows.forEach((extraRow) => {
          const extraUnit = extraRow.unit === 'BO' ? 'Bộ' : extraRow.unit === 'M2' ? 'm²' : 'md';
          const extraLines = extraAccessoryDescription(extraRow.item);
          rows.push({
            rowType: 'extraAccessory',
            productCode: product.code,
            numericId: product.numericId,
            stt: '',
            imagePath: product.coverImagePath || '',
            itemName,
            categoryName,
            descriptionLines: extraLines,
            description: extraLines.join('\n'),
            unit: extraUnit,
            width: '',
            height: '',
            weight: formatCatalogueDecimal(extraRow.unit === 'BO' ? extraRow.quantity : extraRow.weight, 3),
            unitPriceVnd: extraRow.unitPrice || null,
            amountVnd: extraRow.amount || null,
            completedTotalVnd: null,
          });
        });
      });
  });

  return rows;
}
