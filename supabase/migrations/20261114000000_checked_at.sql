-- 对货: momento en que se dio por comprobada cada línea (null = sin comprobar)
alter table public.lines add column if not exists checked_at bigint;
