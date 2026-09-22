import { Plus, Trash2 } from 'lucide-react';
import type { DimensionInput, ProductUnit, QuoteItemInput } from '@/types/models';
import type { calculateQuote } from '@/lib/quote/quoteCalculator';
import { formatVND } from '@/lib/format/currency';
import { CurrencyInput } from '@/components/CurrencyInput';
import { SmartNumberInput } from '@/components/SmartNumberInput';

/** Bảng kích thước của một hạng mục: ĐVT / Rộng / Cao / SL / KL / Đơn giá / Thành tiền. */
export function QuoteItemDimensionTable({
  item,
  calculated,
  onUpdate,
  onDimension,
  onAddDimension,
}: {
  item: QuoteItemInput;
  calculated: ReturnType<typeof calculateQuote>['items'][number] | undefined;
  onUpdate: (patch: Partial<QuoteItemInput>) => void;
  onDimension: (lineIndex: number, patch: Partial<DimensionInput>) => void;
  onAddDimension: () => void;
}) {
  return (
    <div className="quote-card-section">
      <div className="toolbar" style={{ margin: '0 0 8px' }}>
        <div className="section-label" style={{ margin: 0 }}>Kích thước</div>
        <div className="spacer" />
        <button className="icon-btn" onClick={onAddDimension} aria-label="Thêm kích thước"><Plus size={16} /></button>
    </div>
    <div className="quote-lines-editor">
      <div className="quote-lines-head">
        <div className="quote-lines-head-measure">
          <span>Đơn vị</span>
          <span>Rộng</span>
          <span>Cao</span>
          <span>SL</span>
          <span>KL</span>
        </div>
        <div className="quote-lines-head-pricing">
          <span>Đơn giá</span>
          <span>Thành tiền</span>
          <span />
        </div>
      </div>
      {item.dimensions.map((line, lineIndex) => {
        const calculatedLine = calculated?.dimensions[lineIndex];
        return (
          <div key={lineIndex} className="quote-line-row">
            <div className="quote-line-measure-grid">
              <div className="quote-line-field" data-label="Đơn vị">
                <select className="input" value={line.unit || item.unit} onChange={(e) => onDimension(lineIndex, { unit: e.target.value as ProductUnit })}>
                  <option value="M2">m²</option>
                  <option value="BO">Bộ</option>
                  <option value="METER">md</option>
                </select>
              </div>
              <div className="quote-line-field" data-label="Rộng">
                <SmartNumberInput
                  className="input"
                  mode="decimal"
                  decimals={3}
                  min={0}
                  value={line.widthM}
                  onChange={(widthM) => onDimension(lineIndex, { widthM: widthM === 0 ? null : widthM })}
                  placeholder="Rộng"
                />
              </div>
              <div className="quote-line-field" data-label="Cao">
                <SmartNumberInput
                  className="input"
                  mode="decimal"
                  decimals={3}
                  min={0}
                  value={line.heightM}
                  onChange={(heightM) => onDimension(lineIndex, { heightM: heightM === 0 ? null : heightM })}
                  placeholder="Cao"
                />
              </div>
              <div className="quote-line-field" data-label="SL">
                <SmartNumberInput
                  className="input"
                  mode="int"
                  min={0}
                  value={line.quantity}
                  onChange={(quantity) => onDimension(lineIndex, { quantity })}
                  placeholder="SL"
                />
              </div>
              <div className="quote-line-field quote-line-field-calculated" data-label="KL">
                <div className="readonly-money muted-money">{calculatedLine?.calculatedQty?.toFixed(3) ?? '0.000'}</div>
              </div>
            </div>
            <div className="quote-line-pricing-grid">
              <div className="quote-line-field quote-line-field-wide" data-label="Đơn giá">
                <CurrencyInput value={Number(line.unitPriceVnd ?? item.unitPriceVnd ?? 0)} onChange={(unitPriceVnd) => onDimension(lineIndex, { unitPriceVnd })} placeholder="Đơn giá" />
              </div>
              <div className="quote-line-field quote-line-field-total" data-label="Thành tiền">
                <div className="readonly-money">{formatVND(calculatedLine?.lineTotalVnd ?? 0)}</div>
              </div>
              <div className="quote-line-field quote-line-field-action" data-label="">
                <button className="icon-btn danger" onClick={() => onUpdate({ dimensions: item.dimensions.filter((_, i) => i !== lineIndex) })} aria-label="Xóa kích thước"><Trash2 size={16} /></button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
    </div>
  );
}
