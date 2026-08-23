import { Router, type IRouter } from "express";
import { GetLeaderboardResponse } from "@workspace/api-zod";

const router: IRouter = Router();


const TRADERS = [
  { id: "t1", rank: 1, name: "Ava Chen", handle: "@quantava", pnl: 48230, pnlPct: 34.2, winRate: 71, trades: 182, pro: true },
  { id: "t2", rank: 2, name: "Marcus Vale", handle: "@valestreet", pnl: 39115, pnlPct: 28.7, winRate: 66, trades: 240, pro: true },
  { id: "t3", rank: 3, name: "Rin Takahashi", handle: "@rin_alpha", pnl: 31877, pnlPct: 24.1, winRate: 63, trades: 155, pro: false },
  { id: "t4", rank: 4, name: "Sofia Marino", handle: "@sofitrades", pnl: 22409, pnlPct: 18.9, winRate: 61, trades: 199, pro: false },
  { id: "t5", rank: 5, name: "Dev Patel", handle: "@devdelta", pnl: 17654, pnlPct: 15.2, winRate: 58, trades: 310, pro: true },
  { id: "t6", rank: 6, name: "Lena Fischer", handle: "@lenafx", pnl: 12980, pnlPct: 11.6, winRate: 57, trades: 128, pro: false },
  { id: "t7", rank: 7, name: "Omar Haddad", handle: "@omarhedge", pnl: 8412, pnlPct: 7.9, winRate: 54, trades: 176, pro: false },
  { id: "t8", rank: 8, name: "Jules Beaumont", handle: "@julescap", pnl: 3305, pnlPct: 3.1, winRate: 52, trades: 90, pro: false },
  { id: "t9", rank: 9, name: "Nikolai Petrov", handle: "@nikvol", pnl: -2148, pnlPct: -2.4, winRate: 47, trades: 205, pro: false },
  { id: "t10", rank: 10, name: "Harper Singh", handle: "@harperswing", pnl: -6820, pnlPct: -6.8, winRate: 44, trades: 143, pro: false },
];

router.get("/leaderboard", (_req, res) => {
  res.json(GetLeaderboardResponse.parse(TRADERS));
});

export default router;
