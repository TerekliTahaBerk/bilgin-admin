"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Info } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";

import type { AdminAccountsData } from "@/contracts/admin/workflows";
import { BarList } from "@/features/analytics/bar-list";
import {
  abilityList,
  adminCardId,
} from "@/features/workflows/admin-account-card";
import { adminAccountsQueryOptions } from "@/features/workflows/admin-queries";
import {
  attentionItems,
  attentionKindLabels,
  attentionKinds,
  DEFAULT_STALE_THRESHOLD,
  formatLoginAge,
  isHighPrivilege,
  loginAge,
  policyNotes,
  roleOf,
  STALE_LOGIN_THRESHOLDS,
  summarizeAdmins,
  SUPER_ADMIN_POLICY_MAX,
  type AttentionKind,
  type StaleThreshold,
} from "@/features/workflows/admin-security";
import type { ApiError } from "@/lib/api/error";

const chipClass = (active: boolean) =>
  active
    ? "rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground"
    : "rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium transition-colors hover:bg-surface-muted";

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
        {value}
      </dd>
      {hint === undefined ? null : (
        <dd className="mt-0.5 text-xs text-muted">{hint}</dd>
      )}
    </div>
  );
}

function Attention({ data, now }: { data: AdminAccountsData; now: number }) {
  const thresholdId = useId();
  const [staleDays, setStaleDays] = useState<StaleThreshold>(
    DEFAULT_STALE_THRESHOLD,
  );
  const [kind, setKind] = useState<AttentionKind | "all">("all");
  const items = useMemo(
    () => attentionItems(data, now, staleDays),
    [data, now, staleDays],
  );
  const shown =
    kind === "all" ? items : items.filter((item) => item.kind === kind);
  const adminById = new Map(data.admins.map((admin) => [admin.id, admin]));

  return (
    <section aria-labelledby="attention-heading" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold" id="attention-heading">
            Dikkat gerektiren hesaplar
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            Uyarılar giriş yapabilen (aktif) hesaplar içindir; pasif hesaplar
            bilgi olarak listelenir.
          </p>
        </div>
        <div>
          <label className="block text-xs font-medium" htmlFor={thresholdId}>
            Uzun süre eşiği
          </label>
          <select
            className="mt-1 rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm"
            id={thresholdId}
            onChange={(event) =>
              setStaleDays(
                STALE_LOGIN_THRESHOLDS.find(
                  (days) => String(days) === event.target.value,
                ) ?? DEFAULT_STALE_THRESHOLD,
              )
            }
            value={staleDays}
          >
            {STALE_LOGIN_THRESHOLDS.map((days) => (
              <option key={days} value={days}>
                {days} gün
              </option>
            ))}
          </select>
        </div>
      </div>

      <div aria-label="Neden" className="flex flex-wrap gap-2" role="group">
        <button
          aria-pressed={kind === "all"}
          className={chipClass(kind === "all")}
          onClick={() => setKind("all")}
          type="button"
        >
          Tümü ({items.length})
        </button>
        {attentionKinds.map((item) => (
          <button
            aria-pressed={kind === item}
            className={chipClass(kind === item)}
            key={item}
            onClick={() => setKind(item)}
            type="button"
          >
            {attentionKindLabels[item]} (
            {items.filter((entry) => entry.kind === item).length})
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-lg border border-border bg-surface p-4 text-sm text-muted">
          Bu görünümde dikkat gerektiren hesap yok.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
          {shown.map((item) => {
            const admin = adminById.get(item.adminId);
            const Icon = item.severity === "warning" ? AlertTriangle : Info;
            return (
              <li
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                key={item.id}
              >
                <div className="min-w-0">
                  <p className="flex items-start gap-1.5 text-sm font-medium">
                    <Icon
                      aria-hidden="true"
                      className={`mt-0.5 size-4 shrink-0 ${
                        item.severity === "warning"
                          ? "text-amber-700"
                          : "text-muted"
                      }`}
                    />
                    <span className="break-words">
                      {admin?.name ?? "Bilinmeyen hesap"}
                      <span className="font-normal text-muted">
                        {" "}
                        · {attentionKindLabels[item.kind]}
                        {item.severity === "warning" ? " · uyarı" : ""}
                      </span>
                    </span>
                  </p>
                  <p className="pl-5.5 text-xs text-muted">
                    {admin?.email} · {admin?.role_label} · {item.message}
                  </p>
                </div>
                <Link
                  className="shrink-0 pl-5.5 text-xs font-semibold text-primary hover:underline sm:pl-0"
                  href={`/admins#${adminCardId(item.adminId)}`}
                >
                  Hesabı düzenle
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * Admin Security: the admin list endpoint read as a security overview.
 * Facts come from the response; thresholds that are this panel's own policy
 * are labelled as such. Changes happen on the accounts screen, where the
 * backend's lockout rules are applied up front.
 */
export function AdminSecurityCenter() {
  const router = useRouter();
  const query = useQuery<AdminAccountsData, ApiError>(
    adminAccountsQueryOptions(),
  );
  // Ages are measured from when the page was opened.
  const [now] = useState(() => Date.now());

  const isSessionExpired = query.error?.kind === "authentication";
  useEffect(() => {
    if (isSessionExpired) {
      router.replace("/login");
      router.refresh();
    }
  }, [isSessionExpired, router]);

  if (query.isPending || isSessionExpired) {
    return (
      <p aria-busy="true" className="text-sm text-muted" role="status">
        Yönetici hesapları yükleniyor…
      </p>
    );
  }

  if (query.isError) {
    const forbidden = query.error.kind === "authorization";
    return (
      <div
        className="rounded-lg border border-border bg-surface p-6"
        role="alert"
      >
        <h2 className="text-sm font-semibold">
          {forbidden
            ? "Bu bölüme erişim yetkiniz yok"
            : "Yönetici hesapları yüklenemedi"}
        </h2>
        <p className="mt-1.5 text-sm text-muted">{query.error.message}</p>
        {forbidden ? null : (
          <button
            className="mt-4 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-muted disabled:opacity-60"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
            type="button"
          >
            {query.isFetching ? "Deneniyor…" : "Tekrar dene"}
          </button>
        )}
      </div>
    );
  }

  const data = query.data;
  const summary = summarizeAdmins(data, now);
  const notes = policyNotes(summary);

  return (
    <div className="space-y-8">
      <section aria-labelledby="security-summary-heading" className="space-y-3">
        <h2 className="text-base font-semibold" id="security-summary-heading">
          Özet
        </h2>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Toplam yönetici" value={summary.total} />
          <Stat label="Aktif" value={summary.active} />
          <Stat label="Pasif" value={summary.inactive} />
          <Stat label="Hiç giriş yapmamış" value={summary.neverLoggedIn} />
          {STALE_LOGIN_THRESHOLDS.map((days) => (
            <Stat
              hint="aktif hesaplar"
              key={days}
              label={`${days}+ gündür giriş yok`}
              value={summary.staleActive[days]}
            />
          ))}
          <Stat
            hint={`toplam ${summary.superAdmins.total}`}
            label="Aktif süper yönetici"
            value={summary.superAdmins.active}
          />
        </dl>
      </section>

      {notes.length === 0 ? null : (
        <section aria-labelledby="policy-heading" className="space-y-2">
          <h2 className="text-base font-semibold" id="policy-heading">
            Politika notları
          </h2>
          <ul className="space-y-2">
            {notes.map((note) => (
              <li
                className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
                key={note.id}
              >
                <span className="mr-2 rounded-full border border-amber-300 px-2 py-0.5 text-xs font-medium">
                  Yerel politika sezgiseli
                </span>
                {note.message}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">
            Bu notlar panelin kendi önerileridir (ör. en fazla{" "}
            {SUPER_ADMIN_POLICY_MAX} aktif süper yönetici); backend&apos;in bir
            kuralı değildir.
          </p>
        </section>
      )}

      <Attention data={data} now={now} />

      <div className="grid gap-4 lg:grid-cols-2">
        <BarList
          description="Aktif / toplam; her rolün yetkileri backend'in rol listesinden gelir."
          entries={summary.roleDistribution.map((role) => ({
            id: role.value,
            label: role.label,
            value: role.total,
            detail: `${role.active} aktif · ${abilityList(
              data.roles.find((item) => item.value === role.value)?.abilities,
            )}`,
          }))}
          title="Rol dağılımı"
          valueLabel="yönetici"
        />

        <section
          aria-labelledby="all-admins-heading"
          className="rounded-lg border border-border bg-surface p-4"
        >
          <h3 className="text-sm font-semibold" id="all-admins-heading">
            Tüm hesaplar
          </h3>
          <ul className="mt-3 divide-y divide-border">
            {data.admins.map((admin) => {
              const age = loginAge(admin, now);
              return (
                <li className="py-2 text-sm" key={admin.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium break-words">
                      {admin.name}
                    </span>
                    <span
                      className={
                        admin.is_active
                          ? "text-xs text-emerald-700"
                          : "text-xs text-danger"
                      }
                    >
                      {admin.is_active ? "Aktif" : "Pasif"}
                    </span>
                  </div>
                  <p className="text-xs break-words text-muted">
                    {admin.email} · {admin.role_label}
                    {isHighPrivilege(admin, data.roles)
                      ? " · yüksek yetkili"
                      : ""}
                  </p>
                  <p className="text-xs text-muted">
                    Son giriş:{" "}
                    <span
                      title={
                        age.kind === "logged_in"
                          ? age.at.toLocaleString("tr-TR")
                          : undefined
                      }
                    >
                      {formatLoginAge(age)}
                    </span>
                    {" · "}
                    {abilityList(roleOf(admin, data.roles)?.abilities)}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
