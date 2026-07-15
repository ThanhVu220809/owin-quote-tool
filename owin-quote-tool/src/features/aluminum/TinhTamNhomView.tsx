import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Printer } from 'lucide-react';
import { openImageLightbox } from '@/components/imageLightboxStore';
import { SmartNumberInput } from '@/components/SmartNumberInput';
import { parseSmartNumber } from '@/utils/smartNumber';
import {
  calculateAluminumEstimatorRow,
  calculateAluminumEstimatorTotals,
  formatEstimatorMoney,
  parseEstimatorNumber,
  type AluminumEstimatorCalculatedRow,
  type AluminumEstimatorTotals,
} from '@/lib/aluminum-estimator/aluminum-estimator';
import {
  ALUMINUM_SYSTEMS,
  getAluminumSystemById,
  getDefaultAluminumEstimatorRows,
  type AluminumEstimatorDefaultRow,
} from '@/lib/aluminum-estimator/aluminum-systems';
import { getAluminumProfileImageDisplay } from '@/lib/aluminum-estimator/aluminum-profile-image';
import {
  buildAluminumPrintModel,
  type AluminumPrintInputSystem,
  type AluminumPrintScope,
} from '@/lib/aluminum-estimator-print';
import {
  ALUMINUM_PRINT_CSS,
  buildAluminumPrintHtml,
  downloadAluminumDocx,
} from '@/lib/aluminum-estimator-export';
import { subscribeToAppData } from '@/features/supabase/sharedDataRepo';
import {
  ALUMINUM_ESTIMATOR_STORAGE_KEY,
  aluminumEstimatorStateContentEquals,
  ALUMINUM_COLORS,
  createDefaultAluminumEstimatorState,
  getAluminumEstimatorInput,
  loadAluminumEstimatorStorage,
  mergeAluminumEstimatorStates,
  saveAluminumEstimatorStorage,
  touchAluminumEstimatorState,
  type AluminumEstimatorInputState,
  type AluminumEstimatorPageState,
  type AluminumEstimatorStorageSnapshot,
  type AluminumEstimatorRowPatch,
} from './aluminumEstimatorStorage';

interface AluminumEstimatorRowViewModel {
  source: AluminumEstimatorDefaultRow;
  input: AluminumEstimatorInputState;
  calculated: AluminumEstimatorCalculatedRow;
}

interface AluminumEstimatorSystemTotals {
  systemId: string;
  systemName: string;
  totals: AluminumEstimatorTotals;
}

type AutosavePhase = 'loading' | 'idle' | 'pending' | 'saving' | 'saved' | 'error';

function normalizeInput(input: AluminumEstimatorInputState) {
  return {
    quantity: parseEstimatorNumber(input.quantity),
    unitPrice: parseEstimatorNumber(input.unitPrice),
    note: input.note,
  };
}

function buildRowsForSystem(systemId: string, pageState: AluminumEstimatorPageState): AluminumEstimatorRowViewModel[] {
  return getDefaultAluminumEstimatorRows(systemId).map((raw) => {
    // Màu áp cho tất cả thanh theo lựa chọn ở trên.
    const source = { ...raw, color: pageState.color };
    const input = getAluminumEstimatorInput(pageState.inputRows, source.systemId, source.rowId);
    const calculated = calculateAluminumEstimatorRow(source, normalizeInput(input));
    return { source, input, calculated };
  });
}

function summarizeSystems(pageState: AluminumEstimatorPageState): AluminumEstimatorSystemTotals[] {
  return ALUMINUM_SYSTEMS.map((system) => {
    const rows = buildRowsForSystem(system.id, pageState);
    return {
      systemId: system.id,
      systemName: system.name,
      totals: calculateAluminumEstimatorTotals(rows.map((row) => row.calculated)),
    };
  });
}

function buildPrintInputSystems(pageState: AluminumEstimatorPageState): AluminumPrintInputSystem[] {
  return ALUMINUM_SYSTEMS.map((system) => {
    const rows = buildRowsForSystem(system.id, pageState);
    return {
      systemId: system.id,
      systemName: system.name,
      color: pageState.color,
      rows: rows.map((row) => ({
        stt: row.source.stt,
        color: pageState.color,
        systemId: row.source.systemId,
        systemName: row.source.systemName,
        image: row.source.image,
        code: row.source.code,
        description: row.source.description,
        quantity: row.input.quantity,
        unitPrice: row.input.unitPrice,
      })),
    };
  });
}

