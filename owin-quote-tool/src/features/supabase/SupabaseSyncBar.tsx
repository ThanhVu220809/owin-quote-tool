import { useState } from 'react';
import { Cloud, MoreHorizontal, LogOut } from 'lucide-react';
import { signOut } from './auth';

/** Dữ liệu được đọc/ghi trực tiếp trên Supabase; thanh này chỉ báo trạng thái và đăng xuất. */
export function SupabaseSyncBar({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={`sync-bar${compact ? ' sync-bar-compact' : ''}`}>
      <Cloud size={16} color="var(--ios-green)" />
      {!compact && <span className="muted sync-bar-msg">Supabase trực tuyến</span>}
      <button className="btn btn-ghost" onClick={() => setOpen((v) => !v)} title="Menu"><MoreHorizontal size={15} /></button>
      {open && (
        <div className="card sync-diagnostics" role="dialog" aria-label="Supabase">
          <div className="section-label">Dữ liệu (Supabase)</div>
          <p className="muted" style={{ margin: 0 }}>Sản phẩm, báo giá, ảnh và dữ liệu dùng chung được lưu trực tiếp.</p>
          <div className="row-actions">
            <button className="btn btn-ghost" onClick={() => void signOut()}><LogOut size={15} /> Đăng xuất</button>
            <button className="btn btn-ghost" onClick={() => setOpen(false)}>Đóng</button>
          </div>
        </div>
      )}
    </div>
  );
}
