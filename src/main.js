import {
  comparisonRows,
  featureList,
  financialProfile,
  howItWorks,
  samplePrompts,
  scenarioCatalog,
  scenarioExamples
} from "./data/mockData.js";
import { renderLanding } from "./components/landing.js";
import { renderDashboard } from "./components/dashboard.js";
import { renderScenarioLab } from "./components/scenarioLab.js";
import { renderChat } from "./components/chat.js";
import { renderInsights } from "./components/insights.js";
import {
  buildChatReply,
  buildFallbackChatReply,
  createScenarioFromPreset,
  createScenarioFromPrompt,
  evaluateScenario,
  finalizeScenarioResult,
  generateInsights,
  getProfileMetrics
} from "./utils/scenarioEngine.js";
import { formatCurrency, formatMonths } from "./utils/formatters.js";

const app = document.querySelector("#app");

function prepareScenario(scenario) {
  return finalizeScenarioResult(evaluateScenario(financialProfile, scenario));
}

const initialScenario = prepareScenario(createScenarioFromPreset(scenarioCatalog[0]));

const state = {
  activeTab: "scenario",
  activeScenario: initialScenario,
  chatMessages: [
    {
      role: "assistant",
      text:
        "Ask me a financial what-if question and I’ll turn it into a projected outcome with risk, assumptions, and a recommended next step."
    },
    {
      role: "assistant",
      text: buildChatReply(initialScenario)
    }
  ]
};

function renderWorkspaceTabs() {
  const tabs = [
    { id: "scenario", label: "Scenario Lab" },
    { id: "dashboard", label: "Dashboard" },
    { id: "chat", label: "AI Chat" },
    { id: "insights", label: "Insights" }
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
  return `
    <aside class="profile-rail surface-panel">
      <div class="profile-intro">
        <p class="eyebrow">Personal Asset Manager</p>
        <h2>${financialProfile.user.name}</h2>
        <p>${financialProfile.user.objective}</p>
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
    </aside>
  `;
}

function renderActivePanel(metrics) {
  if (state.activeTab === "dashboard") {
    return renderDashboard(financialProfile, metrics);
  }

  if (state.activeTab === "chat") {
    return renderChat(state.chatMessages, samplePrompts, state.activeScenario);
  }

  if (state.activeTab === "insights") {
    return renderInsights(generateInsights(financialProfile, state.activeScenario));
  }

  return renderScenarioLab(state.activeScenario, scenarioCatalog);
}

function render() {
  const metrics = getProfileMetrics(financialProfile);

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
    </div>
  `;
}

function runScenario(prompt, { switchToScenario = true, addToChat = false } = {}) {
  const scenario = createScenarioFromPrompt(prompt, scenarioCatalog);
  if (!scenario) {
    if (addToChat) {
      state.chatMessages = [
        ...state.chatMessages,
        { role: "user", text: prompt },
        { role: "assistant", text: buildFallbackChatReply(prompt) }
      ];
    }
    render();
    return;
  }

  const result = prepareScenario(scenario);
  state.activeScenario = result;
  if (switchToScenario) state.activeTab = "scenario";

  if (addToChat) {
    state.chatMessages = [
      ...state.chatMessages,
      { role: "user", text: prompt },
      { role: "assistant", text: buildChatReply(result) }
    ];
  }

  render();
}

document.addEventListener("click", (event) => {
  const tabButton = event.target.closest("[data-tab]");
  if (tabButton) {
    state.activeTab = tabButton.dataset.tab;
    render();
    return;
  }

  const presetButton = event.target.closest("[data-preset-id]");
  if (presetButton) {
    const preset = scenarioCatalog.find((item) => item.id === presetButton.dataset.presetId);
    if (!preset) return;
    state.activeScenario = prepareScenario(createScenarioFromPreset(preset));
    state.activeTab = "scenario";
    render();
    return;
  }

  const exampleButton = event.target.closest("[data-prompt]");
  if (exampleButton) {
    runScenario(exampleButton.dataset.prompt, { switchToScenario: true, addToChat: false });
    document.querySelector("#workspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const samplePromptButton = event.target.closest("[data-chat-prompt]");
  if (samplePromptButton) {
    state.activeTab = "chat";
    runScenario(samplePromptButton.dataset.chatPrompt, { switchToScenario: false, addToChat: true });
    return;
  }

  const openTabButton = event.target.closest("[data-open-tab]");
  if (openTabButton) {
    state.activeTab = openTabButton.dataset.openTab;
    render();
  }
});

document.addEventListener("submit", (event) => {
  if (event.target.matches("[data-scenario-form]")) {
    event.preventDefault();
    const formData = new FormData(event.target);
    runScenario(String(formData.get("prompt") || ""), { switchToScenario: true, addToChat: false });
    return;
  }

  if (event.target.matches("[data-chat-form]")) {
    event.preventDefault();
    const formData = new FormData(event.target);
    const prompt = String(formData.get("prompt") || "");
    if (!prompt.trim()) return;
    state.activeTab = "chat";
    runScenario(prompt, { switchToScenario: false, addToChat: true });
  }
});

render();
