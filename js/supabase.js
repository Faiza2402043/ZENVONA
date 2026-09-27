import { supabaseConfig } from "./config.js";

let clientPromise;

export function isSupabaseConfigured() {
  return Boolean(supabaseConfig.url && supabaseConfig.publishableKey);
}

export async function getSupabase() {
  if (!isSupabaseConfigured()) return null;
  clientPromise ??= import("https://esm.sh/@supabase/supabase-js@2").then(({ createClient }) =>
    createClient(supabaseConfig.url, supabaseConfig.publishableKey)
  );
  return clientPromise;
}