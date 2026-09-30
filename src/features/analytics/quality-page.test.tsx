/**
 * @vitest-environment jsdom
 */
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/test/dom-setup";

import {
  DEFAULT_QUALITY_SORT,
  type QualityViewState,
} from "@/features/analytics/quality-filters";

const replace = vi.fn();
let search = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/quality",
  useSearchParams: () => new URLSearchParams(search),
}));

type CenterProps = {
  canEdit: boolean;
  state: QualityViewState;
  onChange: (next: QualityViewState) => void;
};

let lastProps: CenterProps | null = null;

vi.mock("@/features/analytics/quality-center", () => ({
  QualityCenter: (props: CenterProps) => {
    lastProps = props;
    return null;
  },
}));

const { QualityPage } = await import("@/features/analytics/quality-page");

beforeEach(() => {
  replace.mockReset();
  lastProps = null;
  search = "";
});

describe("QualityPage", () => {
  it("reads the view from the URL", () => {
    search = "course=2&review=yes&sort=attempts&dir=desc";

    render(<QualityPage canEdit />);

    expect(lastProps?.canEdit).toBe(true);
    expect(lastProps?.state).toEqual({
      filters: { courseId: 2, needsReview: true },
      sort: { key: "attempts", direction: "desc" },
    });
  });

  it("writes a change back to the URL without scrolling", () => {
    render(<QualityPage canEdit={false} />);

    lastProps?.onChange({
      filters: { status: "draft" },
      sort: DEFAULT_QUALITY_SORT,
    });

    expect(replace).toHaveBeenCalledWith("/quality?status=draft", {
      scroll: false,
    });
  });

  it("uses the bare path for the default view", () => {
    search = "status=draft";

    render(<QualityPage canEdit />);

    lastProps?.onChange({ filters: {}, sort: DEFAULT_QUALITY_SORT });

    expect(replace).toHaveBeenCalledWith("/quality", { scroll: false });
  });

  it("skips a navigation that would not change the URL", () => {
    search = "status=draft";

    render(<QualityPage canEdit />);

    lastProps?.onChange({
      filters: { status: "draft" },
      sort: DEFAULT_QUALITY_SORT,
    });

    expect(replace).not.toHaveBeenCalled();
  });

  it("does not repeat a navigation that is still pending", () => {
    render(<QualityPage canEdit />);

    const next = {
      filters: { edited: true as const },
      sort: DEFAULT_QUALITY_SORT,
    };
    lastProps?.onChange(next);
    lastProps?.onChange(next);

    expect(replace).toHaveBeenCalledTimes(1);
  });
});
