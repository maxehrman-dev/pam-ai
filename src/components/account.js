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
  const securityStatus = trustState.security.twoFactorEnabled ? trustState.security.twoFactorMethod : "2FA off";

  return `
    <section class="panel-section">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Account & profile</p>
          <h2>Set up the account layer behind the simulator</h2>
        </div>
        <p>Create an account, personalize the baseline, and decide when to replace demo data with a connected snapshot.</p>
      </div>

      <div class="account-overview-grid">
        <article class="metric-card surface-card">
          <span>Account status</span>
          <strong>${accountState.isCreated ? "Created" : "Demo mode"}</strong>
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
          <strong>${accountState.plaidLinked ? "Linked" : "Ready"}</strong>
          <small>${escapeHtml(accountState.plaidInstitution)}</small>
        </article>
      </div>
    </section>

    <section class="panel-section split-panel account-panel-grid">
      <article class="surface-panel">
        <div class="card-heading">
          <div>
            <p class="eyebrow">Create account</p>
            <h3>${accountState.isCreated ? "Account details" : "Turn the demo into a real profile"}</h3>
          </div>
          <span class="pill">${escapeHtml(accountState.plan)}</span>
        </div>
        <p class="goal-builder-copy">
          ${accountState.isCreated
            ? "Your account exists locally in this MVP. You can keep refining the profile and security posture before full production auth is added."
            : "This creates the account shell the web version will need for saved scenarios, linked profiles, and user-specific goals."}
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
          <label class="builder-field">
            <span>Password placeholder</span>
            <input type="password" name="password" value="demo-password" />
            <small>Visual scaffolding for production auth. Credentials are not persisted in this MVP.</small>
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
          <div class="button-row">
            <button class="button button-primary" type="submit">${accountState.isCreated ? "Save account" : "Create account"}</button>
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
            <p class="eyebrow">Plaid path</p>
            <h3>${accountState.plaidLinked ? "Sandbox linked" : "Connect Plaid sandbox"}</h3>
          </div>
          <span class="trust-status-pill">${escapeHtml(profileSource.status)}</span>
        </div>
        <p class="trust-lead">${escapeHtml(profileSource.detail)}</p>
        <div class="button-row">
          <button class="button button-primary" type="button" data-plaid-action="${accountState.plaidLinked ? "refresh" : "connect"}">
            ${accountState.plaidLinked ? "Refresh sandbox snapshot" : "Connect Plaid sandbox"}
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
            <li>This creates the path for account-backed profiles, saved goals, and cleaner onboarding.</li>
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
