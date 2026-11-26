-- Multi-tienda: cada cuenta (auth.uid()) es una tienda y solo ve sus propios datos.
-- Las filas que ya existen pasan a la única cuenta actual. Si hubiera más de una cuenta con datos
-- sin asignar, se aborta en vez de adivinar a quién pertenecen.
-- Las cuentas se crean a mano (Authentication → Users); el registro público debe seguir desactivado.

do $$
declare
  t text;
  uid uuid;
  n integer;
  pending boolean := false;
begin
  foreach t in array array['docs', 'lines', 'catalog', 'meta'] loop
    execute format('alter table public.%I add column if not exists shop_id uuid', t);
    execute format('select exists (select 1 from public.%I where shop_id is null)', t) into pending;
    if pending then
      select count(*) into n from auth.users;
      if n <> 1 then
        raise exception 'Hay % cuentas y datos sin tienda asignada: asigna shop_id a mano antes de migrar', n;
      end if;
      select id into uid from auth.users;
      execute format('update public.%I set shop_id = %L where shop_id is null', t, uid);
    end if;
    execute format('alter table public.%I alter column shop_id set not null', t);
    execute format('alter table public.%I alter column shop_id set default auth.uid()', t);
  end loop;
end $$;

-- Mismo código de barras / misma clave en tiendas distintas: la clave pasa a incluir la tienda
alter table public.catalog drop constraint if exists catalog_pkey;
alter table public.catalog add primary key (shop_id, key);
alter table public.meta drop constraint if exists meta_pkey;
alter table public.meta add primary key (shop_id, key);

create index if not exists docs_shop_id on public.docs (shop_id);
create index if not exists lines_shop_id on public.lines (shop_id);
create index if not exists catalog_shop_id on public.catalog (shop_id);

do $$
declare t text;
begin
  foreach t in array array['docs', 'lines', 'catalog', 'meta'] loop
    execute format('drop policy if exists tienda on public.%I', t);
    execute format(
      'create policy tienda on public.%I for all to authenticated using (shop_id = (select auth.uid())) with check (shop_id = (select auth.uid()))',
      t
    );
  end loop;
end $$;
