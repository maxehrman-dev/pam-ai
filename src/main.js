import { escapeHtml, formatCurrency, formatPercent, formatSignedCurrency } from "./utils/formatters.js";
import {
  estimateGoalDefaults,
  estimateTaxProfile,
  getCurrentSavings,
  getEmptyBaseline,
  getGoalLabel,
  getMockPlaidLikeData,
  getMonthlyBuffer,
  getMonthlyExpenses,
  getMonthlyObligations,
  getSpendableIncome,
  getUiBaseline,
  hasCompletedBaseline,
  hasValue,
  labelToEmploymentStatus,
  loadBaseline as loadStoredBaseline,
  normalizeManualBaseline,
  normalizePlaidMockData,
  resetBaseline as clearStoredBaseline,
  saveBaseline as persistBaseline,
  toNumber,
  validateBaseline
} from "./utils/baseline.mjs";
import { connectSandboxAccount, loadSandboxFallback } from "./services/plaidClient.js";
import { defaultGoals, goalTemplates, starterScenarios } from "./data/mockData.js";
import {
  buildDecisionSession,
  detectGoalConflicts,
  simulateCareerVelocity,
  simulateBuyVsRent,
  simulateLocationArbitrage
} from "./utils/scenarioEngine.js";
import {
  CREATE_ACCOUNT_STEPS,
  INDUSTRY_CITY_MAP,
  LEGAL_DISCLAIMER,
  PRIVACY_VERSION,
  STORAGE_KEYS,
  TERMS_VERSION,
  VALUES_ONBOARDING_STEPS,
  WAITLIST_FOUNDING_NOTE
} from "./config/appConfig.js";

const app = document.querySelector("#app");
const {
  session: SESSION_STORAGE_KEY,
  lastQuestion: LAST_QUESTION_KEY,
  workspaceView: WORKSPACE_VIEW_KEY,
  authView: AUTH_VIEW_KEY,
  mobileView: MOBILE_VIEW_KEY,
  netWorthRange: NET_WORTH_RANGE_KEY,
  displayTheme: DISPLAY_THEME_KEY,
  lastAutoSync: LAST_AUTO_SYNC_KEY,
  telemetrySession: TELEMETRY_SESSION_KEY,
  cookieConsent: COOKIE_CONSENT_KEY,
  legalAcceptance: LEGAL_ACCEPTANCE_KEY,
  walkthroughDismissed: WALKTHROUGH_DISMISSED_KEY,
  waitlist: WAITLIST_STORAGE_KEY,
  demoAccess: DEMO_ACCESS_KEY
} = STORAGE_KEYS;
const GOALS_STORAGE_KEY = "pam:goals:v1";
const DECISION_HISTORY_STORAGE_KEY = "pam:decision-history:v1";
const SAVED_SCENARIOS_STORAGE_KEY = "pam:saved-scenarios:v1";

const state = {
  baseline: loadStoredBaseline(),
  account: null,
  sessionToken: loadSessionToken(),
  workspaceView: loadWorkspaceView(),
  authView: loadAuthView(),
  mobileView: loadMobileView(),
  netWorthRange: loadNetWorthRange(),
  displayTheme: loadDisplayTheme(),
  createAccountStep: 0,
  accountDraft: null,
  question: loadQuestion(),
  decisionMode: "expense",
  structuredBuilderExpanded: false,
  structuredDecisionDraft: {
    expense: { name: "", amount: "", priority: "Medium" },
    recurring: { name: "", amount: "", duration: "Ongoing" },
    invest: { amount: "200", years: "10", returnRate: "7" },
    income: { delta: "500", timing: "Immediately", workType: "W-2 employee" }
  },
  result: null,
  aiGuidance: null,
  goals: [],
  decisionHistory: [],
  savedScenarios: [],
  saveScenarioMessage: "",
  dataFresh: false,
  decisionBusy: false,
  status: "",
  statusScope: "",
  accountErrorAction: "",
  inlineGoalError: "",
  waitlistOpen: false,
  waitlistJoined: loadWaitlistJoined(),
  waitlistMessage: "",
  waitlistBusy: false,
  waitlistDraft: {
    emailAddress: "",
    fullName: "",
    age: "",
    stage: "",
    goal: ""
  },
  cookieConsent: loadCookieConsent(),
  legalAcceptance: loadLegalAcceptance(),
  legalAcceptanceError: "",
  inputWarning: "",
  walkthroughDismissed: loadWalkthroughDismissed(),
  feedbackMessage: "",
  feedbackBusy: false,
  passwordMessage: "",
  passwordBusy: false,
  verificationPreviewCode: "",
  verificationWarning: "",
  verificationMaskedEmail: "",
  verificationExpiresAt: "",
  verificationCheckStatus: "",
  verificationCheckMessage: "",
  verificationCheckBusy: false,
  lastCheckedVerificationCode: "",
  demoAccessBusy: false,
  demoAccessMessage: "",
  plaidBusy: false,
  subscription: null,
  checkoutBusy: false,
  clerkFirstDecision: "",
  clerkFirstDecisionStep: false,
  lifeValues: loadLifeValues(),
  payFrequency: loadPayFrequency(),
  userValues: loadUserValues(),
  valuesStep: 0,
  valuesDraft: {}
};

const PAY_FREQUENCIES = ["Weekly", "Every 2 weeks", "Twice a month", "Monthly", "Irregular"];

function loadPayFrequency() {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem("pam:pay-frequency:v1") || "";
  } catch (_error) {
    return "";
  }
}

function savePayFrequency(value) {
  state.payFrequency = value || "";
  try {
    window.localStorage.setItem("pam:pay-frequency:v1", state.payFrequency);
  } catch (_error) {
    // best-effort
  }
  try {
    if (state.baseline?.profile) {
      state.baseline.profile.payFrequency = state.payFrequency;
      saveBaseline(state.baseline);
    }
  } catch (_error) {
    // non-fatal
  }
}

const LIFE_VALUES = [
  "Retire early",
  "Travel / live abroad",
  "Make more money",
  "Get out of debt",
  "Buy a home",
  "Never work for a boss",
  "Move out on my own",
  "Build a safety net"
];

function loadLifeValues() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem("pam:life-values:v1") || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

function saveLifeValues(values) {
  state.lifeValues = Array.isArray(values) ? values : [];
  try {
    window.localStorage.setItem("pam:life-values:v1", JSON.stringify(state.lifeValues));
  } catch (_error) {
    // Persistence is best-effort.
  }
  // Mirror into the baseline so it flows to the decision engine + AI.
  try {
    if (state.baseline?.profile) {
      state.baseline.profile.lifeValues = state.lifeValues;
      saveBaseline(state.baseline);
    }
  } catch (_error) {
    // Non-fatal.
  }
}

function loadUserValues() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem("pam:user-values:v2");
    return raw ? JSON.parse(raw) : null;
  } catch (_e) {
    return null;
  }
}

function saveUserValues(values) {
  state.userValues = values || null;
  try {
    window.localStorage.setItem("pam:user-values:v2", JSON.stringify(values));
  } catch (_e) {
    // best-effort
  }
  try {
    if (state.baseline) {
      state.baseline.userValues = values;
      saveBaseline(state.baseline);
    }
  } catch (_e) {
    // non-fatal
  }
}

function getValuesProfile() {
  const ui = getUiBaseline(state.baseline);
  return {
    age: toNumber(ui.age, toNumber(state.userValues?.age, 28)),
    annualSalary: toNumber(ui.grossMonthlyIncome, 0) * 12,
    monthlyBuffer: getMonthlyBuffer(state.baseline),
    currentSavings: getCurrentSavings(state.baseline),
    monthlyExpenses: getMonthlyExpenses(state.baseline),
    lifeValues: state.lifeValues || []
  };
}

function toggleLifeValue(value) {
  const set = new Set(state.lifeValues || []);
  if (set.has(value)) set.delete(value); else set.add(value);
  saveLifeValues([...set]);
}

let isStarted = false;
let lastMobileViewportState = null;

// Clerk helpers — only active when Clerk is configured
function isClerkMode() {
  return Boolean(window.__pamClerkReady && window.Clerk);
}

// True as soon as Clerk is known to be the auth provider (even before clerk.js
// finishes loading) — used to render Clerk UI and never the removed legacy form.
function isClerkConfigured() {
  return Boolean(window.__pamClerkConfigured);
}

async function getAuthToken() {
  if (isClerkMode()) {
    try {
      return await window.Clerk.session?.getToken?.() || null;
    } catch (_error) {
      return null;
    }
  }
  return state.sessionToken || null;
}

function getClerkAccount() {
  const user = window.__pamClerkUser;
  if (!user) return null;
  const email = user.primaryEmailAddress?.emailAddress || "";
  return {
    id: user.id,
    clerkUserId: user.id,
    firstName: user.firstName || email.split("@")[0] || "User",
    emailAddress: email,
    employmentStatus: user.publicMetadata?.employmentStatus || "Not sure yet",
    stateCode: user.publicMetadata?.stateCode || "OTHER",
    age: user.publicMetadata?.age || null,
    creditScore: user.publicMetadata?.creditScore || null,
    createdAt: new Date().toISOString()
  };
}

async function buildAuthHeaders() {
  const token = await getAuthToken();
  if (!token) return { "Content-Type": "application/json" };
  if (isClerkMode()) {
    return { "Content-Type": "application/json", "Authorization": `Bearer ${token}` };
  }
  return { "Content-Type": "application/json" };
}

// Subscription is always waived until PAM explicitly requires it.
// Set PAM_REQUIRE_SUBSCRIPTION=true in Vercel to enforce it.
function hasActiveSubscription() {
  if (!state.subscription) return true; // waived by default
  return ["active", "trialing"].includes(state.subscription.status);
}

function isFoundingMember() {
  return Boolean(state.subscription?.isFoundingMember);
}

async function loadSubscription() {
  if (!isClerkMode() || !state.account?.id) return;
  try {
    const headers = await buildAuthHeaders();
    const { payload } = await requestJson("/api/account/session", { headers });
    if (payload?.subscription) {
      state.subscription = payload.subscription;
    }
  } catch (_error) {
    // Subscription load is best-effort.
  }
}

async function startCheckout(plan = "monthly") {
  if (state.checkoutBusy) return;
  state.checkoutBusy = true;
  render();
  try {
    const headers = await buildAuthHeaders();
    const { payload, error } = await requestJson("/api/integrations/checkout", {
      method: "POST",
      headers,
      body: JSON.stringify({ plan })
    });
    if (payload?.url) {
      window.location.href = payload.url;
    } else {
      setStatus(payload?.error || error || "Could not start checkout.", "account");
      state.checkoutBusy = false;
      render();
    }
  } catch (_error) {
    setStatus("Could not reach the checkout. Try again.", "account");
    state.checkoutBusy = false;
    render();
  }
}

function loadCookieConsent() {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(COOKIE_CONSENT_KEY) || "";
  } catch (_error) {
    return "";
  }
}

function saveCookieConsent(value) {
  const normalized = value === "accepted" ? "accepted" : "declined";
  state.cookieConsent = normalized;
  window.__pamCookieConsent = normalized;
  try {
    window.localStorage.setItem(COOKIE_CONSENT_KEY, normalized);
  } catch (_error) {
    // Consent UI still works without persistence.
  }
  try {
    if (normalized === "accepted") {
      window.posthog?.opt_in_capturing?.();
    } else {
      window.posthog?.opt_out_capturing?.();
    }
  } catch (_error) {
    // PostHog opt-in/out must never interrupt the app.
  }
}

function loadLegalAcceptance() {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(LEGAL_ACCEPTANCE_KEY) || "null");
    if (parsed?.acceptedAdvisorDisclaimer && parsed?.acceptedTermsPrivacy) return parsed;
  } catch (_error) {
    // Legal acceptance will be requested again if local storage is unavailable.
  }
  return null;
}

function saveLegalAcceptance(record) {
  state.legalAcceptance = record;
  try {
    window.localStorage.setItem(LEGAL_ACCEPTANCE_KEY, JSON.stringify(record));
  } catch (_error) {
    // Server-side logging is the source of truth when available.
  }
}

function hasAcceptedLegalTerms() {
  return Boolean(
    state.legalAcceptance?.acceptedAdvisorDisclaimer &&
      state.legalAcceptance?.acceptedTermsPrivacy &&
      state.legalAcceptance?.termsVersion === TERMS_VERSION &&
      state.legalAcceptance?.privacyVersion === PRIVACY_VERSION
  );
}

function loadWalkthroughDismissed() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(WALKTHROUGH_DISMISSED_KEY) === "true";
  } catch (_error) {
    return false;
  }
}

function loadWaitlistJoined() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(WAITLIST_STORAGE_KEY) === "joined";
  } catch (_error) {
    return false;
  }
}

function loadDemoAccess() {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DEMO_ACCESS_KEY) || "null");
    if (!parsed?.unlockedAt) return null;
    const expiresAt = Number(parsed.expiresAt || 0);
    if (expiresAt && expiresAt <= Date.now()) {
      window.localStorage.removeItem(DEMO_ACCESS_KEY);
      return null;
    }
    return parsed;
  } catch (_error) {
    return null;
  }
}

function hasDemoAccess() {
  return Boolean(loadDemoAccess());
}

function saveDemoAccess(expiresDays = 30) {
  try {
    const now = Date.now();
    window.localStorage.setItem(DEMO_ACCESS_KEY, JSON.stringify({
      unlockedAt: new Date(now).toISOString(),
      expiresAt: now + Number(expiresDays || 30) * 24 * 60 * 60 * 1000
    }));
  } catch (_error) {
    // Demo access persistence is device-local and can be retried if storage is unavailable.
  }
}

function shouldShowPublicLaunchGate() {
  if (typeof window === "undefined") return false;
  if (getLegalRoute() || isWaitlistRoute()) return false;
  return !hasDemoAccess();
}

function saveWaitlistJoined() {
  state.waitlistJoined = true;
  try {
    window.localStorage.setItem(WAITLIST_STORAGE_KEY, "joined");
  } catch (_error) {
    // The current render still knows the user joined.
  }
}

function saveWalkthroughDismissed() {
  state.walkthroughDismissed = true;
  try {
    window.localStorage.setItem(WALKTHROUGH_DISMISSED_KEY, "true");
  } catch (_error) {
    // The walkthrough can still be dismissed for the current render.
  }
}

function getTelemetrySessionId() {
  try {
    const existing = localStorage.getItem(TELEMETRY_SESSION_KEY);
    if (existing) return existing;
    const nextId = crypto?.randomUUID ? crypto.randomUUID() : `pam-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(TELEMETRY_SESSION_KEY, nextId);
    return nextId;
  } catch (_error) {
    return "pam-anonymous";
  }
}

function trackEvent(eventName, properties = {}, eventType = "product") {
  if (state.cookieConsent !== "accepted" && eventType !== "security") {
    return;
  }

  const body = JSON.stringify({
    eventType,
    eventName,
    sessionId: getTelemetrySessionId(),
    page: window.location.pathname || "/",
    properties
  });

  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/telemetry", blob);
    } else {
      fetch("/api/telemetry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true
      }).catch(() => {});
    }
  } catch (_error) {
    // Telemetry should never interrupt the decision engine.
  }

  try {
    if (state.cookieConsent === "accepted" && window.posthog?.capture) {
      window.posthog.capture(eventName, {
        event_type: eventType,
        page: window.location.pathname || "/",
        ...properties
      });
    }
  } catch (_error) {
    // PostHog must never interrupt the decision engine.
  }
}

function setStatus(message, scope = "account") {
  state.status = message;
  state.statusScope = message ? scope : "";
  if (!message || scope !== "account") {
    state.accountErrorAction = "";
  }
}

function clearStatus(scope = "") {
  if (!scope || state.statusScope === scope) {
    state.status = "";
    state.statusScope = "";
    if (!scope || scope === "account") {
      state.accountErrorAction = "";
    }
  }
}

function getStatus(scope) {
  return state.statusScope === scope ? state.status : "";
}

function saveBaseline(baseline) {
  state.baseline = persistBaseline(baseline);
  persistAccountBaseline(state.baseline).catch(() => {});
}

async function persistAccountBaseline(baseline) {
  if (!state.account?.id || !hasCompletedBaseline(baseline)) return;
  if (!isClerkMode() && !state.sessionToken) return;

  const headers = await buildAuthHeaders();
  const body = {
    action: "save_baseline",
    baseline
  };
  if (!isClerkMode()) body.sessionToken = state.sessionToken;

  await fetch("/api/account/session", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    keepalive: true
  });
}

function routeSignedInUser(statusMessage = "Signed in.") {
  saveAuthView("signin");
  state.legalAcceptance = state.legalAcceptance || loadLegalAcceptance();
  if (canAccessDashboard() && hasAcceptedLegalTerms()) {
    if (!state.userValues?.completed) {
      state.valuesStep = 0;
      state.valuesDraft = {};
      saveWorkspaceView("values");
    } else {
      saveWorkspaceView("dashboard");
      saveMobileView("home");
    }
    setStatus(`${statusMessage} Dashboard restored.`, "decision");
    return;
  }
  saveWorkspaceView("account");
  setStatus(canAccessDashboard()
    ? `${statusMessage} Accept the legal terms to continue.`
    : `${statusMessage} Connect your financial baseline to open your dashboard.`, "account");
}

function getInitialAccountDraft() {
  const baseline = getUiBaseline(state.baseline);
  const account = state.account || {};
  return {
    firstName: String(account.firstName || baseline.firstName || ""),
    emailAddress: String(account.emailAddress || baseline.emailAddress || ""),
    verificationCode: "",
    verificationRequestId: "",
    verificationToken: "",
    password: "",
    confirmPassword: "",
    age: hasValue(account.age) ? String(account.age) : hasValue(baseline.age) ? String(baseline.age) : "",
    creditScore: hasValue(baseline.creditScore) ? String(baseline.creditScore) : "",
    cityOrZip: String(account.cityOrZip || baseline.cityOrZip || state.baseline.profile?.cityOrZip || ""),
    firstDecision: String(state.question && !/^Can I afford to move out if rent is \$1,800\?$/.test(state.question) ? state.question : ""),
    employmentStatus: String(account.employmentStatus || baseline.employmentStatus || "Not sure yet"),
    stateCode: String(account.stateCode || baseline.stateCode || "OTHER")
  };
}

function inferStateFromLocation(value) {
  const normalized = String(value || "").trim().toUpperCase();
  const stateMatch = normalized.match(/\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|IA|ID|IL|IN|KS|KY|LA|MA|MD|ME|MI|MN|MO|MS|MT|NC|ND|NE|NH|NJ|NM|NV|NY|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VA|VT|WA|WI|WV|WY|DC)\b/);
  if (stateMatch) return stateMatch[1];
  const zipMatch = normalized.match(/\b(\d{5})(?:-\d{4})?\b/);
  if (!zipMatch) return "";
  const prefix = Number(zipMatch[1].slice(0, 3));
  if (prefix >= 900 && prefix <= 961) return "CA";
  if ((prefix >= 100 && prefix <= 149) || prefix === 5 || prefix === 63) return "NY";
  if (prefix >= 70 && prefix <= 89) return "NJ";
  if (prefix >= 10 && prefix <= 27) return "MA";
  if (prefix >= 600 && prefix <= 629) return "IL";
  if (prefix >= 150 && prefix <= 196) return "PA";
  if (prefix >= 750 && prefix <= 799) return "TX";
  if (prefix >= 320 && prefix <= 349) return "FL";
  if (prefix >= 980 && prefix <= 994) return "WA";
  if (prefix >= 889 && prefix <= 898) return "NV";
  if (prefix >= 370 && prefix <= 385) return "TN";
  return "";
}

function ensureAccountDraft() {
  if (!state.accountDraft) {
    state.accountDraft = getInitialAccountDraft();
  }
  return state.accountDraft;
}

function loadSessionToken() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(SESSION_STORAGE_KEY) || null;
  } catch (_error) {
    return null;
  }
}

function saveSessionToken(token) {
  state.sessionToken = token || null;
  try {
    if (!token) {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(SESSION_STORAGE_KEY, token);
  } catch (_error) {
    // Session persistence is helpful, not required.
  }
}

function loadWorkspaceView() {
  if (typeof window === "undefined") return "landing";
  const stored = window.localStorage.getItem(WORKSPACE_VIEW_KEY);
  return ["landing", "account", "dashboard"].includes(stored || "") ? stored : "landing";
}

function loadAuthView() {
  if (typeof window === "undefined") return "create";
  const stored = window.localStorage.getItem(AUTH_VIEW_KEY);
  return ["create", "signin"].includes(stored || "") ? stored : "create";
}

function loadMobileView() {
  if (typeof window === "undefined") return "home";
  const stored = window.localStorage.getItem(MOBILE_VIEW_KEY);
  return ["home", "ask", "result", "goals", "profile"].includes(stored || "") ? stored : "home";
}

function loadNetWorthRange() {
  if (typeof window === "undefined") return "3M";
  try {
    const stored = window.localStorage.getItem(NET_WORTH_RANGE_KEY);
    return ["1M", "3M", "6M", "1Y", "All"].includes(stored || "") ? stored : "3M";
  } catch (_error) {
    return "3M";
  }
}

function loadDisplayTheme() {
  if (typeof window === "undefined") return "light";
  try {
    const stored = window.localStorage.getItem(DISPLAY_THEME_KEY);
    return ["light", "dark", "system"].includes(stored || "") ? stored : "light";
  } catch (_error) {
    return "light";
  }
}

function applyDisplayTheme() {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = state.displayTheme || "light";
}

function saveWorkspaceView(view) {
  state.workspaceView = ["landing", "account", "dashboard", "values"].includes(view) ? view : "landing";
  try {
    window.localStorage.setItem(WORKSPACE_VIEW_KEY, state.workspaceView);
  } catch (_error) {
    // View persistence is helpful, not required.
  }
}

function saveAuthView(view) {
  state.authView = ["create", "signin"].includes(view) ? view : "create";
  try {
    window.localStorage.setItem(AUTH_VIEW_KEY, state.authView);
  } catch (_error) {
    // Auth view persistence is helpful, not required.
  }
}

function saveMobileView(view) {
  state.mobileView = ["home", "ask", "result", "goals", "profile"].includes(view) ? view : "home";
  try {
    window.localStorage.setItem(MOBILE_VIEW_KEY, state.mobileView);
  } catch (_error) {
    // Mobile screen state can fall back to in-memory.
  }
}

function isMobileDashboardViewport() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 900px)").matches;
}

function scrollMobileScreenTop() {
  if (!isMobileDashboardViewport()) return false;
  window.scrollTo({ top: 0, behavior: "smooth" });
  return true;
}

function saveNetWorthRange(range) {
  state.netWorthRange = ["1M", "3M", "6M", "1Y", "All"].includes(range) ? range : "3M";
  try {
    window.localStorage.setItem(NET_WORTH_RANGE_KEY, state.netWorthRange);
  } catch (_error) {
    // Chart range state can fall back to the default.
  }
}

function saveDisplayTheme(theme) {
  state.displayTheme = ["light", "dark", "system"].includes(theme) ? theme : "light";
  try {
    window.localStorage.setItem(DISPLAY_THEME_KEY, state.displayTheme);
  } catch (_error) {
    // Display preferences can fall back to the default theme.
  }
  applyDisplayTheme();
}

function getCreateAccountStepConfig(stepIndex = state.createAccountStep) {
  return CREATE_ACCOUNT_STEPS[Math.max(0, Math.min(stepIndex, CREATE_ACCOUNT_STEPS.length - 1))];
}

function saveCurrentStepValue(form) {
  const draft = ensureAccountDraft();
  const step = getCreateAccountStepConfig();
  if (!form || !step) return draft;
  const value = form.elements.namedItem(step.key)?.value ?? "";
  const previousValue = String(draft[step.key] || "");
  draft[step.key] = String(value);
  if (step.withConfirm) {
    draft.confirmPassword = String(form.elements.namedItem("confirmPassword")?.value ?? "");
  }
  if (String(value) !== previousValue) {
    clearStatus("account");
  }
  if (step.key === "emailAddress" && String(value) !== previousValue) {
    draft.verificationCode = "";
    draft.verificationRequestId = "";
    draft.verificationToken = "";
    state.verificationPreviewCode = "";
    state.verificationWarning = "";
    state.verificationMaskedEmail = "";
    state.verificationExpiresAt = "";
    state.verificationCheckStatus = "";
    state.verificationCheckMessage = "";
    state.lastCheckedVerificationCode = "";
  }
  if (step.key === "verificationCode" && String(value) !== previousValue) {
    state.verificationCheckStatus = "";
    state.verificationCheckMessage = "";
  }
  return draft;
}

function validateAccountStep(stepIndex = state.createAccountStep, draft = ensureAccountDraft()) {
  const step = getCreateAccountStepConfig(stepIndex);
  const value = String(draft[step.key] || "").trim();

  if (step.required && !value) {
    return `Enter ${step.errorLabel || step.key} to continue.`;
  }

  if (step.key === "password" && value && value.length < 8) {
    return "Use at least 8 characters for your password.";
  }

  if (step.withConfirm) {
    const confirm = String(draft.confirmPassword || "").trim();
    if (!confirm) return "Confirm your password before continuing.";
    if (confirm !== value) return "Passwords don't match.";
  }

  if (step.key === "confirmPassword" && value !== String(draft.password || "")) {
    return "Passwords don't match.";
  }

  if (step.key === "verificationCode") {
    if (!draft.verificationRequestId) {
      return "Code is still sending. Try again in a moment.";
    }
    if (!/^\d{6}$/.test(value)) {
      return "Enter the 6-digit verification code.";
    }
    if (state.verificationCheckStatus === "checking") {
      return "Checking code. Try again in a second.";
    }
    if (state.verificationCheckStatus !== "valid") {
      return "Enter the correct verification code.";
    }
  }

  return "";
}

function resetBaseline() {
  state.baseline = clearStoredBaseline();
  if (state.account) {
    saveBaseline(syncAccountIntoBaseline(state.account, getEmptyBaseline()));
  }
  saveWorkspaceView("account");
  setStatus("Financial data disconnected. Reconnect accounts when you are ready.", "account");
  state.result = null;
  state.aiGuidance = null;
  state.inlineGoalError = "";
  render();
}

function loadQuestion() {
  // Start empty — examples belong in the placeholder, never as text the
  // user has to delete before typing.
  if (typeof window === "undefined") return "";
  const stored = window.localStorage.getItem(LAST_QUESTION_KEY) || "";
  return stored === "Can I afford to move out if rent is $1,800?" ? "" : stored;
}

function saveQuestion(question) {
  state.question = question;
  try {
    window.localStorage.setItem(LAST_QUESTION_KEY, question);
  } catch (_error) {
    // The simulator can still run without storage.
  }
}

// Lightweight success toast: confirms completed actions without re-rendering.
// Survives render() because it attaches to <body>, not #app.
function showSuccessToast(message) {
  if (typeof document === "undefined") return;
  try {
    document.querySelectorAll(".pam-success-toast").forEach((node) => node.remove());
    const toast = document.createElement("div");
    toast.className = "pam-success-toast";
    toast.setAttribute("role", "status");
    toast.textContent = `✓ ${message}`;
    document.body.appendChild(toast);
    window.setTimeout(() => toast.classList.add("visible"), 20);
    window.setTimeout(() => {
      toast.classList.remove("visible");
      window.setTimeout(() => toast.remove(), 400);
    }, 3200);
  } catch (_error) {
    // A missing toast must never break the action it confirms.
  }
}

function loadUserGoals() {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(GOALS_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((goal) => goal && typeof goal === "object") : [];
  } catch (_error) {
    return [];
  }
}

function saveUserGoals(goals) {
  state.goals = Array.isArray(goals) ? goals : [];
  try {
    window.localStorage.setItem(GOALS_STORAGE_KEY, JSON.stringify(state.goals));
  } catch (_error) {
    // Goal persistence is device-local for the prototype and can fail safely.
  }
}

function readJsonArrayStorage(key) {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === "object") : [];
  } catch (_error) {
    return [];
  }
}

function writeJsonArrayStorage(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(Array.isArray(value) ? value : []));
  } catch (_error) {
    // These are product-memory helpers only; the core simulator can still work.
  }
}

function loadDecisionHistory() {
  return readJsonArrayStorage(DECISION_HISTORY_STORAGE_KEY).slice(0, 12);
}

function saveDecisionHistory(history) {
  state.decisionHistory = Array.isArray(history) ? history.slice(0, 12) : [];
  writeJsonArrayStorage(DECISION_HISTORY_STORAGE_KEY, state.decisionHistory);
}

function loadSavedScenarios() {
  return readJsonArrayStorage(SAVED_SCENARIOS_STORAGE_KEY).slice(0, 12);
}

function saveSavedScenarios(scenarios) {
  state.savedScenarios = Array.isArray(scenarios) ? scenarios.slice(0, 12) : [];
  writeJsonArrayStorage(SAVED_SCENARIOS_STORAGE_KEY, state.savedScenarios);
}

function getDecisionMemoryEntry(result) {
  const session = result?.scenarioSession;
  const createdAt = new Date().toISOString();
  return {
    id: `decision-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt,
    question: result?.question || session?.prompt || state.question || "Decision",
    decisionType: result?.decision?.type || session?.draft?.type || "Decision",
    risk: result?.risk?.label || "Medium",
    monthlyImpact: toNumber(result?.decision?.monthlyImpact, 0),
    oneTimeImpact: toNumber(result?.decision?.oneTimeImpact, 0),
    newBuffer: toNumber(result?.newBuffer, getMonthlyBuffer(state.baseline)),
    goalDelay: toNumber(result?.goalDelay, 0),
    mostImpactedGoal: result?.mostImpactedGoal || getGoalLabel(state.baseline) || "Main goal",
    ahaMoment: session?.result?.ahaMoment || result?.explanation || ""
  };
}

function recordDecisionHistory(result) {
  if (!result) return;
  const entry = getDecisionMemoryEntry(result);
  const withoutDuplicate = state.decisionHistory.filter((item) => item.question !== entry.question);
  saveDecisionHistory([entry, ...withoutDuplicate]);
  // Persist server-side so the decision arc follows the user across devices.
  persistDecisionToServer(entry);
}

// Merge server-stored decisions with anything still only in this browser
// (server is the source of truth; local-only entries are kept and capped).
function seedDecisionHistoryFromServer(serverDecisions) {
  const valid = (serverDecisions || []).filter((d) => d && d.question);
  if (!valid.length) return;
  const localOnly = (state.decisionHistory || []).filter((l) => !valid.some((s) => s.question === l.question));
  saveDecisionHistory([...valid, ...localOnly].slice(0, 12));
}

// Best-effort save of one decision to Supabase. localStorage already holds it,
// so a failure here never blocks the user.
async function persistDecisionToServer(entry) {
  if (!entry || !hasPrototypeAccount()) return;
  try {
    const headers = await buildAuthHeaders();
    await fetch("/api/account/session", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({
        action: "save_decision",
        question: entry.question,
        entry,
        sessionToken: state.sessionToken || undefined
      })
    });
  } catch (_error) {
    // Device-local history is intact; cross-device sync can catch up later.
  }
}

function saveCurrentScenario() {
  if (!state.result) {
    state.saveScenarioMessage = "Run a decision first.";
    return;
  }
  const entry = getDecisionMemoryEntry(state.result);
  const withoutDuplicate = state.savedScenarios.filter((item) => item.question !== entry.question);
  saveSavedScenarios([entry, ...withoutDuplicate]);
  state.saveScenarioMessage = "Scenario saved.";
  showSuccessToast("Scenario saved.");
  trackEvent("scenario_saved", {
    risk: entry.risk,
    decisionType: entry.decisionType
  });
}

function removeSavedScenario(id) {
  saveSavedScenarios(state.savedScenarios.filter((item) => item.id !== id));
  state.saveScenarioMessage = "Saved scenario removed.";
}

function formatShortDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Recent";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function addGoalFromTemplate(templateId) {
  const template = goalTemplates.find((goal) => goal.id === templateId);
  if (!template) return;
  const exists = state.goals.some((goal) => String(goal.title).toLowerCase() === String(template.title).toLowerCase());
  if (exists) {
    setStatus("That goal is already saved.", "account");
    return;
  }
  const currentSavings = getCurrentSavings(state.baseline);
  const targetAmount = Math.max(toNumber(template.targetAmount, 0), 1);
  saveUserGoals([
    ...state.goals,
    {
      ...template,
      id: `goal-${Date.now()}`,
      currentAmount: Math.min(currentSavings, targetAmount),
      monthlyContribution: toNumber(template.monthlyContribution, Math.ceil(Math.max(targetAmount - currentSavings, 0) / 18)),
      targetTimelineMonths: template.targetTimelineMonths || 18
    }
  ]);
  setStatus("Goal added. PAM will use it in future decisions.", "account");
  trackEvent("goal_template_added", { templateId });
}

function getProfileCompleteness() {
  const ui = getUiBaseline(state.baseline);
  const connectedAccounts = getConnectedAccounts(state.baseline);
  const hasUserGoal = state.goals.length > 0 || (getGoalLabel(state.baseline) && toNumber(state.baseline?.goals?.goalTargetAmount, 0) > 0);
  const checks = [
    { label: "Account", complete: Boolean(state.account || ui.emailAddress) },
    { label: "Legal", complete: hasAcceptedLegalTerms() },
    { label: "Accounts", complete: connectedAccounts.length > 0 },
    { label: "Income", complete: getSpendableIncome(state.baseline) > 0 },
    { label: "Spending", complete: getMonthlyExpenses(state.baseline) > 0 },
    { label: "Savings", complete: getCurrentSavings(state.baseline) > 0 },
    { label: "Goal", complete: Boolean(hasUserGoal) },
    { label: "Credit", complete: hasValue(state.baseline?.profile?.creditScore || ui.creditScore) }
  ];
  const completed = checks.filter((check) => check.complete).length;
  const score = Math.round((completed / checks.length) * 100);
  return {
    score,
    completed,
    total: checks.length,
    missing: checks.filter((check) => !check.complete).map((check) => check.label),
    label: score >= 85 ? "Strong model" : score >= 60 ? "Good start" : "Needs data"
  };
}

