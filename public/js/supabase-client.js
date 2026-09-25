import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config.js";

export const isSupabaseConfigured =
  Boolean(SUPABASE_URL) &&
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("YOUR_PROJECT_REF") &&
  SUPABASE_PUBLISHABLE_KEY !== "YOUR_SUPABASE_PUBLISHABLE_KEY";

let supabaseClient = null;

if (isSupabaseConfigured) {
  try {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  } catch (err) {
    console.warn("Supabase CDN unavailable, falling back to local mode:", err);
  }
}

export const supabase = supabaseClient;

export function requireSupabase() {
  if (!supabase) {
    throw new Error("Configure SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in js/config.js first.");
  }

  return supabase;
}
