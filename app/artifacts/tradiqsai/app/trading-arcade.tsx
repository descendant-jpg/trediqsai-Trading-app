/**
 * Trading Arcade — playable mini-games with persisted XP & stats.
 *
 * Games: Chart Master, Candle Runner, Pip Sniper, Margin Call,
 *        Bull Breaker, Pattern Guesser, Whale Hunt.
 *
 * Each game follows a  launch → playing → result  lifecycle inside the modal.
 * Closing the modal on the result screen is safe; stats are already saved.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Animated,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '@/constants/colors';
import {
  ARCADE_PLAYER_KEY,
  DEFAULT_ARCADE_PLAYER,
  XP_PER_LEVEL,
  computeNextPlayer,
  parseArcadePlayer,
  type ArcadePlayer,
} from '@/lib/arcadePlayer';
import { useAuth } from '@/context/AuthContext';
import { customFetch } from '@workspace/api-client-react';

const c = colors.light;

// ─── Types (re-export alias for local use) ────────────────────────────────────

type Player = ArcadePlayer;

type GameEntry = {
  id: string;
  name: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  desc: string;
  featured?: boolean;
};
const GAMES: GameEntry[] = [
  {
    id: 'chart-master',
    name: 'Chart Master',
    icon: 'bar-chart-2',
    desc: 'Read smart-money patterns and master the market structure.',
    featured: true,
  },
  { id: 'candle-runner', name: 'Candle Runner', icon: 'activity', desc: 'Dodge volatility and survive the chart.' },
  { id: 'pip-sniper', name: 'Pip Sniper', icon: 'crosshair', desc: 'Time the perfect precision entry.' },
  { id: 'margin-call', name: 'Margin Call', icon: 'trending-down', desc: 'Survive three lanes of market risk.' },
  { id: 'bull-breaker', name: 'Bull Breaker', icon: 'target', desc: 'Break order blocks with perfect timing.' },
  { id: 'pattern-guesser', name: 'Pattern Guesser', icon: 'eye', desc: 'Read the chart pattern in five seconds.' },
  { id: 'whale-hunt', name: 'Whale Hunt', icon: 'droplet', desc: 'Track liquidity before the move begins.' },
];

type GamePhase = 'launch' | 'playing' | 'result';
type GameResult = { score: number; xpEarned: number; label: string };

// ─── Persistence helpers ──────────────────────────────────────────────────────

async function loadPlayer(): Promise<Player> {
  try {
    const raw = await AsyncStorage.getItem(ARCADE_PLAYER_KEY);
    return parseArcadePlayer(raw);
  } catch {
    return parseArcadePlayer(null);
  }
}

/** Load current state, apply the game result, persist, return the new state. */
async function persistResult(
  xpEarned: number,
  gameId: string,
  score: number,
): Promise<{ player: Player; isPersonalBest: boolean; previousBest: number }> {
  const base = await loadPlayer();
  const previousBest = base.bestScores[gameId] ?? 0;
  const next = computeNextPlayer(base, xpEarned, new Date(), gameId, score);
  try {
    await AsyncStorage.setItem(ARCADE_PLAYER_KEY, JSON.stringify(next));
  } catch {}
  return { player: next, isPersonalBest: score > previousBest, previousBest };
}

function scoreToResult(score: number, maxScore: number): GameResult {
  const pct = score / maxScore;
  const xpEarned = Math.round(pct * 50);
  const label =
    pct >= 0.85 ? '🏆 Market Master!'
    : pct >= 0.60 ? '💡 Nice Work'
    : '📈 Keep Grinding';
  return { score, xpEarned, label };
}

// ─── Shared result screen ─────────────────────────────────────────────────────

function ResultScreen({
  game,
  result,
  onPlayAgain,
  onClose,
  isPersonalBest,
  previousBest,
}: {
  game: GameEntry;
  result: GameResult;
  onPlayAgain: () => void;
  onClose: () => void;
  isPersonalBest: boolean;
  previousBest: number;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
  }, []);
  return (
    <Animated.View style={[rs.container, { opacity: fadeAnim }]}>
      <Text style={rs.label}>{result.label}</Text>
      {isPersonalBest && <Text style={rs.personalBest}>NEW PERSONAL BEST!</Text>}
      {!isPersonalBest && previousBest > 0 && (
        <Text style={rs.comparison}>
          SCORE {result.score} · PERSONAL BEST {previousBest}
        </Text>
      )}
      <View style={rs.xpBadge}>
        <Feather name="zap" size={14} color={c.primaryForeground} />
        <Text style={rs.xpText}>+{result.xpEarned} XP</Text>
      </View>
      <Text style={rs.game}>{game.name}</Text>
      <View style={rs.row}>
        <TouchableOpacity style={rs.again} onPress={onPlayAgain} accessibilityRole="button" accessibilityLabel="Play again">
          <Feather name="refresh-cw" size={15} color={c.primary} />
          <Text style={rs.againText}>Play Again</Text>
        </TouchableOpacity>
        <TouchableOpacity style={rs.done} onPress={onClose} accessibilityRole="button" accessibilityLabel="Done">
          <Text style={rs.doneText}>Done</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}
