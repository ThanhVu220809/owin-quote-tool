/**
 * PDF export entry points — always download a .pdf file (never window.print).
 * Catalogue + quote both use jsPDF with shared Vietnamese fonts.
 */

import type { CalculatedQuote, ProductRecord } from '@/types/models';

/** @deprecated Prefer exportQuotePdf; kept for older imports. */
export async function exportQuotePDF(
  quote?: CalculatedQuote,
  quoteCode?: string,
  products: ProductRecord[] = [],
): Promise<string> {
  if (!quote || !quoteCode) {
    throw new Error('Xuất PDF báo giá cần dữ liệu quote — không còn dùng in trình duyệt.');
  }
  const { exportQuotePdf } = await import('@/features/export/quotePdfExport');
  return exportQuotePdf(quote, quoteCode, products);
}

/** @deprecated Print preview removed — use catalogue PDF file export. */
export async function printPreviewDocument(): Promise<void> {
  throw new Error('In trình duyệt đã tắt. Dùng nút PDF để tải file .pdf.');
}
