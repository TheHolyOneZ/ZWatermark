export interface ConfidenceBarProps {
  value: number;
  cells?: number;
  showLabel?: boolean;
}

function tierFor(v: number): "error" | "warning" | "neutral" | "success" {
  if (v < 0.25) return "error";
  if (v < 0.5) return "warning";
  if (v < 0.75) return "neutral";
  return "success";
}

export function ConfidenceBar({ value, cells = 20, showLabel = true }: ConfidenceBarProps) {
  const clamped = Math.max(0, Math.min(1, value));
  const filled = Math.round(clamped * cells);
  const tier = tierFor(clamped);
  return (
    <div
      className="flex items-center gap-3"
      role="progressbar"
      aria-valuenow={Math.round(clamped * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Confidence"
    >
      <div className="zw-conf flex-1">
        {Array.from({ length: cells }, (_, i) => (
          <div
            key={i}
            className="zw-conf-cell"
            data-on={i < filled}
            data-tier={tier}
          />
        ))}
      </div>
      {showLabel && (
        <div
          className="tabular-nums font-mono text-xs w-10 text-right"
          style={{ color: `var(--zw-${tier === "neutral" ? "text-1" : tier})` }}
        >
          {Math.round(clamped * 100)}%
        </div>
      )}
    </div>
  );
}
