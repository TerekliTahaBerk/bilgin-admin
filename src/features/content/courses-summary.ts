import {
  courseScopes,
  type Course,
  type CourseScope,
  type PublishStatus,
} from "@/contracts/admin/content";

export type CoursesSummary = Readonly<{
  totalCourses: number;
  publishedCourses: number;
  totalUnits: number;
}>;

export type CourseScopeGroup = Readonly<{
  scope: CourseScope;
  label: string;
  courses: readonly Course[];
}>;

/** Display labels only — never an input to an authorization decision. */
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

/**
 * Every figure is derived from the `/courses` payload itself. Exercise totals
 * are deliberately absent: that endpoint does not report them, and fetching
 * units for every course just to add them up would be a request waterfall.
 */
export function summarizeCourses(courses: readonly Course[]): CoursesSummary {
  return {
    totalCourses: courses.length,
    publishedCourses: courses.filter((course) => course.status === "published")
      .length,
    totalUnits: courses.reduce((total, course) => total + course.unit_count, 0),
  };
}

/**
 * Groups by scope while preserving the backend's ordering: scopes appear in the
 * order they first occur, and courses keep their `sort_order` sequence. Empty
 * groups are never produced.
 */
export function groupCoursesByScope(
  courses: readonly Course[],
): CourseScopeGroup[] {
  const groups = new Map<CourseScope, Course[]>();

  for (const course of courses) {
    const existing = groups.get(course.scope);

    if (existing === undefined) {
      groups.set(course.scope, [course]);
    } else {
      existing.push(course);
    }
  }

  return [...groups.entries()].map(([scope, scopeCourses]) => ({
    scope,
    label: courseScopeLabels[scope],
    courses: scopeCourses,
  }));
}

export function isAwaitingContent(course: Course): boolean {
  return course.unit_count === 0;
}

export const knownCourseScopes = courseScopes;
