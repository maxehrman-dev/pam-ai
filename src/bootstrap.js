const app = document.querySelector("#app");

function renderBootError(error) {
  if (!app) return;

  const detail =
    error instanceof Error && error.message
      ? error.message
      : "The app failed to load because one of its startup modules did not finish booting.";

  app.innerHTML = `
    <div class="page-shell">
      <main class="workspace-section">
        <div class="workspace-heading">
          <div>
            <p class="eyebrow">PAM AI</p>
            <h2>The simulator hit a startup issue.</h2>
          </div>
          <p>PAM AI could not finish loading the decision engine. Refresh the page or redeploy the latest build.</p>
        </div>

        <section class="surface-panel" aria-live="polite">
          <div class="card-heading">
            <div>
              <p class="eyebrow">Boot status</p>
              <h3>Startup diagnostic</h3>
            </div>
          </div>
          <p class="scenario-summary">
            This usually means a missing module, a production-only runtime error, or a broken data dependency during
            first render.
          </p>
          <p class="scenario-summary subtle">${detail}</p>
          <div class="button-row">
            <button class="button button-primary" type="button" data-refresh-app>Refresh page</button>
          </div>
        </section>
      </main>
    </div>
  `;
}

async function loadConfig() {
  try {
    const res = await fetch("/api/integrations/status");
    if (!res.ok) return {};
    const data = await res.json();
    return data.clientConfig || {};
  } catch (_error) {
    return {};
  }
}

function getClerkFrontendApi(publishableKey) {
  // Publishable key format: pk_test_<base64(frontendApi + "$")>
  try {
    const encoded = publishableKey.replace(/^pk_(test|live)_/, "");
    const decoded = atob(encoded);
    return decoded.replace(/\$$/, "");
  } catch (_error) {
    return "";
  }
}

async function initClerk(publishableKey) {
  if (!publishableKey || typeof window === "undefined") return;
  const frontendApi = getClerkFrontendApi(publishableKey);
  if (!frontendApi) return;
  // Mark Clerk as the auth provider immediately so the app never falls back
  // to the removed legacy sign-in form, even while clerk.js is still loading.
  window.__pamClerkConfigured = true;
  try {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://${frontendApi}/npm/@clerk/clerk-js@5/dist/clerk.browser.js`;
      script.async = true;
      script.crossOrigin = "anonymous";
      script.setAttribute("data-clerk-publishable-key", publishableKey);
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    const prefersDark =
      document.documentElement.getAttribute("data-theme") === "dark" ||
      (document.documentElement.getAttribute("data-theme") !== "light" &&
        window.matchMedia &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);

    await window.Clerk?.load?.({
      appearance: {
        variables: {
          colorPrimary: "#1e8a66",
          colorText: prefersDark ? "#e9edf0" : "#143729",
          colorTextSecondary: prefersDark ? "#97a3ab" : "#45584c",
          colorBackground: prefersDark ? "#181d24" : "#fffdf9",
          colorInputBackground: prefersDark ? "#0d1117" : "#ffffff",
          colorInputText: prefersDark ? "#e9edf0" : "#143729",
          borderRadius: "14px",
          fontFamily: '"Avenir Next", "Helvetica Neue", "Segoe UI", sans-serif'
        },
        elements: {
          card: { boxShadow: "0 24px 70px rgba(15, 41, 31, 0.18)" },
          formButtonPrimary: {
            fontWeight: "800",
            textTransform: "none",
            fontSize: "0.95rem"
          },
          headerTitle: { fontWeight: "800" },
          logoBox: { height: "34px" }
        }
      }
    });
    window.__pamClerkReady = true;

    window.Clerk.addListener(({ user, session }) => {
      window.__pamClerkUser = user || null;
      window.__pamClerkSession = session || null;
      window.dispatchEvent(new CustomEvent("pam:clerk:change", { detail: { user, session } }));
    });
  } catch (_error) {
    // Clerk must never interrupt the app.
  }
}

function initPostHog(key, host) {
  if (!key || typeof window === "undefined") return;
  try {
    !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+" (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

    window.posthog.init(key, {
      api_host: host,
      person_profiles: "identified_only",
      capture_pageview: true,
      capture_pageleave: true,
      opt_out_capturing_by_default: true,
      loaded: (ph) => {
        if (window.__pamCookieConsent === "accepted") {
          ph.opt_in_capturing();
        }
      }
    });
  } catch (_error) {
    // PostHog must never interrupt the app.
  }
}

function initSentry(dsn) {
  if (!dsn || typeof window === "undefined") return;
  try {
    const script = document.createElement("script");
    script.src = "https://browser.sentry-cdn.com/8.28.0/bundle.min.js";
    script.crossOrigin = "anonymous";
    script.onload = () => {
      if (!window.Sentry) return;
      window.Sentry.init({
        dsn,
        environment: window.location.hostname === "pamadvisor.com" ? "production" : "development",
        release: "pam-ai@1.0.0",
        tracesSampleRate: 0.2,
        ignoreErrors: [
          "ResizeObserver loop limit exceeded",
          "Non-Error promise rejection captured"
        ],
        beforeSend(event) {
          // Strip any financial data from error payloads before sending to Sentry
          if (event.extra) delete event.extra;
          if (event.contexts?.state) delete event.contexts.state;
          return event;
        }
      });
      window.__pamSentryReady = true;
    };
    document.head.appendChild(script);
  } catch (_error) {
    // Sentry must never interrupt the app.
  }
}

async function boot() {
  if (!app) return;

  try {
    const config = await loadConfig();

    initPostHog(config.posthogKey, config.posthogHost);
    initSentry(config.sentryDsn);
    // Paywall enforcement flag (server env PAM_REQUIRE_SUBSCRIPTION) — read by main.js.
    window.__pamRequireSubscription = Boolean(config.requireSubscription);
    window.__pamFoundingClaimed = Number(config.foundingClaimed || 0);
    await initClerk(config.clerkPublishableKey);

    const module = await import("./main.js?v=pam-ai-20260709-deepdive1");
    if (typeof module.startApp !== "function") {
      throw new Error("Missing startApp export in src/main.js.");
    }
    await module.startApp();
  } catch (error) {
    console.error("PAM AI failed to boot.", error);
    if (window.__pamSentryReady && window.Sentry) {
      window.Sentry.captureException(error);
    }
    renderBootError(error);
  }
}

document.addEventListener("click", (event) => {
  if (event.target.closest("[data-refresh-app]")) {
    window.location.reload();
  }
});

boot();
