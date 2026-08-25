---
name: Support ticket data path
description: Admin Help Desk reads contact_messages, NOT support_tickets; mobile tickets must flow through api-server POST /api/support with server-resolved identity/tier.
---

The admin Help Desk (`app/(admin)/help-desk.tsx` → api-server `/api/admin/messages`) reads the **`contact_messages`** table (columns: id, name, email, message, status, created_at — no user_id/subject/source). The repo's `support_tickets` migration (006) was **never applied** to the live DB — mobile once inserted into it directly and every submission failed.

**Why:** Adding columns/tables needs the Supabase SQL editor (no programmatic DDL from this workspace), so the fix writes to the proven CMS table via a new api-server route `POST /api/support` (service role), folding subject + a server-resolved `[TIER]` prefix into the message body.

**How to apply:** Any feature that writes to CMS-visible tables must go through the api-server with the service role (RLS blocks client inserts). Identity, email, and tier must be resolved server-side (profile → Auth admin record → reject); never trust client-supplied email or tier prefixes — they are forgeable triage/priority signals. Verify live table/column existence via the PostgREST OpenAPI spec (`GET /rest/v1/` with service key) before designing payloads.
