/**
 * @vitest-environment jsdom
 */
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/test/dom-setup";

import {
  DEFAULT_PUBLISHING_SORT,
  type PublishingViewState,
} from "@/features/content/publishing-model";

const replace = vi.fn();
let search = "";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/publishing",
  useSearchParams: () => new URLSearchParams(search),
}));

type CenterProps = {
  canPublish: boolean;
  state: PublishingViewState;
  onChange: (next: PublishingViewState) => void;
};

let lastProps: CenterProps | null = null;

vi.mock("@/features/content/publishing-center", () => ({
  PublishingCenter: (props: CenterProps) => {
    lastProps = props;
    return null;
  },
}));

const { PublishingPage } = await import("@/features/content/publishing-page");

beforeEach(() => {
  replace.mockReset();
  lastProps = null;
  search = "";
});

describe("PublishingPage", () => {
  it("reads the view from the URL and passes the publish ability on", () => {
    search = "course=3&show=blocked&sort=blocking&dir=desc";

    render(<PublishingPage canPublish />);

    expect(lastProps?.canPublish).toBe(true);
    expect(lastProps?.state).toEqual({
      filters: { courseId: 3, categories: ["blocked"] },
      sort: { key: "blocking", direction: "desc" },
    });
  });

  it("writes a change back to the URL without scrolling", () => {
    render(<PublishingPage canPublish={false} />);

    lastProps?.onChange({
      filters: { categories: ["ready", "relaxed"] },
      sort: DEFAULT_PUBLISHING_SORT,
    });

    expect(replace).toHaveBeenCalledWith("/publishing?show=ready%2Crelaxed", {
      scroll: false,
    });
  });

  it("uses the bare path for the default view", () => {
    search = "status=draft";

    render(<PublishingPage canPublish />);
    lastProps?.onChange({
      filters: { categories: [] },
      sort: DEFAULT_PUBLISHING_SORT,
    });

    expect(replace).toHaveBeenCalledWith("/publishing", { scroll: false });
  });

  it("skips a navigation that would not change the URL", () => {
    search = "status=draft";

    render(<PublishingPage canPublish />);
    lastProps?.onChange({
      filters: { status: "draft", categories: [] },
      sort: DEFAULT_PUBLISHING_SORT,
    });

    expect(replace).not.toHaveBeenCalled();
  });

  it("does not repeat a navigation that is still pending", () => {
    render(<PublishingPage canPublish />);

    const next: PublishingViewState = {
      filters: { categories: ["unknown"] },
      sort: DEFAULT_PUBLISHING_SORT,
    };
    lastProps?.onChange(next);
    lastProps?.onChange(next);

    expect(replace).toHaveBeenCalledTimes(1);
  });
});
