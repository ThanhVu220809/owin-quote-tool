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

  const images = Array.from(document.querySelectorAll<HTMLImageElement>('.preview-doc img'));
  await Promise.race([
    Promise.all(images.map((image) => image.complete ? Promise.resolve() : new Promise<void>((resolve) => {
      image.addEventListener('load', () => resolve(), { once: true });
      image.addEventListener('error', () => resolve(), { once: true });
    }))),
    new Promise<void>((resolve) => window.setTimeout(resolve, 5000)),
  ]);
  setTimeout(() => {
    window.print();
    // Dự phòng nếu trình duyệt không bắn afterprint; để lâu để Chrome kịp dựng preview.
    setTimeout(cleanup, 30000);
  }, 50);
}

export function exportQuotePDF(): void {
  void printPreviewDocument();
}
