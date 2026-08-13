import { Router, type IRouter } from "express";
import { z } from "zod";
import { identity, requestUserId, ANONYMOUS_USER } from "../middlewares/identity";

const router: IRouter = Router();
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

router.get("/bots", identity(), async (_req, res) => {
  const userId = user(res); if (!userId || !ready(res)) return;
  const query = new URLSearchParams({ user_id: `eq.${userId}`, select: "id,pair,strategy,capital,status,pnl,created_at", order: "created_at.desc" });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/trading_bots?${query}`, { headers: headers() });
  if (!response.ok) return res.status(503).json({ error: "Bot storage is not ready. Apply the latest Supabase migration." });
  return res.json(await response.json());
});
router.post("/bots", identity(), async (req, res) => {
  const userId = user(res); if (!userId || !ready(res)) return;
  const data = createSchema.safeParse(req.body); if (!data.success) return res.status(400).json({ error: "Choose a pair, strategy, and valid capital amount." });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/trading_bots`, { method: "POST", headers: { ...headers(), prefer: "return=representation" }, body: JSON.stringify({ user_id: userId, ...data.data, status: "active" }) });
  if (!response.ok) return res.status(503).json({ error: "Could not deploy the bot. Apply the latest Supabase migration." });
  const rows = await response.json() as unknown[];
  return res.status(201).json(rows[0]);
});
router.patch("/bots/:id/status", identity(), async (req, res) => {
  const userId = user(res); if (!userId || !ready(res)) return;
  const data = statusSchema.safeParse(req.body); if (!data.success) return res.status(400).json({ error: "Invalid bot status." });
  const query = new URLSearchParams({ id: `eq.${req.params["id"]}`, user_id: `eq.${userId}` });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/trading_bots?${query}`, { method: "PATCH", headers: { ...headers(), prefer: "return=representation" }, body: JSON.stringify(data.data) });
  if (!response.ok) return res.status(503).json({ error: "Could not update this bot." });
  const rows = await response.json() as unknown[]; if (!rows[0]) return res.status(404).json({ error: "Bot not found." });
  return res.json(rows[0]);
});
export default router;