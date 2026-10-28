import test from "node:test";
import assert from "node:assert/strict";

const store = new Map();
const session = new Map();
const storage = (map) => ({ getItem: (key) => (map.has(key) ? map.get(key) : null), setItem: (key, value) => map.set(key, String(value)), removeItem: (key) => map.delete(key) });
globalThis.window = { localStorage: storage(store), sessionStorage: storage(session) };

const { dismissWelcomeBack, forgetKnownDevice, isWelcomeBackDismissed, maskEmail, readKnownDevice, rememberKnownDevice } = await import("../src/knownDevice.js");

test("emails are masked on the welcome screen", () => {
  assert.equal(maskEmail("maya@icloud.com"), "m•••@icloud.com");
  assert.equal(maskEmail("not-an-email"), "");
});

test("a device is remembered after sign-in and forgotten on 'Not you?'", () => {
  assert.equal(readKnownDevice(), null);
  rememberKnownDevice({ firstName: "Maya", email: "maya@icloud.com", hasPasskey: true });
  assert.deepEqual(readKnownDevice(), { firstName: "Maya", email: "maya@icloud.com", hasPasskey: true });
  forgetKnownDevice();
  assert.equal(readKnownDevice(), null);
});

test("nothing but name, email and passkey flag is stored", () => {
  rememberKnownDevice({ firstName: "Maya", email: "maya@icloud.com", hasPasskey: false, balance: 1000 });
  assert.deepEqual(Object.keys(JSON.parse(store.get("pam:known-device:v1"))).sort(), ["email", "firstName", "hasPasskey"]);
});

test("'Go to homepage' hides the welcome screen for this visit only", () => {
  assert.equal(isWelcomeBackDismissed(), false);
  dismissWelcomeBack();
  assert.equal(isWelcomeBackDismissed(), true);
});
