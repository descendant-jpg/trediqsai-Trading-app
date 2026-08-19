import { Router, type IRouter, type Response } from "express";
import { z } from "zod";
import { identity, requestUserId, ANONYMOUS_USER } from "../middlewares/identity";

// ---------------------------------------------------------------------------
// Injectable boundaries (for unit tests)
// ---------------------------------------------------------------------------

/**
 * Looks up a profile row by user ID using the service-role key.
 * Returns the row or null when not found / unavailable.
 */
export type ProfileLookup = (
  userId: string,
) => Promise<{ role?: string; email?: string } | null>;

/**
 * All Supabase data access for the mobile-admin router.
 * Each field is a fetch boundary that can be replaced in tests.
 */
export type MobileAdminDeps = {
  profileLookup: ProfileLookup;
  fetchWaitlistCount: () => Promise<number>;
  fetchSubscriberCount: () => Promise<number>;
  fetchBlogPostCount: () => Promise<number>;
  fetchSupportTicketCount: () => Promise<number>;
  fetchRecentPosts: () => Promise<unknown[]>;
  fetchBlogPosts: () => Promise<unknown[]>;
  insertDraft: (data: QuickDraft) => Promise<unknown>;
  fetchWaitlist: () => Promise<unknown[]>;
  deleteWaitlistEntry: (id: string) => Promise<boolean>;
};

// ---------------------------------------------------------------------------
// Validation schema
// ---------------------------------------------------------------------------

export type QuickDraft = {
  title: string;
  summary: string;
  content: string;
};

export type BlogPostDraftInsert = {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  status: "draft";
  author: string;
};

const quickDraftSchema = z.object({
  title: z.string().trim().min(1).max(255),
  summary: z.string().trim().min(1).max(500),
  content: z.string().trim().min(1),
});

export function buildBlogPostDraft(
  data: QuickDraft,
  uniqueSuffix = Date.now().toString(36),
): BlogPostDraftInsert {
  const baseSlug =
    data.title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 80) || "market-insight";

  return {
    title: data.title,
    slug: `${baseSlug}-${uniqueSuffix}`,
    excerpt: data.summary,
    content: data.content,
    status: "draft",
    author: "TradiQs AI Quant Desk",
  };
}

// ---------------------------------------------------------------------------
// Default Supabase-backed implementations
// ---------------------------------------------------------------------------

const SUPABASE_URL =
  process.env["SUPABASE_URL"] ?? process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "";
const SERVICE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
const MASTER_EMAIL = "nextgensynthex@gmail.com";

function serviceHeaders() {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
  };
}

function isConfigured(): boolean {
  return !!SUPABASE_URL && !!SERVICE_KEY;
}

export function adminAuthEmail(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const response = payload as Record<string, unknown>;
  const nestedUser =
    response["user"] && typeof response["user"] === "object"
      ? (response["user"] as Record<string, unknown>)
      : null;
  const email = nestedUser?.["email"] ?? response["email"];
  return typeof email === "string" ? email : undefined;
}

const defaultProfileLookup: ProfileLookup = async (userId) => {
  if (!isConfigured()) return null;
  const [profileResponse, authResponse] = await Promise.all([
    fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=role`,
      { headers: serviceHeaders() },
    ),
    fetch(
      `${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
      { headers: serviceHeaders() },
    ),
  ]);
  if (!profileResponse.ok || !authResponse.ok) return null;

  const rows = (await profileResponse.json()) as Array<{ role?: string }>;
  const authPayload = (await authResponse.json()) as unknown;
  return { role: rows[0]?.role, email: adminAuthEmail(authPayload) };
};

const defaultFetchWaitlistCount: MobileAdminDeps["fetchWaitlistCount"] = async () => {
  if (!isConfigured()) throw new Error("Supabase not configured");
  const res = await fetch(`${SUPABASE_URL}/rest/v1/waitlist?select=id`, {
    headers: { ...serviceHeaders(), Prefer: "count=exact", Range: "0-0" },
  });
  if (!res.ok) throw new Error(`Supabase error ${res.status}`);
  const range = res.headers.get("Content-Range") ?? "";
  const total = range.split("/")[1];
  return total ? parseInt(total, 10) : 0;
};

const defaultFetchBlogPostCount: MobileAdminDeps["fetchBlogPostCount"] = async () => {
  if (!isConfigured()) throw new Error("Supabase not configured");
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/blog_posts?select=id&status=eq.published`,
    {
      headers: { ...serviceHeaders(), Prefer: "count=exact", Range: "0-0" },
    },
  );
  if (!res.ok) throw new Error(`Supabase error ${res.status}`);
  const range = res.headers.get("Content-Range") ?? "";
  const total = range.split("/")[1];
  return total ? parseInt(total, 10) : 0;
};

const defaultFetchSubscriberCount: MobileAdminDeps["fetchSubscriberCount"] =
  async () => {
    if (!isConfigured()) throw new Error("Supabase not configured");
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?select=id&tier=in.(pro,elite,whale,vip)`,
      {
        headers: { ...serviceHeaders(), Prefer: "count=exact", Range: "0-0" },
      },
    );
    if (!res.ok) throw new Error(`Supabase error ${res.status}`);
    const total = (res.headers.get("Content-Range") ?? "").split("/")[1];
    return total ? parseInt(total, 10) : 0;
  };

