const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
const { sendJson, sendMethodNotAllowed } = require("./_lib/http.js");
const { assertServiceEnabled, checkDailyUsageBudget, checkRateLimit, validatePayload } = require("./_lib/security.js");

const decisionSchema = {
  properties: {
    prompt: { type: "string", minLength: 1, maxLength: 500 },
    baseline: {
      type: "object",
      allowUnknown: true,
      properties: {
        source: { type: "string", maxLength: 40 },
        profile: {
          type: "object",
          allowUnknown: true,
          properties: {
            firstName: { type: "string", maxLength: 60 },
            name: { type: "string", maxLength: 80 },
            emailAddress: { type: "string", format: "email", maxLength: 254 },
            employmentStatus: { type: "string", maxLength: 40 },
            state: { type: "string", maxLength: 10 },
            age: { type: "number", minimum: 0, maximum: 120, allowNull: true },
            cityOrZip: { type: "string", maxLength: 80 }
          }
        },
        income: {
          type: "object",
          allowUnknown: true,
          properties: {
            grossMonthlyIncome: { type: "number", minimum: 0, maximum: 1000000, allowNull: true },
            knownTakeHomeMonthlyIncome: { type: "number", minimum: 0, maximum: 1000000, allowNull: true },
            detectedMonthlyIncome: { type: "number", minimum: 0, maximum: 1000000, allowNull: true },
            incomeStreams: {
              type: "array",
              maxItems: 10,
              items: {
                type: "object",
                allowUnknown: true,
                properties: {
                  label: { type: "string", maxLength: 80 },
                  amount: { type: "number", minimum: 0, maximum: 1000000, allowNull: true }
                }
              }
            }
          }
        },
        expenses: {
          type: "object",
          allowUnknown: true,
          properties: {
            monthlyExpenses: { type: "number", minimum: 0, maximum: 1000000, allowNull: true },
            recurringExpenses: {
              type: "array",
              maxItems: 10,
              items: {
                type: "object",
                allowUnknown: true,
                properties: {
                  name: { type: "string", maxLength: 80 },
                  amount: { type: "number", minimum: 0, maximum: 1000000, allowNull: true },
                  category: { type: "string", maxLength: 80 }
                }
              }
            }
          }
        },
        obligations: {
          type: "object",
          allowUnknown: true,
          properties: {
            monthlyDebtPayments: { type: "number", minimum: 0, maximum: 1000000, allowNull: true },
            liabilities: {
              type: "array",
              maxItems: 10,
              items: {
                type: "object",
                allowUnknown: true,
                properties: {
                  name: { type: "string", maxLength: 80 },
                  balance: { type: "number", minimum: 0, maximum: 10000000, allowNull: true },
                  minimumPayment: { type: "number", minimum: 0, maximum: 1000000, allowNull: true },
                  monthlyPayment: { type: "number", minimum: 0, maximum: 1000000, allowNull: true }
                }
              }
            }
          }
        },
        savings: {
          type: "object",
          allowUnknown: true,
          properties: {
            currentSavings: { type: "number", minimum: 0, maximum: 100000000, allowNull: true },
            savingsBalance: { type: "number", minimum: 0, maximum: 100000000, allowNull: true },
            checkingBalance: { type: "number", minimum: 0, maximum: 100000000, allowNull: true },
            emergencyFundFloor: { type: "number", minimum: 0, maximum: 100000000, allowNull: true },
            connectedAccounts: { type: "array", maxItems: 25, items: { type: "object", allowUnknown: true, properties: {} } }
          }
        },
        tax: {
          type: "object",
          allowUnknown: true,
          properties: {
            estimatedIncomeTaxRate: { type: "number", minimum: 0, maximum: 100, allowNull: true },
            payrollTaxRate: { type: "number", minimum: 0, maximum: 100, allowNull: true },
            combinedTaxRate: { type: "number", minimum: 0, maximum: 100, allowNull: true },
            annualDeductions: { type: "number", minimum: 0, maximum: 1000000, allowNull: true },
            retirementContributionMonthly: { type: "number", minimum: 0, maximum: 1000000, allowNull: true }
          }
        },
        goals: {
          type: "object",
          allowUnknown: true,
          properties: {
            primaryGoal: { type: "string", maxLength: 80 },
            customGoalLabel: { type: "string", maxLength: 120 },
            goalTargetAmount: { type: "number", minimum: 0, maximum: 100000000, allowNull: true },
            goalTimelineMonths: { type: "number", minimum: 0, maximum: 1200, allowNull: true }
          }
        }
      }
    },
    draft: { type: "object", properties: {}, allowUnknown: true },
    followUp: { type: "object", properties: {}, allowUnknown: true },
    result: {
      type: "object",
      allowUnknown: true,
      properties: {
        ahaMoment: { type: "string", maxLength: 240 },
        nextStep: { type: "string", maxLength: 240 },
        confidence: { type: "string", maxLength: 40 },
        monthlyCashFlowImpact: { type: "number", minimum: -1000000, maximum: 1000000, allowNull: true },
        savingsRunoutMonths: { type: "number", minimum: 0, maximum: 1200, allowNull: true },
        explanation: { type: "string", maxLength: 400 },
        currentBuffer: { type: "number", minimum: -1000000, maximum: 1000000, allowNull: true },
        newBuffer: { type: "number", minimum: -1000000, maximum: 1000000, allowNull: true },
        projectedSavings12: { type: "number", minimum: -100000000, maximum: 100000000, allowNull: true },
        goalDelay: { type: "number", minimum: 0, maximum: 1200, allowNull: true },
        decision: {
          type: "object",
          allowUnknown: true,
          properties: {
            type: { type: "string", maxLength: 80 },
            monthlyImpact: { type: "number", minimum: -1000000, maximum: 1000000, allowNull: true },
            oneTimeImpact: { type: "number", minimum: -100000000, maximum: 100000000, allowNull: true },
            taxImpact: { type: "string", maxLength: 180 }
          }
        },
        risk: {
          type: "object",
          allowUnknown: true,
          properties: {
            label: { type: "string", maxLength: 30 }
          }
        }
      }
    }
  },
  required: ["prompt"]
};

