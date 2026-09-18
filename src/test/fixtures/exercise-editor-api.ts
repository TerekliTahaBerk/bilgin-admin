export const validTopicsResponse = {
  data: {
    course: { id: 1, name: "TYT Türkçe" },
    subject_id: 7,
    topics: [
      {
        id: 1,
        code: "ilk_turk_devletleri",
        name: "İlk Türk Devletleri",
        exercise_count: 12,
      },
      {
        id: 2,
        code: "kultur_medeniyet",
        name: "Kültür ve Medeniyet",
        parent_id: 1,
        grade_level: 9,
        exercise_count: 8,
      },
    ],
  },
  meta: { server_time: "2026-09-18T10:00:00+00:00" },
};

export const validExerciseDetailResponse = {
  data: {
    id: 1,
    type: "multiple_choice",
    topic_id: 1,
    difficulty: 2,
    content: {
      stem: "Orhun Yazıtları hangi devlete aittir?",
      options: [
        { id: "a", text: "Asya Hun" },
        { id: "b", text: "II. Göktürk" },
      ],
    },
    answer_key: { correct_option_id: "b" },
    explanation: "Yazıtlar II. Göktürk dönemindendir.",
    applicable_scopes: ["tyt", "ayt"],
    status: "published",
    version: 3,
    stats: {
      attempts: 20,
      correct_rate: 65,
      avg_seconds: 18,
      needs_review: false,
    },
  },
  meta: { server_time: "2026-09-18T10:00:00+00:00" },
};

/** A stored true/false question whose answer is the falsy boolean `false`. */
export const validTrueFalseDetailResponse = {
  data: {
    id: 2,
    type: "true_false",
    topic_id: 1,
    difficulty: 4,
    content: {
      statement: "Uygurlar yerleşik hayata geçen ilk Türk devletidir.",
    },
    answer_key: { value: false },
    explanation: "Yerleşik hayata geçen ilk Türk devleti Uygurlardır.",
    applicable_scopes: ["tyt"],
    status: "published",
    version: 2,
    stats: {
      attempts: 12,
      correct_rate: 40,
      avg_seconds: 9,
      needs_review: true,
    },
  },
  meta: { server_time: "2026-09-18T10:00:00+00:00" },
};

export const validCreateExerciseResponse = {
  data: { id: 123, status: "draft" },
  meta: { server_time: "2026-09-18T10:00:00+00:00" },
};

export const validUpdateExerciseResponse = {
  data: {
    id: 1,
    version: 4,
    answer_key_changed: true,
    warning: "Cevap anahtarı değişti; geçmiş istatistikleri kontrol edin.",
  },
  meta: { server_time: "2026-09-18T10:00:00+00:00" },
};
