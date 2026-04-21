import { escapeHtml, formatDateLabel } from "../utils/formatters.js";

function renderOverviewCard(card) {
  return `
    <article class="trust-overview-card surface-card">
      <span class="eyebrow">${escapeHtml(card.eyebrow)}</span>
      <h3>${escapeHtml(card.title)}</h3>
      <p>${escapeHtml(card.copy)}</p>
    </article>
  `;
}

function getSecurityPosture(security) {
  if (security.twoFactorEnabled && security.loginAlertsEnabled && security.biometricLockEnabled) {
    return {
      label: "Hardened",
      detail: "2FA, alerts, and biometric unlock are all active."
    };
  }

  if (security.twoFactorEnabled) {
    return {
      label: "Protected",
      detail: "2FA is active, but at least one secondary safeguard is still off."
    };
  }

  return {
    label: "Needs attention",
    detail: "Two-factor authentication is not currently protecting new sign-ins."
  };
}

function renderToggleRow(title, copy, status, action, buttonLabel) {
  return `
    <div class="trust-toggle-row">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <p>${escapeHtml(copy)}</p>
      </div>
      <div class="trust-toggle-actions">
        <span class="trust-status-pill">${escapeHtml(status)}</span>
        <button class="button button-secondary trust-inline-button" type="button" data-security-action="${escapeHtml(action)}">
          ${escapeHtml(buttonLabel)}
        </button>
      </div>
    </div>
  `;
}

function renderPolicySection(section) {
  return `
    <section class="privacy-policy-section">
      <h3>${escapeHtml(section.title)}</h3>
      ${section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join("")}
      ${
        section.bullets?.length
          ? `
            <ul>
              ${section.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}
            </ul>
          `
          : ""
      }
    </section>
  `;
}

