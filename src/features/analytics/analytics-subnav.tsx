import Link from "next/link";

export const analyticsSections = [
  { id: "overview", label: "Genel bakış", href: "/analytics" },
  { id: "questions", label: "Soru performansı", href: "/analytics/questions" },
] as const;

export type AnalyticsSection = (typeof analyticsSections)[number]["id"];

/** Tabs between the Veri Paneli's sections; each one is its own route. */
export function AnalyticsSubnav({ current }: { current: AnalyticsSection }) {
  return (
    <nav aria-label="Veri Paneli bölümleri" className="mt-4">
      <ul className="flex flex-wrap gap-2">
        {analyticsSections.map((section) => {
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
