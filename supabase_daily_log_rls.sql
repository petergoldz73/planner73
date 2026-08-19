-- NutriPlanner — Onda 9: garantir RLS de escrita em daily_log
-- ------------------------------------------------------------
-- As políticas de INSERT e UPDATE de daily_log JÁ EXISTEM em
-- supabase_setup.sql. Este arquivo é apenas defensivo/idempotente:
-- rode-o no SQL editor do Supabase se, ao salvar o "Comi hoje", você
-- receber erro de RLS (ex.: "new row violates row-level security policy").
-- Ele pode ser rodado com segurança quantas vezes quiser.

-- garante RLS habilitado (no-op se já estiver)
alter table public.daily_log enable row level security;

-- INSERT: dono insere apenas as próprias linhas
drop policy if exists "daily_log: dono insere as próprias linhas" on public.daily_log;
create policy "daily_log: dono insere as próprias linhas"
  on public.daily_log
  for insert
  with check (auth.uid() = user_id);

-- UPDATE: dono atualiza apenas as próprias linhas
-- (necessário porque o upsert com onConflict vira UPDATE quando a linha do dia já existe)
drop policy if exists "daily_log: dono atualiza as próprias linhas" on public.daily_log;
create policy "daily_log: dono atualiza as próprias linhas"
  on public.daily_log
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- conferência: lista as políticas atuais de daily_log
-- select policyname, cmd from pg_policies where tablename = 'daily_log';
