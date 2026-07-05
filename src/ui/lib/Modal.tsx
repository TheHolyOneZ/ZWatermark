import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "./Button";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  dismissible?: boolean;
  size?: "sm" | "md" | "lg";
}

const SIZE_PX: Record<NonNullable<ModalProps["size"]>, number> = {
  sm: 400,
  md: 560,
  lg: 760,
};

export function Modal({
  open,
  onClose,
  title,
  description,
  footer,
  children,
  dismissible = true,
  size = "md",
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const dismissibleRef = useRef(dismissible);
  onCloseRef.current = onClose;
  dismissibleRef.current = dismissible;

  const close = useCallback(() => {
    if (dismissibleRef.current) onCloseRef.current();
  }, []);

  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissibleRef.current) {
        e.preventDefault();
        onCloseRef.current();
      }
      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const focusTimer = window.setTimeout(() => {
      const explicit = dialogRef.current?.querySelector<HTMLElement>("[autofocus]");
      if (explicit) {
        explicit.focus();
        return;
      }
      const input = dialogRef.current?.querySelector<HTMLElement>(
        'input:not([type="hidden"]), textarea, select',
      );
      if (input) {
        input.focus();
        return;
      }
      dialogRef.current
        ?.querySelector<HTMLElement>(
          'button, [tabindex]:not([tabindex="-1"])',
        )
        ?.focus();
    }, 0);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.clearTimeout(focusTimer);
      previouslyFocused.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="zw-modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className="zw-modal"
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        style={{ maxWidth: SIZE_PX[size] }}
      >
        {(title || dismissible) && (
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="min-w-0">
              {title && <div className="zw-h3">{title}</div>}
              {description && <div className="zw-small mt-1">{description}</div>}
            </div>
            {dismissible && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onClose}
                icon={<X size={14} />}
                aria-label="Close"
              >
                <span className="sr-only">Close</span>
              </Button>
            )}
          </div>
        )}
        <div>{children}</div>
        {footer && (
          <div className="mt-5 flex items-center justify-end gap-2">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  );
}
