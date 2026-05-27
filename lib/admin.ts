import type { User } from "@supabase/supabase-js";

import { createClient as createServerSupabase } from "@/lib/supabase/server";

/**
 * Check if a user is an admin by user ID (ADMIN_USER_IDS) or email (ADMIN_EMAILS).
 * Either match grants admin access.
 */
export function isAdmin(userId: string | undefined | null, email?: string | null): boolean {
  const adminIds = (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (userId && adminIds.includes(userId)) return true;

  if (email) {
    const adminEmails = (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (adminEmails.includes(email.toLowerCase())) return true;
  }

  return false;
}

export async function verifyAdmin(): Promise<User | null> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id || !isAdmin(user.id, user.email)) return null;
  return user;
}
