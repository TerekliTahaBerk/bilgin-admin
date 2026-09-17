import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const sourceRoot = path.resolve(import.meta.dirname, "../..");

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const entryPath = path.join(directory, entry);

    if (statSync(entryPath).isDirectory()) {
      return listSourceFiles(entryPath);
    }

    return /\.tsx?$/.test(entry) && !entry.endsWith(".test.ts")
      ? [entryPath]
      : [];
  });
}

const sourceFiles = listSourceFiles(sourceRoot);

function read(relativePath: string): string {
  return readFileSync(path.join(sourceRoot, relativePath), "utf8");
}

function clientSourceFiles(): string[] {
  return sourceFiles.filter((file) => {
    const contents = readFileSync(file, "utf8");

    return (
      contents.startsWith('"use client"') &&
      !contents.includes('import "server-only"')
    );
  });
}

describe("app shell architecture", () => {
  it("mounts SessionHeartbeat exactly once in the tree", () => {
    const mounts = sourceFiles.filter((file) =>
      readFileSync(file, "utf8").includes("<SessionHeartbeat"),
    );

    expect(mounts.map((file) => path.relative(sourceRoot, file))).toEqual([
      "components/app-shell/app-shell.tsx",
    ]);
  });

  it("keeps the panel layout free of backend calls and cookie refreshes", () => {
    const layout = read("app/(panel)/layout.tsx");

    for (const forbidden of [
      "fetch(",
      "adminBackend",
      "getSession(",
      "markSessionValidated",
      "setSessionCookie",
      "sealAdminSession",
    ]) {
      expect(layout).not.toContain(forbidden);
    }
  });

  it("derives navigation from the Step 07 registry and filterNavigation", () => {
    const sidebar = read("components/app-shell/sidebar.tsx");

    expect(sidebar).toContain("filterNavigation(adminNavigation, admin)");
  });

  it("reuses logoutSession instead of duplicating the logout request", () => {
    const logoutButton = read("components/app-shell/logout-button.tsx");

    expect(logoutButton).toContain("logoutSession");
    expect(logoutButton).not.toContain("fetch(");

    const logoutCallers = sourceFiles.filter((file) =>
      /fetch\(\s*"\/api\/session\/logout"/.test(readFileSync(file, "utf8")),
    );

    expect(
      logoutCallers.map((file) => path.relative(sourceRoot, file)),
    ).toEqual(["features/auth/session-client.ts"]);
  });

  it("never derives authorization from a role in any source file", () => {
    const offenders = sourceFiles.filter((file) =>
      /role\s*===|role\s*==[^=]|switch\s*\(\s*\w*[Rr]ole|ROLE_PERMISSIONS|permissionsByRole/.test(
        readFileSync(file, "utf8"),
      ),
    );

    expect(offenders.map((file) => path.relative(sourceRoot, file))).toEqual(
      [],
    );
  });

  it("keeps session secrets and backend config out of client components", () => {
    const offenders = clientSourceFiles().filter((file) =>
      /backendToken|SESSION_SECRET|BILGIN_API_URL|validatedAt|expiresAt|issuedAt/.test(
        readFileSync(file, "utf8"),
      ),
    );

    expect(offenders.map((file) => path.relative(sourceRoot, file))).toEqual(
      [],
    );
  });

  it("keeps the proxy authentication-only", () => {
    const proxy = read("proxy.ts");

    expect(proxy).not.toContain("fetch(");
    expect(proxy).not.toContain("can(");
    expect(proxy).not.toContain("requireAbility");
    expect(proxy).not.toContain("abilities");
  });
});
