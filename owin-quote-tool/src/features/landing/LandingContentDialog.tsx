import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { ImageDropzone } from '@/components/ImageDropzone';
import { canManageMembers, useCurrentStore } from '@/features/auth/currentStoreContext';
import {
  LANDING_CONTENT_KEY,
  emptyLandingContent,
  normalizeLandingContent,
  safeExternalUrl,
  safePhoneNumber,
  type LandingContent,
} from '@/features/landing/landingContent';
import {
  compareAndSwapHostedAppData,
  getHostedAppDataVersioned,
} from '@/services/supabase/sharedDataRepo';
import './landing.css';

type Section = keyof Pick<LandingContent, 'hero' | 'contact'>;

/**
 * Sửa nội dung trang công khai.
 *
 * Chỉ chủ và quản lý cửa hàng mở được. Nhân viên thường không thấy mục này
 * trong menu, và nếu mở được bằng đường khác thì form cũng ở chế độ chỉ đọc —
 * nhưng hàng rào thật nằm ở RLS, không phải ở đây.
 *
 * Ô nào để trống thì trang công khai dùng nội dung mặc định của nó. Đó là lý do
 * form này không ép nhập gì cả: điền dần từng phần vẫn ra một trang hoàn chỉnh.
 */
export function LandingContentDialog({ onClose }: { onClose: () => void }) {
  const { store, role } = useCurrentStore();
  const canEdit = canManageMembers(role);

  const [draft, setDraft] = useState<LandingContent>(emptyLandingContent);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose, saving]);

  useEffect(() => {
    let cancelled = false;
    getHostedAppDataVersioned<unknown>(LANDING_CONTENT_KEY)
      .then((snapshot) => {
        if (cancelled) return;
        setDraft(normalizeLandingContent(snapshot.data));
        setRevision(snapshot.revision);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError('Không tải được nội dung trang. Vui lòng thử lại.');
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const setField = (section: Section, field: string, value: string) => {
    setMessage('');
    setDraft((current) => ({ ...current, [section]: { ...current[section], [field]: value } }));
  };

  const save = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      // Lọc lại lần cuối trước khi ghi: ô nhập là văn bản tự do, còn mấy trường
      // này sẽ thành `href` trên trang công khai.
      const payload = normalizeLandingContent(draft);
      const saved = await compareAndSwapHostedAppData(LANDING_CONTENT_KEY, revision, payload);
      if (!saved) {
        // CAS trả rỗng nghĩa là có người khác vừa lưu. Đọc lại rồi báo người
        // dùng, đừng âm thầm ghi đè công sức của họ.
        const latest = await getHostedAppDataVersioned<unknown>(LANDING_CONTENT_KEY);
        setDraft(normalizeLandingContent(latest.data));
        setRevision(latest.revision);
        setError('Người khác vừa lưu nội dung mới. Màn hình đã tải lại bản mới nhất — kiểm rồi lưu lại.');
        return;
      }
      setDraft(normalizeLandingContent(saved.data));
      setRevision(saved.revision);
      setMessage('Đã lưu. Tải lại trang công khai để thấy thay đổi.');
    } catch {
      setError('Không lưu được nội dung trên Supabase. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  const field = (
    section: Section,
    name: string,
    label: string,
    hint?: string,
    multiline?: boolean,
  ) => {
    const id = `landing-${section}-${name}`;
    const value = (draft[section] as unknown as Record<string, string>)[name] ?? '';
    return (
      <div className="landing-field" key={id}>
        <label htmlFor={id}>{label}</label>
        {multiline ? (
          <textarea
            id={id}
            className="input"
            rows={3}
            value={value}
            disabled={!canEdit || saving}
            onChange={(event) => setField(section, name, event.target.value)}
          />
        ) : (
          <input
            id={id}
            className="input"
            value={value}
            disabled={!canEdit || saving}
            onChange={(event) => setField(section, name, event.target.value)}
          />
        )}
        {hint && <small>{hint}</small>}
      </div>
    );
  };

  return createPortal(
    <div className="store-admin-backdrop" role="presentation" onClick={() => !saving && onClose()}>
      <div
        className="store-admin landing-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Nội dung trang công khai"
        tabIndex={-1}
        ref={panelRef}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="store-admin-header">
          <div>
            <h2>Nội dung trang công khai</h2>
            <p>{store.name} · để trống ô nào thì trang dùng nội dung mặc định</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng"><X size={20} /></button>
        </header>

        {error && <p className="store-admin-error" role="alert">{error}</p>}
        {message && <p className="landing-ok" role="status">{message}</p>}
        {!canEdit && (
          <p className="store-admin-note">
            Chỉ chủ và quản lý cửa hàng mới sửa được nội dung này.
          </p>
        )}

        {loading ? (
          <p className="store-admin-empty">Đang tải…</p>
        ) : (
          <>
            <section className="store-admin-section">
              <h3>Phần mở đầu</h3>
              <div className="landing-grid">
                {field('hero', 'eyebrow', 'Dòng nhỏ phía trên', 'Ví dụ: Nhôm kính OWIN')}
                {field('hero', 'title', 'Tiêu đề lớn')}
                {field('hero', 'description', 'Mô tả ngắn', 'Một hai câu là đủ.', true)}
                {field('hero', 'primaryCta', 'Chữ trên nút chính', 'Ví dụ: Xem sản phẩm')}
                {field('hero', 'secondaryCta', 'Chữ trên nút phụ', 'Ví dụ: Gọi tư vấn')}
              </div>

              <div className="landing-field">
                <span className="landing-label">Ảnh phần mở đầu</span>
                <ImageDropzone
                  className="landing-image"
                  imagePath={draft.hero.imageUrl || null}
                  onImageStored={(url) => setField('hero', 'imageUrl', url)}
                />
                <small>Không có ảnh thì phần mở đầu chỉ có chữ, căn giữa.</small>
              </div>
            </section>

            <section className="store-admin-section">
              <h3>Liên hệ</h3>
              <div className="landing-grid">
                {field('contact', 'phone', 'Số điện thoại (để bấm gọi)', 'Chỉ chữ số, ví dụ 0912345678')}
                {field('contact', 'phoneLabel', 'Số hiển thị cho khách', 'Ví dụ: 0912 345 678')}
                {field('contact', 'zaloUrl', 'Liên kết Zalo', 'Phải bắt đầu bằng https://')}
                {field('contact', 'messengerUrl', 'Liên kết Messenger', 'Phải bắt đầu bằng https://')}
                {field('contact', 'address', 'Địa chỉ')}
                {field('contact', 'workingHours', 'Giờ làm việc', 'Ví dụ: 8:00–18:00, T2–T7')}
              </div>

              {draft.contact.phone && !safePhoneNumber(draft.contact.phone) && (
                <p className="landing-warn">Số điện thoại chưa đúng dạng — lưu xong sẽ bị bỏ trống.</p>
              )}
              {draft.contact.zaloUrl && !safeExternalUrl(draft.contact.zaloUrl) && (
                <p className="landing-warn">Liên kết Zalo phải bắt đầu bằng https:// — lưu xong sẽ bị bỏ trống.</p>
              )}
              {draft.contact.messengerUrl && !safeExternalUrl(draft.contact.messengerUrl) && (
                <p className="landing-warn">Liên kết Messenger phải bắt đầu bằng https:// — lưu xong sẽ bị bỏ trống.</p>
              )}
            </section>

            {canEdit && (
              <div className="landing-actions">
                <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
                  Đóng
                </button>
                <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={saving}>
                  {saving ? 'Đang lưu…' : 'Lưu nội dung'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
