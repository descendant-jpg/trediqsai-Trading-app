import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, {
  Defs,
  Line,
  LinearGradient,
  Path,
  Stop,
} from 'react-native-svg';
import colors from '@/constants/colors';

const c = colors.light;

const MAX_POINTS = 60;
const TICK_MS = 800;
const START_PRICE = 23412.5;

/** Random-walk next price tick. */
function nextTick(prev: number): number {
  const drift = (Math.random() - 0.5) * 2; // -1..1
  const shock = Math.random() < 0.08 ? (Math.random() - 0.5) * 60 : 0;
  return Math.max(prev + drift * 14 + shock, 1);
}

function buildInitialSeries(): number[] {
  const pts: number[] = [START_PRICE];
  for (let i = 1; i < MAX_POINTS; i++) pts.push(nextTick(pts[i - 1]));
  return pts;
}

/**
 * Live simulated price chart — a cyan line with a soft gradient fill that
 * advances on a fixed tick interval (random-walk feed).
 */
export function LiveChart({ symbol = 'NAS100' }: { symbol?: string }) {
  const [series, setSeries] = useState<number[]>(buildInitialSeries);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timer.current = setInterval(() => {
      setSeries((prev) => {
        const next = [...prev.slice(-(MAX_POINTS - 1)), nextTick(prev[prev.length - 1])];
        return next;
      });
    }, TICK_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  const last = series[series.length - 1];
  const prev = series[series.length - 2] ?? last;
  const up = last >= prev;
  const sessionOpen = series[0];
  const changePct = ((last - sessionOpen) / sessionOpen) * 100;

  const { linePath, areaPath, lastY } = useMemo(() => {
    const { width, height } = size;
    if (width <= 0 || height <= 0) {
      return { linePath: '', areaPath: '', lastY: 0 };
    }
    const min = Math.min(...series);
    const max = Math.max(...series);
    const range = max - min || 1;
    const padY = 14;
    const usableH = height - padY * 2;
    const stepX = width / (series.length - 1);

    const pts = series.map((v, i) => {
      const x = i * stepX;
      const y = padY + (1 - (v - min) / range) * usableH;
      return { x, y };
    });

    const line = pts
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
      .join(' ');
    const area = `${line} L${width},${height} L0,${height} Z`;
    return { linePath: line, areaPath: area, lastY: pts[pts.length - 1].y };
  }, [series, size]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ width, height });
  };

  return (
    <View style={styles.container} testID="live-chart">
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.symbol}>{symbol}</Text>
          <Text style={styles.feedLabel}>SIMULATED FEED · LIVE</Text>
        </View>
        <View style={styles.priceBlock}>
          <Text style={[styles.price, { color: up ? c.success : c.destructive }]}>
            {last.toFixed(1)}
          </Text>
          <Text
            style={[
              styles.change,
              { color: changePct >= 0 ? c.success : c.destructive },
            ]}
          >
            {changePct >= 0 ? '+' : ''}
            {changePct.toFixed(2)}%
          </Text>
        </View>
      </View>

      <View style={styles.chartArea} onLayout={onLayout}>
        {size.width > 0 && size.height > 0 && (
          <Svg width={size.width} height={size.height}>
            <Defs>
              <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={c.primary} stopOpacity="0.25" />
                <Stop offset="1" stopColor={c.primary} stopOpacity="0" />
              </LinearGradient>
            </Defs>
            {[0.25, 0.5, 0.75].map((f) => (
              <Line
                key={f}
                x1={0}
                y1={size.height * f}
                x2={size.width}
                y2={size.height * f}
                stroke={c.border}
                strokeWidth={1}
                strokeDasharray="4 6"
              />
            ))}
            <Path d={areaPath} fill="url(#fill)" />
            <Path
              d={linePath}
              stroke={c.primary}
              strokeWidth={2}
              fill="none"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <Line
              x1={0}
              y1={lastY}
              x2={size.width}
              y2={lastY}
              stroke={c.primary}
              strokeOpacity={0.35}
              strokeWidth={1}
              strokeDasharray="2 4"
            />
          </Svg>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 300,
    borderWidth: 1,
    borderColor: c.border,
    borderRadius: colors.radius,
    backgroundColor: c.card,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  symbol: {
    color: c.foreground,
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.5,
  },
  feedLabel: {
    color: c.mutedForeground,
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1.2,
    marginTop: 3,
  },
  chartArea: {
    flex: 1,
    marginTop: 8,
  },
  priceBlock: {
    alignItems: 'flex-end',
  },
  price: {
    fontSize: 18,
    fontFamily: 'Inter_700Bold',
    letterSpacing: 0.3,
  },
  change: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    marginTop: 2,
  },
});
