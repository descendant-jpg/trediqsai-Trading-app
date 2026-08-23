import { customFetch } from "@workspace/api-client-react";

export type AdminMetrics = {
  waitlistCount: number;
  subscriberCount: number;
  insightsCount: number;
  supportTicketCount: number;
  recentPosts: Array<{ id: number; title: string; created_at: string }>;
};

export async function fetchAdminMetrics(): Promise<AdminMetrics> {
  const response = await customFetch<{
    metrics: { waitlist: number; subscribers: number; insights: number; tickets: number };
    recentPosts: AdminMetrics["recentPosts"];
  }>("/api/admin/dashboard");
  return {
    waitlistCount: response.metrics.waitlist,
    subscriberCount: response.metrics.subscribers,
    insightsCount: response.metrics.insights,
    supportTicketCount: response.metrics.tickets,
    recentPosts: response.recentPosts,
  };
}

// ─── Posts ────────────────────────────────────────────────────────────────────

export type Post = {
  id: number;
  title: string;
  slug?: string;
  excerpt?: string;
  cover_image?: string | null;
  content: string;
  asset_class?: string;
  category: string;
  tags?: string[];
  status?: "draft" | "published" | "archived";
  created_at: string;
  updated_at?: string;
};

export type PostPayload = {
  title: string;
  slug?: string;
  excerpt?: string;
  cover_image?: string | null;
  content: string;
  asset_class?: string;
  category: string;
  tags?: string[];
  status?: Post["status"];
};

export type PostsResponse = { posts: Post[] } | Post[];

export async function fetchPosts(): Promise<Post[]> {
  const data = await customFetch<PostsResponse>("/api/admin/posts");
  return Array.isArray(data) ? data : (data as { posts: Post[] }).posts ?? [];
}

export async function fetchPost(id: number | string): Promise<Post> {
  const response = await customFetch<{ post: Post }>(`/api/admin/posts/${id}`);
  return response.post;
}

export async function createPost(body: PostPayload): Promise<Post> {
  const response = await customFetch<{ post: Post }>("/api/admin/posts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.post;
}

export async function updatePost(
  id: number | string,
  body: PostPayload,
): Promise<Post> {
  const response = await customFetch<{ post: Post }>(`/api/admin/posts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.post;
}

// ─── Taxonomy ─────────────────────────────────────────────────────────────────

export type TaxonomyKind = "category" | "tag";

export const FALLBACK_CATEGORIES = [
  "Discussion",
  "Analysis",
  "News",
  "Strategy",
  "Psychology",
  "Brokers",
  "Signals",
  "Education",
  "Results",
];
export const FALLBACK_TAGS = ["Analysis", "News", "Educational"];

export async function fetchTaxonomy(kind: TaxonomyKind): Promise<string[]> {
  const response = await customFetch<{
    terms: Array<{ name: string; kind: TaxonomyKind }>;
  }>(
    `/api/admin/taxonomy?kind=${kind}`,
  );
  const names = Array.isArray(response.terms)
    ? response.terms
        .filter((term) => term.kind === kind && typeof term.name === "string")
        .map((term) => term.name)
    : [];
  if (names.length > 0) {
    return names;
  }
  return kind === "category" ? FALLBACK_CATEGORIES : FALLBACK_TAGS;
}

// ─── Waitlist ─────────────────────────────────────────────────────────────────

export type WaitlistEntry = {
  id: number | string;
  email: string;
  name?: string;
  created_at: string;
};

export type WaitlistResponse = { entries: WaitlistEntry[] } | WaitlistEntry[];

export async function fetchWaitlist(): Promise<WaitlistEntry[]> {
  const data = await customFetch<WaitlistResponse>("/api/admin/waitlist");
  return Array.isArray(data)
    ? data
    : (data as { entries: WaitlistEntry[] }).entries ?? [];
}

export async function deleteWaitlistEntry(id: number | string): Promise<void> {
  await customFetch<unknown>(`/api/admin/waitlist/${id}`, { method: "DELETE" });
}

// ─── Help-desk messages ───────────────────────────────────────────────────────

export type HelpMessage = {
  id: number | string;
  subject?: string;
  body?: string;
  message?: string;
  email?: string;
  status: string;
  created_at: string;
};

export type MessagesResponse = { messages: HelpMessage[] } | HelpMessage[];

export async function fetchMessages(): Promise<HelpMessage[]> {
  const data = await customFetch<MessagesResponse>("/api/admin/messages");
  return Array.isArray(data)
    ? data
    : (data as { messages: HelpMessage[] }).messages ?? [];
}

export async function resolveMessage(id: number | string): Promise<HelpMessage> {
  const response = await customFetch<{ message: HelpMessage }>(`/api/admin/messages/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: "resolved" }),
  });
  return response.message;
}

// ─── Signals ─────────────────────────────────────────────────────────────────

export type SignalDirection = "BUY" | "SELL";

export type BroadcastSignalBody = {
  asset: string;
  direction: SignalDirection;
  entry: number;
  takeProfit: number;
  stopLoss: number;
  status: "active";
  isPremium: true;
};

export async function broadcastSignal(body: BroadcastSignalBody): Promise<unknown> {
  return customFetch<unknown>("/api/signals/broadcast", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
