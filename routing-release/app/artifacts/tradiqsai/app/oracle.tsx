import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import colors from '@/constants/colors';
import {
  useSendOracleChat,
  customFetch,
  type OracleChatMessage,
  type OracleTradingContext,
} from '@workspace/api-client-react';
import { useTrading } from '@/context/TradingContext';

import {
  ORACLE_CHAT_PERSIST_FAILURE_THRESHOLD,
  ORACLE_CHAT_STORAGE_KEY,
  parseStoredMessages,
  persistableMessages,
  type OracleChatBubble as ChatMessage,
} from '@/lib/oracleChatPersistence';

const QUICK_PROMPTS = ['Analyze BTC/USD', 'Show Market Sentiment', 'Daily Movers'];

const ERROR_RESPONSE =
  "I couldn't reach my AI brain just now — check your connection and tap Retry to send that again.";

const RATE_LIMIT_RESPONSE =
  "Whoa, that's a lot of questions! I need a short breather — wait a minute, then tap Retry.";
const WELCOME: ChatMessage = {
  id: 'welcome',
  role: 'ai',
  text: "I'm the TradiQs Oracle — your market AI. Ask me about any asset, sentiment, or today's movers.",
};

/** Pulsing cyan dot showing the Oracle is "online". */
function PulseDot() {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 2.2,
            duration: 1100,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 0,
            duration: 1100,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, { toValue: 0.6, duration: 0, useNativeDriver: true }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [scale, opacity]);

  return (
    <View style={styles.dotWrap}>
      <Animated.View style={[styles.dotPulse, { opacity, transform: [{ scale }] }]} />
      <View style={styles.dotCore} />
    </View>
  );
}

