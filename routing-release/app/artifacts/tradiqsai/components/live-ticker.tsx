import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

/**
 * Massive live price readout with a cyan "heartbeat" dot that pulses each
 * time a new WebSocket tick arrives (`heartbeat` increments per tick).
 */
export function LivePriceTicker({
  livePrice,
  heartbeat,
  connected,
}: {
  livePrice: number;
  heartbeat: number;
  connected: boolean;
}) {
  const pulse = useRef(new Animated.Value(0.25)).current;

  useEffect(() => {
    if (heartbeat === 0) return;
    pulse.setValue(1);
    Animated.timing(pulse, {
      toValue: 0.25,
      duration: 550,
      useNativeDriver: true,
    }).start();
  }, [heartbeat, pulse]);

  const display =
    livePrice > 0
      ? `$${livePrice.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`
      : connected
        ? 'Waiting for ticks…'
        : 'Connecting…';

  return (
    <View style={styles.row} testID="live-price-ticker">
      <Animated.View style={[styles.dot, { opacity: pulse }]} />
      <Text style={[styles.price, livePrice === 0 && styles.pending]}>
        {display}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#00F0FF',
    shadowColor: '#00F0FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 4,
  },
  price: {
    color: '#FFFFFF',
    fontSize: 32,
    fontFamily: 'Inter_700Bold',
    letterSpacing: -0.5,
  },
  pending: {
    fontSize: 16,
    color: '#8A8D93',
    fontFamily: 'Inter_500Medium',
  },
});
