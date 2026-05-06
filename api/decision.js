const OPENAI_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Length", Buffer.byteLength(body));
  res.end(body);
}

function sanitizeString(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function buildSchema() {
  return {
    name: "pam_decision_guidance",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        assistant: {
          type: "object",
          additionalProperties: false,
          properties: {
            headline: { type: "string" },
            body: { type: "string" }
          },
          required: ["headline", "body"]
        },
        interpretationSummary: { type: "string" },
        followUpPrompt: { type: "string" },
        followUpChoiceLabels: {
          type: "array",
          items: { type: "string" },
          maxItems: 3
        }
      },
      required: ["assistant", "interpretationSummary", "followUpPrompt", "followUpChoiceLabels"]
    }
  };
}

function parseGuidanceJson(rawText) {
  try {
    return JSON.parse(rawText);
  } catch (_error) {
    const match = String(rawText || "").match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (_errorTwo) {
      return null;
    }
  }
}

function normalizeGuidance(parsed) {
  return {
    assistant: {
      headline: sanitizeString(parsed?.assistant?.headline, "I can model that."),
      body: sanitizeString(parsed?.assistant?.body, "PAM translated your question into a usable financial decision path.")
    },
    interpretationSummary: sanitizeString(
      parsed?.interpretationSummary,
      "PAM translated the prompt into a structured scenario and kept the first pass usable."
    ),
    followUpPrompt: sanitizeString(parsed?.followUpPrompt, ""),
    followUpChoiceLabels: Array.isArray(parsed?.followUpChoiceLabels)
      ? parsed.followUpChoiceLabels.map((value) => sanitizeString(value)).filter(Boolean).slice(0, 3)
      : []
  };
}

function buildInput(payload) {
  const { prompt, baseline, result } = payload;
  const recurringExpenses = Array.isArray(baseline?.expenses?.recurringExpenses)
    ? baseline.expenses.recurringExpenses
        .slice()
        .sort((left, right) => Number(right.amount || 0) - Number(left.amount || 0))
        .slice(0, 4)
        .map((item) => `${item.name}: ${item.amount}/mo`)
        .join(", ")
    : "none";
  const liabilities = Array.isArray(baseline?.obligations?.liabilities)
    ? baseline.obligations.liabilities
        .slice(0, 4)
        .map((item) => `${item.name}: balance ${item.balance}, payment ${item.minimumPayment || item.monthlyPayment || 0}`)
        .join(", ")
    : "none";

  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text:
            "You write UX guidance for PAM AI, a premium financial decision engine for young adults. Keep tone calm, helpful, slightly authoritative, and concise. Never say you need more structure. Use the connected baseline details and the deterministic math result to explain the real tradeoff. If the prompt is vague, still move forward with a useful first pass and ask only one clarifying follow-up. Avoid generic chatbot phrasing. Keep assistant headline under 90 characters and body under 260 characters."
        }
      ]
    },
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: [
            `User prompt: ${sanitizeString(prompt, "No prompt provided")}`,
            `Baseline source: ${sanitizeString(baseline?.source, "unknown")}`,
            `Employment status: ${sanitizeString(baseline?.profile?.employmentStatus, "unknown")}`,
            `State: ${sanitizeString(baseline?.profile?.state, "OTHER")}`,
            `Monthly income used: ${sanitizeString(String(baseline?.income?.knownTakeHomeMonthlyIncome ?? baseline?.income?.detectedMonthlyIncome ?? baseline?.income?.grossMonthlyIncome ?? ""), "unknown")}`,
            `Monthly expenses: ${sanitizeString(String(baseline?.expenses?.monthlyExpenses ?? ""), "unknown")}`,
            `Monthly obligations: ${sanitizeString(String(baseline?.obligations?.monthlyDebtPayments ?? ""), "unknown")}`,
            `Current savings: ${sanitizeString(String(baseline?.savings?.currentSavings ?? baseline?.savings?.savingsBalance ?? ""), "unknown")}`,
            `Goal: ${sanitizeString(baseline?.goals?.customGoalLabel || baseline?.goals?.primaryGoal, "unknown")}`,
            `Goal target amount: ${sanitizeString(String(baseline?.goals?.goalTargetAmount ?? ""), "unknown")}`,
            `Goal timeline months: ${sanitizeString(String(baseline?.goals?.goalTimelineMonths ?? ""), "unknown")}`,
            `Recurring expenses seen in connected data: ${recurringExpenses}`,
            `Liabilities seen in connected data: ${liabilities}`,
            `Decision type: ${sanitizeString(result?.decision?.type, "unknown")}`,
            `Monthly impact: ${sanitizeString(String(result?.decision?.monthlyImpact ?? ""), "0")}`,
            `One-time impact: ${sanitizeString(String(result?.decision?.oneTimeImpact ?? ""), "0")}`,
            `New monthly buffer: ${sanitizeString(String(result?.newBuffer ?? ""), "unknown")}`,
            `Old monthly buffer: ${sanitizeString(String(result?.currentBuffer ?? ""), "unknown")}`,
            `Projected savings in 12 months: ${sanitizeString(String(result?.projectedSavings12 ?? ""), "unknown")}`,
            `Goal delay months: ${sanitizeString(String(result?.goalDelay ?? ""), "0")}`,
            `Risk: ${sanitizeString(result?.risk?.label, "Unknown")}`,
            `Tax impact summary: ${sanitizeString(result?.decision?.taxImpact, "No direct change")}`,
            `Local explanation: ${sanitizeString(result?.explanation, "No local explanation")}`
          ].join("\n")
        }
      ]
    }
  ];
}

