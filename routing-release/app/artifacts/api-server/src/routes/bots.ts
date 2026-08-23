import { Router, type IRouter, type RequestHandler } from "express";
import { z } from "zod";
import { identity, requestUserId, ANONYMOUS_USER } from "../middlewares/identity";
import {
  requireAal2IfMfaEnrolledSoft,
  requireAal2IfMfaEnrolledWrite,
} from "../middlewares/aal2";

const SUPABASE_URL = process.env["SUPABASE_URL"] ?? process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "";
const SERVICE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
const createSchema = z.object({
  pair: z.enum(["BTC/USD", "EUR/USD", "XAU/USD"]),
  strategy: z.enum(["GRID", "DCA"]),
  capital: z.number().positive().max(1_000_000),
});
const statusSchema = z.object({ status: z.enum(["active", "paused"]) });

function headers() {
  return { apikey: SERVICE_KEY, authorization: `Bearer ${SERVICE_KEY}`, "content-type": "application/json" };
}
function ready(res: Parameters<IRouter["get"]>[1] extends never ? never : any) {
  if (!SUPABASE_URL || !SERVICE_KEY) { res.status(503).json({ error: "Bot storage is not configured." }); return false; }
  return true;
}
function user(res: any) {
  const id = requestUserId(res);
  if (id === ANONYMOUS_USER) { res.status(401).json({ error: "Sign in required." }); return null; }
  return id;
}

type BotRouterOptions = {
  identityMiddleware?: RequestHandler;
  readAssurance?: RequestHandler;
  writeAssurance?: RequestHandler;
  fetchImpl?: typeof fetch;
};

/**
 * Bot marketplace availability policy:
 * reads use soft MFA assurance, while configuration writes retain cached
 * outcome enforcement with a degraded pass-through during AAL outages.
 */
export function createBotsRouter({
  identityMiddleware = identity(),
  readAssurance = requireAal2IfMfaEnrolledSoft,
  writeAssurance = requireAal2IfMfaEnrolledWrite,
  fetchImpl = fetch,
}: BotRouterOptions = {}): IRouter {
  const router: IRouter = Router();

  router.get("/bots", identityMiddleware, readAssurance, async (_req, res) => {
    const userId = user(res); if (!userId || !ready(res)) return;
    console.log("Fetching bots for user:", userId);
    try {
      const query = new URLSearchParams({ user_id: `eq.${userId}`, select: "id,pair,strategy,capital,status,pnl,created_at", order: "created_at.desc" });
      const response = await fetchImpl(`${SUPABASE_URL}/rest/v1/trading_bots?${query}`, { headers: headers() });
      const result = response.ok ? await response.json() : await response.text();
      console.log("Bots query result:", result);
      if (!response.ok) return res.status(503).json({ error: "Bot storage is not ready. Apply the latest Supabase migration." });
      return res.status(200).json(Array.isArray(result) ? result : []);
    } catch (error) {
      console.error("Bots query failed:", error);
      return res.status(503).json({ error: "Bot storage is unavailable. Please try again." });
    }
  });
  router.post("/bots", identityMiddleware, writeAssurance, async (req, res) => {
    const userId = user(res); if (!userId || !ready(res)) return;
    const data = createSchema.safeParse(req.body); if (!data.success) return res.status(400).json({ error: "Choose a pair, strategy, and valid capital amount." });
    const response = await fetchImpl(`${SUPABASE_URL}/rest/v1/trading_bots`, { method: "POST", headers: { ...headers(), prefer: "return=representation" }, body: JSON.stringify({ user_id: userId, ...data.data, status: "active" }) });
    if (!response.ok) return res.status(503).json({ error: "Could not deploy the bot. Apply the latest Supabase migration." });
    const rows = await response.json() as unknown[];
    return res.status(201).json(rows[0]);
  });
  router.patch("/bots/:id/status", identityMiddleware, writeAssurance, async (req, res) => {
    const userId = user(res); if (!userId || !ready(res)) return;
    const data = statusSchema.safeParse(req.body); if (!data.success) return res.status(400).json({ error: "Invalid bot status." });
    const query = new URLSearchParams({ id: `eq.${req.params["id"]}`, user_id: `eq.${userId}` });
    const response = await fetchImpl(`${SUPABASE_URL}/rest/v1/trading_bots?${query}`, { method: "PATCH", headers: { ...headers(), prefer: "return=representation" }, body: JSON.stringify(data.data) });
    if (!response.ok) return res.status(503).json({ error: "Could not update this bot." });
    const rows = await response.json() as unknown[]; if (!rows[0]) return res.status(404).json({ error: "Bot not found." });
    return res.json(rows[0]);
  });
  return router;
}

export default createBotsRouter();