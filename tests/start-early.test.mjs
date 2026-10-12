import test from "node:test";
import assert from "node:assert/strict";

import { computeStartEarly, normalizeStartEarlyInputs } from "../src/utils/startEarly.js";
import { futureValueOfMonthly } from "../src/utils/compounding.js";

test("defaults and clamping keep inputs sane", () => {
  assert.deepEqual(normalizeStartEarlyInputs({}), { monthly: 200, age: 18, endAge: 65 });
  assert.deepEqual(normalizeStartEarlyInputs({ monthly: 99999, age: 3, endAge: 20 }), { monthly: 1000, age: 16, endAge: 45 });
});

test("starting earlier always ends higher, and catch-up lands on the same total", () => {
  const result = computeStartEarly({ monthly: 300, age: 22, endAge: 65 });
  const [now, five, ten] = result.paths;
  assert.equal(result.paths.length, 3);
  assert.ok(now.final > five.final && five.final > ten.final);
  assert.equal(five.costVsNow, now.final - five.final);
  const caughtUp = futureValueOfMonthly(five.catchUpMonthly, (65 - 27) * 12);
  assert.ok(Math.abs(caughtUp - now.final) / now.final < 0.01);
  assert.equal(now.series[0].balance, 0);
  assert.equal(now.series.at(-1).balance, now.final);
});

test("short horizons drop start dates that would leave under five years", () => {
  const result = computeStartEarly({ monthly: 100, age: 45, endAge: 60 });
  assert.deepEqual(result.paths.map((path) => path.delay), [0, 5]);
});
