import { z } from "zod";

export const responseMetaSchema = z.object({
  server_time: z.iso.datetime({ offset: true }),
});

export function successEnvelopeSchema<DataSchema extends z.ZodType>(
  dataSchema: DataSchema,
) {
  return z.object({
    data: dataSchema,
    meta: responseMetaSchema,
  });
}

export const customBackendErrorSchema = z.object({
  error: z.object({
    code: z.string().trim().min(1),
    message: z.string().trim().min(1),
    details: z.unknown().optional(),
  }),
});

export const laravelValidationErrorSchema = z.object({
  message: z.string().trim().min(1),
  errors: z.record(z.string(), z.array(z.string().trim().min(1)).min(1)),
});

export type ResponseMeta = z.infer<typeof responseMetaSchema>;
export type CustomBackendError = z.infer<typeof customBackendErrorSchema>;
export type LaravelValidationError = z.infer<
  typeof laravelValidationErrorSchema
>;
