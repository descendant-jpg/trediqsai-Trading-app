import React, { useState } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { PaywallModal } from '@/components/PaywallModal';
import colors from '@/constants/colors';

const c = colors.light;

type Props = { visible: boolean; onClose: () => void };

const masterclasses = [
  { title: 'Market Structure', detail: 'Read price like a professional', locked: false },
  { title: 'Order Blocks', detail: 'Find high-conviction entries', locked: true },
  { title: 'Risk Management', detail: 'Protect your evaluation account', locked: true },
];

export function AcademyModal({ visible, onClose }: Props) {
  const [paywallOpen, setPaywallOpen] = useState(false);

  return (
    <>
      <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
        <View style={styles.container}>
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>TRADIQS ACADEMY</Text>
              <Text style={styles.title}>Master the terminal</Text>
            </View>
            <TouchableOpacity onPress={onClose} testID="academy-close">
              <Feather name="x" size={24} color={c.foreground} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.sectionTitle}>VIDEO MASTERCLASSES</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
              {masterclasses.map((item) => (
                <TouchableOpacity
                  key={item.title}
                  style={styles.classCard}
                  onPress={() => item.locked && setPaywallOpen(true)}
                  testID={item.locked ? `academy-locked-${item.title}` : `academy-${item.title}`}
                >
                  <View style={styles.videoIcon}><Feather name={item.locked ? 'lock' : 'play'} size={20} color={c.accent} /></View>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardDetail}>{item.detail}</Text>
                  {item.locked && <Text style={styles.pro}>PRO</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
            <Text style={styles.sectionTitle}>ESSENTIAL READING GUIDES</Text>
            {['Lot Size Calculation', 'Order Blocks', 'Risk Management'].map((guide) => (
              <TouchableOpacity key={guide} style={styles.guideRow}>
                <Feather name="book-open" size={18} color={c.accent} />
                <Text style={styles.guideText}>{guide}</Text>
                <Feather name="chevron-right" size={18} color={c.mutedForeground} />
              </TouchableOpacity>
            ))}
            <Text style={styles.sectionTitle}>TRADER’S TOOLKIT</Text>
            <View style={styles.toolRow}>
              {['Lot Size Calculator', 'P/L Simulator'].map((tool) => (
                <TouchableOpacity key={tool} style={styles.toolCard} onPress={() => setPaywallOpen(true)}>
                  <Feather name="sliders" size={18} color={c.secondary} />
                  <Text style={styles.toolText}>{tool}</Text>
                  <Text style={styles.comingSoon}>COMING SOON</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      </Modal>
      <PaywallModal visible={paywallOpen} onClose={() => setPaywallOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background, paddingTop: 54 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 18, borderBottomWidth: 1, borderBottomColor: c.border },
  eyebrow: { color: c.accent, fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1.4 },
  title: { color: c.foreground, fontSize: 22, fontFamily: 'Inter_700Bold', marginTop: 4 },
  content: { padding: 20, paddingBottom: 40 },
  sectionTitle: { color: c.mutedForeground, fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.2, marginTop: 22, marginBottom: 10 },
  row: { gap: 12 },
  classCard: { width: 190, minHeight: 150, padding: 14, borderRadius: 12, backgroundColor: c.card, borderWidth: 1, borderColor: c.border },
  videoIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#0A2529', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  cardTitle: { color: c.foreground, fontSize: 15, fontFamily: 'Inter_700Bold' },
  cardDetail: { color: c.mutedForeground, fontSize: 12, lineHeight: 18, marginTop: 5 },
  pro: { color: c.secondary, fontSize: 10, fontFamily: 'Inter_700Bold', marginTop: 12 },
  guideRow: { height: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.border },
  guideText: { flex: 1, color: c.foreground, fontSize: 14, fontFamily: 'Inter_500Medium' },
  toolRow: { flexDirection: 'row', gap: 10 },
  toolCard: { flex: 1, minHeight: 100, padding: 14, borderRadius: 12, backgroundColor: c.card, borderWidth: 1, borderColor: c.border },
  toolText: { color: c.foreground, fontSize: 13, fontFamily: 'Inter_600SemiBold', marginTop: 12 },
  comingSoon: { color: c.mutedForeground, fontSize: 9, fontFamily: 'Inter_700Bold', marginTop: 7 },
});