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

const styles = StyleSheet.create({
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
