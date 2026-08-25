import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createBotsRouter } from "./bots";

const identity: RequestHandler = (_req, res, next) => {
  res.locals["userId"] = "trader-1";
  next();
};

const softOutage: RequestHandler = (_req, _res, next) => next();
const writeOutage: RequestHandler = (_req, res, next) => {
  res.setHeader("X-Security-Check", "degraded");
  next();
};

const botStorageFetch: typeof fetch = async (_url, init) => {
  const method = init?.method ?? "GET";
  const body =
    method === "POST"
      ? [{ id: "bot-1", pair: "BTC/USD", strategy: "GRID", capital: 1000, status: "active" }]
      : method === "PATCH"
        ? [{ id: "bot-1", status: "paused" }]
        : [];
  return new Response(JSON.stringify(body), { status: 200 });
};

describe("bot marketplace AAL outage policy", () => {
  function app() {
    const server = express();
    server.use(express.json());
    server.use(
      createBotsRouter({
        identityMiddleware: identity,
        readAssurance: softOutage,
        writeAssurance: writeOutage,
        fetchImpl: botStorageFetch,
        tierLookup: async () => "pro",
      }),
    );
    return server;
  }

  it("serves bot reads when the AAL service is unavailable", async () => {
    const response = await request(app()).get("/bots").set("authorization", "Bearer token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it("creates bots in degraded AAL mode instead of returning 503", async () => {
    const response = await request(app())
      .post("/bots")
      .set("authorization", "Bearer token")
      .send({ pair: "BTC/USD", strategy: "GRID", capital: 1000 });

    expect(response.status).toBe(201);
    expect(response.headers["x-security-check"]).toBe("degraded");
    expect(response.body.status).toBe("active");
  });

  it("updates bot status in degraded AAL mode instead of returning 503", async () => {
    const response = await request(app())
      .patch("/bots/bot-1/status")
      .set("authorization", "Bearer token")
      .send({ status: "paused" });

    expect(response.status).toBe(200);
    expect(response.headers["x-security-check"]).toBe("degraded");
    expect(response.body.status).toBe("paused");
  });
});

describe("bot marketplace Pro entitlement gate", () => {
  function appWithTier(tier: string | null) {
    const server = express();
    server.use(express.json());
    server.use(
      createBotsRouter({
        identityMiddleware: identity,
        readAssurance: softOutage,
        writeAssurance: writeOutage,
        fetchImpl: botStorageFetch,
        tierLookup: async () => tier,
      }),
    );
    return server;
  }

  it("rejects bot reads for free users", async () => {
    const response = await request(appWithTier("free")).get("/bots");
    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/Pro subscription/);
  });

  it("rejects bot deployment for free users", async () => {
    const response = await request(appWithTier("free"))
      .post("/bots")
      .send({ pair: "BTC/USD", strategy: "GRID", capital: 1000 });
    expect(response.status).toBe(403);
  });

  it("rejects status changes for free users", async () => {
    const response = await request(appWithTier("free"))
      .patch("/bots/bot-1/status")
      .send({ status: "paused" });
    expect(response.status).toBe(403);
  });

  it("fails closed when the tier cannot be resolved", async () => {
    const response = await request(appWithTier(null)).get("/bots");
    expect(response.status).toBe(403);
  });

  it("admins and elite tiers pass the gate", async () => {
    for (const tier of ["elite", "whale"]) {
      const response = await request(appWithTier(tier)).get("/bots");
      expect(response.status).toBe(200);
    }
  });

  it("accepts the NVDA template pair for entitled users", async () => {
    const response = await request(appWithTier("pro"))
      .post("/bots")
      .send({ pair: "NVDA", strategy: "GRID", capital: 7500 });
    expect(response.status).toBe(201);
  });

  it("still rejects unknown pairs", async () => {
    const response = await request(appWithTier("pro"))
      .post("/bots")
      .send({ pair: "DOGE/USD", strategy: "GRID", capital: 1000 });
    expect(response.status).toBe(400);
  });
});