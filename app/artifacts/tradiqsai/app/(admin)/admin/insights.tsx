import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  createAdminInsight,
  fetchAdminInsights,
  type AdminInsight,
} from '@/services/adminService';

const emptyDraft = { title: '', summary: '', content: '' };

export default function AdminInsights() {
  const [insights, setInsights] = useState<AdminInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draftOpen, setDraftOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDraft);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setInsights(await fetchAdminInsights());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load insights.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveDraft() {
    if (!draft.title.trim() || !draft.content.trim()) {
      setError('A title and draft body are required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await createAdminInsight({
        title: draft.title.trim(),
        summary: draft.summary.trim(),
        content: draft.content.trim(),
      });
      setDraft(emptyDraft);
      setDraftOpen(false);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to create this draft.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {loading ? (
        <ActivityIndicator color="#00F0FF" style={styles.loader} />
      ) : (
        <FlatList
          data={insights}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.header}>
              <Text style={styles.title}>Editorial pipeline</Text>
              <Text style={styles.subtitle}>Review every market insight and capture a new idea while it is fresh.</Text>
              {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
            </View>
          }
          ListEmptyComponent={<Text style={styles.empty}>No market insights yet.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.category}>{item.category || 'MARKET INSIGHT'}</Text>
                <Text style={[styles.status, item.status === 'published' && styles.published]}>{item.status || 'draft'}</Text>
              </View>
              <Text style={styles.cardTitle}>{item.title}</Text>
              {!!item.excerpt && <Text numberOfLines={2} style={styles.excerpt}>{item.excerpt}</Text>}
              <Text style={styles.date}>{formatDate(item.created_at)}</Text>
            </View>
          )}
          refreshing={loading}
          onRefresh={() => void load()}
        />
      )}

      <Pressable accessibilityLabel="Create market insight draft" onPress={() => { setError(''); setDraftOpen(true); }} style={({ pressed }) => [styles.fab, pressed && styles.pressed]}>
        <Feather name="plus" size={25} color="#071014" />
      </Pressable>

      <Modal visible={draftOpen} transparent animationType="slide" onRequestClose={() => setDraftOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={() => setDraftOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <View>
                <Text style={styles.sheetEyebrow}>QUICK DRAFT</Text>
                <Text style={styles.sheetTitle}>New market insight</Text>
              </View>
              <Pressable onPress={() => setDraftOpen(false)} style={styles.close}><Feather name="x" size={20} color="#FFFFFF" /></Pressable>
            </View>
            <DraftInput label="TITLE" value={draft.title} onChangeText={(title) => setDraft({ ...draft, title })} placeholder="Gold reclaims London range" />
            <DraftInput label="SUMMARY" value={draft.summary} onChangeText={(summary) => setDraft({ ...draft, summary })} placeholder="One-line editorial summary" />
            <DraftInput label="BODY" value={draft.content} onChangeText={(content) => setDraft({ ...draft, content })} placeholder="Capture the market thesis…" multiline />
            {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
            <Pressable disabled={saving} onPress={() => void saveDraft()} style={({ pressed }) => [styles.save, (pressed || saving) && styles.pressed]}>
              {saving ? <ActivityIndicator color="#071014" /> : <Text style={styles.saveText}>SAVE DRAFT</Text>}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function DraftInput({
  label,
  multiline,
  ...props
}: {
  label: string;
  multiline?: boolean;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        {...props}
        multiline={multiline}
        placeholderTextColor="#565A63"
        style={[styles.input, multiline && styles.bodyInput]}
      />
    </View>
  );
}

function formatDate(value: string) {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 'Recently added' : new Date(parsed).toLocaleDateString();
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0A0B0E' },
  loader: { flex: 1 },
  list: { padding: 20, paddingBottom: 110 },
  header: { marginBottom: 22 },
  title: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 28 },
  subtitle: { color: '#8A8D93', fontFamily: 'Inter_400Regular', fontSize: 14, lineHeight: 21, marginTop: 8 },
  error: { color: '#FF7676', fontFamily: 'Inter_500Medium', fontSize: 12, lineHeight: 18, marginTop: 12 },
  empty: { color: '#777B84', textAlign: 'center', marginTop: 80, fontFamily: 'Inter_500Medium' },
  card: { borderRadius: 18, borderWidth: 1, borderColor: '#22252A', backgroundColor: '#121419', padding: 17, marginBottom: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  category: { color: '#00F0FF', fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.3 },
  status: { color: '#9B7BFF', backgroundColor: 'rgba(176,38,255,0.12)', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 5, fontFamily: 'Inter_600SemiBold', fontSize: 9, textTransform: 'uppercase' },
  published: { color: '#2ECA8B', backgroundColor: 'rgba(46,202,139,0.1)' },
  cardTitle: { color: '#FFFFFF', fontFamily: 'Inter_600SemiBold', fontSize: 16, lineHeight: 23, marginTop: 14 },
  excerpt: { color: '#81858E', fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20, marginTop: 7 },
  date: { color: '#555963', fontFamily: 'Inter_500Medium', fontSize: 10, marginTop: 15 },
  fab: { position: 'absolute', right: 22, bottom: 24, width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: '#00F0FF', shadowColor: '#00F0FF', shadowOpacity: 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 7 }, elevation: 7 },
  pressed: { opacity: 0.65, transform: [{ scale: 0.98 }] },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.74)' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderBottomWidth: 0, borderColor: '#282C33', backgroundColor: '#111318', paddingHorizontal: 20, paddingTop: 10, paddingBottom: Platform.OS === 'ios' ? 34 : 24 },
  handle: { width: 42, height: 4, borderRadius: 2, backgroundColor: '#353942', alignSelf: 'center', marginBottom: 18 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  sheetEyebrow: { color: '#00F0FF', fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.5 },
  sheetTitle: { color: '#FFFFFF', fontFamily: 'Inter_700Bold', fontSize: 22, marginTop: 5 },
  close: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: '#20232A' },
  field: { marginBottom: 13 },
  label: { color: '#71757E', fontFamily: 'Inter_700Bold', fontSize: 9, letterSpacing: 1.3, marginBottom: 7 },
  input: { borderRadius: 13, borderWidth: 1, borderColor: '#292D34', backgroundColor: '#0A0B0E', color: '#FFFFFF', fontFamily: 'Inter_400Regular', fontSize: 14, paddingHorizontal: 14, paddingVertical: 12 },
  bodyInput: { minHeight: 92, textAlignVertical: 'top' },
  save: { minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#00F0FF', marginTop: 4 },
  saveText: { color: '#071014', fontFamily: 'Inter_700Bold', fontSize: 12, letterSpacing: 1.2 },
});