import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
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
import { Switch } from '@/components/Switch';
import { getImage, saveImage } from '@/utils/imageStorage';
import { productCoverPath } from '@/utils/imagePaths';
import {
  parseExtraAccessoriesJson,
  parseFixedAccessoriesJson,
  serializeExtraAccessoriesJson,
  serializeFixedAccessoriesJson,
} from '@/lib/quote/accessoryDrafts';

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

const DEFAULT_SPEC_KEYS = [
  'Màu',
  'Khung Bao',
  'Bản Cánh',
  'Độ Dày',
  'Loại Kính',
  'Phào',
  'Song Nhôm Bảo Vệ',
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
  return DEFAULT_SPEC_KEYS.map((key, sortOrder) => ({ key, value: '', sortOrder }));
}

function normalizeSpecKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function ProductForm({ editing, suggestions, onSave, onCancel }: Props) {
  const [name, setName] = useState(editing?.name ?? '');
  const [code, setCode] = useState(editing?.code ?? '');
  const [category, setCategory] = useState(editing?.category ?? 'Khác');
  const [unit, setUnit] = useState<ProductUnit>(editing?.unit ?? 'M2');
  const [unitPriceVnd, setUnitPriceVnd] = useState(editing?.unitPriceVnd ?? 0);
  const [rawSizeText, setRawSizeText] = useState(editing?.rawSizeText ?? '');
  const [rawPriceText, setRawPriceText] = useState(editing?.rawPriceText ?? '');
  const [shortDesc, setShortDesc] = useState(editing?.shortDesc ?? '');
  const [coverImageId, setCoverImageId] = useState<string | undefined>(() =>
    legacyImageId(editing?.coverImagePath ?? null),
  );
  const [specs, setSpecs] = useState<ProductSpecRecord[]>(() => normalizeSpecs(editing));
  const [accessories, setAccessories] = useState<ProductAccessoryRecord[]>(() =>
    editing?.accessories?.map((item) => ({ ...item })) ?? [],
  );
  const [fixedPackage, setFixedPackage] = useState(() =>
    parseFixedAccessoriesJson(editing?.fixedAccessoryPackage, 1),
  );
  const [extraAccessories, setExtraAccessories] = useState(() =>
    parseExtraAccessoriesJson(editing?.extraAccessories),
  );
  const [isFeatured, setIsFeatured] = useState(Boolean(editing?.isFeatured));
  const [isPublic, setIsPublic] = useState(editing?.isPublic !== false);
  const [saving, setSaving] = useState(false);

  const canSave = name.trim() !== '' && code.trim() !== '';

  const updateSpec = (index: number, patch: Partial<ProductSpecRecord>) =>
    setSpecs((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const updateAccessory = (index: number, patch: Partial<ProductAccessoryRecord>) =>
    setAccessories((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const specValueSuggestions = (key: string) => {
    const normalized = normalizeSpecKey(key);
    const specific = (() => {
      if (normalized.includes('mau')) return suggestions.specValueColor ?? [];
      if (normalized.includes('khung')) return suggestions.specValueFrame ?? [];
      if (normalized.includes('canh')) return suggestions.specValueSash ?? [];
      if (normalized.includes('day')) return suggestions.specValueThickness ?? [];
      if (normalized.includes('kinh')) return suggestions.specValueGlass ?? [];
      if (normalized.includes('phao')) return suggestions.specValueMolding ?? [];
      if (normalized.includes('song') || normalized.includes('bao ve')) {
        return suggestions.specValueProtectionBar ?? [];
      }
      return [];
    })();
    return [...specific, ...suggestions.specValue];
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

      const normalizedCode = code.trim().toUpperCase();
      const normalizedName = name.trim();
      await onSave({
        id: editing?.id,
        numericId: editing?.numericId,
        code: normalizedCode,
        name: normalizedName,
        category: category.trim() || 'Khác',
        unit,
        unitPriceVnd: Number(unitPriceVnd || 0),
        shortDesc: shortDesc.trim() || null,
        coverImagePath: await coverPathFromImageId(
          coverImageId,
          normalizedCode,
          normalizedName,
          editing?.coverImagePath ?? null,
        ),
        gallery: editing?.gallery ?? [],
        rawSizeText: rawSizeText.trim() || null,
        rawPriceText: rawPriceText.trim() || null,
        specs: cleanSpecs,
        accessories: cleanAccessories,
        fixedAccessoryPackage,
        extraAccessories: extraAccessoriesJson,
        isFeatured,
        isPublic,
        folderPath: editing?.folderPath ?? null,
        createdAt: editing?.createdAt,
      });
      onCancel();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <div className="two-col">
        <div>
          <AutoSuggestInput
            label="Danh mục"
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
            <label>Mã sản phẩm</label>
            <input className="input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
          </div>
          <div className="field">
            <label>Đơn vị tính</label>
            <SegmentedControl options={UNIT_OPTIONS} value={unit} onChange={setUnit} />
          </div>
          <div className="field">
            <label>Đơn giá</label>
            <CurrencyInput value={unitPriceVnd} onChange={setUnitPriceVnd} placeholder="0" />
          </div>
          <div className="two-col" style={{ gap: 12 }}>
            <div className="field">
              <label>Kích thước mẫu</label>
              <input
                className="input"
                value={rawSizeText}
                onChange={(e) => setRawSizeText(e.target.value)}
                placeholder="1.80 x 2.20"
              />
            </div>
            <div className="field">
              <label>Giá gốc mô tả</label>
              <input
                className="input"
                value={rawPriceText}
                onChange={(e) => setRawPriceText(e.target.value)}
                placeholder="Theo bảng giá OWIN"
              />
            </div>
          </div>
          <div className="field">
            <label>Mô tả ngắn</label>
            <textarea
              className="input"
              value={shortDesc}
              onChange={(e) => setShortDesc(e.target.value)}
              rows={3}
            />
          </div>
          <div className="field">
            <label>Ảnh bìa</label>
            <ImageDropzone
              imageId={coverImageId}
              imagePath={editing?.coverImagePath ?? null}
              onImageStored={setCoverImageId}
            />
          </div>
          <div className="switch-row">
            <span>Công khai</span>
            <Switch checked={isPublic} onChange={setIsPublic} aria-label="Công khai sản phẩm" />
          </div>
          <div className="switch-row">
            <span>Nổi bật</span>
            <Switch checked={isFeatured} onChange={setIsFeatured} aria-label="Sản phẩm nổi bật" />
          </div>
        </div>

        <div>
          <SectionHeader title="Thông số kỹ thuật" onAdd={() => setSpecs([...specs, { key: '', value: '', sortOrder: specs.length }])} />
          <div className="stack">
            {specs.map((spec, index) => (
              <div key={index} className="switch-row" style={{ alignItems: 'flex-end' }}>
                <AutoSuggestInput
                  label="Tên"
                  value={spec.key}
                  onChange={(value) => updateSpec(index, { key: value })}
                  suggestions={suggestions.specKey}
                />
                <AutoSuggestInput
                  label="Giá trị"
                  value={spec.value}
                  onChange={(value) => updateSpec(index, { value })}
                  suggestions={specValueSuggestions(spec.key)}
                />
                <button className="icon-btn danger" type="button" onClick={() => setSpecs(specs.filter((_, i) => i !== index))}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>

          <SectionHeader title="Phụ kiện đi kèm cũ" onAdd={() => setAccessories([...accessories, { name: '', quantityPerSet: 1, unitPriceVnd: 0, note: null }])} />
          <div className="stack">
            {accessories.map((item, index) => (
              <div key={index} className="switch-row" style={{ alignItems: 'flex-end' }}>
                <AutoSuggestInput
                  label="Tên"
                  value={item.name}
                  onChange={(value) => updateAccessory(index, { name: value })}
                  suggestions={suggestions.accessoryName}
                />
                <div className="field">
                  <label>SL/Bộ</label>
                  <input className="input" type="number" value={item.quantityPerSet || ''} onChange={(e) => updateAccessory(index, { quantityPerSet: Number(e.target.value) || 0 })} />
                </div>
                <div className="field">
                  <label>Đơn giá</label>
                  <CurrencyInput value={item.unitPriceVnd || 0} onChange={(unitPriceVnd) => updateAccessory(index, { unitPriceVnd })} />
                </div>
                <button className="icon-btn danger" type="button" onClick={() => setAccessories(accessories.filter((_, i) => i !== index))}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="two-col" style={{ marginTop: 16 }}>
        <FixedAccessoryPackageEditor
          value={fixedPackage}
          onChange={setFixedPackage}
          suggestions={{
            accessoryName: suggestions.accessoryName,
            packageName: suggestions.accessoryPackageName,
          }}
        />
        <ExtraAccessoriesEditor
          value={extraAccessories}
          onChange={setExtraAccessories}
          suggestions={{ accessoryName: suggestions.accessoryName }}
        />
      </div>

      <div className="toolbar" style={{ marginTop: 16, marginBottom: 0 }}>
        <div className="spacer" />
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Huỷ</button>
        <button type="button" className="btn btn-primary" onClick={save} disabled={!canSave || saving}>
          {saving ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Thêm sản phẩm'}
        </button>
      </div>
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