const defaultFetchSupportTicketCount: MobileAdminDeps["fetchSupportTicketCount"] =
  async () => {
    if (!isConfigured()) throw new Error("Supabase not configured");
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/contact_messages?select=id&status=eq.open`,
      {
        headers: { ...serviceHeaders(), Prefer: "count=exact", Range: "0-0" },
      },
    );
    if (!res.ok) throw new Error(`Supabase error ${res.status}`);
    const total = (res.headers.get("Content-Range") ?? "").split("/")[1];
    return total ? parseInt(total, 10) : 0;
  };

const defaultFetchRecentPosts: MobileAdminDeps["fetchRecentPosts"] = async () => {
  if (!isConfigured()) throw new Error("Supabase not configured");
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/blog_posts?select=id,title,created_at&order=created_at.desc&limit=3`,
    { headers: serviceHeaders() },
  );
  if (!res.ok) throw new Error(`Supabase error ${res.status}`);
  const rows = (await res.json()) as unknown[];
  return Array.isArray(rows) ? rows : [];
};

const defaultFetchBlogPosts: MobileAdminDeps["fetchBlogPosts"] = async () => {
  if (!isConfigured()) throw new Error("Supabase not configured");
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/blog_posts?select=*&order=created_at.desc`,
    { headers: serviceHeaders() },
  );
  if (!res.ok) throw new Error(`Supabase error ${res.status}`);
  const rows = (await res.json()) as unknown[];
  return Array.isArray(rows) ? rows : [];
};

const defaultInsertDraft: MobileAdminDeps["insertDraft"] = async (data) => {
  if (!isConfigured()) throw new Error("Supabase not configured");
  const res = await fetch(`${SUPABASE_URL}/rest/v1/blog_posts`, {
    method: "POST",
    headers: { ...serviceHeaders(), Prefer: "return=representation" },
    body: JSON.stringify(buildBlogPostDraft(data)),
  });
  if (!res.ok) throw new Error(`Supabase error ${res.status}`);
  const rows = (await res.json()) as unknown[];
  return rows[0];
};

const defaultFetchWaitlist: MobileAdminDeps["fetchWaitlist"] = async () => {
  if (!isConfigured()) throw new Error("Supabase not configured");
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/waitlist?select=*&order=created_at.desc`,
    { headers: serviceHeaders() },
  );
  if (!res.ok) throw new Error(`Supabase error ${res.status}`);
  const rows = (await res.json()) as unknown[];
  return Array.isArray(rows) ? rows : [];
};

