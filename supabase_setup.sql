-- NutriPlanner — Onda 7: fundação Supabase
-- Rode este arquivo inteiro no SQL editor do seu projeto Supabase.
-- Cobre apenas schema + RLS. Login (Google) e telas de histórico vêm em ondas futuras.

-- ============================================================
-- profiles
-- ============================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: dono lê o próprio"
  on public.profiles
  for select
  using (auth.uid() = id);

create policy "profiles: dono atualiza o próprio"
  on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- ============================================================
-- daily_log
-- ============================================================
create table if not exists public.daily_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  log_date date not null,
  items jsonb not null default '[]'::jsonb,
  score jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, log_date)
);

alter table public.daily_log enable row level security;

create policy "daily_log: dono seleciona as próprias linhas"
  on public.daily_log
  for select
  using (auth.uid() = user_id);

create policy "daily_log: dono insere as próprias linhas"
  on public.daily_log
  for insert
  with check (auth.uid() = user_id);

create policy "daily_log: dono atualiza as próprias linhas"
  on public.daily_log
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "daily_log: dono apaga as próprias linhas"
  on public.daily_log
  for delete
  using (auth.uid() = user_id);

-- mantém updated_at em dia a cada alteração
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists daily_log_set_updated_at on public.daily_log;
create trigger daily_log_set_updated_at
  before update on public.daily_log
  for each row
  execute function public.set_updated_at();

-- ============================================================
-- feed_content
-- ============================================================
create table if not exists public.feed_content (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.feed_content enable row level security;

-- leitura pública (inclusive anônima) apenas do conteúdo ativo
create policy "feed_content: leitura pública do conteúdo ativo"
  on public.feed_content
  for select
  using (active = true);

-- nenhuma policy de insert/update/delete é criada de propósito:
-- com RLS habilitado e sem policy correspondente, o client (anon/authenticated)
-- não consegue escrever nessa tabela. Escrita fica só pela service_role
-- (painel Supabase / futura rotina admin), nunca pelo app.
