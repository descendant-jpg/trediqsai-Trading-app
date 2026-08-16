/**
 * DegradedSecurityNotice
 *
 * Registers the global `X-Security-Check: degraded` callback from
 * customFetch and renders a subtle amber banner whenever a write to a
 * monitored settings endpoint succeeds while the server-side MFA assurance
 * service was unavailable.
 *
 * Mount this component once near the app root so all write surfaces
 * (AutoPilot settings, bot deploy/toggle, future settings routes) are
 * covered without each screen needing its own handler registration.
 */
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { setDegradedSecurityHandler } from '@workspace/api-client-react';

/** HTTP methods that represent a mutation (i.e. a settings change). */
const WRITE_METHODS = new Set(['PUT', 'POST', 'DELETE', 'PATCH']);

/**
 * URL prefixes for settings endpoints that run in degraded security mode
 * when the assurance service is unavailable.  Extend this list as more
 * routes adopt the fail-open middleware.
 */
const MONITORED_PREFIXES = ['/api/autopilot', '/api/bots'];

function isMonitoredWrite(url: string, method: string): boolean {
  if (!WRITE_METHODS.has(method)) return false;
  return MONITORED_PREFIXES.some((prefix) => url.includes(prefix));
}

const GOLD = '#F5C542';
const AUTO_DISMISS_MS = 8000;

export function DegradedSecurityNotice() {
  const [visible, setVisible] = useState(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDegradedSecurityHandler(({ url, method }) => {
      if (!isMonitoredWrite(url, method)) return;
      setVisible(true);
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      dismissTimer.current = setTimeout(() => setVisible(false), AUTO_DISMISS_MS);
    });
    return () => {
      setDegradedSecurityHandler(null);
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, []);

  if (!visible) return null;

  return (
    <View style={styles.banner} testID="degraded-security-notice" pointerEvents="box-none">
      <Feather name="shield" size={13} color={GOLD} />
      <Text style={styles.text}>Applied — security re-check pending</Text>
      <TouchableOpacity
        onPress={() => setVisible(false)}
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
