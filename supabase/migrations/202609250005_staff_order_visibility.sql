-- Limit live order rows to the kitchen/admin roles and roadside staff's own orders.
-- The RPCs retain their separate role checks; this policy also governs Realtime.

drop policy if exists "staff can read branch orders" on public.orders;

create policy "authorized staff can read relevant branch orders"
  on public.orders for select to authenticated
  using (
    public.staff_has_branch_role(branch_id, array['owner', 'admin', 'kitchen']::text[])
    or (
      source = 'roadside'
      and created_by = (select auth.uid())
      and public.staff_has_branch_role(branch_id, array['roadside']::text[])
    )
  );
