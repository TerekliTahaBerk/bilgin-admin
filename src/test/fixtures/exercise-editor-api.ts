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

/** A stored fill blank question with a populated choice list. */
export const validFillBlankDetailResponse = {
  data: {
    id: 3,
    type: "fill_blank",
    topic_id: 1,
    difficulty: 3,
    content: {
      template: "Türklerde yazısız hukuk kurallarına {{0}} denir.",
      choices: ["Töre", "Kurultay", "Toy", "Yuğ"],
    },
    answer_key: { blanks: ["Töre"] },
    explanation: "Töre, yazısız hukuk kurallarının adıdır.",
    applicable_scopes: ["tyt", "ayt"],
    status: "published",
    version: 2,
    stats: {
      attempts: 30,
      correct_rate: 55,
      avg_seconds: 21,
      needs_review: false,
    },
  },
  meta: { server_time: "2026-09-18T10:00:00+00:00" },
};

/** A stored numeric question whose correct answer is the falsy number 0. */
export const validNumericInputDetailResponse = {
  data: {
    id: 4,
    type: "numeric_input",
    topic_id: 1,
    difficulty: 3,
    content: { stem: "Sıfırıncı yıl hangisidir?", suffix: "yılı" },
    answer_key: { value: 0, tolerance: 0 },
    explanation: "Sıfır geçerli bir cevaptır.",
    applicable_scopes: ["tyt"],
    status: "published",
    version: 2,
    stats: {
      attempts: 18,
      correct_rate: 44,
      avg_seconds: 15,
      needs_review: false,
    },
  },
  meta: { server_time: "2026-09-18T10:00:00+00:00" },
};

/** A stored flashcard. */
export const validFlashcardDetailResponse = {
  data: {
    id: 5,
    type: "flashcard",
    topic_id: 1,
    difficulty: 2,
    content: {
      front: "Kut",
      back: "Yönetme yetkisinin Tanrı tarafından verildiği inancı.",
    },
    answer_key: { self_assessed: true },
    explanation: null,
    applicable_scopes: ["tyt", "ayt"],
    status: "draft",
    version: 1,
    stats: {
      attempts: 0,
      correct_rate: null,
      avg_seconds: null,
      needs_review: false,
    },
  },
  meta: { server_time: "2026-09-18T10:00:00+00:00" },
};

/**
 * A stored matching question. Arbitrary ids and an instruction the validator
 * ignores, both of which an edit has to round-trip untouched.
 */
export const validMatchingDetailResponse = {
  data: {
    id: 6,
    type: "matching",
    topic_id: 1,
    difficulty: 4,
    content: {
      instruction: "Kavramı karşılığıyla eşleştir.",
      left: [
        { id: "l1", text: "Kurultay" },
        { id: "l2", text: "Kut" },
      ],
      right: [
        { id: "r1", text: "Devlet meclisi" },
        { id: "r2", text: "Yönetme yetkisi" },
        { id: "r3", text: "Yazısız hukuk" },
      ],
    },
    answer_key: {
      pairs: { l1: "r1", l2: "r2" },
      partial_credit: true,
    },
    explanation: null,
    applicable_scopes: ["ayt"],
    status: "draft",
    version: 2,
    stats: {
      attempts: 22,
      correct_rate: 9,
      avg_seconds: 51,
      needs_review: true,
    },
  },
  meta: { server_time: "2026-09-18T10:00:00+00:00" },
};

/**
 * A stored ordering question whose answer order deliberately differs from the
 * content list order — the two are separate concepts and must stay separate.
 */
export const validOrderingDetailResponse = {
  data: {
    id: 7,
    type: "ordering",
    topic_id: 1,
    difficulty: 3,
    content: {
      instruction: "Eskiden yeniye sırala.",
      items: [
        { id: "alpha", text: "Uygurlar" },
        { id: "beta", text: "Göktürkler" },
        { id: "gamma", text: "Asya Hunları" },
      ],
    },
    answer_key: { order: ["gamma", "beta", "alpha"] },
    explanation: null,
    applicable_scopes: ["tyt"],
    status: "draft",
    version: 1,
    stats: {
      attempts: 5,
      correct_rate: 40,
      avg_seconds: 30,
      needs_review: false,
    },
  },
  meta: { server_time: "2026-09-18T10:00:00+00:00" },
};

/** A stored word order question, keyed on content.words. */
export const validWordOrderDetailResponse = {
  data: {
    id: 8,
    type: "word_order",
    topic_id: 1,
    difficulty: 2,
    content: {
      instruction: "Doğru cümleyi oluştur.",
      words: [
        { id: "1", text: "Ben" },
        { id: "2", text: "okula" },
        { id: "3", text: "gittim" },
      ],
    },
    answer_key: { order: ["1", "2", "3"] },
    explanation: null,
    applicable_scopes: ["tyt"],
    status: "draft",
    version: 1,
    stats: {
      attempts: 0,
      correct_rate: null,
      avg_seconds: null,
      needs_review: false,
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
