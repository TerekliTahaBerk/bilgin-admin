import { SessionHeartbeat } from "@/components/app-shell/session-heartbeat";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <SessionHeartbeat />
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Bilgin Admin</h1>
        <p className="mt-3 text-sm text-slate-600">Foundation setup</p>
      </div>
    </main>
  );
}
