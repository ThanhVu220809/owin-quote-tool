import { useCallback, useEffect, useRef, useState } from 'react';
import { Cloud, CloudOff, MoreHorizontal, RefreshCw } from 'lucide-react';
import type { ProductRecord, QuoteRecord } from '@/types/models';
import { LOCAL_DATA_CHANGED_EVENT } from '@/lib/dataChangeEvents';
import { isConfigured, connectGoogle, ensureToken, requestOneTimeGoogleToken } from './googleAuth';
import { checkRemoteChanges, forcePushToDrive, syncNow, type SyncStatus } from './syncEngine';
import { createSyncPoller, type SyncPoller } from './syncPolling';
import { resolveConflict, type Conflict } from './merge';
import { DataDiagnostics } from './DataDiagnostics';
import {
  beginPullFromOtherAccount,
  beginPushToOtherAccount,
  type TransferConflictContext,
  type TransferMode,
  type TransferStatus,
} from './transferEngine';

type ConflictFlow = { kind: 'owner-sync' } | { kind: 'transfer'; context: TransferConflictContext };

export function SyncBar({ compact = false }: { compact?: boolean }) {
  const configured = isConfigured();
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [conflicts, setConflicts] = useState<Conflict<ProductRecord>[]>([]);
  const [quoteConflicts, setQuoteConflicts] = useState<Conflict<QuoteRecord>[]>([]);
  const [conflictFlow, setConflictFlow] = useState<ConflictFlow | null>(null);
  const [working, setWorking] = useState<ProductRecord[]>([]);
  const [workingQuotes, setWorkingQuotes] = useState<QuoteRecord[]>([]);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const syncInFlightRef = useRef(false);
  const pendingSyncRef = useRef(false);
  const localTimerRef = useRef<number | null>(null);
  const pollerRef = useRef<SyncPoller | null>(null);
  const runOwnerSyncRef = useRef<(automatic: boolean, includeImages?: boolean) => Promise<void>>(
    () => Promise.resolve(),
  );

  const clearConflict = () => {
    setConflicts([]);
    setQuoteConflicts([]);
    setConflictFlow(null);
    setWorking([]);
    setWorkingQuotes([]);
  };

  const applyStatus = (status: SyncStatus, automatic = false) => {
    if (status.state === 'skipped') {
      setMsg(status.reason === 'offline' ? 'Đã lưu trên máy · đang offline.' : 'Chưa cấu hình Google.');
    } else if (status.state === 'unchanged') {
      setMsg('Đang kiểm tra Google · không có thay đổi.');
    } else if (status.state === 'need-relogin') {
      setConnected(false);
      setMsg('Cần đăng nhập lại Google.');
    } else if (status.state === 'error') {
      setMsg(`Lỗi đồng bộ: ${status.message}`);
    } else if (status.state === 'conflict') {
      setConflicts(status.conflicts);
      setQuoteConflicts(status.quoteConflicts);
      setConflictFlow({ kind: 'owner-sync' });
      setWorking(status.merged);
      setWorkingQuotes(status.mergedQuotes);
      setMsg('Có xung đột · hãy chọn bản từ Google, bản trên máy, hoặc lưu bản máy thành bản sao.');
    } else {
      clearConflict();
      setMsg(automatic ? 'Đã đồng bộ' : 'Đã đồng bộ');
    }
  };

  async function runOwnerSync(automatic: boolean, includeImages = true) {
    if (syncInFlightRef.current) {
      pendingSyncRef.current = true;
      return;
    }
    syncInFlightRef.current = true;
    setBusy(true);
    setMsg(automatic ? 'Đang đồng bộ thay đổi...' : 'Đang tải thay đổi → merge → đồng bộ...');
    try {
      applyStatus(await syncNow(undefined, { includeImages }), automatic);
    } catch (error) {
      setMsg(error instanceof Error ? `Lỗi đồng bộ: ${error.message}` : 'Lỗi đồng bộ');
    } finally {
      syncInFlightRef.current = false;
      setBusy(false);
      if (pendingSyncRef.current) {
        pendingSyncRef.current = false;
        window.setTimeout(() => void runOwnerSyncRef.current(true, true), 0);
      }
    }
  }
  useEffect(() => {
    runOwnerSyncRef.current = runOwnerSync;
  });

  const checkRemote = useCallback(async () => {
    if (syncInFlightRef.current) return;
    setMsg('Đang kiểm tra Google');
    try {
      const result = await checkRemoteChanges();
      if (result.state === 'changed') await runOwnerSyncRef.current(true, true);
      else if (result.state === 'unchanged') setMsg('Đang kiểm tra Google · không có thay đổi.');
      else setMsg(result.reason === 'offline' ? 'Đã lưu trên máy · đang offline.' : 'Chưa cấu hình Google.');
    } catch (error) {
      setMsg(error instanceof Error ? `Lỗi kiểm tra Google: ${error.message}` : 'Lỗi kiểm tra Google');
    }
  }, []);

  const handleConnect = async () => {
    setBusy(true);
    clearConflict();
    try {
      await connectGoogle();
      setConnected(true);
      await runOwnerSync(true, true);
    } catch (error) {
      setMsg(error instanceof Error ? error.message : 'Lỗi kết nối');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!configured) return undefined;
    let active = true;
    void ensureToken().then(() => {
      if (!active) return;
      setConnected(true);
      void runOwnerSyncRef.current(true, true);
    }).catch((error) => {
      if (!active) return;
      setConnected(false);
      setMsg(error instanceof Error && error.message !== 'NEED_RELOGIN' ? error.message : 'Bấm Google để kết nối lần đầu.');
    });
    return () => { active = false; };
  }, [configured]);

  useEffect(() => {
    if (!configured || !connected) return undefined;
    const poller = createSyncPoller({ check: checkRemote, isVisible: () => document.visibilityState === 'visible' });
    pollerRef.current = poller;
    const trigger = () => poller.trigger();
    const onLocalChange = () => {
      if (localTimerRef.current) clearTimeout(localTimerRef.current);
      setMsg('Đã lưu trên máy');
      localTimerRef.current = window.setTimeout(() => void runOwnerSyncRef.current(true, true), 2_500);
    };
    const onVisibility = () => { if (document.visibilityState === 'visible') trigger(); };
    window.addEventListener(LOCAL_DATA_CHANGED_EVENT, onLocalChange);
    window.addEventListener('focus', trigger);
    window.addEventListener('online', trigger);
    document.addEventListener('visibilitychange', onVisibility);
    poller.start();
    return () => {
      window.removeEventListener(LOCAL_DATA_CHANGED_EVENT, onLocalChange);
      window.removeEventListener('focus', trigger);
      window.removeEventListener('online', trigger);
      document.removeEventListener('visibilitychange', onVisibility);
      if (localTimerRef.current) clearTimeout(localTimerRef.current);
      poller.stop();
      pollerRef.current = null;
    };
  }, [configured, connected, checkRemote]);

  const chooseProductConflict = (conflict: Conflict<ProductRecord>, choice: 'local' | 'remote' | 'copy') => {
    const products = resolveConflict(working, conflict, choice === 'copy' ? 'local' : choice);
    if (choice === 'copy') products.push({ ...conflict.local, id: `${conflict.local.id}-local-copy`, name: `${conflict.local.name} (bản sao)` });
    const remaining = conflicts.filter((item) => item.id !== conflict.id);
    setConflicts(remaining);
    setWorking(products);
    if (!remaining.length && !quoteConflicts.length) {
      setBusy(true);
      void syncNow({ products, quotes: workingQuotes }).then(applyStatus).finally(() => setBusy(false));
    }
  };

  const chooseQuoteConflict = (conflict: Conflict<QuoteRecord>, choice: 'local' | 'remote' | 'copy') => {
    let quotes = resolveConflict(workingQuotes, conflict, choice === 'copy' ? 'local' : choice);
    if (choice === 'copy') quotes = [...quotes, { ...conflict.local, id: `${conflict.local.id}-local-copy`, code: `${conflict.local.code}-COPY` }];
    const remaining = quoteConflicts.filter((item) => item.id !== conflict.id);
    setQuoteConflicts(remaining);
    setWorkingQuotes(quotes);
    if (!remaining.length && !conflicts.length) {
      setBusy(true);
      void syncNow({ products: working, quotes }).then(applyStatus).finally(() => setBusy(false));
    }
  };

  const applyTransferStatus = (status: TransferStatus) => {
    if (status.state === 'empty-remote') { setMsg('Tài khoản này chưa có kho OWIN để lấy.'); return; }
    if (status.state === 'conflict') {
      setConflicts(status.conflicts); setConflictFlow({ kind: 'transfer', context: status.context }); setWorking(status.merged);
      setMsg(`${status.conflicts.length} xung đột với tài khoản khác.`); return;
    }
    clearConflict();
    setMsg(status.mode === 'push-other' ? 'Đã ghi đè kho tài khoản khác theo xác nhận.' : 'Đã lấy và gộp kho tài khoản khác.');
  };

  const handleTransfer = async (mode: TransferMode) => {
    setBusy(true); clearConflict();
    setMsg(mode === 'push-other' ? 'Chọn tài khoản Google nhận kho (sẽ ghi đè sau thao tác xác nhận)...' : 'Chọn tài khoản Google để lấy kho...');
    try {
      const token = await requestOneTimeGoogleToken();
      const status = mode === 'push-other' ? await beginPushToOtherAccount(token) : await beginPullFromOtherAccount(token);
      applyTransferStatus(status);
    } catch (error) { setMsg(error instanceof Error ? error.message : 'Lỗi chuyển dữ liệu'); }
    finally { setBusy(false); }
  };

  const handleForcePush = async () => {
    if (!window.confirm('Ghi đè toàn bộ dữ liệu Google Drive bằng dữ liệu trên máy này?')) return;
    setBusy(true);
    setMsg('Đang ghi đè theo xác nhận...');
    try { applyStatus(await forcePushToDrive({ confirmed: true })); }
    catch (error) { setMsg(error instanceof Error ? error.message : 'Lỗi ghi đè Drive'); }
    finally { setBusy(false); }
  };

  if (!configured) return <div className={`sync-bar muted${compact ? ' sync-bar-compact' : ''}`}><CloudOff size={16} /> {compact ? 'Chưa cấu hình Google' : 'Đồng bộ Google chưa cấu hình'}</div>;
  const remoteLabel = conflictFlow?.kind === 'transfer' ? 'Tài khoản khác' : 'Google';
  return (
    <div className={`sync-bar${compact ? ' sync-bar-compact' : ''}`}>
      {connected ? <Cloud size={16} color="var(--ios-green)" /> : <CloudOff size={16} color="var(--ios-gray1)" />}
      {!connected ? <button className="btn btn-ghost" disabled={busy} onClick={handleConnect}>{compact ? 'Google' : 'Kết nối Google'}</button> : <button className="btn btn-ghost" disabled={busy} onClick={() => void runOwnerSync(false, true)} title="Đồng bộ"><RefreshCw size={15} className={busy ? 'spin' : ''} style={{ verticalAlign: '-3px' }} />{compact ? '' : ' Đồng bộ'}</button>}
      <button className="btn btn-ghost" disabled={busy} onClick={() => setDiagnosticsOpen((value) => !value)} title="Dữ liệu và đồng bộ"><MoreHorizontal size={15} />{compact ? '' : ' Menu nâng cao'}</button>
      {diagnosticsOpen && <DataDiagnostics onClose={() => setDiagnosticsOpen(false)} connected={connected} busy={busy} onPullLatest={() => void handleTransfer('pull-other')} onPushOther={() => void handleTransfer('push-other')} onForcePush={() => void handleForcePush()} />}
      {msg && <span className="muted sync-bar-msg" title={msg} style={{ fontSize: 13 }}>{msg}</span>}
      {(conflicts.length > 0 || quoteConflicts.length > 0) && <div className="conflict-dialog card">
        <div className="section-label">Xung đột đồng bộ - chọn bản giữ lại</div>
        {conflicts.map((c) => <div key={`p-${c.id}`} className="conflict-row"><div><b>Sản phẩm {c.id}</b><div className="muted" style={{ fontSize: 12 }}>Bạn: {c.local.name} · {remoteLabel}: {c.remote.name}</div></div><div className="row-actions"><button className="btn btn-ghost" onClick={() => chooseProductConflict(c, 'local')}>Giữ bản máy</button><button className="btn btn-primary" onClick={() => chooseProductConflict(c, 'remote')}>Dùng bản Google</button><button className="btn btn-ghost" onClick={() => chooseProductConflict(c, 'copy')}>Lưu bản sao</button></div></div>)}
        {quoteConflicts.map((c) => <div key={`q-${c.id}`} className="conflict-row"><div><b>Báo giá {c.id}</b><div className="muted" style={{ fontSize: 12 }}>Bạn: {c.local.customerName} · {remoteLabel}: {c.remote.customerName}</div></div><div className="row-actions"><button className="btn btn-ghost" onClick={() => chooseQuoteConflict(c, 'local')}>Giữ bản máy</button><button className="btn btn-primary" onClick={() => chooseQuoteConflict(c, 'remote')}>Dùng bản Google</button><button className="btn btn-ghost" onClick={() => chooseQuoteConflict(c, 'copy')}>Lưu bản sao</button></div></div>)}
      </div>}
    </div>
  );
}
