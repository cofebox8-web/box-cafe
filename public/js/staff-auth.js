import { isSupabaseConfigured, supabase } from "./supabase-client.js";

const STAFF_PROFILE_FIELDS = "user_id, full_name, role, branch_id, restaurant_id, is_active";
const ALLOWED_ROLES = new Set(["owner", "admin", "roadside", "kitchen"]);

// Remove legacy insecure local-auth data left over from a previous version of this file.
// Staff accounts and passwords must never live in the browser; see supabase/functions/admin-manage-staff.
try {
  [
    'box_cofe_staff_accounts',
    'box_cofe_staff_accounts_v1',
    'box_cofe_staff_accounts_v2',
    'box_cofe_staff_accounts_v3',
    'box_cofe_staff_accounts_v4',
    'box_cofe_active_local_session'
  ].forEach(k => localStorage.removeItem(k));
} catch {}

function configurationError() {
  if (!isSupabaseConfigured || !supabase) {
    return new Error("خدمة الدخول غير متاحة حالياً. تحقق من إعدادات Supabase والاتصال بالإنترنت.");
  }
  return null;
}

async function resolveProfileBranch(profile) {
  if (!profile) return null;

  if (profile.branch_slug && profile.branch_name) {
    return {
      id: profile.branch_id,
      name: profile.branch_name,
      slug: profile.branch_slug,
      is_active: true
    };
  }

  if (profile.branch_id && supabase) {
    try {
      const { data: branch, error } = await supabase
        .from("branches")
        .select("id, name, slug, is_active")
        .eq("id", profile.branch_id)
        .maybeSingle();

      if (branch && branch.is_active) {
        return branch;
      }
    } catch {}
  }

  return null;
}

async function loadStaffProfile(userId, userObj = null) {
  let data = null;

  // 1. استرجاع الملف من Supabase (المصدر الوحيد والموثوق لصلاحيات الموظف)
  if (isSupabaseConfigured && supabase) {
    try {
      const res = await supabase
        .from("staff_profiles")
        .select(STAFF_PROFILE_FIELDS)
        .eq("user_id", userId)
        .maybeSingle();
      data = res.data;
    } catch (e) {
      console.debug("Supabase staff profile fetch:", e?.message);
    }
  }

  // 2. تفعيل أول مستخدم كمالك رئيسي فقط إذا لم يوجد أي مالك/مدير في النظام بعد
  //    (bootstrap_initial_owner يرفض الطلب من جهة قاعدة البيانات إن وُجد مالك مسبقاً)
  if (!data && supabase) {
    try {
      const { data: bootRes } = await supabase.rpc("bootstrap_initial_owner");
      if (bootRes?.success) {
        const { data: freshData } = await supabase
          .from("staff_profiles")
          .select(STAFF_PROFILE_FIELDS)
          .eq("user_id", userId)
          .maybeSingle();
        data = freshData;
      }
    } catch (e) {
      console.debug("Bootstrap initial owner check bypassed:", e?.message);
    }
  }

  if (!data || !data.is_active || !ALLOWED_ROLES.has(data.role)) {
    if (supabase) await supabase.auth.signOut().catch(() => {});
    throw new Error("هذا الحساب غير مفعّل أو لا يملك دور موظف مصرحاً به في بوكس كافي.");
  }

  const branch = await resolveProfileBranch(data);
  return {
    ...data,
    branch_slug: branch?.slug || data.branch_slug || "",
    branch_name: branch?.name || data.branch_name || ""
  };
}

export function sanitizeNextPath(rawNext) {
  const value = String(rawNext || "").trim();
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "";
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return "";
    if (url.pathname === "/login" || url.pathname === "/login.html") return "";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "";
  }
}

