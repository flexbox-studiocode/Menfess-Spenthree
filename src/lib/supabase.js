import { createClient } from "@supabase/supabase-js";
import { readSupabaseConfig } from "./supabaseConfig.js";
export { isPublicSupabaseKey, readSupabaseConfig } from "./supabaseConfig.js";

let client;

// No connection/config check at startup: placeholder routes work without an .env file.
export function getSupabaseClient() {
  if (!client) {
    const { url, key } = readSupabaseConfig();
    client = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}
