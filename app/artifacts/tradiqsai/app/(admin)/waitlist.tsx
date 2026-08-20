import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function WaitlistScreen() {
  const router = useRouter();
  return <SafeAreaView style={styles.safeArea}><View style={styles.header}>
    <TouchableOpacity accessibilityLabel="Go back" accessibilityRole="button" hitSlop={8} onPress={() => router.back()} style={styles.backButton}><Feather name="chevron-left" size={22} color="#FFFFFF" /><Text style={styles.backText}>Back</Text></TouchableOpacity>
    <Text style={styles.title}>Waitlist Management</Text><View style={styles.spacer} />
  </View><View style={styles.content}><Feather name="users" size={28} color="#00F0FF" /><Text style={styles.heading}>Manage interested traders</Text><Text style={styles.copy}>Waitlist records will appear here.</Text></View></SafeAreaView>;
}
const styles = StyleSheet.create({
  safeArea: { backgroundColor: '#030712', flex: 1 }, header: { alignItems: 'center', borderBottomColor: '#22252A', borderBottomWidth: 1, flexDirection: 'row', height: 58, justifyContent: 'space-between', paddingHorizontal: 16 },
  backButton: { alignItems: 'center', flexDirection: 'row', minHeight: 44, minWidth: 84 }, backText: { color: '#FFFFFF', fontFamily: 'Inter_600SemiBold', fontSize: 14, marginLeft: 2 }, title: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 16 }, spacer: { minWidth: 84 },
  content: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 }, heading: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 20, marginTop: 16, textAlign: 'center' }, copy: { color: '#8A8D93', fontFamily: 'Inter_400Regular', fontSize: 14, marginTop: 8, textAlign: 'center' },
});