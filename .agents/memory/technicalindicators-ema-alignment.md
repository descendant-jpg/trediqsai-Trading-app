---
name: technicalindicators EMA output alignment
description: EMA.calculate outputs are offset by period-1, so arrays from different periods have different lengths and indices — comparing them 1:1 misaligns by (slow-fast) bars and yields NaN past the shorter array.
---

`EMA.calculate({ period, values })` returns `values.length - (period - 1)` numbers, where output index `i` describes close-bar `i + period - 1`. Two EMA series of different periods therefore have different lengths, and `fast[i] - slow[i]` compares bars `(i + FAST - 1)` vs `(i + SLOW - 1)` — a 30-bar misalignment for EMA20/EMA50 — and goes NaN once `i` exceeds the shorter array.

**Why:** A crossover detector written the naive way silently compared bars 30 apart; the resulting NaN gap made every "recent cross" check fail or fire on phantom crosses in flat regions. Only caught by numerically printing the gap series.

**How to apply:** When comparing indicator outputs of different periods (EMA cross, MACD-style spreads), align by close-bar: fast index `i` pairs with slow index `i - (SLOW_PERIOD - FAST_PERIOD)`. The *last* element of each output always describes the same final bar, so `last()` comparisons are safe without shifting. Validate synthetic test fixtures numerically (run the real indicator math in a scratch script) instead of hand-tuning candle shapes.
