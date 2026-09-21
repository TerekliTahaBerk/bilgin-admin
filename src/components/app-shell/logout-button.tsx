"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { logoutSession } from "@/features/auth/session-client";

type LogoutButtonProps = Readonly<{
  className?: string;
  /**
   * Shows the local-only disclaimer beneath the button. Only the mobile
   * drawer has room for it today; the compact Topbar instance stays
   * icon-and-label only.
   */
  hint?: boolean;
}>;

/**
 * Local sign-out: it clears the encrypted frontend session cookie. The backend
 * token is not revoked — that endpoint does not exist (see README, "Known
 * Backend Security Limitations", #1). `hint` surfaces that fact to the admin
 * instead of only to whoever reads the source.
 */
export function LogoutButton({ className, hint = false }: LogoutButtonProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    if (isPending) {
      return;
    }

    setIsPending(true);
    setError(null);

    const result = await logoutSession();

    if (result.ok) {
      router.replace("/login");
      router.refresh();
      return;
    }

    setError("Çıkış yapılamadı. Lütfen tekrar deneyin.");
    setIsPending(false);
  };

  return (
    <div className={className}>
      <button
        aria-busy={isPending}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isPending}
        onClick={handleClick}
        type="button"
      >
        <LogOut aria-hidden="true" className="size-4 shrink-0" />
        <span>{isPending ? "Çıkış yapılıyor…" : "Çıkış"}</span>
      </button>
      {hint ? (
        <p className="mt-2 text-xs text-muted">
          Bu işlem yalnızca bu cihazdaki oturumu kapatır; hesabına başka bir
          cihazdan erişim devam edebilir.
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
