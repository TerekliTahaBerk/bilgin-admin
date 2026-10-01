import Link from "next/link";

export const adminsSections = [
  { id: "accounts", label: "Hesaplar", href: "/admins" },
  { id: "security", label: "Güvenlik", href: "/admins/security" },
] as const;

export type AdminsSection = (typeof adminsSections)[number]["id"];

/** Tabs between the admin accounts screen and its security view. */
export function AdminsSubnav({ current }: { current: AdminsSection }) {
  return (
    <nav aria-label="Yönetici bölümleri" className="mb-6">
      <ul className="flex flex-wrap gap-2">
        {adminsSections.map((section) => {
          const active = section.id === current;
          return (
            <li key={section.id}>
              <Link
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "inline-flex rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground"
                    : "inline-flex rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium transition-colors hover:bg-surface-muted"
                }
                href={section.href}
              >
                {section.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
