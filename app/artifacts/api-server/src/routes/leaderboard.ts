import { createClient } from "@supabase/supabase-js";
import { Router, type IRouter } from "express";

export type CompetitionProfileRow = {
  id: string;
  username: string | null;
};

export type ClosedTradeRow = {
  user_id: string;
  pnl: number | string | null;
  price_source: string | null;
};

export type CompetitionLeaderboardRow = {
  id: string;
  rank: number;
  username: string | null;
  profit: number;
  winRate: number;
};

type PageResult<T> = {
  data: T[] | null;
  error: unknown;
};

const COMPETITION_PAGE_SIZE = 1_000;

function finiteNumber(value: number | string | null): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

export async function fetchAllCompetitionRows<T>(
  fetchPage: (from: number, to: number) => Promise<PageResult<T>>,
): Promise<T[]> {
  const rows: T[] = [];

  for (let from = 0; ; from += COMPETITION_PAGE_SIZE) {
    const page = await fetchPage(from, from + COMPETITION_PAGE_SIZE - 1);
    if (page.error) throw page.error;

    const pageRows = page.data ?? [];
    rows.push(...pageRows);
    if (pageRows.length < COMPETITION_PAGE_SIZE) return rows;
  }
}

/** Maps only persisted trader performance into the public competition shape. */
export function rankCompetitionProfiles(
  profiles: CompetitionProfileRow[],
  closedTrades: ClosedTradeRow[],
): CompetitionLeaderboardRow[] {
  const performance = new Map<
    string,
    { profit: number; closedTrades: number; wins: number }
  >();

  for (const trade of closedTrades) {
    if (
      !trade.user_id ||
      trade.pnl === null ||
      trade.price_source !== "SERVER"
    ) {
      continue;
    }
    const profit = finiteNumber(trade.pnl);
    const current = performance.get(trade.user_id) ?? {
      profit: 0,
      closedTrades: 0,
      wins: 0,
    };
    current.profit += profit;
    current.closedTrades += 1;
    if (profit > 0) current.wins += 1;
    performance.set(trade.user_id, current);
  }

  return profiles
    .flatMap((profile) => {
      const traderPerformance = performance.get(profile.id);
      if (!traderPerformance) return [];
      return [
        {
          id: profile.id,
          username: profile.username,
          profit: traderPerformance.profit,
          winRate:
            (traderPerformance.wins / traderPerformance.closedTrades) * 100,
        },
      ];
    })
    .sort((left, right) => right.profit - left.profit || left.id.localeCompare(right.id))
    .map((trader, index) => ({ ...trader, rank: index + 1 }));
}

const router: IRouter = Router();

router.get("/competition/leaderboard", async (_req, res) => {
  const url =
    process.env["SUPABASE_URL"] ?? process.env["EXPO_PUBLIC_SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !serviceRoleKey) {
    return res.status(503).json({
      error: "Competition leaderboard is temporarily unavailable.",
    });
  }

  try {
    const supabase = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const [profiles, closedTrades] = await Promise.all([
      fetchAllCompetitionRows<CompetitionProfileRow>(async (from, to) =>
        supabase
          .from("profiles")
          .select("id, username")
          .order("id", { ascending: true })
          .range(from, to),
      ),
      fetchAllCompetitionRows<ClosedTradeRow>(async (from, to) =>
        supabase
          .from("trades")
          .select("user_id, pnl, price_source")
          .in("status", ["closed", "CLOSED"])
          .eq("price_source", "SERVER")
          .order("user_id", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      ),
    ]);

    return res.json(
      rankCompetitionProfiles(profiles, closedTrades).slice(0, 100),
    );
  } catch (error) {
    console.error("Competition leaderboard query failed:", error);
    return res.status(502).json({
      error: "Competition leaderboard is temporarily unavailable.",
    });
  }
});

export default router;
