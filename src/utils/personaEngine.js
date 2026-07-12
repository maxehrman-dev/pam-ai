// Persona coefficients: fold every user dimension into one small object that
// every deterministic engine can consume. Coverage through composition — each
// dimension contributes a named adjustment; no branch-per-user-combination.
// See BRAIN.md for the strategy and the extension table.

import { clamp } from "./formatters.js";

const BASE_COEFFICIENTS = {
  bufferTargetMonths: 3,
  guiltFreeFloorPct: 10,
  taxSetAsidePct: 0,
  incomeReliability: 1
};

// Each modifier: matches(userValues) -> partial adjustments + a human-readable
// note. Notes flow into result assumptions and the AI prompt so both the user
// and the model see WHY this person's thresholds differ.
const PERSONA_MODIFIERS = [
  {
    id: "freelance",
    matches: (uv) => uv.worker_type === "freelance",
    bufferDelta: 2,
    taxSetAside: (facts) => Math.max(Number(facts.combinedTaxRate) || 0, 25),
    tag: "Self-employed",
    note: "Self-employed: no employer withholding, so a tax set-aside comes off the top and the buffer target is higher."
  },
  {
    id: "hourly",
    matches: (uv) => uv.worker_type === "hourly",
    bufferDelta: 1,
    tag: "Hourly pay",
    note: "Hourly pay: hours can shrink without warning, so the buffer target is one month higher."
  },
  {
    id: "irregular-pay",
    matches: (uv) => uv.pay_frequency === "irregular",
    bufferDelta: 1,
    incomeReliability: 0.85,
    tag: "Irregular income",
    note: "Irregular pay: PAM plans with 85% of detected income and keeps the rest in checking as a volatility cushion."
  },
  {
    id: "supports-family",
    matches: (uv) => uv.household === "support_family",
    bufferDelta: 1,
    guiltFreeFloorPct: 8,
    tag: "Supports family",
    note: "Supporting family: their needs are a fixed obligation, so the buffer target rises and the guilt-free floor tightens."
  },
  {
    id: "no-backstop",
    matches: (uv) => uv.risk_backing === "none",
    bufferDelta: 1,
    tag: "No safety net",
    note: "No safety net behind them: the buffer has to be the backstop, so its target is one month higher."
  },
  {
    id: "dependents",
    matches: (uv) => uv.risk_backing === "dependents",
    bufferDelta: 2,
    guiltFreeFloorPct: 8,
    tag: "Others depend on them",
    note: "Others rely on this income: buffer target rises two months and discretionary spending tightens."
  },
  {
    id: "family-backstop",
    matches: (uv) => uv.risk_backing === "family",
    bufferDelta: -1,
    tag: "Family backstop",
    note: "Family can absorb a worst case, so the cash buffer target can sit one month lower."
  },
  {
    id: "homeowner",
    matches: (uv) => uv.housing === "own",
    bufferDelta: 1,
    tag: "Homeowner",
    note: "Owning the home: repairs land on them, so the buffer target is one month higher."
  },
  {
    id: "between-jobs",
    matches: (uv) => uv.career_stage === "between",
    bufferDelta: 1,
    tag: "Between jobs",
    note: "In a work transition: income is uncertain, so the buffer target is one month higher."
  }
];

export function getPersonaCoefficients(userValues = {}, facts = {}) {
  const uv = userValues && typeof userValues === "object" ? userValues : {};
  const applied = PERSONA_MODIFIERS.filter((modifier) => {
    try {
      return Boolean(modifier.matches(uv));
    } catch (_error) {
      return false;
    }
  });

  let bufferTargetMonths = BASE_COEFFICIENTS.bufferTargetMonths;
  let guiltFreeFloorPct = BASE_COEFFICIENTS.guiltFreeFloorPct;
  let taxSetAsidePct = BASE_COEFFICIENTS.taxSetAsidePct;
  let incomeReliability = BASE_COEFFICIENTS.incomeReliability;

  for (const modifier of applied) {
    if (modifier.bufferDelta) bufferTargetMonths += modifier.bufferDelta;
    if (modifier.guiltFreeFloorPct) guiltFreeFloorPct = Math.min(guiltFreeFloorPct, modifier.guiltFreeFloorPct);
    if (modifier.taxSetAside) taxSetAsidePct = Math.max(taxSetAsidePct, modifier.taxSetAside(facts));
    if (modifier.incomeReliability) incomeReliability = Math.min(incomeReliability, modifier.incomeReliability);
  }

  return {
    bufferTargetMonths: clamp(Math.round(bufferTargetMonths), 2, 9),
    guiltFreeFloorPct: clamp(guiltFreeFloorPct, 0, 40),
    taxSetAsidePct: clamp(Math.round(taxSetAsidePct), 0, 40),
    incomeReliability: clamp(incomeReliability, 0.5, 1),
    tags: applied.map((modifier) => modifier.tag),
    notes: applied.map((modifier) => modifier.note)
  };
}
