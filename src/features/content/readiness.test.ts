import { describe, expect, it } from "vitest";

import type { NodePreview } from "@/contracts/admin/publication";
import {
  nodeHasWarning,
  nodePreviewAnchorId,
  publishBlockingRows,
  readinessState,
  summarizeReadiness,
  unitReadinessCategories,
  unitReadinessCategory,
  unitReadinessCategoryLabels,
} from "@/features/content/readiness";
import type { ApiError } from "@/lib/api/error";
import {
  contentNotPublishableResponse,
  failingPreviewResponse,
  passingPreviewResponse,
  relaxedPreviewResponse,
} from "@/test/fixtures/publication-api";

const passing = passingPreviewResponse.data as NodePreview;
const relaxed = relaxedPreviewResponse.data as NodePreview;
const failing = failingPreviewResponse.data as NodePreview;

describe("readinessState", () => {
  it("separates a clean pass from a relaxed one", () => {
    expect(readinessState(passing)).toBe("pass");
    expect(readinessState(relaxed)).toBe("relaxed");
  });

  it("reports a failure the backend declared", () => {
    expect(readinessState(failing)).toBe("fail");
  });

  it("trusts `passes` over the counts", () => {
    // An invalid rule reports passes:false with required 0 — arithmetic over
    // the counts alone would call that a pass.
    const invalid: NodePreview = {
      node_id: 9,
      node_title: "Bozuk Kural",
      required: 0,
      available: 0,
      relaxed: false,
      passes: false,
      message: "selection_rule.mode geçersiz: null",
      live_available: 0,
      live_passes: false,
      live_warning: null,
    };

    expect(readinessState(invalid)).toBe("fail");
  });

  it("never turns a relaxed failure into a warning", () => {
    expect(readinessState({ ...failing, relaxed: true })).toBe("fail");
  });
});

describe("summarizeReadiness", () => {
  it("counts each state", () => {
    const summary = summarizeReadiness(3, [passing, relaxed, failing]);

    expect(summary).toMatchObject({
      total: 3,
      passing: 2,
      relaxed: 1,
      failing: 1,
      canPublish: false,
    });
  });

  it("allows publishing when every node answered and none failed", () => {
    expect(summarizeReadiness(2, [passing, relaxed]).canPublish).toBe(true);
  });

  it("withholds publishing while a node has not answered", () => {
    // A node still loading, or one whose preview failed, is absent. Treating
    // absence as a pass would enable publishing on missing evidence.
    expect(summarizeReadiness(3, [passing, relaxed]).canPublish).toBe(false);
  });

  it("is vacuously publishable for a unit with no nodes", () => {
    // The backend gate has nothing to reject there either.
    expect(summarizeReadiness(0, []).canPublish).toBe(true);
  });
});

describe("publishBlockingRows", () => {
  const notPublishable: ApiError = {
    kind: "validation",
    status: 422,
    code: contentNotPublishableResponse.error.code,
    message: contentNotPublishableResponse.error.message,
    details: contentNotPublishableResponse.error.details,
  };

  it("reads every blocking row out of the backend details", () => {
    expect(publishBlockingRows(notPublishable)).toEqual([
      {
        node_id: 103,
        node_title: "Ünite Challenge",
        message: "Kural 3 soru getiriyor, 10 gerekiyor.",
      },
    ]);
  });

  it("returns nothing for an unrelated failure", () => {
    expect(
      publishBlockingRows({
        kind: "server",
        status: 500,
        message: "Sunucu hatası oluştu.",
      }),
    ).toEqual([]);
  });

  it("invents no rows when the details do not parse", () => {
    expect(
      publishBlockingRows({
        ...notPublishable,
        details: { blocking: [{ node_id: 0, node_title: "", message: 1 }] },
      }),
    ).toEqual([]);
  });

  it("returns nothing for a 422 that is not CONTENT_NOT_PUBLISHABLE", () => {
    expect(
      publishBlockingRows({ ...notPublishable, code: "TOPIC_MISMATCH" }),
    ).toEqual([]);
  });
});

describe("nodePreviewAnchorId", () => {
  it("names the row a blocking link can reach", () => {
    expect(nodePreviewAnchorId(103)).toBe("node-preview-103");
  });
});

describe("nodeHasWarning", () => {
  it("flags a relaxed pass and a backend live warning, nothing else", () => {
    expect(nodeHasWarning(passing)).toBe(false);
    expect(nodeHasWarning(relaxed)).toBe(true);
    expect(nodeHasWarning(failing)).toBe(false);
    expect(
      nodeHasWarning({
        ...passing,
        live_available: 2,
        live_passes: false,
        live_warning: "Öğrenciler şu an 2 soru alıyor; 6 gerekiyor.",
      }),
    ).toBe(true);
  });

  it("does not invent a warning from live counts alone", () => {
    // Only the backend decides when the live gap deserves a warning.
    expect(
      nodeHasWarning({ ...passing, live_available: 0, live_passes: false }),
    ).toBe(false);
  });
});

describe("summarizeReadiness warnings", () => {
  it("counts nodes with a warning", () => {
    const live = { ...passing, live_warning: "uyarı" };

    expect(summarizeReadiness(3, [passing, relaxed, live]).warnings).toBe(2);
  });
});

describe("unitReadinessCategory", () => {
  const summary = (previews: NodePreview[], total = previews.length) =>
    summarizeReadiness(total, previews);

  it("puts a published unit in 'published' whatever its previews say", () => {
    expect(unitReadinessCategory("published", summary([failing]))).toBe(
      "published",
    );
    expect(unitReadinessCategory("published", null)).toBe("published");
  });

  it("is unknown while the node list is not known", () => {
    expect(unitReadinessCategory("draft", null)).toBe("unknown");
  });

  it("is blocked as soon as one node failed, even with others unknown", () => {
    expect(unitReadinessCategory("draft", summary([failing], 3))).toBe(
      "blocked",
    );
  });

  it("is unknown while any node has not answered", () => {
    expect(unitReadinessCategory("review", summary([passing], 2))).toBe(
      "unknown",
    );
  });

  it("separates a relaxed pass from a clean one", () => {
    expect(unitReadinessCategory("draft", summary([passing, relaxed]))).toBe(
      "relaxed",
    );
    expect(unitReadinessCategory("draft", summary([passing]))).toBe("ready");
  });

  it("follows the backend gate for a unit with no nodes", () => {
    expect(unitReadinessCategory("draft", summary([]))).toBe("ready");
  });

  it("labels every category", () => {
    expect(
      unitReadinessCategories.map(
        (category) => unitReadinessCategoryLabels[category],
      ),
    ).toEqual([
      "Yayına hazır",
      "Gevşetilmiş kuralla hazır",
      "Bloklanmış",
      "Hazırlık durumu bilinmiyor",
      "Zaten yayında",
    ]);
  });
});
