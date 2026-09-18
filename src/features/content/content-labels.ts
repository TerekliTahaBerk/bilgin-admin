import type {
  AccessLevel,
  CourseScope,
  PublishStatus,
} from "@/contracts/admin/content";

/**
 * Display labels shared by the content screens. None of these is ever an input
 * to an authorization decision.
 */
export const courseScopeLabels: Readonly<Record<CourseScope, string>> = {
  tyt: "TYT",
  ayt: "AYT",
  ydt: "YDT",
  lgs: "LGS",
  kpss: "KPSS",
  ales: "ALES",
  yds: "YDS",
};

export const publishStatusLabels: Readonly<Record<PublishStatus, string>> = {
  draft: "Taslak",
  review: "İncelemede",
  published: "Yayında",
  archived: "Arşiv",
};

export const accessLevelLabels: Readonly<Record<AccessLevel, string>> = {
  free: "Ücretsiz",
  premium: "Premium",
};

/** Tailwind classes per status; the text label always carries the meaning. */
export const publishStatusStyles: Readonly<Record<PublishStatus, string>> = {
  published: "border-emerald-200 bg-emerald-50 text-emerald-800",
  review: "border-amber-200 bg-amber-50 text-amber-800",
  draft: "border-border bg-surface-muted text-muted",
  archived: "border-border bg-surface-muted text-muted",
};

export const accessLevelStyles: Readonly<Record<AccessLevel, string>> = {
  free: "border-border bg-surface-muted text-muted",
  premium: "border-violet-200 bg-violet-50 text-violet-800",
};

export function gradeLevelLabel(gradeLevel: number | null): string | null {
  return gradeLevel === null ? null : `${gradeLevel}. sınıf`;
}
