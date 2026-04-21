import { buildDecisionSession, buildDraftSession, buildStarterSession } from "../utils/scenarioEngine.js";

const DEFAULT_ENGINE = {
  provider: "PAM Decision Engine v3",
  mode: "Guided scenario modeling",
  remoteEnabled: false,
  remoteEndpoint: "/api/decision",
  upgradePath: "Ready for a server-side Vercel AI endpoint and Plaid-enriched context when runtime credentials are added."
};

function getEngineConfig() {
  if (typeof window === "undefined") return DEFAULT_ENGINE;
  return {
    ...DEFAULT_ENGINE,
    ...(window.__PAM_RUNTIME__?.ai || {})
  };
}

export function getDecisionEngineMeta() {
  return getEngineConfig();
}

export async function resolveDecisionPrompt({ prompt, profile, goals, catalog }) {
  const engine = getEngineConfig();
  return {
    engine,
    session: buildDecisionSession({
      prompt,
      profile,
      goals,
      catalog
    })
  };
}

export async function resolveStarterScenario({ starterId, profile, goals, catalog }) {
  const engine = getEngineConfig();
  return {
    engine,
    session: buildStarterSession(starterId, profile, goals, catalog)
  };
}

export async function resolveDraftScenario({ draft, profile, goals, catalog }) {
  const engine = getEngineConfig();
  return {
    engine,
    session: buildDraftSession(draft, profile, goals, catalog)
  };
}
