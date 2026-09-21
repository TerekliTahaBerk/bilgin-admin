/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BarList } from "@/features/analytics/bar-list";

describe("BarList", () => {
  it("renders the title and one row per entry with its number", () => {
    render(
      <BarList
        entries={[
          { id: "a", label: "TYT", value: 8 },
          { id: "b", label: "AYT", value: 3 },
        ]}
        title="Scope'a göre ders sayısı"
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Scope'a göre ders sayısı" }),
    ).toBeDefined();
    expect(screen.getByText("TYT")).toBeDefined();
    expect(screen.getByText("8")).toBeDefined();
    expect(screen.getByText("AYT")).toBeDefined();
    expect(screen.getByText("3")).toBeDefined();
  });

  it("shows an empty-data message instead of an empty bar list", () => {
    render(<BarList entries={[]} title="Boş" />);

    expect(screen.getByText("Gösterilecek veri yok.")).toBeDefined();
  });

  it("scales the largest bar to full width without dividing by zero when every value is 0", () => {
    const { container } = render(
      <BarList
        entries={[
          { id: "a", label: "A", value: 0 },
          { id: "b", label: "B", value: 0 },
        ]}
        title="Sıfır"
      />,
    );

    const bars = container.querySelectorAll<HTMLDivElement>(
      "[aria-hidden='true'] > div",
    );

    expect(bars).toHaveLength(2);
    for (const bar of bars) {
      expect(bar.style.width).toBe("0%");
    }
  });

  it("gives every value an accessible label independent of color", () => {
    render(
      <BarList
        entries={[{ id: "a", label: "TYT Matematik", value: 5 }]}
        title="Ders"
        valueLabel="ünite"
      />,
    );

    expect(screen.getByLabelText("TYT Matematik: 5 ünite")).toBeDefined();
  });
});