function getReadinessChecks() {
  const monthlyBuffer = getMonthlyBuffer(state.baseline);
  const monthlyExpenses = getMonthlyExpenses(state.baseline);
  const currentSavings = getCurrentSavings(state.baseline);
  const creditScore = toNumber(state.baseline?.profile?.creditScore, 0);
  const goals = getGoalsFromBaseline(state.baseline);
  const moveOutGoal = goals.find((goal) => /move|rent|apartment|place/i.test(goal.title)) || goals[0];
  const emergencyTarget = Math.max(monthlyExpenses * 3, 1);
  const moveOutProgress = moveOutGoal ? getProgressPercent(moveOutGoal.currentAmount, moveOutGoal.targetAmount) : 0;
  const carReady = monthlyBuffer >= 500 && (!creditScore || creditScore >= 660);
  const emergencyReady = currentSavings >= emergencyTarget;
  const investReady = monthlyBuffer >= 300;

  return [
    {
      label: "Move-out readiness",
      status: moveOutProgress >= 80 && monthlyBuffer >= 500 ? "Ready" : "Build more cushion",
      tone: moveOutProgress >= 80 && monthlyBuffer >= 500 ? "good" : "warn",
      detail: moveOutGoal ? `${moveOutProgress}% funded · ${formatCurrency(monthlyBuffer)} buffer` : "Add a move-out goal"
    },
    {
      label: "Car / loan readiness",
      status: carReady ? "Worth testing" : "Needs caution",
      tone: carReady ? "good" : "warn",
      detail: creditScore ? `${creditScore} credit score · ${formatCurrency(monthlyBuffer)} buffer` : "Add credit score for better approval modeling"
    },
    {
      label: "Emergency runway",
      status: emergencyReady ? "Protected" : "Still building",
      tone: emergencyReady ? "good" : "warn",
      detail: `${formatCurrency(currentSavings)} saved · ${formatCurrency(emergencyTarget)} target`
    },
    {
      label: "Investing capacity",
      status: investReady ? "Can model growth" : "Protect cash first",
      tone: investReady ? "good" : "warn",
      detail: `${formatCurrency(monthlyBuffer)} monthly buffer`
    }
  ];
}

function exportProfileData() {
  const payload = {
    exportedAt: new Date().toISOString(),
    account: state.account,
    baseline: state.baseline,
    goals: state.goals,
    decisionHistory: state.decisionHistory,
    savedScenarios: state.savedScenarios
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "pam-profile-export.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  trackEvent("profile_exported", {}, "security");
}

function getScenarioProfileFromBaseline(baseline) {
  const ui = getUiBaseline(baseline);
  const connectedAccounts = getConnectedAccounts(baseline);
  const recurringExpenses = getTopConnectedExpenses(baseline, 12);
  const liabilities = Array.isArray(baseline?.obligations?.liabilities) ? baseline.obligations.liabilities : [];
  const monthlyIncome = getSpendableIncome(baseline);
  const monthlyExpenses = getMonthlyExpenses(baseline);
  const monthlyObligations = getMonthlyObligations(baseline);
  const retirementContribution = toNumber(baseline?.tax?.retirementContributionMonthly, 0);
  const fixed = [];
  const variable = [];

  if (recurringExpenses.length) {
    recurringExpenses.forEach((item) => {
      const category = String(item.category || item.name || "").toLowerCase();
      const entry = {
        label: item.name || item.category || "Connected spending",
        amount: toNumber(item.amount, 0),
        essential: /rent|housing|mortgage|utility|utilities|insurance|loan|debt|student|transport|grocer|food/.test(category)
      };
      if (/rent|housing|mortgage|utility|utilities|insurance|loan|debt|student/.test(category)) fixed.push(entry);
      else variable.push(entry);
    });
  } else if (monthlyExpenses > 0) {
    fixed.push({ label: "Estimated fixed expenses", amount: Math.round(monthlyExpenses * 0.65), essential: true });
    variable.push({ label: "Estimated variable spending", amount: Math.round(monthlyExpenses * 0.35), essential: false });
  }

  if (monthlyObligations > 0 && !fixed.some((entry) => /debt|loan/i.test(entry.label))) {
    fixed.push({ label: "Debt obligations", amount: monthlyObligations, essential: true });
  }

  const accountAssets = connectedAccounts
    .filter((account) => toNumber(account.current, 0) > 0)
    .map((account) => {
      const type = String(account.type || "").toLowerCase();
      return {
        label: account.name || "Connected account",
        value: toNumber(account.current, 0),
        bucket: type.includes("invest") || type.includes("retirement") ? "invest" : "cash",
        liquid: !type.includes("invest") && !type.includes("retirement"),
        note: account.subtype || account.type || "Connected"
      };
    });
  const assets = accountAssets.length
    ? accountAssets
    : [{ label: "Current savings", value: getCurrentSavings(baseline), bucket: "cash", liquid: true, note: "Saved baseline" }];

  return {
    user: {
      name: ui.firstName || "PAM user",
      archetype: "Connected Sandbox profile",
      city: baseline?.profile?.state || ui.stateCode || "US",
      creditScore: hasValue(baseline?.profile?.creditScore) ? toNumber(baseline.profile.creditScore, null) : null,
      objective: getGoalLabel(baseline) || "Make better money decisions before committing."
    },
    monthly: {
      income: [{ label: "Spendable income", amount: monthlyIncome }],
      fixed,
      variable,
      contributions: retirementContribution
        ? [{ label: "Retirement contributions", amount: retirementContribution, bucket: "invest" }]
        : []
    },
    assets,
    liabilities: liabilities.map((item) => ({
      label: item.name || item.type || "Liability",
      balance: toNumber(item.balance, 0),
      rate: toNumber(item.rate, 0),
      monthlyPayment: toNumber(item.minimumPayment ?? item.monthlyPayment, 0),
      principalShare: Math.max(Math.round(toNumber(item.minimumPayment ?? item.monthlyPayment, 0) * 0.68), 0)
    })),
    healthSignals: baseline?.metadata?.notes || []
  };
}

function normalizeGoalForScenario(goal, index = 0) {
  const targetAmount = Math.max(toNumber(goal.targetAmount ?? goal.goalTargetAmount, 0), 1);
  const currentAmount = Math.max(toNumber(goal.currentAmount, getCurrentSavings(state.baseline)), 0);
  const timeline = toNumber(goal.targetTimelineMonths ?? goal.goalTimelineMonths, 18);
  const monthlyContribution = Math.max(toNumber(goal.monthlyContribution, 0), Math.ceil(Math.max(targetAmount - currentAmount, 0) / Math.max(timeline, 1)));
  return {
    id: goal.id || `goal-${index}`,
    title: goal.title || goal.primaryGoal || getGoalLabel(state.baseline) || "Main goal",
    category: goal.category || "Personal goal",
    targetAmount,
    currentAmount,
    monthlyContribution,
    priority: goal.priority || "high",
    fundingSource: goal.fundingSource || "cash",
    targetTimelineMonths: timeline || 18,
    annualReturn: toNumber(goal.annualReturn, goal.fundingSource === "invest" ? 0.066 : 0.024)
  };
}

function getGoalsFromBaseline(baseline) {
  const savedGoals = Array.isArray(state.goals) ? state.goals : [];
  if (savedGoals.length) return savedGoals.map(normalizeGoalForScenario);

  const label = getGoalLabel(baseline);
  const targetAmount = toNumber(baseline?.goals?.goalTargetAmount, 0);
  if (label && targetAmount > 0) {
    return [
      normalizeGoalForScenario({
        id: "primary-goal",
        title: label,
        category: label,
        targetAmount,
        currentAmount: getCurrentSavings(baseline),
        goalTimelineMonths: toNumber(baseline?.goals?.goalTimelineMonths, 18),
        priority: "high",
        fundingSource: "cash"
      })
    ];
  }

  const currentSavings = getCurrentSavings(baseline);
  return defaultGoals.slice(0, 3).map((goal) => normalizeGoalForScenario({
    ...goal,
    currentAmount: Math.min(currentSavings, goal.targetAmount)
  }));
}

function buildScenarioSession({ prompt = state.question, draft = null } = {}) {
  const profile = getScenarioProfileFromBaseline(state.baseline);
  const goals = getGoalsFromBaseline(state.baseline);
  return buildDecisionSession({
    prompt,
    draft,
    profile,
    goals,
    catalog: starterScenarios
  });
}

function toLegacyDecisionFromSession(session) {
  const result = session.result;
  const draft = session.draft || result.draft || {};
  const monthlyImpact = result.monthlyCashFlowImpact || 0;
  const oneTimeImpact = -Math.abs(toNumber(draft.oneTimeCost || draft.upfrontCost || draft.moveCost || draft.legalCost, 0));
  const mostImpactedGoal = result.goalsSummary?.mostImpactedGoal;
  return {
    question: session.prompt || draft.prompt || state.question,
    scenarioSession: session,
    decision: {
      type: result.scenario?.title || draft.type || "Decision",
      monthlyImpact,
      oneTimeImpact,
      taxSavingsMonthly: 0,
      taxSavingsOneTime: 0,
      taxImpact: "Educational estimate only. Verify tax treatment with a qualified professional.",
      assumptions: (result.scenario?.assumptions || []).slice(0, 6).map((value, index) => ({
        label: `Assumption ${index + 1}`,
        value
      })),
      compoundMonthlyDelta: Math.max(toNumber(draft.monthlyInvestingDelta, 0), 0)
    },
    currentBuffer: result.currentPath?.monthlyFreeCash ?? getMonthlyBuffer(state.baseline),
    newBuffer: result.scenarioPath?.monthlyFreeCash ?? getMonthlyBuffer(state.baseline),
    projectedSavings12: Math.max((result.scenarioPath?.liquidAssets ?? getCurrentSavings(state.baseline)) + Math.max(result.scenarioPath?.monthlyFreeCash ?? 0, 0) * 12, 0),
    taxAdjustedMonthlyImpact: monthlyImpact,
    taxAdjustedOneTimeImpact: oneTimeImpact,
    risk: {
      label: result.risk?.label || "Medium",
      className: result.risk?.label === "High" ? "risk-high" : result.risk?.label === "Medium" ? "risk-medium" : "risk-low"
    },
    goalDelay: Number.isFinite(mostImpactedGoal?.deltaMonths) ? Math.max(Math.round(mostImpactedGoal.deltaMonths), 0) : 0,
    currentGoalMonths: Number.isFinite(mostImpactedGoal?.baselineMonths) ? Math.round(mostImpactedGoal.baselineMonths) : 0,
    newGoalMonths: Number.isFinite(mostImpactedGoal?.scenarioMonths) ? Math.round(mostImpactedGoal.scenarioMonths) : 0,
    compoundGrowth: 0,
    compoundOpportunity: null,
    explanation: `${result.ahaMoment} ${result.nextStep}`,
    runwayMonths: Number.isFinite(result.scenarioPath?.runwayMonths) ? Math.round(result.scenarioPath.runwayMonths) : "stable",
    sandboxInsight: getTopConnectedExpenses(state.baseline, 1)[0]
      ? `Connected data shows ${getTopConnectedExpenses(state.baseline, 1)[0].name.toLowerCase()} as a major recurring cost.`
      : "Connected baseline data is shaping this outcome.",
    mostImpactedGoal: mostImpactedGoal?.title || getGoalLabel(state.baseline) || "Main goal"
  };
}

function parseMoneyValue(value, suffix = "") {
  const numeric = Number(String(value || "").replace(/,/g, ""));
  if (!Number.isFinite(numeric)) return 0;
  if (/k/i.test(suffix)) return numeric * 1000;
  if (/m/i.test(suffix)) return numeric * 1000000;
  return numeric;
}

function collectAmounts(question) {
  const amounts = [];
  const patterns = [
    /(?:\$|usd\s*)\s*(\d[\d,]*(?:\.\d+)?)\s*([kKmM])?/g,
    /(\d[\d,]*(?:\.\d+)?)\s*([kKmM])?\s*(?:dollars?|bucks|usd)\b/gi
  ];

  for (const pattern of patterns) {
    for (const match of question.matchAll(pattern)) {
      const amount = parseMoneyValue(match[1], match[2] || "");
      if (amount > 0) amounts.push({ amount, index: match.index || 0 });
    }
  }

  return amounts.sort((left, right) => left.index - right.index);
}

function parseMonthlyAmount(question) {
  const monthlyPatterns = [
    /(?:\$|usd\s*)\s*(\d[\d,]*(?:\.\d+)?)\s*([kKmM])?\s*(?:\/|per)\s*(?:month|mo)\b/i,
    /(?:\$|usd\s*)\s*(\d[\d,]*(?:\.\d+)?)\s*([kKmM])?\s*(?:monthly|each month|every month)\b/i,
    /(\d[\d,]*(?:\.\d+)?)\s*([kKmM])?\s*(?:\/|per)\s*(?:month|mo)\b/i
  ];

  for (const pattern of monthlyPatterns) {
    const match = question.match(pattern);
    if (match) return parseMoneyValue(match[1], match[2] || "");
  }

  return 0;
}

function parseSignedMonthlyAmount(question) {
  const monthlyPatterns = [
    /([+-])\s*(?:\$|usd\s*)\s*(\d[\d,]*(?:\.\d+)?)\s*([kKmM])?\s*(?:\/|per)\s*(?:month|mo)\b/i,
    /(?:\$|usd\s*)\s*([+-])\s*(\d[\d,]*(?:\.\d+)?)\s*([kKmM])?\s*(?:\/|per)\s*(?:month|mo)\b/i,
    /(increase|raise|more|extra|gain|up|decrease|cut|drop|less|lose|loss|down)\s+(?:by\s+)?(?:\$|usd\s*)?\s*(\d[\d,]*(?:\.\d+)?)\s*([kKmM])?\s*(?:\/|per)?\s*(?:month|mo|monthly)?\b/i
  ];

  for (const pattern of monthlyPatterns) {
    const match = question.match(pattern);
    if (!match) continue;
    const signOrWord = String(match[1] || "").toLowerCase();
    const amount = parseMoneyValue(match[2], match[3] || "");
    if (!amount) continue;
    const isNegative = signOrWord === "-" || /decrease|cut|drop|less|lose|loss|down/.test(signOrWord);
    return isNegative ? -amount : amount;
  }

  return 0;
}

function isSelfEmployedBaseline() {
  return state.baseline.profile.employmentStatus === "1099";
}

function hasPrototypeAccount() {
  return Boolean(state.account?.emailAddress && state.account?.firstName);
}

function hasConnectedFinancialData() {
  if (String(state.baseline?.source || "").startsWith("plaid")) return true;
  return getConnectedAccounts(state.baseline).length > 0;
}

function canAccessDashboard() {
  if (!hasPrototypeAccount()) return false;
  // Connected (Plaid/sample) data unlocks the dashboard even if some manual-entry
  // fields are missing — validateBaseline is for the manual path only.
  return hasConnectedFinancialData() || hasCompletedBaseline(state.baseline);
}

function canUseFinancialFeatures() {
  return canAccessDashboard() && hasAcceptedLegalTerms();
}

function getPrimaryActionLabel() {
  if (canUseFinancialFeatures()) return "Open dashboard";
  if (hasPrototypeAccount()) return "Finish setup";
  return "Create your account";
}

function getPrimaryActionView() {
  return canUseFinancialFeatures() ? "dashboard" : "account";
}

function getAccountPageTitle() {
  if (canUseFinancialFeatures()) return "Your account.";
  if (hasPrototypeAccount()) return "Finish setup.";
  return "Create your account.";
}

function getWorkspaceTitle() {
  const baseline = getUiBaseline(state.baseline);
  if (canUseFinancialFeatures()) return `${escapeHtml(baseline.firstName || "Your")} dashboard`;
  if (hasPrototypeAccount()) return "Finish setup";
  return "Create your account";
}

function getWaitlistActionLabel() {
  return state.waitlistJoined ? "On the waitlist" : "Join waitlist";
}

function renderHeaderActions() {
  const isDashboard = state.workspaceView === "dashboard";
  const canUseApp = canUseFinancialFeatures();
  const hasAccount = hasPrototypeAccount();
  const actions = [];

  if (!hasAccount) {
    if (isClerkConfigured()) {
      actions.push(`<button class="button button-secondary" type="button" data-clerk-signin>Sign in</button>`);
      actions.push(`<button class="button button-primary" type="button" data-clerk-signup>Create account</button>`);
    } else {
      actions.push(`<button class="button button-secondary" type="button" data-open-signin>Sign in</button>`);
      if (!state.waitlistJoined) {
        actions.push(`<button class="button button-secondary optional-header-action" type="button" data-open-waitlist>Join waitlist</button>`);
      }
      actions.push(`<button class="button button-primary" type="button" data-open-view="account">Create account</button>`);
    }
  } else if (canUseApp) {
    if (!isDashboard) {
      actions.push(`<button class="button button-primary" type="button" data-open-view="dashboard">Open dashboard</button>`);
    }
    actions.push(`<button class="button button-secondary" type="button" data-open-view="account">Profile</button>`);
  } else {
    actions.push(`<button class="button button-primary setup-attention" type="button" data-open-view="account">Finish setup →</button>`);
    actions.push(`<button class="button button-secondary" type="button" data-open-view="account">Profile</button>`);
  }

  return actions.join("");
}

function isVerificationConfirmed() {
  return state.verificationCheckStatus === "valid";
}

async function requestJson(url, options = {}) {
  try {
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => null);
    return { response, payload, error: null };
  } catch (error) {
    return {
      response: null,
      payload: null,
      error: error instanceof Error ? error.message : "Network request failed."
    };
  }
}

async function handleDemoAccessSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const code = String(formData.get("demoAccessCode") || "").trim();

  if (!code) {
    state.demoAccessMessage = "Enter the demo tester code.";
    render();
    return;
  }

  state.demoAccessBusy = true;
  state.demoAccessMessage = "";
  render();

  const { payload, error } = await requestJson("/api/account/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "demo_access", code })
  });

  state.demoAccessBusy = false;
  if (error || !payload?.ok) {
    state.demoAccessMessage = payload?.error || error || "That demo code does not work yet.";
    render();
    return;
  }

  saveDemoAccess(payload.expiresDays || 30);
  state.demoAccessMessage = "Preview unlocked. Loading PAM.";
  trackEvent("demo_access_unlocked");
  window.location.reload();
}

async function restoreSessionAccount() {
  // Clerk mode: read account from Clerk's active session
  if (isClerkMode()) {
    const clerkAccount = getClerkAccount();
    if (!clerkAccount) return null;
    state.account = clerkAccount;
    const headers = await buildAuthHeaders();
    const { payload } = await requestJson("/api/account/session", { headers });
    if (payload?.baseline) {
      saveBaseline(syncAccountIntoBaseline(clerkAccount, payload.baseline));
    }
    if (payload?.legalAcceptance) {
      saveLegalAcceptance(payload.legalAcceptance);
    }
    if (Array.isArray(payload?.decisions) && payload.decisions.length) {
      seedDecisionHistoryFromServer(payload.decisions);
    }
    try {
      if (state.cookieConsent === "accepted" && clerkAccount.id && window.posthog?.identify) {
        window.posthog.identify(clerkAccount.id, { email: clerkAccount.emailAddress, name: clerkAccount.firstName });
      }
    } catch (_error) {}
    return clerkAccount;
  }

  // Legacy mode: custom session token
  if (!state.sessionToken) return null;
  const { payload, error } = await requestJson(`/api/account/session?sessionToken=${encodeURIComponent(state.sessionToken)}`);
  if (error) {
    setStatus("Could not confirm your saved session. Try again in a moment.", "account");
    return state.account;
  }
  if (!payload?.ok || !payload?.account) {
    saveSessionToken(null);
    state.account = null;
    return null;
  }
  state.account = payload.account;
  if (payload.baseline) {
    saveBaseline(state.account ? syncAccountIntoBaseline(state.account, payload.baseline) : payload.baseline);
  }
  if (payload.legalAcceptance) {
    saveLegalAcceptance(payload.legalAcceptance);
  }
  if (Array.isArray(payload.decisions) && payload.decisions.length) {
    seedDecisionHistoryFromServer(payload.decisions);
  }
  try {
    if (state.cookieConsent === "accepted" && payload.account?.id && window.posthog?.identify) {
      window.posthog.identify(payload.account.id, {
        email: payload.account.emailAddress,
        name: payload.account.firstName
      });
    }
  } catch (_error) {}
  return payload.account;
}

async function logoutAccount() {
  if (state.sessionToken) {
    await fetch("/api/account/session", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionToken: state.sessionToken })
    }).catch(() => null);
  }
  saveSessionToken(null);
  state.account = null;
  state.baseline = clearStoredBaseline();
  state.result = null;
  state.aiGuidance = null;
  state.accountDraft = null;
  state.legalAcceptance = null;
  state.verificationPreviewCode = "";
  state.verificationWarning = "";
  state.verificationMaskedEmail = "";
  state.verificationExpiresAt = "";
  saveWorkspaceView("landing");
  try {
    window.localStorage.removeItem(LEGAL_ACCEPTANCE_KEY);
  } catch (_error) {
    // Legal acceptance is user/session scoped.
  }
  try {
    window.posthog?.reset?.();
  } catch (_error) {}
  if (isClerkMode()) {
    try { await window.Clerk.signOut(); } catch (_error) {}
  }
  clearStatus();
  render();
}

function syncAccountIntoBaseline(account, baseline = state.baseline) {
  if (!account) return baseline;
  const nextBaseline = JSON.parse(JSON.stringify(baseline || getEmptyBaseline()));
  nextBaseline.profile = nextBaseline.profile || getEmptyBaseline().profile;
  nextBaseline.profile.firstName = account.firstName || nextBaseline.profile.firstName || "";
  nextBaseline.profile.emailAddress = account.emailAddress || nextBaseline.profile.emailAddress || "";
  nextBaseline.profile.name = nextBaseline.profile.firstName;
  nextBaseline.profile.age = hasValue(account.age) ? toNumber(account.age, null) : nextBaseline.profile.age ?? null;
  nextBaseline.profile.creditScore = hasValue(account.creditScore) ? toNumber(account.creditScore, null) : nextBaseline.profile.creditScore ?? null;
  nextBaseline.profile.employmentStatus = labelToEmploymentStatus(account.employmentStatus || nextBaseline.profile.employmentStatus);
  nextBaseline.profile.state = account.stateCode || nextBaseline.profile.state || "OTHER";
  nextBaseline.metadata = nextBaseline.metadata || {};
  nextBaseline.metadata.updatedAt = new Date().toISOString();
  return nextBaseline;
}

function inferGoalFromDecision(decision = "") {
  const normalized = String(decision || "").toLowerCase();
  if (/move|apartment|rent|independent|parents/.test(normalized)) return "Move out safely";
  if (/car|auto|vehicle|payment/.test(normalized)) return "Buy a car safely";
  if (/invest|roth|ira|compound|retire|stock/.test(normalized)) return "Start investing";
  if (/debt|loan|credit card|pay down/.test(normalized)) return "Pay down debt";
  if (/emergency|buffer|runway|savings/.test(normalized)) return "Build emergency savings";
  return decision ? "Make a safer money decision" : "";
}

function applyOnboardingContextToBaseline(account, draft = {}, baseline = state.baseline) {
  const nextBaseline = syncAccountIntoBaseline(account, baseline);
  const cityOrZip = String(draft.cityOrZip || nextBaseline.profile?.cityOrZip || "").trim();
  const inferredState = inferStateFromLocation(cityOrZip);
  const firstDecision = String(draft.firstDecision || state.question || "").trim();
  const inferredGoal = inferGoalFromDecision(firstDecision);
  const creditScore = hasValue(draft.creditScore) ? toNumber(draft.creditScore, null) : nextBaseline.profile?.creditScore ?? null;

  nextBaseline.profile.cityOrZip = cityOrZip;
  nextBaseline.profile.creditScore = creditScore;
  if (inferredState && (!nextBaseline.profile.state || nextBaseline.profile.state === "OTHER")) {
    nextBaseline.profile.state = inferredState;
  }
  nextBaseline.metadata = nextBaseline.metadata || {};
  nextBaseline.metadata.onboarding = {
    cityOrZip,
    inferredState: inferredState || nextBaseline.profile.state || "OTHER",
    creditScoreProvided: hasValue(creditScore),
    firstDecision,
    inferredGoal,
    updatedAt: new Date().toISOString()
  };
  nextBaseline.metadata.notes = Array.from(new Set([
    ...(nextBaseline.metadata.notes || []),
    cityOrZip ? `Location: ${cityOrZip}` : "",
    hasValue(creditScore) ? `Credit score range: ${creditScore}` : "",
    firstDecision ? `First decision: ${firstDecision}` : ""
  ].filter(Boolean)));

  if (inferredGoal && !nextBaseline.goals?.primaryGoal) {
    const emergencyFloor = nextBaseline.savings?.emergencyFundFloor || getMonthlyExpenses(nextBaseline) * 3 || null;
    const defaults = estimateGoalDefaults(inferredGoal, emergencyFloor);
    nextBaseline.goals = nextBaseline.goals || {};
    nextBaseline.goals.primaryGoal = inferredGoal;
    nextBaseline.goals.customGoalLabel = "";
    nextBaseline.goals.goalTargetAmount = nextBaseline.goals.goalTargetAmount || defaults?.target || null;
    nextBaseline.goals.goalTimelineMonths = nextBaseline.goals.goalTimelineMonths || defaults?.timeline || null;
    nextBaseline.goals.goalTargetEstimated = !hasValue(nextBaseline.goals.goalTargetAmount);
    nextBaseline.goals.goalTimelineEstimated = !hasValue(nextBaseline.goals.goalTimelineMonths);
  }

  return nextBaseline;
}

function inferPotentialDeduction(question, amount, cadence = "one-time") {
  const normalized = question.toLowerCase();
  const isWorkRelated = /business|work|client|freelance|1099|self[- ]?employ|contractor|side hustle|office|software|laptop|computer|equipment|mileage|marketing|website|course|training|professional|supplies|cowork|home office/.test(normalized);
  const requestedDeduction = /deduct|write[ -]?off|tax break|business expense/.test(normalized);

  if (!amount || (!isWorkRelated && !requestedDeduction)) {
    return {
      isPotentiallyDeductible: false,
      taxSavings: 0,
      note: "No likely deduction detected from the wording. PAM treats this as a regular cash decision."
    };
  }

  if (!isSelfEmployedBaseline()) {
    return {
      isPotentiallyDeductible: false,
      taxSavings: 0,
      note: "This may be work-related, but PAM only models a deduction when the baseline is self-employed/1099. W-2 workers may need reimbursement or specific eligibility."
    };
  }

  const businessUseShare = /car|auto|vehicle|truck|suv|travel|trip|mileage|home office/.test(normalized) ? 0.5 : 1;
  const deductibleAmount = amount * businessUseShare;
  const taxSavings = Math.round(deductibleAmount * (toNumber(state.baseline.tax.combinedTaxRate) / 100));
  const useNote = businessUseShare < 1
    ? "PAM assumes 50% business use for mixed-use costs like car, mileage, travel, or home office."
    : "PAM assumes this is fully business-related based on the wording.";

  return {
    isPotentiallyDeductible: true,
    deductibleAmount,
    taxSavings,
    note: `${useNote} Actual deductibility depends on business purpose, records, and current tax rules.`
  };
}

function inferDecision(question) {
  const normalized = question.toLowerCase();
  const amounts = collectAmounts(question);
  const firstAmount = amounts[0]?.amount || 0;
  const monthlyAmount = parseMonthlyAmount(question);
  const decision = {
    type: "Financial decision",
    monthlyImpact: 0,
    oneTimeImpact: 0,
    taxImpact: "No direct change",
    taxSavingsMonthly: 0,
    taxSavingsOneTime: 0,
    deductibleNote: "",
    compoundMonthlyDelta: 0,
    assumptions: []
  };

  if (/income change|raise|pay cut|income drop|lose income|lost income|more income|extra income|salary change|part[- ]?time|hours cut/.test(normalized)) {
    decision.type = "Income change";
    const signedMonthlyChange = parseSignedMonthlyAmount(question) || (/(lose|loss|drop|cut|less|down)/.test(normalized) ? -Math.abs(monthlyAmount || firstAmount || 500) : Math.abs(monthlyAmount || firstAmount || 500));
    decision.monthlyImpact = signedMonthlyChange;
    decision.taxImpact = signedMonthlyChange > 0
      ? "Additional income may increase estimated taxes, so PAM treats this as a pre-tax planning signal unless exact withholding is known."
      : "Lower income may reduce estimated taxes, but the cash-flow drop usually matters first.";
    decision.assumptions.push({ label: "Monthly income change", value: `${signedMonthlyChange >= 0 ? "+" : "-"}${formatCurrency(Math.abs(signedMonthlyChange))}/month` });
    return decision;
  }

  if (/1099|freelance|contractor|self[- ]?employ|side hustle/.test(normalized)) {
    decision.type = "Employment / tax change";
    const baselineView = getUiBaseline(state.baseline);
    const newGross = monthlyAmount || firstAmount || baselineView.grossMonthlyIncome;
    const taxProfile = estimateTaxProfile({
      ...state.baseline,
      profile: {
        ...state.baseline.profile,
        employmentStatus: "1099"
      },
      income: {
        ...state.baseline.income,
        grossMonthlyIncome: newGross,
        knownTakeHomeMonthlyIncome: null
      },
      tax: {
        ...state.baseline.tax,
        taxRateOverride: false
      }
    });
    decision.monthlyImpact = taxProfile.takeHomeIncome - getSpendableIncome(state.baseline);
    decision.taxImpact = `Estimated combined tax rate changes to ${taxProfile.combinedTaxRate}%. Self-employment taxes may require setting aside more cash.`;
    decision.assumptions.push({ label: "Modeled income", value: `${formatCurrency(newGross)}/month gross` });
    decision.assumptions.push({ label: "Employment status", value: "1099 / self-employed" });
    return decision;
  }

  if (/invest|compound|retire|ira|roth|saving early|start saving/.test(normalized)) {
    decision.type = "Saving / investing decision";
    decision.monthlyImpact = -(monthlyAmount || firstAmount || 200);
    decision.compoundMonthlyDelta = Math.abs(decision.monthlyImpact);
    decision.taxImpact = /roth|ira|retire/.test(normalized)
      ? "Tax-advantaged accounts may matter, but eligibility and contribution rules depend on income and regulations."
      : "No direct tax change unless contributions affect taxable income.";
    decision.assumptions.push({ label: "Monthly contribution", value: `${formatCurrency(Math.abs(decision.monthlyImpact))}/month` });
    return decision;
  }

  if (/rent|move|apartment|lease|housing/.test(normalized)) {
    decision.type = "Housing decision";
    const estimatedCurrentRent = Math.round(getMonthlyExpenses(state.baseline) * 0.55);
    const newRent = monthlyAmount || firstAmount || 1800;
    decision.monthlyImpact = -(Math.max(newRent - estimatedCurrentRent, 0));
    decision.compoundMonthlyDelta = Math.abs(decision.monthlyImpact);
    decision.assumptions.push({ label: "New rent", value: `${formatCurrency(newRent)}/month` });
    decision.assumptions.push({ label: "Estimated current housing", value: `${formatCurrency(estimatedCurrentRent)}/month` });
    decision.taxImpact = "No direct change";
    return decision;
  }

  if (/car|auto|vehicle|truck|suv|payment/.test(normalized)) {
    decision.type = "Car purchase";
    const modeledMonthlyCost = monthlyAmount || firstAmount || 400;
    const deduction = inferPotentialDeduction(question, modeledMonthlyCost, "monthly");
    decision.monthlyImpact = -modeledMonthlyCost;
    decision.compoundMonthlyDelta = Math.abs(decision.monthlyImpact);
    decision.taxSavingsMonthly = deduction.isPotentiallyDeductible ? deduction.taxSavings : 0;
    decision.deductibleNote = deduction.note;
    decision.assumptions.push({ label: "Car payment / ownership cost", value: `${formatCurrency(Math.abs(decision.monthlyImpact))}/month` });
    if (deduction.isPotentiallyDeductible) {
      decision.assumptions.push({ label: "Possible tax offset", value: `${formatCurrency(decision.taxSavingsMonthly)}/month` });
    }
    decision.taxImpact = deduction.isPotentiallyDeductible
      ? `Potential self-employed deduction detected. Estimated tax offset: ${formatCurrency(decision.taxSavingsMonthly)}/month. ${deduction.note}`
      : deduction.note;
    return decision;
  }

  if (/trip|travel|vacation|emergency|repair|medical|bill|wedding|expense/.test(normalized)) {
    decision.type = /trip|travel|vacation/.test(normalized) ? "Trip / travel spend" : "One-time expense";
    const modeledCost = firstAmount || 2500;
    const deduction = inferPotentialDeduction(question, modeledCost);
    decision.oneTimeImpact = -modeledCost;
    decision.taxSavingsOneTime = deduction.isPotentiallyDeductible ? deduction.taxSavings : 0;
    decision.deductibleNote = deduction.note;
    decision.assumptions.push({ label: "One-time cost", value: formatCurrency(Math.abs(decision.oneTimeImpact)) });
    if (deduction.isPotentiallyDeductible) {
      decision.assumptions.push({ label: "Possible tax offset", value: formatCurrency(decision.taxSavingsOneTime) });
    }
    decision.taxImpact = deduction.isPotentiallyDeductible
      ? `Potential self-employed deduction detected. Estimated tax offset: ${formatCurrency(decision.taxSavingsOneTime)}. ${deduction.note}`
      : deduction.note;
    return decision;
  }

  if (firstAmount) {
    const deduction = inferPotentialDeduction(question, firstAmount);
    decision.type = "One-time decision";
    decision.oneTimeImpact = -firstAmount;
    decision.taxSavingsOneTime = deduction.isPotentiallyDeductible ? deduction.taxSavings : 0;
    decision.deductibleNote = deduction.note;
    decision.assumptions.push({ label: "One-time cost", value: formatCurrency(firstAmount) });
    if (deduction.isPotentiallyDeductible) {
      decision.assumptions.push({ label: "Possible tax offset", value: formatCurrency(decision.taxSavingsOneTime) });
    }
    decision.taxImpact = deduction.isPotentiallyDeductible
      ? `Potential self-employed deduction detected. Estimated tax offset: ${formatCurrency(decision.taxSavingsOneTime)}. ${deduction.note}`
      : deduction.note;
    return decision;
  }

  decision.assumptions.push({ label: "Decision shape", value: "PAM needs a dollar amount for a sharper estimate." });
  return decision;
}

function getRisk(newBuffer) {
  if (newBuffer > 750) return { label: "Low", className: "risk-low" };
  if (newBuffer >= 250) return { label: "Medium", className: "risk-medium" };
  return { label: "High", className: "risk-high" };
}

function formatMonths(months) {
  return `${months} ${months === 1 ? "month" : "months"}`;
}

