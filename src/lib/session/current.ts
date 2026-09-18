import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { SafeAdmin } from "@/contracts/admin/session";
import { sessionCookiePolicy } from "@/lib/session/config";
import { unsealAdminSession } from "@/lib/session/read";

/**
 * Reads the local encrypted session snapshot. This is authenticated-layout
 * bootstrap only: it performs no backend request, no `/me` call and no cookie
 * refresh — that lifecycle belongs to SessionHeartbeat and `/api/session/me`.
 *
 * Only the `SafeAdmin` snapshot is returned, so the backend token and the
 * session timestamps never leave the server.
 */
export async function getCurrentAdmin(): Promise<SafeAdmin | null> {
  const seal = (await cookies()).get(sessionCookiePolicy.name)?.value ?? null;

  if (seal === null) {
    return null;
  }

  try {
    return (await unsealAdminSession(seal))?.admin ?? null;
  } catch {
    return null;
  }
}

export async function requireCurrentAdmin(): Promise<SafeAdmin> {
  const admin = await getCurrentAdmin();

  if (admin === null) {
    redirect("/login");
  }

  return admin;
}
