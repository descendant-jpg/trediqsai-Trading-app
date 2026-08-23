-- Apply manually in the Supabase SQL editor after prior migrations.
create table if not exists public.tradiqs_articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text not null,
  content text not null,
  category text not null default 'all' check (category in ('crypto','forex','stocks','all')),
  author text not null default 'TradiQs AI',
  image_url text,
  created_at timestamptz not null default now()
);
alter table public.tradiqs_articles enable row level security;
create policy "public_read_tradiqs_articles" on public.tradiqs_articles for select using (true);
insert into public.tradiqs_articles (title,summary,content,category)
select 'Reading market structure across sessions','A TradiQs AI market primer.','Educational article placeholder.','forex'
where not exists (select 1 from public.tradiqs_articles);