import { useState, useMemo, useEffect, useLayoutEffect, useCallback } from "react";
import {
  allocationsForMonth,
  personHourBreakdown,
  personDerived,
  customerCellBudgetLimit,
  customerBudgetTimmar,
} from "../domain/calculations.js";
import {
  feasibleCustomerColumnMaxTotal,
  feasibleAllocColumnMaxTotal,
  maxHoursPersonOnCategoryCell,
} from "../domain/customerColumnRedistribute.js";
import {
  CustomerHoursTrack,
  CUSTOMER_TRACK_DRAG_MIME,
  COLUMN_LEAVE_MIME,
  CUSTOMER_BLOCK_REORDER_MIME,
} from "../components/CustomerHoursTrack.jsx";
import {
  AllocationHoursTrack,
  ALLOC_REF_DRAG_MIME,
  PERSON_ROW_LEAVE_MIME,
  PERSON_ROW_BLOCK_REORDER_MIME,
} from "../components/AllocationHoursTrack.jsx";
import {
  allocKey,
  parseAllocKey,
  contributorAllocKeysForPerson,
  mergePersonContributorOrder,
  readPersonAllocOrder,
  writePersonAllocOrder,
} from "../domain/personRowAllocations.js";
import { wholeHours, formatHours } from "../domain/hours.js";
import { addCalendarMonths } from "../storage/workspace.js";
import { theme } from "../theme.js";
import { getPersonUiColorFromList } from "../domain/entityColors.js";
import { usePlanningToast } from "../components/ToastStack.jsx";

const font = theme.fontMono;
const bodyFont = theme.fontSans;

const COL_CUSTOMER = theme.billable;
const COL_INTERNAL = theme.internal;
const COL_DRIFT = theme.drift;

/** Diskret rensning (×) — ersätter textknapp ”Nollställ”. */
function TinyClearIconButton({ disabled, title: tip, onClick }) {
  return (
    <button
      type="button"
      aria-label={tip}
      title={tip}
      disabled={disabled}
      onClick={onClick}
      style={{
        marginLeft: "auto",
        width: 22,
        height: 22,
        padding: 0,
        borderRadius: 5,
        border: `1px solid ${disabled ? "transparent" : theme.border}`,
        background: disabled ? "transparent" : "rgba(255,255,255,0.04)",
        color: disabled ? theme.textSoft : theme.textMuted,
        cursor: disabled ? "not-allowed" : "pointer",
        fontSize: 16,
        lineHeight: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        fontFamily: bodyFont,
        opacity: disabled ? 0.45 : 0.85,
      }}
    >
      ×
    </button>
  );
}

function allocColor(w) {
  if (w === "under") return theme.warn;
  if (w === "over") return theme.danger;
  return theme.ok;
}

/** En färg för allokerad tid; tomt utrymme = kvar av kapacitet. Timmar efter stapeln. */
function SidebarPersonCapacityBar({ allocated, capacity }) {
  const cap = wholeHours(capacity);
  const total = wholeHours(allocated);
  const h = 5;
  if (cap <= 0) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            flex: 1,
            height: h,
            borderRadius: 999,
            background: theme.surface2,
          }}
        />
        <span style={{ fontSize: 10, fontFamily: font, color: theme.textSoft, flexShrink: 0 }}>—</span>
      </div>
    );
  }
  const free = Math.max(0, cap - total);
  const over = Math.max(0, total - cap);
  const usedPct = Math.min(100, (total / cap) * 100);
  const fillColor = over > 0 ? theme.danger : theme.ok;
  const afterLabel = over > 0 ? `${formatHours(over)} h över` : `${formatHours(free)} h kvar`;
  const afterColor = over > 0 ? theme.danger : free <= 0 ? theme.ok : theme.warn;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          flex: 1,
          minWidth: 0,
          height: h,
          borderRadius: 999,
          background: theme.surface2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: over > 0 ? "100%" : `${usedPct}%`,
            height: "100%",
            background: fillColor,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12)",
            transition: "width 0.18s ease",
          }}
        />
      </div>
      <span
        style={{
          fontSize: 10,
          fontWeight: 800,
          fontFamily: font,
          color: afterColor,
          flexShrink: 0,
          whiteSpace: "nowrap",
        }}
      >
        {afterLabel}
      </span>
    </div>
  );
}

const DRAG_MIME = CUSTOMER_TRACK_DRAG_MIME;

const LS_CUSTOMER_ORDER_PREFIX = "resurz-plan-customer-order-";

