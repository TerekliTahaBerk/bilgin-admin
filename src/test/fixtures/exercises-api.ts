/**
 * Representative `/api/admin/v1/units/{unit}/exercises` payload: several types,
 * every publish status, difficulties 1/3/5, two topics, an unattempted
 * exercise, a flagged one and an edited one.
 */
export const validUnitExercisesResponse = {
  data: {
    unit: { id: 12, title: "İlk ve Orta Çağlarda Türk Dünyası" },
    exercises: [
      {
        id: 1,
        type: "multiple_choice",
        topic: { id: 1, name: "İlk Türk Devletleri" },
        difficulty: 2,
        status: "published",
        version: 1,
        scopes: ["tyt", "ayt"],
        preview: "Orhun Yazıtları hangi Türk devletine aittir?",
        stats: {
          attempts: 0,
          correct_rate: null,
          avg_seconds: null,
          needs_review: false,
        },
      },
      {
        id: 2,
        type: "true_false",
        topic: { id: 1, name: "İlk Türk Devletleri" },
        difficulty: 1,
        status: "draft",
        version: 2,
        scopes: ["tyt"],
        preview: "Uygurlar yerleşik hayata geçen ilk Türk devletidir.",
        stats: {
          attempts: 34,
          correct_rate: 97,
          avg_seconds: 8,
          needs_review: true,
        },
      },
      {
        id: 3,
        type: "fill_blank",
        topic: { id: 2, name: "Kültür ve Medeniyet" },
        difficulty: 3,
        status: "review",
        version: 1,
        scopes: ["tyt", "ayt", "ydt"],
        preview: "Yazısız hukuk kurallarına {{0}} denir.",
        stats: {
          attempts: 12,
          correct_rate: 58,
          avg_seconds: 21,
          needs_review: false,
        },
      },
      {
        id: 4,
        type: "matching",
        topic: { id: 2, name: "Kültür ve Medeniyet" },
        difficulty: 5,
        status: "archived",
        version: 3,
        scopes: ["ayt"],
        preview: "Kavramı karşılığıyla birleştir.",
        stats: {
          attempts: 25,
          correct_rate: 8,
          avg_seconds: 44,
          needs_review: true,
        },
      },
      {
        id: 5,
        type: "image_hotspot",
        topic: { id: 2, name: "Kültür ve Medeniyet" },
        difficulty: 3,
        status: "published",
        version: 1,
        scopes: ["tyt"],
        preview: "(önizleme yok)",
        stats: {
          attempts: 3,
          correct_rate: 33,
          avg_seconds: null,
          needs_review: false,
        },
      },
    ],
  },
  meta: { server_time: "2026-09-16T19:05:20+00:00" },
};

export const emptyUnitExercisesResponse = {
  data: {
    unit: { id: 13, title: "Hazırlanıyor" },
    exercises: [],
  },
  meta: { server_time: "2026-09-16T19:05:20+00:00" },
};
