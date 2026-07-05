import { useEffect, useMemo, useState } from "react";
import {
  ScrollText,
  Search,
  FolderOpen,
  ShieldCheck,
  ShieldAlert,
  Clock,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useCapturesStore } from "../../store/capturesStore";
import { useActivityStore } from "../../store/activityStore";
import type { ActivityLevel, ActivitySource } from "../../ipc/bridge";
import { Panel } from "../lib/Panel";
import { Card } from "../lib/Card";
import { Input } from "../lib/Input";
import { Badge } from "../lib/Badge";
import { EmptyState } from "../lib/EmptyState";
import { Segmented } from "../lib/Segmented";
import { Button } from "../lib/Button";
import { Select } from "../lib/Select";
import { HelpTip } from "../lib/HelpTip";

type Tab = "activity" | "captures";
type CaptureFilter = "all" | "verified" | "fragile";
type TimeRange = "hour" | "today" | "all";

const LEVELS: ActivityLevel[] = ["info", "success", "warning", "error"];
const SOURCES: ActivitySource[] = [
  "capture",
  "mark",
  "verify",
  "batch",
  "identity",
  "device",
  "rules",
  "vault",
  "system",
];

export function Log() {
  const [tab, setTab] = useState<Tab>("activity");

  return (
    <Panel
      title="Log"
      subtitle="Everything the app does — activity feed plus the raw screenshot capture history."
      actions={
        <span className="inline-flex items-center">
          <Segmented
            value={tab}
            onChange={setTab}
            ariaLabel="Log view"
            options={[
              { value: "activity", label: "Activity" },
              { value: "captures", label: "Captures" },
            ]}
          />
          <HelpTip
            ariaLabel="What is the difference between Activity and Captures?"
            placement="bottom"
            content={
              <div className="flex flex-col gap-1.5">
                <div><strong>Activity</strong> — a running feed of everything the app does: marks, verifies, batches, errors, vault events. Think of it as a diary of the app itself.</div>
                <div><strong>Captures</strong> — just the screenshots that came in, with their signed / fragile status. The images, not the events around them.</div>
              </div>
            }
          />
        </span>
      }
    >
      {tab === "activity" ? <ActivityView /> : <CapturesView />}
    </Panel>
  );
}


