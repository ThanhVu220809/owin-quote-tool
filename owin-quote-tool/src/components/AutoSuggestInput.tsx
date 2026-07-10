import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { normalizeSuggestionText, rankSuggestionValues } from '@/lib/suggestionEngine';

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

function hiddenStorageKey(label: string): string {
  return `owin-hidden-suggestions:${label}`;
}

function readHiddenSuggestions(label: string): Set<string> {
  try {
    if (typeof window === 'undefined') return new Set();
    const raw = window.localStorage.getItem(hiddenStorageKey(label));
    const values = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(values) ? values.map(String) : []);
  } catch {
    return new Set();
  }
}

function writeHiddenSuggestions(label: string, values: Set<string>): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(hiddenStorageKey(label), JSON.stringify(Array.from(values)));
  } catch {
    // LocalStorage can be unavailable in privacy modes; suggestions still work.
  }
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
  const [hidden, setHidden] = useState<Set<string>>(() => readHiddenSuggestions(label));
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const uniqueSuggestions = useMemo(
    () => {
      const byNormalized = new Map<string, string>();
      suggestions
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((suggestion) => {
          const key = normalizeSuggestionText(suggestion);
          if (!byNormalized.has(key)) byNormalized.set(key, suggestion);
        });
      return Array.from(byNormalized.values());
    },
    [suggestions],
  );
  const filtered = useMemo(() => {
    const visible = uniqueSuggestions.filter((item) => !hidden.has(normalizeSuggestionText(item)));
    return rankSuggestionValues(value, visible, 14);
  }, [hidden, uniqueSuggestions, value]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    setHidden(readHiddenSuggestions(label));
  }, [label]);

  const updateMenuPosition = useCallback(() => {
    if (!containerRef.current || typeof window === 'undefined') return;
    const rect = containerRef.current.getBoundingClientRect();
    const gap = 6;
    const desiredHeight = Math.min(220, filtered.length * 38 + 12);
    const below = window.innerHeight - rect.bottom - gap;
    const above = rect.top - gap;
    const placeAbove = below < Math.min(desiredHeight, 170) && above > below;
    const available = Math.max(72, Math.min(placeAbove ? above : below, desiredHeight, 260));
    const top = placeAbove
      ? Math.max(gap, rect.top - gap - available)
      : Math.min(rect.bottom + gap, window.innerHeight - gap - available);

    setMenuStyle({
      left: rect.left,
      top,
      width: rect.width,
      maxHeight: available,
    });
  }, [filtered.length]);

  useEffect(() => {
    if (!open || filtered.length === 0) return undefined;
    updateMenuPosition();
    window.addEventListener('resize', updateMenuPosition);
    window.addEventListener('scroll', updateMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateMenuPosition);
      window.removeEventListener('scroll', updateMenuPosition, true);
    };
  }, [filtered.length, open, updateMenuPosition]);

  const selectSuggestion = (item: string) => {
    onChange(item);
    onSelect?.(item);
    setOpen(false);
    setHighlighted(-1);
  };

  const hideSuggestion = (item: string) => {
    const next = new Set(hidden);
    next.add(normalizeSuggestionText(item));
    setHidden(next);
    writeHiddenSuggestions(label, next);
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
        <div className="autosuggest-menu" style={menuStyle}>
          {filtered.map((item, index) => (
            <div key={item} className={`autosuggest-row ${index === highlighted ? 'active' : ''}`}>
              <button
                type="button"
                className="autosuggest-option"
                onMouseEnter={() => setHighlighted(index)}
                onClick={() => selectSuggestion(item)}
              >
                {item}
              </button>
              <button
                type="button"
                className="autosuggest-remove"
                aria-label={`Ẩn gợi ý ${item}`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  hideSuggestion(item);
                }}
              >
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
