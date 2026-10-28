-- Painel da Vida: banco de dados no Supabase
-- Cole tudo isto em: Supabase > SQL Editor > New query > Run.
--
-- Uma tabela só guarda todos os registros do app (dias, tarefas, treinos,
-- vídeos, academias, planos...). Cada linha pertence a um usuário, e as
-- regras de acesso (RLS) garantem que cada pessoa só lê e escreve as próprias
-- linhas. Sem login, ninguém lê nada.

create table if not exists public.docs (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  colecao    text        not null check (char_length(colecao) between 1 and 60),
  id         text        not null check (char_length(id) between 1 and 120),
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, colecao, id)
);

-- Limite de tamanho por registro (cerca de 64 KB), para ninguém lotar o banco.
alter table public.docs drop constraint if exists docs_data_tamanho;
alter table public.docs add constraint docs_data_tamanho check (pg_column_size(data) < 65536);

create index if not exists docs_user_colecao on public.docs (user_id, colecao);

-- Atualiza updated_at a cada mudança.
create or replace function public.docs_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists docs_touch on public.docs;
create trigger docs_touch before update on public.docs
  for each row execute function public.docs_touch();

-- Regras de acesso: cada um só mexe nas próprias linhas.
alter table public.docs enable row level security;
alter table public.docs force row level security;

drop policy if exists "docs: ler os proprios"    on public.docs;
drop policy if exists "docs: criar os proprios"  on public.docs;
drop policy if exists "docs: editar os proprios" on public.docs;
drop policy if exists "docs: apagar os proprios" on public.docs;

create policy "docs: ler os proprios" on public.docs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "docs: criar os proprios" on public.docs
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "docs: editar os proprios" on public.docs
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "docs: apagar os proprios" on public.docs
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Visitantes sem login não têm acesso nenhum à tabela.
revoke all on public.docs from anon;
grant select, insert, update, delete on public.docs to authenticated;
-- TRUNCATE ignora as regras de acesso: ninguém pelo app pode usar.
revoke truncate, references, trigger on public.docs from authenticated;

-- Atualização em tempo real entre celular e computador.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'docs'
  ) then
    alter publication supabase_realtime add table public.docs;
  end if;
end $$;
