import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export interface SelectOption<T extends string> {
  value: T;
  label: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}

export interface SelectProps<T extends string> {
  value: T | "";
  onChange: (v: T) => void;
  options: SelectOption<T>[];
  placeholder?: ReactNode;
  emptyLabel?: ReactNode;
  ariaLabel?: string;
  disabled?: boolean;
  wrapperClassName?: string;
  buttonClassName?: string;
  minWidth?: number;
  maxHeight?: number;
  allowClear?: boolean;
  clearLabel?: ReactNode;
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  placeholder = "Select…",
  emptyLabel = "No options",
  ariaLabel,
  disabled,
  wrapperClassName,
  buttonClassName,
  minWidth = 200,
  maxHeight = 320,
  allowClear = false,
  clearLabel = "None",
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);

  const selected = options.find((o) => o.value === value);

  const updateRect = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, minWidth) });
  }, [minWidth]);

  useLayoutEffect(() => {
    if (!open) return;
    updateRect();
    const onScroll = () => updateRect();
    const onResize = () => updateRect();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, updateRect]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); setOpen(false); btnRef.current?.focus(); return; }
      const items = allowClear ? [null, ...options] : options;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(items.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "Home") {
        e.preventDefault();
        setActiveIdx(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setActiveIdx(items.length - 1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const chosen = items[activeIdx];
        if (chosen === null) {
          onChange("" as T);
        } else if (chosen && !chosen.disabled) {
          onChange(chosen.value);
        }
        setOpen(false);
        btnRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, options, allowClear, activeIdx, onChange]);

  useEffect(() => {
    if (!open) return;
    const items = allowClear ? [null, ...options] : options;
    const idx = items.findIndex((o) => (o === null ? value === "" : o.value === value));
    setActiveIdx(Math.max(0, idx));
  }, [open, options, value, allowClear]);

  return (
    <div className={wrapperClassName}>
      <button
        ref={btnRef}
        type="button"
        className={["zw-select-btn", buttonClassName ?? ""].filter(Boolean).join(" ")}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <span className="zw-select-btn-body">
          {selected ? (
            <>
              {selected.icon && <span className="zw-select-btn-icon">{selected.icon}</span>}
              <span className="zw-select-btn-label">{selected.label}</span>
              {selected.hint && (
                <span className="zw-select-btn-hint">{selected.hint}</span>
              )}
            </>
          ) : (
            <span className="zw-select-btn-placeholder">{placeholder}</span>
          )}
        </span>
        <ChevronDown size={14} className="zw-select-btn-caret" aria-hidden />
      </button>

      {open && rect && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          className="zw-select-menu"
          style={{
            position: "fixed",
            top: rect.top,
            left: rect.left,
            width: rect.width,
            maxHeight,
          }}
        >
          {options.length === 0 && (
            <div className="zw-select-empty">{emptyLabel}</div>
          )}
          {allowClear && (
            <button
              type="button"
              role="option"
              aria-selected={value === ""}
              className="zw-select-option"
              data-active={activeIdx === 0 ? "true" : undefined}
              onMouseEnter={() => setActiveIdx(0)}
              onClick={() => { onChange("" as T); setOpen(false); btnRef.current?.focus(); }}
            >
              <span className="zw-select-option-body">
                <span className="zw-select-option-label zw-select-option--muted">{clearLabel}</span>
              </span>
              {value === "" && <Check size={12} aria-hidden />}
            </button>
          )}
          {options.map((opt, i) => {
            const idx = allowClear ? i + 1 : i;
            const isActive = activeIdx === idx;
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                disabled={opt.disabled}
                className="zw-select-option"
                data-active={isActive ? "true" : undefined}
                onMouseEnter={() => setActiveIdx(idx)}
                onClick={() => {
                  if (opt.disabled) return;
                  onChange(opt.value);
                  setOpen(false);
                  btnRef.current?.focus();
                }}
              >
                <span className="zw-select-option-body">
                  {opt.icon && <span className="zw-select-option-icon">{opt.icon}</span>}
                  <span className="zw-select-option-label">{opt.label}</span>
                  {opt.hint && <span className="zw-select-option-hint">{opt.hint}</span>}
                </span>
                {isSelected && <Check size={12} aria-hidden />}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
