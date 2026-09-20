/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/test/dom-setup";

const push = vi.fn();
const getUnitTemplates = vi.fn();
const createUnit = vi.fn();
const importContent = vi.fn();
const getCurriculumOptions = vi.fn();
const getCurriculumMapping = vi.fn();
const updateCurriculum = vi.fn();
const getAdminAccounts = vi.fn();
const createAdminAccount = vi.fn();
const updateAdminAccount = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/features/content/content-queries", () => ({
  coursesQueryKey: ["content", "courses"],
  courseUnitsQueryKey: (id: number) => ["content", "courses", id, "units"],
  coursesQueryOptions: () => ({
    queryKey: ["content", "courses"],
    queryFn: () =>
      Promise.resolve([
        { id: 1, code: "tyt_tarih", name: "TYT Tarih", status: "published" },
        { id: 2, code: "tyt_fizik", name: "TYT Fizik", status: "draft" },
      ]),
  }),
  courseTopicsQueryOptions: () => ({
    queryKey: ["content", "courses", 1, "topics"],
    queryFn: () => Promise.resolve({ topics: [{ id: 3, name: "Tarih" }] }),
  }),
}));
vi.mock("@/features/workflows/workflow-client", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/features/workflows/workflow-client")
    >();
  return {
    ...actual,
    getUnitTemplates,
    createUnit,
    importContent,
    getCurriculumOptions,
    getCurriculumMapping,
    updateCurriculum,
    getAdminAccounts,
    createAdminAccount,
    updateAdminAccount,
  };
});

const { UnitCreateForm } =
  await import("@/features/workflows/unit-create-form");
const { ContentImport } = await import("@/features/workflows/content-import");
const { CurriculumManager } =
  await import("@/features/workflows/curriculum-manager");
const { AdminManager } = await import("@/features/workflows/admin-manager");

