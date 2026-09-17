import { LoginForm } from "@/features/auth/login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <section className="w-full max-w-sm" aria-labelledby="login-title">
        <h1 className="text-2xl font-semibold tracking-tight" id="login-title">
          Bilgin Admin
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          Yönetim paneline giriş yapın.
        </p>
        <div className="mt-8">
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