function estimateCompoundGrowth(monthlyContribution, years = 10, annualReturn = 0.06) {
  if (monthlyContribution <= 0) return 0;
  const monthlyReturn = annualReturn / 12;
  const months = years * 12;
  return monthlyContribution * (((1 + monthlyReturn) ** months - 1) / monthlyReturn);
}

function estimateCompoundOpportunity(monthlyContribution, age, annualReturn = 0.1, retirementAge = 65) {
  if (monthlyContribution <= 0 || !hasValue(age)) return null;
  const years = Math.max(retirementAge - toNumber(age), 0);
  if (years <= 0) return null;
  const futureValue = estimateCompoundGrowth(monthlyContribution, years, annualReturn);
  return {
    years,
    retirementAge,
    annualReturn,
    futureValue
  };
}

function getTopConnectedExpenses(baseline, limit = 3) {
  const recurring = Array.isArray(baseline?.expenses?.recurringExpenses) ? baseline.expenses.recurringExpenses : [];
  return recurring
    .slice()
    .sort((left, right) => Number(right.amount || 0) - Number(left.amount || 0))
    .slice(0, limit);
}

function getConnectedAccounts(baseline) {
  return Array.isArray(baseline?.savings?.connectedAccounts) ? baseline.savings.connectedAccounts : [];
}

// Compute the deterministic values-based insights and condense them into a
// compact object the AI can read so its guidance is grounded in the same math
// the dashboard cards show. Returns null if values onboarding isn't complete.
function buildValuesInsightsForAI() {
  const uv = state.userValues;
  if (!uv?.completed) return null;
  const profile = getValuesProfile();
  const insights = {};

  const conflicts = detectGoalConflicts(uv, profile);
  if (conflicts.length) {
    insights.goalConflicts = conflicts.slice(0, 3).map((c) => ({
      severity: c.severity,
      title: c.title,
      detail: c.detail
    }));
  }

  const career = simulateCareerVelocity(uv, profile);
  if (career?.shouldTrigger) {
    insights.careerVelocity = {
      stayFinalSalary: career.pathA.finalSalary,
      switchFinalSalary: career.pathB.finalSalary,
      stayRetirementAge: career.pathA.retirementAge,
      switchRetirementAge: career.pathB.retirementAge,
      tenYearEarningsDelta: career.earningsDelta,
      yearsSaved: career.yearsSaved
    };
  }

  const location = simulateLocationArbitrage(uv, profile);
  if (location) {
    insights.locationArbitrage = {
      targetCity: location.targetCity,
      industry: location.industryKey,
      netAnnualGain: location.netAnnualGain,
      retireAgeStay: location.retireAgeStay,
      retireAgeMove: location.retireAgeMove,
      yearsSaved: location.yearsSaved
    };
  }

  const priorities = (Array.isArray(uv.lifestyle_priorities) ? uv.lifestyle_priorities : []).map((p) => String(p).toLowerCase());
  if (priorities.includes("homeownership") || (state.lifeValues || []).includes("Buy a home")) {
    const housing = simulateBuyVsRent(uv, profile);
    insights.buyVsRent = {
      recommendation: housing.recommendation,
      buyNetWorth10yr: housing.buy.projectedNetWorth,
      rentNetWorth10yr: housing.rent.projectedNetWorth,
      netWorthDelta: housing.netWorthDelta
    };
  }

  return Object.keys(insights).length ? insights : null;
}

