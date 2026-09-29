-- BOX COFE migration 019
-- Order codes were generated as a daily counter (B-101, B-102, ...), while
-- orders_order_code_key enforces uniqueness across the entire orders table.
-- A single database sequence keeps the familiar code format and guarantees
-- uniqueness across dates, branches, and concurrent waiter submissions.

create sequence if not exists public.order_code_seq
  as bigint
  minvalue 101
  start with 101
  no cycle;

do $$
declare
  v_existing_next bigint;
  v_max_order_code bigint;
  v_next bigint;
begin
  select coalesce(max(
    case
      when order_code ~ '^B-[0-9]+$' then substring(order_code from 3)::bigint
      else null
    end
  ), 100) + 1
    into v_max_order_code
  from public.orders;

  select last_value + case when is_called then 1 else 0 end
    into v_existing_next
  from public.order_code_seq;

  v_next := greatest(v_existing_next, v_max_order_code, 101);
  perform pg_catalog.setval('public.order_code_seq'::regclass, v_next, false);
end;
$$;

revoke all on sequence public.order_code_seq from public, anon, authenticated;

-- Keep the existing server-side price, option, and order validation unchanged;
-- only replace the unsafe daily MAX()+1 order-code generator.
create or replace function public.place_customer_order(
  p_branch_slug text,
  p_qr_token uuid,
  p_items jsonb,
  p_customer_name text default null,
  p_vehicle_note text default null,
  p_order_note text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_service_point record;
  v_existing_order record;
  v_item record;
  v_product record;
  v_option record;
  v_item_quantity integer;
  v_item_unit_price numeric(12, 2);
  v_item_line_total numeric(12, 2);
  v_selected_options jsonb;
  v_selected_option_ids uuid[];
  v_group record;
  v_selected_in_group_count integer;
  v_order_subtotal numeric(12, 2) := 0;
  v_order_total numeric(12, 2) := 0;
  v_order_id uuid;
  v_order_code text;
  v_tracking_token uuid;
  v_items_count integer := 0;
  v_customer_name text;
  v_vehicle_note text;
  v_order_note text;
  v_clean_idempotency_key text;
  v_order_items jsonb := '[]'::jsonb;
  v_selected_option_count integer := 0;
  v_valid_option_count integer := 0;
begin
  -- 1. Input sanitization & boundary checks
  v_customer_name := nullif(trim(p_customer_name), '');
  if v_customer_name is not null and char_length(v_customer_name) > 60 then
    v_customer_name := substr(v_customer_name, 1, 60);
  end if;

  v_vehicle_note := nullif(trim(p_vehicle_note), '');
  if v_vehicle_note is not null and char_length(v_vehicle_note) > 80 then
    v_vehicle_note := substr(v_vehicle_note, 1, 80);
  end if;

  v_order_note := nullif(trim(p_order_note), '');
  if v_order_note is not null and char_length(v_order_note) > 200 then
    v_order_note := substr(v_order_note, 1, 200);
  end if;

  v_clean_idempotency_key := nullif(trim(p_idempotency_key), '');
  if v_clean_idempotency_key is not null and char_length(v_clean_idempotency_key) > 120 then
    return jsonb_build_object('success', false, 'error', 'INVALID_IDEMPOTENCY_KEY', 'message', 'تعذر التحقق من الطلب. أعد المحاولة.');
  end if;
  if v_clean_idempotency_key is not null
     and v_clean_idempotency_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    return jsonb_build_object('success', false, 'error', 'INVALID_IDEMPOTENCY_KEY', 'message', 'تعذر التحقق من الطلب. أعد المحاولة.');
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return jsonb_build_object('success', false, 'error', 'INVALID_CART', 'message', 'تعذر قراءة السلة. أعد تحميل المنيو وحاول مجدداً.');
  end if;

  if jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('success', false, 'error', 'EMPTY_CART', 'message', 'السلة فارغة. يرجى اختيار صنف واحد على الأقل.');
  end if;

  if jsonb_array_length(p_items) > 25 then
    return jsonb_build_object('success', false, 'error', 'CART_TOO_LARGE', 'message', 'تم تجاوز الحد الأقصى للأصناف في الطلب الواحد.');
  end if;

  -- 2. Validate branch and service point via QR token
  select csp.id as service_point_id, csp.label as service_point_label,
         b.id as branch_id, b.name as branch_name, r.id as restaurant_id, r.currency_code
  into v_service_point
  from public.car_service_points csp
  join public.branches b on b.id = csp.branch_id
  join public.restaurants r on r.id = b.restaurant_id
  where csp.qr_token = p_qr_token
    and b.slug = p_branch_slug
    and csp.is_active = true
    and b.is_active = true
    and r.is_active = true;

  if not found then
    return jsonb_build_object('success', false, 'error', 'INVALID_SERVICE_POINT', 'message', 'نقطة الخدمة أو الفرع غير صالحة أو مغلقة.');
  end if;

  -- Serialize retries with the same key before checking for an existing order.
  if v_clean_idempotency_key is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_clean_idempotency_key, 0));
  end if;

  -- 3. Idempotency Check: Return existing order if already submitted
  if v_clean_idempotency_key is not null then
    select o.id, o.order_code, o.total, o.tracking_token, o.created_at, o.status,
           b.name as branch_name, r.currency_code, csp.label as service_point_label,
           coalesce(sum(oi.quantity), 0) as items_count
    into v_existing_order
    from public.orders o
    join public.branches b on b.id = o.branch_id
    join public.restaurants r on r.id = b.restaurant_id
    left join public.car_service_points csp on csp.id = o.service_point_id
    left join public.order_items oi on oi.order_id = o.id
    where o.idempotency_key = v_clean_idempotency_key
      and o.branch_id = v_service_point.branch_id
    group by o.id, o.order_code, o.total, o.tracking_token, o.created_at, o.status, b.name, r.currency_code, csp.label;

    if found then
      return jsonb_build_object(
        'success', true,
        'is_duplicate', true,
        'order_code', v_existing_order.order_code,
        'total', v_existing_order.total,
        'currency_code', v_existing_order.currency_code,
        'tracking_token', v_existing_order.tracking_token,
        'status', v_existing_order.status,
        'created_at', v_existing_order.created_at,
        'items_count', v_existing_order.items_count,
        'service_point_label', v_existing_order.service_point_label,
        'branch_name', v_existing_order.branch_name
      );
    end if;
  end if;

  -- 4. Allocate a globally unique, concurrency-safe order code.
  v_order_code := 'B-' || pg_catalog.nextval('public.order_code_seq'::regclass)::text;
  v_order_id := gen_random_uuid();
  v_tracking_token := gen_random_uuid();

  -- 5. Process and strictly validate each item against database pricing
  for v_item in select * from jsonb_to_recordset(p_items) as x(
    product_id uuid,
    quantity integer,
    selected_option_ids jsonb,
    note text
  )
  loop
    v_item_quantity := coalesce(v_item.quantity, 1);
    if v_item_quantity < 1 or v_item_quantity > 20 then
      return jsonb_build_object('success', false, 'error', 'INVALID_QUANTITY', 'message', 'الكمية المطلوبة لكل صنف يجب أن تكون بين 1 و 20.');
    end if;

    -- Lookup product in the active restaurant
    select id, name, price, is_available
    into v_product
    from public.menu_products
    where id = v_item.product_id
      and restaurant_id = v_service_point.restaurant_id;

    if not found or not v_product.is_available then
      return jsonb_build_object('success', false, 'error', 'PRODUCT_UNAVAILABLE', 'message', 'أحد الأصناف المطلوبة لم يعد متوفراً حالياً.');
    end if;

    v_item_unit_price := v_product.price;
    v_selected_options := '[]'::jsonb;

    -- Extract option UUIDs if provided
    if v_item.selected_option_ids is not null and jsonb_typeof(v_item.selected_option_ids) <> 'array' then
      return jsonb_build_object('success', false, 'error', 'INVALID_OPTIONS', 'message', 'تعذر التحقق من خيارات أحد الأصناف. حدّث المنيو وحاول مجدداً.');
    elsif v_item.selected_option_ids is not null then
      select coalesce(array_agg(value::text::uuid), '{}'::uuid[])
      into v_selected_option_ids
      from jsonb_array_elements_text(v_item.selected_option_ids);
    else
      v_selected_option_ids := '{}'::uuid[];
    end if;

    v_selected_option_count := coalesce(array_length(v_selected_option_ids, 1), 0);
    if v_selected_option_count <> (select count(distinct selected_id) from unnest(v_selected_option_ids) as selected(selected_id)) then
      return jsonb_build_object('success', false, 'error', 'DUPLICATE_OPTIONS', 'message', 'يوجد خيار مكرر في أحد الأصناف.');
    end if;

    select count(*)
      into v_valid_option_count
    from public.product_option_items oi
    join public.product_option_groups og on og.id = oi.group_id
    where oi.id = any(v_selected_option_ids)
      and og.product_id = v_product.id
      and oi.is_available;

    if v_valid_option_count <> v_selected_option_count then
      return jsonb_build_object('success', false, 'error', 'INVALID_OPTION', 'message', 'أحد الخيارات لم يعد متاحاً لهذا الصنف. حدّث المنيو وحاول مجدداً.');
    end if;

    -- Validate option groups (e.g. required groups and single/multiple limits).
    for v_group in
      select og.id, og.name, og.selection_type, og.is_required, og.min_selections, og.max_selections
      from public.product_option_groups og
      where og.product_id = v_product.id
    loop
      select count(*)
      into v_selected_in_group_count
      from public.product_option_items oi
      where oi.group_id = v_group.id
        and oi.id = any(v_selected_option_ids);

      if v_selected_in_group_count < greatest(v_group.min_selections, case when v_group.is_required then 1 else 0 end) then
        return jsonb_build_object('success', false, 'error', 'MISSING_REQUIRED_OPTION',
          'message', 'يرجى تحديد خيار إلزامي للصنف: ' || v_product.name || ' (' || v_group.name || ').');
      end if;

      if v_group.max_selections is not null and v_selected_in_group_count > v_group.max_selections then
        return jsonb_build_object('success', false, 'error', 'EXCEEDED_OPTION_LIMIT',
          'message', 'تم تجاوز الحد المسموح به من الخيارات في: ' || v_group.name);
      end if;

      if v_group.selection_type = 'single' and v_selected_in_group_count > 1 then
        return jsonb_build_object('success', false, 'error', 'EXCEEDED_OPTION_LIMIT',
          'message', 'اختر خياراً واحداً فقط في: ' || v_group.name);
      end if;
    end loop;

    -- Calculate options price additions and record snapshot
    if array_length(v_selected_option_ids, 1) > 0 then
      for v_option in
        select oi.id, oi.name as option_name, oi.price_modifier, og.name as group_name
        from public.product_option_items oi
        join public.product_option_groups og on og.id = oi.group_id
        where oi.id = any(v_selected_option_ids)
          and og.product_id = v_product.id
          and oi.is_available = true
      loop
        v_item_unit_price := v_item_unit_price + v_option.price_modifier;
        v_selected_options := v_selected_options || jsonb_build_object(
          'id', v_option.id,
          'group_name', v_option.group_name,
          'name', v_option.option_name,
          'price_modifier', v_option.price_modifier
        );
      end loop;
    end if;

    v_item_line_total := v_item_unit_price * v_item_quantity;
    v_order_subtotal := v_order_subtotal + v_item_line_total;
    v_items_count := v_items_count + v_item_quantity;

    -- Hold validated item snapshots until every row passes validation.
    v_order_items := v_order_items || jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id,
      'product_name', v_product.name,
      'quantity', v_item_quantity,
      'unit_price', v_item_unit_price,
      'selected_options', v_selected_options,
      'note', nullif(trim(v_item.note), '')
    ));
  end loop;

  v_order_total := v_order_subtotal;

  -- 6. Insert the order parent first, then its validated item snapshots.
  insert into public.orders (
    id,
    branch_id,
    service_point_id,
    order_code,
    source,
    status,
    customer_name,
    vehicle_note,
    note,
    subtotal,
    total,
    idempotency_key,
    tracking_token
  ) values (
    v_order_id,
    v_service_point.branch_id,
    v_service_point.service_point_id,
    v_order_code,
    'qr',
    'new',
    v_customer_name,
    v_vehicle_note,
    v_order_note,
    v_order_subtotal,
    v_order_total,
    v_clean_idempotency_key,
    v_tracking_token
  );

  insert into public.order_items (
    order_id, product_id, product_name, quantity, unit_price, selected_options, note
  )
  select
    v_order_id,
    item.product_id,
    item.product_name,
    item.quantity,
    item.unit_price,
    item.selected_options,
    item.note
  from jsonb_to_recordset(v_order_items) as item(
    product_id uuid,
    product_name text,
    quantity integer,
    unit_price numeric(12, 2),
    selected_options jsonb,
    note text
  );

  return jsonb_build_object(
    'success', true,
    'order_code', v_order_code,
    'total', v_order_total,
    'currency_code', v_service_point.currency_code,
    'tracking_token', v_tracking_token,
    'status', 'new',
    'created_at', now(),
    'items_count', v_items_count,
    'service_point_label', v_service_point.service_point_label,
    'branch_name', v_service_point.branch_name
  );
end;
$$;


revoke all on function public.place_customer_order(text, uuid, jsonb, text, text, text, text)
  from public, anon, authenticated;
