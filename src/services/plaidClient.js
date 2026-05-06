import { getMockPlaidLikeData, normalizePlaidMockData } from "../utils/baseline.mjs";

const CLIENT_USER_STORAGE_KEY = "pam-ai-plaid-client-user-id";

function getJsonHeaders() {
  return {
    "Content-Type": "application/json"
  };
}

async function readJsonSafe(response) {
  return response.json().catch(() => null);
}

export function getPlaidClientUserId() {
  if (typeof window === "undefined") return `pam-user-${Date.now()}`;

  const existing = window.localStorage.getItem(CLIENT_USER_STORAGE_KEY);
  if (existing) return existing;

  const generated =
    window.crypto?.randomUUID?.() ||
    `pam-user-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const clientUserId = `pam-user-${generated}`;
  window.localStorage.setItem(CLIENT_USER_STORAGE_KEY, clientUserId);
  return clientUserId;
}

async function loadPlaidScript() {
  if (typeof window === "undefined") {
    throw new Error("Plaid Link is only available in the browser.");
  }

  if (window.Plaid?.create) {
    return window.Plaid;
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-plaid-link]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.Plaid), { once: true });
      existing.addEventListener("error", () => reject(new Error("Unable to load Plaid Link.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
    script.async = true;
    script.dataset.plaidLink = "true";
    script.onload = () => resolve(window.Plaid);
    script.onerror = () => reject(new Error("Unable to load Plaid Link."));
    document.head.appendChild(script);
  });
}

async function createLinkToken(profile) {
  const response = await fetch("/api/plaid/create_link_token", {
    method: "POST",
    headers: getJsonHeaders(),
    body: JSON.stringify({
      clientUserId: getPlaidClientUserId(),
      legalName: profile?.firstName || "PAM user",
      emailAddress: profile?.emailAddress || ""
    })
  });

  const payload = await readJsonSafe(response);
  if (!response.ok || !payload?.ok || !payload?.link_token) {
    throw new Error(payload?.error || "Unable to create a Plaid Sandbox link token.");
  }

  return payload.link_token;
}

async function exchangePublicToken(publicToken, metadata, profile) {
  const response = await fetch("/api/plaid/exchange_public_token", {
    method: "POST",
    headers: getJsonHeaders(),
    body: JSON.stringify({
      clientUserId: getPlaidClientUserId(),
      public_token: publicToken,
      institution: metadata?.institution || null,
      profile
    })
  });

  const payload = await readJsonSafe(response);
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || "Unable to exchange a Plaid Sandbox public token.");
  }

  return payload;
}

async function fetchBaseline() {
  const response = await fetch(`/api/plaid/baseline?clientUserId=${encodeURIComponent(getPlaidClientUserId())}`);
  const payload = await readJsonSafe(response);
  if (!response.ok || !payload?.ok || !payload?.baseline) {
    throw new Error(payload?.error || "Unable to build a baseline from Plaid Sandbox.");
  }
  return payload.baseline;
}

function openPlaidLink(plaid, linkToken) {
  return new Promise((resolve, reject) => {
    const handler = plaid.create({
      token: linkToken,
      onSuccess: (publicToken, metadata) => resolve({ publicToken, metadata }),
      onExit: (error) => {
        if (error) {
          reject(new Error(error.display_message || error.error_message || "Plaid Link exited before the sandbox account connected."));
          return;
        }
        reject(new Error("Plaid Link was closed before the sandbox account connected."));
      }
    });

    handler.open();
  });
}

export async function connectSandboxAccount(profile) {
  const plaid = await loadPlaidScript();
  const linkToken = await createLinkToken(profile);
  const { publicToken, metadata } = await openPlaidLink(plaid, linkToken);
  await exchangePublicToken(publicToken, metadata, profile);
  const baseline = await fetchBaseline();

  return {
    baseline,
    status: "Sandbox account connected. PAM built your baseline."
  };
}

export function loadSandboxFallback(previousBaseline) {
  return {
    baseline: normalizePlaidMockData(getMockPlaidLikeData(), previousBaseline),
    status: "Sandbox-style sample data loaded."
  };
}
