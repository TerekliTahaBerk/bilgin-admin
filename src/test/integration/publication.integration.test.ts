import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";

import { GET as nodePreview } from "@/app/api/admin/nodes/[nodeId]/preview-selection/route";
import { GET as unitNodes } from "@/app/api/admin/units/[unitId]/nodes/route";
import { POST as publish } from "@/app/api/admin/units/[unitId]/publish/route";
import { POST as login } from "@/app/api/session/login/route";
import {
  contentEditorFixture,
  contentReviewerFixture,
  type AdminRoleFixture,
} from "@/test/fixtures/admin-roles";
import {
  contentNotPublishableResponse,
  passingPreviewResponse,
  publishSuccessResponse,
  validUnitNodesResponse,
} from "@/test/fixtures/publication-api";
import { mswServer } from "@/test/integration/msw-server";
import {
  APP_ORIGIN,
  BACKEND_LOGIN_URL,
  BACKEND_ORIGIN,
  loginRequest,
  mutationRequest,
  resourceRequest,
  sealFromResponse,
  setCookieHeader,
} from "@/test/integration/support";

const UNIT_ID = 11;
const NODE_ID = 101;

const BACKEND_NODES_URL = `${BACKEND_ORIGIN}/api/admin/v1/units/${UNIT_ID}/nodes`;
const BACKEND_PREVIEW_URL = `${BACKEND_ORIGIN}/api/admin/v1/nodes/${NODE_ID}/preview-selection`;
const BACKEND_PUBLISH_URL = `${BACKEND_ORIGIN}/api/admin/v1/units/${UNIT_ID}/publish`;

const ANY_NODES_URL = `${BACKEND_ORIGIN}/api/admin/v1/units/:unitId/nodes`;
const ANY_PREVIEW_URL = `${BACKEND_ORIGIN}/api/admin/v1/nodes/:nodeId/preview-selection`;
const ANY_PUBLISH_URL = `${BACKEND_ORIGIN}/api/admin/v1/units/:unitId/publish`;

async function issueSession(
  fixture: AdminRoleFixture = contentReviewerFixture,
): Promise<string> {
  mswServer.use(
    http.post(BACKEND_LOGIN_URL, () =>
      HttpResponse.json(fixture.loginResponse),
    ),
  );

  const response = await login(
    loginRequest({ email: "admin@bilgin.test", password: "test-password" }),
  );
  const seal = sealFromResponse(response);

  mswServer.resetHandlers();

  return seal;
}

function callNodes(
  seal: string | null,
  unitId: string = String(UNIT_ID),
  extraHeaders: Record<string, string> = {},
) {
  return unitNodes(
    resourceRequest(`/api/admin/units/${unitId}/nodes`, seal, extraHeaders),
    { params: Promise.resolve({ unitId }) },
  );
}

function callPreview(
  seal: string | null,
  nodeId: string = String(NODE_ID),
  extraHeaders: Record<string, string> = {},
) {
  return nodePreview(
    resourceRequest(
      `/api/admin/nodes/${nodeId}/preview-selection`,
      seal,
      extraHeaders,
    ),
    { params: Promise.resolve({ nodeId }) },
  );
}

function callPublish(
  seal: string | null,
  unitId: string = String(UNIT_ID),
  extraHeaders: Record<string, string> = { origin: APP_ORIGIN },
) {
  const request = mutationRequest(
    `/api/admin/units/${unitId}/publish`,
    seal,
    "POST",
    undefined,
    extraHeaders,
  );

  return publish(request, { params: Promise.resolve({ unitId }) });
}

/** Matches ANY id, so a wrong outgoing path still fails loudly. */
function watchBackend(
  pattern: string,
  handler: Parameters<typeof http.get>[1],
) {
  const seen = vi.fn();

  mswServer.use(
    http.all(pattern, (info) => {
      seen(info.request);

      return handler(info);
    }),
  );

  return seen;
}

