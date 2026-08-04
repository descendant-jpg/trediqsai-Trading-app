import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Simulated trading engine for the TradiQs AI terminal.
 *
 * - A synthetic price ticks every second (random walk around a base price).
 * - BUY opens a long position (or closes an open short).
 * - SELL opens a short position (or closes an open long).
 * - Closing a position realizes P&L into the balance.
 * - Daily drawdown tracks realized + unrealized losses against a fixed limit.
 * - State persists via AsyncStorage.
 */

import {
  DAILY_DRAWDOWN_LIMIT,
  PAYOUT_TARGET,
  POSITION_SIZE,
  STARTING_BALANCE,
  computeDrawdownUsed,
  decideOrder,
  distanceToPayout as computeDistanceToPayout,
  positionPnl,
  settleClose,
  type ClosedTrade,
  type OrderDecision,
  type Position,
  type Side,
} from '@/lib/tradingLogic';

export {
  DAILY_DRAWDOWN_LIMIT,
  PAYOUT_TARGET,
  POSITION_SIZE,
  STARTING_BALANCE,
  decideOrder,
};
export type { ClosedTrade, OrderDecision, Position, Side };

const BASE_PRICE = 2_350; // synthetic "QQX index" price
const STORAGE_KEY = 'tradiqs.sim.v1';

interface PersistedState {
  balance: number;
  realizedLossToday: number;
  day: string;
  position: Position | null;
  history: ClosedTrade[];
  lastPrice: number;
}

export type TradeResult =
  | { kind: 'opened'; position: Position }
  | { kind: 'closed'; trade: ClosedTrade }
  | { kind: 'blocked'; reason: string };

interface TradingContextValue {
  ready: boolean;
  price: number;
  balance: number;
  equity: number;
  position: Position | null;
  unrealizedPnl: number;
  history: ClosedTrade[];
  /** 0..1 fraction of the daily drawdown limit consumed. */
  drawdownUsed: number;
  /** Dollars of profit still needed to reach payout (>= 0). */
  distanceToPayout: number;
  buy: () => TradeResult;
  sell: () => TradeResult;
}

const TradingContext = createContext<TradingContextValue | null>(null);

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function TradingProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [price, setPrice] = useState(BASE_PRICE);
  const [balance, setBalance] = useState(STARTING_BALANCE);
  const [realizedLossToday, setRealizedLossToday] = useState(0);
  const [position, setPosition] = useState<Position | null>(null);
  const [history, setHistory] = useState<ClosedTrade[]>([]);
  const loaded = useRef(false);

  // Load persisted state once.
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const s: PersistedState = JSON.parse(raw);
          setBalance(s.balance);
          setPosition(s.position);
          setHistory(s.history ?? []);
          if (typeof s.lastPrice === 'number') setPrice(s.lastPrice);
          // Reset daily drawdown on a new day.
          setRealizedLossToday(s.day === todayKey() ? s.realizedLossToday : 0);
        }
      } catch (e) {
        console.error('Failed to load trading state', e);
      } finally {
        loaded.current = true;
        setReady(true);
      }
    })();
  }, []);

  // Persist on change (after initial load).
  useEffect(() => {
    if (!loaded.current) return;
    const state: PersistedState = {
      balance,
      realizedLossToday,
      day: todayKey(),
      position,
      history,
      lastPrice: price,
    };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch((e) =>
      console.error('Failed to persist trading state', e),
    );
  }, [balance, realizedLossToday, position, history, price]);

  // Synthetic price ticker: mean-reverting random walk.
  useEffect(() => {
    const id = setInterval(() => {
      setPrice((p) => {
        const drift = (BASE_PRICE - p) * 0.002;
        const noise = (Math.random() - 0.5) * 4;
        return Math.max(1, +(p + drift + noise).toFixed(2));
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const unrealizedPnl = position ? positionPnl(position, price) : 0;

  const drawdownUsed = computeDrawdownUsed(realizedLossToday, unrealizedPnl);

  const closePosition = useCallback(
    (pos: Position): ClosedTrade => {
      const { trade, realizedLossDelta } = settleClose(
        pos,
        price,
        0,
        Date.now(),
      );
      setBalance((b) => +(b + trade.pnl).toFixed(2));
      if (realizedLossDelta > 0)
        setRealizedLossToday((l) => l + realizedLossDelta);
      setHistory((h) => [trade, ...h].slice(0, 50));
      setPosition(null);
      return trade;
    },
    [price],
  );

  const execute = useCallback(
    (side: Side): TradeResult => {
      const decision = decideOrder(position, side, drawdownUsed);
      if (decision.action === 'blocked') {
        return { kind: 'blocked', reason: decision.reason };
      }
      if (decision.action === 'close') {
        return { kind: 'closed', trade: closePosition(position!) };
      }
      const pos: Position = {
        side,
        entryPrice: price,
        size: POSITION_SIZE,
        openedAt: Date.now(),
      };
      setPosition(pos);
      return { kind: 'opened', position: pos };
    },
    [position, price, drawdownUsed, closePosition],
  );

  const buy = useCallback(() => execute('LONG'), [execute]);
  const sell = useCallback(() => execute('SHORT'), [execute]);

  const equity = +(balance + unrealizedPnl).toFixed(2);
  const distanceToPayout = computeDistanceToPayout(equity);

  const value = useMemo<TradingContextValue>(
    () => ({
      ready,
      price,
      balance,
      equity,
      position,
      unrealizedPnl,
      history,
      drawdownUsed,
      distanceToPayout,
      buy,
      sell,
    }),
    [
      ready,
      price,
      balance,
      equity,
      position,
      unrealizedPnl,
      history,
      drawdownUsed,
      distanceToPayout,
      buy,
      sell,
    ],
  );

  return (
    <TradingContext.Provider value={value}>{children}</TradingContext.Provider>
  );
}

export function useTrading() {
  const ctx = useContext(TradingContext);
  if (!ctx) throw new Error('useTrading must be used within TradingProvider');
  return ctx;
}
