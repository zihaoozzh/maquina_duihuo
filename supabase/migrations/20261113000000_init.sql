-- Base de datos compartida de la tienda.
-- Una sola tienda: cualquier usuario con sesión iniciada (la cuenta de la tienda) puede leer y escribir.
-- El registro público de usuarios debe estar DESACTIVADO (Authentication → Sign In / Providers).

create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;

create table if not exists public.docs (
  id uuid primary key,
  supplier text not null default '',
  number text not null default '',
  date text not null default '',
  file_name text not null default '',
  source text not null default 'manual',
  created_at bigint not null,
  line_count integer not null default 0,
  total numeric not null default 0,
  deleted boolean not null default false,
  updated_at timestamptz not null default clock_timestamp()
);

create table if not exists public.lines (
  id uuid primary key,
  doc_id uuid not null,
  pos integer not null default 0,
  key text not null default '',
  ean text not null default '',
  ref text not null default '',
  description text not null default '',
  qty numeric,
  price numeric,
  discount numeric,
  total numeric,
  received numeric not null default 0,
  deleted boolean not null default false,
  updated_at timestamptz not null default clock_timestamp()
);

create table if not exists public.catalog (
  key text primary key,
  ean text not null default '',
  name text not null default '',
  pvp numeric,
  cost numeric,
  stock numeric,
  ref text not null default '',
  import_id text not null default '',
  updated_at timestamptz not null default clock_timestamp()
);

create table if not exists public.meta (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default clock_timestamp()
);

create index if not exists docs_updated_at on public.docs (updated_at);
create index if not exists lines_updated_at on public.lines (updated_at);
create index if not exists lines_doc_id on public.lines (doc_id);
create index if not exists catalog_import_id on public.catalog (import_id);

do $$
declare t text;
begin
  foreach t in array array['docs', 'lines', 'catalog', 'meta'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before insert or update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists tienda on public.%I', t);
    execute format('create policy tienda on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
