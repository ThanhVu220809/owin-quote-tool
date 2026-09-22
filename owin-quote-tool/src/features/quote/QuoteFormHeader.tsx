import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  FileDown,
  FileSpreadsheet,
  FileText,
  Layers,
  Loader2,
  Plus,
  Save,
} from 'lucide-react';
import { prefetchQuoteExportModules } from '@/features/export/prefetchExportModules';

/** Đầu form báo giá: nav bar phẳng kiểu iOS — back, tiêu đề + chip số liệu, nhóm thao tác pill. */
export function QuoteFormHeader({
  quoteId,
  loading,
  productCount,
  historyCount,
  itemCount,
  saving,
  onBack,
  onNew,
  onSave,
  onExportWord,
  onExportExcel,
  onExportPdf,
}: {
  quoteId: string | null;
  loading: boolean;
  productCount: number;
  historyCount: number;
  itemCount: number;
  saving: boolean;
  onBack: () => void;
  onNew: () => void;
  onSave: () => void;
  onExportWord: () => void;
  onExportExcel: () => void;
  onExportPdf: () => void;
}) {
  const [exportOpen, setExportOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const exportDisabled = itemCount === 0 || saving;

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
    <header className="quote-form-heading">
      <button className="quote-form-back" onClick={onBack} aria-label="Quay lại danh sách báo giá">
        <ChevronLeft size={20} />
      </button>
      <div className="quote-form-heading-text">
        <h1 className="quote-form-title">{quoteId ? 'Cập nhật báo giá' : 'Thiết kế & Lập báo giá'}</h1>
        <div className="quote-form-meta">
          {loading ? (
            <span className="quote-meta-chip is-loading">
              <Loader2 className="spin" size={13} aria-hidden="true" />
              Đang tải kho…
            </span>
          ) : (
            <>
              <span className="quote-meta-chip is-accent">
                <Layers size={13} aria-hidden="true" />
                {productCount} sản phẩm
              </span>
              <span className="quote-meta-chip">
                <FileText size={13} aria-hidden="true" />
                {historyCount} báo giá đã lưu
              </span>
            </>
          )}
        </div>
      </div>
      <div className="quote-form-actions no-print">
        <button className="btn quote-new-button" disabled={saving} onClick={onNew}>
          <Plus size={16} aria-hidden="true" />
          Báo giá mới
        </button>
        <button className="btn btn-primary quote-save-button" disabled={itemCount === 0 || saving} onClick={onSave}>
          {saving ? <Loader2 className="spin" size={16} aria-hidden="true" /> : <Save size={16} aria-hidden="true" />}
          {saving ? 'Đang lưu…' : 'Lưu'}
        </button>
        <div className="quote-export-dropdown" ref={exportMenuRef}>
          <button
            className="btn btn-ghost quote-export-trigger"
            type="button"
            disabled={exportDisabled}
            aria-haspopup="menu"
            aria-expanded={exportOpen}
            onPointerEnter={prefetchQuoteExportModules}
            onFocus={prefetchQuoteExportModules}
            onClick={() => setExportOpen((open) => !open)}
          >
            <FileDown size={16} aria-hidden="true" />
            Xuất
            <ChevronDown className="quote-export-chevron" size={15} aria-hidden="true" />
          </button>
          {exportOpen && (
            <div className="quote-export-menu" role="menu" aria-label="Định dạng xuất file">
              <button type="button" role="menuitem" onClick={() => runExport(onExportWord)}>
                <FileText size={16} aria-hidden="true" />
                <span><strong>Word</strong><small>Tài liệu chỉnh sửa</small></span>
              </button>
              <button type="button" role="menuitem" onClick={() => runExport(onExportExcel)}>
                <FileSpreadsheet size={16} aria-hidden="true" />
                <span><strong>Excel</strong><small>Bảng tính chi tiết</small></span>
              </button>
              <button type="button" role="menuitem" onClick={() => runExport(onExportPdf)}>
                <FileDown size={16} aria-hidden="true" />
                <span><strong>PDF</strong><small>Bản trình bày cố định</small></span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
