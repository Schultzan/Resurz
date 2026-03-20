-- Run in Supabase SQL Editor (or supabase db push). MVP: open RLS for anon — use auth policies in production.

create table if not exists public.resurz_workspace (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create or replace function public.resurz_workspace_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_resurz_workspace_updated on public.resurz_workspace;
create trigger trg_resurz_workspace_updated
  before update on public.resurz_workspace
  for each row
  execute function public.resurz_workspace_set_updated_at();

alter table public.resurz_workspace enable row level security;

drop policy if exists "resurz_workspace_anon_all" on public.resurz_workspace;
create policy "resurz_workspace_anon_all"
  on public.resurz_workspace
  for all
  using (true)
  with check (true);
