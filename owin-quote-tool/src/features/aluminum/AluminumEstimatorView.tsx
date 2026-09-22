import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { calculateAluminumEstimatorTotals } from '@/features/aluminum/estimator/estimator';
import { ALUMINUM_SYSTEMS, getAluminumSystemById } from '@/features/aluminum/estimator/systems';
import {
  buildAluminumPrintModel,
  type AluminumPrintScope,
} from '@/features/aluminum/estimator/print/index';
import { downloadAluminumDocx } from '@/features/aluminum/estimator/export';
import { subscribeToAppData } from '@/services/supabase/sharedDataRepo';
import {
  ALUMINUM_ESTIMATOR_STORAGE_KEY,
  aluminumEstimatorStateContentEquals,
  createDefaultAluminumEstimatorState,
  loadAluminumEstimatorStorage,
  mergeAluminumEstimatorStates,
  saveAluminumEstimatorStorage,
  touchAluminumEstimatorState,
  type AluminumColor,
  type AluminumEstimatorPageState,
  type AluminumEstimatorStorageSnapshot,
  type AluminumEstimatorRowPatch,
} from '@/features/aluminum/aluminumEstimatorStorage';
import {
  buildPrintInputSystems,
  buildRowsForSystem,
  summarizeSystems,
} from '@/features/aluminum/aluminumRowModel';
import {
  applyAluminumBaseRate,
  applyAluminumRowPatch,
  addAluminumProfile,
  removeAluminumRow,
  selectAluminumColor,
  type AddAluminumProfileInput,
} from '@/features/aluminum/aluminumPageActions';
import { AluminumControls } from '@/features/aluminum/AluminumControls';
import { AluminumExportBar } from '@/features/aluminum/AluminumExportBar';
import { AluminumPrintRoot } from '@/features/aluminum/AluminumPrintRoot';
import { AluminumTable } from '@/features/aluminum/AluminumTable';
import { AluminumProfileDialog } from '@/features/aluminum/AluminumProfileDialog';
import { AluminumTotalsStrip, type AutosavePhase } from '@/features/aluminum/AluminumTotalsStrip';
import './aluminum.css';

/** Màn "Tính nhôm": giữ state trang, đồng bộ Supabase và ghép các panel. */
export function AluminumEstimatorView() {
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
  const [addingProfile, setAddingProfile] = useState(false);
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
    const systemId = selectedSystem.id;
    updatePageState((current) => applyAluminumRowPatch(current, systemId, rowId, patch));
  };

  const updateBaseRate = (color: AluminumColor, raw: number) => {
    updatePageState((current) => applyAluminumBaseRate(current, color, raw));
  };

  const addProfile = (input: AddAluminumProfileInput) => {
    if (!selectedSystem) return;
    updatePageState((current) => addAluminumProfile(current, selectedSystem.id, input));
    setAddingProfile(false);
  };

  const deleteProfile = (row: typeof rowViewModels[number]['source']) => {
    if (!window.confirm(`Xoá cây nhôm "${row.code}"? Đơn giá và SL của cây này cũng sẽ bị xoá.`)) return;
    updatePageState((current) => removeAluminumRow(current, row.systemId, row.rowId));
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

  const retryAutosave = () => {
    if (initialLoadFailed) {
      setHydrated(false);
      setAutosavePhase('loading');
      setLoadAttempt((value) => value + 1);
    } else {
      setAutosaveRetry((value) => value + 1);
    }
  };

  return (
    <section className="admin-page aluminum-page">
      <AluminumExportBar
        status={status}
        onExportWord={exportWord}
        onPrintPdf={printPdf}
      />

      <section className="aluminum-summary-panel">
        <AluminumControls
          selectedSystemId={selectedSystem?.id ?? ''}
          rowCountsBySystem={rowCountsBySystem}
          systemTotals={systemSummaries}
          color={pageState.color}
          colorBaseRates={pageState.colorBaseRates}
          onSelectSystem={(systemId) => updatePageState((current) => touchAluminumEstimatorState({
            ...current,
            selectedSystemId: systemId,
          }))}
          onSelectColor={(color) => updatePageState((current) => selectAluminumColor(current, color))}
          onBaseRateChange={updateBaseRate}
        />

        <AluminumTotalsStrip
          systemName={selectedSystem?.name ?? ''}
          systemTotalAmount={currentTotals.totalAmount}
          allTotalAmount={allTotals.totalAmount}
          autosavePhase={autosavePhase}
          lastSavedAt={lastSavedAt}
          exportScope={exportScope}
          onExportScopeChange={setExportScope}
          onRetry={retryAutosave}
        />
      </section>

      <AluminumTable
        key={selectedSystem?.id ?? ''}
        rows={rowViewModels}
        onRowChange={updateRow}
        onAddProfile={() => setAddingProfile(true)}
        onDeleteProfile={deleteProfile}
      />

      {addingProfile && selectedSystem ? (
        <AluminumProfileDialog
          systemName={selectedSystem.name}
          onClose={() => setAddingProfile(false)}
          onSave={addProfile}
        />
      ) : null}

      <AluminumPrintRoot model={activePrintModel} />
    </section>
  );
}
