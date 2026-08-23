import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import colors from '@/constants/colors';

const c = colors.light;

/** Next Monday 00:00 UTC — when the weekly sweepstakes resets. */
function nextWeeklyReset(from: Date): Date {
  const d = new Date(from);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay(); // 0 Sun .. 6 Sat
  const daysUntilMonday = ((8 - day) % 7) || 7;
  d.setUTCDate(d.getUTCDate() + daysUntilMonday);
  return d;
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return 'Resetting…';
  const totalHours = Math.floor(ms / 3_600_000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days > 0) return `Ends in ${days}d ${hours}h`;
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return `Ends in ${hours}h ${minutes}m`;
}

/**
 * Weekly Sweepstakes prize pool banner — Electric Cyan bordered card with
 * a live countdown to the next weekly reset (updates every minute).
 */
export function PrizePoolBanner() {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const remaining = nextWeeklyReset(new Date(now)).getTime() - now;

  return (
    <View style={styles.banner} testID="prize-pool-banner">
      <Text style={styles.label}>Weekly Cash Prize Pool</Text>
      <Text style={styles.amount}>$5,000.00</Text>
      <Text style={styles.countdown}>{formatRemaining(remaining)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#16181D',
    borderWidth: 1,
    borderColor: '#00F0FF',
    borderRadius: colors.radius,
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    shadowColor: '#00F0FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 8,
  },
  label: {
    color: '#8A8D93',
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  amount: {
    color: '#00F0FF',
    fontSize: 40,
    fontFamily: 'Inter_700Bold',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  countdown: {
    color: c.foreground,
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    marginTop: 4,
    opacity: 0.8,
  },
});
