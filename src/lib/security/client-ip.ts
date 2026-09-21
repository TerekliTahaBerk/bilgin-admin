import "server-only";

import { ipAddress } from "@vercel/functions";

// A syntactically plausible IPv4 or IPv6 address — no whitespace, no control
// characters, nothing that could smuggle a second header value if it ever
// ended up interpolated into a raw header string. `ipAddress()` already
// returns a single clean value parsed from Vercel's own header, so this is
// defense in depth, not the primary safeguard.
const PLAUSIBLE_IP_PATTERN = /^[0-9a-fA-F:.]{2,45}$/;

/**
 * The real client IP for this request, as calculated by Vercel's edge
 * proxy — not a header we read and trust blindly, but one Vercel itself
 * sets after stripping whatever the client sent. See
 * https://vercel.com/docs/edge-network/headers#x-real-ip.
 *
 * This exists for exactly one purpose: letting the login route hand
 * Laravel's throttle a real per-visitor IP instead of the single shared
 * address `browser → Next.js → Laravel` would otherwise collapse every
 * request to. See README.md, "Login throttle ve gerçek istemci IP'si", for
 * the full picture — this is one half of that fix. The other half is a
 * deployment-side `TRUSTED_PROXIES` setting on the Laravel side, which this
 * function has no way to configure or verify.
 *
 * Off Vercel — local dev, unit tests, or any other host — there is no such
 * header to read, so this returns `null` rather than a fabricated address.
 * Callers must treat `null` as "omit the forwarded-IP header entirely",
 * never as "forward the string 'null'".
 */
export function getVerifiedClientIp(request: Request): string | null {
  const ip = ipAddress(request);

  if (ip === undefined || !PLAUSIBLE_IP_PATTERN.test(ip)) {
    return null;
  }

  return ip;
}
