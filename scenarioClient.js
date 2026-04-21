import {
  buildChatReply,
  buildFallbackChatReply,
  createScenarioFromPrompt,
  evaluateScenario,
  finalizeScenarioResult
} from "../utils/scenarioEngine.js";

const DEFAULT_ENGINE = {
  provider: "PAM Decision Engine v2",
  mode: "Enhanced local reasoning",
  remoteEnabled: false,
  remoteEndpoint: "/api/decision",
  upgradePath: "Ready for a Vercel AI endpoint when a server-side model is connected."
};

function getEngineConfig() {
  if (typeof window === "undefined") return DEFAULT_ENGINE;
  return {
    ...DEFAULT_ENGINE,
    ...(window.__PAM_RUNTIME__?.ai || {})
  };
}

async function tryRemoteDecision(prompt, profile) {
  const engine = getEngineConfig();
  if (!engine.remoteEnabled) return null;

  try {
    const response = await fetch(engine.remoteEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ prompt, profile })
    });

    if (!response.ok) return null;
    const payload = await response.json();
    if (!payload?.result) return null;

    return {
      kind: "scenario",
      result: payload.result,
      reply: payload.reply || buildChatReply(payload.result),
      engine
    };
  } catch (_error) {
    return null;
  }
}

export function getDecisionEngineMeta() {
  return getEngineConfig();
}

export async function resolveScenarioQuery({ prompt, profile, catalog }) {
  const engine = getEngineConfig();
  const remoteResolution = await tryRemoteDecision(prompt, profile);
  if (remoteResolution) return remoteResolution;

  const scenario = createScenarioFromPrompt(prompt, catalog, profile);
  if (!scenario) {
    return {
      kind: "fallback",
      reply: buildFallbackChatReply(prompt),
      engine
    };
  }

  const result = finalizeScenarioResult(evaluateScenario(profile, scenario));
  return {
    kind: "scenario",
    result,
    reply: buildChatReply(result),
    engine
  };
}