function ActivityView() {
  const { entries, refresh, subscribe } = useActivityStore();
  const [q, setQ] = useState("");
  const [levels, setLevels] = useState<Set<ActivityLevel>>(new Set(LEVELS));
  const [sources, setSources] = useState<Set<ActivitySource>>(new Set(SOURCES));
  const [range, setRange] = useState<TimeRange>("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    refresh();
    let unlisten: (() => void) | undefined;
    subscribe().then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [refresh, subscribe]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const cutoff = rangeCutoff(range);
    return entries.filter((e) => {
      if (!levels.has(e.level)) return false;
      if (!sources.has(e.source)) return false;
      if (cutoff !== null && e.epochMs < cutoff) return false;
      if (needle) {
        const hay = `${e.message} ${e.details ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [entries, q, levels, sources, range]);

  const toggleLevel = (lvl: ActivityLevel) => {
    const next = new Set(levels);
    if (next.has(lvl)) next.delete(lvl);
    else next.add(lvl);
    if (next.size === 0) return;
    setLevels(next);
  };
  const toggleSource = (src: ActivitySource) => {
    const next = new Set(sources);
    if (next.has(src)) next.delete(src);
    else next.add(src);
    if (next.size === 0) return;
    setSources(next);
  };
  const toggleExpanded = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpanded(next);
  };

  const isFiltering =
    q.trim().length > 0 ||
    levels.size !== LEVELS.length ||
    sources.size !== SOURCES.length ||
    range !== "all";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          icon={<Search size={14} />}
          placeholder="Search messages…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          wrapperClassName="flex-1 min-w-[240px]"
        />
        <Select
          value={range}
          onChange={(v) => setRange(v as TimeRange)}
          ariaLabel="Time range"
          options={[
            { value: "hour", label: "Last hour" },
            { value: "today", label: "Today" },
            { value: "all", label: "All time" },
          ]}
        />
        <Button variant="ghost" size="sm" onClick={refresh}>
          Refresh
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="zw-small inline-flex items-center">
          Level:
          <HelpTip
            ariaLabel="What do the log levels mean?"
            content={
              <div className="flex flex-col gap-1">
                <div><strong>Info</strong> — routine events; nothing needs your attention.</div>
                <div><strong>Success</strong> — an operation completed cleanly (a mark, a verify).</div>
                <div><strong>Warning</strong> — something odd happened but the app kept going.</div>
                <div><strong>Error</strong> — something failed; the details usually explain why.</div>
              </div>
            }
          />
        </span>
        {LEVELS.map((lvl) => (
          <FilterChip
            key={lvl}
            active={levels.has(lvl)}
            onClick={() => toggleLevel(lvl)}
            title={lvl}
          >
            <span
              className="zw-badge-dot"
              aria-hidden
              style={{ background: levelDot(lvl) }}
            />
            {lvl}
          </FilterChip>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="zw-small">Source:</span>
        {SOURCES.map((src) => (
          <FilterChip
            key={src}
            active={sources.has(src)}
            onClick={() => toggleSource(src)}
            title={src}
          >
            {src}
          </FilterChip>
        ))}
      </div>

      {isFiltering && (
        <div className="zw-small">
          Showing{" "}
          <strong className="text-[color:var(--zw-text-1)]">
            {filtered.length}
          </strong>{" "}
          of {entries.length} event{entries.length === 1 ? "" : "s"}
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={<ScrollText size={40} strokeWidth={1.4} />}
          title={entries.length === 0 ? "No activity yet" : "No matches"}
          description={
            entries.length === 0
              ? "The app hasn't logged anything this session. Try marking a file or taking a screenshot."
              : "Try widening the filters or clearing the search."
          }
        />
      ) : (
        <Card>
          <ul className="flex flex-col divide-y divide-[color:var(--zw-border)]">
            {filtered.map((e) => {
              const isOpen = expanded.has(e.id);
              const hasDetails = Boolean(e.details);
              return (
                <li key={e.id} className="flex flex-col gap-1 px-3 py-2">
                  <div className="flex items-start gap-2">
                    <span
                      className="mt-1.5 h-2 w-2 rounded-full shrink-0"
                      style={{ background: levelDot(e.level) }}
                      aria-hidden
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={sourceVariant(e.source)}>
                          {e.source}
                        </Badge>
                        <span className="text-[color:var(--zw-text-1)] text-sm">
                          {e.message}
                        </span>
                      </div>
                      {isOpen && hasDetails && (
                        <div className="mt-1 font-mono text-xs text-[color:var(--zw-text-3)] break-all">
                          {e.details}
                        </div>
                      )}
                    </div>
                    <span className="tabular-nums text-xs text-[color:var(--zw-text-2)] shrink-0 mt-1">
                      <Clock size={11} className="inline mr-1" />
                      {friendlyTime(e.epochMs)}
                    </span>
                    {hasDetails && (
                      <button
                        className="mt-0.5 text-[color:var(--zw-text-3)] hover:text-[color:var(--zw-text-1)] shrink-0"
                        onClick={() => toggleExpanded(e.id)}
                        aria-label={isOpen ? "Collapse details" : "Show details"}
                        title={isOpen ? "Collapse details" : "Show details"}
                      >
                        {isOpen ? (
                          <ChevronDown size={14} />
                        ) : (
                          <ChevronRight size={14} />
                        )}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}


function CapturesView() {
  const { entries, refresh } = useCapturesStore();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<CaptureFilter>("all");

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return entries.filter((e) => {
      if (filter === "verified" && !e.verified) return false;
      if (filter === "fragile" && e.verified) return false;
      if (needle && !e.path.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [entries, q, filter]);

  const isFiltering = q.trim().length > 0 || filter !== "all";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          icon={<Search size={14} />}
          placeholder="Search filename or path…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          wrapperClassName="flex-1 min-w-[240px]"
        />
        <Segmented
          value={filter}
          onChange={setFilter}
          ariaLabel="Filter"
          options={[
            { value: "all", label: `All (${entries.length})` },
            { value: "verified", label: "Signed" },
            { value: "fragile", label: "Fragile only" },
          ]}
        />
        <Button variant="ghost" size="sm" onClick={refresh}>
          Refresh
        </Button>
      </div>

      {isFiltering && filtered.length > 0 && (
        <div className="zw-small">
          Showing{" "}
          <strong className="text-[color:var(--zw-text-1)]">
            {filtered.length}
          </strong>{" "}
          of {entries.length} capture{entries.length === 1 ? "" : "s"}
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={<ScrollText size={40} strokeWidth={1.4} />}
          title={entries.length === 0 ? "No captures yet" : "No matches"}
          description={
            entries.length === 0
              ? "Take a screenshot the normal way — it'll appear here."
              : "Try clearing the search or switching the filter."
          }
        />
      ) : (
        <Card>
          <table className="zw-table">
            <thead>
              <tr>
                <th style={{ width: 120 }}>Status</th>
                <th>File</th>
                <th style={{ width: 80 }} className="text-right">
                  Bits
                </th>
                <th style={{ width: 100 }}>When</th>
                <th style={{ width: 44 }}>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id}>
                  <td>
                    {(() => {
                      const state = e.verified ? "signed" : e.payloadBits > 0 ? "fragile" : "detected";
                      return (
                        <Badge variant={state === "signed" ? "success" : state === "fragile" ? "warning" : "neutral"}>
                          {state === "signed" ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />}
                          <span>{state === "signed" ? "Signed" : state === "fragile" ? "Fragile" : "Detected"}</span>
                        </Badge>
                      );
                    })()}
                  </td>
                  <td>
                    <div className="font-mono text-xs truncate max-w-[380px] text-[color:var(--zw-text-1)]">
                      {baseName(e.path)}
                    </div>
                    <div className="font-mono text-[10px] text-[color:var(--zw-text-3)] truncate max-w-[380px] mt-0.5">
                      {dirName(e.path)}
                    </div>
                  </td>
                  <td className="tabular-nums text-xs text-right">
                    {e.payloadBits}
                  </td>
                  <td className="text-xs text-[color:var(--zw-text-2)] tabular-nums">
                    <span className="inline-flex items-center gap-1">
                      <Clock size={11} />
                      {relativeTime(e.epochMs)}
                    </span>
                  </td>
                  <td>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon={<FolderOpen size={12} />}
                      aria-label="Reveal in folder"
                      onClick={() => void revealItemInDir(e.path).catch(() => {})}
                    >
                      <span className="sr-only">Reveal</span>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}


interface FilterChipProps {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}

function FilterChip({ active, onClick, title, children }: FilterChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs capitalize border transition-colors"
      style={{
        borderColor: active ? "var(--zw-accent)" : "var(--zw-border)",
        background: active ? "var(--zw-accent-soft, var(--zw-surface-2))" : "transparent",
        color: active ? "var(--zw-text-1)" : "var(--zw-text-3)",
      }}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

function levelDot(level: ActivityLevel): string {
  switch (level) {
    case "success":
      return "var(--zw-success, #16a34a)";
    case "warning":
      return "var(--zw-warning, #f59e0b)";
    case "error":
      return "var(--zw-error, #dc2626)";
    case "info":
    default:
      return "var(--zw-accent, #6366f1)";
  }
}

function sourceVariant(source: ActivitySource): "neutral" | "info" | "success" | "warning" | "error" {
  switch (source) {
    case "capture":
    case "mark":
      return "info";
    case "verify":
      return "success";
    case "vault":
      return "warning";
    case "system":
      return "neutral";
    default:
      return "neutral";
  }
}

function rangeCutoff(range: TimeRange): number | null {
  const now = Date.now();
  if (range === "hour") return now - 60 * 60 * 1000;
  if (range === "today") {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }
  return null;
}

function baseName(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i >= 0 ? p.slice(i + 1) : p;
}

function dirName(p: string): string {
  const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
  return i >= 0 ? p.slice(0, i) : "";
}

function relativeTime(epochMs: number): string {
  const diff = Date.now() - epochMs;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}


function friendlyTime(epochMs: number): string {
  const diff = Date.now() - epochMs;
  if (diff < 24 * 60 * 60 * 1000) return relativeTime(epochMs);
  const d = new Date(epochMs);
  return d.toLocaleString();
}
