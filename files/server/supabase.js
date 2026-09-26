import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Load KEY=VALUE pairs from a .env file into process.env (no overwrite). */
export function loadEnvFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return;
    const text = fs.readFileSync(filePath, "utf8");
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = val;
    }
  } catch {
    // ignore missing/unreadable env
  }
}

loadEnvFile(path.join(__dirname, ".env"));
loadEnvFile(path.join(__dirname, "..", ".env"));

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";

export const isSupabaseConfigured = Boolean(url && (serviceKey || anonKey));

export const supabaseAdmin =
  url && serviceKey
    ? createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

export const supabaseAnon =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;

/** Connectivity probe — returns status only, never secrets. */
export async function verifySupabaseAdmin() {
  if (!supabaseAdmin) return { ok: false, reason: "not_configured" };
  try {
    const { error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) return { ok: false, reason: "auth_admin_error" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "network_error" };
  }
}

/** Create/confirm an Auth user for Capitol accounts. Never throws. */
export async function ensureSupabaseAuthUser({ email, password, metadata = {} }) {
  if (!supabaseAdmin || !email || !password) return { ok: false };
  try {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: String(email).trim().toLowerCase(),
      password: String(password),
      email_confirm: true,
      user_metadata: metadata,
    });
    if (!error && data?.user?.id) return { ok: true, id: data.user.id };

    // Already exists — locate and refresh password so client sign-in works.
    const listed = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = (listed.data?.users || []).find(
      (u) => (u.email || "").toLowerCase() === String(email).trim().toLowerCase()
    );
    if (!existing) return { ok: false, reason: error?.message || "create_failed" };

    const { data: updated, error: updErr } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
      password: String(password),
      email_confirm: true,
      user_metadata: { ...(existing.user_metadata || {}), ...metadata },
    });
    if (updErr) return { ok: false, reason: updErr.message };
    return { ok: true, id: updated?.user?.id || existing.id };
  } catch {
    return { ok: false, reason: "network_error" };
  }
}
