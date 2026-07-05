import { forwardRef, useMemo, useState, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { Eye, EyeOff, Lock } from "lucide-react";
import { Input } from "./Input";

export interface PasswordInputProps extends Omit<ComponentPropsWithoutRef<"input">, "type"> {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  strengthMeter?: boolean;
  showIcon?: boolean;
}

interface ScoreInfo {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
}

const COMMON = new Set([
  "password", "123456", "qwerty", "letmein", "welcome", "admin", "iloveyou", "monkey",
  "abc123", "password1", "changeme", "1234", "12345678",
]);

function scorePassword(pw: string): ScoreInfo {
  if (!pw) return { score: 0, label: "" };
  const s = pw.toLowerCase();
  if (COMMON.has(s)) return { score: 0, label: "Common — pick another" };

  const hasLower = /[a-z]/.test(pw);
  const hasUpper = /[A-Z]/.test(pw);
  const hasNum = /[0-9]/.test(pw);
  const hasSym = /[^A-Za-z0-9]/.test(pw);
  const classes = [hasLower, hasUpper, hasNum, hasSym].filter(Boolean).length;

  let raw = 0;
  if (pw.length >= 8) raw += 1;
  if (pw.length >= 12) raw += 1;
  if (pw.length >= 16) raw += 1;
  if (classes >= 2) raw += 1;
  if (classes >= 3) raw += 1;
  if (classes >= 4) raw += 1;

  if (/(.)\1{2,}/.test(pw)) raw -= 1;
  if (/^\d+$/.test(pw)) raw -= 1;

  const clamped = Math.max(0, Math.min(4, Math.floor(raw / 1.5))) as 0 | 1 | 2 | 3 | 4;
  const labels = ["Very weak", "Weak", "Fair", "Strong", "Excellent"] as const;
  return { score: clamped, label: labels[clamped] };
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ strengthMeter, value, showIcon = true, ...rest }, ref) {
    const [visible, setVisible] = useState(false);
    const pw = typeof value === "string" ? value : "";
    const info = useMemo(() => (strengthMeter ? scorePassword(pw) : null), [pw, strengthMeter]);

    const trailing = (
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="zw-btn zw-btn--ghost zw-btn--sm"
        aria-label={visible ? "Hide password" : "Show password"}
        tabIndex={-1}
      >
        {visible ? <EyeOff size={14} /> : <Eye size={14} />}
      </button>
    );

    return (
      <div>
        <Input
          ref={ref}
          type={visible ? "text" : "password"}
          icon={showIcon ? <Lock size={14} /> : undefined}
          trailing={trailing}
          value={value}
          {...rest}
        />
        {strengthMeter && info && (
          <div className="mt-2">
            <div className="flex gap-1" aria-hidden>
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-1 flex-1 rounded"
                  style={{
                    background:
                      i <= info.score
                        ? info.score <= 1
                          ? "var(--zw-error)"
                          : info.score === 2
                          ? "var(--zw-warning)"
                          : "var(--zw-success)"
                        : "var(--zw-glass-3)",
                    transition: "background var(--zw-transition-fast)",
                  }}
                />
              ))}
            </div>
            {info.label && (
              <div className="text-xs text-[color:var(--zw-text-2)] mt-1.5">{info.label}</div>
            )}
          </div>
        )}
      </div>
    );
  },
);
