/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import "@/test/dom-setup";

import {
  PublishErrorNotice,
  PublishPanel,
  type PublishPanelProps,
} from "@/features/content/publish-panel";

function renderPanel(props: Partial<PublishPanelProps> = {}) {
  const onPublish = vi.fn();

  render(
    <PublishPanel
      canPublish
      isPending={false}
      nodeCount={3}
      onPublish={onPublish}
      {...props}
    />,
  );

  return { onPublish };
}

describe("PublishPanel", () => {
  it("asks for confirmation before publishing", async () => {
    const user = userEvent.setup();
    const { onPublish } = renderPanel({ unitTitle: "Vektörler" });

    await user.click(screen.getByRole("button", { name: "Üniteyi yayınla" }));

    const dialog = screen.getByRole("group", {
      name: "«Vektörler» ünitesini yayınlamak üzeresiniz",
    });
    expect(
      within(dialog).getByText("3 adımın tamamı yayınlanır."),
    ).toBeDefined();
    expect(
      within(dialog).getByText(
        /Sunucu yayından hemen önce tüm adımları yeniden doğrular/,
      ),
    ).toBeDefined();
    expect(onPublish).not.toHaveBeenCalled();

    await user.click(
      within(dialog).getByRole("button", { name: "Evet, yayınla" }),
    );
    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  it("moves focus into the confirmation and back on cancel", async () => {
    const user = userEvent.setup();
    renderPanel({ unitTitle: "Vektörler" });

    await user.click(screen.getByRole("button", { name: "Üniteyi yayınla" }));
    expect(document.activeElement).toBe(
      screen.getByRole("heading", {
        name: "«Vektörler» ünitesini yayınlamak üzeresiniz",
      }),
    );

    await user.click(screen.getByRole("button", { name: "Vazgeç" }));
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Üniteyi yayınla" }),
    );
  });

  it("cancels on Escape without publishing", async () => {
    const user = userEvent.setup();
    const { onPublish } = renderPanel();

    await user.click(screen.getByRole("button", { name: "Üniteyi yayınla" }));
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("group")).toBeNull();
    expect(onPublish).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Üniteyi yayınla" }),
    );
  });

  it("falls back to a generic heading without a unit title", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Üniteyi yayınla" }));

    expect(
      screen.getByRole("heading", { name: "Üniteyi yayınlamak üzeresiniz" }),
    ).toBeDefined();
  });

  it("lists warnings in the confirmation without blocking it", async () => {
    const user = userEvent.setup();
    renderPanel({ warningCount: 2 });

    await user.click(screen.getByRole("button", { name: "Üniteyi yayınla" }));

    expect(screen.getByText(/2 adımda uyarı var/)).toBeDefined();
    expect(
      (
        screen.getByRole("button", {
          name: "Evet, yayınla",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it("explains a disabled button", () => {
    renderPanel({
      canPublish: false,
      disabledReason: "Bloklayan adımlar var.",
    });

    const button = screen.getByRole("button", { name: "Üniteyi yayınla" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.getAttribute("aria-describedby")).toBe(
      screen.getByText("Bloklayan adımlar var.").id,
    );
  });

  it("hides the reason while publishing is possible", () => {
    renderPanel({ disabledReason: "Bloklayan adımlar var." });

    expect(screen.queryByText("Bloklayan adımlar var.")).toBeNull();
  });

  it("shows progress while a publish is in flight", () => {
    renderPanel({ isPending: true });

    const button = screen.getByRole("button", { name: "Yayınlanıyor…" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it("takes a custom button label", () => {
    renderPanel({ buttonLabel: "Üniteyi yeniden yayınla" });

    expect(
      screen.getByRole("button", { name: "Üniteyi yeniden yayınla" }),
    ).toBeDefined();
  });
});

describe("PublishErrorNotice", () => {
  it("links every blocking row to its node", () => {
    render(
      <PublishErrorNotice
        blocking={[
          {
            node_id: 7,
            node_title: "Mini Challenge",
            message: "Kural 2 soru getiriyor.",
          },
        ]}
        error={{
          kind: "validation",
          status: 422,
          message: "Bazı adımlar yetersiz.",
        }}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(within(alert).getByText("Ünite yayınlanamadı")).toBeDefined();
    expect(within(alert).getByText("Bazı adımlar yetersiz.")).toBeDefined();
    expect(
      within(alert)
        .getByRole("link", { name: "Mini Challenge" })
        .getAttribute("href"),
    ).toBe("#node-preview-7");
  });

  it("shows only the message without blocking rows", () => {
    render(
      <PublishErrorNotice
        blocking={[]}
        error={{
          kind: "server",
          status: 500,
          message: "Sunucu hatası oluştu.",
        }}
      />,
    );

    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Sunucu hatası oluştu.")).toBeDefined();
  });
});
