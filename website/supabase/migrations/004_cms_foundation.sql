-- CMS Foundation: blog_posts, contact_messages updates, comments
-- contact_messages table (used by /api/contact already, add status column if absent)

-- ---------------------------------------------------------------------------
-- blog_posts
-- ---------------------------------------------------------------------------
create table if not exists blog_posts (
  id          bigint generated always as identity primary key,
  title       text        not null,
  slug        text        not null,
  excerpt     text        not null default '',
  content     text        not null default '',
  asset_class text        not null default 'Forex' check (asset_class in ('Forex', 'Crypto', 'Stocks')),
  category    text        not null default 'Analysis',
  ai_badge    text        not null default '',
  upvotes     integer     not null default 0,
  status      text        not null default 'draft' check (status in ('draft', 'published', 'archived')),
  author      text        not null default '',
  cover_image text,
  tags        text[]      not null default '{}',
  published_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint blog_posts_slug_unique unique (slug)
);

-- Only the service role can write; no public access
alter table blog_posts enable row level security;

create index if not exists blog_posts_status_published_at_idx
  on blog_posts (status, published_at desc);

create index if not exists blog_posts_slug_idx
  on blog_posts (slug);

-- ---------------------------------------------------------------------------
-- contact_messages: add status column if the table already exists from /api/contact
-- ---------------------------------------------------------------------------
create table if not exists contact_messages (
  id         bigint generated always as identity primary key,
  name       text        not null,
  email      text        not null,
  message    text        not null,
  status     text        not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now()
);

-- In case table existed before this migration without the status column,
-- add it safely.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name = 'contact_messages' and column_name = 'status'
  ) then
    alter table contact_messages
        add column status text not null default 'open'
        check (status in ('open', 'resolved'));
  end if;
end
$$;

alter table contact_messages enable row level security;

create index if not exists contact_messages_status_created_at_idx
  on contact_messages (status, created_at desc);

-- ---------------------------------------------------------------------------
-- comments
-- ---------------------------------------------------------------------------
create table if not exists comments (
  id          bigint generated always as identity primary key,
  post_id     bigint      not null references blog_posts (id) on delete cascade,
  author_name text        not null,
  author_email text       not null,
  body        text        not null,
  status      text        not null default 'pending' check (status in ('pending', 'approved', 'spam', 'deleted')),
  created_at  timestamptz not null default now()
);

alter table comments enable row level security;

create index if not exists comments_post_id_status_idx
  on comments (post_id, status);

create index if not exists comments_status_created_at_idx
  on comments (status, created_at desc);
