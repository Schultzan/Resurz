import { useState, useEffect, useCallback, useRef, useLayoutEffect, useMemo } from "react";
import { useWorkspace } from "./hooks/useWorkspace.js";
import { DashboardView } from "./views/DashboardView.jsx";
import { PlanningView } from "./views/PlanningView.jsx";
import { DataView } from "./views/DataView.jsx";
import { AppAccessScreen } from "./components/AppAccessScreen.jsx";
import { ToastProvider } from "./components/ToastStack.jsx";
import { TeamKpiStrip } from "./components/TeamKpiStrip.jsx";
import { MonthNavigator } from "./components/MonthNavigator.jsx";
import { clearSessionUnlock, readSessionUnlocked, writeSessionUnlocked } from "./auth/appAccess.js";
import { theme } from "./theme.js";
import { buildAllocationMatrixCsv, triggerCsvDownload } from "./domain/allocationExport.js";

const font = theme.fontMono;
const bodyFont = theme.fontSans;

/** Låt webbläsarens Ctrl+Z gälla i text/nummerfält; planens undo hanteras separat under planering. */
function isNativeTextEditingTarget(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;
  const type = (el.type || "").toLowerCase();
  return (
    type === "text" ||
    type === "search" ||
    type === "email" ||
    type === "password" ||
    type === "url" ||
    type === "tel" ||
    type === "number" ||
    type === "date" ||
    type === "datetime-local" ||
    type === "month" ||
    type === "week" ||
    type === "time"
  );
}

const MAIN_TABS = [
  { id: "customers", label: "Kunder" },
  { id: "persons", label: "Personer" },
  { id: "dashboard", label: "Dashboard" },
];

export default function App() {
  const [unlocked, setUnlocked] = useState(() => readSessionUnlocked());

  if (!unlocked) {
    return (
      <AppAccessScreen
        onUnlock={() => {
          writeSessionUnlocked();
          setUnlocked(true);
        }}
      />
    );
  }

  return (
    <AuthenticatedApp
      onLock={() => {
        clearSessionUnlock();
        setUnlocked(false);
      }}
    />
  );
}

