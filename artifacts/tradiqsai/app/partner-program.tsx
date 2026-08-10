import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/constants/colors';

const c = colors.light;
const earnCards = [
  ['credit-card', 'Premium Subscriptions', '$50 recurring'],
  ['briefcase', 'Broker Signups', '$25 CPA'],
  ['users', 'Sub-Affiliate Network', '5% passive income'],
] as const;
const tiers = [
  ['Ambassador', '5%', 'Basic dashboard', 'Start here'],
  ['Elite', '10%', 'Marketing materials · 25+ referrals', 'Popular'],
  ['Master', '15%', 'VIP support · 100+ referrals', 'Top tier'],
] as const;

export default function PartnerProgramScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [referrals, setReferrals] = useState(50);
  const monthly = useMemo(() => referrals * 50, [referrals]);
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 105 }]} showsVerticalScrollIndicator={false}>
        <View style={styles.header}><TouchableOpacity onPress={() => router.back()} accessibilityLabel="Go back"><Feather name="chevron-left" size={24} color={c.foreground} /></TouchableOpacity><Text style={styles.headerTitle}>PARTNER PROGRAM</Text><Feather name="share-2" size={18} color={c.primary} /></View>
        <Text style={styles.heroTitle}>Build Your{'\n'}Trading Empire</Text>
        <Text style={styles.heroSubtitle}>Turn your network into passive income.</Text>
        <View style={styles.highlight}><Feather name="zap" size={16} color={c.primaryForeground} /><Text style={styles.highlightText}>$50+ per Pro signup + Recurring Commissions</Text></View>
        <View style={styles.simulator}><Text style={styles.sectionLabel}>CALCULATE YOUR POTENTIAL</Text><Text style={styles.simTitle}>How many referrals can you bring?</Text><View style={styles.sliderRow}><TouchableOpacity onPress={() => setReferrals(Math.max(10, referrals - 10))}><Feather name="minus-circle" size={20} color={c.primary} /></TouchableOpacity><View style={styles.track}><View style={[styles.fill, { width: `${((referrals - 10) / 990) * 100}%` }]} /><View style={[styles.thumb, { left: `${((referrals - 10) / 990) * 100}%` }]} /></View><TouchableOpacity onPress={() => setReferrals(Math.min(1000, referrals + 10))}><Feather name="plus-circle" size={20} color={c.primary} /></TouchableOpacity></View><View style={styles.range}><Text>10</Text><Text style={styles.referralCount}>{referrals} referrals</Text><Text>1000</Text></View><Text style={styles.monthly}>${monthly.toLocaleString()}<Text style={styles.monthlySuffix}> / month</Text></Text></View>
        <Text style={styles.sectionLabel}>WAYS TO EARN</Text><View style={styles.earnGrid}>{earnCards.map(([icon, title, detail]) => <View style={styles.earnCard} key={title}><Feather name={icon as any} size={20} color={c.primary} /><Text style={styles.earnTitle}>{title}</Text><Text style={styles.earnDetail}>{detail}</Text></View>)}</View>
        <Text style={styles.sectionLabel}>PARTNERSHIP TIERS</Text><View style={styles.tiers}>{tiers.map(([title, commission, detail, badge], i) => <View style={[styles.tier, i === 1 && styles.eliteTier, i === 2 && styles.masterTier]} key={title}>{i > 0 && <Text style={[styles.tierBadge, i === 2 && styles.goldText]}>{badge.toUpperCase()}</Text>}<Text style={styles.tierTitle}>{title}</Text><Text style={[styles.commission, i === 2 && styles.goldText]}>{commission}<Text style={styles.percent}> commission</Text></Text><Text style={styles.tierDetail}>{detail}</Text></View>)}</View>
        <View style={styles.arsenal}><Feather name="edit-3" size={20} color={c.primary} /><View style={{ flex: 1 }}><Text style={styles.arsenalTitle}>Done-For-You Content</Text><Text style={styles.arsenalText}>Get instant access to high-converting TikTok hooks, Instagram Stories, and X templates the moment you are approved.</Text></View></View>
        <Text style={styles.sectionLabel}>TOP PARTNERS THIS MONTH</Text><View style={styles.podium}>{[['al***x', '1st', '#E6C65C'], ['tr***r', '2nd', '#B9C1CC'], ['fx***ly', '3rd', '#B77A4A']].map(([name, rank, color]) => <View style={styles.podiumItem} key={name}><View style={[styles.podiumAvatar, { borderColor: color }]}><Text style={styles.avatarText}>{name.slice(0, 2)}</Text></View><Text style={styles.partnerName}>{name}</Text><Text style={[styles.rank, { color }]}>{rank}</Text></View>)}</View><View style={styles.rankList}><View style={styles.rankListRow}><Text style={styles.rankName}>4  •  tr***de</Text><Text style={styles.rankAmount}>$3,840</Text></View><View style={styles.rankListRow}><Text style={styles.rankName}>5  •  ma***fx</Text><Text style={styles.rankAmount}>$3,210</Text></View></View>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}><TouchableOpacity style={styles.apply} onPress={() => alert('Partner applications will open soon.')}><Text style={styles.applyText}>Apply for Partner Status</Text><Feather name="arrow-up-right" size={17} color={c.primaryForeground} /></TouchableOpacity></View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background }, content: { padding: 18 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, headerTitle: { color: c.mutedForeground, fontSize: 10, letterSpacing: 1.4, fontFamily: 'Inter_700Bold' },
  heroTitle: { color: c.foreground, fontSize: 38, lineHeight: 42, fontFamily: 'Inter_700Bold', marginTop: 34 }, heroSubtitle: { color: c.mutedForeground, fontSize: 15, marginTop: 9 },
  highlight: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', backgroundColor: c.primary, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 9, marginTop: 18 }, highlightText: { color: c.primaryForeground, fontSize: 10, fontFamily: 'Inter_700Bold' },
  simulator: { backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 14, padding: 17, marginTop: 25, marginBottom: 25 }, sectionLabel: { color: c.primary, fontSize: 9, letterSpacing: 1.5, fontFamily: 'Inter_700Bold', marginBottom: 10 }, simTitle: { color: c.foreground, fontSize: 14, fontFamily: 'Inter_600SemiBold', marginBottom: 22 }, sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 10 }, track: { height: 5, backgroundColor: c.border, borderRadius: 4, flex: 1 }, fill: { height: 5, backgroundColor: c.primary, borderRadius: 4 }, thumb: { position: 'absolute', top: -5, width: 15, height: 15, marginLeft: -7, borderRadius: 8, backgroundColor: c.primary }, range: { flexDirection: 'row', justifyContent: 'space-between', color: c.mutedForeground, fontSize: 9, marginTop: 9 }, referralCount: { color: c.primary, fontFamily: 'Inter_700Bold' }, monthly: { color: c.primary, fontSize: 32, fontFamily: 'Inter_700Bold', marginTop: 22, textShadowColor: c.primary, textShadowRadius: 10 }, monthlySuffix: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  earnGrid: { flexDirection: 'row', gap: 8, marginBottom: 25 }, earnCard: { flex: 1, minHeight: 105, backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 10, padding: 11 }, earnTitle: { color: c.foreground, fontSize: 11, fontFamily: 'Inter_700Bold', marginTop: 12 }, earnDetail: { color: c.success, fontSize: 10, marginTop: 5 },
  tiers: { gap: 9, marginBottom: 20 }, tier: { backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 12, padding: 15 }, eliteTier: { borderColor: c.primary }, masterTier: { borderColor: '#8B7125' }, tierBadge: { alignSelf: 'flex-end', color: c.primary, fontSize: 8, fontFamily: 'Inter_700Bold', letterSpacing: 1 }, goldText: { color: '#E6C65C' }, tierTitle: { color: c.foreground, fontSize: 16, fontFamily: 'Inter_700Bold', marginTop: -3 }, commission: { color: c.primary, fontSize: 25, fontFamily: 'Inter_700Bold', marginTop: 7 }, percent: { color: c.mutedForeground, fontSize: 10, fontFamily: 'Inter_400Regular' }, tierDetail: { color: c.mutedForeground, fontSize: 11, marginTop: 3 },
  arsenal: { flexDirection: 'row', gap: 12, backgroundColor: c.background, borderColor: c.border, borderWidth: 1, borderRadius: 10, padding: 15, marginBottom: 25 }, arsenalTitle: { color: c.foreground, fontSize: 14, fontFamily: 'Inter_700Bold' }, arsenalText: { color: c.mutedForeground, fontSize: 11, lineHeight: 17, marginTop: 5 },
  podium: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 12, padding: 18, paddingTop: 22 }, podiumItem: { alignItems: 'center' }, podiumAvatar: { width: 54, height: 54, borderRadius: 27, borderWidth: 2, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: c.foreground, fontFamily: 'Inter_700Bold' }, partnerName: { color: c.foreground, fontSize: 11, marginTop: 8 }, rank: { fontSize: 10, fontFamily: 'Inter_700Bold', marginTop: 3 }, rankList: { backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 10, marginTop: 8, paddingHorizontal: 14 }, rankListRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 11, borderBottomColor: c.border, borderBottomWidth: 1 }, rankName: { color: c.mutedForeground, fontSize: 12 }, rankAmount: { color: c.success, fontSize: 12, fontFamily: 'Inter_700Bold' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: c.background, paddingHorizontal: 18, paddingTop: 16 }, apply: { backgroundColor: c.primary, borderRadius: 9, paddingVertical: 16, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }, applyText: { color: c.primaryForeground, fontSize: 13, fontFamily: 'Inter_700Bold' },
});