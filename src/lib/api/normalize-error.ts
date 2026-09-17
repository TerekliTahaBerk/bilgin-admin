import {
  customBackendErrorSchema,
  laravelValidationErrorSchema,
} from "@/contracts/admin/common";
import type { ApiError, ApiErrorKind } from "@/lib/api/error";

export type NormalizeHttpErrorInput = {
  status: number;
  body: unknown;
  retryAfter?: string | number | null;
};

const fallbackMessages: Record<ApiErrorKind, string> = {
  authentication: "Oturum doğrulanamadı.",
  authorization: "Bu işlem için yetkiniz yok.",
  validation: "Gönderilen bilgiler geçersiz.",
  not_found: "İstenen kaynak bulunamadı.",
  rate_limit: "Çok fazla istek gönderildi. Lütfen daha sonra tekrar deneyin.",
  server: "Sunucu hatası oluştu. Lütfen daha sonra tekrar deneyin.",
  network: "Sunucuya ulaşılamadı. Lütfen bağlantınızı kontrol edin.",
  protocol: "Sunucudan geçersiz bir yanıt alındı.",
  contract: "Sunucu yanıtı beklenen formatta değil.",
  unknown: "İstek tamamlanamadı.",
};

function kindForStatus(status: number): ApiErrorKind {
  if (status === 401) return "authentication";
  if (status === 403) return "authorization";
  if (status === 404) return "not_found";
  if (status === 422) return "validation";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "server";
  return "unknown";
}

export function parseRetryAfterSeconds(
  retryAfter: string | number | null | undefined,
): number | undefined {
  if (retryAfter === null || retryAfter === undefined) {
    return undefined;
  }

  const value =
    typeof retryAfter === "number"
      ? retryAfter
      : /^\d+$/.test(retryAfter.trim())
        ? Number(retryAfter)
        : Number.NaN;

  return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

export function normalizeHttpError({
  status,
  body,
  retryAfter,
}: NormalizeHttpErrorInput): ApiError {
  const kind = kindForStatus(status);

  if (kind === "server") {
    return { kind, status, message: fallbackMessages.server };
  }

  if (status === 422) {
    const validationResult = laravelValidationErrorSchema.safeParse(body);

    if (validationResult.success) {
      return {
        kind,
        status,
        message: validationResult.data.message,
        fields: validationResult.data.errors,
      };
    }
  }

  const customErrorResult = customBackendErrorSchema.safeParse(body);

  if (customErrorResult.success) {
    const { code, message, details } = customErrorResult.data.error;

    return {
      kind,
      status,
      code,
      message,
      ...(details === undefined ? {} : { details }),
      ...(kind === "rate_limit"
        ? { retryAfterSeconds: parseRetryAfterSeconds(retryAfter) }
        : {}),
    };
  }

  return {
    kind,
    status,
    message: fallbackMessages[kind],
    ...(kind === "rate_limit"
      ? { retryAfterSeconds: parseRetryAfterSeconds(retryAfter) }
      : {}),
  };
}
