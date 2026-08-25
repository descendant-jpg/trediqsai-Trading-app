import React, { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import Toast from 'react-native-toast-message';
import { SafeAreaView } from 'react-native-safe-area-context';
import { customFetch } from '@workspace/api-client-react';
import { useAuth } from '@/context/AuthContext';

const CYAN = '#00F0FF';

const faqs = [
  ['My simulated PnL is wrong', 'PnL is calculated from the recorded entry and live close price. Refresh your Portfolio after closing a position to sync the latest result.'],
  ['How do I upgrade to Elite?', 'Open the subscription panel from your Profile and choose an eligible plan. Elite access unlocks the highest signal and support tier.'],
  ['What timezone are signals in?', 'Signal timestamps are shown in UTC by default. You can choose your preferred trading-day timezone from Profile settings.'],
] as const;

export default function HelpCenterScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [open, setOpen] = useState<number | null>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submitTicket() {
    setError('');
    if (!userId) {
      setError('Sign in to submit a support ticket — we need your account to follow up.');
      return;
    }
    if (!message.trim()) {
      setError('Describe how we can help before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      // The API resolves identity, email and the concierge [TIER] triage
      // prefix server-side from the bearer token — clients cannot forge
      // priority — and writes to the shared CMS table (contact_messages)
      // with the service role.
      const result = await customFetch<{ reference: string; status: string }>('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject: subject.trim(),
          message: message.trim(),
        }),
      });
      setSubject('');
      setMessage('');
      Toast.show({
        type: 'success',
        text1: 'Ticket received',
        text2: `Reference ${result.reference} — support will contact you shortly.`,
        position: 'top',
        visibilityTime: 4000,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to submit ticket. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      {/* In-app header inside the safe area — the native header clipped the
          title on notched devices. */}
      <View style={styles.header}>
        <TouchableOpacity
          accessibilityLabel="Go back"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Feather name="chevron-left" size={22} color="#FFFFFF" />
          <Text style={styles.backText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>VIP Support</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.eyebrow}>CONCIERGE DESK</Text>
        <Text style={styles.title}>VIP Support</Text>
        <Text style={styles.intro}>Institutional-grade assistance when every decision matters.</Text>

        <View style={styles.statusCard}>
          <Text style={styles.sectionTitle}>SYSTEM STATUS</Text>
          {['AI Signal Engine: Operational', 'Trade Execution: Optimal', 'Database: Connected'].map((item) => (
            <View key={item} style={styles.statusRow}>
              <View style={styles.dot} />
              <Text style={styles.statusText}>{item}</Text>
              <Text style={styles.live}>LIVE</Text>
            </View>
          ))}
        </View>

        <View style={styles.formCard}>
          <Text style={styles.sectionTitle}>OPEN A TICKET</Text>
          <TextInput
            value={subject}
            onChangeText={setSubject}
            placeholder="Subject (optional)"
            placeholderTextColor="#737983"
            style={styles.input}
            testID="ticket-subject"
          />
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Describe how we can help"
            placeholderTextColor="#737983"
            multiline
            numberOfLines={5}
            textAlignVertical="top"
            style={[styles.input, styles.messageInput]}
            testID="ticket-message"
          />
          {error ? (
            <View style={styles.errorRow}>
              <Feather name="alert-circle" size={13} color="#FF8090" />
              <Text style={styles.errorText} testID="ticket-error">{error}</Text>
            </View>
          ) : null}
          <TouchableOpacity
            style={[styles.ticket, submitting && styles.disabled]}
            onPress={submitTicket}
            disabled={submitting}
            accessibilityRole="button"
            testID="ticket-submit"
          >
            {submitting ? (
              <>
                <ActivityIndicator color="#0A0B0E" />
                <Text style={styles.ticketTitle}>Submitting…</Text>
              </>
            ) : (
              <Text style={styles.ticketTitle}>Submit Ticket</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.section}>FREQUENTLY ASKED QUESTIONS</Text>
        {faqs.map(([question, answer], index) => (
          <View key={question} style={styles.faq}>
            <TouchableOpacity style={styles.faqHeader} onPress={() => setOpen(open === index ? null : index)}>
              <Text style={styles.question}>{question}</Text>
              <Feather name="chevron-down" size={17} color={CYAN} />
            </TouchableOpacity>
            {open === index && <Text style={styles.answer}>{answer}</Text>}
          </View>
        ))}
      </ScrollView>

      {/* Toast host for ticket confirmations. */}
      <Toast />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0B0E' },
  header: {
    alignItems: 'center',
    borderBottomColor: '#22252A',
    borderBottomWidth: 1,
    flexDirection: 'row',
    height: 58,
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  backButton: { alignItems: 'center', flexDirection: 'row', minHeight: 44, minWidth: 84 },
  backText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600', marginLeft: 2 },
  headerTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  headerSpacer: { minWidth: 84 },
  content: { padding: 20, paddingBottom: 40 },
  eyebrow: { color: CYAN, fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  title: { color: '#FFF', fontSize: 28, fontWeight: '700', marginTop: 8 },
  intro: { color: '#8A8D93', fontSize: 13, lineHeight: 19, marginTop: 7 },
  statusCard: { backgroundColor: '#16181D', borderRadius: 15, borderWidth: 1, borderColor: '#262930', padding: 16, marginTop: 22 },
  sectionTitle: { color: '#6D727B', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 10 },
  statusRow: { flexDirection: 'row', alignItems: 'center', minHeight: 34 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#2ECA8B', marginRight: 10 },
  statusText: { color: '#FFF', fontSize: 12, flex: 1 },
  live: { color: '#2ECA8B', fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  formCard: { backgroundColor: '#16181D', borderRadius: 15, borderWidth: 1, borderColor: '#262930', padding: 16, marginTop: 16 },
  input: { color: '#FFF', backgroundColor: '#0A0B0E', borderWidth: 1, borderColor: '#30343D', borderRadius: 9, padding: 12, marginTop: 8, fontSize: 13 },
  messageInput: { minHeight: 110 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  errorText: { color: '#FF8090', fontSize: 12, flex: 1 },
  ticket: { backgroundColor: CYAN, borderRadius: 10, padding: 15, marginTop: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10 },
  ticketTitle: { color: '#0A0B0E', fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.6 },
  section: { color: '#6D727B', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginTop: 28, marginBottom: 10 },
  faq: { backgroundColor: '#16181D', borderRadius: 12, borderWidth: 1, borderColor: '#262930', marginBottom: 8, paddingHorizontal: 14 },
  faqHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 54 },
  question: { color: '#FFF', fontSize: 13, fontWeight: '700', flex: 1, paddingRight: 12 },
  answer: { color: '#9A9FA8', fontSize: 12, lineHeight: 18, paddingBottom: 14 },
});