describe("GET /api/admin/units/[unitId]/nodes", () => {
  it("returns the nodes through the real transport", async () => {
    const seal = await issueSession();
    let requestedUrl: string | null = null;

    mswServer.use(
      http.get(ANY_NODES_URL, ({ request }) => {
        requestedUrl = request.url;

        return HttpResponse.json(validUnitNodesResponse);
      }),
    );

    const response = await callNodes(seal);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requestedUrl).toBe(BACKEND_NODES_URL);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body.data.nodes).toHaveLength(3);
    expect(body.data.nodes.map((node: { id: number }) => node.id)).toEqual([
      101, 102, 103,
    ]);
    expect(setCookieHeader(response)).toBeUndefined();
  });

  it("is open to an admin without publish_content", async () => {
    // Content reads are open on the backend; inventing an ability guard here
    // would hide data the backend is willing to serve.
    const seal = await issueSession(contentEditorFixture);
    watchBackend(ANY_NODES_URL, () =>
      HttpResponse.json(validUnitNodesResponse),
    );

    expect((await callNodes(seal)).status).toBe(200);
  });

  it("authenticates with the session token and leaks nothing back", async () => {
    const seal = await issueSession();
    let authorization: string | null = null;

    mswServer.use(
      http.get(ANY_NODES_URL, ({ request }) => {
        authorization = request.headers.get("authorization");

        return HttpResponse.json(validUnitNodesResponse);
      }),
    );

    const serialized = JSON.stringify(await (await callNodes(seal)).json());

    expect(authorization).toBe(`Bearer ${contentReviewerFixture.token}`);
    expect(serialized).not.toContain(contentReviewerFixture.token);
    expect(serialized).not.toContain(BACKEND_ORIGIN);
  });

  it("forwards no browser-supplied header to the backend", async () => {
    const seal = await issueSession();
    let received: Record<string, string | null> = {};

    mswServer.use(
      http.get(ANY_NODES_URL, ({ request }) => {
        received = {
          authorization: request.headers.get("authorization"),
          cookie: request.headers.get("cookie"),
          xForwardedFor: request.headers.get("x-forwarded-for"),
          origin: request.headers.get("origin"),
        };

        return HttpResponse.json(validUnitNodesResponse);
      }),
    );

    await callNodes(seal, String(UNIT_ID), {
      authorization: "Bearer attacker-supplied-token",
      "x-forwarded-for": "203.0.113.7",
      origin: "https://evil.test",
    });

    expect(received.authorization).toBe(
      `Bearer ${contentReviewerFixture.token}`,
    );
    expect(received.cookie).toBeNull();
    expect(received.xForwardedFor).toBeNull();
    expect(received.origin).toBeNull();
  });

  it.each([
    ["zero", "0"],
    ["a word", "abc"],
    ["a traversal attempt", "1/../../me"],
    ["a query string", "1?x=y"],
    ["an oversized integer", "999999999999999999999"],
  ])("rejects %s with 400 and no backend call", async (_label, unitId) => {
    const seal = await issueSession();
    const seen = watchBackend(ANY_NODES_URL, () =>
      HttpResponse.json(validUnitNodesResponse),
    );

    const response = await callNodes(seal, unitId);

    expect(response.status).toBe(400);
    expect(seen).toHaveBeenCalledTimes(0);
  });

  it.each([
    ["a word", "abc"],
    ["a traversal attempt", "1/../../me"],
    ["a query string", "1?x=y"],
    ["an oversized integer", "999999999999999999999"],
  ])("never echoes %s back to the browser", async (_label, unitId) => {
    const seal = await issueSession();
    watchBackend(ANY_NODES_URL, () =>
      HttpResponse.json(validUnitNodesResponse),
    );

    const response = await callNodes(seal, unitId);

    expect(JSON.stringify(await response.json())).not.toContain(unitId);
  });

  it("rejects a request with no session without calling the backend", async () => {
    const seen = watchBackend(ANY_NODES_URL, () =>
      HttpResponse.json(validUnitNodesResponse),
    );

    expect((await callNodes(null)).status).toBe(401);
    expect(seen).toHaveBeenCalledTimes(0);
  });

  it("clears the session when the backend rejects the token", async () => {
    const seal = await issueSession();
    watchBackend(ANY_NODES_URL, () =>
      HttpResponse.json({ message: "Unauthenticated." }, { status: 401 }),
    );

    const response = await callNodes(seal);

    expect(response.status).toBe(401);
    expect(setCookieHeader(response)).toContain("Max-Age=0");
  });

  it("preserves the session on a backend 403", async () => {
    const seal = await issueSession();
    watchBackend(ANY_NODES_URL, () =>
      HttpResponse.json(
        { error: { code: "FORBIDDEN", message: "Bu işlem için yetkin yok." } },
        { status: 403 },
      ),
    );

    const response = await callNodes(seal);

    expect(response.status).toBe(403);
    expect(setCookieHeader(response)).toBeUndefined();
  });

  it("rejects a backend payload that breaks the contract", async () => {
    const seal = await issueSession();
    watchBackend(ANY_NODES_URL, () =>
      HttpResponse.json({
        data: { unit: { id: 11 }, nodes: [{ id: 1 }] },
        meta: { server_time: "2026-09-20T09:05:20+00:00" },
      }),
    );

    expect((await callNodes(seal)).status).toBe(502);
  });
});

