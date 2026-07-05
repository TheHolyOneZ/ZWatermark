import { useEffect, useRef, useState } from "react";
import { X, Plus } from "lucide-react";
import { Button } from "./Button";
import { Input } from "./Input";

export interface KeyValueEditorProps {
  value: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  addLabel?: string;
}

interface Row {
  key: string;
  value: string;
}

function toRows(value: Record<string, string>): Row[] {
  return Object.entries(value).map(([key, v]) => ({ key, value: v }));
}

function toRecord(rows: Row[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) {
    const k = r.key.trim();
    if (!k) continue;
    out[k] = r.value;
  }
  return out;
}

export function KeyValueEditor({
  value,
  onChange,
  keyPlaceholder = "Key (e.g. cpu)",
  valuePlaceholder = "Value (e.g. Ryzen 9 7950X)",
  addLabel = "Add field",
}: KeyValueEditorProps) {
  const [rows, setRows] = useState<Row[]>(() => toRows(value));
  const lastEmitted = useRef<string>(JSON.stringify(value));

  useEffect(() => {
    const incoming = JSON.stringify(value);
    if (incoming !== lastEmitted.current) {
      setRows(toRows(value));
      lastEmitted.current = incoming;
    }
  }, [value]);

  const commit = (next: Row[]) => {
    setRows(next);
    const record = toRecord(next);
    lastEmitted.current = JSON.stringify(record);
    onChange(record);
  };

  const setRow = (idx: number, patch: Partial<Row>) => {
    commit(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const removeRow = (idx: number) => {
    commit(rows.filter((_, i) => i !== idx));
  };
  const addRow = () => {
    commit([...rows, { key: "", value: "" }]);
  };

  return (
    <div className="flex flex-col gap-2">
      {rows.length === 0 ? (
        <div className="text-xs text-[color:var(--zw-text-3)]">
          No metadata yet. Add fields to describe this device.
        </div>
      ) : (
        rows.map((r, idx) => (
          <div key={idx} className="flex items-start gap-2">
            <Input
              wrapperClassName="flex-1"
              value={r.key}
              placeholder={keyPlaceholder}
              onChange={(e) => setRow(idx, { key: e.target.value })}
            />
            <Input
              wrapperClassName="flex-[2]"
              value={r.value}
              placeholder={valuePlaceholder}
              onChange={(e) => setRow(idx, { value: e.target.value })}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => removeRow(idx)}
              aria-label="Remove field"
              title="Remove"
            >
              <X size={14} />
            </Button>
          </div>
        ))
      )}
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={addRow}
          icon={<Plus size={14} />}
        >
          {addLabel}
        </Button>
      </div>
    </div>
  );
}
