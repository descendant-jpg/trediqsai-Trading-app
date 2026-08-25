import { createClient } from "@supabase/supabase-js";
import { Router, type IRouter } from "express";

const router: IRouter = Router();

/** Same column set the website's /api/posts route exposes publicly. */
const LIST_SELECT =
  "id,title,slug,excerpt,author,cover_image,tags,asset_class,category,ai_badge,upvotes,published_at,created_at";

function getDb() {
  const url = process.env["SUPABASE_URL"] ?? process.env["EXPO_PUBLIC_SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Public blog feed — the exact same Supabase blog_posts data the website
 * renders (published posts only), so web and mobile stay in sync.
 *
 *   GET /api/blog?limit=30   → { posts }   (list payload, no content field)
 *   GET /api/blog?slug=x     → { post }    (single post including full content)
 */
router.get("/blog", async (req, res) => {
  const db = getDb();
  if (!db) return res.status(503).json({ error: "Blog service is not configured yet." });

  const rawSlug = req.query["slug"];
  const slug =
    typeof rawSlug === "string"
      ? rawSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "")
      : "";

  try {
    if (slug) {
      const { data, error } = await db
        .from("blog_posts")
        .select(`${LIST_SELECT},content`)
        .eq("status", "published")
        .eq("slug", slug)
        .single();
      if (error) {
        if (error.code === "PGRST116") return res.status(404).json({ error: "Post not found." });
        throw error;
      }
      return res.json({ post: data });
    }

    const limit = Math.min(
      50,
      Math.max(1, parseInt(String(req.query["limit"] ?? "30"), 10) || 30),
    );
    const { data, error } = await db
      .from("blog_posts")
      .select(LIST_SELECT)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return res.json({ posts: data ?? [] });
  } catch (error) {
    console.error("Blog query failed:", error);
    return res.status(500).json({ error: "Failed to fetch blog posts." });
  }
});

export default router;
