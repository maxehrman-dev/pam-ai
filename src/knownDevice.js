// "Welcome back" memory for a device someone has signed in on before. Holds
// only what the welcome screen needs: first name, email (shown masked, used to
// prefill sign-in), and whether they've set up a passkey. Never any money data.
// Signing out keeps it, like a bank app remembering your username; "Not you?"
// forgets it.

const KEY = "pam:known-device:v1";
const DISMISS_KEY = "pam:welcome-back-dismissed";

export function maskEmail(email = "") {
  const [name, domain] = String(email).split("@");
  if (!name || !domain) return "";
  return `${name[0]}•••@${domain}`;
}

export function readKnownDevice() {
  try {
    const value = JSON.parse(window.localStorage.getItem(KEY) || "null");
    return value && value.email ? value : null;
  } catch (_error) {
    return null;
  }
}

export function rememberKnownDevice({ firstName = "", email = "", hasPasskey = false } = {}) {
  if (!email) return;
  const next = { firstName: String(firstName).slice(0, 60), email: String(email).slice(0, 254), hasPasskey: Boolean(hasPasskey) };
  const current = readKnownDevice();
  if (current && current.firstName === next.firstName && current.email === next.email && current.hasPasskey === next.hasPasskey) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch (_error) {
    // Storage blocked: the welcome screen just won't appear.
  }
}

export function forgetKnownDevice() {
  try {
    window.localStorage.removeItem(KEY);
  } catch (_error) {
    // Nothing to forget.
  }
}

// "Go to homepage" hides the welcome screen for the rest of this visit only.
export function isWelcomeBackDismissed() {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY) === "1";
  } catch (_error) {
    return false;
  }
}

export function dismissWelcomeBack() {
  try {
    window.sessionStorage.setItem(DISMISS_KEY, "1");
  } catch (_error) {
    // Falls back to showing it again on reload.
  }
}

export function supportsPasskeys() {
  return typeof window !== "undefined" && typeof window.PublicKeyCredential === "function";
}
