import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import colors from '@/constants/colors';
import { useSubscription } from '@/lib/revenuecat';
import { useLocalSearchParams } from 'expo-router';

const c = colors.light;

type BillingCycle = 'monthly' | 'annual';
type SubscriptionTier = 'PRO' | 'ELITE';

const MONTHLY_PRICE_FALLBACK = '$29.99';
const ANNUAL_PRICE_FALLBACK = '$199.99';

type Feature = { icon: keyof typeof Feather.glyphMap; title: string; body: string };

const PRO_FEATURES: Feature[] = [
  {
    icon: 'crosshair',
    title: 'Real-Time Signal Targets',
    body: 'Instant access to Entry, TP1/TP2/TP3, and SL for all assets.',
  },
  {
    icon: 'cpu',
    title: 'AI AutoPilot Execution',
    body: 'Deploy high-yield automated bots directly on your balance.',
  },
  {
    icon: 'message-circle',
    title: 'TradiQs Oracle AI',
    body: 'Unlimited market analysis, chart breakdowns, and setup checks.',
  },
  {
    icon: 'bell',
    title: 'VIP Telegram Alerts',
    body: 'Real-time push notifications sent directly to your phone and Telegram.',
  },
  {
    icon: 'bar-chart-2',
    title: 'Advanced Analytics',
    body: 'Detailed win-rate tracking, equity curves, and risk metrics.',
  },
];
const ELITE_FEATURES: Feature[] = [
  ...PRO_FEATURES,
  {
    icon: 'activity',
    title: 'Whale Wallet Tracking',
    body: 'Live alerts for institutional block trades and dark pool activity.',
  },
  {
    icon: 'git-merge',
    title: 'Direct API Webhooks',
    body: 'Connect AI signals directly to MT4, MT5, and NinjaTrader.',
  },
  {
    icon: 'zap',
    title: 'Zero-Delay Execution',
    body: 'Highest-priority server routing for AutoPilot execution.',
  },
  {
    icon: 'sliders',
    title: 'Dedicated AI Quant',
    body: 'Personalized risk-parameter generation for your trading profile.',
  },
];

const TERMS_TEXT =
  'TradiQs AI Pro is an auto-renewing subscription billed to your App Store or ' +
  'Play Store account. Payment is charged at confirmation of purchase. The ' +
  'subscription automatically renews unless auto-renew is turned off at least ' +
  '24 hours before the end of the current period. Your account is charged for ' +
  'renewal within 24 hours prior to the end of the current period at the price ' +
  'of your selected plan. You can manage or cancel your subscription at any ' +
  'time in your store account settings. Any unused portion of a free trial is ' +
  'forfeited when you purchase a subscription. TradiQs AI provides simulated ' +
  'trading signals and educational content only; nothing in the app is ' +
  'financial advice.';

const PRIVACY_TEXT =
  'TradiQs AI stores your account profile, preferences, and simulated trading ' +
  'activity to operate the service. Subscription status is processed by our ' +
  'billing partner (RevenueCat) together with your app store; we never see or ' +
  'store your payment details. AI Oracle conversations are processed to ' +
  'generate responses and are not sold to third parties. You can request ' +
  'deletion of your data at any time from Profile settings or by contacting ' +
  'support.';

/** Cross-platform alert (Alert.alert is a no-op on web). */
function notify(title: string, message?: string) {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    window.alert(message ? `${title}\n\n${message}` : title);
  } else {
    Alert.alert(title, message);
  }
}

/**
 * Full-screen "Upgrade to Pro" subscription paywall, openable from any tab.
 *
 * Wired to RevenueCat: the monthly/annual toggle maps to the current
 * offering's MONTHLY/ANNUAL packages and the CTA runs a real purchase. In
 * environments without store packages (dev/web preview) it falls back to a
 * short simulated flow so the screen remains demoable.
 */
