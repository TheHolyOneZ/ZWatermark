import {
  LayoutDashboard,
  Wand2,
  ShieldCheck,
  Boxes,
  Bug,
  User,
  MonitorSmartphone,
  Filter,
  ListChecks,
  SlidersHorizontal,
  BookOpen,
} from "lucide-react";
import { useAppStore, type Route } from "../store/appStore";
import logo from "../assets/logo.png";

type Item = {
  key: Route;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  status?: "dormant";
};

const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: "Work",
    items: [
      { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
      { key: "mark", label: "Mark", icon: Wand2 },
      { key: "verify", label: "Verify", icon: ShieldCheck },
      { key: "batch", label: "Batch", icon: Boxes },
      { key: "stress", label: "Stress test", icon: Bug },
    ],
  },
  {
    label: "Trust",
    items: [
      { key: "identity", label: "Identity", icon: User },
      { key: "devices", label: "Devices", icon: MonitorSmartphone },
      { key: "rules", label: "Rules", icon: Filter, status: "dormant" },
    ],
  },
  {
    label: "Learn",
    items: [
      { key: "guide", label: "Guide", icon: BookOpen },
    ],
  },
  {
    label: "System",
    items: [
      { key: "log", label: "Log", icon: ListChecks },
      { key: "settings", label: "Settings", icon: SlidersHorizontal },
    ],
  },
];

export function LeftRail() {
  const { route, setRoute } = useAppStore();
  return (
    <nav className="zw-rail" aria-label="Primary">
      <div className="zw-rail-brand" aria-hidden>
        <img src={logo} alt="" className="zw-rail-brand-img" />
        <span className="zw-rail-brand-text">ZWatermark</span>
      </div>
      {GROUPS.map(({ label, items }) => (
        <div key={label} role="group" aria-label={label} className="contents">
          <div className="zw-rail-label" aria-hidden>
            {label}
          </div>
          {items.map(({ key, label: itemLabel, icon: Icon, status }) => (
            <button
              key={key}
              data-active={route === key}
              data-status={status}
              onClick={() => setRoute(key)}
              aria-current={route === key ? "page" : undefined}
              title={status === "dormant" ? `${itemLabel} — not wired to any pipeline yet` : undefined}
            >
              <Icon size={16} />
              <span>{itemLabel}</span>
              {status === "dormant" && <span className="zw-rail-dot" aria-hidden />}
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}