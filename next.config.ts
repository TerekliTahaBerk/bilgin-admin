import type { NextConfig } from "next";

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self';",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  /*
   * Staged HSTS rollout: `max-age` alone is safe and fully reversible — a
   * browser that has seen it simply stops trying plain HTTP for this exact
   * origin until the max-age expires. `includeSubDomains` and `preload` are
   * deliberately absent: both extend the same lock to origins and browsers
   * this deployment cannot easily undo (subdomains not yet on HTTPS, or the
   * public HSTS preload list, which takes months to leave). Add them once
   * the subdomain topology is final — see docs/07-uretime-alma.md gate #7 in
   * the admin panel roadmap.
   */
  {
    key: "Strict-Transport-Security",
    value: "max-age=15552000",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
