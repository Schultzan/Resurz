import { theme } from "../theme.js";
import { defaultMonthId } from "../storage/workspace.js";

export function MonthNavigator({ months, selectedMonthId, onSelect, onShift, compact }) {
  const sorted = [...months].sort((a, b) => a.id.localeCompare(b.id));
  const label = sorted.find((m) => m.id === selectedMonthId)?.label ?? selectedMonthId;
  const cal = defaultMonthId();
  const isCurrent = selectedMonthId === cal;

  const btn = {
    width: compact ? 34 : 40,
    height: compact ? 34 : 40,
    borderRadius: 10,
    border: `1px solid ${theme.border}`,
    background: theme.surface2,
    color: theme.textMuted,
    cursor: "pointer",
    fontSize: 18,
    lineHeight: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    transition: "background 0.15s, color 0.15s",
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: compact ? 6 : 10, flexWrap: "wrap" }}>
      <button type="button" aria-label="Föregående månad" onClick={() => onShift(-1)} style={btn}>
        ‹
      </button>
      <div
        style={{
          minWidth: compact ? 130 : 160,
          textAlign: "center",
          fontSize: compact ? 14 : 15,
          fontWeight: 700,
          color: theme.text,
          letterSpacing: "-0.02em",
        }}
      >
        {label}
      </div>
      <button type="button" aria-label="Nästa månad" onClick={() => onShift(1)} style={btn}>
        ›
      </button>
      {!isCurrent ? (
        <button
          type="button"
          aria-label="Gå till innevarande månad"
          title="Hoppa till nuvarande månad"
          onClick={() => onSelect(cal)}
          style={{
            ...btn,
            width: compact ? 34 : 40,
            color: theme.accentSand,
            borderColor: theme.borderGlow,
            background: "rgba(232, 201, 168, 0.12)",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" aria-hidden>
            <rect x="3.5" y="5.5" width="17" height="15" rx="2" />
            <path d="M8 3v4M16 3v4M3.5 11.5h17" strokeLinecap="round" />
            <path d="M8 15h3M13 15h3M8 18h3M13 18h3" strokeLinecap="round" opacity="0.55" strokeWidth="1.2" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
