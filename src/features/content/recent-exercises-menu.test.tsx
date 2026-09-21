/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import "@/test/dom-setup";

import { recordExerciseEdit } from "@/features/content/exercise-history";
import { RecentExercisesMenu } from "@/features/content/recent-exercises-menu";

afterEach(() => {
  window.sessionStorage.clear();
  document.body.innerHTML = "";
});

describe("RecentExercisesMenu", () => {
  it("shows an empty message when nothing was edited this session", () => {
    render(<RecentExercisesMenu />);

    fireEvent.click(screen.getByLabelText("Son düzenlenen sorular"));

    expect(
      screen.getByText("Bu oturumda henüz düzenlenen soru yok."),
    ).toBeDefined();
  });

  it("lists a recorded edit with a link to the exercise", () => {
    recordExerciseEdit({
      exerciseId: 42,
      courseId: 1,
      unitId: 2,
      label: "TYT Matematik · Ünite 1",
      editedAt: Date.now(),
    });

    render(<RecentExercisesMenu />);
    fireEvent.click(screen.getByLabelText("Son düzenlenen sorular"));

    const link = screen.getByText("TYT Matematik · Ünite 1").closest("a");
    expect(link?.getAttribute("href")).toBe(
      "/courses/1/units/2/exercises/42",
    );
  });

  it("closes on Escape", () => {
    render(<RecentExercisesMenu />);

    fireEvent.click(screen.getByLabelText("Son düzenlenen sorular"));
    expect(screen.getByRole("menu")).toBeDefined();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
