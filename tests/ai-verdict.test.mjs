import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { createRequire } from "node:module";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

function mockRes() {
  const headers = {};
  return {
    statusCode: 200,
    body: "",
    hasHeader: (key) => key.toLowerCase() in headers,
    setHeader: (key, value) => { headers[key.toLowerCase()] = value; },
    end(body) { this.body = body || ""; }
  };
}

// Calls /api/decision with a stubbed model reply and returns the JSON response.
async function askWithModelVerdict(modelVerdict, riskLabel, { prompt = "Can I afford a new apartment?", headline = "Here is the call.", result = {} } = {}) {
  process.env.ANTHROPIC_API_KEY = "test-key";
  delete process.env.CLERK_SECRET_KEY;
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(path.join(repoRoot, "api"))) delete require.cache[key];
  }
  const realFetch = global.fetch;
  let sentInput = "";
  let modelCalled = false;
  global.fetch = async (_url, init) => {
    modelCalled = true;
    sentInput = String(init?.body || "");
    const reply = { verdict: modelVerdict, assistant: { headline, body: "On your numbers, here is how this plays out." }, interpretationSummary: "", followUpPrompt: "", followUpChoiceLabels: [] };
    return new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify(reply) }] }), { status: 200 });
  };
  try {
    const handler = require(path.join(repoRoot, "api/decision.js"));
    const res = mockRes();
    await handler({
      method: "POST",
      headers: { "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200) + 1}` },
      body: { prompt, result: { risk: { label: riskLabel }, ...result } }
    }, res);
    return { payload: JSON.parse(res.body), sentInput, modelCalled };
  } finally {
    global.fetch = realFetch;
    delete process.env.ANTHROPIC_API_KEY;
  }
}

test("the AI is told PAM's verdict and an agreeing answer keeps it", async () => {
  const { payload, sentInput } = await askWithModelVerdict("dont", "High");
  assert.match(sentInput, /PAM's verdict \(decided by PAM's engine/);
  assert.equal(payload.ok, true);
  assert.equal(payload.guidance.verdict, "dont");
});

test("an AI answer that argues a different verdict than the engine is dropped", async () => {
  const { payload } = await askWithModelVerdict("worth_it", "High");
  assert.equal(payload.ok, false);
});

test("off-topic and identity questions never reach the AI", async () => {
  for (const prompt of ["write me a poem about the ocean", "are you claude or chatgpt?"]) {
    const { payload, modelCalled } = await askWithModelVerdict("worth_it", "Low", { prompt });
    assert.equal(payload.ok, false);
    assert.equal(payload.offTopic, true);
    assert.equal(modelCalled, false);
  }
});

test("an AI answer that steps out of PAM's persona is dropped", async () => {
  const { payload } = await askWithModelVerdict("worth_it", "Low", { headline: "As an AI language model, I think so." });
  assert.equal(payload.ok, false);
});

test("a debt-or-invest answer is held to the engine's pick, not the yes/no verdict", async () => {
  const comparison = { headline: "Pay off your credit card first, then invest.", reason: "18.9% beats the market.", extraMonthly: 500, years: 5, options: [{ label: "Invest now", net: 100 }, { label: "Card first", net: 120, recommended: true }] };
  const { payload, sentInput } = await askWithModelVerdict("worth_it", "Medium", { prompt: "Should I pay off debt or invest?", result: { comparison } });
  assert.match(sentInput, /PAM's call on this/);
  assert.equal(payload.ok, true);
});
