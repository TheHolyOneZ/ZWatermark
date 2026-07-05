import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { HelpCircle } from "lucide-react";

export type HelpTipPlacement = "top" | "bottom" | "right";

export interface HelpTipProps {
  content: ReactNode;
  placement?: HelpTipPlacement;
  ariaLabel?: string;
  size?: number;
  className?: string;
}

interface Rect {
  top: number;
  left: number;
  arrow: number;
  placement: HelpTipPlacement;
}

const POPOVER_WIDTH = 260;
const POPOVER_MARGIN = 8;
const VIEWPORT_PAD = 8;


export function HelpTip({
  content,
  placement = "bottom",
  ariaLabel = "More info",
  size = 12,
  className,
}: HelpTipProps) {
  const [open, setOpen] = useState(false);
  const [hovering, setHovering] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<Rect | null>(null);

  const visible = open || hovering;

  const updateRect = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const popH = popRef.current?.offsetHeight ?? 80;

    let effective: HelpTipPlacement = placement;
    if (placement === "top" && r.top - popH - POPOVER_MARGIN < VIEWPORT_PAD) effective = "bottom";
    if (placement === "bottom" && r.bottom + popH + POPOVER_MARGIN > vh - VIEWPORT_PAD) effective = "top";

    const triggerCenter = r.left + r.width / 2;
    let left: number;
    let top: number;

    if (effective === "right") {
      left = r.right + POPOVER_MARGIN;
      top = r.top + r.height / 2 - popH / 2;
    } else {
      left = triggerCenter - POPOVER_WIDTH / 2;
      top = effective === "top" ? r.top - popH - POPOVER_MARGIN : r.bottom + POPOVER_MARGIN;
    }


    const maxLeft = vw - POPOVER_WIDTH - VIEWPORT_PAD;
    if (left < VIEWPORT_PAD) left = VIEWPORT_PAD;
    if (left > maxLeft) left = Math.max(VIEWPORT_PAD, maxLeft);


    if (effective === "right") {
      const maxTop = vh - popH - VIEWPORT_PAD;
      if (top < VIEWPORT_PAD) top = VIEWPORT_PAD;
      if (top > maxTop) top = Math.max(VIEWPORT_PAD, maxTop);
    }

    const arrow =
      effective === "right"
        ? Math.max(6, Math.min(popH - 6, r.top + r.height / 2 - top))
        : Math.max(10, Math.min(POPOVER_WIDTH - 10, triggerCenter - left));

    setRect({ top, left, arrow, placement: effective });
  }, [placement]);

  useLayoutEffect(() => {
    if (!visible) return;
    updateRect();
    const onScroll = () => updateRect();
    const onResize = () => updateRect();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [visible, updateRect]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
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
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={["zw-helptip-trigger", className ?? ""].filter(Boolean).join(" ")}
        aria-label={ariaLabel}
        aria-expanded={visible}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onFocus={() => setHovering(true)}
        onBlur={() => {
          setHovering(false);
          setOpen(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
      >
        <HelpCircle size={size} aria-hidden />
      </button>

      {visible && rect &&
        createPortal(
          <div
            ref={popRef}
            role="tooltip"
            className="zw-helptip"
            data-placement={rect.placement}
            style={{
              position: "fixed",
              top: rect.top,
              left: rect.left,
              width: POPOVER_WIDTH,
            }}
          >
            <span
              className="zw-helptip-arrow"
              aria-hidden
              style={
                rect.placement === "right"
                  ? { top: rect.arrow }
                  : { left: rect.arrow }
              }
            />
            <div className="zw-helptip-body">{content}</div>
          </div>,
          document.body,
        )}
    </>
  );
}
