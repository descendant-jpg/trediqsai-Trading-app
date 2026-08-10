import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/constants/colors';

const c = colors.light;

export function DestinationShell({
  title,
  icon,
  description,
  modal = false,
}: {
  title: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  description: string;
  modal?: boolean;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 22 : insets.top + 12;

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.canGoBack() ? router.back() : router.replace('/')}
          accessibilityLabel="Go back"
        >
          <Feather name={modal ? 'x' : 'chevron-left'} size={22} color={c.foreground} />
        </TouchableOpacity>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.headerSpacer} />
      </View>
      <View style={styles.body}>
        <View style={styles.iconCircle}>
          <Feather name={icon} size={30} color={c.primary} />
        </View>
        <Text style={styles.eyebrow}>{modal ? 'QUICK VIEW' : 'TRADIQS AI'}</Text>
        <Text style={styles.headline}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
        <View style={styles.status}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>Screen ready</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background, paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
  },
  title: { color: c.foreground, fontSize: 17, fontFamily: 'Inter_700Bold' },
  headerSpacer: { width: 40 },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 },
  iconCircle: {
    width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,240,255,0.08)', borderWidth: 1, borderColor: 'rgba(0,240,255,0.38)',
  },
  eyebrow: { marginTop: 24, color: c.primary, fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 2 },
  headline: { marginTop: 8, color: c.foreground, fontSize: 25, fontFamily: 'Inter_700Bold' },
  description: {
    marginTop: 12, maxWidth: 310, color: c.mutedForeground, fontSize: 14,
    fontFamily: 'Inter_400Regular', lineHeight: 21, textAlign: 'center',
  },
  status: {
    flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 26,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, backgroundColor: c.card,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.success },
  statusText: { color: c.mutedForeground, fontSize: 12, fontFamily: 'Inter_500Medium' },
});