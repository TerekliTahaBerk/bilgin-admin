import type { NodePreview, UnitNode } from "@/contracts/admin/publication";
import { summarizeReadiness } from "@/features/content/readiness";
import type {
  NodeCheck,
  UnitReadinessSnapshot,
} from "@/features/content/use-readiness-snapshots";

export function unitNode(
  id: number,
  overrides: Partial<UnitNode> = {},
): UnitNode {
  return {
    id,
    title: `Adım ${id}`,
    type: "study",
    difficulty: "orta",
    sort_order: 1,
    exercise_count: 5,
    status: "draft",
    ...overrides,
  };
}

/** A preview in the backend's exact shape; `passes` defaults to the counts. */
export function nodePreview(
  nodeId: number,
  overrides: Partial<NodePreview> = {},
): NodePreview {
  const required = overrides.required ?? 5;
  const available = overrides.available ?? 6;
  const passes = overrides.passes ?? available >= required;

  return {
    node_id: nodeId,
    node_title: `Adım ${nodeId}`,
    required,
    available,
    relaxed: false,
    passes,
    message: passes
      ? `Yeterli (${available}/${required}).`
      : `Kural ${available} soru getiriyor, ${required} gerekiyor.`,
    live_available: available,
    live_passes: passes,
    live_warning: null,
    ...overrides,
  };
}

/**
 * A readiness snapshot as `useReadinessSnapshots` would build it. Each node
 * without a preview is "unchecked" unless listed in `errors`.
 */
export function readinessSnapshot(
  unitId: number,
  nodes: UnitNode[] | null,
  previews: NodePreview[] = [],
  { checking = false }: { checking?: boolean } = {},
): UnitReadinessSnapshot {
  if (nodes === null) {
    return {
      unitId,
      nodesState: checking ? "checking" : "unchecked",
      nodesError: null,
      nodes: [],
      checks: [],
      summary: null,
      isChecking: checking,
    };
  }

  const byNode = new Map(previews.map((preview) => [preview.node_id, preview]));
  const checks: NodeCheck[] = nodes.map((node) => {
    const preview = byNode.get(node.id);

    return {
      node,
      state: preview === undefined ? "unchecked" : "answered",
      preview,
      error: null,
    };
  });

  return {
    unitId,
    nodesState: "answered",
    nodesError: null,
    nodes,
    checks,
    summary: summarizeReadiness(nodes.length, previews),
    isChecking: checking,
  };
}
