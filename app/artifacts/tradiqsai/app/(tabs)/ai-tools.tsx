import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Alert,
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
import { RiskDisclaimer } from '@/components/RiskDisclaimer';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetAutopilotQueryKey,
  getGetAutopilotHistoryQueryKey,
  useClearAutopilotLogs,
  useGetAutopilot,
  useGetAutopilotHistory,
  useSetAutopilotMaster,
  useSetAutopilotAsset,
  useUpdateAutopilotBot,
  type AutopilotBot,
  type AutopilotState,
} from '@workspace/api-client-react';
import { PaywallModal } from '@/components/PaywallModal';
import { ProPaywallOverlay } from '@/components/ProPaywallOverlay';
import { AiToolModal, type AiToolKind } from '@/components/AiToolModal';
import colors from '@/constants/colors';
import { canAccessTool } from '@/lib/aiToolAccess';
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

/**
 * True when the server rejected a request because the user has MFA enrolled
 * but has not completed a fresh TOTP verification in this session.
 * Matches the `requireAal2IfMfaEnrolledSoft` 403 + `mfa_required` contract.
 */
function isMfaRequiredError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const { status, data } = error as { status?: number; data?: unknown };
  if (status !== 403) return false;
  const code =
    data && typeof data === 'object'
      ? (data as { code?: unknown }).code
      : undefined;
  return code === 'mfa_required';
}

function botToggleErrorMessage(error: unknown): string {
  const candidate = error as {
    status?: number;
    message?: unknown;
    data?: { message?: unknown; error?: unknown };
  };
  const detail =
    typeof candidate?.data?.message === 'string'
      ? candidate.data.message
      : typeof candidate?.data?.error === 'string'
        ? candidate.data.error
        : typeof candidate?.message === 'string'
          ? candidate.message
          : null;

  if (candidate?.status && candidate.status >= 500) {
    return 'The trading service is temporarily unavailable. Your previous bot setting was restored.';
  }
  if (!candidate?.status) {
    return 'We could not reach the trading service. Check your connection and try again; your previous bot setting was restored.';
  }
  return detail
    ? `${detail} Your previous bot setting was restored.`
    : 'The bot update was rejected. Your previous bot setting was restored.';
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
const AUTOPILOT_PREFERENCES_KEY = 'tradiqs.autopilot.preferences.v1';
const ALGORITHM_PREFERENCES_KEY = 'tradiqs.algorithms.preferences.v1';
const ACTIVE_ALGORITHMS_KEY = '@tradiqs_active_algorithms';
type AutopilotAsset = 'Forex' | 'Crypto' | 'Stocks';
type AutopilotPreferences = {
  active: boolean;
  asset: AutopilotAsset;
};
type RiskStyle = 'Conservative' | 'Balanced' | 'Aggressive';
type AlgorithmConfig = {
  capital: number;
  drawdown: number;
  riskStyle: RiskStyle;
  assets: AutopilotAsset[];
};
type LocalAlgorithmPreferences = Pick<AlgorithmConfig, 'riskStyle' | 'assets'> & {
  /**
   * The server remains the enforcement point for deployments, but retaining
   * the last requested state locally keeps the switch responsive while a
   * background sync is delayed or the app is reopened offline.
   */
  active?: boolean;
};
type AlgorithmPreferences = Record<string, LocalAlgorithmPreferences>;
type BotToggleSnapshot = {
  attemptedValue: boolean;
  localActiveState: boolean | undefined;
  preference: LocalAlgorithmPreferences | undefined;
};
const RISK_STYLE_OPTIONS: RiskStyle[] = ['Conservative', 'Balanced', 'Aggressive'];
const ASSET_OPTIONS: AutopilotAsset[] = ['Forex', 'Crypto', 'Stocks'];

function defaultAlgorithmConfig(bot: Bot): AlgorithmConfig {
  return {
    capital: bot.capital,
    drawdown: bot.drawdown,
    riskStyle: bot.risk === 'Low' ? 'Conservative' : bot.risk === 'High' ? 'Aggressive' : 'Balanced',
    assets: ['Forex'],
  };
}

function isAlgorithmConfig(value: unknown): value is LocalAlgorithmPreferences {
  if (!value || typeof value !== 'object') return false;
  const config = value as Partial<LocalAlgorithmPreferences>;
  return (
    RISK_STYLE_OPTIONS.includes(config.riskStyle as RiskStyle) &&
    Array.isArray(config.assets) &&
    config.assets.every((asset) => ASSET_OPTIONS.includes(asset as AutopilotAsset)) &&
    (config.active === undefined || typeof config.active === 'boolean')
  );
}
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
  kind: AiToolKind;
  wide?: boolean;
};
const TOOLS: Tool[] = [
  { name: 'AI Signal Generator', description: 'Upload chart, get instant BUY/SELL signal with TP & SL', tier: 'PRO', icon: 'trending-up', kind: 'risk' },
  { name: 'AutoPilot Bots', description: 'Cloud-hosted GRID & DCA bots that trade for you 24/7', tier: 'PRO', icon: 'cpu', kind: 'risk' },
  { name: 'AI Chart Analysis', description: 'Upload trading charts for AI-powered analysis', tier: 'PRO', icon: 'bar-chart-2', kind: 'risk' },
  { name: 'AI News Analyser', description: 'Analyse forex news & economic events with AI', tier: 'PRO', icon: 'globe', kind: 'news' },
  { name: 'Psychology Coach', description: 'Stop revenge trading and emotional losses forever', tier: 'ELITE', icon: 'heart', kind: 'psychology' },
  { name: 'Market Radar', description: 'Top forex, crypto, stock & commodity news — highest impact', tier: 'PRO', icon: 'radio', kind: 'news' },
  { name: 'Liquidity Scanner', description: 'Detect institutional stop-hunts & Fair Value Gaps', tier: 'ELITE', icon: 'crosshair', kind: 'liquidity' },
  { name: 'Correlation Finder', description: 'Discover how currency pairs move together', tier: 'STARTER', icon: 'link-2', kind: 'correlation' },
  { name: 'Currency Heatmap', description: 'Cross pair pressure map with directional bias', tier: 'PRO', icon: 'grid', kind: 'heatmap' },
  { name: 'Broker Comparison', description: 'Find the best broker for your trading style', tier: 'STARTER', icon: 'briefcase', kind: 'broker' },
  { name: 'Code Lab', description: 'AI-powered Indicator Builder + Robot Builder (EA)', tier: 'ELITE', icon: 'code', kind: 'code' },
  { name: 'Account Tracker', description: 'Connect MT4/MT5 and get AI trading insights', tier: 'PRO', icon: 'activity', kind: 'broker', wide: true },
  { name: 'Risk Calculator', description: 'Calculate exact lot size based on SL pips', tier: 'STARTER', icon: 'target', kind: 'risk', wide: true },
];

