import { sealData } from "iron-session";
import { describe, expect, it } from "vitest";

import type { SafeAdmin } from "@/contracts/admin/session";
import {
  DEVELOPMENT_SESSION_COOKIE_NAME,
  PRODUCTION_SESSION_COOKIE_NAME,
  SESSION_COOKIE_SIZE_LIMIT_BYTES,
  SESSION_VALIDATION_WINDOW_MS,
  createSessionCookiePolicy,
  getSessionCryptoOptions,
  sessionMaxAgeSeconds,
} from "@/lib/session/config";
import { unsealAdminSession } from "@/lib/session/read";
import { createAdminSessionSchema } from "@/lib/session/schema";
import {
  isSessionValidationFresh,
  markSessionValidated,
} from "@/lib/session/validate";
import {
  createAdminSessionPayload,
  sealAdminSession,
} from "@/lib/session/write";

const NOW = 1_800_000_000_000;
const OTHER_TEST_SECRET =
  "another-test-session-secret-that-is-at-least-32-characters";

const representativeAdmin: SafeAdmin = {
  id: "3eaa9588-9307-43d7-9021-6f6a330ce50d",
  name: "Test İçerik Editörü",
  email: "editor@example.test",
  role: "content_editor",
  roleLabel: "İçerik Editörü",
  abilities: {
    edit_content: true,
    publish_content: false,
    edit_curriculum: false,
    view_users: false,
  },
};

function createRepresentativeSession(now = NOW) {
  return createAdminSessionPayload(
    {
      backendToken: "test-admin-token",
      admin: representativeAdmin,
    },
    now,
  );
}

describe("AdminSession schema", () => {
  const schema = createAdminSessionSchema(sessionMaxAgeSeconds);

  it("accepts a valid version 1 session", () => {
    expect(schema.safeParse(createRepresentativeSession()).success).toBe(true);
  });

  it("rejects version 2", () => {
    expect(
      schema.safeParse({ ...createRepresentativeSession(), version: 2 })
        .success,
    ).toBe(false);
  });

  it("rejects a missing backend token", () => {
    expect(
      schema.safeParse({
        ...createRepresentativeSession(),
        backendToken: undefined,
      }).success,
    ).toBe(false);
  });

  it("rejects a missing safe admin snapshot", () => {
    expect(
      schema.safeParse({ ...createRepresentativeSession(), admin: undefined })
        .success,
    ).toBe(false);
  });

  it("rejects issuedAt later than validatedAt", () => {
    const session = createRepresentativeSession();

    expect(
      schema.safeParse({ ...session, validatedAt: session.issuedAt - 1 })
        .success,
    ).toBe(false);
  });

  it("rejects validatedAt later than expiresAt", () => {
    const session = createRepresentativeSession();

    expect(
      schema.safeParse({ ...session, validatedAt: session.expiresAt + 1 })
        .success,
    ).toBe(false);
  });

  it("rejects a lifetime over the configured maximum", () => {
    const oneHourSchema = createAdminSessionSchema(3600);
    const session = createRepresentativeSession();

    expect(oneHourSchema.safeParse(session).success).toBe(false);
  });

  it("rejects a schema max age over eight hours", () => {
    expect(() => createAdminSessionSchema(28801)).toThrow(RangeError);
  });

  it("rejects non-integer millisecond timestamps", () => {
    expect(
      schema.safeParse({
        ...createRepresentativeSession(),
        issuedAt: NOW + 0.5,
      }).success,
    ).toBe(false);
  });
});

describe("session payload creation", () => {
  it("creates the frozen version and absolute lifetime", () => {
    const session = createRepresentativeSession();

    expect(session).toEqual({
      version: 1,
      backendToken: "test-admin-token",
      admin: representativeAdmin,
      issuedAt: NOW,
      validatedAt: NOW,
      expiresAt: NOW + sessionMaxAgeSeconds * 1000,
    });
  });
});

