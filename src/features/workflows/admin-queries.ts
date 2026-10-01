import type { AdminAccountsData } from "@/contracts/admin/workflows";
import { getAdminAccounts } from "@/features/workflows/workflow-client";

export const ADMIN_ACCOUNTS_QUERY_KEY = ["admins"] as const;

/**
 * The admin list (`GET /admins`). The accounts screen and the security view
 * read the same entry, so switching between them costs no request and a
 * change on one refreshes both.
 */
export function adminAccountsQueryOptions() {
  return {
    queryKey: ADMIN_ACCOUNTS_QUERY_KEY,
    queryFn: (): Promise<AdminAccountsData> => getAdminAccounts(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  };
}
