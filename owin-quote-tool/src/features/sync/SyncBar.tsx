import { useEffect, useRef, useState } from 'react';
import { Cloud, CloudOff, Download, RefreshCw, Upload } from 'lucide-react';
import type { ProductRecord } from '@/types/models';
import { LOCAL_DATA_CHANGED_EVENT } from '@/lib/dataChangeEvents';
import { isConfigured, connectGoogle, ensureToken, requestOneTimeGoogleToken } from './googleAuth';
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

export function SyncBar({ compact = false }: { compact?: boolean }) {
  const configured = isConfigured();
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>('');
  const [conflicts, setConflicts] = useState<Conflict<ProductRecord>[] | null>(null);
  const [conflictFlow, setConflictFlow] = useState<ConflictFlow | null>(null);
  const [working, setWorking] = useState<ProductRecord[]>([]);
  const syncInFlightRef = useRef(false);
  const autoSyncPendingRef = useRef(false);
  const autoSyncPendingImagesRef = useRef(false);
  const autoSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoImageTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runOwnerSyncRef = useRef<(automatic: boolean, includeImages?: boolean) => Promise<void>>(
    () => Promise.resolve(),
  );

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
      setMsg('Đã kết nối Google. Đang đồng bộ lần đầu...');
      await runOwnerSync(true, true);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Lỗi kết nối');
    } finally {
      setBusy(false);
    }
  };

  const applyStatus = (s: SyncStatus, automatic = false, includedImages = true) => {
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
      const action = automatic
        ? includedImages
          ? 'Đã tự sao lưu cả dữ liệu và ảnh'
          : 'Đã tự lưu dữ liệu lên Drive'
        : 'Đồng bộ xong';
      setMsg(`${action} (${s.pushed} mục).`);
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
        ? 'Đã ghi đè toàn bộ kho sang tài khoản đã chọn'
        : 'Đã lấy và gộp kho từ tài khoản đã chọn';
    const imageSummary =
      s.imageErrors > 0
        ? ` Ảnh: ${s.images} xong, ${s.imageErrors} lỗi.`
        : s.images > 0
          ? ` Ảnh: ${s.images} xong.`
          : '';
    setMsg(`${action} (${s.products} mục).${imageSummary}`);
  };

  async function runOwnerSync(automatic: boolean, includeImages = true) {
    if (syncInFlightRef.current) {
      if (automatic) {
        autoSyncPendingRef.current = true;
        autoSyncPendingImagesRef.current ||= includeImages;
      }
      return;
    }
    syncInFlightRef.current = true;
    setBusy(true);
    setMsg(automatic ? 'Đang tự động lưu lên Drive...' : 'Đang đồng bộ...');
    clearConflict();
    try {
      applyStatus(await syncNow(undefined, { includeImages }), automatic, includeImages);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Lỗi đồng bộ');
    } finally {
      syncInFlightRef.current = false;
      setBusy(false);
      if (autoSyncPendingRef.current) {
        const pendingImages = autoSyncPendingImagesRef.current;
        autoSyncPendingRef.current = false;
        autoSyncPendingImagesRef.current = false;
        setTimeout(() => void runOwnerSyncRef.current(true, pendingImages), 0);
      }
    }
  }

  runOwnerSyncRef.current = runOwnerSync;

  const handleSync = () => {
    void runOwnerSync(false, true);
  };

  useEffect(() => {
    if (!configured) return undefined;
    let active = true;

    void ensureToken()
      .then(() => {
        if (!active) return;
        setConnected(true);
        setMsg('Đã kết nối Google • Tự động lưu Drive');
        void runOwnerSyncRef.current(true, false);
      })
      .catch((error) => {
        if (!active) return;
        setConnected(false);
        setMsg(
          error instanceof Error && error.message !== 'NEED_RELOGIN'
            ? error.message
            : 'Bấm Google để kết nối lần đầu.',
        );
      });

    return () => {
      active = false;
    };
  }, [configured]);

  useEffect(() => {
    if (!configured || !connected || (conflicts?.length ?? 0) > 0) return undefined;

    const scheduleAutoSync = () => {
      if (syncInFlightRef.current) {
        autoSyncPendingRef.current = true;
        autoSyncPendingImagesRef.current = true;
        return;
      }
      if (autoSyncTimerRef.current) clearTimeout(autoSyncTimerRef.current);
      autoSyncTimerRef.current = setTimeout(() => {
        autoSyncTimerRef.current = null;
        void runOwnerSyncRef.current(true, false);
      }, 2500);
      if (autoImageTimerRef.current) clearTimeout(autoImageTimerRef.current);
      autoImageTimerRef.current = setTimeout(() => {
        autoImageTimerRef.current = null;
        void runOwnerSyncRef.current(true, true);
      }, 12000);
    };
    const syncWhenVisible = () => {
      if (document.visibilityState === 'visible') scheduleAutoSync();
    };

    window.addEventListener(LOCAL_DATA_CHANGED_EVENT, scheduleAutoSync);
    window.addEventListener('online', scheduleAutoSync);
    document.addEventListener('visibilitychange', syncWhenVisible);
    return () => {
      window.removeEventListener(LOCAL_DATA_CHANGED_EVENT, scheduleAutoSync);
      window.removeEventListener('online', scheduleAutoSync);
      document.removeEventListener('visibilitychange', syncWhenVisible);
      if (autoSyncTimerRef.current) {
        clearTimeout(autoSyncTimerRef.current);
        autoSyncTimerRef.current = null;
      }
      if (autoImageTimerRef.current) {
        clearTimeout(autoImageTimerRef.current);
        autoImageTimerRef.current = null;
      }
    };
  }, [configured, connected, conflicts?.length]);

  const handleTransfer = async (mode: TransferMode) => {
    setBusy(true);
    clearConflict();
    setMsg(
      mode === 'push-other'
        ? 'Chọn tài khoản Google nhận kho (kho đích sẽ bị ghi đè toàn bộ)...'
        : 'Chọn tài khoản Google để lấy kho...',
    );
    try {
      const token = await requestOneTimeGoogleToken();
      setMsg(
        mode === 'push-other'
          ? 'Đã chọn tài khoản. Đang tải ảnh và ghi đè kho...'
          : 'Đã chọn tài khoản. Đang tải và gộp kho...',
      );
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

  const chooseConflict = (c: Conflict<ProductRecord>, choice: 'local' | 'remote') => {
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
      <div className={`sync-bar muted${compact ? ' sync-bar-compact' : ''}`}>
        <CloudOff size={16} /> {compact ? 'Chưa cấu hình Google' : 'Đồng bộ Google chưa cấu hình'}
      </div>
    );
  }

  const remoteLabel = conflictFlow?.kind === 'transfer' ? 'Tài khoản khác' : 'Drive';
  const remoteButton = conflictFlow?.kind === 'transfer' ? 'Lấy bản tài khoản khác' : 'Lấy bản trên Drive';

  return (
    <div className={`sync-bar${compact ? ' sync-bar-compact' : ''}`}>
      {connected ? <Cloud size={16} color="var(--ios-green)" /> : <CloudOff size={16} color="var(--ios-gray1)" />}
      {!connected ? (
        <button className="btn btn-ghost" disabled={busy} onClick={handleConnect}>
          {compact ? 'Google' : 'Kết nối Google'}
        </button>
      ) : (
        <button className="btn btn-ghost" disabled={busy} onClick={handleSync} title="Đồng bộ">
          <RefreshCw size={15} className={busy ? 'spin' : ''} style={{ verticalAlign: '-3px' }} />
          {compact ? '' : ' Đồng bộ'}
        </button>
      )}

      <button
        className="btn btn-ghost"
        disabled={busy}
        onClick={() => void handleTransfer('push-other')}
        title="Đẩy và ghi đè toàn bộ kho sang tài khoản khác"
      >
        <Upload size={15} style={{ verticalAlign: '-3px' }} />
        {compact ? '' : ' Đẩy & ghi đè kho'}
      </button>
      <button
        className="btn btn-ghost"
        disabled={busy}
        onClick={() => void handleTransfer('pull-other')}
        title="Lấy kho từ tài khoản khác"
      >
        <Download size={15} style={{ verticalAlign: '-3px' }} />
        {compact ? '' : ' Lấy kho'}
      </button>

      {msg && !compact && <span className="muted" style={{ fontSize: 13 }}>{msg}</span>}
      {msg && compact && <span className="muted sync-bar-msg" title={msg}>{msg}</span>}

      {conflicts && conflicts.length > 0 && (
        <div className="conflict-dialog card">
          <div className="section-label">Xung đột đồng bộ - chọn bản giữ lại (BR-8)</div>
          {conflicts.map((c) => (
            <div key={c.id} className="conflict-row">
              <div>
                <b>{c.id}</b>
                <div className="muted" style={{ fontSize: 12 }}>
                  Bạn: {c.local.name} · {c.local.unitPriceVnd}đ - {remoteLabel}: {c.remote.name} · {c.remote.unitPriceVnd}đ
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
