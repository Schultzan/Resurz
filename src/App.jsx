import { useState, useEffect } from "react";
import { useWorkspace } from "./hooks/useWorkspace.js";
import { DashboardView } from "./views/DashboardView.jsx";
import { PlanningView } from "./views/PlanningView.jsx";
import { DataView } from "./views/DataView.jsx";
import { theme } from "./theme.js";

const font = theme.fontMono;
const bodyFont = theme.fontSans;

const MAIN_TABS = [
  { id: "planning", label: "Planering" },
  { id: "dashboard", label: "Dashboard" },
];

export default function App() {
  const [mainTab, setMainTab] = useState("planning");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const ws = useWorkspace();

  useEffect(() => {
    if (!settingsOpen) return;
    const onKey = (e) => {
      if (e.key === "Escape") setSettingsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: `linear-gradient(165deg, ${theme.bg} 0%, ${theme.bgDeep} 55%, #120e1c 100%)`,
        color: theme.text,
        fontFamily: bodyFont,
      }}
    >
      <header
        style={{
          borderBottom: `1px solid ${theme.border}`,
          padding: "16px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          background: "rgba(30, 24, 51, 0.45)",
          backdropFilter: "blur(10px)",
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
        >
          {MAIN_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setMainTab(t.id)}
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

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginLeft: "auto" }}>
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

      <main style={{ padding: "22px 24px 48px" }}>
        {mainTab === "dashboard" && (
          <DashboardView
            workspace={ws.workspace}
            selectedMonthId={ws.selectedMonthId}
            setSelectedMonthId={ws.setSelectedMonthId}
            shiftMonth={ws.shiftMonth}
          />
        )}
        {mainTab === "planning" && (
          <PlanningView
            workspace={ws.workspace}
            selectedMonthId={ws.selectedMonthId}
            setSelectedMonthId={ws.setSelectedMonthId}
            shiftMonth={ws.shiftMonth}
            upsertHours={ws.upsertHours}
            getCellHours={ws.getCellHours}
            clearPersonAllocationsForMonth={ws.clearPersonAllocationsForMonth}
          />
        )}
      </main>

      {settingsOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Inställningar"
          onClick={() => setSettingsOpen(false)}
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
                onClick={() => setSettingsOpen(false)}
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
  );
}
