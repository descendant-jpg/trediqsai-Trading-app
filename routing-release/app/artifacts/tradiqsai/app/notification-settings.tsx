import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import colors from '@/constants/colors';

const c = colors.light;

const CYAN = '#00F0FF';
const YELLOW = '#F5C542';
const BLUE = '#3B82F6';
const MUTED_CHIP = '#444444';

export const NOTIFICATION_SETTINGS_KEY = 'tradiqs.notificationSettings.v1';
const TELEGRAM_VIP_URL = 'https://t.me/tradiqsai_vip';

export const PAIR_CATEGORIES: { title: string; pairs: string[] }[] = [
  { title: 'METALS', pairs: ['XAUUSD', 'XAG/USD'] },
  { title: 'CRYPTO', pairs: ['BTC/USD', 'ETH/USD'] },
  {
    title: 'FOREX',
    pairs: [
      'EUR/USD', 'GBP/USD', 'USD/JPY', 'GBP/JPY', 'EUR/JPY', 'AUD/USD', 'NZD/USD',
      'USD/CAD', 'USD/CHF', 'EUR/GBP', 'EUR/AUD', 'EUR/NZD', 'GBP/AUD', 'GBP/NZD',
      'AUD/NZD', 'AUD/CAD',
    ],
  },
  { title: 'INDICES', pairs: ['US30', 'NAS100'] },
  { title: 'COMMODITIES', pairs: ['US Oil'] },
];

const ALL_PAIRS = PAIR_CATEGORIES.flatMap((cat) => cat.pairs);

type SoundMode = 'Default' | 'Silent';

interface NotificationSettings {
  masterPush: boolean;
  soundMode: SoundMode;
  selectedPairs: string[];
  marketAlerts: boolean;
  calendarIcon: boolean;
}

const DEFAULT_SETTINGS: NotificationSettings = {
  masterPush: true,
  soundMode: 'Default',
  selectedPairs: ALL_PAIRS,
  marketAlerts: true,
  calendarIcon: false,
};

