const OPENAI_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-5.2";

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

function buildInput(payload) {
  const { prompt, draft, followUp, result } = payload;
  const mostImpactedGoal = result?.mostImpactedGoal
    ? `${result.mostImpactedGoal.title}; delay=${result.mostImpactedGoal.deltaMonths}; status=${result.mostImpactedGoal.status}`
    : "none";

  return [
    {
      role: "system",
      content: [
        {
          type: "input_text",
          text:
            "You write UX guidance for PAM AI, a premium financial scenario engine. Keep tone calm, helpful, slightly authoritative, and concise. Never say you need more structure. If the prompt is vague, assume the app already made a useful first-pass model and ask only one clarifying follow-up. Avoid generic chatbot phrasing. Keep assistant headline under 90 characters and body under 220 characters."
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
            `Scenario type: ${sanitizeString(draft?.type, "unknown")}`,
            `Scenario title: ${sanitizeString(draft?.title || draft?.prompt, "Untitled scenario")}`,
            `Aha moment: ${sanitizeString(result?.ahaMoment, "No aha moment")}`,
            `Next step: ${sanitizeString(result?.nextStep, "No next step")}`,
            `Risk: ${sanitizeString(result?.risk?.label, "Unknown")} - ${sanitizeString(result?.risk?.detail, "")}`,
            `Confidence: ${sanitizeString(String(result?.confidence?.score ?? ""), "N/A")}`,
            `Monthly cash flow impact: ${sanitizeString(String(result?.monthlyCashFlowImpact ?? ""), "0")}`,
            `Savings run-out months: ${sanitizeString(String(result?.savingsRunoutMonths ?? ""), "stable")}`,
            `Most impacted goal: ${mostImpactedGoal}`,
            followUp
              ? `Existing follow-up: ${sanitizeString(followUp.prompt)} | choices=${followUp.choices.map((choice) => choice.label).join(", ")}`
              : "Existing follow-up: none"
          ].join("\n")
        }
      ]
    }
  ];
}

async function requestGuidance(payload) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error: "OPENAI_API_KEY is not configured."
    };
  }

  const response = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      input: buildInput(payload),
      text: {
        format: {
          type: "json_schema",
          ...buildSchema()
        }
      }
    })
  });

  if (!response.ok) {
    const failure = await response.text();
    return {
      ok: false,
      error: failure
    };
  }

  const data = await response.json();
  const parsed = JSON.parse(data.output_text || "{}");

  return {
    ok: true,
    engine: {
      provider: `PAM Decision Engine + ${DEFAULT_MODEL}`,
      mode: "Guided scenario modeling with server-side AI interpretation",
      remoteEnabled: true,
      remoteEndpoint: "/api/decision",
      upgradePath: "Server-side OpenAI guidance is active. Plaid account data can be layered in next."
    },
    guidance: {
      assistant: {
        headline: sanitizeString(parsed.assistant?.headline, "I can model that."),
        body: sanitizeString(parsed.assistant?.body, "The simulator already translated your question into a decision path.")
      },
      interpretationSummary: sanitizeString(
        parsed.interpretationSummary,
        "PAM translated the prompt into a structured scenario and kept the first pass usable."
      ),
      followUpPrompt: sanitizeString(parsed.followUpPrompt, ""),
      followUpChoiceLabels: Array.isArray(parsed.followUpChoiceLabels)
        ? parsed.followUpChoiceLabels.map((value) => sanitizeString(value)).filter(Boolean).slice(0, 3)
        : []
    }
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
        error: "AI guidance unavailable"
      });
    }

    return sendJson(res, 200, result);
  } catch (_error) {
    return sendJson(res, 200, {
      ok: false,
      error: "AI guidance unavailable"
    });
  }
};

