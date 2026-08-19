import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Swipeable } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  deleteWaitlistLead,
  fetchWaitlistLeads,
  type WaitlistLead,
} from '@/services/adminService';

export default function AdminWaitlist() {
  const [leads, setLeads] = useState<WaitlistLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setLeads(await fetchWaitlistLeads());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load waitlist leads.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function remove(lead: WaitlistLead) {
    try {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } catch {
      // Haptics can be unavailable in web previews; deletion still requires confirmation.
    }

    Alert.alert(
      'Remove waitlist lead?',
      `${lead.email} will be permanently removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void deleteWaitlistLead(lead.id)
              .then(() => {
                setLeads((current) => current.filter((item) => item.id !== lead.id));
                return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
              })
              .catch((caught: unknown) => {
                setError(caught instanceof Error ? caught.message : 'Unable to remove this lead.');
              });
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {loading ? (
        <ActivityIndicator color="#00F0FF" style={styles.loader} />
      ) : (
        <FlatList
          data={leads}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.header}>
              <Text style={styles.title}>Launch demand</Text>
              <Text style={styles.subtitle}>Swipe a lead left to reveal the protected removal action.</Text>
              {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
            </View>
          }
          ListEmptyComponent={<Text style={styles.empty}>No waitlist leads yet.</Text>}
          renderItem={({ item }) => <LeadRow lead={item} onRemove={() => void remove(item)} />}
          refreshing={loading}
          onRefresh={() => void load()}
        />
      )}
    </SafeAreaView>
  );
}

function LeadRow({ lead, onRemove }: { lead: WaitlistLead; onRemove: () => void }) {
  const swipeable = useRef<Swipeable>(null);
  const initials = (lead.name || lead.email)
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <Swipeable
      ref={swipeable}
      overshootRight={false}
      friction={2}
      rightThreshold={36}
      renderRightActions={() => (
        <Pressable
          accessibilityLabel={`Remove ${lead.email}`}
          onPress={() => {
            swipeable.current?.close();
            onRemove();
          }}
          style={({ pressed }) => [styles.deleteAction, pressed && styles.pressed]}
        >
          <Feather name="trash-2" size={20} color="#FFFFFF" />
          <Text style={styles.deleteText}>REMOVE</Text>
        </Pressable>
      )}
    >
      <View style={styles.row}>
        <View style={styles.avatar}><Text style={styles.avatarText}>{initials || '?'}</Text></View>
        <View style={styles.copy}>
          <Text style={styles.name}>{lead.name || 'Waitlist trader'}</Text>
          <Text style={styles.email}>{lead.email}</Text>
        </View>
        <View style={styles.meta}>
          <Text style={styles.status}>{lead.status || 'pending'}</Text>
          <Text style={styles.date}>{formatDate(lead.created_at)}</Text>
        </View>
      </View>
    </Swipeable>
  );
}

function formatDate(value: string) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 'Recently' : new Date(parsed).toLocaleDateString();
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0A0B0E' },
  loader: { flex: 1 },
  list: { padding: 20, paddingBottom: 40 },
  header: { marginBottom: 22 },
  title: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 28 },
  subtitle: { color: '#8A8D93', fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21, marginTop: 8 },
  error: { color: '#FF7676', fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 18, marginTop: 12 },
  empty: { color: '#777B84', textAlign: 'center', marginTop: 80, fontFamily: 'Inter_500Medium' },
  row: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 17, borderWidth: 1, borderColor: '#22252A', backgroundColor: '#121419', padding: 14, marginBottom: 10 },
  avatar: { width: 43, height: 43, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,240,255,0.09)', borderWidth: 1, borderColor: 'rgba(0,240,255,0.15)' },
  avatarText: { color: '#00F0FF', fontFamily: 'Inter_700Bold', fontSize: 13 },
  copy: { flex: 1 },
  name: { color: '#FFFFFF', fontFamily: 'Inter_600SemiBold', fontSize: 14 },
  email: { color: '#777B84', fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 },
  meta: { alignItems: 'flex-end', gap: 5 },
  status: { color: '#2ECA8B', fontFamily: 'Inter_700Bold', fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.7 },
  date: { color: '#555963', fontFamily: 'Inter_500Medium', fontSize: 9 },
  deleteAction: { width: 94, minHeight: 82, alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 17, backgroundColor: '#C53F4C', marginBottom: 10, marginLeft: 8 },
  deleteText: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 8, letterSpacing: 1 },
  pressed: { opacity: 0.7 },
});