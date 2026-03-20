import { wholeHours } from "./hours.js";

function newId() {
  return crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

function entityVisible(e) {
  return e.active !== false;
}

/**
 * Vilken driftpost som får globala ”standardtimmarna” (sync från inställningar).
 */
export function getInternAnnatDriftRefId(ws) {
  const cats = ws.driftCategories || [];
  if (cats.length === 0) return null;
  const prefer = ws.settings?.internAnnatDriftCategoryId;
  if (prefer && cats.some((d) => d.id === prefer)) return prefer;
  const legacy = cats.find((d) => d.id === "drift-annat");
  if (legacy) return legacy.id;
  return cats[0].id;
}

function upsertDriftHours(allocations, refId, monthId, personId, hoursIn) {
  if (!refId) return allocations;
  const h = wholeHours(hoursIn);
  const ts = nowIso();
  const idx = allocations.findIndex(
    (a) =>
      a.monthId === monthId &&
      a.personId === personId &&
      a.categoryType === "internalDrift" &&
      a.refId === refId
  );
  if (h <= 0) {
    return idx >= 0 ? allocations.filter((_, i) => i !== idx) : allocations;
  }
  if (idx >= 0) {
    return allocations.map((a, i) =>
      i === idx ? { ...a, hours: h, updatedAt: ts } : a
    );
  }
  return [
    ...allocations,
    {
      id: newId(),
      monthId,
      personId,
      categoryType: "internalDrift",
      refId,
      hours: h,
      createdAt: ts,
      updatedAt: ts,
    },
  ];
}

function allMonthIds(ws) {
  const monthIds = new Set((ws.months || []).map((m) => m.id));
  for (const a of ws.allocations || []) monthIds.add(a.monthId);
  return monthIds;
}

/**
 * Sätter om intern drift för den kategori som valts under Inställningar (global standardtimmar).
 */
export function syncInternAnnatAllocations(ws, hoursRaw) {
  const refId = getInternAnnatDriftRefId(ws);
  const h = wholeHours(hoursRaw);
  const people = ws.people.filter(entityVisible);
  const monthIds = allMonthIds(ws);

  if (!refId) {
    return { ...ws, allocations: [...(ws.allocations || [])] };
  }

  let allocations = (ws.allocations || []).filter(
    (a) => !(a.categoryType === "internalDrift" && a.refId === refId)
  );

  if (h <= 0) {
    return { ...ws, allocations };
  }

  for (const monthId of monthIds) {
    for (const person of people) {
      allocations = upsertDriftHours(allocations, refId, monthId, person.id, h);
    }
  }
  return { ...ws, allocations };
}

export function ensureInternAnnatForMonth(ws, monthId, hoursRaw) {
  const refId = getInternAnnatDriftRefId(ws);
  const h = wholeHours(hoursRaw);
  if (!monthId || h <= 0 || !refId) return ws;
  let allocations = [...(ws.allocations || [])];
  for (const person of ws.people.filter(entityVisible)) {
    allocations = upsertDriftHours(allocations, refId, monthId, person.id, h);
  }
  return { ...ws, allocations };
}

export function ensureInternAnnatForPerson(ws, personId, hoursRaw) {
  const refId = getInternAnnatDriftRefId(ws);
  const h = wholeHours(hoursRaw);
  if (h <= 0 || !refId) return ws;
  let allocations = [...(ws.allocations || [])];
  for (const monthId of allMonthIds(ws)) {
    allocations = upsertDriftHours(allocations, refId, monthId, personId, h);
  }
  return { ...ws, allocations };
}

/**
 * Lägger (tillbaka) globala standardtimmar på vald driftpost för en person och månad.
 * Används t.ex. efter ”nollställ månad” så reserverad drift från inställningar behålls.
 */
export function reapplyInternAnnatForPersonMonth(ws, personId, monthId) {
  const refId = getInternAnnatDriftRefId(ws);
  const h = wholeHours(ws.settings?.standardTimmarInternAnnat ?? 0);
  if (!refId || !monthId || !personId) return ws;
  let allocations = [...(ws.allocations || [])];
  allocations = upsertDriftHours(allocations, refId, monthId, personId, h);
  return { ...ws, allocations };
}
