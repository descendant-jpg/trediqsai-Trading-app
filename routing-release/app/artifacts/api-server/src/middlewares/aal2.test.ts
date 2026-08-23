import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { NextFunction, Request, Response } from "express";

type Middleware = (req: Request, res: Response, next: NextFunction) => Promise<void>;

let requireAal2IfMfaEnrolledWrite: Middleware;
let clearOutcomeCache: () => void;

beforeAll(async () => {
  // The middleware reads Supabase config at module load.
  process.env["SUPABASE_URL"] = "https://stub.supabase.co";
  process.env["SUPABASE_PUBLISHABLE_KEY"] = "stub-key";
  vi.resetModules();
  const mod = await import("./aal2");
  requireAal2IfMfaEnrolledWrite = mod.requireAal2IfMfaEnrolledWrite;
  clearOutcomeCache = mod.__clearAalOutcomeCache;
});

afterEach(() => {
  clearOutcomeCache();
  vi.unstubAllGlobals();
});

interface MockResult {
  statusCode: number | null;
  body: unknown;
  headers: Record<string, string>;
  nextCalled: boolean;
}

async function run(authorization?: string): Promise<MockResult> {
  const result: MockResult = { statusCode: null, body: null, headers: {}, nextCalled: false };
  const req = { headers: authorization ? { authorization } : {}, path: "/autopilot/master" } as unknown as Request;
  const res = {
    setHeader(name: string, value: string) {
      result.headers[name.toLowerCase()] = value;
      return this;
    },
    status(code: number) {
      result.statusCode = code;
      return this;
    },
    json(body: unknown) {
      result.body = body;
      return this;
    },
  } as unknown as Response;
  await requireAal2IfMfaEnrolledWrite(req, res, () => {
    result.nextCalled = true;
  });
  return result;
}

function stubAalResponse(status: number) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new (class {
      ok = status >= 200 && status < 300;
      status = status;
    })() as unknown as globalThis.Response),
  );
}

describe("requireAal2IfMfaEnrolledWrite", () => {
  it("rejects requests without a bearer token", async () => {
    const result = await run();
    expect(result.statusCode).toBe(401);
    expect(result.nextCalled).toBe(false);
  });

  it("passes through when the AAL check succeeds", async () => {
    stubAalResponse(204);
    const result = await run("Bearer token-ok");
    expect(result.nextCalled).toBe(true);
    expect(result.statusCode).toBeNull();
  });

  it("blocks with 403 mfa_required on a definitive MFA rejection", async () => {
    stubAalResponse(403);
    const result = await run("Bearer token-mfa");
    expect(result.statusCode).toBe(403);
    expect((result.body as { code?: string }).code).toBe("mfa_required");
    expect(result.nextCalled).toBe(false);
  });

  it("degrades to pass-through (never 503) when the AAL service returns 5xx", async () => {
    stubAalResponse(503);
    const result = await run("Bearer token-unknown");
    expect(result.nextCalled).toBe(true);
    expect(result.statusCode).toBeNull();
    expect(result.headers["x-security-check"]).toBe("degraded");
  });

  it("degrades to pass-through on a network error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("ECONNREFUSED"))));
    const result = await run("Bearer token-neterr");
    expect(result.nextCalled).toBe(true);
    expect(result.headers["x-security-check"]).toBe("degraded");
  });

  it("keeps a known MFA-required user blocked during an outage", async () => {
    // First, a definitive rejection is remembered for this token…
    stubAalResponse(401);
    await run("Bearer token-enrolled");
    // …then the AAL service goes down: the same user stays blocked.
    stubAalResponse(500);
    const result = await run("Bearer token-enrolled");
    expect(result.statusCode).toBe(403);
    expect((result.body as { code?: string }).code).toBe("mfa_required");
    expect(result.nextCalled).toBe(false);
  });

  it("passes a previously verified user through during an outage without the degraded flag path blocking", async () => {
    stubAalResponse(200);
    await run("Bearer token-verified");
    stubAalResponse(502);
    const result = await run("Bearer token-verified");
    expect(result.nextCalled).toBe(true);
    expect(result.statusCode).toBeNull();
  });
});
