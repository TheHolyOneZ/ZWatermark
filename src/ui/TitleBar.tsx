import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X } from "lucide-react";
import type { MouseEvent as ReactMouseEvent } from "react";
import logo from "../assets/logo.png";

export function TitleBar() {
  const w = getCurrentWindow();

  const onDrag = (e: ReactMouseEvent<HTMLDivElement>) => {


    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input, select, textarea")) return;
    void w.startDragging();
  };

  const onMaximizeDbl = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input, select, textarea")) return;
    void w.toggleMaximize();
  };

  return (
    <div
      className="zw-titlebar"
      data-tauri-drag-region
      onMouseDown={onDrag}
      onDoubleClick={onMaximizeDbl}
    >
      <div className="flex-1 inline-flex items-center gap-2 text-sm text-[color:var(--zw-text-2)] select-none pointer-events-none">
        <img src={logo} alt="" className="w-4 h-4 rounded-[3px]" />
        <span>ZWatermark</span>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={() => w.minimize()} aria-label="Minimize" className="p-2 hover:bg-white/5 rounded inline-flex items-center justify-center">
          <Minus size={14} />
        </button>
        <button onClick={() => w.toggleMaximize()} aria-label="Maximize" className="p-2 hover:bg-white/5 rounded inline-flex items-center justify-center">
          <Square size={12} />
        </button>
        <button onClick={() => w.close()} aria-label="Close" className="p-2 hover:bg-red-500/20 rounded inline-flex items-center justify-center">
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
