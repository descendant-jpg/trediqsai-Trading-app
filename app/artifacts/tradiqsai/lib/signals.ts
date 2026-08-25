/**
 * Signal Desk shared types and display helpers.
 *
 * Mirrors the api-server `/api/signals` contract. Target metadata (TP
 * checkpoints, AI analysis, confidence, timeline) arrives normalized from
 * the server; the client never parses raw storage envelopes.
 */

export type SignalStatus = 'Active' | 'Won' | 'Lost' | 'Pending';
export type AssetCategory = 'forex' | 'crypto' | 'stocks';

export interface SignalTarget {
  id: 1 | 2 | 3;
  price: number;
  pips: number;
  label: string;
  isHit: boolean;
  hitAt: string | null;
}

export interface SignalListItem {
  id: string;
  pair: string;
  assetClass: AssetCategory;
  action: 'BUY' | 'SELL';
  status: SignalStatus;
  riskReward: string;
  entry: number | 'LOCKED';
  stopLoss: number | 'LOCKED';
  takeProfits: SignalTarget[];
  timestamp: number;
  pips: number | 'LOCKED';
  analysis: string | null;
  confidence: number | null;
  risk: 'Low' | 'Medium' | 'High';
  timeframe: string;
  breakeven: boolean;
  openedAt: number | null;
  closedAt: number | null;
  locked: boolean;
}

export interface SignalQuota {
  premium: boolean;
  limit: number;
  used: number;
  remaining: number;
}

export interface SignalFeed {
  signals: SignalListItem[];
  quota: SignalQuota;
}

export const CATEGORY_FILTERS = ['All', 'Forex', 'Crypto', 'Stocks'] as const;
export type CategoryFilter = (typeof CATEGORY_FILTERS)[number];

export const STATUS_FILTERS = ['All', 'Active', 'Won', 'Lost', 'Pending'] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];

export const CATEGORY_META: Record<AssetCategory, { label: string; color: string }> = {
  forex: { label: 'FOREX', color: '#00F0FF' },
  crypto: { label: 'CRYPTO', color: '#B026FF' },
  stocks: { label: 'STOCKS', color: '#F5A623' },
};

export const STATUS_META: Record<SignalStatus, { label: string; color: string }> = {
  Active: { label: 'LIVE', color: '#00F0FF' },
  Won: { label: 'WON', color: '#28D68A' },
  Lost: { label: 'LOST', color: '#FF6576' },
  Pending: { label: 'PENDING', color: '#F5A623' },
};

export function categoryMatches(signal: SignalListItem, filter: CategoryFilter): boolean {
  return filter === 'All' || signal.assetClass === filter.toLowerCase();
}

export function statusMatches(signal: SignalListItem, filter: StatusFilter): boolean {
  return filter === 'All' || signal.status === filter;
}

export function formatSignalTime(timestamp: number | null | undefined): string {
  if (!timestamp || !Number.isFinite(timestamp)) return '—';
  const date = new Date(timestamp);
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatPrice(value: number | 'LOCKED', pair: string): string {
  if (value === 'LOCKED') return '••••';
  const decimals = pair.includes('JPY') || pair.includes('XAU') || pair.includes('USOIL') ? 2
    : /BTC|ETH|SOL/.test(pair) ? (value >= 1000 ? 1 : 2)
    : value >= 100 ? 2 : 5;
  return value.toFixed(decimals);
}

/** The display gain shown as a card footer and detail "potential" stat. */
export function potentialLabel(signal: SignalListItem): string {
  const tp3 = signal.takeProfits[signal.takeProfits.length - 1];
  return tp3?.label || '—';
}

export function realizedLabel(signal: SignalListItem): string {
  if (signal.pips === 'LOCKED') return '••••';
  if (signal.assetClass === 'forex') return `${signal.pips >= 0 ? '+' : ''}${signal.pips}p`;
  const hits = signal.takeProfits.filter((tp) => tp.isHit);
  if (hits.length) return hits.map((tp) => tp.label).join(' ');
  return signal.assetClass === 'crypto' ? '+0.0%' : '+$0.00';
}

/** TradingView deep link for the card's broker action. */
export function tradeNowUrl(signal: SignalListItem): string {
  const ticker = signal.pair.replace('/', '');
  return `https://www.tradingview.com/symbols/${ticker}/`;
}
