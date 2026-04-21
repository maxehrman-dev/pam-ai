import {
  comparisonRows,
  featureList,
  howItWorks,
  privacyPolicy,
  samplePrompts,
  scenarioCatalog,
  scenarioExamples,
  trustHighlights
} from "./data/mockData.js";
import { renderLanding } from "./components/landing.js";
import { renderDashboard } from "./components/dashboard.js";
import { renderScenarioLab } from "./components/scenarioLab.js";
import { renderChat } from "./components/chat.js";
import { renderInsights } from "./components/insights.js";
import { renderPrivacyPolicyModal, renderTrustCenter } from "./components/trustCenter.js";
import { createScenarioFromPreset, evaluateScenario, finalizeScenarioResult, generateInsights, getProfileMetrics } from "./utils/scenarioEngine.js";
import { escapeHtml, formatCurrency, formatMonths } from "./utils/formatters.js";
import { getDecisionEngineMeta, resolveScenarioQuery } from "./services/scenarioClient.js";
import { loadProfileBundle, loadTrustState, saveTrustState } from "./services/profileStore.js";

const app = document.querySelector("#app");

const state = {
  activeTab: "scenario",
  activeScenario: null,
  chatMessages: [],
  isResolving: false,
  engine: getDecisionEngineMeta(),
  profileBundle: null,
  trustState: null,
  showPrivacyPolicy: false
};

let isStarted = false;

function getActiveProfile() {
  return state.profileBundle?.profile;
}

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
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

function prepareScenario(scenario, profile = getActiveProfile()) {
  return finalizeScenarioResult(evaluateScenario(profile, scenario));
}

function createInitialChatMessages(initialScenario) {
  return [
    {
      role: "assistant",
      text:
        "Ask me a financial what-if question and I’ll turn it into projected outcomes, risk, assumptions, and the most sensible next step."
    },
    {
      role: "assistant",
      text: [
        `Interpretation: ${initialScenario.interpretationNarrative}`,
        `Current baseline: ${formatCurrency(initialScenario.currentPath.projectedNetWorth)} projected net worth and ${formatMonths(
          initialScenario.currentPath.runwayMonths
        )} of runway.`,
        `Start with a question like “Can I afford a $20,000 car right now?” or “What happens if my rent jumps by $400?”`
      ].join("\n\n")
    }
  ];
}

async function initializeProfileState() {
  if (state.profileBundle && state.trustState) return;

  const [profileBundle, trustState] = await Promise.all([loadProfileBundle(), loadTrustState()]);
  state.profileBundle = profileBundle;
  state.trustState = trustState;
  const initialScenario = prepareScenario(createScenarioFromPreset(scenarioCatalog[0]), getActiveProfile());
  state.activeScenario = initialScenario;
  state.chatMessages = createInitialChatMessages(initialScenario);
}

function renderWorkspaceTabs() {
  const tabs = [
    { id: "scenario", label: "Scenario Lab" },
    { id: "dashboard", label: "Dashboard" },
    { id: "chat", label: "AI Chat" },
    { id: "insights", label: "Insights" },
    { id: "trust", label: "Trust Center" }
  ];

  return tabs
    .map(
      (tab) => `
        <button class="workspace-tab ${state.activeTab === tab.id ? "active" : ""}" data-tab="${tab.id}">
          ${tab.label}
        </button>
      `
    )
    .join("");
}

