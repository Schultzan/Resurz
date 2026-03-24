import { PERSON_ALLOC_UNDER, PERSON_ALLOC_OVER } from "../types.js";
import { wholeHours } from "./hours.js";

/** @param {{ timpris: number, budgetPerManad: number }} c */
export function customerBudgetTimmar(c) {
  if (c.timpris <= 0) return 0;
  return wholeHours(c.budgetPerManad / c.timpris);
}

/** @param {{ timpris: number, budgetPerManad: number }} c @param {number} malRef */
export function customerBudgetFTE(c, malRef) {
  const bh = customerBudgetTimmar(c);
  if (malRef <= 0) return 0;
  return bh / malRef;
}

/** @param {{ monthId: string }[]} allocations @param {string} monthId */
export function allocationsForMonth(allocations, monthId) {
  return allocations.filter((a) => a.monthId === monthId);
}

/**
 * Högst antal timmar denna person kan lägga på kunden denna månad utan att teamets total överstiger budgettimmar.
 * Sum "andra" exkluderar aktuell persons rad (så värdet kan sättas oberoende av tidigare eget värde).
 * @returns {{ budgetTimmar: number, usedByOthers: number, maxForThisPerson: number, isCapped: boolean }}
 */
export function customerCellBudgetLimit(workspace, monthId, personId, customerId) {
  const cust = workspace.customers.find((c) => c.id === customerId);
  const budgetTimmar = cust ? customerBudgetTimmar(cust) : 0;
  if (!cust || budgetTimmar <= 0) {
    return {
      budgetTimmar: Math.max(0, budgetTimmar),
      usedByOthers: 0,
      maxForThisPerson: Infinity,
      isCapped: false,
    };
  }
  const monthAlloc = allocationsForMonth(workspace.allocations, monthId);
  let usedByOthers = 0;
  for (const a of monthAlloc) {
    if (a.categoryType !== "customer" || a.refId !== customerId) continue;
    if (a.personId === personId) continue;
    usedByOthers += wholeHours(a.hours);
  }
  const maxForThisPerson = wholeHours(Math.max(0, budgetTimmar - usedByOthers));
  return { budgetTimmar, usedByOthers, maxForThisPerson, isCapped: true };
}

/**
 * @param {{ personId: string, categoryType: string, refId: string, hours: number }[]} monthAlloc
 * @param {string} personId
 * @param {Record<string, { timpris?: number }>} customersById
 */
export function personHourBreakdown(monthAlloc, personId, customersById) {
  let billable = 0;
  let internalProject = 0;
  let internalDrift = 0;
  let revenue = 0;

  for (const a of monthAlloc) {
    if (a.personId !== personId) continue;
    const h = wholeHours(a.hours);
    if (a.categoryType === "customer") {
      billable += h;
      const cust = customersById[a.refId];
      if (cust && cust.timpris > 0) revenue += h * cust.timpris;
    } else if (a.categoryType === "internalProject") {
      internalProject += h;
    } else if (a.categoryType === "internalDrift") {
      internalDrift += h;
    }
  }

  const total = billable + internalProject + internalDrift;
  return { billable, internalProject, internalDrift, total, revenue };
}

/** @param {number} capacity */
export function personDerived(breakdown, capacity) {
  const cap = Math.max(0, capacity);
  const remaining = cap - breakdown.total;
  const allocationRate = cap > 0 ? breakdown.total / cap : 0;
  const billingRate = cap > 0 ? breakdown.billable / cap : 0;
  let allocWarning = "balanced";
  if (allocationRate < PERSON_ALLOC_UNDER) allocWarning = "under";
  else if (allocationRate > PERSON_ALLOC_OVER) allocWarning = "over";
  return { remaining, allocationRate, billingRate, allocWarning };
}

