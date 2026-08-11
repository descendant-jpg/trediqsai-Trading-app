import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import {
  isPlatformPaySupported,
  PlatformPay,
  PlatformPayButton,
  usePlatformPay,
} from '@/lib/platform-pay';
import { useAuth } from '@/context/AuthContext';
import { customFetch } from '@workspace/api-client-react';

const GOLD = '#FFD700';
const features = ['Unlock All AutoPilot Bots', 'Priority 1-Hour VIP Support', 'Live BrokerSync Integration', 'Zero-Latency Push Notifications'];
function notify(title: string, message: string) {
  if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

export default function UpgradeScreen() {
  const { session } = useAuth();
  const { confirmPlatformPayPayment } = usePlatformPay();
  const [platformPayAvailable, setPlatformPayAvailable] = useState(false);
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    isPlatformPaySupported().then(setPlatformPayAvailable).catch(() => setPlatformPayAvailable(false));
  }, []);

  const handlePayment = async () => {
    if (!session?.user.id) return notify('Sign in required', 'Sign in to upgrade to TradiQs Elite.');
    setPaying(true);
    try {
      // Step 1: Ask the server to create a PaymentIntent. The server attaches
      // the user ID to its metadata so the confirm step can verify ownership.
      const { clientSecret } = await customFetch<{ clientSecret: string }>(
        '/api/payment/intent',
        { method: 'POST' },
      );

      // Step 2: Confirm the payment via Apple Pay / Google Pay (native) or
      // fall back to a message on web / unsupported devices.
      if (Platform.OS === 'web') {
        notify(
          'Mobile payment required',
          'Elite upgrades are completed in the TradiQs mobile app using Apple Pay or Google Pay.',
        );
        return;
      }

      const { error, paymentIntent } = await confirmPlatformPayPayment(clientSecret, {
        applePay: {
          cartItems: [
            {
              label: 'TradiQs Elite',
              amount: '49.00',
              paymentType: PlatformPay.PaymentType.Immediate,
            },
          ],
          merchantCountryCode: 'US',
          currencyCode: 'USD',
        },
        googlePay: {
          testEnv: false,
          merchantName: 'TradiQs',
          merchantCountryCode: 'US',
          currencyCode: 'USD',
          billingAddressConfig: { format: PlatformPay.BillingAddressFormat.Min },
        },
      });

      if (error) {
        notify('Payment failed', error.message ?? 'Please try again.');
        return;
      }

      if (!paymentIntent?.id) {
        notify('Payment incomplete', 'We could not confirm your payment. Please try again.');
        return;
      }

      // Step 3: Tell the server the PaymentIntent ID. The server verifies the
      // payment succeeded in Stripe and then writes subscription_tier = 'pro'
      // to Supabase using the service role key — the only place that write happens.
      await customFetch<{ success: boolean }>('/api/payment/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentIntentId: paymentIntent.id }),
      });

      notify('Welcome to TradiQs Elite.', 'Your Pro AutoPilot bots and Elite features are now active.');
    } catch (err) {
      notify('Upgrade unavailable', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setPaying(false);
    }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'TradiQs Elite', headerStyle: { backgroundColor: '#0A0B0E' }, headerTintColor: '#FFF' }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>THE ELITE TIER</Text>
        <Text style={styles.title}>TradiQs Elite</Text>
        <Text style={styles.subtitle}>Trade with the full intelligence of the TradiQs terminal.</Text>
        <View style={styles.priceCard}>
          <View style={styles.glow} />
          <Text style={styles.price}>$49</Text>
          <Text style={styles.priceCaption}>LIFETIME ACCESS · ONE-TIME PURCHASE</Text>
        </View>
        <Text style={styles.section}>EVERYTHING YOU NEED TO LEAD</Text>
        <View style={styles.featureCard}>
          {features.map((feature) => (
            <View key={feature} style={styles.feature}>
              <View style={styles.check}><Feather name="check" size={14} color="#0A0B0E" /></View>
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}
        </View>
        {platformPayAvailable ? (
          <View style={styles.payButton}>
            {paying ? <ActivityIndicator color={GOLD} /> : (
              <PlatformPayButton
                type={PlatformPay.ButtonType.Buy}
                appearance={PlatformPay.ButtonStyle.Black}
                onPress={handlePayment}
                style={styles.nativeButton}
              />
            )}
          </View>
        ) : (
          <TouchableOpacity style={styles.cta} onPress={handlePayment} disabled={paying} activeOpacity={0.86}>
            {paying ? <ActivityIndicator color="#0A0B0E" /> : (
              <>
                <Text style={styles.ctaText}>UPGRADE TO ELITE</Text>
                <Feather name="arrow-right" size={19} color="#0A0B0E" />
              </>
            )}
          </TouchableOpacity>
        )}
        <Text style={styles.footnote}>
          {platformPayAvailable
            ? 'Use Apple Pay or Google Pay to activate Elite.'
            : 'Platform Pay is unavailable on this device. Continue with the secure upgrade flow.'}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0B0E' },
  content: { padding: 20, paddingBottom: 48 },
  eyebrow: { color: GOLD, fontSize: 10, fontWeight: '900', letterSpacing: 2 },
  title: { color: '#FFF', fontSize: 30, fontWeight: '900', marginTop: 8 },
  subtitle: { color: '#9299A4', fontSize: 13, lineHeight: 19, marginTop: 8 },
  priceCard: { backgroundColor: '#211E0A', borderWidth: 1.5, borderColor: GOLD, borderRadius: 18, padding: 27, marginTop: 24, alignItems: 'center', overflow: 'hidden', shadowColor: GOLD, shadowOpacity: .45, shadowRadius: 18 },
  glow: { position: 'absolute', width: 170, height: 170, borderRadius: 90, backgroundColor: '#FFD70022', top: -85 },
  price: { color: GOLD, fontSize: 42, fontWeight: '900' },
  priceCaption: { color: '#D8C766', fontSize: 9, fontWeight: '800', letterSpacing: 1.2, marginTop: 8 },
  section: { color: '#6D727B', fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginTop: 30, marginBottom: 10 },
  featureCard: { backgroundColor: '#16181D', borderRadius: 14, borderWidth: 1, borderColor: '#292D35', padding: 17 },
  feature: { flexDirection: 'row', alignItems: 'center', minHeight: 46 },
  check: { width: 24, height: 24, borderRadius: 12, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  featureText: { color: '#F0F1F3', fontSize: 14, fontWeight: '700' },
  payButton: { height: 52, marginTop: 24, justifyContent: 'center' },
  nativeButton: { width: '100%', height: 52 },
  cta: { backgroundColor: GOLD, borderRadius: 11, padding: 17, marginTop: 24, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 },
  ctaText: { color: '#0A0B0E', fontSize: 15, fontWeight: '900', letterSpacing: .8 },
  footnote: { color: '#666D77', fontSize: 11, lineHeight: 16, textAlign: 'center', marginTop: 14 },
});
