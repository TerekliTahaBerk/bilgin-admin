import type { z } from "zod";

import { createContractError, type ApiError } from "@/lib/api/error";

export type ContractIssue = {
  path: string;
  message: string;
};

export type ContractParseResult<Value> =
  | { success: true; data: Value }
  | { success: false; error: ApiError; diagnostics: ContractIssue[] };

export function parseContract<Value>(
  schema: z.ZodType<Value>,
  input: unknown,
  status: number | null = null,
): ContractParseResult<Value> {
  const result = schema.safeParse(input);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    error: createContractError(status),
    diagnostics: result.error.issues.map((issue) => ({
      path: issue.path.map(String).join(".") || "<root>",
      message: issue.message,
    })),
  };
}
