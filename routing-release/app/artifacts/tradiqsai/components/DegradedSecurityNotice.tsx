/**
 * DegradedSecurityNotice
 *
 * Presentational amber banner for a successful write performed while the
 * server-side MFA assurance service was unavailable. Registration lives in
 * DegradedSecurityNoticeProvider at the app root.
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

const GOLD = '#F5C542';

export function DegradedSecurityNotice({
  visible,
  onDismiss,
}: {
  visible: boolean;
  onDismiss: () => void;
}) {
  if (!visible) return null;
  return (
    <View
      style={[styles.banner, { pointerEvents: 'box-none' }]}
      testID="degraded-security-notice"
    >
      <Feather name="shield" size={13} color={GOLD} />
      <Text style={styles.text}>Applied — security re-check pending</Text>
      <TouchableOpacity
        onPress={onDismiss}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="Dismiss security notice"
      >
        <Feather name="x" size={13} color={GOLD} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    // Sit just above the bottom tab bar on most devices (safe-area-aware
    // positioning is handled by the parent layout).
    bottom: 80,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(245,197,66,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(245,197,66,0.35)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    // Elevate above tab content so it's always readable.
    zIndex: 999,
    elevation: 10,
  },
  text: {
    flex: 1,
    color: GOLD,
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
  },
});
