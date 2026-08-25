---
name: Blog data read path
description: How mobile and web read blog_posts — the sanctioned path and the domain trap.
---

The `blog_posts` table (website CMS content) has RLS enabled with **no public SELECT policy** — the Expo anon client gets silent empty results or denials. The only sanctioned read paths are service-role server routes: the website's `/api/posts` (Next.js) and the API server's `/api/blog` (mirrors it: list omits `content`, `?slug=` returns full body, published-only).

**Why:** `https://www.tradiqsai.com` is NOT served by this repo's Next.js app (it historically answered WordPress `wp-json` there), so fetching site API routes from that domain 404s and puts the app in its error state. The mobile app must call its own configured API server instead.

**How to apply:** For blog/CMS data in the Expo app, use `customFetch('/api/blog…')` against the api-server artifact. If a new CMS field is needed, extend the route's select list in `app/artifacts/api-server/src/routes/blog.ts`. Do not add a public anon SELECT policy on `blog_posts` without a deliberate decision, and never hardcode www.tradiqsai.com API calls in app code.
