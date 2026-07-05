import {
  forwardRef,
  useId,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";

export interface InputProps extends ComponentPropsWithoutRef<"input"> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  icon?: ReactNode;
  trailing?: ReactNode;
  wrapperClassName?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, icon, trailing, wrapperClassName, className, id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const cls = [
    "zw-input",
    icon ? "zw-input--with-icon" : "",
    trailing ? "zw-input--with-trailing" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className={wrapperClassName}>
      {label && (
        <label htmlFor={inputId} className="block text-xs text-[color:var(--zw-text-2)] mb-1.5">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <div
            className="absolute inset-y-0 left-0 flex items-center pl-3 text-[color:var(--zw-text-3)] pointer-events-none"
            aria-hidden
          >
            {icon}
          </div>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cls}
          data-error={error ? "true" : undefined}
          aria-invalid={error ? true : undefined}
          {...rest}
        />
        {trailing && (
          <div className="absolute inset-y-0 right-0 flex items-center pr-1.5">
            {trailing}
          </div>
        )}
      </div>
      {error ? (
        <div className="text-xs text-[color:var(--zw-error)] mt-1">{error}</div>
      ) : hint ? (
        <div className="text-xs text-[color:var(--zw-text-3)] mt-1">{hint}</div>
      ) : null}
    </div>
  );
});