function TierBadge({ tier }: { tier: ToolTier }) {
  const color = tier === 'STARTER' ? GREEN : tier === 'PRO' ? CYAN : GOLD;
  return <View style={[styles.tierBadge, { borderColor: color }]}><Text style={[styles.tierText, { color }]}>{tier}</Text></View>;
}

function ChartUploadModal({ visible, onClose, onSelected }: { visible: boolean; onClose: () => void; onSelected: (asset: { uri: string; mimeType?: string | null }) => void }) {
  const selectChart = async (camera: boolean) => {
    try {
      const permission = camera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return;
      const result = camera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (!result.canceled && result.assets[0]?.uri) onSelected(result.assets[0]);
    } catch {
      // The chooser remains usable after a platform picker failure.
    }
  };
  return <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.toolBackdrop}><View style={styles.toolSheet}><View style={styles.configHeader}><View><Text style={styles.configTitle}>AI Chart Analysis</Text><Text style={styles.modalHint}>Choose a chart to generate a structured market breakdown.</Text></View><TouchableOpacity onPress={onClose}><Feather name="x" size={20} color="#FFF" /></TouchableOpacity></View><TouchableOpacity style={styles.modalPrimary} onPress={() => void selectChart(false)}><Text style={styles.modalPrimaryText}>UPLOAD CHART IMAGE</Text></TouchableOpacity><TouchableOpacity style={styles.secondaryAction} onPress={() => void selectChart(true)}><Text style={styles.secondaryActionText}>TAKE CHART PHOTO</Text></TouchableOpacity></View></View></Modal>;
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
function PnlHistorySection({
  days,
  mfaRequired = false,
  onReverify,
}: {
  days: { day: string; pnl: number }[];
  mfaRequired?: boolean;
  onReverify?: () => void;
}) {
  const shown = days.slice(0, HISTORY_DAYS_SHOWN);
  const maxAbs = Math.max(...shown.map((d) => Math.abs(d.pnl)), 1);
  return (
    <View style={styles.historyCard} testID="pnl-history">
      <View style={styles.consoleTitleRow}>
        <Feather name="bar-chart-2" size={13} color={CYAN} />
        <Text style={styles.consoleTitle}>Daily P&L History</Text>
      </View>
      {mfaRequired ? (
        <View style={styles.historyMfaRow} testID="pnl-history-mfa-required">
          <Feather name="shield" size={13} color={GOLD} />
          <Text style={styles.historyMfaText}>
            Re-verify with two-factor authentication to view history.
          </Text>
          <TouchableOpacity
            onPress={onReverify}
            accessibilityRole="button"
            accessibilityLabel="Re-verify two-factor authentication"
            testID="pnl-history-reverify"
          >
            <Text style={styles.historyMfaAction}>RE-VERIFY</Text>
          </TouchableOpacity>
        </View>
      ) : shown.length === 0 ? (
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
  const {
    isSubscribed,
    isAdmin = false,
    accessTier,
  } = useSubscription();
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
  const applyOptimisticAutopilotState = useCallback(
    (patch: Partial<AutopilotState>) => {
      queryClient.setQueryData<AutopilotState>(
        getGetAutopilotQueryKey(),
        (current) => (current ? { ...current, ...patch } : current),
      );
    },
    [queryClient],
  );

  const botToggleSnapshots = useRef(new Map<string, BotToggleSnapshot>());

  // The server is the authority on deployments. A failed request must restore
  // the exact pre-toggle override, not merely clear it: a saved local pause
  // may legitimately differ from the latest server snapshot.
  const restoreBotToggleSnapshot = useCallback((botId: string, snapshot: BotToggleSnapshot) => {
    setLocalActiveStates((current) => {
      const next = { ...current };
      if (snapshot.localActiveState === undefined) {
        delete next[botId];
      } else {
        next[botId] = snapshot.localActiveState;
      }
      AsyncStorage.setItem(ACTIVE_ALGORITHMS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
    setAlgorithmPreferences((current) => {
      const next = { ...current };
      if (snapshot.preference === undefined) {
        delete next[botId];
      } else {
        next[botId] = snapshot.preference;
      }
      AsyncStorage.setItem(ALGORITHM_PREFERENCES_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const {
    data: history,
    error: historyError,
  } = useGetAutopilotHistory({
    query: {
      queryKey: getGetAutopilotHistoryQueryKey(),
      // Rollovers happen at most daily; refresh occasionally in case the
      // screen stays open across midnight.
      refetchInterval: 60_000,
      // Stop retrying when the server has definitively told us that MFA
      // verification is needed — repeated retries would only produce noise.
      retry: (_, error) => !isMfaRequiredError(error),
    },
  });
  const historyMfaRequired = isMfaRequiredError(historyError);
  const openMfaReverification = useCallback(() => {
    router.push({ pathname: '/profile', params: { mfa: 'verify' } } as never);
  }, [router]);

  // Writes degrade gracefully during a server-side security-check outage:
  // the API applies the change anyway (never a 503), so a successful
  // response needs no special handling here. Only a definitive MFA block
  // (403 + `mfa_required`) deserves a user-facing explanation — the change
  // did NOT apply, and re-syncing snaps the optimistic UI back.
  const notifyMfaBlocked = useCallback(() => {
    Alert.alert(
      'Verification needed',
      'Your account has two-factor authentication enabled. Please re-verify with your authenticator code to change AutoPilot settings.',
    );
    void refetch();
  }, [refetch]);

  const { mutate: setMaster } = useSetAutopilotMaster({
    mutation: {
      onSuccess: applyState,
      // Preferences are local-first: a timeout must not snap a control back —
      // but a definitive MFA block means the server refused the change.
      onError: (error: unknown) => {
        if (isMfaRequiredError(error)) notifyMfaBlocked();
      },
    },
  });
  const { mutate: setAutopilotAsset } = useSetAutopilotAsset({
    mutation: {
      onSuccess: applyState,
      onError: (error: unknown) => {
        if (isMfaRequiredError(error)) notifyMfaBlocked();
      },
    },
  });
  // The server is the authority on Pro access: it rejects Pro-only bot
  // changes from non-subscribers with 403. Surface that as the paywall so a
  // blocked deploy explains itself instead of silently doing nothing.
  const { mutate: updateBot } = useUpdateAutopilotBot({
    mutation: {
      // Snapshot the pre-mutation state and apply the optimistic running
      // change here, so a rejection can restore the cache exactly — a
      // failed refetch must never leave an optimistic value behind.
      onMutate: (variables) => {
        const previous = queryClient.getQueryData<AutopilotState>(getGetAutopilotQueryKey());
        const nextRunning = variables?.data?.running;
        if (previous && variables && nextRunning !== undefined) {
          applyOptimisticAutopilotState({
            bots: previous.bots.map((candidate) =>
              candidate.id === variables.botId
                ? { ...candidate, running: nextRunning }
                : candidate,
            ),
          });
        }
        return { previous };
      },
      onSuccess: (nextState, variables) => {
        if (variables?.data?.running !== undefined) {
          setPendingBotIds((current) => {
            const next = new Set(current);
            next.delete(variables.botId);
            return next;
          });
          const snapshot = botToggleSnapshots.current.get(variables.botId);
          if (snapshot?.attemptedValue === variables.data.running) {
            botToggleSnapshots.current.delete(variables.botId);
          }
        }
        applyState(nextState);
      },
      onError: (error: unknown, variables, context) => {
        // A rejected running-change must restore the exact local state that
        // preceded it, including a saved override that differs from the API.
        if (variables?.data?.running !== undefined) {
          setPendingBotIds((current) => {
            const next = new Set(current);
            next.delete(variables.botId);
            return next;
          });
          const snapshot = botToggleSnapshots.current.get(variables.botId);
          if (snapshot?.attemptedValue === variables.data.running) {
            restoreBotToggleSnapshot(variables.botId, snapshot);
            botToggleSnapshots.current.delete(variables.botId);
            if (context?.previous) applyState(context.previous);
          }
        }
        if (isProRequiredError(error)) {
          setConfigBot(null);
          Alert.alert(
            'Upgrade required',
            'This algorithm needs a paid AutoPilot plan. Your previous bot setting was restored.',
          );
          setPaywallOpen(true);
        } else if (isMfaRequiredError(error)) {
          notifyMfaBlocked();
          return;
        } else {
          Alert.alert('Bot update failed', botToggleErrorMessage(error));
        }
        // Re-sync so an optimistic-looking UI never keeps a rejected change.
        void refetch();
      },
    },
  });
  const { mutate: clearLogs } = useClearAutopilotLogs({
    mutation: {
      onSuccess: applyState,
      onError: (error: unknown) => {
        if (isMfaRequiredError(error)) notifyMfaBlocked();
      },
    },
  });

  const [configBot, setConfigBot] = useState<Bot | null>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<Tool | null>(null);
  const [chartUploadOpen, setChartUploadOpen] = useState(false);
  const [chartMode, setChartMode] = useState<'analysis' | 'signal'>('analysis');
  const [toolError, setToolError] = useState<string | null>(null);
  const [isAutoPilotActive, setIsAutoPilotActive] = useState(true);
  const [selectedAsset, setSelectedAsset] = useState<AutopilotAsset>('Forex');
  const [localActionLogs, setLocalActionLogs] = useState<AutopilotState['logs']>([]);
  const [algorithmPreferences, setAlgorithmPreferences] = useState<AlgorithmPreferences>({});
  const [localActiveStates, setLocalActiveStates] = useState<Record<string, boolean>>({});
  const [pendingBotIds, setPendingBotIds] = useState<Set<string>>(() => new Set());
  const [configurationSaved, setConfigurationSaved] = useState<string | null>(null);
  const logScrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(AUTOPILOT_PREFERENCES_KEY)
      .then((raw) => {
        if (!mounted || !raw) return;
        const saved = JSON.parse(raw) as Partial<AutopilotPreferences>;
        if (typeof saved.active === 'boolean') setIsAutoPilotActive(saved.active);
        if (saved.asset === 'Forex' || saved.asset === 'Crypto' || saved.asset === 'Stocks') {
          setSelectedAsset(saved.asset);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(ACTIVE_ALGORITHMS_KEY)
      .then((raw) => {
        if (!mounted || !raw) return;
        const saved = JSON.parse(raw) as Record<string, unknown>;
        const activeStates = Object.entries(saved).reduce<Record<string, boolean>>(
          (states, [id, active]) => {
            if (typeof active === 'boolean') states[id] = active;
            return states;
          },
          {},
        );
        setLocalActiveStates(activeStates);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(ALGORITHM_PREFERENCES_KEY)
      .then((raw) => {
        if (!mounted || !raw) return;
        const saved = JSON.parse(raw) as Record<string, unknown>;
        const valid = Object.entries(saved).reduce<AlgorithmPreferences>((preferences, [id, value]) => {
          if (isAlgorithmConfig(value)) preferences[id] = value;
          return preferences;
        }, {});
        setAlgorithmPreferences(valid);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  // Hydrate local controls from the server on the first successful response.
  // This makes the UI authoritative for a second device, a server-enforced
  // pause, or a restored session — without snapping back after every refetch
  // or mutation (which keep the local state as the optimistic source of truth
  // through `applyState` / `applyOptimisticAutopilotState`).
  const hasHydratedFromServer = useRef(false);
  useEffect(() => {
    if (!autopilot || hasHydratedFromServer.current) return;
    hasHydratedFromServer.current = true;
    setIsAutoPilotActive(autopilot.masterActive);
    if (
      autopilot.selectedAsset === 'Forex' ||
      autopilot.selectedAsset === 'Crypto' ||
      autopilot.selectedAsset === 'Stocks'
    ) {
      setSelectedAsset(autopilot.selectedAsset);
    }
  }, [autopilot]);

  const persistAutopilotPreferences = useCallback((next: AutopilotPreferences) => {
    AsyncStorage.setItem(AUTOPILOT_PREFERENCES_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const masterActive = isAutoPilotActive;
  // A missing subscription context should not freeze the controls while it is
  // initializing. The API remains the authority and rejects unauthorized
  // requests; explicit Free/Starter tiers are never elevated by this fallback.
  const tier = accessTier ?? 'elite';
  // AutoPilot & the Oracle are Pro-gated. Free users see the widget as a
  // teaser: forced off, zeroed out, and inert beneath the paywall curtain.
  const isPro = isAdmin || tier === 'pro' || tier === 'elite';
  const effectiveMasterActive = isPro && masterActive;
  const bots = autopilot?.bots ?? [];
  const isBotActive = useCallback(
    (bot: Bot) =>
      localActiveStates[bot.id] ??
      algorithmPreferences[bot.id]?.active ??
      bot.running,
    [algorithmPreferences, localActiveStates],
  );
  // Free users never receive live logs or P&L — the teaser shows zeroed data.
  const logs = isPro ? [...(autopilot?.logs ?? []), ...localActionLogs] : [];
  const todayPnl = isPro ? (autopilot?.todayPnl ?? 0) : 0;

  const activeCount = effectiveMasterActive ? bots.filter(isBotActive).length : 0;
  const capitalDeployed = useMemo(
    () =>
      effectiveMasterActive
        ? bots.filter(isBotActive).reduce((sum, bot) => sum + bot.capital, 0)
        : 0,
    [isBotActive, effectiveMasterActive, bots],
  );

  // This is intentionally a simulated activity feed. It gives traders a
  // reviewable outcome while keeping real broker execution out of the client.
  useEffect(() => {
    if (!effectiveMasterActive) return;
    const runningBots = bots.filter(isBotActive);
    if (runningBots.length === 0) return;
    const appendSimulatedOutcome = () => {
      const bot = runningBots[Math.floor(Date.now() / 30_000) % runningBots.length];
      const filled = Math.floor(Date.now() / 30_000) % 2 === 0;
      setLocalActionLogs((current) => [
        ...current.slice(-29),
        {
          id: `simulated-outcome-${bot.id}-${Date.now()}`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          text: filled
            ? `[SIM] ${bot.name}: BUY setup filled in simulation — protected by configured drawdown`
            : `[SIM] ${bot.name}: setup skipped — simulated risk filter rejected entry`,
        },
      ]);
    };
    const interval = setInterval(appendSimulatedOutcome, 30_000);
    return () => clearInterval(interval);
  }, [bots, isBotActive, effectiveMasterActive]);

  const handleToggleAutoPilot = (value: boolean) => {
    const canDeployAutoPilot = isAdmin || tier === 'pro' || tier === 'elite';
    if (!canDeployAutoPilot) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setPaywallOpen(true);
      return;
    }

    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setIsAutoPilotActive(value);
    persistAutopilotPreferences({ active: value, asset: selectedAsset });
    applyOptimisticAutopilotState({ masterActive: value });
    if (!value) {
      setLocalActionLogs((current) => [
        ...current,
        {
          id: `local-pause-${Date.now()}`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          text: '[SYS] Engine standby - AutoPilot paused',
        },
      ]);
    }
    void Promise.resolve().then(() => {
      try {
        setMaster({ data: { active: value } });
      } catch {
        // The background sync is intentionally silent.
      }
    });
  };

  const selectAutopilotAsset = (asset: AutopilotAsset) => {
    const stocksLocked = asset === 'Stocks' && !isAdmin && tier !== 'elite';
    if (stocksLocked) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      router.push({ pathname: '/paywall', params: { defaultTier: 'ELITE' } });
      return;
    }
    if (!isAdmin && tier !== 'pro' && tier !== 'elite') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      setPaywallOpen(true);
      return;
    }
    if (asset === selectedAsset) return;
    void Haptics.selectionAsync().catch(() => {});
    setSelectedAsset(asset);
    persistAutopilotPreferences({ active: isAutoPilotActive, asset });
    applyOptimisticAutopilotState({ selectedAsset: asset });
    void Promise.resolve().then(() => {
      try {
        setAutopilotAsset({ data: { asset } });
      } catch {
        // The background sync is intentionally silent.
      }
    });
  };

  const toggleBot = (bot: Bot, value: boolean) => {
    // Serialize updates per bot. Without this, two rapid presses can replace
    // the first rollback snapshot before either server response arrives.
    if (pendingBotIds.has(bot.id)) return;
    const runningBots = bots.filter(
      (candidate) => candidate.id !== bot.id && isBotActive(candidate),
    );
    const userIsPro = isAdmin || tier === 'pro' || tier === 'elite';
    if (value && !userIsPro) {
      if (bot.proOnly || runningBots.length >= 1) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        Alert.alert(
          bot.proOnly ? 'Pro Tier Required' : 'Limit Reached',
          bot.proOnly
            ? 'Upgrade to Pro to deploy this algorithm.'
            : 'Free tier allows 1 active bot. Upgrade for unlimited.',
        );
        setPaywallOpen(true);
        return;
      }
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setPendingBotIds((current) => new Set(current).add(bot.id));
    botToggleSnapshots.current.set(bot.id, {
      attemptedValue: value,
      localActiveState: localActiveStates[bot.id],
      preference: algorithmPreferences[bot.id],
    });
    const updatedStates = { ...localActiveStates, [bot.id]: value };
    setLocalActiveStates(updatedStates);
    AsyncStorage.setItem(ACTIVE_ALGORITHMS_KEY, JSON.stringify(updatedStates)).catch((error) => {
      console.error('Failed to save algorithm active state', error);
    });
    setAlgorithmPreferences((current) => {
      const next = {
        ...current,
        [bot.id]: {
          ...current[bot.id],
          ...defaultAlgorithmConfig(bot),
          active: value,
        },
      };
      AsyncStorage.setItem(ALGORITHM_PREFERENCES_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
    updateBot({ botId: bot.id, data: { running: value } });
    setLocalActionLogs((current) => [
      ...current,
      {
        id: `local-bot-${bot.id}-${Date.now()}`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: value
          ? `[SIM] ${bot.name}: signal accepted — simulated ${bot.tags.split('·')[0]?.trim() ?? 'market'} execution`
          : `[SYS] ${bot.name} paused — no simulated orders will be evaluated`,
      },
    ]);
  };

  const saveConfig = (bot: Bot, config: AlgorithmConfig) => {
    // Defense in depth: never persist or ship a free-tier bot configuration.
    if (!isPro) {
      setPaywallOpen(true);
      return;
    }
    setAlgorithmPreferences((current) => {
      const next = {
        ...current,
        [bot.id]: {
          riskStyle: config.riskStyle,
          assets: config.assets,
          active: current[bot.id]?.active,
        },
      };
      AsyncStorage.setItem(ALGORITHM_PREFERENCES_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
    updateBot({ botId: bot.id, data: { capital: config.capital, drawdown: config.drawdown } });
    setLocalActionLogs((current) => [
      ...current,
      {
        id: `local-config-${bot.id}-${Date.now()}`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: `[SIM] ${bot.name}: configuration saved — ${config.riskStyle.toLowerCase()} execution on ${config.assets.join('/')}`,
      },
    ]);
    setConfigurationSaved(bot.id);
    setTimeout(() => setConfigurationSaved((id) => (id === bot.id ? null : id)), 2200);
    setConfigBot(null);
  };

  const openTool = (tool: Tool) => {
    try {
      setToolError(null);
      if (tool.name === 'AI Signal Generator' || tool.name === 'AI Chart Analysis') {
        setChartMode(tool.name === 'AI Signal Generator' ? 'signal' : 'analysis');
        setChartUploadOpen(true);
        return;
      }
      if (tool.name === 'AutoPilot Bots') {
        if (bots[0]) setConfigBot(bots[0]);
        else router.push('/profile/autopilot');
        return;
      }
      if (tool.name === 'Account Tracker') {
        router.push('/profile/brokersync');
        return;
      }
      setActiveTool(tool);
    } catch {
      setToolError(`Couldn't open ${tool.name}. Please try again.`);
    }
  };

  const openPaywall = (tier: ToolTier) => {
    try {
      if (tier === 'ELITE') router.push({ pathname: '/paywall', params: { defaultTier: 'ELITE' } });
      else setPaywallOpen(true);
    } catch {
      setToolError('Upgrade options are temporarily unavailable. Please try again.');
    }
  };

  const onChartSelected = (asset: { uri: string; mimeType?: string | null }) => {
    try {
      setChartUploadOpen(false);
      router.push({ pathname: '/ai-analysis', params: { imageUri: asset.uri, mode: chartMode, mediaType: asset.mimeType ?? 'image/jpeg' } });
    } catch {
      setToolError('The chart was selected, but analysis could not open. Please try again.');
    }
  };

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Screen header row */}
        <View style={styles.screenHeader}>
           <Text style={styles.screenTitle}>TradiQsAI Tools</Text>
          <TouchableOpacity
            style={styles.oracleButton}
            onPress={() => {
              // The Oracle AI is Pro-gated: free taps convert, not navigate.
              if (isPro) router.push('/oracle');
              else setPaywallOpen(true);
            }}
            activeOpacity={0.85}
            accessibilityState={{ disabled: !isPro }}
            accessibilityLabel={isPro ? 'Ask AI Oracle' : 'Ask AI Oracle, locked. Pro required'}
            testID="ask-oracle"
          >
            <Feather name="message-circle" size={14} color="#0A0B0E" />
            <Text style={styles.oracleButtonText}>Ask AI Oracle</Text>
            {!isPro && <Feather name="lock" size={12} color="#0A0B0E" />}
          </TouchableOpacity>
        </View>

        {/* AutoPilot widget: summary + console + history under one Pro curtain */}
        <View style={styles.autopilotWidget}>
        {/* AutoPilot summary card */}
        <View style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <View style={styles.summaryTitleWrap}>
              <Text style={styles.summaryTitle}>TradiQs AutoPilot</Text>
              <View style={styles.systemRow}>
                <PulseDot active={effectiveMasterActive} />
                <Text style={[styles.systemText, { color: effectiveMasterActive ? CYAN : c.mutedForeground }]}>
                  {effectiveMasterActive ? 'System Active' : 'System Paused'}
                </Text>
              </View>
            </View>
            <View style={styles.masterToggleWrap}>
              <Text style={[styles.masterLabel, { color: effectiveMasterActive ? CYAN : c.mutedForeground }]}>
                {effectiveMasterActive ? 'Active' : 'Paused'}
              </Text>
              <Switch
                value={effectiveMasterActive}
                disabled={!isPro}
                onValueChange={handleToggleAutoPilot}
                trackColor={{ false: '#22252A', true: 'rgba(0,240,255,0.35)' }}
                thumbColor={effectiveMasterActive ? CYAN : '#8A8D93'}
                testID="master-toggle"
              />
            </View>
          </View>
          <View style={styles.assetSelector} accessibilityLabel="AutoPilot execution market">
            {(['Forex', 'Crypto', 'Stocks'] as const).map((asset) => {
              const isSelected = selectedAsset === asset;
              const isLocked = !isPro || (asset === 'Stocks' && !isAdmin && tier !== 'elite');
              return (
                <TouchableOpacity
                  key={asset}
                  disabled={!isPro}
                  onPress={() => selectAutopilotAsset(asset)}
                  style={[
                    styles.assetPill,
                    isSelected && styles.assetPillActive,
                    isLocked && styles.assetPillLocked,
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected, disabled: isLocked }}
                  accessibilityLabel={`${asset}${isLocked ? ', locked. Upgrade required' : ''}`}
                  testID={`autopilot-asset-${asset.toLowerCase()}`}
                >
                  <Text style={[styles.assetPillText, isSelected && styles.assetPillTextActive]}>
                    {asset}{isLocked ? '  🔒' : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
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
        <PnlHistorySection
          days={isPro ? (history?.days ?? []) : []}
          mfaRequired={isPro && historyMfaRequired}
          onReverify={openMfaReverification}
        />
        {!isPro && (
          <ProPaywallOverlay
            message="Upgrade to unlock AI AutoPilot & Scalp Oracle"
            testID="autopilot-paywall-overlay"
          />
        )}
        </View>

        <Text style={styles.sectionTitle}>HERO TOOLS</Text>
        <View style={styles.heroGrid}>
          {TOOLS.slice(0, 2).map((tool) => <ToolCard key={tool.name} tool={tool} accessTier={tier} isAdmin={isAdmin} onOpen={openTool} onPaywall={openPaywall} hero />)}
        </View>
        <Text style={styles.sectionTitle}>AI ANALYSIS</Text>
        <View style={styles.toolGrid}>
          {TOOLS.slice(2, 7).map((tool) => <ToolCard key={tool.name} tool={tool} accessTier={tier} isAdmin={isAdmin} onOpen={openTool} onPaywall={openPaywall} />)}
        </View>
        <Text style={styles.sectionTitle}>TOOLS & UTILITIES</Text>
        <View style={styles.toolGrid}>
          {TOOLS.slice(7).map((tool) => <ToolCard key={tool.name} tool={tool} accessTier={tier} isAdmin={isAdmin} onOpen={openTool} onPaywall={openPaywall} />)}
        </View>
        {toolError && <TouchableOpacity style={styles.toolError} onPress={() => setToolError(null)}><Text style={styles.toolErrorText}>{toolError}</Text></TouchableOpacity>}

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
          const locked = bot.proOnly && !isSubscribed && !isAdmin;
          const running = effectiveMasterActive && isBotActive(bot);
          const cfg = { ...defaultAlgorithmConfig(bot), ...algorithmPreferences[bot.id] };
          return (
            <View
              key={bot.id}
              style={[styles.botCard, running && styles.botCardActive]}
            >
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
                      onPress={() => {
                        // AutoPilot configuration is Pro-only: free taps convert.
                        if (!isPro) {
                          setPaywallOpen(true);
                          return;
                        }
                        setConfigBot(bot);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      testID={`configure-${bot.id}`}
                      accessibilityLabel={`Configure ${bot.name}`}
                    >
                      <Feather name="settings" size={16} color={c.mutedForeground} />
                    </TouchableOpacity>
                    <View pointerEvents="box-none">
                      <Switch
                        value={running}
                        disabled={!effectiveMasterActive || pendingBotIds.has(bot.id)}
                        onValueChange={(v) => toggleBot(bot, v)}
                        trackColor={{ false: '#22252A', true: 'rgba(0,230,118,0.35)' }}
                        thumbColor={running ? GREEN : '#8A8D93'}
                        testID={`bot-toggle-${bot.id}`}
                      />
                    </View>
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
                      {cfg.riskStyle}
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
              {!locked && (
                <Text style={styles.botConfigDetail}>
                  {cfg.assets.join(' · ')} · {cfg.riskStyle} simulated profile
                  {configurationSaved === bot.id ? ' · SAVED' : ''}
                </Text>
              )}

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
                      onPress={() => router.push({ pathname: '/paywall', params: { defaultTier: 'ELITE' } })}
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
        <RiskDisclaimer />
      </ScrollView>

      {/* Configure settings modal */}
      <ConfigModal
        bot={configBot}
        initial={configBot ? { ...defaultAlgorithmConfig(configBot), ...algorithmPreferences[configBot.id] } : null}
        onClose={() => setConfigBot(null)}
        onSave={saveConfig}
      />
      {activeTool && <AiToolModal tool={{ name: activeTool.name, kind: activeTool.kind }} onClose={() => setActiveTool(null)} />}
      <ChartUploadModal visible={chartUploadOpen} onClose={() => setChartUploadOpen(false)} onSelected={onChartSelected} />

      {/* Paywall */}
      <PaywallModal visible={paywallOpen} onClose={() => setPaywallOpen(false)} />
    </View>
  );
}

function ToolCard({ tool, accessTier, isAdmin, onOpen, onPaywall, hero = false }: { tool: Tool; accessTier: 'starter' | 'pro' | 'elite'; isAdmin: boolean; onOpen: (tool: Tool) => void; onPaywall: (tier: Tool['tier']) => void; hero?: boolean }) {
  const requiredTier = tool.tier.toLowerCase() as 'starter' | 'pro' | 'elite';
  const unlocked = canAccessTool(requiredTier, accessTier, isAdmin);
  const locked = !unlocked;
  return <TouchableOpacity style={[styles.toolCard, hero && styles.heroCard, tool.wide && styles.wideCard]} activeOpacity={0.78} onPress={() => locked ? onPaywall(tool.tier) : onOpen(tool)} accessibilityRole="button" accessibilityLabel={`${tool.name}${locked ? ', locked' : ''}`}>
    <View style={styles.toolIcon}><Feather name={tool.icon} size={hero ? 21 : 17} color={tool.tier === 'ELITE' ? GOLD : CYAN} /></View>
     <View style={styles.toolCopy}><View style={styles.toolTitleRow}><Text style={styles.toolName}>{tool.name}</Text>{locked ? <Feather name="lock" size={12} color={GOLD} /> : <Text style={styles.unlockedText}>UNLOCKED</Text>}</View><Text style={styles.toolDescription}>{tool.description}</Text></View>
     {locked ? <TierBadge tier={tool.tier} /> : <View style={styles.unlockedBadge}><Text style={styles.unlockedText}>ACTIVE</Text></View>}
  </TouchableOpacity>;
}

function ConfigModal({
  bot,
  initial,
  onClose,
  onSave,
}: {
  bot: Bot | null;
  initial: AlgorithmConfig | null;
  onClose: () => void;
  onSave: (bot: Bot, config: AlgorithmConfig) => void;
}) {
  const [capital, setCapital] = useState<number>(initial?.capital ?? 10000);
  const [drawdown, setDrawdown] = useState<number>(initial?.drawdown ?? 10);
  const [riskStyle, setRiskStyle] = useState<RiskStyle>(initial?.riskStyle ?? 'Balanced');
  const [assets, setAssets] = useState<AutopilotAsset[]>(initial?.assets ?? ['Forex']);

  // Re-seed selections whenever a new bot is opened.
  useEffect(() => {
    if (bot && initial) {
      setCapital(initial.capital);
      setDrawdown(initial.drawdown);
      setRiskStyle(initial.riskStyle);
      setAssets(initial.assets);
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

          <Text style={styles.configLabel}>EXECUTION RISK STYLE</Text>
          <View style={styles.optionRow}>
            {RISK_STYLE_OPTIONS.map((style) => (
              <Pressable
                key={style}
                style={[styles.option, riskStyle === style && styles.optionActive]}
                onPress={() => setRiskStyle(style)}
                testID={`risk-style-${style.toLowerCase()}`}
              >
                <Text style={[styles.optionText, riskStyle === style && styles.optionTextActive]}>
                  {style}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.configLabel}>MARKETS TO MONITOR</Text>
          <View style={styles.optionRow}>
            {ASSET_OPTIONS.map((asset) => {
              const selected = assets.includes(asset);
              return (
                <Pressable
                  key={asset}
                  style={[styles.option, selected && styles.optionActive]}
                  onPress={() =>
                    setAssets((current) => {
                      if (current.includes(asset)) return current.length > 1 ? current.filter((item) => item !== asset) : current;
                      return [...current, asset];
                    })
                  }
                  testID={`config-asset-${asset.toLowerCase()}`}
                >
                  <Text style={[styles.optionText, selected && styles.optionTextActive]}>{asset}</Text>
                </Pressable>
              );
            })}
          </View>

          <TouchableOpacity
            style={styles.saveButton}
            onPress={() => onSave(bot, { capital, drawdown, riskStyle, assets })}
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
  historyMfaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  historyMfaText: {
    color: GOLD,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    flex: 1,
  },
  historyMfaAction: {
    color: GOLD,
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.8,
    marginLeft: 8,
  },
  autopilotWidget: {
    // Establishes the containing block for the absolute-fill paywall curtain
    // (RN Web does not treat overflow:hidden as an anchor).
    position: 'relative',
    gap: 12,
    borderRadius: colors.radius,
    overflow: 'hidden',
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
  assetSelector: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#22252A',
  },
  assetPill: {
    flex: 1,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#22252A',
    borderRadius: 10,
    backgroundColor: 'transparent',
    paddingHorizontal: 8,
  },
  assetPillActive: {
    borderColor: CYAN,
    backgroundColor: 'rgba(0,255,255,0.12)',
  },
  assetPillLocked: {
    opacity: 0.72,
  },
  assetPillText: {
    color: '#8A8D93',
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.2,
  },
  assetPillTextActive: {
    color: CYAN,
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
  botConfigDetail: {
    color: CYAN,
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    textAlign: 'right',
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
  secondaryAction: {
    borderWidth: 1,
    borderColor: CYAN,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 10,
  },
  secondaryActionText: {
    color: CYAN,
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.8,
  },
  unlockedBadge: {
    borderWidth: 1,
    borderColor: 'rgba(0,230,118,0.55)',
    backgroundColor: 'rgba(0,230,118,0.10)',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  unlockedText: {
    color: GREEN,
    fontSize: 8,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.6,
  },
  toolError: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,97,116,0.45)',
    backgroundColor: 'rgba(255,97,116,0.10)',
    padding: 12,
  },
  toolErrorText: {
    color: '#FF9DAA',
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
  },
});
