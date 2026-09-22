/**
 * Nạp sẵn mã xuất file khi người dùng chạm tới nút/menu xuất.
 *
 * Ba gói xuất nằm ở chunk riêng (ExcelJS ~900KB, jsPDF ~400KB, template Word)
 * nên lần bấm đầu tiên phải tải mã về rồi mới bắt đầu dựng file — đó là quãng
 * chờ "bấm xong mãi chưa thấy hộp tải về". Hover / mở menu là đủ sớm để tải
 * xong trước khi bấm. Chỉ tải mã, không chạy gì.
 */

const started = new Set<string>();

function once(key: string, load: () => Promise<unknown>): void {
  if (started.has(key)) return;
  started.add(key);
  void load().catch(() => started.delete(key));
}

function prefetchPdfFonts(): void {
  once('pdf-fonts', async () => {
    const { preloadVietnamesePdfFonts } = await import('@/features/export/pdfFonts');
    preloadVietnamesePdfFonts();
  });
}

/** Nút xuất của tab Báo giá. */
export function prefetchQuoteExportModules(): void {
  once('word', () => import('@/features/export/wordExport'));
  once('quote-excel', () => import('@/features/export/quoteExcelExport'));
  once('quote-pdf', () => import('@/features/export/quotePdfExport'));
  prefetchPdfFonts();
}

/** Nút xuất của tab Bảng giá. */
export function prefetchCatalogueExportModules(): void {
  once('word', () => import('@/features/export/wordExport'));
  once('catalogue-excel', () => import('@/features/export/catalogueExcelExport'));
  once('catalogue-pdf', () => import('@/features/export/cataloguePdfExport'));
  prefetchPdfFonts();
}
