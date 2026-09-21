import {
  publishStatuses,
  type Course,
  type PublishStatus,
  type Unit,
} from "@/contracts/admin/content";
import type { AdminAccountsData } from "@/contracts/admin/workflows";

type AdminAccount = AdminAccountsData["admins"][number];
import {
  courseScopeLabels,
  publishStatusLabels,
} from "@/features/content/content-labels";
import {
  groupCoursesByScope,
  type CourseScopeGroup,
} from "@/features/content/courses-summary";

/**
 * One labeled magnitude — the shape every bar chart on this page renders.
 * `id` is stable across re-renders (a scope code, a status, a course id as a
 * string); `label` and `value` are what gets drawn.
 */
export type DistributionEntry = Readonly<{
  id: string;
  label: string;
  value: number;
}>;

/**
 * Course count per scope (TYT/AYT/…), in the backend's own scope ordering
 * (first appearance in the `/courses` payload) — the same grouping
 * `groupCoursesByScope` already provides for the courses browser.
 */
export function courseCountByScope(
  courses: readonly Course[],
): DistributionEntry[] {
  return groupCoursesByScope(courses).map(
    (group: CourseScopeGroup): DistributionEntry => ({
      id: group.scope,
      label: courseScopeLabels[group.scope],
      value: group.courses.length,
    }),
  );
}

/**
 * How many items sit in each publish status, in the fixed backend enum order
 * (draft → review → published → archived) rather than by count — a status
 * distribution reads as a pipeline, not a leaderboard. Statuses with zero
 * items are kept: an empty "İncelemede" bar is itself the finding ("nothing
 * is stuck in review").
 */
export function countByPublishStatus(
  items: readonly { status: PublishStatus }[],
): DistributionEntry[] {
  const counts = new Map<PublishStatus, number>(
    publishStatuses.map((status) => [status, 0]),
  );

  for (const item of items) {
    counts.set(item.status, (counts.get(item.status) ?? 0) + 1);
  }

  return publishStatuses.map((status): DistributionEntry => ({
    id: status,
    label: publishStatusLabels[status],
    value: counts.get(status) ?? 0,
  }));
}

/**
 * One bar per course, sorted by unit count descending so the busiest course
 * leads — ties keep the backend's `sort_order` (the courses array's own
 * order), never re-sorted alphabetically.
 */
export function courseUnitCounts(
  courses: readonly Course[],
): DistributionEntry[] {
  return courses
    .map((course): DistributionEntry => ({
      id: String(course.id),
      label: course.name,
      value: course.unit_count,
    }))
    .sort((a, b) => b.value - a.value);
}

/**
 * One bar per unit of a single course, sorted by exercise count descending —
 * "which units still need questions" is the reading this supports.
 */
export function unitExerciseCounts(
  units: readonly Unit[],
): DistributionEntry[] {
  return units
    .map((unit): DistributionEntry => ({
      id: String(unit.id),
      label: unit.title,
      value: unit.exercise_count,
    }))
    .sort((a, b) => b.value - a.value);
}

export type AdminRosterSummary = Readonly<{
  total: number;
  active: number;
  inactive: number;
}>;

export function summarizeAdminRoster(
  admins: readonly AdminAccount[],
): AdminRosterSummary {
  const active = admins.filter((admin) => admin.is_active).length;

  return { total: admins.length, active, inactive: admins.length - active };
}

/**
 * One bar per role, in the order the backend's role list defines (the
 * hierarchy super_admin → … → the least privileged), not by headcount — a
 * role distribution reads as an org chart, not a leaderboard. `role_label`
 * carries the display text, but the grouping key is `role`: two roles could
 * theoretically share a label, and grouping by the raw value keeps them
 * apart. A role with nobody in it is dropped — unlike publish status, an
 * empty role is not itself a finding here.
 */
export function adminCountByRole(
  data: Pick<AdminAccountsData, "roles" | "admins">,
): DistributionEntry[] {
  const counts = new Map<string, number>();

  for (const admin of data.admins) {
    counts.set(admin.role, (counts.get(admin.role) ?? 0) + 1);
  }

  return data.roles
    .map((role): DistributionEntry => ({
      id: role.value,
      label: role.label,
      value: counts.get(role.value) ?? 0,
    }))
    .filter((entry) => entry.value > 0);
}