export function PaywallModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { offerings, isPurchasing, isRestoring, purchase, restore } = useSubscription();
  const { defaultTier } = useLocalSearchParams<{ defaultTier?: string }>();
  const [selectedTier, setSelectedTier] = useState<SubscriptionTier>(
    defaultTier === 'ELITE' ? 'ELITE' : 'PRO',
  );
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('annual');
  const [simulating, setSimulating] = useState(false);
  const [docOpen, setDocOpen] = useState<'terms' | 'privacy' | null>(null);
  const simulateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset transient state whenever the paywall closes so a reopen starts
  // fresh (default annual cycle, no doc modal, no pending simulated purchase).
  useEffect(() => {
    if (visible) return;
    if (simulateTimer.current) {
      clearTimeout(simulateTimer.current);
      simulateTimer.current = null;
    }
    setSelectedTier('PRO');
    setBillingCycle('annual');
    setSimulating(false);
    setDocOpen(null);
  }, [visible]);

  useEffect(
    () => () => {
      if (simulateTimer.current) clearTimeout(simulateTimer.current);
    },
    [],
  );

  const proPackages = offerings?.current?.availablePackages ?? [];
  const elitePackages = useMemo(
    () =>
      Object.values(offerings?.all ?? {})
        .flatMap((offering: any) => offering.availablePackages ?? [])
        .filter((pkg: any) => /elite|institutional|quant/i.test(pkg.identifier ?? pkg.product?.identifier ?? '')),
    [offerings],
  );
  const packages = selectedTier === 'ELITE' ? elitePackages : proPackages;
  const monthlyPackage = useMemo(
    () =>
      packages.find((p) => p.packageType === 'MONTHLY') ??
      packages.find((p) => /month/i.test(p.identifier)) ??
      null,
    [packages],
  );
  const annualPackage = useMemo(
    () =>
      packages.find((p) => p.packageType === 'ANNUAL') ??
      packages.find((p) => /annual|year/i.test(p.identifier)) ??
      null,
    [packages],
  );
  const monthlyPrice = monthlyPackage?.product.priceString ?? (selectedTier === 'ELITE' ? '$49.99' : MONTHLY_PRICE_FALLBACK);
  const annualPrice = annualPackage?.product.priceString ?? (selectedTier === 'ELITE' ? '$399.99' : ANNUAL_PRICE_FALLBACK);
  const selectedPackage = billingCycle === 'annual' ? annualPackage : monthlyPackage;
  const working = isPurchasing || isRestoring || simulating;
  const accent = selectedTier === 'ELITE' ? '#B026FF' : '#00F0FF';
  const selectedPrice = billingCycle === 'annual' ? annualPrice : monthlyPrice;
  const features = selectedTier === 'ELITE' ? ELITE_FEATURES : PRO_FEATURES;

  const finishSuccess = () => {
    notify(
      `Welcome to TradiQs ${selectedTier === 'ELITE' ? 'Elite' : 'Pro'}!`,
      selectedTier === 'ELITE'
        ? 'Your institutional Quant Edge features are now unlocked.'
        : 'Your Pro features are now unlocked. Trade like an institution.',
    );
    onClose();
  };

  const handleSubscribe = async () => {
    if (working) return;
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
    if (selectedPackage) {
      try {
        await purchase(selectedPackage);
        finishSuccess();
      } catch (err: any) {
        // User cancelled or store error — stay on the paywall.
        console.log('Purchase cancelled or failed:', err?.message);
      }
      return;
    }
    // No store package available. Only simulate in dev / web preview —
    // in production this is a transient offerings failure, never a success.
    if (__DEV__ || Platform.OS === 'web') {
      setSimulating(true);
      simulateTimer.current = setTimeout(() => {
        simulateTimer.current = null;
        setSimulating(false);
        finishSuccess();
      }, 1500);
      return;
    }
    notify(
      'Plans Unavailable',
      "We couldn't load subscription plans. Check your connection and try again.",
    );
  };

  const handleRestore = async () => {
    if (working) return;
    notify('Restore Purchases', 'Checking App Store receipts...');
    try {
      await restore();
    } catch (err: any) {
      console.log('Restore failed:', err?.message);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      transparent={false}
    >
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {/* Close */}
        <TouchableOpacity
          style={styles.closeButton}
          onPress={onClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          testID="paywall-close"
        >
          <Feather name="x" size={22} color="#FFFFFF" />
        </TouchableOpacity>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.tierSwitcher} testID="tier-switcher">
            {(['PRO', 'ELITE'] as const).map((tier) => (
              <TouchableOpacity
                key={tier}
                activeOpacity={0.85}
                style={[styles.tierOption, selectedTier === tier && { borderColor: accent, backgroundColor: `${accent}18` }]}
                onPress={() => setSelectedTier(tier)}
                testID={`tier-${tier.toLowerCase()}`}
              >
                <Text style={[styles.tierOptionText, selectedTier === tier && { color: accent }]}>
                  {tier === 'PRO' ? 'TradiQs Pro' : 'TradiQs Elite'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Header */}
          <View style={styles.badgeWrap}>
            <View style={[styles.badgeGlow, { borderColor: `${accent}66`, shadowColor: accent, backgroundColor: `${accent}14` }]}>
              <Feather name={selectedTier === 'ELITE' ? 'award' : 'zap'} size={26} color={accent} />
            </View>
            <Text style={[styles.badgeText, { color: accent }]}>TRADIQS {selectedTier}</Text>
          </View>
          <Text style={styles.headline}>{selectedTier === 'ELITE' ? 'The Institutional Quant Edge' : 'Trade Like an Institution'}</Text>
          <Text style={styles.subtitle}>
            {selectedTier === 'ELITE'
              ? 'Command priority execution, institutional flow intelligence, and a dedicated AI Quant.'
              : 'Unlock unblurred real-time signals, automated trading bots, and full AI Oracle market intelligence.'}
          </Text>

          {/* Billing toggle */}
          <View style={styles.toggleRow} testID="billing-toggle">
            <TouchableOpacity
              activeOpacity={0.85}
              style={[styles.toggleOption, billingCycle === 'monthly' && [styles.toggleActive, { borderColor: accent, backgroundColor: `${accent}10` }]]}
              onPress={() => setBillingCycle('monthly')}
              testID="billing-monthly"
            >
              <Text
                style={[styles.togglePlan, billingCycle === 'monthly' && styles.togglePlanActive]}
              >
                Monthly
              </Text>
              <Text style={styles.togglePrice}>{monthlyPrice}/mo</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              style={[styles.toggleOption, billingCycle === 'annual' && [styles.toggleActive, { borderColor: accent, backgroundColor: `${accent}10` }]]}
              onPress={() => setBillingCycle('annual')}
              testID="billing-annual"
            >
              <View style={[styles.saveBadge, { backgroundColor: accent }]}>
                <Text style={styles.saveBadgeText}>{selectedTier === 'ELITE' ? 'SAVE 33%' : 'SAVE 45%'}</Text>
              </View>
              <Text
                style={[styles.togglePlan, billingCycle === 'annual' && styles.togglePlanActive]}
              >
                Annual
              </Text>
              <Text style={styles.togglePrice}>{annualPrice}/yr</Text>
            </TouchableOpacity>
          </View>

          {/* Feature list */}
          <View style={styles.features}>
            {features.map((feature) => (
              <View key={feature.title} style={styles.featureRow}>
                <View style={styles.checkWrap}>
                  <Feather name="check" size={14} color="#00E676" />
                </View>
                <View style={styles.featureBody}>
                  <Text style={styles.featureTitle}>{feature.title}</Text>
                  <Text style={styles.featureText}>{feature.body}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* CTA */}
          <Text style={[styles.selectedPrice, { color: accent }]}>
            {selectedPrice}{billingCycle === 'annual' ? '/year' : '/month'}
          </Text>
          <TouchableOpacity
            activeOpacity={0.85}
            style={[
              styles.paymentButton,
              Platform.OS === 'ios' && styles.applePayButton,
              Platform.OS === 'android' && styles.googlePayButton,
              Platform.OS === 'web' && { backgroundColor: accent },
              working && styles.ctaDisabled,
            ]}
            onPress={handleSubscribe}
            disabled={working}
            testID="paywall-cta"
          >
            {isPurchasing || simulating ? <ActivityIndicator color={Platform.OS === 'web' ? '#0A0B0E' : '#FFFFFF'} /> : (
              <>
                {Platform.OS === 'ios' ? <Text style={styles.applePayText}>Pay with  Apple Pay</Text> : null}
                {Platform.OS === 'android' ? <Text style={styles.googlePayText}><Text style={styles.googleMark}>G</Text> Pay</Text> : null}
                {Platform.OS === 'web' ? <Text style={styles.ctaText}>Continue to Checkout</Text> : null}
                <Text style={[styles.ctaSubText, Platform.OS !== 'web' && styles.nativePaySubText]}>
                  {billingCycle === 'annual' ? `${selectedPrice}/year` : `${selectedPrice}/month`}
                </Text>
              </>
            )}
          </TouchableOpacity>
          <Text style={styles.cancelHint}>Cancel anytime. Billed to your store account.</Text>

          {/* Legal footer */}
          <View style={styles.legalLinks}>
            <TouchableOpacity onPress={handleRestore} disabled={working} testID="paywall-restore">
              <Text style={styles.legalLinkText}>Restore Purchases</Text>
            </TouchableOpacity>
            <Text style={styles.legalDivider}>•</Text>
            <TouchableOpacity onPress={() => setDocOpen('terms')}>
              <Text style={styles.legalLinkText}>Terms of Use (EULA)</Text>
            </TouchableOpacity>
            <Text style={styles.legalDivider}>•</Text>
            <TouchableOpacity onPress={() => setDocOpen('privacy')}>
              <Text style={styles.legalLinkText}>Privacy Policy</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.microText}>
            Subscriptions auto-renew unless cancelled at least 24 hours before the
            end of the current period. Manage subscriptions in your App Store /
            Play Store account settings.
          </Text>
        </ScrollView>

        {/* Terms / Privacy document modal */}
        <Modal
          visible={docOpen !== null}
          animationType="fade"
          transparent
          onRequestClose={() => setDocOpen(null)}
        >
          <View style={styles.docOverlay}>
            <View style={styles.docCard}>
              <View style={styles.docHeader}>
                <Text style={styles.docTitle}>
                  {docOpen === 'terms' ? 'Terms of Use (EULA)' : 'Privacy Policy'}
                </Text>
                <TouchableOpacity
                  onPress={() => setDocOpen(null)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Feather name="x" size={20} color="#8A8D93" />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.docScroll}>
                <Text style={styles.docBody}>
                  {docOpen === 'terms' ? TERMS_TEXT : PRIVACY_TEXT}
                </Text>
              </ScrollView>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0B0E',
  },
  closeButton: {
    position: 'absolute',
    top: Platform.OS === 'web' ? 18 : 54,
    right: 18,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#16181D',
    borderWidth: 1,
    borderColor: '#22252A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 22,
    paddingTop: 34,
    paddingBottom: 32,
  },
  tierSwitcher: {
    flexDirection: 'row',
    gap: 8,
    padding: 4,
    borderRadius: colors.radius,
    backgroundColor: '#12141A',
    borderWidth: 1,
    borderColor: '#22252A',
    marginBottom: 22,
  },
  tierOption: {
    flex: 1,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingVertical: 10,
    alignItems: 'center',
  },
  tierOptionText: {
    color: '#8A8D93',
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
  },
  badgeWrap: {
    alignItems: 'center',
    gap: 10,
  },
  badgeGlow: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: 'rgba(0,240,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0,240,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#00F0FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 18,
    elevation: 10,
  },
  badgeText: {
    color: '#00F0FF',
    fontSize: 12,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 3,
  },
  headline: {
    color: '#FFFFFF',
    fontSize: 28,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
    marginTop: 14,
  },
  subtitle: {
    color: '#8A8D93',
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 8,
    paddingHorizontal: 8,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 24,
  },
  toggleOption: {
    flex: 1,
    backgroundColor: '#16181D',
    borderRadius: colors.radius,
    borderWidth: 1.5,
    borderColor: '#22252A',
    paddingVertical: 14,
    alignItems: 'center',
    gap: 2,
  },
  toggleActive: {
    borderColor: '#00F0FF',
    backgroundColor: 'rgba(0,240,255,0.06)',
  },
  togglePlan: {
    color: '#8A8D93',
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
  },
  togglePlanActive: {
    color: '#FFFFFF',
  },
  togglePrice: {
    color: '#8A8D93',
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
  saveBadge: {
    position: 'absolute',
    top: -10,
    backgroundColor: '#00F0FF',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  saveBadgeText: {
    color: '#0A0B0E',
    fontSize: 10,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.5,
  },
  features: {
    marginTop: 26,
    gap: 16,
  },
  featureRow: {
    flexDirection: 'row',
    gap: 12,
  },
  checkWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,230,118,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  featureBody: {
    flex: 1,
    gap: 2,
  },
  featureTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
  },
  featureText: {
    color: '#8A8D93',
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 18,
  },
  selectedPrice: {
    textAlign: 'center',
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
    marginTop: 28,
    marginBottom: 9,
  },
  paymentButton: {
    minHeight: 58,
    marginTop: 28,
    borderRadius: colors.radius,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  applePayButton: {
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: '#454545',
  },
  googlePayButton: {
    backgroundColor: '#202124',
    borderWidth: 1,
    borderColor: '#5F6368',
  },
  ctaDisabled: {
    opacity: 0.6,
  },
  ctaText: {
    color: '#0A0B0E',
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.3,
  },
  ctaSubText: {
    color: 'rgba(10,11,14,0.75)',
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    marginTop: 1,
  },
  nativePaySubText: {
    color: 'rgba(255,255,255,0.72)',
  },
  applePayText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.2,
  },
  googlePayText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.2,
  },
  googleMark: {
    color: '#4285F4',
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
  },
  cancelHint: {
    color: '#8A8D93',
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    marginTop: 10,
  },
  legalLinks: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 26,
  },
  legalLinkText: {
    color: '#8A8D93',
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    textDecorationLine: 'underline',
  },
  legalDivider: {
    color: '#22252A',
    fontSize: 12,
  },
  microText: {
    color: '#5A5D63',
    fontSize: 10,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 15,
    marginTop: 12,
    paddingHorizontal: 6,
  },
  docOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  docCard: {
    backgroundColor: '#16181D',
    borderRadius: colors.radius,
    borderWidth: 1,
    borderColor: '#22252A',
    padding: 20,
    width: '100%',
    maxHeight: '70%',
  },
  docHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  docTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
  docScroll: {
    flexGrow: 0,
  },
  docBody: {
    color: '#8A8D93',
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    lineHeight: 20,
  },
});
