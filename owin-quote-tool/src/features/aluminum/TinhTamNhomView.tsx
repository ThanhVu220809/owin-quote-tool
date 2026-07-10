import { useEffect, useMemo, useState } from 'react';
import { ClipboardCopy, Download, FileText, Printer, RotateCcw, Trash2 } from 'lucide-react';
import {
  calculateAluminumEstimatorRow,
  calculateAluminumEstimatorTotals,
  formatEstimatorInputNumber,
  formatEstimatorMoney,
  formatEstimatorQuantity,
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
import {
  buildAluminumEstimatorDetailText,
  buildAluminumEstimatorSummaryText,
} from '@/lib/aluminum-estimator/aluminum-estimator-copy';
import { getAluminumProfileImageDisplay } from '@/lib/aluminum-estimator/aluminum-profile-image';
import {
  buildAluminumPrintModel,
  type AluminumPrintInputSystem,
  type AluminumPrintModel,
  type AluminumPrintScope,
} from '@/lib/aluminum-estimator-print';
import {
  ALUMINUM_PRINT_CSS,
  buildAluminumPrintHtml,
  downloadAluminumDocx,
} from '@/lib/aluminum-estimator-export';
import {
  clearAluminumEstimatorStorage,
  createDefaultAluminumEstimatorState,
  getAluminumEstimatorInput,
  isAluminumEstimatorDirty,
  loadAluminumEstimatorStorage,
  saveAluminumEstimatorStorage,
  touchAluminumEstimatorState,
  type AluminumEstimatorInputState,
  type AluminumEstimatorPageState,
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

function normalizeInput(input: AluminumEstimatorInputState) {
  return {
    quantity: parseEstimatorNumber(input.quantity),
    unitPrice: parseEstimatorNumber(input.unitPrice),
    note: input.note,
  };
}

function csvCell(value: string | number): string {
  const raw = String(value);
  return /[",\n]/.test(raw) ? `"${raw.replaceAll('"', '""')}"` : raw;
}

function buildEstimatorCsv(model: AluminumPrintModel): string {
  const header = ['STT', 'Màu', 'Mã cây', 'Mô tả / Tên cây', 'SL cây', 'Đơn giá/cây', 'Thành tiền'];
  const body = model.sections.flatMap((section) =>
    section.rows.map((row) => [
      row.stt,
      row.color,
      row.code,
      row.description,
      row.quantity,
      row.unitPrice,
      row.lineTotal,
    ]),
  );

  return [header, ...body].map((line) => line.map(csvCell).join(',')).join('\n');
}

function buildRowsForSystem(systemId: string, pageState: AluminumEstimatorPageState): AluminumEstimatorRowViewModel[] {
  return getDefaultAluminumEstimatorRows(systemId).map((source) => {
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
      color: system.color,
      rows: rows.map((row) => ({
        stt: row.source.stt,
        color: row.source.color,
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

async function writeClipboardText(text: string): Promise<boolean> {
  if (!navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function downloadTextFile(fileName: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function formatUpdatedAt(value: string | null): string {
  if (!value) return 'Chưa có dữ liệu tạm';
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value));
}

export function TinhTamNhomView() {
  const [pageState, setPageState] = useState<AluminumEstimatorPageState>(() => createDefaultAluminumEstimatorState());
  const [hydrated, setHydrated] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [printScope, setPrintScope] = useState<AluminumPrintScope>('all-systems');

  useEffect(() => {
    let mounted = true;
    void loadAluminumEstimatorStorage().then((stored) => {
      if (!mounted) return;
      if (stored) setPageState(stored);
      setHydrated(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void saveAluminumEstimatorStorage(pageState);
  }, [hydrated, pageState]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isAluminumEstimatorDirty(pageState)) return;
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [pageState]);

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
  const activeSystemCount = systemSummaries.filter((summary) => summary.totals.enteredRowCount > 0).length;
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
    setPageState((current) => {
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

  const clearCurrentSystem = () => {
    if (!selectedSystem) return;
    if (!window.confirm('Xóa số liệu tạm của hệ này?')) return;

    setPageState((current) => {
      const nextInputRows = { ...current.inputRows };
      delete nextInputRows[selectedSystem.id];

      return touchAluminumEstimatorState({
        ...current,
        inputRows: nextInputRows,
      });
    });
  };

  const clearAll = () => {
    if (!window.confirm('Xóa toàn bộ số liệu tạm?')) return;
    void clearAluminumEstimatorStorage();
    setPageState(createDefaultAluminumEstimatorState());
    setCopyStatus(null);
  };

  const copyTotal = () => {
    const text = buildAluminumEstimatorSummaryText(
      systemSummaries.map((summary) => ({
        system: { id: summary.systemId, name: summary.systemName },
        totals: summary.totals,
      })),
    );

    void writeClipboardText(text).then((ok) => setCopyStatus(ok ? 'Đã copy tổng.' : 'Không copy được tổng.'));
  };

  const copyCurrentSystem = () => {
    const text = buildAluminumEstimatorDetailText(selectedSystem?.name ?? '', rowViewModels);
    void writeClipboardText(text).then((ok) => setCopyStatus(ok ? 'Đã copy chi tiết hệ này.' : 'Không copy được chi tiết.'));
  };

  const exportCsv = () => {
    if (allPrintModel.rowCount === 0) {
      setCopyStatus('Chưa có dòng nào để xuất CSV.');
      return;
    }

    const csv = `\uFEFF${buildEstimatorCsv(allPrintModel)}`;
    downloadTextFile('bang-tinh-tam-gia-nhom-tat-ca-he.csv', csv, 'text/csv;charset=utf-8');
  };

  const printPdf = (scope: AluminumPrintScope) => {
    const model = scope === 'current-system' ? currentPrintModel : allPrintModel;
    if (model.rowCount === 0) {
      setCopyStatus('Chưa có dòng nào để in.');
      return;
    }

    setPrintScope(scope);
    window.setTimeout(() => window.print(), 80);
  };

  const exportWord = (scope: AluminumPrintScope) => {
    const model = scope === 'current-system' ? currentPrintModel : allPrintModel;
    if (model.rowCount === 0) {
      setCopyStatus('Chưa có dòng nào để xuất Word.');
      return;
    }

    void downloadAluminumDocx(model).catch(() => setCopyStatus('Không xuất được Word.'));
  };

  return (
    <section className="admin-page aluminum-page">
      <div className="aluminum-hero">
        <div>
          <h1 className="app-title">Bảng tính tạm giá nhôm</h1>
          <p className="app-subtitle">Nhập số cây và đơn giá để tính nhanh chi phí nhôm.</p>
        </div>
        <AluminumActions
          copyStatus={copyStatus}
          onClearCurrentSystem={clearCurrentSystem}
          onClearAll={clearAll}
          onCopyTotal={copyTotal}
          onCopyCurrentSystem={copyCurrentSystem}
          onExportCsv={exportCsv}
          onPrintPdfCurrent={() => printPdf('current-system')}
          onPrintPdfAll={() => printPdf('all-systems')}
          onExportWordCurrent={() => exportWord('current-system')}
          onExportWordAll={() => exportWord('all-systems')}
        />
      </div>

      <AluminumSystemTabs
        selectedSystemId={selectedSystem?.id ?? ''}
        rowCountsBySystem={rowCountsBySystem}
        onSelect={(systemId) => setPageState((current) => ({ ...current, selectedSystemId: systemId }))}
      />

      {selectedSystem && (
        <section className="aluminum-system-meta">
          <div>
            <span>Hệ: <strong>{selectedSystem.name}</strong></span>
            <span>Màu: <strong>{selectedSystem.color}</strong></span>
            <span>Số dòng: <strong>{rowViewModels.length}</strong></span>
            {selectedSystem.customerName && <span>Khách: <strong>{selectedSystem.customerName}</strong></span>}
          </div>
          <span>Dữ liệu lưu trong IndexedDB trên máy này.</span>
        </section>
      )}

      <AluminumSummary
        currentSystemName={selectedSystem?.name ?? ''}
        currentTotals={currentTotals}
        allTotals={allTotals}
        activeSystemCount={activeSystemCount}
        updatedAt={pageState.updatedAt}
      />
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

function AluminumActions({
  copyStatus,
  onClearCurrentSystem,
  onClearAll,
  onCopyTotal,
  onCopyCurrentSystem,
  onExportCsv,
  onPrintPdfCurrent,
  onPrintPdfAll,
  onExportWordCurrent,
  onExportWordAll,
}: {
  copyStatus: string | null;
  onClearCurrentSystem: () => void;
  onClearAll: () => void;
  onCopyTotal: () => void;
  onCopyCurrentSystem: () => void;
  onExportCsv: () => void;
  onPrintPdfCurrent: () => void;
  onPrintPdfAll: () => void;
  onExportWordCurrent: () => void;
  onExportWordAll: () => void;
}) {
  return (
    <div className="aluminum-actions">
      <button className="btn btn-primary" type="button" onClick={onExportWordCurrent}>
        <FileText size={16} /> Word hệ này
      </button>
      <button className="btn btn-primary" type="button" onClick={onExportWordAll}>
        <FileText size={16} /> Word tất cả
      </button>
      <button className="btn btn-ghost" type="button" onClick={onPrintPdfCurrent}>
        <Printer size={16} /> In hệ này
      </button>
      <button className="btn btn-ghost" type="button" onClick={onPrintPdfAll}>
        <Printer size={16} /> In tất cả
      </button>
      <button className="btn btn-ghost" type="button" onClick={onCopyTotal}>
        <ClipboardCopy size={16} /> Copy tổng
      </button>
      <button className="btn btn-ghost" type="button" onClick={onCopyCurrentSystem}>
        <ClipboardCopy size={16} /> Copy hệ
      </button>
      <button className="btn btn-ghost" type="button" onClick={onExportCsv}>
        <Download size={16} /> CSV
      </button>
      <button className="btn btn-ghost" type="button" onClick={onClearCurrentSystem}>
        <RotateCcw size={16} /> Xóa hệ
      </button>
      <button className="btn btn-danger" type="button" onClick={onClearAll}>
        <Trash2 size={16} /> Xóa hết
      </button>
      {copyStatus && <span className="aluminum-status">{copyStatus}</span>}
    </div>
  );
}

function AluminumSystemTabs({
  selectedSystemId,
  rowCountsBySystem,
  onSelect,
}: {
  selectedSystemId: string;
  rowCountsBySystem: Record<string, number>;
  onSelect: (systemId: string) => void;
}) {
  return (
    <div className="aluminum-tabs">
      {ALUMINUM_SYSTEMS.map((system) => {
        const isActive = system.id === selectedSystemId;
        const rowCount = rowCountsBySystem[system.id] ?? 0;

        return (
          <button
            key={system.id}
            type="button"
            className={isActive ? 'active' : ''}
            onClick={() => onSelect(system.id)}
          >
            <span>{system.name}</span>
            {rowCount > 0 && <strong>{rowCount}</strong>}
          </button>
        );
      })}
    </div>
  );
}

function AluminumSummary({
  currentSystemName,
  currentTotals,
  allTotals,
  activeSystemCount,
  updatedAt,
}: {
  currentSystemName: string;
  currentTotals: AluminumEstimatorTotals;
  allTotals: AluminumEstimatorTotals;
  activeSystemCount: number;
  updatedAt: string | null;
}) {
  return (
    <section className="aluminum-summary-grid">
      <div className="aluminum-summary-card">
        <div className="aluminum-card-heading">
          <span>{currentSystemName}</span>
          <strong>Hệ hiện tại</strong>
        </div>
        <div className="aluminum-metric-grid three">
          <Metric label="Tổng SL cây" value={formatEstimatorQuantity(currentTotals.totalQuantity)} />
          <Metric label="Tổng tạm tính hệ" value={`${formatEstimatorMoney(currentTotals.totalAmount)} đ`} highlight />
          <Metric label="Dòng có nhập" value={String(currentTotals.enteredRowCount)} />
        </div>
      </div>

      <div className="aluminum-summary-card wide">
        <div className="aluminum-card-heading">
          <span>Tất cả hệ</span>
          <strong>Đã lưu tạm: {formatUpdatedAt(updatedAt)}</strong>
        </div>
        <div className="aluminum-metric-grid four">
          <Metric label="Tổng SL cây tất cả hệ" value={formatEstimatorQuantity(allTotals.totalQuantity)} />
          <Metric label="Tổng tạm tính" value={`${formatEstimatorMoney(allTotals.totalAmount)} đ`} highlight />
          <Metric label="Số hệ có dữ liệu" value={String(activeSystemCount)} />
          <Metric label="Số dòng có nhập" value={String(allTotals.enteredRowCount)} />
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="aluminum-metric">
      <span>{label}</span>
      <strong className={highlight ? 'highlight' : ''}>{value}</strong>
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
  ) => (
    <input
      aria-label={label}
      value={value}
      inputMode="decimal"
      min={key === 'quantity' ? 0 : undefined}
      step={key === 'quantity' ? 1 : undefined}
      onFocus={() => {
        if (key === 'unitPrice' && value) onRowChange(rowId, { unitPrice: parseEstimatorNumber(value).toString() });
      }}
      onChange={(event) => onRowChange(rowId, { [key]: event.target.value })}
      onBlur={() => {
        if (key === 'unitPrice') onRowChange(rowId, { unitPrice: formatEstimatorInputNumber(value) });
      }}
      className={className}
      placeholder={key === 'quantity' ? '0' : '0 đ'}
    />
  );

  return (
    <div className="aluminum-table-wrap">
      <table className="aluminum-table">
        <thead>
          <tr>
            <th>STT</th>
            <th>Màu</th>
            <th>Hình</th>
            <th>Mã cây</th>
            <th>Mô tả / Tên cây</th>
            <th>SL cây</th>
            <th>Đơn giá/cây</th>
            <th>Thành tiền</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ source, input, calculated }) => {
            const image = getAluminumProfileImageDisplay(source.image);
            const isActive = calculated.quantity > 0 || parseEstimatorNumber(input.unitPrice) > 0;
            const lineTotalText = calculated.lineTotal > 0 ? `${formatEstimatorMoney(calculated.lineTotal)} đ` : '0 đ';

            return (
              <tr key={source.rowId} className={isActive ? 'active' : ''}>
                <td className="center">{source.stt}</td>
                <td className="center">{source.color}</td>
                <td>
                  <div className="aluminum-image-cell">
                    {image.kind === 'image' ? (
                      <img src={image.src} alt={`Hình ${source.code}`} />
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