const rs = StyleSheet.create({
  container: { alignItems: 'center', gap: 14, paddingTop: 8 },
  label: { color: c.foreground, fontSize: 22, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  xpBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.primary, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  xpText: { color: c.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 15 },
  game: { color: c.mutedForeground, fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  row: { flexDirection: 'row', gap: 10, width: '100%', marginTop: 4 },
  again: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: c.primary, borderRadius: 11, padding: 13 },
  againText: { color: c.primary, fontFamily: 'Inter_700Bold' },
  done: { flex: 1, backgroundColor: c.primary, borderRadius: 11, padding: 13, alignItems: 'center' },
  doneText: { color: c.primaryForeground, fontFamily: 'Inter_700Bold' },
  personalBest: { color: c.primary, fontSize: 12, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  comparison: { color: c.mutedForeground, fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5 },
});

// ─── Game: Pattern Guesser / Chart Master ────────────────────────────────────
// Multiple-choice quiz. 3 rounds, 5-second timer each.

const PATTERN_QUESTIONS: { q: string; options: string[]; answer: number }[] = [
  { q: 'A series of higher highs and higher lows forms which pattern?', options: ['Uptrend', 'Downtrend', 'Range', 'Double Top'], answer: 0 },
  { q: 'A "hammer" candle signals what?', options: ['Bearish reversal', 'Bullish reversal', 'Continuation', 'Breakout'], answer: 1 },
  { q: 'An FVG (Fair Value Gap) represents:', options: ['Equal buyers/sellers', 'Imbalanced price delivery', 'Volume spike', 'Pattern rejection'], answer: 1 },
  { q: 'BOS stands for:', options: ['Break of Structure', 'Buyer Order Size', 'Bar Oscillation Signal', 'Bull Order Sweep'], answer: 0 },
  { q: 'A "bearish engulfing" candle pattern suggests:', options: ['Uptrend continuation', 'Bullish momentum', 'Potential reversal down', 'Consolidation'], answer: 2 },
  { q: 'Liquidity resting above a swing high is called:', options: ['Support', 'Buyside liquidity', 'Fair value', 'Demand zone'], answer: 1 },
  { q: 'A CHoCH (Change of Character) signals:', options: ['Trend continuation', 'Potential trend reversal', 'Volume divergence', 'Range expansion'], answer: 1 },
  { q: 'An order block is typically found:', options: ['At the origin of a strong move', 'At the peak of volume', 'After a doji candle', 'In a ranging market'], answer: 0 },
];

const SMC_QUESTIONS: { q: string; options: string[]; answer: number }[] = [
  { q: 'Smart money accumulates positions in a:', options: ['Distribution phase', 'Markup phase', 'Accumulation phase', 'Markdown phase'], answer: 2 },
  { q: 'Which candle creates an OB (Order Block)?', options: ['The last bullish candle before a downmove', 'Any doji', 'Spinning tops', 'Inside bars'], answer: 0 },
  { q: 'Price sweeping liquidity then reversing is called:', options: ['Fake-out', 'Stop hunt / liquidity grab', 'Gap fill', 'Retest'], answer: 1 },
  { q: 'A "premium zone" in Wyckoff is where:', options: ['Price is cheap to buy', 'Smart money distributes / sells', 'Volume is highest', 'Retail buys in bulk'], answer: 1 },
  { q: 'MSS (Market Structure Shift) occurs after:', options: ['A BOS in the opposite direction', 'Consecutive doji candles', 'A volume climax', 'A gap up opening'], answer: 0 },
];

function PatternGame({
  isSmc,
  onDone,
}: {
  isSmc: boolean;
  onDone: (result: GameResult) => void;
}) {
  const pool = isSmc ? SMC_QUESTIONS : PATTERN_QUESTIONS;
  const rounds = 4;
  const timePerQ = 6;

  const [picked, setPicked] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(timePerQ);
  const [score, setScore] = useState(0);
  const [round, setRound] = useState(0);
  const cancelledRef = useRef(false);

  const questions = useRef(
    [...pool].sort(() => Math.random() - 0.5).slice(0, rounds)
  ).current;

  useEffect(() => {
    cancelledRef.current = false;
    return () => { cancelledRef.current = true; };
  }, []);

  const current = questions[round];

  const advance = useCallback(
    (chosenIdx: number | null) => {
      if (cancelledRef.current) return;
      const correct = current.answer;
      let pts = 0;
      if (chosenIdx === correct) {
        pts = 25 + Math.round((timeLeft / timePerQ) * 25); // 25–50 pts
      }
      const newScore = score + pts;
      const newRound = round + 1;
      if (newRound >= rounds) {
        onDone(scoreToResult(newScore, rounds * 50));
      } else {
        setScore(newScore);
        setRound(newRound);
        setPicked(null);
        setTimeLeft(timePerQ);
      }
    },
    [current, timeLeft, score, round, rounds, onDone]
  );

  useEffect(() => {
    if (picked !== null) return;
    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(id);
          setPicked(-1); // time's up
          setTimeout(() => { if (!cancelledRef.current) advance(-1); }, 700);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [round, picked]);

  const handlePick = (idx: number) => {
    if (picked !== null) return;
    setPicked(idx);
    setTimeout(() => { if (!cancelledRef.current) advance(idx); }, 700);
  };

  const timerPct = timeLeft / timePerQ;

  return (
    <View style={pg.container}>
      <View style={pg.meta}>
        <Text style={pg.metaText}>Round {round + 1}/{rounds}</Text>
        <View style={pg.timerBar}>
          <View style={[pg.timerFill, { width: `${timerPct * 100}%`, backgroundColor: timerPct > 0.4 ? c.primary : '#E54B4B' }]} />
        </View>
        <Text style={pg.metaText}>{timeLeft}s</Text>
      </View>
      <Text style={pg.question}>{current.q}</Text>
      <View style={pg.options}>
        {current.options.map((opt, i) => {
          const isCorrect = i === current.answer;
          const isChosen = i === picked;
          let bg = c.card;
          let borderColor = c.border;
          if (picked !== null) {
            if (isCorrect) { bg = '#0D2A1A'; borderColor = c.success; }
            else if (isChosen) { bg = '#2A0D0D'; borderColor = '#E54B4B'; }
          }
          return (
            <TouchableOpacity
              key={i}
              style={[pg.option, { backgroundColor: bg, borderColor }]}
              onPress={() => handlePick(i)}
              disabled={picked !== null}
              accessibilityRole="button"
              accessibilityLabel={opt}
            >
              <Text style={[pg.optText, picked !== null && isCorrect && { color: c.success }]}>{opt}</Text>
              {picked !== null && isCorrect && <Feather name="check" size={14} color={c.success} />}
              {picked !== null && isChosen && !isCorrect && <Feather name="x" size={14} color="#E54B4B" />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
const pg = StyleSheet.create({
  container: { width: '100%', gap: 12 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaText: { color: c.mutedForeground, fontSize: 11, fontFamily: 'Inter_600SemiBold', minWidth: 36 },
  timerBar: { flex: 1, height: 5, backgroundColor: c.border, borderRadius: 3, overflow: 'hidden' },
  timerFill: { height: '100%', borderRadius: 3 },
  question: { color: c.foreground, fontSize: 14, fontFamily: 'Inter_600SemiBold', lineHeight: 20, textAlign: 'center', minHeight: 44 },
  options: { gap: 8 },
  option: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderRadius: 10, padding: 13 },
  optText: { color: c.foreground, fontFamily: 'Inter_600SemiBold', fontSize: 13, flex: 1 },
});

// ─── Game: Pip Sniper ─────────────────────────────────────────────────────────
// Oscillating bar — tap FIRE when indicator is in the green zone.

function PipSniper({ onDone }: { onDone: (r: GameResult) => void }) {
  const shots = 4;
  const [shot, setShot] = useState(0);
  const [score, setScore] = useState(0);
  const [lastAccuracy, setLastAccuracy] = useState<string | null>(null);
  const [fired, setFired] = useState(false);
  const posRef = useRef(50); // 0–100
  const dirRef = useRef(1);
  const speedRef = useRef(1.8 + Math.random() * 1.2);
  const [posDisplay, setPosDisplay] = useState(50);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    return () => { cancelledRef.current = true; };
  }, []);

  useEffect(() => {
    setFired(false);
    setLastAccuracy(null);
    speedRef.current = 1.8 + Math.random() * 1.4;
  }, [shot]);

  useEffect(() => {
    if (fired) return;
    const id = setInterval(() => {
      posRef.current += dirRef.current * speedRef.current;
      if (posRef.current >= 100) { posRef.current = 100; dirRef.current = -1; }
      if (posRef.current <= 0)   { posRef.current = 0;   dirRef.current = 1; }
      setPosDisplay(Math.round(posRef.current));
    }, 30);
    return () => clearInterval(id);
  }, [fired, shot]);

  const fire = () => {
    if (fired) return;
    setFired(true);
    const pos = posRef.current;
    // Green zone: 38–62 (centered)
    const dist = Math.abs(pos - 50);
    let pts = 0;
    let acc = '';
    if (dist <= 3) { pts = 100; acc = '🎯 Perfect!'; }
    else if (dist <= 8) { pts = 75; acc = '✅ Great Shot'; }
    else if (dist <= 14) { pts = 50; acc = '👍 Good'; }
    else if (dist <= 22) { pts = 20; acc = '💨 Close'; }
    else { pts = 0; acc = '❌ Missed'; }
    setLastAccuracy(acc);
    setScore((s) => s + pts);
    setTimeout(() => {
      if (cancelledRef.current) return;
      if (shot + 1 >= shots) {
        onDone(scoreToResult(score + pts, shots * 100));
      } else {
        setShot((s) => s + 1);
      }
    }, 900);
  };

  const inZone = posDisplay >= 38 && posDisplay <= 62;

  return (
    <View style={pip.container}>
      <View style={pip.meta}>
        <Text style={pip.metaText}>Shot {shot + 1}/{shots}</Text>
        <Text style={pip.score}>Score: {score}</Text>
      </View>
      <View style={pip.barWrap}>
        {/* Zone markers */}
        <View style={pip.zone} />
        {/* Indicator */}
        <View style={[pip.indicator, { left: `${posDisplay}%` as any }]} />
        {/* Zone labels */}
      </View>
      <View style={pip.labels}>
        <Text style={pip.labelText}>SELL</Text>
        <Text style={[pip.labelText, { color: c.primary }]}>ENTRY ZONE</Text>
        <Text style={pip.labelText}>BUY</Text>
      </View>
      {lastAccuracy ? (
        <View style={pip.feedback}><Text style={pip.feedbackText}>{lastAccuracy}</Text></View>
      ) : (
        <TouchableOpacity
          style={[pip.fireBtn, inZone && pip.fireBtnActive]}
          onPress={fire}
          accessibilityRole="button"
          accessibilityLabel="Fire"
        >
          <Text style={pip.fireBtnText}>{inZone ? '🎯 FIRE!' : 'FIRE!'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
const pip = StyleSheet.create({
  container: { width: '100%', gap: 16, alignItems: 'center' },
  meta: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  metaText: { color: c.mutedForeground, fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  score: { color: c.primary, fontSize: 12, fontFamily: 'Inter_700Bold' },
  barWrap: { width: '100%', height: 48, backgroundColor: '#E54B4B33', borderRadius: 8, overflow: 'hidden', justifyContent: 'center', position: 'relative' },
  zone: { position: 'absolute', left: '38%', width: '24%', height: '100%', backgroundColor: '#2ECA8B33', borderWidth: 1, borderColor: '#2ECA8B55' },
  indicator: { position: 'absolute', width: 4, height: '100%', backgroundColor: c.foreground, marginLeft: -2, borderRadius: 2 },
  labels: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  labelText: { color: c.mutedForeground, fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  feedback: { paddingVertical: 12 },
  feedbackText: { color: c.foreground, fontSize: 18, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  fireBtn: { width: '100%', borderWidth: 1, borderColor: c.border, borderRadius: 11, padding: 16, alignItems: 'center' },
  fireBtnActive: { borderColor: c.primary, backgroundColor: '#001F22' },
  fireBtnText: { color: c.primary, fontFamily: 'Inter_700Bold', fontSize: 17 },
});

// ─── Game: Margin Call ────────────────────────────────────────────────────────
// Risk scenarios — pick the correct response to protect capital.

const MARGIN_SCENARIOS: { situation: string; options: string[]; correct: number; reason: string }[] = [
  {
    situation: 'You\'re up 2R and the market is approaching a major resistance zone.',
    options: ['Hold — target is further up', 'Take partial profits here', 'Add to the position'],
    correct: 1,
    reason: 'Taking partials at resistance locks in gains.',
  },
  {
    situation: 'Your stop-loss is hit. Price continues beyond. What do you do?',
    options: ['Chase the move without a stop', 'Re-enter with a new setup only', 'Double down immediately'],
    correct: 1,
    reason: 'Re-entering without a clear setup is revenge trading.',
  },
  {
    situation: 'News drops. Price spikes 150 pips against your open trade.',
    options: ['Wait — it will reverse', 'Close immediately', 'Add more — average in'],
    correct: 1,
    reason: 'News volatility can wipe accounts. Protect capital first.',
  },
  {
    situation: 'Daily loss limit hit. You still see a high-probability setup.',
    options: ['Take the trade — it looks great', 'Skip it. Rules are rules.', 'Use smaller size'],
    correct: 1,
    reason: 'Rules protect your account from emotional decision-making.',
  },
  {
    situation: 'Your account is at 5% daily loss. One trade left it.',
    options: ['Try to recover it in one trade', 'Stop trading for the day', 'Take two more trades to spread risk'],
    correct: 1,
    reason: 'Chasing losses after a limit is reached compounds damage.',
  },
  {
    situation: 'A trade is at +3R. Your target is +4R. Market shows exhaustion.',
    options: ['Hold — original plan was 4R', 'Close now — protect the 3R', 'Scale out 50% now'],
    correct: 2,
    reason: 'Scaling out balances plan adherence with capital protection.',
  },
];

function MarginCallGame({ onDone }: { onDone: (r: GameResult) => void }) {
  const rounds = 4;
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    return () => { cancelledRef.current = true; };
  }, []);

  const qs = useRef(
    [...MARGIN_SCENARIOS].sort(() => Math.random() - 0.5).slice(0, rounds)
  ).current;

  const current = qs[round];

  const pick = (idx: number) => {
    if (picked !== null) return;
    setPicked(idx);
    const pts = idx === current.correct ? 75 : 0;
    setTimeout(() => {
      if (cancelledRef.current) return;
      const ns = score + pts;
      if (round + 1 >= rounds) {
        onDone(scoreToResult(ns, rounds * 75));
      } else {
        setScore(ns);
        setRound((r) => r + 1);
        setPicked(null);
      }
    }, 900);
  };

  return (
    <View style={mc.container}>
      <View style={mc.header}>
        <Text style={mc.roundText}>Scenario {round + 1}/{rounds}</Text>
        <Text style={mc.score}>Score: {score}</Text>
      </View>
      <View style={mc.scenario}>
        <Feather name="alert-triangle" size={16} color="#E5A64B" />
        <Text style={mc.scenarioText}>{current.situation}</Text>
      </View>
      <View style={mc.options}>
        {current.options.map((opt, i) => {
          const isCorrect = i === current.correct;
          const isChosen = i === picked;
          let borderColor = c.border;
          let bg = c.card;
          if (picked !== null) {
            if (isCorrect) { borderColor = c.success; bg = '#0D2A1A'; }
            else if (isChosen) { borderColor = '#E54B4B'; bg = '#2A0D0D'; }
          }
          return (
            <TouchableOpacity
              key={i}
              style={[mc.option, { borderColor, backgroundColor: bg }]}
              onPress={() => pick(i)}
              disabled={picked !== null}
              accessibilityRole="button"
              accessibilityLabel={opt}
            >
              <Text style={mc.optText}>{opt}</Text>
              {picked !== null && isCorrect && <Feather name="check-circle" size={15} color={c.success} />}
              {picked !== null && isChosen && !isCorrect && <Feather name="x-circle" size={15} color="#E54B4B" />}
            </TouchableOpacity>
          );
        })}
      </View>
      {picked !== null && (
        <Text style={mc.reason}>{current.reason}</Text>
      )}
    </View>
  );
}
const mc = StyleSheet.create({
  container: { width: '100%', gap: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between' },
  roundText: { color: c.mutedForeground, fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  score: { color: c.primary, fontSize: 11, fontFamily: 'Inter_700Bold' },
  scenario: { flexDirection: 'row', gap: 8, backgroundColor: '#1A1500', borderWidth: 1, borderColor: '#E5A64B44', borderRadius: 10, padding: 12, alignItems: 'flex-start' },
  scenarioText: { color: c.foreground, fontSize: 13, fontFamily: 'Inter_600SemiBold', lineHeight: 19, flex: 1 },
  options: { gap: 7 },
  option: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 10, padding: 12 },
  optText: { color: c.foreground, fontSize: 13, flex: 1 },
  reason: { color: c.success, fontSize: 12, fontFamily: 'Inter_600SemiBold', textAlign: 'center', lineHeight: 18 },
});

// ─── Game: Bull Breaker ───────────────────────────────────────────────────────
// Tap BREAK when the sweep indicator enters the target zone.

function BullBreaker({ onDone }: { onDone: (r: GameResult) => void }) {
  const rounds = 5;
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [hit, setHit] = useState<string | null>(null);
  const posRef = useRef(0);
  const [pos, setPos] = useState(0);
  const firedRef = useRef(false);
  const cancelledRef = useRef(false);

  // Zone: 70–90 on a 0-100 scale
  const ZONE_MIN = 70;
  const ZONE_MAX = 90;

  useEffect(() => {
    cancelledRef.current = false;
    return () => { cancelledRef.current = true; };
  }, []);

  useEffect(() => {
    firedRef.current = false;
    setHit(null);
    posRef.current = 0;
    const speed = 0.8 + Math.random() * 0.6;
    const id = setInterval(() => {
      posRef.current = (posRef.current + speed) % 100;
      setPos(Math.round(posRef.current));
    }, 30);
    return () => clearInterval(id);
  }, [round]);

  const breakBlock = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    const p = posRef.current;
    const inZone = p >= ZONE_MIN && p <= ZONE_MAX;
    const dist = Math.min(Math.abs(p - ZONE_MIN), Math.abs(p - ZONE_MAX));
    let pts = 0;
    let msg = '';
    if (inZone) {
      pts = dist <= 3 ? 100 : dist <= 8 ? 80 : 60;
      msg = pts === 100 ? '💥 PERFECT BREAK!' : '✅ Block Broken!';
    } else {
      msg = p < ZONE_MIN ? '⏳ Too Early' : '⏩ Too Late';
    }
    setHit(msg);
    setTimeout(() => {
      if (cancelledRef.current) return;
      const ns = score + pts;
      if (round + 1 >= rounds) {
        onDone(scoreToResult(ns, rounds * 100));
      } else {
        setScore(ns);
        setRound((r) => r + 1);
      }
    }, 900);
  };

  // Circular representation: pos 0-100 → angle 0-360
  const angle = (pos / 100) * 360;
  const inZone = pos >= ZONE_MIN && pos <= ZONE_MAX;

  return (
    <View style={bb.container}>
      <View style={bb.header}>
        <Text style={bb.metaText}>Block {round + 1}/{rounds}</Text>
        <Text style={bb.score}>Score: {score}</Text>
      </View>
      {/* Circular progress indicator */}
      <View style={bb.circleWrap}>
        <View style={bb.circle}>
          <Text style={bb.circleLabel}>{Math.round(pos)}%</Text>
          <Text style={bb.circleSubLabel}>SWEEP</Text>
        </View>
        {/* Zone arc shown as a colored bar at the bottom of the circle wrap */}
        <View style={[bb.zoneArc, inZone && bb.zoneArcActive]} />
        {/* Indicator dot — simplified linear representation */}
        <View style={[bb.sweepBar]}>
          <View style={[bb.sweepFill, { width: `${pos}%` as any, backgroundColor: inZone ? c.success : c.primary }]} />
          <View style={bb.zoneMark} />
        </View>
      </View>
      <View style={bb.zoneLabels}>
        <Text style={bb.zoneLabel}>0%</Text>
        <Text style={[bb.zoneLabel, { color: c.success }]}>TARGET 70–90%</Text>
        <Text style={bb.zoneLabel}>100%</Text>
      </View>
      {hit ? (
        <View style={bb.feedback}><Text style={bb.feedbackText}>{hit}</Text></View>
      ) : (
        <TouchableOpacity
          style={[bb.btn, inZone && bb.btnActive]}
          onPress={breakBlock}
          accessibilityRole="button"
          accessibilityLabel="Break block"
        >
          <Text style={bb.btnText}>{inZone ? '💥 BREAK!' : 'BREAK!'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
const bb = StyleSheet.create({
  container: { width: '100%', gap: 12, alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  metaText: { color: c.mutedForeground, fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  score: { color: c.primary, fontSize: 12, fontFamily: 'Inter_700Bold' },
  circleWrap: { width: '100%', gap: 8 },
  circle: { alignItems: 'center', paddingVertical: 12 },
  circleLabel: { color: c.foreground, fontSize: 36, fontFamily: 'Inter_700Bold' },
  circleSubLabel: { color: c.mutedForeground, fontSize: 10, letterSpacing: 1.2, fontFamily: 'Inter_700Bold' },
  zoneArc: { height: 4, borderRadius: 2, backgroundColor: '#2ECA8B33', marginHorizontal: 0 },
  zoneArcActive: { backgroundColor: c.success },
  sweepBar: { height: 40, backgroundColor: c.border, borderRadius: 8, overflow: 'hidden', position: 'relative', justifyContent: 'center' },
  sweepFill: { height: '100%', borderRadius: 8 },
  zoneMark: { position: 'absolute', left: '70%', width: '20%', height: '100%', borderWidth: 1, borderColor: '#2ECA8B', backgroundColor: '#2ECA8B11' },
  zoneLabels: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  zoneLabel: { color: c.mutedForeground, fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  feedback: { paddingVertical: 10 },
  feedbackText: { color: c.foreground, fontSize: 18, fontFamily: 'Inter_700Bold' },
  btn: { width: '100%', borderWidth: 1, borderColor: c.border, borderRadius: 11, padding: 16, alignItems: 'center' },
  btnActive: { borderColor: c.success, backgroundColor: '#0D2A1A' },
  btnText: { color: c.primary, fontFamily: 'Inter_700Bold', fontSize: 17 },
});

// ─── Game: Candle Runner ──────────────────────────────────────────────────────
// Red candles fall. Dodge them by moving LEFT or RIGHT.

type CandleItem = { id: number; lane: 0 | 1 | 2; color: 'red' | 'green' };

function CandleRunner({ onDone }: { onDone: (r: GameResult) => void }) {
  const totalCandles = 10;
  const [position, setPosition] = useState<0 | 1 | 2>(1); // 0=left,1=center,2=right
  const [candles, setCandles] = useState<CandleItem[]>([]);
  const [survived, setSurvived] = useState(0);
  const [score, setScore] = useState(0);
  const [status, setStatus] = useState<'playing' | 'hit' | 'dodged'>('playing');
  // spawnTrigger increments after EVERY resolved candle (hit OR dodge) so the
  // spawn effect always re-runs regardless of whether `survived` changed.
  const [spawnTrigger, setSpawnTrigger] = useState(0);
  const nextId = useRef(0);
  const survivedRef = useRef(0);
  const scoreRef = useRef(0);
  const posRef = useRef<0 | 1 | 2>(1);
  const doneRef = useRef(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    return () => { cancelledRef.current = true; };
  }, []);

  const spawnCandle = useCallback(() => {
    const lane = (Math.floor(Math.random() * 3)) as 0 | 1 | 2;
    const color = Math.random() > 0.6 ? 'green' : 'red'; // red = bad, green = safe
    const id = nextId.current++;
    setCandles((prev) => [...prev.slice(-4), { id, lane, color }]);

    // Evaluate after brief "fall" time
    setTimeout(() => {
      if (cancelledRef.current) return;
      const currentPos = posRef.current;
      const hit = currentPos === lane && color === 'red';
      const bonusGreen = currentPos === lane && color === 'green';

      if (hit) {
        setStatus('hit');
        setTimeout(() => {
          if (cancelledRef.current) return;
          setStatus('playing');
          setCandles([]);
          // Trigger next spawn even after a hit
          setSpawnTrigger((t) => t + 1);
        }, 600);
      } else {
        if (bonusGreen) scoreRef.current += 15;
        else scoreRef.current += 10;
        setScore(scoreRef.current);
        survivedRef.current += 1;
        setSurvived(survivedRef.current);
        setStatus('dodged');
        setTimeout(() => {
          if (!cancelledRef.current) setStatus('playing');
        }, 350);
        // Trigger next spawn after dodge
        setSpawnTrigger((t) => t + 1);
      }

      if (survivedRef.current >= totalCandles) {
        if (!doneRef.current) {
          doneRef.current = true;
          setTimeout(() => {
            if (!cancelledRef.current) onDone(scoreToResult(scoreRef.current, totalCandles * 10 + 50));
          }, 400);
        }
      }
    }, 900);
  }, [onDone]);

  // Keyed to `spawnTrigger` (not `survived`) so it re-runs after hits too.
  useEffect(() => {
    if (doneRef.current) return;
    const delay = 1200 + Math.random() * 400;
    const id = setTimeout(spawnCandle, delay);
    return () => clearTimeout(id);
  }, [spawnTrigger, spawnCandle]);

  const move = (dir: 'left' | 'right') => {
    setPosition((p) => {
      const np = dir === 'left' ? Math.max(0, p - 1) : Math.min(2, p + 1);
      posRef.current = np as 0 | 1 | 2;
      return np as 0 | 1 | 2;
    });
  };

  const lanes = [0, 1, 2];

  return (
    <View style={cr.container}>
      <View style={cr.header}>
        <Text style={cr.metaText}>Candle {survived}/{totalCandles}</Text>
        <Text style={cr.score}>Score: {score}</Text>
      </View>
      {/* Game board */}
      <View style={cr.board}>
        {lanes.map((lane) => {
          const falling = candles.filter((c2) => c2.lane === lane);
          const last = falling[falling.length - 1];
          return (
            <View key={lane} style={cr.lane}>
              {last && (
                <View style={[cr.candle, { backgroundColor: last.color === 'red' ? '#E54B4B' : '#2ECA8B' }]}>
                  <Text style={cr.candleText}>{last.color === 'red' ? '📉' : '📈'}</Text>
                </View>
              )}
            </View>
          );
        })}
        {/* Player */}
        <View style={[cr.playerRow]}>
          {lanes.map((lane) => (
            <View key={lane} style={cr.lane}>
              {lane === position && (
                <View style={[cr.player, status === 'hit' && cr.playerHit, status === 'dodged' && cr.playerDodged]}>
                  <Text style={cr.playerIcon}>🧑‍💼</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      </View>
      <View style={cr.controls}>
        <TouchableOpacity style={cr.ctrl} onPress={() => move('left')} accessibilityRole="button" accessibilityLabel="Move left">
          <Feather name="arrow-left" size={22} color={c.foreground} />
          <Text style={cr.ctrlText}>LEFT</Text>
        </TouchableOpacity>
        <View style={cr.laneIndicator}>
          {lanes.map((l) => (
            <View key={l} style={[cr.laneDot, l === position && cr.laneDotActive]} />
          ))}
        </View>
        <TouchableOpacity style={cr.ctrl} onPress={() => move('right')} accessibilityRole="button" accessibilityLabel="Move right">
          <Text style={cr.ctrlText}>RIGHT</Text>
          <Feather name="arrow-right" size={22} color={c.foreground} />
        </TouchableOpacity>
      </View>
      <Text style={cr.hint}>Dodge 📉 red candles · Collect 📈 green candles</Text>
    </View>
  );
}
const cr = StyleSheet.create({
  container: { width: '100%', gap: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between' },
  metaText: { color: c.mutedForeground, fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  score: { color: c.primary, fontSize: 12, fontFamily: 'Inter_700Bold' },
  board: { height: 160, backgroundColor: '#0A0F14', borderRadius: 12, borderWidth: 1, borderColor: c.border, flexDirection: 'row', overflow: 'hidden' },
  lane: { flex: 1, borderRightWidth: 1, borderRightColor: '#1A1F28', justifyContent: 'flex-start', alignItems: 'center', paddingTop: 10 },
  candle: { width: 40, height: 40, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  candleText: { fontSize: 20 },
  playerRow: { position: 'absolute', bottom: 12, left: 0, right: 0, flexDirection: 'row' },
  player: { width: 40, height: 40, borderRadius: 8, backgroundColor: '#1A2E40', justifyContent: 'center', alignItems: 'center', alignSelf: 'center' },
  playerHit: { backgroundColor: '#3A0D0D' },
  playerDodged: { backgroundColor: '#0D2A1A' },
  playerIcon: { fontSize: 22 },
  controls: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  ctrl: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: c.border, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 12 },
  ctrlText: { color: c.foreground, fontFamily: 'Inter_700Bold', fontSize: 13 },
  laneIndicator: { flexDirection: 'row', gap: 6 },
  laneDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.border },
  laneDotActive: { backgroundColor: c.primary },
  hint: { color: c.mutedForeground, fontSize: 10, textAlign: 'center', fontFamily: 'Inter_600SemiBold' },
});

// ─── Game: Whale Hunt ─────────────────────────────────────────────────────────
// Identify the abnormally large order (the "whale") in the order book.

function WhaleHunt({ onDone }: { onDone: (r: GameResult) => void }) {
  const rounds = 4;
  const [round, setRound] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(7);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    return () => { cancelledRef.current = true; };
  }, []);

  // Generate random orders — one whale (10-50x larger)
  const makeOrders = () => {
    const base = Math.floor(Math.random() * 80 + 20); // 20-100K
    const orders = [
      Math.round(base * (0.8 + Math.random() * 0.4)),
      Math.round(base * (0.7 + Math.random() * 0.5)),
      Math.round(base * (0.9 + Math.random() * 0.3)),
      Math.round(base * (0.6 + Math.random() * 0.6)),
    ];
    const whaleIdx = Math.floor(Math.random() * 4);
    orders[whaleIdx] = Math.round(base * (10 + Math.random() * 40));
    return { orders, whaleIdx };
  };

  const roundData = useRef(Array.from({ length: rounds }, makeOrders)).current;
  const { orders, whaleIdx } = roundData[round];

  const pick = useCallback((idx: number) => {
    if (picked !== null) return;
    setPicked(idx);
    const pts = idx === whaleIdx ? Math.round(50 + (timeLeft / 7) * 50) : 0;
    setTimeout(() => {
      if (cancelledRef.current) return;
      const ns = score + pts;
      if (round + 1 >= rounds) {
        onDone(scoreToResult(ns, rounds * 100));
      } else {
        setScore(ns);
        setRound((r) => r + 1);
        setPicked(null);
        setTimeLeft(7);
      }
    }, 800);
  }, [picked, whaleIdx, timeLeft, score, round, rounds, onDone]);

  useEffect(() => {
    if (picked !== null) return;
    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(id);
          pick(-1);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [round, picked]);

  const maxOrder = Math.max(...orders);

  return (
    <View style={wh.container}>
      <View style={wh.header}>
        <Text style={wh.metaText}>Hunt {round + 1}/{rounds}</Text>
        <View style={wh.timer}>
          <Feather name="clock" size={12} color={timeLeft <= 3 ? '#E54B4B' : c.mutedForeground} />
          <Text style={[wh.timerText, timeLeft <= 3 && { color: '#E54B4B' }]}>{timeLeft}s</Text>
        </View>
        <Text style={wh.score}>Score: {score}</Text>
      </View>
      <Text style={wh.prompt}>🐋 Spot the whale order</Text>
      <View style={wh.book}>
        {orders.map((size, i) => {
          const isWhale = i === whaleIdx;
          const isChosen = i === picked;
          const barPct = size / maxOrder;
          return (
            <TouchableOpacity
              key={i}
              style={[wh.row, picked !== null && isWhale && wh.rowWhale, picked !== null && isChosen && !isWhale && wh.rowWrong]}
              onPress={() => pick(i)}
              disabled={picked !== null}
              accessibilityRole="button"
              accessibilityLabel={`Order ${size}K lots`}
            >
              <Text style={wh.price}>{(95000 - i * 12).toLocaleString()}</Text>
              <View style={wh.barWrap}>
                <View style={[wh.bar, { width: `${barPct * 100}%` as any, backgroundColor: isWhale && picked !== null ? c.primary : '#00F0FF33' }]} />
              </View>
              <Text style={wh.size}>{size.toLocaleString()}K</Text>
              {picked !== null && isWhale && <Feather name="anchor" size={13} color={c.primary} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
const wh = StyleSheet.create({
  container: { width: '100%', gap: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaText: { color: c.mutedForeground, fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  timer: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  timerText: { color: c.mutedForeground, fontSize: 12, fontFamily: 'Inter_700Bold' },
  score: { color: c.primary, fontSize: 12, fontFamily: 'Inter_700Bold' },
  prompt: { color: c.foreground, fontSize: 14, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  book: { gap: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.card, borderWidth: 1, borderColor: c.border, borderRadius: 8, padding: 10 },
  rowWhale: { borderColor: c.primary, backgroundColor: '#001F22' },
  rowWrong: { borderColor: '#E54B4B', backgroundColor: '#2A0D0D' },
  price: { color: c.mutedForeground, fontSize: 11, fontFamily: 'Inter_600SemiBold', width: 58 },
  barWrap: { flex: 1, height: 16, backgroundColor: '#0A0F14', borderRadius: 4, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: 4 },
  size: { color: c.foreground, fontSize: 12, fontFamily: 'Inter_700Bold', textAlign: 'right', width: 48 },
});

// ─── Game dispatcher ──────────────────────────────────────────────────────────

function PlayableGame({
  game,
  onDone,
}: {
  game: GameEntry;
  onDone: (r: GameResult) => void;
}) {
  switch (game.id) {
    case 'chart-master':    return <PatternGame isSmc onDone={onDone} />;
    case 'pattern-guesser': return <PatternGame isSmc={false} onDone={onDone} />;
    case 'pip-sniper':      return <PipSniper onDone={onDone} />;
    case 'margin-call':     return <MarginCallGame onDone={onDone} />;
    case 'bull-breaker':    return <BullBreaker onDone={onDone} />;
    case 'candle-runner':   return <CandleRunner onDone={onDone} />;
    case 'whale-hunt':      return <WhaleHunt onDone={onDone} />;
    default:                return <PatternGame isSmc={false} onDone={onDone} />;
  }
}

// ─── Game modal ───────────────────────────────────────────────────────────────

function GameModal({
  game,
  onClose,
  onStatsUpdated,
}: {
  game: GameEntry;
  onClose: () => void;
  onStatsUpdated: (p: Player) => void;
}) {
  const [phase, setPhase] = useState<GamePhase>('launch');
  const [result, setResult] = useState<GameResult | null>(null);
  const [isPersonalBest, setIsPersonalBest] = useState(false);
  const [previousBest, setPreviousBest] = useState(0);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    return () => { cancelledRef.current = true; };
  }, []);

  const handleDone = useCallback(
    async (r: GameResult) => {
      if (cancelledRef.current) return;
      // Persist FIRST — before the result screen becomes visible, so there is
      // no window where the user can dismiss the modal and skip the write.
      // persistResult always runs to completion; cancelledRef only guards
      // React state updates that follow.
      let updatedPlayer: Player | null = null;
      try {
        const persisted = await persistResult(r.xpEarned, game.id, r.score);
        updatedPlayer = persisted.player;
        setIsPersonalBest(persisted.isPersonalBest);
        setPreviousBest(persisted.previousBest);
      } catch {}
      // Notify the hub so stats refresh whether or not the modal is still open.
      if (updatedPlayer) onStatsUpdated(updatedPlayer);
      // Show the result screen only if the modal is still mounted.
      if (!cancelledRef.current) {
        setResult(r);
        setPhase('result');
      }
    },
    [onStatsUpdated]
  );

  const handlePlayAgain = () => {
    setResult(null);
    setPhase('launch');
  };

  return (
    <View style={gm.container}>
      {/* Close button always visible */}
      <TouchableOpacity
        style={gm.close}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        <Feather name="x" size={21} color={c.foreground} />
      </TouchableOpacity>

      {phase === 'launch' && (
        <>
          <View style={gm.icon}>
            <Feather name={game.icon} size={28} color={c.primary} />
          </View>
          <Text style={gm.title}>{game.name}</Text>
          <Text style={gm.body}>{game.desc}</Text>
          <TouchableOpacity
            style={gm.cta}
            onPress={() => setPhase('playing')}
            accessibilityRole="button"
            accessibilityLabel={`Start ${game.name}`}
          >
            <Text style={gm.ctaText}>Start Game</Text>
          </TouchableOpacity>
        </>
      )}

      {phase === 'playing' && (
        <PlayableGame game={game} onDone={handleDone} />
      )}

      {phase === 'result' && result && (
        <ResultScreen
          game={game}
          result={result}
          isPersonalBest={isPersonalBest}
          previousBest={previousBest}
          onPlayAgain={handlePlayAgain}
          onClose={onClose}
        />
      )}
    </View>
  );
}
const gm = StyleSheet.create({
  container: { backgroundColor: c.card, borderColor: c.primary, borderWidth: 1, borderRadius: 18, padding: 22, gap: 14 },
  close: { position: 'absolute', top: 14, right: 14, zIndex: 10 },
  icon: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#0A2529', alignItems: 'center', justifyContent: 'center', marginTop: 12, alignSelf: 'center' },
  title: { color: c.foreground, fontSize: 22, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  body: { color: c.mutedForeground, fontSize: 14, lineHeight: 21, textAlign: 'center' },
  cta: { backgroundColor: c.primary, borderRadius: 11, padding: 15, alignItems: 'center' },
  ctaText: { color: c.primaryForeground, fontFamily: 'Inter_700Bold', fontSize: 15 },
});

type LeaderboardEntry = { rank: number; username: string; xp: number };
export default function TradingArcadeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [player, setPlayer] = useState<Player>(DEFAULT_ARCADE_PLAYER);
  const [selected, setSelected] = useState<GameEntry | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  // Stable display name for the leaderboard — prefer claimed username from
  // session metadata, fall back to a short unique handle.
  const displayName: string =
    (session?.user?.user_metadata?.['username'] as string | undefined) ??
    (session?.user?.user_metadata?.['name'] as string | undefined) ??
    (session?.user?.id ? `Trader_${session.user.id.slice(-4)}` : 'Trader');

  useEffect(() => {
    loadPlayer().then(setPlayer).catch(() => {});
    fetchArcadeLeaderboard().then(setLeaderboard).catch(() => {});
  }, []);

  /** Called by GameModal after persistence; posts XP and refreshes rank + leaderboard. */
  const handleStatsUpdated = useCallback(
    async (updatedPlayer: Player) => {
      setPlayer(updatedPlayer);
      const result = await postArcadeScore(updatedPlayer.xp, displayName);
      if (result) {
        setLeaderboard(result.leaderboard);
        setPlayer((prev) => ({ ...prev, rank: result.rank }));
      }
    },
    [displayName],
  );

  const xpInLevel = player.xp % XP_PER_LEVEL;
  const level = Math.floor(player.xp / XP_PER_LEVEL) + 1;
  const levelTitle = level <= 3 ? 'RETAIL TRADER' : level <= 6 ? 'SWING TRADER' : level <= 9 ? 'MARKET MAKER' : 'SMART MONEY';

  const skillGames = GAMES.filter((g) => !g.featured);
  const featuredGame = GAMES.find((g) => g.featured)!;

  return (
    <View style={s.container}>
      <ScrollView
        contentContainerStyle={[
          s.content,
          {
            paddingTop: Platform.OS === 'web' ? 20 : insets.top + 10,
            paddingBottom: insets.bottom + 30,
          },
        ]}
      >
        {/* Header */}
        <View style={s.header}>
          <TouchableOpacity onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Go back">
            <Feather name="chevron-left" size={23} color={c.foreground} />
          </TouchableOpacity>
          <Text style={s.title}>Trading Arcade</Text>
          <Feather name="cpu" size={22} color={c.primary} />
        </View>

        {/* Player hub */}
        <View style={s.player}>
          <View style={s.playerTop}>
            <View>
              <Text style={s.eyebrow}>PLAYER RANK</Text>
              <Text style={s.rank}>
                LEVEL {level}{' '}
                <Text style={s.rankMuted}>· {levelTitle}</Text>
              </Text>
            </View>
            <View style={s.badge}>
              <Feather name="award" size={15} color={c.primaryForeground} />
              <Text style={s.badgeText}>#{player.rank}</Text>
            </View>
          </View>
          <View style={s.progressLabel}>
            <Text style={s.muted}>LEVEL PROGRESS</Text>
            <Text style={s.muted}>
              {xpInLevel} / {XP_PER_LEVEL} XP
            </Text>
          </View>
          <View style={s.track}>
            <View style={[s.fill, { width: `${(xpInLevel / XP_PER_LEVEL) * 100}%` as any }]} />
          </View>
          <View style={s.stats}>
            {(
              [
                ['Played', player.played],
                ['Streak', player.streak],
                ['Today', player.today],
                ['Rank', `#${player.rank}`],
              ] as [string, string | number][]
            ).map(([label, value]) => (
              <View key={label} style={s.stat}>
                <Text style={s.statValue}>{value}</Text>
                <Text style={s.statLabel}>{label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Featured game */}
        <TouchableOpacity
          style={s.featured}
          onPress={() => setSelected(featuredGame)}
          accessibilityRole="button"
          accessibilityLabel={`Play ${featuredGame.name}`}
        >
          <View>
            <Text style={s.featureEyebrow}>FEATURED GAME</Text>
            <Text style={s.featureTitle}>{featuredGame.name.toUpperCase()}</Text>
            <Text style={s.featureBody}>The SMC pattern-reader challenge</Text>
          </View>
          <View style={s.play}>
            <Feather name="play" size={22} color={c.primaryForeground} />
          </View>
        </TouchableOpacity>

        {/* Skill games grid */}
        <Text style={s.section}>SKILL GAMES</Text>
        <View style={s.grid}>
          {skillGames.map((game) => (
            <TouchableOpacity
              key={game.id}
              style={s.game}
              onPress={() => setSelected(game)}
              accessibilityRole="button"
              accessibilityLabel={`Play ${game.name}`}
            >
              <View style={s.gameIcon}>
                <Feather name={game.icon} size={20} color={c.primary} />
              </View>
              <Text style={s.gameName}>{game.name}</Text>
              <Text style={s.gameDesc}>{game.desc}</Text>
              <Text style={s.best}>BEST {player.bestScores[game.id] ?? 0}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Global leaderboard */}
        <Text style={s.section}>GLOBAL LEADERBOARD</Text>
        <View style={s.lbCard}>
          {leaderboard.length === 0 ? (
            <Text style={s.lbEmpty}>
              Play a game to appear on the leaderboard!
            </Text>
          ) : (
            leaderboard.map((entry) => {
              const isMe = entry.username === displayName;
              return (
                <View
                  key={entry.username}
                  style={[s.lbRow, isMe && s.lbRowMe]}
                  accessibilityLabel={`Rank ${entry.rank}: ${entry.username}, ${entry.xp} XP`}
                >
                  <Text style={[s.lbRank, isMe && s.lbRankMe]}>
                    #{entry.rank}
                  </Text>
                  <Text style={[s.lbName, isMe && s.lbNameMe]} numberOfLines={1}>
                    {entry.username}
                    {isMe ? ' (you)' : ''}
                  </Text>
                  <Text style={[s.lbXp, isMe && s.lbXpMe]}>
                    {entry.xp.toLocaleString()} XP
                  </Text>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Game modal */}
      <Modal
        visible={!!selected}
        transparent
        animationType="fade"
        onRequestClose={() => setSelected(null)}
      >
        <View style={s.overlay}>
          <ScrollView
            contentContainerStyle={s.overlayContent}
            keyboardShouldPersistTaps="handled"
          >
            {selected && (
              <GameModal
                game={selected}
                onClose={() => setSelected(null)}
                onStatsUpdated={handleStatsUpdated}
              />
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  content: { padding: 18, gap: 15 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: c.foreground, fontSize: 22, fontFamily: 'Inter_700Bold' },
  player: { backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 12, marginTop: 10 },
  playerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  eyebrow: { color: c.primary, fontSize: 10, letterSpacing: 1.2, fontFamily: 'Inter_700Bold' },
  rank: { color: c.foreground, fontSize: 20, fontFamily: 'Inter_700Bold', marginTop: 5 },
  rankMuted: { color: c.mutedForeground, fontSize: 12 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: c.primary, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 7 },
  badgeText: { color: c.primaryForeground, fontFamily: 'Inter_700Bold' },
  progressLabel: { flexDirection: 'row', justifyContent: 'space-between' },
  muted: { color: c.mutedForeground, fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  track: { height: 7, backgroundColor: c.border, borderRadius: 4, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: c.primary },
  stats: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: c.border, paddingTop: 12 },
  stat: { flex: 1, alignItems: 'center', borderRightWidth: 1, borderRightColor: c.border },
  statValue: { color: c.foreground, fontSize: 17, fontFamily: 'Inter_700Bold' },
  statLabel: { color: c.mutedForeground, fontSize: 10, marginTop: 3 },
  featured: { backgroundColor: '#10272A', borderColor: c.primary, borderWidth: 1, borderRadius: 16, padding: 19, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  featureEyebrow: { color: c.primary, fontSize: 10, letterSpacing: 1.3, fontFamily: 'Inter_700Bold' },
  featureTitle: { color: c.foreground, fontSize: 24, fontFamily: 'Inter_700Bold', marginTop: 5 },
  featureBody: { color: c.mutedForeground, fontSize: 12, marginTop: 3 },
  play: { width: 50, height: 50, borderRadius: 25, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' },
  section: { color: c.mutedForeground, fontSize: 10, letterSpacing: 1.2, fontFamily: 'Inter_700Bold', marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  game: { width: '48%', minHeight: 145, backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 13, padding: 13, gap: 8 },
  gameIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#0A2529', alignItems: 'center', justifyContent: 'center' },
  gameName: { color: c.foreground, fontSize: 14, fontFamily: 'Inter_700Bold' },
  gameDesc: { color: c.mutedForeground, fontSize: 11, lineHeight: 16 },
  best: { color: c.primary, fontSize: 10, fontFamily: 'Inter_700Bold', marginTop: 'auto' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,.75)' },
  overlayContent: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  // leaderboard
  lbCard: { backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  lbEmpty: { color: c.mutedForeground, fontSize: 13, textAlign: 'center', padding: 20, fontFamily: 'Inter_400Regular' },
  lbRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: c.border },
  lbRowMe: { backgroundColor: '#0A2529' },
  lbRank: { color: c.mutedForeground, fontSize: 12, fontFamily: 'Inter_700Bold', width: 32 },
  lbRankMe: { color: c.primary },
  lbName: { flex: 1, color: c.foreground, fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  lbNameMe: { color: c.primary },
  lbXp: { color: c.mutedForeground, fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  lbXpMe: { color: c.foreground },
});

async function fetchArcadeLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    const body = await customFetch<{ leaderboard: LeaderboardEntry[] }>(
      '/api/arcade/leaderboard',
    );
    return body.leaderboard ?? [];
  } catch {
    return [];
  }
}

async function postArcadeScore(
  xp: number,
  username: string,
): Promise<{ rank: number; leaderboard: LeaderboardEntry[] } | null> {
  try {
    return await customFetch<{ rank: number; leaderboard: LeaderboardEntry[] }>(
      '/api/arcade/score',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xp, username }),
      },
    );
  } catch {
    return null;
  }
}
