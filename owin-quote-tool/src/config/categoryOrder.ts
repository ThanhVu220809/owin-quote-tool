import { titleCaseVi } from '@/utils/titleCase';

/** Thứ tự loại cửa — luôn Title Case (Cửa Chính, Cửa Phụ, …). */
const CATEGORY_ORDER = ['Cửa Chính', 'Cửa Phụ', 'Cửa Sổ', 'Tủ', 'Phụ Kiện', 'Khác'];

export function normalizeCategoryName(value: string | null | undefined): string {
  const raw = String(value || '').trim();
  if (!raw) return 'Khác';
  const lower = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (lower === 'wc' || lower === 'toilet' || lower.includes('wc ')) return 'WC';
  if (lower.includes('noi that') || lower.includes('mat bep') || lower.includes('phu kien')) return 'Phụ Kiện';
  if (lower.includes('tu') || lower.includes('bep') || lower.includes('vach ngan')) return 'Tủ';
  if (lower.includes('chinh') || lower.includes('thuy luc')) return 'Cửa Chính';
  if (lower.includes('cua so')) return 'Cửa Sổ';
  if (lower.includes('phu')) return 'Cửa Phụ';
  // Mọi loại khác: viết hoa chữ cái đầu mỗi từ.
  return titleCaseVi(raw);
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

export { CATEGORY_ORDER };
