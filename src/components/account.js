import { escapeHtml, formatCompactCurrency, formatDateLabel } from "../utils/formatters.js";

function renderLinkedAccounts(profile) {
  return profile.assets
    .slice(0, 4)
    .map(
      (asset) => `
        <div class="linked-account-row">
          <div>
            <strong>${escapeHtml(asset.label)}</strong>
            <p>${escapeHtml(asset.note || asset.bucket)}</p>
          </div>
          <span>${formatCompactCurrency(asset.value)}</span>
        </div>
      `
    )
    .join("");
}

export function renderAccount(profile, accountState, profileSource, trustState) {
  const createdLabel = accountState.createdAt ? formatDateLabel(accountState.createdAt) : "Not created yet";
  const lastSyncLabel = accountState.plaidLastSyncAt ? formatDateLabel(accountState.plaidLastSyncAt) : "Not synced yet";
  const securityStatus = trustState.security.twoFactorEnabled ? trustState.security.twoFactorMethod : "2FA off";
  const isPlaidBusy = /creating|launching|exchanging|syncing|refreshing/i.test(accountState.plaidConnectionStage || "");
  const hasStartedPlaid = !/not created/i.test(accountState.plaidConnectionStage || "") &&
    /link token|launching|exchanging|syncing|linked|refreshed/i.test(accountState.plaidConnectionStage || "");
  const accountPrimaryCopy = accountState.plaidLinked
    ? "Refresh Plaid data"
    : "Sign in with Plaid";
  const plaidSteps = [
    {
      title: "Create server link token",
      detail: "Short-lived token generated for the signed-in user.",
      complete: accountState.plaidLinked || hasStartedPlaid
    },
    {
      title: "Launch Plaid Link",
      detail: "User authenticates with Plaid instead of giving PAM raw credentials.",
      complete: accountState.plaidLinked
    },
    {
      title: "Exchange public token",
      detail: "Backend stores access token and item id outside the client.",
      complete: accountState.plaidLinked
    },
    {
      title: "Normalize snapshot into PAM",
      detail: "Balances and liabilities become scenario-ready profile data.",
      complete: accountState.plaidLinked && profileSource.kind === "plaid"
    }
  ];

  return `
    <section class="panel-section">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Account & profile</p>
          <h2>Sign in by connecting Plaid</h2>
        </div>
        <p>PAM should not depend on users typing fake numbers. The account starts with Plaid, then PAM turns the connected snapshot into decisions, goals, and risk analysis.</p>
      </div>

      <div class="account-overview-grid">
        <article class="metric-card surface-card">
          <span>Account status</span>
          <strong>${accountState.isCreated ? "Onboarded" : "Awaiting Plaid link"}</strong>
          <small>${escapeHtml(accountState.onboardingStep)}</small>
        </article>
        <article class="metric-card surface-card">
          <span>Profile source</span>
          <strong>${escapeHtml(profileSource.status)}</strong>
          <small>${escapeHtml(profileSource.label)}</small>
        </article>
        <article class="metric-card surface-card">
          <span>Security</span>
          <strong>${escapeHtml(securityStatus)}</strong>
          <small>${trustState.security.loginAlertsEnabled ? "Login alerts on" : "Login alerts off"}</small>
        </article>
        <article class="metric-card surface-card">
          <span>Plaid</span>
          <strong>${accountState.plaidLinked ? "Linked" : "Required"}</strong>
          <small>${escapeHtml(accountState.plaidConnectionStage)}</small>
        </article>
      </div>
    </section>

    <section class="panel-section split-panel account-panel-grid">
      <article class="surface-panel plaid-onboarding-panel">
        <div class="card-heading">
          <div>
            <p class="eyebrow">Required first step</p>
            <h3>${accountState.plaidLinked ? "Connected account profile" : "Create your PAM profile with Plaid"}</h3>
          </div>
          <span class="pill">${escapeHtml(accountState.plan)}</span>
        </div>
        <p class="goal-builder-copy">
          ${accountState.isCreated
            ? "Your PAM profile is powered by the latest normalized Plaid snapshot. The simulator is using connected balances and liabilities instead of manual estimates."
            : "Use Plaid Link to securely connect a financial institution. PAM receives a normalized snapshot for modeling; it never asks you to hand-type a personal balance sheet."}
        </p>
        <div class="plaid-login-visual">
          <div>
            <span>01</span>
            <strong>Plaid Link opens</strong>
            <p>Users authenticate through Plaid, not a manual PAM spreadsheet.</p>
          </div>
          <div>
            <span>02</span>
            <strong>Snapshot is normalized</strong>
            <p>Balances, liabilities, and cash-flow context become a scenario-ready profile.</p>
          </div>
          <div>
            <span>03</span>
            <strong>PAM models decisions</strong>
            <p>Every answer maps decisions to runway, goals, and long-term net worth.</p>
          </div>
        </div>
        <div class="trust-policy-preview">
          <h3>Account rule</h3>
          <p>${accountState.plaidLinked ? "Plaid is linked. The demo baseline has been replaced by a connected-account profile." : "Connect Plaid to unlock the personalized product. The demo remains available only as a limited preview."}</p>
        </div>
        <div class="button-row">
          <button class="button button-primary button-plaid" type="button" data-plaid-action="${accountState.plaidLinked ? "refresh" : "connect"}" data-plaid-complete ${isPlaidBusy ? "disabled" : ""}>${accountPrimaryCopy}</button>
          ${
            accountState.plaidLinked
              ? '<button class="button button-secondary" type="button" data-plaid-action="disconnect">Disconnect Plaid</button>'
              : '<a class="button button-secondary" href="#workspace" data-tab="scenario">View limited demo</a>'
          }
        </div>
        <div class="account-meta-note">
          <span>Created</span>
          <strong>${escapeHtml(createdLabel)}</strong>
        </div>
      </article>

      <article class="surface-panel connected-data-panel">
        <div class="card-heading">
          <div>
            <p class="eyebrow">Connected model inputs</p>
            <h3>No manual financial entry</h3>
          </div>
        </div>
        <p class="goal-builder-copy">PAM's baseline should come from connected accounts and normalized calculations. Users can still model decisions, but they should not have to build the financial profile by hand.</p>
        <div class="connected-data-grid">
          <article class="metric-card surface-card">
            <span>Liquid cash</span>
            <strong>${formatCompactCurrency(profile.assets.filter((asset) => asset.liquid).reduce((sum, asset) => sum + asset.value, 0))}</strong>
            <small>Checking, savings, and cash-like balances.</small>
          </article>
          <article class="metric-card surface-card">
            <span>Investments</span>
            <strong>${formatCompactCurrency(profile.assets.filter((asset) => asset.bucket === "invest").reduce((sum, asset) => sum + asset.value, 0))}</strong>
            <small>Brokerage and long-term asset balances.</small>
          </article>
          <article class="metric-card surface-card">
            <span>Liabilities</span>
            <strong>${formatCompactCurrency(profile.liabilities.reduce((sum, liability) => sum + liability.balance, 0))}</strong>
            <small>Debt obligations included in risk modeling.</small>
          </article>
          <article class="metric-card surface-card">
            <span>Monthly profile</span>
            <strong>${accountState.plaidLinked ? "Connected" : "Preview"}</strong>
            <small>${accountState.plaidLinked ? "Using Plaid-derived context." : "Demo numbers until Plaid is connected."}</small>
          </article>
        </div>
      </article>
    </section>

    <section class="panel-section split-panel account-panel-grid">
      <article class="surface-panel">
        <div class="card-heading">
          <div>
            <p class="eyebrow">Plaid connection</p>
            <h3>${accountState.plaidLinked ? "Linked and synced" : "Link a financial institution"}</h3>
          </div>
          <span class="trust-status-pill">${escapeHtml(profileSource.status)}</span>
        </div>
        <p class="trust-lead">${escapeHtml(profileSource.detail)}</p>
        ${accountState.plaidError ? `<p class="scenario-summary subtle">${escapeHtml(accountState.plaidError)}</p>` : ""}
        <div class="account-overview-grid plaid-sync-grid">
          <article class="metric-card surface-card">
            <span>Institution</span>
            <strong>${escapeHtml(accountState.plaidInstitution)}</strong>
            <small>${accountState.plaidLinked ? "Connected through Plaid Link flow" : "Waiting for first Link session"}</small>
          </article>
          <article class="metric-card surface-card">
            <span>Accounts synced</span>
            <strong>${accountState.plaidAccountsSynced}</strong>
            <small>Snapshot imported into the PAM profile layer</small>
          </article>
          <article class="metric-card surface-card">
            <span>Last sync</span>
            <strong>${escapeHtml(lastSyncLabel)}</strong>
            <small>${escapeHtml(accountState.plaidConnectionStage)}</small>
          </article>
        </div>
        <div class="plaid-journey-card">
          <div class="card-heading">
            <div>
              <p class="eyebrow">Quickstart path</p>
              <h3>What the account flow does now</h3>
            </div>
          </div>
          <div class="plaid-step-list">
            ${plaidSteps
              .map(
                (step, index) => `
                  <div class="plaid-step-row ${step.complete ? "complete" : ""}">
                    <span>${String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <strong>${escapeHtml(step.title)}</strong>
                      <p>${escapeHtml(step.detail)}</p>
                    </div>
                  </div>
                `
              )
              .join("")}
          </div>
        </div>
        <div class="button-row">
          <button class="button button-primary" type="button" data-plaid-action="${accountState.plaidLinked ? "refresh" : "connect"}">
            ${accountState.plaidLinked ? "Refresh linked accounts" : "Link with Plaid"}
          </button>
          ${
            accountState.plaidLinked
              ? '<button class="button button-secondary" type="button" data-plaid-action="disconnect">Disconnect Plaid</button>'
              : ""
          }
        </div>
        <div class="trust-policy-preview">
          <h3>Why this matters</h3>
          <ul>
            <li>Linked accounts should personalize the simulator without turning PAM into a budgeting ledger.</li>
            <li>The simulator keeps using normalized balances and monthly cash flow, not raw bank credentials.</li>
            <li>This creates the path for account-backed profiles, saved goals, cleaner onboarding, and faster re-modeling.</li>
          </ul>
        </div>
      </article>

      <article class="surface-panel">
        <div class="card-heading">
          <div>
            <p class="eyebrow">Profile assets</p>
            <h3>What the account layer is carrying today</h3>
          </div>
        </div>
        <div class="linked-account-list">
          ${renderLinkedAccounts(profile)}
        </div>
      </article>
    </section>
  `;
}
