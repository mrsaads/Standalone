"use client";
import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client for client components (the signup/login/reset forms). Uses the
// public anon key only — never the service-role key.
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are not configured.");
  return createBrowserClient(url, anonKey);
}
