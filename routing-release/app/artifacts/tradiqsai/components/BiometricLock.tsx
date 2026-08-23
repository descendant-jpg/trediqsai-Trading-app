import React, { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import colors from '@/constants/colors';
import { authenticateBiometrics, getBiometricsEnabled, subscribeToBiometricsPreference } from '@/lib/biometricSecurity';

const c = colors.light;

export function BiometricLock({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [message, setMessage] = useState('');
  const unlocking = useRef(false);
  const generation = useRef(0);
  const unlock = async () => {
    if (unlocking.current) return;
    unlocking.current = true;
    const attempt = generation.current;
    const result = await authenticateBiometrics('Unlock TradiQs AI');
    if (attempt === generation.current) {
      setUnlocked(result.ok);
      setMessage(result.ok ? '' : result.reason);
    }
    unlocking.current = false;
  };
  useEffect(() => {
    let active = true;
    getBiometricsEnabled().then((value) => { if (active) { setEnabled(value); setUnlocked(value === false); if (value) void unlock(); } });
    const unsubscribe = subscribeToBiometricsPreference((value) => {
      setEnabled(value);
      setUnlocked(!value);
      if (value) void unlock();
    });
    const listener = AppState.addEventListener('change', (state) => {
      if (state === 'inactive' || state === 'background') {
        generation.current += 1;
        setUnlocked(false);
        return;
      }
      if (state === 'active') {
        generation.current += 1;
        setUnlocked(false);
        unlocking.current = false;
        void getBiometricsEnabled().then((isEnabled) => {
          setEnabled(isEnabled);
          if (isEnabled) {
            setUnlocked(false);
            void unlock();
          }
        }).catch(() => { setEnabled(null); setUnlocked(false); });
      }
    });
    return () => { active = false; listener.remove(); unsubscribe(); };
  }, []);
  // Fail closed while the encrypted preference is being read. This prevents a
  // protected frame flashing before launch/resume authentication completes.
  if (enabled === null) return <View style={styles.lock}><Feather name="lock" size={32} color={c.primary} /><Text style={styles.title}>Securing TradiQs AI</Text></View>;
  if (!enabled || unlocked) return <>{children}</>;
  return <View style={styles.lock}><Feather name="lock" size={32} color={c.primary} /><Text style={styles.title}>TradiQs AI is locked</Text><Text style={styles.body}>{message || 'Authenticate with your device to continue.'}</Text><TouchableOpacity onPress={() => void unlock()} style={styles.button}><Text style={styles.buttonText}>UNLOCK WITH BIOMETRICS</Text></TouchableOpacity></View>;
}
const styles = StyleSheet.create({
  lock: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.background, padding: 28 },
  title: { color: c.foreground, fontSize: 22, fontFamily: 'Inter_700Bold', marginTop: 16 },
  body: { color: c.mutedForeground, textAlign: 'center', lineHeight: 20, marginTop: 8 },
  button: { marginTop: 24, backgroundColor: c.primary, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 14 },
  buttonText: { color: c.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 11, letterSpacing: 1 },
});