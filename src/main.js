import {
  comparisonRows,
  featureList,
  goalTemplates,
  howItWorks,
  plaidQuickstart,
  privacyPolicy,
  starterScenarios,
  trustHighlights
} from "./data/mockData.js";
import { renderLanding } from "./components/landing.js";
import { renderAccount } from "./components/account.js";
import { renderDashboard } from "./components/dashboard.js";
import { renderGoals } from "./components/goals.js";
import { renderInsights } from "./components/insights.js";
import { renderScenarioLab } from "./components/scenarioLab.js";
import { renderPrivacyPolicyModal, renderTrustCenter } from "./components/trustCenter.js";
import { escapeHtml, formatCurrency, formatMonths } from "./utils/formatters.js";
import { createLandingExamples, generateInsights, getProfileMetrics } from "./utils/scenarioEngine.js";
import {
  getDecisionEngineMeta,
  resolveDecisionPrompt,
  resolveDraftScenario,
  resolveStarterScenario
} from "./services/scenarioClient.js";
import {
  connectPlaidSnapshot,
  createAccountProfile,
  disconnectPlaidSnapshot,
  loadAccountState,
  loadGoalsState,
  loadProfileBundle,
  loadTrustState,
  saveAccountState,
  saveGoalsState,
  saveProfileBundle,
  saveTrustState
} from "./services/profileStore.js";
import { launchPlaidLink } from "./services/plaidClient.js";

const app = document.querySelector("#app");

const state = {
  activeTab: "scenario",
  session: null,
  engine: getDecisionEngineMeta(),
  profileBundle: null,
  accountState: null,
  goals: [],
  trustState: null,
  isResolving: false,
  showPrivacyPolicy: false
};

let isStarted = false;

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function getActiveProfile() {
  return state.profileBundle?.profile;
}

function getProfileSource() {
  return state.profileBundle?.source || {
    label: "Loading profile",
    status: "Loading",
    detail: "Preparing the financial baseline.",
    nextStep: "Waiting for the profile store to initialize."
  };
}

function getTrustState() {
  return state.trustState;
}

