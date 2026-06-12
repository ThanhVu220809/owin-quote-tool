import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { Product, Accessory, DVT } from '@/types/models';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Switch } from '@/components/Switch';
import { AutoSuggestInput } from '@/components/AutoSuggestInput';
import { ImageDropzone } from '@/components/ImageDropzone';

const DVT_OPTIONS: { label: string; value: DVT }[] = [
  { label: 'm²', value: 'm²' },
  { label: 'Bộ', value: 'Bộ' },
  { label: 'md', value: 'md' },
];

interface Suggestions {
  mau: string[];
  heNhom: string[];
  khungBao: string[];
  banCanh: string[];
  kinh: string[];
}

interface Props {
  editing: Product | null;
  suggestions: Suggestions;
  onSave: (p: Parameters<typeof import('@/features/products/productStore').saveProduct>[0]) => Promise<unknown>;
  onCancel: () => void;
}

const emptyForm = {
  dvt: 'm²' as DVT,
  ten: '',
  ma: '',
  donGiaGoc: 0,
  rongMacDinh: undefined as number | undefined,
  caoMacDinh: undefined as number | undefined,
  imageId: undefined as string | undefined,
  mau: '',
  heNhom: '',
  khungBao: '',
  banCanh: '',
  kinh: '',
  accessories: [] as Accessory[],
};

