import "server-only";

import {
  adminLoginRequestSchema,
  adminLoginResponseSchema,
  adminMeResponseSchema,
  type AdminLoginRequest,
  type AdminLoginResponse,
  type AdminMeResponse,
} from "@/contracts/admin/auth";
import {
  requestAdminBackend,
  type BackendRequestOptions,
  type BackendResult,
} from "@/lib/backend/client";

function requireBackendToken(backendToken: string): string {
  if (backendToken.trim().length === 0) {
    throw new TypeError("A backend token is required.");
  }

  return backendToken;
}

export const adminBackend = Object.freeze({
  login(
    input: AdminLoginRequest,
    options: BackendRequestOptions = {},
  ): Promise<BackendResult<AdminLoginResponse>> {
    const request = adminLoginRequestSchema.parse(input);

    return requestAdminBackend(
      { operation: "login", body: request, signal: options.signal },
      adminLoginResponseSchema,
    );
  },

  me(
    backendToken: string,
    options: BackendRequestOptions = {},
  ): Promise<BackendResult<AdminMeResponse>> {
    return requestAdminBackend(
      {
        operation: "me",
        backendToken: requireBackendToken(backendToken),
        signal: options.signal,
      },
      adminMeResponseSchema,
    );
  },
});
