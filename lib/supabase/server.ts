import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

// Server-side Supabase client for Server Components, Route Handlers, and Server Actions. Reads
// and writes the auth cookies through Next's cookie store so the session survives across
// requests without any custom token handling.
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) throw new Error("SUPABASE_URL / SUPABASE_ANON_KEY are not configured.");

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component with no response to attach cookies to — the
          // middleware below is what actually refreshes the session in that case.
        }
      },
    },
  });
}

// A privileged client using the service-role key, for server-only operations that must bypass
// row-level security (admin endpoints, background jobs). Never import this into anything that
// could run in a client bundle.
export function createSupabaseServiceClient() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not configured.");
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}
