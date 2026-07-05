import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Input } from "./Input";
import { Button } from "./Button";

export function TagList({
  value,
  onChange,
  placeholder,
  tone = "neutral",
  icon,
  emptyHint = "Empty",
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  tone?: "neutral" | "success" | "warning" | "error";
  icon?: React.ReactNode;
  emptyHint?: string;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const t = draft.trim();
    if (!t) return;
    if (value.includes(t)) return;
    onChange([...value, t]);
    setDraft("");
  };
  const remove = (t: string) => onChange(value.filter((x) => x !== t));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          wrapperClassName="flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); add(); }
          }}
        />
        <Button variant="secondary" onClick={add} icon={<Plus size={14} />} disabled={!draft.trim()}>
          Add
        </Button>
      </div>
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((t) => (
            <span key={t} className="zw-tag" data-tone={tone}>
              {icon}
              <span className="font-mono text-xs">{t}</span>
              <button
                type="button"
                onClick={() => remove(t)}
                className="zw-tag-close"
                aria-label={`Remove ${t}`}
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <span className="zw-empty-chip">{emptyHint}</span>
      )}
    </div>
  );
}
