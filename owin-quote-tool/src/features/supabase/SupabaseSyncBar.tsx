import { useState } from 'react';
import { Cloud, Database, MoreHorizontal, LogOut } from 'lucide-react';
import { signOut } from './auth';

/** Dữ liệu được đọc/ghi trực tiếp trên Supabase; thanh này chỉ báo trạng thái và đăng xuất. */
export function SupabaseSyncBar({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const importLegacyData = async () => {
    setBusy(true);
    setMessage('Đang kiểm tra dữ liệu cũ…');
    try {
      const { countLegacyData, migrateToSupabase } = await import('./migrateToSupabase');
      const count = await countLegacyData();
      if (count.products === 0 && count.quotes === 0) {
        setMessage('Máy này không có dữ liệu IndexedDB cũ.');
        return;
      }
      if (!window.confirm(`Tìm thấy ${count.products} sản phẩm và ${count.quotes} báo giá cũ. Khôi phục lên Supabase?`)) return;
      const report = await migrateToSupabase({ onProgress: setMessage });
      setMessage(`Đã khôi phục ${report.products} SP · ${report.quotes} báo giá · ${report.images} ảnh · ${report.suggestions} gợi ý.`);
    } catch (error) {
      setMessage(error instanceof Error ? `Khôi phục lỗi: ${error.message}` : 'Khôi phục dữ liệu lỗi.');
    } finally {
      setBusy(false);
    }
  };

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
            <button className="btn btn-ghost" disabled={busy} onClick={() => void importLegacyData()}>
              <Database size={15} /> Khôi phục dữ liệu trình duyệt cũ (một lần)
            </button>
            <button className="btn btn-ghost" onClick={() => void signOut()}><LogOut size={15} /> Đăng xuất</button>
            <button className="btn btn-ghost" onClick={() => setOpen(false)}>Đóng</button>
          </div>
        </div>
      )}
      {message && <span className="muted sync-bar-msg" title={message}>{message}</span>}
    </div>
  );
}
