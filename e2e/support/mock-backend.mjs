/**
 * Minimal stand-in for the Laravel admin API, used by the auth smoke suite so
 * the E2E run never touches a real backend.
 *
 * It implements only the two endpoints M0 uses, plus a readiness probe for
 * Playwright's webServer. It is test tooling: it is not part of the Next.js
 * application and never ships.
 */
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_BACKEND_PORT ?? 8787);

export const E2E_BACKEND_TOKEN = "test-e2e-backend-token";

const ADMIN = {
  id: "01a0ab9b-0000-4000-8000-00000000ed17",
  name: "Taha Berk",
  email: "editor@bilgin.test",
  role: "content_editor",
  role_label: "İçerik Editörü",
  abilities: {
    edit_content: true,
    publish_content: false,
    edit_curriculum: false,
    view_users: false,
  },
};

const REVIEWER = {
  id: "01a0ab9b-0000-4000-8000-0000000000e5",
  name: "İçerik Denetçisi",
  email: "reviewer@bilgin.test",
  role: "content_reviewer",
  role_label: "İçerik Denetçisi",
  abilities: {
    edit_content: false,
    publish_content: true,
    edit_curriculum: false,
    view_users: false,
  },
};

// Test-only credentials. These are not real credentials for any environment.
const VALID_EMAIL = "editor@bilgin.test";
const VALID_PASSWORD = "test-password";
const REVIEWER_TOKEN = "test-e2e-reviewer-token";

/**
 * Deliberately varied: several scopes, every publish status the backend can
 * emit (review included) and two courses with no units.
 */
const COURSES = [
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
];

/** Units per course id. Course 2 deliberately has none. */
const UNITS = {
  1: [
    {
      id: 11,
      title: "İlk ve Orta Çağlarda Türk Dünyası",
      sort_order: 1,
      grade_level: 9,
      status: "published",
      access: "free",
      node_count: 6,
      exercise_count: 44,
    },
    {
      id: 12,
      title: "Tarih ve Zaman",
      sort_order: 2,
      grade_level: 12,
      status: "review",
      access: "premium",
      node_count: 4,
      exercise_count: 12,
    },
    {
      id: 13,
      title: "Hazırlanıyor",
      sort_order: 3,
      grade_level: null,
      status: "draft",
      access: "free",
      node_count: 0,
      // Unit metadata is backend-computed and deliberately independent of the
      // rows this mock serves — unit 11 reports 44 for 5 rows for the same
      // reason.
      exercise_count: 0,
    },
  ],
  2: [],
  3: [
    {
      id: 31,
      title: "Vektörler",
      sort_order: 1,
      grade_level: 11,
      status: "archived",
      access: "premium",
      node_count: 3,
      exercise_count: 7,
    },
  ],
  4: [],
};

