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
  metrics: {
    waitlist: 42,
    subscribers: 17,
    insights: 8,
    tickets: 3,
  },
  recentPosts: [
    {
      id: 9,
      title: "Gold outlook",
      created_at: "2026-08-19T12:00:00.000Z",
    },
  ],
};

let server: Server;
let baseUrl: string;
let lookup: ReturnType<typeof vi.fn<AdminIdentityLookup>>;
let loadDashboard: ReturnType<typeof vi.fn<AdminDashboardLoader>>;

beforeEach(async () => {
  lookup = vi.fn(async (userId) => {
    if (userId === "schema-admin") {
      return { role: "admin", email: "admin@example.com" };
    }
    if (userId === "role-admin") {
      return { role: " god_admin ", email: "other@example.com" };
    }
    if (userId === "email-admin") {
      return { role: "user", email: "NEXTGENSYNTHEX@GMAIL.COM" };
    }
    return { role: "user", email: "trader@example.com" };
  });
  loadDashboard = vi.fn(async () => summary);

  const verifier = async (token: string) => {
    if (token === "schema-admin-token") return "schema-admin";
    if (token === "role-token") return "role-admin";
    if (token === "email-token") return "email-admin";
    if (token === "trader-token") return "trader";
    return null;
  };

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
  return {
    status: response.status,
    body: (await response.json()) as unknown,
  };
}

describe("mobile admin dashboard", () => {
  it("rejects anonymous callers before reading admin data", async () => {
    const response = await request();

    expect(response.status).toBe(401);
    expect(lookup).not.toHaveBeenCalled();
    expect(loadDashboard).not.toHaveBeenCalled();
  });

  it("rejects authenticated non-admin callers", async () => {
    const response = await request("trader-token");

    expect(response.status).toBe(403);
    expect(loadDashboard).not.toHaveBeenCalled();
  });

  it("returns the dashboard to a god_admin role", async () => {
    const response = await request("role-token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(summary);
  });

  it("returns the dashboard to the schema-supported admin role", async () => {
    const response = await request("schema-admin-token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(summary);
  });

  it("returns the dashboard to the verified master email", async () => {
    const response = await request("email-token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(summary);
  });

  it("fails closed when the protected dashboard cannot load", async () => {
    loadDashboard.mockRejectedValueOnce(new Error("Supabase unavailable"));

    const response = await request("role-token");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: "Admin dashboard is unavailable" });
  });
});