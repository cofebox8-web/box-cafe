import { isSupabaseConfigured, supabase } from "./supabase-client.js";

const STAFF_PROFILE_FIELDS = "user_id, full_name, role, branch_id, restaurant_id, is_active";

function configurationError() {
  if (!isSupabaseConfigured || !supabase) {
    return new Error("خدمة الدخول غير متاحة حالياً. تحقق من إعدادات Supabase والاتصال.");
  }
  return null;
}

async function loadStaffProfile(userId) {
  const { data, error } = await supabase
    .from("staff_profiles")
    .select(STAFF_PROFILE_FIELDS)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error("تعذر تحميل صلاحية الموظف. حاول مرة أخرى.");
  if (!data || !data.is_active) {
    await supabase.auth.signOut();
    throw new Error("هذا الحساب غير مفعّل كحساب موظف في بوكس كافي.");
  }

  return data;
}

export async function getStaffSession() {
  const unavailable = configurationError();
  if (unavailable) throw unavailable;

  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error("تعذر التحقق من جلسة الدخول.");
  if (!data.session?.user) return null;

  return {
    session: data.session,
    user: data.session.user,
    profile: await loadStaffProfile(data.session.user.id)
  };
}

export async function signInStaff(email, password) {
  const unavailable = configurationError();
  if (unavailable) throw unavailable;

  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(email || "").trim(),
    password: String(password || "")
  });

  if (error || !data.user) {
    throw new Error("البريد الإلكتروني أو كلمة المرور غير صحيحة.");
  }

  try {
    return {
      session: data.session,
      user: data.user,
      profile: await loadStaffProfile(data.user.id)
    };
  } catch (profileError) {
    await supabase.auth.signOut();
    throw profileError;
  }
}

export async function signOutStaff() {
  const unavailable = configurationError();
  if (unavailable) throw unavailable;
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error("تعذر تسجيل الخروج. حاول مرة أخرى.");
}

export function roleLabel(role) {
  return {
    owner: "المالك",
    admin: "مدير النظام",
    roadside: "موظف الشارع",
    kitchen: "المطبخ"
  }[role] || "موظف";
}
