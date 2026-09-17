"use client";

import { useCallback, useState } from "react";

import type { SafeAdmin } from "@/contracts/admin/session";
import { MobileNav } from "@/components/app-shell/mobile-nav";
import { SessionHeartbeat } from "@/components/app-shell/session-heartbeat";
import { Sidebar } from "@/components/app-shell/sidebar";
import { Topbar } from "@/components/app-shell/topbar";

type AppShellProps = Readonly<{
  initialAdmin: SafeAdmin;
  children: React.ReactNode;
}>;

export function AppShell({ initialAdmin, children }: AppShellProps) {
  const [admin, setAdmin] = useState<SafeAdmin>(initialAdmin);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);

  // Keeps the shell in sync when the server layout re-renders with a new
  // snapshot (render-phase adjustment, not an effect).
  const [syncedAdmin, setSyncedAdmin] = useState<SafeAdmin>(initialAdmin);

  if (initialAdmin !== syncedAdmin) {
    setSyncedAdmin(initialAdmin);
    setAdmin(initialAdmin);
  }

  // The heartbeat already carries a fresh SafeAdmin (abilities included), so no
  // extra request and no ability mapping are needed here.
  const handleSessionSuccess = useCallback((nextAdmin: SafeAdmin) => {
    setAdmin(nextAdmin);
  }, []);

  const closeMobileNav = useCallback(() => {
    setIsMobileNavOpen(false);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <SessionHeartbeat onSessionSuccess={handleSessionSuccess} />

      <Sidebar admin={admin} />

      <MobileNav
        admin={admin}
        isOpen={isMobileNavOpen}
        onClose={closeMobileNav}
      />

      <div className="flex min-h-screen flex-col md:pl-60 lg:pl-64">
        <Topbar
          admin={admin}
          isMobileNavOpen={isMobileNavOpen}
          onOpenMobileNav={() => setIsMobileNavOpen(true)}
        />

        <main className="flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
          <div className="mx-auto w-full max-w-[1520px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
