import { useState, useRef, useCallback, useEffect, Fragment } from "react";
import { wholeHours, formatHours } from "../domain/hours.js";
import { applyEdgeDelta, clampHoursToFeasible } from "../domain/allocationTrackMath.js";
import { theme } from "../theme.js";

const font = theme.fontMono;

/** Träffyta för skiljestreck (px); själva strecket ritas smalt/mörkt i mitten */
const EDGE_PX = 8;

/** Kundläge: dra person från teamlistan till kolumn. Värde: personId. */
export const CUSTOMER_TRACK_DRAG_MIME = "application/x-resurz-person";

/** Kundläge: släpps på teamlistan = nollställ timmar. JSON { categoryType, refId }. */
export const COLUMN_LEAVE_MIME = "application/x-resurz-column-leave";

/** @deprecated använd COLUMN_LEAVE_MIME */
export const CUSTOMER_LEAVE_MIME = COLUMN_LEAVE_MIME;

/** Kundläge: omordning av personblock i kolumn. Värde: personId. */
export const CUSTOMER_BLOCK_REORDER_MIME = "application/x-resurz-customer-reorder";

/** Personläge: dra kund/projekt/drift från pool. JSON { categoryType, refId }. */
export const ALLOC_REF_DRAG_MIME = "application/x-resurz-alloc-ref";

/** Personläge: släpp block på pool → nolla cell. JSON { personId, allocKey }. */
export const PERSON_ROW_LEAVE_MIME = "application/x-resurz-person-row-leave";

/** Personläge: omordning av entitetsblock på personrad. Värde: allocKey. */
export const PERSON_ROW_BLOCK_REORDER_MIME = "application/x-resurz-person-row-reorder";

/**
 * @param {{
 *   feasibleMax: number,
 *   orderedKeys: string[],
 *   setOrderedKeys: (keys: string[]) => void,
 *   persistOrder: (keys: string[]) => void,
 *   getCellHours: (key: string) => number,
 *   pushHours: (hours: number[]) => void,
 *   maxHoursForKey: (key: string) => number,
 *   visualSpanHours?: number,
 *   blockMeta: (key: string) => { label: string, color: string },
 *   reorderMime: string,
 *   leaveMime?: string,
 *   getLeavePayload?: (draggedKey: string) => string,
 *   poolDropMime?: string,
 *   onPoolDrop?: (payload: string) => void,
 *   allocRefDropMime?: string,
 *   onAllocRefDrop?: (spec: { categoryType: string, refId: string }) => void,
 *   onAfterCommit?: () => void,
 * }} props
 */
