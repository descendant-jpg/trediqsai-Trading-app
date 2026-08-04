import { Router, type IRouter } from "express";
import { GetSignalsResponse } from "@workspace/api-zod";

const router: IRouter = Router();


const SIGNALS = [
  {
    id: "s1",
    symbol: "NVDA",
    name: "NVIDIA Corp",
    action: "BUY",
    confidence: 92,
    price: "$128.44",
    target: "$142.00",
    timeframe: "1–2 weeks",
    time: "2m ago",
    pro: true,
    rationale:
      "Momentum breakout above 20-day range on rising volume; AI-sector flows accelerating.",
  },
  {
    id: "s2",
    symbol: "BTC",
    name: "Bitcoin",
    action: "BUY",
    confidence: 87,
    price: "$96,210",
    target: "$104,500",
    timeframe: "3–5 days",
    time: "9m ago",
    pro: false,
    rationale:
      "Funding reset with spot bid returning; reclaim of key level flips structure bullish.",
  },
  {
    id: "s3",
    symbol: "TSLA",
    name: "Tesla Inc",
    action: "SELL",
    confidence: 78,
    price: "$243.10",
    target: "$226.00",
    timeframe: "1 week",
    time: "18m ago",
    pro: true,
    rationale:
      "Bearish divergence on RSI with delivery estimates trimmed; distribution at resistance.",
  },
  {
    id: "s4",
    symbol: "ETH",
    name: "Ethereum",
    action: "BUY",
    confidence: 81,
    price: "$3,412",
    target: "$3,780",
    timeframe: "1–2 weeks",
    time: "34m ago",
    pro: false,
    rationale:
      "ETH/BTC ratio basing; staking inflows and L2 activity trending higher.",
  },
  {
    id: "s5",
    symbol: "AMD",
    name: "Advanced Micro Devices",
    action: "BUY",
    confidence: 74,
    price: "$168.92",
    target: "$181.00",
    timeframe: "2 weeks",
    time: "1h ago",
    pro: false,
    rationale:
      "Datacenter guidance beat; pullback to rising 50-day offers favorable entry.",
  },
  {
    id: "s6",
    symbol: "SOL",
    name: "Solana",
    action: "SELL",
    confidence: 69,
    price: "$212.35",
    target: "$194.00",
    timeframe: "3–5 days",
    time: "2h ago",
    pro: true,
    rationale:
      "Overheated perp funding and slowing DEX volume; rotation risk into majors.",
  },
  {
    id: "s7",
    symbol: "AAPL",
    name: "Apple Inc",
    action: "BUY",
    confidence: 71,
    price: "$229.87",
    target: "$241.00",
    timeframe: "2–3 weeks",
    time: "3h ago",
    pro: false,
    rationale:
      "Services growth re-rating; buyback support with seasonality tailwind into earnings.",
  },
];

router.get("/signals", (_req, res) => {
  res.json(GetSignalsResponse.parse(SIGNALS));
});

export default router;
