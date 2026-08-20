import { Router, type IRouter } from "express";
import { createClient } from "@supabase/supabase-js";
import {
  ANONYMOUS_USER,
  identity,
  requestUserId,
  type TokenVerifier,
} from "../middlewares/identity";
import { logger } from "../lib/logger";

const MASTER_EMAIL = "nextgensynthex@gmail.com";
const SUPABASE_URL =
  process.env["SUPABASE_URL"] ??
  process.env["EXPO_PUBLIC_SUPABASE_URL"] ??
  process.env["NEXT_PUBLIC_SUPABASE_URL"] ??
  "";
const SUPABASE_SERVICE_ROLE_KEY =
  process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";

export type AdminDashboardSummary = {
  metrics: {
    waitlist: number;
    subscribers: number;
    insights: number;
    tickets: number;
  };
  recentPosts: Array<{
    id: number;
    title: string;
    created_at: string;
  }>;
};

type AdminIdentity = {
  email: string | null;
  role: string | null;
};

export type AdminIdentityLookup = (userId: string) => Promise<AdminIdentity>;
export type AdminDashboardLoader = () => Promise<AdminDashboardSummary>;

type PostStatus = "draft" | "published" | "archived";
const POST_STATUSES: PostStatus[] = ["draft", "published", "archived"];
const POST_FIELDS =
  "id, title, slug, excerpt, content, asset_class, category, ai_badge, upvotes, status, author, cover_image, read_time, tags, published_at, created_at, updated_at";

function adminClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Supabase service role credentials are not configured on the server.",
    );
  }

  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

const lookupAdminIdentity: AdminIdentityLookup = async (userId) => {
  const supabase = adminClient();
  const [profileResult, authResult] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", userId).maybeSingle(),
    supabase.auth.admin.getUserById(userId),
  ]);

  if (profileResult.error) throw profileResult.error;
  if (authResult.error) throw authResult.error;

  return {
    role:
      typeof profileResult.data?.role === "string"
        ? profileResult.data.role
        : null,
    email: authResult.data.user?.email ?? null,
  };
};

export function isAuthorizedAdmin(identity: AdminIdentity): boolean {
  return (
    identity.role?.trim().toLowerCase() === "god_admin" ||
    identity.email?.trim().toLowerCase() === MASTER_EMAIL
  );
}

export async function isAuthorizedAdminUser(userId: string): Promise<boolean> {
  return isAuthorizedAdmin(await lookupAdminIdentity(userId));
}

function pageValue(value: unknown, fallback: number, max: number) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(1, parsed)) : fallback;
}

function postSlug(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 100);
}

function readTime(content: string) {
  return `${Math.max(1, Math.ceil((content.trim().match(/\S+/g)?.length ?? 0) / 200))} min read`;
}

