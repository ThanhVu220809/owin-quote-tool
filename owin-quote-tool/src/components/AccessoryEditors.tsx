import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import type { ProductUnit } from '@/types/models';
import { AutoSuggestInput } from './AutoSuggestInput';
import { CurrencyInput } from './CurrencyInput';
import { formatVND } from '@/utils/format';
import {
  addEmptyAccessoryDraft,
  calculateFixedAccessoryDraftTotal,
  type ExtraAccessoryDraft,
  type FixedAccessoryDraft,
  updateAccessoryDraftAtIndex,
  updateFixedAccessoryDraft,
} from '@/lib/quote/accessoryDrafts';

interface AccessoryEditorSuggestions {
  accessoryName: string[];
  packageName?: string[];
}

function moveRow<T>(rows: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= rows.length) return rows;
  const next = [...rows];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function reindexExtraAccessories(rows: ExtraAccessoryDraft[]): ExtraAccessoryDraft[] {
  return rows.map((item, sortOrder) => ({ ...item, sortOrder }));
}

export function FixedAccessoryPackageEditor({
  value,
  onChange,
  suggestions,
  title = 'Bộ phụ kiện cố định',
}: {
  value: FixedAccessoryDraft;
  onChange: (value: FixedAccessoryDraft) => void;
  suggestions: AccessoryEditorSuggestions;
  title?: string;
}) {
  const total = calculateFixedAccessoryDraftTotal(value);
  const patch = (next: Partial<FixedAccessoryDraft>) => onChange(updateFixedAccessoryDraft(value, next));

  return (
    <div className="editor-panel">
      <div className="toolbar editor-toolbar">
        <div className="section-label">{title}</div>
        <div className="spacer" />
        <button
          className="btn-link"
          type="button"
          onClick={() => patch({ items: [...value.items, { name: '', quantity: 0 }] })}
        >
          <Plus size={15} /> Thêm món
        </button>
      </div>

      <AutoSuggestInput
        label="Tên bộ phụ kiện"
        value={value.name}
        onChange={(name) => patch({ name })}
        suggestions={suggestions.packageName ?? suggestions.accessoryName}
        placeholder="Bộ phụ kiện cửa..."
      />

      <div className="accessory-items">
        {value.items.length === 0 ? (
          <div className="empty-line">Chưa có món phụ kiện nào trong bộ.</div>
        ) : (
          value.items.map((item, index) => (
            <div key={`${item.name}-${index}`} className="accessory-item-line">
              <span className="line-index">{index + 1}</span>
              <AutoSuggestInput
                label="Món"
                value={item.name}
                onChange={(name) => {
                  const items = [...value.items];
                  items[index] = { ...items[index], name };
                  patch({ items });
                }}
                suggestions={suggestions.accessoryName}
                placeholder="Tên phụ kiện..."
              />
              <div className="field">
                <label>SL</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={item.quantity}
                  onChange={(event) => {
                    const items = [...value.items];
                    items[index] = { ...items[index], quantity: Number(event.target.value) || 0 };
                    patch({ items });
                  }}
                />
              </div>
              <div className="row-action-group">
                <button
                  className="icon-btn"
                  type="button"
                  disabled={index === 0}
                  onClick={() => patch({ items: moveRow(value.items, index, -1) })}
                  aria-label="Đưa món phụ kiện lên"
                >
                  <ChevronUp size={15} />
                </button>
                <button
                  className="icon-btn"
                  type="button"
                  disabled={index === value.items.length - 1}
                  onClick={() => patch({ items: moveRow(value.items, index, 1) })}
                  aria-label="Đưa món phụ kiện xuống"
                >
                  <ChevronDown size={15} />
                </button>
                <button
                  className="icon-btn danger"
                  type="button"
                  onClick={() => patch({ items: value.items.filter((_, itemIndex) => itemIndex !== index) })}
                  aria-label="Xóa món phụ kiện"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="fixed-package-grid">
        <div className="field">
          <label>Số lượng bộ</label>
          <input
            className="input"
            type="number"
            min={1}
            value={value.packageQuantity || 1}
            onChange={(event) => patch({ packageQuantity: Number(event.target.value) || 1 })}
          />
        </div>
        <div className="field">
          <label>Đơn giá bộ</label>
          <CurrencyInput value={value.unitPrice} onChange={(unitPrice) => patch({ unitPrice })} />
        </div>
        <div className="field">
          <label>Thành tiền</label>
          <div className="readonly-money">{formatVND(total)}</div>
        </div>
      </div>
    </div>
  );
}

export function ExtraAccessoriesEditor({
  value,
  onChange,
  suggestions,
  title = 'Phụ kiện phát sinh',
}: {
  value: ExtraAccessoryDraft[];
  onChange: (value: ExtraAccessoryDraft[]) => void;
  suggestions: AccessoryEditorSuggestions;
  title?: string;
}) {
  const total = value.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="editor-panel">
      <div className="toolbar editor-toolbar">
        <div>
          <div className="section-label">{title}</div>
          <div className="product-sub">{value.length} dòng · {formatVND(total)}</div>
        </div>
        <div className="spacer" />
        <button className="btn-link" type="button" onClick={() => onChange(addEmptyAccessoryDraft(value))}>
          <Plus size={15} /> Thêm phụ kiện
        </button>
      </div>

      {value.length === 0 ? (
        <div className="empty-line">Chưa có phụ kiện phát sinh.</div>
      ) : (
        <div className="extra-accessory-table">
          <div className="extra-accessory-head">
            <span>Tên phụ kiện</span>
            <span>DV</span>
            <span>SL</span>
            <span>KL</span>
            <span>Đơn giá</span>
            <span>Thành tiền</span>
            <span />
          </div>
          {value.map((item, index) => (
            <div key={item.id} className="extra-accessory-line">
              <AutoSuggestInput
                label="Tên"
                value={item.name}
                onChange={(name) => onChange(updateAccessoryDraftAtIndex(value, index, { name }))}
                suggestions={suggestions.accessoryName}
                placeholder="Tên phụ kiện..."
              />
              <div className="field">
                <label>DV</label>
                <select
                  className="input"
                  value={item.unit}
                  onChange={(event) =>
                    onChange(updateAccessoryDraftAtIndex(value, index, { unit: event.target.value as ProductUnit }))
                  }
                >
                  <option value="BO">Bộ</option>
                  <option value="M2">m²</option>
                  <option value="METER">md</option>
                </select>
              </div>
              <div className="field">
                <label>SL</label>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(event) =>
                    onChange(updateAccessoryDraftAtIndex(value, index, { quantity: Number(event.target.value) || 1 }))
                  }
                />
              </div>
              <div className="field">
                <label>KL</label>
                {item.unit === 'BO' ? (
                  <div className="readonly-money muted-money">—</div>
                ) : (
                  <input
                    className="input"
                    type="number"
                    min={0}
                    step="0.001"
                    value={item.weight || ''}
                    onChange={(event) =>
                      onChange(updateAccessoryDraftAtIndex(value, index, { weight: Number(event.target.value) || 0 }))
                    }
                  />
                )}
              </div>
              <div className="field">
                <label>Đơn giá</label>
                <CurrencyInput
                  value={item.unitPrice}
                  onChange={(unitPrice) => onChange(updateAccessoryDraftAtIndex(value, index, { unitPrice }))}
                />
              </div>
              <div className="field">
                <label>Thành tiền</label>
                <div className="readonly-money">{formatVND(item.amount)}</div>
              </div>
              <div className="row-action-group">
                <button
                  className="icon-btn"
                  type="button"
                  disabled={index === 0}
                  onClick={() => onChange(reindexExtraAccessories(moveRow(value, index, -1)))}
                  aria-label="Đưa phụ kiện phát sinh lên"
                >
                  <ChevronUp size={15} />
                </button>
                <button
                  className="icon-btn"
                  type="button"
                  disabled={index === value.length - 1}
                  onClick={() => onChange(reindexExtraAccessories(moveRow(value, index, 1)))}
                  aria-label="Đưa phụ kiện phát sinh xuống"
                >
                  <ChevronDown size={15} />
                </button>
                <button
                  className="icon-btn danger"
                  type="button"
                  onClick={() => onChange(reindexExtraAccessories(value.filter((_, itemIndex) => itemIndex !== index)))}
                  aria-label="Xóa phụ kiện phát sinh"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
