import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { PaywallCard } from '@/components/paywall';
import colors from '@/constants/colors';
import { useSubscription } from '@/lib/revenuecat';

const c = colors.light;

const GREEN = '#00E676';
const CYAN = '#00F0FF';
const CRIMSON = '#E54B4B';
const GOLD = '#F5C542';

type Bot = {
  id: string;
  name: string;
  tags: string;
  risk: 'Low' | 'Medium' | 'High';
  winRate: string;
  return30d: string;
  totalTrades: number;
  proOnly: boolean;
};

const BOTS: Bot[] = [
  {
    id: 'scalp-oracle',
    name: 'Scalp Oracle AI',
    tags: 'Crypto / 5m Scalper',
    risk: 'Low',
    winRate: '78.4%',
    return30d: '+12.6%',
    totalTrades: 1842,
    proOnly: false,
  },
  {
    id: 'breakout-engine',
    name: 'Breakout Engine Pro',
    tags: 'Forex & Stocks / Momentum',
    risk: 'Medium',
    winRate: '71.2%',
    return30d: '+9.1%',
    totalTrades: 967,
    proOnly: false,
  },
  {
    id: 'grid-matrix',
    name: 'Grid Matrix AI',
    tags: 'Range Trading',
    risk: 'Low',
    winRate: '82.1%',
    return30d: '+7.4%',
    totalTrades: 2210,
    proOnly: false,
  },
  {
    id: 'quantum-inst',
    name: 'Quantum Institutional AI',
    tags: 'Multi-Asset / Order Flow',
    risk: 'High',
    winRate: '88.7%',
    return30d: '+21.3%',
    totalTrades: 3405,
    proOnly: true,
  },
];

const RISK_COLORS: Record<Bot['risk'], string> = {
  Low: GREEN,
  Medium: GOLD,
  High: CRIMSON,
};

const CAPITAL_OPTIONS = [1000, 5000, 10000, 25000] as const;
const DRAWDOWN_OPTIONS = [5, 10, 15, 20] as const;

const LOG_TEMPLATES = [
  '[SCAN] BTCUSD 5m — sweeping liquidity below 96,180…',
  '[EXEC] Limit order placed: XAUUSD BUY @ 2,411.80',
  '[RISK] Trailing stop adjusted +12p on EURUSD short',
  '[SCAN] Market structure shift detected on US30 M15',
  '[EXEC] Partial close 50% @ TP1 — GBPJPY +100p',
  '[GRID] Rebalancing grid levels: 27.20 → 27.85 (12 nodes)',
  '[RISK] Exposure check passed — 3.2% of allocated capital at risk',
  '[SCAN] Momentum spike on NAS100 — awaiting retest confirmation',
  '[EXEC] Stop moved to breakeven on ETHUSD long',
  '[NET] Latency 14ms — co-located feed stable',
];

/** Glowing green pulse dot for "System Active". */
function PulseDot({ active }: { active: boolean }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 2.2,
            duration: 1100,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 0,
            duration: 1100,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, { toValue: 0.6, duration: 0, useNativeDriver: true }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, scale, opacity]);

  const color = active ? GREEN : c.mutedForeground;
  return (
    <View style={styles.dotWrap}>
      {active && (
        <Animated.View
          style={[styles.dotPulse, { backgroundColor: color, opacity, transform: [{ scale }] }]}
        />
      )}
      <View style={[styles.dotCore, { backgroundColor: color }]} />
    </View>
  );
}

function timestamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export default function AiToolsScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const router = useRouter();
  const { isSubscribed } = useSubscription();

  const [masterActive, setMasterActive] = useState(true);
  const [runningBots, setRunningBots] = useState<Record<string, boolean>>({
    'scalp-oracle': true,
    'breakout-engine': true,
  });
  const [botConfig, setBotConfig] = useState<Record<string, { capital: number; drawdown: number }>>({
    'scalp-oracle': { capital: 10000, drawdown: 10 },
    'breakout-engine': { capital: 15000, drawdown: 15 },
  });
  const [logs, setLogs] = useState<string[]>([
    `${timestamp()} [SYS] TradiQs AutoPilot core initialized`,
    `${timestamp()} [SYS] 2 algorithms deployed — monitoring 14 markets`,
  ]);
  const [configBot, setConfigBot] = useState<Bot | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const logScrollRef = useRef<ScrollView>(null);
  const logIndexRef = useRef(0);

  const appendLog = useCallback((line: string) => {
    setLogs((cur) => [...cur.slice(-60), `${timestamp()} ${line}`]);
    requestAnimationFrame(() => logScrollRef.current?.scrollToEnd({ animated: true }));
  }, []);

  // Simulated live execution feed while the system is active.
  useEffect(() => {
    if (!masterActive) return;
    const id = setInterval(() => {
      const line = LOG_TEMPLATES[logIndexRef.current % LOG_TEMPLATES.length];
      logIndexRef.current += 1;
      appendLog(line);
    }, 2600);
    return () => clearInterval(id);
  }, [masterActive, appendLog]);

  const activeCount = masterActive
    ? Object.values(runningBots).filter(Boolean).length
    : 0;
  const capitalDeployed = useMemo(
    () =>
      masterActive
        ? Object.entries(runningBots)
            .filter(([, on]) => on)
            .reduce((sum, [id]) => sum + (botConfig[id]?.capital ?? 10000), 0)
        : 0,
    [masterActive, runningBots, botConfig],
  );

  const toggleMaster = (value: boolean) => {
    setMasterActive(value);
    appendLog(value ? '[SYS] AutoPilot resumed — all bots re-armed' : '[SYS] AutoPilot paused — halting new entries');
  };

  const toggleBot = (bot: Bot, value: boolean) => {
    setRunningBots((cur) => ({ ...cur, [bot.id]: value }));
    const cfg = botConfig[bot.id] ?? { capital: 10000, drawdown: 10 };
    appendLog(
      value
        ? `[BOT] ${bot.name} initialized with $${cfg.capital.toLocaleString()} capital allocation`
        : `[BOT] ${bot.name} stopped — open positions managed to close`,
    );
  };

  const saveConfig = (bot: Bot, capital: number, drawdown: number) => {
    setBotConfig((cur) => ({ ...cur, [bot.id]: { capital, drawdown } }));
    appendLog(
      `[CFG] ${bot.name} reconfigured — $${capital.toLocaleString()} capital, ${drawdown}% max drawdown`,
    );
    setConfigBot(null);
  };

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Screen header row */}
        <View style={styles.screenHeader}>
          <Text style={styles.screenTitle}>AI Tools</Text>
          <TouchableOpacity
            style={styles.oracleButton}
            onPress={() => router.push('/oracle')}
            activeOpacity={0.85}
            testID="ask-oracle"
          >
            <Feather name="message-circle" size={14} color="#0A0B0E" />
            <Text style={styles.oracleButtonText}>Ask AI Oracle</Text>
          </TouchableOpacity>
        </View>

        {/* AutoPilot summary card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <View style={styles.summaryTitleWrap}>
              <Text style={styles.summaryTitle}>TradiQs AutoPilot</Text>
              <View style={styles.systemRow}>
                <PulseDot active={masterActive} />
                <Text style={[styles.systemText, { color: masterActive ? GREEN : c.mutedForeground }]}>
                  {masterActive ? 'System Active' : 'System Paused'}
                </Text>
              </View>
            </View>
            <View style={styles.masterToggleWrap}>
              <Text style={[styles.masterLabel, { color: masterActive ? CYAN : c.mutedForeground }]}>
                {masterActive ? 'Active' : 'Paused'}
              </Text>
              <Switch
                value={masterActive}
                onValueChange={toggleMaster}
                trackColor={{ false: '#22252A', true: 'rgba(0,240,255,0.35)' }}
                thumbColor={masterActive ? CYAN : '#8A8D93'}
                testID="master-toggle"
              />
            </View>
          </View>

          <View style={styles.metricsGrid}>
            <View style={styles.metricCol}>
              <Text style={styles.metricLabel}>ACTIVE BOTS</Text>
              <Text style={styles.metricValue}>{activeCount} Running</Text>
            </View>
            <View style={styles.metricCol}>
              <Text style={styles.metricLabel}>CAPITAL DEPLOYED</Text>
              <Text style={styles.metricValue}>${capitalDeployed.toLocaleString()}</Text>
            </View>
            <View style={styles.metricCol}>
              <Text style={styles.metricLabel}>TODAY'S BOT P&L</Text>
              <Text style={[styles.metricValue, { color: GREEN }]}>
                {masterActive ? '+$1,420.50' : '$0.00'}
              </Text>
            </View>
          </View>
        </View>

        {/* Live console */}
        <View style={styles.console}>
          <View style={styles.consoleHeader}>
            <View style={styles.consoleTitleRow}>
              <Feather name="terminal" size={13} color={GREEN} />
              <Text style={styles.consoleTitle}>System Live Logs</Text>
            </View>
            <TouchableOpacity
              onPress={() => setLogs([])}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              testID="clear-logs"
              accessibilityLabel="Clear logs"
            >
              <Feather name="trash-2" size={13} color={c.mutedForeground} />
            </TouchableOpacity>
          </View>
          <ScrollView
            ref={logScrollRef}
            style={styles.consoleBody}
            contentContainerStyle={styles.consoleContent}
            nestedScrollEnabled
            onContentSizeChange={() => logScrollRef.current?.scrollToEnd({ animated: true })}
          >
            {logs.length === 0 ? (
              <Text style={styles.logLineMuted}>— log buffer cleared —</Text>
            ) : (
              logs.map((line, i) => (
                <Text key={`${i}-${line}`} style={styles.logLine}>
                  {line}
                </Text>
              ))
            )}
          </ScrollView>
        </View>

        {/* Bot roster */}
        <Text style={styles.sectionTitle}>Available AI Algorithms</Text>
        {BOTS.map((bot) => {
          const locked = bot.proOnly && !isSubscribed;
          const running = masterActive && !!runningBots[bot.id];
          const cfg = botConfig[bot.id] ?? { capital: 10000, drawdown: 10 };
          return (
            <View key={bot.id} style={[styles.botCard, running && styles.botCardActive]}>
              <View style={styles.botHeader}>
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={styles.botNameRow}>
                    <Text style={styles.botName}>{bot.name}</Text>
                    {bot.proOnly && (
                      <View style={styles.proOnlyBadge}>
                        <Feather name="star" size={9} color={GOLD} />
                        <Text style={styles.proOnlyText}>PRO ONLY</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.botTags}>{bot.tags}</Text>
                </View>
                {!locked && (
                  <View style={styles.botControls}>
                    <TouchableOpacity
                      onPress={() => setConfigBot(bot)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      testID={`configure-${bot.id}`}
                      accessibilityLabel={`Configure ${bot.name}`}
                    >
                      <Feather name="settings" size={16} color={c.mutedForeground} />
                    </TouchableOpacity>
                    <Switch
                      value={running}
                      disabled={!masterActive}
                      onValueChange={(v) => toggleBot(bot, v)}
                      trackColor={{ false: '#22252A', true: 'rgba(0,230,118,0.35)' }}
                      thumbColor={running ? GREEN : '#8A8D93'}
                      testID={`bot-toggle-${bot.id}`}
                    />
                  </View>
                )}
              </View>

              <View style={styles.botMetrics}>
                <View style={styles.botMetric}>
                  <Text style={styles.botMetricLabel}>WIN RATE</Text>
                  <Text style={styles.botMetricValue}>{locked ? '•••' : bot.winRate}</Text>
                </View>
                <View style={styles.botMetric}>
                  <Text style={styles.botMetricLabel}>RISK</Text>
                  <View style={[styles.riskBadge, { borderColor: RISK_COLORS[bot.risk] }]}>
                    <Text style={[styles.riskBadgeText, { color: RISK_COLORS[bot.risk] }]}>
                      {bot.risk}
                    </Text>
                  </View>
                </View>
                <View style={styles.botMetric}>
                  <Text style={styles.botMetricLabel}>30-DAY</Text>
                  <Text style={[styles.botMetricValue, { color: GREEN }]}>
                    {locked ? '•••' : bot.return30d}
                  </Text>
                </View>
                <View style={styles.botMetric}>
                  <Text style={styles.botMetricLabel}>TRADES</Text>
                  <Text style={styles.botMetricValue}>
                    {locked ? '•••' : bot.totalTrades.toLocaleString()}
                  </Text>
                </View>
              </View>

              <View style={styles.botFooter}>
                {locked ? (
                  <Text style={styles.botStatusMuted}>Institutional-grade order-flow engine</Text>
                ) : (
                  <>
                    <Text style={[styles.botStatus, { color: running ? GREEN : c.mutedForeground }]}>
                      {running ? '● RUNNING' : '○ PAUSED'}
                    </Text>
                    <Text style={styles.botAllocation}>
                      ${cfg.capital.toLocaleString()} · {cfg.drawdown}% max DD
                    </Text>
                  </>
                )}
              </View>

              {locked && (
                <View style={styles.lockOverlay}>
                  <BlurView
                    intensity={Platform.OS === 'web' ? 26 : 20}
                    tint="dark"
                    style={StyleSheet.absoluteFill}
                  />
                  <View style={styles.lockContent}>
                    <Feather name="lock" size={16} color={GOLD} />
                    <TouchableOpacity
                      style={styles.unlockButton}
                      onPress={() => setPaywallOpen(true)}
                      activeOpacity={0.85}
                      testID={`unlock-${bot.id}`}
                    >
                      <Text style={styles.unlockButtonText}>Upgrade to Unlock</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Configure settings modal */}
      <ConfigModal
        bot={configBot}
        initial={configBot ? botConfig[configBot.id] ?? { capital: 10000, drawdown: 10 } : null}
        onClose={() => setConfigBot(null)}
        onSave={saveConfig}
      />

      {/* Paywall */}
      <Modal
        visible={paywallOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPaywallOpen(false)}
      >
        <View style={styles.paywallBackdrop}>
          <View style={styles.paywallSheet}>
            <TouchableOpacity
              style={styles.paywallClose}
              onPress={() => setPaywallOpen(false)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              testID="paywall-close"
            >
              <Feather name="x" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <PaywallCard />
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ConfigModal({
  bot,
  initial,
  onClose,
  onSave,
}: {
  bot: Bot | null;
  initial: { capital: number; drawdown: number } | null;
  onClose: () => void;
  onSave: (bot: Bot, capital: number, drawdown: number) => void;
}) {
  const [capital, setCapital] = useState<number>(initial?.capital ?? 10000);
  const [drawdown, setDrawdown] = useState<number>(initial?.drawdown ?? 10);

  // Re-seed selections whenever a new bot is opened.
  useEffect(() => {
    if (bot && initial) {
      setCapital(initial.capital);
      setDrawdown(initial.drawdown);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bot?.id]);

  if (!bot) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.configBackdrop}>
        <View style={styles.configSheet}>
          <View style={styles.configHeader}>
            <Text style={styles.configTitle}>{bot.name}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} testID="config-close">
              <Feather name="x" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <Text style={styles.configLabel}>CAPITAL ALLOCATION</Text>
          <View style={styles.optionRow}>
            {CAPITAL_OPTIONS.map((v) => (
              <Pressable
                key={v}
                style={[styles.option, capital === v && styles.optionActive]}
                onPress={() => setCapital(v)}
                testID={`capital-${v}`}
              >
                <Text style={[styles.optionText, capital === v && styles.optionTextActive]}>
                  ${v.toLocaleString()}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.configLabel}>MAX BOT DRAWDOWN</Text>
          <View style={styles.optionRow}>
            {DRAWDOWN_OPTIONS.map((v) => (
              <Pressable
                key={v}
                style={[styles.option, drawdown === v && styles.optionActive]}
                onPress={() => setDrawdown(v)}
                testID={`drawdown-${v}`}
              >
                <Text style={[styles.optionText, drawdown === v && styles.optionTextActive]}>
                  {v}%
                </Text>
              </Pressable>
            ))}
          </View>

          <TouchableOpacity
            style={styles.saveButton}
            onPress={() => onSave(bot, capital, drawdown)}
            activeOpacity={0.85}
            testID="config-save"
          >
            <Text style={styles.saveButtonText}>Save Configuration</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0B0E',
  },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 12,
  },
  screenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  screenTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
  },
  oracleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: CYAN,
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  oracleButtonText: {
    color: '#0A0B0E',
    fontSize: 12.5,
    fontFamily: 'Inter_700Bold',
  },
  summaryCard: {
    backgroundColor: '#16181D',
    borderWidth: 1,
    borderColor: '#22252A',
    borderRadius: colors.radius,
    padding: 16,
    gap: 16,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryTitleWrap: {
    gap: 4,
  },
  summaryTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
  },
  systemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  systemText: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },
  dotWrap: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotPulse: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotCore: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  masterToggleWrap: {
    alignItems: 'center',
    gap: 3,
  },
  masterLabel: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  metricsGrid: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#22252A',
    paddingTop: 14,
  },
  metricCol: {
    flex: 1,
    gap: 4,
    alignItems: 'center',
  },
  metricLabel: {
    color: c.mutedForeground,
    fontSize: 8.5,
    fontFamily: 'Inter_500Medium',
    letterSpacing: 0.6,
  },
  metricValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },
  console: {
    backgroundColor: '#050608',
    borderWidth: 1,
    borderColor: '#22252A',
    borderRadius: colors.radius,
    overflow: 'hidden',
  },
  consoleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#16181D',
  },
  consoleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  consoleTitle: {
    color: c.mutedForeground,
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.5,
  },
  consoleBody: {
    height: 140,
  },
  consoleContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 3,
  },
  logLine: {
    color: 'rgba(0,230,118,0.75)',
    fontSize: 10.5,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    lineHeight: 15,
  },
  logLineMuted: {
    color: c.mutedForeground,
    fontSize: 10.5,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    marginTop: 4,
  },
  botCard: {
    backgroundColor: '#16181D',
    borderWidth: 1,
    borderColor: '#22252A',
    borderRadius: colors.radius,
    padding: 14,
    gap: 12,
    overflow: 'hidden',
  },
  botCardActive: {
    borderColor: 'rgba(0,230,118,0.35)',
  },
  botHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  botNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  botName: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
  },
  proOnlyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    borderColor: GOLD,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  proOnlyText: {
    color: GOLD,
    fontSize: 8.5,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.5,
  },
  botTags: {
    color: c.mutedForeground,
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
  },
  botControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  botMetrics: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#22252A',
    paddingTop: 10,
  },
  botMetric: {
    flex: 1,
    gap: 4,
    alignItems: 'center',
  },
  botMetricLabel: {
    color: c.mutedForeground,
    fontSize: 8.5,
    fontFamily: 'Inter_500Medium',
    letterSpacing: 0.6,
  },
  botMetricValue: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
  },
  riskBadge: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  riskBadgeText: {
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
  },
  botFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  botStatus: {
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.5,
  },
  botStatusMuted: {
    color: c.mutedForeground,
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
  },
  botAllocation: {
    color: c.mutedForeground,
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
  },
  lockOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  unlockButton: {
    backgroundColor: GOLD,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  unlockButtonText: {
    color: '#0A0B0E',
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
  },
  paywallBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  paywallSheet: {
    gap: 10,
  },
  paywallClose: {
    alignSelf: 'flex-end',
  },
  configBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  configSheet: {
    backgroundColor: '#16181D',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: '#22252A',
    padding: 20,
    paddingBottom: 34,
    gap: 12,
  },
  configHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  configTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
  configLabel: {
    color: c.mutedForeground,
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.8,
    marginTop: 6,
  },
  optionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  option: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#22252A',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#0A0B0E',
  },
  optionActive: {
    borderColor: CYAN,
    backgroundColor: 'rgba(0,240,255,0.10)',
  },
  optionText: {
    color: c.mutedForeground,
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  optionTextActive: {
    color: CYAN,
  },
  saveButton: {
    backgroundColor: CYAN,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 10,
  },
  saveButtonText: {
    color: '#0A0B0E',
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },
});
