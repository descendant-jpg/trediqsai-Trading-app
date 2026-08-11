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
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetAutopilotQueryKey,
  getGetAutopilotHistoryQueryKey,
  useClearAutopilotLogs,
  useGetAutopilot,
  useGetAutopilotHistory,
  useSetAutopilotMaster,
  useUpdateAutopilotBot,
  type AutopilotBot,
  type AutopilotState,
} from '@workspace/api-client-react';
import { PaywallModal } from '@/components/PaywallModal';
import colors from '@/constants/colors';
import { legacyOracleRedirectTarget } from '@/lib/legacyOracleRedirect';
import { useSubscription } from '@/lib/revenuecat';

const c = colors.light;

/**
 * True when the API rejected a request because the feature needs a paid
 * subscription. Matches the server's 403 + `pro_subscription_required`
 * contract without depending on the generated error class.
 */
function isProRequiredError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { status, data } = error as { status?: number; data?: unknown };
  if (status !== 403) return false;
  const code =
    data && typeof data === 'object'
      ? (data as { code?: unknown }).code
      : undefined;
  // Fall back to the status alone if the body was not parsed as expected.
  return code === undefined || code === 'pro_subscription_required';
}

const GREEN = '#00E676';
const CYAN = '#00F0FF';
const CRIMSON = '#E54B4B';
const GOLD = '#F5C542';

type Bot = AutopilotBot;
const RISK_COLORS: Record<Bot['risk'], string> = {
  Low: GREEN,
  Medium: GOLD,
  High: CRIMSON,
};

const CAPITAL_OPTIONS = [1000, 5000, 10000, 25000] as const;
const DRAWDOWN_OPTIONS = [5, 10, 15, 20] as const;
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