export function TinhTamNhomView() {
  const [pageState, setPageState] = useState<AluminumEstimatorPageState>(() => createDefaultAluminumEstimatorState());
  const [hydrated, setHydrated] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [exportScope, setExportScope] = useState<AluminumPrintScope>('current-system');
  const [printScope, setPrintScope] = useState<AluminumPrintScope>('all-systems');
  const [autosavePhase, setAutosavePhase] = useState<AutosavePhase>('loading');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [autosaveRetry, setAutosaveRetry] = useState(0);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [initialLoadFailed, setInitialLoadFailed] = useState(false);
  const [serverBaseVersion, setServerBaseVersion] = useState(0);
  const latestState = useRef(pageState);
  const serverBase = useRef<AluminumEstimatorPageState>(createDefaultAluminumEstimatorState());
  const serverSnapshot = useRef<AluminumEstimatorStorageSnapshot>({ state: null, revision: 0, createdAt: null });
  const serverObservation = useRef(0);
  const scheduleRemoteRefresh = useRef<() => void>(() => undefined);

  const updatePageState = useCallback((
    update: (current: AluminumEstimatorPageState) => AluminumEstimatorPageState,
  ) => {
    setPageState((current) => {
      const next = update(current);
      latestState.current = next;
      return next;
    });
  }, []);

  const applyHostedState = useCallback((snapshot: AluminumEstimatorStorageSnapshot) => {
    const remote = snapshot.state ?? createDefaultAluminumEstimatorState();
    const previousBase = serverBase.current;
    serverSnapshot.current = snapshot;
    serverBase.current = remote;
    serverObservation.current += 1;
    setLastSavedAt(remote.updatedAt);
    setInitialLoadFailed(false);
    updatePageState((current) => mergeAluminumEstimatorStates(previousBase, current, remote));
    setServerBaseVersion((value) => value + 1);
    setHydrated(true);
  }, [updatePageState]);

  useEffect(() => {
    latestState.current = pageState;
  }, [pageState]);

  useEffect(() => {
    let mounted = true;
    const observationAtStart = serverObservation.current;
    void loadAluminumEstimatorStorage()
      .then((stored) => {
        if (!mounted || serverObservation.current !== observationAtStart) return;
        applyHostedState(stored);
      })
      .catch(() => {
        if (!mounted || serverObservation.current !== observationAtStart) return;
        setInitialLoadFailed(true);
        setAutosavePhase('error');
      });
    return () => {
      mounted = false;
    };
  }, [applyHostedState, loadAttempt]);

  useEffect(() => {
    if (!hydrated) return;
    const confirmedBase = serverBase.current;
    if (aluminumEstimatorStateContentEquals(pageState, confirmedBase)) {
      setLastSavedAt(confirmedBase.updatedAt);
      setAutosavePhase(confirmedBase.updatedAt ? 'saved' : 'idle');
      return;
    }

    const snapshot = pageState;
    setAutosavePhase('pending');
    const timer = window.setTimeout(() => {
      const observationAtStart = serverObservation.current;
      setAutosavePhase('saving');
      void saveAluminumEstimatorStorage(serverSnapshot.current, snapshot)
        .then((saved) => {
          const observedWhileSaving = serverObservation.current !== observationAtStart;
          const savedState = saved.state ?? snapshot;
          serverSnapshot.current = saved;
          serverBase.current = savedState;
          serverObservation.current += 1;
          setServerBaseVersion((value) => value + 1);
          setLastSavedAt(savedState.updatedAt);
          if (observedWhileSaving) scheduleRemoteRefresh.current();
          if (aluminumEstimatorStateContentEquals(latestState.current, savedState)) {
            setAutosavePhase('saved');
          }
        })
        .catch(() => {
          if (aluminumEstimatorStateContentEquals(latestState.current, snapshot)) {
            setAutosavePhase('error');
          }
        });
    }, 850);
    return () => window.clearTimeout(timer);
  }, [autosaveRetry, hydrated, pageState, serverBaseVersion]);

  useEffect(() => {
    let active = true;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let refreshInFlight = false;
    let refreshAgain = false;

    const runRefresh = () => {
      if (refreshInFlight) {
        refreshAgain = true;
        return;
      }
      refreshInFlight = true;
      void loadAluminumEstimatorStorage()
        .then((stored) => {
          if (active) applyHostedState(stored);
        })
        .catch(() => {
          if (active) setAutosavePhase('error');
        })
        .finally(() => {
          refreshInFlight = false;
          if (!active || !refreshAgain) return;
          refreshAgain = false;
          scheduleRefresh();
        });
    };

    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        runRefresh();
      }, 80);
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') scheduleRefresh();
    };

    scheduleRemoteRefresh.current = scheduleRefresh;
    window.addEventListener('online', scheduleRefresh);
    window.addEventListener('focus', scheduleRefresh);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    const unsubscribe = subscribeToAppData(
      ALUMINUM_ESTIMATOR_STORAGE_KEY,
      scheduleRefresh,
      (statusValue) => {
        if (statusValue === 'SUBSCRIBED') scheduleRefresh();
      },
    );

    return () => {
      active = false;
      if (refreshTimer) clearTimeout(refreshTimer);
      window.removeEventListener('online', scheduleRefresh);
      window.removeEventListener('focus', scheduleRefresh);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      unsubscribe();
      if (scheduleRemoteRefresh.current === scheduleRefresh) {
        scheduleRemoteRefresh.current = () => undefined;
      }
    };
  }, [applyHostedState]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hydrated || !['pending', 'saving', 'error'].includes(autosavePhase)) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [autosavePhase, hydrated]);

  const selectedSystem = getAluminumSystemById(pageState.selectedSystemId) ?? ALUMINUM_SYSTEMS[0];
  const rowViewModels = useMemo(
    () => buildRowsForSystem(selectedSystem?.id ?? '', pageState),
    [pageState, selectedSystem?.id],
  );
  const systemSummaries = useMemo(() => summarizeSystems(pageState), [pageState]);
  const currentTotals = useMemo(
    () => calculateAluminumEstimatorTotals(rowViewModels.map((row) => row.calculated)),
    [rowViewModels],
  );
  const allTotals = useMemo(
    () =>
      calculateAluminumEstimatorTotals(
        systemSummaries.flatMap((summary) =>
          buildRowsForSystem(summary.systemId, pageState).map((row) => row.calculated),
        ),
      ),
    [pageState, systemSummaries],
  );
  const rowCountsBySystem = useMemo(
    () =>
      Object.fromEntries(
        systemSummaries.map((summary) => [summary.systemId, summary.totals.enteredRowCount]),
      ) as Record<string, number>,
    [systemSummaries],
  );
  const printInputSystems = useMemo(() => buildPrintInputSystems(pageState), [pageState]);
  const currentPrintModel = useMemo(
    () =>
      buildAluminumPrintModel({
        scope: 'current-system',
        currentSystemId: selectedSystem?.id ?? '',
        systems: printInputSystems,
      }),
    [printInputSystems, selectedSystem?.id],
  );
  const allPrintModel = useMemo(
    () =>
      buildAluminumPrintModel({
        scope: 'all-systems',
        currentSystemId: selectedSystem?.id ?? '',
        systems: printInputSystems,
      }),
    [printInputSystems, selectedSystem?.id],
  );
  const activePrintModel = printScope === 'current-system' ? currentPrintModel : allPrintModel;

  const updateRow = (rowId: string, patch: AluminumEstimatorRowPatch) => {
    if (!selectedSystem) return;
    updatePageState((current) => {
      const currentSystemRows = current.inputRows[selectedSystem.id] ?? {};
      const currentInput = currentSystemRows[rowId] ?? { quantity: '', unitPrice: '', note: '' };
      return touchAluminumEstimatorState({
        ...current,
        inputRows: {
          ...current.inputRows,
          [selectedSystem.id]: {
            ...currentSystemRows,
            [rowId]: {
              ...currentInput,
              ...patch,
            },
          },
        },
      });
    });
  };

  const printPdf = () => {
    const model = exportScope === 'current-system' ? currentPrintModel : allPrintModel;
    if (model.rowCount === 0) {
      setStatus('Chưa có dòng nào để in.');
      return;
    }
    setStatus(null);
    setPrintScope(exportScope);
    window.setTimeout(() => window.print(), 80);
  };

  const exportWord = () => {
    const model = exportScope === 'current-system' ? currentPrintModel : allPrintModel;
    if (model.rowCount === 0) {
      setStatus('Chưa có dòng nào để xuất Word.');
      return;
    }
    setStatus(null);
    void downloadAluminumDocx(model)
      .then(() => setStatus('Đã tải file Word.'))
      .catch(() => setStatus('Không xuất được Word.'));
  };

  return (
    <section className="admin-page aluminum-page">
      <div className="aluminum-hero aluminum-hero-compact">
        <div>
          <h1 className="app-title">Bảng tính nhôm</h1>
          <p className="app-subtitle">Nhập SL + đơn giá · chỉ xuất Word / In PDF (không lưu file vào hệ thống).</p>
        </div>
        <div className="aluminum-export-bar">
          <div className="aluminum-scope-toggle" role="group" aria-label="Phạm vi xuất">
            <button
              type="button"
              className={exportScope === 'current-system' ? 'active' : ''}
              onClick={() => setExportScope('current-system')}
            >
              Hệ này
            </button>
            <button
              type="button"
              className={exportScope === 'all-systems' ? 'active' : ''}
              onClick={() => setExportScope('all-systems')}
            >
              Tất cả hệ
            </button>
          </div>
          <button className="btn btn-primary" type="button" onClick={exportWord}>
            <FileText size={16} /> Word
          </button>
          <button className="btn btn-ghost" type="button" onClick={printPdf}>
            <Printer size={16} /> In PDF
          </button>
          {status && <span className="aluminum-status">{status}</span>}
        </div>
      </div>

      <div className="aluminum-toolbar-row">
        <AluminumSystemTabs
          selectedSystemId={selectedSystem?.id ?? ''}
          rowCountsBySystem={rowCountsBySystem}
          systemTotals={systemSummaries}
          onSelect={(systemId) => updatePageState((current) => touchAluminumEstimatorState({
            ...current,
            selectedSystemId: systemId,
          }))}
        />
        <div className="aluminum-color-block">
          <span className="aluminum-color-label">Màu</span>
          <div className="aluminum-color-chips" role="group" aria-label="Chọn màu nhôm">
            {ALUMINUM_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={`aluminum-color-chip${pageState.color === color ? ' active' : ''}`}
                onClick={() => updatePageState((current) => touchAluminumEstimatorState({ ...current, color }))}
              >
                {color}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="aluminum-totals-strip">
        <div className="aluminum-total-chip">
          <span>Tổng hệ {selectedSystem?.name ?? ''}</span>
          <strong>{formatEstimatorMoney(currentTotals.totalAmount)} đ</strong>
        </div>
        <div className="aluminum-total-chip aluminum-total-chip-all">
          <span>Tổng tất cả hệ</span>
          <strong>{formatEstimatorMoney(allTotals.totalAmount)} đ</strong>
        </div>
        <span className={`aluminum-autosave aluminum-autosave-${autosavePhase}`}>
          {autosavePhase === 'loading' && 'Đang tải…'}
          {autosavePhase === 'idle' && 'Sẵn sàng'}
          {autosavePhase === 'pending' && 'Sắp lưu…'}
          {autosavePhase === 'saving' && 'Đang lưu…'}
          {autosavePhase === 'saved' && (lastSavedAt ? 'Đã lưu' : 'Sẵn sàng')}
          {autosavePhase === 'error' && (
            <>
              Lỗi lưu.{' '}
              <button
                type="button"
                className="btn-link"
                onClick={() => {
                  if (initialLoadFailed) {
                    setHydrated(false);
                    setAutosavePhase('loading');
                    setLoadAttempt((value) => value + 1);
                  } else {
                    setAutosaveRetry((value) => value + 1);
                  }
                }}
              >
                Thử lại
              </button>
            </>
          )}
        </span>
      </div>

      <AluminumTable rows={rowViewModels} onRowChange={updateRow} />

      <section className="aluminum-print-root" id="aluminum-estimator-print-root">
        <style>{`
          @media print {
            body * { visibility: hidden; }
            #aluminum-estimator-print-root,
            #aluminum-estimator-print-root * { visibility: visible; }
            #aluminum-estimator-print-root {
              display: block;
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              background: #ffffff;
            }
            ${ALUMINUM_PRINT_CSS}
          }
        `}</style>
        <div
          dangerouslySetInnerHTML={{
            __html: buildAluminumPrintHtml(
              activePrintModel,
              typeof window === 'undefined' ? undefined : window.location.origin,
            ),
          }}
        />
      </section>
    </section>
  );
}

