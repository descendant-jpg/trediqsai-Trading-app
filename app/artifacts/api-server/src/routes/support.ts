import { Router, type IRouter, type RequestHandler } from "express";
import { z } from "zod";
import { identity, requestUserId, ANONYMOUS_USER } from "../middlewares/identity";
import { rateLimit } from "../middlewares/rateLimit";
import { resolveAccessTier, type TierLookup } from "../lib/entitlement";

const SUPABASE_URL =
  process.env["SUPABASE_URL"] ?? process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "";
const SERVICE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";

const ticketSchema = z.object({
  subject: z.string().trim().max(200).optional().default(""),
  message: z.string().trim().min(1, "A message is required.").max(5000),
});

type SupportRouterOptions = {
  identityMiddleware?: RequestHandler;
  fetchImpl?: typeof fetch;
  tierLookup?: TierLookup;
  /** Injectable so tests don't share limiter buckets across cases. */
  rateLimitMiddleware?: RequestHandler;
};

function headers() {
  return {
    apikey: SERVICE_KEY,
    authorization: `Bearer ${SERVICE_KEY}`,
    "content-type": "application/json",
  };
}

/**
 * Mobile support ticket intake.
 *
 * Tickets land in `contact_messages` — the table the admin Help Desk reads
 * (that table predates the never-applied support_tickets migration and has
 * no user_id/subject/source columns, so subject is folded into the message
 * body and identity comes from the verified JWT, never the client).
 *
 * Trust boundaries:
 * - name, email and the [TIER] triage prefix are resolved server-side from
 *   the profile / auth record / entitlement lookup. A client cannot forge
 *   concierge priority or attribute a ticket to someone else's address.
 * - The service role key writes on behalf of the caller; RLS on
 *   contact_messages does not permit client inserts, which is exactly why
 *   the mobile app must go through this route.
 */
export function createSupportRouter({
  identityMiddleware = identity(),
  fetchImpl = fetch,
  tierLookup,
  rateLimitMiddleware = rateLimit({
    max: 5,
    windowMs: 60 * 60_000,
    message: "Too many tickets. Please wait before submitting again.",
    key: (_req, res) => `support:${res.locals["userId"] ?? "anonymous"}`,
  }),
}: SupportRouterOptions = {}): IRouter {
  const router: IRouter = Router();

  router.post("/support", identityMiddleware, rateLimitMiddleware, async (req, res) => {
    const userId = requestUserId(res);
    if (!userId || userId === ANONYMOUS_USER) {
      return res.status(401).json({ error: "Sign in to submit a support ticket." });
    }
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return res.status(503).json({ error: "Support desk is not configured." });
    }
    const data = ticketSchema.safeParse(req.body);
    if (!data.success) {
      return res.status(400).json({ error: "A message is required to open a ticket." });
    }

    // Resolve name/email server-side: profile first, then the verified auth
    // record. Client-supplied identity fields are never trusted.
    let email = "";
    let name = "Trader";
    try {
      const query = new URLSearchParams({
        id: `eq.${userId}`,
        select: "email,full_name",
        limit: "1",
      });
      const profileRes = await fetchImpl(`${SUPABASE_URL}/rest/v1/profiles?${query}`, {
        headers: headers(),
      });
      if (profileRes.ok) {
        const rows = (await profileRes.json()) as {
          email?: string | null;
          full_name?: string | null;
        }[];
        if (rows[0]?.email) email = rows[0].email;
        if (rows[0]?.full_name?.trim()) name = rows[0].full_name.trim();
      }
    } catch (error) {
      console.error("Support ticket profile lookup failed:", error);
    }
    if (!email) {
      try {
        const authRes = await fetchImpl(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
          headers: headers(),
        });
        if (authRes.ok) {
          const record = (await authRes.json()) as { email?: string | null };
          if (record.email) email = record.email;
        }
      } catch (error) {
        console.error("Support ticket auth lookup failed:", error);
      }
    }
    if (!email) {
      return res
        .status(400)
        .json({ error: "We could not resolve your account email. Please add one in Profile." });
    }

    // The concierge desk triages by tier — resolved server-side so the
    // prefix cannot be forged by a client.
    const tier = (await resolveAccessTier(userId, tierLookup)) ?? "free";
    const subject = data.data.subject || "VIP Support request";
    const taggedSubject = `[${tier.toUpperCase()}] ${subject}`;
    const body = `${taggedSubject}\n\n${data.data.message}`;

    try {
      const insertRes = await fetchImpl(`${SUPABASE_URL}/rest/v1/contact_messages`, {
        method: "POST",
        headers: { ...headers(), prefer: "return=representation" },
        body: JSON.stringify({ name, email, message: body, status: "open" }),
      });
      if (!insertRes.ok) {
        console.error("Support ticket insert failed:", insertRes.status, await insertRes.text());
        return res.status(503).json({ error: "Unable to submit ticket. Please try again." });
      }
      const rows = (await insertRes.json()) as { id?: number | string }[];
      const id = rows[0]?.id;
      const reference = `TQ-${String(id ?? Date.now()).padStart(6, "0")}`;
      return res.status(201).json({ reference, status: "open" });
    } catch (error) {
      // Network failures and malformed storage responses land here.
      console.error("Support ticket storage error:", error);
      return res.status(503).json({ error: "Unable to submit ticket. Please try again." });
    }
  });

  return router;
}

export default createSupportRouter();
