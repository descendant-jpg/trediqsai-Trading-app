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

const NOTIFICATION_PREFS_KEY = 'tradiqs.notificationPrefs.v1';
const LANGUAGE_KEY = 'tradiqs.language.v1';

const LANGUAGES = ['English', 'Spanish', 'French'] as const;
type Language = (typeof LANGUAGES)[number];

interface NotificationPrefs {
  tradeAlerts: boolean;
  marketNews: boolean;
  partnerSignals: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = {
  tradeAlerts: true,
  marketNews: false,
  partnerSignals: false,
};

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
  | 'notifications'
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
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);

  // Change password
  const [newPassword, setNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);

  // Notification prefs (persisted in AsyncStorage)
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);

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
      const [{ data }, { count }] = await Promise.all([
        supabase
          .from('profiles')
          .select('username, referral_code')
          .eq('id', session.user.id)
          .single(),
        supabase
          .from('referrals')
          .select('id', { count: 'exact', head: true })
          .eq('referrer_id', session.user.id),
      ]);
      if (!cancelled) {
        setUsername(data?.username ?? null);
        setReferralCode(data?.referral_code ?? null);
        setReferralCount(count ?? 0);
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
        const [rawPrefs, rawLang] = await Promise.all([
          AsyncStorage.getItem(NOTIFICATION_PREFS_KEY),
          AsyncStorage.getItem(LANGUAGE_KEY),
        ]);
        if (rawPrefs) setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(rawPrefs) });
        if (rawLang && (LANGUAGES as readonly string[]).includes(rawLang)) {
          setLanguage(rawLang as Language);
        }
      } catch {
        // Non-fatal: fall back to defaults.
      }
    })();
  }, []);

  const updatePref = (key: keyof NotificationPrefs, value: boolean) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    AsyncStorage.setItem(NOTIFICATION_PREFS_KEY, JSON.stringify(next)).catch(() => {});
  };

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
      <ScrollView contentContainerStyle={styles.content}>
        {/* Section 1 — User Info */}
        <View style={styles.userCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(username ?? email ?? 'T').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.username}>{username ?? 'Trader'}</Text>
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

        {/* Section 2 — Wallet & Referrals */}
        <Section title="WALLET & REFERRALS">
          <ListItem
            icon="dollar-sign"
            label="Withdraw Funds"
            onPress={() =>
              showAlert(
                'Withdraw Funds',
                isSubscribed
                  ? 'Payout requests open at the end of each evaluation cycle.'
                  : 'Withdrawals are available on paid plans. Upgrade to Pro to unlock payouts.',
              )
            }
            testID="profile-withdraw"
          />
          <View style={styles.referralBlock}>
            <Text style={styles.referralLabel}>Your referral link</Text>
            <Text style={styles.referralLink} numberOfLines={1}>
              {referralLink ?? 'Loading…'}
            </Text>
            <View style={styles.referralRow}>
              <Text style={styles.referralCount}>
                Users Joined: {referralCount ?? '—'}
              </Text>
              <TouchableOpacity
                style={[styles.shareButton, !referralLink && styles.disabled]}
                onPress={handleShareReferral}
                disabled={!referralLink}
                activeOpacity={0.85}
                testID="profile-share-referral"
              >
                <Feather name="share-2" size={14} color="#0A0B0E" />
                <Text style={styles.shareButtonText}>Share</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Section>

        {/* Section 3 — Account Settings */}
        <Section title="ACCOUNT SETTINGS">
          <ListItem
            icon="lock"
            label="Change Password"
            onPress={() => setActiveModal('password')}
            testID="profile-change-password"
          />
          <ListItem
            icon="trash-2"
            label={deleting ? 'Deleting…' : 'Delete Account'}
            onPress={deleting ? undefined : handleDeleteAccount}
            testID="profile-delete-account"
          />
          <ListItem
            icon="globe"
            label="Language"
            detail={language}
            onPress={() => setActiveModal('language')}
            testID="profile-language"
          />
          <ListItem
            icon="clock"
            label="Trading Day Timezone"
            detail={tradingDayTz.replace(/_/g, ' ')}
            onPress={() => setTzPickerOpen(true)}
            testID="profile-timezone"
          />
          <ListItem
            icon="bell"
            label="Notifications"
            onPress={() => setActiveModal('notifications')}
            testID="profile-notifications"
          />
        </Section>

        {/* Section 4 — Partner Program */}
        <Section title="PARTNER PROGRAM">
          <ListItem icon="link" label="Crypto Brokers" onPress={() => openPartner('Crypto Brokers')} />
          <ListItem icon="bar-chart-2" label="Forex Partners" onPress={() => openPartner('Forex Partners')} />
          <ListItem icon="trending-up" label="Stock Partners" onPress={() => openPartner('Stock Partners')} />
        </Section>

        {/* Section 5 — Support & Socials */}
        <Section title="SUPPORT & SOCIALS">
          <ListItem
            icon="mail"
            label="Contact Us"
            onPress={() => openLink('mailto:support@tradiqsai.com', 'Contact Us')}
            testID="profile-contact"
          />
          <ListItem
            icon="help-circle"
            label="Help & FAQs"
            onPress={() =>
              showAlert(
                'Help & FAQs',
                'Need help? Email support@tradiqsai.com and we normally reply within 24 hours. A full FAQ hub is coming soon.',
              )
            }
          />
          <ListItem
            icon="book-open"
            label="App Guide"
            onPress={() =>
              showAlert(
                'App Guide',
                '1. Open trades on the Trading Floor.\n2. Track positions in Portfolio.\n3. Follow AI Signals for entries.\n4. Keep your equity above the daily loss limit to stay funded.',
              )
            }
          />
          <ListItem
            icon="send"
            label="Telegram Channel"
            onPress={() => openLink(TELEGRAM_CHANNEL_URL, 'Telegram Channel')}
            testID="profile-telegram-channel"
          />
          <ListItem
            icon="message-circle"
            label="Telegram Group"
            onPress={() => openLink(TELEGRAM_GROUP_URL, 'Telegram Group')}
            testID="profile-telegram-group"
          />
          <ListItem
            icon="twitter"
            label="X / Twitter"
            onPress={() => openLink('https://x.com/tradiqsai', 'X / Twitter')}
          />
          <ListItem
            icon="instagram"
            label="Instagram"
            onPress={() => openLink('https://instagram.com/tradiqsai', 'Instagram')}
          />
        </Section>

        {/* Section 6 — Legal */}
        <Section title="LEGAL">
          <ListItem
            icon="file-text"
            label="Terms and Conditions"
            onPress={() => setActiveModal('terms')}
            testID="profile-terms"
          />
          <ListItem
            icon="shield"
            label="Privacy Policy"
            onPress={() => setActiveModal('privacy')}
            testID="profile-privacy"
          />
        </Section>

        {/* Section 7 — Sign Out */}
        <TouchableOpacity
          style={styles.signOutButton}
          onPress={handleSignOut}
          activeOpacity={0.85}
          testID="profile-sign-out"
        >
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
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

      {/* Notification Preferences */}
      <SheetModal
        visible={activeModal === 'notifications'}
        title="Notification Preferences"
        onClose={() => setActiveModal(null)}
      >
        {(
          [
            ['tradeAlerts', 'Trade Execution Alerts'],
            ['marketNews', 'Daily Market News'],
            ['partnerSignals', 'Partner Signals'],
          ] as [keyof NotificationPrefs, string][]
        ).map(([key, label]) => (
          <View key={key} style={styles.switchRow}>
            <Text style={styles.switchLabel}>{label}</Text>
            <Switch
              value={prefs[key]}
              onValueChange={(v) => updatePref(key, v)}
              trackColor={{ false: '#22252A', true: '#00F0FF' }}
              thumbColor="#FFFFFF"
              testID={`switch-${key}`}
            />
          </View>
        ))}
      </SheetModal>

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
  switchRow: {
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
  switchLabel: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontFamily: 'Inter_500Medium',
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
