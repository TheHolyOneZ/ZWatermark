import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Filter, Plus, X, Clock, CheckCircle2, Layers } from "lucide-react";
import { useRulesStore } from "../../store/rulesStore";
import type { RuleSet } from "../../ipc/bridge";
import { Panel } from "../lib/Panel";
import { Section } from "../lib/Section";
import { Card } from "../lib/Card";
import { Input } from "../lib/Input";
import { Button } from "../lib/Button";
import { Badge } from "../lib/Badge";
import { Toggle } from "../lib/Toggle";
import { Segmented } from "../lib/Segmented";
import { TagList } from "../lib/TagList";
import { HelpTip } from "../lib/HelpTip";
import { useToast } from "../lib/Toast";

type Strength = "robust" | "fragile" | "both" | "max";

export function Rules() {
  const { rules, load, update } = useRulesStore();
  const [draft, setDraft] = useState<RuleSet>(rules);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setDraft(rules); setDirty(false); }, [rules]);

  const patch = (p: Partial<RuleSet>) => {
    setDraft((d) => ({ ...d, ...p }));
    setDirty(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      await update(draft);
      toast.success("Rules updated");
    } catch (e) {
      toast.error("Save failed", String(e));
    } finally {
      setBusy(false);
    }
  };

  const isEmpty = useMemo(
    () =>
      draft.folderAllow.length === 0 &&
      draft.folderDeny.length === 0 &&
      Object.keys(draft.folderStrength).length === 0 &&
      !draft.workHoursOnly,
    [draft],
  );

  return (
    <Panel
      title="Rules"
      subtitle="Fine-grained control over which captures get marked. Rules save to disk today but do not yet gate marking — see notice."
      actions={
        dirty && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setDraft(rules); setDirty(false); }}>
              Discard
            </Button>
            <Button variant="primary" size="sm" onClick={save} loading={busy}>
              Save rules
            </Button>
          </div>
        )
      }
    >
      <div className="zw-alert zw-alert--error">
        <AlertTriangle size={14} aria-hidden />
        <div>
          <strong>Nothing on this tab currently does anything.</strong> There
          is no auto-marking pipeline yet — the folder watcher only <em>logs</em>
          {" "}new screenshots to the Log tab, it never marks them. So all four
          controls below (folder allow, folder deny, per-folder strength,
          daily time window) save to disk but have no consumer. Every capture
          today still requires an explicit Mark from you. Configure your intent
          here if you like — it'll take effect once the auto-marking pipeline
          lands.
        </div>
      </div>

      {isEmpty && (
        <Card>
          <div className="flex items-start gap-3">
            <div className="zw-avatar" style={{ width: 34, height: 34 }} aria-hidden>
              <Filter size={15} />
            </div>
            <div>
              <div className="text-sm text-[color:var(--zw-text-1)]">
                All captures are marked with your active identity.
              </div>
              <div className="text-xs text-[color:var(--zw-text-2)] mt-1">
                Add folder allow/deny lists or per-folder strength overrides below to change that (once wired).
              </div>
            </div>
          </div>
        </Card>
      )}

      <Section
        title={
          <span className="flex items-center gap-2">
            <CheckCircle2 size={14} /> Folders
            <HelpTip
              ariaLabel="How do folder allow and deny lists work?"
              content={
                <div>
                  <strong>Allow</strong> narrows auto-marking to only the folders you list. <strong>Deny</strong> excludes specific folders from ever being touched. Not yet honoured by the capture pipeline — save your intent here and it'll apply once wiring lands.
                </div>
              }
            />
          </span>
        }
        description="Only these folders get watched, or exclude specific folders from marking."
      >
        <Card>
          <div className="flex flex-col gap-5">
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="text-xs text-[color:var(--zw-text-2)]">
                  Only watch these folders
                </div>
                {draft.folderAllow.length > 0 && (
                  <Badge variant="success">{draft.folderAllow.length}</Badge>
                )}
              </div>
              <TagList
                value={draft.folderAllow}
                onChange={(v) => patch({ folderAllow: v })}
                placeholder="/home/you/Screenshots"
                tone="success"
                emptyHint="Empty — every watched folder is fair game"
              />
            </div>
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="text-xs text-[color:var(--zw-text-2)]">
                  Never touch these folders
                </div>
                {draft.folderDeny.length > 0 && (
                  <Badge variant="error">{draft.folderDeny.length}</Badge>
                )}
              </div>
              <TagList
                value={draft.folderDeny}
                onChange={(v) => patch({ folderDeny: v })}
                placeholder="/home/you/Screenshots/private"
                tone="error"
                emptyHint="Empty — nothing is denied"
              />
            </div>
          </div>
        </Card>
      </Section>

      <Section
        title={
          <span className="flex items-center gap-2">
            <Layers size={14} /> Per-folder strength
            <HelpTip
              ariaLabel="What does per-folder strength do?"
              content={
                <div>
                  Override the default watermark strength for captures inside a specific folder — for example use the tamper-evident <strong>fragile</strong> layer for legal evidence, and lighter <strong>robust</strong>-only for casual screenshots. Not yet enforced by the pipeline.
                </div>
              }
            />
          </span>
        }
        description="Override the default strength for captures under a specific folder."
      >
        <FolderStrengthEditor
          value={draft.folderStrength}
          onChange={(v) => patch({ folderStrength: v })}
        />
      </Section>

      <Section
        title={
          <span className="flex items-center gap-2">
            <Clock size={14} /> Time window
            <HelpTip
              ariaLabel="What does the time window do?"
              content={
                <div>
                  Only sign captures taken during a set daily window — useful if you only want work-hours screenshots stamped with your professional identity, or if you're on-call and want a clean audit trail. Not yet enforced by the pipeline.
                </div>
              }
            />
          </span>
        }
        description="Optional: only mark captures taken during a fixed daily window. Useful for on-call or work-hours-only logging."
      >
        <Card>
          <Toggle
            checked={draft.workHoursOnly}
            onChange={(v) => patch({ workHoursOnly: v })}
            label="Restrict marking to a daily window"
          />
          {draft.workHoursOnly && (
            <div className="flex gap-3 mt-4">
              <Input
                label="From"
                type="time"
                value={draft.workHoursStart ?? "09:00"}
                onChange={(e) => patch({ workHoursStart: e.target.value })}
                wrapperClassName="flex-1"
              />
              <Input
                label="Until"
                type="time"
                value={draft.workHoursEnd ?? "18:00"}
                onChange={(e) => patch({ workHoursEnd: e.target.value })}
                wrapperClassName="flex-1"
              />
            </div>
          )}
        </Card>
      </Section>
    </Panel>
  );
}

