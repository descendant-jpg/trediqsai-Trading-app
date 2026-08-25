import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createSupportRouter } from "./support";

process.env["SUPABASE_URL"] = "https://stub.supabase.co";
process.env["SUPABASE_SERVICE_ROLE_KEY"] = "stub-service-key";

const authedIdentity: RequestHandler = (_req, res, next) => {
  res.locals["userId"] = "trader-1";
  next();
};
const anonIdentity: RequestHandler = (_req, res, next) => {
  res.locals["userId"] = "anonymous";
  next();
};
const noRateLimit: RequestHandler = (_req, _res, next) => next();

function app(
  identityMiddleware: RequestHandler,
  fetchImpl: typeof fetch,
  tier: string | null = "elite",
) {
  const server = express();
  server.use(express.json());
  server.use(
    createSupportRouter({
      identityMiddleware,
      fetchImpl,
      tierLookup: async () => tier,
      rateLimitMiddleware: noRateLimit,
    }),
  );
  return server;
}

const profileOk = [{ email: "pro@trader.com", full_name: "Pro Trader" }];

function storageFetch(insertCapture: { body?: unknown } = {}): typeof fetch {
  return (async (url: string, init?: RequestInit) => {
    if (url.includes("/rest/v1/profiles")) {
      return new Response(JSON.stringify(profileOk), { status: 200 });
    }
    if (url.includes("/rest/v1/contact_messages") && init?.method === "POST") {
      insertCapture.body = JSON.parse(String(init.body));
      return new Response(JSON.stringify([{ id: 42 }]), { status: 201 });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;
}

describe("POST /support", () => {
  it("records the ticket with a server-resolved tier prefix and returns a reference", async () => {
    const capture: { body?: Record<string, unknown> } = {};
    const response = await request(app(authedIdentity, storageFetch(capture), "elite"))
      .post("/support")
      .send({ subject: "PnL looks wrong", message: "My BTC trade closed early." });

    expect(response.status).toBe(201);
    expect(response.body.reference).toBe("TQ-000042");
    expect(response.body.status).toBe("open");
    expect(capture.body).toEqual({
      name: "Pro Trader",
      email: "pro@trader.com",
      message: "[ELITE] PnL looks wrong\n\nMy BTC trade closed early.",
      status: "open",
    });
  });

  it("never trusts a client-forged tier prefix", async () => {
    const capture: { body?: Record<string, unknown> } = {};
    const response = await request(app(authedIdentity, storageFetch(capture), "free"))
      .post("/support")
      .send({ subject: "[ELITE] gief priority", message: "please" });

    expect(response.status).toBe(201);
    // The stored prefix comes from the server lookup, not the request body.
    expect(capture.body?.["message"]).toBe("[FREE] [ELITE] gief priority\n\nplease");
  });

  it("rejects anonymous submissions", async () => {
    const response = await request(app(anonIdentity, storageFetch()))
      .post("/support")
      .send({ message: "hello" });

    expect(response.status).toBe(401);
  });

  it("rejects an empty message", async () => {
    const response = await request(app(authedIdentity, storageFetch()))
      .post("/support")
      .send({ subject: "x", message: "   " });

    expect(response.status).toBe(400);
  });

  it("falls back to the verified auth email when the profile row is missing", async () => {
    const capture: { body?: Record<string, unknown> } = {};
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      if (url.includes("/rest/v1/profiles")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (url.includes("/auth/v1/admin/users/")) {
        return new Response(JSON.stringify({ email: "auth@trader.com" }), { status: 200 });
      }
      capture.body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify([{ id: 7 }]), { status: 201 });
    }) as typeof fetch;

    const response = await request(app(authedIdentity, fetchImpl))
      .post("/support")
      .send({ message: "Need help" });

    expect(response.status).toBe(201);
    expect(response.body.reference).toBe("TQ-000007");
    expect(capture.body?.["email"]).toBe("auth@trader.com");
    expect(capture.body?.["message"]).toBe("[ELITE] VIP Support request\n\nNeed help");
  });

  it("returns 400 when no email can be resolved at all", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify([]), { status: 200 })) as typeof fetch;

    const response = await request(app(authedIdentity, fetchImpl))
      .post("/support")
      .send({ message: "Need help" });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/email/);
  });

  it("returns 503 when storage rejects the insert", async () => {
    const fetchImpl = (async (url: string) => {
      if (url.includes("/rest/v1/profiles")) {
        return new Response(JSON.stringify(profileOk), { status: 200 });
      }
      return new Response("boom", { status: 500 });
    }) as typeof fetch;

    const response = await request(app(authedIdentity, fetchImpl))
      .post("/support")
      .send({ message: "Need help" });

    expect(response.status).toBe(503);
  });

  it("returns 503 when storage throws or returns malformed JSON", async () => {
    const throwingFetch = (async (url: string) => {
      if (url.includes("/rest/v1/profiles")) {
        return new Response(JSON.stringify(profileOk), { status: 200 });
      }
      throw new Error("network down");
    }) as typeof fetch;

    const thrown = await request(app(authedIdentity, throwingFetch))
      .post("/support")
      .send({ message: "Need help" });
    expect(thrown.status).toBe(503);

    const malformedFetch = (async (url: string) => {
      if (url.includes("/rest/v1/profiles")) {
        return new Response(JSON.stringify(profileOk), { status: 200 });
      }
      return new Response("not-json", { status: 201 });
    }) as typeof fetch;

    const malformed = await request(app(authedIdentity, malformedFetch))
      .post("/support")
      .send({ message: "Need help" });
    expect(malformed.status).toBe(503);
  });

  it("rate limits repeat submissions per verified user", async () => {
    const server = express();
    server.use(express.json());
    server.use(
      createSupportRouter({
        identityMiddleware: authedIdentity,
        fetchImpl: storageFetch(),
        tierLookup: async () => "pro",
        // Real limiter semantics, tighter cap for the test.
        rateLimitMiddleware: (await import("../middlewares/rateLimit")).rateLimit({
          max: 2,
          windowMs: 60_000,
          message: "slow down",
          key: (_req, res) => `support:${res.locals["userId"]}`,
        }),
      }),
    );

    for (const expected of [201, 201, 429]) {
      const response = await request(server).post("/support").send({ message: "hi" });
      expect(response.status).toBe(expected);
    }
  });
});