function AluminumSystemTabs({
  selectedSystemId,
  rowCountsBySystem,
  systemTotals,
  onSelect,
}: {
  selectedSystemId: string;
  rowCountsBySystem: Record<string, number>;
  systemTotals: AluminumEstimatorSystemTotals[];
  onSelect: (systemId: string) => void;
}) {
  const totalById = useMemo(
    () => Object.fromEntries(systemTotals.map((s) => [s.systemId, s.totals.totalAmount])),
    [systemTotals],
  );

  return (
    <div className="aluminum-tabs">
      {ALUMINUM_SYSTEMS.map((system) => {
        const isActive = system.id === selectedSystemId;
        const rowCount = rowCountsBySystem[system.id] ?? 0;
        const amount = totalById[system.id] ?? 0;

        return (
          <button
            key={system.id}
            type="button"
            className={isActive ? 'active' : ''}
            onClick={() => onSelect(system.id)}
          >
            <span>{system.name}</span>
            {rowCount > 0 && (
              <strong className="aluminum-tab-amount">{formatEstimatorMoney(amount)} đ</strong>
            )}
          </button>
        );
      })}
    </div>
  );
}

function AluminumTable({
  rows,
  onRowChange,
}: {
  rows: AluminumEstimatorRowViewModel[];
  onRowChange: (rowId: string, patch: AluminumEstimatorRowPatch) => void;
}) {
  const renderInput = (
    rowId: string,
    key: 'quantity' | 'unitPrice',
    value: string,
    label: string,
    className: string,
  ) => {
    const numeric = parseSmartNumber(value, {
      mode: key === 'quantity' ? 'int' : 'currency',
      min: 0,
    });
    return (
      <SmartNumberInput
        aria-label={label}
        className={className}
        mode={key === 'quantity' ? 'int' : 'currency'}
        min={0}
        value={numeric}
        onChange={(n) => {
          // Lưu chuỗi: 0 → "" để ô trống, gõ tiếp được; còn lại số thuần.
          onRowChange(rowId, { [key]: n === 0 ? '' : String(n) });
        }}
        placeholder="0"
      />
    );
  };

  return (
    <div className="aluminum-table-wrap">
      <table className="aluminum-table aluminum-table-compact">
        <thead>
          <tr>
            <th>STT</th>
            <th>Hình</th>
            <th>Mã cây</th>
            <th>Mô tả</th>
            <th>SL</th>
            <th>Đơn giá</th>
            <th>Thành tiền</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ source, input, calculated }) => {
            const image = getAluminumProfileImageDisplay(source.image);
            const isActive = calculated.quantity > 0 || parseEstimatorNumber(input.unitPrice) > 0;
            const lineTotalText = calculated.lineTotal > 0 ? `${formatEstimatorMoney(calculated.lineTotal)} đ` : '—';

            return (
              <tr key={source.rowId} className={isActive ? 'active' : ''}>
                <td className="center">{source.stt}</td>
                <td>
                  <div className="aluminum-image-cell">
                    {image.kind === 'image' ? (
                      <img
                        src={image.src}
                        alt={`Hình ${source.code}`}
                        style={{ cursor: 'zoom-in' }}
                        onClick={() => openImageLightbox(image.src)}
                      />
                    ) : (
                      <span>{image.label}</span>
                    )}
                  </div>
                </td>
                <td className="code">{source.code}</td>
                <td className="description">{source.description}</td>
                <td className="input-cell center">
                  {renderInput(source.rowId, 'quantity', input.quantity, `SL cây ${source.code}`, 'aluminum-qty-input')}
                </td>
                <td className="input-cell num">
                  {renderInput(source.rowId, 'unitPrice', input.unitPrice, `Đơn giá ${source.code}`, 'aluminum-price-input')}
                </td>
                <td className={calculated.lineTotal > 0 ? 'num total' : 'num muted'}>{lineTotalText}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