function AuthenticatedApp({ onLock }) {
  const [mainTab, setMainTab] = useState("customers");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const ws = useWorkspace();

  /** Sparar fönster-scroll per huvudflik (Kunder / Personer / Dashboard). */
  const windowScrollByTab = useRef({ customers: 0, persons: 0, dashboard: 0 });
  /** Sparar scroll i planeringsytan (kund- resp. personläge) när vyn monteras om. */
  const planningScrollTopsRef = useRef({ customer: 0, person: 0 });
  const planningScrollContainerRef = useRef(null);

  const switchMainTab = useCallback(
    (nextTab) => {
      const y = window.scrollY ?? document.documentElement.scrollTop ?? 0;
      windowScrollByTab.current[mainTab] = y;

      if (mainTab === "customers" || mainTab === "persons") {
        const el = planningScrollContainerRef.current;
        if (el) {
          const k = mainTab === "customers" ? "customer" : "person";
          planningScrollTopsRef.current[k] = el.scrollTop;
        }
      }

      setMainTab(nextTab);
    },
    [mainTab]
  );

  useLayoutEffect(() => {
    const target = windowScrollByTab.current[mainTab] ?? 0;
    window.scrollTo({ top: target, left: 0, behavior: "auto" });
  }, [mainTab]);

  const closeSettings = useCallback(() => {
    ws.flushPersist();
    setSettingsOpen(false);
  }, [ws]);

  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") closeSettings();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen, closeSettings]);

  const { undo, redo } = ws;
  const sortedMonths = useMemo(
    () => [...ws.workspace.months].sort((a, b) => a.id.localeCompare(b.id)),
    [ws.workspace.months]
  );

  const exportMatrixCsv = useCallback(() => {
    const monthLabel =
      sortedMonths.find((m) => m.id === ws.selectedMonthId)?.label ?? ws.selectedMonthId;
    const csv = buildAllocationMatrixCsv(ws.workspace, ws.selectedMonthId, monthLabel);
    triggerCsvDownload(`resurz-plan-matris-${ws.selectedMonthId}.csv`, csv);
  }, [sortedMonths, ws.workspace, ws.selectedMonthId]);

  useEffect(() => {
    const planningTab = mainTab === "customers" || mainTab === "persons";
    if (!planningTab || settingsOpen) return;
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod || e.key.toLowerCase() !== "z") return;
      if (isNativeTextEditingTarget(e.target)) return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mainTab, settingsOpen, undo, redo]);

  return (
    <ToastProvider>
    <div
      style={{
        minHeight: "100vh",
        background: `linear-gradient(165deg, ${theme.bg} 0%, ${theme.bgDeep} 55%, #120e1c 100%)`,
        color: theme.text,
        fontFamily: bodyFont,
      }}
    >
      {/* Sticky top: samma beteende vid fönster-scroll som när planeringen scrollar i egen ruta */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "rgba(18, 14, 30, 0.92)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
        }}
      >
      <header
        style={{
          borderBottom: `1px solid ${theme.border}`,
          padding: "16px 24px",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto minmax(0, 1fr)",
          alignItems: "center",
          gap: 16,
          rowGap: 12,
          background: "transparent",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            flexWrap: "wrap",
            minWidth: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 11,
                background: `linear-gradient(135deg, ${theme.accentBlue}, ${theme.accentViolet})`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: `0 6px 20px ${theme.borderGlow}`,
              }}
            >
              <span style={{ fontSize: 15, fontWeight: 800, fontFamily: font, color: "#fff" }}>3A</span>
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: "-0.5px", color: theme.text }}>Beläggning</div>
              <div style={{ fontSize: 10, color: theme.textSoft, fontFamily: font }}>
                Månadsplanering — timmar
              </div>
            </div>
          </div>

          <nav
            style={{
              display: "flex",
              gap: 4,
              flexWrap: "wrap",
              background: theme.surface,
              borderRadius: 12,
              padding: 4,
              border: `1px solid ${theme.border}`,
            }}
            aria-label="Huvudmeny"
          >
            {MAIN_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => switchMainTab(t.id)}
                style={{
                  padding: "9px 18px",
                  borderRadius: 9,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: bodyFont,
                  background: mainTab === t.id ? theme.tabActive : "transparent",
                  color: mainTab === t.id ? theme.text : theme.textMuted,
                  transition: "background 0.15s, color 0.15s",
                }}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        <div style={{ justifySelf: "center" }} aria-label="Vald månad">
          <MonthNavigator
            months={sortedMonths}
            selectedMonthId={ws.selectedMonthId}
            onSelect={ws.setSelectedMonthId}
            onShift={ws.shiftMonth}
            compact
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={onLock}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: `1px solid ${theme.border}`,
              background: "transparent",
              color: theme.textSoft,
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 600,
              fontFamily: bodyFont,
            }}
          >
            Logga ut
          </button>
          {ws.syncStatus === "loading" ? (
            <span style={{ fontSize: 11, color: theme.textMuted, fontFamily: font }}>Molnet…</span>
          ) : null}
          {ws.syncStatus === "synced" ? (
            <span style={{ fontSize: 11, color: theme.textSoft, fontFamily: font }} title="Synkat till Supabase">
              Sparat i molnet
            </span>
          ) : null}
          {ws.syncStatus === "offline" ? (
            <span
              style={{ fontSize: 11, color: theme.textMuted, fontFamily: font }}
              title="Sätt VITE_SUPABASE_URL och VITE_SUPABASE_ANON_KEY i .env"
            >
              Endast lokalt
            </span>
          ) : null}
          {ws.syncStatus === "error" ? (
            <span
              style={{ fontSize: 11, color: theme.warn, fontFamily: font, maxWidth: 180 }}
              title={ws.syncError || ""}
            >
              Molnsync fel
            </span>
          ) : null}
          <button
            type="button"
            aria-label="Exportera planeringsmatris som CSV"
            title="Exportera planeringsmatris (CSV)"
            onClick={exportMatrixCsv}
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              border: `1px solid ${theme.border}`,
              background: theme.surface2,
              color: theme.textMuted,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 0.15s, color 0.15s, border-color 0.15s",
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 5v9"
                stroke="currentColor"
                strokeWidth="1.65"
                strokeLinecap="round"
              />
              <path
                d="M8 11l4 4 4-4"
                stroke="currentColor"
                strokeWidth="1.65"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M5 19h14"
                stroke="currentColor"
                strokeWidth="1.65"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Inställningar"
            title="Inställningar"
            onClick={() => setSettingsOpen(true)}
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              border: `1px solid ${theme.border}`,
              background: theme.surface2,
              color: theme.textMuted,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 0.15s, color 0.15s, border-color 0.15s",
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7Z"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M19.4 15a1.7 1.7 0 0 0 .35 1.87l.05.05a2 2 0 1 1-2.83 2.83l-.05-.05a1.7 1.7 0 0 0-1.87-.35 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.35l-.05.05a2 2 0 1 1-2.83-2.83l.05-.05a1.7 1.7 0 0 0 .35-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.35-1.87l-.05-.05a2 2 0 1 1 2.83-2.83l.05.05a1.7 1.7 0 0 0 1.87.35h.01a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.35l.05-.05a2 2 0 1 1 2.83 2.83l-.05.05a1.7 1.7 0 0 0-.35 1.87v.01a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinejoin="round"
                opacity="0.92"
              />
            </svg>
          </button>
        </div>
      </header>
      <div
        style={{
          padding: "10px 24px 12px",
          borderBottom: `1px solid ${theme.border}`,
        }}
      >
        <TeamKpiStrip workspace={ws.workspace} selectedMonthId={ws.selectedMonthId} />
      </div>
      </div>

      <main style={{ padding: "16px 24px 48px" }}>
        {mainTab === "dashboard" && (
          <DashboardView workspace={ws.workspace} selectedMonthId={ws.selectedMonthId} />
        )}
        {(mainTab === "customers" || mainTab === "persons") && (
          <PlanningView
            mode={mainTab === "customers" ? "customer" : "person"}
            workspace={ws.workspace}
            selectedMonthId={ws.selectedMonthId}
            upsertHours={ws.upsertHours}
            getCellHours={ws.getCellHours}
            clearPersonAllocationsForMonth={ws.clearPersonAllocationsForMonth}
            clearSelectedMonthAllocations={ws.clearSelectedMonthAllocations}
            replaceCurrentMonthFromPrevious={ws.replaceCurrentMonthFromPrevious}
            transferAllocationHours={ws.transferAllocationHours}
            clearCategoryColumnAllocationsForMonth={ws.clearCategoryColumnAllocationsForMonth}
            scrollContainerRef={planningScrollContainerRef}
            planningScrollTopsRef={planningScrollTopsRef}
          />
        )}
      </main>

      {settingsOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Inställningar"
          onClick={closeSettings}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 300,
            background: theme.overlay,
            display: "flex",
            justifyContent: "flex-end",
            backdropFilter: "blur(4px)",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(100%, 960px)",
              height: "100%",
              background: theme.bg,
              borderLeft: `1px solid ${theme.border}`,
              boxShadow: theme.shadow,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "16px 20px",
                borderBottom: `1px solid ${theme.border}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                background: theme.surface,
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 17, fontWeight: 800, color: theme.text }}>Inställningar</span>
              <button
                type="button"
                onClick={closeSettings}
                style={{
                  padding: "10px 16px",
                  borderRadius: 10,
                  border: `1px solid ${theme.border}`,
                  background: theme.surface2,
                  color: theme.text,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: bodyFont,
                }}
              >
                Stäng
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px 40px" }}>
              <DataView
                workspace={ws.workspace}
                addPerson={ws.addPerson}
                updatePerson={ws.updatePerson}
                removePerson={ws.removePerson}
                addCustomer={ws.addCustomer}
                updateCustomer={ws.updateCustomer}
                removeCustomer={ws.removeCustomer}
                addInternalProject={ws.addInternalProject}
                updateInternalProject={ws.updateInternalProject}
                removeInternalProject={ws.removeInternalProject}
                addDriftCategory={ws.addDriftCategory}
                updateDriftCategory={ws.updateDriftCategory}
                removeDriftCategory={ws.removeDriftCategory}
                addDepartment={ws.addDepartment}
                updateDepartment={ws.updateDepartment}
                removeDepartment={ws.removeDepartment}
                updateSettings={ws.updateSettings}
                dataJump={null}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
    </ToastProvider>
  );
}
