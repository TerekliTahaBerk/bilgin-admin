"use client";

import Link from "next/link";

import {
  coursesAwaitingContent,
  exercisesNeedingReview,
  unitsAwaitingExercises,
  type AttentionItem,
} from "@/features/analytics/attention-items";
import { useCachedContent } from "@/features/analytics/use-cached-content";

function AttentionGroup({
  title,
  items,
}: {
  title: string;
  items: readonly AttentionItem[];
}) {
  if (items.length === 0) return null;

  return (
    <div>
      <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">
        {title}
        <span className="ml-1.5 font-normal normal-case">
          ({items.length})
        </span>
      </h3>
      <ul className="mt-1.5 divide-y divide-border rounded-lg border border-border bg-surface">
        {items.slice(0, 20).map((item) => (
          <li key={item.id}>
            <Link
              className="block px-4 py-2.5 text-sm transition-colors hover:bg-surface-muted"
              href={item.href}
            >
              {item.message}
            </Link>
          </li>
        ))}
      </ul>
      {items.length > 20 ? (
        <p className="mt-1.5 text-xs text-muted">
          +{items.length - 20} tane daha.
        </p>
      ) : null}
    </div>
  );
}

/**
 * A punch list built entirely from whatever course/unit/exercise data the
 * admin has already loaded into the query cache this session — no fetch of
 * its own. It grows as the admin browses (open a course, its list joins the
 * "boş ünite" check; open a unit's exercises, its questions join the
 * "incelemesi gereken" check) rather than trying to answer the question
 * up front for the whole catalog, which would mean fetching every unit's
 * every exercise list on page load.
 */
export function AttentionPanel() {
  const { courses, courseUnits, unitExercises } = useCachedContent();

  const emptyCourses = coursesAwaitingContent(courses);
  const emptyUnits = unitsAwaitingExercises(courseUnits);
  const reviewExercises = exercisesNeedingReview(unitExercises);
  const total = emptyCourses.length + emptyUnits.length + reviewExercises.length;

  if (total === 0) {
    return (
      <section aria-labelledby="attention-heading" className="space-y-3">
        <h2 className="text-sm font-semibold" id="attention-heading">
          Dikkat gerektirenler
        </h2>
        <p className="text-sm text-muted">
          Şu ana kadar gezilen dersler, üniteler ve sorularda dikkat
          gerektiren bir şey bulunamadı. Bu liste, ders ve ünite sayfalarını
          ziyaret ettikçe genişler.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="attention-heading" className="space-y-4">
      <h2 className="text-sm font-semibold" id="attention-heading">
        Dikkat gerektirenler
        <span className="ml-1.5 font-normal text-muted">({total})</span>
      </h2>
      <AttentionGroup items={reviewExercises} title="İncelemesi gereken sorular" />
      <AttentionGroup items={emptyUnits} title="Sorusu olmayan üniteler" />
      <AttentionGroup items={emptyCourses} title="Ünitesi olmayan dersler" />
    </section>
  );
}