function renderWithQuery(ui: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

const abilities = {
  edit_content: true,
  publish_content: true,
  edit_curriculum: true,
  view_users: true,
};

beforeEach(() => {
  push.mockReset();
  getUnitTemplates.mockReset().mockResolvedValue([
    {
      code: "standard",
      name: "Standart",
      description: null,
      is_default: true,
      nodes: [
        {
          title: "Çalışma",
          type: "study",
          difficulty: "medium",
          exercise_count: 6,
        },
      ],
    },
  ]);
  createUnit.mockReset().mockResolvedValue({
    id: 42,
    title: "Yeni Ünite",
    status: "draft",
    nodes: [
      {
        id: 1,
        title: "Çalışma",
        type: "study",
        exercise_count: 6,
        xp_reward: 10,
      },
    ],
  });
  importContent.mockReset().mockResolvedValue({
    unit_id: 42,
    unit_title: "Yeni Ünite",
    topics: 1,
    nodes: 1,
    exercises: 1,
  });
  getCurriculumOptions.mockReset().mockResolvedValue({
    variants: [
      {
        id: 7,
        exam_id: 4,
        code: "say",
        name: "Sayısal",
        field_code: "say",
        sort_order: 1,
        is_active: true,
      },
    ],
    sections: [
      { id: 9, exam_id: 4, code: "tyt", name: "TYT", sort_order: 1 },
      {
        id: 10,
        exam_id: 99,
        code: "other",
        name: "Başka sınav",
        sort_order: 1,
      },
    ],
  });
  getCurriculumMapping.mockReset().mockResolvedValue({
    exam_variant: { code: "say", name: "Sayısal" },
    courses: [
      {
        course_id: 1,
        code: "tyt_tarih",
        name: "TYT Tarih",
        status: "published",
        section_code: "tyt",
        exam_section_id: 9,
        sort_order: 1,
        access: "free",
        exam_weight: 20,
        is_required: true,
      },
    ],
  });
  updateCurriculum
    .mockReset()
    .mockResolvedValue({ exam_variant: "say", course_count: 1 });
  getAdminAccounts.mockReset().mockResolvedValue({
    roles: [
      { value: "super_admin", label: "Süper Yönetici", abilities },
      {
        value: "content_editor",
        label: "İçerik Editörü",
        abilities: {
          ...abilities,
          publish_content: false,
          edit_curriculum: false,
          view_users: false,
        },
      },
    ],
    admins: [
      {
        id: "01a0ab9b-0000-4000-8000-000000005a5a",
        name: "Ben",
        email: "me@bilgin.test",
        role: "super_admin",
        role_label: "Süper Yönetici",
        is_active: true,
        last_login_at: null,
      },
      {
        id: "01a0ab9b-0000-4000-8000-00000000beef",
        name: "İkinci",
        email: "other@bilgin.test",
        role: "content_editor",
        role_label: "İçerik Editörü",
        is_active: true,
        last_login_at: null,
      },
    ],
  });
  createAdminAccount.mockReset().mockResolvedValue({
    id: "01a0ab9b-0000-4000-8000-00000000feed",
    email: "new@bilgin.test",
    role: "content_editor",
  });
  updateAdminAccount.mockReset().mockResolvedValue({
    id: "01a0ab9b-0000-4000-8000-00000000beef",
    role: "content_editor",
    is_active: false,
  });
});

describe("remaining workflow components", () => {
  it("previews a template, derives the course code, and navigates after unit creation", async () => {
    const user = userEvent.setup();
    renderWithQuery(<UnitCreateForm courseId={1} />);
    await user.type(await screen.findByLabelText("Başlık"), "Yeni Ünite");
    await user.selectOptions(screen.getByLabelText("Şablon"), "standard");
    expect(
      screen.getByText(/Çalışma · study · zorluk medium · 6 soru/),
    ).toBeDefined();
    await user.click(screen.getByLabelText("Tarih"));
    await user.click(screen.getByRole("button", { name: "Üniteyi oluştur" }));
    await waitFor(() =>
      expect(createUnit.mock.calls[0]?.[0]).toEqual(
        expect.objectContaining({
          course_code: "tyt_tarih",
          template_code: "standard",
          topic_ids: [3],
        }),
      ),
    );
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/courses/1/units/42"),
    );
  });

  it("parses pasted JSON, hides answer keys, and shows the import success summary", async () => {
    const user = userEvent.setup();
    renderWithQuery(<ContentImport />);
    const packageJson = JSON.stringify({
      course: "tyt_tarih",
      subject: "tarih",
      unit: { title: "Yeni Ünite", template: "standard" },
      topics: [{ code: "tarih" }],
      exercises: [
        { type: "multiple_choice", answer_key: { correct: "secret" } },
      ],
    });
    await user.click(screen.getByLabelText(/JSON yapıştırın/));
    await user.paste(packageJson);
    expect(screen.getByText("Yeni Ünite")).toBeDefined();
    expect(screen.queryByText("secret")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Paketi içe aktar" }));
    expect(await screen.findByText("Yeni Ünite içe aktarıldı.")).toBeDefined();
    expect(importContent.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ course: "tyt_tarih" }),
    );
  });

  it("filters sections by exam id and saves the complete curriculum list", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderWithQuery(<CurriculumManager />);
    await screen.findByRole("option", { name: /Sayısal/ });
    await user.selectOptions(screen.getByLabelText("Sınav varyantı"), "7");
    const table = await screen.findByRole("table");
    expect(within(table).getByRole("option", { name: "TYT" })).toBeDefined();
    expect(
      within(table).queryByRole("option", { name: "Başka sınav" }),
    ).toBeNull();
    await user.click(within(table).getByRole("button", { name: "Kaldır" }));
    expect(screen.getByText(/1 kaldırıldı/)).toBeDefined();
    expect(
      (
        screen.getByRole("button", {
          name: "Tam listeyi kaydet",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    await user.selectOptions(screen.getByLabelText("Eklenecek ders"), "2");
    await user.click(
      screen.getByRole("button", { name: "Tam listeyi kaydet" }),
    );
    await waitFor(() =>
      expect(updateCurriculum.mock.calls[0]?.slice(0, 2)).toEqual([
        7,
        {
          courses: [
            {
              course_id: 2,
              exam_section_id: 9,
              sort_order: 1,
              access: "free",
              exam_weight: null,
              is_required: true,
            },
          ],
        },
      ]),
    );
  });

  it("derives roles from the backend, protects self controls, creates and deactivates another admin", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderWithQuery(
      <AdminManager
        currentAdmin={{
          id: "01a0ab9b-0000-4000-8000-000000005a5a",
          name: "Ben",
          email: "me@bilgin.test",
          role: "super_admin",
          roleLabel: "Süper Yönetici",
          abilities,
        }}
      />,
    );
    expect(await screen.findByText("Kendi hesabınız")).toBeDefined();
    const selfCard = screen.getByText("me@bilgin.test").closest("article")!;
    expect(
      within(selfCard).queryByRole("button", { name: "Pasif yap" }),
    ).toBeNull();
    await user.type(screen.getByPlaceholderText("Ad soyad"), "Yeni");
    await user.type(screen.getByPlaceholderText("E-posta"), "new@bilgin.test");
    await user.type(
      screen.getByPlaceholderText("En az 12 karakter parola"),
      "very-safe-pass",
    );
    await user.selectOptions(
      screen.getByRole("combobox", { name: "" }),
      "content_editor",
    );
    await user.click(screen.getByRole("button", { name: "Yönetici oluştur" }));
    await waitFor(() =>
      expect(createAdminAccount.mock.calls[0]?.[0]).toEqual({
        name: "Yeni",
        email: "new@bilgin.test",
        password: "very-safe-pass",
        role: "content_editor",
      }),
    );
    expect(
      (
        screen.getByPlaceholderText(
          "En az 12 karakter parola",
        ) as HTMLInputElement
      ).value,
    ).toBe("");
    const otherCard = screen.getByText("other@bilgin.test").closest("article")!;
    await user.click(
      within(otherCard).getByRole("button", { name: "Pasif yap" }),
    );
    await waitFor(() =>
      expect(updateAdminAccount.mock.calls[0]?.slice(0, 2)).toEqual([
        "01a0ab9b-0000-4000-8000-00000000beef",
        { is_active: false },
      ]),
    );
  });
});
