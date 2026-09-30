import { z } from "zod";

import { successEnvelopeSchema } from "@/contracts/admin/common";
import { publishStatusSchema } from "@/contracts/admin/content";

const nonEmptyStringSchema = z.string().trim().min(1);
const positiveIdSchema = z.number().int().positive();

/** Mirrors the backend `NodeType` enum — the full enum, not today's templates. */
export const nodeTypes = [
  "study",
  "matching",
  "mini_challenge",
  "unit_challenge",
  "quick_review",
  "exam_sim",
] as const;

/** Mirrors the backend `DifficultyLevel` enum. */
export const difficultyLevels = [
  "kolay",
  "kolay_orta",
  "orta",
  "orta_zor",
  "zor",
  "sinav_provasi",
] as const;

export const nodeTypeSchema = z.enum(nodeTypes);
export const difficultyLevelSchema = z.enum(difficultyLevels);

export const unitNodeSchema = z.object({
  id: positiveIdSchema,
  title: nonEmptyStringSchema,
  type: nodeTypeSchema,
  difficulty: difficultyLevelSchema,
  sort_order: z.number().int().nonnegative(),
  exercise_count: z.number().int().nonnegative(),
  status: publishStatusSchema,
});

export const unitNodesDataSchema = z.object({
  unit: z.object({
    id: positiveIdSchema,
    title: nonEmptyStringSchema,
    status: publishStatusSchema,
  }),
  nodes: z.array(unitNodeSchema),
});

export const unitNodesResponseSchema =
  successEnvelopeSchema(unitNodesDataSchema);

/**
 * A selection-rule dry run. `passes` is the backend's own verdict and the
 * frontend never recomputes it from `required`/`available`: a rule can be
 * unusable for reasons no count expresses (an invalid rule, a selection mode
 * with no registered selector), and the backend reports those as `passes:
 * false` with an explanatory message.
 *
 * The backend runs the rule twice. `available`/`passes` answer "would this
 * unit pass if published now" (the publish gate's question, unit drafts
 * included); the `live_*` fields answer "what do students get right now"
 * (published questions only). `live_warning` is the backend's own sentence
 * for the case where the two diverge and only publishing closes the gap —
 * null otherwise.
 */
export const nodePreviewSchema = z.object({
  node_id: positiveIdSchema,
  node_title: nonEmptyStringSchema,
  required: z.number().int().nonnegative(),
  available: z.number().int().nonnegative(),
  relaxed: z.boolean(),
  passes: z.boolean(),
  message: z.string(),
  live_available: z.number().int().nonnegative(),
  live_passes: z.boolean(),
  live_warning: z.string().nullable(),
});

export const nodePreviewResponseSchema =
  successEnvelopeSchema(nodePreviewSchema);

/**
 * Publishing is the backend's decision, so the success payload is narrow on
 * purpose: a response that does not say `published` is not a successful
 * publish, whatever the HTTP status was.
 */
export const publishUnitDataSchema = z.object({
  id: positiveIdSchema,
  status: z.literal("published"),
  published_nodes: z.number().int().nonnegative(),
});

export const publishUnitResponseSchema = successEnvelopeSchema(
  publishUnitDataSchema,
);

/** The `details.blocking` rows a `CONTENT_NOT_PUBLISHABLE` 422 carries. */
export const publishBlockingRowSchema = z.object({
  node_id: positiveIdSchema,
  node_title: nonEmptyStringSchema,
  message: z.string(),
});

export const publishBlockingDetailsSchema = z.object({
  blocking: z.array(publishBlockingRowSchema),
});

export const CONTENT_NOT_PUBLISHABLE = "CONTENT_NOT_PUBLISHABLE";

export type NodeType = z.infer<typeof nodeTypeSchema>;
export type DifficultyLevel = z.infer<typeof difficultyLevelSchema>;
export type UnitNode = z.infer<typeof unitNodeSchema>;
export type UnitNodesData = z.infer<typeof unitNodesDataSchema>;
export type UnitNodesResponse = z.infer<typeof unitNodesResponseSchema>;
export type NodePreview = z.infer<typeof nodePreviewSchema>;
export type NodePreviewResponse = z.infer<typeof nodePreviewResponseSchema>;
export type PublishUnitData = z.infer<typeof publishUnitDataSchema>;
export type PublishUnitResponse = z.infer<typeof publishUnitResponseSchema>;
export type PublishBlockingRow = z.infer<typeof publishBlockingRowSchema>;