/** Exercises per unit id, covering types, statuses, difficulties and stats. */
const EXERCISES = {
  11: [
    {
      id: 101,
      type: "multiple_choice",
      topic: { id: 1, name: "İlk Türk Devletleri" },
      difficulty: 1,
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
      id: 102,
      type: "true_false",
      topic: { id: 1, name: "İlk Türk Devletleri" },
      difficulty: 3,
      status: "draft",
      version: 2,
      scopes: ["tyt"],
      preview: "Uygurlar yerleşik hayata geçen ilk Türk devletidir.",
      stats: {
        attempts: 41,
        correct_rate: 97,
        avg_seconds: 7,
        needs_review: true,
      },
    },
    {
      id: 103,
      type: "fill_blank",
      topic: { id: 2, name: "Kültür ve Medeniyet" },
      difficulty: 3,
      status: "review",
      version: 1,
      scopes: ["tyt", "ayt"],
      preview: "Yazısız hukuk kurallarına {{0}} denir.",
      stats: {
        attempts: 15,
        correct_rate: 60,
        avg_seconds: 23,
        needs_review: false,
      },
    },
    {
      id: 104,
      type: "matching",
      topic: { id: 2, name: "Kültür ve Medeniyet" },
      difficulty: 5,
      status: "archived",
      version: 1,
      scopes: ["ayt"],
      preview: "Kavramı karşılığıyla birleştir.",
      stats: {
        attempts: 22,
        correct_rate: 9,
        avg_seconds: 51,
        needs_review: true,
      },
    },
    {
      id: 105,
      type: "image_hotspot",
      topic: { id: 2, name: "Kültür ve Medeniyet" },
      difficulty: 1,
      status: "published",
      version: 1,
      scopes: ["tyt"],
      preview: "(önizleme yok)",
      stats: {
        attempts: 4,
        correct_rate: 25,
        avg_seconds: null,
        needs_review: false,
      },
    },
  ],
  12: [],
  // The structured types live in their own unit, so the M2/M3 assertions about
  // unit 11's list stay exactly as they were.
  13: [
    {
      id: 106,
      type: "ordering",
      topic: { id: 1, name: "İlk Türk Devletleri" },
      difficulty: 3,
      status: "draft",
      version: 1,
      scopes: ["tyt"],
      preview: "Devletleri eskiden yeniye sırala.",
      stats: {
        attempts: 6,
        correct_rate: 50,
        avg_seconds: 34,
        needs_review: false,
      },
    },
    {
      id: 107,
      type: "word_order",
      topic: { id: 1, name: "İlk Türk Devletleri" },
      difficulty: 2,
      status: "draft",
      version: 1,
      scopes: ["tyt"],
      preview: "Kelimeleri sıralayarak cümleyi kur.",
      stats: {
        attempts: 0,
        correct_rate: null,
        avg_seconds: null,
        needs_review: false,
      },
    },
    {
      id: 108,
      type: "diagram_label",
      topic: { id: 2, name: "Kültür ve Medeniyet" },
      difficulty: 4,
      status: "published",
      version: 1,
      scopes: ["ayt"],
      preview: "(önizleme yok)",
      stats: {
        attempts: 2,
        correct_rate: 50,
        avg_seconds: null,
        needs_review: false,
      },
    },
    {
      id: 109,
      type: "matching",
      topic: { id: 2, name: "Kültür ve Medeniyet" },
      difficulty: 2,
      status: "draft",
      version: 1,
      scopes: ["tyt"],
      preview: "Terimleri karşılıklarıyla eşleştir.",
      stats: {
        attempts: 0,
        correct_rate: null,
        avg_seconds: null,
        needs_review: false,
      },
    },
  ],
  31: [],
};

const TOPICS = {
  1: {
    course: { id: 1, name: "TYT Türkçe" },
    subject_id: 1,
    topics: [
      {
        id: 1,
        code: "ilk_turk_devletleri",
        name: "İlk Türk Devletleri",
        grade_level: 9,
        exercise_count: 2,
      },
      {
        id: 2,
        code: "kultur_medeniyet",
        name: "Kültür ve Medeniyet",
        parent_id: 1,
        exercise_count: 3,
      },
    ],
  },
  3: {
    course: { id: 3, name: "AYT Fizik" },
    subject_id: 3,
    topics: [
      {
        id: 31,
        code: "vektorler",
        name: "Vektörler",
        grade_level: 11,
        exercise_count: 0,
      },
    ],
  },
};

