export function renderChat(messages, samplePrompts, activeScenario) {
  return `
    <section class="panel-section" id="chat">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">AI chat</p>
          <h2>Ask PAM AI in plain English</h2>
        </div>
        <p>Conversational projections with scenario-aware tradeoff analysis.</p>
      </div>
      <div class="chat-layout">
        <article class="surface-panel chat-panel">
          <div class="chat-thread">
            ${messages
              .map(
                (message) => `
                  <div class="chat-bubble chat-bubble-${message.role}">
                    <span>${message.role === "assistant" ? "PAM AI" : "You"}</span>
                    <p>${message.text}</p>
                  </div>
                `
              )
              .join("")}
          </div>
          <form class="chat-form" data-chat-form>
            <label for="chat-input">Ask a what-if question</label>
            <textarea id="chat-input" name="prompt" rows="3" placeholder="What if I lose my job for 3 months?"></textarea>
            <button class="button button-primary" type="submit">Ask PAM AI</button>
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
                  <button class="sample-prompt" data-chat-prompt="${prompt}">
                    ${prompt}
                  </button>
                `
              )
              .join("")}
          </div>
          <div class="chat-sidebar-note">
            <p class="eyebrow">Latest modeled scenario</p>
            <strong>${activeScenario.scenario.title}</strong>
            <p>${activeScenario.shortTermNarrative}</p>
          </div>
        </aside>
      </div>
    </section>
  `;
}
