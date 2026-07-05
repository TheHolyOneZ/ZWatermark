import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bug,
  Play,
  X,
  Trash2,
  ShieldCheck,
  ShieldAlert,
  ShieldOff,
  FileImage,
  AlertCircle,
  Zap,
  Info,
} from "lucide-react";
import { Panel } from "../lib/Panel";
import { Section } from "../lib/Section";
import { Card } from "../lib/Card";
import { Button } from "../lib/Button";
import { Badge } from "../lib/Badge";
import { EmptyState } from "../lib/EmptyState";
import { Toggle } from "../lib/Toggle";
import { HelpTip } from "../lib/HelpTip";
import { DropZone } from "../lib/DropZone";
import { ConfidenceBar } from "../lib/ConfidenceBar";
import { useToast } from "../lib/Toast";
import { useStressStore } from "../../store/stressStore";
import type { Attack, StressRow } from "../../ipc/bridge";

interface AttackPreset {
  id: string;
  label: string;
  hint: string;
  attacks: Attack[];
}

const PRESETS: AttackPreset[] = [
  {
    id: "jpeg",
    label: "JPEG recompress",
    hint: "Q30, Q50, Q70, Q85",
    attacks: [
      { kind: "jpeg_recompress", quality: 30 },
      { kind: "jpeg_recompress", quality: 50 },
      { kind: "jpeg_recompress", quality: 70 },
      { kind: "jpeg_recompress", quality: 85 },
    ],
  },
  {
    id: "resize",
    label: "Resize",
    hint: "×0.5, ×0.75",
    attacks: [
      { kind: "resize", scale: 0.5 },
      { kind: "resize", scale: 0.75 },
    ],
  },
  {
    id: "crop",
    label: "Center crop",
    hint: "keep 90%, 75%, 50%",
    attacks: [
      { kind: "crop", keep_pct: 0.9 },
      { kind: "crop", keep_pct: 0.75 },
      { kind: "crop", keep_pct: 0.5 },
    ],
  },
  {
    id: "noise",
    label: "Gaussian noise",
    hint: "σ=3, σ=8",
    attacks: [
      { kind: "gaussian_noise", sigma: 3 },
      { kind: "gaussian_noise", sigma: 8 },
    ],
  },
  {
    id: "blur",
    label: "Gaussian blur",
    hint: "σ=1, σ=2",
    attacks: [
      { kind: "gaussian_blur", sigma: 1 },
      { kind: "gaussian_blur", sigma: 2 },
    ],
  },
  {
    id: "tone",
    label: "Tone shifts",
    hint: "±brightness / contrast",
    attacks: [
      { kind: "brightness", delta: 20 },
      { kind: "brightness", delta: -20 },
      { kind: "contrast", factor: 20 },
      { kind: "contrast", factor: -20 },
    ],
  },
  {
    id: "trivial",
    label: "Trivial edits",
    hint: "grayscale, flip",
    attacks: [{ kind: "grayscale" }, { kind: "horizontal_flip" }],
  },
  {
    id: "rotate",
    label: "Rotate",
    hint: "0.5°, 2°, 90°",
    attacks: [
      { kind: "rotate", degrees: 0.5 },
      { kind: "rotate", degrees: 2 },
      { kind: "rotate", degrees: 90 },
    ],
  },
];

const ACCEPT = ["png", "jpg", "jpeg", "webp", "bmp"];

