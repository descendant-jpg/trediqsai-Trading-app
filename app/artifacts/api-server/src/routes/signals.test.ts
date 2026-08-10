import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { GetSignalsResponse } from "@workspace/api-zod";

let server: Server;
let baseUrl: string;

async function startFreshApp(): Promise<void> {
  // Follow the autopilot test pattern: fresh module import per test.
  vi.resetModules();
  const { default: signalsRouter } = await import("./signals");
  const app: Express = express();
  app.use(express.json());
  app.use(signalsRouter);
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

describe("GET /signals", () => {
  it("returns a schema-valid list of signals", async () => {
    const { status, body } = await request("GET", "/signals");
    expect(status).toBe(200);
    expect(() => GetSignalsResponse.parse(body)).not.toThrow();
    expect(body.length).toBeGreaterThan(0);
  });

  it("includes the expected seeded signals with unique ids", async () => {
    const { body } = await request("GET", "/signals");
    const ids = body.map((s: any) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("s1");
    const gold = body.find((s: any) => s.id === "s1");
    expect(gold.asset).toBe("XAUUSD");
    expect(gold.direction).toBe("BUY");
    expect(gold.takeProfits).toHaveLength(3);
  });

  it("is stable across repeated requests", async () => {
    const first = await request("GET", "/signals");
    const second = await request("GET", "/signals");
    expect(second.body).toEqual(first.body);
  });

  it("returns 404 for unknown paths and methods without handlers", async () => {
    expect((await request("GET", "/signals/s1")).status).toBe(404);
    expect((await request("POST", "/signals")).status).toBe(404);
  });
});
