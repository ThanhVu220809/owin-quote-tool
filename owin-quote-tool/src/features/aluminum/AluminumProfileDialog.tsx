import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { CurrencyInput } from '@/components/CurrencyInput';
import { ImageDropzone } from '@/components/ImageDropzone';
import type { AddAluminumProfileInput } from '@/features/aluminum/aluminumPageActions';

function newProfileId(): string {
  return crypto.randomUUID();
}

/** Form thêm một cây nhôm vào hệ đang chọn, dùng lại upload ảnh của sản phẩm. */
export function AluminumProfileDialog({
  systemName,
  onClose,
  onSave,
}: {
  systemName: string;
  onClose: () => void;
  onSave: (input: AddAluminumProfileInput) => void;
}) {
  const [image, setImage] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [unitPrice, setUnitPrice] = useState(0);
  const normalizedCode = code.trim().toUpperCase();
  const canSave = normalizedCode.startsWith('OWIN-') && description.trim() !== '' && unitPrice > 0;

  const save = () => {
    if (!canSave) return;
    onSave({
      id: newProfileId(),
      image,
      code: normalizedCode,
      description: description.trim(),
      unitPrice,
    });
  };

  return (
    <div className="aluminum-profile-backdrop" role="presentation" onClick={onClose}>
      <section
        className="aluminum-profile-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="aluminum-profile-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="aluminum-profile-dialog-header">
          <div>
            <span>Hệ nhôm: {systemName}</span>
            <h2 id="aluminum-profile-dialog-title">Thêm loại nhôm mới</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Đóng form thêm loại nhôm">
            <X size={18} />
          </button>
        </header>

        <div className="aluminum-profile-dialog-body">
          <div className="aluminum-profile-image-field">
            <label>Hình</label>
            <ImageDropzone
              imagePath={image}
              onImageStored={setImage}
              pasteScope="form"
              pendingWorkScope="aluminum"
            />
          </div>
          <div className="aluminum-profile-form-fields">
            <label className="field">
              <span>Mã cây (OWIN - STT)</span>
              <input
                className="input"
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                placeholder="OWIN-XXXX"
                autoFocus
              />
              {code.trim() && !normalizedCode.startsWith('OWIN-') ? (
                <small className="aluminum-profile-error">Mã cây phải bắt đầu bằng OWIN-.</small>
              ) : null}
            </label>
            <label className="field">
              <span>Mô tả</span>
              <input
                className="input"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Ví dụ: Khung bao cửa đi"
              />
            </label>
            <div className="field">
              <label>Đơn giá</label>
              <CurrencyInput value={unitPrice} onChange={setUnitPrice} placeholder="0" />
            </div>
          </div>
        </div>

        <footer className="aluminum-profile-dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Huỷ</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={!canSave}>
            <Plus size={16} /> Thêm loại nhôm
          </button>
        </footer>
      </section>
    </div>
  );
}
