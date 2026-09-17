"use client";

import { X } from "lucide-react";
import { useEffect } from "react";

import type { SafeAdmin } from "@/contracts/admin/session";
import { BrandMark, SidebarNav } from "@/components/app-shell/sidebar";
import { LogoutButton } from "@/components/app-shell/logout-button";

type MobileNavProps = Readonly<{
  admin: SafeAdmin;
  isOpen: boolean;
  onClose: () => void;
}>;

export function MobileNav({ admin, isOpen, onClose }: MobileNavProps) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 md:hidden">
      <button
        aria-label="Menüyü kapat"
        className="absolute inset-0 h-full w-full bg-foreground/40"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <div
        aria-label="Panel menüsü"
        aria-modal="true"
        className="relative flex h-full w-72 max-w-[85%] flex-col border-r border-border bg-surface"
        id="mobile-navigation"
        role="dialog"
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-5">
          <BrandMark />
          <button
            aria-label="Menüyü kapat"
            className="inline-flex size-10 items-center justify-center rounded-md text-foreground transition-colors hover:bg-surface-muted"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <SidebarNav admin={admin} onNavigate={onClose} />
        </div>

        <div className="shrink-0 border-t border-border p-4">
          <p className="truncate text-sm font-medium">{admin.name}</p>
          <p className="truncate text-xs text-muted">{admin.roleLabel}</p>
          <LogoutButton className="mt-3" />
        </div>
      </div>
    </div>
  );
}
