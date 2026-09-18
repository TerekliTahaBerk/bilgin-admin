import { sealData } from "iron-session";

export const E2E_APP_PORT = Number(process.env.E2E_APP_PORT ?? 3100);
export const E2E_MOCK_BACKEND_PORT = Number(
  process.env.MOCK_BACKEND_PORT ?? 8787,
);
export const E2E_BASE_URL = `http://localhost:${E2E_APP_PORT}`;
export const E2E_SESSION_SECRET =
  "e2e-session-secret-that-is-at-least-32-characters-long";
export const E2E_SESSION_COOKIE = "bilgin_admin_session";

// Test-only credentials served by e2e/support/mock-backend.mjs.
export const E2E_EMAIL = "editor@bilgin.test";
export const E2E_PASSWORD = "test-password";
export const E2E_REVIEWER_EMAIL = "reviewer@bilgin.test";
export const E2E_WRONG_PASSWORD = "wrong-password";

export const E2E_ADMIN_NAME = "Taha Berk";

/** Mirrors the COURSES fixture served by e2e/support/mock-backend.mjs. */
export const E2E_COURSES = [
  {
    code: "tyt_turkce",
    name: "TYT Türkçe",
    scope: "TYT",
    status: "Yayında",
    unitCount: 2,
  },
  {
    code: "tyt_matematik",
    name: "TYT Temel Matematik",
    scope: "TYT",
    status: "Taslak",
    unitCount: 0,
  },
  {
    code: "ayt_fizik",
    name: "AYT Fizik",
    scope: "AYT",
    status: "İncelemede",
    unitCount: 1,
  },
  {
    code: "ydt_ingilizce",
    name: "YDT İngilizce",
    scope: "YDT",
    status: "Arşiv",
    unitCount: 0,
  },
] as const;

/** Mirrors the UNITS fixture served by e2e/support/mock-backend.mjs. */
export const E2E_COURSE_WITH_UNITS_ID = 1;
export const E2E_COURSE_WITHOUT_UNITS_ID = 2;
export const E2E_MISSING_COURSE_ID = 999999;
export const E2E_UNITS = [
  {
    title: "İlk ve Orta Çağlarda Türk Dünyası",
    grade: "9. sınıf",
    status: "Yayında",
    access: "Ücretsiz",
    nodes: "6 adım",
    exercises: "44 soru",
  },
  {
    title: "Tarih ve Zaman",
    grade: "12. sınıf",
    status: "İncelemede",
    access: "Premium",
    nodes: "4 adım",
    exercises: "12 soru",
  },
  {
    title: "Hazırlanıyor",
    grade: null,
    status: "Taslak",
    access: "Ücretsiz",
    nodes: "0 adım",
    exercises: "Soru bekliyor",
  },
] as const;
export const E2E_ADMIN_ROLE_LABEL = "İçerik Editörü";

/**
 * Builds a structurally valid seal whose payload has already expired, so the
 * server rejects it even though the browser still sends the cookie. The app's
 * own session helpers stay server-side: this only reuses iron-session.
 */
export function sealExpiredSession(): Promise<string> {
  const issuedAt = Date.now() - 9 * 60 * 60 * 1000;

  return sealData(
    {
      version: 1,
      backendToken: "expired-e2e-backend-token",
      admin: {
        id: "01a0ab9b-0000-4000-8000-00000000ed17",
        name: E2E_ADMIN_NAME,
        email: E2E_EMAIL,
        role: "content_editor",
        roleLabel: E2E_ADMIN_ROLE_LABEL,
        abilities: {
          edit_content: true,
          publish_content: false,
          edit_curriculum: false,
          view_users: false,
        },
      },
      issuedAt,
      validatedAt: issuedAt,
      expiresAt: issuedAt + 28800 * 1000,
    },
    { password: E2E_SESSION_SECRET, ttl: 0 },
  );
}

/** Mirrors the EXERCISES fixture served by e2e/support/mock-backend.mjs. */
export const E2E_UNIT_WITH_EXERCISES_ID = 11;
export const E2E_UNIT_WITHOUT_EXERCISES_ID = 12;
export const E2E_MISSING_UNIT_ID = 999999;
export const E2E_EXERCISES = [
  {
    preview: "Orhun Yazıtları hangi Türk devletine aittir?",
    type: "Çoktan Seçmeli",
    topic: "İlk Türk Devletleri",
    status: "Yayında",
    needsReview: false,
  },
  {
    preview: "Uygurlar yerleşik hayata geçen ilk Türk devletidir.",
    type: "Doğru / Yanlış",
    topic: "İlk Türk Devletleri",
    status: "Taslak",
    needsReview: true,
  },
  {
    preview: "Yazısız hukuk kurallarına {{0}} denir.",
    type: "Boşluk Doldurma",
    topic: "Kültür ve Medeniyet",
    status: "İncelemede",
    needsReview: false,
  },
  {
    preview: "Kavramı karşılığıyla birleştir.",
    type: "Eşleştirme",
    topic: "Kültür ve Medeniyet",
    status: "Arşiv",
    needsReview: true,
  },
  {
    preview: "(önizleme yok)",
    type: "Görsel Bölge",
    topic: "Kültür ve Medeniyet",
    status: "Yayında",
    needsReview: false,
  },
] as const;