const defaultDeleteWaitlistEntry: MobileAdminDeps["deleteWaitlistEntry"] = async (id) => {
  if (!isConfigured()) throw new Error("Supabase not configured");
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/waitlist?id=eq.${encodeURIComponent(id)}&select=id`,
    {
      method: "DELETE",
      headers: { ...serviceHeaders(), Prefer: "return=representation" },
    },
  );
  if (!res.ok) throw new Error(`Supabase error ${res.status}`);
  const deleted = (await res.json()) as unknown[];
  return Array.isArray(deleted) && deleted.length === 1;
};

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

/**
 * Creates the mobile-admin router.
 *
 * @param deps - Injectable Supabase boundaries (for unit tests).
 * @param verifier - Injectable token verifier (for unit tests).
 */
export function createMobileAdminRouter(
  deps: Partial<MobileAdminDeps> = {},
  verifier?: Parameters<typeof identity>[0],
): IRouter {
  const {
    profileLookup = defaultProfileLookup,
    fetchWaitlistCount = defaultFetchWaitlistCount,
    fetchSubscriberCount = defaultFetchSubscriberCount,
    fetchBlogPostCount = defaultFetchBlogPostCount,
    fetchSupportTicketCount = defaultFetchSupportTicketCount,
    fetchRecentPosts = defaultFetchRecentPosts,
    fetchBlogPosts = defaultFetchBlogPosts,
    insertDraft = defaultInsertDraft,
    fetchWaitlist = defaultFetchWaitlist,
    deleteWaitlistEntry = defaultDeleteWaitlistEntry,
  } = deps;

  const router: IRouter = Router();

  // app.ts mounts this router at /api, so paths here start at /mobile-admin.
  // Privileged requests bypass the normal five-minute identity cache so a
  // revoked administrator token is rejected on its very next request.
  router.use("/mobile-admin", identity(verifier, { cacheVerifiedTokens: false }));

  function hasMobileAdminAccess(profile: {
    role?: string;
    email?: string;
  }): boolean {
    const role = profile.role?.trim().toLowerCase() ?? "";
    const email = profile.email?.trim().toLowerCase() ?? "";
    return role === "god_admin" || email === MASTER_EMAIL;
  }

  // ---------------------------------------------------------------------------
  // Authorization helper — reused across every endpoint.
  // Returns the userId when the caller is a god_admin, or sends an error
  // response and returns null.
  // ---------------------------------------------------------------------------
  async function requireGodAdmin(res: Response): Promise<string | null> {
    const userId = requestUserId(res);

    if (userId === ANONYMOUS_USER) {
      res.status(401).json({ error: "Authentication required." });
      return null;
    }

    let profile: { role?: string; email?: string } | null;
    try {
      profile = await profileLookup(userId);
    } catch {
      res.status(503).json({ error: "Authorization service unavailable." });
      return null;
    }

    if (!profile) {
      res.status(503).json({ error: "Authorization service unavailable." });
      return null;
    }

    if (!hasMobileAdminAccess(profile)) {
      res.status(403).json({ error: "Administrator access required." });
      return null;
    }

    return userId;
  }

  // ---------------------------------------------------------------------------
  // GET /api/mobile-admin/access
  // Returns the caller's god_admin authorization status.
  // ---------------------------------------------------------------------------
  router.get("/mobile-admin/access", async (_req, res) => {
    const userId = requestUserId(res);

    if (userId === ANONYMOUS_USER) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }

    let profile: { role?: string; email?: string } | null;
    try {
      profile = await profileLookup(userId);
    } catch {
      res.status(503).json({ error: "Authorization service unavailable." });
      return;
    }

    if (!profile) {
      res.status(503).json({ error: "Authorization service unavailable." });
      return;
    }

    const isGodAdmin = hasMobileAdminAccess(profile);
    res.json({ isGodAdmin, role: profile.role ?? null });
  });

  // ---------------------------------------------------------------------------
  // GET /api/mobile-admin/dashboard
  // Returns waitlist and blog_posts counts.
  // ---------------------------------------------------------------------------
  router.get("/mobile-admin/dashboard", async (_req, res) => {
    if (!(await requireGodAdmin(res))) return;

    try {
      const [
        waitlistCount,
        subscriberCount,
        blogPostCount,
        supportTicketCount,
        recentPosts,
      ] = await Promise.all([
        fetchWaitlistCount(),
        fetchSubscriberCount(),
        fetchBlogPostCount(),
        fetchSupportTicketCount(),
        fetchRecentPosts(),
      ]);
      res.json({
        waitlistCount,
        subscriberCount,
        blogPostCount,
        supportTicketCount,
        recentPosts,
      });
    } catch {
      res.status(503).json({ error: "Dashboard data unavailable." });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /api/mobile-admin/insights
  // Returns current blog posts.
  // ---------------------------------------------------------------------------
  router.get("/mobile-admin/insights", async (_req, res) => {
    if (!(await requireGodAdmin(res))) return;

    try {
      const posts = await fetchBlogPosts();
      res.json({ posts });
    } catch {
      res.status(503).json({ error: "Insights unavailable." });
    }
  });

  // ---------------------------------------------------------------------------
  // POST /api/mobile-admin/insights
  // Validates and inserts a quick-draft blog post.
  // ---------------------------------------------------------------------------
  router.post("/mobile-admin/insights", async (req, res) => {
    if (!(await requireGodAdmin(res))) return;

    const parsed = quickDraftSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid draft: title, summary, and content are required." });
      return;
    }

    try {
      const draft = await insertDraft(parsed.data);
      res.status(201).json({ draft });
    } catch {
      res.status(503).json({ error: "Could not save draft." });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /api/mobile-admin/waitlist
  // Returns waitlist leads.
  // ---------------------------------------------------------------------------
  router.get("/mobile-admin/waitlist", async (_req, res) => {
    if (!(await requireGodAdmin(res))) return;

    try {
      const leads = await fetchWaitlist();
      res.json({ leads });
    } catch {
      res.status(503).json({ error: "Waitlist unavailable." });
    }
  });

  // ---------------------------------------------------------------------------
  // DELETE /api/mobile-admin/waitlist/:id
  // Deletes one waitlist lead.
  // ---------------------------------------------------------------------------
  router.delete("/mobile-admin/waitlist/:id", async (req, res) => {
    if (!(await requireGodAdmin(res))) return;

    const { id } = req.params as { id: string };
    if (!/^\d+$/.test(id)) {
      res.status(400).json({ error: "A numeric waitlist entry ID is required." });
      return;
    }

    try {
      const deleted = await deleteWaitlistEntry(id);
      if (!deleted) {
        res.status(404).json({ error: "Waitlist entry not found." });
        return;
      }
      res.status(204).end();
    } catch {
      res.status(503).json({ error: "Could not delete waitlist entry." });
    }
  });

  return router;
}

export default createMobileAdminRouter();