/** Parse stored settings defensively — bad JSON falls back to defaults. */
export function parseStoredSettings(raw: string | null): NotificationSettings {
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DEFAULT_SETTINGS;
    return {
      masterPush:
        typeof parsed.masterPush === 'boolean' ? parsed.masterPush : DEFAULT_SETTINGS.masterPush,
      soundMode: parsed.soundMode === 'Silent' ? 'Silent' : 'Default',
      selectedPairs: Array.isArray(parsed.selectedPairs)
        ? parsed.selectedPairs.filter(
            (p: unknown): p is string => typeof p === 'string' && ALL_PAIRS.includes(p),
          )
        : DEFAULT_SETTINGS.selectedPairs,
      marketAlerts:
        typeof parsed.marketAlerts === 'boolean' ? parsed.marketAlerts : DEFAULT_SETTINGS.marketAlerts,
      calendarIcon:
        typeof parsed.calendarIcon === 'boolean' ? parsed.calendarIcon : DEFAULT_SETTINGS.calendarIcon,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

const LOCKED_SOUNDS = ['Chime', 'Bell', 'Alert', 'Success'];

const CUSTOM_SOUND_ROWS: { label: string; icon: React.ComponentProps<typeof Feather>['name']; color: string }[] = [
  { label: 'Signal Alerts', icon: 'zap', color: CYAN },
  { label: 'Sell Signals', icon: 'trending-down', color: '#E54B4B' },
  { label: 'TP Hit Alerts', icon: 'target', color: '#2ECA8B' },
  { label: 'SL Hit Alerts', icon: 'shield', color: YELLOW },
];

export default function NotificationSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const hydratedRef = useRef(false);
  const [hydrated, setHydrated] = useState(false);

  // Request notification permission + load saved settings on mount.
  useEffect(() => {
    let cancelled = false;
    if (Platform.OS !== 'web') {
      Notifications.requestPermissionsAsync().catch(() => {
        // Permission prompt failures are non-fatal — toggles still persist.
      });
    }
    AsyncStorage.getItem(NOTIFICATION_SETTINGS_KEY)
      .then((raw) => {
        if (!cancelled) setSettings(parseStoredSettings(raw));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          hydratedRef.current = true;
          setHydrated(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist every change (after hydration, so defaults don't clobber storage).
  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(settings)).catch(() => {});
  }, [hydrated, settings]);

  const update = useCallback(<K extends keyof NotificationSettings>(key: K, value: NotificationSettings[K]) => {
    setSettings((cur) => ({ ...cur, [key]: value }));
  }, []);

  const togglePair = useCallback((pair: string) => {
    setSettings((cur) => ({
      ...cur,
      selectedPairs: cur.selectedPairs.includes(pair)
        ? cur.selectedPairs.filter((p) => p !== pair)
        : [...cur.selectedPairs, pair],
    }));
  }, []);

  const openTelegram = useCallback(() => {
    Linking.openURL(TELEGRAM_VIP_URL).catch(() => {});
  }, []);

  const showProAlert = useCallback(() => {
    if (Platform.OS === 'web') {
      // eslint-disable-next-line no-alert
      window.alert('Volatility Alerts are a Pro feature. Upgrade to unlock real-time volatility notifications.');
      return;
    }
    Alert.alert(
      'Pro Feature',
      'Volatility Alerts are a Pro feature. Upgrade to unlock real-time volatility notifications.',
    );
  }, []);

  const sendTestNotification = useCallback(() => {
    Notifications.scheduleNotificationAsync({
      content: {
        title: 'TradiQs AI',
        body: 'Test notification received successfully! 🚀',
      },
      trigger: null,
    }).catch(() => {
      if (Platform.OS === 'web') {
        // eslint-disable-next-line no-alert
        window.alert('Test notifications are only available on a device.');
      }
    });
  }, []);

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          testID="notif-back"
          accessibilityLabel="Back"
        >
          <Feather name="chevron-left" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notification Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* A. Push Notifications */}
        <Text style={styles.sectionHeader}>PUSH NOTIFICATIONS</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={[styles.iconBubble, { backgroundColor: 'rgba(245,197,66,0.12)' }]}>
              <Feather name="bell" size={16} color={YELLOW} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>Push Notifications</Text>
              <Text style={styles.rowSub}>Receive alerts for new signals</Text>
            </View>
            <Switch
              value={settings.masterPush}
              onValueChange={(v) => update('masterPush', v)}
              trackColor={{ false: '#22252A', true: 'rgba(0,240,255,0.35)' }}
              thumbColor={settings.masterPush ? CYAN : '#8A8D93'}
              testID="toggle-masterPush"
            />
          </View>
        </View>

        {/* B. Telegram VIP */}
        <Text style={styles.sectionHeader}>TELEGRAM VIP CHANNEL</Text>
        <Text style={styles.sectionNote}>
          Premium members get real-time signals in the private VIP channel
        </Text>
        <TouchableOpacity style={styles.card} onPress={openTelegram} activeOpacity={0.8} testID="connect-telegram">
          <View style={styles.row}>
            <View style={[styles.iconBubble, { backgroundColor: 'rgba(59,130,246,0.12)' }]}>
              <Feather name="send" size={16} color={BLUE} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>Connect Telegram</Text>
            </View>
            <Feather name="chevron-right" size={18} color={c.mutedForeground} />
          </View>
        </TouchableOpacity>

        {/* C. Sound Enabled */}
        <Text style={styles.sectionHeader}>SOUND ENABLED</Text>
        <Text style={styles.sectionNote}>
          Default sound will play for all notifications. Select Silent for vibration only.
        </Text>
        <View style={styles.card}>
          {(['Default', 'Silent'] as SoundMode[]).map((mode, i) => (
            <TouchableOpacity
              key={mode}
              style={[styles.soundRow, i > 0 && styles.rowDivider]}
              onPress={() => update('soundMode', mode)}
              activeOpacity={0.8}
              testID={`sound-${mode}`}
            >
              <Text style={styles.rowLabel}>{mode}</Text>
              {settings.soundMode === mode && <Feather name="check" size={18} color={CYAN} />}
            </TouchableOpacity>
          ))}
          {LOCKED_SOUNDS.map((sound) => (
            <View key={sound} style={[styles.soundRow, styles.rowDivider]}>
              <Text style={styles.rowLabelLocked}>{sound}</Text>
              <Feather name="lock" size={15} color={c.mutedForeground} />
            </View>
          ))}
        </View>

        {/* D. Custom Alert Sounds */}
        <Text style={styles.sectionHeader}>CUSTOM ALERT SOUNDS</Text>
        <Text style={styles.sectionNote}>
          Currently available: Default and Silent. Custom sounds coming with app store release.
        </Text>
        <View style={styles.card}>
          {CUSTOM_SOUND_ROWS.map((row, i) => (
            <View key={row.label} style={[styles.row, i > 0 && styles.rowDivider]}>
              <View style={[styles.iconBubble, { backgroundColor: `${row.color}1F` }]}>
                <Feather name={row.icon} size={16} color={row.color} />
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{row.label}</Text>
                <Text style={styles.rowSub}>Default</Text>
              </View>
              <Feather name="chevron-right" size={18} color={c.mutedForeground} />
            </View>
          ))}
        </View>

        {/* E. Signal Pair Filter */}
        <Text style={styles.sectionHeader}>SIGNAL PAIR FILTER</Text>
        <Text style={styles.sectionNote}>
          You receive notifications for all trading signals. Tap pairs below to only get alerts
          for specific instruments.
        </Text>
        <View style={[styles.card, styles.pairCard]}>
          {PAIR_CATEGORIES.map((cat) => (
            <View key={cat.title} style={styles.pairCategory}>
              <Text style={styles.pairCategoryTitle}>{cat.title}</Text>
              <View style={styles.chipGrid}>
                {cat.pairs.map((pair) => {
                  const selected = settings.selectedPairs.includes(pair);
                  return (
                    <TouchableOpacity
                      key={pair}
                      style={[styles.chip, selected ? styles.chipSelected : styles.chipMuted]}
                      onPress={() => togglePair(pair)}
                      activeOpacity={0.8}
                      testID={`pair-${pair}`}
                    >
                      <Text style={[styles.chipText, selected ? styles.chipTextSelected : styles.chipTextMuted]}>
                        {pair}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
        </View>

        {/* F. System Alerts */}
        <Text style={styles.sectionHeader}>SYSTEM ALERTS</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={[styles.iconBubble, { backgroundColor: 'rgba(0,240,255,0.10)' }]}>
              <Feather name="sunrise" size={16} color={CYAN} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>Market Open Alerts</Text>
            </View>
            <Switch
              value={settings.marketAlerts}
              onValueChange={(v) => update('marketAlerts', v)}
              trackColor={{ false: '#22252A', true: 'rgba(0,240,255,0.35)' }}
              thumbColor={settings.marketAlerts ? CYAN : '#8A8D93'}
              testID="toggle-marketAlerts"
            />
          </View>
          <View style={[styles.row, styles.rowDivider]}>
            <View style={[styles.iconBubble, { backgroundColor: 'rgba(176,38,255,0.12)' }]}>
              <Feather name="calendar" size={16} color="#B026FF" />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>Economic Calendar</Text>
            </View>
            <Switch
              value={settings.calendarIcon}
              onValueChange={(v) => update('calendarIcon', v)}
              trackColor={{ false: '#22252A', true: 'rgba(0,240,255,0.35)' }}
              thumbColor={settings.calendarIcon ? CYAN : '#8A8D93'}
              testID="toggle-calendarIcon"
            />
          </View>
          <TouchableOpacity
            style={[styles.row, styles.rowDivider]}
            onPress={showProAlert}
            activeOpacity={0.8}
            testID="volatility-pro"
          >
            <View style={[styles.iconBubble, { backgroundColor: 'rgba(229,75,75,0.12)' }]}>
              <Feather name="activity" size={16} color="#E54B4B" />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>Volatility Alerts</Text>
            </View>
            <View style={styles.proBadge}>
              <Text style={styles.proBadgeText}>Pro</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Test notification */}
        <TouchableOpacity
          style={[styles.card, styles.testCard]}
          onPress={sendTestNotification}
          activeOpacity={0.8}
          testID="send-test-notification"
        >
          <View style={styles.row}>
            <View style={[styles.iconBubble, { backgroundColor: 'rgba(245,197,66,0.12)' }]}>
              <Feather name="send" size={16} color={YELLOW} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>Send test notification</Text>
              <Text style={styles.rowSub}>Verify notifications are working on this device</Text>
            </View>
          </View>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0B0E',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#22252A',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
  },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  sectionHeader: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.8,
    marginTop: 22,
    marginBottom: 8,
  },
  sectionNote: {
    color: c.mutedForeground,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    lineHeight: 17,
    marginBottom: 10,
  },
  card: {
    backgroundColor: '#16181D',
    borderWidth: 1,
    borderColor: '#22252A',
    borderRadius: colors.radius,
    paddingHorizontal: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: '#22252A',
  },
  iconBubble: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
  },
  rowLabelLocked: {
    flex: 1,
    color: c.mutedForeground,
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  rowSub: {
    color: c.mutedForeground,
    fontSize: 11.5,
    fontFamily: 'Inter_400Regular',
  },
  soundRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
  },
  pairCard: {
    paddingVertical: 4,
  },
  pairCategory: {
    paddingVertical: 10,
  },
  pairCategoryTitle: {
    color: c.mutedForeground,
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'transparent',
  },
  chipSelected: {
    borderColor: CYAN,
  },
  chipMuted: {
    borderColor: MUTED_CHIP,
  },
  chipText: {
    fontSize: 11.5,
    fontFamily: 'Inter_600SemiBold',
  },
  chipTextSelected: {
    color: CYAN,
  },
  chipTextMuted: {
    color: MUTED_CHIP,
  },
  proBadge: {
    backgroundColor: 'rgba(59,130,246,0.15)',
    borderWidth: 1,
    borderColor: BLUE,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  proBadgeText: {
    color: BLUE,
    fontSize: 11,
    fontFamily: 'Inter_700Bold',
  },
  testCard: {
    marginTop: 22,
  },
});
