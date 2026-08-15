import { createClient } from "@supabase/supabase-js";
import { Router, type IRouter } from "express";

/*
  Apply manually in the Supabase SQL editor:
  create table public.tradiqs_signals (
    id uuid primary key default gen_random_uuid(),
    pair text not null,
    asset_class text not null,
    action text not null,
    status text not null check (status in ('Active', 'Won', 'Lost', 'Pending')),
    risk_reward numeric not null,
    entry numeric not null,
    stop_loss numeric not null,
    take_profits jsonb not null default '[]'::jsonb,
    timestamp timestamptz not null default now(),
    pips numeric not null
  );
  alter table public.tradiqs_signals enable row level security;
*/

export interface ProductionSignal {
  id: string;
  pair: string;
  assetClass: string;
  action: string;
  status: "Active" | "Won" | "Lost" | "Pending";
  riskReward: number;
  entry: number;
  stopLoss: number;
  takeProfits: { price: number; hit: boolean }[];
  timestamp: number;
  pips: number;
}

type SignalRow = {
  id: string; pair: string; asset_class: string; action: string;
  status: ProductionSignal["status"]; risk_reward: number; entry: number;
  stop_loss: number; take_profits: ProductionSignal["takeProfits"]; timestamp: string; pips: number;
};

const router: IRouter = Router();

router.get("/signals", async (_req, res) => {
  const url = process.env["SUPABASE_URL"] ?? process.env["EXPO_PUBLIC_SUPABASE_URL"];
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !key) {
    res.status(500).json({ error: "Live signals database is not configured." });
    return;
  }

  try {
    const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await supabase
      .from("tradiqs_signals")
      .select("id,pair,asset_class,action,status,risk_reward,entry,stop_loss,take_profits,timestamp,pips")
      .order("timestamp", { ascending: false });
    if (error) throw error;
    const signals: ProductionSignal[] = ((data ?? []) as SignalRow[]).map((row) => ({
      id: row.id, pair: row.pair, assetClass: row.asset_class, action: row.action,
      status: row.status, riskReward: Number(row.risk_reward), entry: Number(row.entry),
      stopLoss: Number(row.stop_loss), takeProfits: row.take_profits ?? [],
      timestamp: Date.parse(row.timestamp), pips: Number(row.pips),
    }));
    res.json(signals);
  } catch (error) {
    console.error("Live signals query failed:", error);
    res.status(500).json({ error: "Live signals database query failed." });
  }
});

export default router;