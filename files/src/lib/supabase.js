import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL || "";
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

export const isSupabaseConfigured = Boolean(url && anonKey);

export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

/** Lightweight connectivity check — never throws secrets. */
export async function verifySupabaseConnection() {
  if (!supabase) return { ok: false, reason: "not_configured" };
  try {
    const { error } = await supabase.auth.getSession();
    if (error) return { ok: false, reason: "auth_error" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "network_error" };
  }
}
