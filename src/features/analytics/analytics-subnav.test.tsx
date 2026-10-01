/**
 * @vitest-environment jsdom
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import "@/test/dom-setup";

import { AnalyticsSubnav } from "@/features/analytics/analytics-subnav";

describe("AnalyticsSubnav", () => {
  it("links every section and marks the current one", () => {
    render(<AnalyticsSubnav current="questions" />);

    const nav = screen.getByRole("navigation", {
      name: "Veri Paneli bölümleri",
    });
    const overview = within(nav).getByRole("link", { name: "Genel bakış" });
    const questions = within(nav).getByRole("link", {
      name: "Soru performansı",
    });

    expect(overview.getAttribute("href")).toBe("/analytics");
    expect(overview.getAttribute("aria-current")).toBeNull();
    expect(questions.getAttribute("href")).toBe("/analytics/questions");
    expect(questions.getAttribute("aria-current")).toBe("page");
  });
});
