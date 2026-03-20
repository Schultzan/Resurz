export function isSupabaseConfigured() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return Boolean(url && key && String(url).trim() && String(key).trim());
}

export function getSupabaseWorkspaceRowId() {
  const id = import.meta.env.VITE_SUPABASE_WORKSPACE_ID;
  return (id && String(id).trim()) || "default";
}
