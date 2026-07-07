import type { FixedAccessoryPackageLike, FixedAccessoryRuleItem } from './types';

function normalizeRuleText(value: string | null | undefined): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

function hasText(source: string, needle: string): boolean {
  return source.includes(normalizeRuleText(needle));
}

export function suggestFixedAccessories(packageName: string | null | undefined): FixedAccessoryRuleItem[] {
  const name = normalizeRuleText(packageName);
  if (!name) return [];

  if (hasText(name, 'Cửa Thủy Lực')) {
    return [
      { name: 'Bản Lề Sàn Alder', quantity: 2 },
      { name: 'Ngỗng Trên Dưới', quantity: 0 },
      { name: 'Tay Nắm KOLN', quantity: 2 },
      { name: 'Khóa Bi Ngang', quantity: 0 },
      { name: 'Chốt Cánh Phụ', quantity: 0 },
      { name: 'Vật Tư Phụ', quantity: 0 },
    ];
  }

  if (hasText(name, 'Kinlong') && hasText(name, 'Mở Quay 1 Cánh')) {
    return [
      { name: 'Khóa Đơn Điểm', quantity: 0 },
      { name: 'Bản Lề', quantity: 3 },
      { name: 'Vật Tư Phụ', quantity: 0 },
    ];
  }

  if (hasText(name, 'Kinlong') && hasText(name, 'Mở Quay 2 Cánh')) {
    return [
      { name: 'Khóa Đa Điểm', quantity: 0 },
      { name: 'Bản Lề', quantity: 6 },
      { name: 'Vật Tư Phụ', quantity: 0 },
    ];
  }

  if (hasText(name, 'Lùa Vip 4 Cánh')) {
    return [
      { name: 'Bánh Xe', quantity: 8 },
      { name: 'Chốt Sập', quantity: 4 },
      { name: 'Khóa', quantity: 0 },
      { name: 'Vật Tư Phụ', quantity: 0 },
    ];
  }

  if (hasText(name, 'Cửa Sổ Mở Quay/Hất') || (hasText(name, 'Cửa Sổ') && hasText(name, 'Mở Quay'))) {
    return [
      { name: 'Tay Đa Điểm', quantity: 0 },
      { name: 'Thanh Chuyển Động Đa Điểm', quantity: 0 },
      { name: 'Bản Lề Chữ A', quantity: 0 },
      { name: 'Vật Tư Phụ', quantity: 0 },
    ];
  }

  if (hasText(name, 'Tay Đơn Điểm') || /\bsw[a-z0-9-]*\b/i.test(String(packageName || ''))) {
    return [
      { name: 'Tay Đơn Điểm', quantity: 0 },
      { name: 'Bản Lề Chữ A', quantity: 0 },
      { name: 'Vật Tư Phụ', quantity: 0 },
    ];
  }

  return [];
}

export const matchFixedAccessoryRules = suggestFixedAccessories;

function hasManualItems(pkg: FixedAccessoryPackageLike): boolean {
  return Boolean(
    (Array.isArray(pkg.items) && pkg.items.length > 0) ||
      String(pkg.itemsText || '').trim(),
  );
}

export function enrichFixedAccessoryPackageValue(
  packageValue: string | FixedAccessoryPackageLike | null | undefined,
  totalQuantity: number,
): string | null {
  if (!packageValue) return null;

  let pkg: FixedAccessoryPackageLike;
  try {
    pkg = typeof packageValue === 'string' ? JSON.parse(packageValue) : packageValue;
  } catch {
    return typeof packageValue === 'string' ? packageValue : null;
  }

  if (!pkg || typeof pkg !== 'object') return typeof packageValue === 'string' ? packageValue : null;

  const hasExistingManualItems = hasManualItems(pkg);
  const packageQuantity = hasExistingManualItems
    ? Number(pkg.packageQuantity ?? pkg.quantity ?? totalQuantity) || 1
    : Number(totalQuantity || pkg.packageQuantity || pkg.quantity || 1) || 1;
  const unitPrice = Number(pkg.unitPrice ?? pkg.unitPriceVnd ?? 0);
  const next: FixedAccessoryPackageLike = {
    ...pkg,
    packageQuantity,
    quantity: packageQuantity,
    unit: pkg.unit || 'BO',
    unitPrice,
    unitPriceVnd: unitPrice,
    total: packageQuantity * unitPrice,
    totalVnd: packageQuantity * unitPrice,
  };

  if (!hasExistingManualItems) {
    const suggestions = suggestFixedAccessories(next.name);
    if (suggestions.length > 0) next.items = suggestions;
  }

  return JSON.stringify(next);
}
