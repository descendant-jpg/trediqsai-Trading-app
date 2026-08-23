import React from 'react';
import {
  ActivityIndicator,
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

/**
 * Subtle notice shown when the user cancelled in the store but the
 * entitlement is still active: Pro access continues until the expiration
 * date, after which the paywall reappears normally.
 */
export function ProWindDownBanner() {
  const { isWindingDown, windDownExpirationDate } = useSubscription();

  if (!isWindingDown) return null;

  const endDate = windDownExpirationDate
    ? new Date(windDownExpirationDate).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  return (
    <View style={styles.windDownBanner} testID="pro-wind-down-banner">
      <Feather name="clock" size={14} color="#FFB020" />
      <Text style={styles.windDownText}>
        {endDate
          ? `Your subscription is cancelled — Pro access continues until ${endDate}.`
          : 'Your subscription is cancelled — Pro access continues until the end of your billing period.'}
      </Text>
    </View>
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
  windDownBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,176,32,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,176,32,0.35)',
    borderRadius: colors.radius,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  windDownText: {
    flex: 1,
    color: '#FFB020',
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    lineHeight: 17,
  },
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
  ctaDisabled: {
    opacity: 0.6,
  },
});