// A short, human-relative label for how long ago a decision was made.
function relativeTimeLabel(iso) {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "recently";
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} week${days < 14 ? "" : "s"} ago`;
  return `${Math.floor(days / 30)} month${days < 60 ? "" : "s"} ago`;
}

// The last few decisions PAM has already modeled for this person, so the AI can
// build on the arc ("last week you weighed the NYC move…") instead of treating
// every question as the first. Excludes the current question.
function buildRecentDecisionsForAI(currentQuestion = "") {
  const current = String(currentQuestion || "").trim().toLowerCase();
  return (state.decisionHistory || [])
    .filter((d) => String(d.question || "").trim().toLowerCase() !== current)
    .slice(0, 4)
    .map((d) => ({
      question: d.question,
      when: relativeTimeLabel(d.createdAt),
      risk: d.risk,
      monthlyImpact: d.monthlyImpact,
      newBuffer: d.newBuffer,
      goalDelay: d.goalDelay,
      mostImpactedGoal: d.mostImpactedGoal
    }));
}

// A deterministic financial summary so the AI sees net worth and account
// COMPOSITION (liquid cash vs investments vs money locked in retirement
// accounts), not just a single savings number. Composition drives strategist
// calls — e.g. 401(k)-vs-early-retirement depends on how much is already locked.
function buildFinancialSummaryForAI(baseline) {
  const accounts = getConnectedAccounts(baseline);
  if (!accounts.length) return null;
  const liabilities = Array.isArray(baseline?.obligations?.liabilities) ? baseline.obligations.liabilities : [];
  const isType = (a, re) => re.test(String(a.type || "") + " " + String(a.subtype || "") + " " + String(a.name || ""));
  const sum = (list, re) => list.filter((a) => isType(a, re)).reduce((t, a) => t + toNumber(a.current, 0), 0);

  const checking = sum(accounts, /checking/i);
  const savings = sum(accounts, /saving/i);
  const lockedRetirement = sum(accounts, /401|ira|retire|pension|403b/i);
  const investments = sum(accounts, /invest|brokerage|securities|mutual/i);
  const totalAssets = accounts.reduce((t, a) => t + toNumber(a.current, 0), 0);
  const totalLiabilities = liabilities.reduce((t, l) => t + toNumber(l.balance, 0), 0);

  return {
    netWorth: Math.round(totalAssets - totalLiabilities),
    totalAssets: Math.round(totalAssets),
    totalLiabilities: Math.round(totalLiabilities),
    liquidCash: Math.round(checking + savings),
    investments: Math.round(investments),
    lockedRetirement: Math.round(lockedRetirement),
    accountCount: accounts.length,
    accounts: accounts.slice(0, 6).map((a) => ({ name: a.name || "Account", type: a.type || "", balance: Math.round(toNumber(a.current, 0)) }))
  };
}

function getConnectedSnapshot(baseline) {
  return {
    source: baseline.source,
    profile: { ...baseline.profile, lifeValues: state.lifeValues || baseline.profile?.lifeValues || [], payFrequency: state.payFrequency || baseline.profile?.payFrequency || "" },
    income: baseline.income,
    expenses: {
      monthlyExpenses: baseline.expenses?.monthlyExpenses,
      recurringExpenses: getTopConnectedExpenses(baseline, 5)
    },
    obligations: baseline.obligations,
    savings: baseline.savings,
    tax: baseline.tax,
    goals: baseline.goals,
    userValues: state.userValues || null,
    valuesInsights: buildValuesInsightsForAI(),
    recentDecisions: buildRecentDecisionsForAI(state.question),
    financialSummary: buildFinancialSummaryForAI(baseline)
  };
}

async function requestDecisionGuidance(question, result) {
  // The deterministic result is already on screen; AI guidance only refines it.
  // A hard timeout means a slow upstream call can never leave the result stuck
  // in the "refining" state.
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch("/api/decision", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt: question,
        baseline: getConnectedSnapshot(state.baseline),
        result
      }),
      signal: controller.signal
    });

    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      return null;
    }

    return payload;
  } catch (_error) {
    return null;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function runDecisionAnalysis(question, statusMessage = "Decision analyzed locally using your current baseline.", options = {}) {
  saveQuestion(question);
  saveWorkspaceView("dashboard");
  saveMobileView("ask");
  const session = options.session || buildScenarioSession({ prompt: question, draft: options.draft || null });
  state.result = toLegacyDecisionFromSession(session);
  recordDecisionHistory(state.result);
  state.aiGuidance = null;
  state.saveScenarioMessage = "";
  state.decisionBusy = true;
  trackEvent("decision_analyzed", {
    source: state.baseline.source || "unknown",
    hasQuestion: Boolean(question),
    risk: state.result?.risk?.label || ""
  });
  setStatus(`${statusMessage} PAM advisor is refining the explanation...`, "decision");
  render();
  requestAnimationFrame(() => {
    document.querySelector("#decision-result")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  try {
    const guidance = await requestDecisionGuidance(question, state.result);
    if (guidance?.guidance) {
      state.aiGuidance = guidance;
      setStatus("Decision analyzed with your baseline and server-side AI guidance.", "decision");
      showSuccessToast("Answer ready.");
      trackEvent("ai_guidance_received", { integrityFlagged: Boolean(guidance.integrityFlagged) });
    } else {
      setStatus(statusMessage, "decision");
      trackEvent("ai_guidance_unavailable");
    }
  } catch (_error) {
    setStatus(statusMessage, "decision");
  }

  state.decisionBusy = false;
  render();
  requestAnimationFrame(() => {
    document.querySelector("#decision-result")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function analyzeQuestion(question) {
  const decision = inferDecision(question);
  const currentBuffer = getMonthlyBuffer(state.baseline);
  const taxAdjustedMonthlyImpact = decision.monthlyImpact + decision.taxSavingsMonthly;
  const taxAdjustedOneTimeImpact = decision.oneTimeImpact + decision.taxSavingsOneTime;
  const newBuffer = currentBuffer + taxAdjustedMonthlyImpact;
  const currentSavings = getCurrentSavings(state.baseline);
  const goalTargetAmount = toNumber(state.baseline.goals.goalTargetAmount, 0);
  const projectedSavings12 = currentSavings + taxAdjustedOneTimeImpact + newBuffer * 12;
  const risk = getRisk(newBuffer);
  const monthlyGoalPace = Math.max(currentBuffer, 1);
  const newGoalPace = Math.max(newBuffer, 1);
  const currentGoalMonths = Math.max(Math.ceil(Math.max(goalTargetAmount - currentSavings, 0) / monthlyGoalPace), 0);
  const newGoalMonths = Math.max(Math.ceil(Math.max(goalTargetAmount - (currentSavings + taxAdjustedOneTimeImpact), 0) / newGoalPace), 0);
  const goalDelay = Math.max(newGoalMonths - currentGoalMonths, 0);
  const compoundGrowth = estimateCompoundGrowth(decision.compoundMonthlyDelta);
  const compoundOpportunity = estimateCompoundOpportunity(decision.compoundMonthlyDelta, state.baseline.profile.age);
  const explanation = risk.label === "Low"
    ? "This looks workable, but PAM still checks whether it slows your goal or reduces your safety margin."
    : risk.label === "Medium"
      ? "You can afford it on paper, but your monthly buffer becomes tighter."
      : "This decision pushes your buffer below a safe target. PAM would suggest changing the timing, income, or cost before moving forward.";
  const topExpense = getTopConnectedExpenses(state.baseline, 1)[0];
  const mostImpactedGoal = getGoalLabel(state.baseline) || "your main goal";
  const runwayMonths = newBuffer > 0
    ? "stable"
    : Math.max(Math.floor((currentSavings + taxAdjustedOneTimeImpact) / Math.abs(newBuffer || 1)), 0);
  const sandboxInsight = state.baseline.source.startsWith("plaid")
    ? topExpense
      ? `Connected data suggests ${topExpense.name.toLowerCase()} is one of your biggest recurring costs at about ${formatCurrency(topExpense.amount)}/month.`
      : "Connected data is shaping the baseline behind this outcome."
    : "Manual or fallback baseline is shaping this outcome.";

  return {
    question,
    decision,
    currentBuffer,
    newBuffer,
    projectedSavings12,
    taxAdjustedMonthlyImpact,
    taxAdjustedOneTimeImpact,
    risk,
    goalDelay,
    currentGoalMonths,
    newGoalMonths,
    compoundGrowth,
    compoundOpportunity,
    explanation,
    runwayMonths,
    sandboxInsight,
    mostImpactedGoal
  };
}

function readBaselineForm(form) {
  const formData = new FormData(form);
  const baseline = getUiBaseline(state.baseline);
  const fieldNumber = (key) => formData.has(key) ? toNumber(formData.get(key)) : baseline[key];
  return {
    firstName: String(formData.get("firstName") || baseline.firstName),
    emailAddress: String(formData.get("emailAddress") || baseline.emailAddress),
    age: formData.has("age") ? toNumber(formData.get("age")) : baseline.age,
    creditScore: formData.has("creditScore") ? toNumber(formData.get("creditScore")) : baseline.creditScore,
    grossMonthlyIncome: fieldNumber("grossMonthlyIncome"),
    knownTakeHomeMonthlyIncome: fieldNumber("knownTakeHomeMonthlyIncome"),
    employmentStatus: String(formData.get("employmentStatus") || baseline.employmentStatus),
    stateCode: String(formData.get("stateCode") || baseline.stateCode),
    combinedTaxRate: fieldNumber("combinedTaxRate"),
    taxRateOverride: formData.has("taxRateOverride") ? formData.get("taxRateOverride") === "on" : baseline.taxRateOverride,
    monthlyExpenses: fieldNumber("monthlyExpenses"),
    monthlyObligations: fieldNumber("monthlyObligations"),
    currentSavings: fieldNumber("currentSavings"),
    retirementContributions: fieldNumber("retirementContributions"),
    deductions: fieldNumber("deductions"),
    longTermGoal: String(formData.get("longTermGoal") || baseline.longTermGoal),
    customGoalLabel: String(formData.get("customGoalLabel") || baseline.customGoalLabel),
    goalTargetAmount: fieldNumber("goalTargetAmount"),
    goalTimelineMonths: fieldNumber("goalTimelineMonths")
  };
}

async function handleCreateAccount(event) {
  event.preventDefault();
  saveCurrentStepValue(event.currentTarget);
  const draft = ensureAccountDraft();
  const firstName = String(draft.firstName || "").trim();
  const emailAddress = String(draft.emailAddress || "").trim();
  const verificationCode = String(draft.verificationCode || "").trim();
  const verificationRequestId = String(draft.verificationRequestId || "").trim();
  const verificationToken = String(draft.verificationToken || "").trim();
  const password = String(draft.password || "");
  const confirmPassword = String(draft.confirmPassword || "");
  const age = hasValue(draft.age) ? toNumber(draft.age, null) : null;
  const employmentStatus = String(draft.employmentStatus || "Not sure yet");
  const stateCode = inferStateFromLocation(draft.cityOrZip) || String(draft.stateCode || "OTHER");

  if (!firstName || !emailAddress || !password) {
    setStatus("Add your first name, email, and password before creating your account.", "account");
    render();
    return;
  }

  if (password.length < 8) {
    setStatus("Use at least 8 characters for your password.", "account");
    render();
    return;
  }

  if (password !== confirmPassword) {
    setStatus("Passwords don't match.", "account");
    render();
    return;
  }

  if (!isVerificationConfirmed()) {
    setStatus("Confirm the verification code before creating your account.", "account");
    render();
    return;
  }

  const onboardingContext = {
    cityOrZip: String(draft.cityOrZip || "").trim(),
    creditScore: hasValue(draft.creditScore) ? toNumber(draft.creditScore, null) : null,
    firstDecision: String(draft.firstDecision || "").trim()
  };

  const { payload, error } = await requestJson("/api/account/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      firstName,
      emailAddress,
      verificationCode,
      verificationRequestId,
      ...(verificationToken ? { verificationToken } : {}),
      password,
      age,
      employmentStatus,
      stateCode
    })
  });

  if (error || !payload?.ok) {
    const message = payload?.error || error || "Unable to create account.";
    if (/fresh verification|verification expired|expired/i.test(message)) {
      draft.verificationCode = "";
      draft.verificationRequestId = "";
      draft.verificationToken = "";
      state.createAccountStep = CREATE_ACCOUNT_STEPS.findIndex((step) => step.key === "verificationCode");
      setStatus("Code expired. Sending a new one.", "account");
      render();
      await handleSendVerificationCode({ quiet: true });
      return;
    }
    if (/account with that email already exists|email already exists|already exists/i.test(message)) {
      state.accountErrorAction = "signin";
      setStatus("An account already exists for this email.", "account");
      render();
      return;
    }
    setStatus(message, "account");
    render();
    return;
  }

  saveSessionToken(payload.sessionToken);
  state.account = payload.account;
  if (onboardingContext.firstDecision) {
    saveQuestion(onboardingContext.firstDecision);
  }
  saveBaseline(applyOnboardingContextToBaseline(payload.account, onboardingContext, state.baseline));
  state.aiGuidance = null;
  state.legalAcceptance = null;
  try {
    window.localStorage.removeItem(LEGAL_ACCEPTANCE_KEY);
  } catch (_error) {
    // User will be gated by in-memory legal state if storage is unavailable.
  }
  state.accountDraft = getInitialAccountDraft();
  state.createAccountStep = 0;
  state.verificationPreviewCode = "";
  state.verificationWarning = "";
  state.verificationMaskedEmail = "";
  state.verificationExpiresAt = "";
  state.verificationCheckStatus = "";
  state.verificationCheckMessage = "";
  state.lastCheckedVerificationCode = "";
  setStatus("PAM model started. Accept the legal terms, then connect your financial baseline.", "account");
  saveAuthView("signin");
  saveWorkspaceView("account");
  trackEvent("account_created", {
    stateCode,
    employmentStatus
  });
  render();
}

async function handleLogin(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const emailAddress = String(formData.get("loginEmailAddress") || "").trim();
  const password = String(formData.get("loginPassword") || "");

  if (!emailAddress || !password) {
    setStatus("Add your email and password to sign in.", "account");
    render();
    return;
  }

  const { payload, error } = await requestJson("/api/account/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      emailAddress,
      password
    })
  });

  if (error || !payload?.ok) {
    setStatus(payload?.error || error || "Unable to sign in.", "account");
    render();
    return;
  }

  saveSessionToken(payload.sessionToken);
  state.account = payload.account;
  saveBaseline(syncAccountIntoBaseline(payload.account, payload.baseline || state.baseline));
  if (payload.legalAcceptance) {
    saveLegalAcceptance(payload.legalAcceptance);
  }
  state.aiGuidance = null;
  try {
    if (state.cookieConsent === "accepted" && payload.account?.id && window.posthog?.identify) {
      window.posthog.identify(payload.account.id, {
        email: payload.account.emailAddress,
        name: payload.account.firstName
      });
    }
  } catch (_error) {}
  routeSignedInUser("Signed in.");
  trackEvent("account_signed_in", {
    stateCode: payload.account?.stateCode || "",
    employmentStatus: payload.account?.employmentStatus || ""
  });
  render();
}

async function handleSendVerificationCode(options = {}) {
  const { quiet = false } = options;
  const draft = ensureAccountDraft();
  const emailAddress = String(draft.emailAddress || "").trim();
  const firstName = String(draft.firstName || "").trim();

  if (!emailAddress) {
    if (!quiet) {
      setStatus("Add your email first.", "account");
      render();
    }
    return;
  }

  const { payload, error } = await requestJson("/api/account/request-code", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      emailAddress,
      firstName
    })
  });

  if (error || !payload?.ok) {
    setStatus(payload?.error || error || "Could not send code.", "account");
    render();
    return;
  }

  draft.verificationRequestId = String(payload.requestId || "");
  draft.verificationToken = String(payload.verificationToken || "");
  draft.verificationCode = "";
  state.verificationMaskedEmail = String(payload.maskedEmail || emailAddress);
  state.verificationPreviewCode = String(payload.previewCode || "");
  state.verificationWarning = String(payload.warning || "");
  state.verificationExpiresAt = String(payload.expiresAt || "");
  state.verificationCheckStatus = "";
  state.verificationCheckMessage = "";
  state.lastCheckedVerificationCode = "";
  setStatus(payload.deliveryMode === "prototype_preview" ? "Code ready." : "Code sent.", "account");
  render();
}

async function handleVerificationCodeInput(event) {
  const input = event.currentTarget;
  const draft = ensureAccountDraft();
  const normalized = String(input.value || "").replace(/\D/g, "").slice(0, 6);
  input.value = normalized;
  draft.verificationCode = normalized;

  if (normalized.length < 6) {
    state.verificationCheckStatus = "";
    state.verificationCheckMessage = "";
    state.lastCheckedVerificationCode = "";
    return;
  }

  if (!draft.verificationRequestId || state.lastCheckedVerificationCode === normalized) {
    return;
  }

  state.lastCheckedVerificationCode = normalized;
  state.verificationCheckBusy = true;
  state.verificationCheckStatus = "checking";
  state.verificationCheckMessage = "Checking code...";
  render();

  const { payload, error } = await requestJson("/api/account/request-code", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      action: "check_code",
      emailAddress: draft.emailAddress,
      verificationRequestId: draft.verificationRequestId,
      verificationCode: normalized,
      ...(draft.verificationToken ? { verificationToken: draft.verificationToken } : {})
    })
  });

  state.verificationCheckBusy = false;
  if (error || !payload?.ok || !payload?.verified) {
    state.verificationCheckStatus = "invalid";
    state.verificationCheckMessage = payload?.error || error || "That code is incorrect.";
  } else {
    state.verificationCheckStatus = "valid";
    state.verificationCheckMessage = payload.message || "Code confirmed.";
  }
  render();
}

function handleAuthModeClick(event) {
  const nextView = event.currentTarget.dataset.authMode || "create";
  saveAuthView(nextView);
  if (nextView === "create") {
    ensureAccountDraft();
  }
  if (nextView !== "create") {
    state.verificationPreviewCode = "";
    state.verificationWarning = "";
    state.verificationMaskedEmail = "";
    state.verificationExpiresAt = "";
  }
  clearStatus("account");
  state.passwordMessage = "";
  render();
}

async function handleCreateAccountNext(event) {
  const form = event.currentTarget.closest("form");
  saveCurrentStepValue(form);
  const error = validateAccountStep();
  if (error) {
    setStatus(error, "account");
    render();
    return;
  }
  state.createAccountStep = Math.min(state.createAccountStep + 1, CREATE_ACCOUNT_STEPS.length - 1);
  clearStatus("account");
  const nextStep = getCreateAccountStepConfig();
  const draft = ensureAccountDraft();
  if (nextStep.key === "verificationCode" && !draft.verificationRequestId) {
    setStatus("Sending code.", "account");
    render();
    await handleSendVerificationCode({ quiet: true });
    return;
  }
  render();
}

function handleCreateAccountBack(event) {
  const form = event.currentTarget.closest("form");
  saveCurrentStepValue(form);
  state.createAccountStep = Math.max(state.createAccountStep - 1, 0);
  clearStatus("account");
  render();
}

function handleDraftSuggestionClick(event) {
  const button = event.currentTarget;
  const value = button.dataset.draftSuggestion || "";
  const form = button.closest("form");
  const step = getCreateAccountStepConfig();
  const field = form?.elements.namedItem(step.key);
  if (!field) return;
  field.value = value;
  saveCurrentStepValue(form);
  clearStatus("account");
  render();
}

function handleCreateAccountSubmitClick(event) {
  const form = event.currentTarget.closest("form");
  saveCurrentStepValue(form);
  form?.requestSubmit();
}

function handleSigninInsteadClick() {
  const draft = ensureAccountDraft();
  saveAuthView("signin");
  clearStatus("account");
  render();
  requestAnimationFrame(() => {
    const emailInput = document.querySelector("[name='loginEmailAddress']");
    if (emailInput && draft.emailAddress) {
      emailInput.value = draft.emailAddress;
    }
    document.querySelector("[name='loginPassword']")?.focus();
  });
}

async function handleSandboxSampleData() {
  if (!hasPrototypeAccount()) {
    setStatus("Create your account first, then load Sandbox data.", "account");
    render();
    return;
  }
  if (!hasAcceptedLegalTerms()) {
    setStatus("Accept PAM's legal terms before loading financial data.", "account");
    render();
    return;
  }
  const sandboxPayload = loadSandboxFallback(state.baseline);
  saveBaseline(state.account ? syncAccountIntoBaseline(state.account, sandboxPayload.baseline) : sandboxPayload.baseline);
  state.dataFresh = true;
  showSuccessToast("Sample data loaded.");
  trackEvent("sample_data_loaded");
  saveWorkspaceView("dashboard");
  saveMobileView("home");
  setStatus(sandboxPayload.status, "account");
  state.inlineGoalError = "";
  render();
  await new Promise((resolve) => setTimeout(resolve, 300));
  if (hasCompletedBaseline(state.baseline)) {
    await runDecisionAnalysis(state.question, sandboxPayload.status);
    saveMobileView("home");
    render();
    requestAnimationFrame(() => document.querySelector("#workspace")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    setTimeout(() => {
      state.dataFresh = false;
      render();
    }, 2000);
    return;
  }
  render();
}

async function handleConnectSandboxAccount(options = {}) {
  const { silent = false } = options;
  if (!hasPrototypeAccount()) {
    setStatus("Create your account first, then connect Sandbox data.", "account");
    render();
    return;
  }
  if (!hasAcceptedLegalTerms()) {
    setStatus("Accept PAM's legal terms before connecting financial data.", "account");
    render();
    return;
  }
  state.plaidBusy = true;
  if (!silent) {
    clearStatus("account");
    render();
  }

  try {
    const authHeaders = await buildAuthHeaders();
    const payload = await connectSandboxAccount({
      ...state.baseline.profile,
      accountId: state.account?.id || ""
    }, authHeaders);
    saveBaseline(payload.baseline);
    state.dataFresh = true;
    saveWorkspaceView("dashboard");
    saveMobileView("home");
    if (!silent) {
      setStatus(payload.status, "account");
      showSuccessToast("Accounts connected.");
    }
    trackEvent("sandbox_connected", { silent });
    state.inlineGoalError = "";
    if (!silent) {
      render();
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    if (silent) {
      state.result = toLegacyDecisionFromSession(buildScenarioSession({ prompt: state.question }));
    } else {
      await runDecisionAnalysis(state.question, payload.status);
      saveMobileView("home");
      render();
      requestAnimationFrame(() => document.querySelector("#workspace")?.scrollIntoView({ behavior: "smooth", block: "start" }));
      setTimeout(() => {
        state.dataFresh = false;
        render();
      }, 2000);
    }
  } catch (error) {
    const fallbackPayload = loadSandboxFallback(state.baseline);
    saveBaseline(state.account ? syncAccountIntoBaseline(state.account, fallbackPayload.baseline) : fallbackPayload.baseline);
    state.dataFresh = true;
    saveWorkspaceView("dashboard");
    saveMobileView("home");
    if (!silent) {
      setStatus(error instanceof Error && error.message
        ? `${error.message} ${fallbackPayload.status}`
        : fallbackPayload.status, "account");
    }
    state.inlineGoalError = "";
    if (!silent) {
      render();
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    if (silent) {
      state.result = toLegacyDecisionFromSession(buildScenarioSession({ prompt: state.question }));
    } else {
      await runDecisionAnalysis(state.question, fallbackPayload.status);
      saveMobileView("home");
      render();
      requestAnimationFrame(() => document.querySelector("#workspace")?.scrollIntoView({ behavior: "smooth", block: "start" }));
      setTimeout(() => {
        state.dataFresh = false;
        render();
      }, 2000);
    }
  } finally {
    state.plaidBusy = false;
    if (!silent) render();
  }
}

function shouldAutoRefreshFinancialData() {
  if (!canUseFinancialFeatures()) return false;
  if (!state.baseline.source?.startsWith("plaid")) return false;
  try {
    const lastSync = Number(window.localStorage.getItem(LAST_AUTO_SYNC_KEY) || 0);
    return Date.now() - lastSync > 24 * 60 * 60 * 1000;
  } catch (_error) {
    return false;
  }
}

async function maybeAutoRefreshFinancialData() {
  if (!shouldAutoRefreshFinancialData()) return;
  try {
    window.localStorage.setItem(LAST_AUTO_SYNC_KEY, String(Date.now()));
  } catch (_error) {
    // Auto refresh is best-effort.
  }
  await handleConnectSandboxAccount({ silent: true });
  render();
}

async function handleQuestionSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const question = String(formData.get("question") || "").trim();
  if (!question) return;
  const inputWarning = getInputContentWarning(question);
  if (inputWarning) {
    state.inputWarning = inputWarning;
    render();
    return;
  }
  if (!canAccessDashboard()) {
    saveWorkspaceView("account");
    state.result = null;
    state.aiGuidance = null;
    setStatus("Connect your accounts so PAM can model this against your real numbers.", "account");
    render();
    return;
  }
  if (!hasAcceptedLegalTerms()) {
    saveWorkspaceView("account");
    setStatus("Accept PAM's legal terms before using financial modeling features.", "account");
    render();
    return;
  }
  state.inputWarning = "";
  await runDecisionAnalysis(question);
}

function handleDecisionModeClick(event) {
  const mode = event.currentTarget.dataset.decisionMode || "expense";
  if (!getStructuredDecisionModeConfig()[mode]) return;
  state.decisionMode = mode;
  state.structuredBuilderExpanded = true;
  state.inputWarning = "";
  render();
}

function handleStructuredPresetClick(event) {
  const mode = event.currentTarget.dataset.presetMode || state.decisionMode || "expense";
  const presetIndex = Number(event.currentTarget.dataset.structuredPreset || 0);
  const config = getStructuredDecisionModeConfig()[mode];
  const preset = config?.presets?.[presetIndex];
  if (!preset) return;
  state.decisionMode = mode;
  state.structuredDecisionDraft[mode] = {
    ...getStructuredDecisionDraft(mode),
    ...preset.draft
  };
  state.structuredBuilderExpanded = true;
  state.inputWarning = "";
  render();
}

async function handleStructuredDecisionSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const mode = String(formData.get("mode") || state.decisionMode || "expense");
  const draft = {};
  for (const [key, value] of formData.entries()) {
    if (key !== "mode") draft[key] = String(value || "").trim();
  }
  state.decisionMode = mode;
  state.structuredDecisionDraft[mode] = {
    ...getStructuredDecisionDraft(mode),
    ...draft
  };
  const scenarioDraft = buildStructuredScenarioDraft(mode, formData);
  const session = buildScenarioSession({ prompt: scenarioDraft.prompt, draft: scenarioDraft });
  await runDecisionAnalysis(scenarioDraft.prompt, "Structured scenario analyzed against your baseline.", { session });
}

function handleGoalFormSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const title = String(formData.get("goalTitle") || "").trim();
  const targetAmount = toNumber(formData.get("goalTargetAmount"), 0);
  if (!title || targetAmount <= 0) {
    setStatus("Add a goal name and target amount.", "account");
    render();
    return;
  }
  const currentSavings = getCurrentSavings(state.baseline);
  saveUserGoals([
    ...state.goals,
    {
      id: `goal-${Date.now()}`,
      title,
      category: title,
      targetAmount,
      currentAmount: Math.min(currentSavings, targetAmount),
      monthlyContribution: Math.ceil(Math.max(targetAmount - currentSavings, 0) / 18),
      priority: "high",
      fundingSource: "cash",
      targetTimelineMonths: 18,
      annualReturn: 0.024
    }
  ]);
  setStatus("Goal saved. PAM will use it in decision modeling.", "account");
  render();
}

async function handleLegalAcceptance(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const acceptedAdvisorDisclaimer = formData.get("acceptedAdvisorDisclaimer") === "on";
  const acceptedTermsPrivacy = formData.get("acceptedTermsPrivacy") === "on";

  if (!acceptedAdvisorDisclaimer || !acceptedTermsPrivacy) {
    state.legalAcceptanceError = "Both acknowledgements are required before using financial features.";
    render();
    return;
  }

  if (!isClerkMode() && !state.sessionToken) {
    state.legalAcceptanceError = "Sign in again before accepting legal terms.";
    render();
    return;
  }

  const headers = await buildAuthHeaders();
  const { payload, error } = await requestJson("/api/account/session", {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...(state.sessionToken ? { sessionToken: state.sessionToken } : {}),
      action: "accept_legal",
      acceptedAdvisorDisclaimer,
      acceptedTermsPrivacy,
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION
    })
  });

  // Clerk users are authenticated regardless of the server-side log result —
  // record acceptance locally so a flaky log call never blocks onboarding.
  if ((error || !payload?.ok) && !isClerkMode()) {
    state.legalAcceptanceError = payload?.error || error || "Unable to record legal acceptance.";
    render();
    return;
  }

  saveLegalAcceptance({
    acceptedAdvisorDisclaimer,
    acceptedTermsPrivacy,
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
    acceptedAt: payload?.acceptedAt || new Date().toISOString(),
    stored: payload?.stored || "local_only"
  });
  state.legalAcceptanceError = "";
  if (canAccessDashboard()) {
    saveWorkspaceView("dashboard");
    saveMobileView("home");
    setStatus("Legal terms accepted. Dashboard unlocked.", "decision");
  } else {
    setStatus("Legal terms accepted. Connect Sandbox data next.", "account");
  }
  trackEvent("legal_terms_accepted", { stored: payload.stored || "none" }, "security");
  render();
}

async function handleFeedbackSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const message = String(formData.get("feedbackMessage") || "").trim();
  const ratingValue = Number(formData.get("feedbackRating") || 0);

  if (message.length < 4) {
    state.feedbackMessage = "Write a short note first.";
    render();
    return;
  }

  state.feedbackBusy = true;
  state.feedbackMessage = "Sending feedback...";
  render();

  const { payload, error } = await requestJson("/api/telemetry", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      eventType: "product",
      eventName: "feedback_submitted",
      sessionId: getTelemetrySessionId(),
      page: window.location.pathname || "/",
      properties: {
        sessionToken: state.sessionToken || "",
        feedbackMessage: message,
        rating: ratingValue || 0
      }
    })
  });

  state.feedbackBusy = false;
  if (error || !payload?.ok) {
    state.feedbackMessage = payload?.error || error || "Could not send feedback.";
    render();
    return;
  }

  state.feedbackMessage = payload.feedbackStored === "schema_pending"
    ? "Thanks. PAM received your feedback locally, but the feedback table still needs the latest Supabase schema."
    : "Thanks. PAM received your feedback.";
  showSuccessToast("Feedback sent. Thank you.");
  render();
}

async function handlePasswordChange(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const currentPassword = String(formData.get("currentPassword") || "");
  const newPassword = String(formData.get("newPassword") || "");
  const confirmNewPassword = String(formData.get("confirmNewPassword") || "");

  if (!state.sessionToken) {
    state.passwordMessage = "Sign in again before changing your password.";
    render();
    return;
  }

  if (!currentPassword || !newPassword || !confirmNewPassword) {
    state.passwordMessage = "Fill out all password fields.";
    render();
    return;
  }

  if (newPassword.length < 8) {
    state.passwordMessage = "Use at least 8 characters for your new password.";
    render();
    return;
  }

  if (newPassword !== confirmNewPassword) {
    state.passwordMessage = "New passwords don't match.";
    render();
    return;
  }

  state.passwordBusy = true;
  state.passwordMessage = "Updating password...";
  render();

  const { payload, error } = await requestJson("/api/account/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "change_password",
      sessionToken: state.sessionToken,
      currentPassword,
      newPassword
    })
  });

  state.passwordBusy = false;
  state.passwordMessage = payload?.ok
    ? "Password updated."
    : payload?.error || error || "Could not update password.";
  render();
}

function handleDismissWalkthrough() {
  saveWalkthroughDismissed();
  render();
}

function scrollToSection(id) {
  document.querySelector(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function isWaitlistRoute() {
  return ["/newsletter", "/waitlist"].includes(window.location.pathname);
}

function getLegalRoute() {
  const pathname = window.location.pathname;
  if (pathname === "/terms") return "terms";
  if (pathname === "/privacy") return "privacy";
  if (pathname === "/content-policy") return "content-policy";
  if (pathname === "/faq") return "faq";
  return "";
}

function getInputContentWarning(value) {
  const text = String(value || "");
  const lineCount = text.split(/\n/).filter((line) => line.trim()).length;
  if (text.length > 1800 || lineCount > 10) {
    return "That looks like a large pasted block. Please summarize the financial decision in your own words instead of pasting copyrighted or third-party content.";
  }
  return "";
}

function handleSectionScroll(target) {
  if (!target) return;
  if (target === "#baseline-section") {
    saveWorkspaceView("account");
    render();
    requestAnimationFrame(() => scrollToSection(target));
    return;
  }
  if (!document.querySelector(target) && state.workspaceView !== "landing") {
    saveWorkspaceView("landing");
    render();
    requestAnimationFrame(() => scrollToSection(target));
    return;
  }
  scrollToSection(target);
}

function openWorkspaceView(view) {
  if (view === "values") {
    // Fresh entry into the flow: start at the first (possibly missing-only)
    // step and seed the draft from any existing answers.
    state.valuesStep = 0;
    state.valuesDraft = { ...(state.userValues || {}) };
    trackEvent("values_onboarding_started", { missingOnly: Boolean(state.userValues?.completed) });
  }
  // The values profile is required context for every answer — no dashboard
  // until onboarding is finished.
  if (view === "dashboard" && canAccessDashboard() && hasAcceptedLegalTerms() && !state.userValues?.completed) {
    state.valuesStep = 0;
    state.valuesDraft = state.valuesDraft || {};
    saveWorkspaceView("values");
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  if (view === "dashboard" && canAccessDashboard() && !hasAcceptedLegalTerms()) {
    saveWorkspaceView("account");
    setStatus("Accept PAM's legal terms before opening the dashboard.", "account");
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  if (view === "dashboard" && !canAccessDashboard()) {
    saveWorkspaceView(hasPrototypeAccount() ? "account" : "landing");
    setStatus(hasPrototypeAccount()
      ? "Connect Sandbox data before opening the dashboard."
      : "Create an account before opening the dashboard.", "account");
  }
  else {
    saveWorkspaceView(view);
  }
  render();
  if (view !== "account") {
    requestAnimationFrame(() => {
      scrollToSection("#workspace-panel");
    });
  } else {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

function renderHero() {
  const hasAccount = hasPrototypeAccount();
  return `
    <section class="pam-hero foresee-panel">
      <div class="hero-copy">
        <div class="panel-kicker">PAM AI • Personal Asset Manager</div>
        <h1>Know what happens before you decide.</h1>
        <p>
          PAM AI models your money decisions before you make them, so you can see the impact on your
          monthly buffer, taxes, savings, risk, and long-term goals before you commit.
        </p>
        <div class="pam-hero-actions">
          <button class="button button-primary" type="button" data-open-view="${getPrimaryActionView()}">${escapeHtml(getPrimaryActionLabel())}</button>
          ${hasAccount ? `<button class="button button-secondary" type="button" data-open-view="account">Profile</button>` : `<button class="button button-secondary" type="button" data-open-signin>Sign in</button>`}
          ${!state.waitlistJoined && !hasAccount ? `<button class="button button-secondary optional-hero-action" type="button" data-open-waitlist>${escapeHtml(getWaitlistActionLabel())}</button>` : ""}
        </div>
        <p class="founding-note">Free to join. Early members lock in founding pricing forever.</p>
      </div>
      <div class="hero-preview-card" aria-label="PAM AI product preview">
        <div class="preview-window-bar">
          <strong>PAM dashboard</strong>
          <span>Decision mode</span>
        </div>
        <div class="preview-advisor-note">
          <span>Question</span>
          <strong>Can I buy a car with a $400/month payment?</strong>
        </div>
        <div class="preview-metric-row">
          <div><span>Monthly buffer</span><strong>$1,270 → $870</strong></div>
          <div><span>Risk</span><strong>Medium</strong></div>
        </div>
        <div class="preview-goal-callout">
          <span>Goal impact</span>
          <strong>Moving out delayed by 6-9 months</strong>
        </div>
      </div>
    </section>
  `;
}

function renderEducationSections() {
  return `
    <section class="foresee-panel split-section" id="positioning">
      <div>
        <div class="panel-kicker">Before wealth management</div>
        <h2>Built for people before wealth management.</h2>
      </div>
      <p>Traditional financial advisors and premium wealth platforms are built for people who already have significant money to manage. PAM starts earlier. It helps young adults make smarter first decisions around income, rent, cars, taxes, saving, investing, and independence.</p>
    </section>
  `;
}

function renderPlanningModules() {
  const modules = [
    ["decisions", "Decisions", "Test choices like rent, cars, trips, job changes, and big purchases."],
    ["taxes", "Taxes", "Understand estimated tax impact, W-2 vs 1099 income, deductions, and take-home pay."],
    ["goals", "Goals", "See whether a decision delays goals like moving out, emergency savings, or investing."],
    ["growth", "Growth", "Model compound interest and long-term saving/investing tradeoffs."],
    ["cash-flow", "Cash Flow", "Understand monthly buffer, expenses, obligations, and runway."],
    ["guidance", "Guidance", "Get plain-English explanations without needing a spreadsheet or financial advisor."]
  ];

  return `
    <section class="foresee-panel modules-section" id="planning-modules">
      <div class="section-heading-row">
        <div>
          <div class="panel-kicker">Planning modules</div>
          <h2>Everything your financial future needs, in one place.</h2>
        </div>
        <p>PAM organizes the moving pieces of a young adult financial life into one decision engine.</p>
      </div>
      <div class="module-card-grid">
        ${modules.map(([id, title, copy]) => `
          <article class="module-card" id="${id}">
            <span>${title}</span>
            <p>${copy}</p>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderDecisionDemo() {
  return `
    <section class="foresee-panel product-demo-section" id="decision-input">
      <div class="demo-copy">
        <div class="panel-kicker">Decision engine</div>
        <h2>A preview of how PAM turns a question into a plan.</h2>
        <p>PAM is not a chatbot thread. It interprets the decision, runs deterministic math, and shows the tradeoff clearly.</p>
        <button class="button button-primary" type="button" data-open-view="${getPrimaryActionView()}">${escapeHtml(getPrimaryActionLabel())}</button>
      </div>
      <div class="advisor-demo-window">
        <div class="demo-window-header">
          <strong>PAM analysis</strong>
          <span>Example</span>
        </div>
        <div class="demo-question">“Can I buy a car with a $400/month payment?”</div>
        <div class="demo-result-grid">
          <div><span>Monthly impact</span><strong>-$400</strong></div>
          <div><span>Risk</span><strong>Medium</strong></div>
          <div><span>Goal impact</span><strong>Delays moving out by 6-9 months</strong></div>
          <div><span>Tax impact</span><strong>No direct change</strong></div>
        </div>
        <p>You can afford it, but your monthly buffer becomes tighter and your moving-out goal slows down.</p>
      </div>
    </section>
  `;
}

function renderExamplesSection() {
  return `
    <section class="foresee-panel example-stack-section" id="examples">
      <div class="section-heading-row">
        <div>
          <div class="panel-kicker">Examples</div>
          <h2>From decision to consequence.</h2>
        </div>
      </div>
      <div class="example-stack-grid">
        <article class="decision-example-card">
          <span>Question</span>
          <h3>“Can I buy a car with a $400/month payment?”</h3>
          <ul>
            <li><strong>Monthly impact:</strong> -$400</li>
            <li><strong>Risk:</strong> Medium</li>
            <li><strong>Goal impact:</strong> This delays moving out by 6-9 months.</li>
            <li><strong>Tax impact:</strong> No direct change.</li>
          </ul>
          <p>You can afford it, but your monthly buffer becomes tighter and your moving-out goal slows down.</p>
        </article>
        <article class="decision-example-card">
          <span>Question</span>
          <h3>“What if I invest $200/month instead of spending it?”</h3>
          <ul>
            <li><strong>Monthly impact:</strong> -$200</li>
            <li><strong>Compound growth:</strong> Hypothetical projection based on assumptions.</li>
            <li><strong>Goal impact:</strong> Improves long-term savings.</li>
            <li><strong>Disclaimer:</strong> Educational estimate only. Not financial, tax, legal, or investment advice.</li>
          </ul>
        </article>
      </div>
    </section>
  `;
}

function renderFutureIntegrations() {
  return `
    <section class="foresee-panel split-section integrations-section">
      <div>
        <div class="panel-kicker">Future integrations</div>
        <h2>Automatic baselines later. Clear decisions now.</h2>
      </div>
      <p>Future versions can connect financial accounts and automatically build a baseline from income, balances, recurring expenses, and liabilities. For now, Sandbox data keeps the prototype decision-focused without making integrations the homepage story.</p>
    </section>
  `;
}

function renderPricingModel() {
  return `
    <section class="foresee-panel pricing-section" id="pricing">
      <div class="section-heading-row">
        <div>
          <div class="panel-kicker">One plan</div>
          <h2>Try PAM free. Keep one simple plan.</h2>
        </div>
        <button class="button button-secondary" type="button" data-open-waitlist>${escapeHtml(getWaitlistActionLabel())}</button>
      </div>
      <article class="pricing-card single-plan-card">
        <h3>Founding plan</h3>
        <p>One membership for decision modeling, tax-aware estimates, goal impact, compound-growth projections, and saved scenarios.</p>
        <ul>
          <li>Free trial before billing</li>
          <li>Founding members lock in early pricing</li>
          <li>No separate free tier cluttering the product</li>
        </ul>
      </article>
    </section>
  `;
}

function getDraftModelSignals(draft = ensureAccountDraft()) {
  const age = toNumber(draft.age, null);
  const stateCode = inferStateFromLocation(draft.cityOrZip) || String(draft.stateCode || "OTHER");
  const cityOrZip = String(draft.cityOrZip || "").trim();
  const firstDecision = String(draft.firstDecision || state.question || "").trim();
  const employmentStatus = String(draft.employmentStatus || "Not sure yet");
  const creditScore = hasValue(draft.creditScore) ? toNumber(draft.creditScore, null) : null;
  const goal = inferGoalFromDecision(firstDecision);
  const taxSignal = /1099|self|freelance/i.test(employmentStatus)
    ? "PAM will model self-employment tax and possible deductible work expenses."
    : /w-2/i.test(employmentStatus)
      ? "PAM will treat taxes as mostly withheld and focus on take-home impact."
      : "PAM will keep income assumptions flexible until connected data confirms them.";

  return [
    {
      label: "Location",
      value: cityOrZip || stateCode,
      note: cityOrZip ? "Used for local assumptions." : "Optional, but useful for taxes and local costs."
    },
    {
      label: "Age",
      value: hasValue(age) ? `${age}` : "Not set",
      note: hasValue(age) ? "Changes compound-growth runway and long-term planning horizon." : "Optional, but useful for growth and retirement projections."
    },
    {
      label: "Credit",
      value: hasValue(creditScore) ? `${creditScore}` : "Not set",
      note: hasValue(creditScore) ? "Loan, lease, and credit decisions can estimate approval strength." : "Optional, only used for borrowing or apartment-style decisions."
    },
    {
      label: "Income source",
      value: employmentStatus,
      note: taxSignal
    },
    {
      label: "First decision",
      value: firstDecision || "Not set",
      note: goal ? `PAM will protect: ${goal}.` : "This sets the first dashboard goal and suggested prompts."
    }
  ];
}

function renderModelInterpretation(draft = ensureAccountDraft()) {
  const signals = getDraftModelSignals(draft);
  return `
    <aside class="model-interpretation-card">
      <div class="panel-kicker">PAM interpretation</div>
      <h3>Create your PAM model.</h3>
      <p>Every answer changes the model PAM uses for affordability, taxes, goals, and growth.</p>
      <div class="model-signal-grid">
        ${signals.map((signal) => `
          <div>
            <span>${escapeHtml(signal.label)}</span>
            <strong>${escapeHtml(signal.value)}</strong>
            <small>${escapeHtml(signal.note)}</small>
          </div>
        `).join("")}
      </div>
    </aside>
  `;
}

function renderAccountPreview() {
  const baseline = getUiBaseline(state.baseline);
  const isComplete = canUseFinancialFeatures();
  const goalLabel = getGoalLabel(state.baseline);
  const cards = [];

  if (hasValue(baseline.emailAddress)) {
    cards.push({
      label: "Account",
      value: escapeHtml(baseline.emailAddress),
      className: "preview-card preview-card-account"
    });
  }

  if (hasValue(baseline.age)) {
    cards.push({ label: "Age", value: baseline.age });
  }

  if (!isComplete && hasValue(baseline.grossMonthlyIncome)) {
    cards.push({ label: "Gross income", value: formatCurrency(baseline.grossMonthlyIncome) });
  }

  if (isComplete) {
    cards.push({ label: "Spendable income", value: formatCurrency(baseline.takeHomeIncome) });
  }

  if (isComplete) {
    cards.push({ label: "Monthly buffer", value: formatCurrency(getMonthlyBuffer(state.baseline)) });
  }

  if (hasValue(baseline.currentSavings)) {
    cards.push({ label: "Savings", value: formatCurrency(baseline.currentSavings) });
  }

  if (hasValue(goalLabel)) {
    cards.push({
      label: "Goal",
      value: escapeHtml(goalLabel),
      className: "preview-card preview-card-goal"
    });
  }

  return `
    <aside class="cash-flow-preview ${isComplete ? "" : "incomplete-preview"}">
      <div class="panel-kicker">${isComplete ? "Baseline" : "Account preview"}</div>
      <h3>${isComplete ? `${escapeHtml(baseline.firstName || "Your")} homepage` : "Your account"}</h3>
      <div class="cash-flow-preview-grid">
        ${cards.map((card) => `
          <div class="${card.className || ""}">
            <span>${card.label}</span>
            <strong>${card.value}</strong>
          </div>
        `).join("")}
      </div>
    </aside>
  `;
}

function renderSetupTermGuide() {
  return `
    <div class="term-guide">
      <div>
        <strong>Monthly buffer</strong>
        <span>Money left after taxes, spending, obligations, and retirement contributions.</span>
      </div>
      <div>
        <strong>Obligations</strong>
        <span>Payments you cannot easily skip, like debt, insurance, tuition, or family support.</span>
      </div>
      <div>
        <strong>Goal delay</strong>
        <span>How much a decision may push back the goal you chose.</span>
      </div>
      <div>
        <strong>Deductible cost</strong>
        <span>A business-related expense that may reduce taxable income, not a guaranteed refund.</span>
      </div>
    </div>
  `;
}

function renderValuesOnboarding() {
  const steps = getActiveValuesSteps();
  const step = steps[state.valuesStep];
  if (!step) return "";
  const draft = state.valuesDraft || {};
  const progress = Math.round(((state.valuesStep) / steps.length) * 100);
  const isLast = state.valuesStep === steps.length - 1;

  let inputHtml = "";
  if (step.type === "slider") {
    const val = draft[step.key] ?? step.defaultValue;
    inputHtml = `
      <div class="values-slider-wrap">
        <input type="range" min="${step.min}" max="${step.max}" value="${val}" data-values-slider="${escapeHtml(step.key)}" class="values-slider">
        <div class="values-slider-output"><strong id="slider-display-${step.key}">${val}</strong> years old</div>
      </div>
      <button class="button button-primary" type="button" data-values-next>Continue</button>
    `;
  } else if (step.type === "options") {
    inputHtml = `
      <div class="values-options-grid">
        ${step.options.map(opt => `
          <button class="values-option-btn ${draft[step.key] === opt.value ? "selected" : ""}" type="button" data-values-option="${escapeHtml(step.key)}" data-values-value="${escapeHtml(opt.value)}">${escapeHtml(opt.label)}</button>
        `).join("")}
      </div>
      ${draft[step.key] ? `<button class="button button-primary" type="button" data-values-next>Continue</button>` : ""}
    `;
  } else if (step.type === "multiselect") {
    const selected = Array.isArray(draft[step.key]) ? draft[step.key] : [];
    inputHtml = `
      <div class="values-multiselect-grid">
        ${step.options.map(opt => `
          <button class="values-option-btn ${selected.includes(opt) ? "selected" : ""}" type="button" data-values-toggle="${escapeHtml(step.key)}" data-values-value="${escapeHtml(opt)}">${escapeHtml(opt)}</button>
        `).join("")}
      </div>
      <button class="button button-primary" type="button" data-values-next>${selected.length ? "Continue" : "Skip for now"}</button>
    `;
  } else if (step.type === "text") {
    inputHtml = `
      <div class="values-text-inputs">
        <input type="text" class="values-text-input" placeholder="${escapeHtml(step.placeholder)}" value="${escapeHtml(draft[step.key] || "")}" data-values-text="${escapeHtml(step.key)}">
        ${step.subKey ? `<input type="text" class="values-text-input" placeholder="${escapeHtml(step.subPlaceholder || "")}" value="${escapeHtml(draft[step.subKey] || "")}" data-values-text="${escapeHtml(step.subKey)}">` : ""}
      </div>
      <button class="button button-primary" type="button" data-values-next>Continue</button>
    `;
  } else if (step.type === "group") {
    // Multiple sub-questions on one screen so the strategy profile stays short.
    const fieldsHtml = (step.fields || []).map((f) => {
      if (f.type === "options") {
        return `
          <div class="values-group-field">
            <label class="values-group-label">${escapeHtml(f.label)}</label>
            <div class="values-options-grid">
              ${f.options.map((opt) => `
                <button class="values-option-btn ${draft[f.key] === opt.value ? "selected" : ""}" type="button" data-values-option="${escapeHtml(f.key)}" data-values-value="${escapeHtml(opt.value)}">${escapeHtml(opt.label)}</button>
              `).join("")}
            </div>
          </div>`;
      }
      if (f.type === "text") {
        return `
          <div class="values-group-field">
            <label class="values-group-label">${escapeHtml(f.label)}</label>
            <input type="text" class="values-text-input" placeholder="${escapeHtml(f.placeholder || "")}" value="${escapeHtml(draft[f.key] || "")}" data-values-text="${escapeHtml(f.key)}">
          </div>`;
      }
      return "";
    }).join("");
    const ready = (step.fields || []).filter((f) => f.required).every((f) => draft[f.key]);
    inputHtml = `
      <div class="values-group">${fieldsHtml}</div>
      ${ready ? `<button class="button button-primary" type="button" data-values-next>Continue</button>` : ""}
    `;
  } else if (step.type === "review") {
    inputHtml = `
      ${renderStrategyPlayback(draft)}
      <button class="button button-primary" type="button" data-values-next>This looks right →</button>
    `;
  }

  return `
    <section class="values-onboarding-shell">
      <div class="values-onboarding-frame">
        <div class="values-progress-bar"><div style="width:${progress}%"></div></div>
        <div class="panel-kicker">Step ${state.valuesStep + 1} of ${steps.length}</div>
        <h2>${escapeHtml(step.question)}</h2>
        ${step.detail ? `<p class="values-detail">${escapeHtml(step.detail)}</p>` : ""}
        <div class="values-input-area">${inputHtml}</div>
        <div class="values-nav-row">
          ${state.valuesStep > 0 ? `<button class="button button-ghost" type="button" data-values-back>Back</button>` : ""}
        </div>
      </div>
    </section>
  `;
}

// Plain-language playback of the strategy profile so the user can confirm or
// correct it. PAM judges every decision against this, so it's worth showing back.
function renderStrategyPlayback(draft = {}) {
  const careerStage = {
    career: "this job is your real career",
    stepping_stone: "this job is a stepping-stone",
    paying_bills: "this job just pays the bills for now",
    between: "you're between things right now"
  }[draft.career_stage];
  const backing = {
    family: "family could bail you out",
    strong_cushion: "a strong cushion but no family backstop",
    modest_cushion: "a modest cushion and no backstop",
    none: "no real cushion",
    dependents: "people who depend on your income"
  }[draft.risk_backing];
  const mobility = {
    yes: "you'd move for the right opportunity",
    maybe: "you'd consider moving for the right offer",
    no: "you're rooted where you are"
  }[draft.location_flexible];
  const lifestyle = {
    lean: "a lean, freedom-first lifestyle",
    comfortable: "a comfortable middle-class lifestyle",
    upper: "an upper-middle lifestyle",
    wealthy: "a high-wealth lifestyle"
  }[draft.aspirational_lifestyle];

  const lines = [];
  if (draft.retirement_target_age) lines.push(`Aiming to be financially free around <strong>${escapeHtml(String(draft.retirement_target_age))}</strong>.`);
  if (careerStage) lines.push(`PAM sees ${escapeHtml(careerStage)}${draft.target_career ? `, heading toward <strong>${escapeHtml(String(draft.target_career))}</strong>` : ""}.`);
  if (lifestyle) lines.push(`You're aiming for ${escapeHtml(lifestyle)}.`);
  if (mobility) lines.push(`On location, ${escapeHtml(mobility)}.`);
  if (Array.isArray(draft.trajectory_moves) && draft.trajectory_moves.filter((m) => m !== "Not sure yet").length) {
    lines.push(`Big moves you're weighing: <strong>${draft.trajectory_moves.filter((m) => m !== "Not sure yet").map((m) => escapeHtml(m)).join(", ")}</strong>.`);
  }
  if (backing) lines.push(`If a bet goes wrong, you've got ${escapeHtml(backing)} — that sets how aggressive PAM will tell you to be.`);

  if (!lines.length) return `<p class="values-detail">PAM will tailor advice as you answer more questions.</p>`;
  return `<div class="strategy-playback">${lines.map((l) => `<p>${l}</p>`).join("")}</div>`;
}

// Steps the user has never answered. Existing accounts keep completed=true
// when new onboarding questions ship; this finds the gap so we can ask only
// what's missing instead of forcing a full re-onboard (or a new account).
function getMissingValuesSteps() {
  const uv = state.userValues || {};
  return VALUES_ONBOARDING_STEPS.filter((step) => {
    // The review screen is not a data field — never treat it as "missing".
    if (step.type === "review") return false;
    // A group is missing if any of its sub-fields was never answered.
    if (step.type === "group") return (step.fields || []).some((f) => uv[f.key] === undefined);
    const value = uv[step.key];
    if (step.type === "multiselect") return value === undefined;
    // Text steps are optional: an empty string means "seen and skipped",
    // only undefined means the user was never asked.
    if (step.type === "text") return value === undefined && (!step.subKey || uv[step.subKey] === undefined);
    return value === undefined || value === null || value === "";
  });
}

// The steps the values flow should currently run: everything for a fresh
// user, only the unanswered ones for someone updating an existing profile.
function getActiveValuesSteps() {
  if (state.userValues?.completed) {
    const missing = getMissingValuesSteps();
    if (missing.length) return missing;
  }
  return VALUES_ONBOARDING_STEPS;
}

function renderFinishProfileCard() {
  if (!state.userValues?.completed) return "";
  const missing = getMissingValuesSteps();
  if (!missing.length) return "";
  return `
    <div class="insight-card values-cta-card finish-profile-card">
      <strong>PAM has ${missing.length} new question${missing.length === 1 ? "" : "s"} for you</strong>
      <p>We added more profile questions since you set up. Answering them makes every PAM answer sharper — takes under a minute.</p>
      <button class="button button-primary" type="button" data-open-view="values">Finish my profile (${missing.length}) →</button>
    </div>
  `;
}

// One insight up front, the rest folded. Five stacked cards was the main
// source of dashboard clutter — show the single most urgent one and tuck
// the others behind a disclosure.
function renderInsightCards() {
  const cards = [
    renderGoalConflictCard(),
    renderCareerVelocityCard(),
    renderLocationArbitrageCard(),
    renderBuyVsRentCard(),
    renderAccountabilityCard()
  ].filter(Boolean);
  if (!cards.length) return "";
  const [primary, ...rest] = cards;
  if (!rest.length) return primary;
  return `
    ${primary}
    <details class="more-insights-fold">
      <summary>More insights for you (${rest.length})</summary>
      ${rest.join("")}
    </details>
  `;
}

// Example chips should fit the person. Derive up to 3 ask suggestions from
// the values profile instead of showing everyone the same generic three.
function getSmartSuggestions() {
  const uv = state.userValues || {};
  const liabilities = state.baseline.obligations?.liabilities || [];
  const suggestions = [];
  if (uv.housing === "family") suggestions.push("Can I afford to move out this year?");
  if (uv.housing === "rent") suggestions.push("Should I keep renting or save to buy?");
  if (uv.household === "support_family") suggestions.push("How big should my cushion be while supporting family?");
  if (["hourly", "freelance"].includes(uv.worker_type) || uv.pay_frequency === "irregular") {
    suggestions.push("How much slack do I need with irregular pay?");
  }
  if (liabilities.length || (Array.isArray(uv.offline_factors) && uv.offline_factors.includes("Student loans"))) {
    suggestions.push("Should I pay off debt or start investing?");
  }
  if (uv.location_flexible === "yes" && uv.industry) suggestions.push("Is it worth moving for a bigger market in my field?");
  if (Number(uv.retirement_target_age) && Number(uv.retirement_target_age) < 60) {
    suggestions.push(`What do I need to save monthly to retire at ${Number(uv.retirement_target_age)}?`);
  }
  const fallbacks = [
    "Can I afford a $400/month car payment?",
    "What happens if my rent goes up $200?",
    "Am I saving enough each month?"
  ];
  for (const f of fallbacks) {
    if (suggestions.length >= 3) break;
    suggestions.push(f);
  }
  return suggestions.slice(0, 3);
}

function renderGoalConflictCard() {
  const uv = state.userValues;
  if (!uv?.completed) return "";
  const profile = getValuesProfile();
  const conflicts = detectGoalConflicts(uv, profile);
  if (!conflicts.length) return "";
  return `
    <details class="insight-card goal-conflict-card" open>
      <summary><span class="insight-label critical">Conflicts detected</span> Your goals vs. your money</summary>
      <div class="insight-body">
        ${conflicts.map(c => `
          <div class="conflict-row conflict-${escapeHtml(c.severity)}">
            <div class="conflict-badge">${escapeHtml(c.severity)}</div>
            <div>
              <strong>${escapeHtml(c.title)}</strong>
              <p>${escapeHtml(c.detail)}</p>
              <button class="button button-ghost button-sm" type="button" data-ask-about="${escapeHtml(c.action)}">Ask PAM about this →</button>
            </div>
          </div>
        `).join("")}
      </div>
    </details>
  `;
}

function renderCareerVelocityCard() {
  const uv = state.userValues;
  if (!uv?.completed) return "";
  const profile = getValuesProfile();
  const sim = simulateCareerVelocity(uv, profile);
  if (!sim.shouldTrigger) return "";
  return `
    <details class="insight-card career-velocity-card">
      <summary><span class="insight-label amber">Career insight</span> You might be leaving money on the table</summary>
      <div class="insight-body">
        <p>Most people assume loyalty is rewarded. The data says otherwise.</p>
        <div class="velocity-comparison">
          <div class="velocity-path">
            <div class="velocity-path-label">Stay at current employer</div>
            <div class="velocity-path-salary">${formatCurrency(sim.pathA.finalSalary)}<small>/yr in 10 years</small></div>
            <div class="velocity-path-retire">Retire at <strong>${sim.pathA.retirementAge}</strong></div>
          </div>
          <div class="velocity-path velocity-path-b">
            <div class="velocity-path-label">Switch every 2–3 years</div>
            <div class="velocity-path-salary">${formatCurrency(sim.pathB.finalSalary)}<small>/yr in 10 years</small></div>
            <div class="velocity-path-retire">Retire at <strong>${sim.pathB.retirementAge}</strong></div>
          </div>
        </div>
        <p class="insight-callout">Strategic moves could net you ${formatCurrency(sim.earningsDelta)} more over 10 years and pull your retirement ${sim.yearsSaved} year${sim.yearsSaved === 1 ? "" : "s"} forward.</p>
        <button class="button button-ghost button-sm" type="button" data-ask-about="Should I look for a new job to hit my retirement goal faster?">Model my career paths →</button>
      </div>
    </details>
  `;
}

function renderBuyVsRentCard() {
  const uv = state.userValues;
  if (!uv?.completed) return "";
  const profile = getValuesProfile();
  const sim = simulateBuyVsRent(uv, profile);
  if (uv.housing === "own") return "";
  const priorities = (Array.isArray(uv.lifestyle_priorities) ? uv.lifestyle_priorities : []).map(p => String(p).toLowerCase());
  const relevant = priorities.includes("homeownership") || state.lifeValues.includes("Buy a home");
  if (!relevant) return "";
  return `
    <details class="insight-card buyvsrent-card">
      <summary><span class="insight-label blue">Housing</span> Buy vs. rent — based on your goals</summary>
      <div class="insight-body">
        <div class="velocity-comparison">
          <div class="velocity-path ${sim.recommendation === "buy" ? "velocity-path-b" : ""}">
            <div class="velocity-path-label">Buy a home</div>
            <div class="velocity-path-salary">${formatCurrency(sim.buy.downPayment)}<small> down payment needed</small></div>
            <div class="velocity-path-retire">${formatCurrency(sim.buy.projectedNetWorth)}<small> net worth in 10yr</small></div>
          </div>
          <div class="velocity-path ${sim.recommendation === "rent" ? "velocity-path-b" : ""}">
            <div class="velocity-path-label">Rent + invest</div>
            <div class="velocity-path-salary">${formatCurrency(sim.rent.monthlyInvested)}<small>/mo invested instead</small></div>
            <div class="velocity-path-retire">${formatCurrency(sim.rent.projectedNetWorth)}<small> net worth in 10yr</small></div>
          </div>
        </div>
        <p class="insight-callout">
          ${sim.recommendation === "rent"
            ? `Based on your goals, renting and investing the difference could leave you ${formatCurrency(sim.netWorthDelta)} ahead in 10 years.`
            : `Buying may be worth it for you — the 10-year wealth gap is ${formatCurrency(sim.netWorthDelta)} in favor of owning.`}
        </p>
        <button class="button button-ghost button-sm" type="button" data-ask-about="Should I buy a home or keep renting given my goals?">Run the full analysis →</button>
      </div>
    </details>
  `;
}

function renderLocationArbitrageCard() {
  const uv = state.userValues;
  if (!uv?.completed || !uv.industry) return "";
  if (uv.location_flexible === "no") return "";
  const profile = getValuesProfile();
  const sim = simulateLocationArbitrage(uv, profile);
  if (!sim) return "";
  return `
    <details class="insight-card location-card">
      <summary><span class="insight-label mint">Location</span> Your city might be costing you years</summary>
      <div class="insight-body">
        <p>In <strong>${escapeHtml(sim.industryKey)}</strong>, the top markets pay significantly more. Moving to <strong>${escapeHtml(sim.targetCity)}</strong> could change your trajectory.</p>
        <div class="velocity-comparison">
          <div class="velocity-path">
            <div class="velocity-path-label">Stay where you are</div>
            <div class="velocity-path-salary">${formatCurrency(sim.salaryGain)}<small> left on table/yr</small></div>
            <div class="velocity-path-retire">Retire at <strong>${sim.retireAgeStay}</strong></div>
          </div>
          <div class="velocity-path velocity-path-b">
            <div class="velocity-path-label">Move to ${escapeHtml(sim.targetCity)}</div>
            <div class="velocity-path-salary">+${formatCurrency(sim.netAnnualGain)}<small>/yr net after cost of living</small></div>
            <div class="velocity-path-retire">Retire at <strong>${sim.retireAgeMove}</strong></div>
          </div>
        </div>
        ${sim.yearsSaved > 0 ? `<p class="insight-callout">Relocation could pull your retirement ${sim.yearsSaved} year${sim.yearsSaved === 1 ? "" : "s"} forward.</p>` : ""}
        <button class="button button-ghost button-sm" type="button" data-ask-about="${escapeHtml(`Should I move to ${sim.targetCity} for my ${sim.industryKey} career?`)}">Model this move →</button>
      </div>
    </details>
  `;
}

function renderAccountabilityCard() {
  const uv = state.userValues;
  if (!uv?.completed) return "";
  const retirementAge = Number(uv.retirement_target_age) || 65;
  const profile = getValuesProfile();
  const { age, monthlyBuffer, annualSalary } = profile;
  const yearsLeft = Math.max(retirementAge - age, 1);
  const annualSpending = profile.monthlyExpenses * 12 || annualSalary * 0.6;
  const requiredNestEgg = annualSpending * 25;
  const savingsRate = Math.max(monthlyBuffer, 0);
  const projectedAtRetire = profile.currentSavings * Math.pow(1.07, yearsLeft) +
    savingsRate * ((Math.pow(1.07 / 12 + 1, yearsLeft * 12) - 1) / (0.07 / 12));
  const onTrack = projectedAtRetire >= requiredNestEgg * 0.85;
  const shortfall = Math.max(requiredNestEgg - projectedAtRetire, 0);
  const neededMonthly = shortfall > 0 ? Math.round(shortfall / ((Math.pow(1.07 / 12 + 1, yearsLeft * 12) - 1) / (0.07 / 12))) : 0;
  return `
    <details class="insight-card accountability-card">
      <summary><span class="insight-label ${onTrack ? "mint" : "critical"}">${onTrack ? "On track" : "Off track"}</span> Retire at ${retirementAge} check-in</summary>
      <div class="insight-body">
        ${onTrack
          ? `<p>Based on your current buffer and savings, you're projected to have ~${formatCurrency(Math.round(projectedAtRetire / 10000) * 10000)} at ${retirementAge}. You're on track.</p>`
          : `<p>You need ~${formatCurrency(requiredNestEgg)} to retire at ${retirementAge}. You're projected to reach ~${formatCurrency(Math.round(projectedAtRetire / 10000) * 10000)}. To close the gap you need to save an extra ${formatCurrency(neededMonthly)}/mo.</p>`}
        <button class="button button-ghost button-sm" type="button" data-ask-about="${escapeHtml(`Am I on track to retire at ${retirementAge}?`)}">Get PAM's full analysis →</button>
      </div>
    </details>
  `;
}

// Big, unmissable "you're almost in" banner: shows exactly where the user is
// in setup and one primary action to continue. Renders only while setup is
// actually incomplete.
function renderSetupBanner() {
  if (!hasPrototypeAccount() || canUseFinancialFeatures()) return "";
  const steps = [
    { label: "Account created", done: true },
    { label: "Accept the terms", done: hasAcceptedLegalTerms() },
    { label: "Connect or load data", done: hasConnectedFinancialData() || hasCompletedBaseline(state.baseline) },
    { label: "Answer profile questions", done: Boolean(state.userValues?.completed) }
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);
  return `
    <div class="setup-banner" role="status">
      <div class="setup-banner-copy">
        <strong>You're almost in — finish creating your account</strong>
        <p>${doneCount} of ${steps.length} steps done. Next: ${escapeHtml(next?.label || "Open your dashboard")}.</p>
      </div>
      <div class="setup-banner-steps">
        ${steps.map((s) => `<span class="setup-step ${s.done ? "done" : ""}">${s.done ? "✓ " : ""}${escapeHtml(s.label)}</span>`).join("")}
      </div>
    </div>
  `;
}

function renderWorkspaceHub() {
  const isComplete = canUseFinancialFeatures();
  const baseline = getUiBaseline(state.baseline);
  return `
    <section class="foresee-panel workspace-panel" id="workspace-panel">
      ${renderSetupBanner()}
      <div class="workspace-header">
        <div>
          <div class="panel-kicker">Workspace</div>
          <h2>${getWorkspaceTitle()}</h2>
        </div>
        ${hasPrototypeAccount() ? `<div class="workspace-account-chip"><strong>${escapeHtml(baseline.firstName || "Account")}</strong><span>${escapeHtml(baseline.emailAddress)}</span></div>` : ""}
      </div>
      <div class="workspace-tabs" role="tablist" aria-label="PAM views">
        ${[
          { id: "account", label: hasPrototypeAccount() ? "Account" : "Create account" },
          { id: "dashboard", label: "Dashboard", disabled: !canUseFinancialFeatures() }
        ].map((item) => `
          <button
            class="workspace-tab ${state.workspaceView === item.id ? "active" : ""}"
            type="button"
            data-open-view="${item.id}"
            role="tab"
            aria-selected="${state.workspaceView === item.id ? "true" : "false"}"
            ${item.disabled ? "disabled" : ""}
          >${item.label}</button>
        `).join("")}
      </div>
      <div class="workspace-active-view">
        ${state.workspaceView === "account" ? renderBaselinePanel() : ""}
        ${state.workspaceView === "dashboard" ? renderDashboardWorkspace() : ""}
      </div>
    </section>
  `;
}

// Standalone sign-in / create-account page for signed-out visitors: a clean
// split (value prop + sample answer on the left, the auth card on the right),
// not the cluttered workspace shell with its tabs and triple headings.
function renderAuthPage() {
  return `
    <div class="foresee-shell auth-standalone">
      ${renderDisclaimerBanner()}
      <header class="marketing-nav">
        <a class="foresee-brand" href="/" aria-label="PAM AI home">
          <span>PAM</span>
          <div><strong>PAM AI</strong><small>Personal Asset Manager</small></div>
        </a>
        <button class="page-back-button" type="button" data-open-view="landing" aria-label="Back to landing">← Back</button>
      </header>
      <div class="auth-split">
        <div class="auth-value">
          <div class="marketing-eyebrow">Your personal financial adviser</div>
          <h1>Set up PAM in about two minutes.</h1>
          <p class="auth-value-sub">Create your account, connect your money (or try sample data), and start getting straight, numbers-backed calls on your real decisions.</p>
          <ul class="auth-value-list">
            <li><strong>Free to join.</strong> Founding members lock in founding pricing for life.</li>
            <li><strong>Your data stays yours.</strong> Bank-grade connection; never sold, never used to train models.</li>
            <li><strong>Cancel anytime.</strong> No advisor minimums, no AUM fees.</li>
          </ul>
          <div class="auth-value-card">${renderMarketingSampleCard(MARKETING_EXAMPLES.moveout)}</div>
        </div>
        <div class="auth-form-side">
          ${renderBaselinePanel()}
        </div>
      </div>
      ${renderLegalFooter()}
      ${renderCookieConsentBanner()}
    </div>
  `;
}

function renderAccountPage() {
  return `
    <section class="auth-page-shell">
      <div class="auth-page-frame">
        <div class="auth-page-brand">
          <button class="auth-page-back" type="button" data-open-view="landing">Back to homepage</button>
          <div>
            <div class="panel-kicker">PAM account</div>
            <h1>${getAccountPageTitle()}</h1>
          </div>
        </div>
        ${renderWorkspaceHub()}
      </div>
    </section>
  `;
}

function renderLandingWorkspace() {
  return `
    <div class="workspace-guide-grid compact-workspace-view landing-grid">
      ${renderHowItWorksSteps()}
      ${renderExamplesSection()}
      ${renderPricingModel()}
    </div>
  `;
}

function renderDashboardWorkspace() {
  if (!canAccessDashboard() || !hasAcceptedLegalTerms()) {
    const needsLegal = canAccessDashboard() && !hasAcceptedLegalTerms();
    return `
      <section class="foresee-panel result-panel locked-result">
        <div class="result-header">
          <div>
            <div class="panel-kicker">${needsLegal ? "One last step" : "Almost there"}</div>
            <h2>${needsLegal ? "Accept PAM's terms to open your dashboard." : "Connect your accounts to unlock your dashboard."}</h2>
          </div>
        </div>
        ${needsLegal ? renderLegalGate() : `
          <div class="connect-first-panel">
            <p>PAM reads your balances, income, and spending to model decisions accurately — no manual entry needed.</p>
            ${state.plaidBusy ? renderPlaidConnecting() : `
              <div class="settings-action-row">
                <button class="button button-primary" type="button" data-connect-sandbox ${!hasAcceptedLegalTerms() ? "disabled" : ""}>Connect securely with Plaid</button>
                <button class="button button-secondary" type="button" data-load-sandbox ${!hasAcceptedLegalTerms() ? "disabled" : ""}>Use sample data instead</button>
              </div>
              ${renderPlaidTrustNote()}
            `}
          </div>
        `}
      </section>
    `;
  }

  if (isMobileDashboardViewport()) {
    return renderMobileDashboardWorkspace();
  }

  return `
    <div class="workspace-guide-grid compact-workspace-view mobile-dashboard-view mobile-view-${escapeHtml(state.mobileView)}" id="dashboard-section">
      ${renderMobileAppChrome()}
      ${renderDailyDashboardHome()}
      ${renderFeedbackPanel()}
      ${renderMobileBottomNav()}
    </div>
  `;
}

function renderMobileDashboardWorkspace() {
  return `
    <div class="workspace-guide-grid compact-workspace-view mobile-dashboard-view mobile-app-router mobile-view-${escapeHtml(state.mobileView)}" id="dashboard-section">
      ${renderMobileAppChrome()}
      <main class="mobile-active-screen" data-active-mobile-screen="${escapeHtml(state.mobileView)}">
        ${renderMobileActiveScreen()}
      </main>
      ${renderMobileBottomNav()}
    </div>
  `;
}

function renderMobileActiveScreen() {
  switch (state.mobileView) {
    case "ask":
      return `${renderDecisionPanel()}${renderResult()}`;
    case "goals":
      return renderMobileGoalsScreen();
    case "profile":
      return renderMobileProfileScreen();
    case "home":
    default:
      return renderMobileHomeScreen();
  }
}

// Persistent, unmistakable label whenever the numbers on screen are not the
// user's real connected bank data. Sample/mock and Plaid Sandbox must never
// pass for real money.
function renderDataSourceBadge() {
  const source = String(state.baseline?.source || "");
  if (source === "plaid_mock") return `<span class="data-source-badge" title="These numbers are demonstration data, not your real accounts.">SAMPLE DATA</span>`;
  if (source.startsWith("plaid")) return `<span class="data-source-badge sandbox" title="Connected through Plaid Sandbox test institutions, not live bank accounts.">SANDBOX DATA</span>`;
  return "";
}

function renderMobileAppChrome() {
  return `
    <div class="mobile-app-chrome" aria-label="PAM mobile app header">
      <div class="mobile-brand-lockup">
        <span>PAM</span>
        <div><strong>PAM AI</strong><small>Personal Asset Manager</small></div>
      </div>
      ${renderDataSourceBadge()}
      <button type="button" data-mobile-view="profile" aria-label="Open profile">Profile</button>
    </div>
  `;
}

function renderMobileBottomNav() {
  const items = [
    ["home", "Home"],
    ["ask", "Ask"],
    ["goals", "Goals"],
    ["profile", "Profile"]
  ];
  return `
    <nav class="mobile-bottom-nav" aria-label="PAM mobile navigation">
      ${items.map(([id, label]) => `
        <button class="${state.mobileView === id ? "active" : ""}" type="button" data-mobile-view="${id}" aria-current="${state.mobileView === id ? "page" : "false"}"><span>${label}</span></button>
      `).join("")}
    </nav>
  `;
}

function renderOnboardingWalkthrough() {
  if (state.walkthroughDismissed) return "";
  return `
    <section class="foresee-panel walkthrough-panel" aria-label="PAM walkthrough">
      <div>
        <div class="panel-kicker">Quick walkthrough</div>
        <h2>Your PAM homepage is built from your baseline.</h2>
      </div>
      <div class="walkthrough-steps">
        <article><strong>1</strong><span>Review your dashboard</span><p>Check buffer, cash, spending, debts, and goals.</p></article>
        <article><strong>2</strong><span>Ask one decision</span><p>Try rent, a car payment, a trip, a job change, or investing.</p></article>
        <article><strong>3</strong><span>Compare the tradeoff</span><p>PAM shows risk, taxes, savings, runway, and goal impact.</p></article>
      </div>
      <button class="button button-secondary" type="button" data-dismiss-walkthrough>Got it</button>
    </section>
  `;
}

function renderFeedbackPanel() {
  return `
    <section class="foresee-panel feedback-panel mobile-screen mobile-screen-profile" id="feedback">
      <div>
        <div class="panel-kicker">Feedback</div>
        <h2>Send a note.</h2>
        <p>Quick product feedback goes straight to the team.</p>
      </div>
      <form class="feedback-form" data-feedback-form>
        <label>
          <span>Your feedback</span>
          <textarea name="feedbackMessage" rows="3" placeholder="What should feel clearer, faster, or more useful?"></textarea>
        </label>
        <div class="feedback-inline-actions">
          <select name="feedbackRating" aria-label="Feedback rating">
            <option value="">Rating</option>
            <option value="5">5 - Great</option>
            <option value="4">4 - Good</option>
            <option value="3">3 - Okay</option>
            <option value="2">2 - Needs work</option>
            <option value="1">1 - Broken</option>
          </select>
          <button class="button button-primary" type="submit" ${state.feedbackBusy ? "disabled" : ""}>${state.feedbackBusy ? "Sending..." : "Send"}</button>
        </div>
        ${state.feedbackMessage ? `<p class="auth-status-message">${escapeHtml(state.feedbackMessage)}</p>` : ""}
      </form>
    </section>
  `;
}

function getProgressPercent(current, target) {
  const safeTarget = Math.max(toNumber(target), 1);
  return Math.max(4, Math.min(100, Math.round((toNumber(current) / safeTarget) * 100)));
}

function renderDecisionMemoryList(items, type = "history", emptyCopy = "Run a decision and PAM will remember it here.") {
  const actionAttr = type === "saved" ? "data-run-saved-scenario" : "data-run-history-question";
  if (!items.length) {
    return `
      <div class="decision-history-list empty">
        <button type="button" data-mobile-view="ask">
          <strong>No ${type === "saved" ? "saved scenarios" : "recent decisions"} yet</strong>
          <span>${escapeHtml(emptyCopy)}</span>
        </button>
      </div>
    `;
  }
  return `
    <div class="decision-history-list">
      ${items.map((item) => `
        <div class="decision-history-item">
          <button type="button" ${actionAttr}="${escapeHtml(item.question)}">
            <strong>${escapeHtml(item.question)}</strong>
            <span>${escapeHtml(formatShortDate(item.createdAt))} · ${escapeHtml(item.risk)} · ${formatCurrency(item.newBuffer)} buffer</span>
          </button>
          ${type === "saved" ? `<button class="tiny-remove-button" type="button" data-remove-saved-scenario="${escapeHtml(item.id)}" aria-label="Remove saved scenario">×</button>` : ""}
        </div>
      `).join("")}
    </div>
  `;
}

function renderReadinessList(checks = getReadinessChecks()) {
  return `
    <div class="readiness-list">
      ${checks.map((check) => `
        <div class="readiness-item ${check.tone === "good" ? "good" : "warn"}">
          <div>
            <strong>${escapeHtml(check.label)}</strong>
            <span>${escapeHtml(check.detail)}</span>
          </div>
          <em>${escapeHtml(check.status)}</em>
        </div>
      `).join("")}
    </div>
  `;
}

function renderMobileHomeScreen() {
  const ui = getUiBaseline(state.baseline);
  const connectedAccounts = getConnectedAccounts(state.baseline);
  const topExpenses = getTopConnectedExpenses(state.baseline, 3);
  const liabilities = state.baseline.obligations?.liabilities || [];
  const currentSavings = getCurrentSavings(state.baseline);
  const monthlyBuffer = getMonthlyBuffer(state.baseline);
  const monthlyExpenses = getMonthlyExpenses(state.baseline);
  const totalLiabilityBalance = liabilities.reduce((sum, item) => sum + toNumber(item.balance, 0), 0);
  const connectedBalanceTotal = connectedAccounts.reduce((sum, account) => sum + toNumber(account.current, 0), 0);
  const checkingBalance = connectedAccounts
    .filter((account) => String(account.type || "").includes("checking"))
    .reduce((sum, account) => sum + Number(account.available ?? account.current ?? 0), 0);
  const netWorth = connectedAccounts.length ? connectedBalanceTotal - totalLiabilityBalance : 0;
  const firstGoal = getGoalsFromBaseline(state.baseline)[0];
  const goalProgress = firstGoal ? getProgressPercent(firstGoal.currentAmount, firstGoal.targetAmount) : 0;
  const spendingPlan = Math.max(monthlyExpenses + Math.max(Math.round(Math.abs(monthlyBuffer) * 0.1), 1), 1);
  const spendingPercent = Math.min(100, Math.round((monthlyExpenses / spendingPlan) * 100));
  const dashboardFreshClass = state.dataFresh ? " data-fresh" : "";
  const profileCompleteness = getProfileCompleteness();
  const recentDecisions = state.decisionHistory.slice(0, 2);
  const chartValues = connectedAccounts
    .map((account) => Math.abs(toNumber(account.current, 0)))
    .filter((value) => value > 0);
  const maxChartValue = Math.max(...chartValues, 1);
  const chartPoints = chartValues.length
    ? chartValues.slice(0, 6).map((value) => Math.max(18, Math.round((value / maxChartValue) * 100)))
    : [24, 32, 44, 58, 72, 88];

  return `
    <section class="mobile-home-screen mobile-screen mobile-screen-home${dashboardFreshClass}" id="daily-home">
      <div class="mobile-home-hero">
        <div>
          <span>Hi ${escapeHtml(ui.firstName || "there")}</span>
          <h2>${connectedAccounts.length ? formatCurrency(netWorth) : "Connect accounts"}</h2>
          <p>${connectedAccounts.length ? `${formatCurrency(monthlyBuffer)} monthly buffer after goals.` : "Connect Sandbox data to build your dashboard."}</p>
        </div>
        <button type="button" data-mobile-view="ask">Ask PAM</button>
      </div>

      <div class="mobile-kpi-grid">
        <article><span>Monthly buffer</span><strong>${formatCurrency(monthlyBuffer)}</strong><small>${monthlyBuffer >= 500 ? "Room to test decisions" : "Keep decisions conservative"}</small></article>
        <article><span>Checking</span><strong>${formatCurrency(checkingBalance)}</strong><small>Available cash</small></article>
        <article><span>Savings</span><strong>${formatCurrency(currentSavings)}</strong><small>${netWorth > 0 ? `${getProgressPercent(currentSavings, netWorth)}% of net worth` : "From connected data"}</small></article>
        <article><span>Spending</span><strong>${spendingPercent}%</strong><small>${formatCurrency(monthlyExpenses)} this month</small></article>
      </div>

      ${firstGoal ? `
        <article class="mobile-goal-card mint mobile-home-goal">
          <div>
            <strong>${escapeHtml(firstGoal.title)}</strong>
            <span>${formatCurrency(firstGoal.currentAmount)} of ${formatCurrency(firstGoal.targetAmount)}</span>
          </div>
          <div class="mobile-goal-track"><b style="width:${goalProgress}%"></b></div>
        </article>
      ` : ""}

      ${state.userValues?.completed
        ? `${renderFinishProfileCard()}${renderInsightCards()}`
        : `<div class="insight-card values-cta-card mobile-values-cta"><strong>Personalize PAM</strong><p>A 2-minute setup so PAM can give you specific, goal-based guidance.</p><button class="button button-primary" type="button" data-open-view="values">Set up my profile →</button></div>`}

      <details class="mobile-home-more">
        <summary>More detail</summary>

        <div class="mobile-home-section">
          <div class="mobile-home-section-header">
            <h3>Top spending</h3>
          </div>
          <div class="mobile-compact-list">
            ${topExpenses.length ? topExpenses.map((item) => `
              <div><strong>${escapeHtml(item.name)}</strong><span>${formatCurrency(item.amount)}</span></div>
            `).join("") : `<div><strong>Connect accounts to see spending</strong><span>${formatCurrency(0)}</span></div>`}
          </div>
        </div>

        <div class="mobile-home-section">
          <div class="mobile-home-section-header">
            <h3>Recent decisions</h3>
          </div>
          <div class="decision-history-list compact">
            ${recentDecisions.length ? recentDecisions.map((item) => `
              <button type="button" data-run-history-question="${escapeHtml(item.question)}">
                <strong>${escapeHtml(item.question)}</strong>
                <span>${escapeHtml(item.risk)} · ${formatCurrency(item.newBuffer)} buffer</span>
              </button>
            `).join("") : `
              <button type="button" data-mobile-view="ask">
                <strong>Ask your first question</strong>
                <span>PAM will save recent decisions here.</span>
              </button>
            `}
          </div>
        </div>

        <div class="profile-completeness-card mobile-home-section">
          <div class="mobile-home-section-header">
            <h3>${escapeHtml(profileCompleteness.label)}</h3>
            <span>${profileCompleteness.score}%</span>
          </div>
          <div class="profile-completeness-meter"><b style="width:${profileCompleteness.score}%"></b></div>
          <p>${profileCompleteness.missing.length ? `Next: ${escapeHtml(profileCompleteness.missing.slice(0, 2).join(", "))}` : "PAM has enough context for stronger modeling."}</p>
        </div>
      </details>
    </section>
  `;
}

function renderMobileProfileScreen() {
  const baseline = getUiBaseline(state.baseline);
  const account = state.account || {};
  const connectedAccounts = getConnectedAccounts(state.baseline);
  const profileCompleteness = getProfileCompleteness();
  const updatedAt = state.baseline.metadata?.updatedAt ? new Date(state.baseline.metadata.updatedAt) : null;
  const updatedLabel = updatedAt && Number.isFinite(updatedAt.getTime())
    ? updatedAt.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "Not synced yet";

  return `
    <section class="foresee-panel mobile-profile-screen mobile-screen mobile-screen-profile" id="mobile-profile-page">
      <div class="panel-kicker">Profile</div>
      <h2>${escapeHtml(account.firstName || baseline.firstName || "Your")} account</h2>
      <p>${escapeHtml(account.emailAddress || baseline.emailAddress || "")}</p>

      <div class="mobile-profile-stack">
        <article>
          <span>Model strength</span>
          <strong>${escapeHtml(profileCompleteness.label)} · ${profileCompleteness.score}%</strong>
          <div class="profile-completeness-meter"><b style="width:${profileCompleteness.score}%"></b></div>
          <small>${profileCompleteness.missing.length ? `Missing: ${escapeHtml(profileCompleteness.missing.slice(0, 3).join(", "))}` : "Ready for stronger decision modeling."}</small>
        </article>
        <article>
          <span>Financial data</span>
          <strong>${connectedAccounts.length ? `${connectedAccounts.length} accounts connected` : "No accounts connected"}</strong>
          <small>Last sync: ${escapeHtml(updatedLabel)}</small>
          <div class="settings-action-row">
            <button class="button button-primary" type="button" data-connect-sandbox ${state.plaidBusy ? "disabled" : ""}>${state.plaidBusy ? "Syncing..." : connectedAccounts.length ? "Sync accounts" : "Connect accounts"}</button>
            ${connectedAccounts.length ? "" : `<button class="button button-secondary" type="button" data-load-sandbox ${state.plaidBusy ? "disabled" : ""}>Use sample baseline</button>`}
          </div>
        </article>
        <article>
          <span>Display</span>
          <strong>Theme</strong>
          <div class="theme-toggle-row" role="group" aria-label="Display theme">
            ${[["light", "Light"], ["dark", "Dark"], ["system", "System"]].map(([value, label]) => `
              <button class="${state.displayTheme === value ? "active" : ""}" type="button" data-display-theme="${value}">${label}</button>
            `).join("")}
          </div>
        </article>
        <article>
          <span>Security</span>
          <strong>Password</strong>
          <form class="compact-password-form" data-password-form>
            <input type="password" name="currentPassword" placeholder="Current password" autocomplete="current-password" />
            <input type="password" name="newPassword" placeholder="New password" autocomplete="new-password" />
            <input type="password" name="confirmNewPassword" placeholder="Confirm new password" autocomplete="new-password" />
            <button class="button button-secondary" type="submit" ${state.passwordBusy ? "disabled" : ""}>${state.passwordBusy ? "Updating..." : "Change password"}</button>
          </form>
          ${state.passwordMessage ? `<p class="auth-status-message">${escapeHtml(state.passwordMessage)}</p>` : ""}
        </article>
        <article>
          <span>Feedback</span>
          <strong>Help shape PAM</strong>
          <form class="feedback-form compact-feedback-form" data-feedback-form>
            <textarea name="feedbackMessage" rows="3" maxlength="600" placeholder="What felt confusing or useful?"></textarea>
            <button class="button button-secondary" type="submit" ${state.feedbackBusy ? "disabled" : ""}>${state.feedbackBusy ? "Sending..." : "Send feedback"}</button>
          </form>
          ${state.feedbackMessage ? `<p class="auth-status-message">${escapeHtml(state.feedbackMessage)}</p>` : ""}
        </article>
        <article>
          <span>Saved scenarios</span>
          <strong>${state.savedScenarios.length} saved</strong>
          <div class="settings-action-row small">
            <button class="button button-secondary" type="button" data-export-profile>Export profile</button>
            ${state.savedScenarios.length ? `<button class="button button-secondary" type="button" data-clear-saved-scenarios>Clear saved</button>` : ""}
          </div>
        </article>
        <article>
          <span>Account</span>
          <strong>Session</strong>
          <div class="settings-action-row small">
            <button class="button button-secondary" type="button" data-logout>Sign out</button>
          </div>
        </article>
      </div>
    </section>
  `;
}

function renderDailyDashboardHome() {
  const ui = getUiBaseline(state.baseline);
  const connectedAccounts = getConnectedAccounts(state.baseline);
  const topExpenses = getTopConnectedExpenses(state.baseline, 4);
  const liabilities = state.baseline.obligations?.liabilities || [];
  const currentSavings = getCurrentSavings(state.baseline);
  const monthlyBuffer = getMonthlyBuffer(state.baseline);
  const monthlyExpenses = getMonthlyExpenses(state.baseline);
  const obligations = getMonthlyObligations(state.baseline);
  const totalLiabilityBalance = liabilities.reduce((sum, item) => sum + toNumber(item.balance, 0), 0);
  const connectedBalanceTotal = connectedAccounts.reduce((sum, account) => sum + toNumber(account.current, 0), 0);
  const checkingBalance = connectedAccounts
    .filter((account) => String(account.type || "").includes("checking"))
    .reduce((sum, account) => sum + Number(account.available ?? account.current ?? 0), 0);
  const netWorth = connectedAccounts.length ? connectedBalanceTotal - totalLiabilityBalance : 0;
  const goalLabel = getGoalLabel(state.baseline) || "Move-out fund";
  const goalTarget = Math.max(toNumber(state.baseline.goals.goalTargetAmount), currentSavings + 1);
  const dashboardGoals = getGoalsFromBaseline(state.baseline).slice(0, 3);
  const spendingPlan = Math.max(monthlyExpenses + Math.max(Math.round(Math.abs(monthlyBuffer) * 0.1), 1), 1);
  const spendingPercent = Math.min(100, Math.round((monthlyExpenses / spendingPlan) * 100));
  const underPlan = Math.max(spendingPlan - monthlyExpenses, 0);
  const hasConnectedData = connectedAccounts.length > 0;
  const netWorthRanges = {
    "1M": { months: 1, label: "1 month" },
    "3M": { months: 3, label: "3 months" },
    "6M": { months: 6, label: "6 months" },
    "1Y": { months: 12, label: "1 year" },
    All: { months: 24, label: "24 months" }
  };
  const activeRange = netWorthRanges[state.netWorthRange] ? state.netWorthRange : "3M";
  const rangeConfig = netWorthRanges[activeRange];
  const projectedChange = Math.round(monthlyBuffer * rangeConfig.months);
  const projectedNetWorth = Math.max(netWorth + projectedChange, 0);
  const projectedPercent = netWorth > 0 ? ((projectedChange / netWorth) * 100).toFixed(Math.abs(projectedChange) >= 1000 ? 1 : 2) : "0.0";
  const accountValues = connectedAccounts
    .map((account) => Math.abs(toNumber(account.current, 0)))
    .filter((value) => value > 0);
  const maxAccountValue = Math.max(...accountValues, 1);
  const projectionSteps = activeRange === "1M" ? 4 : activeRange === "3M" ? 6 : 8;
  const projectionValues = Array.from({ length: projectionSteps }, (_, index) => {
    const progress = projectionSteps === 1 ? 1 : index / (projectionSteps - 1);
    return Math.max(netWorth + projectedChange * progress, 0);
  });
  const maxProjectionValue = Math.max(...projectionValues, 1);
  const chartPoints = hasConnectedData
    ? projectionValues.map((value) => Math.max(14, Math.round((value / maxProjectionValue) * 96)))
    : [12, 12, 12, 12];
  const chartLabels = hasConnectedData
    ? projectionValues.map((_, index) => {
      if (index === 0) return "Now";
      if (index === projectionValues.length - 1) return activeRange;
      return "";
    })
    : ["", "", "", ""];
  const expenseRows = topExpenses.length ? topExpenses : [];
  const dashboardFreshClass = state.dataFresh ? " data-fresh" : "";
  const profileCompleteness = getProfileCompleteness();
  const readinessChecks = getReadinessChecks();
  const recentDecisions = state.decisionHistory.slice(0, 3);
  const savedScenarios = state.savedScenarios.slice(0, 3);
  const colors = ["#1e9f78", "#3b82d6", "#c27a13", "#d4507d"];

  return `
    <section class="daily-home-shell mobile-screen mobile-screen-home" id="daily-home">
      <aside class="daily-column daily-advisor-card">
        <div>
          <div class="panel-kicker">Today</div>
          <h2>Hi ${escapeHtml(ui.firstName || "there")}</h2>
          <p>Here’s what changed in your money.</p>
        </div>
        <div class="daily-update-list">
          <div class="daily-update">
            <span class="daily-icon mint">↗</span>
            <div><strong>Monthly buffer ${monthlyBuffer >= 0 ? "up" : "down"} to ${formatCurrency(monthlyBuffer)}</strong><p>${monthlyBuffer >= 500 ? "You have room to test decisions." : "Keep decisions conservative until buffer improves."}</p></div>
          </div>
          <div class="daily-update">
            <span class="daily-icon blue">⌂</span>
            <div><strong>${escapeHtml(goalLabel)} ${currentSavings >= goalTarget ? "funded" : "in progress"}</strong><p>${formatCurrency(currentSavings)} of ${formatCurrency(goalTarget)}</p></div>
          </div>
          <div class="daily-update">
            <span class="daily-icon amber">▤</span>
          <div><strong>${hasConnectedData ? `Spending ${formatCurrency(underPlan)} under plan` : "Connect accounts to see spending"}</strong><p>${hasConnectedData ? `${spendingPercent}% of ${formatCurrency(spendingPlan)} plan used.` : "PAM will build this from connected transactions."}</p></div>
          </div>
        </div>
        <details class="daily-context-section" open>
          <summary>Your goals</summary>
          <div class="daily-context-body">
            ${dashboardGoals.length ? dashboardGoals.map((goal, index) => `
              <div class="goal-row ${index === 1 ? "blue" : index === 2 ? "amber" : ""}">
                <strong>${escapeHtml(goal.title)}</strong>
                <span><b style="width:${getProgressPercent(goal.currentAmount, goal.targetAmount)}%"></b></span>
                <p>${formatCurrency(goal.currentAmount)} of ${formatCurrency(goal.targetAmount)}</p>
              </div>
            `).join("") : `
              <div class="goal-row"><strong>No goal yet</strong><span><b style="width:0%"></b></span><p>Add a goal to see progress.</p></div>
            `}
          </div>
        </details>
        <details class="daily-context-section">
          <summary>Model strength</summary>
          <div class="daily-context-body profile-readiness-card">
            <div class="side-card-heading">
              <h3>${profileCompleteness.label}</h3>
              <span>${profileCompleteness.score}%</span>
            </div>
            <div class="profile-completeness-meter"><b style="width:${profileCompleteness.score}%"></b></div>
            <p>${profileCompleteness.missing.length ? `Next: ${escapeHtml(profileCompleteness.missing.slice(0, 2).join(", "))}` : "PAM has the core context it needs."}</p>
          </div>
        </details>
        <details class="daily-context-section">
          <summary>Readiness</summary>
          <div class="daily-context-body">${renderReadinessList(readinessChecks)}</div>
        </details>
        <details class="daily-context-section">
          <summary>Recent decisions</summary>
          <div class="daily-context-body">${renderDecisionMemoryList(recentDecisions, "history")}</div>
        </details>
        <details class="daily-context-section">
          <summary>Saved scenarios</summary>
          <div class="daily-context-body">${renderDecisionMemoryList(savedScenarios, "saved", "Save scenarios from a result to compare later.")}</div>
        </details>
      </aside>

      <div class="daily-action-column">
        ${renderDecisionPanel()}
        ${renderResult()}
        ${state.plaidBusy ? `<div class="dashboard-refreshing-banner" role="status" aria-live="polite"><span class="plaid-spinner" aria-hidden="true"></span> Refreshing your connected data…</div>` : ""}
        ${state.userValues?.completed ? renderFinishProfileCard() : `<div class="insight-card values-cta-card"><strong>Personalize PAM</strong><p>A 2-minute setup so PAM can tell you what matters for your specific goals — not generic advice.</p><button class="button button-primary" type="button" data-open-view="values">Set up my profile →</button></div>`}
        ${renderInsightCards()}
        <div class="daily-main-card${dashboardFreshClass}${state.plaidBusy ? " dashboard-loading-overlay" : ""}">
        <div class="daily-networth-header">
          <div class="panel-kicker">Net worth ${renderDataSourceBadge()}</div>
          <h2>${state.plaidBusy && !hasConnectedData ? "…" : hasConnectedData ? formatCurrency(netWorth) : "—"}</h2>
          <p>${state.plaidBusy ? "Pulling your latest balances from Plaid…" : hasConnectedData ? `Assets minus liabilities across ${connectedAccounts.length} connected account${connectedAccounts.length === 1 ? "" : "s"}.` : "Connect your accounts to see your real net worth."}</p>
        </div>
        <div class="daily-metric-strip">
          <div><span>Savings</span><strong>${formatCurrency(currentSavings)}</strong><small>${hasConnectedData && netWorth > 0 ? `${getProgressPercent(currentSavings, netWorth)}% of net worth` : hasConnectedData ? "Connected data" : "Manual baseline"}</small></div>
          <div><span>Checking</span><strong>${formatCurrency(checkingBalance)}</strong><small>Available</small></div>
          <div><span>Monthly buffer</span><strong>${formatCurrency(monthlyBuffer)}</strong><small>After goals</small></div>
        </div>

        <details class="daily-detail-section">
        <summary>Spending &amp; connected accounts</summary>
        <div class="daily-spending-card${dashboardFreshClass}">
          <div class="spending-header">
            <div><h3>This month’s spending</h3><p>${formatCurrency(monthlyExpenses)} of ${formatCurrency(spendingPlan)} plan · ${spendingPercent}%</p></div>
            <strong>${formatCurrency(underPlan)} under plan</strong>
          </div>
          <div class="spending-list">
            ${expenseRows.length ? expenseRows.slice(0, 4).map((item, index) => `
              <div class="spending-row">
                <span class="spending-dot" style="background:${colors[index % colors.length]}"></span>
                <strong>${escapeHtml(item.name)}</strong>
                <em>${formatCurrency(item.amount)}</em>
                <i><b style="width:${Math.min(100, Math.round((toNumber(item.amount) / spendingPlan) * 100))}%; background:${colors[index % colors.length]}"></b></i>
              </div>
            `).join("") : `
              <div class="spending-row placeholder-row">
                <span class="spending-dot" style="background:${colors[0]}"></span>
                <strong>Connect accounts to see spending</strong>
                <em>${formatCurrency(0)}</em>
                <i><b style="width:0%; background:${colors[0]}"></b></i>
              </div>
            `}
          </div>
        </div>

        <div class="daily-spending-card accounts-strip${dashboardFreshClass}">
          <div class="spending-header">
            <div><h3>Connected accounts</h3><p>${connectedAccounts.length ? `${connectedAccounts.length} accounts feeding PAM` : "Connect accounts to populate this view."}</p></div>
          </div>
          <div class="spending-list">
            ${connectedAccounts.length ? connectedAccounts.slice(0, 5).map((account, index) => `
              <div class="spending-row">
                <span class="spending-dot" style="background:${colors[index % colors.length]}"></span>
                <strong>${escapeHtml(account.name || "Connected account")}</strong>
                <em>${formatCurrency(toNumber(account.current, 0))}</em>
                <i><b style="width:${Math.max(8, Math.round((Math.abs(toNumber(account.current, 0)) / maxAccountValue) * 100))}%; background:${colors[index % colors.length]}"></b></i>
              </div>
            `).join("") : `
              <div class="spending-row placeholder-row">
                <span class="spending-dot" style="background:${colors[0]}"></span>
                <strong>Connect accounts to see balances</strong>
                <em>${formatCurrency(0)}</em>
                <i><b style="width:0%; background:${colors[0]}"></b></i>
              </div>
            `}
          </div>
        </div>
        </details>
      </div>
    </section>
  `;
}

function renderMobileGoalsScreen() {
  const tones = ["mint", "blue", "amber"];
  const goals = getGoalsFromBaseline(state.baseline).slice(0, 3).map((goal, index) => ({
    title: goal.title,
    amount: `${formatCurrency(goal.currentAmount)} of ${formatCurrency(goal.targetAmount)}`,
    progress: getProgressPercent(goal.currentAmount, goal.targetAmount),
    tone: tones[index % tones.length]
  }));

  return `
    <section class="foresee-panel mobile-only-screen mobile-screen mobile-screen-goals" id="mobile-goals-page">
      <div class="panel-kicker">Goals</div>
      <h2>Your goals</h2>
      <div class="mobile-goal-stack">
        ${goals.map((goal) => `
          <article class="mobile-goal-card ${goal.tone}">
            <div>
              <strong>${escapeHtml(goal.title)}</strong>
              <span>${escapeHtml(goal.amount)}</span>
            </div>
            <div class="mobile-goal-track"><b style="width:${goal.progress}%"></b></div>
          </article>
        `).join("")}
      </div>
      <div class="goal-template-row">
        ${goalTemplates.slice(0, 5).map((template) => `
          <button type="button" data-goal-template="${escapeHtml(template.id)}">${escapeHtml(template.title)}</button>
        `).join("")}
      </div>
      <form class="feedback-form goal-save-form" data-goal-form>
        <label><span>Add goal</span><input name="goalTitle" placeholder="Move out safely" maxlength="80" /></label>
        <div class="feedback-inline-actions">
          <input name="goalTargetAmount" type="number" min="1" placeholder="Target $" />
          <button class="button button-primary" type="submit">Save goal</button>
        </div>
      </form>
    </section>
  `;
}

function renderConnectedInsights() {
  if (!state.baseline.source.startsWith("plaid")) return "";
  const topExpenses = getTopConnectedExpenses(state.baseline, 3);
  const incomeStreams = state.baseline.income?.incomeStreams || [];
  const liabilities = state.baseline.obligations?.liabilities || [];
  const connectedAccounts = getConnectedAccounts(state.baseline);
  const updatedAt = state.baseline.metadata?.updatedAt ? new Date(state.baseline.metadata.updatedAt) : null;
  const updatedLabel = updatedAt && Number.isFinite(updatedAt.getTime())
    ? updatedAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : "recently";

  return `
    <section class="foresee-panel mobile-screen mobile-screen-accounts" id="mobile-accounts">
      <div class="panel-kicker">Accounts</div>
      <h2>Your financial baseline.</h2>
      <p class="section-compact-note">Last updated ${escapeHtml(updatedLabel)}. PAM uses this snapshot for decisions, spending, goals, and runway.</p>
      <div class="feature-grid">
        <article><h3>Detected income</h3><p>${incomeStreams[0] ? `${formatCurrency(incomeStreams[0].amount)}/month from connected deposits.` : "No recurring income pattern detected yet."}</p></article>
        <article><h3>Largest recurring costs</h3><p>${topExpenses.length ? topExpenses.map((item) => `${item.name} ${formatCurrency(item.amount)}`).join(" • ") : "No recurring expenses detected yet."}</p></article>
        <article><h3>Debt obligations</h3><p>${liabilities.length ? `${liabilities.length} connected liabilities totaling about ${formatCurrency(getMonthlyObligations(state.baseline))}/month.` : "No liabilities detected from connected data."}</p></article>
      </div>
      ${connectedAccounts.length ? `
        <div class="connected-account-list">
          ${connectedAccounts.map((account) => `
            <div class="connected-account-card">
              <span>${escapeHtml(account.name)}</span>
              <strong>${formatCurrency(account.current)}</strong>
              <small>${escapeHtml(String(account.subtype || account.type || "account").replace(/_/g, " "))}</small>
            </div>
          `).join("")}
        </div>
      ` : ""}
    </section>
  `;
}

function getStructuredDecisionModeConfig() {
  return {
    expense: {
      label: "Expense",
      title: "One-time spend",
      presets: [
        { label: "$2,500 trip", draft: { name: "vacation", amount: "2500", priority: "Optional" } },
        { label: "$1,200 laptop", draft: { name: "laptop for freelance work", amount: "1200", priority: "Medium" } },
        { label: "$800 emergency", draft: { name: "emergency repair", amount: "800", priority: "Essential" } }
      ]
    },
    recurring: {
      label: "Recurring",
      title: "Monthly commitment",
      presets: [
        { label: "$400 car", draft: { name: "car payment", amount: "400", duration: "Ongoing" } },
        { label: "$50 gym", draft: { name: "gym membership", amount: "50", duration: "Ongoing" } },
        { label: "$2,200 rent", draft: { name: "new apartment rent", amount: "2200", duration: "12 months" } }
      ]
    },
    invest: {
      label: "Invest",
      title: "Growth projection",
      presets: [
        { label: "$200/mo", draft: { amount: "200", years: "10", returnRate: "7" } },
        { label: "$500/mo", draft: { amount: "500", years: "10", returnRate: "7" } },
        { label: "Roth pace", draft: { amount: "583", years: "20", returnRate: "7" } }
      ]
    },
    income: {
      label: "Income ±",
      title: "Income change",
      presets: [
        { label: "+$500 raise", draft: { delta: "500", timing: "Immediately", workType: "W-2 employee" } },
        { label: "+$1,500 freelance", draft: { delta: "1500", timing: "Immediately", workType: "1099 / self-employed" } },
        { label: "-$1,000 hours cut", draft: { delta: "-1000", timing: "Next month", workType: "W-2 employee" } }
      ]
    }
  };
}

function getStructuredDecisionDraft(mode = state.decisionMode) {
  state.structuredDecisionDraft = state.structuredDecisionDraft || {};
  if (!state.structuredDecisionDraft[mode]) {
    state.structuredDecisionDraft[mode] = {};
  }
  return state.structuredDecisionDraft[mode];
}

function renderStructuredDecisionFields(mode, draft) {
  if (mode === "recurring") {
    return `
      <label><span>What is the monthly cost?</span><input name="name" value="${escapeHtml(draft.name || "")}" placeholder="Car payment, rent increase, subscription" /></label>
      <label><span>Monthly amount</span><input name="amount" type="number" min="0" inputmode="decimal" value="${escapeHtml(draft.amount || "")}" placeholder="400" /></label>
      <label><span>Duration</span><select name="duration">
        ${["Ongoing", "6 months", "12 months", "24 months", "36 months", "60 months"].map((option) => `<option value="${option}" ${draft.duration === option ? "selected" : ""}>${option}</option>`).join("")}
      </select></label>
    `;
  }

  if (mode === "invest") {
    return `
      <label><span>Monthly investment</span><input name="amount" type="number" min="0" inputmode="decimal" value="${escapeHtml(draft.amount || "200")}" placeholder="200" /></label>
      <label><span>Years</span><input name="years" type="number" min="1" max="45" inputmode="numeric" value="${escapeHtml(draft.years || "10")}" placeholder="10" /></label>
      <label><span>Hypothetical return</span><select name="returnRate">
        ${["5", "7", "10"].map((option) => `<option value="${option}" ${String(draft.returnRate || "7") === option ? "selected" : ""}>${option}% / year</option>`).join("")}
      </select></label>
    `;
  }

  if (mode === "income") {
    return `
      <label><span>Monthly income change</span><input name="delta" type="number" inputmode="decimal" value="${escapeHtml(draft.delta || "500")}" placeholder="+500 or -1000" /></label>
      <label><span>Starting when</span><select name="timing">
        ${["Immediately", "Next month", "In 3 months"].map((option) => `<option value="${option}" ${draft.timing === option ? "selected" : ""}>${option}</option>`).join("")}
      </select></label>
      <label><span>Work type</span><select name="workType">
        ${["W-2 employee", "1099 / self-employed", "Mixed income"].map((option) => `<option value="${option}" ${draft.workType === option ? "selected" : ""}>${option}</option>`).join("")}
      </select></label>
    `;
  }

  return `
    <label><span>What is the purchase?</span><input name="name" value="${escapeHtml(draft.name || "")}" placeholder="Trip, laptop, emergency repair" /></label>
    <label><span>Amount</span><input name="amount" type="number" min="0" inputmode="decimal" value="${escapeHtml(draft.amount || "")}" placeholder="2500" /></label>
    <label><span>Priority</span><select name="priority">
      ${["Optional", "Medium", "Essential"].map((option) => `<option value="${option}" ${draft.priority === option ? "selected" : ""}>${option}</option>`).join("")}
    </select></label>
  `;
}

function buildStructuredDecisionQuestion(mode, formData) {
  if (mode === "recurring") {
    const name = String(formData.get("name") || "new recurring cost").trim();
    const amount = toNumber(formData.get("amount"), 0);
    const duration = String(formData.get("duration") || "Ongoing");
    return `Can I afford ${name} with a ${formatCurrency(amount)}/month payment for ${duration}?`;
  }

  if (mode === "invest") {
    const amount = toNumber(formData.get("amount"), 0);
    const years = toNumber(formData.get("years"), 10);
    const returnRate = toNumber(formData.get("returnRate"), 7);
    return `What if I invest ${formatCurrency(amount)}/month for ${years} years with a hypothetical ${returnRate}% annual return?`;
  }

  if (mode === "income") {
    const delta = toNumber(formData.get("delta"), 0);
    const timing = String(formData.get("timing") || "Immediately");
    const workType = String(formData.get("workType") || "W-2 employee");
    const direction = delta >= 0 ? "increase" : "decrease";
    return `How would an income change ${direction} of ${delta >= 0 ? "+" : "-"}${formatCurrency(Math.abs(delta))}/month affect my taxes, buffer, and goals? It starts ${timing.toLowerCase()} and the work type is ${workType}.`;
  }

  const name = String(formData.get("name") || "this purchase").trim();
  const amount = toNumber(formData.get("amount"), 0);
  const priority = String(formData.get("priority") || "Medium");
  return `What happens if I spend ${formatCurrency(amount)} on ${name}? Priority: ${priority}.`;
}

function parseDurationMonths(value) {
  const text = String(value || "").toLowerCase();
  if (text.includes("ongoing")) return 60;
  const match = text.match(/(\d+)/);
  return match ? Math.max(Number(match[1]), 1) : 12;
}

function buildStructuredScenarioDraft(mode, formData) {
  if (mode === "recurring") {
    const name = String(formData.get("name") || "new recurring cost").trim();
    return {
      type: "rentIncrease",
      monthlyExpenseDelta: toNumber(formData.get("amount"), 0),
      durationMonths: parseDurationMonths(formData.get("duration")),
      prompt: name
    };
  }

  if (mode === "invest") {
    const amount = toNumber(formData.get("amount"), 0);
    const years = Math.max(toNumber(formData.get("years"), 10), 1);
    return {
      type: "invest",
      monthlyInvestingDelta: amount,
      durationMonths: Math.round(years * 12),
      prompt: `Invest ${formatCurrency(amount)} per month`
    };
  }

  if (mode === "income") {
    const delta = toNumber(formData.get("delta"), 0);
    return {
      type: delta > 0 ? "custom" : "incomeReduction",
      monthlyIncomeDelta: delta,
      durationMonths: parseDurationMonths(formData.get("timing")),
      prompt: `Income change ${formatSignedCurrency(delta)} per month`
    };
  }

  const name = String(formData.get("name") || "this purchase").trim();
  return {
    type: "emergency",
    oneTimeCost: toNumber(formData.get("amount"), 0),
    durationMonths: 12,
    prompt: name
  };
}

function renderStructuredDecisionBuilder() {
  const modes = getStructuredDecisionModeConfig();
  const activeMode = modes[state.decisionMode] ? state.decisionMode : "expense";
  const config = modes[activeMode];
  const draft = getStructuredDecisionDraft(activeMode);
  const expanded = Boolean(state.structuredBuilderExpanded);

  return `
    <div class="structured-simulator ${expanded ? "expanded" : "collapsed"}" aria-label="Structured decision builder">
      <div class="decision-type-tabs" role="tablist" aria-label="Decision type">
        ${Object.entries(modes).map(([key, item]) => `
          <button class="${activeMode === key ? "active" : ""}" type="button" data-decision-mode="${key}" role="tab" aria-selected="${activeMode === key ? "true" : "false"}">${item.label}</button>
        `).join("")}
      </div>
      ${expanded ? `
      <div class="structured-sim-card">
        <div class="structured-sim-header">
          <span>${escapeHtml(config.title)}</span>
        </div>
        <div class="structured-preset-row">
          ${config.presets.map((preset, index) => `<button type="button" data-structured-preset="${index}" data-preset-mode="${activeMode}">${escapeHtml(preset.label)}</button>`).join("")}
        </div>
        <form class="structured-decision-form" data-structured-decision-form>
          <input type="hidden" name="mode" value="${activeMode}" />
          <div class="structured-field-grid">
            ${renderStructuredDecisionFields(activeMode, draft)}
          </div>
          <button class="button button-primary" type="submit" ${state.decisionBusy ? "disabled" : ""}>${state.decisionBusy ? "Analyzing..." : "Run scenario"}</button>
        </form>
      </div>
      ` : ""}
    </div>
  `;
}

function getDecisionNextSteps(result) {
  const monthlyImpact = Math.abs(toNumber(result?.decision?.monthlyImpact));
  const oneTimeImpact = Math.abs(toNumber(result?.decision?.oneTimeImpact));
  const smallerMonthly = monthlyImpact ? Math.max(Math.round(monthlyImpact * 0.7), 25) : 0;
  const smallerOneTime = oneTimeImpact ? Math.max(Math.round(oneTimeImpact * 0.75), 100) : 0;

  // Self-contained prompts — never embed the raw question (it compounds into garbled text).
  return [
    monthlyImpact
      ? `Compare this with a ${formatCurrency(smallerMonthly)}/month version.`
      : `Compare this with a ${formatCurrency(smallerOneTime || 1000)} version.`,
    "What would I need to cut to make this safer?",
    "What's the safest time to do this?"
  ];
}

function getAdvisorSummary(result, goalLabel) {
  const guidance = state.aiGuidance?.guidance;
  if (guidance) {
    return {
      source: "AI advisor summary",
      headline: guidance.assistant?.headline || "PAM has a read on this decision.",
      body: guidance.assistant?.body || result.explanation,
      interpretationSummary: guidance.interpretationSummary || "",
      followUpPrompt: guidance.followUpPrompt || "Want PAM to compare a safer version?",
      followUpChoiceLabels: Array.isArray(guidance.followUpChoiceLabels) ? guidance.followUpChoiceLabels : []
    };
  }

  const monthlyImpact = Math.abs(toNumber(result?.decision?.monthlyImpact));
  const oneTimeImpact = Math.abs(toNumber(result?.decision?.oneTimeImpact));
  const impactText = monthlyImpact
    ? `${formatCurrency(monthlyImpact)}/month`
    : oneTimeImpact
      ? formatCurrency(oneTimeImpact)
      : "no major cash change";
  const goalText = result.goalDelay
    ? `It may delay ${goalLabel.toLowerCase()} by about ${formatMonths(result.goalDelay)}.`
    : `It does not materially delay ${goalLabel.toLowerCase()} in this estimate.`;
  const bufferText = `Your monthly buffer moves from ${formatCurrency(result.currentBuffer)} to ${formatCurrency(result.newBuffer)}.`;
  const headline = result.risk.label === "Low"
    ? "This looks workable, but PAM would still compare timing before you commit."
    : result.risk.label === "Medium"
      ? "This is possible, but it narrows your margin."
      : "This is the version to avoid until the cost, timing, or income picture changes.";
  const body = `${bufferText} PAM sees ${impactText} of impact, with ${result.risk.label.toLowerCase()} risk based on your current baseline. ${goalText}`;

  return {
    source: state.decisionBusy ? "AI refining..." : "Advisor summary",
    headline,
    body,
    interpretationSummary: `PAM treated this as a ${result.decision.type.toLowerCase()} and compared it against your cash flow, savings, tax estimate, and main goal.`,
    followUpPrompt: "Next, compare one safer version before you decide.",
    followUpChoiceLabels: getDecisionNextSteps(result).slice(0, 3)
  };
}

function renderScenarioEngineDetails(result) {
  const session = result?.scenarioSession;
  const scenario = session?.result;
  if (!scenario) return "";
  const goals = scenario.goalsSummary?.goals || [];
  const offsetActions = scenario.offsetPlan?.actions || [];
  const trace = scenario.reasoningTrace || [];
  const credit = scenario.creditReadiness;

  return `
    <div class="result-section scenario-engine-output">
      <h3>Aha moment</h3>
      <p>${escapeHtml(scenario.ahaMoment || result.explanation)}</p>
      <div class="outcome-grid">
        ${(scenario.impactCards || []).map((card) => `
          <div><span>${escapeHtml(card.label)}</span><strong>${escapeHtml(card.value)}</strong><small>${escapeHtml(card.detail || "")}</small></div>
        `).join("")}
      </div>
      ${goals.length ? `
        <h3>Goal impact</h3>
        <div class="goal-impact-stack">
          ${goals.slice(0, 3).map((goal) => `
            <div class="goal-impact-row">
              <span class="gi-name">${escapeHtml(goal.title)}</span>
              <span class="gi-change ${goal.deltaMonths > 0 ? "bad" : "neutral"}">${Number.isFinite(goal.deltaMonths) ? formatMonths(Math.max(Math.round(goal.deltaMonths), 0)) : escapeHtml(goal.status || "At risk")}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
      ${credit ? `
        <h3>Credit and approval fit</h3>
        <div class="goal-impact-stack">
          <div class="goal-impact-row">
            <span class="gi-name">Approval strength</span>
            <span class="gi-change neutral">${escapeHtml(credit.approvalStrength)}</span>
          </div>
          <div class="goal-impact-row">
            <span class="gi-name">Credit profile</span>
            <span class="gi-change neutral">${escapeHtml(credit.score ? `${credit.score} · ${credit.tier}` : credit.tier)}</span>
          </div>
          <div class="goal-impact-row">
            <span class="gi-name">Debt-to-income after decision</span>
            <span class="gi-change neutral">${escapeHtml(formatPercent(credit.debtToIncome || 0))}</span>
          </div>
        </div>
        ${credit.constraints?.length ? `<p class="section-compact-note">${escapeHtml(credit.constraints.join(" · "))}</p>` : ""}
      ` : ""}
      ${offsetActions.length ? `
        <h3>Offset plan</h3>
        <div class="goal-impact-stack">
          ${offsetActions.map((action) => `
            <div class="goal-impact-row">
              <span class="gi-name">${escapeHtml(action.label)}</span>
              <span class="gi-change neutral">${action.amount ? `${formatCurrency(action.amount)} ${escapeHtml(action.cadence || "")}` : escapeHtml(action.cadence || "No cut")}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
      ${trace.length ? `
        <h3>Reasoning trace</h3>
        <div class="reasoning-trace-list">
          ${trace.map((step) => `<p><strong>${escapeHtml(step.label)}</strong> ${escapeHtml(step.detail)}</p>`).join("")}
        </div>
      ` : ""}
    </div>
  `;
}

function renderDashboardSummary() {
  if (!state.baseline.source.startsWith("plaid")) return "";
  const ui = getUiBaseline(state.baseline);
  const connectedAccounts = getConnectedAccounts(state.baseline);
  const liabilities = state.baseline.obligations?.liabilities || [];
  const topExpenses = getTopConnectedExpenses(state.baseline, 4);
  const investmentBalance = connectedAccounts
    .filter((account) => String(account.type || "").includes("investment"))
    .reduce((sum, account) => sum + Number(account.current || 0), 0);
  const debtBalance = liabilities.reduce((sum, item) => sum + Number(item.balance || 0), 0);
  const availableCash = connectedAccounts
    .filter((account) => ["checking", "savings"].includes(account.type))
    .reduce((sum, account) => sum + Number(account.available ?? account.current ?? 0), 0);

  return `
    <section class="foresee-panel">
      <div class="panel-kicker">Dashboard snapshot</div>
      <h2>Accounts, spending, goals, and risk in one view.</h2>
      <div class="outcome-grid dashboard-metric-grid">
        <div><span>Connected accounts</span><strong>${connectedAccounts.length}</strong><small>Checking, savings, credit, and investing can all flow in here.</small></div>
        <div><span>Available cash</span><strong>${formatCurrency(availableCash)}</strong><small>Across connected cash accounts.</small></div>
        <div><span>Protected savings</span><strong>${formatCurrency(getCurrentSavings(state.baseline))}</strong><small>Used for runway and goal protection.</small></div>
        <div><span>Investments</span><strong>${formatCurrency(investmentBalance)}</strong><small>Longer-term accounts connected through Plaid can show up here too.</small></div>
        <div><span>Recurring spend</span><strong>${formatCurrency(getMonthlyExpenses(state.baseline))}</strong><small>Detected from recurring Sandbox transactions.</small></div>
        <div><span>Debt balance</span><strong>${formatCurrency(debtBalance)}</strong><small>${liabilities.length ? `${liabilities.length} liability accounts connected.` : "No liabilities detected."}</small></div>
      </div>
      <div class="connected-dashboard-grid">
        <div class="connected-dashboard-card">
          <h3>Account mix</h3>
          <div class="connected-account-list">
            ${connectedAccounts.map((account) => `
              <div class="connected-account-card">
                <span>${escapeHtml(account.name)}</span>
                <strong>${formatCurrency(account.current)}</strong>
                <small>${escapeHtml(String(account.subtype || account.type || "account").replace(/_/g, " "))}</small>
              </div>
            `).join("")}
          </div>
        </div>
        <div class="connected-dashboard-card">
          <h3>Recurring outflows</h3>
          <div class="connected-account-list">
            ${topExpenses.map((item) => `
              <div class="connected-account-card">
                <span>${escapeHtml(item.name)}</span>
                <strong>${formatCurrency(item.amount)}</strong>
                <small>${escapeHtml(item.category || "monthly")}</small>
              </div>
            `).join("")}
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderAccountSettingsPanel(baseline, account, isComplete) {
  const updatedAt = state.baseline.metadata?.updatedAt ? new Date(state.baseline.metadata.updatedAt) : null;
  const updatedLabel = updatedAt && Number.isFinite(updatedAt.getTime())
    ? updatedAt.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : "Not synced yet";
  const themeOptions = [
    ["light", "Light"],
    ["dark", "Dark"],
    ["system", "System"]
  ];
  const profileCompleteness = getProfileCompleteness();

  if (!isComplete) {
    return `
      <div class="account-settings-shell">
        <div class="account-status-card">
          <div class="account-status-main">
            <div class="panel-kicker">Account created</div>
            <h3>Welcome, ${escapeHtml(account.firstName || baseline.firstName || "there")}.</h3>
            <p>${escapeHtml(account.emailAddress || baseline.emailAddress || "")}</p>
          </div>
        </div>
        ${!hasAcceptedLegalTerms() ? renderLegalGate() : state.clerkFirstDecisionStep ? `
          <div class="connect-first-panel">
            <div class="panel-kicker">First, what do you actually want?</div>
            <h3>What matters most to you?</h3>
            <p>Pick what you're working toward. PAM tailors every answer to this — generic advice is often wrong for what <em>you</em> want.</p>
            <div class="life-values-row">
              ${LIFE_VALUES.map(v => `<button type="button" class="life-value-chip ${(state.lifeValues||[]).includes(v) ? "selected" : ""}" data-life-value="${escapeHtml(v)}">${escapeHtml(v)}</button>`).join("")}
            </div>
            <h3 style="margin-top:18px">And what should PAM help with first?</h3>
            <textarea class="clerk-first-decision-input" rows="2" placeholder="Can I afford to move out if rent is $1,800?" data-clerk-first-decision-input>${escapeHtml(state.clerkFirstDecision)}</textarea>
            <div class="wizard-suggestion-row">
              ${["Can I move out this year?","What car payment can I actually handle?","Am I saving enough each month?","Should I pay off debt or start investing?"].map(s => `<button type="button" data-clerk-decision-suggestion="${escapeHtml(s)}">${escapeHtml(s)}</button>`).join("")}
            </div>
            <div class="settings-action-row">
              <button class="button button-primary" type="button" data-clerk-first-decision-submit ${!state.clerkFirstDecision.trim() ? "disabled" : ""}>Continue</button>
            </div>
          </div>
        ` : `
          <div class="connect-first-panel">
            <div class="panel-kicker">One more step</div>
            <h3>Connect your accounts.</h3>
            <p>PAM reads your balances, income, and spending to model decisions accurately — no manual entry needed.</p>
            ${state.plaidBusy ? renderPlaidConnecting() : `
              <div class="settings-action-row">
                <button class="button button-primary" type="button" data-connect-sandbox>Connect securely with Plaid</button>
                <button class="button button-secondary" type="button" data-load-sandbox>Use sample data instead</button>
              </div>
              ${renderPlaidTrustNote()}
            `}
          </div>
        `}
        ${getStatus("account") ? `<p class="auth-status-message">${escapeHtml(getStatus("account"))}</p>` : ""}
      </div>
    `;
  }

  return `
    <div class="account-settings-shell">
      <div class="account-status-card">
        <div class="account-status-main">
          <div class="panel-kicker">Signed in</div>
          <h3>${escapeHtml(account.firstName || baseline.firstName || "Your")} account</h3>
          <p>${escapeHtml(account.emailAddress || baseline.emailAddress || "")}</p>
        </div>
        <div class="account-status-meta">
          <span>${escapeHtml(account.employmentStatus || baseline.employmentStatus || "Income not set")}</span>
          <span>${escapeHtml(account.stateCode || baseline.stateCode || "State not set")}</span>
        </div>
      </div>
      <div class="settings-grid">
        <article class="settings-card">
          <div>
            <span>Model strength</span>
            <strong>${escapeHtml(profileCompleteness.label)} · ${profileCompleteness.score}%</strong>
          </div>
          <div class="profile-completeness-meter"><b style="width:${profileCompleteness.score}%"></b></div>
          <p>${profileCompleteness.missing.length ? `Next: ${escapeHtml(profileCompleteness.missing.slice(0, 3).join(", "))}` : "PAM has the core context it needs."}</p>
        </article>
        <article class="settings-card">
          <div>
            <span>Personal info</span>
            <strong>${escapeHtml(account.firstName || baseline.firstName || "Account")}</strong>
          </div>
          <p>${hasValue(account.age || baseline.age) ? `${escapeHtml(account.age || baseline.age)} years old` : "Age not set"} · ${escapeHtml(account.stateCode || baseline.stateCode || "State not set")}</p>
          <p>${hasValue(baseline.creditScore) ? `Approx. credit score: ${escapeHtml(baseline.creditScore)}` : "Credit score not set"}</p>
        </article>
        <article class="settings-card">
          <div>
            <span>Security</span>
            <strong>Password</strong>
          </div>
          <form class="compact-password-form" data-password-form>
            <input type="password" name="currentPassword" placeholder="Current password" autocomplete="current-password" />
            <input type="password" name="newPassword" placeholder="New password" autocomplete="new-password" />
            <input type="password" name="confirmNewPassword" placeholder="Confirm new password" autocomplete="new-password" />
            <button class="button button-secondary" type="submit" ${state.passwordBusy ? "disabled" : ""}>${state.passwordBusy ? "Updating..." : "Change password"}</button>
          </form>
          ${state.passwordMessage ? `<p class="auth-status-message">${escapeHtml(state.passwordMessage)}</p>` : ""}
        </article>
        <article class="settings-card settings-card-wide">
          <div>
            <span>Financial data</span>
            <strong>${isComplete ? "Connected baseline ready" : "Connect your baseline"}</strong>
          </div>
          <p>Last updated: ${escapeHtml(updatedLabel)}. PAM connects read-only through Plaid and never stores your bank login.</p>
          ${state.plaidBusy ? renderPlaidConnecting(isComplete ? "Refreshing your connected data…" : "Connecting securely through Plaid…") : `
            <div class="settings-action-row">
              <button class="button button-primary" type="button" data-connect-sandbox ${!hasAcceptedLegalTerms() ? "disabled" : ""}>${isComplete ? "Sync accounts" : "Connect securely with Plaid"}</button>
              <button class="button button-secondary" type="button" data-load-sandbox ${!hasAcceptedLegalTerms() ? "disabled" : ""}>Use sample baseline</button>
              ${isComplete ? `<button class="button button-secondary" type="button" data-open-view="dashboard">Open dashboard</button>` : ""}
            </div>
          `}
        </article>
        <article class="settings-card">
          <div>
            <span>Display</span>
            <strong>Theme</strong>
          </div>
          <div class="theme-toggle-row" role="group" aria-label="Display theme">
            ${themeOptions.map(([value, label]) => `
              <button class="${state.displayTheme === value ? "active" : ""}" type="button" data-display-theme="${value}">${label}</button>
            `).join("")}
          </div>
        </article>
        ${!state.subscription || state.subscription.status === "inactive" ? `
        <article class="settings-card settings-card-wide upgrade-card">
          <div>
            <span>PAM AI</span>
            <strong>${isFoundingMember() ? "Founding member · $7.99/mo" : "Upgrade · $9.99/mo"}</strong>
          </div>
          <p>Unlock unlimited decisions, Plaid account connections, and AI-powered guidance. Founding pricing locked in forever for early members.</p>
          <div class="settings-action-row">
            <button class="button button-primary" type="button" data-checkout="founding" ${state.checkoutBusy ? "disabled" : ""}>${state.checkoutBusy ? "Loading..." : "Get founding price · $7.99/mo"}</button>
            <button class="button button-secondary" type="button" data-checkout="monthly" ${state.checkoutBusy ? "disabled" : ""}>${state.checkoutBusy ? "Loading..." : "Monthly · $9.99/mo"}</button>
          </div>
        </article>
        ` : `
        <article class="settings-card">
          <div>
            <span>Subscription</span>
            <strong>${isFoundingMember() ? "Founding member · $7.99/mo" : "PAM AI · $9.99/mo"}</strong>
          </div>
          <p>Status: ${escapeHtml(state.subscription.status)}${isFoundingMember() ? " · Founding pricing locked in." : ""}</p>
        </article>
        `}
        <article class="settings-card">
          <div>
            <span>Account actions</span>
            <strong>Manage access</strong>
          </div>
          <div class="settings-action-row small">
            <button class="button button-secondary" type="button" data-export-profile>Export profile</button>
            ${state.savedScenarios.length ? `<button class="button button-secondary" type="button" data-clear-saved-scenarios>Clear saved scenarios</button>` : ""}
            <button class="button button-secondary" type="button" data-reset-baseline>Disconnect financial data</button>
            <button class="button button-secondary" type="button" data-logout>Sign out</button>
          </div>
        </article>
      </div>
      ${getStatus("account") ? `<p class="auth-status-message">${escapeHtml(getStatus("account"))}</p>` : ""}
    </div>
  `;
}

function renderPlaidTrustNote() {
  return `
    <ul class="plaid-trust-list">
      <li><span class="plaid-trust-icon">🔒</span> Bank-grade encryption via Plaid, used by Venmo, SoFi, and Chime</li>
      <li><span class="plaid-trust-icon">👁️</span> Read-only access — PAM can never move or touch your money</li>
      <li><span class="plaid-trust-icon">🔑</span> PAM never sees your bank login. You enter it with Plaid, not us</li>
      <li><span class="plaid-trust-icon">⏏️</span> Disconnect anytime from your profile</li>
    </ul>
  `;
}

function renderPlaidConnecting(message = "Connecting securely through Plaid…") {
  return `
    <div class="plaid-connecting" role="status" aria-live="polite">
      <span class="plaid-spinner" aria-hidden="true"></span>
      <div>
        <strong>${escapeHtml(message)}</strong>
        <span>This can take a few seconds while PAM builds your baseline.</span>
      </div>
    </div>
  `;
}

function renderBaselinePanel() {
  const baseline = getUiBaseline(state.baseline);
  const isComplete = canAccessDashboard();
  const account = state.account || {};
  const isSignedIn = hasPrototypeAccount();
  const draft = ensureAccountDraft();
  const step = getCreateAccountStepConfig();
  const stepValue = String(draft[step.key] || "");
  const isLastStep = state.createAccountStep === CREATE_ACCOUNT_STEPS.length - 1;
  if (!isSignedIn && isClerkConfigured()) {
    return `
      <section class="baseline-panel account-setup-panel compact-workspace-view" id="baseline-section">
        <div class="panel-kicker">Get started</div>
        <h2>Create your account.</h2>
        <div class="onboarding-layout">
          <div class="baseline-form onboarding-form sandbox-connect-panel">
            <div class="auth-shell">
              <div class="auth-card clerk-auth-card">
                <p>Sign in or create an account to start modeling your financial decisions.</p>
                <div class="form-actions">
                  <button class="button button-secondary" type="button" data-clerk-signin>Sign in</button>
                  <button class="button button-primary" type="button" data-clerk-signup>Create account</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  return `
    <section class="baseline-panel account-setup-panel compact-workspace-view" id="baseline-section">
      <div class="panel-kicker">${isSignedIn ? "Account" : "Get started"}</div>
      <h2>${isSignedIn ? "Profile, security, and settings." : "Create your account."}</h2>
      <div class="onboarding-layout">
        <div class="baseline-form onboarding-form sandbox-connect-panel">
          ${isSignedIn ? renderAccountSettingsPanel(baseline, account, isComplete) : `
            <div class="auth-shell">
              <div class="auth-switcher" role="tablist" aria-label="Account access">
                <button class="auth-switch ${state.authView === "create" ? "active" : ""}" type="button" data-auth-mode="create" role="tab" aria-selected="${state.authView === "create" ? "true" : "false"}">Create account</button>
                <button class="auth-switch ${state.authView === "signin" ? "active" : ""}" type="button" data-auth-mode="signin" role="tab" aria-selected="${state.authView === "signin" ? "true" : "false"}">Sign in</button>
              </div>
              ${state.authView === "create" ? `
                <div class="auth-card">
                  <form class="profile-form auth-wizard-form" data-account-form>
                    <div class="wizard-progress">
                      <div class="wizard-progress-bar"><div style="width:${Math.round(((state.createAccountStep + 1) / CREATE_ACCOUNT_STEPS.length) * 100)}%"></div></div>
                      <strong>${escapeHtml(step.label)}</strong>
                      ${step.detail ? `<small>${escapeHtml(step.detail)}</small>` : ""}
                    </div>
                    <label class="wizard-field">
                      ${step.type === "select" ? `
                        <select name="${step.key}">
                          ${step.options.map((option) => `<option value="${option}" ${stepValue === option ? "selected" : ""}>${option}</option>`).join("")}
                        </select>
                      ` : step.type === "textarea" ? `
                        <textarea
                          name="${step.key}"
                          rows="4"
                          placeholder="${escapeHtml(step.placeholder || "")}"
                        >${escapeHtml(stepValue)}</textarea>
                      ` : `
                        <input
                          type="${step.type}"
                          name="${step.key}"
                          value="${escapeHtml(stepValue)}"
                          placeholder="${escapeHtml(step.placeholder || "")}"
                          ${step.autocomplete ? `autocomplete="${step.autocomplete}"` : ""}
                          ${step.key === "verificationCode" ? `inputmode="numeric" pattern="[0-9]*" maxlength="6" data-verification-code-input` : ""}
                        />
                        ${step.withConfirm ? `<input type="password" name="confirmPassword" value="${escapeHtml(draft.confirmPassword || "")}" placeholder="Confirm password" autocomplete="new-password" style="margin-top:0.5rem" />` : ""}
                      `}
                      ${step.suggestions?.length ? `
                        <div class="wizard-suggestion-row">
                          ${step.suggestions.map((suggestion) => `<button type="button" data-draft-suggestion="${escapeHtml(suggestion)}">${escapeHtml(suggestion)}</button>`).join("")}
                        </div>
                      ` : ""}
                    </label>
                    ${step.key === "verificationCode" ? `
                      <div class="verification-panel">
                        <div class="verification-copy">
                          ${state.verificationMaskedEmail ? `<span>Sent to ${escapeHtml(state.verificationMaskedEmail)}</span>` : ""}
                          ${state.verificationPreviewCode ? `<strong>Code: ${escapeHtml(state.verificationPreviewCode)}</strong>` : ""}
                          ${state.verificationWarning ? `<span>${escapeHtml(state.verificationWarning)}</span>` : ""}
                        </div>
                        ${state.verificationCheckMessage ? `<p class="verification-check-message ${escapeHtml(state.verificationCheckStatus)}">${escapeHtml(state.verificationCheckMessage)}</p>` : ""}
                        ${draft.verificationRequestId && !isVerificationConfirmed() ? `<button class="button button-secondary verification-resend-button" type="button" data-send-verification-code>Send new code</button>` : ""}
                      </div>
                    ` : ""}
                    ${getStatus("account") ? `
                      <div class="auth-status-message account-action-message">
                        <span>${escapeHtml(getStatus("account"))}</span>
                        ${state.accountErrorAction === "signin" ? `<button class="inline-action-button" type="button" data-signin-instead>Sign in instead</button>` : ""}
                      </div>
                    ` : ""}
                    <div class="form-actions">
                      ${state.createAccountStep > 0 ? `<button class="button button-secondary" type="button" data-create-back>Back</button>` : `<button class="button button-secondary" type="button" data-open-view="landing">Cancel</button>`}
                      ${isLastStep
                        ? `<button class="button button-primary" type="button" data-create-submit ${!isVerificationConfirmed() ? "disabled" : ""}>Create account</button>`
                        : `<button class="button button-primary" type="button" data-create-next>Continue</button>`}
                    </div>
                  </form>
                </div>
              ` : `
                <div class="auth-card">
                  <form class="profile-form" data-login-form>
                    <div class="credential-row">
                      <label><span>Email</span><input type="email" name="loginEmailAddress" placeholder="you@example.com" autocomplete="email" /></label>
                      <label><span>Password</span><input type="password" name="loginPassword" placeholder="Password" autocomplete="current-password" /></label>
                    </div>
                    ${getStatus("account") ? `<p class="auth-status-message">${escapeHtml(getStatus("account"))}</p>` : ""}
                    <div class="form-actions">
                      <button class="button button-primary" type="submit">Sign in</button>
                    </div>
                  </form>
                </div>
              `}
            </div>
          `}
        </div>
      </div>
    </section>
  `;
}

function renderDecisionPanel() {
  const currentSavings = getCurrentSavings(state.baseline);
  const monthlyBuffer = getMonthlyBuffer(state.baseline);
  const monthlyExpenses = getMonthlyExpenses(state.baseline);
  const goalLabel = getGoalLabel(state.baseline) || "Move out safely";
  const goalTarget = Math.max(toNumber(state.baseline.goals.goalTargetAmount), currentSavings + 1);
  const spendingPlan = Math.max(monthlyExpenses + 120, 1);
  const spendingPercent = Math.min(100, Math.round((monthlyExpenses / spendingPlan) * 100));
  const underPlan = Math.max(spendingPlan - monthlyExpenses, 0);
  // Keep this tight — 3 high-signal suggestions, not a wall of chips.
  const prompts = getSmartSuggestions();

  return `
    <section class="foresee-panel decision-panel mobile-screen mobile-screen-ask" id="decision-input">
      <div class="decision-advisor-intro">
        <div>
          <div class="panel-kicker">Decision simulator</div>
          <h2>Ask a financial question</h2>
          <p>Run one decision at a time. PAM estimates the outcome from your baseline.</p>
        </div>
        <span class="decision-mode-pill">Advisor mode</span>
      </div>
      <div class="decision-mobile-brief" aria-label="Current money context">
        <p>Here’s what changed in your money.</p>
        <div class="daily-update-list">
          <div class="daily-update">
            <span class="daily-icon mint">↗</span>
            <div><strong>Monthly buffer ${monthlyBuffer >= 0 ? "up" : "down"} to ${formatCurrency(monthlyBuffer)}</strong><p>${monthlyBuffer >= 500 ? "You have room to test decisions." : "Keep decisions conservative until buffer improves."}</p></div>
          </div>
          <div class="daily-update">
            <span class="daily-icon blue">⌂</span>
            <div><strong>${escapeHtml(goalLabel)} ${currentSavings >= goalTarget ? "funded" : "in progress"}</strong><p>${formatCurrency(currentSavings)} of ${formatCurrency(goalTarget)}</p></div>
          </div>
          <div class="daily-update">
            <span class="daily-icon amber">▤</span>
            <div><strong>Spending ${formatCurrency(underPlan)} under plan</strong><p>${spendingPercent}% of ${formatCurrency(spendingPlan)} plan used.</p></div>
          </div>
        </div>
      </div>
      <div class="ask-pam-card decision-ask-card">
        <h3>Ask PAM</h3>
        <form class="foresee-question-form ask-pam-mini-form decision-question-form" data-question-form>
          <textarea id="pam-question" name="question" rows="2" aria-label="Ask a financial question" placeholder="Ask anything about a money decision…">${escapeHtml(state.question)}</textarea>
          <button class="button button-primary" type="submit" ${state.decisionBusy ? "disabled" : ""}>${state.decisionBusy ? "Analyzing..." : "Analyze"}</button>
        </form>
        <div class="quick-question-row decision-prompt-stack">
          ${prompts.map((prompt) => `<button type="button" data-question-example="${escapeHtml(prompt)}">${escapeHtml(prompt)}</button>`).join("")}
        </div>
        ${state.inputWarning ? `<p class="input-warning">${escapeHtml(state.inputWarning)}</p>` : ""}
        <details class="decision-builder-toggle">
          <summary>Prefer exact numbers? Use the builder</summary>
          ${renderStructuredDecisionBuilder()}
        </details>
      </div>
      ${state.decisionBusy ? `
        <div class="ai-loading-state" role="status" aria-live="polite">
          <span></span>
          <div>
            <strong>PAM is modeling the decision.</strong>
            <p>Running deterministic math first, then asking the server-side AI to refine the explanation.</p>
          </div>
        </div>
      ` : ""}
      ${getStatus("decision") ? `<p class="foresee-status">${escapeHtml(getStatus("decision"))}</p>` : ""}
    </section>
  `;
}

function renderResult() {
  if (!canAccessDashboard() || !hasAcceptedLegalTerms()) {
    return `
      <section class="foresee-panel result-panel locked-result">
      <div class="result-header">
        <div>
          <div class="panel-kicker">${canAccessDashboard() ? "One last step" : "Almost there"}</div>
          <h2>${canAccessDashboard() ? "Accept PAM's terms to see your results." : "Connect your accounts to start modeling."}</h2>
        </div>
      </div>
      ${canAccessDashboard() ? renderLegalGate() : "<p>PAM models decisions against your real numbers. Connect your accounts and your results will appear here instantly — no manual entry needed.</p>"}
    </section>
  `;
  }
  const result = state.result || toLegacyDecisionFromSession(buildScenarioSession({ prompt: state.question }));
  state.result = result;
  const goalLabel = getGoalLabel(state.baseline);
  const advisorSummary = getAdvisorSummary(result, goalLabel);
  const advisorFollowUps = advisorSummary.followUpChoiceLabels
    .slice(0, 3)
    .map((label) => `<button type="button" data-question-example="${escapeHtml(label)}">${escapeHtml(label)}</button>`)
    .join("");
  return `
    <section class="foresee-panel result-panel mobile-screen mobile-screen-result" id="decision-result">
      <div class="result-header">
        <div>
          <div class="panel-kicker">Result</div>
          <h2>Decision outcome</h2>
        </div>
        <div class="result-header-actions">
          ${renderDataSourceBadge()}
          <button class="button button-secondary" type="button" data-save-scenario>Save scenario</button>
          <span class="risk-badge ${result.risk.className}">${result.risk.label} risk</span>
        </div>
      </div>
      ${state.saveScenarioMessage ? `<p class="save-scenario-message">${escapeHtml(state.saveScenarioMessage)}</p>` : ""}
      <div class="result-section advisor-box advisor-summary-box">
        <div class="advisor-summary-topline">
          <h3>PAM summary</h3>
          <span>${escapeHtml(advisorSummary.source)}</span>
        </div>
        <div class="advisor-chat-bubble">
          <p><strong>${escapeHtml(advisorSummary.headline)}</strong></p>
          <p>${escapeHtml(advisorSummary.body)}</p>
          ${advisorSummary.interpretationSummary ? `<p>${escapeHtml(advisorSummary.interpretationSummary)}</p>` : ""}
        </div>
        <p class="advisor-disclosure">${escapeHtml(state.aiGuidance?.disclosure || "Educational estimate from PAM's financial model — not financial, tax, legal, or investment advice.")}</p>
        ${state.decisionBusy && !state.aiGuidance?.guidance ? `
          <div class="decision-working-card" aria-live="polite" role="status">
            <div class="decision-working-spinner"></div>
            <div class="decision-working-steps">
              <strong>PAM is working on your answer…</strong>
              <span class="working-step step-1">Reading your question and profile</span>
              <span class="working-step step-2">Running the numbers against your baseline</span>
              <span class="working-step step-3">Weighing tradeoffs and writing it straight</span>
            </div>
          </div>
        ` : ""}
        <div class="advisor-next-row">
          <p><strong>Best next move:</strong> ${escapeHtml(advisorSummary.followUpPrompt)}</p>
          ${advisorFollowUps ? `<div class="quick-question-row">${advisorFollowUps}</div>` : ""}
        </div>
      </div>
      <div class="result-section">
        <h3>PAM interpreted your decision as</h3>
        <div class="assumption-grid-foresee">
          <div><span>Decision type</span><strong>${escapeHtml(result.decision.type)}</strong></div>
          <div><span>Monthly impact</span><strong>${formatSignedCurrency(result.decision.monthlyImpact)}</strong></div>
          <div><span>One-time impact</span><strong>${formatSignedCurrency(result.decision.oneTimeImpact)}</strong></div>
          ${(result.decision.taxSavingsMonthly || result.decision.taxSavingsOneTime) ? `<div><span>Estimated tax offset</span><strong>${result.decision.taxSavingsMonthly ? `${formatCurrency(result.decision.taxSavingsMonthly)}/month` : formatCurrency(result.decision.taxSavingsOneTime)}</strong></div>` : ""}
          ${(result.decision.taxSavingsMonthly || result.decision.taxSavingsOneTime) ? `<div><span>Tax-adjusted impact</span><strong>${result.decision.taxSavingsMonthly ? `${formatSignedCurrency(result.taxAdjustedMonthlyImpact)}/month` : formatSignedCurrency(result.taxAdjustedOneTimeImpact)}</strong></div>` : ""}
          ${result.decision.assumptions.map((item) => `<div><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></div>`).join("")}
        </div>
      </div>
      <div class="result-section">
        <h3>Your outcome</h3>
        <div class="outcome-grid">
          <div><span>New monthly buffer</span><strong>${formatCurrency(result.newBuffer)}</strong><small>Before: ${formatCurrency(result.currentBuffer)}</small></div>
          <div><span>Projected savings, 12 months</span><strong>${formatCurrency(result.projectedSavings12)}</strong></div>
          <div><span>Risk</span><strong>${result.risk.label}</strong></div>
          <div><span>Goal timeline</span><strong>${formatMonths(result.newGoalMonths)}</strong></div>
          <div><span>Cash runway</span><strong>${typeof result.runwayMonths === "number" ? formatMonths(result.runwayMonths) : "Stable"}</strong></div>
          <div><span>Most impacted goal</span><strong>${escapeHtml(result.mostImpactedGoal)}</strong></div>
        </div>
      </div>
      ${renderScenarioEngineDetails(result)}
      <div class="result-section next-step-box">
        <h3>Next step</h3>
        <p>${result.risk.label === "Low" ? "This looks workable. PAM can still help test a cleaner version before you commit." : result.risk.label === "Medium" ? "This is possible, but the safer move is to compare a lower-cost version or a better time to do it." : "This needs a safer version before it becomes realistic."}</p>
        <div class="quick-question-row next-step-actions">
          ${getDecisionNextSteps(result).map((prompt) => `<button type="button" data-question-example="${escapeHtml(prompt)}">${escapeHtml(prompt)}</button>`).join("")}
        </div>
      </div>
      <div class="result-section explanation-box">
        <h3>Tax impact</h3>
        <p>${escapeHtml(result.decision.taxImpact)}</p>
        <h3>Long-term goal impact</h3>
        <p>${result.goalDelay ? `This delays ${escapeHtml(goalLabel.toLowerCase())} by about ${formatMonths(result.goalDelay)}.` : `This does not delay ${escapeHtml(goalLabel.toLowerCase())} in this estimate.`}</p>
        <h3>Connected baseline insight</h3>
        <p>${escapeHtml(result.sandboxInsight)}</p>
        <h3>Compound growth impact</h3>
        <p>${result.compoundOpportunity ? `If you redirected ${formatCurrency(result.decision.compoundMonthlyDelta)}/month into a long-term investment earning a hypothetical 10% average annual return, it could grow to about ${formatCurrency(result.compoundOpportunity.futureValue)} by age ${result.compoundOpportunity.retirementAge}. If this were held in a Roth-style account and eligibility rules were met, qualified withdrawals may be tax-free. Educational estimate only, not guaranteed.` : result.compoundGrowth ? `If invested monthly, this could hypothetically grow to about ${formatCurrency(result.compoundGrowth)} over 10 years at a 6% assumed annual return. Not guaranteed.` : "No direct compound-growth impact detected for this decision."}</p>
        <h3>Explanation</h3>
        <p>${escapeHtml(result.explanation)}</p>
        <p class="disclaimer">Educational estimate, AI-assisted. Not financial advice — verify before acting.</p>
      </div>
    </section>
  `;
}

function renderHowItWorksSteps() {
  return `
    <section class="foresee-panel" id="how-it-works">
      <div class="panel-kicker">How it works</div>
      <h2>From account to decision.</h2>
      <div class="steps-grid">
        <div><strong>1</strong><span>Build your baseline</span></div>
        <div><strong>2</strong><span>Ask a financial question</span></div>
        <div><strong>3</strong><span>PAM models the outcome</span></div>
        <div><strong>4</strong><span>See your risk, taxes, buffer, and goal impact</span></div>
        <div><strong>5</strong><span>Compare safer alternatives</span></div>
      </div>
    </section>
  `;
}

function renderWaitlistModal() {
  if (!state.waitlistOpen) return "";
  return `
    <div class="modal-backdrop" data-close-waitlist>
      <div class="waitlist-modal" role="dialog" aria-modal="true" aria-label="Join PAM waitlist">
        <div class="panel-kicker">PAM waitlist</div>
        <h2>${state.waitlistJoined ? "You're on the list." : "Join the early access list."}</h2>
        <p>${state.waitlistJoined ? escapeHtml(state.waitlistMessage || WAITLIST_FOUNDING_NOTE) : "Get launch access, product updates, and founding pricing."}</p>
        ${state.waitlistJoined ? "" : `<p class="waitlist-founder-note">${escapeHtml(WAITLIST_FOUNDING_NOTE)}</p>`}
        ${!state.waitlistJoined && state.waitlistMessage ? `<p class="auth-status-message waitlist-modal-status">${escapeHtml(state.waitlistMessage)}</p>` : ""}
        ${state.waitlistJoined ? "" : `
          <form class="profile-form" data-waitlist-form>
            ${renderWaitlistFields()}
            <button class="button button-primary" type="submit" ${state.waitlistBusy ? "disabled" : ""}>${state.waitlistBusy ? "Joining..." : "Join waitlist"}</button>
          </form>
        `}
        <button class="button button-secondary" type="button" data-close-waitlist-button>Close</button>
      </div>
    </div>
  `;
}

function renderWaitlistFields() {
  const draft = state.waitlistDraft || {};
  return `
    <label><span>Your email</span><input type="email" name="waitlistEmail" placeholder="you@example.com" value="${escapeHtml(draft.emailAddress || "")}" required /></label>
    <label><span>Full name <small>optional</small></span><input type="text" name="waitlistFullName" placeholder="Maya Chen" maxlength="120" value="${escapeHtml(draft.fullName || "")}" /></label>
    <div class="waitlist-optional-grid">
      <label><span>Age <small>optional</small></span><input type="number" name="waitlistAge" placeholder="24" min="13" max="120" value="${escapeHtml(draft.age || "")}" /></label>
      <label>
        <span>Stage <small>optional</small></span>
        <select name="waitlistStage">
          <option value="" ${!draft.stage ? "selected" : ""}>Choose one</option>
          <option value="Student" ${draft.stage === "Student" ? "selected" : ""}>Student</option>
          <option value="Working full-time" ${draft.stage === "Working full-time" ? "selected" : ""}>Working full-time</option>
          <option value="Freelance / self-employed" ${draft.stage === "Freelance / self-employed" ? "selected" : ""}>Freelance / self-employed</option>
          <option value="Planning to move out" ${draft.stage === "Planning to move out" ? "selected" : ""}>Planning to move out</option>
          <option value="Other" ${draft.stage === "Other" ? "selected" : ""}>Other</option>
        </select>
      </label>
    </div>
    <label><span>What do you want PAM to help with? <small>optional</small></span><input type="text" name="waitlistGoal" placeholder="Moving out, buying a car, taxes, investing..." maxlength="220" value="${escapeHtml(draft.goal || "")}" /></label>
  `;
}

function renderWaitlistPage() {
  return `
    <div class="waitlist-page-shell">
      ${renderDisclaimerBanner()}
      <header class="waitlist-page-header">
        <button class="page-back-button" type="button" data-go-back aria-label="Go back">← Back</button>
        <a class="foresee-brand" href="/waitlist" aria-label="PAM AI waitlist">
          <span>PAM</span>
          <div>
            <strong>PAM AI</strong>
            <small>Personal Asset Manager</small>
          </div>
        </a>
        <p>Early access</p>
      </header>
      <main class="waitlist-page-card" aria-labelledby="waitlist-title">
        <section class="waitlist-page-copy">
          <div class="panel-kicker">PAM waitlist</div>
          <h1 id="waitlist-title">${state.waitlistJoined ? "You're on the list." : "Know what happens before you decide."}</h1>
          <p>
            PAM AI helps young adults test financial decisions before making them. Join the founding list for launch access and founding pricing.
          </p>
          <div class="waitlist-proof-grid">
            <div><span>Decision engine</span><strong>Rent, cars, trips, job changes</strong></div>
            <div><span>Future impact</span><strong>Buffer, taxes, savings, goals</strong></div>
            <div><span>Built for</span><strong>Young adults before wealth management</strong></div>
          </div>
        </section>
        <section class="waitlist-page-form-panel" aria-label="Join the PAM waitlist">
          <h2>${state.waitlistJoined ? "Check your inbox." : "Join the early access list."}</h2>
          <p>${state.waitlistJoined ? escapeHtml(state.waitlistMessage || WAITLIST_FOUNDING_NOTE) : "First 100 founding members lock in $7.99/mo for life. After launch it's $9.99. Free to join."}</p>
          ${state.waitlistMessage && !state.waitlistJoined ? `<p class="auth-status-message waitlist-modal-status">${escapeHtml(state.waitlistMessage)}</p>` : ""}
          ${state.waitlistJoined ? "" : `
            <form class="profile-form waitlist-page-form" data-waitlist-form>
              ${renderWaitlistFields()}
              <button class="button button-primary" type="submit" ${state.waitlistBusy ? "disabled" : ""}>${state.waitlistBusy ? "Joining..." : "Join waitlist"}</button>
            </form>
          `}
        </section>
      </main>
      <p class="waitlist-page-footer">PAM AI is in private build. Waitlist signup does not open the work-in-progress app.</p>
      ${renderLegalFooter()}
      ${renderCookieConsentBanner()}
    </div>
  `;
}

function renderDisclaimerBanner() {
  return `
    <div class="legal-disclaimer-banner" role="note">
      <span><strong>PAM</strong> is a modeling tool, not financial advice.</span>
    </div>
  `;
}

function renderLegalFooter() {
  return `
    <footer class="pam-legal-footer">
      <p>${escapeHtml(LEGAL_DISCLAIMER)}</p>
      <nav aria-label="Legal links">
        <a href="/terms">Terms</a>
        <a href="/privacy">Privacy</a>
        <a href="/content-policy">Content Policy</a>
        <a href="/faq">FAQ</a>
        <a href="/waitlist">Waitlist</a>
      </nav>
    </footer>
  `;
}

function renderCookieConsentBanner() {
  if (state.cookieConsent) return "";
  return `
    <div class="cookie-consent-banner" role="dialog" aria-label="Cookie consent">
      <div>
        <strong>Cookies</strong>
        <p>PAM uses essential cookies/storage to run the app. Analytics are optional and only help us improve the product.</p>
      </div>
      <div class="cookie-actions">
        <button class="button button-secondary" type="button" data-cookie-consent="declined">Essential only</button>
        <button class="button button-primary" type="button" data-cookie-consent="accepted">Allow analytics</button>
      </div>
    </div>
  `;
}

function renderLegalGate() {
  return `
    <section class="foresee-panel legal-gate-panel">
      <div class="panel-kicker">Before financial modeling</div>
      <h2>Quick legal check.</h2>
      <p>PAM can model decisions, but it cannot make decisions for you. Please confirm these two points before using financial features.</p>
      <form class="legal-acceptance-form" data-legal-acceptance-form>
        <label>
          <input type="checkbox" name="acceptedAdvisorDisclaimer" required />
          <span>I understand PAM AI is a financial modeling tool, not a licensed advisor, and nothing is financial, tax, legal, or investment advice.</span>
        </label>
        <label>
          <input type="checkbox" name="acceptedTermsPrivacy" required />
          <span>I have read and agree to the <a href="/terms">Terms of Service</a> and <a href="/privacy">Privacy Policy</a>.</span>
        </label>
        <button class="button button-primary" type="submit">Accept and continue</button>
      </form>
      ${state.legalAcceptanceError ? `<p class="auth-status-message">${escapeHtml(state.legalAcceptanceError)}</p>` : ""}
      <p class="disclaimer">Acceptance is timestamped and logged for your account.</p>
    </section>
  `;
}

function renderLegalPage(route) {
  const pages = {
    terms: {
      title: "Terms of Service",
      eyebrow: "Legal · Last updated May 18, 2026",
      intro: "Plain-English terms for using PAM AI. These terms protect both you and PAM while the product remains a financial modeling tool, not a licensed advisor.",
      sections: [
        ["Who these terms apply to", "By using PAM AI you agree to these terms. You must be at least 18 years old to create an account. Do not create an account on behalf of someone else without their permission."],
        ["PAM is not a licensed advisor", "PAM AI is a software-based financial modeling tool. PAM AI is not a registered investment adviser, broker-dealer, bank, accountant, attorney, tax preparer, or fiduciary. Nothing in the product constitutes financial, investment, tax, legal, credit, insurance, or accounting advice."],
        ["No guarantees", "PAM may show projections, scenarios, risk levels, goal delays, tax estimates, and compound-growth examples. These outputs are hypothetical, assumption-based, and not guaranteed. Real outcomes can differ materially."],
        ["Your responsibility", "You are responsible for your own financial decisions. Before acting on any PAM output, consult qualified professionals such as a licensed financial advisor, CPA, attorney, or tax professional."],
        ["Data use", "We use your data solely to provide and improve the PAM service. We do not sell user data to third parties."],
        ["Bank credentials", "We do not store raw bank login credentials. Bank connections are handled through Plaid, a regulated third-party provider, and governed by Plaid's own terms and privacy policy."],
        ["AI outputs and copyrighted inputs", "Do not input copyrighted material, confidential third-party documents, or content you do not have rights to use. PAM is not liable for outputs generated from copyrighted or unauthorized inputs."],
        ["Plans, trials, billing, and refunds", "PAM may offer a free tier, free trial, or paid subscription in the future. A paid subscription is not active until Stripe or another payment provider is connected and you complete checkout. If paid billing is enabled, renewal, cancellation, failed-payment handling, receipts, and refund eligibility will be shown at checkout and in these terms before purchase."],
        ["Cancellation and data after cancellation", "Cancelling stops future subscription renewals but does not automatically delete your account data. You may request deletion by emailing hello@pamadvisor.com, subject to legal, security, fraud-prevention, and backup-retention requirements."],
        ["Account termination", "We may suspend or terminate accounts that abuse the service, attempt unauthorized access, violate these terms, or create legal or security risk. You may stop using PAM at any time."],
        ["Limitation of liability", "To the fullest extent permitted by law, PAM AI and its operators are not liable for lost profits, investment losses, tax consequences, missed opportunities, data loss, or indirect, incidental, consequential, special, or punitive damages arising from use of the service."],
        ["Governing law", "These terms are governed by the laws of the State of California, without regard to conflict-of-law rules. Disputes will be resolved in the courts of California."],
        ["Contact", "Questions about these terms? Email hello@pamadvisor.com."]
      ]
    },
    privacy: {
      title: "Privacy Policy",
      eyebrow: "Privacy · Last updated May 18, 2026",
      intro: "PAM is designed around trust: collect only what is needed, explain how it is used, and avoid turning financial data into ad targeting.",
      sections: [
        ["Data we collect", "PAM may collect your email, account profile, age, state, employment type, financial baseline, account balances, transactions, liabilities, goals, decision prompts, scenario outputs, cookie choices, usage data, and support or security logs."],
        ["Plaid and financial data", "When you connect financial accounts, Plaid handles bank authentication. PAM never sees or stores your bank login credentials. PAM may receive summarized balances, transactions, recurring income and expenses, liabilities, and account metadata to build your baseline. Plaid's use of your data is governed by Plaid's Privacy Policy."],
        ["What we do not do", "We do not sell your data. We do not share financial data with advertisers. We do not use financial data for advertising profiling. We do not use your financial data to train AI models."],
        ["Third-party services", "PAM uses: Plaid for bank data connections, Anthropic (Claude) for AI-powered decision explanations, Clerk for authentication, Stripe for billing, Resend for transactional email, Supabase for data storage, Vercel for hosting, and PostHog for anonymous product analytics. If you decline analytics cookies, PostHog tracking is disabled. Each provider is subject to its own privacy policy."],
        ["Security", "Financial data is protected in transit with HTTPS and TLS. Access tokens and API secrets are stored server-side only and are never exposed to the browser. Plaid access tokens are encrypted before storage."],
        ["Cookies", "Essential cookies and local storage keep the app functioning and remember your session, legal acceptance, and preferences. Analytics are optional. If you decline analytics, PAM disables all non-essential tracking in the client."],
        ["Retention", "We retain account and financial baseline data while your account is active or as needed for security, legal, backup, and operational purposes. Waitlist emails are retained until you unsubscribe or request deletion."],
        ["Your rights", "You may request access, correction, deletion, or a copy of your data by emailing hello@pamadvisor.com. California residents have additional rights under CCPA, including the right to know what data we collect, the right to delete it, and the right to opt out of sale (we do not sell data). Some deletion requests may be limited by security, fraud prevention, or legal retention requirements."],
        ["Contact", "Privacy questions or data requests: hello@pamadvisor.com."]
      ]
    },
    "content-policy": {
      title: "Content Policy",
      eyebrow: "Acceptable use · Last updated May 18, 2026",
      intro: "PAM is for personal financial decision modeling. Keep inputs lawful, concise, and yours to use.",
      sections: [
        ["Acceptable use", "Use PAM to ask financial decision questions, compare scenarios, understand tradeoffs, and learn how assumptions may affect your future."],
        ["Do not paste copyrighted material", "Do not paste books, articles, paid reports, proprietary documents, private legal or tax files, or any other copyrighted or confidential material unless you own the rights or have explicit permission."],
        ["No illegal or harmful use", "Do not use PAM to evade taxes, hide income, commit fraud, deceive lenders, bypass bank rules, or harm another person. PAM will not help you hide or misrepresent financial information."],
        ["AI output limitations", "PAM AI outputs are generated by AI and may not be accurate. Always verify important financial information with authoritative sources or qualified professionals before acting on it."],
        ["Input filtering", "PAM may warn or block unusually large pasted text to reduce copyright and privacy risk. Summarize the financial decision in your own words instead of pasting third-party content."],
        ["Enforcement", "Violations may result in account suspension or termination. Report misuse to hello@pamadvisor.com."]
      ]
    },
    faq: {
      title: "FAQ",
      eyebrow: "Help",
      intro: "Fast answers for people trying PAM for the first time.",
      sections: [
        ["What is PAM AI?", "PAM AI is a financial decision modeling tool for young adults. It helps you test choices like rent, cars, trips, saving, investing, job changes, and taxes before you commit — so you know what happens before you decide."],
        ["Is PAM a financial advisor?", "No. PAM is not a licensed financial advisor, RIA, tax professional, attorney, bank, or broker. It provides educational modeling only. Always consult a qualified professional before making major financial decisions."],
        ["Does PAM connect to my bank?", "Yes. PAM uses Plaid Sandbox to securely connect financial accounts. PAM never sees your bank login credentials — Plaid handles authentication. Connected account data is used only to build your financial baseline inside PAM."],
        ["Is my financial data safe?", "Yes. PAM uses HTTPS for all data in transit, stores Plaid access tokens encrypted server-side, and never exposes API secrets to the browser. We do not sell or share your financial data."],
        ["Are payments live?", "No. Stripe subscriptions are not live yet. Founding pricing is communicated on the waitlist, but no charges are made until a payment flow is set up and you confirm checkout."],
        ["Are the results guaranteed?", "No. PAM's results are hypothetical estimates based on the data and assumptions available. Real-life outcomes can differ materially. Treat PAM as a planning aid, not a source of truth."],
        ["What should I do if a result looks wrong?", "Update your baseline with more accurate numbers, then run the decision again. For important financial decisions, verify numbers with a qualified professional."],
        ["How do I delete my account or data?", "Email hello@pamadvisor.com with your request. We will process it within a reasonable time subject to legal retention requirements."],
        ["Can I give feedback?", "Yes. Signed-in users can send feedback from the dashboard profile screen. You can also email hello@pamadvisor.com."]
      ]
    }
  };
  const page = pages[route] || pages.terms;

  return `
    <div class="legal-page-shell">
      ${renderDisclaimerBanner()}
      <header class="waitlist-page-header legal-page-header">
        <button class="page-back-button" type="button" data-go-back aria-label="Go back">← Back</button>
        <a class="foresee-brand" href="/" aria-label="PAM AI home">
          <span>PAM</span>
          <div>
            <strong>PAM AI</strong>
            <small>Personal Asset Manager</small>
          </div>
        </a>
        <nav>
          <a href="/terms">Terms</a>
          <a href="/privacy">Privacy</a>
          <a href="/content-policy">Content Policy</a>
          <a href="/faq">FAQ</a>
        </nav>
      </header>
      <main class="legal-page-card">
        <div class="panel-kicker">${escapeHtml(page.eyebrow)}</div>
        <h1>${escapeHtml(page.title)}</h1>
        <p class="legal-page-intro">${escapeHtml(page.intro)}</p>
        <div class="legal-section-list">
          ${page.sections.map(([title, copy]) => `
            <section>
              <h2>${escapeHtml(title)}</h2>
              <p>${copy.includes("https://policies.google.com/privacy")
                ? `${escapeHtml(copy.replace("https://policies.google.com/privacy.", ""))}<a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer">Google Privacy Policy</a>.`
                : escapeHtml(copy)}
              </p>
            </section>
          `).join("")}
        </div>
      </main>
      ${renderLegalFooter()}
      ${renderCookieConsentBanner()}
    </div>
  `;
}

// Real PAM answers, shown on the landing so visitors see the goods before
// they're asked for anything. Static illustrative content (clearly labeled).
const MARKETING_EXAMPLES = {
  moveout: {
    q: "Can I afford to move out? Rent would be $1,800.",
    verdict: "Yes — but cap it at $1,650.",
    body: "At $1,800 your monthly buffer drops to $240 — too thin if anything breaks. Trim to $1,650 and you keep a real cushion and still hit your savings goal on time.",
    stats: [
      { label: "Buffer at $1,800", value: "$240" },
      { label: "Safer rent", value: "$1,650" },
      { label: "Risk", value: "Medium" }
    ]
  },
  nyc: {
    q: "I got a NYC finance offer at the same salary, but I'd have to move. Worth it?",
    verdict: "On your numbers — it's worth the move.",
    body: "Same salary isn't a lateral move in finance. NYC nets ~$22k/yr more after cost of living and pulls your retire-at-55 goal forward 6 years. Year-one buffer dips to $760 — here's the offset plan.",
    stats: [
      { label: "Retire age", value: "61 → 55" },
      { label: "After cost of living", value: "+$22k/yr" },
      { label: "Risk", value: "Medium" }
    ]
  }
};

function renderMarketingSampleCard(ex) {
  return `
    <div class="marketing-sample-card" aria-label="Example PAM answer">
      <div class="marketing-sample-head">
        <span class="marketing-sample-dots"><i></i><i></i><i></i></span>
        <strong>Ask PAM</strong>
        <span class="data-source-badge">EXAMPLE</span>
      </div>
      <div class="marketing-sample-q">"${escapeHtml(ex.q)}"</div>
      <div class="marketing-sample-a">
        <div class="marketing-sample-verdict">${escapeHtml(ex.verdict)}</div>
        <p>${escapeHtml(ex.body)}</p>
        <div class="marketing-sample-stats">
          ${ex.stats.map((s) => `<div><span>${escapeHtml(s.label)}</span><strong>${escapeHtml(s.value)}</strong></div>`).join("")}
        </div>
      </div>
    </div>
  `;
}

function renderPublicLaunchGate(mode = "public") {
  // "public" = stranger with no access -> Get started joins the waitlist.
  // "app" = visitor who can reach the app (e.g. demo access) -> Get started /
  // Sign in lead to the create-account / sign-in page for onboarding.
  const isApp = mode === "app";
  const primaryAttr = isApp ? `data-open-view="account"` : `data-open-waitlist`;
  const primaryLabel = isApp ? "Create account" : (state.waitlistJoined ? "You're on the list" : "Get started");
  const heroPrimaryLabel = isApp ? "Create your account →" : (state.waitlistJoined ? "You're on the list ✓" : "Get started →");
  const signinAttr = isApp ? `data-open-view="account"` : `data-reveal-beta`;
  const features = [
    { icon: "📊", title: "Test decisions before you make them", body: "See the real impact on your monthly buffer, taxes, savings, and goals — before you commit, not after." },
    { icon: "🎯", title: "It knows your whole game", body: "Your retirement target, your career path, what you'd move for, your safety net. Advice judged against your life, not just this month's balance." },
    { icon: "⚡", title: "Bold, grounded calls", body: "Do it, don't, or not-yet — anchored to your actual numbers. No mushy \"it depends\" non-answers." },
    { icon: "🧠", title: "Remembers your arc", body: "Every answer builds on your last. PAM doesn't forget you the moment you close the tab." }
  ];
  return `
    <div class="foresee-shell marketing-shell">
      ${renderDisclaimerBanner()}
      <header class="marketing-nav">
        <a class="foresee-brand" href="/" aria-label="PAM AI home">
          <span>PAM</span>
          <div><strong>PAM AI</strong><small>Personal Asset Manager</small></div>
        </a>
        <div class="marketing-nav-actions">
          <button class="marketing-signin-link" type="button" ${signinAttr}>Sign in</button>
          <button class="button button-primary" type="button" ${primaryAttr}>${primaryLabel}</button>
        </div>
      </header>

      <section class="marketing-hero">
        <div class="marketing-hero-copy reveal-on-scroll reveal-up">
          <div class="marketing-eyebrow">Your personal financial adviser</div>
          <h1>Know what happens <em>before</em> you decide.</h1>
          <p class="marketing-sub">It's like having a sharp financial adviser who's actually seen your bank account and your goals — before you can afford a real one. Ask PAM any money move and get a straight, numbers-backed call. Not generic advice. Yours.</p>
          <div class="marketing-hero-actions">
            <button class="button button-primary marketing-btn-lg" type="button" ${primaryAttr}>${heroPrimaryLabel}</button>
            <button class="button button-secondary" type="button" data-scroll-target="#marketing-example">See it in action</button>
          </div>
          <p class="marketing-hero-note">Free to join · Built for young adults before traditional advisors make sense</p>
        </div>
        <div class="marketing-hero-visual reveal-on-scroll reveal-fade">
          <div class="marketing-parallax" data-parallax="0.06">
            ${renderMarketingSampleCard(MARKETING_EXAMPLES.nyc)}
          </div>
        </div>
      </section>

      <section class="marketing-section marketing-features">
        <div class="marketing-section-head reveal-on-scroll">
          <div class="panel-kicker">What PAM does</div>
          <h2>A sharp friend who's seen your bank account <em>and</em> your ambitions.</h2>
        </div>
        <div class="marketing-feature-grid">
          ${features.map((f, i) => `
            <article class="marketing-feature-card reveal-on-scroll ${i % 2 === 0 ? "reveal-left" : "reveal-right"}">
              <div class="marketing-feature-icon" aria-hidden="true">${f.icon}</div>
              <h3>${escapeHtml(f.title)}</h3>
              <p>${escapeHtml(f.body)}</p>
            </article>
          `).join("")}
        </div>
      </section>

      <section class="marketing-section marketing-example" id="marketing-example">
        <div class="marketing-section-head reveal-on-scroll reveal-up">
          <div class="panel-kicker">Grounded, not generic</div>
          <h2>Ask a real question. Get a real call.</h2>
          <p class="marketing-section-sub">From "can I afford this?" to the life-shaping forks — a generic chatbot hedges because it doesn't know you. PAM knows your money and your goals, so it has an opinion.</p>
        </div>
        <div class="marketing-example-grid">
          <div class="reveal-on-scroll reveal-scale">${renderMarketingSampleCard(MARKETING_EXAMPLES.moveout)}</div>
          <div class="reveal-on-scroll reveal-scale">${renderMarketingSampleCard(MARKETING_EXAMPLES.nyc)}</div>
        </div>
      </section>

      <section class="marketing-section marketing-advisor">
        <div class="marketing-section-head reveal-on-scroll reveal-up">
          <div class="panel-kicker">Why it's different</div>
          <h2>The advisor you can't afford yet — <em>until now</em>.</h2>
          <p class="marketing-section-sub">A real financial advisor charges ~1% of everything you own and won't take your call until you're already rich. PAM gives you that same judgment — built on your actual numbers — from day one.</p>
        </div>
        <div class="marketing-advisor-grid">
          <div class="marketing-advisor-point reveal-on-scroll reveal-left">
            <div class="marketing-advisor-icon" aria-hidden="true">👀</div>
            <h3>Sees your whole picture</h3>
            <p>Income, spending, debt, what's locked in retirement, your goals — a real advisor's view, not a budgeting app's.</p>
          </div>
          <div class="marketing-advisor-point reveal-on-scroll reveal-right">
            <div class="marketing-advisor-icon" aria-hidden="true">🕐</div>
            <h3>There the moment you're deciding</h3>
            <p>2am, mid-offer, standing in the dealership — ask and get a real call instantly. No appointment, no minimum.</p>
          </div>
          <div class="marketing-advisor-point reveal-on-scroll reveal-left">
            <div class="marketing-advisor-icon" aria-hidden="true">🎯</div>
            <h3>Brutally honest, never on commission</h3>
            <p>No products to sell you, no kickbacks. Just the straight call — including "don't" and "not yet."</p>
          </div>
          <div class="marketing-advisor-point reveal-on-scroll reveal-right">
            <div class="marketing-advisor-icon" aria-hidden="true">🧠</div>
            <h3>Remembers every conversation</h3>
            <p>It builds on your last decision the way a human advisor who's known you for years would.</p>
          </div>
        </div>
      </section>

      <section class="marketing-section marketing-asks reveal-on-scroll reveal-up">
        <div class="marketing-section-head">
          <div class="panel-kicker">People ask PAM…</div>
          <h2>Big calls and everyday ones.</h2>
        </div>
        <div class="marketing-ask-chips">
          ${[
            "Can I afford to move out this year?",
            "Should I take the higher-paying job in a new city?",
            "Pay off my loans or start investing?",
            "Is grad school actually worth it?",
            "Can I afford this $400/mo car?",
            "Am I saving enough to retire at 50?",
            "Should I buy a place or keep renting?",
            "Can I take this trip without wrecking my goal?"
          ].map((q) => `<button type="button" class="marketing-ask-chip" ${primaryAttr}>"${escapeHtml(q)}"</button>`).join("")}
        </div>
      </section>

      <section class="marketing-section marketing-testimonials reveal-on-scroll">
        <div class="panel-kicker">Coming soon</div>
        <h2>Built for people making their first big money calls.</h2>
        <p class="marketing-soon">Real stories land here as the beta opens. Want to be one of them?</p>
        <button class="button button-primary marketing-btn-lg" type="button" ${primaryAttr}>${heroPrimaryLabel}</button>
      </section>

      ${isApp ? "" : `
      <section class="marketing-section marketing-beta-section">
        <details class="marketing-beta" id="beta-access" ${state.demoAccessMessage ? "open" : ""}>
          <summary>Returning member or have a beta code?</summary>
          <form class="launch-gate-form" data-demo-access-form>
            <label for="demoAccessCode">Beta access</label>
            <div>
              <input id="demoAccessCode" name="demoAccessCode" type="password" autocomplete="off" placeholder="Enter your code" ${state.demoAccessBusy ? "disabled" : ""} />
              <button class="button button-secondary" type="submit" ${state.demoAccessBusy ? "disabled" : ""}>${state.demoAccessBusy ? "Checking..." : "Enter"}</button>
            </div>
          </form>
          ${state.demoAccessMessage ? `<p class="auth-status-message launch-gate-message">${escapeHtml(state.demoAccessMessage)}</p>` : ""}
        </details>
      </section>
      `}

      ${renderLegalFooter()}
      ${renderCookieConsentBanner()}
      ${renderWaitlistModal()}
    </div>
  `;
}

function render() {
  if (!app) return;
  applyDisplayTheme();
  // Values onboarding is mandatory context: a stale "dashboard" view from a
  // previous session must not bypass it.
  if (state.workspaceView === "dashboard" && canAccessDashboard() && hasAcceptedLegalTerms() && !state.userValues?.completed) {
    state.workspaceView = "values";
  }
  const legalRoute = getLegalRoute();
  if (legalRoute) {
    app.innerHTML = renderLegalPage(legalRoute);
    wireInteractions();
    return;
  }
  if (isWaitlistRoute()) {
    app.innerHTML = renderWaitlistPage();
    wireInteractions();
    return;
  }
  if (shouldShowPublicLaunchGate()) {
    app.innerHTML = renderPublicLaunchGate("public");
    wireInteractions();
    return;
  }
  // Signed-out visitors (who already have access, e.g. demo) get the marketing
  // landing — never the old in-app homepage. The explicit account view drops
  // them into the clean standalone sign-in / create-account page.
  if (!hasPrototypeAccount()) {
    app.innerHTML = state.workspaceView === "account" ? renderAuthPage() : renderPublicLaunchGate("app");
    wireInteractions();
    return;
  }
  app.innerHTML = `
    <div class="foresee-shell app-mode-${escapeHtml(state.workspaceView)} ${hasPrototypeAccount() ? "has-account" : "is-public"} ${canUseFinancialFeatures() ? "has-dashboard-access" : "needs-setup"}">
      ${renderDisclaimerBanner()}
      <header class="foresee-header">
        <a class="foresee-brand" href="/">
          <span>PAM</span>
          <div>
            <strong>PAM AI</strong>
            <small>Personal Asset Manager</small>
          </div>
        </a>
        <nav class="foresee-nav" aria-label="Homepage sections">
          <button type="button" data-scroll-target="#how-it-works">How it works</button>
          <button type="button" data-scroll-target="#examples">Examples</button>
          <button type="button" data-scroll-target="#pricing">Pricing</button>
        </nav>
        <div class="foresee-header-actions">
          ${renderHeaderActions()}
        </div>
      </header>
      <main class="pam-homepage">
        ${state.workspaceView === "landing"
          ? `${renderHero()}${renderLandingWorkspace()}`
          : state.workspaceView === "values"
            ? renderValuesOnboarding()
            : state.workspaceView === "account"
              ? renderAccountPage()
              : renderWorkspaceHub()}
      </main>
      ${renderLegalFooter()}
      ${renderCookieConsentBanner()}
      ${renderWaitlistModal()}
    </div>
  `;
  wireInteractions();
}

function wireInteractions() {
  document.querySelectorAll("[data-demo-access-form]").forEach((form) => form.addEventListener("submit", handleDemoAccessSubmit));
  document.querySelectorAll("[data-account-form]").forEach((form) => form.addEventListener("submit", handleCreateAccount));
  document.querySelectorAll("[data-login-form]").forEach((form) => form.addEventListener("submit", handleLogin));
  document.querySelectorAll("[data-question-form]").forEach((form) => {
    form.addEventListener("submit", handleQuestionSubmit);
  });
  document.querySelectorAll("[data-structured-decision-form]").forEach((form) => {
    form.addEventListener("submit", handleStructuredDecisionSubmit);
  });
  document.querySelectorAll("[data-goal-form]").forEach((form) => {
    form.addEventListener("submit", handleGoalFormSubmit);
  });
  document.querySelectorAll("[data-decision-mode]").forEach((button) => {
    button.addEventListener("click", handleDecisionModeClick);
  });
  document.querySelectorAll("[data-structured-preset]").forEach((button) => {
    button.addEventListener("click", handleStructuredPresetClick);
  });
  document.querySelectorAll("[data-legal-acceptance-form]").forEach((form) => form.addEventListener("submit", handleLegalAcceptance));
  document.querySelectorAll("[data-feedback-form]").forEach((form) => form.addEventListener("submit", handleFeedbackSubmit));
  document.querySelectorAll("[data-password-form]").forEach((form) => form.addEventListener("submit", handlePasswordChange));
  document.querySelectorAll("[data-dismiss-walkthrough]").forEach((button) => button.addEventListener("click", handleDismissWalkthrough));
  document.querySelectorAll("[data-cookie-consent]").forEach((button) => {
    button.addEventListener("click", () => {
      saveCookieConsent(button.dataset.cookieConsent || "declined");
      if (state.cookieConsent === "accepted") {
        trackEvent("cookie_consent_accepted", {}, "security");
      }
      render();
    });
  });
  document.querySelectorAll("[data-legal-route]").forEach((button) => {
    button.addEventListener("click", () => {
      window.location.href = button.dataset.legalRoute || "/terms";
    });
  });
  document.querySelectorAll("[data-reveal-beta]").forEach((button) => {
    button.addEventListener("click", () => {
      const details = document.getElementById("beta-access");
      if (details) {
        details.open = true;
        details.scrollIntoView({ behavior: "smooth", block: "center" });
        details.querySelector("input")?.focus();
      }
    });
  });
  // Scroll-reveal: fade/slide elements in as they enter the viewport. Respects
  // reduced-motion and degrades to instantly-visible without IntersectionObserver.
  (() => {
    const revealEls = document.querySelectorAll(".reveal-on-scroll");
    if (!revealEls.length) return;
    const noMotion = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (noMotion || typeof IntersectionObserver === "undefined") {
      revealEls.forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    revealEls.forEach((el) => io.observe(el));

    // Lightweight parallax: drift [data-parallax] elements as you scroll. rAF
    // throttled, transform-only. Skipped entirely under reduced-motion.
    const parallaxEls = document.querySelectorAll("[data-parallax]");
    if (parallaxEls.length) {
      let ticking = false;
      const apply = () => {
        const vh = window.innerHeight || 1;
        parallaxEls.forEach((el) => {
          const factor = parseFloat(el.getAttribute("data-parallax")) || 0.06;
          const rect = el.getBoundingClientRect();
          const fromCenter = (rect.top + rect.height / 2) - vh / 2;
          el.style.setProperty("--parallax", `${(-fromCenter * factor).toFixed(1)}px`);
        });
        ticking = false;
      };
      const onScroll = () => { if (!ticking) { ticking = true; window.requestAnimationFrame(apply); } };
      window.addEventListener("scroll", onScroll, { passive: true });
      apply();
    }
  })();
  document.querySelectorAll("[data-go-back]").forEach((button) => {
    button.addEventListener("click", () => {
      // Return to wherever the user came from when that was inside PAM;
      // otherwise (deep link, new tab) fall back to the homepage.
      const ref = document.referrer || "";
      const sameOriginReferrer = ref && ref.startsWith(window.location.origin) && ref !== window.location.href;
      if (window.history.length > 1 && sameOriginReferrer) {
        window.history.back();
      } else {
        window.location.href = "/";
      }
    });
  });
  document.querySelectorAll("[data-waitlist-form]").forEach((form) => form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const emailAddress = String(formData.get("waitlistEmail") || "").trim();
    const fullName = String(formData.get("waitlistFullName") || "").trim();
    const ageRaw = String(formData.get("waitlistAge") || "").trim();
    const stage = String(formData.get("waitlistStage") || "").trim();
    const goal = String(formData.get("waitlistGoal") || "").trim();
    state.waitlistDraft = {
      emailAddress,
      fullName,
      age: ageRaw,
      stage,
      goal
    };
    if (!emailAddress) {
      state.waitlistMessage = "Add your email first.";
      render();
      return;
    }
    state.waitlistBusy = true;
    state.waitlistMessage = "Joining waitlist...";
    render();

    const { payload, error } = await requestJson("/api/waitlist", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        emailAddress,
        fullName,
        age: ageRaw ? Number(ageRaw) : null,
        stage,
        goal
      })
    });

    if (error || !payload?.ok) {
      state.waitlistJoined = false;
      state.waitlistBusy = false;
      state.waitlistMessage = payload?.error || error || "Could not join the waitlist.";
      render();
      return;
    }

    saveWaitlistJoined();
    state.waitlistBusy = false;
    state.waitlistMessage = payload.deliveryMode === "email"
      ? WAITLIST_FOUNDING_NOTE
      : WAITLIST_FOUNDING_NOTE;
    trackEvent("waitlist_joined", {
      deliveryMode: payload.deliveryMode || "",
      stored: payload.stored || ""
    });
    render();
  }));
  document.querySelectorAll("[data-clerk-signup]").forEach((button) => {
    button.addEventListener("click", () => {
      trackEvent("signup_started");
      if (window.Clerk?.openSignUp) window.Clerk.openSignUp();
      else setStatus("Sign-up is loading, one moment…", "account"), render();
    });
  });
  document.querySelectorAll("[data-clerk-signin]").forEach((button) => {
    button.addEventListener("click", () => {
      if (window.Clerk?.openSignIn) window.Clerk.openSignIn();
      else setStatus("Sign-in is loading, one moment…", "account"), render();
    });
  });
  document.querySelectorAll("[data-clerk-first-decision-input]").forEach((input) => {
    input.addEventListener("input", () => {
      state.clerkFirstDecision = input.value;
      render();
    });
  });
  document.querySelectorAll("[data-clerk-decision-suggestion]").forEach((button) => {
    button.addEventListener("click", () => {
      state.clerkFirstDecision = button.dataset.clerkDecisionSuggestion || "";
      render();
    });
  });
  // Values onboarding interactions
  document.querySelectorAll("[data-values-slider]").forEach((input) => {
    const key = input.dataset.valuesSlider;
    const display = document.getElementById(`slider-display-${key}`);
    input.addEventListener("input", () => {
      if (!state.valuesDraft) state.valuesDraft = {};
      state.valuesDraft[key] = Number(input.value);
      if (display) display.textContent = input.value;
    });
  });
  document.querySelectorAll("[data-values-text]").forEach((input) => {
    input.addEventListener("input", () => {
      if (!state.valuesDraft) state.valuesDraft = {};
      state.valuesDraft[input.dataset.valuesText] = input.value;
    });
  });
  document.querySelectorAll("[data-values-option]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!state.valuesDraft) state.valuesDraft = {};
      state.valuesDraft[button.dataset.valuesOption] = button.dataset.valuesValue;
      render();
    });
  });
  document.querySelectorAll("[data-values-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!state.valuesDraft) state.valuesDraft = {};
      const key = button.dataset.valuesToggle;
      const val = button.dataset.valuesValue;
      const arr = Array.isArray(state.valuesDraft[key]) ? [...state.valuesDraft[key]] : [];
      const idx = arr.indexOf(val);
      if (idx === -1) arr.push(val);
      else arr.splice(idx, 1);
      state.valuesDraft[key] = arr;
      render();
    });
  });
  document.querySelectorAll("[data-values-next]").forEach((button) => {
    button.addEventListener("click", () => {
      const steps = getActiveValuesSteps();
      const step = steps[state.valuesStep];
      if (step && step.type === "slider" && !state.valuesDraft[step.key]) {
        state.valuesDraft[step.key] = step.defaultValue;
      }
      // Mark optional text steps as seen even when left blank, so the
      // finish-profile card doesn't re-prompt for them forever.
      if (step && step.type === "text") {
        if (state.valuesDraft[step.key] === undefined) state.valuesDraft[step.key] = "";
        if (step.subKey && state.valuesDraft[step.subKey] === undefined) state.valuesDraft[step.subKey] = "";
      }
      // Group steps: mark any unanswered sub-field as seen (optional text -> "",
      // skipped options stay "" rather than undefined) so top-up doesn't re-ask.
      if (step && step.type === "group") {
        (step.fields || []).forEach((f) => {
          if (state.valuesDraft[f.key] === undefined) state.valuesDraft[f.key] = "";
        });
      }
      if (state.valuesStep < steps.length - 1) {
        state.valuesStep++;
        render();
      } else {
        // Merge over the existing profile so a finish-the-new-questions pass
        // never wipes earlier answers.
        const values = { ...(state.userValues || {}), ...state.valuesDraft, completed: true };
        saveUserValues(values);
        trackEvent("values_onboarding_completed", { steps: steps.length, topUp: steps.length < VALUES_ONBOARDING_STEPS.length });
        saveWorkspaceView("dashboard");
        saveMobileView("home");
        render();
        showSuccessToast("Profile saved — PAM now tailors every answer to your goals.");
      }
    });
  });
  document.querySelectorAll("[data-values-back]").forEach((button) => {
    button.addEventListener("click", () => {
      if (state.valuesStep > 0) { state.valuesStep--; render(); }
    });
  });
  // "Skip setup" was removed on purpose: the values profile is the context
  // every PAM answer depends on, so the dashboard requires completing it.
  document.querySelectorAll("[data-ask-about]").forEach((button) => {
    button.addEventListener("click", () => {
      const q = button.dataset.askAbout || "";
      if (!q) return;
      saveQuestion(q);
      saveWorkspaceView("dashboard");
      saveMobileView("ask");
      render();
      setTimeout(() => {
        const input = document.querySelector("[data-question-input]");
        if (input) input.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    });
  });
  document.querySelectorAll("[data-life-value]").forEach((button) => {
    button.addEventListener("click", () => {
      toggleLifeValue(button.dataset.lifeValue || "");
      render();
    });
  });
  document.querySelectorAll("[data-pay-frequency]").forEach((button) => {
    button.addEventListener("click", () => {
      const f = button.dataset.payFrequency || "";
      savePayFrequency(state.payFrequency === f ? "" : f);
      render();
    });
  });
  document.querySelectorAll("[data-clerk-first-decision-submit]").forEach((button) => {
    button.addEventListener("click", () => {
      const q = state.clerkFirstDecision.trim();
      if (!q) return;
      saveQuestion(q);
      state.clerkFirstDecisionStep = false;
      render();
    });
  });
  document.querySelectorAll("[data-checkout]").forEach((button) => {
    button.addEventListener("click", () => {
      startCheckout(button.dataset.checkout || "monthly");
    });
  });
  document.querySelectorAll("[data-reset-baseline]").forEach((button) => button.addEventListener("click", resetBaseline));
  document.querySelectorAll("[data-logout]").forEach((button) => button.addEventListener("click", logoutAccount));
  document.querySelectorAll("[data-load-sandbox]").forEach((button) => button.addEventListener("click", handleSandboxSampleData));
  document.querySelectorAll("[data-connect-sandbox]").forEach((button) => button.addEventListener("click", handleConnectSandboxAccount));
  document.querySelectorAll("[data-create-next]").forEach((button) => button.addEventListener("click", handleCreateAccountNext));
  document.querySelectorAll("[data-create-back]").forEach((button) => button.addEventListener("click", handleCreateAccountBack));
  document.querySelectorAll("[data-create-submit]").forEach((button) => button.addEventListener("click", handleCreateAccountSubmitClick));
  document.querySelectorAll("[data-draft-suggestion]").forEach((button) => {
    button.addEventListener("click", handleDraftSuggestionClick);
  });
  document.querySelectorAll("[data-send-verification-code]").forEach((button) => button.addEventListener("click", handleSendVerificationCode));
  document.querySelectorAll("[data-verification-code-input]").forEach((input) => input.addEventListener("input", handleVerificationCodeInput));
  document.querySelectorAll("[data-signin-instead]").forEach((button) => button.addEventListener("click", handleSigninInsteadClick));
  document.querySelectorAll("[data-open-signin]").forEach((button) => {
    button.addEventListener("click", () => {
      saveAuthView("signin");
      saveWorkspaceView("account");
      clearStatus("account");
      render();
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    });
  });
  document.querySelectorAll("[data-open-waitlist]").forEach((button) => button.addEventListener("click", () => {
    state.waitlistOpen = true;
    state.waitlistMessage = state.waitlistJoined ? WAITLIST_FOUNDING_NOTE : "";
    state.waitlistBusy = false;
    trackEvent("waitlist_opened");
    render();
  }));
  document.querySelectorAll("[data-close-waitlist-button]").forEach((button) => button.addEventListener("click", () => {
    state.waitlistOpen = false;
    render();
  }));
  document.querySelectorAll("[data-close-waitlist]").forEach((modal) => modal.addEventListener("click", (event) => {
    if (event.target.matches("[data-close-waitlist]")) {
      state.waitlistOpen = false;
      render();
    }
  }));
  document.querySelectorAll("[data-open-waitlist-link]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      state.waitlistOpen = true;
      state.waitlistMessage = "";
      state.waitlistBusy = false;
      trackEvent("waitlist_opened", { source: "direct_link" });
      render();
    });
  });
  document.querySelectorAll("[data-scroll-target]").forEach((button) => {
    button.addEventListener("click", () => handleSectionScroll(button.dataset.scrollTarget));
  });
  document.querySelectorAll("[data-mobile-scroll]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = button.dataset.mobileScroll || "#daily-home";
      document.querySelector(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  document.querySelectorAll("[data-mobile-view]").forEach((button) => {
    button.addEventListener("click", () => {
      saveMobileView(button.dataset.mobileView || "home");
      render();
      requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
    });
  });
  document.querySelectorAll("[data-net-worth-range]").forEach((button) => {
    button.addEventListener("click", () => {
      saveNetWorthRange(button.dataset.netWorthRange || "3M");
      trackEvent("net_worth_range_changed", { range: state.netWorthRange });
      render();
    });
  });
  document.querySelectorAll("[data-display-theme]").forEach((button) => {
    button.addEventListener("click", () => {
      saveDisplayTheme(button.dataset.displayTheme || "light");
      trackEvent("display_theme_changed", { theme: state.displayTheme });
      render();
    });
  });
  document.querySelectorAll("[data-open-view]").forEach((button) => {
    button.addEventListener("click", () => openWorkspaceView(button.dataset.openView || "account"));
  });
  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.addEventListener("click", handleAuthModeClick);
  });
  document.querySelectorAll("[data-save-scenario]").forEach((button) => {
    button.addEventListener("click", () => {
      saveCurrentScenario();
      render();
    });
  });
  document.querySelectorAll("[data-run-history-question], [data-run-saved-scenario]").forEach((button) => {
    button.addEventListener("click", async () => {
      const question = button.dataset.runHistoryQuestion || button.dataset.runSavedScenario || "";
      if (!question) return;
      await runDecisionAnalysis(question, "Saved scenario analyzed against your current baseline.");
    });
  });
  document.querySelectorAll("[data-remove-saved-scenario]").forEach((button) => {
    button.addEventListener("click", () => {
      removeSavedScenario(button.dataset.removeSavedScenario || "");
      render();
    });
  });
  document.querySelectorAll("[data-goal-template]").forEach((button) => {
    button.addEventListener("click", () => {
      addGoalFromTemplate(button.dataset.goalTemplate || "");
      render();
    });
  });
  document.querySelectorAll("[data-export-profile]").forEach((button) => {
    button.addEventListener("click", exportProfileData);
  });
  document.querySelectorAll("[data-clear-saved-scenarios]").forEach((button) => {
    button.addEventListener("click", () => {
      saveSavedScenarios([]);
      state.saveScenarioMessage = "Saved scenarios cleared.";
      render();
    });
  });
  document.querySelectorAll("[data-question-example]").forEach((button) => {
    button.addEventListener("click", async () => {
      const question = button.dataset.questionExample || "";
      if (canUseFinancialFeatures()) {
        await runDecisionAnalysis(question, "Example prompt analyzed. You can edit it and run another scenario.");
        requestAnimationFrame(() => {
          document.querySelector("#decision-result")?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      } else {
        saveQuestion(question);
        saveWorkspaceView("account");
        saveMobileView("ask");
        state.result = null;
        state.aiGuidance = null;
        setStatus(canAccessDashboard()
          ? "Prompt saved. Accept PAM's legal terms first so PAM can analyze it against your baseline."
          : "Prompt saved. Finish account setup first so PAM can analyze it against your baseline.", "account");
        render();
      }
    });
  });
}

// Localhost-only preview hydration so gated screens (dashboard, result,
// values flow) can be styled and reviewed without a Clerk login. Strictly
// inert in production: requires a local hostname AND an explicit opt-in flag.
function applyDevPreviewAccount() {
  if (typeof window === "undefined") return;
  if (!["localhost", "127.0.0.1"].includes(window.location.hostname)) return;
  if (window.localStorage.getItem("pam:dev-preview:v1") !== "on") return;
  state.account = { id: "dev-preview", firstName: "Preview", emailAddress: "preview@local.test" };
  const sandboxPayload = loadSandboxFallback(state.baseline);
  saveBaseline(syncAccountIntoBaseline(state.account, sandboxPayload.baseline));
  saveLegalAcceptance({
    acceptedAdvisorDisclaimer: true,
    acceptedTermsPrivacy: true,
    termsVersion: TERMS_VERSION,
    privacyVersion: PRIVACY_VERSION,
    acceptedAt: new Date().toISOString()
  });
  if (!state.userValues) {
    saveUserValues({
      age: 26, city: "Charlotte", state: "NC", household: "single", housing: "rent",
      worker_type: "salaried", pay_frequency: "biweekly", retirement_target_age: 55,
      work_philosophy: "work_to_live", location_flexible: "maybe",
      lifestyle_priorities: ["Travel", "Financial freedom"], industry: "finance",
      years_at_current_job: "2_to_3", offline_factors: ["Student loans"],
      anything_else: "", completed: true
    });
  }
  saveWorkspaceView("dashboard");
}

export async function startApp() {
  if (isStarted) return;
  isStarted = true;
  window.addEventListener("error", (event) => {
    trackEvent("client_error", {
      message: event.message || "Unknown client error",
      source: event.filename || ""
    }, "error");
    try { window.Sentry?.captureException?.(event.error || event.message); } catch (_e) {}
  });
  window.addEventListener("unhandledrejection", (event) => {
    trackEvent("client_unhandled_rejection", {
      message: String(event.reason?.message || event.reason || "Unhandled rejection")
    }, "error");
    try { window.Sentry?.captureException?.(event.reason); } catch (_e) {}
  });
  lastMobileViewportState = isMobileDashboardViewport();
  window.addEventListener("resize", () => {
    const nextMobileState = isMobileDashboardViewport();
    if (nextMobileState === lastMobileViewportState) return;
    lastMobileViewportState = nextMobileState;
    render();
  });
  if (shouldShowPublicLaunchGate()) {
    trackEvent("launch_gate_viewed", {
      path: window.location.pathname || "/"
    });
    render();
    return;
  }
  applyDevPreviewAccount();
  // Listen for Clerk auth changes (sign-in/out happen in Clerk modal)
  if (isClerkMode()) {
    window.addEventListener("pam:clerk:change", async () => {
      const prev = state.account?.id;
      await restoreSessionAccount();
      if (state.account?.id !== prev) {
        if (state.account) {
          await loadSubscription();
          // New user with no question yet — show firstDecision step
          const isNewUser = !hasCompletedBaseline(state.baseline);
          const hasNoQuestion = !state.question || /Can I afford to move out if rent is \$1,800\?/.test(state.question);
          if (isNewUser && hasNoQuestion) {
            state.clerkFirstDecisionStep = true;
            saveWorkspaceView("account");
          } else {
            routeSignedInUser("Signed in.");
          }
        } else {
          saveWorkspaceView("landing");
          state.account = null;
          state.result = null;
          state.subscription = null;
          state.clerkFirstDecisionStep = false;
        }
        render();
      }
    });
  }

  await restoreSessionAccount();
  if (isClerkMode() && state.account?.id) {
    await loadSubscription();
  }
  if (hasPrototypeAccount()) {
    const baseline = syncAccountIntoBaseline(state.account, state.baseline);
    saveBaseline(baseline);
  }
  if (canAccessDashboard()) {
    if (hasAcceptedLegalTerms() && !state.userValues?.completed) {
      state.valuesStep = 0;
      state.valuesDraft = {};
      saveWorkspaceView("values");
    } else {
      saveWorkspaceView(hasAcceptedLegalTerms() ? "dashboard" : "account");
    }
    if (hasAcceptedLegalTerms() && state.userValues?.completed) saveMobileView("home");
  } else if (hasPrototypeAccount()) {
    saveWorkspaceView("account");
  } else {
    saveWorkspaceView("landing");
  }
  if (["/newsletter", "/waitlist"].includes(window.location.pathname)) {
    saveWorkspaceView("landing");
    state.waitlistOpen = false;
  }
  // Handle Stripe return URLs
  const checkoutParam = new URLSearchParams(window.location.search).get("checkout");
  if (checkoutParam === "success") {
    await loadSubscription();
    setStatus("You're subscribed. Welcome to PAM AI.", "account");
    window.history.replaceState({}, "", window.location.pathname);
  } else if (checkoutParam === "cancelled") {
    setStatus("Checkout cancelled — you can upgrade anytime from your profile.", "account");
    window.history.replaceState({}, "", window.location.pathname);
  }
  state.goals = loadUserGoals();
  state.decisionHistory = loadDecisionHistory();
  state.savedScenarios = loadSavedScenarios();
  // Hydrate userValues from Supabase baseline if localStorage is empty
  if (!state.userValues && state.baseline?.userValues) {
    state.userValues = state.baseline.userValues;
  }
  state.result = canAccessDashboard() ? toLegacyDecisionFromSession(buildScenarioSession({ prompt: state.question })) : null;
  trackEvent("app_loaded", {
    view: state.workspaceView,
    hasAccount: hasPrototypeAccount(),
    hasDashboard: canAccessDashboard()
  });
  render();
  setTimeout(() => {
    maybeAutoRefreshFinancialData().catch(() => null);
  }, 800);
}
