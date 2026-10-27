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
async function askWithModelVerdict(modelVerdict, riskLabel) {
  process.env.ANTHROPIC_API_KEY = "test-key";
  delete process.env.CLERK_SECRET_KEY;
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(path.join(repoRoot, "api"))) delete require.cache[key];
  }
  const realFetch = global.fetch;
  let sentInput = "";
  global.fetch = async (_url, init) => {
    sentInput = String(init?.body || "");
    const reply = { verdict: modelVerdict, assistant: { headline: "Here is the call.", body: "On your numbers, here is how this plays out." }, interpretationSummary: "", followUpPrompt: "", followUpChoiceLabels: [] };
    return new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify(reply) }] }), { status: 200 });
  };
  try {
    const handler = require(path.join(repoRoot, "api/decision.js"));
    const res = mockRes();
    await handler({
      method: "POST",
      headers: { "x-forwarded-for": `198.51.100.${Math.floor(Math.random() * 200) + 1}` },
      body: { prompt: "Can I afford a new apartment?", result: { risk: { label: riskLabel } } }
    }, res);
    return { payload: JSON.parse(res.body), sentInput };
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
