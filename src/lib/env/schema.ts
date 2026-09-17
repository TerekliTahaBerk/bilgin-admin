import { z } from "zod";

export const SESSION_MIN_AGE_SECONDS = 300;
export const SESSION_DEFAULT_MAX_AGE_SECONDS = 8 * 60 * 60;

function originSchema(variableName: string) {
  return z
    .string({ error: `${variableName} is required.` })
    .trim()
    .min(1, { error: `${variableName} is required.` })
    .superRefine((value, context) => {
      let url: URL;

      try {
        url = new URL(value);
      } catch {
        context.addIssue({
          code: "custom",
          message: `${variableName} must be an absolute URL.`,
        });
        return;
      }

      if (url.protocol !== "http:" && url.protocol !== "https:") {
        context.addIssue({
          code: "custom",
          message: `${variableName} must use http: or https:.`,
        });
      }

      if (url.username || url.password) {
        context.addIssue({
          code: "custom",
          message: `${variableName} must not include credentials.`,
        });
      }

      if (url.pathname !== "/") {
        context.addIssue({
          code: "custom",
          message: `${variableName} must not include a path.`,
        });
      }

      if (url.search) {
        context.addIssue({
          code: "custom",
          message: `${variableName} must not include a query.`,
        });
      }

      if (url.hash) {
        context.addIssue({
          code: "custom",
          message: `${variableName} must not include a hash.`,
        });
      }
    })
    .transform((value) => new URL(value).origin);
}

const baseServerEnvSchema = z.object({
  BILGIN_API_URL: originSchema("BILGIN_API_URL"),
  APP_ORIGIN: originSchema("APP_ORIGIN"),
  SESSION_SECRET: z
    .string({ error: "SESSION_SECRET is required." })
    .trim()
    .min(32, { error: "SESSION_SECRET must be at least 32 characters." }),
  SESSION_MAX_AGE_SECONDS: z.coerce
    .number({ error: "SESSION_MAX_AGE_SECONDS must be an integer." })
    .int({ error: "SESSION_MAX_AGE_SECONDS must be an integer." })
    .min(SESSION_MIN_AGE_SECONDS, {
      error: `SESSION_MAX_AGE_SECONDS must be at least ${SESSION_MIN_AGE_SECONDS}.`,
    })
    .max(SESSION_DEFAULT_MAX_AGE_SECONDS, {
      error: `SESSION_MAX_AGE_SECONDS must not exceed ${SESSION_DEFAULT_MAX_AGE_SECONDS}.`,
    })
    .default(SESSION_DEFAULT_MAX_AGE_SECONDS),
});

export type ServerEnv = z.infer<typeof baseServerEnvSchema>;

export function parseServerEnv(
  input: unknown,
  nodeEnv: string | undefined,
): ServerEnv {
  return baseServerEnvSchema
    .superRefine((environment, context) => {
      if (nodeEnv !== "production") {
        return;
      }

      for (const variableName of ["BILGIN_API_URL", "APP_ORIGIN"] as const) {
        if (new URL(environment[variableName]).protocol !== "https:") {
          context.addIssue({
            code: "custom",
            path: [variableName],
            message: `${variableName} must use https: in production.`,
          });
        }
      }
    })
    .parse(input);
}
