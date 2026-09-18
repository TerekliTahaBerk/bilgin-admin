import "server-only";

import {
  coursesResponseSchema,
  type CoursesResponse,
} from "@/contracts/admin/content";
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

/**
 * Content read operations. Each one names a fixed endpoint in the transport
 * registry — there is deliberately no `get(path)` escape hatch, so a caller can
 * never choose the backend path.
 */
export const adminContent = Object.freeze({
  courses(
    backendToken: string,
    options: BackendRequestOptions = {},
  ): Promise<BackendResult<CoursesResponse>> {
    return requestAdminBackend(
      {
        operation: "courses",
        backendToken: requireBackendToken(backendToken),
        signal: options.signal,
      },
      coursesResponseSchema,
    );
  },
});