/** Team-level aggregates */
export function teamMetrics(workspace, monthId) {
  const { people, customers, allocations, settings } = workspace;
  const monthAlloc = allocationsForMonth(allocations, monthId);
  const customersById = Object.fromEntries(customers.map((c) => [c.id, c]));
  const activePeople = people.filter((p) => p.active !== false);

  let teamkapacitet = 0;
  let teamFakturerbara = 0;
  let teamInternProj = 0;
  let teamInternDrift = 0;
  let teamIntakt = 0;

  const perPerson = [];

  for (const p of activePeople) {
    const cap = p.kapacitetPerManad;
    teamkapacitet += cap;
    const b = personHourBreakdown(monthAlloc, p.id, customersById);
    const billableKpi = personBillableCustomerHours(monthAlloc, p.id, workspace);
    teamFakturerbara += billableKpi;
    teamInternProj += b.internalProject;
    teamInternDrift += b.internalDrift;
    const bKpi = { ...b, billable: billableKpi };
    const d = personDerived(bKpi, cap);
    perPerson.push({
      person: p,
      ...b,
      billable: billableKpi,
      ...d,
      kapacitet: cap,
      malFakturerbara: p.malFakturerbaraTimmar,
    });
  }

  /** Intäkt (KPI): budget + fast månadsintäkt per aktiv kund — samma tänk som fasta månadsrader i Excel (ej timmar × pris). */
  for (const c of customers) {
    if (c.active === false) continue;
    const budget = Math.max(0, Math.round(Number(c.budgetPerManad) || 0));
    const fast = Math.max(0, Math.round(Number(c.fastManadsintaktKr) || 0));
    teamIntakt += budget + fast;
  }

  const teamTot = teamFakturerbara + teamInternProj + teamInternDrift;
  const teamKvar = teamkapacitet - teamTot;
  const teamAllocGrad = teamkapacitet > 0 ? teamTot / teamkapacitet : 0;
  const teamBillGrad = teamkapacitet > 0 ? teamFakturerbara / teamkapacitet : 0;

  return {
    monthId,
    teamkapacitet,
    teamFakturerbara,
    teamInternProj,
    teamInternDrift,
    teamTot,
    teamKvar,
    teamAllocGrad,
    teamBillGrad,
    teamIntakt,
    perPerson,
  };
}

/**
 * Timmar på aktiva kundkolumner (fakturerbart) för en person en månad.
 * Används bl.a. för självkostnadspris — internt projekt och intern drift räknas inte.
 */
export function personBillableCustomerHours(monthAlloc, personId, workspace) {
  const activeIds = new Set(
    (workspace.customers || []).filter((c) => c.active !== false).map((c) => c.id)
  );
  let sum = 0;
  for (const a of monthAlloc) {
    if (a.personId !== personId || a.categoryType !== "customer") continue;
    if (!activeIds.has(a.refId)) continue;
    sum += wholeHours(a.hours);
  }
  return wholeHours(sum);
}

/**
 * Självkostnad kr/h: (löner + övrigt för månaden) / fakturerbara timmar samma månad (aktiva kundkolumner).
 * Samma tänk som typisk Excel: total månadskostnad delat med faktureringsbara timmar — ingen ×11/12-justering.
 *
 * krPerHourAtFullCustomerBudget: samma täljare men nämnare = summan av budget→timmar (budget÷timpris) för aktiva kunder.
 *
 * @returns {{
 *   monthlyBurn: number,
 *   monthlyBillableHours: number,
 *   yearlyBillableHours: number,
 *   avgMonthlyBillableHours: number,
 *   krPerHour: number | null,
 *   budgetBillableHoursPerMonth: number,
 *   yearlyBillableHoursAtFullCustomerBudget: number,
 *   avgMonthlyBillableAtFullCustomerBudget: number,
 *   krPerHourAtFullCustomerBudget: number | null,
 * }}
 */
