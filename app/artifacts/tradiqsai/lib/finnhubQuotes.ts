export type FinnhubQuote = {
  c?: number | null; // current price
  pc?: number | null; // previous close
  dp?: number | null; // percent change
};

export type MappedQuote = {
  symbol: string;
  price: number;
  changePercent: number;
};

const FINNHUB_QUOTE_URL = 'https://finnhub.io/api/v1/quote';

/**
 * Maps one Finnhub /quote payload to display-safe numbers.
 * Falls back to the previous close when the current price is missing or 0,
 * and to 0 for missing/malformed fields so rendering can never crash.
 * Returns null when no usable price exists; the caller drops that symbol.
 */
export function mapFinnhubQuote(
  symbol: string,
  data: FinnhubQuote | null | undefined,
): MappedQuote | null {
  const rawPrice =
    typeof data?.c === 'number' && data.c !== 0
      ? data.c
      : typeof data?.pc === 'number'
        ? data.pc
        : 0;
  const price = Number.isFinite(rawPrice) ? rawPrice : 0;
  if (price === 0) return null;
  const rawChange = typeof data?.dp === 'number' ? data.dp : 0;
  return {
    symbol,
    price,
    changePercent: Number.isFinite(rawChange) ? rawChange : 0,
  };
}

/**
 * Fetches Finnhub quotes for every symbol in parallel and maps them to
 * display-safe values. Throws when the API errors or returns nothing usable.
 */
export async function fetchFinnhubQuotes(
  symbols: readonly string[],
  apiKey: string,
  signal?: AbortSignal,
): Promise<MappedQuote[]> {
  const results = await Promise.all(
    symbols.map(async (symbol) => {
      const res = await fetch(
        `${FINNHUB_QUOTE_URL}?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(apiKey)}`,
        signal ? { signal } : undefined,
      );
      if (!res.ok) throw new Error(`Finnhub API Error: ${res.status}`);
      const data = (await res.json()) as FinnhubQuote;
      return mapFinnhubQuote(symbol, data);
    }),
  );
  const quotes = results.flatMap((quote) => (quote ? [quote] : []));
  if (quotes.length === 0) {
    throw new Error('Finnhub returned no usable quotes.');
  }
  return quotes;
}
