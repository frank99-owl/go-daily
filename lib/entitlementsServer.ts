import type { User } from "@supabase/supabase-js";

import { createServiceClient } from "@/lib/supabase/service";

import { getViewerPlan, type ViewerPlan } from "./entitlements";

type ServiceClient = ReturnType<typeof createServiceClient>;

/**
 * Server-side plan resolution that also checks manual_grants.
 * Use this in API routes and server components instead of getViewerPlan.
 */
export async function resolveViewerPlan({
  user,
  subscriptionStatus,
  email,
  admin,
}: {
  user: Pick<User, "id"> | null;
  subscriptionStatus: string | null | undefined;
  email?: string | null;
  admin?: ServiceClient;
}): Promise<ViewerPlan> {
  const basePlan = getViewerPlan({ user, subscriptionStatus });
  if (basePlan === "pro") return "pro";
  if (!user || !email) return basePlan;

  try {
    const serviceClient = admin ?? createServiceClient();
    const { data } = await serviceClient
      .from("manual_grants")
      .select("expires_at")
      .eq("email", email.toLowerCase())
      .maybeSingle();

    if (data && new Date(data.expires_at) > new Date()) {
      return "pro";
    }
  } catch {
    // If the query fails, fall back to the base plan.
  }

  return basePlan;
}
