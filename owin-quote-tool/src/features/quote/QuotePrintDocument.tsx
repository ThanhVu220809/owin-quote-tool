import type { ProductRecord } from '@/types/models';
import type { calculateQuote } from '@/lib/quote/quoteCalculator';
import { formatVND } from '@/lib/format/currency';
import { ProductThumb } from '@/components/ProductThumb';
import { unitLabel } from '@/features/quote/quoteFormat';
import { buildQuotePrintAccessoryRows } from '@/features/quote/quotePrintModel';

/** Bảng in ẩn của báo giá (nguồn cho đường in / xuất PDF) — quote.css đẩy nó ra ngoài màn hình. */
export function QuotePrintDocument({ quote, products }: { quote: ReturnType<typeof calculateQuote>; products: ProductRecord[] }) {
  const today = new Date(quote.quoteDate || new Date());
  return (
    <div className="preview-doc quote-print-doc">
      <div className="doc-title">BÁO GIÁ CÔNG TRÌNH</div>
      <div className="cust">
        <div><b>Khách hàng:</b> {quote.customerName || '—'}</div>
        <div><b>Địa chỉ:</b> {quote.customerAddress || '—'}</div>
        <div><b>SĐT:</b> {quote.customerPhone || '—'} &nbsp; <b>Email:</b> {quote.customerEmail || '—'}</div>
        <div className="doc-date">
          Ngày {today.getDate()} tháng {today.getMonth() + 1} năm {today.getFullYear()}
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>STT</th>
            <th>Mã SP</th>
            <th>Hình ảnh</th>
            <th>Mô tả chi tiết</th>
            <th>DV</th>
            <th>Rộng</th>
            <th>Cao</th>
            <th>SL</th>
            <th>KL</th>
            <th>Đơn giá</th>
            <th>Thành tiền</th>
          </tr>
        </thead>
        {quote.items.map((item, index) => {
          const visibleAccessories = buildQuotePrintAccessoryRows(item);
          const rowSpan = Math.max(1, item.dimensions.length + visibleAccessories.length);
          return (
            <tbody key={`${item.productCode}-${index}`} className="quote-item-block">
              {item.dimensions.map((line, lineIndex) => (
                <tr key={`d-${lineIndex}`}>
                  {lineIndex === 0 && <td rowSpan={rowSpan}>{index + 1}</td>}
                  {lineIndex === 0 && <td rowSpan={rowSpan}>{item.quoteItemCode || item.productCode}</td>}
                  {lineIndex === 0 && (
                    <td rowSpan={rowSpan} className="quote-image-cell">
                      <ProductThumb item={item} products={products} imagePath={item.image || item.coverImagePath} fill />
                    </td>
                  )}
                  {lineIndex === 0 && (
                    <td rowSpan={Math.max(1, item.dimensions.length)} className="description-cell">
                      {[
                        item.itemName,
                        ...(item.specs || [])
                          .filter((spec) => String(spec.key || '').trim())
                          .map((spec) => {
                            const key = String(spec.key).trim();
                            const value = String(spec.value || '').trim();
                            return value ? `- ${key}: ${value}` : `- ${key}`;
                          }),
                      ]
                        .filter(Boolean)
                        .map((lineText, i) => <div key={i}>{lineText}</div>)}
                    </td>
                  )}
                  <td>{unitLabel(line.unit)}</td>
                  <td>{line.unit === 'BO' ? '—' : line.widthM ?? ''}</td>
                  <td>{line.unit === 'BO' ? '—' : line.heightM ?? ''}</td>
                  <td>{line.quantity}</td>
                  <td>{line.calculatedQty}</td>
                  <td className="num">{formatVND(line.unitPriceVnd)}</td>
                  <td className="num">{formatVND(line.lineTotalVnd)}</td>
                </tr>
              ))}
              {visibleAccessories.map((accessory, accIndex) => (
                <tr key={`a-${accIndex}`} className="pk-row">
                  <td className="description-cell">
                    {accessory.descriptionLines.map((lineText, i) => <div key={i}>{lineText}</div>)}
                  </td>
                  <td>{accessory.unit}</td>
                  <td>—</td>
                  <td>—</td>
                  <td>{accessory.quantity || '—'}</td>
                  <td>{accessory.weight || '—'}</td>
                  <td className="num">{formatVND(accessory.unitPriceVnd)}</td>
                  <td className="num">{formatVND(accessory.amountVnd)}</td>
                </tr>
              ))}
            </tbody>
          );
        })}
      </table>
      <div className="totals">
        <div><b>Tổng cộng:</b> {formatVND(quote.summary.totalVnd)}</div>
        <div>Làm tròn: {formatVND(quote.summary.roundedTotalVnd)}</div>
        <div>Tạm ứng: {formatVND(quote.summary.depositVnd)}</div>
        <div><b>Cần thanh toán:</b> {formatVND(quote.summary.balanceVnd)}</div>
      </div>
    </div>
  );
}
