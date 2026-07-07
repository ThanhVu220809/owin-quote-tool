import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type {
  ProductAccessoryRecord,
  ProductRecord,
  ProductSpecRecord,
  ProductUnit,
} from '@/types/models';
import { AutoSuggestInput } from '@/components/AutoSuggestInput';
import { ImageDropzone } from '@/components/ImageDropzone';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Switch } from '@/components/Switch';
import { formatVND } from '@/utils/format';
import { getImage, saveImage } from '@/utils/imageStorage';
import { productCoverPath } from '@/utils/imagePaths';

type SaveProductInput = Parameters<typeof import('@/features/products/productStore').saveProduct>[0];

interface Suggestions {
  category: string[];
  productName: string[];
  specKey: string[];
  specValue: string[];
  accessoryName: string[];
}

interface Props {
  editing: ProductRecord | null;
  suggestions: Suggestions;
  onSave: (p: SaveProductInput) => Promise<unknown>;
  onCancel: () => void;
}

interface FixedAccessoryPackageForm {
  name: string;
  items: Array<{ name: string; quantity: number }>;
  packageQuantity: number;
  unitPriceVnd: number;
}

interface ExtraAccessoryForm {
  id: string;
  name: string;
  unit: ProductUnit;
  quantity: number;
  weight: number;
  unitPrice: number;
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

const DEFAULT_FIXED_PACKAGE: FixedAccessoryPackageForm = {
  name: 'Bộ phụ kiện đi kèm',
  items: [
    { name: 'Khóa', quantity: 0 },
    { name: 'Bản lề', quantity: 4 },
    { name: 'Tay nắm', quantity: 0 },
    { name: 'Vật tư phụ', quantity: 0 },
  ],
  packageQuantity: 1,
  unitPriceVnd: 0,
};

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

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

function calculateExtraAmount(acc: ExtraAccessoryForm): number {
  const basis = acc.unit === 'BO' ? Number(acc.quantity || 0) : Number(acc.weight || 0);
  return Math.round(basis * Number(acc.unitPrice || 0));
}

function normalizeFixedPackage(editing: ProductRecord | null): FixedAccessoryPackageForm {
  const parsed = parseJson<Record<string, unknown> | null>(editing?.fixedAccessoryPackage, null);
  if (!parsed) return { ...DEFAULT_FIXED_PACKAGE, items: [...DEFAULT_FIXED_PACKAGE.items] };
  const items = Array.isArray(parsed.items)
    ? parsed.items.map((item) => {
        const row = item as { name?: unknown; quantity?: unknown };
        return { name: String(row.name || ''), quantity: Number(row.quantity || 0) };
      })
    : [];
  const packageQuantity = Number(parsed.packageQuantity ?? parsed.quantity ?? 1) || 1;
  const unitPriceVnd = Number(parsed.unitPriceVnd ?? parsed.unitPrice ?? 0) || 0;
  return {
    name: String(parsed.name || DEFAULT_FIXED_PACKAGE.name),
    items,
    packageQuantity,
    unitPriceVnd,
  };
}

function normalizeExtraAccessories(editing: ProductRecord | null): ExtraAccessoryForm[] {
  const parsed = parseJson<unknown[]>(editing?.extraAccessories, []);
  return Array.isArray(parsed)
    ? parsed.map((item) => {
        const row = item as Record<string, unknown>;
        const unit = row.unit === 'M2' || row.unit === 'METER' || row.unit === 'BO'
          ? row.unit
          : 'BO';
        return {
          id: String(row.id || crypto.randomUUID()),
          name: String(row.name || ''),
          unit,
          quantity: Number(row.quantity || 1),
          weight: Number(row.weight ?? row.kl ?? 0),
          unitPrice: Number(row.unitPrice ?? row.unitPriceVnd ?? 0),
        };
      })
    : [];
}

function normalizeSpecs(editing: ProductRecord | null): ProductSpecRecord[] {
  if (editing?.specs?.length) return editing.specs.map((spec) => ({ ...spec }));
  return DEFAULT_SPEC_KEYS.map((key, sortOrder) => ({ key, value: '', sortOrder }));
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
  const [fixedPackage, setFixedPackage] = useState<FixedAccessoryPackageForm>(() =>
    normalizeFixedPackage(editing),
  );
  const [extraAccessories, setExtraAccessories] = useState<ExtraAccessoryForm[]>(() =>
    normalizeExtraAccessories(editing),
  );
  const [isFeatured, setIsFeatured] = useState(Boolean(editing?.isFeatured));
  const [isPublic, setIsPublic] = useState(editing?.isPublic !== false);
  const [saving, setSaving] = useState(false);

  const fixedPackageTotal = fixedPackage.packageQuantity * fixedPackage.unitPriceVnd;
  const extraTotal = useMemo(
    () => extraAccessories.reduce((sum, item) => sum + calculateExtraAmount(item), 0),
    [extraAccessories],
  );

  const canSave = name.trim() !== '' && code.trim() !== '';

  const updateSpec = (index: number, patch: Partial<ProductSpecRecord>) =>
    setSpecs((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const updateAccessory = (index: number, patch: Partial<ProductAccessoryRecord>) =>
    setAccessories((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const updateExtra = (index: number, patch: Partial<ExtraAccessoryForm>) =>
    setExtraAccessories((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

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
      const fixedAccessoryPackage = JSON.stringify({
        name: fixedPackage.name.trim() || DEFAULT_FIXED_PACKAGE.name,
        items: fixedPackage.items.filter((item) => item.name.trim()),
        packageQuantity: Number(fixedPackage.packageQuantity || 1),
        unit: 'BO',
        unitPrice: Number(fixedPackage.unitPriceVnd || 0),
        unitPriceVnd: Number(fixedPackage.unitPriceVnd || 0),
        total: fixedPackageTotal,
        totalVnd: fixedPackageTotal,
      });
      const extraAccessoriesJson = JSON.stringify(
        extraAccessories
          .filter((item) => item.name.trim())
          .map((item, sortOrder) => {
            const amount = calculateExtraAmount(item);
            return {
              id: item.id,
              name: item.name.trim(),
              unit: item.unit,
              quantity: Number(item.quantity || 1),
              weight: Number(item.weight || 0),
              unitPrice: Number(item.unitPrice || 0),
              amount,
              total: amount,
              sortOrder,
            };
          }),
      );

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
            <input
              className="input"
              type="number"
              inputMode="numeric"
              value={unitPriceVnd || ''}
              onChange={(e) => setUnitPriceVnd(Number(e.target.value) || 0)}
            />
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
                  suggestions={suggestions.specValue}
                />
                <button className="icon-btn danger" type="button" onClick={() => setSpecs(specs.filter((_, i) => i !== index))}>
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>

          <SectionHeader title="Phụ kiện legacy" onAdd={() => setAccessories([...accessories, { name: '', quantityPerSet: 1, unitPriceVnd: 0, note: null }])} />
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
                  <input className="input" type="number" value={item.unitPriceVnd || ''} onChange={(e) => updateAccessory(index, { unitPriceVnd: Number(e.target.value) || 0 })} />
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
        <div>
          <SectionHeader
            title="Bộ phụ kiện cố định"
            onAdd={() => setFixedPackage({ ...fixedPackage, items: [...fixedPackage.items, { name: '', quantity: 0 }] })}
          />
          <AutoSuggestInput
            label="Tên bộ phụ kiện"
            value={fixedPackage.name}
            onChange={(value) => setFixedPackage({ ...fixedPackage, name: value })}
            suggestions={suggestions.accessoryName}
          />
          <div className="two-col" style={{ gap: 12 }}>
            <div className="field">
              <label>Số lượng bộ</label>
              <input className="input" type="number" value={fixedPackage.packageQuantity || ''} onChange={(e) => setFixedPackage({ ...fixedPackage, packageQuantity: Number(e.target.value) || 1 })} />
            </div>
            <div className="field">
              <label>Đơn giá bộ</label>
              <input className="input" type="number" value={fixedPackage.unitPriceVnd || ''} onChange={(e) => setFixedPackage({ ...fixedPackage, unitPriceVnd: Number(e.target.value) || 0 })} />
            </div>
          </div>
          {fixedPackage.items.map((item, index) => (
            <div key={index} className="switch-row" style={{ alignItems: 'flex-end' }}>
              <AutoSuggestInput
                label="Món"
                value={item.name}
                onChange={(value) => {
                  const items = [...fixedPackage.items];
                  items[index] = { ...items[index], name: value };
                  setFixedPackage({ ...fixedPackage, items });
                }}
                suggestions={suggestions.accessoryName}
              />
              <div className="field">
                <label>SL</label>
                <input
                  className="input"
                  type="number"
                  value={item.quantity}
                  onChange={(e) => {
                    const items = [...fixedPackage.items];
                    items[index] = { ...items[index], quantity: Number(e.target.value) || 0 };
                    setFixedPackage({ ...fixedPackage, items });
                  }}
                />
              </div>
              <button className="icon-btn danger" type="button" onClick={() => setFixedPackage({ ...fixedPackage, items: fixedPackage.items.filter((_, i) => i !== index) })}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <div className="product-sub">Thành tiền bộ: {formatVND(fixedPackageTotal)}</div>
        </div>

        <div>
          <SectionHeader
            title="Phụ kiện phát sinh"
            onAdd={() =>
              setExtraAccessories([
                ...extraAccessories,
                { id: crypto.randomUUID(), name: '', unit: 'BO', quantity: 1, weight: 0, unitPrice: 0 },
              ])
            }
          />
          {extraAccessories.map((item, index) => (
            <div key={item.id} className="stack" style={{ borderBottom: '1px solid var(--ios-separator)', paddingBottom: 8, marginBottom: 8 }}>
              <div className="switch-row" style={{ alignItems: 'flex-end' }}>
                <AutoSuggestInput
                  label="Tên"
                  value={item.name}
                  onChange={(value) => updateExtra(index, { name: value })}
                  suggestions={suggestions.accessoryName}
                />
                <div className="field">
                  <label>DV</label>
                  <select className="input" value={item.unit} onChange={(e) => updateExtra(index, { unit: e.target.value as ProductUnit })}>
                    <option value="BO">Bộ</option>
                    <option value="M2">m²</option>
                    <option value="METER">md</option>
                  </select>
                </div>
                <button className="icon-btn danger" type="button" onClick={() => setExtraAccessories(extraAccessories.filter((_, i) => i !== index))}>
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="two-col" style={{ gap: 12 }}>
                <div className="field">
                  <label>Số lượng</label>
                  <input className="input" type="number" value={item.quantity || ''} onChange={(e) => updateExtra(index, { quantity: Number(e.target.value) || 1 })} />
                </div>
                <div className="field">
                  <label>KL</label>
                  <input className="input" type="number" step="0.001" value={item.weight || ''} onChange={(e) => updateExtra(index, { weight: Number(e.target.value) || 0 })} />
                </div>
                <div className="field">
                  <label>Đơn giá</label>
                  <input className="input" type="number" value={item.unitPrice || ''} onChange={(e) => updateExtra(index, { unitPrice: Number(e.target.value) || 0 })} />
                </div>
                <div className="field">
                  <label>Thành tiền</label>
                  <div className="input" style={{ color: 'var(--ios-gray1)' }}>{formatVND(calculateExtraAmount(item))}</div>
                </div>
              </div>
            </div>
          ))}
          <div className="product-sub">Tổng phụ kiện phát sinh: {formatVND(extraTotal)}</div>
        </div>
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
