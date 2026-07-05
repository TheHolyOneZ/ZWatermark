import { useCallback, useMemo, useRef } from "react";
import { Image as ImageIcon, Type, Upload, X } from "lucide-react";
import { Segmented } from "./Segmented";
import { Toggle } from "./Toggle";
import { Input } from "./Input";
import { Button } from "./Button";
import { HelpTip } from "./HelpTip";
import type {
  OverlayCorner,
  OverlayMode,
  VisibleOverlay,
} from "../../ipc/bridge";

interface Props {
  value: VisibleOverlay;
  onChange: (next: VisibleOverlay) => void;
  compact?: boolean;
}

const POSITIONS: Array<{ value: OverlayCorner; label: string }> = [
  { value: "top_left", label: "↖" },
  { value: "top_right", label: "↗" },
  { value: "center", label: "•" },
  { value: "bottom_left", label: "↙" },
  { value: "bottom_right", label: "↘" },
];

export function OverlayEditor({ value, onChange, compact }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);

  const patch = useCallback(
    (p: Partial<VisibleOverlay>) => onChange({ ...value, ...p }),
    [value, onChange],
  );

  const pickImage = useCallback(() => fileRef.current?.click(), []);
  const onFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      e.target.value = "";
      if (!f) return;
      const buf = new Uint8Array(await f.arrayBuffer());
      patch({ imageBytes: Array.from(buf) });
    },
    [patch],
  );

  const hasCustomImage = !!(value.imageBytes && value.imageBytes.length);
  const imageLabel = useMemo(() => {
    if (!hasCustomImage) return "Using default ZWatermark logo";
    const kb = (value.imageBytes!.length / 1024).toFixed(1);
    return `Custom image loaded (${kb} KB)`;
  }, [hasCustomImage, value.imageBytes]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <Toggle
          checked={value.enabled}
          onChange={(v) => patch({ enabled: v })}
          label="Draw a visible watermark"
          description="Cosmetic overlay drawn onto the pixels before the invisible layers. Trivially cropped away — do not confuse with the cryptographic layers."
        />
      </div>

      {value.enabled && (
        <div className="flex flex-col gap-3 pl-1">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-[color:var(--zw-text-2)] inline-flex items-center">
              Type
              <HelpTip
                ariaLabel="Overlay types"
                content={
                  <div>
                    <strong>Image</strong> stamps a logo — defaults to the ZWatermark mark, upload your own to override. <strong>Text</strong> stamps a short string like a copyright line. Purely cosmetic; the cryptographic proof lives in the invisible layers underneath.
                  </div>
                }
              />
            </span>
            <Segmented<OverlayMode>
              value={value.mode}
              onChange={(m) => patch({ mode: m })}
              ariaLabel="Overlay type"
              options={[
                { value: "image", label: "Image" },
                { value: "text", label: "Text" },
              ]}
            />
          </div>

          {value.mode === "text" ? (
            <Input
              label="Overlay text"
              value={value.text ?? ""}
              onChange={(e) => patch({ text: e.target.value })}
              placeholder="e.g. © Your Name, 2026"
              icon={<Type size={14} />}
            />
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="text-xs text-[color:var(--zw-text-2)] inline-flex items-center gap-2">
                <ImageIcon size={14} />
                <span>{imageLabel}</span>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Upload size={14} />}
                  onClick={pickImage}
                >
                  {hasCustomImage ? "Replace…" : "Upload logo…"}
                </Button>
                {hasCustomImage && (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={<X size={14} />}
                    onClick={() => patch({ imageBytes: null })}
                  >
                    Reset
                  </Button>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={onFile}
                />
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-[color:var(--zw-text-2)]">Position</span>
            <Segmented<OverlayCorner>
              value={value.position}
              onChange={(p) => patch({ position: p })}
              ariaLabel="Overlay position"
              options={POSITIONS}
            />
          </div>

          <div className="flex flex-col gap-3">
            <SliderRow
              label="Opacity"
              value={value.opacity}
              min={0.1}
              max={1}
              step={0.05}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => patch({ opacity: v })}
            />
            <SliderRow
              label="Size"
              value={value.sizePct}
              min={0.03}
              max={0.4}
              step={0.01}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(v) => patch({ sizePct: v })}
            />
          </div>

          {!compact && (
            <Toggle
              checked={value.zwBadge}
              onChange={(v) => patch({ zwBadge: v })}
              label={"“Signed with ZWatermark” badge"}
              description="Small badge in the opposite corner. Optional social proof."
            />
          )}
        </div>
      )}
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-[color:var(--zw-text-2)] w-16 shrink-0">{label}</span>
      <input
        type="range"
        className="zw-slider flex-1"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
      />
      <span className="text-xs text-[color:var(--zw-text-1)] tabular-nums w-12 text-right">
        {format(value)}
      </span>
    </div>
  );
}