function getAccountState() {
  return state.accountState;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function getLandingExamples() {
  return createLandingExamples(getActiveProfile(), state.goals, starterScenarios);
}

async function initializeState() {
  if (state.profileBundle && state.accountState && state.goals.length && state.trustState) return;

  const [profileBundle, accountState, goals, trustState] = await Promise.all([
    loadProfileBundle(),
    loadAccountState(),
    loadGoalsState(),
    loadTrustState()
  ]);

  state.profileBundle = profileBundle;
  state.accountState = accountState;
  state.goals = goals;
  state.trustState = trustState;

  const resolution = await resolveStarterScenario({
    starterId: "buy-car",
    profile: getActiveProfile(),
    goals: state.goals,
    catalog: starterScenarios
  });

  state.engine = resolution.engine;
  state.session = resolution.session;
}

function renderWorkspaceTabs() {
  const tabs = [
    { id: "scenario", label: "Scenario Engine" },
    { id: "goals", label: "Life Goals" },
    { id: "account", label: "Account" },
    { id: "dashboard", label: "Dashboard" },
    { id: "insights", label: "Insights" },
    { id: "trust", label: "Trust Center" }
  ];

  return tabs
    .map(
      (tab) => `
        <button class="workspace-tab ${state.activeTab === tab.id ? "active" : ""}" data-tab="${tab.id}">
          ${escapeHtml(tab.label)}
        </button>
      `
    )
    .join("");
}

function renderProfileRail(metrics) {
  const profile = getActiveProfile();
  const source = getProfileSource();
  const security = getTrustState().security;
  const account = getAccountState();
  const mostImpactedGoal = state.session.result.goalsSummary.mostImpactedGoal;

  return `
    <aside class="profile-rail surface-panel">
      <div class="profile-intro">
        <p class="eyebrow">Personal Asset Manager</p>
        <h2>${escapeHtml(profile.user.name)}</h2>
        <p>${escapeHtml(profile.user.objective)}</p>
      </div>
      <div class="profile-tiles">
        <div class="profile-tile">
          <span>Net worth</span>
          <strong>${formatCurrency(metrics.currentNetWorth)}</strong>
        </div>
        <div class="profile-tile">
          <span>Liquid buffer</span>
          <strong>${formatCurrency(metrics.liquidAssets)}</strong>
        </div>
        <div class="profile-tile">
          <span>Monthly buffer</span>
          <strong>${formatCurrency(metrics.monthlyFreeCash)}</strong>
        </div>
        <div class="profile-tile">
          <span>Runway</span>
          <strong>${formatMonths(metrics.runwayMonths)}</strong>
        </div>
      </div>
      <div class="profile-note">
        <span>Decision posture</span>
        <p>${escapeHtml(state.session.result.ahaMoment)}</p>
      </div>
      <div class="profile-system-grid">
        <div class="profile-system-card">
          <span>Account</span>
          <strong>${account?.isCreated ? "Onboarded" : "Awaiting link"}</strong>
          <p>${escapeHtml(account?.email || "Account setup pending")}</p>
        </div>
        <div class="profile-system-card">
          <span>Most impacted goal</span>
          <strong>${escapeHtml(mostImpactedGoal?.title || "None")}</strong>
          <p>${mostImpactedGoal?.deltaMonths > 0 ? `${Math.round(mostImpactedGoal.deltaMonths)} month delay` : "No major delay"}</p>
        </div>
      </div>
      <div class="profile-source-note">
        <span>Data source</span>
        <p>${escapeHtml(source.label)} • ${escapeHtml(source.status)}</p>
      </div>
      <div class="profile-source-note">
        <span>Plaid</span>
        <p>
          ${
            account?.plaidLinked
              ? `Connected to ${escapeHtml(account.plaidInstitution)} • ${account.plaidAccountsSynced} accounts synced`
              : `Not connected yet • ${escapeHtml(account?.plaidConnectionStage || "Link token not created")}`
          }
        </p>
      </div>
      <div class="profile-source-note">
        <span>Plaid integration path</span>
        <p>${escapeHtml(source.nextStep)}</p>
      </div>
      <div class="profile-source-note">
        <span>Account protection</span>
        <p>
          ${
            security.twoFactorEnabled
              ? `${escapeHtml(security.twoFactorMethod)} active with ${security.recoveryCodesRemaining} recovery codes remaining.`
              : "Two-factor authentication is currently off."
          }
        </p>
      </div>
    </aside>
  `;
}

function renderActivePanel(metrics) {
  if (state.activeTab === "dashboard") {
    return renderDashboard(getActiveProfile(), metrics);
  }

  if (state.activeTab === "goals") {
    return renderGoals(state.goals, state.session, goalTemplates);
  }

  if (state.activeTab === "account") {
    return renderAccount(getActiveProfile(), getAccountState(), getProfileSource(), getTrustState());
  }

  if (state.activeTab === "insights") {
    return renderInsights(generateInsights(getActiveProfile(), state.goals, state.session));
  }

  if (state.activeTab === "trust") {
    return renderTrustCenter(getTrustState(), privacyPolicy, trustHighlights, plaidQuickstart);
  }

  return renderScenarioLab(state.session, starterScenarios, {
    isResolving: state.isResolving,
    engine: state.engine,
    profileSource: getProfileSource()
  });
}

function renderSiteFooter() {
  const source = getProfileSource();

  return `
    <footer class="site-footer surface-panel">
      <div class="site-footer-copy">
        <p class="eyebrow">Trust & transparency</p>
        <strong>PAM AI is designed to model decisions, not to behave like a spreadsheet with a chatbot attached.</strong>
        <p>
          ${escapeHtml(
            `${source.label} is active today. Privacy policy v${privacyPolicy.version}, two-factor controls, and a Plaid-ready normalization layer are available in-product.`
          )}
        </p>
      </div>
      <div class="site-footer-actions">
        <a class="button button-secondary" href="#workspace" data-open-tab="trust">Open Trust Center</a>
        <button class="button button-secondary" type="button" data-open-privacy>Privacy Policy</button>
      </div>
    </footer>
  `;
}

function render() {
  const profile = getActiveProfile();
  const trustState = getTrustState();
  const accountState = getAccountState();
  if (!profile || !trustState || !accountState || !state.session) return;

  const metrics = getProfileMetrics(profile);

  app.innerHTML = `
    <div class="page-shell">
      <header class="site-header">
        <a class="brand-mark" href="#top">
          <span>PAM</span>
          <div>
            <strong>PAM AI</strong>
            <small>Personal Asset Manager</small>
          </div>
        </a>
        <nav class="site-nav">
          <a href="#top">Demo</a>
          <a href="#workspace">Simulator</a>
          <a href="#examples">Examples</a>
          <a href="#workspace" data-open-tab="trust">Security</a>
        </nav>
        <div class="header-actions">
          <button class="button button-primary header-button" type="button" data-plaid-action="${accountState.plaidLinked ? "refresh" : "connect"}" data-plaid-complete>
            ${accountState.plaidLinked ? "Refresh Plaid" : "Sign in with Plaid"}
          </button>
          <a class="button button-secondary header-button" href="#workspace">View demo</a>
        </div>
      </header>

      <main>
        ${renderLanding({
          metrics,
          session: state.session,
          goals: state.goals,
          landingExamples: getLandingExamples(),
          accountState,
          profileSource: getProfileSource(),
          trustState
        })}

        <section class="workspace-section" id="workspace">
          <div class="workspace-heading">
            <div>
              <p class="eyebrow">Application workspace</p>
              <h2>See the ripple effects of every financial move.</h2>
            </div>
            <p>The scenario engine leads. Goals, insights, and trust controls stay close enough to support the decision without stealing focus.</p>
          </div>

          <div class="workspace-layout">
            ${renderProfileRail(metrics)}
            <div class="workspace-main">
              <div class="workspace-tabs surface-card">
                ${renderWorkspaceTabs()}
              </div>
              <div class="workspace-panel">
                ${renderActivePanel(metrics)}
              </div>
            </div>
          </div>
        </section>
      </main>
      ${renderSiteFooter()}
      ${state.showPrivacyPolicy ? renderPrivacyPolicyModal(trustState, privacyPolicy) : ""}
    </div>
  `;
}

function updateTrustState(mutator) {
  const draft = cloneValue(getTrustState());
  const nextState = mutator(draft) || draft;
  state.trustState = saveTrustState(nextState);
}

function updateAccountState(mutator) {
  const draft = cloneValue(getAccountState());
  const nextState = mutator(draft) || draft;
  state.accountState = saveAccountState(nextState);
}

function updateProfileBundle(bundle) {
  state.profileBundle = saveProfileBundle(bundle);
}

async function resolvePrompt(prompt, nextTab = "scenario") {
  const trimmedPrompt = String(prompt || "").trim();
  if (!trimmedPrompt || state.isResolving) return;

  state.isResolving = true;
  render();

  const resolution = await resolveDecisionPrompt({
    prompt: trimmedPrompt,
    profile: getActiveProfile(),
    goals: state.goals,
    catalog: starterScenarios
  });

  state.engine = resolution.engine;
  state.session = resolution.session;
  state.activeTab = nextTab;
  state.isResolving = false;
  render();
}

async function resolveStarter(starterId) {
  if (state.isResolving) return;
  state.isResolving = true;
  render();

  const resolution = await resolveStarterScenario({
    starterId,
    profile: getActiveProfile(),
    goals: state.goals,
    catalog: starterScenarios
  });

  state.engine = resolution.engine;
  state.session = resolution.session;
  state.activeTab = "scenario";
  state.isResolving = false;
  render();
}

async function resolveDraft(draft, nextTab = state.activeTab) {
  if (state.isResolving) return;
  state.isResolving = true;
  render();

  const resolution = await resolveDraftScenario({
    draft,
    profile: getActiveProfile(),
    goals: state.goals,
    catalog: starterScenarios
  });

  state.engine = resolution.engine;
  state.session = resolution.session;
  state.activeTab = nextTab;
  state.isResolving = false;
  render();
}

function buildDraftFromForm(formData) {
  const baseDraft = cloneValue(state.session.draft);
  const nextDraft = {
    ...baseDraft,
    type: String(formData.get("type") || baseDraft.type),
    starterId: String(formData.get("starterId") || baseDraft.starterId || ""),
    prompt: String(formData.get("prompt") || baseDraft.prompt || "")
  };

  for (const field of state.session.editableFields) {
    const raw = formData.get(field.key);
    if (raw === null || raw === "") continue;
    nextDraft[field.key] = Number(raw);
  }

  return nextDraft;
}

function getAccountDraftFromForm(form) {
  const formData = form ? new FormData(form) : null;

  return {
    name: String(formData?.get("name") || getActiveProfile().user.name || "Demo User").trim(),
    email: String(formData?.get("email") || getAccountState().email || "demo@pamai.app").trim(),
    city: String(formData?.get("city") || getActiveProfile().user.city || "").trim(),
    objective: String(formData?.get("objective") || getActiveProfile().user.objective || "").trim()
  };
}

function getPlaidAccountDraft() {
  return {
    name: getActiveProfile().user.name || "PAM AI user",
    email: getAccountState().email || "demo@pamai.app",
    city: getActiveProfile().user.city || "",
    objective: getActiveProfile().user.objective || ""
  };
}

function saveAccountDraft(accountDraft) {
  updateProfileBundle({
    ...state.profileBundle,
    profile: createAccountProfile(getActiveProfile(), accountDraft)
  });

  updateAccountState((draft) => {
    draft.email = accountDraft.email || draft.email;
    draft.onboardingStep = draft.plaidLinked ? "Plaid-connected profile active" : "Plaid sign-in required";
    draft.plaidError = "";
    return draft;
  });
}

async function connectPlaid(action = "connect", accountDraft = getPlaidAccountDraft(), completeAfterLink = false) {
  updateAccountState((draft) => {
    draft.plaidConnectionStage = action === "refresh" ? "Refreshing linked accounts" : "Creating Plaid link token";
    draft.plaidError = "";
    draft.onboardingStep = completeAfterLink ? "Opening Plaid secure sign-in" : draft.onboardingStep;
    return draft;
  });
  render();

  try {
    const linked = await launchPlaidLink({
      name: accountDraft.name || getActiveProfile().user.name,
      email: accountDraft.email || getAccountState().email
    });
    const syncedProfile = connectPlaidSnapshot(getActiveProfile(), linked.snapshot, linked.institutionName);
    updateProfileBundle(syncedProfile);

    const now = new Date().toISOString();
    updateAccountState((draft) => {
      draft.plaidLinked = true;
      draft.plaidInstitution = linked.institutionName || "Linked institution";
      draft.plaidConnectionStage = action === "refresh" ? "Snapshot refreshed" : "Linked with Plaid";
      draft.plaidAccountsSynced = linked.snapshot?.accounts?.length || syncedProfile.profile.assets.length;
      draft.plaidLastSyncAt = now;
      draft.plaidError = "";
      draft.profileCompletion = completeAfterLink ? 100 : 96;
      draft.isCreated = completeAfterLink ? true : draft.isCreated;
      draft.createdAt = completeAfterLink ? draft.createdAt || now : draft.createdAt;
      draft.lastLoginAt = now;
      draft.email = accountDraft.email || draft.email;
      draft.onboardingStep = "Plaid-connected profile active";
      return draft;
    });

    await resolveDraft(state.session.draft, "account");
  } catch (error) {
    updateAccountState((draft) => {
      draft.plaidError = error.message || "Unable to complete the Plaid connection.";
      draft.plaidConnectionStage = "Plaid link not completed";
      draft.onboardingStep = completeAfterLink ? "Plaid sign-in required" : draft.onboardingStep;
      return draft;
    });
    render();
  }
}

function addGoal(goal) {
  state.goals = saveGoalsState([...state.goals, goal]);
}

function removeGoal(goalId) {
  state.goals = saveGoalsState(state.goals.filter((goal) => goal.id !== goalId));
}

function addGoalFromTemplate(templateId) {
  const template = goalTemplates.find((item) => item.id === templateId);
  if (!template) return;

  const goal = {
    ...template,
    id: `${template.id}-${Date.now()}`,
    currentAmount: 0,
    targetTimelineMonths: template.targetTimelineMonths || 48
  };

  addGoal(goal);
  void resolveDraft(state.session.draft, "goals");
}

function handleClick(event) {
  if (event.target.matches("[data-privacy-backdrop]") || event.target.closest("[data-close-privacy]")) {
    state.showPrivacyPolicy = false;
    render();
    return;
  }

  if (event.target.closest("[data-open-privacy]")) {
    state.showPrivacyPolicy = true;
    render();
    return;
  }

  const securityActionButton = event.target.closest("[data-security-action]");
  if (securityActionButton) {
    const action = securityActionButton.dataset.securityAction;
    const methods = ["Authenticator app", "Passkey + authenticator backup", "SMS fallback"];
    const now = new Date().toISOString();

    updateTrustState((draft) => {
      if (action === "toggle-2fa") {
        draft.security.twoFactorEnabled = !draft.security.twoFactorEnabled;
        draft.security.sessionTimeoutMinutes = draft.security.twoFactorEnabled ? 15 : 30;
        if (draft.security.twoFactorEnabled && draft.security.recoveryCodesRemaining < 1) {
          draft.security.recoveryCodesRemaining = 10;
        }
        draft.security.lastUpdated = now;
      }

      if (action === "advance-2fa-method") {
        const currentIndex = methods.indexOf(draft.security.twoFactorMethod);
        draft.security.twoFactorMethod = methods[(currentIndex + 1 + methods.length) % methods.length];
        draft.security.lastUpdated = now;
      }

      if (action === "toggle-login-alerts") {
        draft.security.loginAlertsEnabled = !draft.security.loginAlertsEnabled;
        draft.security.lastUpdated = now;
      }

      if (action === "toggle-biometric-lock") {
        draft.security.biometricLockEnabled = !draft.security.biometricLockEnabled;
        draft.security.lastUpdated = now;
      }

      if (action === "rotate-recovery-codes") {
        draft.security.recoveryCodesRemaining = 10;
        draft.security.lastUpdated = now;
      }

      if (action === "review-privacy-policy") {
        draft.privacy.reviewedAt = now;
      }
    });

    render();
    return;
  }

  const tabButton = event.target.closest("[data-tab]");
  if (tabButton) {
    state.activeTab = tabButton.dataset.tab;
    render();
    return;
  }

  const starterButton = event.target.closest("[data-starter-id]");
  if (starterButton) {
    void resolveStarter(starterButton.dataset.starterId);
    return;
  }

  const followUpButton = event.target.closest("[data-followup-choice]");
  if (followUpButton && state.session.followUp) {
    const patch = state.session.followUp.choices[Number(followUpButton.dataset.followupChoice)]?.patch;
    if (!patch) return;
    void resolveDraft({ ...cloneValue(state.session.draft), ...patch }, "scenario");
    return;
  }

  const exampleButton = event.target.closest("[data-example-prompt]");
  if (exampleButton) {
    void resolvePrompt(exampleButton.dataset.examplePrompt, "scenario");
    document.querySelector("#workspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const openTabButton = event.target.closest("[data-open-tab]");
  if (openTabButton) {
    state.activeTab = openTabButton.dataset.openTab;
    render();
    document.querySelector("#workspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const plaidActionButton = event.target.closest("[data-plaid-action]");
  if (plaidActionButton) {
    const action = plaidActionButton.dataset.plaidAction;

    if (action === "connect" || action === "refresh") {
      const accountDraft = plaidActionButton.closest("form")
        ? getAccountDraftFromForm(plaidActionButton.closest("form"))
        : getPlaidAccountDraft();
      const completeAfterLink = plaidActionButton.hasAttribute("data-plaid-complete") || !getAccountState().isCreated;
      saveAccountDraft(accountDraft);
      void connectPlaid(action, accountDraft, completeAfterLink);
      return;
    }

    if (action === "disconnect") {
      updateProfileBundle(disconnectPlaidSnapshot(state.profileBundle));
      updateAccountState((draft) => {
        draft.isCreated = false;
        draft.plaidLinked = false;
        draft.plaidInstitution = "Not connected";
        draft.plaidConnectionStage = "Link token not created";
        draft.plaidAccountsSynced = 0;
        draft.plaidLastSyncAt = null;
        draft.plaidError = "";
        draft.profileCompletion = Math.min(draft.profileCompletion, 72);
        draft.onboardingStep = "Sign in with Plaid to begin";
        return draft;
      });
    }

    void resolveDraft(state.session.draft, "account");
    return;
  }

  const templateButton = event.target.closest("[data-goal-template]");
  if (templateButton) {
    addGoalFromTemplate(templateButton.dataset.goalTemplate);
    return;
  }

  const removeGoalButton = event.target.closest("[data-remove-goal-id]");
  if (removeGoalButton) {
    removeGoal(removeGoalButton.dataset.removeGoalId);
    void resolveDraft(state.session.draft, "goals");
  }
}

function handleSubmit(event) {
  if (event.target.matches("[data-decision-form]")) {
    event.preventDefault();
    const formData = new FormData(event.target);
    void resolvePrompt(String(formData.get("prompt") || ""), "scenario");
    return;
  }

  if (event.target.matches("[data-draft-form]")) {
    event.preventDefault();
    const formData = new FormData(event.target);
    void resolveDraft(buildDraftFromForm(formData), "scenario");
    return;
  }

  if (event.target.matches("[data-goal-form]")) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const title = String(formData.get("title") || "").trim();
    if (!title) return;

    addGoal({
      id: `${slugify(title)}-${Date.now()}`,
      title,
      category: title,
      targetAmount: Number(formData.get("targetAmount") || 0),
      currentAmount: Number(formData.get("currentAmount") || 0),
      monthlyContribution: Number(formData.get("monthlyContribution") || 0),
      priority: String(formData.get("priority") || "medium"),
      fundingSource: String(formData.get("fundingSource") || "cash"),
      targetTimelineMonths: Number(formData.get("targetTimelineMonths") || 0),
      annualReturn: String(formData.get("fundingSource") || "cash") === "invest" ? 0.06 : 0.024
    });

    event.target.reset();
    void resolveDraft(state.session.draft, "goals");
    return;
  }

  if (event.target.matches("[data-account-form]")) {
    event.preventDefault();
    void connectPlaid("connect", getPlaidAccountDraft(), true);
    return;
  }
}

export async function startApp() {
  if (!app) {
    throw new Error("Missing #app root element.");
  }

  await initializeState();

  if (isStarted) {
    render();
    return;
  }

  isStarted = true;
  document.addEventListener("click", handleClick);
  document.addEventListener("submit", handleSubmit);
  render();
}
