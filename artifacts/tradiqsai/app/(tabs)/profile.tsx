import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import TimezonePickerModal from '@/components/TimezonePickerModal';
import { useTrading } from '@/context/TradingContext';
import { useAuth } from '@/context/AuthContext';
import { useSubscription } from '@/lib/revenuecat';
import { PRIVACY_POLICY, TERMS_AND_CONDITIONS } from '@/lib/legalContent';
import { supabase } from '@/utils/supabase';
import colors from '@/constants/colors';
import { AcademyModal } from '@/components/AcademyModal';
import { SocialMediaModal } from '@/components/SocialMediaModal';

function showAlert(title: string, message: string) {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    window.alert(`${title}\n\n${message}`);
  } else {
    Alert.alert(title, message);
  }
}

/** Confirm dialog that actually works on web (Alert buttons are a no-op there). */
function showConfirm(title: string, message: string, onConfirm: () => void) {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
  } else {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: onConfirm },
    ]);
  }
}

const LANGUAGE_KEY = 'tradiqs.language.v1';

const LANGUAGES = ['English', 'Spanish', 'French'] as const;
type Language = (typeof LANGUAGES)[number];

const TELEGRAM_CHANNEL_URL = 'https://t.me/tradiqsai';
const TELEGRAM_GROUP_URL = 'https://t.me/tradiqsai_chat';

const PARTNER_PROGRAM_COPY: Record<string, string> = {
  'Crypto Brokers':
    'Our crypto affiliate program connects you with vetted crypto broker partners. When you open a live account through a TradiQs partner link, you support the platform at no extra cost — and unlock partner-exclusive signal streams as they launch.',
  'Forex Partners':
    'The forex partner program links your TradiQs progress to real forex brokers. Graduates of the simulated challenge get priority referrals to our partner brokers, plus reduced-spread promotions negotiated for the TradiQs community.',
  'Stock Partners':
    'Our stock brokerage partners offer commission-free equity trading for TradiQs members. Referral rewards from partner signups help keep the simulated terminal free — full partner integrations are rolling out soon.',
};

type IconName = React.ComponentProps<typeof Feather>['name'];

