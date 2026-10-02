-- Migration: 202610020021_purge_demo_data_and_orders.sql
-- Description: Completely purge experimental/demo menu products, categories, options,
--              test orders/invoices, order events, and test staff accounts.
--              Provides a permanent, secure RPC for the owner to purge test data anytime.

-- 1. Immediate Purge of all test orders and order items
delete from public.order_status_events;
delete from public.order_items;
delete from public.orders;

-- 2. Immediate Purge of all demo menu option items, option groups, products, and categories
delete from public.product_option_items;
delete from public.product_option_groups;
delete from public.menu_products;
delete from public.menu_categories;

-- 3. Immediate Purge of test staff profiles (preserving the Owner account)
delete from public.staff_profiles
where role not in ('owner');

-- 4. Create secure RPC for the Owner to purge test data anytime from the Admin UI
create or replace function public.admin_purge_test_data(
  p_purge_menu boolean default true,
  p_purge_orders boolean default true,
  p_purge_staff boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_restaurant_id uuid;
  v_is_owner boolean;
  v_deleted_orders integer := 0;
  v_deleted_products integer := 0;
  v_deleted_categories integer := 0;
  v_deleted_staff integer := 0;
begin
  v_uid := (select auth.uid());
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'NOT_AUTHENTICATED', 'message', 'يجب تسجيل الدخول أولاً.');
  end if;

  -- Verify caller is active Owner
  select restaurant_id, (role = 'owner')
    into v_restaurant_id, v_is_owner
  from public.staff_profiles
  where user_id = v_uid and is_active;

  if v_restaurant_id is null or not coalesce(v_is_owner, false) then
    return jsonb_build_object('success', false, 'error', 'NOT_AUTHORIZED', 'message', 'صلاحية تصفية البيانات مقتصرة حصرياً على حساب المالك (Owner).');
  end if;

  -- 1. Purge orders if requested
  if p_purge_orders then
    delete from public.order_status_events;
    delete from public.order_items;
    delete from public.orders;
    get diagnostics v_deleted_orders = row_count;
  end if;

  -- 2. Purge menu if requested
  if p_purge_menu then
    delete from public.product_option_items;
    delete from public.product_option_groups;
    delete from public.menu_products where restaurant_id = v_restaurant_id;
    get diagnostics v_deleted_products = row_count;
    delete from public.menu_categories where restaurant_id = v_restaurant_id;
    get diagnostics v_deleted_categories = row_count;
  end if;

  -- 3. Purge test staff if requested (preserving owners)
  if p_purge_staff then
    delete from public.staff_profiles
    where restaurant_id = v_restaurant_id
      and role not in ('owner');
    get diagnostics v_deleted_staff = row_count;
  end if;

  return jsonb_build_object(
    'success', true,
    'message', 'تمت تصفية البيانات التجريبية بنجاح.',
    'deleted_orders', v_deleted_orders,
    'deleted_products', v_deleted_products,
    'deleted_categories', v_deleted_categories,
    'deleted_staff', v_deleted_staff
  );
end;
$$;

revoke all on function public.admin_purge_test_data(boolean, boolean, boolean) from public, anon;
grant execute on function public.admin_purge_test_data(boolean, boolean, boolean) to authenticated;

comment on function public.admin_purge_test_data(boolean, boolean, boolean) is
'Secure owner-only RPC to purge test orders, menu items, or non-owner staff accounts for a clean production slate.';
