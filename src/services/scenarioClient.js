
import { buildDecisionSession, buildDraftSession, buildStarterSession } from "../utils/scenarioEngine.js";

const DEFAULT_ENGINE = {
  provider: "PAM Decision Engine v4",
  mode: "Guided scenario modeling with AI interpretation",
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

async function fetchRemoteDecision(payload, engine) {
  if (typeof window === "undefined") return null;

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 4500);

  try {
    const response = await fetch(engine.remoteEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!response.ok) return null;

    const json = await response.json();
    return json?.ok ? json : null;
  } catch (_error) {
    return null;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function mergeRemoteGuidance(session, remote) {
  if (!remote?.guidance) return session;

  const nextSession = {
    ...session,
    assistant: {
      ...session.assistant,
      ...(remote.guidance.assistant || {})
    },
    interpretation: {
      ...session.interpretation,
      summary: remote.guidance.interpretationSummary || session.interpretation.summary
    }
  };

  if (session.followUp && remote.guidance.followUpPrompt) {
    nextSession.followUp = {
      ...session.followUp,
      prompt: remote.guidance.followUpPrompt,
      choices: session.followUp.choices.map((choice, index) => ({
        ...choice,
        label: remote.guidance.followUpChoiceLabels?.[index] || choice.label
      }))
    };
  }

  return nextSession;
}

export async function resolveDecisionPrompt({ prompt, profile, goals, catalog }) {
  const engine = getEngineConfig();
  const localSession = buildDecisionSession({
    prompt,
    profile,
    goals,
    catalog
  });
  const remote = await fetchRemoteDecision(
    {
      prompt,
      draft: localSession.draft,
      followUp: localSession.followUp,
      result: {
        ahaMoment: localSession.result.ahaMoment,
        nextStep: localSession.result.nextStep,
        risk: localSession.result.risk,
        confidence: localSession.result.confidence,
        monthlyCashFlowImpact: localSession.result.monthlyCashFlowImpact,
        savingsRunoutMonths: localSession.result.savingsRunoutMonths,
        mostImpactedGoal: localSession.result.goalsSummary.mostImpactedGoal
          ? {
              title: localSession.result.goalsSummary.mostImpactedGoal.title,
              deltaMonths: localSession.result.goalsSummary.mostImpactedGoal.deltaMonths,
              status: localSession.result.goalsSummary.mostImpactedGoal.status
            }
          : null
      }
    },
    engine
  );

  return {
    engine: remote?.engine ? { ...engine, ...remote.engine } : engine,
    session: mergeRemoteGuidance(localSession, remote)
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
