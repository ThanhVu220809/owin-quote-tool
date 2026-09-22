import type { ProductRecord } from '@/types/models';

/** Nhãn đơn vị tính hiển thị cho người dùng (dùng chung cho list / preview / form). */
export function unitLabel(unit: ProductRecord['unit']): string {
  if (unit === 'BO') return 'Bộ';
  if (unit === 'METER') return 'md';
  return 'm²';
}
