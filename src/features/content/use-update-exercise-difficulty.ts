"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import type {
  ExerciseDetail,
  UpdateExerciseResponse,
} from "@/contracts/admin/exercise-editor";
import { updateExerciseDifficulty } from "@/features/content/content-client";
import {
  exerciseDetailQueryKey,
  nodePreviewQueryPrefix,
  unitExercisesQueryPrefix,
} from "@/features/content/content-queries";
import { toApiError, type ApiError } from "@/lib/api/error";

export type DifficultyUpdateTarget = Readonly<{
  exerciseId: number;
  unitId: number;
}>;

export type SavedDifficulty = UpdateExerciseResponse["data"] &
  Readonly<{ difficulty: number }>;

/**
 * Sets one question's difficulty with a difficulty-only PATCH. Runs only when
 * called — the calibration assistant calls it from an explicit click, one
 * question at a time.
 *
 * Afterwards: the question's unit lists are refetched (where the Quality
 * Center reads the row), the cached detail takes the new level and version,
 * and every node preview is invalidated — the backend's selection pools
 * filter by difficulty, so a node's available count can change.
 */
export function useUpdateExerciseDifficulty(
  target: DifficultyUpdateTarget,
  /**
   * Runs on success before any cache update. A hook-level callback, so it
   * still runs when the caller unmounts on the update itself (the action
   * button disappears once the levels agree) — `mutate`'s own callbacks
   * would not.
   */
  onSaved?: (saved: SavedDifficulty) => void,
) {
  const queryClient = useQueryClient();

  return useMutation<SavedDifficulty, ApiError, number>({
    mutationFn: async (difficulty) => {
      try {
        const result = await updateExerciseDifficulty(target.exerciseId, {
          difficulty,
        });
        return { ...result, difficulty };
      } catch (error) {
        throw toApiError(error);
      }
    },
    onSuccess: async (saved) => {
      onSaved?.(saved);
      queryClient.setQueryData<ExerciseDetail>(
        exerciseDetailQueryKey(target.exerciseId),
        (current) =>
          current === undefined
            ? current
            : {
                ...current,
                difficulty: saved.difficulty,
                version: saved.version,
              },
      );
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: unitExercisesQueryPrefix(target.unitId),
        }),
        queryClient.invalidateQueries({ queryKey: nodePreviewQueryPrefix }),
      ]);
    },
  });
}
