import { useId, type ReactNode } from "react";

export interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  id?: string;
}

export function Toggle({ checked, onChange, label, description, disabled, id }: ToggleProps) {
  const autoId = useId();
  const btnId = id ?? autoId;
  const button = (
    <button
      id={btnId}
      type="button"
      role="switch"
      aria-checked={checked}
      className="zw-toggle"
      data-on={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    />
  );
  if (!label && !description) return button;
  return (
    <div className="flex items-start gap-3">
      {button}
      <div className="flex-1 min-w-0">
        {label && (
          <label htmlFor={btnId} className="block text-sm text-[color:var(--zw-text-1)] cursor-pointer">
            {label}
          </label>
        )}
        {description && (
          <div className="text-xs text-[color:var(--zw-text-2)] mt-0.5">{description}</div>
        )}
      </div>
    </div>
  );
}
