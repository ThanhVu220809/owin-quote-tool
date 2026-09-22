import { Trash2 } from "lucide-react";
import type { QuoteItemInput } from "@/types/models";
import { AutoSuggestInput } from "@/components/AutoSuggestInput";
import {
  DragHandle,
  reorderList,
  useDragReorder,
} from "@/components/DragReorder";
import {
  DEFAULT_SPEC_KEYS,
  suggestionTypesForSpecKey,
} from "@/features/suggestions/suggestionStore";
import { specValueSuggestionsForKey } from "@/features/quote/quoteSuggestionFields";

/** Panel "Thông số kỹ thuật" của một hạng mục: thêm / xoá / kéo thả từng dòng. */
export function QuoteItemSpecEditor({
  item,
  suggestions,
  onUpdate,
}: {
  item: QuoteItemInput;
  suggestions: Record<string, string[]>;
  onUpdate: (patch: Partial<QuoteItemInput>) => void;
}) {
  const specs = item.specs ?? [];
  // Stable keys so clearing key/value never remounts the row (which felt like row delete).
  const specRowIds = specs.map(
    (spec, index) =>
      `qi-${index}-${item.productCode}-${spec.sortOrder ?? index}`,
  );
  const updateSpec = (
    specIndex: number,
    patch: { key?: string; value?: string },
  ) => {
    onUpdate({
      specs: specs.map((spec, currentIndex) =>
        currentIndex === specIndex
          ? { ...spec, ...patch, sortOrder: currentIndex }
          : spec,
      ),
    });
  };
  const specDrag = useDragReorder((from, to) => {
    onUpdate({
      specs: reorderList(specs, from, to).map((spec, sortOrder) => ({
        ...spec,
        sortOrder,
      })),
    });
  });
  return (
    <div className="editor-panel quote-spec-panel">
      <div className="toolbar editor-toolbar">
        <div className="section-label">Thông số kỹ thuật</div>
        <div className="spacer" />
        <button
          className="btn-link"
          type="button"
          onClick={() =>
            onUpdate({
              specs: [
                ...specs,
                { key: "", value: "", sortOrder: specs.length },
              ],
            })
          }
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
        {specs.length === 0 ? (
          <div className="empty-line quote-spec-empty">
            <span>Chưa có thông số</span>
            <small>Thêm thông số để bắt đầu</small>
          </div>
        ) : (
          specs.map((spec, specIndex) => (
            <div
              key={specRowIds[specIndex]}
              className="spec-editor-row"
              data-row-id={specRowIds[specIndex]}
              {...specDrag.rowProps(specIndex)}
            >
              <DragHandle
                {...specDrag.handleProps(specIndex)}
                label="Kéo để đổi thứ tự thông số"
              />
              <AutoSuggestInput
                label="Tên"
                fieldKey="spec_key"
                value={spec.key}
                onChange={(key) => updateSpec(specIndex, { key })}
                suggestions={[...DEFAULT_SPEC_KEYS]}
              />
              <AutoSuggestInput
                label="Giá trị"
                fieldKey={`spec-value:${suggestionTypesForSpecKey(spec.key)[0] || "spec_value"}`}
                value={spec.value}
                onChange={(value) => updateSpec(specIndex, { value })}
                suggestions={specValueSuggestionsForKey(spec.key, suggestions)}
              />
              <div className="row-action-group">
                <button
                  className="icon-btn danger"
                  type="button"
                  data-action="remove-row"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onUpdate({
                      specs: specs
                        .filter((_, currentIndex) => currentIndex !== specIndex)
                        .map((row, sortOrder) => ({ ...row, sortOrder })),
                    });
                  }}
                  aria-label="Xóa thông số"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
