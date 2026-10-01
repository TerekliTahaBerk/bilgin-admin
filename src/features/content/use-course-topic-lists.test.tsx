/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import "@/test/dom-setup";

import type { CourseTopicsData } from "@/contracts/admin/exercise-editor";
import { CONTENT_SCAN_CONCURRENCY } from "@/features/content/content-scan";
import { courseTopicsQueryKey } from "@/features/content/content-queries";
import { topicList } from "@/test/fixtures/health";

const getCourseTopics =
  vi.fn<
    (courseId: number, signal?: AbortSignal) => Promise<CourseTopicsData>
  >();

vi.mock("@/features/content/content-client", () => ({
  getCourseTopics: (courseId: number, options: { signal?: AbortSignal } = {}) =>
    getCourseTopics(courseId, options.signal),
}));

const { useCourseTopicLists } =
  await import("@/features/content/use-course-topic-lists");

function setup(
  courseIds: readonly number[],
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  }),
) {
  const view = renderHook(() => useCourseTopicLists(courseIds), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });

  return { ...view, queryClient };
}

beforeEach(() => {
  getCourseTopics
    .mockReset()
    .mockImplementation(async (courseId) =>
      topicList(courseId, courseId, { 1: 2 }),
    );
});

describe("useCourseTopicLists", () => {
  it("does nothing without courses", async () => {
    const { result } = setup([]);

    expect(result.current).toMatchObject({
      lists: [],
      isLoading: false,
      isComplete: false,
      failedCourseIds: [],
    });
    await new Promise((done) => setTimeout(done, 5));
    expect(getCourseTopics).not.toHaveBeenCalled();
  });

  it("loads every course's topic list", async () => {
    const ids = [1, 2, 3];
    const { result } = setup(ids);

    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isComplete).toBe(true));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.lists.map((list) => list.course.id)).toEqual(ids);
  });

  it("keeps the number of requests in flight bounded", async () => {
    let inFlight = 0;
    let peak = 0;
    getCourseTopics.mockImplementation(async (courseId) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((done) => setTimeout(done, 2));
      inFlight -= 1;
      return topicList(courseId, courseId, {});
    });

    const ids = Array.from({ length: 12 }, (_, index) => index + 1);
    const { result } = setup(ids);

    await waitFor(() => expect(result.current.isComplete).toBe(true));
    expect(peak).toBe(CONTENT_SCAN_CONCURRENCY);
  });

  it("reuses fresh cached lists", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(courseTopicsQueryKey(1), topicList(1, 1, {}));

    const { result } = setup([1, 2], queryClient);

    await waitFor(() => expect(result.current.isComplete).toBe(true));
    expect(getCourseTopics.mock.calls.map(([id]) => id)).toEqual([2]);
  });

  it("reports failed courses and retries them", async () => {
    getCourseTopics.mockImplementation(async (courseId) => {
      if (courseId === 2) {
        throw { kind: "server", status: 500, message: "Sunucu hatası." };
      }
      return topicList(courseId, courseId, {});
    });

    const { result } = setup([1, 2]);

    await waitFor(() => expect(result.current.failedCourseIds).toEqual([2]));
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isComplete).toBe(false);

    getCourseTopics.mockImplementation(async (courseId) =>
      topicList(courseId, courseId, {}),
    );
    act(() => result.current.retry());

    await waitFor(() => expect(result.current.isComplete).toBe(true));
    expect(result.current.failedCourseIds).toEqual([]);
  });

  it("stops on a halting error and exposes it", async () => {
    const expired = {
      kind: "authentication" as const,
      status: 401,
      message: "Oturum doğrulanamadı.",
    };
    getCourseTopics.mockRejectedValue(expired);

    const { result } = setup(
      Array.from({ length: 10 }, (_, index) => index + 1),
    );

    await waitFor(() => expect(result.current.haltError).toEqual(expired));
    expect(result.current.isLoading).toBe(false);
    expect(getCourseTopics.mock.calls.length).toBeLessThanOrEqual(
      CONTENT_SCAN_CONCURRENCY,
    );
  });

  it("aborts its requests on unmount", async () => {
    const signals: AbortSignal[] = [];
    getCourseTopics.mockImplementation(
      (_courseId, signal) =>
        new Promise(() => {
          if (signal !== undefined) signals.push(signal);
        }),
    );

    const { unmount } = setup([1, 2]);
    await waitFor(() => expect(signals).toHaveLength(2));

    unmount();

    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });
});
