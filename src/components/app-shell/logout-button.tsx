"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { logoutSession } from "@/features/auth/session-client";

type LogoutButtonProps = Readonly<{
  className?: string;
}>;

/**
 * Local sign-out: it clears the encrypted frontend session cookie. The backend
 * token is not revoked — that endpoint does not exist.
 */
export function LogoutButton({ className }: LogoutButtonProps) {
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
      {error ? (
        <p className="mt-2 text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
