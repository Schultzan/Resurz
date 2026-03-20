/**
 * Normaliserad hex (#rrggbb) för jämförelse och lagring.
 */
export function normalizeHex(raw) {
  if (raw == null || typeof raw !== "string") return "";
  let h = raw.trim();
  if (!h) return "";
  if (h.startsWith("#")) h = h.slice(1);
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return "";
  return `#${h.toLowerCase()}`;
}

function hslToHex(h, sPct, lPct) {
  const s = sPct / 100;
  const l = lPct / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (h < 60) {
    rp = c;
    gp = x;
  } else if (h < 120) {
    rp = x;
    gp = c;
  } else if (h < 180) {
    gp = c;
    bp = x;
  } else if (h < 240) {
    gp = x;
    bp = c;
  } else if (h < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }
  const toHex = (n) => Math.round((n + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(rp)}${toHex(gp)}${toHex(bp)}`;
}

/** Tydligt åtskilda nyanser (guldvinkel + varierad ljushet/mättnad). */
export const ENTITY_COLOR_PALETTE = (() => {
  const out = [];
  const seeds = [
    "#2563eb",
    "#dc2626",
    "#059669",
    "#d97706",
    "#7c3aed",
    "#e11d48",
    "#0891b2",
    "#ca8a04",
    "#4f46e5",
    "#ea580c",
    "#0d9488",
    "#be185d",
    "#65a30d",
    "#c026d3",
    "#0284c7",
    "#b45309",
    "#6366f1",
    "#15803d",
    "#db2777",
    "#0e7490",
    "#a16207",
    "#7e22ce",
    "#b91c1c",
    "#047857",
  ];
  out.push(...seeds);
  for (let i = 0; i < 40; i++) {
    const h = (i * 137.508) % 360;
    const s = 58 + (i % 4) * 7;
    const l = 44 + (i % 5) * 5;
    out.push(hslToHex(h, s, l));
  }
  return out;
})();

export function usedEntityColors(workspace) {
  const set = new Set();
  for (const d of workspace.departments || []) {
    const x = normalizeHex(d.color);
    if (x) set.add(x);
  }
  for (const c of workspace.customers || []) {
    const x = normalizeHex(c.color);
    if (x) set.add(x);
  }
  for (const p of workspace.internalProjects || []) {
    const x = normalizeHex(p.color);
    if (x) set.add(x);
  }
  for (const d of workspace.driftCategories || []) {
    const x = normalizeHex(d.color);
    if (x) set.add(x);
  }
  return set;
}

/**
 * Första palettfärg som inte redan används på avdelning/kund/projekt/drift.
 */
export function pickNextEntityColor(workspace) {
  const used = usedEntityColors(workspace);
  for (const col of ENTITY_COLOR_PALETTE) {
    const n = normalizeHex(col);
    if (n && !used.has(n)) return n;
  }
  let i = 0;
  while (i < 500) {
    const h = (i * 47 + 19) % 360;
    const cand = hslToHex(h, 60, 50);
    const n = normalizeHex(cand);
    if (n && !used.has(n)) return n;
    i++;
  }
  return normalizeHex(ENTITY_COLOR_PALETTE[0]);
}
