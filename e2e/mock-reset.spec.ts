import { expect, test } from "@playwright/test";

import {
  E2E_MOCK_SUPER_ADMIN_TOKEN,
  E2E_MOCK_BACKEND_URL,
  resetMockBackend,
} from "./support/fixtures";

/*
 | The reset is load-bearing, so it gets its own proof.
 |
 | Every other spec trusts `resetMockBackend()` to hand it the pristine
 | fixture. If the reset ever returned a reference to the seed instead of a
 | fresh deep copy, the first mutation would corrupt the seed too and every
 | later reset would quietly restore the *mutated* state — the suite would go
 | green while testing the wrong data. These tests pin that down.
 */

const authorization = `Bearer ${E2E_MOCK_SUPER_ADMIN_TOKEN}`;

async function read(path: string): Promise<unknown> {
  const response = await fetch(`${E2E_MOCK_BACKEND_URL}${path}`, {
    headers: { authorization },
  });

  expect(response.ok).toBe(true);

  // `meta.server_time` moves on every call, so only the payload is compared.
  return ((await response.json()) as { data: unknown }).data;
}

async function snapshot() {
  return {
    emptyCourseUnits: await read("/api/admin/v1/courses/2/units"),
    unitExercises: await read("/api/admin/v1/units/11/exercises"),
    curriculum: await read("/api/admin/v1/exam-variants/7/courses"),
    admins: await read("/api/admin/v1/admins"),
  };
}

async function mutateEverything() {
  const post = async (path: string, body: unknown) => {
    const response = await fetch(`${E2E_MOCK_BACKEND_URL}${path}`, {
      method: "POST",
      headers: { authorization, "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    expect(response.ok).toBe(true);
  };

  await post("/api/admin/v1/units", {
    course_code: "tyt_matematik",
    template_code: "standard",
    title: "Kirlilik Ünitesi",
    topic_ids: [21],
  });

  const archived = await fetch(
    `${E2E_MOCK_BACKEND_URL}/api/admin/v1/exercises/101`,
    { method: "DELETE", headers: { authorization } },
  );
  expect(archived.ok).toBe(true);

  const curriculum = await fetch(
    `${E2E_MOCK_BACKEND_URL}/api/admin/v1/exam-variants/7/courses`,
    {
      method: "PUT",
      headers: { authorization, "content-type": "application/json" },
      body: JSON.stringify({
        courses: [
          {
            course_id: 3,
            exam_section_id: 10,
            sort_order: 1,
            access: "premium",
            exam_weight: 12,
            is_required: false,
          },
        ],
      }),
    },
  );
  expect(curriculum.ok).toBe(true);

  await post("/api/admin/v1/admins", {
    name: "Kirlilik Yöneticisi",
    email: "pollution@bilgin.test",
    password: "correct-horse-battery",
    role: "content_editor",
  });
}

test("two resets restore the exact baseline fixture", async () => {
  await resetMockBackend();
  const baseline = await snapshot();

  await mutateEverything();
  const polluted = await snapshot();

  // The mutations must genuinely land, or this test proves nothing.
  expect(polluted).not.toEqual(baseline);

  await resetMockBackend();
  expect(await snapshot()).toEqual(baseline);

  // A second cycle catches a reset that restores a seed already corrupted by
  // the first round of mutations.
  await mutateEverything();
  await resetMockBackend();
  expect(await snapshot()).toEqual(baseline);
});

test("reset restores units, archive status, curriculum and admins", async () => {
  await resetMockBackend();

  const units = (await read("/api/admin/v1/courses/2/units")) as unknown[];
  expect(units).toEqual([]);

  const exercises = (await read("/api/admin/v1/units/11/exercises")) as {
    exercises: { id: number; status: string }[];
  };
  expect(
    exercises.exercises.find((exercise) => exercise.id === 101)?.status,
  ).toBe("published");

  const curriculum = (await read("/api/admin/v1/exam-variants/7/courses")) as {
    courses: unknown[];
  };
  expect(curriculum.courses).toHaveLength(1);

  const admins = (await read("/api/admin/v1/admins")) as { admins: unknown[] };
  expect(admins.admins).toHaveLength(2);
});
