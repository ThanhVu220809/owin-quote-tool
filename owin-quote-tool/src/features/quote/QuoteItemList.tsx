import { Package, Plus } from 'lucide-react';
import type {
  AccessoryInput,
  DimensionInput,
  ProductRecord,
  QuoteItemInput,
} from '@/types/models';
import type { calculateQuote } from '@/lib/quote/quoteCalculator';
import type { useDragReorder } from '@/components/DragReorder';
import { normalizeCategoryName } from '@/lib/products/categoryOrder';
import type { AccessoryPackageTemplate } from '@/lib/quote/accessoryPackages';
import { QuoteItemCard } from '@/features/quote/QuoteItemCard';

/** Danh sách hạng mục báo giá (kèm tab lọc theo loại cửa). */
export function QuoteItemList({
  items,
  itemUiKeys,
  expandedItemKeys,
  itemCategoryFilter,
  products,
  calculated,
  suggestions,
  packageCatalog,
  orphanAccessoryNames,
  itemDrag,
  onItemCategoryFilter,
  onUpdateItem,
  onDimension,
  onAccessory,
  onCollapse,
  onExpand,
  onDuplicate,
  onDelete,
}: {
  items: QuoteItemInput[];
  itemUiKeys: string[];
  expandedItemKeys: Set<string>;
  itemCategoryFilter: string;
  products: ProductRecord[];
  calculated: ReturnType<typeof calculateQuote>;
  suggestions: Record<string, string[]>;
  packageCatalog: AccessoryPackageTemplate[];
  orphanAccessoryNames: string[];
  itemDrag: ReturnType<typeof useDragReorder>;
  onItemCategoryFilter: (value: string) => void;
  onUpdateItem: (index: number, patch: Partial<QuoteItemInput>) => void;
  onDimension: (index: number, lineIndex: number, patch: Partial<DimensionInput>) => void;
  onAccessory: (index: number, accIndex: number, patch: Partial<AccessoryInput>) => void;
  onCollapse: (index: number) => void;
  onExpand: (index: number) => void;
  onDuplicate: (index: number) => void;
  onDelete: (index: number) => void;
}) {
  return (
    <div className="quote-section-block quote-items-section">
      <div className="quote-section-label">Hạng mục báo giá ({items.length})</div>
      <div className="card" style={{ marginTop: 0 }}>
        {(() => {
          // Title Case + gộp trùng (Cửa chính / Cửa Chính → 1 tab).
          const uniqueCats = Array.from(
            new Set(
              items
                .map((it) => normalizeCategoryName(it.category || it.groupName || ''))
                .filter(Boolean),
            ),
          );
          if (uniqueCats.length < 2) return null;
          return (
            <div className="tool-nav no-print" style={{ flexWrap: 'wrap', gap: 6, marginBottom: 10 }} role="tablist">
              <button type="button" className={`tool-nav-item ${itemCategoryFilter === 'all' ? 'active' : ''}`} onClick={() => onItemCategoryFilter('all')}>Tất cả</button>
              {uniqueCats.map((c) => (
                <button key={c} type="button" className={`tool-nav-item ${itemCategoryFilter === c ? 'active' : ''}`} onClick={() => onItemCategoryFilter(c)}>{c}</button>
              ))}
            </div>
          );
        })()}
        {items.length === 0 ? (
          <div className="muted" style={{ padding: 12 }}>Chưa có hạng mục nào.</div>
        ) : (
          <div className="stack">
            {items.map((item, index) => {
              const uiKey = itemUiKeys[index] || `fallback-${index}`;
              const locked = !expandedItemKeys.has(uiKey);
              // Tab lọc: bỏ qua hạng mục không thuộc loại đang chọn (index giữ nguyên cho sửa/xóa).
              if (
                itemCategoryFilter !== 'all' &&
                normalizeCategoryName(item.category || item.groupName || '') !== itemCategoryFilter
              ) return null;
              return (
              <div key={uiKey} className="quote-item-drop" {...itemDrag.rowProps(index)}>
              <QuoteItemCard
                index={index}
                item={item}
                products={products}
                locked={locked}
                calculated={calculated.items[index]}
                suggestions={suggestions}
                packageCatalog={packageCatalog}
                orphanAccessoryNames={orphanAccessoryNames}
                dragHandleProps={itemDrag.handleProps(index)}
                onUpdate={(patch) => onUpdateItem(index, patch)}
                onDimension={(lineIndex, patch) => onDimension(index, lineIndex, patch)}
                onAccessory={(accIndex, patch) => onAccessory(index, accIndex, patch)}
                onAddDimension={() =>
                  onUpdateItem(index, {
                    dimensions: [
                      ...item.dimensions,
                      { unit: item.unit, widthM: item.unit === 'BO' ? null : 1, heightM: item.unit === 'BO' ? null : 1, quantity: 1, unitPriceVnd: item.unitPriceVnd },
                    ],
                  })
                }
                onAddAccessory={() =>
                  onUpdateItem(index, {
                    accessories: [...item.accessories, { name: '', quantityPerSet: 0, unitPriceVnd: 0, note: null, isEnabled: true }],
                  })
                }
                onCollapse={() => onCollapse(index)}
                onExpand={() => onExpand(index)}
                onDuplicate={() => onDuplicate(index)}
                onDelete={() => onDelete(index)}
              />
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/** Card chọn sản phẩm đặt cạnh thông tin khách hàng ở đầu flow. */
export function QuoteAddProductsCard({
  onOpenPicker,
  onAddCustom,
}: {
  onOpenPicker: () => void;
  onAddCustom: () => void;
}) {
  return (
    <div className="quote-section-block quote-products-section">
      <div className="quote-section-label">Chọn sản phẩm</div>
      <div className="card quote-add-products-card">
      <div>
        <div className="product-sub quote-add-hint">Mở kho để chọn bằng hình, hoặc thêm hạng mục tùy chỉnh.</div>
      </div>
      <div className="quote-add-actions">
        <button className="btn btn-primary" onClick={onOpenPicker}>
          <Package size={17} style={{ verticalAlign: '-3px' }} /> Chọn từ kho
        </button>
        <button className="btn btn-ghost" onClick={onAddCustom}>
          <Plus size={16} style={{ verticalAlign: '-3px' }} /> Tùy chỉnh
        </button>
      </div>
      </div>
    </div>
  );
}
