import { useState } from 'react';
import { Cloud, CloudOff, RefreshCw } from 'lucide-react';
import type { Product } from '@/types/models';
import { isConfigured, connectGoogle } from './googleAuth';
import { syncNow, type SyncStatus } from './syncEngine';
import { resolveConflict, type Conflict } from './merge';

export function SyncBar() {
  const configured = isConfigured();
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>('');
  const [conflicts, setConflicts] = useState<Conflict<Product>[] | null>(null);
  const [working, setWorking] = useState<Product[]>([]);

  const handleConnect = async () => {
    setBusy(true);
    setMsg('');
    try {
      await connectGoogle();
      setConnected(true);
      setMsg('Đã kết nối Google.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Lỗi kết nối');
    } finally {
      setBusy(false);
    }
  };

  const applyStatus = (s: SyncStatus) => {
    if (s.state === 'skipped') setMsg(s.reason === 'offline' ? 'Đang offline — thay đổi đã xếp hàng.' : 'Chưa cấu hình Google.');
    else if (s.state === 'need-relogin') { setConnected(false); setMsg('Cần đăng nhập lại Google.'); }
    else if (s.state === 'conflict') { setConflicts(s.conflicts); setWorking(s.merged); setMsg(`${s.conflicts.length} xung đột — hãy chọn bản giữ lại.`); }
    else { setConflicts(null); setMsg(`Đồng bộ xong (${s.pushed} mục).`); }
  };

  const handleSync = async () => {
    setBusy(true);
    setMsg('');
    try {
      applyStatus(await syncNow());
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Lỗi đồng bộ');
    } finally {
      setBusy(false);
    }
  };

  const chooseConflict = (c: Conflict<Product>, choice: 'local' | 'remote') => {
    const next = resolveConflict(working, c, choice);
    setWorking(next);
    const remaining = (conflicts ?? []).filter((x) => x.id !== c.id);
    setConflicts(remaining);
    if (remaining.length === 0) {
      // Tất cả conflict đã chốt → đẩy bản đã giải quyết.
      setBusy(true);
      syncNow(next)
        .then(applyStatus)
        .catch((e) => setMsg(e instanceof Error ? e.message : 'Lỗi đồng bộ'))
        .finally(() => setBusy(false));
    }
  };

  if (!configured) {
    return (
      <div className="sync-bar muted">
        <CloudOff size={16} /> Đồng bộ Google chưa cấu hình (điền <code>.env</code> — xem <code>.env.example</code>).
      </div>
    );
  }

  return (
    <div className="sync-bar">
      {connected ? <Cloud size={16} color="var(--ios-green)" /> : <CloudOff size={16} color="var(--ios-gray1)" />}
      {!connected ? (
        <button className="btn btn-ghost" disabled={busy} onClick={handleConnect}>Kết nối Google</button>
      ) : (
        <button className="btn btn-ghost" disabled={busy} onClick={handleSync}>
          <RefreshCw size={15} className={busy ? 'spin' : ''} style={{ verticalAlign: '-3px' }} /> Đồng bộ
        </button>
      )}
      {msg && <span className="muted" style={{ fontSize: 13 }}>{msg}</span>}

      {conflicts && conflicts.length > 0 && (
        <div className="conflict-dialog card">
          <div className="section-label">Xung đột đồng bộ — chọn bản giữ lại (BR-8)</div>
          {conflicts.map((c) => (
            <div key={c.id} className="conflict-row">
              <div>
                <b>{c.id}</b>
                <div className="muted" style={{ fontSize: 12 }}>
                  Bạn: {c.local.ten} · {c.local.donGiaGoc}đ — Drive: {c.remote.ten} · {c.remote.donGiaGoc}đ
                </div>
              </div>
              <div className="row-actions">
                <button className="btn btn-ghost" onClick={() => chooseConflict(c, 'local')}>Giữ bản của bạn</button>
                <button className="btn btn-primary" onClick={() => chooseConflict(c, 'remote')}>Lấy bản trên Drive</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
