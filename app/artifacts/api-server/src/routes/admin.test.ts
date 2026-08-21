import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  createAdminRouter,
  type AdminDashboardLoader,
  type AdminDashboardSummary,
  type AdminIdentityLookup,
} from "./admin";

const summary: AdminDashboardSummary = {
  metrics: { waitlist: 42, subscribers: 17, insights: 8, tickets: 3 },
  recentPosts: [{ id: 9, title: "Gold outlook", created_at: "2026-08-19T12:00:00.000Z" }],
};

let server: Server;
let baseUrl: string;
let lookup: ReturnType<typeof vi.fn<AdminIdentityLookup>>;
let loadDashboard: ReturnType<typeof vi.fn<AdminDashboardLoader>>;

beforeEach(async () => {
  lookup = vi.fn(async (userId) => {
    if (userId === "admin") return { role: "admin", email: "admin@example.com" };
    if (userId === "trader") return { role: "user", email: "trader@example.com" };
    return { role: "user", email: "nextgensynthex@gmail.com" };
  });
  loadDashboard = vi.fn(async () => summary);
  const verifier = async (token: string) =>
    token === "admin-token" ? "admin" : token === "trader-token" ? "trader" : null;
  const app: Express = express();
  app.use("/api", createAdminRouter(verifier, lookup, loadDashboard));
  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", () => resolve());
  });
  const { address, port } = server.address() as AddressInfo;
  baseUrl = `http://${address}:${port}`;
});

afterEach(async () => {
  vi.restoreAllMocks();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

async function request(token?: string) {
  const response = await fetch(`${baseUrl}/api/admin/dashboard`, {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
  return { status: response.status, body: (await response.json()) as unknown };
}

describe("admin dashboard authorization", () => {
  it("returns dashboard data to a verified canonical admin role", async () => {
    const response = await request("admin-token");
    expect(response.status).toBe(200);
    expect(response.body).toEqual(summary);
  });

  it("rejects authenticated standard users before loading dashboard data", async () => {
    const response = await request("trader-token");
    expect(response.status).toBe(403);
    expect(loadDashboard).not.toHaveBeenCalled();
  });
});