function readCustomerOrder(customerId) {
  try {
    const raw = localStorage.getItem(LS_CUSTOMER_ORDER_PREFIX + customerId);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}

function writeCustomerOrder(customerId, ids) {
  try {
    localStorage.setItem(LS_CUSTOMER_ORDER_PREFIX + customerId, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

function mergeCustomerContributorOrder(prevOrder, contributorIds) {
  const set = new Set(contributorIds);
  const kept = (prevOrder || []).filter((id) => set.has(id));
  const added = contributorIds.filter((id) => !kept.includes(id));
  return [...kept, ...added];
}

const LS_ALLOC_ORDER_PREFIX = "resurz-plan-alloc-order-";

function readAllocColumnOrder(categoryType, refId) {
  try {
    const raw = localStorage.getItem(`${LS_ALLOC_ORDER_PREFIX}${categoryType}-${refId}`);
    if (!raw) return null;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}

function writeAllocColumnOrder(categoryType, refId, ids) {
  try {
    localStorage.setItem(`${LS_ALLOC_ORDER_PREFIX}${categoryType}-${refId}`, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

/** @returns {{ categoryType: string, refId: string } | null} */
function parseColumnLeavePayload(raw) {
  if (!raw || typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  try {
    const o = JSON.parse(t);
    if (o && typeof o.categoryType === "string" && o.refId != null && String(o.refId) !== "") {
      return { categoryType: o.categoryType, refId: String(o.refId) };
    }
    return null;
  } catch {
    return { categoryType: "customer", refId: t };
  }
}

/** @returns {{ personId: string, allocKey: string } | null} */
function parsePersonRowLeavePayload(raw) {
  if (!raw || typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t) return null;
  try {
    const o = JSON.parse(t);
    if (o && typeof o.personId === "string" && typeof o.allocKey === "string" && o.personId && o.allocKey) {
      return { personId: o.personId, allocKey: o.allocKey };
    }
    return null;
  } catch {
    return null;
  }
}

function entityLabelForAllocKey(key, activeCustomers, activeInternal, driftCategories) {
  const p = parseAllocKey(key);
  if (!p) return key;
  if (p.categoryType === "customer") return activeCustomers.find((c) => c.id === p.refId)?.name ?? p.refId;
  if (p.categoryType === "internalProject") return activeInternal.find((x) => x.id === p.refId)?.name ?? p.refId;
  if (p.categoryType === "internalDrift") return driftCategories.find((x) => x.id === p.refId)?.name ?? p.refId;
  return p.refId;
}

function entityColorForAllocKey(key, activeCustomers, activeInternal, driftCategories) {
  const p = parseAllocKey(key);
  if (!p) return COL_CUSTOMER;
  if (p.categoryType === "customer") return activeCustomers.find((c) => c.id === p.refId)?.color || COL_CUSTOMER;
  if (p.categoryType === "internalProject") return activeInternal.find((x) => x.id === p.refId)?.color || COL_INTERNAL;
  if (p.categoryType === "internalDrift") return driftCategories.find((x) => x.id === p.refId)?.color || COL_DRIFT;
  return COL_CUSTOMER;
}

function PoolAllocRow({ name, color, categoryType, refId }) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(ALLOC_REF_DRAG_MIME, JSON.stringify({ categoryType, refId }));
        e.dataTransfer.effectAllowed = "copy";
      }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        cursor: "grab",
        borderBottom: `1px solid ${theme.border}`,
        color: "inherit",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 4,
          height: 18,
          borderRadius: 2,
          flexShrink: 0,
          background: color,
          boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.25)",
        }}
      />
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          color: theme.textMuted,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {name}
      </span>
    </div>
  );
}

function PersonRowCard({
  person,
  workspace,
  selectedMonthId,
  selectedMonthLabel,
  monthAlloc,
  getCellHours,
  upsertHours,
  clearPersonAllocationsForMonth,
  activePeople,
  activeCustomers,
  activeInternal,
  driftCategories,
  customersById,
  onBlockTransfer,
}) {
  const showToast = usePlanningToast();
  const list = contributorAllocKeysForPerson(monthAlloc, person.id);
  const contribKey = [...list].sort().join("\0");

  const [orderedKeys, setOrderedKeys] = useState(() =>
    mergePersonContributorOrder(readPersonAllocOrder(person.id), contributorAllocKeysForPerson(monthAlloc, person.id))
  );

  useEffect(() => {
    setOrderedKeys((prev) => mergePersonContributorOrder(prev, list));
  }, [contribKey, person.id]);

  const effectiveOrder = useMemo(
    () => mergePersonContributorOrder(orderedKeys, list),
    [orderedKeys, contribKey, person.id]
  );

  const [budgetWarn, setBudgetWarn] = useState(null);
  const flashBudgetWarn = (msg) => {
    setBudgetWarn(msg);
    window.setTimeout(() => setBudgetWarn(null), 7000);
  };

  const cap = wholeHours(person.kapacitetPerManad || 0);
  const feasibleMax = cap;

  const total = useMemo(() => {
    let s = 0;
    for (const a of monthAlloc) {
      if (a.personId === person.id) s += wholeHours(a.hours);
    }
    return s;
  }, [monthAlloc, person.id]);

  const persistOrder = (keys) => writePersonAllocOrder(person.id, keys);

  const pushHours = (next) => {
    effectiveOrder.forEach((key, i) => {
      const p = parseAllocKey(key);
      if (p) upsertHours(person.id, p.categoryType, p.refId, next[i] ?? 0);
    });
  };

  const checkBudgetAfterCommit = () => {
    for (const key of effectiveOrder) {
      const p = parseAllocKey(key);
      if (!p || p.categoryType !== "customer") continue;
      const h = wholeHours(getCellHours(person.id, "customer", p.refId));
      const lim = customerCellBudgetLimit(workspace, selectedMonthId, person.id, p.refId);
      if (lim.isCapped && Number.isFinite(lim.maxForThisPerson) && h > lim.maxForThisPerson) {
        const c = customersById[p.refId];
        const name = c?.name ?? p.refId;
        flashBudgetWarn(
          `${name}: Kunden har ${formatHours(lim.budgetTimmar)} h i budgeterade timmar. Övriga personer har ${formatHours(lim.usedByOthers)} h — du kan lägga högst ${formatHours(lim.maxForThisPerson)} h här.`
        );
        break;
      }
    }
  };

  const addAllocFromDrop = (spec) => {
    const k = allocKey(spec.categoryType, spec.refId);
    const ok =
      (spec.categoryType === "customer" && activeCustomers.some((c) => c.id === spec.refId)) ||
      (spec.categoryType === "internalProject" && activeInternal.some((p) => p.id === spec.refId)) ||
      (spec.categoryType === "internalDrift" && driftCategories.some((d) => d.id === spec.refId));
    if (!ok) return;
    const baseOrder = mergePersonContributorOrder(orderedKeys, list);
    if (baseOrder.includes(k)) {
      showToast("Finns redan på den här personen.");
      return;
    }
    if (cap <= 0) {
      showToast("Personen har ingen kapacitet den här månaden.");
      return;
    }
    let otherTotal = 0;
    for (const a of monthAlloc) {
      if (a.personId !== person.id) continue;
      if (a.categoryType === spec.categoryType && a.refId === spec.refId) continue;
      otherTotal += wholeHours(a.hours);
    }
    const slack = Math.max(0, cap - otherTotal);
    const maxP = maxHoursPersonOnCategoryCell(workspace, selectedMonthId, spec.categoryType, spec.refId, person.id);
    const init = Math.min(8, maxP, slack);
    if (init <= 0) {
      if (slack <= 0) {
        showToast("Personen har inga timmar kvar — redan fullt belagd.");
      } else if (spec.categoryType === "customer") {
        showToast("Kunden har inga timmar kvar som du kan lägga här (budget eller kapacitet).");
      } else {
        showToast("Posten har inga timmar kvar som du kan lägga här.");
      }
      return;
    }
    const nextOrder = [...baseOrder, k];
    upsertHours(person.id, spec.categoryType, spec.refId, init);
    setOrderedKeys(nextOrder);
    writePersonAllocOrder(person.id, nextOrder);
    window.setTimeout(checkBudgetAfterCommit, 0);
  };

  let aw = "balanced";
  const allocRate = cap > 0 ? total / cap : 0;
  if (allocRate < 0.9) aw = "under";
  if (allocRate > 1) aw = "over";

  const personStripe = getPersonUiColorFromList(activePeople, person.id);

  return (
    <div
      style={{
        marginBottom: 8,
        display: "flex",
        alignItems: "stretch",
        gap: 10,
        padding: "8px 12px",
        borderRadius: 10,
        border: `1px solid ${theme.border}`,
        background: theme.surface,
      }}
    >
      <div
        style={{
          width: 4,
          alignSelf: "stretch",
          minHeight: 40,
          borderRadius: 3,
          background: personStripe,
          flexShrink: 0,
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1, gap: 6 }}>
        {budgetWarn ? (
          <div
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              background: "rgba(232, 186, 168, 0.12)",
              border: "1px solid rgba(232, 186, 168, 0.45)",
              color: theme.accentSand,
              fontSize: 11,
              lineHeight: 1.35,
            }}
          >
            {budgetWarn}
          </div>
        ) : null}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: theme.text, letterSpacing: "-0.02em" }}>{person.name}</div>
          <span style={{ fontSize: 11, fontWeight: 800, fontFamily: font, color: allocColor(aw) }}>
            {formatHours(total)} / {cap} h
          </span>
          <TinyClearIconButton
            disabled={total === 0}
            title={
              total === 0
                ? "Inga planerade timmar denna månad"
                : `Ta bort alla timmar för ${person.name} i ${selectedMonthLabel} (global drift enligt inställningar läggs tillbaka)`
            }
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
          />
        </div>
        <AllocationHoursTrack
          feasibleMax={feasibleMax}
          orderedKeys={effectiveOrder}
          setOrderedKeys={setOrderedKeys}
          persistOrder={persistOrder}
          getCellHours={(key) => {
            const p = parseAllocKey(key);
            return p ? getCellHours(person.id, p.categoryType, p.refId) : 0;
          }}
          pushHours={pushHours}
          maxHoursForKey={(key) => {
            const p = parseAllocKey(key);
            return p ? maxHoursPersonOnCategoryCell(workspace, selectedMonthId, p.categoryType, p.refId, person.id) : 0;
          }}
          blockMeta={(key) => ({
            label: entityLabelForAllocKey(key, activeCustomers, activeInternal, driftCategories),
            color: entityColorForAllocKey(key, activeCustomers, activeInternal, driftCategories),
          })}
          reorderMime={PERSON_ROW_BLOCK_REORDER_MIME}
          leaveMime={PERSON_ROW_LEAVE_MIME}
          getLeavePayload={(draggedKey) => JSON.stringify({ personId: person.id, allocKey: draggedKey })}
          allocRefDropMime={ALLOC_REF_DRAG_MIME}
          onAllocRefDrop={addAllocFromDrop}
          onAfterCommit={checkBudgetAfterCommit}
          blockTransferContext={onBlockTransfer ? { kind: "person", personId: person.id } : undefined}
          onBlockTransfer={onBlockTransfer}
        />
      </div>
    </div>
  );
}