export function AllocationHoursTrack({
  feasibleMax,
  orderedKeys,
  setOrderedKeys,
  persistOrder,
  getCellHours,
  pushHours,
  maxHoursForKey,
  visualSpanHours,
  blockMeta,
  reorderMime,
  leaveMime,
  getLeavePayload,
  poolDropMime,
  onPoolDrop,
  allocRefDropMime,
  onAllocRefDrop,
  onAfterCommit,
}) {
  const trackRef = useRef(null);
  const [previewHours, setPreviewHours] = useState(null);
  const previewRef = useRef(null);

  useEffect(() => {
    previewRef.current = previewHours;
  }, [previewHours]);

  const hoursBase = orderedKeys.map((k) => wholeHours(getCellHours(k)));
  const hours = previewHours ?? hoursBase;
  const maxh = orderedKeys.map((k) => maxHoursForKey(k));
  const columnSum = hours.reduce((a, b) => a + b, 0);
  const columnSumWhole = wholeHours(columnSum);
  /** Skala enbart för hur bred spåret ritas — så en konto-post med få timmar inte fyller hela raden bara för att teamets kvarutrymme på cellen är lågt. */
  const spanForBar = Math.max(1, columnSumWhole, wholeHours(visualSpanHours ?? feasibleMax));
  const freeH = Math.max(0, spanForBar - columnSumWhole);
  const freeFlexWeight = freeH;

  const commitHours = useCallback(
    (next) => {
      pushHours(next);
      onAfterCommit?.();
    },
    [pushHours, onAfterCommit]
  );

  const onEdgePointerDown = (edgeIdx, e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;

    const base = orderedKeys.map((k) => wholeHours(getCellHours(k)));
    const maxArr = orderedKeys.map((k) => maxHoursForKey(k));
    const startX = e.clientX;
    const width = rect.width;
    const baseSum = base.reduce((a, b) => a + b, 0);

    const onMove = (ev) => {
      const raw = Math.round(((ev.clientX - startX) / width) * feasibleMax);
      const dH = -raw;
      let next = applyEdgeDelta(base, maxArr, feasibleMax, edgeIdx, dH);
      next = next.map((h, i) => wholeHours(Math.min(h, maxArr[i])));
      let nextSum = next.reduce((a, b) => a + b, 0);
      if (nextSum > feasibleMax) {
        next = clampHoursToFeasible(next, maxArr, feasibleMax);
        nextSum = next.reduce((a, b) => a + b, 0);
      }
      if (wholeHours(baseSum) >= wholeHours(feasibleMax) && nextSum > baseSum + 0.001) {
        next = base.slice();
      }
      previewRef.current = next;
      setPreviewHours(next);
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      const final = previewRef.current ?? base;
      commitHours(final);
      previewRef.current = null;
      setPreviewHours(null);
    };

    previewRef.current = base;
    setPreviewHours(base);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const onDropTrack = (e) => {
    if (poolDropMime && onPoolDrop) {
      const fromSidebar = e.dataTransfer.getData(poolDropMime);
      if (fromSidebar) {
        e.preventDefault();
        e.stopPropagation();
        onPoolDrop(fromSidebar);
        return;
      }
    }
    if (allocRefDropMime && onAllocRefDrop) {
      const raw = e.dataTransfer.getData(allocRefDropMime);
      if (raw) {
        try {
          const o = JSON.parse(raw);
          if (o && typeof o.categoryType === "string" && o.refId != null && String(o.refId) !== "") {
            e.preventDefault();
            e.stopPropagation();
            onAllocRefDrop({ categoryType: o.categoryType, refId: String(o.refId) });
            return;
          }
        } catch {
          /* ignore */
        }
      }
    }
    const reorderId = e.dataTransfer.getData(reorderMime);
    if (reorderId && orderedKeys.includes(reorderId)) {
      e.preventDefault();
      e.stopPropagation();
      const next = orderedKeys.filter((id) => id !== reorderId);
      next.push(reorderId);
      setOrderedKeys(next);
      persistOrder(next);
    }
  };

  const onBlockReorderDragStart = (key, e) => {
    e.stopPropagation();
    e.dataTransfer.setData(reorderMime, key);
    if (leaveMime && getLeavePayload) {
      e.dataTransfer.setData(leaveMime, getLeavePayload(key));
    }
    e.dataTransfer.effectAllowed = "move";
  };

  const reorderOnto = (targetKey, draggedId, placeBefore) => {
    if (!draggedId || draggedId === targetKey) return;
    if (orderedKeys.indexOf(draggedId) < 0 || orderedKeys.indexOf(targetKey) < 0) return;
    const next = orderedKeys.filter((id) => id !== draggedId);
    let ins = next.indexOf(targetKey);
    if (!placeBefore) ins += 1;
    next.splice(ins, 0, draggedId);
    setOrderedKeys(next);
    persistOrder(next);
  };

  const n = orderedKeys.length;

  const dragTypesAllowOver = (types) => {
    const t = Array.from(types);
    if (poolDropMime && onPoolDrop && t.includes(poolDropMime)) return "copy";
    if (allocRefDropMime && onAllocRefDrop && t.includes(allocRefDropMime)) return "copy";
    if (t.includes(reorderMime)) return "move";
    return null;
  };

  const edgeHandle = (edgeIdx) => (
    <div
      key={`e${edgeIdx}`}
      role="separator"
      draggable={false}
      onPointerDown={(e) => onEdgePointerDown(edgeIdx, e)}
      onDragStart={(e) => e.preventDefault()}
      style={{
        width: EDGE_PX,
        flex: `0 0 ${EDGE_PX}px`,
        cursor: "col-resize",
        background:
          "linear-gradient(90deg, transparent 0px, transparent 2px, rgba(5, 3, 12, 0.96) 2px, rgba(5, 3, 12, 0.96) 5px, transparent 5px, transparent 8px)",
        zIndex: 5,
        touchAction: "none",
        position: "relative",
        flexShrink: 0,
      }}
    />
  );

  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        flex: 1,
        minWidth: 0,
      }}
    >
      <div
        onDragOver={(e) => {
          const eff = dragTypesAllowOver(e.dataTransfer.types);
          if (eff) {
            e.preventDefault();
            e.dataTransfer.dropEffect = eff;
          }
        }}
        onDrop={onDropTrack}
        ref={trackRef}
        style={{
          display: "flex",
          alignItems: "stretch",
          flex: 1,
          minWidth: 0,
          minHeight: 40,
          borderRadius: 8,
          overflow: "hidden",
          border: `1px solid ${theme.border}`,
          background: "rgba(18, 14, 28, 0.55)",
        }}
      >
        {n === 0 ? (
          <div
            onDragOver={(e) => {
              const eff = dragTypesAllowOver(e.dataTransfer.types);
              if (eff) {
                e.preventDefault();
                e.dataTransfer.dropEffect = eff;
              }
            }}
            onDrop={onDropTrack}
            style={{ flex: 1, minHeight: 36 }}
          />
        ) : (
          <>
            {edgeHandle(-1)}
            {orderedKeys.map((key, idx) => {
              const h = hours[idx] ?? 0;
              const hv = wholeHours(h);
              const { label, color } = blockMeta(key);

              return (
                <Fragment key={key}>
                  <div
                    draggable
                    onDragStart={(e) => onBlockReorderDragStart(key, e)}
                    title="Dra för att byta ordning"
                    onDragOver={(e) => {
                      if (!Array.from(e.dataTransfer.types).includes(reorderMime)) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDrop={(e) => {
                      const from = e.dataTransfer.getData(reorderMime);
                      if (!from) return;
                      e.preventDefault();
                      e.stopPropagation();
                      reorderOnto(key, from, true);
                    }}
                    style={{
                      flex: hv > 0 ? `${hv} 1 0%` : "0 0 10px",
                      minWidth: hv > 0 ? 0 : 10,
                      background: `linear-gradient(180deg, ${color}cc 0%, ${color}88 100%)`,
                      borderRight: `1px solid rgba(18, 14, 28, 0.35)`,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "center",
                      padding: "4px 6px",
                      cursor: "grab",
                      boxSizing: "border-box",
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        color: "#fff",
                        textShadow: "0 1px 2px rgba(0,0,0,0.45)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {label}
                    </div>
                    <div style={{ fontSize: 10, fontFamily: font, fontWeight: 700, color: "rgba(255,255,255,0.92)" }}>
                      {formatHours(h)} h
                    </div>
                  </div>
                  {edgeHandle(idx)}
                </Fragment>
              );
            })}
            <div
              onDragOver={(e) => {
                const eff = dragTypesAllowOver(e.dataTransfer.types);
                if (eff) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = eff;
                }
              }}
              onDrop={(e) => {
                const eff = dragTypesAllowOver(e.dataTransfer.types);
                if (!eff) return;
                e.preventDefault();
                const from = e.dataTransfer.getData(reorderMime);
                if (from && orderedKeys.includes(from)) {
                  const next = orderedKeys.filter((id) => id !== from);
                  next.push(from);
                  setOrderedKeys(next);
                  persistOrder(next);
                  return;
                }
                onDropTrack(e);
              }}
              style={{
                flex: freeFlexWeight <= 0 ? "0 0 0" : `${freeFlexWeight} 1 0%`,
                minWidth: 0,
                overflow: "hidden",
                background:
                  "repeating-linear-gradient(90deg, transparent, transparent 4px, rgba(255,255,255,0.035) 4px, rgba(255,255,255,0.035) 5px)",
              }}
            />
          </>
        )}
      </div>
    </div>
  );
}
