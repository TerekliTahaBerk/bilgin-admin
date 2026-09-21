import { describe, expect, it } from "vitest";

import type { ExerciseDetail } from "@/contracts/admin/exercise-editor";
import {
  createDiagramLabelBranch,
  diagramLabelBranchFromDetail,
  nextDiagramLabelSlotId,
  serializeDiagramLabelBranch,
  strictDiagramLabelBranchSchema,
} from "@/features/content/diagram-label-form";

function detail(overrides: Partial<ExerciseDetail> = {}): ExerciseDetail {
  return {
    id: 1,
    type: "diagram_label",
    topic_id: 1,
    difficulty: 2,
    content: {
      instruction: "Diyagramı etiketle.",
      image: "https://example.test/diagram.png",
      slots: [
        { id: "a", text: "Üst nokta" },
        { id: "b", text: "Alt nokta" },
      ],
    },
    answer_key: { labels: { a: "Zirve", b: "Taban" } },
    explanation: null,
    applicable_scopes: ["tyt"],
    status: "draft",
    version: 1,
    stats: { attempts: 0, correct_rate: null, avg_seconds: null, needs_review: false },
    ...overrides,
  } as ExerciseDetail;
}

describe("createDiagramLabelBranch", () => {
  it("starts with two empty slots", () => {
    const branch = createDiagramLabelBranch();
    expect(branch.slots).toHaveLength(2);
    expect(branch.slots.every((slot) => slot.label === "")).toBe(true);
  });
});

describe("nextDiagramLabelSlotId", () => {
  it("skips ids already in use", () => {
    expect(nextDiagramLabelSlotId(["1", "2"])).toBe("3");
  });
});

describe("diagramLabelBranchFromDetail", () => {
  it("hydrates a valid detail, pairing each slot with its label", () => {
    const branch = diagramLabelBranchFromDetail(detail());
    expect(branch).toEqual({
      instruction: "Diyagramı etiketle.",
      image: "https://example.test/diagram.png",
      slots: [
        { id: "a", text: "Üst nokta", label: "Zirve" },
        { id: "b", text: "Alt nokta", label: "Taban" },
      ],
    });
  });

  it("returns null for a malformed content shape", () => {
    expect(
      diagramLabelBranchFromDetail(detail({ content: { foo: "bar" } })),
    ).toBeNull();
  });
});

describe("serializeDiagramLabelBranch", () => {
  it("splits slot descriptions and labels into content and answer_key", () => {
    const result = serializeDiagramLabelBranch({
      instruction: "  Etiketle.  ",
      image: "https://example.test/x.png",
      slots: [
        { id: "a", text: " Üst ", label: " Zirve " },
        { id: "b", text: "Alt", label: "Taban" },
      ],
    });

    expect(result).toEqual({
      type: "diagram_label",
      content: {
        instruction: "Etiketle.",
        image: "https://example.test/x.png",
        slots: [
          { id: "a", text: "Üst" },
          { id: "b", text: "Alt" },
        ],
      },
      answer_key: { labels: { a: "Zirve", b: "Taban" } },
    });
  });
});

describe("strictDiagramLabelBranchSchema", () => {
  const valid = {
    instruction: "Etiketle.",
    image: "https://example.test/x.png",
    slots: [
      { id: "a", text: "A", label: "X" },
      { id: "b", text: "B", label: "Y" },
    ],
  };

  it("accepts a complete, valid branch", () => {
    expect(strictDiagramLabelBranchSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a missing image URL", () => {
    expect(
      strictDiagramLabelBranchSchema.safeParse({ ...valid, image: "" }).success,
    ).toBe(false);
  });

  it("rejects an empty label", () => {
    expect(
      strictDiagramLabelBranchSchema.safeParse({
        ...valid,
        slots: [
          { id: "a", text: "A", label: "" },
          { id: "b", text: "B", label: "Y" },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate slot ids", () => {
    expect(
      strictDiagramLabelBranchSchema.safeParse({
        ...valid,
        slots: [
          { id: "a", text: "A", label: "X" },
          { id: "a", text: "A2", label: "Y" },
        ],
      }).success,
    ).toBe(false);
  });
});
