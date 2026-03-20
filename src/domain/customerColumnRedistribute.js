import {
  allocationsForMonth,
  customerBudgetTimmar,
  personHourBreakdown,
} from "./calculations.js";
import { wholeHours } from "./hours.js";

/**
 * Max timmar person kan lägga på denna kundcell: kapacitet minus övriga allokeringar samma månad.
 */
export function personRoomOnCustomerCell(monthAlloc, personId, customerId, personCapacity) {
  let otherMonth = 0;
  for (const a of monthAlloc) {
    if (a.personId !== personId) continue;
    const h = wholeHours(a.hours);
    if (a.categoryType === "customer" && a.refId === customerId) continue;
    otherMonth += h;
  }
  return Math.max(0, wholeHours(personCapacity - otherMonth));
}

/**
 * Största teamtotal som ryms på kunden: budgettimmar (om satt) och summan av personernas cell-tak.
 */
export function feasibleCustomerColumnMaxTotal(workspace, monthId, customerId, personIds) {
  const cust = workspace.customers.find((c) => c.id === customerId);
  if (!cust) return 0;
  const budgetT = customerBudgetTimmar(cust);
  const budgetCap = budgetT > 0 ? budgetT : Infinity;
  const monthAlloc = allocationsForMonth(workspace.allocations || [], monthId);
  const peopleById = Object.fromEntries((workspace.people || []).map((p) => [p.id, p]));
  let sumRoom = 0;
  for (const pid of personIds) {
    const p = peopleById[pid];
    if (!p || p.active === false) continue;
    sumRoom += personRoomOnCustomerCell(monthAlloc, pid, customerId, p.kapacitetPerManad || 0);
  }
  return Math.min(budgetCap, sumRoom);
}

/**
 * Fördela target heltal över personIds proportionellt mot weights (≧1), klampa mot caps, justera summan.
 * @returns {{ hoursByPerson: Record<string, number>, achievedTotal: number }}
 */
function distributeProportionalWithCaps(target, personIds, weights, caps) {
  const n = personIds.length;
  if (n === 0 || target <= 0) {
    return { hoursByPerson: {}, achievedTotal: 0 };
  }
  const wsum = personIds.reduce((s, id) => s + Math.max(0, weights[id] || 0), 0);
  const baseW = wsum > 0 ? wsum : n;
  const parts = personIds.map((id) => {
    const w = wsum > 0 ? Math.max(0, weights[id] || 0) : 1;
    const exact = (w / baseW) * target;
    return {
      id,
      floor: Math.floor(exact),
      rem: exact - Math.floor(exact),
      cap: wholeHours(caps[id] ?? 0),
    };
  });
  let sumF = parts.reduce((s, p) => s + p.floor, 0);
  let need = target - sumF;
  const orderIdx = parts.map((_, i) => i).sort((i, j) => parts[j].rem - parts[i].rem);
  let oi = 0;
  while (need > 0 && oi < need + parts.length * 4) {
    parts[orderIdx[oi % orderIdx.length]].floor += 1;
    need -= 1;
    oi += 1;
  }
  /** @type {Record<string, number>} */
  const h = {};
  for (const p of parts) {
    h[p.id] = Math.min(p.floor, p.cap);
  }
  for (let iter = 0; iter < 400; iter++) {
    let S = personIds.reduce((s, id) => s + h[id], 0);
    if (S === target) {
      return { hoursByPerson: h, achievedTotal: S };
    }
    if (S > target) {
      let over = S - target;
      const order = [...personIds].filter((id) => h[id] > 0).sort((a, b) => h[b] - h[a]);
      for (const id of order) {
        if (over <= 0) break;
        const take = Math.min(over, h[id]);
        h[id] -= take;
        over -= take;
      }
      if (over > 0) break;
    } else {
      let under = target - S;
      const order = [...personIds]
        .map((id) => ({ id, slack: (caps[id] ?? 0) - h[id] }))
        .filter((x) => x.slack > 0)
        .sort((a, b) => b.slack - a.slack);
      for (const { id } of order) {
        if (under <= 0) break;
        const slack = (caps[id] ?? 0) - h[id];
        const add = Math.min(under, slack);
        h[id] += add;
        under -= add;
      }
      if (under > 0) {
        S = personIds.reduce((s, id) => s + h[id], 0);
        return { hoursByPerson: h, achievedTotal: S };
      }
    }
  }
  const S = personIds.reduce((s, id) => s + h[id], 0);
  return { hoursByPerson: h, achievedTotal: S };
}

