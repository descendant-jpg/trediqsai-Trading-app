import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { GetLeaderboardResponse } from "@workspace/api-zod";

let server: Server;
let baseUrl: string;

async function startFreshApp(): Promise<void> {
  // Follow the autopilot test pattern: fresh module import per test.
  vi.resetModules();
  const { default: leaderboardRouter } = await import("./leaderboard");
  const app: Express = express();
  app.use(express.json());
  app.use(leaderboardRouter);
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  const { address, port } = server.address() as AddressInfo;
  baseUrl = `http://${address}:${port}`;
}

async function request(
  method: string,
  path: string,
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${path}`, { method });
  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

beforeEach(async () => {
  await startFreshApp();
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

describe("GET /leaderboard", () => {
  it("returns a schema-valid list of traders", async () => {
    const { status, body } = await request("GET", "/leaderboard");
    expect(status).toBe(200);
    expect(() => GetLeaderboardResponse.parse(body)).not.toThrow();
    expect(body).toHaveLength(10);
  });

  it("returns traders in rank order with unique ids", async () => {
    const { body } = await request("GET", "/leaderboard");
    const ranks = body.map((t: any) => t.rank);
    expect(ranks).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const ids = body.map((t: any) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(body[0].name).toBe("Ava Chen");
  });

  it("is stable across repeated requests", async () => {
    const first = await request("GET", "/leaderboard");
    const second = await request("GET", "/leaderboard");
    expect(second.body).toEqual(first.body);
  });

  it("returns 404 for unknown paths and methods without handlers", async () => {
    expect((await request("GET", "/leaderboard/t1")).status).toBe(404);
    expect((await request("POST", "/leaderboard")).status).toBe(404);
  });
});
