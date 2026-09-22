import { useMemo } from 'react';
import { Trash2 } from 'lucide-react';
import type { ProductSpecRecord } from '@/types/models';
import { AutoSuggestInput } from '@/components/AutoSuggestInput';
import { mergeRowDragProps, reorderList, useDragReorder } from '@/components/DragReorder';
import { DEFAULT_SPEC_KEYS, suggestionTypesForSpecKey } from '@/features/suggestions/suggestionStore';
import { newRowId, type SpecDraft } from '@/features/products/productDraft';
import type { ProductSuggestions } from '@/features/products/productSuggestions';

/** Pool gợi ý cho ô giá trị, chọn theo tên thông số (màu ≠ khung ≠ khuôn ≠ cánh…). */
function valueSuggestions(key: string, suggestions: ProductSuggestions): string[] {
  const primary = suggestionTypesForSpecKey(key)[0];
  if (primary === 'color' || primary === 'spec_value_color') return suggestions.specValueColor ?? [];
  if (primary === 'protection_bar' || primary === 'spec_value_protection_bar') {
    return suggestions.specValueProtectionBar ?? [];
  }
  if (primary === 'frame' || primary === 'spec_value_frame') return suggestions.specValueFrame ?? [];
  if (primary === 'jamb' || primary === 'spec_value_jamb') return suggestions.specValueJamb ?? [];
  if (primary === 'sash' || primary === 'spec_value_sash') return suggestions.specValueSash ?? [];
  if (primary === 'thickness' || primary === 'spec_value_thickness') return suggestions.specValueThickness ?? [];
  if (primary === 'glass' || primary === 'spec_value_glass') return suggestions.specValueGlass ?? [];
  if (primary === 'molding' || primary === 'spec_value_molding') return suggestions.specValueMolding ?? [];
  // Unknown keys: only generic spec_value — never mix categories/product names.
  return suggestions.specValue ?? [];
}

function valueFieldKey(key: string): string {
  return `spec-value:${suggestionTypesForSpecKey(key)[0] || 'spec_value'}`;
}

/** Bảng thông số kỹ thuật: kéo đổi thứ tự, thêm / xoá dòng. */
export function ProductSpecEditor({
  specs,
  onChange,
  suggestions,
}: {
  specs: SpecDraft[];
  onChange: (next: SpecDraft[]) => void;
  suggestions: ProductSuggestions;
}) {
  const strictSpecKeys = useMemo(() => [...DEFAULT_SPEC_KEYS], []);
  const drag = useDragReorder((from, to) => onChange(reorderList(specs, from, to)));

  const updateSpec = (index: number, patch: Partial<ProductSpecRecord>) =>
    onChange(specs.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <div className="editor-panel product-spec-panel">
      <div className="toolbar editor-toolbar product-panel-head">
        <div className="section-label">Thông số kỹ thuật</div>
        <div className="spacer" />
        <button
          className="btn-link"
          type="button"
          onClick={() => onChange([...specs, { id: newRowId(), key: '', value: '', sortOrder: specs.length }])}
        >
          <span aria-hidden="true">＋</span> Thêm thông số
        </button>
      </div>

      <div className="spec-table-head">
        <span />
        <span>Tên thông số</span>
        <span>Giá trị</span>
        <span />
      </div>
      <div className="spec-row-list">
        {specs.length === 0 && (
          <div className="empty-line product-spec-empty">
            <span>Chưa có thông số</span>
            <small>Thêm thông số để bắt đầu</small>
          </div>
        )}
        {specs.map((spec, index) => (
          <div
            key={spec.id}
            className="spec-editor-row is-row-drag"
            data-row-id={spec.id}
            {...mergeRowDragProps(drag.handleProps(index), drag.rowProps(index))}
          >
            <span className="product-spec-bullet" aria-hidden="true" />
            <AutoSuggestInput
              label="Tên"
              fieldKey="spec_key"
              value={spec.key}
              onChange={(key) => updateSpec(index, { key })}
              suggestions={strictSpecKeys}
            />
            <AutoSuggestInput
              label="Giá trị"
              fieldKey={valueFieldKey(spec.key)}
              value={spec.value}
              onChange={(value) => updateSpec(index, { value })}
              suggestions={valueSuggestions(spec.key, suggestions)}
            />
            <div className="row-action-group">
              <button
                className="icon-btn danger"
                type="button"
                data-action="remove-row"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  onChange(specs.filter((_, i) => i !== index));
                }}
                aria-label="Xóa thông số"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
