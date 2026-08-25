import React, { useEffect, useRef } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

const FEATURES = [
  'AI-Powered Trading',
  'Forex, Crypto & Stocks',
  'Multi-TF Bias Analysis',
  'AutoPilot Execution',
];

// Sequence budget: features land by ~1.9s, hold, then the curtain fades and
// unmounts at ~2.95s — comfortably inside the requested 2.5–3s window.
const FEATURE_START = 550;
const FEATURE_STAGGER = 260;
const FEATURE_DURATION = 380;
const FADE_OUT_AT = 2450;
const DONE_AT = 2950;

const hapticTap = () => {
  if (Platform.OS === 'web') return;
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
};

function FeatureLine({ label, index }: { label: string; index: number }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(
      FEATURE_START + index * FEATURE_STAGGER,
      withTiming(1, { duration: FEATURE_DURATION, easing: Easing.out(Easing.cubic) }),
    );
  }, [index, progress]);
  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 14 }],
  }));
  return (
    <Animated.View style={[styles.featureRow, style]}>
      <View style={styles.featureDot} />
      <Text style={styles.featureText}>{label}</Text>
    </Animated.View>
  );
}

/**
 * Premium boot curtain: renders over the navigation tree the moment the
 * native splash hides, plays the brand sequence, crossfades into the app,
 * then unmounts. The app underneath mounts normally — no re-render handoff.
 */
export function AnimatedBootScreen({
  onReady,
  onFinish,
}: {
  onReady?: () => void;
  onFinish: () => void;
}) {
  const logoProgress = useSharedValue(0);
  const curtain = useSharedValue(1);
  const finished = useRef(false);
  // Always complete via the latest callback, but run the boot timeline exactly
  // once — a parent re-render must never restart animations, timers, haptics.
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  useEffect(() => {
    logoProgress.value = withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) });
    curtain.value = withDelay(
      FADE_OUT_AT,
      withTiming(0, { duration: 450, easing: Easing.inOut(Easing.ease) }),
    );
    const hapticTimers = FEATURES.map((_, i) =>
      setTimeout(hapticTap, FEATURE_START + i * FEATURE_STAGGER + 120),
    );
    // Fail-safe: even if a frame is dropped the curtain always lifts.
    const doneTimer = setTimeout(() => {
      if (!finished.current) {
        finished.current = true;
        onFinishRef.current();
      }
    }, DONE_AT);
    return () => {
      hapticTimers.forEach(clearTimeout);
      clearTimeout(doneTimer);
    };
    // Shared values are stable references; this effect must run once.
  }, [curtain, logoProgress]);

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoProgress.value,
    transform: [{ scale: 0.92 + logoProgress.value * 0.08 }],
  }));
  const curtainStyle = useAnimatedStyle(() => ({ opacity: curtain.value }));

  return (
    <Animated.View
      style={[styles.curtain, curtainStyle]}
      onLayout={onReady}
      accessibilityLabel="TradiQs AI is loading"
    >
      <Animated.View style={[styles.logoBlock, logoStyle]}>
        <View style={styles.logoMark}>
          <Text style={styles.logoMarkText}>◆</Text>
        </View>
        <Text style={styles.logoText}>
          TradiQs <Text style={styles.logoAccent}>AI</Text>
        </Text>
      </Animated.View>
      <View style={styles.features}>
        {FEATURES.map((feature, i) => (
          <FeatureLine key={feature} label={feature} index={i} />
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  curtain: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0A0B0E',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  logoBlock: { alignItems: 'center', gap: 16 },
  logoMark: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: 'rgba(0,240,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(0,240,255,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoMarkText: { color: '#00F0FF', fontSize: 22 },
  logoText: { color: '#F4F7FB', fontSize: 34, fontFamily: 'Inter_700Bold', letterSpacing: 0.4 },
  logoAccent: { color: '#00F0FF' },
  features: { marginTop: 44, gap: 14, alignItems: 'flex-start' },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#00F0FF' },
  featureText: {
    color: '#A7B0BC',
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.8,
  },
});
