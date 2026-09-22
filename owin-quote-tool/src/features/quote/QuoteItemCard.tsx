import { useRef, useState } from 'react';
import { Copy, ImagePlus, LoaderCircle, Trash2 } from 'lucide-react';
import type {
  AccessoryInput,
  DimensionInput,
  ProductRecord,
  QuoteItemInput,
} from '@/types/models';
import type { calculateQuote } from '@/lib/quote/quoteCalculator';
import { formatVND } from '@/lib/format/currency';
import { DragHandle } from '@/components/DragReorder';
import { ExtraAccessoriesEditor } from '@/components/AccessoryEditors';
import { ProductThumb } from '@/components/ProductThumb';
import { compressAndUploadQuoteImage, ImageError } from '@/lib/media/imageStorage';
import { mergeSuggestionLists } from '@/features/suggestions/suggestionStore';
import {
  parseExtraAccessoriesJson,
  serializeExtraAccessoriesJson,
} from '@/lib/quote/accessoryDrafts';
import type { AccessoryPackageTemplate } from '@/lib/quote/accessoryPackages';
import { Field, QuoteSummaryMetric } from '@/features/quote/QuoteFormPrimitives';
import { QuoteItemLockedCard } from '@/features/quote/QuoteItemLockedCard';
import { QuoteItemDimensionTable } from '@/features/quote/QuoteItemDimensionTable';
import { QuoteItemLegacyAccessories } from '@/features/quote/QuoteItemLegacyAccessories';
import { QuoteItemSpecEditor } from '@/features/quote/QuoteItemSpecEditor';
import { QuoteItemAccessoryPackage } from '@/features/quote/QuoteItemAccessoryPackage';

