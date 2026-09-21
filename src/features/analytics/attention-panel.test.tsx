/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import "@/test/dom-setup";

import type {
  Course,
  Unit,
  UnitExercisesData,
} from "@/contracts/admin/content";
import { AttentionPanel } from "@/features/analytics/attention-panel";

function renderPanel(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <AttentionPanel />
    </QueryClientProvider>,
  );
}

describe("AttentionPanel", () => {
  it("shows a calm message when nothing is cached yet", () => {
    const queryClient = new QueryClient();

    renderPanel(queryClient);

    expect(
      screen.getByText(/dikkat gerektiren bir şey bulunamadı/),
    ).toBeDefined();
  });

  it("lists an empty course from the cached courses list", () => {
    const queryClient = new QueryClient();
    const courses: Course[] = [
      {
        id: 1,
        code: "tyt_matematik",
        name: "TYT Matematik",
        scope: "tyt",
        status: "draft",
        unit_count: 0,
      },
    ];
    queryClient.setQueryData(["content", "courses"], courses);

    renderPanel(queryClient);

    expect(
      screen.getByText("TYT Matematik: henüz ünite eklenmemiş."),
    ).toBeDefined();
    expect(
      screen.getByRole("link", { name: /TYT Matematik/ }).getAttribute("href"),
    ).toBe("/courses/1");
  });

  it("lists an empty unit from cached course units", () => {
    const queryClient = new QueryClient();
    const units: Unit[] = [
      {
        id: 10,
        title: "Boş Ünite",
        sort_order: 1,
        grade_level: null,
        status: "draft",
        access: "free",
        node_count: 0,
        exercise_count: 0,
      },
    ];
    queryClient.setQueryData(["content", "courses", 7, "units"], units);

    renderPanel(queryClient);

    expect(
      screen.getByText("Boş Ünite: henüz soru eklenmemiş."),
    ).toBeDefined();
    expect(
      screen.getByRole("link", { name: /Boş Ünite/ }).getAttribute("href"),
    ).toBe("/courses/7/units/10");
  });

  it("lists an exercise flagged needs_review, resolving its course id from cached units", () => {
    const queryClient = new QueryClient();
    const units: Unit[] = [
      {
        id: 10,
        title: "Ünite",
        sort_order: 1,
        grade_level: null,
        status: "published",
        access: "free",
        node_count: 2,
        exercise_count: 5,
      },
    ];
    const exercisesData: UnitExercisesData = {
      unit: { id: 10, title: "Ünite" },
      exercises: [
        {
          id: 500,
          type: "multiple_choice",
          topic: { id: 1, name: "Konu" },
          difficulty: 3,
          status: "published",
          version: 1,
          scopes: ["tyt"],
          preview: "Şüpheli soru?",
          stats: {
            attempts: 30,
            correct_rate: 4,
            avg_seconds: 12,
            needs_review: true,
          },
        },
      ],
    };
    queryClient.setQueryData(["content", "courses", 7, "units"], units);
    queryClient.setQueryData(
      ["content", "units", 10, "exercises", { type: null, status: null }],
      exercisesData,
    );

    renderPanel(queryClient);

    expect(screen.getByText("Ünite · Şüpheli soru?")).toBeDefined();
    expect(
      screen.getByRole("link", { name: /Şüpheli soru/ }).getAttribute("href"),
    ).toBe("/courses/7/units/10");
  });
});
