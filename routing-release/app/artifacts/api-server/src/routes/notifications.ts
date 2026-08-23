import { createClient } from "@supabase/supabase-js";
import { Router, type IRouter } from "express";

export interface LiveNotification {
  id: string;
  title: "New Trade Setup";
  message: string;
  type: "AI_ALERT";
  timestamp: number;
  assetClass: "crypto" | "forex" | "stocks";
  referenceId: string;
}

type SignalNotificationRow = { id: string; pair: string; action: string; timestamp: string | number; asset_class: string | null };
const router: IRouter = Router();

router.get("/notifications", async (_req, res) => {
  const url = process.env["SUPABASE_URL"] ?? process.env["EXPO_PUBLIC_SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) return res.status(500).json({ error: "Live notifications database is not configured." });
  try {
    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await supabase.from("tradiqs_signals").select("id,pair,action,asset_class,timestamp").order("timestamp", { ascending: false }).limit(10);
    if (error) throw error;
    const notifications: LiveNotification[] = ((data ?? []) as SignalNotificationRow[]).map((signal) => {
      const rawTs = signal.timestamp;
      const numTs = typeof rawTs === "string" ? parseInt(rawTs, 10) : Number(rawTs);
      const safeTimestamp = Number.isFinite(numTs) ? (numTs < 1e11 ? numTs * 1000 : numTs) : Date.parse(String(rawTs));
      const rawAssetClass = String(signal.asset_class ?? "").toLowerCase();
      const assetClass = rawAssetClass === "crypto" || rawAssetClass === "stocks" ? rawAssetClass : "forex";
      return {
        id: `signal-${signal.id}`, title: "New Trade Setup",
        message: `New ${signal.action} signal for ${signal.pair} is forming.`,
        type: "AI_ALERT", timestamp: safeTimestamp, assetClass, referenceId: signal.id,
      };
    });
    return res.json(notifications);
  } catch (error) {
    console.error("Live notifications query failed:", error);
    return res.status(500).json({ error: "Live notifications database query failed." });
  }
});

export default router;