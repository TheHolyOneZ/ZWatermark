import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from "lucide-react";

export type ToastVariant = "success" | "error" | "warning" | "info";

interface Toast {
  id: number;
  variant: ToastVariant;
  title: ReactNode;
  description?: ReactNode;
  exiting?: boolean;
}

interface ToastContextValue {
  push: (t: Omit<Toast, "id">) => void;
  success: (title: ReactNode, description?: ReactNode) => void;
  error: (title: ReactNode, description?: ReactNode) => void;
  warning: (title: ReactNode, description?: ReactNode) => void;
  info: (title: ReactNode, description?: ReactNode) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const MAX = 5;
const AUTO_DISMISS_MS = 4500;

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 200);
  }, []);

  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = nextId++;
      setItems((prev) => {
        const next = [...prev, { ...t, id }];
        return next.length > MAX ? next.slice(next.length - MAX) : next;
      });
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  const api = useMemo<ToastContextValue>(
    () => ({
      push,
      success: (title, description) => push({ variant: "success", title, description }),
      error: (title, description) => push({ variant: "error", title, description }),
      warning: (title, description) => push({ variant: "warning", title, description }),
      info: (title, description) => push({ variant: "info", title, description }),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <Toaster items={items} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const ICONS: Record<ToastVariant, ReactNode> = {
  success: <CheckCircle2 size={16} />,
  error: <AlertCircle size={16} />,
  warning: <AlertTriangle size={16} />,
  info: <Info size={16} />,
};

interface ToasterProps {
  items: Toast[];
  onDismiss: (id: number) => void;
}

export function Toaster({ items, onDismiss }: ToasterProps) {
  useEffect(() => {

  }, []);
  return (
    <div
      className="fixed z-50 flex flex-col gap-2"
      style={{ top: 56, right: 20, pointerEvents: "none" }}
      role="region"
      aria-live="polite"
    >
      {items.map((t) => (
        <div
          key={t.id}
          className="zw-toast"
          data-variant={t.variant}
          data-exiting={t.exiting ? "true" : undefined}
          style={{ pointerEvents: "auto" }}
        >
          <div
            className="mt-0.5"
            style={{ color: `var(--zw-${t.variant})` }}
            aria-hidden
          >
            {ICONS[t.variant]}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-[color:var(--zw-text-1)]">{t.title}</div>
            {t.description && (
              <div className="text-xs text-[color:var(--zw-text-2)] mt-0.5">{t.description}</div>
            )}
          </div>
          <button
            className="text-[color:var(--zw-text-3)] hover:text-[color:var(--zw-text-1)]"
            onClick={() => onDismiss(t.id)}
            aria-label="Dismiss notification"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