function getModelCandidates() {
  return [...new Set([DEFAULT_MODEL, "gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini"].filter(Boolean))];
}

async function callResponsesApi({ apiKey, model, input, schemaMode }) {
  const body = {
    model,
    input
  };

  if (schemaMode) {
    body.text = {
      format: {
        type: "json_schema",
        ...buildSchema()
      }
    };
  }

  return fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

async function readOpenAiPayload(response) {
  const rawText = await response.text();
  try {
    return {
      ok: true,
      json: JSON.parse(rawText)
    };
  } catch (_error) {
    return {
      ok: false,
      rawText
    };
  }
}

async function requestGuidance(payload) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error: "OPENAI_API_KEY is not configured."
    };
  }

  const input = buildInput(payload);
  let lastError = "AI guidance unavailable.";

  for (const model of getModelCandidates()) {
    for (const schemaMode of [true, false]) {
      const response = await callResponsesApi({ apiKey, model, input, schemaMode });
      const payload = await readOpenAiPayload(response);
      if (!response.ok) {
        lastError = payload.ok
          ? JSON.stringify(payload.json)
          : String(payload.rawText || "OpenAI request failed.");
        continue;
      }

      if (!payload.ok) {
        lastError = String(payload.rawText || "OpenAI returned a non-JSON response.");
        continue;
      }

      const data = payload.json;
      const rawText = data.output_text || "";
      const parsed = parseGuidanceJson(rawText);
      if (!parsed) {
        lastError = "Model response could not be parsed as JSON.";
        continue;
      }

      return {
        ok: true,
        engine: {
          provider: `PAM Decision Engine + ${model}`,
          mode: "Deterministic math plus server-side AI interpretation",
          remoteEnabled: true,
          remoteEndpoint: "/api/decision",
          upgradePath: "Server-side OpenAI guidance is active and can use connected Sandbox baseline data."
        },
        guidance: normalizeGuidance(parsed)
      };
    }
  }

  return {
    ok: false,
    error: lastError
  };
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return sendJson(res, 405, { ok: false, error: "Method not allowed" });
  }

  try {
    const payload = typeof req.body === "object" && req.body ? req.body : {};
    const result = await requestGuidance(payload);
    if (!result.ok) {
      return sendJson(res, 200, {
        ok: false,
        error: "AI guidance unavailable",
        detail: result.error || null
      });
    }

    return sendJson(res, 200, result);
  } catch (error) {
    return sendJson(res, 200, {
      ok: false,
      error: "AI guidance unavailable",
      detail: error?.message || null
    });
  }
};