export function ProductForm({ editing, suggestions, onSave, onCancel }: Props) {
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) {
      setForm({
        dvt: editing.dvt,
        ten: editing.ten,
        ma: editing.ma,
        donGiaGoc: editing.donGiaGoc,
        rongMacDinh: editing.rongMacDinh,
        caoMacDinh: editing.caoMacDinh,
        imageId: editing.imageId,
        mau: editing.mau ?? '',
        heNhom: editing.heNhom ?? '',
        khungBao: editing.khungBao ?? '',
        banCanh: editing.banCanh ?? '',
        kinh: editing.kinh ?? '',
        accessories: editing.accessories.map((a) => ({ ...a })),
      });
    } else {
      setForm({ ...emptyForm, accessories: [] });
    }
  }, [editing]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const showDims = form.dvt !== 'Bộ'; // Hệ Bộ không dùng rộng/cao (BR-3)

  const addAccessory = () =>
    set('accessories', [
      ...form.accessories,
      { id: crypto.randomUUID(), ten: '', donGia: 0, sl: 1, enabled: true },
    ]);

  const updateAccessory = (id: string, patch: Partial<Accessory>) =>
    set(
      'accessories',
      form.accessories.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    );

  const removeAccessory = (id: string) =>
    set('accessories', form.accessories.filter((a) => a.id !== id));

  const canSave = form.ten.trim() !== '' && form.ma.trim() !== '';

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave({
        id: editing?.id,
        dvt: form.dvt,
        ten: form.ten.trim(),
        ma: form.ma.trim().toUpperCase(),
        donGiaGoc: Number(form.donGiaGoc) || 0,
        rongMacDinh: showDims ? form.rongMacDinh : undefined,
        caoMacDinh: showDims ? form.caoMacDinh : undefined,
        imageId: form.imageId,
        mau: form.mau || undefined,
        heNhom: form.heNhom || undefined,
        khungBao: form.khungBao || undefined,
        banCanh: form.banCanh || undefined,
        kinh: form.kinh || undefined,
        accessories: form.accessories,
      });
      onCancel();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      <div className="two-col">
        {/* CỘT TRÁI */}
        <div>
          <div className="field">
            <label>Đơn vị tính</label>
            <SegmentedControl
              options={DVT_OPTIONS}
              value={form.dvt}
              onChange={(v) => set('dvt', v)}
            />
          </div>

          <div className="field">
            <label>Tên sản phẩm</label>
            <input
              className="input"
              value={form.ten}
              onChange={(e) => set('ten', e.target.value)}
              placeholder="VD: Cửa sổ mở quay 1 cánh"
            />
          </div>

          <div className="field">
            <label>Mã (tự viết HOA)</label>
            <input
              className="input"
              value={form.ma}
              onChange={(e) => set('ma', e.target.value.toUpperCase())}
              placeholder="VD: S1"
            />
          </div>

          <div className="field">
            <label>Đơn giá gốc (đ/{form.dvt})</label>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              value={form.donGiaGoc || ''}
              onChange={(e) => set('donGiaGoc', Number(e.target.value))}
              placeholder="2000000"
            />
          </div>

          {/* Rộng/Cao — ẩn mượt khi chọn Bộ (TEST 3.2) */}
          <div
            className={`collapsible ${showDims ? 'open' : 'closed'}`}
            aria-hidden={!showDims}
            data-testid="dims-collapsible"
          >
            <div className="two-col" style={{ gap: 12 }}>
              <div className="field">
                <label>Rộng mặc định (m)</label>
                <input
                  className="input"
                  type="number"
                  step="0.001"
                  value={form.rongMacDinh ?? ''}
                  onChange={(e) =>
                    set('rongMacDinh', e.target.value === '' ? undefined : Number(e.target.value))
                  }
                  placeholder="1.196"
                />
              </div>
              <div className="field">
                <label>Cao mặc định (m)</label>
                <input
                  className="input"
                  type="number"
                  step="0.001"
                  value={form.caoMacDinh ?? ''}
                  onChange={(e) =>
                    set('caoMacDinh', e.target.value === '' ? undefined : Number(e.target.value))
                  }
                  placeholder="1.796"
                />
              </div>
            </div>
          </div>

          <div className="field">
            <label>Ảnh sản phẩm</label>
            <ImageDropzone
              imageId={form.imageId}
              onImageStored={(id) => set('imageId', id)}
            />
          </div>
        </div>

        {/* CỘT PHẢI */}
        <div>
          <AutoSuggestInput
            label="Màu"
            value={form.mau}
            onChange={(v) => set('mau', v)}
            suggestions={suggestions.mau}
          />
          <AutoSuggestInput
            label="Hệ nhôm"
            value={form.heNhom}
            onChange={(v) => set('heNhom', v)}
            suggestions={suggestions.heNhom}
          />
          <AutoSuggestInput
            label="Khung bao"
            value={form.khungBao}
            onChange={(v) => set('khungBao', v)}
            suggestions={suggestions.khungBao}
          />
          <AutoSuggestInput
            label="Bản cánh"
            value={form.banCanh}
            onChange={(v) => set('banCanh', v)}
            suggestions={suggestions.banCanh}
          />
          <AutoSuggestInput
            label="Kính"
            value={form.kinh}
            onChange={(v) => set('kinh', v)}
            suggestions={suggestions.kinh}
          />

          <div className="field">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ margin: 0 }}>Phụ kiện</label>
              <button type="button" className="icon-btn" onClick={addAccessory} aria-label="Thêm phụ kiện">
                <Plus size={16} />
              </button>
            </div>
            {form.accessories.length === 0 && (
              <div className="product-sub" style={{ padding: '8px 0' }}>Chưa có phụ kiện</div>
            )}
            {form.accessories.map((a) => (
              <div key={a.id} className="switch-row" style={{ gap: 8 }}>
                <input
                  className="input"
                  style={{ flex: 2 }}
                  value={a.ten}
                  placeholder="Tên phụ kiện"
                  onChange={(e) => updateAccessory(a.id, { ten: e.target.value })}
                />
                <input
                  className="input"
                  style={{ flex: 1, width: 90 }}
                  type="number"
                  value={a.donGia || ''}
                  placeholder="Giá"
                  onChange={(e) => updateAccessory(a.id, { donGia: Number(e.target.value) })}
                />
                <Switch
                  checked={a.enabled}
                  onChange={(v) => updateAccessory(a.id, { enabled: v })}
                  aria-label={`Bật phụ kiện ${a.ten}`}
                />
                <button
                  type="button"
                  className="icon-btn danger"
                  onClick={() => removeAccessory(a.id)}
                  aria-label="Xoá phụ kiện"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="toolbar" style={{ marginTop: 16, marginBottom: 0 }}>
        <div className="spacer" />
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Huỷ
        </button>
        <button type="button" className="btn btn-primary" onClick={handleSave} disabled={!canSave || saving}>
          {saving ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Thêm sản phẩm'}
        </button>
      </div>
    </div>
  );
}
