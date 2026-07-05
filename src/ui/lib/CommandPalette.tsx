import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Search } from "lucide-react";

export interface Command {
  id: string;
  label: string;
  hint?: string;
  section?: string;
  icon?: ReactNode;
  keywords?: string[];
  perform: () => void;
}

interface CommandContextValue {
  register: (cmds: Command[]) => () => void;
  open: () => void;
  close: () => void;
  toggle: () => void;
}

const CommandContext = createContext<CommandContextValue | null>(null);

export function useCommands(): CommandContextValue {
  const ctx = useContext(CommandContext);
  if (!ctx) throw new Error("useCommands must be used inside <CommandPalette>");
  return ctx;
}

function score(cmd: Command, q: string): number {
  if (!q) return 1;
  const needle = q.toLowerCase();
  const hay = [cmd.label, cmd.hint ?? "", cmd.section ?? "", ...(cmd.keywords ?? [])]
    .join(" ")
    .toLowerCase();
  if (hay.includes(needle)) {
    return cmd.label.toLowerCase().startsWith(needle) ? 3 : 2;
  }
  let i = 0;
  for (const ch of hay) {
    if (ch === needle[i]) i++;
    if (i === needle.length) return 1;
  }
  return 0;
}

interface CommandPaletteProps {
  children: ReactNode;
  staticCommands?: Command[];
}

export function CommandPalette({ children, staticCommands = [] }: CommandPaletteProps) {
  const [isOpen, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [dynamic, setDynamic] = useState<Command[][]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const register = useCallback((cmds: Command[]) => {
    setDynamic((prev) => [...prev, cmds]);
    return () => setDynamic((prev) => prev.filter((c) => c !== cmds));
  }, []);

  const open = useCallback(() => setOpen(true), []);
  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setCursor(0);
  }, []);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        toggle();
      } else if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, close, isOpen]);

  useEffect(() => {
    if (isOpen) requestAnimationFrame(() => inputRef.current?.focus());
  }, [isOpen]);

  const all = useMemo<Command[]>(
    () => [...staticCommands, ...dynamic.flat()],
    [staticCommands, dynamic],
  );

  const filtered = useMemo(() => {
    const scored = all
      .map((c) => ({ c, s: score(c, query) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s);
    return scored.map((x) => x.c);
  }, [all, query]);

  useEffect(() => {
    setCursor(0);
  }, [query, isOpen]);

  const grouped = useMemo(() => {
    const groups = new Map<string, Command[]>();
    for (const c of filtered) {
      const k = c.section ?? "General";
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(c);
    }
    return Array.from(groups.entries());
  }, [filtered]);

  const flatIndex = useMemo(() => filtered.map((c, i) => ({ c, i })), [filtered]);

  const api = useMemo<CommandContextValue>(
    () => ({ register, open, close, toggle }),
    [register, open, close, toggle],
  );

  const runAt = (i: number) => {
    const cmd = filtered[i];
    if (!cmd) return;
    close();
    queueMicrotask(() => cmd.perform());
  };

  return (
    <CommandContext.Provider value={api}>
      {children}
      {isOpen &&
        createPortal(
          <div className="zw-modal-backdrop" onMouseDown={close} data-open="true">
            <div
              className="zw-palette"
              role="dialog"
              aria-label="Command palette"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="zw-palette-search">
                <Search size={16} className="text-[color:var(--zw-text-3)]" />
                <input
                  ref={inputRef}
                  className="zw-palette-input"
                  placeholder="Type a command…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setCursor((c) => Math.min(c + 1, filtered.length - 1));
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setCursor((c) => Math.max(c - 1, 0));
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      runAt(cursor);
                    }
                  }}
                />
                <kbd className="zw-kbd">Esc</kbd>
              </div>
              <div className="zw-palette-list" role="listbox">
                {filtered.length === 0 && (
                  <div className="zw-palette-empty">No matching commands</div>
                )}
                {grouped.map(([section, items]) => (
                  <div key={section} className="zw-palette-group">
                    <div className="zw-palette-section">{section}</div>
                    {items.map((cmd) => {
                      const idx = flatIndex.find((x) => x.c === cmd)!.i;
                      const active = idx === cursor;
                      return (
                        <button
                          key={cmd.id}
                          className="zw-palette-item"
                          data-active={active}
                          onMouseEnter={() => setCursor(idx)}
                          onClick={() => runAt(idx)}
                          role="option"
                          aria-selected={active}
                        >
                          {cmd.icon && (
                            <span className="text-[color:var(--zw-text-3)]" aria-hidden>
                              {cmd.icon}
                            </span>
                          )}
                          <span className="flex-1 text-left truncate">{cmd.label}</span>
                          {cmd.hint && (
                            <span className="zw-palette-hint">{cmd.hint}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </CommandContext.Provider>
  );
}
