import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config.js";

export const isSupabaseConfigured =
  Boolean(SUPABASE_URL) &&
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("YOUR_PROJECT_REF") &&
  SUPABASE_PUBLISHABLE_KEY !== "YOUR_SUPABASE_PUBLISHABLE_KEY";

let supabaseClient = null;

if (isSupabaseConfigured) {
  try {
    let createClient = (typeof window !== "undefined" ? window.supabase?.createClient : null) || globalThis.supabase?.createClient;
    if (!createClient) {
      try {
        const mod = await Promise.race([
          import("https://esm.sh/@supabase/supabase-js@2"),
          new Promise((_, reject) => setTimeout(() => reject(new Error("CDN timeout")), 2000))
        ]);
        createClient = mod?.createClient;
      } catch (importErr) {
        console.warn("Remote CDN fallback skipped:", importErr.message);
      }
    }
    if (createClient) {
      supabaseClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      });
    }
  } catch (err) {
    console.warn("Supabase initialization error:", err);
  }
}

export const supabase = supabaseClient;

export function requireSupabase() {
  if (!supabase) {
    throw new Error("Configure SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in js/config.js first.");
  }

  return supabase;
}
