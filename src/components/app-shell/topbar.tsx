"use client";

import { Menu } from "lucide-react";

import type { SafeAdmin } from "@/contracts/admin/session";
import { BrandMark } from "@/components/app-shell/sidebar";
import { CommandPalette } from "@/components/app-shell/command-palette";
import { LogoutButton } from "@/components/app-shell/logout-button";
import { ShortcutsHelp } from "@/components/app-shell/shortcuts-help";
import { RecentExercisesMenu } from "@/features/content/recent-exercises-menu";

type TopbarProps = Readonly<{
  admin: SafeAdmin;
  isMobileNavOpen: boolean;
  onOpenMobileNav: () => void;
}>;

/**
 * `roleLabel` is display only. No authorization decision reads it.
 */
export function AccountSummary({ admin }: Readonly<{ admin: SafeAdmin }>) {
  return (
    <div className="min-w-0 text-right">
      <p className="truncate text-sm font-medium">{admin.name}</p>
      <p className="truncate text-xs text-muted">{admin.roleLabel}</p>
    </div>
  );
}

export function Topbar({
  admin,
  isMobileNavOpen,
  onOpenMobileNav,
}: TopbarProps) {
  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-border bg-surface px-4 sm:px-6">
      <button
        aria-controls="mobile-navigation"
        aria-expanded={isMobileNavOpen}
        aria-label="Menüyü aç"
        className="-ml-1 inline-flex size-10 items-center justify-center rounded-md text-foreground transition-colors hover:bg-surface-muted md:hidden"
        onClick={onOpenMobileNav}
        type="button"
      >
        <Menu aria-hidden="true" className="size-5" />
      </button>

      <div className="md:hidden">
        <BrandMark />
      </div>

      <CommandPalette admin={admin} />
      <RecentExercisesMenu />
      <ShortcutsHelp />

      <div className="ml-auto flex items-center gap-4">
        <AccountSummary admin={admin} />
        <LogoutButton className="hidden sm:block" />
      </div>
    </header>
  );
}