/** Thẻ một hạng mục báo giá: chọn nhánh thu gọn / đang sửa rồi ghép các panel con. */
export function QuoteItemCard({
  index,
  item,
  locked,
  calculated,
  suggestions,
  packageCatalog = [],
  orphanAccessoryNames = [],
  onUpdate,
  onDimension,
  onAccessory,
  onAddDimension,
  onAddAccessory,
  onCollapse,
  onExpand,
  onDuplicate,
  onDelete,
  dragHandleProps,
  products,
}: {
  index: number;
  item: QuoteItemInput;
  locked: boolean;
  calculated: ReturnType<typeof calculateQuote>['items'][number] | undefined;
  suggestions: Record<string, string[]>;
  packageCatalog?: AccessoryPackageTemplate[];
  orphanAccessoryNames?: string[];
  onUpdate: (patch: Partial<QuoteItemInput>) => void;
  onDimension: (lineIndex: number, patch: Partial<DimensionInput>) => void;
  onAccessory: (accIndex: number, patch: Partial<AccessoryInput>) => void;
  onAddDimension: () => void;
  onAddAccessory: () => void;
  onCollapse: () => void;
  onExpand: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  dragHandleProps: Record<string, unknown>;
  products: ProductRecord[];
}) {
  const extraDraft = parseExtraAccessoriesJson(item.extraAccessories);
  const usesPackageAccessories = Boolean(item.fixedAccessoryPackage || extraDraft.length > 0);
  const imagePath = item.coverImagePath || item.image || null;
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  /** Pick an image → compress/upload → persist only its Supabase CDN URL. */
  const chooseImageFromFile = async (file: File) => {
    setImageError(null);
    setImageBusy(true);
    try {
      const { url } = await compressAndUploadQuoteImage(file);
      onUpdate({ coverImagePath: url, image: url, imageReference: url, imageOverridePath: url });
    } catch (error) {
      setImageError(error instanceof ImageError ? error.message : 'Không thể tải ảnh lên Supabase.');
    } finally {
      setImageBusy(false);
    }
  };

  // Thu gọn: chỉ tên + tổng tiền (mở rộng mới xem mô tả/PK đầy đủ).
  if (locked) {
    return (
      <QuoteItemLockedCard
        index={index}
        item={item}
        products={products}
        imagePath={imagePath}
        calculated={calculated}
        dragHandleProps={dragHandleProps}
        onExpand={onExpand}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
      />
    );
  }

  return (
    <div
      className="card quote-item-card quote-item-card-editing"
      title="Nháy đúp vùng trống để thu gọn hạng mục"
      onDoubleClick={(event) => {
        const target = event.target as Element;
        const interactive = target.closest(
          'input, textarea, select, button, a, label, [contenteditable="true"], [role="combobox"], .autosuggest-menu',
        );
        if (!interactive) onCollapse();
      }}
    >
      <div className="quote-item-card-header">
        <button
          type="button"
          className="quote-item-thumb quote-item-thumb-btn quote-item-thumb-edit"
          onClick={() => imageInputRef.current?.click()}
          aria-label="Chọn ảnh từ máy"
          title="Bấm để chọn ảnh từ máy"
        >
          <ProductThumb item={item} products={products} imagePath={imagePath} fill previewable={false} />
          <span className="quote-item-thumb-overlay">
            {imageBusy ? <LoaderCircle size={16} className="spin" /> : <ImagePlus size={16} />}
          </span>
        </button>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/*"
          style={{ display: 'none' }}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void chooseImageFromFile(file);
            event.target.value = '';
          }}
        />
        <div className="quote-item-card-main">
          <div className="quote-item-titleline">
            <div>
              <div className="section-label" style={{ margin: 0 }}>Hạng mục #{index + 1}</div>
              <div className="product-sub">Tổng hạng mục {formatVND(calculated?.itemTotalVnd ?? 0)}</div>
            </div>
            <div className="quote-item-actions">
              <DragHandle {...dragHandleProps} label="Kéo để đổi thứ tự hạng mục" />
              <button className="icon-btn" onClick={onDuplicate} aria-label="Nhân bản hạng mục"><Copy size={16} /></button>
              <button className="icon-btn danger" onClick={onDelete} aria-label="Xóa hạng mục"><Trash2 size={16} /></button>
            </div>
          </div>

          {imageError && <div className="hint" style={{ color: 'var(--ios-red)' }}>{imageError}</div>}

          {/* Mã SP + Tên hạng mục — ĐVT lấy theo từng dòng kích thước (cột DV). */}
          <div className="quote-item-basic-grid">
            <Field
              label="Mã SP"
              fieldKey="product_code"
              value={item.quoteItemCode || item.productCode || ''}
              onChange={(value) => onUpdate({ quoteItemCode: value, productCode: value })}
            />
            <Field
              label="Tên hạng mục"
              fieldKey="item_name"
              value={item.itemName}
              onChange={(value) => onUpdate({ itemName: value })}
              suggestions={mergeSuggestionLists(suggestions.item_name, suggestions.product_name)}
            />
          </div>
        </div>
      </div>


      <QuoteItemDimensionTable
        item={item}
        calculated={calculated}
        onUpdate={onUpdate}
        onDimension={onDimension}
        onAddDimension={onAddDimension}
      />

      {!usesPackageAccessories && item.accessories.length > 0 && (
        <QuoteItemLegacyAccessories
          item={item}
          suggestions={suggestions}
          onUpdate={onUpdate}
          onAccessory={onAccessory}
          onAddAccessory={onAddAccessory}
        />
      )}

      <div className="quote-item-config-grid">
        <QuoteItemSpecEditor item={item} suggestions={suggestions} onUpdate={onUpdate} />
        <QuoteItemAccessoryPackage
          item={item}
          suggestions={suggestions}
          packageCatalog={packageCatalog}
          orphanAccessoryNames={orphanAccessoryNames}
          onUpdate={onUpdate}
        />
      </div>

      <div className="quote-item-extra">
        <ExtraAccessoriesEditor
          value={extraDraft}
          onChange={(drafts) =>
            onUpdate({
              // keepEmpty: blank extra rows stay while editing; cleaned only on quote save.
              extraAccessories: serializeExtraAccessoriesJson(drafts, { keepEmpty: true }) ?? '[]',
            })
          }
          suggestions={{ accessoryName: suggestions.extra_accessory_name ?? [] }}
          title="Phụ kiện phát sinh riêng"
        />
      </div>

      <div className="quote-item-summary-strip">
        <QuoteSummaryMetric label="Tiền sản phẩm" value={formatVND(calculated?.productSubtotalVnd ?? 0)} />
        <QuoteSummaryMetric label="Tiền phụ kiện" value={formatVND(calculated?.accessorySubtotalVnd ?? 0)} />
        <QuoteSummaryMetric label="Tổng hạng mục" value={formatVND(calculated?.itemTotalVnd ?? 0)} strong />
      </div>
    </div>
  );
}