const EXERCISE_DETAILS = {
  101: {
    id: 101,
    type: "multiple_choice",
    topic_id: 1,
    difficulty: 1,
    content: {
      stem: "Orhun Yazıtları hangi Türk devletine aittir?",
      options: [
        { id: "a", text: "Asya Hun" },
        { id: "b", text: "II. Göktürk" },
        { id: "c", text: "Uygur" },
        { id: "d", text: "Hazar" },
      ],
    },
    answer_key: { correct_option_id: "b" },
    explanation: "Yazıtlar II. Göktürk dönemine aittir.",
    applicable_scopes: ["tyt", "ayt"],
    status: "published",
    version: 1,
    stats: {
      attempts: 0,
      correct_rate: null,
      avg_seconds: null,
      needs_review: false,
    },
  },
  102: {
    id: 102,
    type: "true_false",
    topic_id: 1,
    difficulty: 3,
    content: { statement: "Uygurlar yerleşik hayata geçti." },
    // Deliberately the falsy boolean: the editor must still preselect "Yanlış".
    answer_key: { value: false },
    explanation: null,
    applicable_scopes: ["tyt"],
    status: "draft",
    version: 2,
    stats: {
      attempts: 41,
      correct_rate: 97,
      avg_seconds: 7,
      needs_review: true,
    },
  },
  103: {
    id: 103,
    type: "fill_blank",
    topic_id: 2,
    difficulty: 3,
    content: {
      template: "Yazısız hukuk kurallarına {{0}} denir.",
      choices: ["Töre", "Kurultay", "Toy", "Yuğ"],
    },
    answer_key: { blanks: ["Töre"] },
    explanation: null,
    applicable_scopes: ["tyt", "ayt"],
    status: "review",
    version: 1,
    stats: {
      attempts: 15,
      correct_rate: 60,
      avg_seconds: 23,
      needs_review: false,
    },
  },
  // A real MatchingValidator-shaped row: arbitrary ids, an instruction the
  // validator ignores but the editor must round-trip, one spare right item and
  // partial credit switched on.
  104: {
    id: 104,
    type: "matching",
    topic_id: 2,
    difficulty: 5,
    content: {
      instruction: "Kavramı karşılığıyla birleştir.",
      left: [
        { id: "l1", text: "Töre" },
        { id: "l2", text: "Kurultay" },
      ],
      right: [
        { id: "r1", text: "Yazısız hukuk" },
        { id: "r2", text: "Devlet meclisi" },
        { id: "r3", text: "Yönetme yetkisi" },
      ],
    },
    answer_key: { pairs: { l1: "r1", l2: "r2" }, partial_credit: true },
    explanation: null,
    applicable_scopes: ["ayt"],
    status: "archived",
    version: 1,
    stats: {
      attempts: 22,
      correct_rate: 9,
      avg_seconds: 51,
      needs_review: true,
    },
  },
  // Media types stay readable and non-editable: there is no media
  // infrastructure yet, so no editor pretends there is one.
  105: {
    id: 105,
    type: "image_hotspot",
    topic_id: 2,
    difficulty: 1,
    content: {
      image_url: "https://cdn.example.test/harita.png",
      regions: [{ id: "a", shape: "rect", coords: [0, 0, 10, 10] }],
    },
    answer_key: { region_id: "a" },
    explanation: null,
    applicable_scopes: ["tyt"],
    status: "published",
    version: 1,
    stats: {
      attempts: 4,
      correct_rate: 25,
      avg_seconds: null,
      needs_review: false,
    },
  },
  // The answer order deliberately differs from the content list order.
  106: {
    id: 106,
    type: "ordering",
    topic_id: 1,
    difficulty: 3,
    content: {
      instruction: "Devletleri eskiden yeniye sırala.",
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
      attempts: 6,
      correct_rate: 50,
      avg_seconds: 34,
      needs_review: false,
    },
  },
  107: {
    id: 107,
    type: "word_order",
    topic_id: 1,
    difficulty: 2,
    content: {
      instruction: "Kelimeleri sıralayarak cümleyi kur.",
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
  // Never mutated by a test: the right-item removal spec needs a pristine
  // mapping, and this mock's state is shared by every spec in the run.
  109: {
    id: 109,
    type: "matching",
    topic_id: 2,
    difficulty: 2,
    content: {
      instruction: "Terimleri karşılıklarıyla eşleştir.",
      left: [
        { id: "l1", text: "Yuğ" },
        { id: "l2", text: "Toy" },
      ],
      right: [
        { id: "r1", text: "Cenaze töreni" },
        { id: "r2", text: "Şölen" },
        { id: "r3", text: "Boy birliği" },
      ],
    },
    answer_key: { pairs: { l1: "r1", l2: "r2" }, partial_credit: false },
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
  108: {
    id: 108,
    type: "diagram_label",
    topic_id: 2,
    difficulty: 4,
    content: {
      diagram_url: "https://cdn.example.test/diyagram.svg",
      slots: [{ id: "s1", label: "Kalp" }],
    },
    answer_key: { labels: { s1: "Kalp" } },
    explanation: null,
    applicable_scopes: ["ayt"],
    status: "published",
    version: 1,
    stats: {
      attempts: 2,
      correct_rate: 50,
      avg_seconds: null,
      needs_review: false,
    },
  },
};

/** Every editable type keeps a readable list preview. */
function previewOf(detail) {
  if (detail.type === "true_false") return detail.content.statement;
  if (detail.type === "fill_blank") return detail.content.template;
  if (detail.type === "flashcard") return detail.content.front;
  if (detail.type === "matching") {
    // MatchingValidator never requires an instruction, so the preview falls
    // back to the left column exactly as the real backend does.
    return (
      detail.content.instruction ??
      detail.content.left.map((item) => item.text).join(" · ")
    );
  }
  if (detail.type === "ordering" || detail.type === "word_order") {
    return detail.content.instruction;
  }
  if (detail.type === "image_hotspot" || detail.type === "diagram_label") {
    return "(önizleme yok)";
  }
  return detail.content.stem;
}

/** The answer key shape differs per type; `false` is a real answer. */
function answerKeyChanged(current, next) {
  if ("pairs" in next || "pairs" in current) {
    // partial_credit is part of the answer key the grader reads, so flipping
    // it is an answer-key change.
    return (
      JSON.stringify(current.pairs) !== JSON.stringify(next.pairs) ||
      Boolean(current.partial_credit) !== Boolean(next.partial_credit)
    );
  }
  if ("order" in next || "order" in current) {
    return JSON.stringify(current.order) !== JSON.stringify(next.order);
  }
  if ("self_assessed" in next || "self_assessed" in current) {
    // Flashcards carry no author-editable answer.
    return false;
  }
  if ("tolerance" in next || "tolerance" in current) {
    return current.value !== next.value || current.tolerance !== next.tolerance;
  }
  if ("blanks" in next || "blanks" in current) {
    return JSON.stringify(current.blanks) !== JSON.stringify(next.blanks);
  }
  if ("value" in next || "value" in current) {
    return current.value !== next.value;
  }
  return current.correct_option_id !== next.correct_option_id;
}

let nextExerciseId = 201;

const UNIT_TITLES = Object.fromEntries(
  Object.values(UNITS)
    .flat()
    .map((unit) => [unit.id, unit.title]),
);

function send(response, status, body) {
  const payload = body === null ? "" : JSON.stringify(body);

  response.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(payload),
  });
  response.end(payload);
}

function envelope(data) {
  return { data, meta: { server_time: new Date().toISOString() } };
}

function adminForRequest(request) {
  const authorization = request.headers.authorization;
  if (authorization === `Bearer ${E2E_BACKEND_TOKEN}`) return ADMIN;
  if (authorization === `Bearer ${REVIEWER_TOKEN}`) return REVIEWER;
  return null;
}

function readBody(request) {
  return new Promise((resolve) => {
    let raw = "";

    request.on("data", (chunk) => {
      raw += chunk;
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${PORT}`);

  if (request.method === "GET" && url.pathname === "/health") {
    send(response, 200, { status: "ok" });
    return;
  }

  if (
    request.method === "POST" &&
    url.pathname === "/api/admin/v1/auth/login"
  ) {
    const body = await readBody(request);

    if (body.password === VALID_PASSWORD && body.email === VALID_EMAIL) {
      send(response, 200, envelope({ token: E2E_BACKEND_TOKEN, admin: ADMIN }));
      return;
    }

    if (body.password === VALID_PASSWORD && body.email === REVIEWER.email) {
      send(response, 200, envelope({ token: REVIEWER_TOKEN, admin: REVIEWER }));
      return;
    }

    // Laravel's validation error shape; unknown email and wrong password are
    // deliberately indistinguishable, exactly as the real backend behaves.
    send(response, 422, {
      message: "The given data was invalid.",
      errors: { email: ["E-posta veya şifre hatalı."] },
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/admin/v1/courses") {
    if (adminForRequest(request) === null) {
      send(response, 401, { message: "Unauthenticated." });
      return;
    }

    send(response, 200, envelope(COURSES));
    return;
  }

  const unitsMatch = /^\/api\/admin\/v1\/courses\/(\d+)\/units$/.exec(
    url.pathname,
  );

  if (request.method === "GET" && unitsMatch !== null) {
    if (adminForRequest(request) === null) {
      send(response, 401, { message: "Unauthenticated." });
      return;
    }

    const units = UNITS[Number(unitsMatch[1])];

    if (units === undefined) {
      send(response, 404, { message: "Not Found." });
      return;
    }

    send(response, 200, envelope(units));
    return;
  }

  const exercisesMatch = /^\/api\/admin\/v1\/units\/(\d+)\/exercises$/.exec(
    url.pathname,
  );

  if (request.method === "GET" && exercisesMatch !== null) {
    if (adminForRequest(request) === null) {
      send(response, 401, { message: "Unauthenticated." });
      return;
    }

    const unitId = Number(exercisesMatch[1]);
    const all = EXERCISES[unitId];

    if (all === undefined) {
      send(response, 404, { message: "Not Found." });
      return;
    }

    // Only type and status are server-applied, exactly like the real backend.
    const type = url.searchParams.get("type");
    const status = url.searchParams.get("status");
    const exercises = all.filter(
      (exercise) =>
        (type === null || exercise.type === type) &&
        (status === null || exercise.status === status),
    );

    send(
      response,
      200,
      envelope({
        unit: { id: unitId, title: UNIT_TITLES[unitId] ?? "Ünite" },
        exercises,
      }),
    );
    return;
  }

  const topicsMatch = /^\/api\/admin\/v1\/courses\/(\d+)\/topics$/.exec(
    url.pathname,
  );

  if (request.method === "GET" && topicsMatch !== null) {
    if (adminForRequest(request) === null) {
      send(response, 401, { message: "Unauthenticated." });
      return;
    }
    const topics = TOPICS[Number(topicsMatch[1])];
    if (topics === undefined) {
      send(response, 404, { message: "Not Found." });
      return;
    }
    send(response, 200, envelope(topics));
    return;
  }

  const detailMatch = /^\/api\/admin\/v1\/exercises\/(\d+)$/.exec(url.pathname);

  if (request.method === "GET" && detailMatch !== null) {
    if (adminForRequest(request) === null) {
      send(response, 401, { message: "Unauthenticated." });
      return;
    }
    const exercise = EXERCISE_DETAILS[Number(detailMatch[1])];
    if (exercise === undefined) {
      send(response, 404, { message: "Not Found." });
      return;
    }
    send(response, 200, envelope(exercise));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/v1/exercises") {
    if (request.headers.authorization !== `Bearer ${E2E_BACKEND_TOKEN}`) {
      send(response, adminForRequest(request) === null ? 401 : 403, {
        error: { code: "FORBIDDEN", message: "Bu işlem için yetkin yok." },
      });
      return;
    }
    const body = await readBody(request);
    const id = nextExerciseId++;
    const detail = {
      id,
      type: body.type,
      topic_id: body.topic_id,
      difficulty: body.difficulty,
      content: body.content,
      answer_key: body.answer_key,
      explanation: body.explanation,
      applicable_scopes: body.applicable_scopes,
      status: "draft",
      version: 1,
      stats: {
        attempts: 0,
        correct_rate: null,
        avg_seconds: null,
        needs_review: false,
      },
    };
    EXERCISE_DETAILS[id] = detail;
    const unitId = Number(body.owner_unit_id);
    EXERCISES[unitId] ??= [];
    EXERCISES[unitId].push({
      id,
      type: detail.type,
      topic: {
        id: detail.topic_id,
        name:
          TOPICS[1].topics.find((topic) => topic.id === detail.topic_id)
            ?.name ?? "Konu",
      },
      difficulty: detail.difficulty,
      status: detail.status,
      version: detail.version,
      scopes: detail.applicable_scopes,
      preview: previewOf(detail),
      stats: detail.stats,
    });
    send(response, 201, envelope({ id, status: "draft" }));
    return;
  }

  if (request.method === "PATCH" && detailMatch !== null) {
    if (request.headers.authorization !== `Bearer ${E2E_BACKEND_TOKEN}`) {
      send(response, adminForRequest(request) === null ? 401 : 403, {
        error: { code: "FORBIDDEN", message: "Bu işlem için yetkin yok." },
      });
      return;
    }
    const id = Number(detailMatch[1]);
    const current = EXERCISE_DETAILS[id];
    if (current === undefined) {
      send(response, 404, { message: "Not Found." });
      return;
    }
    const body = await readBody(request);
    const answerChanged = answerKeyChanged(current.answer_key, body.answer_key);
    Object.assign(current, body, { version: current.version + 1 });
    for (const exercises of Object.values(EXERCISES)) {
      const row = exercises.find((exercise) => exercise.id === id);
      if (row !== undefined)
        Object.assign(row, {
          preview: previewOf(current),
          version: current.version,
        });
    }
    send(
      response,
      200,
      envelope({
        id,
        version: current.version,
        ...(answerChanged ? { answer_key_changed: true } : {}),
        ...(answerChanged && current.status === "published"
          ? { warning: "Cevap anahtarı değişti; bu soru daha önce çözülmüştü." }
          : {}),
      }),
    );
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/admin/v1/me") {
    const admin = adminForRequest(request);
    if (admin === null) {
      send(response, 401, { message: "Unauthenticated." });
      return;
    }

    send(
      response,
      200,
      envelope({
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        role_label: admin.role_label,
      }),
    );
    return;
  }

  send(response, 404, { message: "Not Found." });
});

server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(`mock backend listening on http://127.0.0.1:${PORT}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
