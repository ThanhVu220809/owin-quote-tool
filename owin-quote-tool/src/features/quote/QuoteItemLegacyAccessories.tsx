import { Plus, Trash2 } from 'lucide-react';
import type { AccessoryInput, QuoteItemInput } from '@/types/models';
import { AutoSuggestInput } from '@/components/AutoSuggestInput';
import { CurrencyInput } from '@/components/CurrencyInput';
import { SmartNumberInput } from '@/components/SmartNumberInput';

/** Phụ kiện kiểu cũ của hạng mục — chỉ hiện khi hạng mục chưa dùng bộ phụ kiện. */
export function QuoteItemLegacyAccessories({
  item,
  suggestions,
  onUpdate,
  onAccessory,
  onAddAccessory,
}: {
  item: QuoteItemInput;
  suggestions: Record<string, string[]>;
  onUpdate: (patch: Partial<QuoteItemInput>) => void;
  onAccessory: (accIndex: number, patch: Partial<AccessoryInput>) => void;
  onAddAccessory: () => void;
}) {
  return (
    <>
      <div className="toolbar" style={{ margin: '10px 0 6px' }}>
        <div className="section-label" style={{ margin: 0 }}>Phụ kiện đi kèm cũ</div>
        <div className="spacer" />
        <button className="icon-btn" onClick={onAddAccessory} aria-label="Thêm phụ kiện"><Plus size={16} /></button>
      </div>
      {item.accessories.map((accessory, accIndex) => (
        <div key={accIndex} className="legacy-accessory-row">
          <AutoSuggestInput
            label="Tên"
            value={accessory.name}
            onChange={(name) => onAccessory(accIndex, { name })}
            suggestions={suggestions.accessory_name ?? []}
            placeholder="Tên phụ kiện"
          />
          <div className="field">
            <label>SL/Bộ</label>
            <SmartNumberInput
              className="input"
              mode="decimal"
              decimals={3}
              min={0}
              value={accessory.quantityPerSet}
              onChange={(quantityPerSet) => onAccessory(accIndex, { quantityPerSet })}
              placeholder="0"
            />
          </div>
          <div className="field">
            <label>Đơn giá</label>
            <CurrencyInput value={accessory.unitPriceVnd || 0} onChange={(unitPriceVnd) => onAccessory(accIndex, { unitPriceVnd })} />
          </div>
          <div className="field">
            <label>Trạng thái</label>
            <select className="input" value={accessory.isEnabled === false ? 'off' : 'on'} onChange={(e) => onAccessory(accIndex, { isEnabled: e.target.value === 'on' })}>
              <option value="on">Bật</option>
              <option value="off">Tắt</option>
            </select>
          </div>
          <button className="icon-btn danger" onClick={() => onUpdate({ accessories: item.accessories.filter((_, i) => i !== accIndex) })} aria-label="Xóa phụ kiện"><Trash2 size={16} /></button>
        </div>
      ))}
    </>
  );
}
