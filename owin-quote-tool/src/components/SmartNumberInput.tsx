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
 * Ô số thông minh — không khoá 4 chữ số.
 * - Xóa hết → 0 (calc), ô trống để gõ tiếp
 * - Tiền: gõ thuần 1023000 → blur thành 1.023.000
 * - Không select-all (tránh gõ đè mất số)
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
  /** null = không đang gõ; string = draft */
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
      // Không giới hạn độ dài HTML — tiền VN có thể 8–12 chữ số
      maxLength={undefined}
      placeholder={placeholder}
      value={display}
      onFocus={(event) => {
        // Draft = chữ số thuần khi đang sửa tiền/int (không chấm nghìn).
        let start = '';
        if (value != null && Number.isFinite(value) && value !== 0) {
          if (mode === 'currency' || mode === 'int') {
            start = String(Math.trunc(Math.abs(value)));
            if (value < 0) start = `-${start}`;
          } else {
            start = formatSmartNumber(value, opts);
          }
        }
        setDraft(start);
        onFocus?.(event);
      }}
      onChange={(event) => {
        const cleaned = sanitizeSmartDraft(event.target.value, mode);
        setDraft(cleaned);
        commit(cleaned);
      }}
      onBlur={(event) => {
        const n = commit(draft ?? '');
        setDraft(null);
        onChange(n);
        onBlur?.(event);
      }}
    />
  );
}
