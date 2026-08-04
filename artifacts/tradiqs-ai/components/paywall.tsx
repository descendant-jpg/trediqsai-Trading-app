import React from 'react';
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import colors from '@/constants/colors';

const c = colors.light;

const FEATURES = [
  'Live AI probability radar',
  'Push notifications for breakouts',
  'Priority sweepstakes payouts',
];

/**
 * Premium Pro Tier paywall card — Neon Purple bordered panel with title,
 * feature list, upgrade CTA (heavy haptic on press), and billing footer.
 */
export function PaywallCard({ onUpgrade }: { onUpgrade?: () => void }) {
  const handleUpgrade = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
    onUpgrade?.();
  };

  return (
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
        style={styles.cta}
        onPress={handleUpgrade}
        testID="upgrade-button"
      >
        <Text style={styles.ctaText}>Upgrade for $49.99/mo</Text>
      </TouchableOpacity>

      <Text style={styles.footer}>
        Cancel anytime. Billed to your App Store account.
      </Text>
    </View>
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
  ctaText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  footer: {
    color: '#8A8D93',
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    marginTop: 12,
  },
});
