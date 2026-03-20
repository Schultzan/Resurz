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
    teamFakturerbara += b.billable;
    teamInternProj += b.internalProject;
    teamInternDrift += b.internalDrift;
    teamIntakt += b.revenue;
    const d = personDerived(b, cap);
    perPerson.push({
      person: p,
      ...b,
      ...d,
      kapacitet: cap,
      malFakturerbara: p.malFakturerbaraTimmar,
    });
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
    standardMal: settings.standardMalFakturerbaraTimmar,
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
 * Självkostnad kr/h enligt månadskostnader och fakturerbara timmar (aktiva kunder).
 * Årsvolym av fakturerbara timmar = summa över personer (timmar vald månad × 11 lediga månader).
 * Snitt per kalendermånad = den volymen / 12 (kostnader löper 12 månader).
 *
 * @returns {{
 *   monthlyBurn: number,
 *   yearlyBillableHours: number,
 *   avgMonthlyBillableHours: number,
 *   krPerHour: number | null,
 * }}
 */
export function costPriceMetrics(workspace, monthId) {
  const settings = workspace.settings || {};
  const lon = Math.max(0, Math.round(Number(settings.manadskostnadLoner) || 0));
  const ovr = Math.max(0, Math.round(Number(settings.manadskostnadOvrigt) || 0));
  const monthlyBurn = lon + ovr;

  const monthAlloc = allocationsForMonth(workspace.allocations || [], monthId);
  const activePeople = (workspace.people || []).filter((p) => p.active !== false);

  let yearlyBillableHours = 0;
  for (const p of activePeople) {
    const billable = personBillableCustomerHours(monthAlloc, p.id, workspace);
    yearlyBillableHours += billable * 11;
  }
  const avgMonthlyBillableHours = yearlyBillableHours / 12;
  const krPerHour =
    monthlyBurn > 0 && avgMonthlyBillableHours > 0 ? monthlyBurn / avgMonthlyBillableHours : null;

  return {
    monthlyBurn,
    yearlyBillableHours,
    avgMonthlyBillableHours,
    krPerHour,
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
  const mal = settings.standardMalFakturerbaraTimmar;

  return customers
    .filter((c) => c.active !== false)
    .map((c) => {
      const planerade = columnPlannedHours(monthAlloc, "customer", c.id);
      const budgetT = customerBudgetTimmar(c);
      const budgetFTE = customerBudgetFTE(c, mal);
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
