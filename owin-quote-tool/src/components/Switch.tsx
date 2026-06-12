interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  'aria-label'?: string;
}

/** iOS toggle switch (xanh #34C759 khi bật). */
export function Switch({ checked, onChange, ...rest }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={rest['aria-label']}
      className={`switch ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="knob" />
    </button>
  );
}
