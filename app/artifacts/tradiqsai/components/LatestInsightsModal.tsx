import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { customFetch } from '@workspace/api-client-react';
import colors from '@/constants/colors';

const c = colors.light;

/**
 * Same data the website blog renders: the shared API server's /api/blog
 * endpoint reads the exact same Supabase blog_posts table (published posts
 * only) as the website's own /api/posts route. The table's RLS has no public
 * SELECT policy, so the service-role API is the only sanctioned read path.
 */
const SITE_API = 'https://www.tradiqsai.com';

type BlogPost = {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
  author: string;
  cover_image: string | null;
  tags: string[];
  asset_class: string;
  category: string;
  ai_badge: string;
  upvotes: number;
  published_at: string;
};

const HTML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#039;': "'",
  '&#8216;': '‘',
  '&#8217;': '’',
  '&#8220;': '“',
  '&#8221;': '”',
  '&#8230;': '…',
  '&nbsp;': ' ',
};

/** Defensive numeric-entity decode — out-of-range code points become a space. */
function decodeEntity(_match: string, code: string): string {
  const n = Number(code);
  return Number.isInteger(n) && n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff)
    ? String.fromCodePoint(n)
    : ' ';
}

function stripHtml(html: string): string {
  // Block-level boundaries become paragraph breaks before tags are removed.
  let text = html.replace(/<\/(p|div|h[1-6]|li|blockquote|section|article)\s*>/gi, '\n\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<[^>]*>/g, ' ');
  for (const [entity, glyph] of Object.entries(HTML_ENTITIES)) {
    text = text.split(entity).join(glyph);
  }
  text = text.replace(/&#(\d+);/g, decodeEntity);
  return text
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Post bodies may be plain text or HTML; both render as clean paragraphs. */
function bodyParagraphs(content: string): string[] {
  const looksHtml = /<\/?[a-z][^>]*>/i.test(content);
  const text = looksHtml ? stripHtml(content) : content;
  return text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean);
}

async function fetchInsights(): Promise<BlogPost[]> {
  const data = await customFetch<{ posts?: BlogPost[] }>('/api/blog?limit=50');
  if (!Array.isArray(data?.posts)) throw new Error('Unexpected blog response');
  return data.posts;
}

/** Full body is only shipped by the single-slug query — fetched lazily on tap. */
async function fetchFullBody(slug: string): Promise<string> {
  const data = await customFetch<{ post?: { content?: string } }>(
    `/api/blog?slug=${encodeURIComponent(slug)}`,
  );
  if (typeof data?.post?.content !== 'string' || !data.post.content.trim()) {
    throw new Error('Full article unavailable');
  }
  return data.post.content;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function SkeletonCard() {
  return (
    <View style={s.article}>
      <View style={[s.skel, { height: 170 }]} />
      <View style={s.articleBody}>
        <View style={[s.skel, { width: 96, height: 11 }]} />
        <View style={[s.skel, { height: 18 }]} />
        <View style={[s.skel, { height: 13 }]} />
        <View style={[s.skel, { width: '68%', height: 13 }]} />
      </View>
    </View>
  );
}

/**
 * Latest Insights — the live TradiQs AI blog (same Supabase blog_posts data as
 * the website), rendered natively. Pull-to-refresh, skeleton loading, and a
 * full in-app reader for every article.
 */
export function LatestInsightsModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<BlogPost | null>(null);
  const [body, setBody] = useState<{ slug: string; text: string } | null>(null);
  const [bodyLoading, setBodyLoading] = useState(false);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setFailed(false);
    try {
      setPosts(await fetchInsights());
    } catch {
      setPosts([]);
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (visible) void load();
  }, [visible, load]);

  // Token per body request: stale fetches can never overwrite a newer article.
  const bodyRequest = useRef(0);

  const openArticle = (post: BlogPost) => {
    setSelected(post);
    setBody(null);
    const request = ++bodyRequest.current;
    setBodyLoading(true);
    fetchFullBody(post.slug)
      .then((text) => {
        if (bodyRequest.current === request) setBody({ slug: post.slug, text });
      })
      .catch(() => {
        if (bodyRequest.current === request) setBody({ slug: post.slug, text: '' });
      })
      .finally(() => {
        if (bodyRequest.current === request) setBodyLoading(false);
      });
  };

  const openOriginal = async (slug: string) => {
    const url = `${SITE_API}/blog/${slug}`;
    try {
      if (Platform.OS === 'web') {
        globalThis.open(url, '_blank');
        return;
      }
      await WebBrowser.openBrowserAsync(url, {
        presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
        controlsColor: '#00E5FF',
        dismissButtonStyle: 'close',
      });
    } catch {
      // External browser unavailable — the in-app reader already shows the article.
    }
  };

  const activeBody = selected && body?.slug === selected.slug ? body.text : null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={s.page}>
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} accessibilityLabel="Close insights">
            <Feather name="x" size={23} color={c.foreground} />
          </TouchableOpacity>
          <Text style={s.title}>Latest Insights</Text>
          <Feather name="book-open" size={20} color={c.primary} />
        </View>

        {selected ? (
          <ScrollView contentContainerStyle={s.content}>
            <View style={s.readerTop}>
              <TouchableOpacity onPress={() => setSelected(null)} accessibilityRole="button">
                <Text style={s.back}>‹ BACK TO INSIGHTS</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.original}
                onPress={() => void openOriginal(selected.slug)}
                accessibilityRole="link"
              >
                <Text style={s.originalText}>OPEN ORIGINAL ↗</Text>
              </TouchableOpacity>
            </View>

            {selected.cover_image ? (
              <Image
                source={{ uri: selected.cover_image }}
                style={s.readerHero}
                contentFit="cover"
                transition={150}
              />
            ) : null}

            <View style={s.metaRow}>
              <View style={s.badge}>
                <Text style={s.badgeText}>{selected.asset_class.toUpperCase()}</Text>
              </View>
              <Text style={s.date}>
                {selected.category} · {formatDate(selected.published_at)}
              </Text>
            </View>
            <Text style={s.readerTitle}>{selected.title}</Text>
            <Text style={s.byline}>By {selected.author}</Text>
            <View style={[s.aiPill, { alignSelf: 'flex-start' }]}>
              <Text style={s.aiPillText}>{selected.ai_badge || '⚡ AI INSIGHT'}</Text>
            </View>

            {bodyLoading ? (
              <View style={s.center}>
                <ActivityIndicator color={c.primary} />
                <Text style={s.muted}>Loading full article…</Text>
              </View>
            ) : activeBody ? (
              bodyParagraphs(activeBody).map((paragraph, i) => (
                <Text key={i} style={s.readerBody}>
                  {paragraph}
                </Text>
              ))
            ) : activeBody === '' ? (
              <>
                <Text style={s.readerBody}>{selected.excerpt}</Text>
                <View style={s.bodyError}>
                  <Feather name="alert-circle" size={14} color={c.mutedForeground} />
                  <Text style={s.bodyErrorText}>
                    The full article could not be loaded right now. Tap OPEN ORIGINAL to read it on the web.
                  </Text>
                </View>
              </>
            ) : (
              <Text style={s.readerBody}>{selected.excerpt}</Text>
            )}
          </ScrollView>
        ) : (
          <ScrollView
            contentContainerStyle={s.content}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  void load(true);
                }}
                tintColor={c.primary}
              />
            }
          >
            {loading ? (
              <>
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </>
            ) : failed ? (
              <TouchableOpacity onPress={() => void load()} style={s.center} accessibilityRole="button">
                <Feather name="wifi-off" size={24} color={c.mutedForeground} />
                <Text style={s.muted}>Insights are temporarily unavailable. Tap to retry.</Text>
              </TouchableOpacity>
            ) : !posts.length ? (
              <View style={s.center}>
                <Feather name="book-open" size={24} color={c.mutedForeground} />
                <Text style={s.muted}>No insights published yet. Pull down to refresh.</Text>
              </View>
            ) : (
              posts.map((post) => (
                <TouchableOpacity
                  key={post.id}
                  style={s.article}
                  onPress={() => openArticle(post)}
                  accessibilityRole="button"
                  accessibilityLabel={`Read: ${post.title}`}
                >
                  {post.cover_image ? (
                    <Image
                      source={{ uri: post.cover_image }}
                      style={s.thumbnail}
                      contentFit="cover"
                      transition={150}
                    />
                  ) : null}
                  <View style={s.articleBody}>
                    <View style={s.metaRow}>
                      <View style={s.badge}>
                        <Text style={s.badgeText}>{post.asset_class.toUpperCase()}</Text>
                      </View>
                      <Text style={s.date}>
                        {post.category} · {formatDate(post.published_at)}
                      </Text>
                    </View>
                    <Text style={s.headline}>{post.title}</Text>
                    {post.excerpt ? (
                      <Text numberOfLines={3} style={s.summary}>
                        {post.excerpt}
                      </Text>
                    ) : null}
                    <View style={s.metaRow}>
                      <View style={s.aiPill}>
                        <Text style={s.aiPillText}>{post.ai_badge || '⚡ AI INSIGHT'}</Text>
                      </View>
                      <Text style={s.upvotes}>▲ {post.upvotes}</Text>
                    </View>
                    <Text style={s.read}>READ ARTICLE →</Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: c.background },
  header: { padding: 18, paddingTop: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: c.border },
  title: { color: c.foreground, fontSize: 20, fontFamily: 'Inter_700Bold' },
  content: { padding: 18, gap: 16, paddingBottom: 38 },
  article: { backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 16, overflow: 'hidden' },
  thumbnail: { width: '100%', height: 170, backgroundColor: '#1B1E24' },
  articleBody: { padding: 16, gap: 10 },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  badge: { borderColor: `${c.primary}55`, borderWidth: 1, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 4, backgroundColor: `${c.primary}14` },
  badgeText: { color: c.primary, fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.8 },
  date: { color: c.mutedForeground, fontSize: 10, flexShrink: 1, textAlign: 'right' },
  headline: { color: c.foreground, fontSize: 17, lineHeight: 23, fontFamily: 'Inter_700Bold' },
  summary: { color: c.mutedForeground, fontSize: 13, lineHeight: 19 },
  byline: { color: c.mutedForeground, fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  aiPill: { borderRadius: 999, borderWidth: 1, borderColor: `${c.primary}4D`, backgroundColor: `${c.primary}1A`, paddingHorizontal: 10, paddingVertical: 4 },
  aiPillText: { color: c.primary, fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.6 },
  upvotes: { color: c.mutedForeground, fontSize: 11 },
  read: { color: c.primary, fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.7 },
  center: { alignItems: 'center', gap: 12, paddingVertical: 40 },
  muted: { color: c.mutedForeground, textAlign: 'center', fontSize: 12 },
  skel: { backgroundColor: '#1B1E24', borderRadius: 6 },
  back: { color: c.primary, fontSize: 11, fontFamily: 'Inter_700Bold' },
  readerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  readerHero: { width: '100%', height: 210, borderRadius: 14, backgroundColor: '#1B1E24' },
  readerTitle: { color: c.foreground, fontSize: 24, lineHeight: 31, fontFamily: 'Inter_700Bold' },
  readerBody: { color: '#C7CAD1', fontSize: 15, lineHeight: 24 },
  bodyError: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', borderWidth: 1, borderColor: c.border, borderRadius: 10, padding: 12, backgroundColor: c.card },
  bodyErrorText: { color: c.mutedForeground, fontSize: 12, lineHeight: 17, flex: 1 },
  original: { borderWidth: 1, borderColor: c.primary, borderRadius: 8, padding: 9, alignItems: 'center' },
  originalText: { color: c.primary, fontSize: 9, fontFamily: 'Inter_700Bold' },
});
