// TradiQs AI — drawdown-monitor Edge Function (Deno).
//
// Runs on a pg_cron schedule. For every ACTIVE account with OPEN trades it
// computes live equity (balance + unrealized P&L at the current BTC/USD
// price) and liquidates any account whose equity has fallen to or below
// 95% of its daily starting balance.
//
// Deploy:  supabase functions deploy drawdown-monitor --no-verify-jwt
// (Auth is enforced manually below against the service_role key, since the
//  caller is pg_cron, not a user JWT.)

import { createClient } from "npm:@supabase/supabase-js@2";

const DRAWDOWN_LIMIT = 0.95; // liquidate at a 5% drop from daily start

interface Trade {
  id: string;
  user_id: string;
  side: "BUY" | "SELL";
  entry_price: number;
}

interface Profile {
  id: string;
  balance: number;
  daily_starting_balance: number;
}

/** Fetch live BTC/USD spot price. Coinbase is the same provider the app's
 *  live feed fails over to (Binance is geo-blocked from our infra). */
async function fetchBtcPrice(): Promise<number> {
  const res = await fetch("https://api.coinbase.com/v2/prices/BTC-USD/spot");
  if (!res.ok) throw new Error(`Price fetch failed: ${res.status}`);
  const json = await res.json();
  const price = Number(json?.data?.amount);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Price fetch returned invalid amount");
  }
  return price;
}

Deno.serve(async (req) => {
  // ── Auth: only the service role (pg_cron) may invoke this function ──
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") ?? "";
  if (authHeader !== `Bearer ${serviceKey}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    serviceKey,
    { auth: { persistSession: false } },
  );

  try {
    // 1. Live market price.
    const livePrice = await fetchBtcPrice();

    // 1b. Publish it as the server-owned reference price. Trades opened and
    //     closed through open_server_trade / close_server_trade price
    //     themselves from this row, so payout-eligible P&L never depends on a
    //     price the client chose. Stale rows are rejected by the RPCs.
    const { error: priceErr } = await supabase
      .from("market_prices")
      .upsert(
        { asset: "BTC/USD", price: livePrice, updated_at: new Date().toISOString() },
        { onConflict: "asset" },
      );
    if (priceErr) {
      console.error("market_prices upsert failed:", priceErr);
    }

    // 2. All OPEN trades (only they create drawdown exposure).
    const { data: openTrades, error: tradesErr } = await supabase
      .from("trades")
      .select("id, user_id, side, entry_price")
      .eq("status", "OPEN");
    if (tradesErr) throw tradesErr;

    const trades = (openTrades ?? []) as Trade[];
    if (trades.length === 0) {
      return json({ ok: true, livePrice, checked: 0, liquidated: [] });
    }

    // 3. ACTIVE profiles among users holding open trades.
    const userIds = [...new Set(trades.map((t) => t.user_id))];
    const { data: profileRows, error: profilesErr } = await supabase
      .from("profiles")
      .select("id, balance, daily_starting_balance")
      .eq("account_status", "ACTIVE")
      .in("id", userIds);
    if (profilesErr) throw profilesErr;

    const profiles = (profileRows ?? []) as Profile[];

    // 4. Equity check per user.
    const liquidated: string[] = [];
    for (const profile of profiles) {
      const unrealizedPnl = trades
        .filter((t) => t.user_id === profile.id)
        .reduce((sum, t) => {
          const perUnit = t.side === "BUY"
            ? livePrice - t.entry_price
            : t.entry_price - livePrice;
          return sum + perUnit;
        }, 0);

      const equity = profile.balance + unrealizedPnl;
      const floor = profile.daily_starting_balance * DRAWDOWN_LIMIT;

      if (equity <= floor) {
        // 5. Breach → atomic liquidation (close all OPEN trades at the
        //    live price + mark account BLOWN) via SECURITY DEFINER RPC.
        const { error: rpcErr } = await supabase.rpc("liquidate_account", {
          p_user_id: profile.id,
          p_close_price: livePrice,
        });
        if (rpcErr) {
          console.error(`liquidate_account failed for ${profile.id}:`, rpcErr);
        } else {
          liquidated.push(profile.id);
        }
      }
    }

    return json({
      ok: true,
      livePrice,
      checked: profiles.length,
      liquidated,
    });
  } catch (err) {
    console.error("drawdown-monitor error:", err);
    return json({ ok: false, error: String(err) }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
