const quotes = [
  ['XAU/USD', '2,420.50', true],
  ['BTC/USD', '64,230.00', true],
  ['EUR/USD', '1.0945', false],
  ['NVDA', '128.40', true],
  ['ETH/USD', '3,482.10', true],
  ['GBP/USD', '1.2784', false],
] as const;

function QuoteRow({ ariaHidden = false }: { ariaHidden?: boolean }) {
  return (
    <div aria-hidden={ariaHidden} className="flex shrink-0 items-center gap-8 pr-8">
      {quotes.map(([symbol, price, isUp]) => (
        <span className="whitespace-nowrap text-xs font-semibold tracking-wide text-gray-300" key={symbol}>
          <span className="mr-2 text-white">{symbol}</span>
          <span>{price}</span>{' '}
          <span className={isUp ? 'text-green-400' : 'text-red-400'}>
            {isUp ? '▲' : '▼'}
          </span>
        </span>
      ))}
    </div>
  );
}

export default function MarketTicker() {
  return (
    <section aria-label="Live market prices" className="overflow-hidden border-y border-gray-800 bg-black py-2">
      <div className="flex w-max animate-[ticker_28s_linear_infinite]">
        <QuoteRow />
        <QuoteRow />
        <QuoteRow ariaHidden />
      </div>
    </section>
  );
}