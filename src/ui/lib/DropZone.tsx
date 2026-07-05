import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { Upload } from "lucide-react";

export interface DropZoneProps {
  onPaths: (paths: string[]) => void;
  accept?: string[];
  multiple?: boolean;
  icon?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  hint?: ReactNode;
  className?: string;
  dialogTitle?: string;
}


export function DropZone({
  onPaths,
  accept,
  multiple = false,
  icon,
  title = "Drop an image here",
  subtitle = "or click to browse",
  hint,
  className,
  dialogTitle,
}: DropZoneProps) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const [hot, setHot] = useState(false);

  const filterAccepted = useCallback(
    (paths: string[]) => {
      if (!accept || accept.length === 0) return paths;
      const lc = accept.map((a) => a.toLowerCase().replace(/^\./, ""));
      return paths.filter((p) => {
        const ext = p.split(".").pop()?.toLowerCase() ?? "";
        return lc.includes(ext);
      });
    },
    [accept],
  );

  const inside = useCallback((pos: { x: number; y: number }) => {
    const el = zoneRef.current;
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    const x = pos.x / dpr;
    const y = pos.y / dpr;
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let alive = true;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        const p = event.payload;
        if (p.type === "enter" || p.type === "over") {
          setHot(inside(p.position));
        } else if (p.type === "drop") {
          const wasInside = inside(p.position);
          setHot(false);
          if (!wasInside) return;
          const filtered = filterAccepted(p.paths);
          if (filtered.length === 0) return;
          onPaths(multiple ? filtered : filtered.slice(0, 1));
        } else {
          setHot(false);
        }
      })
      .then((fn) => {
        if (!alive) fn();
        else unlisten = fn;
      });
    return () => {
      alive = false;
      unlisten?.();
    };
  }, [inside, filterAccepted, onPaths, multiple]);

  const pick = useCallback(async () => {
    const p = await openDialog({
      multiple,
      title: dialogTitle,
      filters: accept
        ? [{ name: "Image", extensions: accept.map((a) => a.replace(/^\./, "")) }]
        : undefined,
    });
    if (p == null) return;
    const arr = Array.isArray(p) ? p : [p];
    if (arr.length > 0) onPaths(arr);
  }, [accept, dialogTitle, multiple, onPaths]);

  return (
    <div
      ref={zoneRef}
      className={`zw-dropzone ${className ?? ""}`}
      data-dragging={hot}
      onClick={pick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          void pick();
        }
      }}
      aria-label={typeof title === "string" ? title : "Drop zone"}
    >
      <div className="flex flex-col items-center gap-2 pointer-events-none">
        <div className="text-[color:var(--zw-accent)]" aria-hidden>
          {icon ?? <Upload size={28} strokeWidth={1.5} />}
        </div>
        <div className="zw-h3">{title}</div>
        <div className="zw-small">{subtitle}</div>
        {hint && <div className="text-xs text-[color:var(--zw-text-3)] mt-1">{hint}</div>}
      </div>
    </div>
  );
}