const loadAdminDashboard: AdminDashboardLoader = async () => {
  const supabase = adminClient();
  const [waitlist, subscribers, insights, tickets, posts] = await Promise.all([
    supabase.from("waitlist").select("id", { count: "exact", head: true }),
    supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .in("tier", ["pro", "elite", "whale", "vip"]),
    supabase
      .from("blog_posts")
      .select("id", { count: "exact", head: true })
      .eq("status", "published"),
    supabase
      .from("contact_messages")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
    supabase
      .from("blog_posts")
      .select("id, title, created_at")
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  const firstError =
    waitlist.error ??
    subscribers.error ??
    insights.error ??
    tickets.error ??
    posts.error;
  if (firstError) throw firstError;

  return {
    metrics: {
      waitlist: waitlist.count ?? 0,
      subscribers: subscribers.count ?? 0,
      insights: insights.count ?? 0,
      tickets: tickets.count ?? 0,
    },
    recentPosts: (posts.data ?? []) as AdminDashboardSummary["recentPosts"],
  };
};

export function createAdminRouter(
  verifier?: TokenVerifier,
  lookup: AdminIdentityLookup = lookupAdminIdentity,
  loadDashboard: AdminDashboardLoader = loadAdminDashboard,
): IRouter {
  const router: IRouter = Router();

  router.use("/admin", identity(verifier));
  router.use("/admin", async (_req, res, next) => {
    const userId = requestUserId(res);
    if (userId === ANONYMOUS_USER) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    try {
      const admin = await lookup(userId);
      if (!isAuthorizedAdmin(admin)) {
        res.status(403).json({ error: "Administrator access required" });
        return;
      }
      next();
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : String(error), userId },
        "Mobile admin authorization failed",
      );
      res.status(503).json({ error: "Admin access is unavailable" });
    }
  });

  router.get("/admin/dashboard", async (_req, res) => {
    try {
      res.json(await loadDashboard());
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          userId: requestUserId(res),
        },
        "Mobile admin dashboard failed",
      );
      res.status(503).json({ error: "Admin dashboard is unavailable" });
    }
  });

  router.get("/admin/posts", async (req, res) => {
    try {
      const page = pageValue(req.query.page, 1, 10_000);
      const limit = pageValue(req.query.limit, 20, 100);
      const { data, error, count } = await adminClient()
        .from("blog_posts")
        .select(POST_FIELDS, { count: "exact" })
        .order("created_at", { ascending: false })
        .range((page - 1) * limit, page * limit - 1);
      if (error) throw error;
      res.json({ posts: data ?? [], total: count ?? 0, page, limit });
    } catch (error) {
      logger.error({ error }, "Mobile admin posts list failed");
      res.status(503).json({ error: "Posts are unavailable" });
    }
  });

  router.get("/admin/posts/:id", async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!id) {
      res.status(422).json({ error: "Valid post id required" });
      return;
    }
    try {
      const { data, error } = await adminClient().from("blog_posts").select(POST_FIELDS).eq("id", id).maybeSingle();
      if (error) throw error;
      if (!data) {
        res.status(404).json({ error: "Post not found" });
        return;
      }
      res.json({ post: data });
    } catch (error) {
      logger.error({ error, id }, "Mobile admin post read failed");
      res.status(503).json({ error: "Post is unavailable" });
    }
  });

  router.post("/admin/posts", async (req, res) => {
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
    if (!title || !content) {
      res.status(422).json({ error: "Title and content are required" });
      return;
    }
    const status: PostStatus = POST_STATUSES.includes(req.body?.status) ? req.body.status : "draft";
    const now = new Date().toISOString();
    const record = {
      title,
      slug: postSlug(title),
      excerpt: content.slice(0, 180),
      content,
      asset_class: "Forex",
      category: typeof req.body?.category === "string" ? req.body.category.trim().slice(0, 50) || "Analysis" : "Analysis",
      ai_badge: "",
      upvotes: 0,
      status,
      author: "TradiQs AI Quant Desk",
      cover_image: null,
      read_time: readTime(content),
      tags: [],
      published_at: status === "published" ? now : null,
      updated_at: now,
    };
    try {
      const { data, error } = await adminClient().from("blog_posts").insert(record).select(POST_FIELDS).single();
      if (error) {
        const code = error.code === "23505" ? 409 : 400;
        res.status(code).json({ error: error.message });
        return;
      }
      res.status(201).json({ post: data });
    } catch (error) {
      logger.error({ error }, "Mobile admin post create failed");
      res.status(503).json({ error: "Could not create post" });
    }
  });

  router.put("/admin/posts/:id", async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
    if (!id || !title || !content) {
      res.status(422).json({ error: "Post id, title, and content are required" });
      return;
    }
    const requestedStatus: PostStatus | undefined = POST_STATUSES.includes(req.body?.status) ? req.body.status : undefined;
    const update: Record<string, unknown> = {
      title, content, slug: postSlug(title), excerpt: content.slice(0, 180),
      category: typeof req.body?.category === "string" ? req.body.category.trim().slice(0, 50) || "Analysis" : "Analysis",
      read_time: readTime(content), updated_at: new Date().toISOString(),
    };
    if (requestedStatus) {
      update.status = requestedStatus;
      update.published_at = requestedStatus === "published" ? new Date().toISOString() : null;
    }
    try {
      const { data, error } = await adminClient().from("blog_posts").update(update).eq("id", id).select(POST_FIELDS).maybeSingle();
      if (error) throw error;
      if (!data) {
        res.status(404).json({ error: "Post not found" });
        return;
      }
      res.json({ post: data });
    } catch (error) {
      logger.error({ error, id }, "Mobile admin post update failed");
      res.status(503).json({ error: "Could not update post" });
    }
  });

  router.get("/admin/waitlist", async (req, res) => {
    try {
      const page = pageValue(req.query.page, 1, 10_000);
      const limit = pageValue(req.query.limit, 50, 200);
      const { data, error, count } = await adminClient().from("waitlist").select("id, name, email, created_at", { count: "exact" }).order("created_at", { ascending: false }).range((page - 1) * limit, page * limit - 1);
      if (error) throw error;
      res.json({ entries: data ?? [], total: count ?? 0, page, limit });
    } catch (error) {
      logger.error({ error }, "Mobile admin waitlist list failed");
      res.status(503).json({ error: "Waitlist is unavailable" });
    }
  });

  router.delete("/admin/waitlist/:id", async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!id) {
      res.status(422).json({ error: "Valid waitlist id required" });
      return;
    }
    try {
      const { error, count } = await adminClient().from("waitlist").delete({ count: "exact" }).eq("id", id);
      if (error) throw error;
      if (!count) {
        res.status(404).json({ error: "Entry not found" });
        return;
      }
      res.json({ ok: true });
    } catch (error) {
      logger.error({ error, id }, "Mobile admin waitlist delete failed");
      res.status(503).json({ error: "Could not remove waitlist entry" });
    }
  });

  router.get("/admin/messages", async (req, res) => {
    try {
      const page = pageValue(req.query.page, 1, 10_000);
      const limit = pageValue(req.query.limit, 20, 100);
      const { data, error, count } = await adminClient().from("contact_messages").select("id, name, email, message, status, created_at", { count: "exact" }).order("created_at", { ascending: false }).range((page - 1) * limit, page * limit - 1);
      if (error) throw error;
      res.json({ messages: data ?? [], total: count ?? 0, page, limit });
    } catch (error) {
      logger.error({ error }, "Mobile admin messages list failed");
      res.status(503).json({ error: "Support tickets are unavailable" });
    }
  });

  router.patch("/admin/messages/:id", async (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    const status = req.body?.status;
    if (!id || !["open", "resolved"].includes(status)) {
      res.status(422).json({ error: "Valid message id and status required" });
      return;
    }
    try {
      const { data, error } = await adminClient().from("contact_messages").update({ status }).eq("id", id).select("id, name, email, message, status, created_at").maybeSingle();
      if (error) throw error;
      if (!data) {
        res.status(404).json({ error: "Message not found" });
        return;
      }
      res.json({ message: data });
    } catch (error) {
      logger.error({ error, id }, "Mobile admin message update failed");
      res.status(503).json({ error: "Could not update support ticket" });
    }
  });

  return router;
}

export default createAdminRouter();