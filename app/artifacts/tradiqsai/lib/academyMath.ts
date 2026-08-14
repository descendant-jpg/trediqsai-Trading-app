export const parseCompletedLessons = (raw: string | null): string[] => {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')
      ? [...new Set(parsed)]
      : [];
  } catch {
    return [];
  }
};

export const calculateLotSize = (balance: number, riskPercent: number, stopLossPips: number) => {
  if (![balance, riskPercent, stopLossPips].every(Number.isFinite) || balance <= 0 || riskPercent <= 0 || stopLossPips <= 0) return null;
  const riskAmount = balance * riskPercent / 100;
  return { riskAmount, lots: riskAmount / (stopLossPips * 10) };
};

export const calculateExpectancy = (winRatePercent: number, rewardRisk: number) => {
  if (![winRatePercent, rewardRisk].every(Number.isFinite) || winRatePercent < 0 || winRatePercent > 100 || rewardRisk <= 0) return null;
  const winRate = winRatePercent / 100;
  return (winRate * rewardRisk) - (1 - winRate);
};

export const calculatePricePnL = (entry: number, takeProfit: number, stopLoss: number, lots: number) => {
  if (![entry, takeProfit, stopLoss, lots].every(Number.isFinite) || lots <= 0 || entry <= 0 || takeProfit <= 0 || stopLoss <= 0) return null;
  const units = lots * 100000;
  const profit = Math.abs(takeProfit - entry) * units;
  const loss = Math.abs(entry - stopLoss) * units;
  return { profit, loss, rewardRisk: loss > 0 ? profit / loss : null };
};

export const calculateMargin = (tradeSize: number, leverage: number) => {
  if (![tradeSize, leverage].every(Number.isFinite) || tradeSize <= 0 || leverage <= 0) return null;
  return tradeSize / leverage;
};