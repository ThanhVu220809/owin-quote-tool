import { useEffect, useState } from 'react';
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
  const [displayValue, setDisplayValue] = useState('');

  useEffect(() => {
    setDisplayValue(value > 0 ? formatSoVND(value) : '');
  }, [value]);

  return (
    <input
      {...props}
      className={className}
      inputMode="numeric"
      type="text"
      value={displayValue}
      onChange={(event) => {
        const parsed = parseCurrencyInput(event.target.value);
        setDisplayValue(parsed > 0 ? formatSoVND(parsed) : '');
        onChange(parsed);
      }}
      onBlur={(event) => {
        setDisplayValue(value > 0 ? formatSoVND(value) : '');
        onBlur?.(event);
      }}
    />
  );
}