function formatPnl(value: number): string {
  const abs = Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${value < 0 ? '-' : '+'}$${abs}`;
}

const HISTORY_DAYS_SHOWN = 7;

type ToolTier = 'STARTER' | 'PRO' | 'ELITE';
type Tool = {
  name: string;
  description: string;
  tier: ToolTier;
  icon: React.ComponentProps<typeof Feather>['name'];
  kind?: 'code' | 'correlation' | 'heatmap' | 'risk';
  wide?: boolean;
};
const TIER_LEVEL: Record<ToolTier, number> = { STARTER: 1, PRO: 2, ELITE: 3 };
const TOOLS: Tool[] = [
  { name: 'AI Signal Generator', description: 'Upload chart, get instant BUY/SELL signal with TP & SL', tier: 'PRO', icon: 'trending-up' },
  { name: 'AutoPilot Bots', description: 'Cloud-hosted GRID & DCA bots that trade for you 24/7', tier: 'ELITE', icon: 'cpu' },
  { name: 'AI Chart Analysis', description: 'Upload trading charts for AI-powered analysis', tier: 'PRO', icon: 'bar-chart-2' },
  { name: 'AI News Analyser', description: 'Analyse forex news & economic events with AI', tier: 'PRO', icon: 'globe' },
  { name: 'Psychology Coach', description: 'Stop revenge trading and emotional losses forever', tier: 'ELITE', icon: 'heart' },
  { name: 'Market Radar', description: 'Top forex, crypto, stock & commodity news — highest impact', tier: 'PRO', icon: 'radio' },
  { name: 'Liquidity Scanner', description: 'Detect institutional stop-hunts & Fair Value Gaps', tier: 'ELITE', icon: 'crosshair' },
  { name: 'Correlation Finder', description: 'Discover how currency pairs move together', tier: 'STARTER', icon: 'link-2', kind: 'correlation' },
  { name: 'Currency Heatmap', description: 'Cross pair pressure map with directional bias', tier: 'PRO', icon: 'grid', kind: 'heatmap' },
  { name: 'Broker Comparison', description: 'Find the best broker for your trading style', tier: 'STARTER', icon: 'briefcase' },
  { name: 'Code Lab', description: 'AI-powered Indicator Builder + Robot Builder (EA)', tier: 'ELITE', icon: 'code', kind: 'code' },
  { name: 'Account Tracker', description: 'Connect MT4/MT5 and get AI trading insights', tier: 'PRO', icon: 'activity', wide: true },
  { name: 'Risk Calculator', description: 'Calculate exact lot size based on SL pips', tier: 'STARTER', icon: 'target', kind: 'risk', wide: true },
];

function TierBadge({ tier }: { tier: ToolTier }) {
  const color = tier === 'STARTER' ? GREEN : tier === 'PRO' ? CYAN : GOLD;
  return <View style={[styles.tierBadge, { borderColor: color }]}><Text style={[styles.tierText, { color }]}>{tier}</Text></View>;
}

function ToolModal({ tool, onClose }: { tool: Tool; onClose: () => void }) {
  const [prompt, setPrompt] = useState('');
  const [balance, setBalance] = useState('10000');
  const [risk, setRisk] = useState('1');
  const [stopLoss, setStopLoss] = useState('40');
  const lotSize = ((Number(balance) || 0) * ((Number(risk) || 0) / 100) / ((Number(stopLoss) || 1) * 10)).toFixed(2);
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.toolBackdrop}><View style={styles.toolSheet}>
        <View style={styles.configHeader}><View><Text style={styles.configTitle}>{tool.name}</Text><TierBadge tier={tool.tier} /></View><TouchableOpacity onPress={onClose}><Feather name="x" size={20} color="#FFF" /></TouchableOpacity></View>
        {tool.kind === 'code' && <><Text style={styles.modalHint}>Describe your indicator/bot...</Text><TextInput value={prompt} onChangeText={setPrompt} placeholder="Describe your indicator/bot..." placeholderTextColor={c.mutedForeground} style={styles.modalInput} multiline /><Text style={styles.modalLabel}>CODE OUTPUT</Text><View style={styles.codeOutput}><Text style={styles.codeText}>{prompt ? `// Generated MQL5 blueprint\n// ${prompt}\nint OnInit() { return(INIT_SUCCEEDED); }` : '// Your MQL5 code will appear here.'}</Text></View><TouchableOpacity style={styles.modalPrimary}><Text style={styles.modalPrimaryText}>Copy MQL5 Code</Text></TouchableOpacity></>}
        {tool.kind === 'correlation' && <><Text style={styles.modalHint}>Live pair relationship matrix</Text>{[['EURUSD', 'USDCHF', '-0.92'], ['GBPUSD', 'EURUSD', '0.84'], ['AUDUSD', 'USDCAD', '-0.71'], ['USDJPY', 'XAUUSD', '-0.63']].map(([a, b, value]) => <View style={styles.tableRow} key={`${a}-${b}`}><Text style={styles.tableCell}>{a}</Text><Text style={styles.tableCell}>vs {b}</Text><Text style={[styles.tableValue, { color: value.startsWith('-') ? CRIMSON : GREEN }]}>{value}</Text></View>)}</>}
        {tool.kind === 'heatmap' && <><Text style={styles.modalHint}>Currency strength · 24 hour change</Text><View style={styles.heatGrid}>{[['USD', '+2.4%', GREEN], ['EUR', '+0.8%', GREEN], ['GBP', '-0.4%', CRIMSON], ['JPY', '-1.8%', CRIMSON], ['AUD', '+1.1%', GREEN], ['CAD', '-0.7%', CRIMSON], ['CHF', '+0.2%', GREEN], ['NZD', '-1.2%', CRIMSON]].map(([name, value, color]) => <View style={[styles.heatCell, { borderColor: color as string }]} key={name as string}><Text style={styles.heatName}>{name}</Text><Text style={[styles.heatValue, { color: color as string }]}>{value}</Text></View>)}</View></>}
        {tool.kind === 'risk' && <><Text style={styles.modalHint}>Position size calculator</Text><Text style={styles.modalLabel}>BALANCE ($)</Text><TextInput value={balance} onChangeText={setBalance} keyboardType="decimal-pad" style={styles.modalInput} /><Text style={styles.modalLabel}>RISK (%)</Text><TextInput value={risk} onChangeText={setRisk} keyboardType="decimal-pad" style={styles.modalInput} /><Text style={styles.modalLabel}>STOP LOSS (PIPS)</Text><TextInput value={stopLoss} onChangeText={setStopLoss} keyboardType="decimal-pad" style={styles.modalInput} /><View style={styles.lotResult}><Text style={styles.modalHint}>EXACT LOT SIZE</Text><Text style={styles.lotValue}>{lotSize} Lots</Text></View></>}
      </View></View>
    </Modal>
  );
}

