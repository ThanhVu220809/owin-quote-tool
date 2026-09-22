import { formatEstimatorMoney } from '@/features/aluminum/estimator/estimator';
import type { AluminumPrintScope } from '@/features/aluminum/estimator/print/index';

export type AutosavePhase = 'loading' | 'idle' | 'pending' | 'saving' | 'saved' | 'error';

/** Nhãn trạng thái autosave; 'error' được vẽ riêng vì có nút thử lại. */
function autosaveLabelFor(phase: AutosavePhase, lastSavedAt: string | null): string | null {
  if (phase === 'loading') return 'Đang tải…';
  if (phase === 'idle') return 'Sẵn sàng';
  if (phase === 'pending') return 'Sắp lưu…';
  if (phase === 'saving') return 'Đang lưu…';
  if (phase === 'saved') return lastSavedAt ? 'Đã lưu' : 'Sẵn sàng';
  return null;
}

/** Dải tổng: tiền của hệ đang xem, tiền tất cả hệ và trạng thái lưu. */
export function AluminumTotalsStrip({
  systemName,
  systemTotalAmount,
  allTotalAmount,
  autosavePhase,
  lastSavedAt,
  exportScope,
  onExportScopeChange,
  onRetry,
}: {
  systemName: string;
  systemTotalAmount: number;
  allTotalAmount: number;
  autosavePhase: AutosavePhase;
  lastSavedAt: string | null;
  exportScope: AluminumPrintScope;
  onExportScopeChange: (scope: AluminumPrintScope) => void;
  onRetry: () => void;
}) {
  const autosaveLabel = autosaveLabelFor(autosavePhase, lastSavedAt);

  return (
    <div className="aluminum-totals-strip">
      <button
        type="button"
        className={`aluminum-total-chip${exportScope === 'current-system' ? ' is-selected' : ''}`}
        aria-pressed={exportScope === 'current-system'}
        onClick={() => onExportScopeChange('current-system')}
        title="Xuất hệ đang chọn"
      >
        {/* Tên hệ đã tự mang tiền tố ("Hệ chấn song"), và có mục không phải hệ
            ("Nội thất") — nên không ghép thêm chữ "Hệ" ở đây. */}
        <span>Đang chọn: {systemName}</span>
        <strong>{formatEstimatorMoney(systemTotalAmount)} đ</strong>
      </button>
      <button
        type="button"
        className={`aluminum-total-chip aluminum-total-chip-all${exportScope === 'all-systems' ? ' is-selected' : ''}`}
        aria-pressed={exportScope === 'all-systems'}
        onClick={() => onExportScopeChange('all-systems')}
        title="Xuất tất cả hệ"
      >
        <span>Tổng cộng</span>
        <strong>{formatEstimatorMoney(allTotalAmount)} đ</strong>
      </button>
      <span className={`aluminum-autosave aluminum-autosave-${autosavePhase}`}>
        {autosavePhase === 'error' ? (
          <>
            Lỗi lưu.{' '}
            <button
              type="button"
              className="btn-link"
              onClick={onRetry}
            >
              Thử lại
            </button>
          </>
        ) : (
          autosaveLabel
        )}
      </span>
    </div>
  );
}