function renderPlaidQuickstart(plaidQuickstart) {
  return `
    <article class="surface-panel">
      <div class="card-heading">
        <div>
          <p class="eyebrow">Plaid quickstart</p>
          <h3>${escapeHtml(plaidQuickstart.title)}</h3>
        </div>
        <a class="button button-secondary trust-inline-button" href="${escapeHtml(plaidQuickstart.sourceUrl)}" target="_blank" rel="noreferrer">Open docs</a>
      </div>
      <p class="trust-lead">${escapeHtml(plaidQuickstart.summary)}</p>
      <div class="plaid-step-list">
        ${plaidQuickstart.steps
          .map(
            (step, index) => `
              <div class="plaid-step-row">
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
      <div class="trust-policy-preview">
        <h3>${escapeHtml(plaidQuickstart.sandbox.environment)} testing</h3>
        <p>${escapeHtml(plaidQuickstart.sandbox.credentialHint)}</p>
      </div>
    </article>
  `;
}

export function renderTrustCenter(trustState, privacyPolicy, trustHighlights, plaidQuickstart) {
  const posture = getSecurityPosture(trustState.security);

  return `
    <section class="panel-section">
      <div class="panel-heading">
        <div>
          <p class="eyebrow">Trust Center</p>
          <h2>Privacy and access controls that match the product ambition</h2>
        </div>
        <p>Decision modeling only earns trust if the data boundary and account controls feel equally intentional.</p>
      </div>

      <div class="trust-overview-grid">
        ${trustHighlights.map(renderOverviewCard).join("")}
      </div>
    </section>

    <section class="panel-section split-panel">
      <article class="surface-panel">
        <div class="card-heading">
          <div>
            <p class="eyebrow">Security posture</p>
            <h3>${escapeHtml(posture.label)}</h3>
          </div>
          <span class="trust-status-pill">${escapeHtml(trustState.security.twoFactorMethod)}</span>
        </div>
        <p class="trust-lead">${escapeHtml(posture.detail)}</p>
        <div class="trust-stat-grid">
          <div class="trust-stat-card">
            <span>2FA</span>
            <strong>${trustState.security.twoFactorEnabled ? "Enabled" : "Disabled"}</strong>
          </div>
          <div class="trust-stat-card">
            <span>Trusted devices</span>
            <strong>${trustState.security.trustedDevices}</strong>
          </div>
          <div class="trust-stat-card">
            <span>Recovery codes</span>
            <strong>${trustState.security.recoveryCodesRemaining}</strong>
          </div>
          <div class="trust-stat-card">
            <span>Session timeout</span>
            <strong>${trustState.security.sessionTimeoutMinutes} min</strong>
          </div>
        </div>
        <div class="trust-toggle-list">
          ${renderToggleRow(
            "Two-factor authentication",
            "Require a second step for sign-ins so financial scenario data is not guarded by a password alone.",
            trustState.security.twoFactorEnabled ? "On" : "Off",
            "toggle-2fa",
            trustState.security.twoFactorEnabled ? "Disable 2FA" : "Enable 2FA"
          )}
          ${renderToggleRow(
            "Primary sign-in method",
            "Cycle the current setup between authenticator-first and passkey-backed protection for future production auth flows.",
            trustState.security.twoFactorMethod,
            "advance-2fa-method",
            "Switch method"
          )}
          ${renderToggleRow(
            "Login alerts",
            "Send a warning when PAM AI sees a new device or elevated-risk sign-in attempt.",
            trustState.security.loginAlertsEnabled ? "On" : "Off",
            "toggle-login-alerts",
            trustState.security.loginAlertsEnabled ? "Turn alerts off" : "Turn alerts on"
          )}
          ${renderToggleRow(
            "Biometric re-entry",
            "Protect fast re-entry on trusted devices with Face ID, Touch ID, or platform biometrics when available.",
            trustState.security.biometricLockEnabled ? "On" : "Off",
            "toggle-biometric-lock",
            trustState.security.biometricLockEnabled ? "Turn biometrics off" : "Turn biometrics on"
          )}
        </div>
        <div class="button-row trust-button-row">
          <button class="button button-secondary" type="button" data-security-action="rotate-recovery-codes">Rotate recovery codes</button>
        </div>
      </article>

      <article class="surface-panel">
        <div class="card-heading">
          <div>
            <p class="eyebrow">Privacy controls</p>
            <h3>Clear data boundaries before connected finance arrives</h3>
          </div>
          <button class="button button-secondary trust-inline-button" type="button" data-open-privacy>Open policy</button>
        </div>
        <p class="trust-lead">${escapeHtml(privacyPolicy.summary)}</p>
        <div class="trust-privacy-grid">
          <div class="trust-privacy-card">
            <span>Policy version</span>
            <strong>v${escapeHtml(privacyPolicy.version)}</strong>
            <p>Effective ${escapeHtml(privacyPolicy.effectiveDate)}</p>
          </div>
          <div class="trust-privacy-card">
            <span>Last reviewed</span>
            <strong>${escapeHtml(formatDateLabel(trustState.privacy.reviewedAt))}</strong>
            <p>Stored locally for this MVP session.</p>
          </div>
          <div class="trust-privacy-card">
            <span>Data export</span>
            <strong>${trustState.privacy.dataExportAvailable ? "Available" : "Unavailable"}</strong>
            <p>Users should be able to export their normalized profile and scenario history.</p>
          </div>
          <div class="trust-privacy-card">
            <span>Plaid mode</span>
            <strong>${escapeHtml(trustState.privacy.plaidConnectionMode)}</strong>
            <p>Future bank linking is intended to ingest scoped snapshots, not raw credentials.</p>
          </div>
        </div>
        <div class="trust-policy-preview">
          <h3>What the policy promises</h3>
          <ul>
            <li>Scenario modeling uses normalized financial inputs instead of direct bank credentials.</li>
            <li>Future Plaid connectivity is intended to rely on tokenized, scoped account access.</li>
            <li>Users should be able to review, export, and delete profile data.</li>
            <li>Security metadata is used for account protection rather than product marketing.</li>
          </ul>
        </div>
        <div class="button-row trust-button-row">
          <button class="button button-primary" type="button" data-security-action="review-privacy-policy">Mark policy reviewed</button>
        </div>
      </article>
    </section>

    <section class="panel-section">
      ${renderPlaidQuickstart(plaidQuickstart)}
    </section>
  `;
}

export function renderPrivacyPolicyModal(trustState, privacyPolicy) {
  return `
    <div class="privacy-modal-backdrop" data-privacy-backdrop>
      <div class="privacy-modal surface-panel" role="dialog" aria-modal="true" aria-labelledby="privacy-policy-title">
        <div class="privacy-modal-header">
          <div>
            <p class="eyebrow">Privacy Policy</p>
            <h2 id="privacy-policy-title">PAM AI Privacy Policy</h2>
            <p>
              Version ${escapeHtml(privacyPolicy.version)} • Effective ${escapeHtml(privacyPolicy.effectiveDate)} • Last reviewed
              ${escapeHtml(formatDateLabel(trustState.privacy.reviewedAt))}
            </p>
          </div>
          <button class="button button-secondary privacy-close-button" type="button" data-close-privacy>Close</button>
        </div>
        <div class="privacy-modal-body">
          <p class="privacy-policy-summary">${escapeHtml(privacyPolicy.summary)}</p>
          ${privacyPolicy.sections.map(renderPolicySection).join("")}
        </div>
      </div>
    </div>
  `;
}
