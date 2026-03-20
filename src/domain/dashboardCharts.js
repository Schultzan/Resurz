import {
  allocationsForMonth,
  personHourBreakdown,
  teamMetrics,
} from "./calculations.js";
import { wholeHours } from "./hours.js";

const UNASSIGNED = "__dept_unassigned__";

export const PERSON_CHART_COLORS = [
  "#8eb8e5", "#c4abeb", "#91d4be", "#e8aab8", "#e8c9a8", "#9ec8e5", "#d4b8e8",
  "#aab8ce", "#b8d4e8", "#a8d4c8", "#e8c4d4", "#c8b8e8", "#b8e0d0",
];

function monthAllocations(workspace, monthId) {
  return allocationsForMonth(workspace.allocations, monthId);
}

/** @returns {{ label: string, people: { id: string, shortName: string, color: string }[], rows: Record<string, number|string>[] }} */
export function customerPersonStackSeries(workspace, monthId) {
  const customers = workspace.customers.filter((c) => c.active !== false);
  const people = workspace.people.filter((p) => p.active !== false);
  const monthAlloc = monthAllocations(workspace, monthId);

  const peopleMeta = people.map((p, i) => ({
    id: p.id,
    shortName: p.name.split(" ")[0],
    color: PERSON_CHART_COLORS[i  % PERSON_CHART_COLORS.length],
  }));

  const rows = customers.map((c) => {
    const row = {
      label: c.name.length > 22 ? `${c.name.slice(0, 20)}…` : c.name,
      refId: c.id,
    };
    let sum = 0;
    for (const pr of people) {
      const h = hoursOnCell(monthAlloc, monthId, pr.id, "customer", c.id);
      row[`h_${pr.id}`] = h;
      sum += h;
    }
    row._sum = sum;
    return row;
  }).filter((r) => r._sum > 0);

  return { rows, people: peopleMeta, labelKey: "label" };
}

export function internalProjectPersonStackSeries(workspace, monthId) {
  const projects = workspace.internalProjects.filter((p) => p.active !== false);
  const people = workspace.people.filter((p) => p.active !== false);
  const monthAlloc = monthAllocations(workspace, monthId);

  const peopleMeta = people.map((p, i) => ({
    id: p.id,
    shortName: p.name.split(" ")[0],
    color: PERSON_CHART_COLORS[i % PERSON_CHART_COLORS.length],
  }));

  const rows = projects.map((proj) => {
    const row = {
      label: proj.name.length > 22 ? `${proj.name.slice(0, 20)}…` : proj.name,
      refId: proj.id,
    };
    let sum = 0;
    for (const pr of people) {
      const h = hoursOnCell(monthAlloc, monthId, pr.id, "internalProject", proj.id);
      row[`h_${pr.id}`] = h;
      sum += h;
    }
    row._sum = sum;
    return row;
  }).filter((r) => r._sum > 0);

  return { rows, people: peopleMeta, labelKey: "label" };
}

function hoursOnCell(monthAlloc, monthId, personId, categoryType, refId) {
  const a = monthAlloc.find(
    (x) =>
      x.monthId === monthId &&
      x.personId === personId &&
      x.categoryType === categoryType &&
      x.refId === refId
  );
  return a ? wholeHours(a.hours) : 0;
}

/** Kapacitet vs allokerat per person (stapel: ledigt / inom kap / över kap) */
export function personCapacityBars(workspace, monthId) {
  const tm = teamMetrics(workspace, monthId);
  return tm.perPerson.map((r, i) => {
    const cap = r.kapacitet;
    const alloc = r.total;
    const within = Math.min(alloc, cap);
    const over = Math.max(0, alloc - cap);
    const free = Math.max(0, cap - alloc);
    return {
      name: r.person.name.length > 18 ? `${r.person.name.slice(0, 16)}…` : r.person.name,
      fullName: r.person.name,
      Ledigt: wholeHours(free),
      Allokerat: wholeHours(within),
      Överkap: wholeHours(over),
      cap,
      alloc,
      rate: cap > 0 ? alloc / cap : 0,
      color: PERSON_CHART_COLORS[i % PERSON_CHART_COLORS.length],
    };
  });
}

/** Per avdelning: summa kapacitet och allokerade timmar (aktiva personer) */
export function departmentUtilizationSeries(workspace, monthId) {
  const monthAlloc = monthAllocations(workspace, monthId);
  const customersById = Object.fromEntries(workspace.customers.map((c) => [c.id, c]));
  const deptList = workspace.departments || [];
  const deptMap = Object.fromEntries(deptList.map((d) => [d.id, d]));

  const buckets = new Map();

  function ensureBucket(id, name, color) {
    if (!buckets.has(id)) {
      buckets.set(id, { id, name, color: color || "#64748b", capacity: 0, allocated: 0 });
    }
    return buckets.get(id);
  }

  for (const p of workspace.people.filter((x) => x.active !== false)) {
    const did = p.departmentId && deptMap[p.departmentId] ? p.departmentId : UNASSIGNED;
    const dmeta = did === UNASSIGNED
      ? { name: "Utan avdelning", color: "#475569" }
      : deptMap[did];
    const b = ensureBucket(did, dmeta.name, dmeta.color);
    b.capacity += p.kapacitetPerManad;
    const br = personHourBreakdown(monthAlloc, p.id, customersById);
    b.allocated += br.total;
  }

  const rows = [...buckets.values()].map((b) => {
    const cap = b.capacity;
    const alloc = b.allocated;
    const within = Math.min(alloc, cap);
    const over = Math.max(0, alloc - cap);
    const free = Math.max(0, cap - alloc);
    return {
      name: b.name.length > 16 ? `${b.name.slice(0, 14)}…` : b.name,
      fullName: b.name,
      deptColor: b.color,
      Ledigt: wholeHours(free),
      Allokerat: wholeHours(within),
      Överkap: wholeHours(over),
      capacity: cap,
      allocated: wholeHours(alloc),
      rate: cap > 0 ? alloc / cap : 0,
    };
  });

  rows.sort((a, b) => b.allocated - a.allocated);
  return rows;
}
