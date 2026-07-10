import { useState } from 'react';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import type {
  ProductAccessoryRecord,
  ProductRecord,
  ProductSpecRecord,
  ProductUnit,
} from '@/types/models';
import { AutoSuggestInput } from '@/components/AutoSuggestInput';
import { CurrencyInput } from '@/components/CurrencyInput';
import { ExtraAccessoriesEditor, FixedAccessoryPackageEditor } from '@/components/AccessoryEditors';
import { ImageDropzone } from '@/components/ImageDropzone';
import { SegmentedControl } from '@/components/SegmentedControl';
import { getImage, saveImage } from '@/utils/imageStorage';
import { productCoverPath } from '@/utils/imagePaths';
import { formatVND } from '@/utils/format';
import {
  calculateFixedAccessoryDraftTotal,
  parseExtraAccessoriesJson,
  parseFixedAccessoriesJson,
  serializeExtraAccessoriesJson,
  serializeFixedAccessoriesJson,
} from '@/lib/quote/accessoryDrafts';
import { DEFAULT_SPEC_KEYS } from '@/lib/suggestions';

type SaveProductInput = Parameters<typeof import('@/features/products/productStore').saveProduct>[0];

interface Suggestions {
  category: string[];
  productName: string[];
  specKey: string[];
  specValue: string[];
  specValueColor?: string[];
  specValueFrame?: string[];
  specValueSash?: string[];
  specValueThickness?: string[];
  specValueGlass?: string[];
  specValueMolding?: string[];
  specValueProtectionBar?: string[];
  accessoryName: string[];
  accessoryPackageName?: string[];
}

interface Props {
  editing: ProductRecord | null;
  suggestions: Suggestions;
  onSave: (p: SaveProductInput) => Promise<unknown>;
  onCancel: () => void;
}

const UNIT_OPTIONS: { label: string; value: ProductUnit }[] = [
  { label: 'm²', value: 'M2' },
  { label: 'Bộ', value: 'BO' },
  { label: 'md', value: 'METER' },
];

function legacyImageId(path: string | null): string | undefined {
  const prefix = 'legacy-images/';
  return path?.startsWith(prefix) ? path.slice(prefix.length) : undefined;
}

async function coverPathFromImageId(
  imageId: string | undefined,
  code: string,
  name: string,
  existingPath: string | null,
): Promise<string | null> {
  if (imageId) {
    const blob = await getImage(imageId);
    const nextPath = productCoverPath(code, name);
    if (blob) {
      await saveImage(nextPath, blob);
      return nextPath;
    }
    return `legacy-images/${imageId}`;
  }
  return existingPath || null;
}

function normalizeSpecs(editing: ProductRecord | null): ProductSpecRecord[] {
  if (editing?.specs?.length) return editing.specs.map((spec) => ({ ...spec }));
  return DEFAULT_SPEC_KEYS.map((key, sortOrder) => ({ key, value: '', sortOrder: sortOrder }));
}

function normalizeSpecKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function parseRawSizeText(value: string | null | undefined): { width: string; height: string } {
  if (!value) return { width: '', height: '' };
  const parts = value.split(/\s*[xX*]\s*/);
  if (parts.length < 2) return { width: '', height: '' };
  return {
    width: parts[0]?.trim() ?? '',
    height: parts[1]?.trim() ?? '',
  };
}

