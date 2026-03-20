import { useState, useMemo, useRef, useEffect } from "react";
import {
  teamMetrics,
  customerColumnMetrics,
  internalProjectColumnMetrics,
  driftColumnMetrics,
  allocationsForMonth,
  personHourBreakdown,
  personDerived,
  customerCellBudgetLimit,
  customerBudgetTimmar,
} from "../domain/calculations.js";
import { feasibleCustomerColumnMaxTotal } from "../domain/customerColumnRedistribute.js";
import { wholeHours, formatHours } from "../domain/hours.js";
import { theme } from "../theme.js";
import { MonthNavigator } from "../components/MonthNavigator.jsx";

const LS_PLAN_INTERNAL = "resurz-plan-internal-open";
const LS_PLAN_DRIFT = "resurz-plan-drift-open";
const LS_PLAN_VIEW = "resurz-plan-view-mode";

const font = theme.fontMono;
const bodyFont = theme.fontSans;

const COL_CUSTOMER = theme.billable;
const COL_INTERNAL = theme.internal;
const COL_DRIFT = theme.drift;

const cellInput = {
  width: 50,
  padding: "4px 2px",
  textAlign: "center",
  background: theme.bgDeep,
  border: `1px solid ${theme.border}`,
  borderRadius: 6,
  color: theme.text,
  fontSize: 11,
  fontFamily: font,
};

/** timmar/ms — snabbt drag → tiotal, mellan → femtal, sakta → heltal. */
const SNAP_SPEED_10 = 0.22;
const SNAP_SPEED_5 = 0.035;

function snapHoursFromDrag(raw, maxVal, speed) {
  const r = wholeHours(raw);
  let step = 1;
  if (speed >= SNAP_SPEED_10) step = 10;
  else if (speed >= SNAP_SPEED_5) step = 5;
  const snapped = Math.round(r / step) * step;
  return Math.max(0, Math.min(maxVal, wholeHours(snapped)));
}

function pct(x) {
  return `${Math.round(x * 100)}%`;
}

function allocColor(w) {
  if (w === "under") return theme.warn;
  if (w === "over") return theme.danger;
  return theme.ok;
}

/** En segment = planerade timmar med färg (t.ex. per kund/projekt). */
function allocationBarSegments(personId, activeCustomers, activeInternal, driftCategories, getCellHours) {
  const segs = [];
  for (const c of activeCustomers) {
    const value = getCellHours(personId, "customer", c.id);
    if (value > 0) segs.push({ value, color: c.color || COL_CUSTOMER });
  }
  for (const p of activeInternal) {
    const value = getCellHours(personId, "internalProject", p.id);
    if (value > 0) segs.push({ value, color: p.color || COL_INTERNAL });
  }
  for (const d of driftCategories) {
    const value = getCellHours(personId, "internalDrift", d.id);
    if (value > 0) segs.push({ value, color: d.color || COL_DRIFT });
  }
  return segs;
}

/** Stacked hours bar as % of capacity (clamped display for over-capacity) */
function HoursBar({ segments, capacity, height = 6 }) {
  const cap = Math.max(0.01, capacity);
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total <= 0) {
    return (
      <div
        style={{
          display: "flex",
          height,
          borderRadius: 999,
          background: theme.surface2,
          width: "100%",
        }}
      />
    );
  }
  const scale = total > cap ? cap / total : 1;
  const seg = segments.map((x) => ({ v: Math.max(0, x.value) * scale, c: x.color }));
  const shownPct = Math.min(100, (total / cap) * 100);
  return (
    <div
      style={{
        display: "flex",
        height,
        borderRadius: 999,
        overflow: "hidden",
        background: theme.surface2,
        width: "100%",
      }}
    >
      {seg.map((s, i) =>
        s.v > 0 ? (
          <div
            key={i}
            style={{
              width: `${(s.v / cap) * 100}%`,
              background: s.c,
              transition: "width 0.2s ease",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12)",
            }}
          />
        ) : null
      )}
      {shownPct < 100 && total <= cap && (
        <div style={{ flex: 1, minWidth: `${100 - (total / cap) * 100}%`, background: "transparent" }} />
      )}
    </div>
  );
}

