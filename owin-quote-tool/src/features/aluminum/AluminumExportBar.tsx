import { FileText, Printer } from 'lucide-react';

/** Hero của tab: tiêu đề + chọn phạm vi xuất + nút Word / In PDF. */
export function AluminumExportBar({
  status,
  onExportWord,
  onPrintPdf,
}: {
  status: string | null;
  onExportWord: () => void;
  onPrintPdf: () => void;
}) {
  return (
    <div className="admin-page-heading aluminum-heading aluminum-hero aluminum-hero-compact no-print">
      <div className="aluminum-hero-text">
        <h1 className="app-title">Bảng tính nhôm</h1>
        <p className="app-subtitle aluminum-subtitle-full">
          Đơn giá theo màu được lưu · SL chỉ tạm (mất khi tải lại / rời trang) · xuất Word / In PDF.
        </p>
        <p className="app-subtitle aluminum-subtitle-short">
          Đơn giá lưu theo màu · SL tạm · Word / PDF
        </p>
      </div>
      <div className="aluminum-export-bar">
        <div className="aluminum-export-actions">
          <button className="btn btn-primary" type="button" onClick={onExportWord}>
            <FileText size={16} /> Word
          </button>
          <button className="btn btn-ghost" type="button" onClick={onPrintPdf}>
            <Printer size={16} /> In PDF
          </button>
        </div>
        {status && <span className="aluminum-status">{status}</span>}
      </div>
    </div>
  );
}
