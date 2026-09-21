import Image from "next/image";
import { redirect } from "next/navigation";

import { LoginForm } from "@/features/auth/login-form";
import { getCurrentAdmin } from "@/lib/session/current";

export default async function LoginPage() {
  // Local encrypted session check only — no backend call.
  if ((await getCurrentAdmin()) !== null) {
    redirect("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-primary-soft px-4 py-12">
      <section
        aria-labelledby="login-title"
        className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-sm sm:p-8"
      >
        <Image
          alt=""
          className="rounded-lg"
          height={48}
          priority
          src="/brand/mascot.png"
          width={48}
        />
        <h1
          className="mt-4 text-xl font-semibold tracking-tight"
          id="login-title"
        >
          Bilgin
        </h1>
        <p className="text-xs font-medium tracking-[0.14em] text-muted uppercase">
          Admin
        </p>
        <p className="mt-2 text-sm text-muted">Yönetim paneline giriş yapın.</p>
        <div className="mt-7">
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
