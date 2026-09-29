// ============================================================================
// Edge Function: admin-manage-staff
// Runs on Supabase's server-side Deno runtime. This is the ONLY place allowed
// to use the service_role key — it never reaches the browser.
//
// Replaces the previous insecure client-side "local staff accounts" system:
// staff accounts are now real Supabase Auth users, created/updated/deleted
// only after verifying the caller is an active owner/admin of the same
// restaurant. Deploy with: supabase functions deploy admin-manage-staff
// (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically).
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MANAGEABLE_ROLES = new Set(["admin", "roadside", "kitchen"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ success: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ success: false, error: "SERVER_MISCONFIGURED" }, 500);
  }

  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!jwt) {
    return json({ success: false, error: "NOT_AUTHENTICATED" }, 401);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: callerData, error: callerError } = await admin.auth.getUser(jwt);
  const callerUser = callerData?.user;
  if (callerError || !callerUser) {
    return json({ success: false, error: "NOT_AUTHENTICATED" }, 401);
  }

  const { data: callerProfile } = await admin
    .from("staff_profiles")
    .select("role, restaurant_id, is_active")
    .eq("user_id", callerUser.id)
    .maybeSingle();

  if (!callerProfile || !callerProfile.is_active || !["owner", "admin"].includes(callerProfile.role)) {
    return json({ success: false, error: "NOT_AUTHORIZED" }, 403);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ success: false, error: "INVALID_BODY" }, 400);
  }

  const action = String(payload.action || "");

  // --------------------------------------------------------------------
  // Create a new staff account: real Supabase Auth user + staff_profiles row
  // --------------------------------------------------------------------
  if (action === "create") {
    const fullName = String(payload.full_name || "").trim();
    const email = String(payload.email || "").trim().toLowerCase();
    const password = String(payload.password || "");
    const role = String(payload.role || "");
    const branchId = payload.branch_id ? String(payload.branch_id) : null;
    const isActive = payload.is_active !== false;

    if (!fullName) return json({ success: false, error: "MISSING_NAME" }, 400);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ success: false, error: "INVALID_EMAIL" }, 400);
    if (password.length < 6) return json({ success: false, error: "WEAK_PASSWORD" }, 400);
    if (!MANAGEABLE_ROLES.has(role)) return json({ success: false, error: "INVALID_ROLE" }, 400);
    if (role === "admin" && callerProfile.role !== "owner") {
      return json({ success: false, error: "ONLY_OWNER_CAN_CREATE_ADMIN" }, 403);
    }

    let branchRecord: { id: string; name: string; slug: string } | null = null;
    if (role !== "admin") {
      if (!branchId) return json({ success: false, error: "BRANCH_REQUIRED" }, 400);
      const { data: branch } = await admin
        .from("branches")
        .select("id, name, slug")
        .eq("id", branchId)
        .eq("restaurant_id", callerProfile.restaurant_id)
        .maybeSingle();
      if (!branch) return json({ success: false, error: "BRANCH_NOT_FOUND" }, 400);
      branchRecord = branch;
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });

    if (createError || !created?.user) {
      const message = /already registered|already exists/i.test(createError?.message || "")
        ? "EMAIL_ALREADY_EXISTS"
        : (createError?.message || "CREATE_USER_FAILED");
      return json({ success: false, error: message }, 400);
    }

    const { error: profileError } = await admin.from("staff_profiles").insert({
      user_id: created.user.id,
      restaurant_id: callerProfile.restaurant_id,
      branch_id: role === "admin" ? null : branchId,
      full_name: fullName,
      role,
      is_active: isActive,
    });

    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
      return json({ success: false, error: profileError.message }, 400);
    }

    return json({
      success: true,
      user_id: created.user.id,
      staff: {
        user_id: created.user.id,
        full_name: fullName,
        role,
        is_active: isActive,
        branch_id: role === "admin" ? null : branchId,
        branch_name: role === "admin" ? "جميع الفروع" : (branchRecord?.name ?? ""),
        branch_slug: role === "admin" ? "" : (branchRecord?.slug ?? ""),
        email,
        created_at: created.user.created_at,
      },
    });
  }

  // --------------------------------------------------------------------
  // Update an existing staff account (name/role/branch/status, optional
  // password reset). Email is intentionally not editable here.
  // --------------------------------------------------------------------
  if (action === "update") {
    const staffId = String(payload.staff_id || "");
    if (!staffId) return json({ success: false, error: "MISSING_STAFF_ID" }, 400);

    const { data: target } = await admin
      .from("staff_profiles")
      .select("user_id, role, restaurant_id")
      .eq("user_id", staffId)
      .maybeSingle();

    if (!target || target.restaurant_id !== callerProfile.restaurant_id) {
      return json({ success: false, error: "STAFF_NOT_FOUND" }, 404);
    }
    if (target.role === "owner") {
      return json({ success: false, error: "CANNOT_MODIFY_OWNER" }, 403);
    }

    const fullName = String(payload.full_name || "").trim();
    const role = String(payload.role || "");
    const branchId = payload.branch_id ? String(payload.branch_id) : null;
    const isActive = payload.is_active !== false;
    const password = payload.password ? String(payload.password) : "";

    if (!fullName) return json({ success: false, error: "MISSING_NAME" }, 400);
    if (!MANAGEABLE_ROLES.has(role)) return json({ success: false, error: "INVALID_ROLE" }, 400);
    if (role === "admin" && callerProfile.role !== "owner") {
      return json({ success: false, error: "ONLY_OWNER_CAN_ASSIGN_ADMIN" }, 403);
    }
    if (role !== "admin" && !branchId) {
      return json({ success: false, error: "BRANCH_REQUIRED" }, 400);
    }
    if (staffId === callerUser.id && !isActive) {
      return json({ success: false, error: "CANNOT_DEACTIVATE_SELF" }, 400);
    }

    if (password) {
      if (password.length < 6) return json({ success: false, error: "WEAK_PASSWORD" }, 400);
      const { error: pwError } = await admin.auth.admin.updateUserById(staffId, { password });
      if (pwError) return json({ success: false, error: pwError.message }, 400);
    }

    const { error: updateError } = await admin
      .from("staff_profiles")
      .update({
        full_name: fullName,
        role,
        branch_id: role === "admin" ? null : branchId,
        is_active: isActive,
      })
      .eq("user_id", staffId);

    if (updateError) return json({ success: false, error: updateError.message }, 400);

    return json({ success: true });
  }

  // --------------------------------------------------------------------
  // Delete a staff account entirely (auth user + profile row via cascade)
  // --------------------------------------------------------------------
  if (action === "delete") {
    const staffId = String(payload.staff_id || "");
    if (!staffId) return json({ success: false, error: "MISSING_STAFF_ID" }, 400);
    if (staffId === callerUser.id) return json({ success: false, error: "CANNOT_DELETE_SELF" }, 400);

    const { data: target } = await admin
      .from("staff_profiles")
      .select("user_id, role, restaurant_id")
      .eq("user_id", staffId)
      .maybeSingle();

    if (!target || target.restaurant_id !== callerProfile.restaurant_id) {
      return json({ success: false, error: "STAFF_NOT_FOUND" }, 404);
    }
    if (target.role === "owner") {
      return json({ success: false, error: "CANNOT_DELETE_OWNER" }, 403);
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(staffId);
    if (deleteError) return json({ success: false, error: deleteError.message }, 400);

    return json({ success: true });
  }

  return json({ success: false, error: "UNKNOWN_ACTION" }, 400);
});
