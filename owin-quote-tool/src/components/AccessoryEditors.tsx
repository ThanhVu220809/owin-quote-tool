import { Plus, Sparkles, Trash2 } from 'lucide-react';
import type { ProductUnit } from '@/types/models';
import { AutoSuggestInput } from './AutoSuggestInput';
import { CurrencyInput } from './CurrencyInput';
import { SmartNumberInput } from './SmartNumberInput';
import { DragHandle, reorderList, useDragReorder } from './DragReorder';
import { formatVND } from '@/utils/format';
import {
  isBlankOrDefaultPackageItems,
  resolvePackageItemsByName,
  type AccessoryPackageTemplate,
} from '@/lib/accessoryPackages';
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
  /** Catalog of known packages → item name templates (no prices). */
  packageCatalog?: AccessoryPackageTemplate[];
  /** Accessory names that appear outside standard sets. */
  orphanAccessoryNames?: string[];
}

function reindexExtraAccessories(rows: ExtraAccessoryDraft[]): ExtraAccessoryDraft[] {
  return rows.map((item, sortOrder) => ({ ...item, sortOrder }));
}

function newItemId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function applyPackageName(
  draft: FixedAccessoryDraft,
  name: string,
  catalog: readonly AccessoryPackageTemplate[] | undefined,
  forceItems: boolean,
): FixedAccessoryDraft {
  const nextName = name;
  const canReplace = forceItems || isBlankOrDefaultPackageItems(draft.items);
  if (!canReplace) {
    return updateFixedAccessoryDraft(draft, { name: nextName });
  }
  const suggested = resolvePackageItemsByName(nextName, catalog ?? []);
  if (suggested.length === 0) {
    return updateFixedAccessoryDraft(draft, { name: nextName });
  }
  return updateFixedAccessoryDraft(draft, {
    name: nextName,
    items: suggested.map((item) => ({
      id: newItemId(),
      name: item.name,
      quantity: item.quantity,
    })),
  });
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
  const catalog = suggestions.packageCatalog ?? [];
  const orphans = suggestions.orphanAccessoryNames ?? [];
  const patch = (next: Partial<FixedAccessoryDraft>) => onChange(updateFixedAccessoryDraft(value, next));
  const { handleProps, rowProps } = useDragReorder((from, to) =>
    patch({ items: reorderList(value.items, from, to) }),
  );

  const applySuggestedItems = (force: boolean) => {
    onChange(applyPackageName(value, value.name, catalog, force));
  };

  const canSuggestFromName =
    value.name.trim().length > 0 &&
    resolvePackageItemsByName(value.name, catalog).length > 0;

  // Item name suggestions: fixed package items + orphans (to fold them into a set).
  const itemNameSuggestions = Array.from(
    new Set([...(suggestions.accessoryName ?? []), ...orphans].filter(Boolean)),
  );

  return (
    <div className="editor-panel accessory-editor-panel">
      <div className="toolbar editor-toolbar">
        <div className="section-label">{title}</div>
        <div className="spacer" />
        {canSuggestFromName && (
          <button
            className="btn-link"
            type="button"
            title="Điền món theo tên bộ (chỉ chuẩn hoá TÊN, không đụng giá)"
            onClick={() => applySuggestedItems(true)}
          >
            <Sparkles size={15} /> Gợi ý món theo tên bộ
          </button>
        )}
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
        onChange={(name) => onChange(applyPackageName(value, name, catalog, false))}
        suggestions={suggestions.packageName ?? []}
        placeholder="Gợi ý tên bộ (không lẫn món phụ kiện)…"
      />
      {canSuggestFromName && isBlankOrDefaultPackageItems(value.items) && (
        <div className="hint accessory-package-hint">
          Đã có mẫu món cho bộ này — gõ/chọn tên bộ để tự điền, hoặc bấm “Gợi ý món theo tên bộ”.
          Chỉ chuẩn hoá <strong>tên</strong>, không ép đơn giá.
        </div>
      )}
      {orphans.length > 0 && orphans.length <= 24 && (
        <div className="hint accessory-orphan-hint">
          Món lẻ ngoài bộ chuẩn (gợi ý gộp): {orphans.slice(0, 6).join(' · ')}
          {orphans.length > 6 ? ` · +${orphans.length - 6}` : ''}
        </div>
      )}

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
                suggestions={itemNameSuggestions}
                placeholder="Khóa, Bản lề, Tay nắm…"
              />
              <div className="field">
                <label>SL</label>
                <SmartNumberInput
                  className="input"
                  mode="decimal"
                  decimals={3}
                  min={0}
                  value={item.quantity}
                  onChange={(quantity) => {
                    const items = value.items.map((row, i) =>
                      i === index ? { ...row, quantity } : row,
                    );
                    patch({ items });
                  }}
                  placeholder="0"
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
          <SmartNumberInput
            className="input"
            mode="int"
            min={0}
            value={value.packageQuantity}
            onChange={(packageQuantity) => patch({ packageQuantity })}
            placeholder="0"
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
            <span className="extra-acc-metrics-head">
              <span>DV</span>
              <span>SL</span>
              <span>KL</span>
              <span>Đơn giá</span>
              <span>Thành tiền</span>
            </span>
            <span />
          </div>
          {value.map((item, index) => (
            <div key={item.id} className="extra-accessory-line" data-row-id={item.id} {...rowProps(index)}>
              <DragHandle {...handleProps(index)} label="Kéo để đổi thứ tự phụ kiện" />
              <div className="extra-acc-name">
                <AutoSuggestInput
                  label="Tên"
                  fieldKey="extra_accessory_name"
                  value={item.name}
                  onChange={(name) => onChange(updateAccessoryDraftAtIndex(value, index, { name }))}
                  suggestions={suggestions.accessoryName}
                  placeholder="Phào, Nẹp, Ray…"
                />
              </div>
              <div className="extra-acc-metrics">
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
                  {/* SL = số cái (thường 1), không phải md/m² */}
                  <SmartNumberInput
                    className="input"
                    mode="int"
                    min={0}
                    value={item.quantity}
                    onChange={(quantity) =>
                      onChange(updateAccessoryDraftAtIndex(value, index, { quantity }))
                    }
                    placeholder="1"
                  />
                </div>
                <div className="field">
                  <label>KL</label>
                  {item.unit === 'BO' ? (
                    <div className="readonly-money muted-money">—</div>
                  ) : (
                    /* KL = md hoặc m² để nhân đơn giá */
                    <SmartNumberInput
                      className="input"
                      mode="decimal"
                      decimals={3}
                      min={0}
                      value={item.weight}
                      onChange={(weight) =>
                        onChange(updateAccessoryDraftAtIndex(value, index, { weight }))
                      }
                      placeholder="0"
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
