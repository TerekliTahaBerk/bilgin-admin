/**
 * @vitest-environment jsdom
 */
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/test/dom-setup";

import type { PerformanceFilters } from "@/features/analytics/question-performance";

const replace = vi.fn();
let search = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/analytics/questions",
  useSearchParams: () => new URLSearchParams(search),
}));

type ExplorerProps = {
  canEdit: boolean;
  filters: PerformanceFilters;
  onChange: (next: PerformanceFilters) => void;
};

let lastProps: ExplorerProps | null = null;

vi.mock("@/features/analytics/question-performance-explorer", () => ({
  QuestionPerformanceExplorer: (props: ExplorerProps) => {
    lastProps = props;
    return null;
  },
}));

const { QuestionPerformancePage } =
  await import("@/features/analytics/question-performance-page");

beforeEach(() => {
  replace.mockReset();
  lastProps = null;
  search = "";
});

describe("QuestionPerformancePage", () => {
  it("reads the filters from the URL", () => {
    search = "course=4&status=published&min=50";

    render(<QuestionPerformancePage canEdit />);

    expect(lastProps?.canEdit).toBe(true);
    expect(lastProps?.filters).toEqual({
      courseId: 4,
      status: "published",
      minAttempts: 50,
    });
  });

  it("writes a change back to the URL without scrolling", () => {
    render(<QuestionPerformancePage canEdit={false} />);

    lastProps?.onChange({ minAttempts: 20 });

    expect(replace).toHaveBeenCalledWith("/analytics/questions?min=20", {
      scroll: false,
    });
  });

  it("uses the bare path for the default filters", () => {
    search = "min=20";

    render(<QuestionPerformancePage canEdit />);
    lastProps?.onChange({ minAttempts: 1 });

    expect(replace).toHaveBeenCalledWith("/analytics/questions", {
      scroll: false,
    });
  });
});