export function Stress() {
  const toast = useToast();
  const job = useStressStore();
  const [paths, setPaths] = useState<string[]>([]);
  const [enabled, setEnabled] = useState<Set<string>>(
    () => new Set(PRESETS.slice(0, 4).map((p) => p.id)),
  );
  const [chain, setChain] = useState(false);

  const attacks = useMemo(
    () => PRESETS.filter((p) => enabled.has(p.id)).flatMap((p) => p.attacks),
    [enabled],
  );

  const onPaths = useCallback((p: string[]) => {
    setPaths((prev) => Array.from(new Set([...prev, ...p])));
  }, []);

  const togglePreset = useCallback((id: string) => {
    setEnabled((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const removePath = useCallback((p: string) => {
    setPaths((prev) => prev.filter((x) => x !== p));
  }, []);

  const clearAll = useCallback(() => setPaths([]), []);

  const canStart =
    paths.length > 0 && attacks.length > 0 && job.status !== "running";

  const start = useCallback(async () => {
    if (!canStart) return;
    await job.start(paths, attacks, chain);
  }, [canStart, paths, attacks, chain, job]);

  const lastStatus = useRef(job.status);
  useEffect(() => {
    if (lastStatus.current === job.status) return;
    lastStatus.current = job.status;
    if (job.status === "done" && job.report) {
      toast.success(
        "Stress test complete",
        `${job.report.rows.length} runs in ${(job.report.durationMs / 1000).toFixed(1)}s`,
      );
    } else if (job.status === "error" && job.error) {
      toast.error("Stress test failed", job.error);
    } else if (job.status === "cancelled") {
      toast.info("Stress test cancelled", "Partial results retained.");
    }
  }, [job.status, job.report, job.error, toast]);

  const summary = useMemo(() => summarize(job.rows), [job.rows]);
  const progressPct =
    job.total > 0 ? Math.min(100, (job.processed / job.total) * 100) : 0;

  return (
    <Panel
      title="Stress test"
      subtitle="Drop signed images, pick a battery of attacks, and see which layers survive. Fully local — nothing leaves your machine."
      actions={
        job.status === "running" ? (
          <Button
            variant="secondary"
            size="sm"
            icon={<X size={14} />}
            onClick={() => void job.cancel()}
          >
            Cancel
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            icon={<Play size={14} />}
            onClick={start}
            disabled={!canStart}
          >
            Run{" "}
            {attacks.length > 0
              ? chain
                ? `${paths.length}`
                : `${paths.length}×${attacks.length}`
              : "attacks"}
          </Button>
        )
      }
    >
      <div className="zw-alert zw-alert--info">
        <Info size={14} aria-hidden />
        <div>
          Each image is verified once as a baseline, then re-verified after every attack.
          The results tell you which invisible layer (robust / fragile / signature) survived
          each transformation — a signal for how the mark holds up in the wild.
        </div>
      </div>

      <Section title="Images">
        {paths.length === 0 ? (
          <DropZone
            onPaths={onPaths}
            accept={ACCEPT}
            multiple
            icon={<Bug size={30} strokeWidth={1.5} />}
            title="Drop signed images to attack"
            subtitle="or click to browse — accepts multiple"
            hint={`Accepts ${ACCEPT.join(", ")}. Files are read-only; nothing is written back.`}
            dialogTitle="Choose images to stress-test"
          />
        ) : (
          <Card>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="text-sm text-[color:var(--zw-text-2)]">
                <strong className="text-[color:var(--zw-text-1)]">{paths.length}</strong>{" "}
                image{paths.length === 1 ? "" : "s"} queued
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<FileImage size={14} />}
                  onClick={() => void pickMore(onPaths)}
                >
                  Add more…
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Trash2 size={14} />}
                  onClick={clearAll}
                >
                  Clear
                </Button>
              </div>
            </div>
            <ul className="flex flex-col gap-1.5 max-h-64 overflow-auto">
              {paths.map((p) => (
                <li
                  key={p}
                  className="flex items-center gap-2 text-xs text-[color:var(--zw-text-2)]"
                >
                  <FileImage size={12} className="shrink-0" />
                  <span className="zw-path-well flex-1 truncate">{p}</span>
                  <button
                    type="button"
                    className="zw-btn zw-btn--ghost zw-btn--sm"
                    onClick={() => removePath(p)}
                    aria-label={`Remove ${p}`}
                  >
                    <X size={12} />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </Section>

      <Section
        title={
          <span className="flex items-center gap-2">
            <Zap size={14} /> Attack presets
            <HelpTip
              ariaLabel="How do attack presets work?"
              content={
                <div>
                  Each preset is a bundle of concrete transformations. Enable the ones you want to test against — the runner applies every enabled attack to every image and reports whether the robust carrier, fragile signature, or both survived.
                </div>
              }
            />
          </span>
        }
        description="Toggle the attack families you want to run. Robust survives most; fragile breaks on any pixel edit."
      >
        <Card>
          <div className="mb-3 pb-3 border-b border-[color:var(--zw-border-hair)]">
            <Toggle
              checked={chain}
              onChange={setChain}
              label={
                <span className="text-sm text-[color:var(--zw-text-1)]">
                  Chain mode — stack all enabled attacks onto one copy
                </span>
              }
              description={
                <span className="text-xs text-[color:var(--zw-text-2)]">
                  Off: each attack runs against a fresh private copy — one result row per attack (matrix). On: every enabled attack is folded into a single private copy in order, producing one row per image (torture test).
                </span>
              }
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {PRESETS.map((p) => (
              <div
                key={p.id}
                className="flex items-start gap-3 py-2 px-3 rounded border border-[color:var(--zw-border-hair)]"
              >
                <Toggle
                  checked={enabled.has(p.id)}
                  onChange={() => togglePreset(p.id)}
                  label={
                    <span className="text-sm text-[color:var(--zw-text-1)]">
                      {p.label}
                    </span>
                  }
                  description={
                    <span className="text-xs text-[color:var(--zw-text-2)]">
                      {p.hint} · {p.attacks.length} variant
                      {p.attacks.length === 1 ? "" : "s"}
                    </span>
                  }
                />
              </div>
            ))}
          </div>
        </Card>
      </Section>

      {(job.status === "running" ||
        job.status === "done" ||
        job.status === "cancelled" ||
        job.status === "error") && (
        <Section
          title={
            <span className="flex items-center gap-2">
              Results
              {job.status === "running" && <Badge variant="neutral">Running</Badge>}
              {job.status === "done" && <Badge variant="success">Done</Badge>}
              {job.status === "cancelled" && <Badge variant="warning">Cancelled</Badge>}
              {job.status === "error" && <Badge variant="error">Error</Badge>}
            </span>
          }
          description={
            job.status === "running"
              ? `${job.processed}/${job.total} · ${job.current ? basename(job.current) : "…"}`
              : job.rows.length > 0
                ? `${summary.survivedIdentity}/${job.rows.length} kept a recognizable identity after the attack. Signature always breaks under tampering — that's the fragile layer doing its job.`
                : "No results yet."
          }
          actions={
            job.rows.length > 0 && job.status !== "running" ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => job.clear()}
                icon={<Trash2 size={14} />}
              >
                Clear
              </Button>
            ) : null
          }
        >
          {job.status === "running" && (
            <Card>
              <div className="zw-progress" role="progressbar" aria-valuenow={progressPct}>
                <div className="zw-progress-bar" style={{ width: `${progressPct}%` }} />
              </div>
            </Card>
          )}

          {job.error && (
            <div className="zw-alert zw-alert--error">
              <AlertCircle size={14} aria-hidden />
              <div>{job.error}</div>
            </div>
          )}

          {job.rows.length > 0 && (
            <Card>
              <SummaryStrip s={summary} total={job.rows.length} />
              <ResultsTable rows={job.rows} />
            </Card>
          )}

          {job.rows.length === 0 && job.status === "done" && (
            <EmptyState
              icon={<Bug size={40} />}
              title="No rows"
              description="The job finished without producing any rows."
            />
          )}
        </Section>
      )}
    </Panel>
  );
}

async function pickMore(onPaths: (p: string[]) => void) {
  const { open: openDialog } = await import("@tauri-apps/plugin-dialog");
  const picked = await openDialog({
    multiple: true,
    filters: [{ name: "Image", extensions: ACCEPT }],
  });
  if (Array.isArray(picked) && picked.length) onPaths(picked);
  else if (typeof picked === "string") onPaths([picked]);
}

interface Summary {
  survivedRobust: number;
  survivedFragile: number;
  survivedSig: number;
  survivedIdentity: number;
  errors: number;
}

function summarize(rows: StressRow[]): Summary {
  let survivedRobust = 0;
  let survivedFragile = 0;
  let survivedSig = 0;
  let survivedIdentity = 0;
  let errors = 0;
  for (const r of rows) {
    if (r.error) errors += 1;
    if (r.attackedRobustFound) survivedRobust += 1;
    if (r.attackedFragileFound) survivedFragile += 1;
    if (r.attackedSignatureOk) survivedSig += 1;
    if (r.attackedIdentityKnown) survivedIdentity += 1;
  }
  return { survivedRobust, survivedFragile, survivedSig, survivedIdentity, errors };
}

function SummaryStrip({ s, total }: { s: Summary; total: number }) {
  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100));
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 mb-4">
      <StatCard
        icon={<ShieldCheck size={20} />}
        label="Identity known"
        value={`${s.survivedIdentity}/${total}`}
        hint={`${pct(s.survivedIdentity)}%`}
        tone="success"
      />
      <StatCard
        icon={<ShieldCheck size={20} />}
        label="Signature OK"
        value={`${s.survivedSig}/${total}`}
        hint={`${pct(s.survivedSig)}%`}
        tone="success"
      />
      <StatCard
        icon={<ShieldAlert size={20} />}
        label="Robust survived"
        value={`${s.survivedRobust}/${total}`}
        hint={`${pct(s.survivedRobust)}%`}
        tone="neutral"
      />
      <StatCard
        icon={<ShieldAlert size={20} />}
        label="Fragile survived"
        value={`${s.survivedFragile}/${total}`}
        hint={`${pct(s.survivedFragile)}%`}
        tone="neutral"
      />
      <StatCard
        icon={<AlertCircle size={20} />}
        label="Errors"
        value={`${s.errors}`}
        hint={s.errors > 0 ? "check the rows" : "none"}
        tone={s.errors > 0 ? "error" : "neutral"}
      />
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
  tone: "success" | "error" | "neutral";
}) {
  return (
    <div className="zw-stat" data-tone={tone}>
      <div className="zw-stat-icon">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="zw-stat-label truncate">{label}</div>
        <div className="zw-stat-value flex items-baseline gap-2 flex-wrap">
          <span>{value}</span>
          <span className="text-sm font-normal tracking-normal text-[color:var(--zw-text-3)]">
            {hint}
          </span>
        </div>
      </div>
    </div>
  );
}

function ResultsTable({ rows }: { rows: StressRow[] }) {
  return (
    <div className="overflow-auto">
      <table className="zw-table w-full text-xs">
        <thead>
          <tr>
            <th>File</th>
            <th>Attack</th>
            <th>Robust</th>
            <th>Fragile</th>
            <th>Identity</th>
            <th>Signature</th>
            <th>Confidence</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.path}-${r.attackLabel}-${i}`}>
              <td className="font-mono truncate max-w-[220px]" title={r.path}>
                {basename(r.path)}
              </td>
              <td>{r.attackLabel}</td>
              <td>
                <SurvivalPill ok={r.attackedRobustFound} />
              </td>
              <td>
                <SurvivalPill ok={r.attackedFragileFound} />
              </td>
              <td>
                <IdentityPill
                  known={r.attackedIdentityKnown}
                  verified={r.attackedIdentityVerified}
                />
              </td>
              <td>
                <SurvivalPill
                  ok={r.attackedSignatureOk}
                  baseline={r.baselineSignatureOk}
                />
              </td>
              <td className="min-w-[140px]">
                <ConfidenceBar value={r.attackedConfidence} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SurvivalPill({ ok, baseline }: { ok: boolean; baseline?: boolean }) {
  if (ok) {
    return (
      <span className="inline-flex items-center gap-1 text-[color:var(--zw-success)]">
        <ShieldCheck size={12} /> yes
      </span>
    );
  }
  if (baseline === false) {
    return (
      <span className="inline-flex items-center gap-1 text-[color:var(--zw-text-3)]">
        <ShieldOff size={12} /> n/a
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[color:var(--zw-danger)]">
      <ShieldOff size={12} /> broke
    </span>
  );
}

function IdentityPill({
  known,
  verified,
}: {
  known: boolean;
  verified: boolean;
}) {
  if (!known) {
    return (
      <span className="inline-flex items-center gap-1 text-[color:var(--zw-danger)]">
        <ShieldOff size={12} /> broke
      </span>
    );
  }
  if (verified) {
    return (
      <span className="inline-flex items-center gap-1 text-[color:var(--zw-success)]">
        <ShieldCheck size={12} /> signed
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-[color:var(--zw-warning)]"
      title="Identity matched via 40-bit fingerprint from robust layer — the fragile signature is destroyed, so this is unverified attribution."
    >
      <ShieldCheck size={12} /> claimed
    </span>
  );
}

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i === -1 ? p : p.slice(i + 1);
}
