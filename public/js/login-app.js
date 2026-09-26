// ============================================================================
// BOX COFE — Unified Staff & Admin Login Application
// ============================================================================

import {
  getStaffSession,
  signInStaff,
  signOutStaff,
  resolveStaffDestination,
  requestPasswordReset,
  updateStaffPassword,
  sanitizeNextPath,
  roleLabel
} from "./staff-auth.js";
import { isSupabaseConfigured, supabase } from "./supabase-client.js";

const $ = (id) => document.getElementById(id);

const state = {
  busy: false,
  nextParam: "",
  isRecoveryFlow: false
};

// ============================================================================
// UI Helper Functions
// ============================================================================

function setAuthAlert(message = "", tone = "error", title = "") {
  const alertEl = $("auth-alert");
  const msgEl = $("auth-alert-message");
  const titleEl = $("auth-alert-title");
  const iconEl = $("auth-alert-icon");

  if (!alertEl || !msgEl) return;

  if (!message) {
    alertEl.hidden = true;
    return;
  }

  alertEl.dataset.tone = tone;
  msgEl.textContent = message;
  if (titleEl) {
    if (title || tone !== "error") {
      titleEl.textContent = title || (tone === "success" ? "تم بنجاح" : "معلومة");
      titleEl.hidden = false;
    } else {
      titleEl.textContent = "";
      titleEl.hidden = true;
    }
  }
  if (iconEl) {
    iconEl.textContent = tone === "success" ? "✓" : tone === "info" ? "ℹ" : "!";
  }
  alertEl.hidden = false;
  alertEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function clearFieldErrors() {
  document.querySelectorAll(".field-error").forEach((el) => {
    el.textContent = "";
    el.hidden = true;
  });
  document.querySelectorAll(".field-group").forEach((el) => {
    el.classList.remove("has-error");
  });
}

function setFieldError(fieldId, errorId, message) {
  const fieldGroup = $(fieldId)?.closest(".field-group");
  const errorEl = $(errorId);
  if (fieldGroup) fieldGroup.classList.add("has-error");
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }
}

function switchView(viewName) {
  const signin = $("signin-view");
  const reset = $("reset-view");
  const recovery = $("recovery-view");

  if (signin) signin.hidden = viewName !== "signin";
  if (reset) reset.hidden = viewName !== "reset";
  if (recovery) recovery.hidden = viewName !== "recovery";

  clearFieldErrors();
  setAuthAlert("");
}

function setupPasswordToggle(inputId, toggleBtnId, toggleTextId) {
  const input = $(inputId);
  const btn = $(toggleBtnId);
  const text = $(toggleTextId);
  if (!input || !btn) return;

  btn.addEventListener("click", () => {
    const isCurrentlyPassword = input.type === "password";
    input.type = isCurrentlyPassword ? "text" : "password";
    btn.setAttribute("aria-pressed", String(isCurrentlyPassword));
    btn.setAttribute("aria-label", isCurrentlyPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور");
    if (text) text.textContent = isCurrentlyPassword ? "إخفاء" : "إظهار";

    const eyeIcon = btn.querySelector(".icon-eye");
    const eyeOffIcon = btn.querySelector(".icon-eye-off");
    if (eyeIcon && eyeOffIcon) {
      eyeIcon.hidden = isCurrentlyPassword;
      eyeOffIcon.hidden = !isCurrentlyPassword;
    }
    input.focus();
  });
}

function setButtonLoading(buttonId, spinnerId, labelId, isLoading, loadingText, defaultText) {
  const btn = $(buttonId);
  const spinner = $(spinnerId);
  const label = $(labelId);
  if (!btn) return;

  btn.disabled = isLoading;
  if (spinner) spinner.hidden = !isLoading;
  if (label) label.textContent = isLoading ? loadingText : defaultText;
}

// ============================================================================
// URL Parameter & Recovery Parsing
// ============================================================================

function checkUrlParams() {
  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, "?"));

  const rawNext = searchParams.get("next");
  state.nextParam = sanitizeNextPath(rawNext);

  // Check if arriving from Supabase password recovery email
  const type = searchParams.get("type") || hashParams.get("type");
  if (type === "recovery") {
    state.isRecoveryFlow = true;
    switchView("recovery");
  }
}

// ============================================================================
// Core Session & Sign-in Logic
// ============================================================================

async function checkExistingSession() {
  if (state.isRecoveryFlow) return;

  try {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get("signed_out") === "1") return;

    const sessionPromise = getStaffSession();
    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), 1200));
    const context = await Promise.race([sessionPromise, timeoutPromise]);
    if (!context || !context.profile) return;

    const targetUrl = resolveStaffDestination(context.profile, state.nextParam);
    window.location.replace(targetUrl);
  } catch (error) {
    console.debug("Session pre-check passed:", error?.message);
  }
}

