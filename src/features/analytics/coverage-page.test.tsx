/**
 * @vitest-environment jsdom
 */
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/test/dom-setup";

import {
  DEFAULT_COVERAGE_STATE,
  type CoverageState,
} from "@/features/analytics/coverage-model";

const replace = vi.fn();
let search = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/coverage",
  useSearchParams: () => new URLSearchParams(search),
}));

type CenterProps = {
  state: CoverageState;
  onChange: (next: CoverageState) => void;
};

let lastProps: CenterProps | null = null;

vi.mock("@/features/analytics/coverage-center", () => ({
  CoverageCenter: (props: CenterProps) => {
    lastProps = props;
    return null;
  },
}));

const { CoveragePage } = await import("@/features/analytics/coverage-page");

beforeEach(() => {
  replace.mockReset();
  lastProps = null;
  search = "";
});

describe("CoveragePage", () => {
  it("reads the view from the URL", () => {
    search =
      "course=3&view=empty&grade=11&parent=root&q=vekt&sort=count_asc&mode=scope";

    render(<CoveragePage />);

    expect(lastProps?.state).toEqual({
      courseId: 3,
      view: "empty",
      grade: 11,
      parent: "root",
      query: "vekt",
      sort: "count_asc",
      mode: "scope",
    });
  });

  it("falls back to defaults for unknown values", () => {
    search = "view=bogus&mode=nope&sort=?";

    render(<CoveragePage />);

    expect(lastProps?.state).toEqual(DEFAULT_COVERAGE_STATE);
  });

  it("writes a change back to the URL without scrolling", () => {
    render(<CoveragePage />);

    lastProps?.onChange({
      ...DEFAULT_COVERAGE_STATE,
      courseId: 2,
      view: "under_medium",
    });

    expect(replace).toHaveBeenCalledWith(
      "/coverage?course=2&view=under_medium",
      {
        scroll: false,
      },
    );
  });

  it("uses the bare path for the default view", () => {
    search = "view=empty";

    render(<CoveragePage />);

    lastProps?.onChange(DEFAULT_COVERAGE_STATE);

    expect(replace).toHaveBeenCalledWith("/coverage", { scroll: false });
  });

  it("does not replace the URL twice for the same pending change", () => {
    render(<CoveragePage />);

    lastProps?.onChange({ ...DEFAULT_COVERAGE_STATE, mode: "course" });
    lastProps?.onChange({ ...DEFAULT_COVERAGE_STATE, mode: "course" });

    expect(replace).toHaveBeenCalledTimes(1);
  });
});
