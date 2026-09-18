/**
 * Login response fixtures mirroring the real backend ability matrix
 * (`AdminRole::canEditContent()` and friends in the Laravel admin module).
 *
 * These are TEST DATA only. Production code never derives an ability from a
 * role — it reads the `abilities` snapshot the backend sends.
 */
export type AdminAbilitySnapshot = Readonly<{
  edit_content: boolean;
  publish_content: boolean;
  edit_curriculum: boolean;
  view_users: boolean;
}>;

export type AdminLoginResponseBody = Readonly<{
  data: {
    token: string;
    admin: {
      id: string;
      name: string;
      email: string;
      role: string;
      role_label: string;
      abilities: AdminAbilitySnapshot;
    };
  };
  meta: { server_time: string };
}>;

export type AdminRoleFixture = Readonly<{
  role: string;
  roleLabel: string;
  token: string;
  loginResponse: AdminLoginResponseBody;
}>;

function loginResponse(
  id: string,
  name: string,
  email: string,
  role: string,
  roleLabel: string,
  abilities: AdminAbilitySnapshot,
  token: string,
): AdminLoginResponseBody {
  return {
    data: {
      token,
      admin: {
        id,
        name,
        email,
        role,
        role_label: roleLabel,
        abilities,
      },
    },
    meta: { server_time: "2026-09-16T19:05:20+00:00" },
  };
}

export const contentEditorFixture: AdminRoleFixture = {
  role: "content_editor",
  roleLabel: "İçerik Editörü",
  token: "1|integration-editor-token",
  loginResponse: loginResponse(
    "01a0ab9b-0000-4000-8000-00000000ed17",
    "İçerik Editörü",
    "editor@bilgin.test",
    "content_editor",
    "İçerik Editörü",
    {
      edit_content: true,
      publish_content: false,
      edit_curriculum: false,
      view_users: false,
    },
    "1|integration-editor-token",
  ),
};

export const contentReviewerFixture: AdminRoleFixture = {
  role: "content_reviewer",
  roleLabel: "İçerik Denetçisi",
  token: "2|integration-reviewer-token",
  loginResponse: loginResponse(
    "01a0ab9b-0000-4000-8000-0000000000e5",
    "İçerik Denetçisi",
    "denetci@bilgin.test",
    "content_reviewer",
    "İçerik Denetçisi",
    {
      edit_content: false,
      publish_content: true,
      edit_curriculum: false,
      view_users: false,
    },
    "2|integration-reviewer-token",
  ),
};

export const superAdminFixture: AdminRoleFixture = {
  role: "super_admin",
  roleLabel: "Süper Yönetici",
  token: "3|integration-super-token",
  loginResponse: loginResponse(
    "01a0ab9b-0000-4000-8000-000000005a5a",
    "Süper Yönetici",
    "admin@bilgin.test",
    "super_admin",
    "Süper Yönetici",
    {
      edit_content: true,
      publish_content: true,
      edit_curriculum: true,
      view_users: true,
    },
    "3|integration-super-token",
  ),
};

export const adminRoleFixtures: readonly AdminRoleFixture[] = [
  contentEditorFixture,
  contentReviewerFixture,
  superAdminFixture,
];
