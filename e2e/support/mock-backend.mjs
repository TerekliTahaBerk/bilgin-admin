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
