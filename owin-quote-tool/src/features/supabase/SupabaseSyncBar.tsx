import { useState } from 'react';
import { Cloud, MoreHorizontal, RefreshCw, LogOut, Database } from 'lucide-react';
import { signOut } from './auth';
import { pullAll, pushAll } from './supabaseSync';
import { migrateToSupabase, type MigrateReport } from './migrateToSupabase';

/** Thanh trạng thái Supabase: đồng bộ tay, migrate dữ liệu cũ, đăng xuất. */
export function SupabaseSyncBar({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const syncNow = async () => {
    setBusy(true); setMsg('Đang đồng bộ…');
    try { await pushAll(); const r = await pullAll(); setMsg(`Đã đồng bộ · ${r.products} SP · ${r.quotes} báo giá`); }
    catch (e) { setMsg(e instanceof Error ? `Lỗi: ${e.message}` : 'Lỗi đồng bộ'); }
    finally { setBusy(false); }
  };

  const migrate = async () => {
    if (!window.confirm('Chuyển toàn bộ dữ liệu cũ trên máy này lên Supabase? (an toàn, không xoá dữ liệu local)')) return;
    setBusy(true); setMsg('Bắt đầu chuyển dữ liệu…');
    try {
      const r: MigrateReport = await migrateToSupabase({ onProgress: setMsg });
      await pullAll();
      setMsg(`Xong: ${r.products} SP (regen ${r.regeneratedCodes} mã) · ${r.images} ảnh${r.imageErrors ? ` · ${r.imageErrors} ảnh lỗi` : ''} · ${r.quotes} báo giá`);
    } catch (e) { setMsg(e instanceof Error ? `Lỗi migrate: ${e.message}` : 'Lỗi migrate'); }
    finally { setBusy(false); }
  };

  return (
    <div className={`sync-bar${compact ? ' sync-bar-compact' : ''}`}>
      <Cloud size={16} color="var(--ios-green)" />
      <button className="btn btn-ghost" disabled={busy} onClick={() => void syncNow()} title="Đồng bộ Supabase">
        <RefreshCw size={15} className={busy ? 'spin' : ''} style={{ verticalAlign: '-3px' }} />{compact ? '' : ' Đồng bộ'}
      </button>
      <button className="btn btn-ghost" onClick={() => setOpen((v) => !v)} title="Menu"><MoreHorizontal size={15} /></button>
      {open && (
        <div className="card sync-diagnostics" role="dialog" aria-label="Supabase">
          <div className="section-label">Dữ liệu (Supabase)</div>
          <div className="row-actions">
            <button className="btn btn-ghost" disabled={busy} onClick={() => void migrate()}><Database size={15} /> Chuyển dữ liệu cũ sang Supabase</button>
            <button className="btn btn-ghost" disabled={busy} onClick={() => void syncNow()}>Đồng bộ ngay</button>
            <button className="btn btn-ghost" onClick={() => void signOut()}><LogOut size={15} /> Đăng xuất</button>
            <button className="btn btn-ghost" onClick={() => setOpen(false)}>Đóng</button>
          </div>
        </div>
      )}
      {msg && <span className="muted sync-bar-msg" title={msg} style={{ fontSize: 13 }}>{msg}</span>}
    </div>
  );
}
