"use client";

import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import type { Course } from "@/contracts/admin/content";
import type { SafeAdmin } from "@/contracts/admin/session";
import { coursesQueryOptions } from "@/features/content/content-queries";
import type { ApiError } from "@/lib/api/error";
import { adminNavigation, filterNavigation } from "@/lib/authz/navigation";

type PaletteEntry = Readonly<{
  key: string;
  label: string;
  href: string;
  hint?: string;
}>;

/**
 * Turkish-aware, diacritic-tolerant enough for course codes and names: the
 * locale lowercasing alone (İ → i̇, I → ı) is what makes "İngilizce" match
 * "ingilizce" typed without the dot.
 */
function matches(query: string, ...fields: readonly string[]): boolean {
  const needle = query.trim().toLocaleLowerCase("tr");

  if (needle === "") {
    return true;
  }

  return fields.some((field) => field.toLocaleLowerCase("tr").includes(needle));
}

function isSearchShortcut(event: KeyboardEvent): boolean {
  return (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
}

/**
 * Self-contained: owns its own open state, its own ⌘K listener and its own
 * course query. The query is disabled until the palette opens, so it never
 * competes with a page's own requests and reuses the same `coursesQueryKey`
 * cache `CoursesBrowser` and the dashboard already fill — opening the palette
 * right after either screen costs no network round trip.
 */
export function CommandPalette({ admin }: { admin: SafeAdmin }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const coursesQuery = useQuery<Course[], ApiError>({
    ...coursesQueryOptions(),
    enabled: isOpen,
  });

  function close() {
    setIsOpen(false);
    setQuery("");
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isSearchShortcut(event)) {
        event.preventDefault();
        setIsOpen((open) => !open);
        return;
      }

      if (event.key === "Escape") {
        close();
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  const pages: PaletteEntry[] = useMemo(
    () =>
      filterNavigation(adminNavigation, admin).map((item) => ({
        key: `page-${item.id}`,
        label: item.label,
        href: item.href,
      })),
    [admin],
  );

  const courseEntries: PaletteEntry[] = useMemo(
    () =>
      (coursesQuery.data ?? []).map((course) => ({
        key: `course-${course.id}`,
        label: course.name,
        hint: course.code,
        href: `/courses/${course.id}`,
      })),
    [coursesQuery.data],
  );

  const filteredPages = pages.filter((entry) => matches(query, entry.label));
  const filteredCourses = courseEntries.filter((entry) =>
    matches(query, entry.label, entry.hint ?? ""),
  );
  const hasResults = filteredPages.length > 0 || filteredCourses.length > 0;
  const isLoadingCourses =
    coursesQuery.isFetching && courseEntries.length === 0;

  return (
    <>
      <button
        aria-label="Panelde ara"
        className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-muted transition-colors hover:bg-surface-muted"
        onClick={() => setIsOpen(true)}
        type="button"
      >
        <Search aria-hidden="true" className="size-4" />
        <span className="hidden sm:inline">Ara</span>
        <kbd className="hidden rounded border border-border bg-surface-muted px-1.5 py-0.5 font-mono text-[11px] sm:inline">
          ⌘K
        </kbd>
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50">
          <button
            aria-label="Aramayı kapat"
            className="absolute inset-0 h-full w-full bg-foreground/40"
            onClick={close}
            tabIndex={-1}
            type="button"
          />

          <div
            aria-label="Panelde ara"
            aria-modal="true"
            className="relative mx-auto mt-24 w-[calc(100%-2rem)] max-w-lg rounded-lg border border-border bg-surface shadow-lg"
            role="dialog"
          >
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <Search
                aria-hidden="true"
                className="size-4 shrink-0 text-muted"
              />
              <input
                aria-label="Ders veya sayfa ara"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Ders veya sayfa ara…"
                ref={inputRef}
                value={query}
              />
            </div>

            <div className="max-h-80 overflow-y-auto p-2">
              {isLoadingCourses ? (
                <p className="px-2 py-3 text-sm text-muted">
                  Dersler yükleniyor…
                </p>
              ) : null}

              {!hasResults && !isLoadingCourses ? (
                <p className="px-2 py-3 text-sm text-muted">
                  Sonuç bulunamadı.
                </p>
              ) : null}

              {filteredPages.length === 0 ? null : (
                <div>
                  <p className="px-2 pb-1 pt-2 text-xs font-medium text-muted">
                    Sayfalar
                  </p>
                  <ul>
                    {filteredPages.map((entry) => (
                      <li key={entry.key}>
                        <Link
                          className="block rounded-md px-2 py-2 text-sm hover:bg-surface-muted"
                          href={entry.href}
                          onClick={close}
                        >
                          {entry.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {filteredCourses.length === 0 ? null : (
                <div>
                  <p className="px-2 pb-1 pt-2 text-xs font-medium text-muted">
                    Dersler
                  </p>
                  <ul>
                    {filteredCourses.map((entry) => (
                      <li key={entry.key}>
                        <Link
                          className="flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm hover:bg-surface-muted"
                          href={entry.href}
                          onClick={close}
                        >
                          <span className="truncate">{entry.label}</span>
                          {entry.hint === undefined ? null : (
                            <span className="shrink-0 font-mono text-xs text-muted">
                              {entry.hint}
                            </span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