describe("GET /api/admin/nodes/[nodeId]/preview-selection", () => {
  it("returns the dry run through the real transport", async () => {
    const seal = await issueSession();
    let requestedUrl: string | null = null;
    let method: string | null = null;

    mswServer.use(
      http.get(ANY_PREVIEW_URL, ({ request }) => {
        requestedUrl = request.url;
        method = request.method;

        return HttpResponse.json(passingPreviewResponse);
      }),
    );

    const response = await callPreview(seal);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requestedUrl).toBe(BACKEND_PREVIEW_URL);
    // A preview changes nothing, so it is never sent as a mutation.
    expect(method).toBe("GET");
    expect(body.data.passes).toBe(true);
    expect(body.data.required).toBe(6);
  });

  it.each([
    ["zero", "0"],
    ["a word", "abc"],
    ["a traversal attempt", "1/../../me"],
  ])("rejects %s with 400 and no backend call", async (_label, nodeId) => {
    const seal = await issueSession();
    const seen = watchBackend(ANY_PREVIEW_URL, () =>
      HttpResponse.json(passingPreviewResponse),
    );

    expect((await callPreview(seal, nodeId)).status).toBe(400);
    expect(seen).toHaveBeenCalledTimes(0);
  });

  it("rejects a request with no session without calling the backend", async () => {
    const seen = watchBackend(ANY_PREVIEW_URL, () =>
      HttpResponse.json(passingPreviewResponse),
    );

    expect((await callPreview(null)).status).toBe(401);
    expect(seen).toHaveBeenCalledTimes(0);
  });

  it("leaks neither the token nor the backend origin", async () => {
    const seal = await issueSession();
    watchBackend(ANY_PREVIEW_URL, () =>
      HttpResponse.json(passingPreviewResponse),
    );

    const serialized = JSON.stringify(await (await callPreview(seal)).json());

    expect(serialized).not.toContain(contentReviewerFixture.token);
    expect(serialized).not.toContain(BACKEND_ORIGIN);
  });
});

describe("POST /api/admin/units/[unitId]/publish — origin", () => {
  it.each([
    ["a missing origin", {}],
    ["a foreign origin", { origin: "https://evil.test" }],
    ["a null origin", { origin: "null" }],
    ["an origin with a path", { origin: `${APP_ORIGIN}/api` }],
  ])("rejects %s with 403 and no backend call", async (_label, headers) => {
    const seal = await issueSession();
    const seen = watchBackend(ANY_PUBLISH_URL, () =>
      HttpResponse.json(publishSuccessResponse),
    );

    const response = await callPublish(seal, String(UNIT_ID), {
      "content-type": "application/json",
      ...headers,
    });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(seen).toHaveBeenCalledTimes(0);
    expect(body.error.code).toBe("ORIGIN_REJECTED");
    expect(setCookieHeader(response)).toBeUndefined();
  });

  it("checks the origin before it looks at the session", async () => {
    const seen = watchBackend(ANY_PUBLISH_URL, () =>
      HttpResponse.json(publishSuccessResponse),
    );

    const response = await callPublish(null, String(UNIT_ID), {});

    expect(response.status).toBe(403);
    expect(seen).toHaveBeenCalledTimes(0);
  });
});

