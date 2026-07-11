import { Plus, Trash2 } from 'lucide-react';
import type { ProductUnit } from '@/types/models';
import { AutoSuggestInput } from './AutoSuggestInput';
import { CurrencyInput } from './CurrencyInput';
import { DragHandle, reorderList, useDragReorder } from './DragReorder';
import { formatVND } from '@/utils/format';
import {
  addEmptyAccessoryDraft,
  addEmptyFixedAccessoryItem,
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
  const { handleProps, rowProps } = useDragReorder((from, to) =>
    patch({ items: reorderList(value.items, from, to) }),
  );

  return (
    <div className="editor-panel accessory-editor-panel">
      <div className="toolbar editor-toolbar">
        <div className="section-label">{title}</div>
        <div className="spacer" />
        <button
          className="btn-link"
          type="button"
          onClick={() => onChange(addEmptyFixedAccessoryItem(value))}
        >
          <Plus size={15} /> Thêm món
        </button>
      </div>

      <AutoSuggestInput
        label="Tên bộ phụ kiện"
        fieldKey="accessory_package_name"
        value={value.name}
        onChange={(name) => patch({ name })}
        suggestions={suggestions.packageName ?? []}
        placeholder="Gợi ý tên bộ (không lẫn món phụ kiện)…"
      />

      <div className="accessory-items">
        {value.items.length === 0 ? (
          <div className="empty-line">Chưa có món phụ kiện nào trong bộ.</div>
        ) : (
          value.items.map((item, index) => (
            <div key={item.id} className="accessory-item-line" data-row-id={item.id} {...rowProps(index)}>
              <DragHandle {...handleProps(index)} label="Kéo để đổi thứ tự món" />
              <span className="line-index">{index + 1}</span>
              <AutoSuggestInput
                label="Tên món trong bộ"
                fieldKey="fixed_accessory_item"
                value={item.name}
                onChange={(name) => {
                  const items = value.items.map((row, i) => (i === index ? { ...row, name } : row));
                  patch({ items });
                }}
                suggestions={suggestions.accessoryName}
                placeholder="Khóa, Bản lề, Tay nắm…"
              />
              <div className="field">
                <label>SL</label>
                <input
                  className="input"
                  type="number"
                  min={0}
                  value={item.quantity}
                  onChange={(event) => {
                    const items = value.items.map((row, i) =>
                      i === index ? { ...row, quantity: Number(event.target.value) || 0 } : row,
                    );
                    patch({ items });
                  }}
                />
              </div>
              <div className="row-action-group">
                <button
                  className="icon-btn danger"
                  type="button"
                  data-action="remove-row"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    patch({ items: value.items.filter((_, itemIndex) => itemIndex !== index) });
                  }}
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
  const { handleProps, rowProps } = useDragReorder((from, to) =>
    onChange(reindexExtraAccessories(reorderList(value, from, to))),
  );

  return (
    <div className="editor-panel accessory-editor-panel">
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
        <div className="empty-line">Chưa có phụ kiện phát sinh. Bấm “Thêm phụ kiện” để thêm dòng trống (SL mặc định 0).</div>
      ) : (
        <div className="extra-accessory-table">
          <div className="extra-accessory-head">
            <span />
            <span>Tên phụ kiện</span>
            <span>DV</span>
            <span>SL</span>
            <span>KL</span>
            <span>Đơn giá</span>
            <span>Thành tiền</span>
            <span />
          </div>
          {value.map((item, index) => (
            <div key={item.id} className="extra-accessory-line" data-row-id={item.id} {...rowProps(index)}>
              <DragHandle {...handleProps(index)} label="Kéo để đổi thứ tự phụ kiện" />
              <AutoSuggestInput
                label="Tên phụ kiện phát sinh"
                fieldKey="extra_accessory_name"
                value={item.name}
                onChange={(name) => onChange(updateAccessoryDraftAtIndex(value, index, { name }))}
                suggestions={suggestions.accessoryName}
                placeholder="Phào, Nẹp, Ray…"
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
                  min={0}
                  value={item.quantity}
                  onChange={(event) =>
                    onChange(updateAccessoryDraftAtIndex(value, index, { quantity: Number(event.target.value) || 0 }))
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
                  className="icon-btn danger"
                  type="button"
                  data-action="remove-row"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onChange(reindexExtraAccessories(value.filter((_, itemIndex) => itemIndex !== index)));
                  }}
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
