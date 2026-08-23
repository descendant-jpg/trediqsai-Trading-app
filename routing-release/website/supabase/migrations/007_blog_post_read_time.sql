-- Professional CMS metadata: calculated server-side by /api/admin/posts.
-- This is a forward-only, idempotent migration for existing Supabase projects.

alter table blog_posts
  add column if not exists read_time text not null default '1 min read';