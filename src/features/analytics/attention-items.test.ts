import { describe, expect, it } from "vitest";

import type { Course, Unit, UnitExercisesData } from "@/contracts/admin/content";
import {
  coursesAwaitingContent,
  exercisesNeedingReview,
  unitsAwaitingExercises,
} from "@/features/analytics/attention-items";

function course(overrides: Partial<Course>): Course {
  return {
    id: 1,
    code: "tyt_tarih",
    name: "TYT Tarih",
    scope: "tyt",
    status: "published",
    unit_count: 1,
    ...overrides,
  } as Course;
}

function unit(overrides: Partial<Unit>): Unit {
  return {
    id: 1,
    title: "Ünite 1",
    sort_order: 1,
    grade_level: null,
    status: "published",
    access: "free",
    node_count: 3,
    exercise_count: 10,
    ...overrides,
  } as Unit;
}

describe("coursesAwaitingContent", () => {
  it("flags only courses with zero units", () => {
    const courses = [
      course({ id: 1, name: "Boş Ders", unit_count: 0 }),
      course({ id: 2, name: "Dolu Ders", unit_count: 5 }),
    ];

    const items = coursesAwaitingContent(courses);

    expect(items).toHaveLength(1);
    expect(items[0]).toEqual({
      id: "course-1",
      message: "Boş Ders: henüz ünite eklenmemiş.",
      href: "/courses/1",
    });
  });

  it("returns nothing when every course has units", () => {
    expect(
      coursesAwaitingContent([course({ unit_count: 3 })]),
    ).toEqual([]);
  });
});

describe("unitsAwaitingExercises", () => {
  it("flags only units with zero exercises, keeping their course id", () => {
    const entries = [
      {
        courseId: 1,
        units: [
          unit({ id: 10, title: "Boş Ünite", exercise_count: 0 }),
          unit({ id: 11, title: "Dolu Ünite", exercise_count: 8 }),
        ],
      },
      {
        courseId: 2,
        units: [unit({ id: 20, title: "Başka Boş Ünite", exercise_count: 0 })],
      },
    ];

    const items = unitsAwaitingExercises(entries);

    expect(items).toEqual([
      {
        id: "unit-10",
        message: "Boş Ünite: henüz soru eklenmemiş.",
        href: "/courses/1/units/10",
      },
      {
        id: "unit-20",
        message: "Başka Boş Ünite: henüz soru eklenmemiş.",
        href: "/courses/2/units/20",
      },
    ]);
  });
});

describe("exercisesNeedingReview", () => {
  function exercisesData(
    overrides: Partial<UnitExercisesData>,
  ): UnitExercisesData {
    return {
      unit: { id: 5, title: "İncelenecek Ünite" },
      exercises: [],
      ...overrides,
    } as UnitExercisesData;
  }

  it("flags only exercises whose stats mark needs_review", () => {
    const entries = [
      {
        courseId: 3,
        data: exercisesData({
          unit: { id: 5, title: "İncelenecek Ünite" },
          exercises: [
            {
              id: 100,
              type: "multiple_choice",
              topic: { id: 1, name: "Konu" },
              difficulty: 2,
              status: "published",
              version: 1,
              scopes: ["tyt"],
              preview: "Şüpheli soru?",
              stats: {
                attempts: 40,
                correct_rate: 3,
                avg_seconds: 20,
                needs_review: true,
              },
            },
            {
              id: 101,
              type: "multiple_choice",
              topic: { id: 1, name: "Konu" },
              difficulty: 2,
              status: "published",
              version: 1,
              scopes: ["tyt"],
              preview: "Sağlıklı soru?",
              stats: {
                attempts: 40,
                correct_rate: 60,
                avg_seconds: 20,
                needs_review: false,
              },
            },
          ],
        }),
      },
    ] as never;

    const items = exercisesNeedingReview(entries);

    expect(items).toEqual([
      {
        id: "exercise-100",
        message: "İncelenecek Ünite · Şüpheli soru?",
        href: "/courses/3/units/5",
      },
    ]);
  });

  it("falls back to a placeholder when the preview text is empty", () => {
    const entries = [
      {
        courseId: 1,
        data: exercisesData({
          exercises: [
            {
              id: 200,
              type: "multiple_choice",
              topic: { id: 1, name: "Konu" },
              difficulty: 1,
              status: "draft",
              version: 1,
              scopes: ["tyt"],
              preview: "",
              stats: {
                attempts: 25,
                correct_rate: 98,
                avg_seconds: 5,
                needs_review: true,
              },
            },
          ],
        }),
      },
    ] as never;

    expect(exercisesNeedingReview(entries)[0]?.message).toContain(
      "(önizleme yok)",
    );
  });
});