/** "2026-08-04" → "Mon, Aug 4" (parsed as local time). */
function formatHistoryDay(isoDay: string): string {
  const [y, m, d] = isoDay.split('-').map(Number);
  if (!y || !m || !d) return isoDay;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/** Per-day AutoPilot P&L history: rows with proportional bars. */
function PnlHistorySection({ days }: { days: { day: string; pnl: number }[] }) {
  const shown = days.slice(0, HISTORY_DAYS_SHOWN);
  const maxAbs = Math.max(...shown.map((d) => Math.abs(d.pnl)), 1);
  return (
    <View style={styles.historyCard} testID="pnl-history">
      <View style={styles.consoleTitleRow}>
        <Feather name="bar-chart-2" size={13} color={CYAN} />
        <Text style={styles.consoleTitle}>Daily P&L History</Text>
      </View>
      {shown.length === 0 ? (
        <Text style={styles.logLineMuted}>
          No finished days yet — history appears after the first full day of trading.
        </Text>
      ) : (
        shown.map((entry) => {
          const negative = entry.pnl < 0;
          const width = `${Math.max((Math.abs(entry.pnl) / maxAbs) * 100, 3)}%` as const;
          return (
            <View key={entry.day} style={styles.historyRow} testID={`pnl-history-${entry.day}`}>
              <Text style={styles.historyDay}>{formatHistoryDay(entry.day)}</Text>
              <View style={styles.historyBarTrack}>
                <View
                  style={[
                    styles.historyBar,
                    { width, backgroundColor: negative ? CRIMSON : GREEN },
                  ]}
                />
              </View>
              <Text style={[styles.historyPnl, { color: negative ? CRIMSON : GREEN }]}>
                {formatPnl(entry.pnl)}
              </Text>
            </View>
          );
        })
      )}
    </View>
  );
}
export default function AiToolsScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const router = useRouter();
  const params = useLocalSearchParams();
  const { isSubscribed } = useSubscription();
  const queryClient = useQueryClient();

  // Legacy deep-link mapping: the Oracle chat used to live on this tab.
  // Old targets like `/(tabs)/ai-tools?chat=1` (or `?view=chat`,
  // `?screen=oracle`) should still land on the chat at `/oracle`.
  const legacyTarget = legacyOracleRedirectTarget(params);
  useEffect(() => {
    if (legacyTarget) router.replace(legacyTarget);
  }, [legacyTarget, router]);

  const {
    data: autopilot,
    isLoading,
    isError,
    refetch,
  } = useGetAutopilot({
    query: { queryKey: getGetAutopilotQueryKey(), refetchInterval: 2600 },
  });

  const applyState = useCallback(
    (next: AutopilotState) => {
      queryClient.setQueryData(getGetAutopilotQueryKey(), next);
    },
    [queryClient],
  );

  const { data: history } = useGetAutopilotHistory({
    query: {
      queryKey: getGetAutopilotHistoryQueryKey(),
      // Rollovers happen at most daily; refresh occasionally in case the
      // screen stays open across midnight.
      refetchInterval: 60_000,
    },
  });

  const { mutate: setMaster } = useSetAutopilotMaster({
    mutation: { onSuccess: applyState },
  });
  // The server is the authority on Pro access: it rejects Pro-only bot
  // changes from non-subscribers with 403. Surface that as the paywall so a
  // blocked deploy explains itself instead of silently doing nothing.
  const { mutate: updateBot } = useUpdateAutopilotBot({
    mutation: {
      onSuccess: applyState,
      onError: (error: unknown) => {
        if (isProRequiredError(error)) {
          setConfigBot(null);
          setPaywallOpen(true);
        }
        // Re-sync so an optimistic-looking UI never keeps a rejected change.
        void refetch();
      },
    },
  });
  const { mutate: clearLogs } = useClearAutopilotLogs({
    mutation: { onSuccess: applyState },
  });

  const [configBot, setConfigBot] = useState<Bot | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<Tool | null>(null);
  const logScrollRef = useRef<ScrollView>(null);

  const masterActive = autopilot?.masterActive ?? false;
  const bots = autopilot?.bots ?? [];
  const logs = autopilot?.logs ?? [];
  const todayPnl = autopilot?.todayPnl ?? 0;

  const activeCount = masterActive ? bots.filter((b) => b.running).length : 0;
  const capitalDeployed = useMemo(
    () =>
      masterActive
        ? bots.filter((b) => b.running).reduce((sum, b) => sum + b.capital, 0)
        : 0,
    [masterActive, bots],
  );

  const toggleMaster = (value: boolean) => {
    setMaster({ data: { active: value } });
  };

  const toggleBot = (bot: Bot, value: boolean) => {
    updateBot({ botId: bot.id, data: { running: value } });
  };

  const saveConfig = (bot: Bot, capital: number, drawdown: number) => {
    updateBot({ botId: bot.id, data: { capital, drawdown } });
    setConfigBot(null);
  };

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Screen header row */}
        <View style={styles.screenHeader}>
           <Text style={styles.screenTitle}>TradiQsAI Tools</Text>
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
              <Text style={[styles.metricValue, { color: todayPnl < 0 ? CRIMSON : GREEN }]}>
                {formatPnl(todayPnl)}
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
              onPress={() => clearLogs()}
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
              logs.map((line) => (
                <Text key={line.id} style={styles.logLine}>
                  {line.time} {line.text}
                </Text>
              ))
            )}
          </ScrollView>
        </View>

        {/* Daily P&L history */}
        <PnlHistorySection days={history?.days ?? []} />

        <Text style={styles.sectionTitle}>HERO TOOLS</Text>
        <View style={styles.heroGrid}>
          {TOOLS.slice(0, 2).map((tool) => <ToolCard key={tool.name} tool={tool} subscribed={isSubscribed} onOpen={setActiveTool} onPaywall={() => setPaywallOpen(true)} hero />)}
        </View>
        <Text style={styles.sectionTitle}>AI ANALYSIS</Text>
        <View style={styles.toolGrid}>
          {TOOLS.slice(2, 7).map((tool) => <ToolCard key={tool.name} tool={tool} subscribed={isSubscribed} onOpen={setActiveTool} onPaywall={() => setPaywallOpen(true)} />)}
        </View>
        <Text style={styles.sectionTitle}>TOOLS & UTILITIES</Text>
        <View style={styles.toolGrid}>
          {TOOLS.slice(7).map((tool) => <ToolCard key={tool.name} tool={tool} subscribed={isSubscribed} onOpen={setActiveTool} onPaywall={() => setPaywallOpen(true)} />)}
        </View>

        {/* Bot roster */}
        <Text style={styles.sectionTitle}>Available AI Algorithms</Text>
        {isLoading && (
          <Text style={styles.logLineMuted}>Loading AutoPilot state…</Text>
        )}
        {isError && (
          <TouchableOpacity onPress={() => refetch()} testID="autopilot-retry">
            <Text style={styles.logLineMuted}>
              Couldn't reach the AutoPilot server — tap to retry.
            </Text>
          </TouchableOpacity>
        )}
        {bots.map((bot) => {
          const locked = bot.proOnly && !isSubscribed;
          const running = masterActive && bot.running;
          const cfg = { capital: bot.capital, drawdown: bot.drawdown };
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
        initial={configBot ? { capital: configBot.capital, drawdown: configBot.drawdown } : null}
        onClose={() => setConfigBot(null)}
        onSave={saveConfig}
      />
      {activeTool && <ToolModal tool={activeTool} onClose={() => setActiveTool(null)} />}

      {/* Paywall */}
      <PaywallModal visible={paywallOpen} onClose={() => setPaywallOpen(false)} />
    </View>
  );
}

function ToolCard({ tool, subscribed, onOpen, onPaywall, hero = false }: { tool: Tool; subscribed: boolean; onOpen: (tool: Tool) => void; onPaywall: () => void; hero?: boolean }) {
  const locked = tool.tier !== 'STARTER' && !subscribed;
  return <TouchableOpacity style={[styles.toolCard, hero && styles.heroCard, tool.wide && styles.wideCard]} activeOpacity={0.78} onPress={() => locked ? onPaywall() : onOpen(tool)} accessibilityRole="button" accessibilityLabel={`${tool.name}${locked ? ', locked' : ''}`}>
    <View style={styles.toolIcon}><Feather name={tool.icon} size={hero ? 21 : 17} color={tool.tier === 'ELITE' ? GOLD : CYAN} /></View>
    <View style={styles.toolCopy}><View style={styles.toolTitleRow}><Text style={styles.toolName}>{tool.name}</Text>{locked && <Feather name="lock" size={12} color={GOLD} />}</View><Text style={styles.toolDescription}>{tool.description}</Text></View>
    <TierBadge tier={tool.tier} />
  </TouchableOpacity>;
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
  historyCard: {
    backgroundColor: '#16181D',
    borderWidth: 1,
    borderColor: '#22252A',
    borderRadius: colors.radius,
    padding: 14,
    gap: 10,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  historyDay: {
    color: c.mutedForeground,
    fontSize: 11.5,
    fontFamily: 'Inter_500Medium',
    width: 88,
  },
  historyBarTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22252A',
    overflow: 'hidden',
  },
  historyBar: {
    height: '100%',
    borderRadius: 3,
  },
  historyPnl: {
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    minWidth: 78,
    textAlign: 'right',
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
  heroGrid: { gap: 10 },
  toolGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  toolCard: { width: '47.8%', minHeight: 142, backgroundColor: '#16181D', borderWidth: 1, borderColor: '#22252A', borderRadius: colors.radius, padding: 13, gap: 10 },
  heroCard: { width: '100%', minHeight: 112, flexDirection: 'row', alignItems: 'center' },
  wideCard: { width: '100%', minHeight: 92, flexDirection: 'row', alignItems: 'center' },
  toolIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: 'rgba(0,240,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  toolCopy: { flex: 1, gap: 5 },
  toolTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  toolName: { color: '#FFF', fontSize: 13, fontFamily: 'Inter_700Bold', flexShrink: 1 },
  toolDescription: { color: c.mutedForeground, fontSize: 10.5, lineHeight: 15, fontFamily: 'Inter_500Medium' },
  tierBadge: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  tierText: { fontSize: 8, letterSpacing: 0.6, fontFamily: 'Inter_700Bold' },
  toolBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'flex-end' },
  toolSheet: { backgroundColor: '#16181D', borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderColor: '#22252A', padding: 20, paddingBottom: 34, gap: 11 },
  modalHint: { color: c.mutedForeground, fontSize: 11, fontFamily: 'Inter_500Medium' },
  modalLabel: { color: c.mutedForeground, fontSize: 9, letterSpacing: 0.8, fontFamily: 'Inter_700Bold', marginTop: 4 },
  modalInput: { minHeight: 42, color: '#FFF', backgroundColor: '#0A0B0E', borderWidth: 1, borderColor: '#2A2D33', borderRadius: 9, paddingHorizontal: 11, paddingVertical: 9, fontSize: 13 },
  codeOutput: { minHeight: 100, backgroundColor: '#050608', borderRadius: 9, padding: 11 },
  codeText: { color: 'rgba(0,230,118,0.85)', fontFamily: 'monospace', fontSize: 10, lineHeight: 15 },
  modalPrimary: { backgroundColor: CYAN, borderRadius: 10, alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  modalPrimaryText: { color: '#0A0B0E', fontFamily: 'Inter_700Bold', fontSize: 13 },
  tableRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#22252A', paddingVertical: 12 },
  tableCell: { flex: 1, color: '#FFF', fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  tableValue: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  heatGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  heatCell: { width: '22%', minWidth: 64, backgroundColor: '#0A0B0E', borderWidth: 1, borderRadius: 8, paddingVertical: 10, alignItems: 'center', gap: 4 },
  heatName: { color: '#FFF', fontSize: 11, fontFamily: 'Inter_700Bold' },
  heatValue: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  lotResult: { alignItems: 'center', backgroundColor: 'rgba(0,240,255,0.08)', borderWidth: 1, borderColor: 'rgba(0,240,255,0.35)', borderRadius: 10, padding: 14, marginTop: 4 },
  lotValue: { color: CYAN, fontSize: 25, fontFamily: 'Inter_700Bold' },
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
