import { Check, ChevronDown, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

export interface SearchableSelectOption {
  value: string;
  label: string;
}

interface Props {
  label: string;
  value: string;
  options: SearchableSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  loading?: boolean;
  required?: boolean;
}

/** iOS-style combobox: tap to search, then choose from a floating listbox. */
export function SearchableSelect({
  label,
  value,
  options,
  onChange,
  placeholder = '--Chọn--',
  searchPlaceholder = 'Gõ để tìm kiếm…',
  disabled = false,
  loading = false,
  required = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = options.find((option) => option.value === value);
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('vi');
    if (!normalizedQuery) return options;
    return options.filter((option) => option.label.toLocaleLowerCase('vi').includes(normalizedQuery));
  }, [options, query]);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  const openMenu = () => {
    if (disabled || loading) return;
    setQuery('');
    setOpen(true);
  };

  const selectOption = (nextValue: string) => {
    onChange(nextValue);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className="field ios-combobox" ref={containerRef}>
      <label>{label}{required && <span className="required-mark">*</span>}</label>
      <button
        type="button"
        className={`ios-combobox-trigger${open ? ' is-open' : ''}`}
        disabled={disabled || loading}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={openMenu}
      >
        <span className={`ios-combobox-value${selected ? '' : ' is-placeholder'}`}>
          {loading ? 'Đang tải…' : selected?.label || placeholder}
        </span>
        <ChevronDown size={17} aria-hidden="true" />
      </button>
      {open && (
        <div className="ios-combobox-menu" role="listbox" aria-label={label}>
          <div className="ios-combobox-search">
            <Search size={16} aria-hidden="true" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              aria-label={`Tìm ${label.toLocaleLowerCase('vi')}`}
            />
          </div>
          <div className="ios-combobox-options">
            {filteredOptions.length > 0 ? filteredOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={`ios-combobox-option${option.value === value ? ' is-selected' : ''}`}
                onClick={() => selectOption(option.value)}
              >
                <span>{option.label}</span>
                {option.value === value && <Check size={16} aria-hidden="true" />}
              </button>
            )) : (
              <div className="ios-combobox-empty">Không tìm thấy kết quả</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
