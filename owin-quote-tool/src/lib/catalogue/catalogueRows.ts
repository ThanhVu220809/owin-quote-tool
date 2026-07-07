import type { ProductRecord } from '@/types/models';
import { categoryOrderIndex, normalizeCategoryName, sortCategoryNames } from '@/config/categoryOrder';
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

function titleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function unitLabel(unit: string): string {
  if (unit === 'BO') return 'Bộ';
  if (unit === 'METER') return 'md';
  return 'm²';
}

function productDescription(product: ProductRecord): string[] {
  return [
    titleCase(product.name),
    ...product.specs
      .filter((spec) => spec.key.trim() && spec.value.trim())
      .map((spec) => `- ${spec.key}: ${spec.value}`),
  ];
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
          Number(item.quantity || 0) > 1 ? `- ${item.name} x${item.quantity}` : `- ${item.name || ''}`,
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
      item.quantityPerSet > 1 ? `- ${item.name} x${item.quantityPerSet}` : `- ${item.name}`,
    ),
  ];
}

function extraAccessoryDescription(item: { name?: unknown }): string[] {
  const name = String(item.name || '').trim();
  return name ? [`- ${name}`] : [];
}

function formatCategoryHeading(categoryName: string, index: number): string {
  return `${roman[index] || String(index + 1)}. ${categoryName.toUpperCase()}`;
}

export function buildCatalogueBlockRows(products: ProductRecord[]): CatalogueBlockRow[] {
  const sortedProducts = [...products].sort((a, b) => {
    const categorySort = categoryOrderIndex(a.category) - categoryOrderIndex(b.category);
    if (categorySort !== 0) return categorySort;
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
