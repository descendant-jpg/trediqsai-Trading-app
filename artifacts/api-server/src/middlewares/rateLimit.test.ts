import { describe, expect, it } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { rateLimit } from "./rateLimit";

interface MockResult {
  statusCode: number | null;
  body: unknown;
  headers: Record<string, string>;
  nextCalled: boolean;
}

function run(
  middleware: ReturnType<typeof rateLimit>,
  { ip = "1.2.3.4", authorization }: { ip?: string; authorization?: string } = {},
): MockResult {
  const result: MockResult = {
    statusCode: null,
    body: null,
    headers: {},
    nextCalled: false,
  };

  const req = {
    ip,
    headers: authorization ? { authorization } : {},
  } as unknown as Request;

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

  const next: NextFunction = () => {
    result.nextCalled = true;
  };

  middleware(req, res, next);
  return result;
}

const OPTIONS = { max: 5, windowMs: 60_000, message: "Slow down." };

describe("rateLimit middleware", () => {
  it("allows requests up to the limit, then returns 429 with Retry-After", () => {
    const middleware = rateLimit(OPTIONS);

    for (let i = 0; i < OPTIONS.max; i++) {
      const r = run(middleware);
      expect(r.nextCalled).toBe(true);
      expect(r.statusCode).toBeNull();
    }

    const blocked = run(middleware);
    expect(blocked.nextCalled).toBe(false);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.body).toEqual({ error: OPTIONS.message });
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThanOrEqual(1);
  });

  it("tracks limits per client IP", () => {
    const middleware = rateLimit(OPTIONS);

    for (let i = 0; i < OPTIONS.max; i++) run(middleware, { ip: "10.0.0.1" });
    expect(run(middleware, { ip: "10.0.0.1" }).statusCode).toBe(429);

    // A different client is unaffected.
    const other = run(middleware, { ip: "10.0.0.2" });
    expect(other.nextCalled).toBe(true);
    expect(other.statusCode).toBeNull();
  });

  it("cannot be bypassed by rotating unverified bearer tokens from the same IP", () => {
    const middleware = rateLimit(OPTIONS);

    for (let i = 0; i < OPTIONS.max; i++) {
      run(middleware, { ip: "10.0.0.9", authorization: `Bearer fake-${i}` });
    }

    const blocked = run(middleware, {
      ip: "10.0.0.9",
      authorization: "Bearer another-fresh-token",
    });
    expect(blocked.nextCalled).toBe(false);
    expect(blocked.statusCode).toBe(429);
  });

  it("resets the count after the window elapses", () => {
    const windowMs = 1_000;
    const middleware = rateLimit({ ...OPTIONS, windowMs });

    for (let i = 0; i < OPTIONS.max; i++) run(middleware);
    expect(run(middleware).statusCode).toBe(429);

    return new Promise<void>((resolve) => {
      setTimeout(() => {
        const after = run(middleware);
        expect(after.nextCalled).toBe(true);
        expect(after.statusCode).toBeNull();
        resolve();
      }, windowMs + 50);
    });
  });
});
