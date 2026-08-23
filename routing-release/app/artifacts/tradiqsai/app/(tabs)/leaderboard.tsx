import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/utils/supabase';
import colors from '@/constants/colors';

type Profile = { id: string; username: string | null; simulated_pnl: number; win_rate: number; rank_tier: string };
const c = colors.light;
const tierIcon: Record<string, string> = { Bronze: 'shield', Silver: 'award', Gold: 'star', Platinum: 'zap' };
const podiumColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
const money = (n: number) => `${n >= 0 ? '+' : '−'}$${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

export default function LeaderboardScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [rows, setRows] = useState<Profile[]>([]);
  const [me, setMe] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const top = await supabase.from('profiles').select('id, username, simulated_pnl, win_rate, rank_tier').order('simulated_pnl', { ascending: false }).limit(50);
      if (top.error) throw top.error;
      const normalized = ((top.data ?? []) as Profile[]).map((p) => ({ ...p, simulated_pnl: Number(p.simulated_pnl ?? 0), win_rate: Number(p.win_rate ?? 0) }));
      setRows(normalized);
      if (session?.user.id) {
        const own = await supabase.from('profiles').select('id, username, simulated_pnl, win_rate, rank_tier').eq('id', session.user.id).maybeSingle();
        if (own.error) throw own.error;
        setMe(own.data ? { ...(own.data as Profile), simulated_pnl: Number(own.data.simulated_pnl ?? 0), win_rate: Number(own.data.win_rate ?? 0) } : null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load leaderboard.');
    } finally { setLoading(false); }
  }, [session?.user.id]);

  useEffect(() => { load(); }, [load]);
  const rank = me ? rows.findIndex((p) => p.id === me.id) + 1 || null : null;
  const topThree = rows.slice(0, 3);
  const rest = rows.slice(3);
  const next = rank && rank > 1 ? rows[rank - 2] : null;
  const tradesToNext = next && me ? Math.max(1, Math.ceil((next.simulated_pnl - me.simulated_pnl) / 100)) : 0;

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === 'web' ? 67 : insets.top }]}>
      <View style={styles.header}><View><Text style={styles.eyebrow}>COMPETITION / SEASON 01</Text><Text style={styles.title}>Global Leaderboard</Text><Text style={styles.subtitle}>Only the top 50 traders qualify for seasonal rewards.</Text></View><Feather name="globe" size={24} color={c.primary} /></View>
      {loading ? <LoadingState /> : error ? <View style={styles.state}><Feather name="alert-circle" size={28} color={c.destructive} /><Text style={styles.stateText}>Unable to load leaderboard</Text><Text style={styles.error}>{error}</Text><Pressable style={styles.retry} onPress={load}><Text style={styles.retryText}>Retry</Text></Pressable></View> : (
        <>
          <View style={styles.podium}>{topThree.map((p, i) => <Podium key={p.id} profile={p} rank={i + 1} />)}</View>
          <FlatList data={rest} keyExtractor={(p) => p.id} contentContainerStyle={styles.list} renderItem={({ item, index }) => <RankRow profile={item} rank={index + 4} />} ListEmptyComponent={<Text style={styles.empty}>More traders will appear as the season develops.</Text>} />
          {me && <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}><View><Text style={styles.footerLabel}>YOUR POSITION</Text><Text style={styles.footerName}>{me.username || 'Anonymous trader'}</Text><Text style={styles.footerNext}>Trades to next rank: {tradesToNext}</Text></View><View style={styles.footerRight}><Text style={styles.footerRank}>#{rank ?? '—'}</Text><Text style={styles.footerPnl}>{money(me.simulated_pnl)}</Text></View></View>}
        </>
      )}
    </View>
  );
}

function LoadingState() { return <View style={styles.state}><ActivityIndicator color={c.primary} size="large" /><Text style={styles.stateText}>Loading the global field…</Text><View style={styles.skeleton} /><View style={styles.skeleton} /><View style={styles.skeleton} /></View>; }
function Podium({ profile, rank }: { profile: Profile; rank: number }) { return <View style={[styles.podiumCard, rank === 1 && styles.firstPodium, { borderColor: podiumColors[rank - 1] }]}><Text style={[styles.podiumRank, { color: podiumColors[rank - 1] }]}>#{rank}</Text><View style={[styles.podiumAvatar, { borderColor: podiumColors[rank - 1] }]}><Text style={styles.avatarText}>{(profile.username || '?').slice(0, 1).toUpperCase()}</Text></View><Text style={styles.podiumName} numberOfLines={1}>{profile.username || 'Anonymous'}</Text><View style={styles.tier}><Feather name={(tierIcon[profile.rank_tier] || 'shield') as any} size={11} color={podiumColors[rank - 1]} /><Text style={styles.tierText}>{profile.rank_tier}</Text></View><Text style={styles.podiumPnl}>{money(profile.simulated_pnl)}</Text></View>; }
function RankRow({ profile, rank }: { profile: Profile; rank: number }) { return <View style={styles.row}><Text style={styles.rank}>{rank}</Text><View style={styles.rowAvatar}><Text style={styles.avatarText}>{(profile.username || '?').slice(0, 1).toUpperCase()}</Text></View><View style={styles.rowInfo}><Text style={styles.rowName}>{profile.username || 'Anonymous trader'}</Text><Text style={styles.rowTier}>{profile.rank_tier} tier</Text></View><View style={styles.rowStats}><Text style={styles.win}>{profile.win_rate.toFixed(1)}% win</Text><Text style={styles.rowPnl}>{money(profile.simulated_pnl)}</Text></View></View>; }

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0B0E' },
  header: { padding: 20, flexDirection: 'row', justifyContent: 'space-between' },
  eyebrow: { color: c.primary, fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  title: { color: c.foreground, fontSize: 24, marginTop: 5, fontFamily: 'Inter_700Bold' },
  subtitle: { color: c.mutedForeground, fontSize: 12, marginTop: 5 },
  podium: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 16 },
  podiumCard: { flex: 1, maxWidth: 125, minHeight: 158, alignItems: 'center', justifyContent: 'center', backgroundColor: '#16181D', borderWidth: 1, borderRadius: 14, padding: 9, gap: 5 },
  firstPodium: { minHeight: 180, marginBottom: 8 },
  podiumRank: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  podiumAvatar: { width: 42, height: 42, borderRadius: 21, borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0B0E' },
  avatarText: { color: c.primary, fontSize: 15, fontFamily: 'Inter_700Bold' },
  podiumName: { color: c.foreground, fontSize: 12, fontFamily: 'Inter_700Bold' },
  tier: { flexDirection: 'row', gap: 4, alignItems: 'center' }, tierText: { color: c.mutedForeground, fontSize: 10 },
  podiumPnl: { color: '#2ECA8B', fontSize: 16, fontFamily: 'Inter_700Bold' },
  list: { paddingHorizontal: 16, paddingBottom: 130, gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: '#16181D', borderBottomWidth: 1, borderBottomColor: '#262930', padding: 12 },
  rank: { color: c.mutedForeground, width: 24, textAlign: 'center', fontFamily: 'Inter_700Bold' },
  rowAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#0A0B0E', alignItems: 'center', justifyContent: 'center' },
  rowInfo: { flex: 1 }, rowName: { color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 13 }, rowTier: { color: c.mutedForeground, fontSize: 10, marginTop: 3 },
  rowStats: { alignItems: 'flex-end', gap: 3 }, win: { color: c.mutedForeground, fontSize: 10 }, rowPnl: { color: '#2ECA8B', fontFamily: 'Inter_700Bold', fontSize: 13 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: '#12141A', borderTopWidth: 1, borderTopColor: c.primary, padding: 14, flexDirection: 'row', justifyContent: 'space-between' },
  footerLabel: { color: c.primary, fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1 }, footerName: { color: c.foreground, fontSize: 15, fontFamily: 'Inter_700Bold', marginTop: 3 }, footerNext: { color: c.mutedForeground, fontSize: 11, marginTop: 3 }, footerRight: { alignItems: 'flex-end' }, footerRank: { color: c.primary, fontSize: 20, fontFamily: 'Inter_700Bold' }, footerPnl: { color: '#2ECA8B', fontSize: 13, fontFamily: 'Inter_700Bold' },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 }, stateText: { color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 15 }, error: { color: c.mutedForeground, textAlign: 'center', fontSize: 11 }, retry: { borderColor: c.primary, borderWidth: 1, borderRadius: 8, paddingHorizontal: 18, paddingVertical: 8 }, retryText: { color: c.primary, fontFamily: 'Inter_700Bold' }, skeleton: { height: 52, width: '100%', maxWidth: 420, backgroundColor: '#16181D', borderRadius: 10 }, empty: { color: c.mutedForeground, textAlign: 'center', padding: 30 },
});