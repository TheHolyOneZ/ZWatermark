import { useEffect, useMemo } from "react";
import {
  LayoutDashboard,
  Wand2,
  ShieldCheck,
  Boxes,
  Bug,
  KeyRound,
  Laptop,
  Filter,
  ScrollText,
  Cog,
  BookOpen,
} from "lucide-react";
import { TitleBar } from "../ui/TitleBar";
import { LeftRail } from "../ui/LeftRail";
import { Dashboard } from "../ui/Dashboard/Dashboard";
import { Mark } from "../ui/Mark/Mark";
import { Verify } from "../ui/Verify/Verify";
import { Batch } from "../ui/Batch/Batch";
import { Stress } from "../ui/Stress/Stress";
import { Identity } from "../ui/Identity/Identity";
import { Devices } from "../ui/Devices/Devices";
import { Rules } from "../ui/Rules/Rules";
import { Log } from "../ui/Log/Log";
import { Settings } from "../ui/Settings/Settings";
import { Guide } from "../ui/Guide/Guide";
import { SetupWizard } from "../ui/Setup/SetupWizard";
import { useAppStore, type Route } from "../store/appStore";
import { useIdentityStore } from "../store/identityStore";
import { useVaultStore } from "../store/vaultStore";
import { ToastProvider } from "../ui/lib/Toast";
import { CommandPalette, type Command } from "../ui/lib/CommandPalette";
import { RegistryImportModal } from "../ui/lib/RegistryImportModal";
import { VaultGate } from "../ui/lib/VaultGate";

const ROUTES: Array<{ route: Route; label: string; icon: React.ReactNode }> = [
  { route: "dashboard", label: "Go to Dashboard", icon: <LayoutDashboard size={14} /> },
  { route: "mark", label: "Go to Mark", icon: <Wand2 size={14} /> },
  { route: "verify", label: "Go to Verify", icon: <ShieldCheck size={14} /> },
  { route: "batch", label: "Go to Batch", icon: <Boxes size={14} /> },
  { route: "stress", label: "Go to Stress test", icon: <Bug size={14} /> },
  { route: "identity", label: "Go to Identity", icon: <KeyRound size={14} /> },
  { route: "devices", label: "Go to Devices", icon: <Laptop size={14} /> },
  { route: "rules", label: "Go to Rules", icon: <Filter size={14} /> },
  { route: "guide", label: "Go to Guide", icon: <BookOpen size={14} /> },
  { route: "log", label: "Go to Log", icon: <ScrollText size={14} /> },
  { route: "settings", label: "Go to Settings", icon: <Cog size={14} /> },
];

export function App() {
  return (
    <ToastProvider>
      <AppInner />
    </ToastProvider>
  );
}

function AppInner() {
  const { route, setRoute } = useAppStore();
  const { identities, load: loadIdentities, needsSetup } = useIdentityStore();
  const { status: vault, ready: vaultReady, refresh: refreshVault } = useVaultStore();

  useEffect(() => {
    refreshVault();
  }, [refreshVault]);

  useEffect(() => {
    if (vault.enabled && !vault.unlocked) return;
    loadIdentities();
  }, [loadIdentities, vault.enabled, vault.unlocked]);

  const staticCommands = useMemo<Command[]>(
    () =>
      ROUTES.map((r) => ({
        id: `nav.${r.route}`,
        section: "Navigate",
        label: r.label,
        icon: r.icon,
        keywords: [r.route],
        hint: r.route === route ? "Current" : undefined,
        perform: () => setRoute(r.route),
      })),
    [route, setRoute],
  );

  if (!vaultReady) {
    return <div className="zw-shell" />;
  }

  if (vault.enabled && !vault.unlocked) {
    return (
      <div className="zw-shell">
        <TitleBar />
        <VaultGate />
      </div>
    );
  }

  if (needsSetup) {
    return (
      <div className="zw-shell">
        <TitleBar />
        <SetupWizard />
      </div>
    );
  }

  return (
    <CommandPalette staticCommands={staticCommands}>
      <div className="zw-shell">
        <TitleBar />
        <div className="zw-body">
          <LeftRail />
          <main className="zw-main">
            {route === "dashboard" && <Dashboard />}
            {route === "mark" && <Mark />}
            {route === "verify" && <Verify />}
            {route === "batch" && <Batch />}
            {route === "stress" && <Stress />}
            {route === "identity" && <Identity identities={identities} />}
            {route === "devices" && <Devices />}
            {route === "rules" && <Rules />}
            {route === "guide" && <Guide />}
            {route === "log" && <Log />}
            {route === "settings" && <Settings />}
          </main>
        </div>
        <RegistryImportModal />
      </div>
    </CommandPalette>
  );
}
