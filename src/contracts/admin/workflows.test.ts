import { describe, expect, it } from "vitest";

import {
  adminAccountsResponseSchema,
  contentPackageSchema,
  curriculumOptionsResponseSchema,
  updateCurriculumRequestSchema,
} from "@/contracts/admin/workflows";
import { parseContentPackage } from "@/features/workflows/workflow-client";

const validPackage = {
  course: "tyt_tarih",
  subject: "tarih",
  unit: { title: "Tarih", template: "standart_unite", nested: { keep: true } },
  topics: [{ code: "tarih" }],
  exercises: [
    { type: "multiple_choice", answer_key: { correct_option_id: "a" } },
  ],
};

describe("content package parser", () => {
  it("preserves the rich nested package", () => {
    const parsed = parseContentPackage(JSON.stringify(validPackage));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toEqual(validPackage);
  });

  it.each(["{", "[]", JSON.stringify({ course: "tyt_tarih" })])(
    "rejects invalid input %s",
    (raw) => expect(parseContentPackage(raw).success).toBe(false),
  );

  it("requires a JSON object with non-empty topic and exercise lists", () => {
    expect(
      contentPackageSchema.safeParse({ ...validPackage, topics: [] }).success,
    ).toBe(false);
  });
});

it("rejects duplicate curriculum course rows", () => {
  const row = {
    course_id: 3,
    exam_section_id: 2,
    sort_order: 1,
    access: "free",
    exam_weight: null,
    is_required: true,
  };
  expect(
    updateCurriculumRequestSchema.safeParse({ courses: [row, row] }).success,
  ).toBe(false);
});

it("validates source-driven curriculum ids and admin role abilities", () => {
  expect(
    curriculumOptionsResponseSchema.safeParse({
      data: {
        variants: [
          {
            id: 7,
            exam_id: 4,
            code: "say",
            name: "Sayısal",
            field_code: "say",
            sort_order: 1,
            is_active: true,
          },
        ],
        sections: [
          { id: 9, exam_id: 4, code: "tyt", name: "TYT", sort_order: 1 },
        ],
      },
      meta: { server_time: "2026-09-20T15:00:00+00:00" },
    }).success,
  ).toBe(true);
  expect(
    adminAccountsResponseSchema.safeParse({
      data: {
        roles: [
          {
            value: "custom",
            label: "Özel",
            abilities: {
              edit_content: true,
              publish_content: false,
              edit_curriculum: false,
              view_users: true,
            },
          },
        ],
        admins: [],
      },
      meta: { server_time: "2026-09-20T15:00:00+00:00" },
    }).success,
  ).toBe(true);
});