export function resolveStaffDestination(profile, requestedNext = "") {
  if (!profile || !profile.is_active || !ALLOWED_ROLES.has(profile.role)) {
    throw new Error("لا يملك هذا الحساب صلاحية دخول مصرحة.");
  }

  const safeNext = sanitizeNextPath(requestedNext);
  const role = profile.role;
  const defaultKitchenPath = profile.branch_slug
    ? `/kitchen/${encodeURIComponent(profile.branch_slug)}`
    : "";

  if (safeNext) {
    if (safeNext.startsWith("/admin") && (role === "owner" || role === "admin")) {
      return safeNext;
    }
    if ((safeNext.startsWith("/waiter") || safeNext.startsWith("/roadside")) && role === "roadside" && profile.branch_id) {
      return "/waiter";
    }
    if (safeNext.startsWith("/kitchen") && (role === "kitchen" || role === "owner" || role === "admin")) {
      const match = safeNext.match(/^\/kitchen\/([^/?#]+)/);
      if (match && (role === "owner" || role === "admin" || decodeURIComponent(match[1]) === profile.branch_slug)) {
        return `/kitchen/${encodeURIComponent(decodeURIComponent(match[1]))}`;
      }
      if (defaultKitchenPath) return defaultKitchenPath;
    }
  }

  if (role === "owner" || role === "admin") {
    return "/admin";
  }
  if (role === "roadside") {
    if (!profile.branch_id) {
      throw new Error("حساب الويتر غير مفعّل لهذه الشاشة.");
    }
    return "/waiter";
  }
  if (role === "kitchen") {
    if (!defaultKitchenPath) {
      throw new Error("حساب المطبخ غير مفعّل لهذه الشاشة.");
    }
    return defaultKitchenPath;
  }

  throw new Error("دور الحساب غير معروف في النظام.");
}

export async function getStaffSession() {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (!error && data.session?.user) {
        return {
          session: data.session,
          user: data.session.user,
          profile: await loadStaffProfile(data.session.user.id, data.session.user)
        };
      }
    } catch (e) {
      console.debug("Supabase session check:", e?.message);
    }
  }

  return null;
}

export async function signInStaff(email, password) {
  const cleanEmail = String(email || "").trim().toLowerCase();
  const rawPassword = String(password || "");

  const unavailable = configurationError();
  if (unavailable) throw unavailable;

  let authData = null;
  let authError = null;

  try {
    const res = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password: rawPassword
    });
    authData = res.data;
    authError = res.error;
  } catch (e) {
    authError = e;
  }

  if (authData?.user && !authError) {
    try {
      const profile = await loadStaffProfile(authData.user.id, authData.user);
      return {
        session: authData.session,
        user: authData.user,
        profile
      };
    } catch (profileError) {
      await supabase.auth.signOut().catch(() => {});
      throw profileError;
    }
  }

  if (authError) {
    const status = Number(authError?.status || 0);
    if (status === 429) {
      throw new Error("محاولات دخول متكررة. انتظر لحظات ثم حاول مرة أخرى.");
    }
    throw new Error(authError.message || "البريد الإلكتروني أو كلمة المرور غير صحيحة.");
  }

  throw new Error("البريد الإلكتروني أو كلمة المرور غير صحيحة.");
}

export async function requestPasswordReset(email, redirectToUrl) {
  const unavailable = configurationError();
  if (unavailable) throw unavailable;

  const cleanEmail = String(email || "").trim().toLowerCase();
  const redirectTo = redirectToUrl || `${window.location.origin}/login`;

  const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
    redirectTo
  });

  if (error) {
    const status = Number(error?.status || 0);
    if (status === 429) {
      throw new Error("تم إرسال طلبات كثيرة مؤخراً. يرجى الانتظار قليلاً قبل المحاولة مجدداً.");
    }
    if (error.message && /fetch|network|offline/i.test(error.message)) {
      throw new Error("تعذر الاتصال بخدمة المصادقة. تحقق من اتصال الإنترنت وحاول مرة أخرى.");
    }
  }

  return true;
}

export async function updateStaffPassword(newPassword) {
  const unavailable = configurationError();
  if (unavailable) throw unavailable;

  const { error } = await supabase.auth.updateUser({
    password: String(newPassword || "")
  });

  if (error) {
    throw new Error("تعذر تحديث كلمة المرور. قد تكون صلاحية رابط الاستعادة قد انتهت، اطلب رابطاً جديداً.");
  }

  return getStaffSession();
}

export async function signOutStaff() {
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.auth.signOut();
    } catch {}
  }
}

export function buildLoginRedirectUrl(options = {}) {
  const params = new URLSearchParams();
  if (options.next) {
    const safe = sanitizeNextPath(options.next);
    if (safe) params.set("next", safe);
  }
  if (options.signedOut) {
    params.set("signed_out", "1");
  }
  const query = params.toString();
  return query ? `/login?${query}` : "/login";
}

export function roleLabel(role) {
  return {
    owner: "المالك",
    admin: "مدير النظام",
    roadside: "الويتر",
    kitchen: "المطبخ"
  }[role] || "موظف";
}
