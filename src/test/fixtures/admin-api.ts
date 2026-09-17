export const validEditorLoginResponse = {
  data: {
    token: "test-admin-token",
    admin: {
      id: "3eaa9588-9307-43d7-9021-6f6a330ce50d",
      name: "Test Editör",
      email: "editor@example.test",
      role: "content_editor",
      role_label: "İçerik Editörü",
      abilities: {
        edit_content: true,
        publish_content: false,
        edit_curriculum: false,
        view_users: false,
      },
    },
  },
  meta: {
    server_time: "2026-09-14T10:00:00+03:00",
  },
};

export const validAdminMeResponse = {
  data: {
    id: "3eaa9588-9307-43d7-9021-6f6a330ce50d",
    name: "Test Editör",
    email: "editor@example.test",
    role: "content_editor",
    role_label: "İçerik Editörü",
  },
  meta: {
    server_time: "2026-09-14T10:00:00+03:00",
  },
};

export const laravelCredentialValidationError = {
  message: "The given data was invalid.",
  errors: {
    email: ["E-posta veya şifre hatalı."],
  },
};

export const customForbiddenError = {
  error: {
    code: "FORBIDDEN",
    message: "Bu işlem için yetkin yok.",
  },
};

export const customDomainValidationError = {
  error: {
    code: "TOPIC_MISMATCH",
    message: "Konu seçilen dersle eşleşmiyor.",
    details: {
      course_code: "tyt_cografya",
    },
  },
};

export const malformedAdminResponse = {
  data: {
    token: "raw-token-must-not-leak",
  },
  password: "raw-password-must-not-leak",
};
