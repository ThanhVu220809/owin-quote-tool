import { LoaderCircle } from 'lucide-react';
import { AutoSuggestInput } from '@/components/AutoSuggestInput';
import { formatVND } from '@/lib/format/currency';

/** Các mảnh UI nhỏ dùng lại giữa form, màn chi tiết và thẻ hạng mục của tab Báo giá. */

/** Trạng thái lưu tay của form báo giá (không auto-save). */
export type SaveUiState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export function SaveFeedback({
  state,
  error,
  onRetry,
}: {
  state: SaveUiState;
  error: string;
  onRetry: () => void;
}) {
  if (state === 'idle') {
    return <div className="product-sub">Thêm hạng mục, rồi bấm «Lưu báo giá».</div>;
  }
  if (state === 'pending') {
    return <div className="product-sub">Có thay đổi chưa lưu — bấm «Lưu báo giá».</div>;
  }
  if (state === 'saving') {
    return (
      <div className="product-sub">
        <LoaderCircle className="spin" size={14} style={{ verticalAlign: '-2px' }} /> Đang lưu lên Supabase…
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div className="product-sub" style={{ color: 'var(--ios-red)' }} role="alert">
        {error || 'Không thể lưu.'}{' '}
        <button type="button" className="btn btn-ghost" onClick={onRetry}>Thử lưu lại</button>
      </div>
    );
  }
  return <div className="product-sub" style={{ color: 'var(--ios-green)' }}>Đã lưu trên Supabase.</div>;
}

export function Field({
  label,
  value,
  onChange,
  suggestions = [],
  fieldKey,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suggestions?: string[];
  fieldKey?: string;
  required?: boolean;
}) {
  if (suggestions.length > 0) {
    return (
      <AutoSuggestInput
        label={label}
        fieldKey={fieldKey || label}
        value={value}
        onChange={onChange}
        suggestions={suggestions}
        required={required}
      />
    );
  }
  return (
    <div className="field">
      <label>{label}{required && <span className="required-mark">*</span>}</label>
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function TotalLine({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`switch-row quote-total-line${strong ? ' is-strong' : ''}`}>
      <span className="quote-total-label">{label}</span>
      <span className="quote-total-value">{formatVND(value)}</span>
    </div>
  );
}

export function QuoteSummaryMetric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={strong ? 'summary-metric summary-metric-strong' : 'summary-metric'}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