function FolderStrengthEditor({
  value,
  onChange,
}: {
  value: Record<string, Strength>;
  onChange: (v: Record<string, Strength>) => void;
}) {
  const rows = Object.entries(value);
  const [path, setPath] = useState("");
  const [strength, setStrength] = useState<Strength>("both");

  const add = () => {
    const p = path.trim();
    if (!p || value[p]) return;
    onChange({ ...value, [p]: strength });
    setPath("");
  };
  const setStrengthFor = (key: string, s: Strength) => {
    onChange({ ...value, [key]: s });
  };
  const removeKey = (key: string) => {
    const next = { ...value };
    delete next[key];
    onChange(next);
  };

  return (
    <Card>
      <div className="flex flex-col gap-3">
        <div className="flex gap-2 items-start">
          <Input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="/home/you/Screenshots/work"
            wrapperClassName="flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); add(); }
            }}
          />
          <Segmented<Strength>
            value={strength}
            onChange={setStrength}
            options={[
              { value: "robust", label: "Robust" },
              { value: "fragile", label: "Fragile" },
              { value: "both", label: "Both" },
              { value: "max", label: "Max" },
            ]}
            ariaLabel="Strength"
          />
          <Button
            variant="secondary"
            icon={<Plus size={14} />}
            onClick={add}
            disabled={!path.trim()}
          >
            Add
          </Button>
        </div>
        {rows.length === 0 ? (
          <div className="zw-empty-chip">No per-folder overrides</div>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map(([p, s]) => (
              <li
                key={p}
                className="flex items-center gap-2 flex-wrap"
              >
                <span className="zw-path-well flex-1 min-w-[220px]">{p}</span>
                <Segmented<Strength>
                  value={s}
                  onChange={(next) => setStrengthFor(p, next)}
                  options={[
                    { value: "robust", label: "Robust" },
                    { value: "fragile", label: "Fragile" },
                    { value: "both", label: "Both" },
                    { value: "max", label: "Max" },
                  ]}
                  ariaLabel={`Strength for ${p}`}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeKey(p)}
                  icon={<X size={14} />}
                  aria-label="Remove"
                >
                  <span className="sr-only">Remove</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

