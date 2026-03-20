import { createClient } from "@supabase/supabase-js";
import { getSupabaseWorkspaceRowId, isSupabaseConfigured } from "./supabaseConfig.js";

let client = null;

function getClient() {
  if (!isSupabaseConfigured()) return null;
  if (!client) {
    client = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
  }
  return client;
}

/** @returns {Promise<{ payload: unknown, updated_at: string } | null>} */
export async function fetchRemoteWorkspaceRow() {
  const sb = getClient();
  if (!sb) return null;
  const id = getSupabaseWorkspaceRowId();
  const { data, error } = await sb
    .from("resurz_workspace")
    .select("payload, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  let payload = data?.payload;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      return null;
    }
  }
  if (!payload || typeof payload !== "object") return null;
  return { payload, updated_at: data.updated_at };
}

/**
 * @param {unknown} workspace
 * @returns {Promise<{ updated_at: string } | null>}
 */
export async function upsertRemoteWorkspace(workspace) {
  const sb = getClient();
  if (!sb) return null;
  const id = getSupabaseWorkspaceRowId();
  const { error } = await sb.from("resurz_workspace").upsert({ id, payload: workspace }, { onConflict: "id" });
  if (error) throw error;
  const { data: row, error: readErr } = await sb
    .from("resurz_workspace")
    .select("updated_at")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw readErr;
  return row?.updated_at ? { updated_at: row.updated_at } : { updated_at: new Date().toISOString() };
}