function renderProfileRail(metrics) {
  const profile = getActiveProfile();
  const profileSource = getProfileSource();
  const trustState = getTrustState();
  const securitySummary = trustState?.security?.twoFactorEnabled
    ? `${trustState.security.twoFactorMethod} active with ${trustState.security.recoveryCodesRemaining} recovery codes remaining.`
    : "Two-factor authentication is currently off for this session.";

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
          <span>Runway</span>
          <strong>${formatMonths(metrics.runwayMonths)}</strong>
        </div>
        <div class="profile-tile">
          <span>Health score</span>
          <strong>${metrics.healthScore}/100</strong>
        </div>
      </div>
      <div class="profile-note">
        <span>Baseline posture</span>
        <p>Decision-ready, but still sensitive to choices that eat into liquid cash or recurring flexibility.</p>
      </div>
      <div class="profile-system-grid">
        <div class="profile-system-card">
          <span>Engine</span>
          <strong>${escapeHtml(state.engine.provider)}</strong>
          <p>${escapeHtml(state.engine.mode)}</p>
        </div>
        <div class="profile-system-card">
          <span>Data source</span>
          <strong>${escapeHtml(profileSource.status)}</strong>
          <p>${escapeHtml(profileSource.label)}</p>
        </div>
      </div>
      <div class="profile-source-note">
        <span>Plaid integration path</span>
        <p>${escapeHtml(profileSource.nextStep)}</p>
      </div>
      <div class="profile-source-note">
        <span>Account protection</span>
        <p>${escapeHtml(securitySummary)}</p>
      </div>
    </aside>
  `;
}

function renderActivePanel(metrics) {
  const profile = getActiveProfile();
  const profileSource = getProfileSource();

  if (state.activeTab === "dashboard") {
    return renderDashboard(profile, metrics);
  }

  if (state.activeTab === "chat") {
    return renderChat(state.chatMessages, samplePrompts, state.activeScenario, {
      engine: state.engine,
      profileSource,
      isResolving: state.isResolving
    });
  }

  if (state.activeTab === "insights") {
    return renderInsights(generateInsights(profile, state.activeScenario));
  }

  if (state.activeTab === "trust") {
    return renderTrustCenter(getTrustState(), privacyPolicy, trustHighlights);
  }

  return renderScenarioLab(state.activeScenario, scenarioCatalog, {
    isResolving: state.isResolving,
    engine: state.engine,
    profileSource
  });
}

function renderSiteFooter() {
  const trustState = getTrustState();

  return `
    <footer class="site-footer surface-panel">
      <div class="site-footer-copy">
        <p class="eyebrow">Trust & transparency</p>
        <strong>PAM AI is designed to model decisions, not monetize transaction trails.</strong>
        <p>
          ${escapeHtml(
            trustState.security.twoFactorEnabled
              ? `${trustState.security.twoFactorMethod} is active, privacy policy v${privacyPolicy.version} is available in-product, and future Plaid access is scoped to normalized profile snapshots.`
              : `Privacy policy v${privacyPolicy.version} is available in-product, and future Plaid access is scoped to normalized profile snapshots.`
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
  if (!profile || !state.activeScenario || !trustState) return;

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
          <a href="#showcase">Product</a>
          <a href="#examples">Examples</a>
          <a href="#workspace">App</a>
        </nav>
        <a class="button button-secondary header-button" href="#workspace">Open app</a>
      </header>

      <main>
        ${renderLanding({
          comparisonRows,
          featureList,
          howItWorks,
          scenarioExamples,
          trustHighlights,
          metrics,
          activeScenario: state.activeScenario
        })}

        <section class="workspace-section" id="workspace">
          <div class="workspace-heading">
            <div>
              <p class="eyebrow">Application workspace</p>
              <h2>Don’t just track your money. Model your decisions.</h2>
            </div>
            <p>The Scenario Lab leads the experience. Snapshot context, chat, and insights exist to help you decide faster.</p>
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

async function runScenario(prompt, { switchToScenario = true, addToChat = false } = {}) {
  const trimmedPrompt = String(prompt || "").trim();
  if (!trimmedPrompt || state.isResolving) return;

  if (addToChat) {
    state.chatMessages = [...state.chatMessages, { role: "user", text: trimmedPrompt }];
  }

  state.isResolving = true;
  render();

  const resolution = await resolveScenarioQuery({
    prompt: trimmedPrompt,
    profile: getActiveProfile(),
    catalog: scenarioCatalog
  });

  state.engine = resolution.engine;
  state.isResolving = false;

  if (resolution.kind === "fallback") {
    if (addToChat) {
      state.chatMessages = [...state.chatMessages, { role: "assistant", text: resolution.reply }];
    }
    render();
    return;
  }

  state.activeScenario = resolution.result;
  if (switchToScenario) state.activeTab = "scenario";

  if (addToChat) {
    state.chatMessages = [...state.chatMessages, { role: "assistant", text: resolution.reply }];
  }

  render();
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

  const presetButton = event.target.closest("[data-preset-id]");
  if (presetButton) {
    if (state.isResolving) return;
    const preset = scenarioCatalog.find((item) => item.id === presetButton.dataset.presetId);
    if (!preset) return;
    state.activeScenario = prepareScenario(createScenarioFromPreset(preset), getActiveProfile());
    state.activeTab = "scenario";
    render();
    return;
  }

  const exampleButton = event.target.closest("[data-prompt]");
  if (exampleButton) {
    void runScenario(exampleButton.dataset.prompt, { switchToScenario: true, addToChat: false });
    document.querySelector("#workspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const samplePromptButton = event.target.closest("[data-chat-prompt]");
  if (samplePromptButton) {
    state.activeTab = "chat";
    void runScenario(samplePromptButton.dataset.chatPrompt, { switchToScenario: false, addToChat: true });
    return;
  }

  const openTabButton = event.target.closest("[data-open-tab]");
  if (openTabButton) {
    state.activeTab = openTabButton.dataset.openTab;
    if (openTabButton.dataset.openTab === "trust") {
      state.showPrivacyPolicy = false;
    }
    render();
  }
}

function handleSubmit(event) {
  if (event.target.matches("[data-scenario-form]")) {
    event.preventDefault();
    const formData = new FormData(event.target);
    void runScenario(String(formData.get("prompt") || ""), { switchToScenario: true, addToChat: false });
    return;
  }

  if (event.target.matches("[data-chat-form]")) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const prompt = String(formData.get("prompt") || "");
    if (!prompt.trim()) return;
    state.activeTab = "chat";
    void runScenario(prompt, { switchToScenario: false, addToChat: true });
  }
}

export async function startApp() {
  if (!app) {
    throw new Error("Missing #app root element.");
  }

  await initializeProfileState();

  if (isStarted) {
    render();
    return;
  }

  isStarted = true;
  document.addEventListener("click", handleClick);
  document.addEventListener("submit", handleSubmit);
  render();
}
