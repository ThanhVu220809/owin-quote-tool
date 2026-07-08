import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Các giá trị đã nhập trước đó (rút từ catalog) để gợi ý. */
  suggestions: string[];
  placeholder?: string;
  onSelect?: (value: string) => void;
  disabled?: boolean;
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('vi')
    .trim();
}

export function AutoSuggestInput({
  label,
  value,
  onChange,
  suggestions,
  placeholder,
  onSelect,
  disabled,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const uniqueSuggestions = useMemo(
    () => Array.from(new Set(suggestions.map((s) => s.trim()).filter(Boolean))),
    [suggestions],
  );
  const filtered = useMemo(() => {
    const query = normalize(value);
    const ranked = uniqueSuggestions
      .map((item, index) => ({ item, index, normalized: normalize(item) }))
      .filter(({ normalized }) => !query || normalized.includes(query))
      .sort((a, b) => {
        const aStarts = query && a.normalized.startsWith(query) ? 0 : 1;
        const bStarts = query && b.normalized.startsWith(query) ? 0 : 1;
        return aStarts - bStarts || a.index - b.index;
      })
      .slice(0, 12)
      .map(({ item }) => item);
    return ranked;
  }, [uniqueSuggestions, value]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const selectSuggestion = (item: string) => {
    onChange(item);
    onSelect?.(item);
    setOpen(false);
    setHighlighted(-1);
  };

  return (
    <div className="field autosuggest" ref={containerRef}>
      <label>{label}</label>
      <div className="autosuggest-control">
        <input
          className="input"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onFocus={() => !disabled && setOpen(true)}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
            setHighlighted(-1);
          }}
          onKeyDown={(event) => {
            if (disabled) return;
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setOpen(true);
              setHighlighted((current) => (current + 1 < filtered.length ? current + 1 : 0));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setHighlighted((current) => (current - 1 >= 0 ? current - 1 : filtered.length - 1));
            } else if (event.key === 'Enter' && open && highlighted >= 0 && filtered[highlighted]) {
              event.preventDefault();
              selectSuggestion(filtered[highlighted]);
            } else if (event.key === 'Escape') {
              setOpen(false);
            }
          }}
        />
        <button
          className="autosuggest-toggle"
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => setOpen((current) => !current)}
          aria-label={`Gợi ý ${label}`}
        >
          <ChevronDown size={16} />
        </button>
      </div>
      {open && filtered.length > 0 && !disabled && (
        <div className="autosuggest-menu">
          {filtered.map((item, index) => (
            <button
              key={item}
              type="button"
              className={index === highlighted ? 'active' : ''}
              onMouseEnter={() => setHighlighted(index)}
              onClick={() => selectSuggestion(item)}
            >
              {item}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
