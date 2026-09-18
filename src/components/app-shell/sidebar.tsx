"use client";

import { Circle, Home, Library, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import type { SafeAdmin } from "@/contracts/admin/session";
import {
  adminNavigation,
  filterNavigation,
  type NavigationItem,
} from "@/lib/authz/navigation";

/**
 * Icons live in the shell, not in the navigation registry, so the authz layer
 * stays free of UI dependencies.
 */
const navigationIcons: Readonly<Record<string, LucideIcon>> = {
  home: Home,
  content: Library,
};

export function BrandMark() {
  return (
    <Link
      className="flex flex-col rounded-md px-1 leading-tight"
      href="/"
      aria-label="Bilgin Admin ana sayfa"
    >
      <span className="text-base font-semibold tracking-tight">Bilgin</span>
      <span className="text-xs font-medium tracking-[0.14em] text-muted uppercase">
        Admin
      </span>
    </Link>
  );
}

type SidebarNavProps = Readonly<{
  admin: SafeAdmin;
  onNavigate?: () => void;
}>;

/**
 * Visibility comes from the Step 07 registry and `filterNavigation` alone —
 * the shell never maps a role to a permission.
 */
export function SidebarNav({ admin, onNavigate }: SidebarNavProps) {
  const pathname = usePathname();
  const items: NavigationItem[] = filterNavigation(adminNavigation, admin);

  return (
    <nav aria-label="Panel navigasyonu" className="px-3 py-4">
      <ul className="space-y-1">
        {items.map((item) => {
          const Icon = navigationIcons[item.id] ?? Circle;
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <li key={item.id}>
              <Link
                aria-current={isActive ? "page" : undefined}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary-soft text-primary"
                    : "text-foreground/80 hover:bg-surface-muted hover:text-foreground"
                }`}
                href={item.href}
                onClick={onNavigate}
              >
                <Icon aria-hidden="true" className="size-4.5 shrink-0" />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function Sidebar({ admin }: Readonly<{ admin: SafeAdmin }>) {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-surface md:flex lg:w-64">
      <div className="flex h-16 shrink-0 items-center border-b border-border px-5">
        <BrandMark />
      </div>
      <div className="flex-1 overflow-y-auto">
        <SidebarNav admin={admin} />
      </div>
    </aside>
  );
}
