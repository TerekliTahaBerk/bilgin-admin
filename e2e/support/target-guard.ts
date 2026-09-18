/**
 * The auth smoke suite logs in and logs out, so it mutates session state. It
 * must never be pointed at a deployed environment.
 *
 * The policy is fail-closed by allowlist: only loopback hosts are accepted.
 * There is deliberately no remote override — a staging escape hatch is exactly
 * how a mutating suite ends up running against production.
 */
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export class E2eTargetRejectedError extends Error {
  constructor(reason: string) {
    super(`Refusing to run the auth smoke suite: ${reason}`);
    this.name = "E2eTargetRejectedError";
  }
}

export function assertLocalE2eTarget(
  baseUrl: string | undefined,
  env: Record<string, string | undefined> = process.env,
): string {
  if (env.E2E_TARGET_ENV !== undefined && env.E2E_TARGET_ENV !== "local") {
    throw new E2eTargetRejectedError(
      `E2E_TARGET_ENV is "${env.E2E_TARGET_ENV}"; only "local" is allowed.`,
    );
  }

  if (baseUrl === undefined || baseUrl.trim().length === 0) {
    throw new E2eTargetRejectedError("no base URL was provided.");
  }

  let url: URL;

  try {
    url = new URL(baseUrl);
  } catch {
    throw new E2eTargetRejectedError(`"${baseUrl}" is not a valid URL.`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new E2eTargetRejectedError(
      `"${url.protocol}" is not an HTTP(S) target.`,
    );
  }

  if (!LOOPBACK_HOSTNAMES.has(url.hostname)) {
    throw new E2eTargetRejectedError(
      `"${url.hostname}" is not a loopback host.`,
    );
  }

  return baseUrl;
}
