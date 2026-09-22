import { ChevronLeft, CircleCheck, CircleAlert, Loader2, Save, Tag } from 'lucide-react';

/** Trạng thái lưu tay của form sản phẩm (không auto-save). */
export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

const STATUS_TEXT: Record<Exclude<SaveStatus, 'error'>, string> = {
  idle: 'Nhập tên, rồi bấm Lưu',
  dirty: 'Có thay đổi chưa lưu',
  saving: 'Đang lưu…',
  saved: 'Đã lưu',
};

/** Class biến thể của chip trạng thái — không tính weight/màu inline. */
const STATUS_CHIP_CLASS: Record<SaveStatus, string> = {
  idle: '',
  dirty: ' is-accent',
  saving: ' is-accent',
  saved: ' is-saved',
  error: ' is-error',
};

function StatusIcon({ status }: { status: SaveStatus }) {
  if (status === 'saving') return <Loader2 className="spin" size={13} aria-hidden="true" />;
  if (status === 'saved') return <CircleCheck size={13} aria-hidden="true" />;
  if (status === 'error') return <CircleAlert size={13} aria-hidden="true" />;
  return null;
}

/**
 * Nav bar đầu form sản phẩm: phẳng kiểu iOS — back, tiêu đề + chip số liệu,
 * nhóm thao tác pill. Cùng bố cục với đầu form báo giá (QuoteFormHeader) nên
 * nút Lưu nằm ở đây, không còn thanh lưu riêng ở chân form.
 */
export function ProductFormHeader({
  editing,
  code,
  categoryLabel,
  status,
  error,
  saving,
  canSave,
  onBack,
  onSave,
}: {
  editing: boolean;
  code: string;
  categoryLabel: string;
  status: SaveStatus;
  error: string | null;
  saving: boolean;
  canSave: boolean;
  onBack: () => void;
  onSave: () => void;
}) {
  return (
    <header className="product-form-heading">
      <button className="product-form-back" onClick={onBack} aria-label="Quay lại danh sách sản phẩm">
        <ChevronLeft size={20} aria-hidden="true" />
      </button>
      <div className="product-form-heading-text">
        <h1 className="product-form-title">{editing ? 'Cập nhật sản phẩm' : 'Tạo sản phẩm mới'}</h1>
        <div className="product-form-meta">
          <span className="product-meta-chip is-accent">
            <Tag size={13} aria-hidden="true" />
            {code}
          </span>
          {categoryLabel && <span className="product-meta-chip">{categoryLabel}</span>}
          <span
            className={`product-meta-chip${STATUS_CHIP_CLASS[status]}`}
            role={status === 'error' ? 'alert' : 'status'}
            aria-live="polite"
          >
            <StatusIcon status={status} />
            {status === 'error' ? (
              <>
                Lỗi: {error}
                <button type="button" className="btn-link" onClick={onSave}>Thử lại</button>
              </>
            ) : (
              STATUS_TEXT[status]
            )}
          </span>
        </div>
      </div>
      <div className="product-form-actions no-print">
        <button type="button" className="btn product-cancel-button" onClick={onBack} disabled={saving}>
          Quay lại
        </button>
        <button
          type="button"
          className="btn btn-primary product-save-button"
          onClick={onSave}
          disabled={!canSave || saving}
        >
          {saving ? <Loader2 className="spin" size={16} aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
          {saving ? 'Đang lưu…' : 'Lưu'}
        </button>
      </div>
    </header>
  );
}
