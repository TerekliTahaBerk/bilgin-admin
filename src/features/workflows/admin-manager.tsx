"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import type {
  CreateAdminRequest,
  UpdateAdminRequest,
} from "@/contracts/admin/workflows";
import type { SafeAdmin } from "@/contracts/admin/session";
import {
  createAdminAccount,
  getAdminAccounts,
  updateAdminAccount,
} from "@/features/workflows/workflow-client";
import type { ApiError } from "@/lib/api/error";

const input = "rounded-md border border-border bg-surface px-3 py-2 text-sm";
const abilityLabels = {
  edit_content: "İçerik düzenleme",
  publish_content: "Yayınlama",
  edit_curriculum: "Müfredat/yönetici yönetimi",
  view_users: "Kullanıcı görüntüleme",
} as const;

export function AdminManager({ currentAdmin }: { currentAdmin: SafeAdmin }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["admins"],
    queryFn: getAdminAccounts,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const [role, setRole] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("");
  const selectedRole = query.data?.roles.find((item) => item.value === role);
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admins"] });
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
    onSuccess: async () => {
      setEditing(null);
      await refresh();
    },
  });

  return (
    <div>
      <h1 className="text-xl font-semibold">Yönetici hesapları</h1>
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
            {Object.entries(selectedRole.abilities)
              .filter(([, enabled]) => enabled)
              .map(([key]) => abilityLabels[key as keyof typeof abilityLabels])
              .join(" · ") || "Yetki yok"}
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
        {query.data?.admins.map((admin) => {
          const own = admin.id === currentAdmin.id;
          const isEditing = editing === admin.id;
          const roleInfo = query.data.roles.find(
            (item) => item.value === (isEditing ? editRole : admin.role),
          );
          return (
            <article
              className="rounded-lg border border-border bg-surface p-4"
              key={admin.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">{admin.name}</h2>
                  <p className="text-sm text-muted">{admin.email}</p>
                  <p className="mt-1 text-xs">
                    <span
                      className={
                        admin.is_active ? "text-emerald-700" : "text-danger"
                      }
                    >
                      {admin.is_active ? "Aktif" : "Pasif"}
                    </span>{" "}
                    · {admin.role_label}
                    {admin.last_login_at
                      ? ` · Son giriş ${new Date(admin.last_login_at).toLocaleString("tr-TR")}`
                      : ""}
                  </p>
                </div>
                <div className="flex gap-3">
                  {own ? (
                    <span className="text-xs text-muted">Kendi hesabınız</span>
                  ) : (
                    <>
                      <button
                        className="text-sm font-semibold text-primary"
                        onClick={() => {
                          setEditing(admin.id);
                          setEditRole(admin.role);
                        }}
                        type="button"
                      >
                        Düzenle
                      </button>
                      {admin.is_active ? (
                        <button
                          className="text-sm font-semibold text-danger"
                          onClick={() => {
                            if (
                              window.confirm(
                                "Bu yönetici hesabını pasif yapmak istiyor musunuz?",
                              )
                            )
                              update.mutate({
                                id: admin.id,
                                body: { is_active: false },
                              });
                          }}
                          type="button"
                        >
                          Pasif yap
                        </button>
                      ) : (
                        <button
                          className="text-sm font-semibold text-primary"
                          onClick={() =>
                            update.mutate({
                              id: admin.id,
                              body: { is_active: true },
                            })
                          }
                          type="button"
                        >
                          Aktifleştir
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
              {isEditing ? (
                <form
                  className="mt-4 flex flex-wrap items-end gap-3 border-t border-border pt-4"
                  method="post"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    const password = String(data.get("password") ?? "");
                    update.mutate({
                      id: admin.id,
                      body: {
                        name: String(data.get("name")),
                        role: editRole,
                        ...(password ? { password } : {}),
                      },
                    });
                  }}
                >
                  <label className="text-sm">
                    Ad
                    <input
                      className={`${input} ml-2`}
                      defaultValue={admin.name}
                      name="name"
                      required
                    />
                  </label>
                  <label className="text-sm">
                    Rol
                    <select
                      className={`${input} ml-2`}
                      onChange={(event) => setEditRole(event.target.value)}
                      value={editRole}
                    >
                      {query.data.roles.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm">
                    Yeni parola
                    <input
                      autoComplete="new-password"
                      className={`${input} ml-2`}
                      minLength={12}
                      name="password"
                      placeholder="Boşsa değişmez"
                      type="password"
                    />
                  </label>
                  <button
                    className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white"
                    type="submit"
                  >
                    Kaydet
                  </button>
                  <button
                    className="text-sm"
                    onClick={() => setEditing(null)}
                    type="button"
                  >
                    Vazgeç
                  </button>
                </form>
              ) : null}
              {isEditing && roleInfo ? (
                <p className="mt-2 text-xs text-muted">
                  {Object.entries(roleInfo.abilities)
                    .filter(([, enabled]) => enabled)
                    .map(
                      ([key]) =>
                        abilityLabels[key as keyof typeof abilityLabels],
                    )
                    .join(" · ") || "Yetki yok"}
                </p>
              ) : null}
            </article>
          );
        })}
      </div>
      {update.isError ? (
        <p className="mt-4 text-sm text-danger" role="alert">
          {update.error.code === "ADMIN_LOCKOUT_PREVENTED"
            ? update.error.message
            : update.error.message}
        </p>
      ) : null}
    </div>
  );
}
