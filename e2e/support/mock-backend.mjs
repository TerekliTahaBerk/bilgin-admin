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

// Test-only credentials. These are not real credentials for any environment.
const VALID_EMAIL = "editor@bilgin.test";
const VALID_PASSWORD = "test-password";

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
  13: [],
  31: [],
};

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

    if (body.email === VALID_EMAIL && body.password === VALID_PASSWORD) {
      send(response, 200, envelope({ token: E2E_BACKEND_TOKEN, admin: ADMIN }));
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
    if (request.headers.authorization !== `Bearer ${E2E_BACKEND_TOKEN}`) {
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
    if (request.headers.authorization !== `Bearer ${E2E_BACKEND_TOKEN}`) {
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
    if (request.headers.authorization !== `Bearer ${E2E_BACKEND_TOKEN}`) {
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

  if (request.method === "GET" && url.pathname === "/api/admin/v1/me") {
    if (request.headers.authorization !== `Bearer ${E2E_BACKEND_TOKEN}`) {
      send(response, 401, { message: "Unauthenticated." });
      return;
    }

    send(
      response,
      200,
      envelope({
        id: ADMIN.id,
        name: ADMIN.name,
        email: ADMIN.email,
        role: ADMIN.role,
        role_label: ADMIN.role_label,
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