function HourSliderRow({
  label,
  sublabel,
  accent,
  hours,
  cap,
  onChange,
  customerMax,
  budgetHintLine,
  maxSlider: maxSliderOverride,
  /** Kundvy: uppdatera bara UI under drag; skicka värdet till parent först vid pointerup (undviker kedjereaktioner). */
  commitOnPointerUp = false,
}) {
  const v = wholeHours(hours);
  const hasCustCap = customerMax !== undefined && Number.isFinite(customerMax);
  const maxSlider =
    maxSliderOverride !== undefined && Number.isFinite(maxSliderOverride)
      ? Math.max(wholeHours(maxSliderOverride), v, 1)
      : hasCustCap
        ? Math.max(v, customerMax, customerMax === 0 && v === 0 ? 0 : 1)
        : Math.max(cap, v, 1);
  const dragRef = useRef({ t: 0, raw: v });
  const ptrDownRef = useRef(false);
  const [draft, setDraft] = useState(null);

  useEffect(() => {
    if (!ptrDownRef.current) setDraft(null);
  }, [hours]);

  const shownVal = Math.min(v, maxSlider);
  const draftShown = draft != null ? Math.min(wholeHours(draft), maxSlider) : null;
  const rangeVal = draftShown != null ? draftShown : shownVal;
  const displayV = rangeVal;
  const fillPct = maxSlider > 0 ? (rangeVal / maxSlider) * 100 : 0;
  const atCustomerCap =
    hasCustCap && customerMax >= 0 && displayV >= customerMax && displayV > 0;

  const handleRangeChange = (e) => {
    const raw = wholeHours(e.target.value);
    if (commitOnPointerUp && ptrDownRef.current) {
      dragRef.current = { t: Date.now(), raw };
      setDraft(raw);
      return;
    }
    const now = Date.now();
    const prev = dragRef.current;
    const dt = Math.max(now - prev.t, 1);
    const dRaw = Math.abs(raw - prev.raw);
    const speed = dRaw / dt;
    dragRef.current = { t: now, raw };
    const c = snapHoursFromDrag(raw, maxSlider, speed);
    if (commitOnPointerUp) {
      if (c !== v) onChange(c);
    } else {
      onChange(c);
    }
  };

  return (
    <div
      className="plan-slider-wrap"
      style={{
        ["--slider-accent"]: accent,
        ["--slider-fill-pct"]: `${fillPct}%`,
        display: "grid",
        gridTemplateColumns: "minmax(100px, 1fr) 1fr auto",
        gap: 8,
        alignItems: "center",
      padding: "7px 10px",
        borderRadius: 11,
        background: displayV > 0 ? theme.surface : theme.bgDeep,
        border: `1px solid ${
          atCustomerCap
            ? "rgba(232, 186, 168, 0.55)"
            : displayV > 0
              ? `${accent}55`
              : theme.border
        }`,
        marginBottom: 6,
        boxShadow: atCustomerCap ? "inset 0 0 0 1px rgba(232, 186, 168, 0.28)" : "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <div
          style={{
            width: 5,
            alignSelf: "stretch",
            minHeight: 36,
            borderRadius: 4,
            background: accent,
            opacity: displayV > 0 ? 1 : 0.42,
            flexShrink: 0,
            boxShadow: `inset 0 0 0 1px ${theme.border}`,
          }}
        />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: displayV > 0 ? theme.text : theme.textMuted,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </div>
          {sublabel ? <div style={{ fontSize: 9, color: theme.textSoft, marginTop: 1 }}>{sublabel}</div> : null}
          {budgetHintLine ? (
            <div style={{ fontSize: 9, color: theme.textMuted, marginTop: 4, lineHeight: 1.35 }}>
              {budgetHintLine}
            </div>
          ) : null}
        </div>
      </div>
      <input
        type="range"
        className="plan-slider"
        min={0}
        max={maxSlider}
        step={1}
        value={rangeVal}
        onPointerDown={(e) => {
          dragRef.current = { t: Date.now(), raw: shownVal };
          if (commitOnPointerUp) {
            ptrDownRef.current = true;
            setDraft(shownVal);
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              /* ignore */
            }
          }
        }}
        onPointerUp={(e) => {
          if (!commitOnPointerUp || !ptrDownRef.current) return;
          ptrDownRef.current = false;
          try {
            e.currentTarget.releasePointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
          const raw = wholeHours(e.currentTarget.value);
          const now = Date.now();
          const prev = dragRef.current;
          const dt = Math.max(now - prev.t, 1);
          const dRaw = Math.abs(raw - prev.raw);
          const speed = dRaw / dt;
          dragRef.current = { t: now, raw };
          const c = snapHoursFromDrag(raw, maxSlider, speed);
          setDraft(null);
          if (c !== v) onChange(c);
        }}
        onPointerCancel={(e) => {
          if (!commitOnPointerUp || !ptrDownRef.current) return;
          ptrDownRef.current = false;
          try {
            e.currentTarget.releasePointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
          setDraft(null);
        }}
        onFocus={() => {
          if (commitOnPointerUp && !ptrDownRef.current) {
            dragRef.current = { t: Date.now(), raw: shownVal };
          }
        }}
        onChange={handleRangeChange}
      />
      <input
        type="number"
        min={0}
        step={1}
        value={(draft != null ? draftShown : v) || ""}
        placeholder="0"
        onChange={(e) => {
          ptrDownRef.current = false;
          setDraft(null);
          onChange(wholeHours(e.target.value));
        }}
        style={{ ...cellInput, width: 56, flexShrink: 0 }}
      />
    </div>
  );
}

function CollapsiblePlanningSection({ title, accent, open, onToggle, summary, children }) {
  return (
    <div style={{ marginBottom: 2 }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          textAlign: "left",
          background: open ? theme.surface2 : "rgba(36, 30, 58, 0.35)",
          border: `1px solid ${open ? `${accent}40` : theme.border}`,
          borderRadius: 10,
          padding: "8px 11px",
          cursor: "pointer",
          marginTop: 14,
          marginBottom: open ? 2 : 0,
          transition: "background 0.15s, border-color 0.15s",
        }}
      >
        <span
          style={{
            color: accent,
            fontSize: 10,
            width: 14,
            fontWeight: 800,
            flexShrink: 0,
          }}
          aria-hidden
        >
          {open ? "▼" : "▶"}
        </span>
        <span style={{ fontWeight: 700, color: accent, fontSize: 11, letterSpacing: 0.3 }}>{title}</span>
        {summary ? (
          <span style={{ marginLeft: "auto", fontSize: 11, color: theme.textMuted, fontFamily: font }}>
            {summary}
          </span>
        ) : null}
      </button>
      {open ? <div style={{ marginTop: 4 }}>{children}</div> : null}
    </div>
  );
}

const DRAG_MIME = "application/x-resurz-person";

export function PlanningView({
  workspace,
  selectedMonthId,
  setSelectedMonthId,
  shiftMonth,
  upsertHours,
  setCustomerColumnTotal,
  getCellHours,
  clearPersonAllocationsForMonth,
}) {
  const activePeople = workspace.people.filter((p) => p.active !== false);
  const activeCustomers = workspace.customers.filter((c) => c.active !== false);
  const activeInternal = workspace.internalProjects.filter((p) => p.active !== false);
  const driftCategories = workspace.driftCategories || [];
  const tm = teamMetrics(workspace, selectedMonthId);
  const custCols = customerColumnMetrics(workspace, selectedMonthId);
  const intCols = internalProjectColumnMetrics(workspace, selectedMonthId);
  const driftCols = driftColumnMetrics(workspace, selectedMonthId);
  const sortedMonths = [...workspace.months].sort((a, b) => a.id.localeCompare(b.id));
  const selectedMonthLabel =
    sortedMonths.find((m) => m.id === selectedMonthId)?.label ?? selectedMonthId;

  const customersById = useMemo(
    () => Object.fromEntries(workspace.customers.map((c) => [c.id, c])),
    [workspace.customers]
  );

  const monthAlloc = allocationsForMonth(workspace.allocations, selectedMonthId);

  const [selectedId, setSelectedId] = useState(null);
  const [internalSectionOpen, setInternalSectionOpen] = useState(() => {
    try {
      return localStorage.getItem(LS_PLAN_INTERNAL) === "1";
    } catch {
      return false;
    }
  });
  const [driftSectionOpen, setDriftSectionOpen] = useState(() => {
    try {
      return localStorage.getItem(LS_PLAN_DRIFT) === "1";
    } catch {
      return false;
    }
  });

  const [planMode, setPlanMode] = useState(() => {
    try {
      const v = localStorage.getItem(LS_PLAN_VIEW);
      return v === "customer" ? "customer" : "person";
    } catch {
      return "person";
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(LS_PLAN_VIEW, planMode);
    } catch {
      /* ignore */
    }
  }, [planMode]);

  const contributorsByCustomer = useMemo(() => {
    const monthSlice = allocationsForMonth(workspace.allocations, selectedMonthId);
    /** @type {Record<string, string[]>} */
    const out = {};
    for (const c of activeCustomers) {
      const ids = new Set();
      for (const a of monthSlice) {
        if (a.categoryType === "customer" && a.refId === c.id && wholeHours(a.hours) > 0) {
          ids.add(a.personId);
        }
      }
      out[c.id] = [...ids].filter((pid) => activePeople.some((p) => p.id === pid));
    }
    return out;
  }, [workspace.allocations, selectedMonthId, activeCustomers, activePeople]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_PLAN_INTERNAL, internalSectionOpen ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [internalSectionOpen]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_PLAN_DRIFT, driftSectionOpen ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [driftSectionOpen]);

  const resolvedPersonId = useMemo(() => {
    if (!activePeople.length) return null;
    if (selectedId && activePeople.some((p) => p.id === selectedId)) return selectedId;
    return activePeople[0].id;
  }, [activePeople, selectedId]);

  const selectedPerson = activePeople.find((p) => p.id === resolvedPersonId);

  const sidebarRowStats = (person) => {
    const b = personHourBreakdown(monthAlloc, person.id, customersById);
    const d = personDerived(b, person.kapacitetPerManad);
    return { ...b, ...d, cap: person.kapacitetPerManad };
  };

  return (
    <div style={{ fontFamily: bodyFont, color: theme.text }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 14,
          marginBottom: 16,
        }}
      >
        <MonthNavigator
          months={sortedMonths}
          selectedMonthId={selectedMonthId}
          onSelect={setSelectedMonthId}
          onShift={shiftMonth}
          compact
        />
        <div
          style={{
            display: "flex",
            background: theme.surface,
            borderRadius: 10,
            border: `1px solid ${theme.border}`,
            padding: 3,
            gap: 2,
          }}
          role="group"
          aria-label="Planeringsvy"
        >
          <button
            type="button"
            onClick={() => setPlanMode("person")}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 700,
              fontFamily: bodyFont,
              background: planMode === "person" ? theme.tabActive : "transparent",
              color: planMode === "person" ? theme.text : theme.textMuted,
            }}
          >
            Personer
          </button>
          <button
            type="button"
            onClick={() => setPlanMode("customer")}
            style={{
              padding: "8px 14px",
              borderRadius: 8,
              border: "none",
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 700,
              fontFamily: bodyFont,
              background: planMode === "customer" ? theme.tabActive : "transparent",
              color: planMode === "customer" ? theme.text : theme.textMuted,
            }}
          >
            Kunder
          </button>
        </div>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: theme.textSoft, marginBottom: 5 }}>SNABB KPI (TEAM)</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <Kpi label="Kapacitet" value={`${tm.teamkapacitet} h`} />
            <Kpi label="Fakturerbart" value={`${formatHours(tm.teamFakturerbara)} h`} accent={theme.billable} />
            <Kpi label="Internt proj." value={`${formatHours(tm.teamInternProj)} h`} accent={theme.internal} />
            <Kpi label="Intern drift" value={`${formatHours(tm.teamInternDrift)} h`} accent={theme.drift} />
            <Kpi label="Allokerat" value={`${formatHours(tm.teamTot)} h`} />
            <Kpi
              label="Kvar"
              value={`${formatHours(tm.teamKvar)} h`}
              accent={tm.teamKvar < 0 ? theme.danger : theme.ok}
            />
            <Kpi label="Allok. %" value={pct(tm.teamAllocGrad)} />
            <Kpi label="Fakt. %" value={pct(tm.teamBillGrad)} />
            <Kpi
              label="Intäkt"
              value={`${Math.round(tm.teamIntakt).toLocaleString("sv-SE")} kr`}
              accent={theme.revenue}
            />
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          minHeight: 480,
          maxHeight: "calc(100vh - 200px)",
          overflowY: "auto",
          overflowX: "hidden",
          border: `1px solid ${theme.border}`,
          borderRadius: 14,
          background: theme.surface,
        }}
      >
        {/* Sidebar — sticky så team alltid nåbart vid scroll (t.ex. kundvy) */}
        <div
          style={{
            position: "sticky",
            top: 0,
            alignSelf: "flex-start",
            width: 252,
            flexShrink: 0,
            borderRight: `1px solid ${theme.border}`,
            background: theme.bgDeep,
            display: "flex",
            flexDirection: "column",
            maxHeight: "calc(100vh - 200px)",
            zIndex: 2,
          }}
        >
          <div
            style={{
              padding: "11px 12px 6px",
              fontSize: 9,
              fontWeight: 700,
              color: theme.textSoft,
              fontFamily: font,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            {planMode === "customer" ? (
              <>
                Team — dra till kund
                <div style={{ fontSize: 8, fontWeight: 600, color: theme.textSoft, marginTop: 3 }}>{activePeople.length} personer</div>
              </>
            ) : (
              <>Team ({activePeople.length})</>
            )}
          </div>
          <div style={{ flex: 1, overflowY: "auto" }}>
            {activePeople.map((person) => {
              const st = sidebarRowStats(person);
              const isSel = planMode === "person" && resolvedPersonId === person.id;
              return (
                <button
                  key={person.id}
                  type="button"
                  draggable={planMode === "customer"}
                  onDragStart={(e) => {
                    if (planMode !== "customer") return;
                    e.dataTransfer.setData(DRAG_MIME, person.id);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => setSelectedId(person.id)}
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 12px",
                    cursor: planMode === "customer" ? "grab" : "pointer",
                    border: "none",
                    borderLeft: `3px solid ${isSel ? theme.accentBlue : "transparent"}`,
                    background: isSel ? theme.surface : "transparent",
                    color: "inherit",
                    transition: "background 0.15s",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: isSel ? theme.text : theme.textMuted,
                      }}
                    >
                      {person.name}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 800,
                        fontFamily: font,
                        color:
                          st.total > st.cap
                            ? theme.danger
                            : st.total === st.cap
                              ? theme.ok
                              : st.total === 0
                                ? theme.textSoft
                                : theme.warn,
                      }}
                    >
                      {st.total.toFixed(0)}/{st.cap}h
                    </span>
                  </div>
                  <HoursBar
                    segments={allocationBarSegments(
                      person.id,
                      activeCustomers,
                      activeInternal,
                      driftCategories,
                      getCellHours
                    )}
                    capacity={st.cap}
                    height={4}
                  />
                </button>
              );
            })}
          </div>
        </div>

        {/* Editor — scroll sker i yttre raden så sidolisten kan vara sticky */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            padding: "16px 18px",
            background: theme.bg,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {planMode === "customer" ? (
            <>
              <p
                style={{
                  fontSize: 12,
                  color: theme.textMuted,
                  marginTop: 0,
                  marginBottom: 14,
                  lineHeight: 1.5,
                  maxWidth: 720,
                }}
              >
                Dra en person från vänsterlistan till en kundrad. Reglaget <strong>totalt team</strong> fördelar om timmar
                mellan alla som ligger på kunden (proportionellt). Varje persons reglage ändrar bara den personen — alla andra
                oförändrade. Övriga kolumner (intern projekt/drift) planeras under <strong>Personer</strong>.
              </p>
              {activeCustomers.length === 0 ? (
                <div style={{ color: theme.textMuted, fontSize: 13 }}>Inga aktiva kunder.</div>
              ) : (
                activeCustomers.map((c) => (
                  <CustomerColumnCard
                    key={c.id}
                    customer={c}
                    workspace={workspace}
                    selectedMonthId={selectedMonthId}
                    contributorIds={contributorsByCustomer[c.id] || []}
                    getCellHours={getCellHours}
                    upsertHours={upsertHours}
                    setCustomerColumnTotal={setCustomerColumnTotal}
                    activePeople={activePeople}
                  />
                ))
              )}
              <div style={{ marginTop: 22, flexShrink: 0 }}>
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: theme.textSoft,
                    fontFamily: font,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    marginBottom: 10,
                  }}
                >
                  Översikt — planerade timmar per kolumn (hela teamet)
                </div>
                <ColumnSummaryFoot
                  custCols={custCols}
                  intCols={intCols}
                  driftCols={driftCols}
                />
              </div>
            </>
          ) : !selectedPerson ? (
            <div style={{ color: theme.textMuted, fontSize: 13 }}>
              Inga aktiva personer. Lägg till under Inställningar → Team.
            </div>
          ) : (
            <>
              <PersonEditor
                workspace={workspace}
                selectedMonthId={selectedMonthId}
                selectedMonthLabel={selectedMonthLabel}
                person={selectedPerson}
                getCellHours={getCellHours}
                upsertHours={upsertHours}
                clearPersonAllocationsForMonth={clearPersonAllocationsForMonth}
                activeCustomers={activeCustomers}
                activeInternal={activeInternal}
                driftCategories={driftCategories}
                internalSectionOpen={internalSectionOpen}
                setInternalSectionOpen={setInternalSectionOpen}
                driftSectionOpen={driftSectionOpen}
                setDriftSectionOpen={setDriftSectionOpen}
              />

              <div style={{ marginTop: 22, flexShrink: 0 }}>
                <div
                  style={{
                    fontSize: 9,
                    fontWeight: 700,
                    color: theme.textSoft,
                    fontFamily: font,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    marginBottom: 10,
                  }}
                >
                  Översikt — planerade timmar per kolumn (hela teamet)
                </div>
                <ColumnSummaryFoot
                  custCols={custCols}
                  intCols={intCols}
                  driftCols={driftCols}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CustomerColumnCard({
  customer: c,
  workspace,
  selectedMonthId,
  contributorIds,
  getCellHours,
  upsertHours,
  setCustomerColumnTotal,
  activePeople,
}) {
  const [dragOver, setDragOver] = useState(false);
  const [colWarn, setColWarn] = useState(null);

  const list = contributorIds;
  const columnSum = list.reduce((s, pid) => s + getCellHours(pid, "customer", c.id), 0);
  const feasibleMax = feasibleCustomerColumnMaxTotal(workspace, selectedMonthId, c.id, list);

  const flashWarn = (msg) => {
    setColWarn(msg);
    window.setTimeout(() => setColWarn(null), 7000);
  };

  const budgetT = customerBudgetTimmar(c);
  const masterBudgetHint =
    budgetT > 0
      ? `Kundbudget ${formatHours(budgetT)} h (team) · max ${formatHours(feasibleMax)} h med nuvarande personer/kapacitet`
      : customerBudgetTimmar(c) <= 0 && c.timpris > 0
        ? "Ingen månadsbudget (kr) — ingen övre teamgräns."
        : null;

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const pid = e.dataTransfer.getData(DRAG_MIME);
    if (!pid || !activePeople.some((p) => p.id === pid)) return;
    if (list.includes(pid)) return;
    const nextList = [...list, pid];
    let curSum = nextList.reduce((s, id) => s + getCellHours(id, "customer", c.id), 0);
    const maxT = feasibleCustomerColumnMaxTotal(workspace, selectedMonthId, c.id, nextList);
    if (curSum === 0 && nextList.length > 0) {
      curSum = Math.min(8, maxT);
    }
    setCustomerColumnTotal(c.id, curSum, nextList);
  };

  const removeContributor = (pid) => {
    upsertHours(pid, "customer", c.id, 0);
  };

  return (
    <div style={{ marginBottom: 18 }}>
      {colWarn ? (
        <div
          style={{
            padding: "9px 11px",
            marginBottom: 10,
            borderRadius: 10,
            background: "rgba(232, 186, 168, 0.12)",
            border: "1px solid rgba(232, 186, 168, 0.45)",
            color: theme.accentSand,
            fontSize: 11,
            lineHeight: 1.4,
          }}
        >
          {colWarn}
        </div>
      ) : null}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDragEnter={() => setDragOver(true)}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        style={{
          padding: "12px 14px",
          borderRadius: 12,
          border: `1px solid ${dragOver ? `${(c.color || COL_CUSTOMER)}aa` : theme.border}`,
          background: dragOver ? theme.surface2 : theme.surface,
          boxShadow: dragOver ? `inset 0 0 0 1px ${(c.color || COL_CUSTOMER)}44` : "none",
          transition: "border-color 0.15s, background 0.15s",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
          <div
            style={{
              width: 6,
              alignSelf: "stretch",
              minHeight: 40,
              borderRadius: 4,
              background: c.color || COL_CUSTOMER,
              flexShrink: 0,
            }}
          />
          <div style={{ flex: "1 1 160px", minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: theme.text }}>{c.name}</div>
            <div style={{ fontSize: 10, color: theme.textSoft, marginTop: 2 }}>
              Släpp personer här · {list.length} i poolen · summa {formatHours(columnSum)} h
            </div>
          </div>
        </div>

        {list.length === 0 ? (
          <div style={{ fontSize: 12, color: theme.textMuted, padding: "8px 0" }}>
            Inga personer i poolen. Dra från teamlistan till denna ruta.
          </div>
        ) : (
          <>
            <HourSliderRow
              label="Totalt team (denna kund)"
              sublabel={`${c.timpris} kr/h · beräknad budget ${formatHours(customerBudgetTimmar(c))} h`}
              accent={c.color || COL_CUSTOMER}
              hours={columnSum}
              cap={feasibleMax}
              maxSlider={Math.max(feasibleMax, columnSum, 1)}
              budgetHintLine={masterBudgetHint}
              commitOnPointerUp
              onChange={(raw) => {
                const r = wholeHours(raw);
                if (r > feasibleMax) {
                  flashWarn("Överstiger vad som ryms i budget och/eller personernas kapacitet.");
                }
                setCustomerColumnTotal(c.id, Math.min(r, feasibleMax), list);
              }}
            />
            <div style={{ fontSize: 9, fontWeight: 700, color: theme.textSoft, margin: "12px 0 6px", letterSpacing: 0.4 }}>
              PERSONER PÅ KUNDEN
            </div>
            {list.map((pid) => {
              const person = activePeople.find((p) => p.id === pid);
              if (!person) return null;
              const lim = customerCellBudgetLimit(workspace, selectedMonthId, person.id, c.id);
              const applyCustomer = (raw) => {
                const h = wholeHours(raw);
                if (lim.isCapped && Number.isFinite(lim.maxForThisPerson) && h > lim.maxForThisPerson) {
                  flashWarn(
                    `${c.name}: Högst ${formatHours(lim.maxForThisPerson)} h för ${person.name} med nuvarande fördelning.`
                  );
                }
                upsertHours(person.id, "customer", c.id, h);
              };
              const budgetHintLine = lim.isCapped
                ? `Max ${formatHours(lim.maxForThisPerson)} h för ${person.name} (budget + övriga)`
                : null;
              return (
                <div key={pid} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <HourSliderRow
                      label={person.name}
                      sublabel={`Kap ${person.kapacitetPerManad} h`}
                      accent={c.color || COL_CUSTOMER}
                      hours={getCellHours(person.id, "customer", c.id)}
                      cap={person.kapacitetPerManad}
                      customerMax={lim.isCapped ? lim.maxForThisPerson : undefined}
                      budgetHintLine={budgetHintLine}
                      commitOnPointerUp
                      onChange={applyCustomer}
                    />
                  </div>
                  <button
                    type="button"
                    title="Ta bort från kunden"
                    onClick={() => removeContributor(pid)}
                    style={{
                      marginTop: 14,
                      flexShrink: 0,
                      padding: "6px 10px",
                      borderRadius: 8,
                      border: `1px solid ${theme.border}`,
                      background: "rgba(232, 168, 184, 0.1)",
                      color: theme.danger,
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: bodyFont,
                    }}
                  >
                    Ta bort
                  </button>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}

function PersonEditor({
  workspace,
  selectedMonthId,
  selectedMonthLabel,
  person,
  getCellHours,
  upsertHours,
  clearPersonAllocationsForMonth,
  activeCustomers,
  activeInternal,
  driftCategories,
  internalSectionOpen,
  setInternalSectionOpen,
  driftSectionOpen,
  setDriftSectionOpen,
}) {
  const [budgetWarn, setBudgetWarn] = useState(null);
  const cap = person.kapacitetPerManad;

  const billable = activeCustomers.reduce((s, c) => s + getCellHours(person.id, "customer", c.id), 0);
  const ip = activeInternal.reduce((s, p) => s + getCellHours(person.id, "internalProject", p.id), 0);
  const idh = driftCategories.reduce((s, d) => s + getCellHours(person.id, "internalDrift", d.id), 0);
  const total = billable + ip + idh;
  const remaining = cap - total;
  const allocRate = cap > 0 ? total / cap : 0;
  const billRate = cap > 0 ? billable / cap : 0;
  let aw = "balanced";
  if (allocRate < 0.9) aw = "under";
  if (allocRate > 1) aw = "over";

  let revenue = 0;
  activeCustomers.forEach((c) => {
    const h = getCellHours(person.id, "customer", c.id);
    revenue += h * (c.timpris > 0 ? c.timpris : 0);
  });

  const internalHoursSum = activeInternal.reduce(
    (s, p) => s + getCellHours(person.id, "internalProject", p.id),
    0
  );
  const driftHoursSum = driftCategories.reduce(
    (s, d) => s + getCellHours(person.id, "internalDrift", d.id),
    0
  );

  const flashBudgetWarn = (msg) => {
    setBudgetWarn(msg);
    window.setTimeout(() => setBudgetWarn(null), 7000);
  };

  return (
    <>
      {budgetWarn ? (
        <div
          style={{
            padding: "11px 13px",
            marginBottom: 14,
            borderRadius: 11,
            background: "rgba(232, 186, 168, 0.12)",
            border: "1px solid rgba(232, 186, 168, 0.45)",
            color: theme.accentSand,
            fontSize: 12,
            lineHeight: 1.4,
          }}
        >
          {budgetWarn}
        </div>
      ) : null}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: 14,
          marginBottom: 14,
        }}
      >
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: theme.text }}>{person.name}</div>
            <button
              type="button"
              title={total === 0 ? "Inga planerade timmar denna månad" : "Ta bort alla timmar för denna person i vald månad"}
              disabled={total === 0}
              onClick={() => {
                if (total === 0) return;
                if (
                  !window.confirm(
                    `Nollställa alla planerade timmar för ${person.name} i ${selectedMonthLabel}? Globala standardtimmar på den driftpost du valt under Inställningar läggs tillbaka automatiskt.`
                  )
                ) {
                  return;
                }
                clearPersonAllocationsForMonth(person.id);
              }}
              style={{
                padding: "4px 10px",
                borderRadius: 8,
                border: `1px solid ${theme.border}`,
                background: total === 0 ? "transparent" : "rgba(232, 168, 184, 0.12)",
                color: total === 0 ? theme.textSoft : theme.danger,
                fontSize: 11,
                fontWeight: 600,
                cursor: total === 0 ? "not-allowed" : "pointer",
                fontFamily: bodyFont,
              }}
            >
              Nollställ månad
            </button>
          </div>
          <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 3 }}>
            Kapacitet {cap} h · Mål fakt {person.malFakturerbaraTimmar} h
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: theme.textSoft }}>Allokerat / kapacitet</div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              fontFamily: font,
              color: allocColor(aw),
            }}
          >
            {formatHours(total)} h
          </div>
          <div style={{ fontSize: 10, color: theme.textMuted }}>
            {remaining >= 0 ? `${formatHours(remaining)} h kvar` : `${formatHours(Math.abs(remaining))} h över`} ·{" "}
            {pct(allocRate)} allok. · {pct(billRate)} fakt.
          </div>
          <div style={{ fontSize: 11, color: theme.revenue, marginTop: 3, fontFamily: font }}>
            Intäkt (plan): {Math.round(revenue).toLocaleString("sv-SE")} kr
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <HoursBar
          segments={allocationBarSegments(
            person.id,
            activeCustomers,
            activeInternal,
            driftCategories,
            getCellHours
          )}
          capacity={cap}
          height={18}
        />
      </div>

      {activeCustomers.length > 0 && (
        <SectionTitle accent={COL_CUSTOMER}>Kunder — fakturerbart</SectionTitle>
      )}
      {activeCustomers.map((c) => {
        const lim = customerCellBudgetLimit(workspace, selectedMonthId, person.id, c.id);
        const applyCustomer = (raw) => {
          const h = wholeHours(raw);
          if (lim.isCapped && Number.isFinite(lim.maxForThisPerson) && h > lim.maxForThisPerson) {
            flashBudgetWarn(
              `${c.name}: Kunden har ${formatHours(lim.budgetTimmar)} h i budgeterade timmar. Övriga personer har ${formatHours(lim.usedByOthers)} h — du kan lägga högst ${formatHours(lim.maxForThisPerson)} h här.`
            );
          }
          upsertHours(person.id, "customer", c.id, h);
        };
        const budgetHintLine = lim.isCapped
          ? `Budget för kunden: ${formatHours(lim.budgetTimmar)} h · ${formatHours(lim.usedByOthers)} h till andra · högst ${formatHours(lim.maxForThisPerson)} h för dig`
          : customerBudgetTimmar(c) <= 0 && c.timpris > 0
            ? "Ingen månadsbudget (kr) angiven — ingen övre gräns per team."
            : null;

        return (
          <HourSliderRow
            key={c.id}
            label={c.name}
            sublabel={`${c.timpris} kr/h · beräknad budget ${formatHours(customerBudgetTimmar(c))} h`}
            accent={c.color || COL_CUSTOMER}
            hours={getCellHours(person.id, "customer", c.id)}
            cap={cap}
            customerMax={lim.isCapped ? lim.maxForThisPerson : undefined}
            budgetHintLine={budgetHintLine}
            onChange={applyCustomer}
          />
        );
      })}

      {activeInternal.length > 0 ? (
        <CollapsiblePlanningSection
          title="Interna projekt"
          accent={COL_INTERNAL}
          open={internalSectionOpen}
          onToggle={() => setInternalSectionOpen((o) => !o)}
          summary={`${formatHours(internalHoursSum)} h · ${activeInternal.length} st`}
        >
          {activeInternal.map((p) => (
            <HourSliderRow
              key={p.id}
              label={p.name}
              sublabel={p.malTimmar != null ? `Mål ${p.malTimmar} h` : "Ej fakturerbart"}
              accent={p.color || COL_INTERNAL}
              hours={getCellHours(person.id, "internalProject", p.id)}
              cap={cap}
              onChange={(h) => upsertHours(person.id, "internalProject", p.id, h)}
            />
          ))}
        </CollapsiblePlanningSection>
      ) : null}

      {driftCategories.length > 0 ? (
        <CollapsiblePlanningSection
          title="Intern drift"
          accent={COL_DRIFT}
          open={driftSectionOpen}
          onToggle={() => setDriftSectionOpen((o) => !o)}
          summary={`${formatHours(driftHoursSum)} h · ${driftCategories.length} st`}
        >
          {driftCategories.map((d) => (
            <HourSliderRow
              key={d.id}
              label={d.name}
              sublabel="Ej fakturerbart"
              accent={d.color || COL_DRIFT}
              hours={getCellHours(person.id, "internalDrift", d.id)}
              cap={cap}
              onChange={(h) => upsertHours(person.id, "internalDrift", d.id, h)}
            />
          ))}
        </CollapsiblePlanningSection>
      ) : null}
    </>
  );
}

