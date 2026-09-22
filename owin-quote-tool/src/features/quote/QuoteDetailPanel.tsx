import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  Copy,
  FileDown,
  FileSpreadsheet,
  FileText,
  Pencil,
  Trash2,
} from 'lucide-react';
import type { ProductRecord, QuoteRecord } from '@/types/models';
import { formatVND } from '@/lib/format/currency';
import { ProductThumb } from '@/components/ProductThumb';
import { formatShortDate, statusLabel } from '@/features/quote/quoteFormat';
import { TotalLine } from '@/features/quote/QuoteFormPrimitives';
import { QuotePrintDocument } from '@/features/quote/QuotePrintDocument';
import { prefetchQuoteExportModules } from '@/features/export/prefetchExportModules';

/** Màn chi tiết một báo giá đã lưu: thông tin, tổng quan, hạng mục snapshot và bảng in ẩn. */
export function QuoteDetailPanel({
  quote,
  products,
  saving,
  message,
  error,
  onBack,
  onEdit,
  onDuplicate,
  onDelete,
  onExport,
  onExportExcel,
  onExportPdf,
}: {
  quote: QuoteRecord;
  products: ProductRecord[];
  saving: boolean;
  message: string;
  error: string;
  onBack: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onExport: () => void;
  onExportExcel: () => void;
  onExportPdf: () => void;
}) {
  const [exportOpen, setExportOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exportOpen) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      if (!exportMenuRef.current?.contains(event.target as Node)) setExportOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExportOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [exportOpen]);

  const runExport = (exportAction: () => void) => {
    setExportOpen(false);
    exportAction();
  };

  return (
    <section className="admin-page quote-detail-page">
      <header className="quote-detail-heading">
        <button
          className="quote-form-back"
          onClick={onBack}
          aria-label="Quay lại danh sách báo giá"
        >
          <ChevronLeft size={20} />
        </button>
        <div className="quote-detail-heading-copy">
          <h1 className="quote-detail-title">{quote.code}</h1>
          <div className="quote-detail-meta">
            <span>{quote.customerName || "Khách chưa đặt tên"}</span>
            <span aria-hidden="true">·</span>
            <span>{formatShortDate(quote.quoteDate || quote.createdAt)}</span>
            <span
              className={`quote-status-pill quote-status-${quote.status.toLowerCase()}`}
            >
              {statusLabel(quote.status)}
            </span>
          </div>
        </div>
        <div className="quote-detail-actions no-print">
          <button
            className="btn quote-detail-secondary-action"
            onClick={onDuplicate}
          >
            <Copy size={16} aria-hidden="true" />
            Nhân bản
          </button>
          <div className="quote-export-dropdown" ref={exportMenuRef}>
            <button
              className="btn quote-export-trigger quote-detail-export-trigger"
              type="button"
              disabled={saving}
              aria-haspopup="menu"
              aria-expanded={exportOpen}
              onPointerEnter={prefetchQuoteExportModules}
              onFocus={prefetchQuoteExportModules}
              onClick={() => setExportOpen((open) => !open)}
            >
              <FileDown size={16} aria-hidden="true" />
              Xuất
              <ChevronDown
                className="quote-export-chevron"
                size={15}
                aria-hidden="true"
              />
            </button>
            {exportOpen && (
              <div
                className="quote-export-menu"
                role="menu"
                aria-label="Định dạng xuất file"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => runExport(onExport)}
                >
                  <FileText size={16} aria-hidden="true" />
                  <span>
                    <strong>Word</strong>
                    <small>Tài liệu chỉnh sửa</small>
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => runExport(onExportExcel)}
                >
                  <FileSpreadsheet size={16} aria-hidden="true" />
                  <span>
                    <strong>Excel</strong>
                    <small>Bảng tính chi tiết</small>
                  </span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => runExport(onExportPdf)}
                >
                  <FileDown size={16} aria-hidden="true" />
                  <span>
                    <strong>PDF</strong>
                    <small>Bản trình bày cố định</small>
                  </span>
                </button>
              </div>
            )}
          </div>
          <button className="btn quote-detail-primary-action" onClick={onEdit}>
            <Pencil size={16} aria-hidden="true" />
            Chỉnh sửa
          </button>
          <button
            className="quote-detail-delete"
            onClick={onDelete}
            aria-label="Xóa báo giá"
            title="Xóa báo giá"
          >
            <Trash2 size={17} aria-hidden="true" />
          </button>
        </div>
      </header>

      {message && (
        <div
          className={`toast quote-detail-toast${error ? " is-error" : ""}`}
          role={error ? "alert" : "status"}
        >
          {message}
        </div>
      )}

      <div className="quote-detail-grid">
        <section className="quote-detail-section">
          <div className="quote-section-heading">
            <div className="quote-section-label">Thông tin khách hàng</div>
          </div>
          <div className="card quote-detail-customer-card">
            <div className="quote-detail-info">
              <div>
                <span>Khách hàng</span>
                <strong>{quote.customerName || "—"}</strong>
              </div>
              <div>
                <span>Số điện thoại</span>
                <strong>{quote.customerPhone || "—"}</strong>
              </div>
              <div>
                <span>Email</span>
                <strong>{quote.customerEmail || "—"}</strong>
              </div>
              <div className="quote-detail-address">
                <span>Địa chỉ</span>
                <strong>{quote.customerAddress || "—"}</strong>
              </div>
              <div>
                <span>Ngày báo giá</span>
                <strong>
                  {formatShortDate(quote.quoteDate || quote.createdAt)}
                </strong>
              </div>
            </div>
          </div>
        </section>

        <section className="quote-detail-section">
          <div className="quote-section-heading">
            <div className="quote-section-label">Tổng quan giá trị</div>
          </div>
          <div className="card quote-detail-summary-card">
            <div className="quote-detail-summary-lines">
              <TotalLine
                label="Sản phẩm chính"
                value={quote.subtotalProductVnd}
              />
              <TotalLine
                label="Phụ kiện lắp đặt"
                value={quote.subtotalAccessoryVnd}
              />
              <TotalLine label="Tổng trước làm tròn" value={quote.totalVnd} />
              <TotalLine
                label="Tổng sau làm tròn"
                value={quote.roundedTotalVnd}
              />
              <TotalLine label="Tạm ứng" value={quote.depositVnd} />
              <TotalLine
                label="Cần thanh toán"
                value={quote.balanceVnd}
                strong
              />
            </div>
          </div>
        </section>
      </div>

      <section className="quote-detail-section quote-detail-items-section">
        <div className="quote-section-heading">
          <div className="quote-section-label">Hạng mục báo giá</div>
          <span className="quote-detail-count">
            {quote.snapshot.items.length} hạng mục
          </span>
        </div>
        <div className="card quote-detail-items-card">
          <div className="quote-detail-items">
            {quote.snapshot.items.map((item, index) => (
              <article
                key={`${item.quoteItemCode}-${item.sortOrder}`}
                className="quote-detail-item"
              >
                <div className="quote-detail-item-index" aria-hidden="true">
                  {index + 1}
                </div>
                <div className="quote-detail-thumb">
                  <ProductThumb
                    fill
                    thumb
                    item={item}
                    products={products}
                    imagePath={item.coverImagePath || item.image || null}
                  />
                </div>
                <div className="quote-detail-item-copy">
                  <div className="quote-detail-item-heading">
                    <span className="quote-detail-item-code">
                      {item.quoteItemCode}
                    </span>
                    <h2 className="quote-detail-item-name">{item.itemName}</h2>
                  </div>
                  <div className="quote-detail-item-meta">
                    <span>
                      {item.category || item.groupName || "Chưa phân loại"}
                    </span>
                    <span>Sản phẩm {formatVND(item.productSubtotalVnd)}</span>
                    <span>Phụ kiện {formatVND(item.accessorySubtotalVnd)}</span>
                  </div>
                </div>
                <div className="quote-detail-item-total">
                  <span>Thành tiền</span>
                  <strong>{formatVND(item.itemTotalVnd)}</strong>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <QuotePrintDocument quote={quote.snapshot} products={products} />
    </section>
  );
}
