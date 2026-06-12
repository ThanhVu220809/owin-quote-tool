import { useId } from 'react';

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Các giá trị đã nhập trước đó (rút từ catalog) để gợi ý. */
  suggestions: string[];
  placeholder?: string;
}

/**
 * Ô nhập có auto-suggest. Dùng <datalist> gốc: gõ phần đầu từ đã nhập trước →
 * trình duyệt hiện gợi ý khớp (TEST 3.2).
 */
export function AutoSuggestInput({ label, value, onChange, suggestions, placeholder }: Props) {
  const listId = useId();
  // Loại trùng + bỏ rỗng.
  const uniq = Array.from(new Set(suggestions.filter((s) => s && s.trim())));
  return (
    <div className="field">
      <label>{label}</label>
      <input
        className="input"
        list={listId}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={listId}>
        {uniq.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}
