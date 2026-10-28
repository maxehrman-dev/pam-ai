import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// House style: no em dashes in anything a person reads (UI, emails, legal
// pages, AI prompt). Code comments are exempt.
const FILES = [
  "src/main.js",
  "src/config/appConfig.js",
  "src/utils/scenarioEngine.js",
  "src/utils/financeKnowledge.js",
  "src/utils/personaEngine.js",
  "src/utils/taxStrategies.js",
  "src/utils/playbook.js",
  "src/utils/compounding.js",
  "src/admin.js",
  "admin.html",
  "api/_lib/adminStats.js",
  "src/utils/monteCarlo.js",
  "src/utils/rangeChart.js",
  "api/_lib/email.js",
  "api/decision.js",
  "api/admin/send_waitlist_update.js",
  "index.html",
  "email-templates/clerk-verification-code.html",
  "PRODUCT.md"
];

test("user-facing copy contains no em dashes", () => {
  const offenders = [];
  for (const rel of FILES) {
    const text = readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8");
    text.split("\n").forEach((line, index) => {
      const trimmed = line.trim();
      if (/^(\/\/|\*|\/\*|<!--)/.test(trimmed)) return;
      if (line.includes("—")) offenders.push(`${rel}:${index + 1}`);
    });
  }
  assert.deepEqual(offenders, []);
});
