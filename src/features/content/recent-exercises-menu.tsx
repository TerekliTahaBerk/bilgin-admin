"use client";

import { History } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import {
  listRecentExercises,
  type RecentExerciseEntry,
} from "@/features/content/exercise-history";

function formatRelativeTime(editedAt: number): string {
  const diffMinutes = Math.round((Date.now() - editedAt) / 60_000);
  if (diffMinutes < 1) return "az önce";
  if (diffMinutes < 60) return `${diffMinutes} dk önce`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} sa önce`;

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays} gün önce`;
}

/**
 * Reads sessionStorage fresh every time the menu opens (not reactively) —
 * this tab's own edits are the only source, so there is nothing to subscribe
 * to between opens.
 */
export function RecentExercisesMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [entries, setEntries] = useState<readonly RecentExerciseEntry[]>([]);

  function toggleOpen() {
    setIsOpen((open) => {
      const next = !open;
      if (next) {
        setEntries(listRecentExercises());
      }
      return next;
    });
  }

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  return (
    <div className="relative">
      <button
        aria-expanded={isOpen}
        aria-label="Son düzenlenen sorular"
        className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-surface text-muted transition-colors hover:bg-surface-muted"
        onClick={toggleOpen}
        title="Son düzenlenen sorular"
        type="button"
      >
        <History aria-hidden="true" className="size-4" />
      </button>

      {isOpen ? (
        <>
          <button
            aria-label="Son düzenlenenleri kapat"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setIsOpen(false)}
            tabIndex={-1}
            type="button"
          />
          <div
            aria-label="Son düzenlenen sorular"
            className="absolute right-0 z-50 mt-2 w-72 rounded-lg border border-border bg-surface p-2 shadow-lg"
            role="menu"
          >
            {entries.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted">
                Bu oturumda henüz düzenlenen soru yok.
              </p>
            ) : (
              <ul>
                {entries.map((entry) => (
                  <li key={entry.exerciseId}>
                    <Link
                      className="flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm hover:bg-surface-muted"
                      href={`/courses/${entry.courseId}/units/${entry.unitId}/exercises/${entry.exerciseId}`}
                      onClick={() => setIsOpen(false)}
                    >
                      <span className="truncate">{entry.label}</span>
                      <span className="shrink-0 text-xs text-muted">
                        {formatRelativeTime(entry.editedAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
