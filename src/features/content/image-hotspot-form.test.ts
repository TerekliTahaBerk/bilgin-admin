import { describe, expect, it } from "vitest";

import type { ExerciseDetail } from "@/contracts/admin/exercise-editor";
import {
  createImageHotspotBranch,
  imageHotspotBranchFromDetail,
  nextImageHotspotId,
  serializeImageHotspotBranch,
  strictImageHotspotBranchSchema,
} from "@/features/content/image-hotspot-form";

function detail(overrides: Partial<ExerciseDetail> = {}): ExerciseDetail {
  return {
    id: 1,
    type: "image_hotspot",
    topic_id: 1,
    difficulty: 2,
    content: {
      instruction: "Başkenti seç.",
      image: "https://example.test/map.png",
      hotspots: [
        { id: "a", text: "Ankara" },
        { id: "b", text: "İstanbul" },
      ],
    },
    answer_key: { hotspot_id: "a" },
    explanation: null,
    applicable_scopes: ["tyt"],
    status: "draft",
    version: 1,
    stats: { attempts: 0, correct_rate: null, avg_seconds: null, needs_review: false },
    ...overrides,
  } as ExerciseDetail;
}

describe("createImageHotspotBranch", () => {
  it("starts with two empty hotspots and no correct answer", () => {
    const branch = createImageHotspotBranch();
    expect(branch.hotspots).toHaveLength(2);
    expect(branch.hotspotId).toBe("");
  });
});

describe("nextImageHotspotId", () => {
  it("skips ids already in use", () => {
    expect(nextImageHotspotId(["1", "2"])).toBe("3");
  });
});

describe("imageHotspotBranchFromDetail", () => {
  it("hydrates a valid detail", () => {
    const branch = imageHotspotBranchFromDetail(detail());
    expect(branch).toEqual({
      instruction: "Başkenti seç.",
      image: "https://example.test/map.png",
      hotspots: [
        { id: "a", text: "Ankara" },
        { id: "b", text: "İstanbul" },
      ],
      hotspotId: "a",
    });
  });

  it("returns null for a malformed content shape", () => {
    expect(
      imageHotspotBranchFromDetail(detail({ content: { foo: "bar" } })),
    ).toBeNull();
  });
});

describe("serializeImageHotspotBranch", () => {
  it("trims text and preserves ids", () => {
    const result = serializeImageHotspotBranch({
      instruction: "  Seç.  ",
      image: "  https://example.test/x.png  ",
      hotspots: [
        { id: "a", text: " Ankara " },
        { id: "b", text: "İstanbul" },
      ],
      hotspotId: "a",
    });

    expect(result).toEqual({
      type: "image_hotspot",
      content: {
        instruction: "Seç.",
        image: "https://example.test/x.png",
        hotspots: [
          { id: "a", text: "Ankara" },
          { id: "b", text: "İstanbul" },
        ],
      },
      answer_key: { hotspot_id: "a" },
    });
  });
});

describe("strictImageHotspotBranchSchema", () => {
  const valid = {
    instruction: "Seç.",
    image: "https://example.test/x.png",
    hotspots: [
      { id: "a", text: "A" },
      { id: "b", text: "B" },
    ],
    hotspotId: "a",
  };

  it("accepts a complete, valid branch", () => {
    expect(strictImageHotspotBranchSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a missing image URL", () => {
    expect(
      strictImageHotspotBranchSchema.safeParse({ ...valid, image: "" }).success,
    ).toBe(false);
  });

  it("rejects fewer than two hotspots", () => {
    expect(
      strictImageHotspotBranchSchema.safeParse({
        ...valid,
        hotspots: [{ id: "a", text: "A" }],
      }).success,
    ).toBe(false);
  });

  it("rejects a correct id that is not among the hotspots", () => {
    expect(
      strictImageHotspotBranchSchema.safeParse({
        ...valid,
        hotspotId: "z",
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate hotspot ids", () => {
    expect(
      strictImageHotspotBranchSchema.safeParse({
        ...valid,
        hotspots: [
          { id: "a", text: "A" },
          { id: "a", text: "A2" },
        ],
      }).success,
    ).toBe(false);
  });
});
