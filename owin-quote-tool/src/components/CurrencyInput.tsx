import { useState } from 'react';
import type { InputHTMLAttributes } from 'react';
import { formatSoVND } from '@/utils/format';

interface CurrencyInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: number;
  onChange: (value: number) => void;
}

function parseCurrencyInput(value: string): number {
  const digits = value.replace(/\D/g, '');
  return digits ? Number(digits) : 0;
}

export function CurrencyInput({
  value,
  onChange,
  className = 'input',
  onBlur,
  ...props
}: CurrencyInputProps) {
  const [draftValue, setDraftValue] = useState<string | null>(null);
  const displayValue = draftValue ?? (value > 0 ? formatSoVND(value) : '');

  return (
    <input
      {...props}
      className={className}
      inputMode="numeric"
      type="text"
      value={displayValue}
      onChange={(event) => {
        const parsed = parseCurrencyInput(event.target.value);
        setDraftValue(parsed > 0 ? formatSoVND(parsed) : '');
        onChange(parsed);
      }}
      onBlur={(event) => {
        setDraftValue(null);
        onBlur?.(event);
      }}
    />
  );
}