function SectionTitle({ children, accent }) {
  return (
    <div
      style={{
        fontSize: 10,
        fontWeight: 700,
        color: accent,
        marginTop: 16,
        marginBottom: 7,
        letterSpacing: 0.5,
        opacity: 0.95,
      }}
    >
      {children}
    </div>
  );
}

function ColumnSummaryFoot({ custCols, intCols, driftCols }) {
  return (
    <div style={{ overflowX: "auto", fontSize: 12 }}>
      <table style={{ borderCollapse: "collapse", minWidth: "100%" }}>
        <thead>
          <tr>
            <th style={sumTh}>Rad</th>
            {custCols.map((c) => (
              <th
                key={c.customer.id}
                style={{ ...sumTh, color: c.customer.color || "#93c5fd" }}
                title={c.customer.name}
              >
                {c.customer.name.slice(0, 14)}
                {c.customer.name.length > 14 ? "…" : ""}
              </th>
            ))}
            {intCols.map((n) => (
              <th
                key={n.project.id}
                style={{ ...sumTh, color: n.project.color || "#c4b5fd" }}
                title={n.project.name}
              >
                {n.project.name.length > 14 ? `${n.project.name.slice(0, 14)}…` : n.project.name}
              </th>
            ))}
            {driftCols.map((c) => (
              <th
                key={c.drift.id}
                style={{ ...sumTh, color: c.drift.color || "#94a3b8" }}
              >
                {c.drift.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={sumTd}>Σ timmar</td>
            {custCols.map((c) => (
              <td key={c.customer.id} style={sumTdNum}>
                {formatHours(c.planerade)}
              </td>
            ))}
            {intCols.map((c) => (
              <td key={c.project.id} style={sumTdNum}>
                {formatHours(c.planerade)}
              </td>
            ))}
            {driftCols.map((c) => (
              <td key={c.drift.id} style={sumTdNum}>
                {formatHours(c.planerade)}
              </td>
            ))}
          </tr>
          <tr>
            <td style={{ ...sumTd, color: theme.textMuted, fontSize: 10 }}>Budget/mål</td>
            {custCols.map((c) => (
              <td key={c.customer.id} style={{ ...sumTdNum, fontSize: 11 }}>
                {c.budgetTimmar > 0 ? formatHours(c.budgetTimmar) : "—"}
              </td>
            ))}
            {intCols.map((c) => (
              <td key={c.project.id} style={{ ...sumTdNum, fontSize: 11 }}>
                {c.malTimmar != null ? formatHours(c.malTimmar) : "—"}
              </td>
            ))}
            {driftCols.map((c) => (
              <td key={c.drift.id} style={{ ...sumTdNum, fontSize: 11 }}>
                —
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

const sumTh = {
  padding: "7px 5px",
  textAlign: "center",
  fontSize: 9,
  fontWeight: 700,
  color: theme.accentBlue,
  borderBottom: `1px solid ${theme.border}`,
  background: theme.surface2,
};
const sumTd = {
  padding: "7px 5px",
  borderBottom: `1px solid ${theme.border}`,
  background: theme.bgDeep,
};
const sumTdNum = { ...sumTd, textAlign: "right", fontFamily: font };

function Kpi({ label, value, accent }) {
  return (
    <div
      style={{
        padding: "6px 10px",
        background: theme.surface2,
        borderRadius: 9,
        border: `1px solid ${theme.border}`,
      }}
    >
      <div
        style={{
          fontSize: 8,
          color: theme.textSoft,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, fontFamily: font, color: accent ?? theme.text }}>{value}</div>
    </div>
  );
}
