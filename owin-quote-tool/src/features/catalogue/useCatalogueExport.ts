import { useCallback, useEffect, useState } from 'react';
import type { ProductRecord } from '@/types/models';
import { prefetchCatalogueExportModules } from '@/features/export/prefetchExportModules';
import {
  EXPORT_IMAGE_MAX_EDGE,
  EXPORT_IMAGE_QUALITY,
  prewarmExportImages,
} from '@/features/export/exportImage';

/**
 * Ba nút xuất của tab Bảng giá. Tách khỏi view để view chỉ còn state hiển thị;
 * thông báo lỗi và luồng gọi module xuất giữ nguyên như bản cũ.
 */
export function useCatalogueExport(shownRecords: ProductRecord[]) {
  const [exporting, setExporting] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportError, setExportError] = useState('');

  /**
   * Người dùng vừa chạm vào cụm nút xuất: nạp trước mã xuất VÀ toàn bộ ảnh.
   *
   * Với bảng giá vài trăm dòng, gần như toàn bộ thời gian xuất là chờ tải ảnh.
   * Rê chuột tới nút đã sớm hơn lúc bấm cả giây, nên chuyển hẳn quãng đó sang
   * đây thì lúc bấm chỉ còn phần dựng file. Ba nút Word/Excel/PDF dùng chung
   * đúng một bản ảnh nên chỉ cần nạp một lần.
   */
  const prewarmExports = useCallback(() => {
    prefetchCatalogueExportModules();
    prewarmExportImages(
      shownRecords.map((product) => product.coverImagePath),
      { maxEdge: EXPORT_IMAGE_MAX_EDGE, quality: EXPORT_IMAGE_QUALITY },
    );
  }, [shownRecords]);

  /**
   * Nạp trước ngay khi tab rảnh tay, không đợi rê chuột.
   *
   * Rê chuột tới nút thường chỉ sớm hơn cú bấm vài trăm ms — không đủ cho vài
   * trăm tấm ảnh. Bắt đầu từ lúc danh sách đã hiện xong thì tới lúc bấm, ảnh đã
   * nằm sẵn trong bộ nhớ và lần xuất chỉ còn phần dựng file.
   *
   * `requestIdleCallback` để việc này xếp sau phần render danh sách; lượt tải
   * cũng chỉ là các bản ~20KB, nhẹ hơn hẳn ảnh mà tab đang hiển thị.
   */
  useEffect(() => {
    if (shownRecords.length === 0) return;
    const idle = window.requestIdleCallback;
    if (typeof idle !== 'function') {
      const timer = window.setTimeout(prewarmExports, 1500);
      return () => window.clearTimeout(timer);
    }
    const handle = idle(prewarmExports, { timeout: 3000 });
    return () => window.cancelIdleCallback(handle);
  }, [prewarmExports, shownRecords.length]);

  const exportWord = async () => {
    setExporting(true);
    setExportError('');
    try {
      const { exportCatalogueWord } = await import('@/features/export/wordExport');
      await exportCatalogueWord(shownRecords);
    } catch {
      setExportError('Không thể xuất bảng giá Word. Vui lòng kiểm tra mạng và thử lại.');
    } finally {
      setExporting(false);
    }
  };

  const exportExcel = async () => {
    setExportingExcel(true);
    setExportError('');
    try {
      const { exportCatalogueExcel } = await import('@/features/export/catalogueExcelExport');
      await exportCatalogueExcel(shownRecords);
    } catch {
      setExportError('Không thể xuất bảng giá Excel. Vui lòng thử lại.');
    } finally {
      setExportingExcel(false);
    }
  };

  const exportPdf = async () => {
    setExportingPdf(true);
    setExportError('');
    try {
      // File download only — never window.print / browser "Save as PDF".
      const { exportCataloguePdf } = await import('@/features/export/cataloguePdfExport');
      const fileName = await exportCataloguePdf(shownRecords);
      if (!fileName) throw new Error('PDF rỗng');
    } catch (error) {
      const detail = error instanceof Error && error.message ? `: ${error.message}` : '';
      setExportError(`Không thể xuất bảng giá PDF${detail}. Dùng nút PDF (không in trình duyệt).`);
    } finally {
      setExportingPdf(false);
    }
  };

  return {
    exporting,
    exportingExcel,
    exportingPdf,
    exportError,
    exportWord,
    exportExcel,
    exportPdf,
    prewarmExports,
  };
}
