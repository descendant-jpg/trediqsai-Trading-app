import { createClient } from "@supabase/supabase-js";
import { Router, type IRouter } from "express";

export interface LiveNotification {
  id: string;
  title: "New Trade Setup";
  message: string;
  type: "AI_ALERT";
  timestamp: number;
  referenceId: string;
}

type SignalNotificationRow = { id: string; pair: string; action: string; timestamp: string };
const router: IRouter = Router();

router.get("/notifications", async (_req, res) => {
  const url = process.env["SUPABASE_URL"] ?? process.env["EXPO_PUBLIC_SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) return res.status(500).json({ error: "Live notifications database is not configured." });
  try {
    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await supabase.from("tradiqs_signals").select("id,pair,action,timestamp").order("timestamp", { ascending: false }).limit(10);
    if (error) throw error;
    const notifications: LiveNotification[] = ((data ?? []) as SignalNotificationRow[]).map((signal) => ({
      id: `signal-${signal.id}`, title: "New Trade Setup",
      message: `New ${signal.action} signal for ${signal.pair} is forming.`,
      type: "AI_ALERT", timestamp: Date.parse(signal.timestamp), referenceId: signal.id,
    }));
    return res.json(notifications);
  } catch (error) {
    console.error("Live notifications query failed:", error);
    return res.status(500).json({ error: "Live notifications database query failed." });
  }
});

export default router;