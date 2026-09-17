import { AppShell } from "@/components/app-shell/app-shell";
import { requireCurrentAdmin } from "@/lib/session/current";

/**
 * Authenticated bootstrap only: it reads the local encrypted session snapshot.
 * No backend fetch, no `/me` call, no cookie refresh — SessionHeartbeat and
 * `/api/session/me` own that lifecycle.
 */
export default async function PanelLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const admin = await requireCurrentAdmin();

  return <AppShell initialAdmin={admin}>{children}</AppShell>;
}
