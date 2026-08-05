import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
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
import colors from '@/constants/colors';
import {
  useSendOracleChat,
  type OracleChatMessage,
} from '@workspace/api-client-react';

import {
  ORACLE_CHAT_STORAGE_KEY,
  parseStoredMessages,
  persistableMessages,
  type OracleChatBubble as ChatMessage,
} from '@/lib/oracleChatPersistence';

const QUICK_PROMPTS = ['Analyze BTC/USD', 'Show Market Sentiment', 'Daily Movers'];

const ERROR_RESPONSE =
  "I couldn't reach my AI brain just now — check your connection and tap Retry to send that again.";

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

/** AI Tools — the TradiQs Oracle chat behind the center tab button. */
export default function AiToolsScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [lastFailedText, setLastFailedText] = useState<string | null>(null);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const [hydrated, setHydrated] = useState(false);

  const { mutate: sendOracleChat, isPending: isTyping } = useSendOracleChat();

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
    ).catch(() => {
      // Ignore storage write failures — the in-memory chat still works.
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
        { data: { messages: history } },
        {
          onSuccess: (res) => {
            setMessages((cur) => [
              ...cur,
              { id: `a-${Date.now()}`, role: 'ai', text: res.reply },
            ]);
            scrollToEnd();
          },
          onError: () => {
            setLastFailedText(trimmed);
            setMessages((cur) => [
              ...cur,
              { id: `e-${Date.now()}`, role: 'ai', text: ERROR_RESPONSE, isError: true },
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
      if (!trimmed || isTyping) return;
      setInput('');
      setLastFailedText(null);
      deliver(trimmed, [
        ...messages,
        { id: `u-${Date.now()}`, role: 'user', text: trimmed },
      ]);
    },
    [isTyping, messages, deliver],
  );

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
        <Text style={styles.title}>TradiQs Oracle</Text>
        <PulseDot />
        <Text style={styles.onlineText}>Online</Text>
      </View>

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
              disabled={isTyping}
              testID={`chip-${prompt}`}
            >
              <Text style={styles.chipText}>{prompt}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

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
            testID="oracle-input"
          />
          <TouchableOpacity
            style={[styles.sendButton, (!input.trim() || isTyping) && styles.sendDisabled]}
            onPress={() => sendMessage(input)}
            disabled={!input.trim() || isTyping}
            activeOpacity={0.85}
            testID="oracle-send"
          >
            <Feather name="arrow-up" size={18} color="#0A0B0E" />
          </TouchableOpacity>
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
