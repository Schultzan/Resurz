import { addCalendarMonths } from "../storage/workspace.js";
import { wholeHours } from "./hours.js";

function newId() {
  return crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

function rowKey(personId, categoryType, refId) {
  return `${personId}\0${categoryType}\0${refId}`;
}

/** Kund, internt projekt, och drift som inte är globala standardtimmar-posten. */
function isStructuralRow(a, annatRef) {
  if (a.categoryType === "customer" || a.categoryType === "internalProject") return true;
  if (a.categoryType === "internalDrift") {
    if (annatRef && a.refId === annatRef) return false;
    return true;
  }
  return false;
}

/**
 * För varje aktiv person: om vald månad saknar ”manuell” planering (kund/intern drift utom annat / internt projekt)
 * men föregående månad har timmar där, kopiera dessa rader. Global annat-rad påverkas inte.
 */
export function carryForwardFromPreviousMonth(workspace, targetMonthId) {
  const alloc = workspace.allocations || [];
  const annatRef = workspace.settings?.internAnnatDriftCategoryId ?? null;
  const prevMonthId = addCalendarMonths(targetMonthId, -1);

  const existingTarget = new Set(
    alloc.filter((a) => a.monthId === targetMonthId).map((a) => rowKey(a.personId, a.categoryType, a.refId))
  );

  const additions = [];
  const ts = nowIso();

  for (const person of workspace.people || []) {
    if (person.active === false) continue;
    const pid = person.id;

    const hasStructural = alloc.some(
      (a) => a.monthId === targetMonthId && a.personId === pid && isStructuralRow(a, annatRef)
    );
    if (hasStructural) continue;

    const prevRows = alloc.filter(
      (a) =>
        a.monthId === prevMonthId &&
        a.personId === pid &&
        wholeHours(a.hours) > 0 &&
        isStructuralRow(a, annatRef)
    );

    for (const a of prevRows) {
      const k = rowKey(pid, a.categoryType, a.refId);
      if (existingTarget.has(k)) continue;
      existingTarget.add(k);
      additions.push({
        ...a,
        id: newId(),
        monthId: targetMonthId,
        hours: wholeHours(a.hours),
        createdAt: ts,
        updatedAt: ts,
      });
    }
  }

  if (additions.length === 0) return workspace;
  return { ...workspace, allocations: [...alloc, ...additions] };
}
