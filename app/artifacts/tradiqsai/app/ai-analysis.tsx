import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { customFetch, ApiError } from '@workspace/api-client-react';
import { supabase } from '@/utils/supabase';

type ErrorKind = 'unauthenticated' | 'pro_required' | 'generic' | null;

export default function AIAnalysisScreen() {
  const router = useRouter();
  const { imageUri, mode = 'analysis', mediaType = 'image/jpeg' } = useLocalSearchParams<{ imageUri?: string; mode?: 'analysis' | 'signal'; mediaType?: string }>();
  const [loading, setLoading] = useState(true);
  const [analysisResult, setAnalysisResult] = useState('');
  const [errorKind, setErrorKind] = useState<ErrorKind>(null);

  useEffect(() => {
    let active = true;
    const analyze = async () => {
      if (!imageUri) {
        setAnalysisResult('No chart image was selected.');
        setLoading(false);
        return;
      }
      try {
        const base64 = await FileSystem.readAsStringAsync(imageUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const response = await customFetch<{ analysis: string }>('/api/oracle/chart-analysis', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ imageBase64: base64, mode: mode === 'signal' ? 'signal' : 'analysis', mediaType: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mediaType) ? mediaType : 'image/jpeg' }),
        });
        if (!response.analysis) throw new Error('The analysis service returned no text.');
        if (active) setAnalysisResult(response.analysis);
      } catch (error) {
        if (!active) return;
        if (error instanceof ApiError && error.status === 401) {
          setErrorKind('unauthenticated');
        } else if (error instanceof ApiError && error.status === 403) {
          setErrorKind('pro_required');
        } else {
          setErrorKind('generic');
          setAnalysisResult(error instanceof Error ? error.message : 'Unable to analyze this chart.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    analyze();
    return () => { active = false; };
  }, [imageUri]);

  const renderError = () => {
    if (errorKind === 'unauthenticated') {
      return (
        <View style={styles.gateCard}>
          <Text style={styles.gateIcon}>🔒</Text>
          <Text style={styles.gateTitle}>Sign in to use Chart Analysis</Text>
          <Text style={styles.gateBody}>You need an account to access AI-powered chart analysis.</Text>
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={async () => {
              await supabase.auth.signOut();
            }}
          >
            <Text style={styles.ctaText}>SIGN IN</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dismissButton} onPress={() => router.back()}>
            <Text style={styles.dismissText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (errorKind === 'pro_required') {
      return (
        <View style={styles.gateCard}>
          <Text style={styles.gateIcon}>⭐</Text>
          <Text style={styles.gateTitle}>Chart Analysis is a Pro feature</Text>
          <Text style={styles.gateBody}>Upgrade to Pro or Elite to unlock AI-powered chart analysis and signal generation.</Text>
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={() => router.push({ pathname: '/paywall', params: { defaultTier: 'ELITE' } } as never)}
          >
            <Text style={styles.ctaText}>UPGRADE NOW</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dismissButton} onPress={() => router.back()}>
            <Text style={styles.dismissText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.resultCard}>
        <Text style={styles.resultLabel}>{mode === 'signal' ? 'SIGNAL PLAN' : 'STRUCTURED TRADING BIAS'}</Text>
        <Text style={styles.result}>{analysisResult}</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'AI Chart Analysis', headerShown: false }} />
      {loading ? (
        <View style={styles.loading}>
          <Text style={styles.eyebrow}>TRADIQS VISION ENGINE</Text>
          <ActivityIndicator size="large" color="#00F0FF" style={styles.spinner} />
          <Text style={styles.loadingText}>AI Scanning Market Structure...</Text>
          <Text style={styles.loadingHint}>Reading momentum, liquidity, and key levels</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.eyebrow}>TRADIQS VISION ENGINE</Text>
          <Text style={styles.title}>Chart intelligence.</Text>
          {imageUri && !errorKind ? <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" /> : null}
          {renderError()}
          {!errorKind && (
            <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
              <Text style={styles.closeText}>CLOSE ANALYSIS</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0B0E' },
  content: { padding: 20, paddingTop: 58, paddingBottom: 44 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  eyebrow: { color: '#00F0FF', fontSize: 10, fontWeight: '800', letterSpacing: 1.7 },
  title: { color: '#FFF', fontSize: 28, fontWeight: '800', marginTop: 8, marginBottom: 20 },
  spinner: { marginVertical: 28 },
  loadingText: { color: '#FFF', fontSize: 18, fontWeight: '800', textAlign: 'center' },
  loadingHint: { color: '#7C8490', fontSize: 12, marginTop: 8, textAlign: 'center' },
  image: { width: '100%', height: 192, borderRadius: 12, backgroundColor: '#16181D' },
  resultCard: { backgroundColor: '#16181D', borderWidth: 1, borderColor: '#29323A', borderRadius: 14, padding: 17, marginTop: 16 },
  resultLabel: { color: '#00F0FF', fontSize: 10, fontWeight: '800', letterSpacing: 1.4, marginBottom: 12 },
  result: { color: '#E7EAF0', fontSize: 14, lineHeight: 22 },
  closeButton: { backgroundColor: '#00F0FF', borderRadius: 10, alignItems: 'center', padding: 17, marginTop: 20 },
  closeText: { color: '#061014', fontSize: 12, fontWeight: '900', letterSpacing: 1.2 },
  gateCard: { backgroundColor: '#16181D', borderWidth: 1, borderColor: '#29323A', borderRadius: 14, padding: 24, marginTop: 16, alignItems: 'center' },
  gateIcon: { fontSize: 36, marginBottom: 14 },
  gateTitle: { color: '#FFF', fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 10 },
  gateBody: { color: '#7C8490', fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 24 },
  ctaButton: { backgroundColor: '#00F0FF', borderRadius: 10, alignItems: 'center', paddingVertical: 15, paddingHorizontal: 32, width: '100%', marginBottom: 12 },
  ctaText: { color: '#061014', fontSize: 12, fontWeight: '900', letterSpacing: 1.2 },
  dismissButton: { alignItems: 'center', paddingVertical: 10 },
  dismissText: { color: '#7C8490', fontSize: 13 },
});