export function PlanningView({
  /** "customer" = kolumnvy (kunder m.m.); "person" = redigering per person */
  mode,
  workspace,
  selectedMonthId,
  upsertHours,
  getCellHours,
  clearPersonAllocationsForMonth,
  clearSelectedMonthAllocations,
  replaceCurrentMonthFromPrevious,
  transferAllocationHours,
  clearCategoryColumnAllocationsForMonth,
  /** Ref till yttre scroll (maxHeight-planeringsrutan); sätts av App för att spara scroll mellan flikar. */
  scrollContainerRef,
  /** Ref till { customer: number, person: number } med sparad scrollTop per läge. */
  planningScrollTopsRef,
}) {
  const activePeople = workspace.people.filter((p) => p.active !== false);
  const activeCustomers = workspace.customers.filter((c) => c.active !== false);
  const activeInternal = workspace.internalProjects.filter((p) => p.active !== false);
  const driftCategories = workspace.driftCategories || [];
  const sortedMonths = [...workspace.months].sort((a, b) => a.id.localeCompare(b.id));
  const selectedMonthLabel =
    sortedMonths.find((m) => m.id === selectedMonthId)?.label ?? selectedMonthId;

  const customersById = useMemo(
    () => Object.fromEntries(workspace.customers.map((c) => [c.id, c])),
    [workspace.customers]
  );

  const monthAlloc = allocationsForMonth(workspace.allocations, selectedMonthId);

  useLayoutEffect(() => {
    if (!scrollContainerRef || !planningScrollTopsRef?.current) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    const key = mode === "customer" ? "customer" : "person";
    el.scrollTop = planningScrollTopsRef.current[key] ?? 0;
  }, [mode, scrollContainerRef, planningScrollTopsRef]);

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

  const contributorsByInternalProject = useMemo(() => {
    const monthSlice = allocationsForMonth(workspace.allocations, selectedMonthId);
    /** @type {Record<string, string[]>} */
    const out = {};
    for (const p of activeInternal) {
      const ids = new Set();
      for (const a of monthSlice) {
        if (a.categoryType === "internalProject" && a.refId === p.id && wholeHours(a.hours) > 0) {
          ids.add(a.personId);
        }
      }
      out[p.id] = [...ids].filter((pid) => activePeople.some((x) => x.id === pid));
    }
    return out;
  }, [workspace.allocations, selectedMonthId, activeInternal, activePeople]);

  const contributorsByDrift = useMemo(() => {
    const monthSlice = allocationsForMonth(workspace.allocations, selectedMonthId);
    /** @type {Record<string, string[]>} */
    const out = {};
    for (const d of driftCategories) {
      const ids = new Set();
      for (const a of monthSlice) {
        if (a.categoryType === "internalDrift" && a.refId === d.id && wholeHours(a.hours) > 0) {
          ids.add(a.personId);
        }
      }
      out[d.id] = [...ids].filter((pid) => activePeople.some((x) => x.id === pid));
    }
    return out;
  }, [workspace.allocations, selectedMonthId, driftCategories, activePeople]);

  const sidebarRowStats = (person) => {
    const b = personHourBreakdown(monthAlloc, person.id, customersById);
    const d = personDerived(b, person.kapacitetPerManad);
    return { ...b, ...d, cap: person.kapacitetPerManad };
  };

  const monthHasPlannedHours = useMemo(
    () =>
      (workspace.allocations || []).some(
        (a) => a.monthId === selectedMonthId && wholeHours(a.hours) > 0
      ),
    [workspace.allocations, selectedMonthId]
  );

  const prevMonthId = useMemo(() => addCalendarMonths(selectedMonthId, -1), [selectedMonthId]);
  const prevMonthHasPlannedHours = useMemo(
    () =>
      (workspace.allocations || []).some(
        (a) => a.monthId === prevMonthId && wholeHours(a.hours) > 0
      ),
    [workspace.allocations, prevMonthId]
  );

  const onBlockTransfer = useCallback(
    (source, target) => {
      transferAllocationHours(
        { personId: source.personId, categoryType: source.categoryType, refId: source.refId },
        { personId: target.personId, categoryType: target.categoryType, refId: target.refId }
      );
    },
    [transferAllocationHours]
  );

  const planningScrollMaxH = "calc(100vh - 200px - 40px)";

  return (
    <div style={{ fontFamily: bodyFont, color: theme.text }}>
      <div
        style={{
          border: `1px solid ${theme.border}`,
          borderRadius: 14,
          background: theme.surface,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 8,
            padding: "6px 10px",
            borderBottom: `1px solid ${theme.border}`,
            background: "rgba(14, 12, 24, 0.5)",
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            aria-label={`Kopiera plan från föregående månad till ${selectedMonthLabel}`}
            title={
              prevMonthHasPlannedHours
                ? `Ersätt all plan i ${selectedMonthLabel} med kopia av föregående månad`
                : "Inga timmar i föregående månad att kopiera"
            }
            disabled={!prevMonthHasPlannedHours}
            onClick={() => {
              if (!prevMonthHasPlannedHours) return;
              if (
                !window.confirm(
                  `Ersätta hela planen för ${selectedMonthLabel} med en kopia av föregående månad?\n\nAll nuvarande timmar i denna månad (alla personer, kunder och poster) tas bort och ersätts. Detta kan inte ångras med en knapp — använd Ctrl+Z (Ångra) om du behöver.`
                )
              ) {
                return;
              }
              replaceCurrentMonthFromPrevious();
            }}
            style={{
              width: 28,
              height: 28,
              padding: 0,
              border: "none",
              borderRadius: 8,
              background: prevMonthHasPlannedHours ? "rgba(255,255,255,0.05)" : "transparent",
              color: prevMonthHasPlannedHours ? theme.textMuted : theme.textSoft,
              cursor: prevMonthHasPlannedHours ? "pointer" : "not-allowed",
              opacity: prevMonthHasPlannedHours ? 0.85 : 0.35,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect
                x="9"
                y="3"
                width="12"
                height="12"
                rx="2"
                stroke="currentColor"
                strokeWidth="1.5"
                opacity="0.9"
              />
              <path
                d="M5 9h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9Z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
                opacity="0.55"
              />
            </svg>
          </button>
          <button
            type="button"
            aria-label={`Töm hela månaden ${selectedMonthLabel}`}
            title={
              monthHasPlannedHours
                ? `Ta bort alla timmar i ${selectedMonthLabel} för alla personer. Standardtimmar enligt inställningar läggs tillbaka på vald driftpost.`
                : "Inga timmar att ta bort denna månad"
            }
            disabled={!monthHasPlannedHours}
            onClick={() => {
              if (!monthHasPlannedHours) return;
              if (
                !window.confirm(
                  `Tömma hela ${selectedMonthLabel}? Alla planerade timmar (kunder, projekt, drift) tas bort för alla personer. Globala standardtimmar på vald driftpost sätts per person igen.`
                )
              ) {
                return;
              }
              clearSelectedMonthAllocations();
            }}
            style={{
              width: 28,
              height: 28,
              padding: 0,
              border: "none",
              borderRadius: 8,
              background: monthHasPlannedHours ? "rgba(255,255,255,0.05)" : "transparent",
              color: monthHasPlannedHours ? theme.textMuted : theme.textSoft,
              cursor: monthHasPlannedHours ? "pointer" : "not-allowed",
              opacity: monthHasPlannedHours ? 0.8 : 0.35,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M9 3h6l1 2h5v2H3V5h5l1-2Zm0 5h2v11H9V8Zm4 0h2v11h-2V8Zm-7 0h2v11H6V8Zm11 0h2v11h-2V8Z"
                fill="currentColor"
                opacity="0.75"
              />
            </svg>
          </button>
        </div>
        <div
        ref={scrollContainerRef}
        style={{
          display: "flex",
          alignItems: "flex-start",
          minHeight: 480,
          maxHeight: planningScrollMaxH,
          overflowY: "auto",
          overflowX: "hidden",
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
            maxHeight: planningScrollMaxH,
            zIndex: 2,
          }}
          onDragOver={(e) => {
            const types = Array.from(e.dataTransfer.types);
            if (mode === "customer") {
              if (!types.includes(COLUMN_LEAVE_MIME)) return;
            } else {
              if (!types.includes(PERSON_ROW_LEAVE_MIME)) return;
            }
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }}
          onDrop={(e) => {
            if (mode === "customer") {
              const leaveRaw = e.dataTransfer.getData(COLUMN_LEAVE_MIME);
              const spec = parseColumnLeavePayload(leaveRaw);
              const pid = e.dataTransfer.getData(CUSTOMER_BLOCK_REORDER_MIME);
              if (spec && pid) {
                e.preventDefault();
                upsertHours(pid, spec.categoryType, spec.refId, 0);
              }
              return;
            }
            const leaveRaw = e.dataTransfer.getData(PERSON_ROW_LEAVE_MIME);
            const rowSpec = parsePersonRowLeavePayload(leaveRaw);
            const allocKeyDrag = e.dataTransfer.getData(PERSON_ROW_BLOCK_REORDER_MIME);
            if (rowSpec && allocKeyDrag) {
              const cell = parseAllocKey(allocKeyDrag);
              if (cell) {
                e.preventDefault();
                upsertHours(rowSpec.personId, cell.categoryType, cell.refId, 0);
              }
            }
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
            {mode === "customer" ? (
              <>
                Team — dra till kolumn
                <div style={{ fontSize: 8, fontWeight: 600, color: theme.textSoft, marginTop: 3 }}>{activePeople.length} personer</div>
              </>
            ) : (
              <>
                Resurspool — dra till personrad
                <div style={{ fontSize: 8, fontWeight: 600, color: theme.textSoft, marginTop: 3 }}>{activePeople.length} personer</div>
              </>
            )}
          </div>
          {mode === "customer" ? (
            <div
              style={{ flex: 1, overflowY: "auto" }}
              onDragOver={(e) => {
                if (!Array.from(e.dataTransfer.types).includes(COLUMN_LEAVE_MIME)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={(e) => {
                const leaveRaw = e.dataTransfer.getData(COLUMN_LEAVE_MIME);
                const spec = parseColumnLeavePayload(leaveRaw);
                const pid = e.dataTransfer.getData(CUSTOMER_BLOCK_REORDER_MIME);
                if (spec && pid) {
                  e.preventDefault();
                  e.stopPropagation();
                  upsertHours(pid, spec.categoryType, spec.refId, 0);
                }
              }}
            >
              {activePeople.map((person) => {
                const st = sidebarRowStats(person);
                return (
                  <button
                    key={person.id}
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DRAG_MIME, person.id);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    onDragOver={(e) => {
                      if (!Array.from(e.dataTransfer.types).includes(COLUMN_LEAVE_MIME)) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(e) => {
                      const leaveRaw = e.dataTransfer.getData(COLUMN_LEAVE_MIME);
                      const spec = parseColumnLeavePayload(leaveRaw);
                      const pid = e.dataTransfer.getData(CUSTOMER_BLOCK_REORDER_MIME);
                      if (spec && pid) {
                        e.preventDefault();
                        e.stopPropagation();
                        upsertHours(pid, spec.categoryType, spec.refId, 0);
                      }
                    }}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "10px 12px",
                      cursor: "grab",
                      border: "none",
                      borderLeft: "3px solid transparent",
                      background: "transparent",
                      color: "inherit",
                      transition: "background 0.15s",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
                      <span
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          minWidth: 0,
                          flex: 1,
                        }}
                      >
                        <span
                          aria-hidden
                          style={{
                            width: 4,
                            height: 18,
                            borderRadius: 2,
                            flexShrink: 0,
                            background: getPersonUiColorFromList(activePeople, person.id),
                            boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.25)",
                          }}
                        />
                        <span
                          title={`${formatHours(st.total)} / ${formatHours(st.cap)} h planerat`}
                          style={{
                            fontSize: 14,
                            fontWeight: 600,
                            letterSpacing: "-0.02em",
                            color: theme.textMuted,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {person.name}
                        </span>
                      </span>
                    </div>
                    <SidebarPersonCapacityBar allocated={st.total} capacity={st.cap} />
                  </button>
                );
              })}
            </div>
          ) : (
            <div
              style={{ flex: 1, overflowY: "auto" }}
              onDragOver={(e) => {
                if (!Array.from(e.dataTransfer.types).includes(PERSON_ROW_LEAVE_MIME)) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
              }}
              onDrop={(e) => {
                const leaveRaw = e.dataTransfer.getData(PERSON_ROW_LEAVE_MIME);
                const rowSpec = parsePersonRowLeavePayload(leaveRaw);
                const allocKeyDrag = e.dataTransfer.getData(PERSON_ROW_BLOCK_REORDER_MIME);
                if (rowSpec && allocKeyDrag) {
                  const cell = parseAllocKey(allocKeyDrag);
                  if (cell) {
                    e.preventDefault();
                    e.stopPropagation();
                    upsertHours(rowSpec.personId, cell.categoryType, cell.refId, 0);
                  }
                }
              }}
            >
              {activeCustomers.length > 0 ? (
                <>
                  <div style={{ padding: "8px 12px 4px", fontSize: 10, fontWeight: 700, color: COL_CUSTOMER }}>Kunder</div>
                  {activeCustomers.map((c) => (
                    <PoolAllocRow
                      key={c.id}
                      name={c.name}
                      color={c.color || COL_CUSTOMER}
                      categoryType="customer"
                      refId={c.id}
                    />
                  ))}
                </>
              ) : null}
              {activeInternal.length > 0 ? (
                <>
                  <div style={{ padding: "8px 12px 4px", fontSize: 10, fontWeight: 700, color: COL_INTERNAL }}>Interna projekt</div>
                  {activeInternal.map((p) => (
                    <PoolAllocRow
                      key={p.id}
                      name={p.name}
                      color={p.color || COL_INTERNAL}
                      categoryType="internalProject"
                      refId={p.id}
                    />
                  ))}
                </>
              ) : null}
              {driftCategories.length > 0 ? (
                <>
                  <div style={{ padding: "8px 12px 4px", fontSize: 10, fontWeight: 700, color: COL_DRIFT }}>Intern drift</div>
                  {driftCategories.map((d) => (
                    <PoolAllocRow
                      key={d.id}
                      name={d.name}
                      color={d.color || COL_DRIFT}
                      categoryType="internalDrift"
                      refId={d.id}
                    />
                  ))}
                </>
              ) : null}
              {activeCustomers.length === 0 && activeInternal.length === 0 && driftCategories.length === 0 ? (
                <div style={{ padding: "12px 14px", fontSize: 12, color: theme.textMuted }}>Inga poster i poolen.</div>
              ) : null}
            </div>
          )}
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
          {mode === "customer" ? (
            <>
              <SectionTitle accent={COL_CUSTOMER}>Kunder — fakturerbart</SectionTitle>
              {activeCustomers.length === 0 ? (
                <div style={{ color: theme.textMuted, fontSize: 13, marginBottom: 12 }}>Inga aktiva kunder.</div>
              ) : (
                activeCustomers.map((c) => (
                  <CustomerColumnCard
                    key={c.id}
                    customer={c}
                    workspace={workspace}
                    selectedMonthId={selectedMonthId}
                    selectedMonthLabel={selectedMonthLabel}
                    contributorIds={contributorsByCustomer[c.id] || []}
                    getCellHours={getCellHours}
                    upsertHours={upsertHours}
                    clearCategoryColumnAllocationsForMonth={clearCategoryColumnAllocationsForMonth}
                    activePeople={activePeople}
                    onBlockTransfer={onBlockTransfer}
                  />
                ))
              )}
              {activeInternal.length > 0 ? (
                <>
                  <SectionTitle accent={COL_INTERNAL}>Interna projekt</SectionTitle>
                  {activeInternal.map((p) => (
                    <AllocColumnCard
                      key={p.id}
                      categoryType="internalProject"
                      item={p}
                      workspace={workspace}
                      selectedMonthId={selectedMonthId}
                      selectedMonthLabel={selectedMonthLabel}
                      contributorIds={contributorsByInternalProject[p.id] || []}
                      getCellHours={getCellHours}
                      upsertHours={upsertHours}
                      clearCategoryColumnAllocationsForMonth={clearCategoryColumnAllocationsForMonth}
                      activePeople={activePeople}
                      onBlockTransfer={onBlockTransfer}
                    />
                  ))}
                </>
              ) : null}
              {driftCategories.length > 0 ? (
                <>
                  <SectionTitle accent={COL_DRIFT}>Intern drift</SectionTitle>
                  {driftCategories.map((d) => (
                    <AllocColumnCard
                      key={d.id}
                      categoryType="internalDrift"
                      item={d}
                      workspace={workspace}
                      selectedMonthId={selectedMonthId}
                      selectedMonthLabel={selectedMonthLabel}
                      contributorIds={contributorsByDrift[d.id] || []}
                      getCellHours={getCellHours}
                      upsertHours={upsertHours}
                      activePeople={activePeople}
                      onBlockTransfer={onBlockTransfer}
                    />
                  ))}
                </>
              ) : null}
            </>
          ) : activePeople.length === 0 ? (
            <div style={{ color: theme.textMuted, fontSize: 13 }}>
              Inga aktiva personer. Lägg till under Inställningar → Team.
            </div>
          ) : (
            activePeople.map((person) => (
              <PersonRowCard
                key={person.id}
                person={person}
                workspace={workspace}
                selectedMonthId={selectedMonthId}
                selectedMonthLabel={selectedMonthLabel}
                monthAlloc={monthAlloc}
                getCellHours={getCellHours}
                upsertHours={upsertHours}
                clearPersonAllocationsForMonth={clearPersonAllocationsForMonth}
                activePeople={activePeople}
                activeCustomers={activeCustomers}
                activeInternal={activeInternal}
                driftCategories={driftCategories}
                customersById={customersById}
                onBlockTransfer={onBlockTransfer}
              />
            ))
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

function CustomerColumnCard({
  customer: c,
  workspace,
  selectedMonthId,
  selectedMonthLabel,
  contributorIds,
  getCellHours,
  upsertHours,
  clearCategoryColumnAllocationsForMonth,
  activePeople,
  onBlockTransfer,
}) {
  const showToast = usePlanningToast();
  const [dragOver, setDragOver] = useState(false);

  const list = contributorIds;
  const contribKey = list.join("\0");
  const [orderedIds, setOrderedIds] = useState(() =>
    mergeCustomerContributorOrder(readCustomerOrder(c.id), list)
  );

  useEffect(() => {
    setOrderedIds((prev) => mergeCustomerContributorOrder(prev, list));
  }, [contribKey, c.id]);

  const effectiveOrder = useMemo(
    () => mergeCustomerContributorOrder(orderedIds, list),
    [orderedIds, contribKey, c.id]
  );

  const columnTotal = useMemo(
    () => effectiveOrder.reduce((s, pid) => s + wholeHours(getCellHours(pid, "customer", c.id)), 0),
    [effectiveOrder, getCellHours, c.id]
  );
  const budgetT = customerBudgetTimmar(c);
  let custAllocWarn = "balanced";
  if (budgetT > 0) {
    const r = columnTotal / budgetT;
    if (r < 0.9) custAllocWarn = "under";
    if (r > 1) custAllocWarn = "over";
  }

  const feasibleMax = feasibleCustomerColumnMaxTotal(workspace, selectedMonthId, c.id, list);
  const trackVisualSpan =
    budgetT > 0 ? Math.max(budgetT, columnTotal) : Math.max(feasibleMax, columnTotal);

  const persistOrder = (ids) => writeCustomerOrder(c.id, ids);

  const addPersonFromDrop = (pid) => {
    if (!pid || !activePeople.some((p) => p.id === pid)) return;
    const baseOrder = mergeCustomerContributorOrder(orderedIds, list);
    if (baseOrder.includes(pid) || list.includes(pid)) {
      showToast("Personen finns redan i kolumnen.");
      return;
    }
    const nextOrder = [...baseOrder, pid];
    const feasibleNext = feasibleCustomerColumnMaxTotal(workspace, selectedMonthId, c.id, [...list, pid]);
    const sumNow = list.reduce((s, id) => s + getCellHours(id, "customer", c.id), 0);
    const columnSlack = Math.max(0, feasibleNext - sumNow);
    const maxP = maxHoursPersonOnCategoryCell(workspace, selectedMonthId, "customer", c.id, pid);
    const init = Math.min(8, maxP, columnSlack);
    if (init <= 0) {
      if (maxP <= 0) {
        showToast("Personen har inga timmar kvar.");
      } else {
        showToast("Kunden har inga timmar kvar att fördela (budget eller kolumn full).");
      }
      return;
    }
    upsertHours(pid, "customer", c.id, init);
    setOrderedIds(nextOrder);
    persistOrder(nextOrder);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    addPersonFromDrop(e.dataTransfer.getData(DRAG_MIME));
  };

  const accent = c.color || COL_CUSTOMER;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragEnter={() => setDragOver(true)}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      style={{
        marginBottom: 8,
        display: "flex",
        alignItems: "stretch",
        gap: 10,
        padding: "8px 12px",
        borderRadius: 10,
        border: `1px solid ${dragOver ? `${accent}99` : theme.border}`,
        background: dragOver ? theme.surface2 : theme.surface,
        transition: "border-color 0.12s, background 0.12s",
      }}
    >
      <div
        style={{
          width: 4,
          alignSelf: "stretch",
          minHeight: 40,
          borderRadius: 3,
          background: accent,
          flexShrink: 0,
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1, gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: theme.text, letterSpacing: "-0.02em" }}>{c.name}</div>
          <span
            style={{
              fontSize: 11,
              fontWeight: 800,
              fontFamily: font,
              color: budgetT > 0 ? allocColor(custAllocWarn) : theme.textMuted,
            }}
          >
            {budgetT > 0
              ? `${formatHours(columnTotal)} / ${budgetT} h`
              : `${formatHours(columnTotal)} h`}
          </span>
          <TinyClearIconButton
            disabled={columnTotal === 0}
            title={
              columnTotal === 0
                ? "Inga planerade timmar i denna kolumn"
                : `Ta bort alla timmar på ${c.name} i ${selectedMonthLabel}`
            }
            onClick={() => {
              if (columnTotal === 0) return;
              if (
                !window.confirm(
                  `Nollställa alla planerade timmar för kunden ”${c.name}” i ${selectedMonthLabel}? Alla personers timmar på denna kund i vald månad tas bort.`
                )
              ) {
                return;
              }
              clearCategoryColumnAllocationsForMonth("customer", c.id);
            }}
          />
        </div>
        <CustomerHoursTrack
          categoryType="customer"
          refId={c.id}
          workspace={workspace}
          monthId={selectedMonthId}
          feasibleMax={feasibleMax}
          visualSpanHours={trackVisualSpan}
          orderedPersonIds={effectiveOrder}
          setOrderedPersonIds={setOrderedIds}
          persistOrder={persistOrder}
          getCellHours={getCellHours}
          upsertHours={upsertHours}
          activePeople={activePeople}
          onDropPerson={addPersonFromDrop}
          onBlockTransfer={onBlockTransfer}
        />
      </div>
    </div>
  );
}

/** Kundläge: internt projekt eller drift — samma spår som kund (block, skiljestreck, ±10 h). */
function AllocColumnCard({
  categoryType,
  item,
  workspace,
  selectedMonthId,
  selectedMonthLabel,
  contributorIds,
  getCellHours,
  upsertHours,
  clearCategoryColumnAllocationsForMonth,
  activePeople,
  onBlockTransfer,
}) {
  const showToast = usePlanningToast();
  const [dragOver, setDragOver] = useState(false);

  const list = contributorIds;
  const contribKey = list.join("\0");
  const [orderedIds, setOrderedIds] = useState(() =>
    mergeCustomerContributorOrder(readAllocColumnOrder(categoryType, item.id), list)
  );

  useEffect(() => {
    setOrderedIds((prev) => mergeCustomerContributorOrder(prev, list));
  }, [contribKey, categoryType, item.id]);

  const effectiveOrder = useMemo(
    () => mergeCustomerContributorOrder(orderedIds, list),
    [orderedIds, contribKey, categoryType, item.id]
  );

  const columnTotal = useMemo(
    () => effectiveOrder.reduce((s, pid) => s + wholeHours(getCellHours(pid, categoryType, item.id)), 0),
    [effectiveOrder, getCellHours, categoryType, item.id]
  );
  const malT =
    categoryType === "internalProject" && item.malTimmar != null ? wholeHours(item.malTimmar) : 0;
  let projAllocWarn = "balanced";
  let hoursLine = `${formatHours(columnTotal)} h`;
  let hoursColor = theme.textMuted;
  if (categoryType === "internalProject" && malT > 0) {
    hoursLine = `${formatHours(columnTotal)} / ${malT} h`;
    const r = columnTotal / malT;
    if (r < 0.9) projAllocWarn = "under";
    if (r > 1) projAllocWarn = "over";
    hoursColor = allocColor(projAllocWarn);
  }

  const feasibleMax = feasibleAllocColumnMaxTotal(workspace, selectedMonthId, categoryType, item.id, list);
  const trackVisualSpan =
    categoryType === "internalProject" && malT > 0
      ? Math.max(malT, columnTotal)
      : Math.max(feasibleMax, columnTotal);

  const persistOrder = (ids) => writeAllocColumnOrder(categoryType, item.id, ids);

  const addPersonFromDrop = (pid) => {
    if (!pid || !activePeople.some((p) => p.id === pid)) return;
    const baseOrder = mergeCustomerContributorOrder(orderedIds, list);
    if (baseOrder.includes(pid) || list.includes(pid)) {
      showToast("Personen finns redan i kolumnen.");
      return;
    }
    const nextOrder = [...baseOrder, pid];
    const feasibleNext = feasibleAllocColumnMaxTotal(workspace, selectedMonthId, categoryType, item.id, [...list, pid]);
    const sumNow = list.reduce((s, id) => s + getCellHours(id, categoryType, item.id), 0);
    const columnSlack = Math.max(0, feasibleNext - sumNow);
    const maxP = maxHoursPersonOnCategoryCell(workspace, selectedMonthId, categoryType, item.id, pid);
    const init = Math.min(8, maxP, columnSlack);
    if (init <= 0) {
      if (maxP <= 0) {
        showToast("Personen har inga timmar kvar.");
      } else {
        showToast(
          categoryType === "internalProject"
            ? "Projektet har inga timmar kvar att fördela."
            : "Driftposten har inga timmar kvar att fördela."
        );
      }
      return;
    }
    upsertHours(pid, categoryType, item.id, init);
    setOrderedIds(nextOrder);
    persistOrder(nextOrder);
  };

  const accent = item.color || (categoryType === "internalProject" ? COL_INTERNAL : COL_DRIFT);

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    addPersonFromDrop(e.dataTransfer.getData(DRAG_MIME));
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDragEnter={() => setDragOver(true)}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      style={{
        marginBottom: 8,
        display: "flex",
        alignItems: "stretch",
        gap: 10,
        padding: "8px 12px",
        borderRadius: 10,
        border: `1px solid ${dragOver ? `${accent}99` : theme.border}`,
        background: dragOver ? theme.surface2 : theme.surface,
        transition: "border-color 0.12s, background 0.12s",
      }}
    >
      <div
        style={{
          width: 4,
          alignSelf: "stretch",
          minHeight: 40,
          borderRadius: 3,
          background: accent,
          flexShrink: 0,
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1, gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: theme.text, letterSpacing: "-0.02em" }}>{item.name}</div>
          <span style={{ fontSize: 11, fontWeight: 800, fontFamily: font, color: hoursColor }}>{hoursLine}</span>
          {categoryType === "internalProject" && clearCategoryColumnAllocationsForMonth ? (
            <TinyClearIconButton
              disabled={columnTotal === 0}
              title={
                columnTotal === 0
                  ? "Inga planerade timmar i denna kolumn"
                  : `Ta bort alla timmar på ${item.name} i ${selectedMonthLabel}`
              }
              onClick={() => {
                if (columnTotal === 0) return;
                if (
                  !window.confirm(
                    `Nollställa alla planerade timmar för det interna projektet ”${item.name}” i ${selectedMonthLabel}? Alla personers timmar på detta projekt i vald månad tas bort.`
                  )
                ) {
                  return;
                }
                clearCategoryColumnAllocationsForMonth("internalProject", item.id);
              }}
            />
          ) : null}
        </div>
        <CustomerHoursTrack
          categoryType={categoryType}
          refId={item.id}
          workspace={workspace}
          monthId={selectedMonthId}
          feasibleMax={feasibleMax}
          visualSpanHours={trackVisualSpan}
          orderedPersonIds={effectiveOrder}
          setOrderedPersonIds={setOrderedIds}
          persistOrder={persistOrder}
          getCellHours={getCellHours}
          upsertHours={upsertHours}
          activePeople={activePeople}
          onDropPerson={addPersonFromDrop}
          onBlockTransfer={onBlockTransfer}
        />
      </div>
    </div>
  );
}

function SectionTitle({ children, accent }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        color: accent,
        marginTop: 18,
        marginBottom: 8,
        letterSpacing: 0.04,
        opacity: 0.92,
      }}
    >
      {children}
    </div>
  );
}
