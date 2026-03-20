import { useState, useEffect, useCallback, useRef } from "react";
import {
  loadOrCreateWorkspace,
  saveWorkspace,
  loadWorkspace,
  finalizeWorkspace,
  getWorkspaceClientMtime,
  setWorkspaceClientMtime,
} from "../storage/localStorageAdapter.js";
import {
  defaultMonthId,
  ensureMonth,
  addCalendarMonths,
  ensureWorkspaceShape,
  createDefaultWorkspace,
} from "../storage/workspace.js";
import { fetchRemoteWorkspaceRow, upsertRemoteWorkspace } from "../storage/supabaseAdapter.js";
import { isSupabaseConfigured } from "../storage/supabaseConfig.js";
import { carryForwardFromPreviousMonth } from "../domain/monthCarryOver.js";
import { customerCellBudgetLimit } from "../domain/calculations.js";
import {
  ensureInternAnnatForPerson,
  reapplyInternAnnatForPersonMonth,
  syncInternAnnatAllocations,
} from "../domain/internAnnatAllocations.js";
import { pickNextEntityColor, normalizeHex } from "../domain/entityColors.js";
import { wholeHours } from "../domain/hours.js";

function newId() {
  return crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

function initialWorkspaceBundle() {
  const ws = loadOrCreateWorkspace();
  const cal = defaultMonthId();
  const monthId = ws.months.some((m) => m.id === cal) ? cal : ws.months[0]?.id ?? cal;
  return { ws, monthId };
}

let workspaceInitialBundle = null;
function getWorkspaceInitialBundle() {
  if (workspaceInitialBundle == null) {
    workspaceInitialBundle = initialWorkspaceBundle();
  }
  return workspaceInitialBundle;
}

export function useWorkspace() {
  const [workspace, setWorkspaceState] = useState(() => getWorkspaceInitialBundle().ws);
  const [selectedMonthId, setSelectedMonthIdState] = useState(() => getWorkspaceInitialBundle().monthId);
  const [syncStatus, setSyncStatus] = useState(() => (isSupabaseConfigured() ? "loading" : "offline"));
  const [syncError, setSyncError] = useState(null);

  const saveTimer = useRef(null);
  const persist = useCallback((updater) => {
    setWorkspaceState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveWorkspace(next);
        if (!isSupabaseConfigured()) return;
        upsertRemoteWorkspace(next)
          .then((row) => {
            if (row?.updated_at) setWorkspaceClientMtime(row.updated_at);
            setSyncStatus("synced");
            setSyncError(null);
          })
          .catch((err) => {
            setSyncStatus("error");
            setSyncError(err?.message || "Kunde inte spara i molnet");
          });
      }, 300);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let cancelled = false;
    (async () => {
      setSyncStatus("loading");
      setSyncError(null);
      try {
        const remote = await fetchRemoteWorkspaceRow();
        const localRaw = loadWorkspace();
        const localMtime = getWorkspaceClientMtime();
        const localTime = localMtime ? new Date(localMtime).getTime() : 0;

        let chosenRaw;
        let clientMtimeIso = null;
        let needsPush = false;

        if (remote) {
          const remoteTime = new Date(remote.updated_at).getTime();
          if (localRaw && localTime > remoteTime) {
            chosenRaw = localRaw;
            needsPush = true;
          } else {
            chosenRaw = remote.payload;
            clientMtimeIso = remote.updated_at;
          }
        } else {
          chosenRaw = localRaw ?? createDefaultWorkspace();
          needsPush = true;
        }

        const shaped = ensureWorkspaceShape(chosenRaw) ?? createDefaultWorkspace();
        const { workspace: merged } = finalizeWorkspace(shaped);
        if (cancelled) return;

        setWorkspaceState(merged);
        setSelectedMonthIdState((prev) => {
          const cal = defaultMonthId();
          if (merged.months.some((m) => m.id === cal)) return cal;
          if (merged.months.some((m) => m.id === prev)) return prev;
          return merged.months[0]?.id ?? prev;
        });

        if (clientMtimeIso) {
          saveWorkspace(merged, { clientMtimeIso });
        } else {
          saveWorkspace(merged);
        }

        if (needsPush) {
          const row = await upsertRemoteWorkspace(merged);
          if (cancelled) return;
          if (row?.updated_at) setWorkspaceClientMtime(row.updated_at);
        }

        if (!cancelled) {
          setSyncStatus("synced");
          setSyncError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setSyncStatus("error");
          setSyncError(err?.message || "Kunde inte läsa från molnet");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const setSelectedMonthId = useCallback((monthId) => {
    persist((prev) => {
      let next = ensureMonth(prev, monthId);
      next = carryForwardFromPreviousMonth(next, monthId);
      return next;
    });
    setSelectedMonthIdState(monthId);
  }, [persist]);

  const shiftMonth = useCallback(
    (delta) => {
      setSelectedMonthId(addCalendarMonths(selectedMonthId, delta));
    },
    [selectedMonthId, setSelectedMonthId]
  );

  const upsertHours = useCallback(
    (personId, categoryType, refId, hoursRaw) => {
      persist((prev) => {
        const monthId = selectedMonthId;
        let h = wholeHours(hoursRaw);
        if (categoryType === "customer") {
          const lim = customerCellBudgetLimit(prev, monthId, personId, refId);
          if (lim.isCapped && Number.isFinite(lim.maxForThisPerson)) {
            h = Math.min(h, lim.maxForThisPerson);
          }
        }
        const idx = prev.allocations.findIndex(
          (a) =>
            a.monthId === monthId &&
            a.personId === personId &&
            a.categoryType === categoryType &&
            a.refId === refId
        );
        let allocations = prev.allocations;
        if (h === 0) {
          if (idx >= 0) {
            allocations = allocations.filter((_, i) => i !== idx);
          }
        } else if (idx >= 0) {
          allocations = allocations.map((a, i) =>
            i === idx ? { ...a, hours: h, updatedAt: nowIso() } : a
          );
        } else {
          allocations = [
            ...allocations,
            {
              id: newId(),
              monthId,
              personId,
              categoryType,
              refId,
              hours: h,
              createdAt: nowIso(),
              updatedAt: nowIso(),
            },
          ];
        }
        return { ...prev, allocations };
      });
    },
    [persist, selectedMonthId]
  );

  const clearPersonAllocationsForMonth = useCallback(
    (personId) => {
      persist((prev) => {
        let next = {
          ...prev,
          allocations: prev.allocations.filter(
            (a) => !(a.monthId === selectedMonthId && a.personId === personId)
          ),
        };
        next = reapplyInternAnnatForPersonMonth(next, personId, selectedMonthId);
        return next;
      });
    },
    [persist, selectedMonthId]
  );

  const getCellHours = useCallback(
    (personId, categoryType, refId) => {
      const a = workspace.allocations.find(
        (x) =>
          x.monthId === selectedMonthId &&
          x.personId === personId &&
          x.categoryType === categoryType &&
          x.refId === refId
      );
      return a ? wholeHours(a.hours) : 0;
    },
    [workspace.allocations, selectedMonthId]
  );

  const updateSettings = useCallback(
    (patch) => {
      persist((prev) => {
        const settings = { ...prev.settings, ...patch };
        if (Object.prototype.hasOwnProperty.call(patch, "standardTimmarInternAnnat")) {
          settings.standardTimmarInternAnnat = wholeHours(patch.standardTimmarInternAnnat);
        }
        if (Object.prototype.hasOwnProperty.call(patch, "internAnnatDriftCategoryId")) {
          const id = patch.internAnnatDriftCategoryId;
          const cats = prev.driftCategories || [];
          if (id && cats.some((d) => d.id === id)) {
            settings.internAnnatDriftCategoryId = id;
          } else if (id === null || id === "") {
            settings.internAnnatDriftCategoryId =
              cats.find((d) => d.id === "drift-annat")?.id ?? cats[0]?.id ?? null;
          }
        }
        for (const key of ["manadskostnadLoner", "manadskostnadOvrigt"]) {
          if (Object.prototype.hasOwnProperty.call(patch, key)) {
            const n = Number(patch[key]);
            settings[key] = Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
          }
        }
        let next = { ...prev, settings };
        const reapplyAnnat =
          Object.prototype.hasOwnProperty.call(patch, "standardTimmarInternAnnat") ||
          Object.prototype.hasOwnProperty.call(patch, "internAnnatDriftCategoryId");
        if (reapplyAnnat) {
          next = syncInternAnnatAllocations(next, settings.standardTimmarInternAnnat ?? 0);
        }
        return next;
      });
    },
    [persist]
  );

  const addPerson = useCallback(
    (payload) => {
      const { name, kapacitetPerManad, malFakturerbaraTimmar, roles = [] } = payload;
      persist((prev) => {
        const pid = newId();
        let next = {
          ...prev,
          people: [
            ...prev.people,
            {
              id: pid,
              name: name.trim(),
              kapacitetPerManad,
              malFakturerbaraTimmar,
              active: true,
              comment: "",
              roles: [...roles],
              departmentId: payload.departmentId ?? null,
            },
          ],
        };
        const h = Number(next.settings?.standardTimmarInternAnnat) || 0;
        if (h > 0) {
          next = ensureInternAnnatForPerson(next, pid, h);
        }
        return next;
      });
    },
    [persist]
  );

  const updatePerson = useCallback(
    (id, patch) => {
      persist((prev) => ({
        ...prev,
        people: prev.people.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      }));
    },
    [persist]
  );

  const removePerson = useCallback(
    (id) => {
      persist((prev) => ({
        ...prev,
        people: prev.people.filter((p) => p.id !== id),
        allocations: prev.allocations.filter((a) => a.personId !== id),
      }));
    },
    [persist]
  );

  const addCustomer = useCallback(
    (payload) => {
      persist((prev) => {
        const fromPayload = payload.color ? normalizeHex(payload.color) : "";
        const color = fromPayload || pickNextEntityColor(prev);
        return {
          ...prev,
          customers: [
            ...prev.customers,
            {
              id: newId(),
              name: payload.name.trim(),
              timpris: Math.max(0, Number(payload.timpris) || 0),
              budgetPerManad: Math.max(0, Number(payload.budgetPerManad) || 0),
              active: true,
              comment: payload.comment ?? "",
              color,
            },
          ],
        };
      });
    },
    [persist]
  );

  const updateCustomer = useCallback(
    (id, patch) => {
      const p2 = { ...patch };
      if (Object.prototype.hasOwnProperty.call(patch, "color")) {
        const n = normalizeHex(patch.color);
        if (n) p2.color = n;
        else delete p2.color;
      }
      persist((prev) => ({
        ...prev,
        customers: prev.customers.map((c) => (c.id === id ? { ...c, ...p2 } : c)),
      }));
    },
    [persist]
  );

  const removeCustomer = useCallback(
    (id) => {
      persist((prev) => ({
        ...prev,
        customers: prev.customers.filter((c) => c.id !== id),
        allocations: prev.allocations.filter(
          (a) => !(a.categoryType === "customer" && a.refId === id)
        ),
      }));
    },
    [persist]
  );

  const addInternalProject = useCallback(
    (payload) => {
      persist((prev) => ({
        ...prev,
        internalProjects: [
          ...prev.internalProjects,
          {
            id: newId(),
            name: payload.name.trim(),
            budgetPerManad:
              payload.budgetPerManad === "" || payload.budgetPerManad == null
                ? null
                : Math.max(0, Number(payload.budgetPerManad)),
            malTimmar:
              payload.malTimmar === "" || payload.malTimmar == null
                ? null
                : wholeHours(payload.malTimmar),
            active: true,
            comment: payload.comment ?? "",
            color:
              (payload.color && normalizeHex(payload.color)) || pickNextEntityColor(prev),
          },
        ],
      }));
    },
    [persist]
  );

  const updateInternalProject = useCallback(
    (id, patch) => {
      const p2 = { ...patch };
      if (Object.prototype.hasOwnProperty.call(patch, "color")) {
        const n = normalizeHex(patch.color);
        if (n) p2.color = n;
        else delete p2.color;
      }
      if (Object.prototype.hasOwnProperty.call(patch, "malTimmar")) {
        const m = patch.malTimmar;
        p2.malTimmar = m === "" || m == null ? null : wholeHours(m);
      }
      persist((prev) => ({
        ...prev,
        internalProjects: prev.internalProjects.map((p) =>
          p.id === id ? { ...p, ...p2 } : p
        ),
      }));
    },
    [persist]
  );

  const removeInternalProject = useCallback(
    (id) => {
      persist((prev) => ({
        ...prev,
        internalProjects: prev.internalProjects.filter((p) => p.id !== id),
        allocations: prev.allocations.filter(
          (a) => !(a.categoryType === "internalProject" && a.refId === id)
        ),
      }));
    },
    [persist]
  );

  const addDepartment = useCallback((payload) => {
    persist((prev) => {
      const list = prev.departments || [];
      const fromPayload = payload.color ? normalizeHex(payload.color) : "";
      const color = fromPayload || pickNextEntityColor(prev);
      return {
        ...prev,
        departments: [...list, { id: newId(), name: payload.name.trim(), color }],
      };
    });
  }, [persist]);

  const updateDepartment = useCallback((id, patch) => {
    persist((prev) => ({
      ...prev,
      departments: (prev.departments || []).map((d) => {
        if (d.id !== id) return d;
        const next = { ...d, ...patch };
        if (patch.name != null) next.name = String(patch.name).trim();
        if (patch.color != null) {
          const n = normalizeHex(patch.color);
          if (n) next.color = n;
        }
        return next;
      }),
    }));
  }, [persist]);

  const removeDepartment = useCallback((id) => {
    persist((prev) => ({
      ...prev,
      departments: (prev.departments || []).filter((d) => d.id !== id),
      people: prev.people.map((p) =>
        p.departmentId === id ? { ...p, departmentId: null } : p
      ),
    }));
  }, [persist]);

  const addDriftCategory = useCallback(
    (payload) => {
      persist((prev) => {
        const fromPayload = payload.color ? normalizeHex(payload.color) : "";
        const color = fromPayload || pickNextEntityColor(prev);
        return {
          ...prev,
          driftCategories: [
            ...(prev.driftCategories || []),
            {
              id: newId(),
              name: payload.name.trim(),
              color,
            },
          ],
        };
      });
    },
    [persist]
  );

  const updateDriftCategory = useCallback(
    (id, patch) => {
      const p2 = { ...patch };
      if (Object.prototype.hasOwnProperty.call(patch, "color")) {
        const n = normalizeHex(patch.color);
        if (n) p2.color = n;
        else delete p2.color;
      }
      persist((prev) => ({
        ...prev,
        driftCategories: (prev.driftCategories || []).map((d) => {
          if (d.id !== id) return d;
          const next = { ...d, ...p2 };
          if (patch.name != null) next.name = String(patch.name).trim();
          return next;
        }),
      }));
    },
    [persist]
  );

  const removeDriftCategory = useCallback(
    (id) => {
      persist((prev) => {
        const driftCategories = (prev.driftCategories || []).filter((d) => d.id !== id);
        let allocations = prev.allocations.filter(
          (a) => !(a.categoryType === "internalDrift" && a.refId === id)
        );
        let settings = { ...prev.settings };
        if (settings.internAnnatDriftCategoryId === id) {
          settings.internAnnatDriftCategoryId =
            driftCategories.find((d) => d.id === "drift-annat")?.id ??
            driftCategories[0]?.id ??
            null;
        }
        let next = {
          ...prev,
          driftCategories,
          allocations,
          settings,
        };
        const h = wholeHours(settings.standardTimmarInternAnnat);
        if (h > 0) {
          next = syncInternAnnatAllocations(next, h);
        }
        return next;
      });
    },
    [persist]
  );

  return {
    workspace,
    selectedMonthId,
    setSelectedMonthId,
    shiftMonth,
    syncStatus,
    syncError,
    upsertHours,
    clearPersonAllocationsForMonth,
    getCellHours,
    updateSettings,
    addPerson,
    updatePerson,
    removePerson,
    addCustomer,
    updateCustomer,
    removeCustomer,
    addInternalProject,
    updateInternalProject,
    removeInternalProject,
    addDepartment,
    updateDepartment,
    removeDepartment,
    addDriftCategory,
    updateDriftCategory,
    removeDriftCategory,
  };
}
