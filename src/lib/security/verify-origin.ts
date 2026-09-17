import "server-only";

import { serverEnv } from "@/lib/env/server";

export function verifyOrigin(originHeader: string | null): boolean {
  if (
    originHeader === null ||
    originHeader === "null" ||
    originHeader !== originHeader.trim()
  ) {
    return false;
  }

  let origin: URL;

  try {
    origin = new URL(originHeader);
  } catch {
    return false;
  }

  if (origin.protocol !== "http:" && origin.protocol !== "https:") {
    return false;
  }

  if (
    origin.username ||
    origin.password ||
    origin.pathname !== "/" ||
    origin.search ||
    origin.hash
  ) {
    return false;
  }

  return (
    originHeader === origin.origin && origin.origin === serverEnv.APP_ORIGIN
  );
}
