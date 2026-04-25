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
    ? accountState.isCreated
      ? "Save profile"
      : "Complete account"
    : "Create account with Plaid";
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
          <h2>Connect financial data before you finish onboarding</h2>
        </div>
        <p>PAM can preview decisions with seeded data, but account creation should only complete after a Plaid connection is linked and normalized.</p>
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
      <article class="surface-panel">
        <div class="card-heading">
          <div>
          <p class="eyebrow">Account onboarding</p>
            <h3>${accountState.isCreated ? "Profile details" : "Create an account with Plaid"}</h3>
          </div>
          <span class="pill">${escapeHtml(accountState.plan)}</span>
        </div>
        <p class="goal-builder-copy">
          ${accountState.isCreated
            ? "Your profile is linked and ready for refinement. You can continue adjusting the profile and security posture from here."
            : "Enter a basic profile, then PAM opens Plaid Link and imports the connected account snapshot into the simulator."}
        </p>
        <form class="goal-form" data-account-form>
          <label class="builder-field">
            <span>Full name</span>
            <input type="text" name="name" value="${escapeHtml(profile.user.name)}" placeholder="Taylor Morgan" required />
          </label>
          <label class="builder-field">
            <span>Email</span>
            <input type="email" name="email" value="${escapeHtml(accountState.email)}" placeholder="you@pamai.app" required />
          </label>
          <label class="builder-field">
            <span>City</span>
            <input type="text" name="city" value="${escapeHtml(profile.user.city)}" placeholder="Austin, TX" />
          </label>
          <label class="builder-field builder-field-full">
            <span>Primary goal</span>
            <input
              type="text"
              name="objective"
              value="${escapeHtml(profile.user.objective)}"
              placeholder="Keep enough optionality to move, invest, and absorb shocks."
            />
          </label>
          <div class="trust-policy-preview">
            <h3>Onboarding rule</h3>
            <p>${accountState.plaidLinked ? "Plaid is linked. Saving this profile makes the account pitch-ready." : "Account creation starts with Plaid so the simulator can use real connected balances."}</p>
          </div>
          <div class="button-row">
            <button class="button button-primary" type="submit" ${isPlaidBusy ? "disabled" : ""}>${accountPrimaryCopy}</button>
            ${
              accountState.plaidLinked
                ? '<button class="button button-secondary" type="button" data-plaid-action="refresh">Refresh Plaid snapshot</button>'
                : '<button class="button button-secondary" type="button" data-plaid-action="connect">Link Plaid only</button>'
            }
          </div>
        </form>
        <div class="account-meta-note">
          <span>Created</span>
          <strong>${escapeHtml(createdLabel)}</strong>
        </div>
      </article>

      <article class="surface-panel">
        <div class="card-heading">
          <div>
            <p class="eyebrow">Personalize profile</p>
            <h3>Customize the numbers PAM uses</h3>
          </div>
        </div>
        <p class="goal-builder-copy">This is the account-level baseline that feeds every scenario, goal, and insight.</p>
        <form class="goal-form" data-profile-form>
          <label class="builder-field">
            <span>Monthly take-home pay</span>
            <input type="number" name="salaryIncome" min="0" step="100" value="${Number(profile.monthly.income[0]?.amount || 0)}" />
          </label>
          <label class="builder-field">
            <span>Other monthly income</span>
            <input type="number" name="sideIncome" min="0" step="50" value="${Number(profile.monthly.income[1]?.amount || 0)}" />
          </label>
          <label class="builder-field">
            <span>Rent / housing</span>
            <input type="number" name="rentAmount" min="0" step="50" value="${Number(profile.monthly.fixed[0]?.amount || 0)}" />
          </label>
          <label class="builder-field">
            <span>Lifestyle spend</span>
            <input type="number" name="lifestyleSpend" min="0" step="50" value="${Number(profile.monthly.variable[2]?.amount || 0)}" />
          </label>
          <label class="builder-field">
            <span>Liquid cash</span>
            <input type="number" name="liquidCash" min="0" step="100" value="${Number(profile.assets.find((asset) => asset.liquid)?.value || 0)}" />
          </label>
          <label class="builder-field">
            <span>Investments balance</span>
            <input type="number" name="investmentsBalance" min="0" step="100" value="${Number(profile.assets.find((asset) => asset.bucket === "invest")?.value || 0)}" />
          </label>
          <div class="button-row">
            <button class="button button-secondary" type="submit">Save profile baseline</button>
          </div>
        </form>
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
