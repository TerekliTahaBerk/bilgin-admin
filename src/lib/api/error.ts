export const apiErrorKinds = [
  "authentication",
  "authorization",
  "validation",
  "not_found",
  "rate_limit",
  "server",
  "network",
  "protocol",
  "contract",
  "unknown",
] as const;

export type ApiErrorKind = (typeof apiErrorKinds)[number];

export type ApiError = {
  kind: ApiErrorKind;
  status: number | null;
  code?: string;
  message: string;
  fields?: Record<string, string[]>;
  details?: unknown;
  retryAfterSeconds?: number;
};

export function createNetworkError(): ApiError {
  return {
    kind: "network",
    status: null,
    message: "Sunucuya ulaşılamadı. Lütfen bağlantınızı kontrol edin.",
  };
}

export function createProtocolError(status: number | null = null): ApiError {
  return {
    kind: "protocol",
    status,
    message: "Sunucudan geçersiz bir yanıt alındı.",
  };
}

export function createContractError(status: number | null = null): ApiError {
  return {
    kind: "contract",
    status,
    message: "Sunucu yanıtı beklenen formatta değil.",
  };
}
