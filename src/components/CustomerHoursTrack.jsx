import { maxHoursPersonOnCategoryCell } from "../domain/customerColumnRedistribute.js";
import { getPersonUiColorFromList } from "../domain/entityColors.js";
import {
  AllocationHoursTrack,
  CUSTOMER_TRACK_DRAG_MIME,
  COLUMN_LEAVE_MIME,
  CUSTOMER_LEAVE_MIME,
  CUSTOMER_BLOCK_REORDER_MIME,
} from "./AllocationHoursTrack.jsx";

export {
  CUSTOMER_TRACK_DRAG_MIME,
  COLUMN_LEAVE_MIME,
  CUSTOMER_LEAVE_MIME,
  CUSTOMER_BLOCK_REORDER_MIME,
};

function personColor(activePeople, personId) {
  return getPersonUiColorFromList(activePeople, personId);
}

function personName(activePeople, personId) {
  return activePeople.find((p) => p.id === personId)?.name ?? personId;
}

/**
 * @param {{
 *   categoryType: "customer"|"internalProject"|"internalDrift",
 *   refId: string,
 *   workspace: object,
 *   monthId: string,
 *   feasibleMax: number,
 *   visualSpanHours?: number,
 *   orderedPersonIds: string[],
 *   setOrderedPersonIds: (ids: string[]) => void,
 *   persistOrder: (ids: string[]) => void,
 *   getCellHours: (personId: string, categoryType: string, refId: string) => number,
 *   upsertHours: (personId: string, categoryType: string, refId: string, hours: number) => void,
 *   activePeople: { id: string, name: string }[],
 *   onDropPerson: (personId: string) => void,
 *   onBlockTransfer?: (source: { personId: string, categoryType: string, refId: string, hours: number }, target: { personId: string, categoryType: string, refId: string }) => void,
 * }} props
 */
export function CustomerHoursTrack({
  categoryType,
  refId,
  workspace,
  monthId,
  feasibleMax,
  visualSpanHours,
  orderedPersonIds,
  setOrderedPersonIds,
  persistOrder,
  getCellHours,
  upsertHours,
  activePeople,
  onDropPerson,
  onBlockTransfer,
}) {
  const pushHours = (next) => {
    orderedPersonIds.forEach((pid, i) => {
      upsertHours(pid, categoryType, refId, next[i] ?? 0);
    });
  };

  return (
    <AllocationHoursTrack
      feasibleMax={feasibleMax}
      visualSpanHours={visualSpanHours}
      orderedKeys={orderedPersonIds}
      setOrderedKeys={setOrderedPersonIds}
      persistOrder={persistOrder}
      getCellHours={(pid) => getCellHours(pid, categoryType, refId)}
      pushHours={pushHours}
      maxHoursForKey={(pid) => maxHoursPersonOnCategoryCell(workspace, monthId, categoryType, refId, pid)}
      blockMeta={(pid) => ({
        label: personName(activePeople, pid),
        color: personColor(activePeople, pid),
      })}
      reorderMime={CUSTOMER_BLOCK_REORDER_MIME}
      leaveMime={COLUMN_LEAVE_MIME}
      getLeavePayload={() => JSON.stringify({ categoryType, refId })}
      poolDropMime={CUSTOMER_TRACK_DRAG_MIME}
      onPoolDrop={(pid) => {
        if (pid && activePeople.some((p) => p.id === pid)) onDropPerson(pid);
      }}
      blockTransferContext={onBlockTransfer ? { kind: "customer", categoryType, refId } : undefined}
      onBlockTransfer={onBlockTransfer}
    />
  );
}
