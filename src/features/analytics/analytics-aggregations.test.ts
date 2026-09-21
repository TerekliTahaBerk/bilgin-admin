import { describe, expect, it } from "vitest";

import type { Course, Unit } from "@/contracts/admin/content";
import type { AdminAccountsData } from "@/contracts/admin/workflows";
import {
  adminCountByRole,
  countByPublishStatus,
  courseCountByScope,
  courseUnitCounts,
  summarizeAdminRoster,
  unitExerciseCounts,
} from "@/features/analytics/analytics-aggregations";

function course(overrides: Partial<Course>): Course {
  return {
    id: 1,
    code: "TYT-MAT",
    name: "TYT Matematik",
    scope: "tyt",
    status: "published",
    unit_count: 0,
    ...overrides,
  };
}

function unit(overrides: Partial<Unit>): Unit {
  return {
    id: 1,
    title: "Sayılar",
    sort_order: 0,
    grade_level: null,
    status: "published",
    access: "free",
    node_count: 0,
    exercise_count: 0,
    ...overrides,
  };
}

describe("courseCountByScope", () => {
  it("groups by scope in first-appearance order with Turkish labels", () => {
    const courses = [
      course({ id: 1, scope: "ayt" }),
      course({ id: 2, scope: "tyt" }),
      course({ id: 3, scope: "tyt" }),
    ];

    expect(courseCountByScope(courses)).toEqual([
      { id: "ayt", label: "AYT", value: 1 },
      { id: "tyt", label: "TYT", value: 2 },
    ]);
  });

  it("returns an empty list for no courses", () => {
    expect(courseCountByScope([])).toEqual([]);
  });
});

describe("countByPublishStatus", () => {
  it("counts in fixed enum order and keeps zero-count statuses", () => {
    const courses = [
      course({ id: 1, status: "published" }),
      course({ id: 2, status: "published" }),
      course({ id: 3, status: "draft" }),
    ];

    expect(countByPublishStatus(courses)).toEqual([
      { id: "draft", label: "Taslak", value: 1 },
      { id: "review", label: "İncelemede", value: 0 },
      { id: "published", label: "Yayında", value: 2 },
      { id: "archived", label: "Arşiv", value: 0 },
    ]);
  });
});

describe("courseUnitCounts", () => {
  it("sorts descending by unit count", () => {
    const courses = [
      course({ id: 1, name: "Az üniteli", unit_count: 2 }),
      course({ id: 2, name: "Çok üniteli", unit_count: 9 }),
      course({ id: 3, name: "Orta", unit_count: 5 }),
    ];

    expect(courseUnitCounts(courses).map((entry) => entry.label)).toEqual([
      "Çok üniteli",
      "Orta",
      "Az üniteli",
    ]);
  });
});

describe("unitExerciseCounts", () => {
  it("sorts descending by exercise count", () => {
    const units = [
      unit({ id: 1, title: "Ünite A", exercise_count: 0 }),
      unit({ id: 2, title: "Ünite B", exercise_count: 12 }),
    ];

    expect(unitExerciseCounts(units)).toEqual([
      { id: "2", label: "Ünite B", value: 12 },
      { id: "1", label: "Ünite A", value: 0 },
    ]);
  });
});

describe("summarizeAdminRoster", () => {
  it("splits total into active and inactive", () => {
    const admins: AdminAccountsData["admins"] = [
      {
        id: "a",
        name: "A",
        email: "a@test.com",
        role: "editor",
        role_label: "Editör",
        is_active: true,
        last_login_at: null,
      },
      {
        id: "b",
        name: "B",
        email: "b@test.com",
        role: "editor",
        role_label: "Editör",
        is_active: false,
        last_login_at: null,
      },
    ];

    expect(summarizeAdminRoster(admins)).toEqual({
      total: 2,
      active: 1,
      inactive: 1,
    });
  });
});

describe("adminCountByRole", () => {
  it("counts by role in the backend's role list order and drops empty roles", () => {
    const data: Pick<AdminAccountsData, "roles" | "admins"> = {
      roles: [
        {
          value: "super_admin",
          label: "Süper Yönetici",
          abilities: {
            edit_content: true,
            publish_content: true,
            edit_curriculum: true,
            view_users: true,
          },
        },
        {
          value: "editor",
          label: "Editör",
          abilities: {
            edit_content: true,
            publish_content: false,
            edit_curriculum: false,
            view_users: false,
          },
        },
        {
          value: "reviewer",
          label: "Denetçi",
          abilities: {
            edit_content: false,
            publish_content: true,
            edit_curriculum: false,
            view_users: false,
          },
        },
      ],
      admins: [
        {
          id: "a",
          name: "A",
          email: "a@test.com",
          role: "editor",
          role_label: "Editör",
          is_active: true,
          last_login_at: null,
        },
        {
          id: "b",
          name: "B",
          email: "b@test.com",
          role: "editor",
          role_label: "Editör",
          is_active: true,
          last_login_at: null,
        },
        {
          id: "c",
          name: "C",
          email: "c@test.com",
          role: "super_admin",
          role_label: "Süper Yönetici",
          is_active: true,
          last_login_at: null,
        },
      ],
    };

    expect(adminCountByRole(data)).toEqual([
      { id: "super_admin", label: "Süper Yönetici", value: 1 },
      { id: "editor", label: "Editör", value: 2 },
    ]);
  });
});
