import { useState } from 'react';
import type { InputHTMLAttributes } from 'react';
import {
  formatSmartNumber,
  parseSmartNumber,
  sanitizeSmartDraft,
  type SmartNumberMode,
} from '@/utils/smartNumber';

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type' | 'min' | 'max'
> & {
  value: number | null | undefined;
  onChange: (value: number) => void;
  /** int | decimal | currency — mặc định decimal */
  mode?: SmartNumberMode;
  /** Số chữ số thập phân (mode decimal). */
  decimals?: number;
  min?: number;
  max?: number;
};

/**
 * Ô số thông minh:
 * - Xóa hết → 0 (calc), ô để trống để gõ tiếp
 * - Không dùng type=number (tránh browser chặn xóa/ép 0)
 * - Format khi blur; khi focus giữ draft người dùng
 */
export function SmartNumberInput({
  value,
  onChange,
  mode = 'decimal',
  decimals = 3,
  min,
  max,
  className = 'input',
  onFocus,
  onBlur,
  placeholder = '0',
  ...props
}: Props) {
  const opts = { mode, decimals, min, max };
  /** null = không đang gõ (hiển thị từ value); string = draft người dùng */
  const [draft, setDraft] = useState<string | null>(null);

  const display =
    draft !== null ? draft : formatSmartNumber(value ?? 0, opts);

  const commit = (raw: string) => {
    const n = parseSmartNumber(raw, opts);
    onChange(n);
    return n;
  };

  return (
    <input
      {...props}
      className={className}
      type="text"
      inputMode={mode === 'decimal' ? 'decimal' : 'numeric'}
      autoComplete="off"
      placeholder={placeholder}
      value={display}
      onFocus={(event) => {
        // Bắt đầu draft từ giá trị hiện tại — 0 → "" để gõ số mới ngay.
        const start =
          value == null || !Number.isFinite(value) || value === 0
            ? ''
            : formatSmartNumber(value, opts);
        setDraft(start);
        onFocus?.(event);
        // Select all so typing replaces (optional power UX)
        requestAnimationFrame(() => {
          try {
            event.target.select();
          } catch {
            /* ignore */
          }
        });
      }}
      onChange={(event) => {
        const cleaned = sanitizeSmartDraft(event.target.value, mode);
        setDraft(cleaned);
        // Live commit number (empty → 0) so totals update while typing
        commit(cleaned);
      }}
      onBlur={(event) => {
        const n = commit(draft ?? '');
        setDraft(null);
        // Ensure parent sees clamped value; display reformats via value prop
        onChange(n);
        onBlur?.(event);
      }}
    />
  );
}
