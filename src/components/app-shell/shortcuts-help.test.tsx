/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import "@/test/dom-setup";

import { ShortcutsHelp } from "@/components/app-shell/shortcuts-help";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("ShortcutsHelp", () => {
  it("is closed by default", () => {
    render(<ShortcutsHelp />);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens when the button is clicked", () => {
    render(<ShortcutsHelp />);

    fireEvent.click(screen.getByLabelText("Klavye kısayollarını göster"));

    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.getByText("Kaydet ve aynı bağlamda yeni soru aç")).toBeDefined();
  });

  it("opens on '?' and closes on Escape", () => {
    render(<ShortcutsHelp />);

    fireEvent.keyDown(document, { key: "?" });
    expect(screen.getByRole("dialog")).toBeDefined();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("ignores '?' while typing in a text field", () => {
    render(
      <div>
        <input aria-label="test-input" />
        <ShortcutsHelp />
      </div>,
    );

    const input = screen.getByLabelText("test-input");
    input.focus();
    fireEvent.keyDown(input, { key: "?" });

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes when the backdrop is clicked", () => {
    render(<ShortcutsHelp />);

    fireEvent.click(screen.getByLabelText("Klavye kısayollarını göster"));
    fireEvent.click(screen.getByLabelText("Kısayol rehberini kapat"));

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