function ListItem({
  icon,
  label,
  detail,
  onPress,
  testID,
}: {
  icon: IconName;
  label: string;
  detail?: string;
  onPress?: () => void;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      style={styles.listItem}
      onPress={onPress}
      activeOpacity={0.8}
      testID={testID}
    >
      <Feather name={icon} size={18} color="#8A8D93" />
      <Text style={styles.listItemLabel}>{label}</Text>
      {!!detail && <Text style={styles.listItemDetail}>{detail}</Text>}
      <Feather name="chevron-right" size={18} color="#8A8D93" />
    </TouchableOpacity>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

/** Bottom-sheet style modal shell shared by all profile modals. */
function SheetModal({
  visible,
  title,
  onClose,
  children,
  scroll = false,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  scroll?: boolean;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, scroll && styles.modalCardTall]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              testID="modal-close"
            >
              <Feather name="x" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          {scroll ? (
            <ScrollView style={styles.modalScroll}>{children}</ScrollView>
          ) : (
            <View style={styles.modalBody}>{children}</View>
          )}
        </View>
      </View>
    </Modal>
  );
}

type ActiveModal =
  | null
  | 'password'
  | 'language'
  | 'terms'
  | 'privacy'
  | 'partner';

/** Profile — account, wallet, settings, partners, support, and legal. */
export default function ProfileScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const { isSubscribed } = useSubscription();
  const { tradingDayTz, setTradingDayTz } = useTrading();
  const [tzPickerOpen, setTzPickerOpen] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referralCount, setReferralCount] = useState<number | null>(null);
  const [referralEarned, setReferralEarned] = useState<number | null>(null);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const [academyOpen, setAcademyOpen] = useState(false);
  const [socialOpen, setSocialOpen] = useState(false);

  // Change password
  const [newPassword, setNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  // Language (persisted in AsyncStorage)
  const [language, setLanguage] = useState<Language>('English');

  // Partner program modal content
  const [partnerTopic, setPartnerTopic] = useState<string>('Crypto Brokers');

  // Delete account
  const [deleting, setDeleting] = useState(false);

  const email = session?.user?.email ?? '';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!session) return;
      const [{ data }, { data: refRows, count }] = await Promise.all([
        supabase
          .from('profiles')
          .select('username, referral_code')
          .eq('id', session.user.id)
          .single(),
        supabase
          .from('referrals')
          .select('reward_amount', { count: 'exact' })
          .eq('referrer_id', session.user.id),
      ]);
      if (!cancelled) {
        setUsername(data?.username ?? null);
        setReferralCode(data?.referral_code ?? null);
        setReferralCount(count ?? 0);
        setReferralEarned(
          (refRows ?? []).reduce(
            (sum, row: { reward_amount: number | null }) =>
              sum + (Number(row.reward_amount) || 0),
            0,
          ),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  // Restore persisted settings.
  useEffect(() => {
    (async () => {
      try {
        const rawLang = await AsyncStorage.getItem(LANGUAGE_KEY);
        if (rawLang && (LANGUAGES as readonly string[]).includes(rawLang)) {
          setLanguage(rawLang as Language);
        }
      } catch {
        // Non-fatal: fall back to defaults.
      }
    })();
  }, []);

  const selectLanguage = (lang: Language) => {
    setLanguage(lang);
    AsyncStorage.setItem(LANGUAGE_KEY, lang).catch(() => {});
    setActiveModal(null);
    showAlert('Language', `Language set to ${lang}.`);
  };

  const handleSavePassword = async () => {
    if (newPassword.length < 8) {
      showAlert('Change Password', 'Password must be at least 8 characters.');
      return;
    }
    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword('');
      setActiveModal(null);
      showAlert('Change Password', 'Your password has been updated.');
    } catch (err: any) {
      showAlert('Change Password', err?.message ?? 'Failed to update password.');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleDeleteAccount = () => {
    showConfirm(
      'Delete Account',
      'Are you sure? This cannot be undone.',
      async () => {
        setDeleting(true);
        // Flag the profile for deletion; auth users can't be hard-deleted from
        // the client. Sign-out proceeds either way, but the message must be
        // honest about whether the flag was actually recorded.
        let flagged = false;
        try {
          const { error } = await supabase.rpc('request_account_deletion');
          flagged = !error;
        } catch {
          flagged = false;
        }
        try {
          showAlert(
            'Account Deletion',
            flagged
              ? 'Your account has been flagged for deletion. You will now be signed out.'
              : 'We could not record the deletion request right now. You will be signed out — please contact support@tradiqsai.com to complete deletion.',
          );
          await signOut();
        } catch (err: any) {
          showAlert('Delete Account', err?.message ?? 'Failed to sign out.');
        } finally {
          setDeleting(false);
        }
      },
    );
  };

  const openLink = (url: string, fallbackLabel: string) => {
    Linking.openURL(url).catch(() => showAlert(fallbackLabel, url));
  };

  const openPartner = (topic: string) => {
    setPartnerTopic(topic);
    setActiveModal('partner');
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err: any) {
      showAlert('Sign out failed', err?.message ?? 'Unknown error');
    }
  };

  const referralLink = referralCode
    ? `https://tradiqsai.com/r/${referralCode}`
    : null;

  const handleShareReferral = async () => {
    if (!referralLink) return;
    const message = `Join me on TradiQs AI — use my invite link: ${referralLink}`;
    try {
      if (Platform.OS === 'web') {
        // Native share sheet where supported; clipboard fallback elsewhere.
        if (typeof navigator !== 'undefined' && (navigator as any).share) {
          await (navigator as any).share({ title: 'TradiQs AI', text: message, url: referralLink });
        } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
          await navigator.clipboard.writeText(referralLink);
          showAlert('Copied', 'Referral link copied to clipboard.');
        } else {
          showAlert('Your referral link', referralLink);
        }
      } else {
        await Share.share(
          Platform.OS === 'ios'
            ? { message, url: referralLink }
            : { message },
        );
      }
    } catch {
      // User dismissed the share sheet — nothing to do.
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.identityHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(username ?? email ?? 'T').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.userInfo}>
            <View style={styles.nameRow}><Text style={styles.username}>{username ?? 'Trader'}</Text><Text style={styles.verified}>✓ Verified</Text></View>
            {!!email && <Text style={styles.email}>{email}</Text>}
            <View style={styles.planBadge}>
              <Text style={styles.planText}>
                {isSubscribed ? 'PRO PLAN' : 'FREE PLAN'}
              </Text>
            </View>
          </View>
        </View>
        {!isSubscribed && (
          <TouchableOpacity
            style={styles.upgradeButton}
            onPress={() => router.push('/signals')}
            activeOpacity={0.85}
            testID="profile-upgrade"
          >
            <Feather name="zap" size={18} color="#0A0B0E" />
            <Text style={styles.upgradeText}>Upgrade to Pro</Text>
          </TouchableOpacity>
        )}
        <View style={styles.walletCard}><View style={styles.walletTop}><View><Text style={styles.walletLabel}>SIMULATED EQUITY</Text><Text style={styles.walletBalance}>$104,250.00</Text></View><TouchableOpacity style={styles.payout} onPress={() => showAlert('Request Payout', 'Payout requests open at the end of each evaluation cycle.')}><Text style={styles.payoutText}>Request Payout</Text></TouchableOpacity></View><View style={styles.walletDivider} /><View style={styles.walletBottom}><View><Text style={styles.walletLabel}>CASHBACK & REFERRALS</Text><Text style={styles.cashBalance}>${(referralEarned ?? 125.5).toFixed(2)}</Text></View><TouchableOpacity onPress={() => showAlert('Withdraw', 'Referral withdrawals will be available soon.')}><Text style={styles.withdrawText}>Withdraw →</Text></TouchableOpacity></View></View>
        <View style={styles.metrics}><Metric label="WIN RATE" value="68%" color={c.success} /><Metric label="PROFIT FACTOR" value="1.8" /><Metric label="TOTAL TRADES" value="142" /></View>
        <Banner icon="book-open" title="TradiQs Academy" subtitle="Masterclasses, Guides & Risk Tools" onPress={() => setAcademyOpen(true)} testID="profile-academy" />
        <Banner icon="briefcase" title="Portfolio & History" subtitle="View open positions and trade journal" onPress={() => router.push('/portfolio')} testID="profile-portfolio" />
        <Text style={styles.sectionTitle}>QUICK TOOLS</Text>
        <View style={styles.toolsGrid}><Tool icon="cpu" label="AutoPilot Bots" /><Tool icon="link" label="BrokerSync" /><Tool icon="gift" label="Refer & Earn" badge="+$5" onPress={() => router.push('/partner-program')} /><Tool icon="star" label="Manage Plan" gold onPress={() => router.push('/signals')} /></View>
        <SettingsGroup title="SECURITY"><ListItem icon="lock" label="Biometrics / FaceID" detail="OFF" /><ListItem icon="shield" label="Two-Factor Auth (2FA)" /></SettingsGroup>
        <SettingsGroup title="PREFERENCES"><ListItem icon="bell" label="Notifications" onPress={() => router.push('/notification-settings')} testID="profile-notifications" /><ListItem icon="sliders" label="Chart Settings" /><ListItem icon="globe" label="Language" detail={language} onPress={() => setActiveModal('language')} /><ListItem icon="clock" label="Trading Day Timezone" detail={tradingDayTz.replace(/_/g, ' ')} onPress={() => setTzPickerOpen(true)} /></SettingsGroup>
        <SettingsGroup title="SUPPORT"><ListItem icon="help-circle" label="Help Center" onPress={() => showAlert('Help Center', 'Email support@tradiqsai.com for assistance.')} /><ListItem icon="share-2" label="Social Media" onPress={() => setSocialOpen(true)} testID="profile-social-media" /><ListItem icon="book-open" label="App Guide" onPress={() => showAlert('App Guide', 'Open the Trading Floor, follow Signals, and track your Portfolio.')} /><ListItem icon="file-text" label="Terms & Privacy" onPress={() => setActiveModal('terms')} /></SettingsGroup>
        <TouchableOpacity style={styles.community} onPress={() => openLink(TELEGRAM_GROUP_URL, 'Elite Community')}><Feather name="send" size={17} color={c.primaryForeground} /><Text style={styles.communityText}>Join the TradiQs Elite Community</Text></TouchableOpacity>
        <TouchableOpacity
          style={styles.signOutButton}
          onPress={handleSignOut}
          activeOpacity={0.85}
          testID="profile-sign-out"
        >
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
        <Text style={styles.version}>TradiQs AI v1.0.0</Text>
      </ScrollView>

      {/* Trading-day timezone picker (restored from settings task) */}
      <TimezonePickerModal
        visible={tzPickerOpen}
        current={tradingDayTz}
        onClose={() => setTzPickerOpen(false)}
        onSelect={(tz) => {
          const ok = setTradingDayTz(tz);
          if (!ok) showAlert('Timezone', `"${tz}" is not a valid timezone.`);
          else setTzPickerOpen(false);
          return ok;
        }}
      />

      {/* Change Password */}
      <SheetModal
        visible={activeModal === 'password'}
        title="Change Password"
        onClose={() => setActiveModal(null)}
      >
        <Text style={styles.fieldLabel}>New Password</Text>
        <TextInput
          style={styles.input}
          value={newPassword}
          onChangeText={setNewPassword}
          placeholder="At least 8 characters"
          placeholderTextColor="#8A8D93"
          secureTextEntry
          autoCapitalize="none"
          testID="password-input"
        />
        <TouchableOpacity
          style={[styles.primaryButton, savingPassword && styles.disabled]}
          onPress={handleSavePassword}
          disabled={savingPassword}
          activeOpacity={0.85}
          testID="password-save"
        >
          {savingPassword ? (
            <ActivityIndicator color="#0A0B0E" />
          ) : (
            <Text style={styles.primaryButtonText}>Save Password</Text>
          )}
        </TouchableOpacity>
      </SheetModal>
      <AcademyModal visible={academyOpen} onClose={() => setAcademyOpen(false)} />
      <SocialMediaModal visible={socialOpen} onClose={() => setSocialOpen(false)} />

      {/* Language */}
      <SheetModal
        visible={activeModal === 'language'}
        title="Language"
        onClose={() => setActiveModal(null)}
      >
        {LANGUAGES.map((lang) => (
          <TouchableOpacity
            key={lang}
            style={styles.languageRow}
            onPress={() => selectLanguage(lang)}
            activeOpacity={0.8}
            testID={`language-${lang.toLowerCase()}`}
          >
            <Text
              style={[
                styles.languageLabel,
                language === lang && styles.languageLabelActive,
              ]}
            >
              {lang}
            </Text>
            {language === lang && <Feather name="check" size={18} color="#00F0FF" />}
          </TouchableOpacity>
        ))}
      </SheetModal>

      {/* Partner Program */}
      <SheetModal
        visible={activeModal === 'partner'}
        title={partnerTopic}
        onClose={() => setActiveModal(null)}
      >
        <Text style={styles.partnerBody}>{PARTNER_PROGRAM_COPY[partnerTopic]}</Text>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => setActiveModal(null)}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryButtonText}>Got It</Text>
        </TouchableOpacity>
      </SheetModal>

      {/* Legal documents */}
      <SheetModal
        visible={activeModal === 'terms' || activeModal === 'privacy'}
        title={activeModal === 'terms' ? 'Terms and Conditions' : 'Privacy Policy'}
        onClose={() => setActiveModal(null)}
        scroll
      >
        <Text style={styles.legalBody}>
          {activeModal === 'terms' ? TERMS_AND_CONDITIONS : PRIVACY_POLICY}
        </Text>
      </SheetModal>
    </View>
  );
}

