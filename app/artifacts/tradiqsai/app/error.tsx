import React from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ErrorBoundaryProps, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function AppError({ error, retry }: ErrorBoundaryProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <Text style={styles.eyebrow}>TRADIQS AI / RUNTIME ERROR</Text>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.message}>{message}</Text>
      {__DEV__ && (
        <ScrollView style={styles.details}>
          <Text style={styles.stack}>{stack ?? 'No stack trace available.'}</Text>
        </ScrollView>
      )}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.primary} onPress={retry}>
          <Text style={styles.primaryText}>Try again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondary} onPress={() => router.replace('/')}>
          <Text style={styles.secondaryText}>Return home</Text>
        </TouchableOpacity>
      </View>
      {Platform.OS === 'web' && <Text style={styles.webHint}>Reload the preview after correcting the error.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0B0E', padding: 24, justifyContent: 'center' },
  eyebrow: { color: '#00F0FF', fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  title: { color: '#FFFFFF', fontSize: 28, fontWeight: '700', marginTop: 10 },
  message: { color: '#B8BDC7', fontSize: 14, lineHeight: 21, marginTop: 12 },
  details: { maxHeight: 220, marginTop: 20, padding: 12, backgroundColor: '#12141A', borderRadius: 10 },
  stack: { color: '#FF8A8A', fontFamily: Platform.OS === 'web' ? 'monospace' : undefined, fontSize: 11, lineHeight: 16 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  primary: { backgroundColor: '#00F0FF', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 12 },
  primaryText: { color: '#0A0B0E', fontWeight: '700' },
  secondary: { borderColor: '#30343D', borderWidth: 1, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 12 },
  secondaryText: { color: '#FFFFFF', fontWeight: '700' },
  webHint: { color: '#6D727B', fontSize: 11, marginTop: 18 },
});