import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

import { PARTNER_KINDS, PARTNER_STAGES, getPartnerKindByStage, glossaryAnchor, renderGlossaryPage, renderHelpPage, renderPartnerPage } from "../src/infoPages.js";

const require = createRequire(import.meta.url);
const { buildAdminStats } = require("../api/_lib/adminStats.js");
const chrome = { disclaimer: "", footer: "", cookie: "", modal: "" };

test("every partner page renders with a form button for its own program", () => {
  for (const key of Object.keys(PARTNER_KINDS)) {
    const html = renderPartnerPage(key, chrome);
    assert.match(html, new RegExp(`data-waitlist-stage="${PARTNER_KINDS[key].stage.replace(/[()]/g, "\\$&")}"`));
    assert.equal(getPartnerKindByStage(PARTNER_KINDS[key].stage), PARTNER_KINDS[key]);
  }
});

test("each partner page is routed on Vercel", () => {
  const sources = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8")).rewrites.map((rule) => rule.source);
  for (const path of [...Object.values(PARTNER_KINDS).map((kind) => kind.path), "/help", "/glossary", "/faq"]) {
    assert.ok(sources.includes(path), path);
  }
});

test("admin counts every partner program, and keeps partners out of the people stats", () => {
  const waitlist = [
    ...PARTNER_STAGES.map((stage, index) => ({ stage, goal: `org ${index}`, created_at: "2026-10-20T00:00:00Z" })),
    { stage: "Student", goal: "move out", age: 22, created_at: "2026-10-21T00:00:00Z" }
  ];
  const stats = buildAdminStats({ waitlist, events: [], runs: [], feedback: [], accountCount: 0 });
  assert.equal(stats.totals.partnerRequests, PARTNER_STAGES.length);
  assert.equal(stats.totals.waitlist, 1);
  assert.deepEqual(new Set(stats.partnerRequests.map((row) => row.program)), new Set(["Schools & employers", "Creators", "Advisors"]));
});

test("help and glossary render searchable entries with stable anchors", () => {
  assert.ok((renderHelpPage(chrome).match(/data-search-text=/g) || []).length >= 15);
  const glossary = renderGlossaryPage(chrome);
  assert.match(glossary, /id="apr"/);
  assert.equal(glossaryAnchor("Roth vs Traditional"), "roth-vs-traditional");
});
