import type {
  DifficultyLevel,
  NodePreview,
  NodeType,
  PublishBlockingRow,
} from "@/contracts/admin/publication";
import { publishBlockingDetailsSchema } from "@/contracts/admin/publication";
import { CONTENT_NOT_PUBLISHABLE } from "@/contracts/admin/publication";
import type { ApiError } from "@/lib/api/error";

/** Display names for the backend `NodeType` enum. */
export const nodeTypeLabels: Readonly<Record<NodeType, string>> = {
  study: "Çalışma",
  matching: "Eşleştirme",
  mini_challenge: "Mini Challenge",
  unit_challenge: "Ünite Challenge",
  quick_review: "Hızlı Tekrar",
  exam_sim: "Sınav Provası",
};

/** Display names for the backend `DifficultyLevel` enum. */
export const difficultyLevelLabels: Readonly<Record<DifficultyLevel, string>> =
  {
    kolay: "Kolay",
    kolay_orta: "Kolay-Orta",
    orta: "Orta",
    orta_zor: "Orta-Zor",
    zor: "Zor",
    sinav_provasi: "Sınav Provası",
  };

/**
 * Three outcomes, not two. "relaxed" is a pass the editor still needs to see:
 * the rule only reached its quota because the difficulty filter was widened,
 * which means the pool is thin and the next question added elsewhere can take
 * it back below the line.
 */
export type ReadinessState = "pass" | "relaxed" | "fail";

export function readinessState(preview: NodePreview): ReadinessState {
  if (!preview.passes) return "fail";

  return preview.relaxed ? "relaxed" : "pass";
}

export const readinessStateLabels: Readonly<Record<ReadinessState, string>> = {
  pass: "Hazır",
  relaxed: "Havuz dar",
  fail: "Yetersiz",
};

export type ReadinessSummary = Readonly<{
  total: number;
  passing: number;
  relaxed: number;
  failing: number;
  /** True only when every node has answered and none of them failed. */
  canPublish: boolean;
}>;

/**
 * `previews` holds one entry per node that has answered. A node still loading,
 * or one whose preview request failed, is deliberately absent rather than
 * counted as passing — `canPublish` must never be true on missing evidence.
 */
export function summarizeReadiness(
  nodeCount: number,
  previews: readonly NodePreview[],
): ReadinessSummary {
  const failing = previews.filter(
    (preview) => readinessState(preview) === "fail",
  ).length;
  const relaxed = previews.filter(
    (preview) => readinessState(preview) === "relaxed",
  ).length;

  return {
    total: nodeCount,
    passing: previews.length - failing,
    relaxed,
    failing,
    // Vacuously true for a unit with no nodes: the backend gate has nothing to
    // reject there either, and inventing a stricter frontend rule would
    // disable a button the server would have honoured.
    canPublish: previews.length === nodeCount && failing === 0,
  };
}

/** Anchor id a blocking row links to, so the failing step can be reached. */
export function nodePreviewAnchorId(nodeId: number): string {
  return `node-preview-${nodeId}`;
}

/**
 * Pulls the `details.blocking` rows out of a `CONTENT_NOT_PUBLISHABLE` 422.
 *
 * Returns an empty array for every other failure — including a 422 whose
 * details do not parse. A publish that failed for an unknown reason must show
 * its own message, not an invented list of blocking steps.
 */
export function publishBlockingRows(error: ApiError): PublishBlockingRow[] {
  if (error.code !== CONTENT_NOT_PUBLISHABLE) {
    return [];
  }

  const parsed = publishBlockingDetailsSchema.safeParse(error.details);

  return parsed.success ? parsed.data.blocking : [];
}