/** Animated three-dot typing indicator bubble. */
function TypingIndicator() {
  const anims = useRef([0, 1, 2].map(() => new Animated.Value(0.3))).current;

  useEffect(() => {
    const loops = anims.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 180),
          Animated.timing(v, { toValue: 1, duration: 320, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.3, duration: 320, useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [anims]);

  return (
    <View style={[styles.bubble, styles.aiBubble, styles.typingBubble]}>
      {anims.map((v, i) => (
        <Animated.View key={i} style={[styles.typingDot, { opacity: v }]} />
      ))}
    </View>
  );
}

/** The TradiQs Oracle chat — opened from the AutoPilot hub's "Ask AI Oracle" button. */
export default function OracleScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [lastFailedText, setLastFailedText] = useState<string | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const [hydrated, setHydrated] = useState(false);
  // Consecutive AsyncStorage write failures; drives the "history won't be
  // saved" notice once it crosses the threshold.
  const persistFailuresRef = useRef(0);
  const [persistWarning, setPersistWarning] = useState(false);
  const [quota, setQuota] = useState<{ tier: string; limit: number; usage: number; remaining: number } | null>(null);

  const { mutate: sendOracleChat, isPending: isTyping } = useSendOracleChat();
  const { balance, equity, position, unrealizedPnl, drawdownUsed, distanceToPayout } =
    useTrading();

  const refreshQuota = useCallback(() => {
    void customFetch<{ tier: string; limit: number; usage: number; remaining: number }>('/api/oracle/quota')
      .then(setQuota)
      .catch(() => setQuota(null));
  }, []);
  useEffect(() => { refreshQuota(); }, [refreshQuota]);

  // Snapshot of the trading account, kept in a ref so `deliver` doesn't
  // re-create on every 1s price tick.
  const tradingContextRef = useRef<OracleTradingContext>({
    balance,
    equity,
    drawdownUsed,
    distanceToPayout,
  });
  tradingContextRef.current = {
    balance,
    equity,
    drawdownUsed,
    distanceToPayout,
    ...(position
      ? {
          openPosition: {
            side: position.side,
            symbol: 'QQX',
            entryPrice: position.entryPrice,
            size: position.size,
            unrealizedPnl,
          },
        }
      : {}),
  };

  // Rehydrate the persisted conversation on mount.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(ORACLE_CHAT_STORAGE_KEY)
      .then((raw) => {
        if (cancelled) return;
        const stored = parseStoredMessages(raw);
        if (stored.length > 0) setMessages([WELCOME, ...stored]);
      })
      .catch(() => {
        // Ignore storage read failures — start with a fresh conversation.
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist the conversation whenever it changes (after hydration, so the
  // initial welcome-only state doesn't clobber a stored conversation).
  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(
      ORACLE_CHAT_STORAGE_KEY,
      JSON.stringify(persistableMessages(messages)),
    )
      .then(() => {
        // A successful write means history is safe again — clear the notice.
        persistFailuresRef.current = 0;
        setPersistWarning(false);
      })
      .catch(() => {
        // The in-memory chat still works, but warn after repeated failures
        // so traders know history won't survive a restart.
        persistFailuresRef.current += 1;
        if (persistFailuresRef.current >= ORACLE_CHAT_PERSIST_FAILURE_THRESHOLD) {
          setPersistWarning(true);
        }
      });
  }, [hydrated, messages]);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, []);

  /** Post the conversation (baseMessages already includes the new user turn). */
  const deliver = useCallback(
    (trimmed: string, baseMessages: ChatMessage[]) => {
      setMessages(baseMessages);
      scrollToEnd();

      // Build the conversation history for the AI (skip the welcome
      // greeting and any error bubbles).
      const history: OracleChatMessage[] = baseMessages
        .filter((m) => m.id !== 'welcome' && !m.isError)
        .map((m) => ({
          role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
          content: m.text,
        }));

      sendOracleChat(
        { data: { messages: history, tradingContext: tradingContextRef.current } },
        {
          onSuccess: (res) => {
            const responseQuota = (res as typeof res & { quota?: typeof quota }).quota;
            if (responseQuota) setQuota(responseQuota);
            setMessages((cur) => [
              ...cur,
              { id: `a-${Date.now()}`, role: 'ai', text: res.reply },
            ]);
            scrollToEnd();
          },
          onError: (err) => {
            if ((err as { status?: number }).status === 429) {
              setQuota((current) => current ? { ...current, remaining: 0, usage: current.limit } : current);
            }
            setLastFailedText(trimmed);
            setMessages((cur) => [
              ...cur,
              { id: `e-${Date.now()}`, role: 'ai', text: errorText(err), isError: true },
            ]);
            scrollToEnd();
          },
        },
      );
    },
    [scrollToEnd, sendOracleChat],
  );

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isTyping || quota?.remaining === 0) return;
      setInput('');
      setLastFailedText(null);
      deliver(trimmed, [
        ...messages,
        { id: `u-${Date.now()}`, role: 'user', text: trimmed },
      ]);
    },
    [isTyping, messages, deliver, quota?.remaining],
  );

  /** Wipe the stored conversation and reset to the welcome message. */
  const clearConversation = useCallback(() => {
    setMessages([WELCOME]);
    setLastFailedText(null);
    AsyncStorage.removeItem(ORACLE_CHAT_STORAGE_KEY).catch(() => {
      // Ignore storage failures — the in-memory chat is already reset,
      // and the next persist effect will overwrite the stored history.
    });
  }, []);

  const confirmClearConversation = useCallback(() => {
    if (Platform.OS === 'web') {
      // Alert.alert doesn't support buttons on web.
      // eslint-disable-next-line no-alert
      if (window.confirm('Clear this conversation and start fresh?')) {
        clearConversation();
      }
      return;
    }
    Alert.alert(
      'Clear conversation',
      'This removes your Oracle chat history and starts fresh.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: clearConversation },
      ],
    );
  }, [clearConversation]);

  const hasConversation = messages.length > 1;

  const retryLast = useCallback(() => {
    if (!lastFailedText || isTyping) return;
    const failed = lastFailedText;
    setLastFailedText(null);
    // Drop the error bubble; the failed user turn stays in place and is resent.
    deliver(failed, messages.filter((m) => !m.isError));
  }, [lastFailedText, isTyping, messages, deliver]);

  const renderMessage = ({ item }: { item: ChatMessage }) => (
    <View
      style={[
        styles.bubble,
        item.role === 'user' ? styles.userBubble : styles.aiBubble,
      ]}
    >
      <Text style={item.role === 'user' ? styles.userText : styles.aiText}>
        {item.text}
      </Text>
      {item.isError && lastFailedText ? (
        <TouchableOpacity
          style={styles.retryButton}
          onPress={retryLast}
          disabled={isTyping}
          activeOpacity={0.8}
          testID="oracle-retry"
        >
          <Feather name="refresh-cw" size={13} color="#00F0FF" />
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          testID="oracle-back"
          accessibilityLabel="Back"
        >
          <Feather name="chevron-left" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.title}>TradiQs Oracle</Text>
        <PulseDot />
        <Text style={styles.onlineText}>Online</Text>
        <TouchableOpacity
          style={[styles.clearButton, !hasConversation && styles.clearDisabled]}
          onPress={confirmClearConversation}
          disabled={!hasConversation || isTyping}
          activeOpacity={0.8}
          testID="oracle-clear"
          accessibilityLabel="Clear conversation"
        >
          <Feather name="trash-2" size={16} color="#8A8D93" />
        </TouchableOpacity>
      </View>

      {persistWarning ? (
        <View style={styles.persistWarning} testID="oracle-persist-warning">
          <Feather name="alert-triangle" size={13} color="#F5C542" />
          <Text style={styles.persistWarningText}>
            Chat history can't be saved right now — it won't survive a restart.
          </Text>
        </View>
      ) : null}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.messages}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={scrollToEnd}
          ListFooterComponent={isTyping ? <TypingIndicator /> : null}
        />

        {/* Quick prompts */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
          style={styles.chipsScroll}
        >
          {QUICK_PROMPTS.map((prompt) => (
            <TouchableOpacity
              key={prompt}
              style={styles.chip}
              onPress={() => sendMessage(prompt)}
              activeOpacity={0.8}
              disabled={isTyping || quota?.remaining === 0}
              testID={`chip-${prompt}`}
            >
              <Text style={styles.chipText}>{prompt}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {quota ? (
          <Text style={styles.quotaText} testID="oracle-quota">
            {quota.remaining}/{quota.limit} {quota.tier === 'free' ? 'Free' : quota.tier === 'pro' ? 'Pro' : 'Elite'} Messages Remaining
          </Text>
        ) : null}
        {/* Input bar */}
        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask the Oracle…"
            placeholderTextColor="#8A8D93"
            onSubmitEditing={() => sendMessage(input)}
            returnKeyType="send"
            editable={quota?.remaining !== 0}
            testID="oracle-input"
          />
          {quota?.remaining === 0 ? (
            <TouchableOpacity style={styles.upgradeButton} onPress={() => router.push('/shop')} testID="oracle-upgrade">
              <Text style={styles.upgradeButtonText}>Upgrade to {quota.tier === 'pro' ? 'Elite' : 'Pro'}</Text>
            </TouchableOpacity>
          ) : <TouchableOpacity
            style={[styles.sendButton, (!input.trim() || isTyping) && styles.sendDisabled]}
            onPress={() => sendMessage(input)}
            disabled={!input.trim() || isTyping}
            activeOpacity={0.85}
            testID="oracle-send"
          >
            <Feather name="arrow-up" size={18} color="#0A0B0E" />
          </TouchableOpacity>}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0B0E',
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#22252A',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 20,
    fontFamily: 'Inter_700Bold',
  },
  dotWrap: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  dotPulse: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00F0FF',
  },
  dotCore: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#00F0FF',
  },
  onlineText: {
    color: '#8A8D93',
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
  },
  clearButton: {
    marginLeft: 'auto',
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#22252A',
    backgroundColor: '#16181D',
  },
  clearDisabled: {
    opacity: 0.4,
  },
  persistWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(245, 197, 66, 0.4)',
    backgroundColor: 'rgba(245, 197, 66, 0.08)',
  },
  persistWarningText: {
    flex: 1,
    color: '#F5C542',
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    lineHeight: 16,
  },
  messages: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 10,
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#00F0FF',
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#16181D',
    borderWidth: 1,
    borderColor: '#22252A',
    borderBottomLeftRadius: 4,
  },
  userText: {
    color: '#0A0B0E',
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
    lineHeight: 20,
  },
  aiText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    lineHeight: 21,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#00F0FF',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  retryText: {
    color: '#00F0FF',
    fontSize: 12.5,
    fontFamily: 'Inter_600SemiBold',
  },
  typingBubble: {
    flexDirection: 'row',
    gap: 5,
    paddingVertical: 14,
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#8A8D93',
  },
  chipsScroll: {
    flexGrow: 0,
  },
  chipsRow: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
  },
  chip: {
    backgroundColor: '#16181D',
    borderWidth: 1,
    borderColor: '#00F0FF',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipText: {
    color: '#00F0FF',
    fontSize: 12.5,
    fontFamily: 'Inter_600SemiBold',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  quotaText: { color: '#8A8D93', fontSize: 12, fontFamily: 'Inter_500Medium', paddingHorizontal: 20, paddingBottom: 8 },
  upgradeButton: { backgroundColor: '#00F0FF', borderRadius: 18, paddingHorizontal: 14, height: 40, justifyContent: 'center' },
  upgradeButtonText: { color: '#0A0B0E', fontFamily: 'Inter_700Bold', fontSize: 12 },
  input: {
    flex: 1,
    height: 48,
    backgroundColor: '#16181D',
    borderWidth: 1,
    borderColor: '#22252A',
    borderRadius: 24,
    paddingHorizontal: 16,
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Inter_500Medium',
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#00F0FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendDisabled: {
    opacity: 0.4,
  },
});

/** Pick a friendly error bubble message based on the API failure. */
function errorText(err: unknown): string {
  if (
    err &&
    typeof err === 'object' &&
    'status' in err &&
    (err as { status?: number }).status === 429
  ) {
    return RATE_LIMIT_RESPONSE;
  }
  return ERROR_RESPONSE;
}