function sanitizeString(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
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

  const system =
    "You write UX guidance for PAM AI, a premium financial decision engine for young adults. Keep tone calm, helpful, slightly authoritative, and concise. Never say you need more structure. Use the connected baseline details and the deterministic math result to explain the real tradeoff. If the prompt is vague, still move forward with a useful first pass and ask only one clarifying follow-up. Avoid generic chatbot phrasing. Keep assistant headline under 90 characters and body under 260 characters."
    + " Treat taxes as educational estimates, not tax advice. Be aware of W-2 vs 1099/self-employment differences, payroll tax, estimated tax set-asides, state tax, retirement contributions, and potentially deductible ordinary/necessary business expenses, but do not claim to know every tax code or guarantee eligibility. If a deduction or tax outcome depends on facts PAM does not have, say what assumption is being used and recommend verification with a qualified tax professional."
    + " The deterministic engine already computed the math — never invent or change numbers, only interpret them."
    + ' Respond with ONLY a JSON object, no markdown, no prose around it, matching exactly: {"assistant":{"headline":string,"body":string},"interpretationSummary":string,"followUpPrompt":string,"followUpChoiceLabels":string[]}. followUpChoiceLabels has at most 3 short items.';

  const userText = [
            `User prompt: ${sanitizeString(prompt, "No prompt provided")}`,
            `Baseline source: ${sanitizeString(baseline?.source, "unknown")}`,
            `Employment status: ${sanitizeString(baseline?.profile?.employmentStatus, "unknown")}`,
            `State: ${sanitizeString(baseline?.profile?.state, "OTHER")}`,
            `City or ZIP context: ${sanitizeString(baseline?.profile?.cityOrZip, "unknown")}`,
            `Monthly income used: ${sanitizeString(String(baseline?.income?.knownTakeHomeMonthlyIncome ?? baseline?.income?.detectedMonthlyIncome ?? baseline?.income?.grossMonthlyIncome ?? ""), "unknown")}`,
            `Monthly expenses: ${sanitizeString(String(baseline?.expenses?.monthlyExpenses ?? ""), "unknown")}`,
            `Monthly obligations: ${sanitizeString(String(baseline?.obligations?.monthlyDebtPayments ?? ""), "unknown")}`,
            `Current savings: ${sanitizeString(String(baseline?.savings?.currentSavings ?? baseline?.savings?.savingsBalance ?? ""), "unknown")}`,
            `Estimated income tax rate: ${sanitizeString(String(baseline?.tax?.estimatedIncomeTaxRate ?? ""), "unknown")}`,
            `Payroll/self-employment tax estimate: ${sanitizeString(String(baseline?.tax?.payrollTaxRate ?? ""), "unknown")}`,
            `Combined tax/payroll estimate: ${sanitizeString(String(baseline?.tax?.combinedTaxRate ?? ""), "unknown")}`,
            `Annual deductions estimate: ${sanitizeString(String(baseline?.tax?.annualDeductions ?? ""), "unknown")}`,
            `Retirement contribution monthly: ${sanitizeString(String(baseline?.tax?.retirementContributionMonthly ?? ""), "unknown")}`,
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
          ].join("\n");

  return { system, userText };
}

