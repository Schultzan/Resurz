/** @typedef {'planned' | 'locked' | 'archived'} MonthStatus */
/** @typedef {'customer' | 'internalProject' | 'internalDrift'} CategoryType */

/**
 * Standardinnehåll vid ny workspace / migration av äldre data (samma id:n behåller befintliga allokeringar).
 * @type {{ id: string, name: string }[]}
 */
export const LEGACY_DRIFT_CATEGORY_SEED = [
  { id: "drift-salj", name: "Sälj" },
  { id: "drift-ai", name: "AI" },
  { id: "drift-admin", name: "Administration" },
  { id: "drift-ops", name: "Operations" },
  { id: "drift-annat", name: "Annat" },
];

export const STORAGE_KEY = "resurz-workspace-v1";
export const SCHEMA_VERSION = 2;

/** Allocation warning buckets (person) */
export const PERSON_ALLOC_UNDER = 0.9;
export const PERSON_ALLOC_OVER = 1.0;
