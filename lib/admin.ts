import type { User } from "@supabase/supabase-js";

import { createClient as createServerSupabase } from "@/lib/supabase/server";

export function isAdmin(userId: string | undefined | null): boolean {
  const adminIds = (process.env.ADMIN_USER_IDS ?? "").split(",").map((id) => id.trim());
  return !!userId && adminIds.includes(userId);
}

export async function verifyAdmin(): Promise<User | null> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id || !isAdmin(user.id)) return null;
  return user;
}
