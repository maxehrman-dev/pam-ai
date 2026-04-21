import { escapeHtml } from "../utils/formatters.js";

function formatBubbleText(text) {
  return escapeHtml(text).replace(/\n/g, "<br />");
}

export function renderChat(messages, samplePrompts, activeScenario, { engine, profileSource, isResolving }) {
  return `
    <section class="panel-section" id="chat">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">AI chat</p>
          <h2>Ask PAM AI in plain English</h2>
        </div>
        <p>Conversational projections with sharper prompt understanding and a Vercel-ready service layer.</p>
      </div>
      <div class="chat-meta-grid">
        <article class="surface-card chat-meta-card">
          <span class="eyebrow">Decision engine</span>
          <strong>${escapeHtml(engine.provider)}</strong>
          <p>${escapeHtml(engine.mode)}</p>
          <small>${escapeHtml(engine.upgradePath)}</small>
        </article>
        <article class="surface-card chat-meta-card">
          <span class="eyebrow">Financial context</span>
          <strong>${escapeHtml(profileSource.label)}</strong>
          <p>${escapeHtml(profileSource.detail)}</p>
          <small>${escapeHtml(profileSource.nextStep)}</small>
        </article>
      </div>
      <div class="chat-layout">
        <article class="surface-panel chat-panel">
          <div class="chat-thread">
            ${messages
              .map(
                (message) => `
                  <div class="chat-bubble chat-bubble-${message.role}">
                    <span>${message.role === "assistant" ? "PAM AI" : "You"}</span>
                    <p>${formatBubbleText(message.text)}</p>
                  </div>
                `
              )
              .join("")}
            ${
              isResolving
                ? `
                  <div class="chat-bubble chat-bubble-assistant chat-bubble-pending">
                    <span>PAM AI</span>
                    <p>Modeling the scenario, stress-testing the assumptions, and comparing it against your current path...</p>
                  </div>
                `
                : ""
            }
          </div>
          <form class="chat-form" data-chat-form>
            <label for="chat-input">Ask a what-if question</label>
            <textarea
              id="chat-input"
              name="prompt"
              rows="3"
              placeholder="Would investing $500 a month for 5 years be smart?"
              ${isResolving ? "disabled" : ""}
            ></textarea>
            <button class="button button-primary" type="submit" ${isResolving ? "disabled" : ""}>
              ${isResolving ? "Modeling..." : "Ask PAM AI"}
            </button>
          </form>
        </article>
        <aside class="surface-card chat-sidebar">
          <div class="card-heading">
            <div>
              <p class="eyebrow">Sample prompts</p>
              <h3>Jump straight into modeling</h3>
            </div>
          </div>
          <div class="sample-prompt-list">
            ${samplePrompts
              .map(
                (prompt) => `
                  <button class="sample-prompt" data-chat-prompt="${escapeHtml(prompt)}" ${isResolving ? "disabled" : ""}>
                    ${escapeHtml(prompt)}
                  </button>
                `
              )
              .join("")}
          </div>
          <div class="chat-sidebar-note">
            <p class="eyebrow">Latest modeled scenario</p>
            <strong>${escapeHtml(activeScenario.scenario.title)}</strong>
            <p>${escapeHtml(activeScenario.interpretationNarrative)}</p>
          </div>
        </aside>
      </div>
    </section>
  `;
}
