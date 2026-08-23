import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSubscription } from '@/lib/revenuecat';
import {
  findVipLifetimePackage,
  VIP_TELEGRAM_CHANNEL_URL,
  type VipPlan,
} from '../lib/vipSignals';
import colors from '@/constants/colors';
const c = colors.light;
const PLANS: ReadonlyArray<readonly [VipPlan, string, string]> = [
  ['Pro', '$150 lifetime', 'Daily high-conviction signals'],
  ['Elite', '$500 lifetime', 'Signals plus private analysis'],
  ['Whale', '$5,000 lifetime', 'Institutional access and priority support'],
];

function showMessage(title: string, message: string) {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

export default function VipSignalsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    offerings,
    hasActiveEntitlement,
    isPurchasing,
    purchase,
    refreshProfileEntitlement,
  } = useSubscription();
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  const openChannel = () => {
    Linking.openURL(VIP_TELEGRAM_CHANNEL_URL).catch(() =>
      showMessage('VIP Signals Channel', VIP_TELEGRAM_CHANNEL_URL),
    );
  };

  const purchaseVipPlan = async (plan: VipPlan) => {
    if (isPurchasing || hasActiveEntitlement) return;
    setPurchaseError(null);
    const revenueCatPackage = findVipLifetimePackage(offerings, plan);
    if (!revenueCatPackage) {
      const message =
        `${plan} lifetime access is not available right now. Please try again later.`;
      setPurchaseError(message);
      showMessage('Purchase unavailable', message);
      return;
    }

    try {
      await purchase(revenueCatPackage);
      await refreshProfileEntitlement().catch(() => {});
      showMessage(
        'VIP access activated',
        'Your entitlement is refreshing. The channel button will appear as soon as access is confirmed.',
      );
    } catch (error: any) {
      if (error?.userCancelled) return;
      const message =
        error?.message ?? 'We could not complete your VIP Signals purchase.';
      setPurchaseError(message);
      showMessage('Purchase failed', message);
    }
  };

  return (
    <View style={s.container}>
      <ScrollView
        contentContainerStyle={[
          s.content,
          { paddingTop: Platform.OS === 'web' ? 20 : insets.top + 10 },
        ]}
      >
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
            <Feather name="chevron-left" size={23} color={c.foreground} />
          </TouchableOpacity>
          <Text style={s.title}>VIP Signals</Text>
          <Feather name="star" size={21} color={c.secondary} />
        </View>
        <View style={s.lock}>
          <Feather name={hasActiveEntitlement ? "unlock" : "lock"} size={27} color={c.primary} />
          <Text style={s.lockTitle}>VIP Signals Channel</Text>
          <Text style={s.body}>Private Telegram channel for traders who want early, high-conviction market intelligence and direct signal commentary.</Text>
          <Text style={s.tag}>PRIVATE TELEGRAM CHANNEL</Text>
          {hasActiveEntitlement && (
            <TouchableOpacity
              style={s.channelButton}
              onPress={openChannel}
              accessibilityRole="button"
              testID="vip-open-channel"
            >
              <Feather name="send" size={16} color={c.primaryForeground} />
              <Text style={s.channelButtonText}>Open private Telegram channel</Text>
            </TouchableOpacity>
          )}
        </View>
        {purchaseError && <Text style={s.error} testID="vip-purchase-error">{purchaseError}</Text>}
        {!hasActiveEntitlement && (
          <>
            <Text style={s.section}>CHOOSE YOUR ACCESS</Text>
            {PLANS.map(([name, price, detail]) => (
              <TouchableOpacity
                key={name}
                style={s.plan}
                onPress={() => void purchaseVipPlan(name)}
                disabled={isPurchasing}
                accessibilityRole="button"
                accessibilityLabel={`Unlock ${name} plan`}
                testID={`vip-purchase-${name.toLowerCase()}`}
              >
                <View style={s.planIcon}><Feather name="zap" size={16} color={c.secondary} /></View>
                <View style={s.planCopy}><Text style={s.planName}>{name}</Text><Text style={s.detail}>{detail}</Text></View>
                <View>
                  {isPurchasing ? <ActivityIndicator color={c.secondary} /> : <><Text style={s.price}>{price}</Text><Feather name="chevron-right" size={18} color={c.secondary} /></>}
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}
const s = StyleSheet.create({ container: { flex: 1, backgroundColor: c.background }, content: { padding: 18, gap: 14 }, header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, title: { color: c.foreground, fontSize: 22, fontFamily: 'Inter_700Bold' }, lock: { backgroundColor: c.card, borderWidth: 1, borderColor: c.primary, borderRadius: 16, padding: 22, gap: 12, marginTop: 14 }, lockTitle: { color: c.foreground, fontSize: 22, fontFamily: 'Inter_700Bold' }, body: { color: c.mutedForeground, lineHeight: 21, fontSize: 14 }, tag: { color: c.primary, fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.2 }, channelButton: { backgroundColor: c.primary, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 4 }, channelButtonText: { color: c.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 13 }, error: { color: c.destructive, fontSize: 13, lineHeight: 19 }, section: { color: c.mutedForeground, fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.2, marginTop: 8 }, plan: { backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 13, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 11 }, planIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#28183A', alignItems: 'center', justifyContent: 'center' }, planCopy: { flex: 1, gap: 3 }, planName: { color: c.foreground, fontSize: 16, fontFamily: 'Inter_700Bold' }, detail: { color: c.mutedForeground, fontSize: 11 }, price: { color: c.secondary, fontSize: 12, fontFamily: 'Inter_700Bold', marginBottom: 5 } });