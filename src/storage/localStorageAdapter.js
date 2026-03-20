import { STORAGE_KEY } from "../types.js";
import { syncInternAnnatAllocations } from "../domain/internAnnatAllocations.js";
import { wholeHours } from "../domain/hours.js";
import {
  createDefaultWorkspace,
  ensureWorkspaceShape,
  expandMonthsToRollingWindow,
} from "./workspace.js";
import { isSupabaseConfigured } from "./supabaseConfig.js";

const CLIENT_MTIME_KEY = "resurz-workspace-client-mtime-v1";

export function getWorkspaceClientMtime() {
  try {
    return localStorage.getItem(CLIENT_MTIME_KEY);
  } catch {
    return null;
  }
}

export function setWorkspaceClientMtime(iso) {
  try {
    if (iso) localStorage.setItem(CLIENT_MTIME_KEY, String(iso));
  } catch {
    /* ignore */
  }
}

export function loadWorkspace() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    const ws = ensureWorkspaceShape(data);
    if (ws) return ws;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * @param {*} workspace
 * @param {{ clientMtimeIso?: string }} [options] - Om satt (t.ex. remote updated_at), undvik att lokalt verk verkar nyare än molnet.
 */
export function saveWorkspace(workspace, options = {}) {
  try {
    const mtimeIso = options.clientMtimeIso ?? new Date().toISOString();
    localStorage.setItem(CLIENT_MTIME_KEY, mtimeIso);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
  } catch {
    /* ignore quota */
  }
}

/** Månadsfönster + intern drift-slot (ingen disk-I/O). */
export function finalizeWorkspace(ws) {
  let w = ensureWorkspaceShape(ws) ?? createDefaultWorkspace();
  const beforeMonths = JSON.stringify(w.months || []);
  const beforeAlloc = JSON.stringify(w.allocations || []);
  w = expandMonthsToRollingWindow(w);
  const h = wholeHours(w.settings?.standardTimmarInternAnnat ?? 0);
  if (h > 0) {
    w = syncInternAnnatAllocations(w, h);
  }
  const changed =
    JSON.stringify(w.months || []) !== beforeMonths ||
    JSON.stringify(w.allocations || []) !== beforeAlloc;
  return { workspace: w, structureChanged: changed };
}

export function loadOrCreateWorkspace() {
  const base = loadWorkspace() ?? createDefaultWorkspace();
  const { workspace, structureChanged } = finalizeWorkspace(base);
  if (structureChanged) saveWorkspace(workspace);
  return workspace;
}

/**
 * För React-init: expandera/normalisera utan att skriva disk om Supabase ska hydreras.
 * Annars får tom localStorage + saveWorkspace() ett nytt mtime och molndata ignoreras.
 */
export function buildInitialWorkspaceForUi() {
  const base = loadWorkspace() ?? createDefaultWorkspace();
  const { workspace, structureChanged } = finalizeWorkspace(base);
  if (structureChanged && !isSupabaseConfigured()) {
    saveWorkspace(workspace);
  }
  return workspace;
}

export function resetWorkspace() {
  const ws = createDefaultWorkspace();
  saveWorkspace(ws);
  return ws;
}
