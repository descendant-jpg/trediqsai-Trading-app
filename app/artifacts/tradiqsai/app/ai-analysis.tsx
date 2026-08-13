import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { EncodingType, getInfoAsync, readAsStringAsync } from 'expo-file-system/legacy';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { customFetch, ApiError } from '@workspace/api-client-react';
import { useAuth } from '@/context/AuthContext';
import { useSubscription } from '@/lib/revenuecat';

type ErrorKind = 'unauthenticated' | 'pro_required' | 'generic' | null;
const MAX_CHART_BYTES = 6 * 1024 * 1024;

async function readChartBase64(imageUri: string): Promise<string> {
  if (Platform.OS === 'web') {
    const response = await fetch(imageUri);
    if (!response.ok) throw new Error('The selected chart image could not be loaded.');
    const blob = await response.blob();
    if (blob.size > MAX_CHART_BYTES) throw new Error('This chart image is too large. Please choose an image smaller than 6 MB.');
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('The selected chart image could not be read.'));
      reader.onload = () => typeof reader.result === 'string'
        ? resolve(reader.result)
        : reject(new Error('The selected chart image could not be read.'));
      reader.readAsDataURL(blob);
    });
    const base64 = dataUrl.split(',', 2)[1];
    if (!base64) throw new Error('The selected chart image could not be converted.');
    return base64;
  }

  const file = await getInfoAsync(imageUri);
  if (!file.exists || (typeof file.size === 'number' && file.size > MAX_CHART_BYTES)) {
    throw new Error('This chart image is too large. Please choose an image smaller than 6 MB.');
  }
  const base64 = await readAsStringAsync(imageUri, { encoding: EncodingType.Base64 });
  if (!base64) throw new Error('The selected chart image could not be read.');
  return base64;
}

export default function AIAnalysisScreen() {
  const router = useRouter();
  const { imageUri, mode = 'analysis', mediaType = 'image/jpeg' } = useLocalSearchParams<{ imageUri?: string; mode?: 'analysis' | 'signal'; mediaType?: string }>();
  const { session, loading: authLoading, signOut } = useAuth();
  const { isSubscribed, isAdmin } = useSubscription();
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
      // Conversion gates intentionally happen before file I/O or the API
      // request: a selected chart is enough to show the preview, but only an
      // entitled signed-in trader may spend a Vision API request.
      if (authLoading) return;
      if (!session) {
        setErrorKind('unauthenticated');
        setLoading(false);
        return;
      }
      if (!isSubscribed && !isAdmin) {
        setErrorKind('pro_required');
        setLoading(false);
        return;
      }
      try {
        const base64 = await readChartBase64(imageUri);
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
  }, [authLoading, imageUri, isAdmin, isSubscribed, mediaType, mode, session]);

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
              await signOut();
              router.dismissAll();
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
          {imageUri ? (
            <View style={styles.previewFrame}>
              <Image
                source={{ uri: imageUri }}
                style={styles.image}
                resizeMode="cover"
                blurRadius={errorKind ? 14 : 0}
              />
              {errorKind === 'unauthenticated' || errorKind === 'pro_required' ? (
                <View style={styles.previewOverlay}>{renderError()}</View>
              ) : null}
            </View>
          ) : null}
          {!imageUri || (errorKind !== 'unauthenticated' && errorKind !== 'pro_required') ? renderError() : null}
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
  previewFrame: { width: '100%', height: 310, borderRadius: 16, overflow: 'hidden', backgroundColor: '#16181D', marginTop: 4 },
  image: { width: '100%', height: '100%', backgroundColor: '#16181D' },
  previewOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 16 },
  resultCard: { backgroundColor: '#16181D', borderWidth: 1, borderColor: '#29323A', borderRadius: 14, padding: 17, marginTop: 16 },
  resultLabel: { color: '#00F0FF', fontSize: 10, fontWeight: '800', letterSpacing: 1.4, marginBottom: 12 },
  result: { color: '#E7EAF0', fontSize: 14, lineHeight: 22 },
  closeButton: { backgroundColor: '#00F0FF', borderRadius: 10, alignItems: 'center', padding: 17, marginTop: 20 },
  closeText: { color: '#061014', fontSize: 12, fontWeight: '900', letterSpacing: 1.2 },
  gateCard: { backgroundColor: '#16181DEE', borderWidth: 1, borderColor: '#00F0FF66', borderRadius: 14, padding: 22, alignItems: 'center', shadowColor: '#00F0FF', shadowOpacity: 0.18, shadowRadius: 18, elevation: 8 },
  gateIcon: { fontSize: 36, marginBottom: 14 },
  gateTitle: { color: '#FFF', fontSize: 20, fontWeight: '800', textAlign: 'center', marginBottom: 10 },
  gateBody: { color: '#7C8490', fontSize: 14, lineHeight: 21, textAlign: 'center', marginBottom: 24 },
  ctaButton: { backgroundColor: '#00F0FF', borderRadius: 10, alignItems: 'center', paddingVertical: 15, paddingHorizontal: 32, width: '100%', marginBottom: 12 },
  ctaText: { color: '#061014', fontSize: 12, fontWeight: '900', letterSpacing: 1.2 },
  dismissButton: { alignItems: 'center', paddingVertical: 10 },
  dismissText: { color: '#7C8490', fontSize: 13 },
});