import { NextResponse, type NextRequest } from "next/server";

import { readSessionSeal } from "@/lib/session/cookie";
import { unsealAdminSession } from "@/lib/session/read";

export async function proxy(request: NextRequest) {
  const seal = readSessionSeal(request);
  const session = seal === null ? null : await unsealAdminSession(seal);

  if (session === null) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/",
};
