import type {
  CurriculumOptions,
  CurriculumRow,
} from "@/contracts/admin/workflows";
import {
  getCurriculumMapping,
  getCurriculumOptions,
} from "@/features/workflows/workflow-client";

export type CurriculumMapping = Readonly<{
  exam_variant: { code: string; name: string };
  courses: CurriculumRow[];
}>;

/** Variants and sections change only with seed data. */
export function curriculumOptionsQueryOptions() {
  return {
    queryKey: ["curriculum", "options"] as const,
    queryFn: (): Promise<CurriculumOptions> => getCurriculumOptions(),
    staleTime: 300_000,
  };
}

export function curriculumMappingQueryKey(variantId: number) {
  return ["curriculum", "mapping", variantId] as const;
}

/**
 * One variant's saved mapping. The health overview and the mapping editor
 * read the same entry, so opening a variant never refetches it and a save
 * refreshes both.
 */
export function curriculumMappingQueryOptions(variantId: number) {
  return {
    queryKey: curriculumMappingQueryKey(variantId),
    queryFn: (): Promise<CurriculumMapping> => getCurriculumMapping(variantId),
    refetchOnWindowFocus: false,
  };
}
