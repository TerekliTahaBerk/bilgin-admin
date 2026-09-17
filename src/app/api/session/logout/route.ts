import { verifyOrigin } from "@/lib/security/verify-origin";
import { clearSessionCookie } from "@/lib/session/cookie";
import {
  createNoContentSessionResponse,
  createOriginRejectedResponse,
} from "@/lib/session/http";

export async function POST(request: Request) {
  if (!verifyOrigin(request.headers.get("origin"))) {
    return createOriginRejectedResponse();
  }

  const response = createNoContentSessionResponse();

  clearSessionCookie(response);

  return response;
}
