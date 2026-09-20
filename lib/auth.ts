import { createSupabaseServerClient } from "./supabase/server";
import { getDb } from "@/db";
import { profiles } from "@/db/schema";
import { eq } from "drizzle-orm";

export type AppUser = {
  id: string; // Supabase auth.users.id
  email: string;
  fullName: string;
  mobile: string;
  upworkLink: string;
  role: "base" | "admin";
};

function isAdminEmail(email: string): boolean {
  const admins = (process.env.ADMIN_EMAILS || "").split(",").map(v => v.trim().toLowerCase()).filter(Boolean);
  return admins.includes(email.toLowerCase());
}

// Replaces app/chatgpt-auth.ts's getChatGPTUser(): resolves the signed-in customer from the
// Supabase session (not a platform-injected header) plus their extended profile row. Returns null
// when signed out, exactly like the function it replaces, so call sites don't need to change their
// null-check shape.
export async function getCurrentUser(): Promise<AppUser | null> {
  const supabase = await createSupabaseServerClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user || !user.email) return null;

  const db = getDb();
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, user.id)).limit(1);

  const admin = isAdminEmail(user.email) || profile?.role === "admin";
  return {
    id: user.id,
    email: user.email,
    fullName: profile?.fullName || (user.user_metadata?.full_name as string | undefined) || "",
    mobile: profile?.mobile || "",
    upworkLink: profile?.upworkLink || "",
    role: admin ? "admin" : "base",
  };
}

export async function requireCurrentUser(): Promise<AppUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthRequiredError();
  return user;
}

export class AuthRequiredError extends Error {
  constructor() {
    super("Sign in required.");
    this.name = "AuthRequiredError";
  }
}