/**
 * Beräknar nya timmar per person på en kundkolumn för en månad, proportionellt mot befintliga timmar (lik weights om 0).
 * Uppdaterar endast angivna bidragare (+ alla som redan har timmar på kunden om de saknas i listan).
 *
 * @returns {{
 *   pairs: { personId: string, hours: number }[],
 *   actualTarget: number,
 *   feasibleMax: number,
 *   requestedTarget: number,
 *   clampedToFeasible: boolean,
 * }}
 */
export function redistributeCustomerColumnHours(
  workspace,
  monthId,
  customerId,
  targetTotal,
  contributorPersonIds
) {
  const monthAlloc = allocationsForMonth(workspace.allocations || [], monthId);
  const cust = workspace.customers.find((c) => c.id === customerId);
  if (!cust) {
    return {
      pairs: [],
      actualTarget: 0,
      feasibleMax: 0,
      requestedTarget: wholeHours(targetTotal),
      clampedToFeasible: false,
    };
  }

  /** @type {Map<string, number>} */
  const hoursOnCustomer = new Map();
  for (const a of monthAlloc) {
    if (a.categoryType !== "customer" || a.refId !== customerId) continue;
    hoursOnCustomer.set(a.personId, wholeHours(a.hours));
  }

  const contributors = [...new Set((contributorPersonIds || []).filter(Boolean))].filter((pid) => {
    const p = workspace.people.find((x) => x.id === pid);
    return p && p.active !== false;
  });

  const customersById = Object.fromEntries((workspace.customers || []).map((c) => [c.id, c]));

  if (contributors.length === 0) {
    return {
      pairs: [],
      actualTarget: 0,
      feasibleMax: 0,
      requestedTarget: wholeHours(targetTotal),
      clampedToFeasible: false,
    };
  }

  const budgetT = customerBudgetTimmar(cust);
  const budgetCap = budgetT > 0 ? budgetT : Infinity;

  /** @type {Record<string, number>} */
  const room = {};
  for (const pid of contributors) {
    const p = workspace.people.find((x) => x.id === pid);
    const cap = p?.kapacitetPerManad || 0;
    const b = personHourBreakdown(monthAlloc, pid, customersById);
    const cur = hoursOnCustomer.get(pid) || 0;
    const otherOnPersonMonth = b.total - cur;
    room[pid] = Math.max(0, wholeHours(cap - otherOnPersonMonth));
  }

  const sumRoom = contributors.reduce((s, id) => s + room[id], 0);
  const feasibleMax = Math.min(budgetCap, sumRoom);
  const requested = wholeHours(targetTotal);
  let T = Math.max(0, Math.min(requested, feasibleMax));
  const clampedToFeasible = requested !== T;

  if (T === 0) {
    return {
      pairs: contributors.map((id) => ({ personId: id, hours: 0 })),
      actualTarget: 0,
      feasibleMax,
      requestedTarget: requested,
      clampedToFeasible,
    };
  }

  /** @type {Record<string, number>} */
  const weights = {};
  for (const id of contributors) {
    const c = hoursOnCustomer.get(id) || 0;
    weights[id] = c > 0 ? c : 1;
  }

  const { hoursByPerson, achievedTotal } = distributeProportionalWithCaps(T, contributors, weights, room);
  return {
    pairs: contributors.map((id) => ({ personId: id, hours: hoursByPerson[id] ?? 0 })),
    actualTarget: achievedTotal,
    feasibleMax,
    requestedTarget: requested,
    clampedToFeasible: clampedToFeasible || achievedTotal !== T,
  };
}
