import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

type Props = {
  /** Bold-ish prompt under the title. Defaults to a generic Pro unlock line. */
  message?: string;
  buttonLabel?: string;
  /** Overrides the default navigation to /paywall (Pro tier preselected). */
  onUpgrade?: () => void;
  testID?: string;
};

/**
 * Glassmorphism paywall curtain: an absolute-fill dark blur that swallows all
 * touches to the covered widget and centers a single conversion CTA.
 *
 * Render it as the LAST child of a positioned parent (`overflow: 'hidden'`)
 * so the blur and the touch-blocking responder cover the whole widget.
 */
export function ProPaywallOverlay({
  message = 'Upgrade to unlock this Pro feature',
  buttonLabel = 'Upgrade to Pro',
  onUpgrade,
  testID = 'pro-paywall-overlay',
}: Props) {
  const router = useRouter();

  const handleUpgrade = () => {
    if (onUpgrade) {
      onUpgrade();
      return;
    }
    router.push({ pathname: '/paywall', params: { defaultTier: 'PRO' } });
  };

  return (
    <View
      style={styles.overlay}
      pointerEvents="auto"
      // Claim every touch inside the covered area so the blurred controls
      // underneath (switches, pills, scroll views) can never receive one.
      onStartShouldSetResponder={() => true}
      accessibilityViewIsModal
      accessibilityLabel={`Pro feature locked. ${message}`}
      testID={testID}
    >
      <BlurView
        intensity={Platform.OS === 'web' ? 32 : 24}
        tint="dark"
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.backdrop} />
      <View style={styles.content}>
        <View style={styles.lockBadge}>
          <Feather name="lock" size={18} color="#F5C542" />
        </View>
        <Text style={styles.title}>PRO FEATURE</Text>
        <Text style={styles.message}>{message}</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={handleUpgrade}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={buttonLabel}
          testID={`${testID}-upgrade`}
        >
          <Feather name="zap" size={13} color="#0A0B0E" />
          <Text style={styles.buttonText}>{buttonLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10, 11, 14, 0.66)',
  },
  content: {
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 24,
  },
  lockBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(245, 197, 66, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(245, 197, 66, 0.45)',
  },
  title: {
    color: '#F5C542',
    fontSize: 12,
    letterSpacing: 2,
    fontFamily: 'Inter_700Bold',
  },
  message: {
    color: '#E8E9EC',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    fontFamily: 'Inter_500Medium',
    maxWidth: 300,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 4,
    backgroundColor: '#F5C542',
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  buttonText: {
    color: '#0A0B0E',
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
  },
});
