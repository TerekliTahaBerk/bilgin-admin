"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import type {
  AdminAccountsData,
  CreateAdminRequest,
  UpdateAdminRequest,
} from "@/contracts/admin/workflows";
import type { SafeAdmin } from "@/contracts/admin/session";
import { ExportCsvButton } from "@/components/export-csv-button";
import {
  abilityList,
  AdminAccountCard,
} from "@/features/workflows/admin-account-card";
import {
  ADMIN_ACCOUNTS_QUERY_KEY,
  adminAccountsQueryOptions,
} from "@/features/workflows/admin-queries";
import {
  createAdminAccount,
  updateAdminAccount,
} from "@/features/workflows/workflow-client";
import type { ApiError } from "@/lib/api/error";
import type { CsvColumn } from "@/lib/export/csv";

const input = "rounded-md border border-border bg-surface px-3 py-2 text-sm";
type AdminRow = AdminAccountsData["admins"][number];

const ADMIN_CSV_COLUMNS: readonly CsvColumn<AdminRow>[] = [
  { header: "Ad", value: (admin) => admin.name },
  { header: "E-posta", value: (admin) => admin.email },
  { header: "Rol", value: (admin) => admin.role_label },
  { header: "Durum", value: (admin) => (admin.is_active ? "Aktif" : "Pasif") },
  {
    header: "Son giriş",
    value: (admin) =>
      admin.last_login_at === null
        ? ""
        : new Date(admin.last_login_at).toLocaleString("tr-TR"),
  },
];

export function AdminManager({ currentAdmin }: { currentAdmin: SafeAdmin }) {
  const queryClient = useQueryClient();
  const query = useQuery<AdminAccountsData, ApiError>(
    adminAccountsQueryOptions(),
  );
  const [role, setRole] = useState("");
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  // "Son giriş N gün önce" is measured from when the page was opened.
  const [now] = useState(() => Date.now());
  const selectedRole = query.data?.roles.find((item) => item.value === role);
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ADMIN_ACCOUNTS_QUERY_KEY });
  };
  const create = useMutation<unknown, ApiError, CreateAdminRequest>({
    mutationFn: createAdminAccount,
    retry: 0,
    onSuccess: refresh,
  });
  const update = useMutation<
    unknown,
    ApiError,
    { id: string; body: UpdateAdminRequest }
  >({
    mutationFn: ({ id, body }) => updateAdminAccount(id, body),
    retry: 0,
    onSuccess: refresh,
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Yönetici hesapları</h1>
        <ExportCsvButton
          columns={ADMIN_CSV_COLUMNS}
          filename="yoneticiler.csv"
          rows={query.data?.admins ?? []}
        />
      </div>
      <form
        className="mt-6 grid gap-3 rounded-lg border border-border bg-surface p-5 sm:grid-cols-2 lg:grid-cols-4"
        method="post"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const data = new FormData(form);
          create.mutate(
            {
              name: String(data.get("name")),
              email: String(data.get("email")),
              password: String(data.get("password")),
              role,
            },
            {
              onSuccess: () => {
                form.reset();
                setRole("");
              },
            },
          );
        }}
      >
        <h2 className="sm:col-span-2 lg:col-span-4 font-semibold">
          Yeni yönetici
        </h2>
        <input
          className={input}
          maxLength={191}
          name="name"
          placeholder="Ad soyad"
          required
        />
        <input
          className={input}
          name="email"
          placeholder="E-posta"
          required
          type="email"
        />
        <input
          autoComplete="new-password"
          className={input}
          minLength={12}
          name="password"
          placeholder="En az 12 karakter parola"
          required
          type="password"
        />
        <select
          className={input}
          onChange={(event) => setRole(event.target.value)}
          required
          value={role}
        >
          <option value="">Rol seçin</option>
          {query.data?.roles.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
        {selectedRole ? (
          <p className="sm:col-span-2 lg:col-span-4 text-sm text-muted">
            {abilityList(selectedRole.abilities)}
          </p>
        ) : null}
        <button
          className="w-fit rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          disabled={create.isPending}
          type="submit"
        >
          {create.isPending ? "Oluşturuluyor…" : "Yönetici oluştur"}
        </button>
        {create.isError ? (
          <p className="text-sm text-danger" role="alert">
            {create.error.message}
          </p>
        ) : null}
      </form>
      <div className="mt-6 space-y-3">
        {query.isPending ? (
          <p aria-busy="true" className="text-sm text-muted">
            Yöneticiler yükleniyor…
          </p>
        ) : null}
        {query.isError ? (
          <p className="text-sm text-danger" role="alert">
            Yöneticiler yüklenemedi: {query.error.message}
          </p>
        ) : null}
        {query.data?.admins.map((admin) => (
          <AdminAccountCard
            admin={admin}
            currentAdminId={currentAdmin.id}
            data={query.data}
            error={
              update.isError && update.variables?.id === admin.id
                ? update.error
                : null
            }
            isPending={update.isPending && update.variables?.id === admin.id}
            key={admin.id}
            now={now}
            onUpdate={async (body) => {
              try {
                await update.mutateAsync({ id: admin.id, body });
                setLastSavedId(admin.id);
                return true;
              } catch {
                setLastSavedId(null);
                return false;
              }
            }}
            saved={lastSavedId === admin.id}
          />
        ))}
      </div>
    </div>
  );
}
