import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express, { type Express } from "express";
import request from "supertest";
import type { Server } from "node:http";
import type { TokenVerifier } from "../middlewares/identity";
import {
  buildBlogPostDraft,
  createMobileAdminRouter,
  type MobileAdminDeps,
} from "./mobileAdmin";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const GOD_ADMIN_TOKEN = "token-god-admin";
const PLAIN_USER_TOKEN = "token-plain-user";
const INVALID_TOKEN = "token-invalid";

/** Token → userId map for hermetic tests. */
const stubVerifier: TokenVerifier = async (token) => {
  if (token === GOD_ADMIN_TOKEN) return "user-god-admin";
  if (token === PLAIN_USER_TOKEN) return "user-plain";
  return null;
};

/**
 * Profile lookup stub: returns the row for known users, null for unknowns.
 */
const godAdminProfile = { role: "god_admin" };
const plainUserProfile = { role: "user" };

function makeProfileLookup(
  overrides: Record<string, { role?: string } | null> = {},
): MobileAdminDeps["profileLookup"] {
  return async (userId) => {
    if (userId in overrides) return overrides[userId];
    if (userId === "user-god-admin") return godAdminProfile;
    if (userId === "user-plain") return plainUserProfile;
    return null;
  };
}

const samplePosts = [
  { id: "post-1", title: "Hello", summary: "Sum", content: "Body", status: "published" },
];

const sampleLeads = [
  { id: "1", email: "a@b.com", created_at: "2024-01-01" },
];

describe("buildBlogPostDraft", () => {
  it("maps the quick summary to the real blog_posts schema and creates a unique slug", () => {
    expect(buildBlogPostDraft(
      { title: "Gold & USD: London Breakout", summary: "Desk note", content: "Full thesis" },
      "fixed",
    )).toEqual({
      title: "Gold & USD: London Breakout",
      slug: "gold-usd-london-breakout-fixed",
      excerpt: "Desk note",
      content: "Full thesis",
      status: "draft",
      author: "TradiQs AI Quant Desk",
    });
  });
});

