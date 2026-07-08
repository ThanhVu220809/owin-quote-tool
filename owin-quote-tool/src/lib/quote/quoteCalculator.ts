import type {
  AccessoryInput,
  CalculatedAccessory,
  CalculatedDimension,
  CalculatedQuote,
  CalculatedQuoteItem,
  DimensionInput,
  ProductUnit,
  QuoteInput,
  QuoteItemInput,
} from '@/types/models';
import {
  calculateDimensionQuantity,
  calculateExtraAccessoryLineTotal,
  calculateLegacyAccessoryLineTotal,
  calculateQuoteTotals,
  isWeightBasedAccessoryUnit,
  normalizeUnit,
  roundMoneyToVnd,
  roundQuantity3,
  enrichFixedAccessoryPackageValue,
} from '@/lib/quote-engine';

function normalizeText(value: string | null | undefined): string {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function parseQuoteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatAccessoryNameWithQuantity(name: unknown, quantity: unknown): string {
  const text = normalizeText(String(name || ''));
  const qty = parseQuoteNumber(quantity, 1);
  return qty > 1 ? `${text} x${qty}` : text;
}

function parseJsonMaybe<T>(value: unknown, fallback: T): T {
  if (!value) return fallback;
  if (typeof value !== 'string') return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function calculateDimensionLine(
  unit: ProductUnit,
  line: DimensionInput,
  itemUnitPriceVnd: number,
): CalculatedDimension {
  const finalUnitPrice = line.unitPriceVnd !== undefined && line.unitPriceVnd !== null
    ? line.unitPriceVnd
    : itemUnitPriceVnd;
  const actualUnit = normalizeUnit(line.unit || unit);
  const calculatedQty = calculateDimensionQuantity({
    unit: actualUnit,
    widthM: line.widthM,
    heightM: line.heightM,
    quantity: line.quantity,
  });
  const lineTotalVnd = roundMoneyToVnd(calculatedQty * Number(finalUnitPrice || 0));

  return {
    unit: actualUnit,
    widthM: line.widthM !== undefined && line.widthM !== null ? Number(line.widthM) : null,
    heightM: line.heightM !== undefined && line.heightM !== null ? Number(line.heightM) : null,
    quantity: Number(line.quantity || 0),
    calculatedQty,
    unitPriceVnd: Number(finalUnitPrice || 0),
    lineTotalVnd,
    description: line.description || null,
  };
}

export function calculateAccessories(
  accessories: AccessoryInput[],
  totalSet: number,
): CalculatedAccessory[] {
  return accessories.map((acc) => {
    const enabled = acc.isEnabled !== false;
    const qtyPerSet = Number(acc.quantityPerSet || 0);
    const totalAccQty = qtyPerSet * totalSet;
    const lineTotalVnd = calculateLegacyAccessoryLineTotal(acc, totalSet);

    return {
      enabled,
      isEnabled: enabled,
      name: normalizeText(acc.name),
      quantityPerSet: qtyPerSet,
      totalSet: totalAccQty,
      unitPriceVnd: Number(acc.unitPriceVnd || 0),
      lineTotalVnd,
      note: acc.note || null,
    };
  });
}

export function calculateQuoteItem(item: QuoteItemInput, sortOrder: number): CalculatedQuoteItem {
  const itemUnit = normalizeUnit(item.unit);
  const calculatedDimensions = item.dimensions.map((line) =>
    calculateDimensionLine(itemUnit, line, item.unitPriceVnd),
  );
  const productSubtotalVnd = calculatedDimensions.reduce((sum, line) => sum + line.lineTotalVnd, 0);
  const totalSet = item.dimensions.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
  const fixedAccessoryPackage = enrichFixedAccessoryPackageValue(item.fixedAccessoryPackage, totalSet);

  let calculatedAccessories: CalculatedAccessory[] = [];
  let accessorySubtotalVnd = 0;
  const extras = parseJsonMaybe<unknown[]>(item.extraAccessories, []);
  const hasExtraAccessories = Array.isArray(extras) && extras.some((extra) => {
    const acc = extra as Record<string, unknown>;
    return String(acc?.name || '').trim();
  });

  if (fixedAccessoryPackage || hasExtraAccessories) {
    const fixed = parseJsonMaybe<Record<string, unknown> | null>(fixedAccessoryPackage, null);
    if (fixed) {
      const qty = parseQuoteNumber(
        fixed.packageQuantity !== undefined ? fixed.packageQuantity : fixed.quantity,
        1,
      );
      const unitPrice = parseQuoteNumber(
        fixed.unitPrice !== undefined ? fixed.unitPrice : fixed.unitPriceVnd,
        0,
      );
      const totalLineVnd = roundMoneyToVnd(qty * unitPrice);
      accessorySubtotalVnd += totalLineVnd;

      let note = normalizeText(String(fixed.itemsText || ''));
      if (Array.isArray(fixed.items)) {
        note = fixed.items
          .map((it) => {
            const row = it as { name?: unknown; quantity?: unknown };
            return formatAccessoryNameWithQuantity(row.name, row.quantity);
          })
          .filter(Boolean)
          .join('\n');
      }

      calculatedAccessories.push({
        enabled: true,
        isEnabled: true,
        name: normalizeText(String(fixed.name || 'Bộ phụ kiện đi kèm')),
        quantityPerSet: qty,
        totalSet: qty,
        unitPriceVnd: unitPrice,
        lineTotalVnd: totalLineVnd,
        note,
      });
    }

    if (Array.isArray(extras)) {
      extras.forEach((extra) => {
        const acc = extra as Record<string, unknown>;
        const unit = normalizeUnit(String(acc.unit || 'BO'));
        const quantity = parseQuoteNumber(acc.quantity, 1);
        const weight = roundQuantity3(parseQuoteNumber(acc.weight ?? acc.kl, 0));
        const unitPrice = parseQuoteNumber(acc.unitPriceVnd ?? acc.unitPrice, 0);
        const basis = isWeightBasedAccessoryUnit(unit) ? weight : quantity;
        const totalLineVnd = calculateExtraAccessoryLineTotal({
          unit,
          quantity,
          weight,
          unitPriceVnd: unitPrice,
        });
        accessorySubtotalVnd += totalLineVnd;
        calculatedAccessories.push({
          enabled: true,
          isEnabled: true,
          name: normalizeText(String(acc.name || '')),
          quantityPerSet: quantity,
          totalSet: basis,
          unitPriceVnd: unitPrice,
          lineTotalVnd: totalLineVnd,
          note: normalizeText(String(acc.unit || acc.note || 'Bộ')),
        });
      });
    }
  } else {
    calculatedAccessories = calculateAccessories(item.accessories || [], totalSet);
    accessorySubtotalVnd = calculatedAccessories.reduce((sum, line) => sum + line.lineTotalVnd, 0);
  }

  const itemTotalVnd = productSubtotalVnd + accessorySubtotalVnd;
  const category = normalizeText(item.groupName || item.category || '');
  const productCode = item.quoteItemCode || item.productCode;

  return {
    sourceType: item.productId ? 'PRODUCT' : item.sourceType || 'CUSTOM',
    productId: item.productId || null,
    productCode,
    quoteItemCode: productCode,
    itemName: normalizeText(item.itemName),
    productName: normalizeText(item.itemName),
    productType: item.productType || null,
    category: category || null,
    groupName: category || null,
    coverImagePath: item.coverImagePath || item.image || null,
    categoryImagePath: item.categoryImagePath || item.categoryImage || null,
    categoryImage: item.categoryImage || item.categoryImagePath || null,
    companyLogo: item.companyLogo || null,
    image: item.image || item.coverImagePath || null,
    unit: itemUnit,
    description: item.description ? normalizeText(item.description) : null,
    unitPriceVnd: Number(item.unitPriceVnd || 0),
    specs: (item.specs || []).map((spec) => ({
      key: normalizeText(spec.key),
      value: normalizeText(spec.value),
      sortOrder: spec.sortOrder,
    })),
    dimensions: calculatedDimensions,
    accessories: calculatedAccessories,
    fixedAccessoryPackage,
    extraAccessories: item.extraAccessories || null,
    productSubtotalVnd,
    accessorySubtotalVnd,
    itemTotalVnd,
    mainTotal: productSubtotalVnd,
    accessoryTotal: accessorySubtotalVnd,
    itemTotal: itemTotalVnd,
    sortOrder,
    numericId: item.numericId || null,
  };
}

export function calculateQuote(input: QuoteInput): CalculatedQuote {
  const items = input.items.map((item, index) => calculateQuoteItem(item, index + 1));
  const subtotalProductVnd = items.reduce((sum, item) => sum + item.productSubtotalVnd, 0);
  const subtotalAccessoryVnd = items.reduce((sum, item) => sum + item.accessorySubtotalVnd, 0);
  const summary = calculateQuoteTotals({
    subtotalProductVnd,
    subtotalAccessoryVnd,
    depositVnd: input.depositVnd,
  });

  return {
    customerId: input.customerId || null,
    customerName: normalizeText(input.customerName),
    customerPhone: input.customerPhone,
    customerEmail: input.customerEmail || null,
    customerAddress: input.customerAddress,
    quoteDate: input.quoteDate || null,
    depositVnd: summary.depositVnd,
    items,
    summary,
  };
}
