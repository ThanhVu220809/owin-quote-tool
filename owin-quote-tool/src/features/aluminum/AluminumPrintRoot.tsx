import type { AluminumPrintModel } from '@/features/aluminum/estimator/print/index';
import { ALUMINUM_PRINT_CSS, buildAluminumPrintHtml } from '@/features/aluminum/estimator/export';

/**
 * Vùng in của tab (ẩn trên màn hình, chỉ hiện khi in).
 * Giữ nguyên 100% cấu trúc thẻ + thẻ <style> nội tuyến: khối @media print nhắm
 * theo #aluminum-estimator-print-root nên không được đưa sang aluminum.css, và
 * ALUMINUM_PRINT_CSS dùng chung với xuất Word.
 */
export function AluminumPrintRoot({ model }: { model: AluminumPrintModel }) {
  return (
    <section className="aluminum-print-root" id="aluminum-estimator-print-root">
      <style>{`
          @media print {
            body * { visibility: hidden; }
            #aluminum-estimator-print-root,
            #aluminum-estimator-print-root * { visibility: visible; }
            #aluminum-estimator-print-root {
              display: block;
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
              background: #ffffff;
            }
            ${ALUMINUM_PRINT_CSS}
          }
        `}</style>
      <div
        dangerouslySetInnerHTML={{
          __html: buildAluminumPrintHtml(
            model,
            typeof window === 'undefined' ? undefined : window.location.origin,
          ),
        }}
      />
    </section>
  );
}