async function handleSignInSubmit(event) {
  event.preventDefault();
  clearFieldErrors();
  setAuthAlert("");

  const emailInput = $("email");
  const passwordInput = $("current-password");
  const emailVal = (emailInput?.value || "").trim().toLowerCase();
  const passwordVal = passwordInput?.value || "";

  let hasError = false;

  if (!emailVal) {
    setFieldError("email", "email-error", "يرجى إدخال البريد الإلكتروني الوظيفي.");
    hasError = true;
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
    setFieldError("email", "email-error", "صيغة البريد الإلكتروني غير صحيحة (مثال: name@boxcofe.iq).");
    hasError = true;
  }

  if (!passwordVal) {
    setFieldError("current-password", "password-error", "يرجى إدخال كلمة المرور.");
    hasError = true;
  }

  if (hasError) return;

  const submitBtn = $("login-submit-btn");
  const spinner = $("login-btn-spinner");
  if (submitBtn) submitBtn.disabled = true;
  if (spinner) spinner.hidden = false;

  try {
    const context = await signInStaff(emailVal, passwordVal);
    const targetUrl = resolveStaffDestination(context.profile, state.nextParam);
    window.location.replace(targetUrl);
  } catch (error) {
    if (submitBtn) submitBtn.disabled = false;
    if (spinner) spinner.hidden = true;
    setAuthAlert(error.message || "تعذر تسجيل الدخول. تحقق من بياناتك وحاول مرة أخرى.", "error");
  }
}

async function handleResetSubmit(event) {
  event.preventDefault();
  clearFieldErrors();
  setAuthAlert("");

  const emailInput = $("reset-email");
  const emailVal = (emailInput?.value || "").trim().toLowerCase();

  if (!emailVal || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
    setFieldError("reset-email", "reset-email-error", "يرجى إدخال بريد إلكتروني صالح.");
    return;
  }

  setButtonLoading(
    "reset-submit-btn",
    "reset-btn-spinner",
    "reset-submit-label",
    true,
    "جارٍ إرسال الرابط…",
    "إرسال رابط الاستعادة"
  );

  try {
    await requestPasswordReset(emailVal, `${window.location.origin}/login`);
    switchView("signin");
    setAuthAlert(
      "إذا كان البريد الإلكتروني مسجلاً في النظام، فسيصل إليه رابط استعادة كلمة المرور خلال دقائق. يرجى مراجعة صندوق الوارد والبريد غير الهام.",
      "success",
      "طلب الاستعادة"
    );
    if (emailInput) emailInput.value = "";
  } catch (error) {
    setAuthAlert(error.message || "تعذر إرسال رابط الاستعادة. حاول مجدداً لاحقاً.", "error");
  } finally {
    setButtonLoading(
      "reset-submit-btn",
      "reset-btn-spinner",
      "reset-submit-label",
      false,
      "جارٍ إرسال الرابط…",
      "إرسال رابط الاستعادة"
    );
  }
}

async function handleRecoverySubmit(event) {
  event.preventDefault();
  clearFieldErrors();
  setAuthAlert("");

  const newPasswordInput = $("new-password");
  const passwordVal = newPasswordInput?.value || "";

  if (!passwordVal || passwordVal.length < 8) {
    setFieldError("new-password", "new-password-error", "يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.");
    return;
  }

  setButtonLoading(
    "recovery-submit-btn",
    "recovery-btn-spinner",
    "recovery-submit-label",
    true,
    "جارٍ حفظ كلمة المرور…",
    "حفظ كلمة المرور والدخول"
  );

  try {
    const context = await updateStaffPassword(passwordVal);
    const targetUrl = resolveStaffDestination(context?.profile, state.nextParam);
    window.location.replace(targetUrl);
  } catch (error) {
    setButtonLoading(
      "recovery-submit-btn",
      "recovery-btn-spinner",
      "recovery-submit-label",
      false,
      "جارٍ حفظ كلمة المرور…",
      "حفظ كلمة المرور والدخول"
    );
    setAuthAlert(error.message || "تعذر تحديث كلمة المرور.", "error");
  }
}

// ============================================================================
// Initialization
// ============================================================================

function initLoginApp() {
  setupPasswordToggle("current-password", "toggle-password-btn", "toggle-password-text");
  setupPasswordToggle("new-password", "toggle-new-password-btn", "toggle-new-password-text");

  $("login-form")?.addEventListener("submit", handleSignInSubmit);
  $("reset-form")?.addEventListener("submit", handleResetSubmit);
  $("recovery-form")?.addEventListener("submit", handleRecoverySubmit);

  $("open-reset-btn")?.addEventListener("click", () => switchView("reset"));
  $("back-to-signin-btn")?.addEventListener("click", () => switchView("signin"));

  if (supabase) {
    supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        state.isRecoveryFlow = true;
        switchView("recovery");
      }
    });
  }

  checkUrlParams();
  checkExistingSession();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initLoginApp);
} else {
  initLoginApp();
}