async function callClaude({ apiKey, model, system, userText }) {
  return fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      max_tokens: 700,
      system,
      messages: [{ role: "user", content: userText }]
    })
  });
}

async function requestGuidance(payload) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      error: "ANTHROPIC_API_KEY is not configured."
    };
  }

  const { system, userText } = buildInput(payload);
  const model = DEFAULT_MODEL;

  let response;
  try {
    response = await callClaude({ apiKey, model, system, userText });
  } catch (error) {
    return { ok: false, error: String(error?.message || "Anthropic request failed.") };
  }

  const rawBody = await response.text();
  let data;
  try {
    data = JSON.parse(rawBody);
  } catch (_error) {
    return { ok: false, error: "Anthropic returned a non-JSON response." };
  }

  if (!response.ok) {
    return { ok: false, error: data?.error?.message || JSON.stringify(data) };
  }

  const rawText = Array.isArray(data.content)
    ? data.content.map((block) => block?.text || "").join("")
    : "";
  const parsed = parseGuidanceJson(rawText);
  if (!parsed) {
    return { ok: false, error: "Model response could not be parsed as JSON." };
  }

  return {
    ok: true,
    engine: {
      provider: `PAM Decision Engine + ${model}`,
      mode: "Deterministic math plus server-side AI interpretation",
      remoteEnabled: true,
      remoteEndpoint: "/api/decision",
      upgradePath: "Server-side Claude guidance is active and can use connected Sandbox baseline data."
    },
    guidance: normalizeGuidance(parsed)
  };
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return sendMethodNotAllowed(res);
  }

  try {
    const payload = validatePayload(req.body, decisionSchema, "request body");
    if (
      !assertServiceEnabled(res, {
        serviceName: "AI guidance",
        envKeys: ["PAM_DISABLE_AI", "DISABLE_AI"]
      })
    ) {
      return;
    }

    if (
      !checkRateLimit(req, res, {
        routeKey: "decision",
        userKey:
          payload.baseline?.profile?.emailAddress ||
          payload.baseline?.profile?.firstName ||
          payload.prompt,
        ipLimit: { windowMs: 60 * 1000, max: 12 },
        userLimit: { windowMs: 60 * 1000, max: 6 }
      })
    ) {
      return;
    }

    if (
      !checkDailyUsageBudget(req, res, {
        routeKey: "decision",
        userKey:
          payload.baseline?.profile?.emailAddress ||
          payload.baseline?.profile?.firstName ||
          payload.prompt,
        ipDailyLimit: 80,
        userDailyLimit: 30,
        envLimitKey: "PAM_AI"
      })
    ) {
      return;
    }

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
