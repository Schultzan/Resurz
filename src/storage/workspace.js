import { SCHEMA_VERSION, LEGACY_DRIFT_CATEGORY_SEED } from "../types.js";
import { wholeHours } from "../domain/hours.js";
import { pickNextEntityColor, normalizeHex } from "../domain/entityColors.js";

const LEGACY_NAMES = [
  { name: "Agnes Sandberg", roles: ["App"] },
  { name: "Alexander Hansen", roles: ["Web"] },
  { name: "Alexander Schultz", roles: ["Sälj", "Admin"] },
  { name: "Alexander Yngling", roles: ["CTO", "Backend"] },
  { name: "August Erixson", roles: ["Web"] },
  { name: "Axel Edelsvärd", roles: ["Design"] },
  { name: "Carl Hernek", roles: ["Web", "AI"] },
  { name: "Dmitrij Velström", roles: ["Backend"] },
  { name: "Jonas Lissborg", roles: ["App"] },
  { name: "Max Wroblewski", roles: ["Design", "Admin"] },
  { name: "Philip Gyllhamn", roles: ["Backend", "Web"] },
  { name: "Pål Arvei", roles: ["App", "Web"] },
  { name: "Truls", roles: ["Web", "Backend"] },
];

function newId() {
  return crypto.randomUUID();
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

/** @returns {string} YYYY-MM */
export function monthIdFromParts(year, month) {
  return `${year}-${pad2(month)}`;
}

/** Current calendar month id in local time */
export function defaultMonthId() {
  const d = new Date();
  return monthIdFromParts(d.getFullYear(), d.getMonth() + 1);
}

function monthLabel(svMonth, year) {
  const names = [
    "Januari", "Februari", "Mars", "April", "Maj", "Juni",
    "Juli", "Augusti", "September", "Oktober", "November", "December",
  ];
  return `${names[svMonth - 1]} ${year}`;
}

export function parseMonthId(monthId) {
  const [y, m] = monthId.split("-").map(Number);
  return { year: y, month: m };
}

/** Flytta YYYY-MM delta kalendermånader (delta kan vara negativ). */
export function addCalendarMonths(monthId, delta) {
  const { year, month } = parseMonthId(monthId);
  const d = new Date(year, month - 1 + delta, 1);
  return monthIdFromParts(d.getFullYear(), d.getMonth() + 1);
}

/**
 * Säkerställer månadslista ± runt idag samt alla månader som finns i allokeringar.
 * Ingen manuell ”lägg till månad” behövs.
 */
export function expandMonthsToRollingWindow(ws) {
  const ids = new Set((ws.months || []).map((m) => m.id));
  const now = new Date();
  const cy = now.getFullYear();
  const cm = now.getMonth() + 1;
  for (let i = -12; i <= 24; i++) {
    const d = new Date(cy, cm - 1 + i, 1);
    ids.add(monthIdFromParts(d.getFullYear(), d.getMonth() + 1));
  }
  for (const a of ws.allocations || []) {
    if (a.monthId && /^\d{4}-\d{2}$/.test(a.monthId)) ids.add(a.monthId);
  }
  const sorted = [...ids].sort();
  const byId = Object.fromEntries((ws.months || []).map((m) => [m.id, m]));
  const months = sorted.map((id) => byId[id] ?? monthEntryFromId(id));
  const prevKey = [...(ws.months || []).map((m) => m.id)].sort().join("\0");
  const nextKey = sorted.join("\0");
  if (prevKey === nextKey) {
    return ws;
  }
  return { ...ws, months };
}

function matchDepartmentId(departments, roles) {
  const r = roles.map((x) => x.toLowerCase()).join(" ");
  const find = (hint) => departments.find((d) => d.name.toLowerCase().includes(hint));
  if (r.includes("web")) return find("webb")?.id ?? null;
  if (r.includes("backend")) return find("backend")?.id ?? null;
  if (roles.some((x) => x.toLowerCase() === "app")) return find("app")?.id ?? null;
  if (r.includes("design")) return find("design")?.id ?? null;
  return departments.find((d) => d.name === "Övrigt")?.id ?? departments[0]?.id ?? null;
}

export function createDefaultWorkspace() {
  const standardKapacitetPerManad = 160;
  const standardMalFakturerbaraTimmar = 120;

  const departmentSeeds = [
    { name: "Webb" },
    { name: "Backend" },
    { name: "App" },
    { name: "Design" },
    { name: "Övrigt" },
  ];
  let colorAcc = { departments: [], customers: [], internalProjects: [], driftCategories: [] };
  const departments = departmentSeeds.map((d) => {
    const color = pickNextEntityColor(colorAcc);
    const dept = { id: newId(), name: d.name, color };
    colorAcc = { ...colorAcc, departments: [...colorAcc.departments, dept] };
    return dept;
  });

  const people = LEGACY_NAMES.map((p) => ({
    id: newId(),
    name: p.name,
    kapacitetPerManad: standardKapacitetPerManad,
    malFakturerbaraTimmar: standardMalFakturerbaraTimmar,
    active: true,
    comment: "",
    roles: [...p.roles],
    departmentId: matchDepartmentId(departments, p.roles),
  }));

  colorAcc = { departments, customers: [], internalProjects: [] };
  const cust1 = {
    id: newId(),
    name: "Kund Alfa",
    timpris: 1200,
    budgetPerManad: 240000,
    active: true,
    comment: "",
    color: pickNextEntityColor(colorAcc),
  };
  colorAcc = { ...colorAcc, customers: [cust1] };
  const cust2 = {
    id: newId(),
    name: "Kund Beta",
    timpris: 1100,
    budgetPerManad: 176000,
    active: true,
    comment: "",
    color: pickNextEntityColor(colorAcc),
  };
  const customers = [cust1, cust2];
  colorAcc = { ...colorAcc, customers };
  const proj1 = {
    id: newId(),
    name: "Produkt / R&D",
    budgetPerManad: null,
    malTimmar: null,
    active: true,
    comment: "",
    color: pickNextEntityColor(colorAcc),
  };
  colorAcc = { ...colorAcc, internalProjects: [proj1] };
  const proj2 = {
    id: newId(),
    name: "AI-initiativ",
    budgetPerManad: null,
    malTimmar: 80,
    active: true,
    comment: "",
    color: pickNextEntityColor(colorAcc),
  };
  const internalProjects = [proj1, proj2];

  colorAcc = { departments, customers, internalProjects, driftCategories: [] };
  const driftCategories = [];
  for (const d of LEGACY_DRIFT_CATEGORY_SEED) {
    const color = pickNextEntityColor(colorAcc);
    const row = { id: d.id, name: d.name, color };
    driftCategories.push(row);
    colorAcc = { ...colorAcc, driftCategories: [...driftCategories] };
  }

  const internAnnatDriftCategoryId =
    driftCategories.find((x) => x.id === "drift-annat")?.id ??
    driftCategories[0]?.id ??
    null;

  const settings = {
    standardKapacitetPerManad,
    standardMalFakturerbaraTimmar,
    standardTimmarInternAnnat: 0,
    internAnnatDriftCategoryId,
    manadskostnadLoner: 0,
    manadskostnadOvrigt: 0,
  };

  const mid = defaultMonthId();
  const { year, month } = parseMonthId(mid);

  const months = [
    {
      id: mid,
      year,
      month,
      label: monthLabel(month, year),
      status: "planned",
    },
  ];

  return {
    schemaVersion: SCHEMA_VERSION,
    settings,
    departments,
    people,
    customers,
    internalProjects,
    driftCategories,
    months,
    allocations: [],
  };
}

/**
 * Accepterar äldre schemaVersion och normaliserar till senaste.
 */
export function migrateWorkspace(raw) {
  if (!raw || typeof raw !== "object") return null;
  let v = raw.schemaVersion;
  if (v == null && Array.isArray(raw.people)) v = SCHEMA_VERSION;
  v = Number(v);
  if (!Number.isFinite(v) || (v !== 1 && v !== 2)) return null;

  const departments = [];
  for (const d of raw.departments || []) {
    const color =
      normalizeHex(d.color) ||
      pickNextEntityColor({ departments, customers: [], internalProjects: [] });
    departments.push({
      id: d.id || newId(),
      name: String(d.name || "Avdelning"),
      color,
    });
  }

  const customers = [];
  for (const c of raw.customers || []) {
    const color =
      normalizeHex(c.color) ||
      pickNextEntityColor({ departments, customers, internalProjects: [] });
    customers.push({ ...c, color });
  }

  const internalProjects = [];
  for (const p of raw.internalProjects || []) {
    const color =
      normalizeHex(p.color) ||
      pickNextEntityColor({ departments, customers, internalProjects });
    internalProjects.push({
      ...p,
      malTimmar: p.malTimmar != null ? wholeHours(p.malTimmar) : null,
      color,
    });
  }

  const driftCategories = [];
  if (Array.isArray(raw.driftCategories) && raw.driftCategories.length > 0) {
    for (const d of raw.driftCategories) {
      const color =
        normalizeHex(d.color) ||
        pickNextEntityColor({ departments, customers, internalProjects, driftCategories });
      driftCategories.push({
        id: d.id || newId(),
        name: String(d.name || "Drift"),
        color,
      });
    }
  } else {
    for (const d of LEGACY_DRIFT_CATEGORY_SEED) {
      const color = pickNextEntityColor({
        departments,
        customers,
        internalProjects,
        driftCategories,
      });
      driftCategories.push({ id: d.id, name: d.name, color });
    }
  }

  const people = (raw.people || []).map((p) => ({
    ...p,
    departmentId: p.departmentId ?? null,
  }));

  const allocations = (raw.allocations || []).map((a) => ({
    ...a,
    hours: wholeHours(a.hours),
  }));

  return {
    ...raw,
    schemaVersion: SCHEMA_VERSION,
    departments,
    people,
    customers,
    settings: (() => {
      const s = {
        standardKapacitetPerManad: 160,
        standardMalFakturerbaraTimmar: 120,
        standardTimmarInternAnnat: 0,
        internAnnatDriftCategoryId: null,
        ...(raw.settings && typeof raw.settings === "object" ? raw.settings : {}),
      };
      s.standardTimmarInternAnnat = wholeHours(s.standardTimmarInternAnnat);
      const dIds = new Set(driftCategories.map((d) => d.id));
      let ann = s.internAnnatDriftCategoryId;
      if (!ann || !dIds.has(ann)) {
        ann =
          driftCategories.find((d) => d.id === "drift-annat")?.id ??
          driftCategories[0]?.id ??
          null;
      }
      s.internAnnatDriftCategoryId = ann;
      const lon = Number(s.manadskostnadLoner);
      const ovr = Number(s.manadskostnadOvrigt);
      s.manadskostnadLoner = Number.isFinite(lon) ? Math.max(0, Math.round(lon)) : 0;
      s.manadskostnadOvrigt = Number.isFinite(ovr) ? Math.max(0, Math.round(ovr)) : 0;
      return s;
    })(),
    internalProjects,
    driftCategories,
    months: raw.months || [],
    allocations,
  };
}

export function ensureWorkspaceShape(raw) {
  return migrateWorkspace(raw);
}

/** @param {string} monthId YYYY-MM */
export function monthEntryFromId(monthId) {
  const { year, month } = parseMonthId(monthId);
  return {
    id: monthId,
    year,
    month,
    label: monthLabel(month, year),
    status: "planned",
  };
}

/** @param {*} ws @param {string} monthId */
export function ensureMonth(ws, monthId) {
  if (!monthId || !/^\d{4}-\d{2}$/.test(monthId)) return ws;
  if (ws.months.some((m) => m.id === monthId)) return ws;
  return {
    ...ws,
    months: [...ws.months, monthEntryFromId(monthId)],
  };
}
