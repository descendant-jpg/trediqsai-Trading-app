import React, { useState } from 'react';
import { Alert, Platform, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import colors from '@/constants/colors';

const c = colors.light;
const QUOTES = [
  ['Trading Edge', 'The market rewards patience more reliably than prediction.', 'TradiQs Oracle'],
  ['Trading Edge', 'Protect your downside first; the upside takes care of itself.', 'TradiQs Oracle'],
  ['Trading Edge', 'A great trade is one you can explain before you enter it.', 'TradiQs Oracle'],
  ['Trading Edge', 'Consistency is the edge that compounds when excitement fades.', 'TradiQs Oracle'],
  ['Mindset', 'Financial freedom is built one disciplined decision at a time.', 'TradiQs Oracle'],
  ['Mindset', 'You do not need to win every trade. You need to follow your process.', 'TradiQs Oracle'],
  ['Mindset', 'Clarity grows when you stop forcing the market to agree with you.', 'TradiQs Oracle'],
] as const;

export default function QuotesScreen() {
  const router = useRouter();
  const [category, setCategory] = useState<'Trading Edge' | 'Mindset'>('Trading Edge');
  const [index, setIndex] = useState(0);
  const visible = QUOTES.filter((quote) => quote[0] === category);
  const quote = visible[index % visible.length];
  const next = () => setIndex((value) => (value + 1) % visible.length);
  const share = async () => {
    const message = `“${quote[1]}” — ${quote[2]}`;
    if (Platform.OS === 'web') window.alert(message);
    else await Share.share({ message });
  };
  return (
    <View style={styles.container}>
      <Header title="Daily Wisdom" onClose={() => router.back()} />
      <View style={styles.toggle}>
        {(['Trading Edge', 'Mindset'] as const).map((item) => (
          <TouchableOpacity key={item} style={[styles.toggleItem, item === category && styles.active]} onPress={() => { setCategory(item); setIndex(0); }} accessibilityRole="button" accessibilityLabel={item}>
            <Text style={[styles.toggleText, item === category && styles.activeText]}>{item}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.quoteCard}>
        <Feather name="message-circle" size={25} color={c.primary} />
        <Text style={styles.quote}>“{quote[1]}”</Text>
        <Text style={styles.category}>{quote[0].toUpperCase()}</Text>
        <Text style={styles.credit}>— {quote[2]} · August 10, 2026</Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity style={styles.outline} onPress={() => { if (Platform.OS === 'web') window.alert('Image saving is not available in preview yet. Use Share to save this quote.'); else Alert.alert('Save Image', 'Image saving is not available yet. Use Share to save this quote.'); }} accessibilityRole="button" accessibilityLabel="Save quote image"><Feather name="download" size={17} color={c.primary} /><Text style={styles.actionText}>Save Image</Text></TouchableOpacity>
        <TouchableOpacity style={styles.outline} onPress={share} accessibilityRole="button" accessibilityLabel="Share quote"><Feather name="share-2" size={17} color={c.primary} /><Text style={styles.actionText}>Share</Text></TouchableOpacity>
      </View>
      <TouchableOpacity style={styles.generate} onPress={next} accessibilityRole="button" accessibilityLabel="Generate new wisdom"><Feather name="refresh-cw" size={17} color={c.primaryForeground} /><Text style={styles.generateText}>Generate New Wisdom</Text></TouchableOpacity>
    </View>
  );
}

function Header({ title, onClose }: { title: string; onClose: () => void }) {
  return <View style={styles.header}><Text style={styles.title}>{title}</Text><TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close"><Feather name="x" size={23} color={c.foreground} /></TouchableOpacity></View>;
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background, padding: 20, paddingTop: 58 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { color: c.foreground, fontSize: 24, fontFamily: 'Inter_700Bold' },
  toggle: { flexDirection: 'row', backgroundColor: c.card, borderRadius: 12, padding: 4, marginTop: 24 },
  toggleItem: { flex: 1, padding: 12, alignItems: 'center', borderRadius: 9 },
  active: { backgroundColor: c.primary }, toggleText: { color: c.mutedForeground, fontFamily: 'Inter_600SemiBold' }, activeText: { color: c.primaryForeground },
  quoteCard: { backgroundColor: c.card, borderColor: c.primary, borderWidth: 1, borderRadius: 18, padding: 24, marginTop: 24, minHeight: 260, justifyContent: 'center', gap: 18 },
  quote: { color: c.foreground, fontSize: 25, lineHeight: 35, fontFamily: 'Inter_700Bold' },
  category: { color: c.primary, fontSize: 11, letterSpacing: 1.5, fontFamily: 'Inter_700Bold' },
  credit: { color: c.mutedForeground, fontSize: 12, fontFamily: 'Inter_400Regular' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 }, outline: { flex: 1, borderColor: c.border, borderWidth: 1, borderRadius: 10, padding: 13, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7 }, actionText: { color: c.foreground, fontFamily: 'Inter_600SemiBold' },
  generate: { marginTop: 14, backgroundColor: c.primary, padding: 16, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', gap: 8 }, generateText: { color: c.primaryForeground, fontFamily: 'Inter_700Bold' },
});