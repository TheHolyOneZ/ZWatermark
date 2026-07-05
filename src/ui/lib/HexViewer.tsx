import { useMemo, useState } from "react";
import { Copy, Check, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "./Button";

export interface HexViewerProps {
  hex: string;
  label?: string;
  collapsible?: boolean;
  defaultOpen?: boolean;
}

function formatHex(hex: string): string {
  const clean = hex.replace(/\s+/g, "").toLowerCase();
  const rows: string[] = [];
  for (let i = 0; i < clean.length; i += 32) {
    const chunk = clean.slice(i, i + 32);
    const groups: string[] = [];
    for (let j = 0; j < chunk.length; j += 2) groups.push(chunk.slice(j, j + 2));
    rows.push(groups.join(" "));
  }
  return rows.join("\n");
}

export function HexViewer({ hex, label = "Payload", collapsible = true, defaultOpen = true }: HexViewerProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);
  const formatted = useMemo(() => formatHex(hex), [hex]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(hex);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {  }
  };

  return (
    <div className="zw-card" style={{ padding: 12 }}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <button
          type="button"
          onClick={() => collapsible && setOpen(!open)}
          className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-[color:var(--zw-text-2)]"
          disabled={!collapsible}
        >
          {collapsible && (open ? <ChevronDown size={12} /> : <ChevronRight size={12} />)}
          {label}
          <span className="text-[color:var(--zw-text-3)] normal-case tracking-normal">
            · {hex.length / 2} bytes
          </span>
        </button>
        <Button
          size="sm"
          variant="ghost"
          onClick={copy}
          icon={copied ? <Check size={12} /> : <Copy size={12} />}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      {open && (
        <pre
          className="font-mono text-[11px] leading-relaxed text-[color:var(--zw-text-1)] whitespace-pre-wrap break-all"
          style={{ margin: 0, wordBreak: "break-all" }}
        >
{formatted || <span className="text-[color:var(--zw-text-3)]">(empty)</span>}
        </pre>
      )}
    </div>
  );
}
