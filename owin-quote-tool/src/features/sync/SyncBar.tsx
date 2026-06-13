import { useState } from 'react';
import { Cloud, CloudOff, Download, RefreshCw, Upload } from 'lucide-react';
import type { Product } from '@/types/models';
import { isConfigured, connectGoogle, requestOneTimeGoogleToken } from './googleAuth';
import { syncNow, type SyncStatus } from './syncEngine';
import { resolveConflict, type Conflict } from './merge';
import {
  beginPullFromOtherAccount,
  beginPushToOtherAccount,
  finishTransfer,
  type TransferConflictContext,
  type TransferMode,
  type TransferStatus,
} from './transferEngine';

type ConflictFlow =
  | { kind: 'owner-sync' }
  | { kind: 'transfer'; context: TransferConflictContext };

export function SyncBar() {
  const configured = isConfigured();
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>('');
  const [conflicts, setConflicts] = useState<Conflict<Product>[] | null>(null);
  const [conflictFlow, setConflictFlow] = useState<ConflictFlow | null>(null);
  const [working, setWorking] = useState<Product[]>([]);

  const clearConflict = () => {
    setConflicts(null);
    setConflictFlow(null);
    setWorking([]);
  };

  const handleConnect = async () => {
    setBusy(true);
    setMsg('');
    clearConflict();
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
    if (s.state === 'skipped') {
      clearConflict();
      setMsg(s.reason === 'offline' ? 'Đang offline - thay đổi đã xếp hàng.' : 'Chưa cấu hình Google.');
    } else if (s.state === 'need-relogin') {
      clearConflict();
      setConnected(false);
      setMsg('Cần đăng nhập lại Google.');
    } else if (s.state === 'conflict') {
      setConflicts(s.conflicts);
      setConflictFlow({ kind: 'owner-sync' });
      setWorking(s.merged);
      setMsg(`${s.conflicts.length} xung đột - hãy chọn bản giữ lại.`);
    } else {
      clearConflict();
      setMsg(`Đồng bộ xong (${s.pushed} mục).`);
    }
  };

  const applyTransferStatus = (s: TransferStatus) => {
    if (s.state === 'empty-remote') {
      clearConflict();
      setMsg('Tài khoản này chưa có kho OWIN để lấy.');
      return;
    }

    if (s.state === 'conflict') {
      setConflicts(s.conflicts);
      setConflictFlow({ kind: 'transfer', context: s.context });
      setWorking(s.merged);
      setMsg(`${s.conflicts.length} xung đột với tài khoản khác - hãy chọn bản giữ lại.`);
      return;
    }

    clearConflict();
    const action =
      s.mode === 'push-other'
        ? 'Đã đẩy kho sang tài khoản đã chọn'
        : 'Đã lấy và gộp kho từ tài khoản đã chọn';
    const imageSummary =
      s.imageErrors > 0
        ? ` Ảnh: ${s.images} xong, ${s.imageErrors} lỗi.`
        : s.images > 0
          ? ` Ảnh: ${s.images} xong.`
          : '';
    setMsg(`${action} (${s.products} mục).${imageSummary}`);
  };

  const handleSync = async () => {
    setBusy(true);
    setMsg('');
    clearConflict();
    try {
      applyStatus(await syncNow());
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Lỗi đồng bộ');
    } finally {
      setBusy(false);
    }
  };

  const handleTransfer = async (mode: TransferMode) => {
    setBusy(true);
    clearConflict();
    setMsg(
      mode === 'push-other'
        ? 'Chọn tài khoản Google nhận kho...'
        : 'Chọn tài khoản Google để lấy kho...',
    );
    try {
      const token = await requestOneTimeGoogleToken();
      const status =
        mode === 'push-other'
          ? await beginPushToOtherAccount(token)
          : await beginPullFromOtherAccount(token);
      applyTransferStatus(status);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Lỗi chuyển dữ liệu');
    } finally {
      setBusy(false);
    }
  };

  const chooseConflict = (c: Conflict<Product>, choice: 'local' | 'remote') => {
    const next = resolveConflict(working, c, choice);
    const flow = conflictFlow;
    setWorking(next);

    const remaining = (conflicts ?? []).filter((x) => x.id !== c.id);
    setConflicts(remaining);
    if (remaining.length > 0) return;

    setBusy(true);
    const finish =
      flow?.kind === 'transfer'
        ? finishTransfer(flow.context, next).then(applyTransferStatus)
        : syncNow(next).then(applyStatus);

    finish
      .catch((e) => setMsg(e instanceof Error ? e.message : 'Lỗi đồng bộ'))
      .finally(() => setBusy(false));
  };

  if (!configured) {
    return (
      <div className="sync-bar muted">
        <CloudOff size={16} /> Đồng bộ Google chưa cấu hình (điền <code>.env</code> - xem <code>.env.example</code>).
      </div>
    );
  }

  const remoteLabel = conflictFlow?.kind === 'transfer' ? 'Tài khoản khác' : 'Drive';
  const remoteButton = conflictFlow?.kind === 'transfer' ? 'Lấy bản tài khoản khác' : 'Lấy bản trên Drive';

  return (
    <div className="sync-bar">
      {connected ? <Cloud size={16} color="var(--ios-green)" /> : <CloudOff size={16} color="var(--ios-gray1)" />}
      {!connected ? (
        <button className="btn btn-ghost" disabled={busy} onClick={handleConnect}>
          Kết nối Google
        </button>
      ) : (
        <button className="btn btn-ghost" disabled={busy} onClick={handleSync}>
          <RefreshCw size={15} className={busy ? 'spin' : ''} style={{ verticalAlign: '-3px' }} /> Đồng bộ
        </button>
      )}

      <button className="btn btn-ghost" disabled={busy} onClick={() => void handleTransfer('push-other')}>
        <Upload size={15} style={{ verticalAlign: '-3px' }} /> Đẩy kho sang tài khoản khác
      </button>
      <button className="btn btn-ghost" disabled={busy} onClick={() => void handleTransfer('pull-other')}>
        <Download size={15} style={{ verticalAlign: '-3px' }} /> Lấy kho từ tài khoản khác
      </button>

      {msg && <span className="muted" style={{ fontSize: 13 }}>{msg}</span>}

      {conflicts && conflicts.length > 0 && (
        <div className="conflict-dialog card">
          <div className="section-label">Xung đột đồng bộ - chọn bản giữ lại (BR-8)</div>
          {conflicts.map((c) => (
            <div key={c.id} className="conflict-row">
              <div>
                <b>{c.id}</b>
                <div className="muted" style={{ fontSize: 12 }}>
                  Bạn: {c.local.ten} · {c.local.donGiaGoc}đ - {remoteLabel}: {c.remote.ten} · {c.remote.donGiaGoc}đ
                </div>
              </div>
              <div className="row-actions">
                <button className="btn btn-ghost" onClick={() => chooseConflict(c, 'local')}>Giữ bản của bạn</button>
                <button className="btn btn-primary" onClick={() => chooseConflict(c, 'remote')}>{remoteButton}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
