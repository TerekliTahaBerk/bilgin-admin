/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/test/dom-setup";

import type { Course } from "@/contracts/admin/content";
import { createSafeAdmin } from "@/test/fixtures/safe-admin";
import { validCoursesResponse } from "@/test/fixtures/courses-api";

const getCourses = vi.fn<() => Promise<Course[]>>();

vi.mock("@/features/content/content-client", () => ({
  getCourses: () => getCourses(),
}));

const { CommandPalette } =
  await import("@/components/app-shell/command-palette");

const courses = validCoursesResponse.data as Course[];

const fullAccessAdmin = createSafeAdmin({
  edit_content: true,
  edit_curriculum: true,
});

function renderPalette(admin = fullAccessAdmin) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <CommandPalette admin={admin} />
    </QueryClientProvider>,
  );
}

function triggerButton() {
  return screen.getByRole("button", { name: "Panelde ara" });
}

beforeEach(() => {
  getCourses.mockReset();
  getCourses.mockResolvedValue(courses);
});

describe("CommandPalette trigger", () => {
  it("renders a discoverable trigger with the keyboard hint", () => {
    renderPalette();

    expect(triggerButton()).toBeDefined();
    expect(screen.getByText("⌘K")).toBeDefined();
  });

  it("fetches nothing until the palette is opened", async () => {
    renderPalette();

    // A small delay would let a stray effect fire; there is none to wait for.
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(getCourses).not.toHaveBeenCalled();
  });
});

describe("CommandPalette opening", () => {
  it("opens on click and focuses the search input", async () => {
    const user = userEvent.setup();
    renderPalette();

    await user.click(triggerButton());

    const input = await screen.findByLabelText("Ders veya sayfa ara");
    expect(input).toBe(document.activeElement);
  });

  it("opens on the ⌘K shortcut without clicking the trigger", async () => {
    const user = userEvent.setup();
    renderPalette();

    await user.keyboard("{Meta>}k{/Meta}");

    expect(await screen.findByRole("dialog")).toBeDefined();
  });

  it("closes on Escape and clears what was typed", async () => {
    const user = userEvent.setup();
    renderPalette();

    await user.click(triggerButton());
    const input = await screen.findByLabelText("Ders veya sayfa ara");
    await user.type(input, "fizik");

    await user.keyboard("{Escape}");

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    await user.click(triggerButton());
    const reopenedInput = (await screen.findByLabelText(
      "Ders veya sayfa ara",
    )) as HTMLInputElement;
    expect(reopenedInput.value).toBe("");
  });

  it("closes when the backdrop is clicked", async () => {
    const user = userEvent.setup();
    renderPalette();

    await user.click(triggerButton());
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: "Aramayı kapat" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });
});

describe("CommandPalette results", () => {
  it("lists every navigation page the admin can use, once opened", async () => {
    const user = userEvent.setup();
    renderPalette();

    await user.click(triggerButton());
    const dialog = await screen.findByRole("dialog");

    expect(dialog.textContent).toContain("Ana Sayfa");
    expect(dialog.textContent).toContain("İçerik");
    expect(dialog.textContent).toContain("JSON İçe Aktar");
    expect(dialog.textContent).toContain("Müfredat");
    expect(dialog.textContent).toContain("Yöneticiler");
  });

  it("hides pages the admin's abilities do not allow", async () => {
    const user = userEvent.setup();
    renderPalette(createSafeAdmin({}));

    await user.click(triggerButton());
    const dialog = await screen.findByRole("dialog");

    expect(dialog.textContent).toContain("Ana Sayfa");
    expect(dialog.textContent).not.toContain("JSON İçe Aktar");
    expect(dialog.textContent).not.toContain("Müfredat");
    expect(dialog.textContent).not.toContain("Yöneticiler");
  });

  it("lists courses once they load", async () => {
    const user = userEvent.setup();
    renderPalette();

    await user.click(triggerButton());

    expect(await screen.findByText("TYT Türkçe")).toBeDefined();
    expect(screen.getByText("tyt_turkce")).toBeDefined();
  });

  it("filters both pages and courses by the typed query", async () => {
    const user = userEvent.setup();
    renderPalette();

    await user.click(triggerButton());
    await screen.findByText("TYT Türkçe");

    const input = screen.getByLabelText("Ders veya sayfa ara");
    await user.type(input, "fizik");

    expect(screen.getByText("AYT Fizik")).toBeDefined();
    expect(screen.queryByText("TYT Türkçe")).toBeNull();
    expect(screen.queryByText("Ana Sayfa")).toBeNull();
  });

  it("matches Turkish uppercase İ typed as a plain i", async () => {
    const user = userEvent.setup();
    renderPalette();

    await user.click(triggerButton());
    await screen.findByText("YDT İngilizce");

    await user.type(screen.getByLabelText("Ders veya sayfa ara"), "ingilizce");

    expect(screen.getByText("YDT İngilizce")).toBeDefined();
  });

  it("shows a real empty state for a query that matches nothing", async () => {
    const user = userEvent.setup();
    renderPalette();

    await user.click(triggerButton());
    await screen.findByText("TYT Türkçe");

    await user.type(
      screen.getByLabelText("Ders veya sayfa ara"),
      "olmayan-bir-sey",
    );

    expect(await screen.findByText("Sonuç bulunamadı.")).toBeDefined();
  });

  it("closes the palette after a result is chosen", async () => {
    const user = userEvent.setup();
    renderPalette();

    await user.click(triggerButton());
    await user.click(await screen.findByText("TYT Türkçe"));

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
    });
  });
});
