import type { InputHTMLAttributes } from 'react';
import { SmartNumberInput } from './SmartNumberInput';

interface CurrencyInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'min' | 'max'> {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}

/**
 * Ô tiền VND thông minh (wrapper SmartNumberInput mode=currency).
 * Xóa hết → 0; gõ tiếp từ ô trống; chấm nghìn khi blur.
 */
export function CurrencyInput({ value, onChange, ...props }: CurrencyInputProps) {
  return (
    <SmartNumberInput
      {...props}
      mode="currency"
      value={value}
      onChange={onChange}
      min={0}
      placeholder={props.placeholder ?? '0'}
    />
  );
}
