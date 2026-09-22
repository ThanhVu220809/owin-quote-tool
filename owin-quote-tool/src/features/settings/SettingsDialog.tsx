import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Monitor, Moon, Sun, X } from 'lucide-react';
import type { Appearance } from '@/features/settings/appearance';
import { useAppearance } from '@/features/settings/appearance';
import {
  PAGINATED_FEATURES,
  setPaginationEnabled,
  usePaginationSettings,
} from '@/features/settings/paginationSettings';
import './settings.css';

const appearances: Array<{ value: Appearance; label: string; Icon: typeof Sun }> = [
  { value: 'light', label: 'Sáng', Icon: Sun },
  { value: 'dark', label: 'Tối', Icon: Moon },
  { value: 'system', label: 'Theo máy', Icon: Monitor },
];

/**
 * Hộp thoại Cài đặt mở từ menu tài khoản.
 *
 * Render qua portal ra <body>: thanh điều hướng có `backdrop-filter` nên nó là
 * containing block của con `position: fixed` — để nguyên tại chỗ thì lớp phủ bị
 * bó lại trong header.
 */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [appearance, setAppearance] = useAppearance();
  const pagination = usePaginationSettings();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', closeOnEscape);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [onClose]);

  return createPortal(
    <div className="settings-backdrop" role="presentation" onClick={onClose}>
      <div
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        tabIndex={-1}
        ref={panelRef}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="settings-header">
          <div>
            <div className="settings-kicker">Tài khoản</div>
            <h2 id="settings-title">Cài đặt</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
        </div>

        <div className="settings-body">
          <section className="settings-section">
            <h3>Giao diện</h3>
            <p className="settings-hint">Áp dụng cho thiết bị này. Tuỳ chọn được ghi nhớ cho lần mở sau.</p>
            <div className="settings-appearance" role="group" aria-label="Chế độ giao diện">
              {appearances.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={appearance === value}
                  onClick={() => setAppearance(value)}
                >
                  <Icon size={17} aria-hidden="true" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="settings-section">
            <h3>Phân trang</h3>
            <p className="settings-hint">Tắt thì danh sách hiện hết trong một trang, không còn thanh phân trang.</p>
            <ul className="settings-toggle-list">
              {PAGINATED_FEATURES.map(({ key, label }) => (
                <li key={key}>
                  <label className="settings-toggle">
                    <span>{label}</span>
                    <input
                      type="checkbox"
                      role="switch"
                      checked={pagination[key]}
                      onChange={(event) => setPaginationEnabled(key, event.target.checked)}
                    />
                    <span className="settings-switch" aria-hidden="true" />
                  </label>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="settings-footer">
          <button type="button" className="btn btn-primary" onClick={onClose}>Xong</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
