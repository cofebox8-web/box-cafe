-- Publish catalog and service-point changes to Supabase Realtime.
-- Customer and roadside screens still refetch through the validated menu RPC;
-- Realtime is the low-latency trigger and visibility polling is the recovery path.

do $$
declare
  v_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach v_table in array array[
      'menu_categories',
      'menu_products',
      'product_option_groups',
      'product_option_items',
      'car_service_points'
    ] loop
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = v_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', v_table);
      end if;
    end loop;
  end if;
end
$$;
