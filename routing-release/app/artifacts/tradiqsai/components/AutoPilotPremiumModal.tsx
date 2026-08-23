import React, { useMemo } from 'react';
import {
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { shouldDismissAutoPilotPremiumSheet } from '@/lib/autopilotAccess';

const GOLD = '#FFD55A';

type AutoPilotPremiumModalProps = {
  visible: boolean;
  onClose: () => void;
  onUpgrade: () => void;
};

/**
 * Small, dismissible upgrade sheet shown when a non-Elite user opens
 * AutoPilot from the Signals screen.
 */
export function AutoPilotPremiumModal({
  visible,
  onClose,
  onUpgrade,
}: AutoPilotPremiumModalProps) {
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          gesture.dy > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderRelease: (_, gesture) => {
          if (shouldDismissAutoPilotPremiumSheet(gesture.dy, gesture.vy)) onClose();
        },
      }),
    [onClose],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      testID="autopilot-premium-modal"
    >
      <View style={styles.overlay}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss AutoPilot upgrade prompt"
          testID="autopilot-premium-backdrop"
        />
        <View
          style={styles.sheet}
          {...panResponder.panHandlers}
          accessibilityViewIsModal
          testID="autopilot-premium-sheet"
        >
          <View style={styles.sheetHeader}>
            <View style={styles.dragHandle} />
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close AutoPilot upgrade prompt"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              testID="autopilot-premium-close"
            >
              <Feather name="x" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          <View style={styles.aiIcon}>
            <Feather name="lock" size={28} color={GOLD} />
          </View>
          <Text style={styles.title}>AutoPilot is a Premium Feature</Text>
          <Text style={styles.body}>Upgrade to run automated trading bots.</Text>
          <TouchableOpacity
            style={styles.upgradeButton}
            onPress={onUpgrade}
            testID="autopilot-premium-upgrade"
          >
            <Text style={styles.upgradeButtonText}>UPGRADE NOW</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,.7)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#171A20',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 25,
    alignItems: 'center',
    gap: 13,
  },
  sheetHeader: {
    alignSelf: 'stretch',
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dragHandle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#4B515D',
  },
  closeButton: {
    position: 'absolute',
    right: -4,
    top: -6,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiIcon: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,213,90,.12)',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 21,
    fontWeight: '900',
  },
  body: {
    color: '#9BA3AE',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
  upgradeButton: {
    backgroundColor: GOLD,
    alignSelf: 'stretch',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  upgradeButtonText: {
    color: '#101217',
    fontSize: 12,
    fontWeight: '900',
  },
});