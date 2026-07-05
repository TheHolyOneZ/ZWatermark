import { useRef, type ReactNode } from "react";

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  hint?: string;
}

export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "md";
  ariaLabel?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: SegmentedProps<T>) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const idx = options.findIndex((o) => o.value === value);

  return (
    <div className="zw-segmented" role="radiogroup" aria-label={ariaLabel}>
      {options.map((opt, i) => (
        <button
          key={opt.value}
          ref={(el) => { refs.current[i] = el; }}
          role="radio"
          aria-checked={opt.value === value}
          data-active={opt.value === value}
          title={opt.hint}
          onClick={() => onChange(opt.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowDown") {
              e.preventDefault();
              const next = (idx + 1) % options.length;
              onChange(options[next].value);
              refs.current[next]?.focus();
            } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
              e.preventDefault();
              const prev = (idx - 1 + options.length) % options.length;
              onChange(options[prev].value);
              refs.current[prev]?.focus();
            }
          }}
        >
          {opt.icon && <span aria-hidden>{opt.icon}</span>}
          {opt.label}
        </button>
      ))}
    </div>
  );
}
