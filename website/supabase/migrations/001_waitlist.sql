-- Waitlist table for TradiQs AI launch leads
create table if not exists waitlist (
  id         bigint generated always as identity primary key,
  email      text not null,
  created_at timestamptz not null default now(),
  constraint waitlist_email_unique unique (email)
);

-- Only the service role (server-side) can insert; no public access
alter table waitlist enable row level security;

-- No RLS policies added here intentionally.
-- All writes go through the /api/waitlist server route using the service role key,
-- which bypasses RLS, keeping credentials out of the browser.
