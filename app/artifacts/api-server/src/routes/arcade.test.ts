import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { TokenVerifier } from "../middlewares/identity";
import { createArcadeRouter } from "./arcade";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let server: Server;
let baseUrl: string;

/** Verifier stub: maps token strings to user IDs for hermetic tests. */
const userMap: Record<string, string> = {
  "token-alice": "user-alice",
  "token-bob": "user-bob",
  "token-carol": "user-carol",
};

const stubVerifier: TokenVerifier = async (token) => userMap[token] ?? null;

function buildApp(): Express {
  const app: Express = express();
  app.use(express.json());
  // Fresh router per test via vi.resetModules() — but since arcade.ts has no
  // DB dependency we can instantiate directly with the stub verifier.
  app.use(createArcadeRouter(stubVerifier));
  return app;
}

async function startServer(): Promise<void> {
  const app = buildApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  const { address, port } = server.address() as AddressInfo;
  baseUrl = `http://${address}:${port}`;
}

async function stopServer(): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
}

async function request(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; body: any }> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token) headers["authorization"] = `Bearer ${token}`;

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(startServer);
afterEach(stopServer);

describe("GET /arcade/leaderboard", () => {
  it("returns an empty leaderboard when no scores have been posted", async () => {
    const { status, body } = await request("GET", "/arcade/leaderboard");
    expect(status).toBe(200);
    expect(body.leaderboard).toEqual([]);
  });

  it("returns posted scores in descending XP order", async () => {
    await request("POST", "/arcade/score", { xp: 300, username: "Bob" }, "token-bob");
    await request("POST", "/arcade/score", { xp: 700, username: "Alice" }, "token-alice");
    await request("POST", "/arcade/score", { xp: 500, username: "Carol" }, "token-carol");

    const { status, body } = await request("GET", "/arcade/leaderboard");
    expect(status).toBe(200);
    expect(body.leaderboard).toHaveLength(3);
    expect(body.leaderboard[0]).toMatchObject({ rank: 1, username: "Alice", xp: 700 });
    expect(body.leaderboard[1]).toMatchObject({ rank: 2, username: "Carol", xp: 500 });
    expect(body.leaderboard[2]).toMatchObject({ rank: 3, username: "Bob", xp: 300 });
  });

  it("truncates the leaderboard to 10 entries", async () => {
    const tokens = Array.from({ length: 12 }, (_, i) => `token-u${i}`);
    const localMap: Record<string, string> = {};
    tokens.forEach((t, i) => { localMap[t] = `user-u${i}`; });

    // Build a fresh router with an extended verifier so all 12 users resolve.
    const extendedVerifier: TokenVerifier = async (token) =>
      localMap[token] ?? userMap[token] ?? null;
    const app = express();
    app.use(express.json());
    app.use(createArcadeRouter(extendedVerifier));
    const srv = await new Promise<Server>((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const { address, port } = srv.address() as AddressInfo;
    const base = `http://${address}:${port}`;

    for (let i = 0; i < 12; i++) {
      await fetch(`${base}/arcade/score`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer token-u${i}` },
        body: JSON.stringify({ xp: (i + 1) * 100, username: `User${i}` }),
      });
    }
    const res = await fetch(`${base}/arcade/leaderboard`);
    const body = await res.json() as { leaderboard: any[] };
    expect(body.leaderboard).toHaveLength(10);
    expect(body.leaderboard[0].xp).toBe(1200); // highest score first
    await new Promise<void>((resolve, reject) =>
      srv.close((err) => (err ? reject(err) : resolve())),
    );
  });
});

describe("POST /arcade/score", () => {
  it("returns 400 for missing body fields", async () => {
    const { status } = await request("POST", "/arcade/score", {}, "token-alice");
    expect(status).toBe(400);
  });

  it("returns 400 when xp is negative", async () => {
    const { status } = await request(
      "POST", "/arcade/score", { xp: -10, username: "Alice" }, "token-alice",
    );
    expect(status).toBe(400);
  });

  it("returns 400 when xp is not an integer", async () => {
    const { status } = await request(
      "POST", "/arcade/score", { xp: 12.5, username: "Alice" }, "token-alice",
    );
    expect(status).toBe(400);
  });

  it("returns 400 when username is empty or too long", async () => {
    const { status: s1 } = await request(
      "POST", "/arcade/score", { xp: 100, username: "" }, "token-alice",
    );
    expect(s1).toBe(400);

    const { status: s2 } = await request(
      "POST", "/arcade/score", { xp: 100, username: "x".repeat(33) }, "token-alice",
    );
    expect(s2).toBe(400);
  });

  it("returns the player's rank and leaderboard on success", async () => {
    const { status, body } = await request(
      "POST", "/arcade/score", { xp: 500, username: "Alice" }, "token-alice",
    );
    expect(status).toBe(200);
    expect(body.rank).toBe(1);
    expect(body.leaderboard).toHaveLength(1);
    expect(body.leaderboard[0]).toMatchObject({ rank: 1, username: "Alice", xp: 500 });
  });

  it("updates the display username on a subsequent post from the same user", async () => {
    await request("POST", "/arcade/score", { xp: 200, username: "alice_v1" }, "token-alice");
    await request("POST", "/arcade/score", { xp: 400, username: "alice_v2" }, "token-alice");

    const { body } = await request("GET", "/arcade/leaderboard");
    expect(body.leaderboard[0].username).toBe("alice_v2");
    expect(body.leaderboard[0].xp).toBe(400);
  });

  it("only advances XP — a lower submission is ignored (monotonic protection)", async () => {
    await request("POST", "/arcade/score", { xp: 600, username: "Alice" }, "token-alice");
    await request("POST", "/arcade/score", { xp: 100, username: "Alice" }, "token-alice");

    const { body } = await request("GET", "/arcade/leaderboard");
    expect(body.leaderboard[0].xp).toBe(600);
  });

  it("returns 401 when the bearer token is invalid", async () => {
    const { status } = await request(
      "POST", "/arcade/score", { xp: 100, username: "Alice" }, "bad-token",
    );
    expect(status).toBe(401);
  });

  it("scopes scores by user identity, not display name", async () => {
    // Both users claim the same display name; they must not collide.
    await request("POST", "/arcade/score", { xp: 700, username: "Trader" }, "token-alice");
    await request("POST", "/arcade/score", { xp: 400, username: "Trader" }, "token-bob");

    const { body } = await request("GET", "/arcade/leaderboard");
    expect(body.leaderboard).toHaveLength(2);
    expect(body.leaderboard[0].xp).toBe(700);
    expect(body.leaderboard[1].xp).toBe(400);
  });

  it("computes ranks correctly across multiple players", async () => {
    await request("POST", "/arcade/score", { xp: 300, username: "Bob" }, "token-bob");
    await request("POST", "/arcade/score", { xp: 700, username: "Alice" }, "token-alice");

    // Carol posts and should be rank 2 between Alice and Bob.
    const { body } = await request(
      "POST", "/arcade/score", { xp: 500, username: "Carol" }, "token-carol",
    );
    expect(body.rank).toBe(2);
  });
});
