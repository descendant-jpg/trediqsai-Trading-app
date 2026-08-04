import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Feather } from '@expo/vector-icons';
import colors from '@/constants/colors';
import { useSubscription } from '@/lib/revenuecat';

const c = colors.light;

const FEATURES = [
  'Live AI probability radar',
  'Push notifications for breakouts',
  'Priority sweepstakes payouts',
];

/**
 * Premium Pro Tier paywall card — wired to RevenueCat for real purchases.
 */
export function PaywallCard() {
  const { offerings, isPurchasing, isRestoring, purchase, restore } = useSubscription();
  const [confirmVisible, setConfirmVisible] = useState(false);

  const currentOffering = offerings?.current;
  const packageToPurchase = currentOffering?.availablePackages[0];
  const priceString = packageToPurchase?.product.priceString ?? '$49.99';

  const handleUpgrade = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
    setConfirmVisible(true);
  };

  const handleConfirmPurchase = async () => {
    setConfirmVisible(false);
    if (!packageToPurchase) return;
    try {
      await purchase(packageToPurchase);
    } catch (err: any) {
      // User cancelled or error — silent
      console.log('Purchase cancelled or failed:', err?.message);
    }
  };

  const handleRestore = async () => {
    try {
      await restore();
    } catch (err: any) {
      console.log('Restore failed:', err?.message);
    }
  };

  const isWorking = isPurchasing || isRestoring;

  return (
    <>
      <View style={styles.card} testID="paywall-card">
        <Text style={styles.title}>TradiQs AI Pro</Text>
        <Text style={styles.subtitle}>
          Unlock predictive market signals and maximize your win rate.
        </Text>

        <View style={styles.features}>
          {FEATURES.map((feature) => (
            <View key={feature} style={styles.featureRow}>
              <View style={styles.featureDot} />
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          activeOpacity={0.85}
          style={[styles.cta, isWorking && styles.ctaDisabled]}
          onPress={handleUpgrade}
          disabled={isWorking}
          testID="upgrade-button"
        >
          {isPurchasing ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.ctaText}>Upgrade for {priceString}/mo</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.restoreButton}
          onPress={handleRestore}
          disabled={isWorking}
        >
          {isRestoring ? (
            <ActivityIndicator color="#8A8D93" size="small" />
          ) : (
            <Text style={styles.restoreText}>Restore purchases</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.footer}>
          Cancel anytime. Billed to your App Store account.
        </Text>
      </View>

      {/* Purchase confirmation modal */}
      <Modal
        visible={confirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalIconRow}>
              <Feather name="star" size={28} color="#B026FF" />
            </View>
            <Text style={styles.modalTitle}>Confirm Upgrade</Text>
            <Text style={styles.modalBody}>
              Subscribe to TradiQs AI Pro for {priceString}/mo and unlock all AI signals.
            </Text>
            <TouchableOpacity
              style={styles.modalConfirm}
              onPress={handleConfirmPurchase}
            >
              <Text style={styles.modalConfirmText}>Subscribe Now</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalCancel}
              onPress={() => setConfirmVisible(false)}
            >
              <Text style={styles.modalCancelText}>Not now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

/**
 * Subscription management card for active Pro subscribers.
 * Shows the current plan, price, and next renewal date from RevenueCat
 * customerInfo, and deep-links to the platform subscription management page.
 */
export function ManageSubscriptionCard() {
  const {
    activeEntitlement,
    offerings,
    manageSubscription,
    isManagingSubscription,
  } = useSubscription();

  if (!activeEntitlement) return null;

  const currentOffering = offerings?.current;
  const matchingPackage =
    currentOffering?.availablePackages.find(
      (pkg) => pkg.product.identifier === activeEntitlement.productIdentifier,
    ) ?? currentOffering?.availablePackages[0];
  const priceString = matchingPackage?.product.priceString;

  const renewalDate = activeEntitlement.expirationDate
    ? new Date(activeEntitlement.expirationDate).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  const handleManage = async () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    try {
      await manageSubscription();
    } catch (err: any) {
      console.log('Manage subscription failed:', err?.message);
    }
  };

  return (
    <View style={styles.manageCard} testID="manage-subscription-card">
      <View style={styles.manageHeader}>
        <View style={styles.manageIconWrap}>
          <Feather name="star" size={16} color="#B026FF" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.manageTitle}>TradiQs AI Pro</Text>
          <Text style={styles.manageStatus}>
            {activeEntitlement.willRenew ? 'Active — renews automatically' : 'Active — will not renew'}
          </Text>
        </View>
      </View>

      <View style={styles.manageDetails}>
        <View style={styles.manageDetailItem}>
          <Text style={styles.manageDetailLabel}>Plan</Text>
          <Text style={styles.manageDetailValue}>
            {matchingPackage?.product.title ?? 'Pro Monthly'}
          </Text>
        </View>
        <View style={styles.manageDetailItem}>
          <Text style={styles.manageDetailLabel}>Price</Text>
          <Text style={styles.manageDetailValue}>
            {priceString ? `${priceString}/mo` : '—'}
          </Text>
        </View>
        <View style={styles.manageDetailItem}>
          <Text style={styles.manageDetailLabel}>
            {activeEntitlement.willRenew ? 'Renews' : 'Expires'}
          </Text>
          <Text style={styles.manageDetailValue}>{renewalDate ?? '—'}</Text>
        </View>
      </View>

      <TouchableOpacity
        activeOpacity={0.85}
        style={[styles.manageButton, isManagingSubscription && styles.ctaDisabled]}
        onPress={handleManage}
        disabled={isManagingSubscription}
        testID="manage-subscription-button"
      >
        {isManagingSubscription ? (
          <ActivityIndicator color="#B026FF" size="small" />
        ) : (
          <>
            <Feather name="settings" size={14} color="#B026FF" />
            <Text style={styles.manageButtonText}>Manage Subscription</Text>
          </>
        )}
      </TouchableOpacity>
      <Text style={styles.manageFooter}>
        Change your plan or cancel via your app store.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  manageCard: {
    backgroundColor: '#16181D',
    borderRadius: colors.radius,
    borderWidth: 1,
    borderColor: c.border,
    padding: 16,
    gap: 14,
  },
  manageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  manageIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(176,38,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  manageTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'Inter_700Bold',
  },
  manageStatus: {
    color: '#8A8D93',
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 1,
  },
  manageDetails: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: c.border,
    paddingTop: 12,
  },
  manageDetailItem: {
    flex: 1,
    gap: 2,
  },
  manageDetailLabel: {
    color: '#8A8D93',
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  manageDetailValue: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
  },
  manageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: colors.radius,
    borderWidth: 1,
    borderColor: '#B026FF',
  },
  manageButtonText: {
    color: '#B026FF',
    fontSize: 14,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.3,
  },
  manageFooter: {
    color: '#8A8D93',
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    marginTop: -4,
  },
  card: {
    backgroundColor: '#16181D',
    borderRadius: colors.radius,
    borderWidth: 1.5,
    borderColor: '#B026FF',
    paddingHorizontal: 22,
    paddingTop: 26,
    paddingBottom: 20,
    shadowColor: '#B026FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 12,
  },
  title: {
    color: '#B026FF',
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  subtitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 8,
  },
  features: {
    marginTop: 20,
    gap: 12,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#B026FF',
  },
  featureText: {
    color: '#8A8D93',
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  cta: {
    marginTop: 22,
    height: 56,
    borderRadius: colors.radius,
    backgroundColor: '#B026FF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#B026FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  ctaDisabled: {
    opacity: 0.6,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  restoreButton: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 6,
  },
  restoreText: {
    color: '#8A8D93',
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    textDecorationLine: 'underline',
  },
  footer: {
    color: '#8A8D93',
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    marginTop: 8,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  modalCard: {
    backgroundColor: '#16181D',
    borderRadius: colors.radius,
    borderWidth: 1.5,
    borderColor: '#B026FF',
    padding: 28,
    width: '100%',
    alignItems: 'center',
  },
  modalIconRow: {
    marginBottom: 12,
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  modalBody: {
    color: '#8A8D93',
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  modalConfirm: {
    width: '100%',
    height: 52,
    borderRadius: colors.radius,
    backgroundColor: '#B026FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  modalConfirmText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
  modalCancel: {
    paddingVertical: 8,
  },
  modalCancelText: {
    color: '#8A8D93',
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
});
