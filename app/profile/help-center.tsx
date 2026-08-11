import React, { useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/utils/supabase';

const CYAN = '#00F0FF';
const faqs = [['My simulated PnL is wrong', 'PnL is calculated from the recorded entry and live close price. Refresh your Portfolio after closing a position to sync the latest result.'], ['How do I upgrade to Elite?', 'Open the subscription panel from your Profile and choose an eligible plan. Elite access unlocks the highest signal and support tier.'], ['What timezone are signals in?', 'Signal timestamps are shown in UTC by default. You can choose your preferred trading-day timezone from Profile settings.']] as const;
function notify(title: string, message: string) { if (Platform.OS === 'web') window.alert(`${title}\n\n${message}`); else Alert.alert(title, message); }

export default function HelpCenterScreen() {
  const { session } = useAuth();
  const [open, setOpen] = useState<number | null>(null);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  async function submitTicket() {
    if (!session?.user.id) return notify('Sign in required', 'Sign in to submit a support ticket.');
    if (!subject.trim() || !message.trim()) return notify('Support ticket', 'Add a subject and message before submitting.');
    setSubmitting(true);
    try {
      const { error } = await supabase.from('support_tickets').insert({ user_id: session.user.id, subject: subject.trim(), message: message.trim() });
      if (error) throw error;
      setSubject(''); setMessage('');
      notify('Ticket received', 'Support will contact you shortly.');
    } catch (error) { notify('Unable to submit ticket', error instanceof Error ? error.message : 'Please try again.'); }
    finally { setSubmitting(false); }
  }
  return <View style={styles.container}><Stack.Screen options={{ title: 'VIP Support', headerShown: true, headerStyle: { backgroundColor: '#0A0B0E' }, headerTintColor: '#FFF' }} /><ScrollView contentContainerStyle={styles.content}><Text style={styles.eyebrow}>CONCIERGE DESK</Text><Text style={styles.title}>VIP Support</Text><Text style={styles.intro}>Institutional-grade assistance when every decision matters.</Text><View style={styles.statusCard}><Text style={styles.sectionTitle}>SYSTEM STATUS</Text>{['AI Signal Engine: Operational', 'Trade Execution: Optimal', 'Database: Connected'].map((item) => <View key={item} style={styles.statusRow}><View style={styles.dot} /><Text style={styles.statusText}>{item}</Text><Text style={styles.live}>LIVE</Text></View>)}</View><View style={styles.formCard}><Text style={styles.sectionTitle}>OPEN A TICKET</Text><TextInput value={subject} onChangeText={setSubject} placeholder="Subject" placeholderTextColor="#737983" style={styles.input} /><TextInput value={message} onChangeText={setMessage} placeholder="Describe how we can help" placeholderTextColor="#737983" multiline numberOfLines={5} textAlignVertical="top" style={[styles.input, styles.messageInput]} /><TouchableOpacity style={[styles.ticket, submitting && styles.disabled]} onPress={submitTicket} disabled={submitting}><Text style={styles.ticketTitle}>{submitting ? 'Submitting…' : 'Submit Ticket'}</Text>{submitting && <ActivityIndicator color="#0A0B0E" />}</TouchableOpacity></View><Text style={styles.section}>FREQUENTLY ASKED QUESTIONS</Text>{faqs.map(([question, answer], index) => <View key={question} style={styles.faq}><TouchableOpacity style={styles.faqHeader} onPress={() => setOpen(open === index ? null : index)}><Text style={styles.question}>{question}</Text><Feather name="chevron-down" size={17} color={CYAN} /></TouchableOpacity>{open === index && <Text style={styles.answer}>{answer}</Text>}</View>)}</ScrollView></View>;
}

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: '#0A0B0E' }, content: { padding: 20, paddingBottom: 40 }, eyebrow: { color: CYAN, fontSize: 10, fontWeight: '700', letterSpacing: 2 }, title: { color: '#FFF', fontSize: 28, fontWeight: '700', marginTop: 8 }, intro: { color: '#8A8D93', fontSize: 13, lineHeight: 19, marginTop: 7 }, statusCard: { backgroundColor: '#16181D', borderRadius: 15, borderWidth: 1, borderColor: '#262930', padding: 16, marginTop: 22 }, sectionTitle: { color: '#6D727B', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 10 }, statusRow: { flexDirection: 'row', alignItems: 'center', minHeight: 34 }, dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#2ECA8B', marginRight: 10 }, statusText: { color: '#FFF', fontSize: 12, flex: 1 }, live: { color: '#2ECA8B', fontSize: 9, fontWeight: '700', letterSpacing: 1 }, formCard: { backgroundColor: '#16181D', borderRadius: 15, borderWidth: 1, borderColor: '#262930', padding: 16, marginTop: 16 }, input: { color: '#FFF', backgroundColor: '#0A0B0E', borderWidth: 1, borderColor: '#30343D', borderRadius: 9, padding: 12, marginTop: 8, fontSize: 13 }, messageInput: { minHeight: 110 }, ticket: { backgroundColor: CYAN, borderRadius: 10, padding: 15, marginTop: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10 }, ticketTitle: { color: '#0A0B0E', fontSize: 15, fontWeight: '700' }, disabled: { opacity: 0.6 }, section: { color: '#6D727B', fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginTop: 28, marginBottom: 10 }, faq: { backgroundColor: '#16181D', borderRadius: 12, borderWidth: 1, borderColor: '#262930', marginBottom: 8, paddingHorizontal: 14 }, faqHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 54 }, question: { color: '#FFF', fontSize: 13, fontWeight: '700', flex: 1, paddingRight: 12 }, answer: { color: '#9A9FA8', fontSize: 12, lineHeight: 18, paddingBottom: 14 } });