describe("POST /api/admin/units/[unitId]/publish — ability", () => {
  it("refuses an admin with edit_content but no publish_content", async () => {
    // Four-eyes: the author of a question may not be the one who ships it.
    const seal = await issueSession(contentEditorFixture);
    const seen = watchBackend(ANY_PUBLISH_URL, () =>
      HttpResponse.json(publishSuccessResponse),
    );

    const response = await callPublish(seal);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(seen).toHaveBeenCalledTimes(0);
    // A 403 is an answer about this request, not about the session.
    expect(setCookieHeader(response)).toBeUndefined();
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("rejects a request with no session without calling the backend", async () => {
    const seen = watchBackend(ANY_PUBLISH_URL, () =>
      HttpResponse.json(publishSuccessResponse),
    );

    expect((await callPublish(null)).status).toBe(401);
    expect(seen).toHaveBeenCalledTimes(0);
  });
});

describe("POST /api/admin/units/[unitId]/publish — backend exchange", () => {
  it("posts to the exact publish endpoint with no body", async () => {
    const seal = await issueSession();
    let requestedUrl: string | null = null;
    let method: string | null = null;
    let bodyText: string | null = null;
    let authorization: string | null = null;

    mswServer.use(
      http.post(ANY_PUBLISH_URL, async ({ request }) => {
        requestedUrl = request.url;
        method = request.method;
        authorization = request.headers.get("authorization");
        bodyText = await request.text();

        return HttpResponse.json(publishSuccessResponse);
      }),
    );

    const response = await callPublish(seal);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(requestedUrl).toBe(BACKEND_PUBLISH_URL);
    expect(method).toBe("POST");
    expect(bodyText).toBe("");
    expect(authorization).toBe(`Bearer ${contentReviewerFixture.token}`);
    expect(body.data).toEqual({
      id: 11,
      status: "published",
      published_nodes: 3,
    });
    expect(JSON.stringify(body)).not.toContain(contentReviewerFixture.token);
  });

  it("passes a CONTENT_NOT_PUBLISHABLE 422 through with its blocking rows", async () => {
    const seal = await issueSession();
    watchBackend(ANY_PUBLISH_URL, () =>
      HttpResponse.json(contentNotPublishableResponse, { status: 422 }),
    );

    const response = await callPublish(seal);
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.code).toBe("CONTENT_NOT_PUBLISHABLE");
    expect(body.error.details.blocking).toEqual([
      {
        node_id: 103,
        node_title: "Ünite Challenge",
        message: "Kural 3 soru getiriyor, 10 gerekiyor.",
      },
    ]);
    // A refusal is not a dead session.
    expect(setCookieHeader(response)).toBeUndefined();
  });

  it("clears the session when the backend rejects the token", async () => {
    const seal = await issueSession();
    watchBackend(ANY_PUBLISH_URL, () =>
      HttpResponse.json({ message: "Unauthenticated." }, { status: 401 }),
    );

    const response = await callPublish(seal);

    expect(response.status).toBe(401);
    expect(setCookieHeader(response)).toContain("Max-Age=0");
  });

  it("preserves the session on a backend 403", async () => {
    const seal = await issueSession();
    watchBackend(ANY_PUBLISH_URL, () =>
      HttpResponse.json(
        { error: { code: "FORBIDDEN", message: "Bu işlem için yetkin yok." } },
        { status: 403 },
      ),
    );

    const response = await callPublish(seal);

    expect(response.status).toBe(403);
    expect(setCookieHeader(response)).toBeUndefined();
  });

  it("reports a 5xx as a gateway failure without retrying", async () => {
    const seal = await issueSession();
    const seen = watchBackend(ANY_PUBLISH_URL, () =>
      HttpResponse.json({ message: "Server Error" }, { status: 500 }),
    );

    const response = await callPublish(seal);

    expect(response.status).toBe(502);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("rejects a success payload that does not say published", async () => {
    // A 200 whose status is still `draft` is not a successful publish.
    const seal = await issueSession();
    watchBackend(ANY_PUBLISH_URL, () =>
      HttpResponse.json({
        data: { id: 11, status: "draft", published_nodes: 0 },
        meta: { server_time: "2026-09-20T09:05:20+00:00" },
      }),
    );

    expect((await callPublish(seal)).status).toBe(502);
  });

  it.each([
    ["zero", "0"],
    ["a word", "abc"],
    ["a traversal attempt", "1/../../me"],
  ])("rejects %s with 400 and no backend call", async (_label, unitId) => {
    const seal = await issueSession();
    const seen = watchBackend(ANY_PUBLISH_URL, () =>
      HttpResponse.json(publishSuccessResponse),
    );

    const response = await callPublish(seal, unitId);

    expect(response.status).toBe(400);
    expect(seen).toHaveBeenCalledTimes(0);
  });

  it.each([
    ["a word", "abc"],
    ["a traversal attempt", "1/../../me"],
  ])("never echoes %s back to the browser", async (_label, unitId) => {
    const seal = await issueSession();
    watchBackend(ANY_PUBLISH_URL, () =>
      HttpResponse.json(publishSuccessResponse),
    );

    const response = await callPublish(seal, unitId);

    expect(JSON.stringify(await response.json())).not.toContain(unitId);
  });
});
