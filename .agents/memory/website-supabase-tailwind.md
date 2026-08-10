---
name: Website Supabase and Tailwind setup
description: Website-specific dependency and styling constraints for the public site and CMS.
---

The website uses the current Tailwind PostCSS adapter (`@tailwindcss/postcss`) rather than the legacy direct Tailwind PostCSS plugin, and its Supabase client must remain environment-driven through public URL and anon-key variables.

**Why:** Current Tailwind releases reject the legacy PostCSS integration, while the website and mobile app need to share Supabase without embedding credentials.

**How to apply:** Keep `postcss.config.mjs` on the adapter package and initialize website Supabase access only from `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.