import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ApiError, customFetch } from '@workspace/api-client-react';
import { ProPaywallOverlay } from '@/components/ProPaywallOverlay';
import { canAccessTool } from '@/lib/aiToolAccess';
import { useSubscription } from '@/lib/revenuecat';

type Bot = {
  id: string;
  pair: string;
  strategy: 'GRID' | 'DCA';
  capital: number;
  status: 'active' | 'paused';
  pnl: number;
  created_at: string;
};

const PAIRS = ['BTC/USD', 'EUR/USD', 'XAU/USD', 'NVDA'] as const;
const STRATEGIES = ['GRID', 'DCA'] as const;

const fresh = { pair: 'BTC/USD', strategy: 'GRID' as Bot['strategy'], capital: '' };

/** Malformed API numbers (null, "", "abc") must never poison the metrics. */
function num(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

type Template = {
  id: string;
  market: 'FOREX' | 'CRYPTO' | 'STOCKS';
  name: string;
  pair: string;
  strategy: Bot['strategy'];
  icon: React.ComponentProps<typeof Feather>['name'];
  accent: string;
  blurb: string;
};

/** Curated multi-asset starting points that pre-fill the deploy sheet. */
const TEMPLATES: Template[] = [
  {
    id: 'fx-news-scalper',
    market: 'FOREX',
    name: 'FX News Scalper',
    pair: 'EUR/USD',
    strategy: 'GRID',
    icon: 'globe',
    accent: '#F5C542',
    blurb: 'Trades volatility bursts around high-impact macro releases.',
  },
  {
    id: 'dynamic-dca',
    market: 'CRYPTO',
    name: 'Dynamic DCA Engine',
    pair: 'BTC/USD',
    strategy: 'DCA',
    icon: 'trending-up',
    accent: '#00F0FF',
    blurb: 'Ladders entries into BTC drawdowns, exits on recovery waves.',
  },
  {
    id: 'vol-swing',
    market: 'STOCKS',
    name: 'Volatility Swing',
    pair: 'NVDA',
    strategy: 'GRID',
    icon: 'activity',
    accent: '#B78CFF',
    blurb: 'Harvests NVDA range expansion between momentum sessions.',
  },
];

export default function AutoPilotScreen() {
  const { isAdmin, accessTier } = useSubscription();
  const tier = accessTier ?? 'elite';
  // Cascading hierarchy: ADMIN ⊇ ELITE ⊇ PRO. Free users get the dashboard
  // as a blurred tease beneath the paywall curtain.
  const isPro = canAccessTool('pro', tier, isAdmin);

  const [bots, setBots] = useState<Bot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(fresh);
  const [saving, setSaving] = useState(false);
  const [deployError, setDeployError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await customFetch<unknown>('/api/bots');
      setBots(Array.isArray(data) ? (data as Bot[]) : []);
      if (!Array.isArray(data)) setError('HTTP 200: Failed to parse JSON.');
    } catch (caught) {
      console.error('[AutoPilot Fetch Error]:', caught);
      const detail =
        caught instanceof ApiError && caught.status === 401
          ? 'Your session is missing or expired. Please sign in again.'
          : caught instanceof ApiError
            ? `HTTP ${caught.status}: ${caught.message || 'Failed to parse JSON.'}`
            : caught instanceof Error
              ? caught.message
              : String(caught);
      setBots([]);
      setError(detail);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const active = bots.filter((b) => b.status === 'active');
  const activeCapital = active.reduce((sum, b) => sum + num(b.capital), 0);
  const totalCapital = bots.reduce((sum, b) => sum + num(b.capital), 0);
  const totalPnl = bots.reduce((sum, b) => sum + num(b.pnl), 0);
  const totalRoi = totalCapital > 0 ? (totalPnl / totalCapital) * 100 : 0;
  const winRate = active.length
    ? Math.round((active.filter((b) => num(b.pnl) >= 0).length / active.length) * 100)
    : 0;

  const metrics = useMemo(
    () =>
      [
        {
          id: 'active-capital',
          label: 'ACTIVE CAPITAL',
          value: `$${activeCapital.toLocaleString()}`,
          icon: 'dollar-sign',
          accent: '#00F0FF',
          tone: 'neutral',
        },
        {
          id: 'total-roi',
          label: 'TOTAL ROI',
          value: `${totalRoi >= 0 ? '+' : ''}${totalRoi.toFixed(2)}%`,
          icon: 'percent',
          accent: totalRoi >= 0 ? '#27D68A' : '#FF6576',
          tone: totalRoi >= 0 ? 'gain' : 'loss',
        },
        {
          id: 'win-rate',
          label: '24H WIN RATE',
          value: `${winRate}%`,
          icon: 'target',
          accent: '#F5C542',
          tone: 'neutral',
        },
      ] as const,
    [activeCapital, totalRoi, winRate],
  );

  const deploy = async () => {
    const capitalValue = num(form.capital);
    if (!capitalValue || capitalValue <= 0) {
      // Surface validation inside the sheet — page-level errors hide under it.
      setDeployError('Enter a valid virtual capital amount.');
      return;
    }
    setSaving(true);
    setDeployError('');
    try {
      await customFetch('/api/bots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pair: form.pair, strategy: form.strategy, capital: capitalValue }),
      });
      setOpen(false);
      setForm(fresh);
      await load();
    } catch (caught) {
      setDeployError(
        caught instanceof ApiError && caught.status === 403
          ? 'AutoPilot bots require a Pro subscription.'
          : 'Unable to deploy bot. Check that the latest Supabase migration is applied.',
      );
    } finally {
      setSaving(false);
    }
  };

  const closeDeploySheet = () => {
    setOpen(false);
    setDeployError('');
    setForm(fresh);
  };

  const toggle = async (bot: Bot) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const updated = await customFetch<Bot>(`/api/bots/${bot.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: bot.status === 'active' ? 'paused' : 'active' }),
      });
      setBots((list) => list.map((b) => (b.id === updated.id ? updated : b)));
    } catch {
      setError('Unable to update this bot.');
    }
  };

  const deployFromTemplate = (template: Template) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setForm({ pair: template.pair, strategy: template.strategy, capital: '' });
    setDeployError('');
    setOpen(true);
  };

  return (
    <View style={s.page}>
      <Stack.Screen
        options={{ title: 'AutoPilot', headerStyle: { backgroundColor: '#0A0B0E' }, headerTintColor: '#FFF' }}
      />
      <ScrollView contentContainerStyle={s.content}>
        {/* Header */}
        <View style={s.head}>
          <Text style={s.eyebrow}>AI TRADING COMMAND CENTER</Text>
          <Text style={s.title}>AutoPilot</Text>
          <Text style={s.copy}>
            Deploy cloud-managed AI strategies across forex, crypto and equities with virtual capital.
          </Text>
        </View>

        {/* Dashboard metrics */}
        <View style={s.metrics}>
          {metrics.map((metric) => (
            <View key={metric.id} style={s.metricCard} testID={`metric-${metric.id}`}>
              <View style={[s.metricIcon, { borderColor: `${metric.accent}55`, backgroundColor: `${metric.accent}14` }]}>
                <Feather name={metric.icon} size={13} color={metric.accent} />
              </View>
              <Text style={s.metricLabel}>{metric.label}</Text>
              <Text style={[s.metricValue, metric.tone === 'gain' && s.gain, metric.tone === 'loss' && s.loss]}>
                {metric.value}
              </Text>
            </View>
          ))}
        </View>

        {/* Bot templates */}
        <Text style={s.sectionTitle}>DEPLOY FROM TEMPLATE</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.templates}
        >
          {TEMPLATES.map((template) => (
            <TouchableOpacity
              key={template.id}
              style={[s.templateCard, { borderColor: `${template.accent}44` }]}
              onPress={() => deployFromTemplate(template)}
              activeOpacity={0.85}
              accessibilityRole="button"
              testID={`template-${template.id}`}
            >
              <View style={s.templateTop}>
                <View
                  style={[s.templateIcon, { borderColor: `${template.accent}55`, backgroundColor: `${template.accent}14` }]}
                >
                  <Feather name={template.icon} size={15} color={template.accent} />
                </View>
                <View style={[s.marketTag, { backgroundColor: `${template.accent}1F` }]}>
                  <Text style={[s.marketTagText, { color: template.accent }]}>{template.market}</Text>
                </View>
              </View>
              <Text style={s.templateName}>{template.name}</Text>
              <Text style={[s.templatePair, { color: template.accent }]}>{template.pair}</Text>
              <Text style={s.templateBlurb}>{template.blurb}</Text>
              <View style={s.templateCta}>
                <Text style={[s.templateCtaText, { color: template.accent }]}>Deploy template</Text>
                <Feather name="arrow-right" size={12} color={template.accent} />
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Custom deploy CTA */}
        <TouchableOpacity
          style={s.deployCta}
          onPress={() => {
            setForm(fresh);
            setDeployError('');
            setOpen(true);
          }}
          activeOpacity={0.9}
          accessibilityRole="button"
          testID="deploy-custom-button"
        >
          <Feather name="plus-circle" size={16} color="#071014" />
          <Text style={s.deployCtaText}>DEPLOY CUSTOM BOT</Text>
        </TouchableOpacity>

        {/* My bots */}
        <View style={s.myBotsHead}>
          <Text style={s.sectionTitle}>MY BOTS</Text>
          {bots.length > 0 && <Text style={s.myBotsCount}>{active.length} RUNNING</Text>}
        </View>
        {loading ? (
          <View style={s.center}>
            <ActivityIndicator color="#00F0FF" />
            <Text style={s.muted}>Loading bots…</Text>
          </View>
        ) : (
          <View style={s.list}>
            {error ? (
              <TouchableOpacity onPress={load} testID="autopilot-error">
                <Text style={s.error}>{error}{'\n'}Tap to retry.</Text>
              </TouchableOpacity>
            ) : null}
            {bots.map((bot) => {
              const running = bot.status === 'active';
              const pnl = num(bot.pnl);
              const botCapital = num(bot.capital);
              return (
                <View key={bot.id} style={s.botCard} testID={`bot-card-${bot.id}`}>
                  <View style={s.botHead}>
                    <View style={s.botIdentity}>
                      <View style={s.botPairRow}>
                        <Text style={s.pair}>{bot.pair}</Text>
                        <View
                          style={[s.statusBadge, running ? s.statusRunning : s.statusPaused]}
                          testID={`bot-status-${bot.id}`}
                        >
                          <View style={[s.statusDot, running ? s.dotRunning : s.dotPaused]} />
                          <Text style={[s.statusText, running ? s.statusTextRunning : s.statusTextPaused]}>
                            {running ? 'RUNNING' : 'PAUSED'}
                          </Text>
                        </View>
                      </View>
                      <Text style={s.strategy}>{bot.strategy} STRATEGY</Text>
                    </View>
                    <Switch
                      value={running}
                      onValueChange={() => toggle(bot)}
                      trackColor={{ true: '#00F0FF' }}
                      testID={`bot-toggle-${bot.id}`}
                    />
                  </View>
                  <View style={s.botMetrics}>
                    <BotMetric label="CAPITAL" value={`$${botCapital.toLocaleString()}`} />
                    <BotMetric
                      label="LIVE PNL"
                      value={`${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`}
                      good={pnl >= 0}
                    />
                    <BotMetric
                      label="ROI"
                      value={botCapital > 0 ? `${((pnl / botCapital) * 100).toFixed(2)}%` : '0.00%'}
                      good={pnl >= 0}
                    />
                  </View>
                </View>
              );
            })}
            {!bots.length && !error ? (
              <View style={s.empty} testID="my-bots-empty">
                <View style={s.emptyIcon}>
                  <Feather name="cpu" size={22} color="#4E5866" />
                </View>
                <Text style={s.emptyTitle}>No bots deployed yet</Text>
                <Text style={s.emptyCopy}>
                  Launch a template above or craft a custom strategy — your AI fleet will report live P&L here.
                </Text>
              </View>
            ) : null}
          </View>
        )}
      </ScrollView>

      {/* The sheet is entitlement-gated itself: a free user must never be
          able to reach a live deploy form, even if entitlement lapses while
          it is open. */}
      {isPro && (
        <DeployModal
          visible={open}
          form={form}
          setForm={setForm}
          close={closeDeploySheet}
          submit={deploy}
          saving={saving}
          error={deployError}
        />
      )}

      {!isPro && (
        <ProPaywallOverlay
          message="Upgrade to unlock the AutoPilot command center — AI bots across forex, crypto and stocks."
          testID="autopilot-paywall-overlay"
        />
      )}
    </View>
  );
}

function BotMetric({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <View>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.botMetricValue, good === false && s.loss, good === true && s.gain]}>{value}</Text>
    </View>
  );
}

function DeployModal({
  visible,
  form,
  setForm,
  close,
  submit,
  saving,
  error,
}: {
  visible: boolean;
  form: typeof fresh;
  setForm: React.Dispatch<React.SetStateAction<typeof fresh>>;
  close: () => void;
  submit: () => void;
  saving: boolean;
  error: string;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={s.overlay} testID="deploy-modal">
        <View style={s.sheet}>
          <View style={s.modalHead}>
            <Text style={s.modalTitle}>Deploy New Bot</Text>
            <TouchableOpacity onPress={close} accessibilityRole="button">
              <Feather name="x" size={22} color="#FFF" />
            </TouchableOpacity>
          </View>
          <Text style={s.field}>TRADING PAIR</Text>
          <View style={s.options}>
            {PAIRS.map((pair) => (
              <TouchableOpacity
                key={pair}
                onPress={() => setForm((f) => ({ ...f, pair }))}
                style={[s.option, form.pair === pair && s.optionOn]}
                accessibilityRole="button"
                testID={`pair-option-${pair.replace('/', '-')}`}
              >
                <Text style={s.optionText}>{pair}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={s.field}>STRATEGY</Text>
          <View style={s.options}>
            {STRATEGIES.map((strategy) => (
              <TouchableOpacity
                key={strategy}
                onPress={() => setForm((f) => ({ ...f, strategy }))}
                style={[s.option, form.strategy === strategy && s.optionOn]}
                accessibilityRole="button"
                testID={`strategy-option-${strategy}`}
              >
                <Text style={s.optionText}>{strategy}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TextInput
            value={form.capital}
            onChangeText={(capital) => setForm((f) => ({ ...f, capital }))}
            keyboardType="decimal-pad"
            placeholder="Virtual capital (USD)"
            placeholderTextColor="#777F8B"
            style={s.input}
            testID="capital-input"
          />
          {error ? (
            <Text style={s.deployError} testID="deploy-error">
              {error}
            </Text>
          ) : null}
          <TouchableOpacity style={s.submit} onPress={submit} disabled={saving} testID="deploy-submit">
            <Text style={s.submitText}>{saving ? 'DEPLOYING…' : 'DEPLOY PAPER BOT'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#0A0B0E', position: 'relative' },
  content: { padding: 20, paddingBottom: 42 },

  head: { gap: 6 },
  eyebrow: { color: '#00F0FF', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: '#FFF', fontSize: 27, fontWeight: '900' },
  copy: { color: '#9098A5', lineHeight: 19 },

  metrics: { flexDirection: 'row', gap: 8, marginTop: 20 },
  metricCard: {
    flex: 1,
    backgroundColor: '#10131A',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#23262E',
    padding: 12,
    gap: 6,
  },
  metricIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricLabel: { color: '#77808D', fontSize: 8, fontWeight: '900', letterSpacing: 0.6 },
  metricValue: { color: '#FFF', fontWeight: '900', fontSize: 15 },

  sectionTitle: { color: '#9AA3AF', fontSize: 11, fontWeight: '900', letterSpacing: 1.2, marginTop: 24 },
  templates: { gap: 10, paddingVertical: 12, paddingRight: 8 },
  templateCard: {
    width: 200,
    backgroundColor: '#10131A',
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  templateTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  templateIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  marketTag: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  marketTagText: { fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  templateName: { color: '#FFF', fontSize: 14, fontWeight: '900', marginTop: 4 },
  templatePair: { fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  templateBlurb: { color: '#8B94A1', fontSize: 11, lineHeight: 16 },
  templateCta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  templateCtaText: { fontSize: 11, fontWeight: '900' },

  deployCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#00F0FF',
    borderRadius: 12,
    paddingVertical: 15,
    marginTop: 8,
    shadowColor: '#00F0FF',
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  deployCtaText: { color: '#071014', fontWeight: '900', fontSize: 12, letterSpacing: 1 },

  myBotsHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  myBotsCount: { color: '#27D68A', fontSize: 10, fontWeight: '900', letterSpacing: 1, marginTop: 24 },
  list: { gap: 10, marginTop: 14 },
  botCard: {
    backgroundColor: '#10131A',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#23262E',
    padding: 15,
  },
  botHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  botIdentity: { gap: 5 },
  botPairRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pair: { color: '#FFF', fontSize: 19, fontWeight: '900' },
  strategy: { color: '#00F0FF', fontSize: 10, fontWeight: '900', letterSpacing: 0.8 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderWidth: 1,
  },
  statusRunning: { backgroundColor: 'rgba(39,214,138,0.12)', borderColor: 'rgba(39,214,138,0.4)' },
  statusPaused: { backgroundColor: 'rgba(245,197,66,0.10)', borderColor: 'rgba(245,197,66,0.35)' },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  dotRunning: { backgroundColor: '#27D68A' },
  dotPaused: { backgroundColor: '#F5C542' },
  statusText: { fontSize: 8, fontWeight: '900', letterSpacing: 1 },
  statusTextRunning: { color: '#27D68A' },
  statusTextPaused: { color: '#F5C542' },
  botMetrics: {
    marginTop: 15,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#23262E',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statLabel: { color: '#77808D', fontSize: 8, fontWeight: '900' },
  botMetricValue: { color: '#FFF', fontSize: 12, fontWeight: '800', marginTop: 5 },
  gain: { color: '#27D68A' },
  loss: { color: '#FF6576' },

  empty: { alignItems: 'center', paddingVertical: 34, paddingHorizontal: 24, gap: 10 },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#3A414D',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: { color: '#E8E9EC', fontSize: 14, fontWeight: '900' },
  emptyCopy: { color: '#8B94A1', fontSize: 12, lineHeight: 18, textAlign: 'center' },

  center: { padding: 40, alignItems: 'center', gap: 12 },
  muted: { color: '#8B94A1', textAlign: 'center' },
  error: { color: '#FF8090', textAlign: 'center', marginBottom: 8 },
  deployError: { color: '#FF8090', fontSize: 12, textAlign: 'center', marginTop: 6 },

  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,.7)' },
  sheet: {
    backgroundColor: '#15181E',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
    gap: 10,
  },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  modalTitle: { color: '#FFF', fontSize: 19, fontWeight: '900' },
  field: { color: '#88919E', fontSize: 9, fontWeight: '900', marginTop: 6, letterSpacing: 0.8 },
  options: { flexDirection: 'row', gap: 7 },
  option: { flex: 1, backgroundColor: '#242932', borderRadius: 8, padding: 11, alignItems: 'center' },
  optionOn: { backgroundColor: '#276D76' },
  optionText: { color: '#FFF', fontWeight: '800', fontSize: 11 },
  input: {
    color: '#FFF',
    backgroundColor: '#0C0E13',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#303641',
    padding: 14,
    marginTop: 5,
  },
  submit: { backgroundColor: '#00F0FF', borderRadius: 10, padding: 15, alignItems: 'center', marginTop: 7 },
  submitText: { color: '#071014', fontWeight: '900', fontSize: 11, letterSpacing: 0.8 },
});
