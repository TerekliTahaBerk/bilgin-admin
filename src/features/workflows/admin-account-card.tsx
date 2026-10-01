"use client";

import { useId, useState } from "react";

import type {
  AdminAccountsData,
  UpdateAdminRequest,
} from "@/contracts/admin/workflows";
import {
  adminEditRules,
  wouldDemoteSoloManager,
  wouldLeaveSoloManager,
} from "@/features/workflows/admin-lockout";
import {
  formatLoginAge,
  isHighPrivilege,
  loginAge,
} from "@/features/workflows/admin-security";
import type { ApiError } from "@/lib/api/error";

type AdminRow = AdminAccountsData["admins"][number];

/** The backend's password rule (`min:12`). */
export const ADMIN_PASSWORD_MIN = 12;

export const abilityLabels = {
  edit_content: "İçerik düzenleme",
  publish_content: "Yayınlama",
  edit_curriculum: "Müfredat/yönetici yönetimi",
  view_users: "Kullanıcı görüntüleme",
} as const;

const input = "rounded-md border border-border bg-surface px-3 py-2 text-sm";

export function adminCardId(adminId: string) {
  return `admin-${adminId}`;
}

export function abilityList(
  abilities: AdminAccountsData["roles"][number]["abilities"] | undefined,
): string {
  if (abilities === undefined) return "Yetkiler bilinmiyor";
  return (
    Object.entries(abilities)
      .filter(([, enabled]) => enabled)
      .map(([key]) => abilityLabels[key as keyof typeof abilityLabels])
      .join(" · ") || "Yetki yok"
  );
}

/** Message for a failed update, keeping the backend's lockout wording. */
export function adminUpdateErrorMessage(error: ApiError): string {
  if (error.code === "ADMIN_LOCKOUT_PREVENTED") {
    return `Backend engelledi: ${error.message}`;
  }
  if (error.kind === "validation" && error.fields !== undefined) {
    return Object.values(error.fields).flat().join(" ") || error.message;
  }
  if (error.kind === "authorization") return "Bu işlem için yetkiniz yok.";
  if (error.kind === "not_found")
    return "Yönetici bulunamadı; listeyi yenileyin.";
  return error.message;
}

export type AdminAccountCardProps = Readonly<{
  admin: AdminRow;
  data: AdminAccountsData;
  currentAdminId: string;
  now: number;
  isPending: boolean;
  /** The last failed update of this account, if any. */
  error: ApiError | null;
  /** This account was the last one saved successfully. */
  saved: boolean;
  onUpdate: (body: UpdateAdminRequest) => Promise<boolean>;
}>;

/**
 * One admin account. Everything the backend's lockout rules would refuse is
 * disabled up front with its reason — your own role and deactivation, and
 * removing the last active super admin — while the backend's answer stays
 * authoritative and is shown on the card if it still refuses.
 */
