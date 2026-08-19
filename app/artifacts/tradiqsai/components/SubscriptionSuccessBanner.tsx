import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import colors from '@/constants/colors';

export type SubscriptionSuccess = {
  userId: string;
  tier: 'pro' | 'elite';
};

export function SubscriptionSuccessBanner({
  success,
  currentUserId,
}: {
  success: SubscriptionSuccess | null;
  currentUserId: string | null;
}) {
  if (!success || success.userId !== currentUserId) return null;

  return (
    <View style={styles.banner} testID="subscription-success">
      <Feather name="check-circle" size={18} color={colors.light.success} />
      <View style={styles.copy}>
        <Text style={styles.title}>
          {success.tier === 'elite' ? 'Elite' : 'Pro'} activated
        </Text>
        <Text style={styles.body}>
          Your verified subscription is now active on this account.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: `${colors.light.success}66`,
    backgroundColor: `${colors.light.success}12`,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
  },
  copy: { flex: 1, gap: 2 },
  title: {
    color: colors.light.success,
    fontSize: 13,
    fontFamily: 'Inter_700Bold',
  },
  body: {
    color: colors.light.mutedForeground,
    fontSize: 11,
    lineHeight: 16,
    fontFamily: 'Inter_400Regular',
  },
});