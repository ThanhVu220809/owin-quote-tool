import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ChevronDown, EyeOff, X } from 'lucide-react';
import { normalizeSuggestionText, rankSuggestionValues } from '@/lib/suggestionEngine';

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Field-specific suggestion pool only — never a global noisy bucket. */
  suggestions: string[];
  placeholder?: string;
  onSelect?: (value: string) => void;
  disabled?: boolean;
  /**
   * Unique field identity for hide-list storage (e.g. "spec-key", "spec-value-color").
   * Prevents unrelated fields from sharing hide state via the same label.
   */
  fieldKey?: string;
  /** When false, hide the in-field clear button (still never deletes rows). Default true. */
  allowClear?: boolean;
}

function hiddenStorageKey(fieldKey: string): string {
  return `owin-hidden-suggestions:${fieldKey}`;
}

function readHiddenSuggestions(fieldKey: string): Set<string> {
  try {
    if (typeof window === 'undefined') return new Set();
    const raw = window.localStorage.getItem(hiddenStorageKey(fieldKey));
    const values = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(values) ? values.map(String) : []);
  } catch {
    return new Set();
  }
}

function writeHiddenSuggestions(fieldKey: string, values: Set<string>): void {
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(hiddenStorageKey(fieldKey), JSON.stringify(Array.from(values)));
  } catch {
    // LocalStorage can be unavailable in privacy modes; suggestions still work.
  }
}

/**
 * Field autocomplete with isolated actions:
 * - clear-value (X inside input) → onChange('') ONLY — never deletes parent row
 * - hide-suggestion (EyeOff in dropdown) → hide bad suggestion — never clears value or deletes row
 * Row deletion is ONLY via parent trash button (onRemoveRow), never from this component.
 */
export function AutoSuggestInput({
  label,
  value,
  onChange,
  suggestions,
  placeholder,
  onSelect,
  disabled,
  fieldKey,
  allowClear = true,
}: Props) {
  const storageKey = fieldKey || label;
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [hidden, setHidden] = useState<Set<string>>(() => readHiddenSuggestions(storageKey));
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});

  const uniqueSuggestions = useMemo(() => {
    const byNormalized = new Map<string, string>();
    suggestions
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((suggestion) => {
        const key = normalizeSuggestionText(suggestion);
        if (!byNormalized.has(key)) byNormalized.set(key, suggestion);
      });
    return Array.from(byNormalized.values());
  }, [suggestions]);

  const filtered = useMemo(() => {
    const visible = uniqueSuggestions.filter((item) => !hidden.has(normalizeSuggestionText(item)));
    return rankSuggestionValues(value, visible, 12);
  }, [hidden, uniqueSuggestions, value]);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  useEffect(() => {
    setHidden(readHiddenSuggestions(storageKey));
  }, [storageKey]);

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
      width: Math.max(rect.width, 160),
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

  /** Clear current field value only — never calls any row-delete handler. */
  const clearValue = (event: ReactMouseEvent | ReactPointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if ('nativeEvent' in event && typeof event.nativeEvent.stopImmediatePropagation === 'function') {
      event.nativeEvent.stopImmediatePropagation();
    }
    onChange('');
    setOpen(false);
    setHighlighted(-1);
  };

  /** Hide a bad suggestion from the list — does not clear value or remove rows. */
  const hideSuggestion = (item: string, event: ReactMouseEvent | ReactPointerEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if ('nativeEvent' in event && typeof event.nativeEvent.stopImmediatePropagation === 'function') {
      event.nativeEvent.stopImmediatePropagation();
    }
    const next = new Set(hidden);
    next.add(normalizeSuggestionText(item));
    setHidden(next);
    writeHiddenSuggestions(storageKey, next);
    setHighlighted(-1);
  };

  const hasValue = Boolean(value.trim());
  const showClear = allowClear && hasValue && !disabled;

  return (
    <div className="field autosuggest" ref={containerRef} data-autosuggest-field={storageKey}>
      <label>{label}</label>
      <div className={`autosuggest-control${showClear ? ' has-value' : ''}`}>
        <input
          className="input"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
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
        {showClear && (
          <button
            className="autosuggest-clear"
            type="button"
            tabIndex={-1}
            aria-label={`Xóa giá trị ${label}`}
            title="Xóa giá trị (không xóa dòng)"
            data-action="clear-value"
            onPointerDown={clearValue}
            onMouseDown={clearValue}
            onClick={clearValue}
          >
            <X size={13} strokeWidth={2.5} />
          </button>
        )}
        <button
          className="autosuggest-toggle"
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setOpen((current) => !current);
          }}
          aria-label={`Gợi ý ${label}`}
        >
          <ChevronDown size={16} />
        </button>
      </div>
      {open && filtered.length > 0 && !disabled && (
        <div
          className="autosuggest-menu"
          style={menuStyle}
          role="listbox"
          onPointerDown={(event) => {
            // Keep menu interactions from bubbling to row trash / document handlers.
            event.stopPropagation();
          }}
        >
          {filtered.map((item, index) => (
            <div key={`${storageKey}-${item}`} className={`autosuggest-row ${index === highlighted ? 'active' : ''}`}>
              <button
                type="button"
                className="autosuggest-option"
                role="option"
                aria-selected={index === highlighted}
                onMouseEnter={() => setHighlighted(index)}
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  selectSuggestion(item);
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
              >
                {item}
              </button>
              <button
                type="button"
                className="autosuggest-hide"
                aria-label={`Ẩn gợi ý ${item}`}
                title="Ẩn gợi ý này (không xóa dòng)"
                data-action="hide-suggestion"
                onPointerDown={(event) => hideSuggestion(item, event)}
                onMouseDown={(event) => hideSuggestion(item, event)}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
              >
                <EyeOff size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
