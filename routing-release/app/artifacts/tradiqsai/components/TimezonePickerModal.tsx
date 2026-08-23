import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { deviceTimeZone, isValidTimeZone } from '@/lib/persistedState';
import colors from '@/constants/colors';

/** Curated fallback when Intl.supportedValuesOf is unavailable. */
const FALLBACK_ZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Zurich',
  'Africa/Johannesburg',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Australia/Sydney',
  'Pacific/Auckland',
];

function allTimeZones(): string[] {
  try {
    const anyIntl = Intl as unknown as {
      supportedValuesOf?: (key: string) => string[];
    };
    const zones = anyIntl.supportedValuesOf?.('timeZone');
    if (Array.isArray(zones) && zones.length > 0) return zones;
  } catch {
    // fall through
  }
  return FALLBACK_ZONES;
}

/** Current local time in `tz`, e.g. "14:05", or null if unformattable. */
function timeInZone(tz: string): string | null {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date());
  } catch {
    return null;
  }
}

interface Props {
  visible: boolean;
  /** The currently pinned trading-day timezone. */
  current: string;
  onClose: () => void;
  /**
   * Called with a validated IANA timezone when the trader picks one.
   * Returns whether the change was accepted.
   */
  onSelect: (tz: string) => boolean;
}

/**
 * Full-screen modal for picking the trading-day timezone. Searchable list
 * of IANA zones; a query that exactly matches a valid zone not in the list
 * is also offered, validated via isValidTimeZone.
 */
export default function TimezonePickerModal({
  visible,
  current,
  onClose,
  onSelect,
}: Props) {
  const [query, setQuery] = useState('');
  const zones = useMemo(allTimeZones, []);
  const device = useMemo(deviceTimeZone, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = zones;
    if (q) {
      list = zones.filter((z) =>
        z.toLowerCase().replace(/_/g, ' ').includes(q.replace(/_/g, ' ')),
      );
      // Let power users type an exact zone the list doesn't include.
      const exact = query.trim();
      if (!list.includes(exact) && isValidTimeZone(exact)) {
        list = [exact, ...list];
      }
    }
    // Pin current + device zones to the top when not searching.
    if (!q) {
      const pinned = [...new Set([current, device])].filter((z) =>
        isValidTimeZone(z),
      );
      list = [...pinned, ...list.filter((z) => !pinned.includes(z))];
    }
    return list;
  }, [zones, query, current, device]);

  const pick = (tz: string) => {
    if (onSelect(tz)) {
      setQuery('');
      onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>Trading Day Timezone</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              testID="tz-close"
            >
              <Feather name="x" size={22} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
          <Text style={styles.subtitle}>
            Your daily loss limit resets at midnight in this timezone. Changing
            it moves the reset boundary — today&apos;s tracked loss is kept.
          </Text>
          <View style={styles.searchRow}>
            <Feather name="search" size={16} color="#8A8D93" />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Search timezones…"
              placeholderTextColor="#8A8D93"
              autoCapitalize="none"
              autoCorrect={false}
              testID="tz-search"
            />
          </View>
          <FlatList
            data={filtered}
            keyExtractor={(z) => z}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const selected = item === current;
              const time = timeInZone(item);
              return (
                <TouchableOpacity
                  style={[styles.row, selected && styles.rowSelected]}
                  onPress={() => pick(item)}
                  activeOpacity={0.8}
                  testID={`tz-option-${item}`}
                >
                  <View style={styles.rowText}>
                    <Text
                      style={[styles.zone, selected && styles.zoneSelected]}
                    >
                      {item.replace(/_/g, ' ')}
                    </Text>
                    {item === device && (
                      <Text style={styles.deviceTag}>Device timezone</Text>
                    )}
                  </View>
                  {time && <Text style={styles.time}>{time}</Text>}
                  {selected && (
                    <Feather name="check" size={18} color="#00F0FF" />
                  )}
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <Text style={styles.empty}>
                No matching timezone. Try a region or city name, e.g.
                “America/New York”.
              </Text>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  card: {
    height: '85%',
    backgroundColor: '#0A0B0E',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    borderColor: '#22252A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#22252A',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Inter_700Bold',
  },
  subtitle: {
    color: '#8A8D93',
    fontSize: 12.5,
    fontFamily: 'Inter_400Regular',
    lineHeight: 18,
    paddingHorizontal: 18,
    paddingTop: 12,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 18,
    marginVertical: 12,
    paddingHorizontal: 12,
    height: 44,
    backgroundColor: '#16181D',
    borderWidth: 1,
    borderColor: '#22252A',
    borderRadius: colors.radius,
  },
  searchInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    height: 52,
    borderBottomWidth: 1,
    borderBottomColor: '#16181D',
  },
  rowSelected: {
    backgroundColor: '#101216',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  zone: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontFamily: 'Inter_500Medium',
  },
  zoneSelected: {
    color: '#00F0FF',
  },
  deviceTag: {
    color: '#8A8D93',
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
  },
  time: {
    color: '#8A8D93',
    fontSize: 13,
    fontFamily: 'Inter_600SemiBold',
    fontVariant: ['tabular-nums'],
  },
  empty: {
    color: '#8A8D93',
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    marginTop: 32,
    paddingHorizontal: 24,
  },
});
