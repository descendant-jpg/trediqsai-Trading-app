import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as FileSystem from 'expo-file-system';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';

const prompt = 'You are an institutional quantitative analyst. Analyze this trading chart. Provide a concise response with three sections: 1. BIAS (Bullish, Bearish, or Neutral). 2. KEY LEVELS (Support and Resistance). 3. ANALYSIS (Brief explanation of price action and indicators).';

export default function AIAnalysisScreen() {
  const router = useRouter();
  const { imageUri } = useLocalSearchParams<{ imageUri?: string }>();
  const [loading, setLoading] = useState(true);
  const [analysisResult, setAnalysisResult] = useState('');

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
        const apiKey = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;
        if (!apiKey) throw new Error('Anthropic API key is not configured.');
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            ...(Platform.OS === 'web' ? { 'anthropic-dangerous-direct-browser-access': 'true' } : {}),
          },
          body: JSON.stringify({
            model: 'claude-3-5-sonnet-20240620',
            max_tokens: 700,
            messages: [{
              role: 'user',
              content: [
                { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
                { type: 'text', text: prompt },
              ],
            }],
          }),
        });
        const payload = await response.json() as { content?: Array<{ type: string; text?: string }>; error?: { message?: string } };
        if (!response.ok) throw new Error(payload.error?.message || 'The analysis service returned an error.');
        const text = payload.content?.find((item) => item.type === 'text')?.text;
        if (!text) throw new Error('The analysis service returned no text.');
        if (active) setAnalysisResult(text);
      } catch (error) {
        if (active) setAnalysisResult(error instanceof Error ? error.message : 'Unable to analyze this chart.');
      } finally {
        if (active) setLoading(false);
      }
    };
    analyze();
    return () => { active = false; };
  }, [imageUri]);

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
          {imageUri ? <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" /> : null}
          <View style={styles.resultCard}>
            <Text style={styles.resultLabel}>STRUCTURED TRADING BIAS</Text>
            <Text style={styles.result}>{analysisResult}</Text>
          </View>
          <TouchableOpacity style={styles.closeButton} onPress={() => router.back()}>
            <Text style={styles.closeText}>CLOSE ANALYSIS</Text>
          </TouchableOpacity>
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
});