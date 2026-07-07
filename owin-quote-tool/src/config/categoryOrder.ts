const CATEGORY_ORDER = ['Cửa chính', 'Cửa phụ', 'Cửa sổ', 'Tủ', 'Phụ kiện', 'Khác'];

export function normalizeCategoryName(value: string | null | undefined): string {
  const raw = String(value || '').trim();
  if (!raw) return 'Khác';
  const lower = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (lower.includes('noi that') || lower.includes('mat bep') || lower.includes('phu kien')) return 'Phụ kiện';
  if (lower.includes('tu') || lower.includes('bep') || lower.includes('vach ngan')) return 'Tủ';
  if (lower.includes('chinh') || lower.includes('thuy luc')) return 'Cửa chính';
  if (lower.includes('cua so')) return 'Cửa sổ';
  if (lower.includes('phu')) return 'Cửa phụ';
  return raw;
}

export function sortCategoryNames(a: string, b: string): number {
  const ai = CATEGORY_ORDER.indexOf(normalizeCategoryName(a));
  const bi = CATEGORY_ORDER.indexOf(normalizeCategoryName(b));
  const ao = ai === -1 ? CATEGORY_ORDER.length : ai;
  const bo = bi === -1 ? CATEGORY_ORDER.length : bi;
  if (ao !== bo) return ao - bo;
  return a.localeCompare(b, 'vi');
}

export function categoryOrderIndex(category: string): number {
  const index = CATEGORY_ORDER.indexOf(normalizeCategoryName(category));
  return index === -1 ? CATEGORY_ORDER.length : index;
}
