import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fetchAdminMetrics, type AdminMetrics } from '@/services/adminService';

const initialMetrics: AdminMetrics = { waitlistCount: 0, insightsCount: 0 };

export default function AdminDashboard() {
  const router = useRouter();
  const [metrics, setMetrics] = useState(initialMetrics);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      setMetrics(await fetchAdminMetrics());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load admin metrics.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor="#00F0FF" />}
      >
        <View style={styles.eyebrow}>
          <View style={styles.liveDot} />
          <Text style={styles.eyebrowText}>GOD ADMIN · SECURE SESSION</Text>
        </View>
        <Text style={styles.title}>Mobile command center</Text>
        <Text style={styles.subtitle}>Review editorial operations and launch demand without leaving the trading floor.</Text>

        {loading ? (
          <ActivityIndicator color="#00F0FF" style={styles.loader} />
        ) : (
          <View style={styles.metrics}>
            <MetricCard icon="users" label="WAITLIST LEADS" value={metrics.waitlistCount} />
            <MetricCard icon="file-text" label="MARKET INSIGHTS" value={metrics.insightsCount} />
          </View>
        )}
        {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}

        <Text style={styles.sectionLabel}>OPERATIONS</Text>
        <AdminAction
          icon="file-text"
          title="Market Insights"
          description="Review the editorial feed and create a quick draft."
          onPress={() => router.push('/admin/insights')}
        />
        <AdminAction
          icon="user-plus"
          title="Waitlist & Leads"
          description="Review launch demand and remove invalid leads."
          onPress={() => router.push('/admin/waitlist')}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function MetricCard({ icon, label, value }: { icon: keyof typeof Feather.glyphMap; label: string; value: number }) {
  return (
    <View style={styles.metricCard}>
      <View style={styles.metricIcon}><Feather name={icon} size={18} color="#00F0FF" /></View>
      <Text style={styles.metricValue}>{value.toLocaleString()}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function AdminAction({
  icon,
  title,
  description,
  onPress,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  description: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
      <View style={styles.actionIcon}><Feather name={icon} size={20} color="#00F0FF" /></View>
      <View style={styles.actionCopy}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionDescription}>{description}</Text>
      </View>
      <Feather name="chevron-right" size={20} color="#5E626B" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0A0B0E' },
  content: { padding: 20, paddingBottom: 40 },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#2ECA8B', shadowColor: '#2ECA8B', shadowOpacity: 0.9, shadowRadius: 8 },
  eyebrowText: { color: '#2ECA8B', fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.6 },
  title: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 30, marginTop: 14 },
  subtitle: { color: '#8A8D93', fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 22, marginTop: 10, maxWidth: 480 },
  loader: { marginVertical: 48 },
  metrics: { flexDirection: 'row', gap: 12, marginTop: 28 },
  metricCard: { flex: 1, minHeight: 150, borderRadius: 20, borderWidth: 1, borderColor: '#22252A', backgroundColor: '#121419', padding: 18 },
  metricIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,240,255,0.08)' },
  metricValue: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 30, marginTop: 20 },
  metricLabel: { color: '#6F737C', fontFamily: 'Inter_600SemiBold', fontSize: 9, letterSpacing: 1.2, marginTop: 4 },
  error: { color: '#FF7676', fontFamily: 'Inter_500Medium', fontSize: 13, marginTop: 16 },
  sectionLabel: { color: '#6F737C', fontFamily: 'Inter_700Bold', fontSize: 10, letterSpacing: 1.6, marginTop: 34, marginBottom: 12 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 18, borderWidth: 1, borderColor: '#22252A', backgroundColor: '#121419', padding: 16, marginBottom: 12 },
  actionIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,240,255,0.08)' },
  actionCopy: { flex: 1 },
  actionTitle: { color: '#FFFFFF', fontFamily: 'Inter_600SemiBold', fontSize: 15 },
  actionDescription: { color: '#777B84', fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 3 },
  pressed: { opacity: 0.7, transform: [{ scale: 0.99 }] },
});