export function AdminAccountCard({
  admin,
  data,
  currentAdminId,
  now,
  isPending,
  error,
  saved,
  onUpdate,
}: AdminAccountCardProps) {
  const ids = {
    deactivate: useId(),
    role: useId(),
    password: useId(),
    confirm: useId(),
    name: useId(),
    hint: useId(),
  };
  const own = admin.id === currentAdminId;
  const rules = adminEditRules(data.admins, data.roles, admin, currentAdminId);
  const [editing, setEditing] = useState(false);
  const [editRole, setEditRole] = useState(admin.role);
  const [password, setPassword] = useState("");
  const [passwordAgain, setPasswordAgain] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const roleInfo = data.roles.find(
    (item) => item.value === (editing ? editRole : admin.role),
  );
  const age = loginAge(admin, now);
  const high = isHighPrivilege(admin, data.roles);

  function startEditing() {
    setEditing(true);
    setEditRole(admin.role);
    setPassword("");
    setPasswordAgain("");
    setFormError(null);
  }

  async function submit(form: HTMLFormElement) {
    const name = String(new FormData(form).get("name") ?? "").trim();
    const body: UpdateAdminRequest = {
      ...(name !== "" && name !== admin.name ? { name } : {}),
      ...(editRole !== admin.role ? { role: editRole } : {}),
      ...(password !== "" ? { password } : {}),
    };

    if (password !== "" && password.length < ADMIN_PASSWORD_MIN) {
      setFormError(`Parola en az ${ADMIN_PASSWORD_MIN} karakter olmalı.`);
      return;
    }
    if (password !== passwordAgain) {
      setFormError("Parolalar eşleşmiyor.");
      return;
    }
    if (Object.keys(body).length === 0) {
      setFormError("Değişiklik yok.");
      return;
    }
    if (
      body.role !== undefined &&
      wouldDemoteSoloManager(
        data.admins,
        data.roles,
        admin,
        body.role,
        currentAdminId,
      ) &&
      !window.confirm(
        "Bu rol değişikliği, yönetici hesaplarını yönetebilecek son kişi olarak sizi tek başınıza bırakacak. Devam etmek istiyor musunuz?",
      )
    ) {
      return;
    }

    setFormError(null);
    if (await onUpdate(body)) {
      setEditing(false);
      setPassword("");
      setPasswordAgain("");
    }
  }

  return (
    <article
      className="scroll-mt-24 rounded-lg border border-border bg-surface p-4"
      id={adminCardId(admin.id)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold break-words">{admin.name}</h2>
          <p className="text-sm break-words text-muted">{admin.email}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span
              className={admin.is_active ? "text-emerald-700" : "text-danger"}
            >
              {admin.is_active ? "Aktif" : "Pasif"}
            </span>
            <span aria-hidden="true">·</span>
            <span>{admin.role_label}</span>
            <span aria-hidden="true">·</span>
            <span
              title={
                age.kind === "logged_in"
                  ? age.at.toLocaleString("tr-TR")
                  : undefined
              }
            >
              Son giriş: {formatLoginAge(age)}
            </span>
            {high ? (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-medium text-amber-800">
                Yüksek yetkili
              </span>
            ) : null}
            {own ? (
              <span className="rounded-full border border-border bg-surface-muted px-2 py-0.5 font-medium">
                Kendi hesabınız
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-xs text-muted">
            {abilityList(roleOf(data, admin.role)?.abilities)}
          </p>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <div className="flex gap-3">
            <button
              className="text-sm font-semibold text-primary disabled:opacity-60"
              disabled={isPending}
              onClick={() => (editing ? setEditing(false) : startEditing())}
              type="button"
            >
              {editing ? "Düzenlemeyi kapat" : "Düzenle"}
            </button>
            {own ? null : admin.is_active ? (
              <button
                aria-describedby={
                  rules.deactivateBlocked === null ? undefined : ids.deactivate
                }
                className="text-sm font-semibold text-danger disabled:cursor-not-allowed disabled:opacity-50"
                disabled={isPending || rules.deactivateBlocked !== null}
                onClick={() => {
                  const solo = wouldLeaveSoloManager(
                    data.admins,
                    data.roles,
                    admin,
                    currentAdminId,
                  );
                  const message = solo
                    ? "Bu, yönetici hesaplarını yönetebilecek son kişi olarak sizi tek başınıza bırakacak. Bu yöneticiyi pasif yapmak istiyor musunuz?"
                    : "Bu yönetici hesabını pasif yapmak istiyor musunuz? Pasif hesap giriş yapamaz; kayıtları silinmez.";

                  if (window.confirm(message)) {
                    void onUpdate({ is_active: false });
                  }
                }}
                type="button"
              >
                Pasif yap
              </button>
            ) : (
              <button
                className="text-sm font-semibold text-primary disabled:opacity-60"
                disabled={isPending}
                onClick={() => void onUpdate({ is_active: true })}
                type="button"
              >
                Aktifleştir
              </button>
            )}
          </div>
          {own ? (
            <p className="text-xs text-muted">
              Kendinizi pasif yapamaz ve rolünüzü değiştiremezsiniz (backend
              kuralı).
            </p>
          ) : rules.deactivateBlocked !== null ? (
            <p className="max-w-xs text-xs text-muted" id={ids.deactivate}>
              {rules.deactivateBlocked}
            </p>
          ) : null}
        </div>
      </div>

      {editing ? (
        <form
          aria-label={`${admin.name} hesabını düzenle`}
          className="mt-4 grid gap-4 border-t border-border pt-4 sm:grid-cols-2"
          method="post"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void submit(event.currentTarget);
          }}
        >
          <label className="text-sm font-medium" htmlFor={ids.name}>
            Ad
            <input
              className={`${input} mt-1 block w-full`}
              defaultValue={admin.name}
              id={ids.name}
              maxLength={191}
              name="name"
              required
            />
          </label>
          <div>
            <label className="text-sm font-medium" htmlFor={ids.role}>
              Rol
            </label>
            <select
              aria-describedby={ids.hint}
              className={`${input} mt-1 block w-full`}
              disabled={rules.roleBlocked !== null}
              id={ids.role}
              onChange={(event) => setEditRole(event.target.value)}
              value={editRole}
            >
              {data.roles.map((item) => (
                <option
                  disabled={rules.forbiddenRoles.has(item.value)}
                  key={item.value}
                  value={item.value}
                >
                  {item.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-muted" id={ids.hint}>
              {rules.roleBlocked ??
                (rules.forbiddenRoles.size > 0
                  ? "Son aktif süper yönetici olduğu için yalnızca Süper Yönetici kalabilir (backend kuralı)."
                  : abilityList(roleInfo?.abilities))}
            </p>
          </div>

          <fieldset className="sm:col-span-2">
            <legend className="text-sm font-medium">
              {own ? "Parolanızı değiştirin" : "Parolayı sıfırla"}
            </legend>
            <p className="mt-0.5 text-xs text-muted">
              Boş bırakılırsa parola değişmez. En az {ADMIN_PASSWORD_MIN}{" "}
              karakter.
            </p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <label className="text-sm" htmlFor={ids.password}>
                Yeni parola
                <input
                  autoComplete="new-password"
                  className={`${input} mt-1 block w-full`}
                  id={ids.password}
                  minLength={ADMIN_PASSWORD_MIN}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Boşsa değişmez"
                  type="password"
                  value={password}
                />
              </label>
              <label className="text-sm" htmlFor={ids.confirm}>
                Yeni parola (tekrar)
                <input
                  aria-invalid={
                    passwordAgain !== "" && passwordAgain !== password
                      ? true
                      : undefined
                  }
                  autoComplete="new-password"
                  className={`${input} mt-1 block w-full`}
                  disabled={password === ""}
                  id={ids.confirm}
                  onChange={(event) => setPasswordAgain(event.target.value)}
                  type="password"
                  value={passwordAgain}
                />
              </label>
            </div>
          </fieldset>

          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <button
              className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
              disabled={isPending}
              type="submit"
            >
              {isPending ? "Kaydediliyor…" : "Kaydet"}
            </button>
            <button
              className="text-sm"
              onClick={() => setEditing(false)}
              type="button"
            >
              Vazgeç
            </button>
            {formError === null ? null : (
              <p className="text-sm text-danger" role="alert">
                {formError}
              </p>
            )}
          </div>
        </form>
      ) : null}

      {error === null ? null : (
        <p className="mt-3 text-sm text-danger" role="alert">
          {adminUpdateErrorMessage(error)}
        </p>
      )}
      {saved && error === null ? (
        <p className="mt-3 text-sm text-emerald-700" role="status">
          Kaydedildi.
        </p>
      ) : null}
    </article>
  );
}

function roleOf(data: AdminAccountsData, value: string) {
  return data.roles.find((role) => role.value === value);
}