const c = colors.light;

function Metric({ label, value, color = c.foreground }: { label: string; value: string; color?: string }) {
  return <View style={styles.metric}><Text style={styles.metricLabel}>{label}</Text><Text style={[styles.metricValue, { color }]}>{value}</Text></View>;
}

function Banner({ icon, title, subtitle, onPress, testID }: { icon: IconName; title: string; subtitle: string; onPress: () => void; testID?: string }) {
  return <TouchableOpacity style={styles.banner} onPress={onPress} testID={testID}><View style={styles.bannerIcon}><Feather name={icon} size={22} color={c.primary} /></View><View style={styles.bannerCopy}><Text style={styles.bannerTitle}>{title}</Text><Text style={styles.bannerSubtitle}>{subtitle}</Text></View><Feather name="arrow-up-right" size={18} color={c.primary} /></TouchableOpacity>;
}

function Tool({ icon, label, badge, gold, onPress }: { icon: IconName; label: string; badge?: string; gold?: boolean; onPress?: () => void }) {
  return <TouchableOpacity style={styles.tool} onPress={onPress}><View style={[styles.toolIcon, gold && styles.goldIcon]}><Feather name={icon} size={19} color={gold ? '#E6C65C' : c.primary} /></View><Text style={styles.toolLabel}>{label}</Text>{badge && <Text style={styles.toolBadge}>{badge}</Text>}</TouchableOpacity>;
}

function SettingsGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.settingsGroup}><Text style={styles.sectionTitle}>{title}</Text><View style={styles.sectionCard}>{children}</View></View>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0B0E',
  },
  content: {
    paddingTop: 64,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  identityHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingBottom: 18 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  verified: { color: c.success, fontSize: 10, fontFamily: 'Inter_700Bold' },
  walletCard: { backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 16 },
  walletTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  walletBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14 },
  walletLabel: { color: c.mutedForeground, fontSize: 9, letterSpacing: 1, fontFamily: 'Inter_700Bold' },
  walletBalance: { color: c.foreground, fontSize: 26, fontFamily: 'Inter_700Bold', marginTop: 5 },
  cashBalance: { color: c.success, fontSize: 20, fontFamily: 'Inter_700Bold', marginTop: 5 },
  payout: { borderColor: c.primary, borderWidth: 1, borderRadius: 16, paddingHorizontal: 11, paddingVertical: 7 },
  payoutText: { color: c.primary, fontSize: 10, fontFamily: 'Inter_700Bold' },
  withdrawText: { color: c.primary, fontSize: 11, fontFamily: 'Inter_700Bold' },
  walletDivider: { height: 1, backgroundColor: c.border, marginTop: 16 },
  metrics: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 18 },
  metric: { alignItems: 'center', gap: 4 }, metricLabel: { color: c.mutedForeground, fontSize: 8, letterSpacing: .8, fontFamily: 'Inter_700Bold' }, metricValue: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 10 },
  bannerIcon: { width: 42, height: 42, borderRadius: 10, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' },
  bannerCopy: { flex: 1 }, bannerTitle: { color: c.foreground, fontSize: 14, fontFamily: 'Inter_700Bold' }, bannerSubtitle: { color: c.mutedForeground, fontSize: 11, marginTop: 4 },
  toolsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  tool: { width: '48%', minHeight: 96, backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 11, padding: 12, justifyContent: 'space-between' },
  toolIcon: { width: 32, height: 32, borderRadius: 8, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' }, goldIcon: { borderColor: '#80691F', borderWidth: 1 },
  toolLabel: { color: c.foreground, fontSize: 11, fontFamily: 'Inter_600SemiBold' }, toolBadge: { position: 'absolute', right: 8, top: 8, color: c.success, fontSize: 9, fontFamily: 'Inter_700Bold' },
  settingsGroup: { marginBottom: 18 },
  community: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: c.primary, borderRadius: 10, paddingVertical: 15, marginTop: 2 },
  communityText: { color: c.primaryForeground, fontSize: 12, fontFamily: 'Inter_700Bold' },
  version: { color: '#3E4249', fontSize: 9, textAlign: 'center', marginTop: 22 },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#16181D',
    borderWidth: 1,
    borderColor: '#22252A',
    borderRadius: colors.radius,
    padding: 16,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0A0B0E',
    borderWidth: 1.5,
    borderColor: '#00F0FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#00F0FF',
    fontSize: 22,
    fontFamily: 'Inter_700Bold',
  },
  userInfo: {
    flex: 1,
    gap: 3,
  },
  username: {
    color: '#FFFFFF',
    fontSize: 17,
    fontFamily: 'Inter_700Bold',
  },
  email: {
    color: '#8A8D93',
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
  },
  planBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#0A0B0E',
    borderWidth: 1,
    borderColor: '#B026FF',
    borderRadius: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginTop: 4,
  },
  planText: {
    color: '#B026FF',
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 1,
  },
  upgradeButton: {
    flexDirection: 'row',
    gap: 8,
    height: 50,
    borderRadius: colors.radius,
    backgroundColor: '#00F0FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  upgradeText: {
    color: '#0A0B0E',
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    color: '#8A8D93',
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1.2,
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionCard: {
    backgroundColor: '#16181D',
    borderWidth: 1,
    borderColor: '#22252A',
    borderRadius: colors.radius,
    overflow: 'hidden',
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    height: 52,
    borderBottomWidth: 1,
    borderBottomColor: '#22252A',
  },
  listItemLabel: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14.5,
    fontFamily: 'Inter_500Medium',
  },
  listItemDetail: {
    color: '#8A8D93',
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  referralBlock: {
    padding: 16,
    gap: 4,
  },
  referralLabel: {
    color: '#8A8D93',
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  referralLink: {
    color: '#00F0FF',
    fontSize: 13.5,
    fontFamily: 'Inter_600SemiBold',
  },
  referralCount: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    marginTop: 4,
  },
  referralEarned: {
    color: '#22C55E',
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    marginTop: 2,
  },
  referralRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#00F0FF',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  shareButtonText: {
    color: '#0A0B0E',
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
  },
  signOutButton: {
    height: 54,
    borderRadius: colors.radius,
    borderWidth: 1,
    borderColor: '#E54B4B',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 32,
  },
  signOutText: {
    color: '#E54B4B',
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#0A0B0E',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: '#22252A',
    paddingBottom: 24,
  },
  modalCardTall: {
    height: '85%',
    paddingBottom: 0,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#22252A',
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
  modalScroll: {
    paddingHorizontal: 18,
  },
  modalBody: {
    padding: 18,
    gap: 12,
  },
  legalBody: {
    color: '#C7C9CE',
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 21,
    paddingVertical: 16,
  },
  fieldLabel: {
    color: '#8A8D93',
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.5,
  },
  input: {
    height: 50,
    backgroundColor: '#16181D',
    borderWidth: 1,
    borderColor: '#22252A',
    borderRadius: colors.radius,
    paddingHorizontal: 14,
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'Inter_500Medium',
  },
  primaryButton: {
    height: 50,
    borderRadius: colors.radius,
    backgroundColor: '#00F0FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  primaryButtonText: {
    color: '#0A0B0E',
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
  },
  disabled: {
    opacity: 0.7,
  },
  languageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#16181D',
    borderWidth: 1,
    borderColor: '#22252A',
    borderRadius: colors.radius,
    paddingHorizontal: 14,
    height: 54,
  },
  languageLabel: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontFamily: 'Inter_500Medium',
  },
  languageLabelActive: {
    color: '#00F0FF',
    fontFamily: 'Inter_700Bold',
  },
  partnerBody: {
    color: '#C7C9CE',
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    lineHeight: 22,
  },
});
