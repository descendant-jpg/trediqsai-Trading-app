import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useTrading } from '@/context/TradingContext';
import TimezonePickerModal from '@/components/TimezonePickerModal';
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

type IconName = React.ComponentProps<typeof Feather>['name'];

function ListItem({
  icon,
  label,
  value,
  onPress,
  testID,
}: {
  icon: IconName;
  label: string;
  value?: string;
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
      {!!value && (
        <Text style={styles.listItemValue} numberOfLines={1}>
          {value}
        </Text>
      )}
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

/** Profile — account, wallet, settings, partners, support, and legal. */
export default function ProfileScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();
  const { isSubscribed } = useSubscription();
  const [username, setUsername] = useState<string | null>(null);
  const [legalDoc, setLegalDoc] = useState<'terms' | 'privacy' | null>(null);
  const { tradingDayTz, setTradingDayTz } = useTrading();
  const [tzPickerOpen, setTzPickerOpen] = useState(false);

  const email = session?.user?.email ?? '';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!session) return;
      const { data } = await supabase
        .from('profiles')
        .select('username')
        .eq('id', session.user.id)
        .single();
      if (!cancelled) setUsername(data?.username ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [session]);

  const comingSoon = useCallback(
    (feature: string) => () =>
      showAlert(feature, 'This feature is coming soon.'),
    [],
  );

  const handleContact = () => {
    Linking.openURL('mailto:support@tradiqsai.com').catch(() =>
      showAlert('Contact Us', 'Email us at support@tradiqsai.com'),
    );
  };

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err: any) {
      showAlert('Sign out failed', err?.message ?? 'Unknown error');
    }
  };

  const referralLink = `https://tradiqsai.com/r/${username ?? 'trader'}`;

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
              {referralLink}
            </Text>
            <Text style={styles.referralCount}>Users Joined: 0</Text>
          </View>
        </Section>

        {/* Section 3 — Account Settings */}
        <Section title="ACCOUNT SETTINGS">
          <ListItem icon="lock" label="Change Password" onPress={comingSoon('Change Password')} />
          <ListItem icon="trash-2" label="Delete Account" onPress={comingSoon('Delete Account')} />
          <ListItem icon="globe" label="Language" onPress={comingSoon('Language')} />
          <ListItem
            icon="clock"
            label="Trading Day Timezone"
            value={tradingDayTz.replace(/_/g, ' ')}
            onPress={() => setTzPickerOpen(true)}
            testID="profile-timezone"
          />
          <ListItem icon="bell" label="Notifications" onPress={comingSoon('Notifications')} />
        </Section>

        {/* Section 4 — Partner Program */}
        <Section title="PARTNER PROGRAM">
          <ListItem icon="link" label="Crypto Brokers" onPress={comingSoon('Crypto Brokers')} />
          <ListItem icon="bar-chart-2" label="Forex Partners" onPress={comingSoon('Forex Partners')} />
          <ListItem icon="trending-up" label="Stock Partners" onPress={comingSoon('Stock Partners')} />
        </Section>

        {/* Section 5 — Support & Socials */}
        <Section title="SUPPORT & SOCIALS">
          <ListItem icon="mail" label="Contact Us" onPress={handleContact} testID="profile-contact" />
          <ListItem icon="help-circle" label="Help & FAQs" onPress={comingSoon('Help & FAQs')} />
          <ListItem icon="book-open" label="App Guide" onPress={comingSoon('App Guide')} />
          <ListItem icon="send" label="Telegram Channel" onPress={comingSoon('Telegram Channel')} />
          <ListItem icon="message-circle" label="Telegram Group" onPress={comingSoon('Telegram Group')} />
          <ListItem icon="twitter" label="X / Twitter" onPress={comingSoon('X / Twitter')} />
          <ListItem icon="instagram" label="Instagram" onPress={comingSoon('Instagram')} />
        </Section>

        {/* Section 6 — Legal */}
        <Section title="LEGAL">
          <ListItem
            icon="file-text"
            label="Terms and Conditions"
            onPress={() => setLegalDoc('terms')}
            testID="profile-terms"
          />
          <ListItem
            icon="shield"
            label="Privacy Policy"
            onPress={() => setLegalDoc('privacy')}
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

      {/* Trading-day timezone picker */}
      <TimezonePickerModal
        visible={tzPickerOpen}
        current={tradingDayTz}
        onClose={() => setTzPickerOpen(false)}
        onSelect={(tz) => {
          const ok = setTradingDayTz(tz);
          if (!ok) showAlert('Timezone', `"${tz}" is not a valid timezone.`);
          return ok;
        }}
      />

      {/* Legal modal */}
      <Modal
        visible={legalDoc !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setLegalDoc(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {legalDoc === 'terms' ? 'Terms and Conditions' : 'Privacy Policy'}
              </Text>
              <TouchableOpacity
                onPress={() => setLegalDoc(null)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                testID="legal-close"
              >
                <Feather name="x" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll}>
              <Text style={styles.modalBody}>
                {legalDoc === 'terms' ? TERMS_AND_CONDITIONS : PRIVACY_POLICY}
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  listItemValue: {
    color: '#00F0FF',
    fontSize: 12.5,
    fontFamily: 'Inter_500Medium',
    maxWidth: 150,
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
    height: '85%',
    backgroundColor: '#0A0B0E',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: '#22252A',
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
    color: '#C7C9CE',
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 21,
    paddingVertical: 16,
  },
});