function parseDecimalText(value: string): number {
  const normalized = value.trim().replace(',', '.');
  const match = normalized.match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function buildRawSizeText(width: string, height: string): string | null {
  const widthM = parseDecimalText(width);
  const heightM = parseDecimalText(height);
  if (widthM <= 0 || heightM <= 0) return null;
  return `${widthM.toFixed(2)} x ${heightM.toFixed(2)}`;
}

function calculateSampleQuantity(unit: ProductUnit, width: string, height: string): number {
  const widthValue = parseDecimalText(width);
  const heightValue = parseDecimalText(height);
  if (unit === 'M2') return Math.round(widthValue * heightValue * 1000) / 1000;
  if (unit === 'METER') return Math.round((widthValue + heightValue) * 1000) / 1000;
  return 1;
}

function generateProductCode(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('');
}

function moveRow<T>(rows: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= rows.length) return rows;
  const next = [...rows];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function ProductForm({ editing, suggestions, onSave, onCancel }: Props) {
  const initialSize = parseRawSizeText(editing?.rawSizeText);
  const [name, setName] = useState(editing?.name ?? '');
  const [category, setCategory] = useState(editing?.category ?? 'Khác');
  const [unit, setUnit] = useState<ProductUnit>(editing?.unit ?? 'M2');
  const [unitPriceVnd, setUnitPriceVnd] = useState(editing?.unitPriceVnd ?? 0);
  const [widthM, setWidthM] = useState(initialSize.width);
  const [heightM, setHeightM] = useState(initialSize.height);
  const [coverImageId, setCoverImageId] = useState<string | undefined>(() =>
    legacyImageId(editing?.coverImagePath ?? null),
  );
  const [specs, setSpecs] = useState<ProductSpecRecord[]>(() => normalizeSpecs(editing));
  const [accessories] = useState<ProductAccessoryRecord[]>(() =>
    editing?.accessories?.map((item) => ({ ...item })) ?? [],
  );
  const [fixedPackage, setFixedPackage] = useState(() =>
    parseFixedAccessoriesJson(editing?.fixedAccessoryPackage, 1),
  );
  const [extraAccessories, setExtraAccessories] = useState(() =>
    parseExtraAccessoriesJson(editing?.extraAccessories),
  );
  const [saving, setSaving] = useState(false);

  const canSave = name.trim() !== '';
  const sampleQuantity = calculateSampleQuantity(unit, widthM, heightM);
  const sampleProductTotal = Math.round(sampleQuantity * Number(unitPriceVnd || 0));
  const fixedPackageTotal = calculateFixedAccessoryDraftTotal(fixedPackage);
  const extraAccessoriesTotal = extraAccessories.reduce((sum, item) => sum + item.amount, 0);
  const estimatedTotal = sampleProductTotal + fixedPackageTotal + extraAccessoriesTotal;
  const sampleUnitLabel = unit === 'BO' ? 'bộ' : unit === 'METER' ? 'md' : 'm²';

  const updateSpec = (index: number, patch: Partial<ProductSpecRecord>) =>
    setSpecs((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  const moveSpec = (index: number, direction: -1 | 1) =>
    setSpecs((rows) => moveRow(rows, index, direction));

  const specValueSuggestions = (key: string) => {
    const normalized = normalizeSpecKey(key);
    const specific = (() => {
      if (normalized.includes('mau')) return suggestions.specValueColor ?? [];
      if (normalized.includes('song') || normalized.includes('bao ve')) {
        return suggestions.specValueProtectionBar ?? [];
      }
      if (normalized.includes('khung') || normalized.includes('khuon')) return suggestions.specValueFrame ?? [];
      if (normalized.includes('canh')) return suggestions.specValueSash ?? [];
      if (normalized.includes('day')) return suggestions.specValueThickness ?? [];
      if (normalized.includes('kinh')) return suggestions.specValueGlass ?? [];
      if (normalized.includes('phao')) return suggestions.specValueMolding ?? [];
      return null;
    })();
    return specific ?? suggestions.specValue;
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const cleanSpecs = specs
        .map((spec, sortOrder) => ({
          key: spec.key.trim(),
          value: spec.value.trim(),
          sortOrder,
        }))
        .filter((spec) => spec.key && spec.value);
      const cleanAccessories = accessories
        .map((item, sortOrder) => ({
          name: item.name.trim(),
          quantityPerSet: Number(item.quantityPerSet || 0),
          unitPriceVnd: Number(item.unitPriceVnd || 0),
          note: item.note?.trim() || null,
          sortOrder,
        }))
        .filter((item) => item.name);
      const fixedAccessoryPackage = serializeFixedAccessoriesJson(fixedPackage);
      const extraAccessoriesJson = serializeExtraAccessoriesJson(extraAccessories) ?? '[]';
      const rawSizeText = buildRawSizeText(widthM, heightM) ?? editing?.rawSizeText ?? null;

      const normalizedCode = (editing?.code || generateProductCode()).toUpperCase();
      const normalizedName = name.trim();
      await onSave({
        id: editing?.id,
        numericId: editing?.numericId,
        code: normalizedCode,
        name: normalizedName,
        category: category.trim() || 'Khác',
        unit,
        unitPriceVnd: Number(unitPriceVnd || 0),
        shortDesc: editing?.shortDesc ?? null,
        coverImagePath: await coverPathFromImageId(
          coverImageId,
          normalizedCode,
          normalizedName,
          editing?.coverImagePath ?? null,
        ),
        gallery: editing?.gallery ?? [],
        rawSizeText,
        rawPriceText: editing?.rawPriceText ?? null,
        specs: cleanSpecs,
        accessories: cleanAccessories,
        fixedAccessoryPackage,
        extraAccessories: extraAccessoriesJson,
        isFeatured: editing?.isFeatured ?? false,
        isPublic: editing?.isPublic ?? true,
        folderPath: editing?.folderPath ?? null,
        createdAt: editing?.createdAt,
      });
      onCancel();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card product-editor-card">
      <div className="product-editor-top">
        <div className="product-image-panel">
          <label>Hình ảnh</label>
          <ImageDropzone
            imageId={coverImageId}
            imagePath={editing?.coverImagePath ?? null}
            onImageStored={setCoverImageId}
          />
        </div>

        <div className="product-basic-panel">
          <div className="product-basic-grid">
            <AutoSuggestInput
              label="Nhóm sản phẩm"
              value={category}
              onChange={setCategory}
              suggestions={suggestions.category}
              placeholder="Cửa chính"
            />
            <AutoSuggestInput
              label="Tên sản phẩm"
              value={name}
              onChange={setName}
              suggestions={suggestions.productName}
              placeholder="Cửa đi mở quay 2 cánh"
            />
            <div className="field">
              <label>Đơn vị tính</label>
              <SegmentedControl options={UNIT_OPTIONS} value={unit} onChange={setUnit} />
            </div>
            <div className="field">
              <label>Rộng mẫu (m)</label>
              <input
                className="input"
                inputMode="decimal"
                value={widthM}
                onChange={(e) => setWidthM(e.target.value)}
                placeholder="1.80"
              />
            </div>
            <div className="field">
              <label>Cao mẫu (m)</label>
              <input
                className="input"
                inputMode="decimal"
                value={heightM}
                onChange={(e) => setHeightM(e.target.value)}
                placeholder="2.20"
              />
            </div>
            <div className="field">
              <label>Đơn giá</label>
              <CurrencyInput value={unitPriceVnd} onChange={setUnitPriceVnd} placeholder="0" />
            </div>
          </div>
        </div>
      </div>

      <div className="product-editor-section-grid">
        <div className="editor-panel product-spec-panel">
          <SectionHeader title="Thông số kỹ thuật" onAdd={() => setSpecs([...specs, { key: '', value: '', sortOrder: specs.length }])} />
          <div className="spec-table-head">
            <span>Tên thông số</span>
            <span>Giá trị</span>
            <span />
          </div>
          <div className="spec-row-list">
            {specs.map((spec, index) => (
              <div key={index} className="spec-editor-row">
                <AutoSuggestInput
                  label="Tên"
                  value={spec.key}
                  onChange={(value) => updateSpec(index, { key: value })}
                  suggestions={[...DEFAULT_SPEC_KEYS]}
                />
                <AutoSuggestInput
                  label="Giá trị"
                  value={spec.value}
                  onChange={(value) => updateSpec(index, { value })}
                  suggestions={specValueSuggestions(spec.key)}
                />
                <div className="row-action-group">
                  <button className="icon-btn" type="button" disabled={index === 0} onClick={() => moveSpec(index, -1)} aria-label="Đưa thông số lên">
                    <ChevronUp size={15} />
                  </button>
                  <button className="icon-btn" type="button" disabled={index === specs.length - 1} onClick={() => moveSpec(index, 1)} aria-label="Đưa thông số xuống">
                    <ChevronDown size={15} />
                  </button>
                  <button className="icon-btn danger" type="button" onClick={() => setSpecs(specs.filter((_, i) => i !== index))} aria-label="Xóa thông số">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <FixedAccessoryPackageEditor
          value={fixedPackage}
          onChange={setFixedPackage}
          suggestions={{
            accessoryName: suggestions.accessoryName,
            packageName: suggestions.accessoryPackageName,
          }}
        />
      </div>

      <div className="product-editor-extra">
        <ExtraAccessoriesEditor
          value={extraAccessories}
          onChange={setExtraAccessories}
          suggestions={{ accessoryName: suggestions.accessoryName }}
          title="Phụ kiện phát sinh thêm"
        />
      </div>

      <div className="product-summary-strip">
        <SummaryMetric
          label="Giá sản phẩm mẫu"
          value={formatVND(sampleProductTotal)}
          note={`${sampleQuantity.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')} ${sampleUnitLabel}`}
        />
        <SummaryMetric label="Giá phụ kiện mẫu" value={formatVND(fixedPackageTotal)} />
        <SummaryMetric label="Phụ kiện phát sinh" value={formatVND(extraAccessoriesTotal)} />
        <SummaryMetric label="Tổng cộng ước tính" value={formatVND(estimatedTotal)} strong />
      </div>

      <div className="toolbar product-editor-actions">
        <div className="spacer" />
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Huỷ</button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={!canSave || saving}>
          {saving ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Thêm sản phẩm'}
        </button>
      </div>
    </div>
  );
}

function SummaryMetric({ label, value, note, strong }: { label: string; value: string; note?: string; strong?: boolean }) {
  return (
    <div className={strong ? 'summary-metric summary-metric-strong' : 'summary-metric'}>
      <span>{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}

function SectionHeader({ title, onAdd }: { title: string; onAdd: () => void }) {
  return (
    <div className="toolbar" style={{ margin: '12px 0 8px' }}>
      <div className="section-label" style={{ margin: 0 }}>{title}</div>
      <div className="spacer" />
      <button className="icon-btn" type="button" onClick={onAdd} aria-label={`Thêm ${title}`}>
        <Plus size={16} />
      </button>
    </div>
  );
}
