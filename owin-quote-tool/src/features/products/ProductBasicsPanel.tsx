import type { ProductUnit } from '@/types/models';
import { AutoSuggestInput } from '@/components/AutoSuggestInput';
import { CurrencyInput } from '@/components/CurrencyInput';
import { ImageDropzone } from '@/components/ImageDropzone';
import { SegmentedControl } from '@/components/SegmentedControl';
import { SmartNumberInput } from '@/components/SmartNumberInput';
import { parseSmartNumber } from '@/lib/format/smartNumber';
import type { ProductSuggestions } from '@/features/products/productSuggestions';

const UNIT_OPTIONS: { label: string; value: ProductUnit }[] = [
  { label: 'm²', value: 'M2' },
  { label: 'Bộ', value: 'BO' },
  { label: 'md', value: 'METER' },
];

export interface ProductBasics {
  name: string;
  category: string;
  unit: ProductUnit;
  unitPriceVnd: number;
  widthM: string;
  heightM: string;
  coverImagePath: string | null;
}

/** Ảnh bìa + thông tin cơ bản (nhóm, tên, đơn vị, kích thước mẫu, đơn giá). */
export function ProductBasicsPanel({
  value,
  onChange,
  suggestions,
}: {
  value: ProductBasics;
  onChange: (patch: Partial<ProductBasics>) => void;
  suggestions: ProductSuggestions;
}) {
  return (
    <div className="product-editor-top">
      <div className="product-image-panel">
        <label>Hình ảnh</label>
        <ImageDropzone
          imagePath={value.coverImagePath}
          onImageStored={(path) => onChange({ coverImagePath: path })}
          pasteScope="form"
        />
      </div>

      <div className="product-basic-panel">
        <div className="product-basic-grid">
          <AutoSuggestInput
            label="Nhóm sản phẩm"
            fieldKey="category"
            value={value.category}
            onChange={(category) => onChange({ category })}
            suggestions={suggestions.category}
            placeholder="Cửa Chính"
          />
          <AutoSuggestInput
            label="Tên sản phẩm"
            fieldKey="product_name"
            value={value.name}
            onChange={(name) => onChange({ name })}
            suggestions={suggestions.productName}
            placeholder="Cửa đi mở quay 2 cánh"
          />
          <div className="field">
            <label>Đơn vị tính</label>
            <SegmentedControl
              options={UNIT_OPTIONS}
              value={value.unit}
              onChange={(unit) => onChange({ unit })}
            />
          </div>
          <div className="field">
            <label>Rộng mẫu (m)</label>
            <SmartNumberInput
              className="input"
              mode="decimal"
              decimals={3}
              min={0}
              value={parseSmartNumber(value.widthM, { mode: 'decimal' })}
              onChange={(n) => onChange({ widthM: n === 0 ? '' : String(n) })}
              placeholder="1.80"
            />
          </div>
          <div className="field">
            <label>Cao mẫu (m)</label>
            <SmartNumberInput
              className="input"
              mode="decimal"
              decimals={3}
              min={0}
              value={parseSmartNumber(value.heightM, { mode: 'decimal' })}
              onChange={(n) => onChange({ heightM: n === 0 ? '' : String(n) })}
              placeholder="2.20"
            />
          </div>
          <div className="field">
            <label>Đơn giá</label>
            <CurrencyInput
              value={value.unitPriceVnd}
              onChange={(unitPriceVnd) => onChange({ unitPriceVnd })}
              placeholder="0"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
