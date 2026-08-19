import { customFetch } from '@workspace/api-client-react';

export type AdminMetrics = {
  waitlistCount: number;
  subscriberCount: number;
  insightsCount: number;
  supportTicketCount: number;
  recentPosts: AdminRecentPost[];
};

export type AdminRecentPost = {
  id: string | number;
  title: string;
  created_at: string;
};

export type AdminInsight = {
  id: string | number;
  title: string;
  excerpt: string;
  category?: string | null;
  status: string;
  created_at: string;
};

export type WaitlistLead = {
  id: string | number;
  name: string | null;
  email: string;
  status: string | null;
  created_at: string;
};

export async function fetchAdminMetrics() {
  const data = await customFetch<{
    waitlistCount: number;
    subscriberCount: number;
    blogPostCount: number;
    supportTicketCount: number;
    recentPosts: AdminRecentPost[];
  }>(
    '/api/mobile-admin/dashboard',
  );
  return {
    waitlistCount: data.waitlistCount,
    subscriberCount: data.subscriberCount,
    insightsCount: data.blogPostCount,
    supportTicketCount: data.supportTicketCount,
    recentPosts: data.recentPosts,
  };
}

export async function fetchAdminInsights() {
  const data = await customFetch<{ posts: AdminInsight[] }>('/api/mobile-admin/insights');
  return data.posts;
}

export async function createAdminInsight(input: {
  title: string;
  summary: string;
  content: string;
}) {
  const data = await customFetch<{ draft: AdminInsight }>('/api/mobile-admin/insights', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  return data.draft;
}

export async function fetchWaitlistLeads() {
  const data = await customFetch<{ leads: WaitlistLead[] }>('/api/mobile-admin/waitlist');
  return data.leads;
}

export async function deleteWaitlistLead(id: string | number) {
  await customFetch(`/api/mobile-admin/waitlist/${encodeURIComponent(String(id))}`, {
    method: 'DELETE',
  });
}