describe("session sealing", () => {
  it("roundtrips a valid session", async () => {
    const session = createRepresentativeSession();
    const seal = await sealAdminSession(session);

    await expect(unsealAdminSession(seal, NOW)).resolves.toEqual(session);
  });

  it("does not expose the raw backend token or admin PII", async () => {
    const seal = await sealAdminSession(createRepresentativeSession());

    expect(seal).not.toContain("test-admin-token");
    expect(seal).not.toContain(representativeAdmin.email);
    expect(seal).not.toContain(representativeAdmin.name);
  });

  it("fails closed for a tampered seal", async () => {
    const seal = await sealAdminSession(createRepresentativeSession());
    const replacement = seal[10] === "a" ? "b" : "a";
    const tampered = `${seal.slice(0, 10)}${replacement}${seal.slice(11)}`;

    await expect(unsealAdminSession(tampered, NOW)).resolves.toBeNull();
  });

  it("fails closed for malformed and empty seals", async () => {
    await expect(unsealAdminSession("not-a-seal", NOW)).resolves.toBeNull();
    await expect(unsealAdminSession("", NOW)).resolves.toBeNull();
    await expect(unsealAdminSession("   ", NOW)).resolves.toBeNull();
  });

  it("fails closed for a seal encrypted with another key", async () => {
    const seal = await sealData(createRepresentativeSession(), {
      password: OTHER_TEST_SECRET,
      ttl: sessionMaxAgeSeconds,
    });

    await expect(unsealAdminSession(seal, NOW)).resolves.toBeNull();
  });

  it("fails closed for an unsupported payload version", async () => {
    const seal = await sealData(
      { ...createRepresentativeSession(), version: 2 },
      getSessionCryptoOptions(),
    );

    await expect(unsealAdminSession(seal, NOW)).resolves.toBeNull();
  });

  it("fails closed when the local payload expiry is reached", async () => {
    const issuedAt = NOW - sessionMaxAgeSeconds * 1000;
    const seal = await sealAdminSession(createRepresentativeSession(issuedAt));

    await expect(unsealAdminSession(seal, NOW)).resolves.toBeNull();
  });

  it("accepts a payload immediately before local expiry", async () => {
    const session = createRepresentativeSession();
    const seal = await sealAdminSession(session);

    await expect(
      unsealAdminSession(seal, session.expiresAt - 1),
    ).resolves.toEqual(session);
  });

  it("keeps the representative cookie below the size budget", async () => {
    const seal = await sealAdminSession(createRepresentativeSession());
    const cookieBytes = new TextEncoder().encode(
      `${PRODUCTION_SESSION_COOKIE_NAME}=${seal}`,
    ).byteLength;

    expect(cookieBytes).toBeLessThan(SESSION_COOKIE_SIZE_LIMIT_BYTES);
  });
});

describe("session validation freshness", () => {
  const session = createRepresentativeSession();

  it("is fresh below five minutes", () => {
    expect(
      isSessionValidationFresh(
        session,
        session.validatedAt + SESSION_VALIDATION_WINDOW_MS - 1,
      ),
    ).toBe(true);
  });

  it("is stale at the five-minute boundary", () => {
    expect(
      isSessionValidationFresh(
        session,
        session.validatedAt + SESSION_VALIDATION_WINDOW_MS,
      ),
    ).toBe(false);
  });

  it("is stale above five minutes", () => {
    expect(
      isSessionValidationFresh(
        session,
        session.validatedAt + SESSION_VALIDATION_WINDOW_MS + 1,
      ),
    ).toBe(false);
  });

  it("updates validatedAt without extending absolute expiry", () => {
    const refreshed = markSessionValidated(session, session.validatedAt + 1000);

    expect(refreshed.validatedAt).toBe(session.validatedAt + 1000);
    expect(refreshed.issuedAt).toBe(session.issuedAt);
    expect(refreshed.expiresAt).toBe(session.expiresAt);
    expect(refreshed.backendToken).toBe(session.backendToken);
    expect(refreshed.admin).toEqual(session.admin);
  });
});

describe("session cookie policy", () => {
  it("uses an HTTP-compatible development cookie", () => {
    const policy = createSessionCookiePolicy("development", 3600);

    expect(policy).toEqual({
      name: DEVELOPMENT_SESSION_COOKIE_NAME,
      options: {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        path: "/",
        maxAge: 3600,
      },
    });
    expect(policy.options).not.toHaveProperty("domain");
  });

  it("enforces __Host- requirements in production", () => {
    const policy = createSessionCookiePolicy("production", 28800);

    expect(policy).toEqual({
      name: PRODUCTION_SESSION_COOKIE_NAME,
      options: {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 28800,
      },
    });
    expect(policy.options).not.toHaveProperty("domain");
    expect(policy).not.toHaveProperty("chunk");
    expect(Object.isFrozen(policy)).toBe(true);
    expect(Object.isFrozen(policy.options)).toBe(true);
  });
});
