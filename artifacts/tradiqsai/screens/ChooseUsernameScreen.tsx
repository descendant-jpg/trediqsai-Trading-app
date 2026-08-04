import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
} from 'react-native';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/utils/supabase';
import colors from '@/constants/colors';

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;

/**
 * Shown after a social (Google/Apple) sign-in when the profile has no
 * username yet. Claims a unique, case-insensitive username via the
 * claim_username RPC. Skippable for this session — re-prompted on relaunch.
 */
export default function ChooseUsernameScreen() {
  const { setUsernameClaimed, skipUsernamePrompt, signOut } = useAuth();
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);

  const handleClaim = async () => {
    const name = username.trim();
    if (!USERNAME_RE.test(name)) {
      Alert.alert(
        'Invalid username',
        'Use 3-20 characters: letters, numbers, and underscores only.',
      );
      return;
    }
    setLoading(true);
    try {
      const { data: taken, error: takenErr } = await supabase.rpc(
        'is_username_taken',
        { p_username: name },
      );
      if (takenErr) throw takenErr;
      if (taken) throw new Error('Username already taken.');

      const { data, error } = await supabase.rpc('claim_username', {
        p_username: name,
      });
      if (error) throw error;
      setUsernameClaimed((data as string) ?? name);
    } catch (err: any) {
      Alert.alert('Could not save username', err?.message ?? 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Choose a Username</Text>
        <Text style={styles.subtitle}>
          Pick a unique handle for the leaderboard and your trader profile.
          You can also use it to sign in.
        </Text>

        <TextInput
          style={styles.input}
          placeholder="Username"
          placeholderTextColor="#8A8D93"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={20}
          testID="choose-username-input"
        />
        <Text style={styles.hint}>
          3-20 characters. Letters, numbers, and underscores.
        </Text>

        <TouchableOpacity
          style={[styles.primaryButton, loading && styles.disabled]}
          onPress={handleClaim}
          disabled={loading}
          activeOpacity={0.85}
          testID="choose-username-submit"
        >
          {loading ? (
            <ActivityIndicator color="#0A0B0E" />
          ) : (
            <Text style={styles.primaryButtonText}>Claim Username</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={skipUsernamePrompt}
          style={styles.skipWrap}
          testID="choose-username-skip"
        >
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={signOut}
          style={styles.skipWrap}
          testID="choose-username-signout"
        >
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0B0E',
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 24,
    fontFamily: 'Inter_700Bold',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  subtitle: {
    color: '#8A8D93',
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 26,
    lineHeight: 20,
  },
  input: {
    backgroundColor: '#16181D',
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#22252A',
    borderRadius: colors.radius,
    height: 52,
    paddingHorizontal: 16,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
  },
  hint: {
    color: '#8A8D93',
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 8,
    marginBottom: 18,
  },
  primaryButton: {
    height: 54,
    borderRadius: colors.radius,
    backgroundColor: '#00F0FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#0A0B0E',
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
  skipWrap: {
    alignSelf: 'center',
    paddingVertical: 8,
    marginTop: 10,
  },
  skipText: {
    color: '#8A8D93',
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  signOutText: {
    color: '#5A5D63',
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
  },
  disabled: {
    opacity: 0.6,
  },
});
