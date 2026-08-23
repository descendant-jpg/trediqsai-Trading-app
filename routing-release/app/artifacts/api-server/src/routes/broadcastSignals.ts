import { Router, type IRouter } from "express";
import { z } from "zod";
import { identity, requestUserId, ANONYMOUS_USER } from "../middlewares/identity";
import { logger } from "../lib/logger";
import { isAuthorizedAdminUser } from "./admin";

const router: IRouter = Router();
const url = process.env["SUPABASE_URL"] ?? process.env["EXPO_PUBLIC_SUPABASE_URL"] ?? "";
const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
const bodySchema = z.object({ asset: z.string().trim().min(2).max(20), direction: z.enum(["BUY", "SELL"]), entry: z.number().positive(), takeProfit: z.number().positive(), stopLoss: z.number().positive(), status: z.enum(["pending", "active", "won", "lost"]), isPremium: z.boolean() });
const headers = () => ({ apikey: key, authorization: `Bearer ${key}`, "content-type": "application/json" });
router.get("/signals/broadcast", async (_req, res) => {
  if (!url || !key) return res.status(503).json({ error: "Signal feed is not configured." });
  try {
    const r = await fetch(`${url}/rest/v1/broadcast_signals?select=*&order=created_at.desc`, { headers: headers() });
    if (!r.ok) {
      logger.error({ status: r.status, body: await r.text() }, "Broadcast signal feed query failed");
      return res.status(503).json({ error: "Signal feed is not ready. Apply the latest Supabase migration." });
    }
    const rows: unknown = await r.json();
    return res.json(Array.isArray(rows) ? rows : []);
  } catch (err) {
    logger.error({ err }, "Broadcast signal feed request failed");
    return res.status(503).json({ error: "Signal feed is temporarily unavailable." });
  }
});
router.post("/signals/broadcast", identity(), async (req, res) => {
  const userId = requestUserId(res); if (userId === ANONYMOUS_USER) return res.status(401).json({ error: "Sign in required." });
  if (!url || !key) return res.status(503).json({ error: "Signal feed is not configured." });
  try {
    if (!(await isAuthorizedAdminUser(userId))) return res.status(403).json({ error: "Administrator access required." });
  } catch (error) {
    logger.error({ error, userId }, "Broadcast administrator authorization failed");
    return res.status(503).json({ error: "Administrator access is unavailable." });
  }
  const data = bodySchema.safeParse(req.body); if (!data.success) return res.status(400).json({ error: "Invalid signal details." });
  const r = await fetch(`${url}/rest/v1/broadcast_signals`, { method: "POST", headers: { ...headers(), prefer: "return=representation" }, body: JSON.stringify({ asset: data.data.asset, direction: data.data.direction, entry: data.data.entry, take_profit: data.data.takeProfit, stop_loss: data.data.stopLoss, status: data.data.status, is_premium: data.data.isPremium }) });
  if (!r.ok) return res.status(503).json({ error: "Could not publish signal. Apply the latest Supabase migration." });
  return res.status(201).json((await r.json() as unknown[])[0]);
});
export default router;