function makeDeps(overrides: Partial<MobileAdminDeps> = {}): MobileAdminDeps {
  return {
    profileLookup: makeProfileLookup(),
    fetchWaitlistCount: vi.fn().mockResolvedValue(3),
    fetchBlogPostCount: vi.fn().mockResolvedValue(7),
    fetchBlogPosts: vi.fn().mockResolvedValue(samplePosts),
    insertDraft: vi.fn().mockResolvedValue({ id: "draft-1", status: "draft" }),
    fetchWaitlist: vi.fn().mockResolvedValue(sampleLeads),
    deleteWaitlistEntry: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
}

function buildApp(deps: Partial<MobileAdminDeps> = {}): Express {
  const app = express();
  app.use(express.json());
  app.use("/api", createMobileAdminRouter(makeDeps(deps), stubVerifier));
  return app;
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function authed(token: string) {
  return `Bearer ${token}`;
}

// ---------------------------------------------------------------------------
// Anonymous rejection (all endpoints)
// ---------------------------------------------------------------------------

describe("anonymous rejection", () => {
  const endpoints = [
    { method: "get" as const, path: "/api/mobile-admin/access" },
    { method: "get" as const, path: "/api/mobile-admin/dashboard" },
    { method: "get" as const, path: "/api/mobile-admin/insights" },
    { method: "post" as const, path: "/api/mobile-admin/insights" },
    { method: "get" as const, path: "/api/mobile-admin/waitlist" },
    { method: "delete" as const, path: "/api/mobile-admin/waitlist/1" },
  ];

  for (const { method, path } of endpoints) {
    it(`${method.toUpperCase()} ${path} returns 401 without a token`, async () => {
      const app = buildApp();
      const res = await (request(app) as any)[method](path).send({});
      expect(res.status).toBe(401);
    });

    it(`${method.toUpperCase()} ${path} returns 401 with an invalid token`, async () => {
      const app = buildApp();
      const res = await (request(app) as any)
        [method](path)
        .set("Authorization", authed(INVALID_TOKEN))
        .send({});
      expect(res.status).toBe(401);
    });
  }
});

// ---------------------------------------------------------------------------
// Non-god-admin rejection
// ---------------------------------------------------------------------------

describe("non-god-admin rejection", () => {
  const protectedEndpoints = [
    { method: "get" as const, path: "/api/mobile-admin/dashboard" },
    { method: "get" as const, path: "/api/mobile-admin/insights" },
    { method: "post" as const, path: "/api/mobile-admin/insights" },
    { method: "get" as const, path: "/api/mobile-admin/waitlist" },
    { method: "delete" as const, path: "/api/mobile-admin/waitlist/1" },
  ];

  for (const { method, path } of protectedEndpoints) {
    it(`${method.toUpperCase()} ${path} returns 403 for a non-god_admin user`, async () => {
      const app = buildApp();
      const res = await (request(app) as any)
        [method](path)
        .set("Authorization", authed(PLAIN_USER_TOKEN))
        .send({});
      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(/god_admin/i);
    });
  }
});

// ---------------------------------------------------------------------------
// GET /api/mobile-admin/access
// ---------------------------------------------------------------------------

describe("GET /api/mobile-admin/access", () => {
  it("returns isGodAdmin=true for a god_admin caller", async () => {
    const app = buildApp();
    const res = await request(app)
      .get("/api/mobile-admin/access")
      .set("Authorization", authed(GOD_ADMIN_TOKEN));
    expect(res.status).toBe(200);
    expect(res.body.isGodAdmin).toBe(true);
    expect(res.body.role).toBe("god_admin");
  });

  it("returns isGodAdmin=false for a regular authenticated user", async () => {
    const app = buildApp();
    const res = await request(app)
      .get("/api/mobile-admin/access")
      .set("Authorization", authed(PLAIN_USER_TOKEN));
    expect(res.status).toBe(200);
    expect(res.body.isGodAdmin).toBe(false);
    expect(res.body.role).toBe("user");
  });

  it("returns 503 when profileLookup throws", async () => {
    const app = buildApp({
      profileLookup: vi.fn().mockRejectedValue(new Error("db down")),
    });
    const res = await request(app)
      .get("/api/mobile-admin/access")
      .set("Authorization", authed(GOD_ADMIN_TOKEN));
    expect(res.status).toBe(503);
  });

  it("returns 503 when profileLookup returns null", async () => {
    const app = buildApp({
      profileLookup: vi.fn().mockResolvedValue(null),
    });
    const res = await request(app)
      .get("/api/mobile-admin/access")
      .set("Authorization", authed(GOD_ADMIN_TOKEN));
    expect(res.status).toBe(503);
  });
});

// ---------------------------------------------------------------------------
// GET /api/mobile-admin/dashboard
// ---------------------------------------------------------------------------

describe("GET /api/mobile-admin/dashboard", () => {
  it("returns waitlist and blog post counts for god_admin", async () => {
    const app = buildApp();
    const res = await request(app)
      .get("/api/mobile-admin/dashboard")
      .set("Authorization", authed(GOD_ADMIN_TOKEN));
    expect(res.status).toBe(200);
    expect(res.body.waitlistCount).toBe(3);
    expect(res.body.blogPostCount).toBe(7);
  });

  it("returns 503 when a count fetch fails", async () => {
    const app = buildApp({
      fetchWaitlistCount: vi.fn().mockRejectedValue(new Error("db error")),
    });
    const res = await request(app)
      .get("/api/mobile-admin/dashboard")
      .set("Authorization", authed(GOD_ADMIN_TOKEN));
    expect(res.status).toBe(503);
  });
});

// ---------------------------------------------------------------------------
// GET /api/mobile-admin/insights
// ---------------------------------------------------------------------------

describe("GET /api/mobile-admin/insights", () => {
  it("returns blog posts for god_admin", async () => {
    const app = buildApp();
    const res = await request(app)
      .get("/api/mobile-admin/insights")
      .set("Authorization", authed(GOD_ADMIN_TOKEN));
    expect(res.status).toBe(200);
    expect(res.body.posts).toEqual(samplePosts);
  });

  it("returns 503 when fetchBlogPosts throws", async () => {
    const app = buildApp({
      fetchBlogPosts: vi.fn().mockRejectedValue(new Error("db error")),
    });
    const res = await request(app)
      .get("/api/mobile-admin/insights")
      .set("Authorization", authed(GOD_ADMIN_TOKEN));
    expect(res.status).toBe(503);
  });
});

// ---------------------------------------------------------------------------
// POST /api/mobile-admin/insights
// ---------------------------------------------------------------------------

describe("POST /api/mobile-admin/insights", () => {
  const validDraft = {
    title: "My Draft Title",
    summary: "A brief summary",
    content: "Full body content here",
  };

  it("inserts a draft and returns 201 for god_admin with valid payload", async () => {
    const insertDraft = vi.fn().mockResolvedValue({ id: "draft-1", ...validDraft, status: "draft" });
    const app = buildApp({ insertDraft });
    const res = await request(app)
      .post("/api/mobile-admin/insights")
      .set("Authorization", authed(GOD_ADMIN_TOKEN))
      .send(validDraft);
    expect(res.status).toBe(201);
    expect(res.body.draft.id).toBe("draft-1");
    expect(insertDraft).toHaveBeenCalledWith(expect.objectContaining({
      title: validDraft.title,
      summary: validDraft.summary,
      content: validDraft.content,
    }));
  });

  it("returns 400 when title is missing", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/mobile-admin/insights")
      .set("Authorization", authed(GOD_ADMIN_TOKEN))
      .send({ summary: "sum", content: "body" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when summary is missing", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/mobile-admin/insights")
      .set("Authorization", authed(GOD_ADMIN_TOKEN))
      .send({ title: "t", content: "body" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when content is missing", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/mobile-admin/insights")
      .set("Authorization", authed(GOD_ADMIN_TOKEN))
      .send({ title: "t", summary: "s" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when title is empty after trimming", async () => {
    const app = buildApp();
    const res = await request(app)
      .post("/api/mobile-admin/insights")
      .set("Authorization", authed(GOD_ADMIN_TOKEN))
      .send({ title: "  ", summary: "s", content: "c" });
    expect(res.status).toBe(400);
  });

  it("returns 503 when insertDraft throws", async () => {
    const app = buildApp({
      insertDraft: vi.fn().mockRejectedValue(new Error("db error")),
    });
    const res = await request(app)
      .post("/api/mobile-admin/insights")
      .set("Authorization", authed(GOD_ADMIN_TOKEN))
      .send(validDraft);
    expect(res.status).toBe(503);
  });
});

// ---------------------------------------------------------------------------
// GET /api/mobile-admin/waitlist
// ---------------------------------------------------------------------------

describe("GET /api/mobile-admin/waitlist", () => {
  it("returns waitlist leads for god_admin", async () => {
    const app = buildApp();
    const res = await request(app)
      .get("/api/mobile-admin/waitlist")
      .set("Authorization", authed(GOD_ADMIN_TOKEN));
    expect(res.status).toBe(200);
    expect(res.body.leads).toEqual(sampleLeads);
  });

  it("returns 503 when fetchWaitlist throws", async () => {
    const app = buildApp({
      fetchWaitlist: vi.fn().mockRejectedValue(new Error("db error")),
    });
    const res = await request(app)
      .get("/api/mobile-admin/waitlist")
      .set("Authorization", authed(GOD_ADMIN_TOKEN));
    expect(res.status).toBe(503);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/mobile-admin/waitlist/:id
// ---------------------------------------------------------------------------

describe("DELETE /api/mobile-admin/waitlist/:id", () => {
  it("deletes a lead and returns 204 for god_admin", async () => {
    const deleteWaitlistEntry = vi.fn().mockResolvedValue(true);
    const app = buildApp({ deleteWaitlistEntry });
    const res = await request(app)
      .delete("/api/mobile-admin/waitlist/1")
      .set("Authorization", authed(GOD_ADMIN_TOKEN));
    expect(res.status).toBe(204);
    expect(deleteWaitlistEntry).toHaveBeenCalledWith("1");
  });

  it("returns 404 when no waitlist row was deleted", async () => {
    const app = buildApp({
      deleteWaitlistEntry: vi.fn().mockResolvedValue(false),
    });
    const res = await request(app)
      .delete("/api/mobile-admin/waitlist/1")
      .set("Authorization", authed(GOD_ADMIN_TOKEN));
    expect(res.status).toBe(404);
  });

  it("returns 503 when deleteWaitlistEntry throws", async () => {
    const app = buildApp({
      deleteWaitlistEntry: vi.fn().mockRejectedValue(new Error("db error")),
    });
    const res = await request(app)
      .delete("/api/mobile-admin/waitlist/1")
      .set("Authorization", authed(GOD_ADMIN_TOKEN));
    expect(res.status).toBe(503);
  });

  it("rejects a non-numeric waitlist ID before reaching Supabase", async () => {
    const deleteWaitlistEntry = vi.fn().mockResolvedValue(true);
    const app = buildApp({ deleteWaitlistEntry });
    const res = await request(app)
      .delete("/api/mobile-admin/waitlist/not-an-id")
      .set("Authorization", authed(GOD_ADMIN_TOKEN));
    expect(res.status).toBe(400);
    expect(deleteWaitlistEntry).not.toHaveBeenCalled();
  });
});
