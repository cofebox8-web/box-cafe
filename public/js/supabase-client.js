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

// HTTP LAN previews may expose Web Crypto without the newer randomUUID API.
// Keep request keys and storage paths UUID-shaped in every browser context.
export function generateUuid() {
  const webCrypto = typeof window !== "undefined" ? window.crypto : undefined;
  if (webCrypto && typeof webCrypto.randomUUID === "function") {
    return webCrypto.randomUUID();
  }

  if (webCrypto && typeof webCrypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    webCrypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  const randomHex = () => Math.floor(Math.random() * 0x100000000).toString(16).padStart(8, "0");
  return `${randomHex()}-${randomHex().slice(0, 4)}-4${randomHex().slice(1, 4)}-8${randomHex().slice(1, 4)}-${randomHex()}${randomHex()}`;
}
