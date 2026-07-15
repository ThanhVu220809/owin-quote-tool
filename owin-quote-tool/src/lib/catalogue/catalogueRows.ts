import type { ProductRecord } from '@/types/models';
import { categoryOrderIndex, normalizeCategoryName, sortCategoryNames } from '@/config/categoryOrder';
import { productColorRank } from '@/lib/products/productSort';
import { titleCaseVi as titleCase } from '@/utils/titleCase';
import { buildCatalogueMoneyBlocks, formatCatalogueDecimal } from './catalogueMoney';

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

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function specMatches(key: string, candidates: readonly string[]): boolean {
  const normalized = normalizeText(key);
  return candidates.some((candidate) => normalized === normalizeText(candidate));
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

  SPEC_ORDER.forEach((rule) => {
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

export function buildCatalogueBlockRows(products: ProductRecord[]): CatalogueBlockRow[] {
  const sortedProducts = [...products].sort((a, b) => {
    const categorySort = categoryOrderIndex(a.category) - categoryOrderIndex(b.category);
    if (categorySort !== 0) return categorySort;
    // Trong mỗi nhóm: xếp theo màu (Trắc → Lim → Ghi → Xanh…) như danh sách sản phẩm.
    const colorSort = productColorRank(a) - productColorRank(b);
    if (colorSort !== 0) return colorSort;
    if ((a.numericId || 0) !== (b.numericId || 0)) return (a.numericId || 0) - (b.numericId || 0);
    return a.name.localeCompare(b.name, 'vi');
  });
  const categories = Array.from(new Set(sortedProducts.map((product) => normalizeCategoryName(product.category)))).sort(sortCategoryNames);
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

    sortedProducts
      .filter((product) => normalizeCategoryName(product.category) === categoryName)
      .forEach((product) => {
        const money = buildCatalogueMoneyBlocks(product);
        const accessoryLines = fixedAccessoryDescription(product);
        const blockRowCount = 2 + money.extraRows.length;

        rows.push({
          rowType: 'product',
          productCode: product.code,
          numericId: product.numericId,
          stt: String(displayIndex++),
          sttRowSpan: blockRowCount,
          imagePath: product.coverImagePath || '',
          imageRowSpan: blockRowCount,
          itemName: titleCase(product.name),
          categoryName,
          descriptionLines: productDescription(product),
          description: productDescription(product).join('\n'),
          unit: unitLabel(product.unit),
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
          itemName: titleCase(product.name),
          categoryName,
          descriptionLines: accessoryLines,
          description: accessoryLines.join('\n'),
          unit: accessoryLines.length > 0 ? 'Bộ' : '',
          width: '',
          height: '',
          weight: accessoryLines.length > 0 ? formatCatalogueDecimal(money.fixedQuantity || 1, 3) : '',
          unitPriceVnd: accessoryLines.length > 0 ? money.fixedUnitPrice || money.accessoryAmount : null,
          amountVnd: accessoryLines.length > 0 ? money.accessoryAmount : null,
          completedTotalVnd: null,
        });

        money.extraRows.forEach((extraRow) => {
          const unit = extraRow.unit === 'BO' ? 'Bộ' : extraRow.unit === 'M2' ? 'm²' : 'md';
          rows.push({
            rowType: 'extraAccessory',
            productCode: product.code,
            numericId: product.numericId,
            stt: '',
            imagePath: product.coverImagePath || '',
            itemName: titleCase(product.name),
            categoryName,
            descriptionLines: extraAccessoryDescription(extraRow.item),
            description: extraAccessoryDescription(extraRow.item).join('\n'),
            unit,
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
