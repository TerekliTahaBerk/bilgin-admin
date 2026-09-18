/**
 * Representative `/api/admin/v1/courses` payload. Shape and values follow the
 * real backend: integer ids, `sort_order` ordering, the full CourseScope enum
 * and PublishStatus including `review`.
 */
export const validCoursesResponse = {
  data: [
    {
      id: 1,
      code: "tyt_turkce",
      name: "TYT Türkçe",
      scope: "tyt",
      status: "published",
      unit_count: 2,
    },
    {
      id: 2,
      code: "tyt_matematik",
      name: "TYT Temel Matematik",
      scope: "tyt",
      status: "draft",
      unit_count: 0,
    },
    {
      id: 3,
      code: "ayt_fizik",
      name: "AYT Fizik",
      scope: "ayt",
      status: "review",
      unit_count: 1,
    },
    {
      id: 4,
      code: "ydt_ingilizce",
      name: "YDT İngilizce",
      scope: "ydt",
      status: "archived",
      unit_count: 0,
    },
  ],
  meta: { server_time: "2026-09-16T19:05:20+00:00" },
};

export const emptyCoursesResponse = {
  data: [],
  meta: { server_time: "2026-09-16T19:05:20+00:00" },
};

/**
 * Representative `/api/admin/v1/courses/{course}/units` payload: several
 * statuses and access levels, a null grade_level and a unit with no exercises.
 */
export const validUnitsResponse = {
  data: [
    {
      id: 1,
      title: "İlk ve Orta Çağlarda Türk Dünyası",
      sort_order: 1,
      grade_level: 9,
      status: "published",
      access: "free",
      node_count: 6,
      exercise_count: 44,
    },
    {
      id: 2,
      title: "Tarih ve Zaman",
      sort_order: 2,
      grade_level: 12,
      status: "review",
      access: "premium",
      node_count: 4,
      exercise_count: 12,
    },
    {
      id: 3,
      title: "Hazırlanıyor",
      sort_order: 3,
      grade_level: null,
      status: "draft",
      access: "free",
      node_count: 0,
      exercise_count: 0,
    },
  ],
  meta: { server_time: "2026-09-16T19:05:20+00:00" },
};

export const emptyUnitsResponse = {
  data: [],
  meta: { server_time: "2026-09-16T19:05:20+00:00" },
};
