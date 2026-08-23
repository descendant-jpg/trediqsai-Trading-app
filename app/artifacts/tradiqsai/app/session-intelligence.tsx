import React, { useEffect, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/constants/colors';
import { PaywallModal } from '@/components/PaywallModal';

const c = colors.light;

type SessionId = 'sydney' | 'tokyo' | 'london' | 'new-york';

type SessionDefinition = {
  id: SessionId;
  city: string;
  market: string;
  shortCode: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  open: number;
  close: number;
  accent: string;
  description: string;
};

type SessionState = SessionDefinition & {
  isLive: boolean;
  minutesUntilOpen: number;
  minutesUntilClose: number;
};

type KillZone = {
  name: string;
  window: string;
  open: number;
  close: number;
  color: string;
  reason: string;
};

// Forex session windows are expressed as UTC minutes. Sydney crosses midnight.
const SESSIONS: SessionDefinition[] = [
  {
    id: 'sydney',
    city: 'Sydney',
    market: 'AUD / NZD',
    shortCode: 'SYD',
    icon: 'sunrise',
    open: 22 * 60,
    close: 7 * 60,
    accent: '#FFB74D',
    description: 'Asia-Pacific open',
  },
  {
    id: 'tokyo',
    city: 'Tokyo',
    market: 'JPY / Asia',
    shortCode: 'TYO',
    icon: 'compass',
    open: 0,
    close: 9 * 60,
    accent: '#FF6B9D',
    description: 'Asian session',
  },
  {
    id: 'london',
    city: 'London',
    market: 'GBP / EUR',
    shortCode: 'LDN',
    icon: 'cloud',
    open: 8 * 60,
    close: 17 * 60,
    accent: '#8C7BFF',
    description: 'European session',
  },
  {
    id: 'new-york',
    city: 'New York',
    market: 'USD / Americas',
    shortCode: 'NYC',
    icon: 'zap',
    open: 13 * 60,
    close: 22 * 60,
    accent: '#00F0FF',
    description: 'US session',
  },
];

const KILL_ZONES: KillZone[] = [
  {
    name: 'Tokyo Open Kill Zone',
    window: '00:00 – 02:00 UTC',
    open: 0,
    close: 2 * 60,
    color: '#FF6B9D',
    reason: 'Asia-Pacific liquidity is coming online.',
  },
  {
    name: 'London Open Kill Zone',
    window: '08:00 – 10:00 UTC',
    open: 8 * 60,
    close: 10 * 60,
    color: '#8C7BFF',
    reason: 'European liquidity is entering the market.',
  },
  {
    name: 'New York Open Kill Zone',
    window: '13:00 – 15:00 UTC',
    open: 13 * 60,
    close: 15 * 60,
    color: '#00F0FF',
    reason: 'The US open is driving fresh order flow.',
  },
  {
    name: 'London Close Kill Zone',
    window: '15:00 – 17:00 UTC',
    open: 15 * 60,
    close: 17 * 60,
    color: '#B026FF',
    reason: 'London flows are rotating before the close.',
  },
];

const LIQUIDITY_LEVELS = [
  0.28, 0.22, 0.2, 0.18, 0.2, 0.25, 0.38, 0.56, 0.76, 0.7, 0.55, 0.47,
  0.7, 0.92, 0.96, 0.88, 0.72, 0.55, 0.45, 0.38, 0.32, 0.3, 0.28, 0.25,
];

function minutesSinceMidnight(date: Date) {
  return date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
}

function isWithinWindow(now: number, open: number, close: number) {
  return open < close ? now >= open && now < close : now >= open || now < close;
}

function minutesUntil(now: number, target: number) {
  return (target - now + 24 * 60) % (24 * 60);
}

function getSessionState(session: SessionDefinition, now: number): SessionState {
  const isLive = isWithinWindow(now, session.open, session.close);
  return {
    ...session,
    isLive,
    minutesUntilOpen: isLive ? 0 : minutesUntil(now, session.open),
    minutesUntilClose: isLive ? minutesUntil(now, session.close) : 0,
  };
}

function formatClock(date: Date) {
  return date.toISOString().slice(11, 19);
}

function formatCountdown(totalMinutes: number) {
  const totalSeconds = Math.max(0, Math.round(totalMinutes * 60));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

function formatUtcHour(hour: number) {
  return `${String(hour).padStart(2, '0')}:00`;
}

function getVolatility(overlapCount: number, currentHour: number, killZone: KillZone | null) {
  const liquidityBoost = LIQUIDITY_LEVELS[currentHour] * 14;
  const overlapBoost = Math.max(0, overlapCount - 1) * 13;
  const killZoneBoost = killZone ? 8 : 0;
  return Math.min(98, Math.round(34 + liquidityBoost + overlapBoost + killZoneBoost));
}

function getActiveKillZone(now: number) {
  return KILL_ZONES.find((zone) => isWithinWindow(now, zone.open, zone.close)) ?? null;
}

function VolatilityDial({ value }: { value: number }) {
  return (
    <View style={styles.dialArea}>
      <View style={styles.dialTrack}>
        <View style={[styles.dialProgress, { transform: [{ rotate: `${-45 + value * 1.8}deg` }] }]} />
        <View style={styles.dialCenter}>
          <Text style={styles.dialValue}>{value}%</Text>
          <Text style={styles.dialLabel}>VOLATILITY</Text>
        </View>
      </View>
      <View style={styles.dialScale}>
        <Text style={styles.dialScaleText}>LOW</Text>
        <Text style={styles.dialScaleText}>HIGH</Text>
      </View>
    </View>
  );
}

function SectionHeading({
  eyebrow,
  title,
  accessory,
}: {
  eyebrow: string;
  title: string;
  accessory?: React.ReactNode;
}) {
  return (
    <View style={styles.sectionHeading}>
      <View>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {accessory}
    </View>
  );
}

export default function SessionIntelligenceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [now, setNow] = useState(() => new Date());
  const [paywallOpen, setPaywallOpen] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const currentMinutes = minutesSinceMidnight(now);
  const currentHour = now.getUTCHours();
  const sessionStates = useMemo(
    () => SESSIONS.map((session) => getSessionState(session, currentMinutes)),
    [currentMinutes],
  );
  const liveSessions = sessionStates.filter((session) => session.isLive);
  const activeKillZone = getActiveKillZone(currentMinutes);
  const volatility = getVolatility(liveSessions.length, currentHour, activeKillZone);
  const nextOpening = sessionStates
    .filter((session) => !session.isLive)
    .sort((a, b) => a.minutesUntilOpen - b.minutesUntilOpen)[0];

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: Platform.OS === 'web' ? 20 : insets.top + 10 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
            accessibilityLabel="Go back"
            testID="session-intelligence-back"
          >
            <Feather name="chevron-left" size={22} color={c.foreground} />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>Session Intelligence</Text>
            <View style={styles.utcRow}>
              <View style={styles.liveDot} />
              <Text style={styles.utcText}>UTC {formatClock(now)}</Text>
            </View>
          </View>
          <View style={styles.headerIcon}>
            <Feather name="globe" size={19} color={c.primary} />
          </View>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View>
              <Text style={styles.eyebrow}>MARKET PULSE</Text>
              <Text style={styles.heroTitle}>Liquidity conditions</Text>
              <Text style={styles.heroDescription}>
                {liveSessions.length === 0
                  ? 'The market is between major sessions.'
                  : `${liveSessions.map((session) => session.city).join(' + ')} are active.`}
              </Text>
            </View>
            <View style={styles.livePill}>
              <View style={styles.livePillDot} />
              <Text style={styles.livePillText}>LIVE</Text>
            </View>
          </View>

          <View style={styles.heroMetrics}>
            <VolatilityDial value={volatility} />
            <View style={styles.metricDivider} />
            <View style={styles.heroStats}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{liveSessions.length}</Text>
                <Text style={styles.statLabel}>OVERLAPPING{'\n'}SESSIONS</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={[styles.statValue, { color: c.primary }]}>
                  {nextOpening ? formatCountdown(nextOpening.minutesUntilOpen) : '—'}
                </Text>
                <Text style={styles.statLabel}>NEXT SESSION{'\n'}OPENS</Text>
              </View>
            </View>
          </View>

          <View style={styles.liquidityHeader}>
            <Text style={styles.liquidityTitle}>24H LIQUIDITY</Text>
            <Text style={styles.liquidityNow}>CURRENT HOUR {formatUtcHour(currentHour)}</Text>
          </View>
          <View style={styles.liquidityBar} accessibilityLabel="24-hour liquidity bar">
            {LIQUIDITY_LEVELS.map((level, hour) => (
              <View
                key={hour}
                style={[
                  styles.liquidityBlock,
                  { opacity: 0.32 + level * 0.7 },
                  hour === currentHour && styles.liquidityBlockCurrent,
                ]}
              />
            ))}
          </View>
          <View style={styles.hourLabels}>
            <Text style={styles.hourLabel}>00:00</Text>
            <Text style={styles.hourLabel}>06:00</Text>
            <Text style={styles.hourLabel}>12:00</Text>
            <Text style={styles.hourLabel}>18:00</Text>
            <Text style={styles.hourLabel}>24:00</Text>
          </View>
        </View>

        <View style={[styles.killZoneCard, activeKillZone ? styles.killZoneActive : styles.killZoneQuiet]}>
          <View
            style={[
              styles.killZoneIcon,
              { backgroundColor: activeKillZone ? `${activeKillZone.color}1A` : 'rgba(138,141,147,0.12)' },
            ]}
          >
            <Feather
              name={activeKillZone ? 'target' : 'clock'}
              size={20}
              color={activeKillZone?.color ?? c.mutedForeground}
            />
          </View>
          <View style={styles.killZoneBody}>
            <View style={styles.killZoneHeading}>
              <Text style={styles.eyebrow}>KILL ZONE</Text>
              <View style={[styles.statusTag, activeKillZone ? styles.activeTag : styles.quietTag]}>
                <Text style={[styles.statusTagText, { color: activeKillZone?.color ?? c.mutedForeground }]}>
                  {activeKillZone ? 'ACTIVE NOW' : 'NONE ACTIVE'}
                </Text>
              </View>
            </View>
            <Text style={styles.killZoneTitle}>
              {activeKillZone?.name ?? 'Waiting for the next window'}
            </Text>
            <Text style={styles.killZoneDescription}>
              {activeKillZone?.reason ??
                (nextOpening
                  ? `${nextOpening.city} opens in ${formatCountdown(nextOpening.minutesUntilOpen)}.`
                  : 'All major session windows have closed.')}
            </Text>
          </View>
        </View>

        <SectionHeading
          eyebrow="GLOBAL MARKETS"
          title="Session status"
          accessory={
            <View style={styles.openCount}>
              <Text style={styles.openCountValue}>{liveSessions.length}</Text>
              <Text style={styles.openCountLabel}>OPEN</Text>
            </View>
          }
        />

        <View style={styles.sessionList}>
          {sessionStates.map((session) => (
            <View key={session.id} style={styles.sessionCard}>
              <View style={[styles.sessionIcon, { backgroundColor: `${session.accent}18` }]}>
                <Feather name={session.icon} size={19} color={session.accent} />
              </View>
              <View style={styles.sessionInfo}>
                <View style={styles.sessionNameRow}>
                  <Text style={styles.sessionName}>{session.city}</Text>
                  <View
                    style={[
                      styles.sessionTag,
                      session.isLive ? styles.sessionLiveTag : styles.sessionUpcomingTag,
                    ]}
                  >
                    {session.isLive && <View style={styles.sessionLiveDot} />}
                    <Text
                      style={[
                        styles.sessionTagText,
                        { color: session.isLive ? c.success : c.mutedForeground },
                      ]}
                    >
                      {session.isLive ? 'LIVE' : 'UPCOMING'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.sessionMarket}>{session.market} · {session.description}</Text>
                <Text style={styles.sessionHours}>
                  {formatUtcHour(session.open / 60)} – {formatUtcHour(session.close / 60)} UTC
                </Text>
              </View>
              <View style={styles.sessionAction}>
                <Text style={styles.sessionCountdown}>
                  {session.isLive
                    ? `${formatCountdown(session.minutesUntilClose)} left`
                    : `Opens in ${formatCountdown(session.minutesUntilOpen)}`}
                </Text>
                <TouchableOpacity
                  style={[styles.tradeButton, !session.isLive && styles.tradeButtonMuted]}
                  onPress={() =>
                    router.push({
                      pathname: '/session-details',
                      params: { sessionName: session.city },
                    } as never)
                  }
                  activeOpacity={0.82}
                  accessibilityLabel={`Trade active ${session.city} session`}
                  testID={`trade-active-${session.id}`}
                >
                  <Text style={[styles.tradeButtonText, !session.isLive && styles.tradeButtonTextMuted]}>
                    Trade Active Session
                  </Text>
                  <Feather
                    name="arrow-up-right"
                    size={13}
                    color={session.isLive ? c.background : c.primary}
                  />
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>

        <Pressable
          style={styles.proCard}
          onPress={() => setPaywallOpen(true)}
          accessibilityLabel="Unlock Pro session strategy"
          testID="session-pro-strategy"
        >
          <View style={styles.proLock}>
            <Feather name="lock" size={18} color={c.secondary} />
          </View>
          <View style={styles.proBody}>
            <View style={styles.proTitleRow}>
              <Text style={styles.proEyebrow}>PRO STRATEGY</Text>
              <View style={styles.proBadge}>
                <Text style={styles.proBadgeText}>PRO</Text>
              </View>
            </View>
            <Text style={styles.proTitle}>Get the session edge</Text>
            <Text style={styles.proDescription}>
              Unlock precision entry windows, session bias, and institutional playbooks.
            </Text>
          </View>
          <Feather name="chevron-right" size={19} color={c.secondary} />
        </Pressable>

        <Text style={styles.disclaimer}>
          Session times are calculated from your device clock in UTC. TradiQs AI provides simulated
          trading tools and educational content only — not financial advice.
        </Text>
      </ScrollView>

      <PaywallModal visible={paywallOpen} onClose={() => setPaywallOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 34,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 22,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
  },
  headerTitleWrap: {
    alignItems: 'center',
    gap: 4,
  },
  headerTitle: {
    color: c.foreground,
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
  },
  utcRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: c.success,
  },
  utcText: {
    color: c.success,
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,240,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0,240,255,0.25)',
  },
  heroCard: {
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: colors.radius,
    padding: 16,
    marginBottom: 12,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  eyebrow: {
    color: c.mutedForeground,
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1.25,
  },
  heroTitle: {
    color: c.foreground,
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    marginTop: 5,
  },
  heroDescription: {
    color: c.mutedForeground,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 4,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(46,202,139,0.1)',
  },
  livePillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: c.success,
  },
  livePillText: {
    color: c.success,
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.8,
  },
  heroMetrics: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    minHeight: 120,
  },
  dialArea: {
    width: 140,
  },
  dialTrack: {
    width: 116,
    height: 78,
    alignSelf: 'center',
    borderTopWidth: 10,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderColor: '#292D34',
    borderTopLeftRadius: 70,
    borderTopRightRadius: 70,
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  dialProgress: {
    position: 'absolute',
    width: 116,
    height: 116,
    left: -10,
    top: -10,
    borderRadius: 60,
    borderWidth: 10,
    borderColor: c.primary,
    borderBottomColor: 'transparent',
    borderLeftColor: 'transparent',
  },
  dialCenter: {
    alignItems: 'center',
    paddingBottom: 2,
  },
  dialValue: {
    color: c.foreground,
    fontSize: 25,
    fontFamily: 'Inter_700Bold',
  },
  dialLabel: {
    color: c.mutedForeground,
    fontSize: 8,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.8,
    marginTop: 1,
  },
  dialScale: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    marginTop: 4,
  },
  dialScaleText: {
    color: c.mutedForeground,
    fontSize: 8,
    fontFamily: 'Inter_600SemiBold',
  },
  metricDivider: {
    width: 1,
    height: 75,
    backgroundColor: c.border,
    marginHorizontal: 4,
  },
  heroStats: {
    flex: 1,
    gap: 17,
    paddingLeft: 16,
  },
  statItem: {
    gap: 2,
  },
  statValue: {
    color: c.foreground,
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
  },
  statLabel: {
    color: c.mutedForeground,
    fontSize: 9,
    lineHeight: 12,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.8,
  },
  liquidityHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 13,
  },
  liquidityTitle: {
    color: c.mutedForeground,
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1,
  },
  liquidityNow: {
    color: c.primary,
    fontSize: 9,
    fontFamily: 'Inter_600SemiBold',
  },
  liquidityBar: {
    height: 25,
    flexDirection: 'row',
    gap: 2,
    alignItems: 'flex-end',
    marginTop: 8,
  },
  liquidityBlock: {
    flex: 1,
    minWidth: 3,
    height: 17,
    borderRadius: 2,
    backgroundColor: c.primary,
  },
  liquidityBlockCurrent: {
    height: 25,
    backgroundColor: c.foreground,
    borderWidth: 1,
    borderColor: c.primary,
  },
  hourLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 5,
  },
  hourLabel: {
    color: c.mutedForeground,
    fontSize: 8,
    fontFamily: 'Inter_500Medium',
  },
  killZoneCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: colors.radius,
    padding: 14,
    marginBottom: 24,
    borderWidth: 1,
  },
  killZoneActive: {
    backgroundColor: 'rgba(176,38,255,0.08)',
    borderColor: 'rgba(176,38,255,0.32)',
  },
  killZoneQuiet: {
    backgroundColor: c.card,
    borderColor: c.border,
  },
  killZoneIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  killZoneBody: {
    flex: 1,
  },
  killZoneHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusTag: {
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  activeTag: {
    backgroundColor: 'rgba(176,38,255,0.14)',
  },
  quietTag: {
    backgroundColor: 'rgba(138,141,147,0.1)',
  },
  statusTagText: {
    fontSize: 8,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.5,
  },
  killZoneTitle: {
    color: c.foreground,
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    marginTop: 5,
  },
  killZoneDescription: {
    color: c.mutedForeground,
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    lineHeight: 16,
    marginTop: 3,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    color: c.foreground,
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    marginTop: 4,
  },
  openCount: {
    alignItems: 'flex-end',
  },
  openCountValue: {
    color: c.success,
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
  openCountLabel: {
    color: c.mutedForeground,
    fontSize: 8,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.8,
  },
  sessionList: {
    gap: 8,
  },
  sessionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: 14,
    padding: 12,
  },
  sessionIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  sessionInfo: {
    flex: 1,
    minWidth: 0,
  },
  sessionNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  sessionName: {
    color: c.foreground,
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },
  sessionTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 3,
  },
  sessionLiveTag: {
    backgroundColor: 'rgba(46,202,139,0.1)',
  },
  sessionUpcomingTag: {
    backgroundColor: 'rgba(138,141,147,0.1)',
  },
  sessionLiveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: c.success,
  },
  sessionTagText: {
    fontSize: 8,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.5,
  },
  sessionMarket: {
    color: c.mutedForeground,
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    marginTop: 4,
  },
  sessionHours: {
    color: '#62666D',
    fontSize: 9,
    fontFamily: 'Inter_500Medium',
    marginTop: 3,
  },
  sessionAction: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  sessionCountdown: {
    color: c.mutedForeground,
    fontSize: 9,
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 6,
  },
  tradeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: c.primary,
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  tradeButtonMuted: {
    backgroundColor: 'rgba(0,240,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0,240,255,0.24)',
  },
  tradeButtonText: {
    color: c.background,
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
  },
  tradeButtonTextMuted: {
    color: c.primary,
  },
  proCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(176,38,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(176,38,255,0.3)',
    borderRadius: colors.radius,
    padding: 14,
    marginTop: 20,
  },
  proLock: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(176,38,255,0.14)',
    marginRight: 11,
  },
  proBody: {
    flex: 1,
  },
  proTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  proEyebrow: {
    color: c.secondary,
    fontSize: 9,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1,
  },
  proBadge: {
    backgroundColor: c.secondary,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  proBadgeText: {
    color: c.foreground,
    fontSize: 8,
    fontFamily: 'Inter_700Bold',
  },
  proTitle: {
    color: c.foreground,
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    marginTop: 5,
  },
  proDescription: {
    color: c.mutedForeground,
    fontSize: 10,
    lineHeight: 15,
    fontFamily: 'Inter_400Regular',
    marginTop: 3,
  },
  disclaimer: {
    color: '#62666D',
    fontSize: 9,
    lineHeight: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    marginTop: 20,
    paddingHorizontal: 10,
  },
});