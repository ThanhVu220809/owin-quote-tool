/**
 * XUẤT PDF — in trực tiếp khối preview A4 (window.print → "Save as PDF").
 * App thuần client nên không dùng được LibreOffice/Word; in-to-PDF cho fidelity cao nhất,
 * chữ chọn được, không cần dependency. CSS in nằm trong owin-theme.css (@media print).
 *
 * Quy ước: thêm class 'printing-quote' lên <body>; CSS chỉ hiện .preview-doc khi in.
 */
export async function printPreviewDocument(): Promise<void> {
  const body = document.body;
  body.classList.add('printing-quote');

  const cleanup = () => {
    body.classList.remove('printing-quote');
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);

  const startedAt = Date.now();
  while (Date.now() - startedAt < 5_000) {
    const images = Array.from(document.querySelectorAll<HTMLImageElement>('.preview-doc img'));
    const ready = images.every((image) => image.dataset.imageLoading !== 'true' && image.complete);
    if (ready) break;
    await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
  }

  await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
  try {
    window.print();
  } catch (error) {
    cleanup();
    throw error;
  }
  // Dự phòng nếu trình duyệt không bắn afterprint; để lâu để Chrome kịp dựng preview.
  window.setTimeout(cleanup, 30_000);
}

export function exportQuotePDF(): Promise<void> {
  return printPreviewDocument();
}