export function costPriceMetrics(workspace, monthId) {
  const settings = workspace.settings || {};
  const lon = Math.max(0, Math.round(Number(settings.manadskostnadLoner) || 0));
  const ovr = Math.max(0, Math.round(Number(settings.manadskostnadOvrigt) || 0));
  const monthlyBurn = lon + ovr;

  const monthAlloc = allocationsForMonth(workspace.allocations || [], monthId);
  const activePeople = (workspace.people || []).filter((p) => p.active !== false);

  let monthlyBillableHours = 0;
  for (const p of activePeople) {
    monthlyBillableHours += personBillableCustomerHours(monthAlloc, p.id, workspace);
  }
  monthlyBillableHours = wholeHours(monthlyBillableHours);

  const krPerHour =
    monthlyBurn > 0 && monthlyBillableHours > 0 ? monthlyBurn / monthlyBillableHours : null;

  const activeCustomers = (workspace.customers || []).filter((c) => c.active !== false);
  let budgetBillableHoursPerMonth = 0;
  for (const c of activeCustomers) {
    budgetBillableHoursPerMonth += customerBudgetTimmar(c);
  }
  budgetBillableHoursPerMonth = wholeHours(budgetBillableHoursPerMonth);
  const yearlyBillableHoursAtFullCustomerBudget = budgetBillableHoursPerMonth * 11;
  const krPerHourAtFullCustomerBudget =
    monthlyBurn > 0 && budgetBillableHoursPerMonth > 0
      ? monthlyBurn / budgetBillableHoursPerMonth
      : null;

  return {
    monthlyBurn,
    monthlyBillableHours,
    yearlyBillableHours: monthlyBillableHours * 11,
    avgMonthlyBillableHours: monthlyBillableHours,
    krPerHour,
    budgetBillableHoursPerMonth,
    yearlyBillableHoursAtFullCustomerBudget,
    avgMonthlyBillableAtFullCustomerBudget: budgetBillableHoursPerMonth,
    krPerHourAtFullCustomerBudget,
    lonerKr: lon,
    ovrigtKr: ovr,
  };
}

/** Column totals for planning matrix footer */
export function columnPlannedHours(monthAlloc, categoryType, refId) {
  let sum = 0;
  for (const a of monthAlloc) {
    if (a.categoryType === categoryType && a.refId === refId) {
      sum += wholeHours(a.hours);
    }
  }
  return wholeHours(sum);
}

/** @param {*} workspace @param {string} monthId */
export function customerColumnMetrics(workspace, monthId) {
  const { customers, allocations, settings } = workspace;
  const monthAlloc = allocationsForMonth(allocations, monthId);
  const malRef = Math.max(0, Number(settings.standardTimmarInternAnnat) || 0);

  return customers
    .filter((c) => c.active !== false)
    .map((c) => {
      const planerade = columnPlannedHours(monthAlloc, "customer", c.id);
      const budgetT = customerBudgetTimmar(c);
      const budgetFTE = customerBudgetFTE(c, malRef);
      const diff = planerade - budgetT;
      const intakt = planerade * (c.timpris > 0 ? c.timpris : 0);
      let budgetWarning = "ok";
      if (budgetT > 0) {
        if (planerade > budgetT) budgetWarning = "over";
        else if (planerade < budgetT * 0.9) budgetWarning = "under";
        else budgetWarning = "near";
      }
      return {
        customer: c,
        planerade,
        budgetTimmar: budgetT,
        budgetFTE,
        diff,
        intakt,
        budgetWarning,
      };
    });
}

export function internalProjectColumnMetrics(workspace, monthId) {
  const { internalProjects, allocations } = workspace;
  const monthAlloc = allocationsForMonth(allocations, monthId);
  return internalProjects
    .filter((p) => p.active !== false)
    .map((p) => {
      const planerade = columnPlannedHours(monthAlloc, "internalProject", p.id);
      const mal = p.malTimmar != null ? p.malTimmar : null;
      const diff = mal != null ? planerade - mal : null;
      return { project: p, planerade, malTimmar: mal, diff };
    });
}

export function driftColumnMetrics(workspace, monthId) {
  const monthAlloc = allocationsForMonth(workspace.allocations, monthId);
  const cats = workspace.driftCategories || [];
  return cats.map((d) => ({
    drift: d,
    planerade: columnPlannedHours(monthAlloc, "internalDrift", d.id),
  }));
}
