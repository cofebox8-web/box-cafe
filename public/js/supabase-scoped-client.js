import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config.js";

export const isSupabaseConfigured =
  Boolean(SUPABASE_URL) &&
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("YOUR_PROJECT_REF") &&
  SUPABASE_PUBLISHABLE_KEY !== "YOUR_SUPABASE_PUBLISHABLE_KEY";

let createClient =
  (typeof window !== "undefined" ? window.supabase?.createClient : null) ||
  globalThis.supabase?.createClient ||
  null;

if (isSupabaseConfigured && !createClient) {
  try {
    const mod = await Promise.race([
      import("https://esm.sh/@supabase/supabase-js@2"),
      new Promise((_, reject) => setTimeout(() => reject(new Error("CDN timeout")), 2000))
    ]);
    createClient = mod?.createClient || null;
  } catch (error) {
    console.warn("Supabase scoped client factory unavailable:", error?.message || error);
  }
}

// This module loads only the client factory. It creates no default Auth client;
// each page creates exactly the scoped client it needs.
export function createScopedSupabaseClient(storageKey, storage = null, authOptions = {}) {
  if (!isSupabaseConfigured || !createClient) return null;
  try {
    return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey,
        ...(storage ? { storage } : {}),
        ...authOptions
      }
    });
  } catch (error) {
    console.warn("Scoped Supabase initialization error:", error);
    return null;
  }
}
