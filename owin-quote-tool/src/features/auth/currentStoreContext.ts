/** Cửa hàng đang mở và quyền của người dùng trong đó, cho phần UI dùng chung. */
import { createContext, useContext } from 'react';
import type { StoreRole, StoreSummary } from '@/features/auth/storeSession';

export interface CurrentStoreValue {
  store: StoreSummary;
  stores: StoreSummary[];
  role: StoreRole;
  isPlatformAdmin: boolean;
  /** Đọc lại quyền sau khi tự duyệt hoặc đổi vai trò cho chính mình. */
  reload: () => void;
}

export const CurrentStoreContext = createContext<CurrentStoreValue | null>(null);

export function useCurrentStore(): CurrentStoreValue {
  const value = useContext(CurrentStoreContext);
  if (!value) throw new Error('CurrentStoreContext is missing.');
  return value;
}

/** Chủ và quản lý mới được duyệt thành viên của cửa hàng. */
export function canManageMembers(role: StoreRole): boolean {
  return role === 'owner' || role === 'manager';
}
