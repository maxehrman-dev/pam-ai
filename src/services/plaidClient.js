function getJsonHeaders() {
  return {
    "Content-Type": "application/json"
  };
}

function readJsonSafe(response) {
  return response
    .json()
    .catch(() => null);
}

function normalizeAccount(account = {}) {
  return {
    name: account.name || "PAM AI user",
    email: account.email || "demo@pamai.app"
  };
}

function getAccountKey(account) {
  const normalized = normalizeAccount(account);
  return `${normalized.email}:${normalized.name}`.toLowerCase();
}

function getPlaidClientUserId() {
  if (typeof window === "undefined") return `pam-user-${Date.now()}`;

  const storageKey = "pam-ai-plaid-client-user-id";
  const existing = window.localStorage.getItem(storageKey);
  if (existing) return existing;

  const generated =
    window.crypto?.randomUUID?.() ||
    `pam-user-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const clientUserId = `pam-user-${generated}`;
  window.localStorage.setItem(storageKey, clientUserId);
  return clientUserId;
}

export async function createPlaidLinkToken(account) {
  const response = await fetch("/api/plaid-link-token", {
    method: "POST",
    headers: getJsonHeaders(),
    body: JSON.stringify({
      clientUserId: getPlaidClientUserId(),
      legalName: account?.name || "PAM AI user",
      emailAddress: ""
    })
  });

  const payload = await readJsonSafe(response);
  if (!response.ok || !payload?.ok || !payload.linkToken) {
    throw new Error(payload?.error || "Unable to create a Plaid link token.");
  }

  return payload;
}

export async function exchangePlaidPublicToken(publicToken, metadata) {
  const response = await fetch("/api/plaid-exchange", {
    method: "POST",
    headers: getJsonHeaders(),
    body: JSON.stringify({
      publicToken,
      institution: metadata?.institution || null,
      accounts: metadata?.accounts || []
    })
  });

  const payload = await readJsonSafe(response);
  if (!response.ok || !payload?.ok || !payload.snapshot) {
    throw new Error(payload?.error || "Unable to exchange the Plaid public token.");
  }

  return payload;
}

export async function loadPlaidSandboxMock(options = {}) {
  const response = await fetch("/api/plaid-sandbox-mock", {
    method: "POST",
    headers: getJsonHeaders(),
    body: JSON.stringify(options)
  });

  const payload = await readJsonSafe(response);
  if (!response.ok || !payload?.ok || !payload.snapshot) {
    throw new Error(payload?.error || "Unable to load Plaid sandbox mock data.");
  }

  return payload;
}

function loadPlaidScript() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Plaid Link is only available in the browser."));
  }

  if (window.Plaid?.create) {
    return Promise.resolve(window.Plaid);
  }

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-plaid-link]');
    if (existing) {
      existing.addEventListener("load", () => resolve(window.Plaid));
      existing.addEventListener("error", () => reject(new Error("Unable to load Plaid Link.")));
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

let preparedLink = null;

function resetPreparedLink(session) {
  if (!session || preparedLink?.session === session || preparedLink?.promise === session) {
    preparedLink = null;
  }
}

function createPreparedSession(account) {
  const normalizedAccount = normalizeAccount(account);
  const key = getAccountKey(normalizedAccount);
  const session = {
    key,
    ready: false,
    handler: null,
    activeReject: null,
    activeResolve: null,
    open() {
      if (!session.handler) {
        return Promise.reject(new Error("Plaid Link is still preparing. Try again in a moment."));
      }

      return new Promise((resolve, reject) => {
        session.activeResolve = resolve;
        session.activeReject = reject;

        try {
          session.handler.open();
        } catch (error) {
          session.activeResolve = null;
          session.activeReject = null;
          reject(error);
        }
      });
    }
  };

  const promise = Promise.all([loadPlaidScript(), createPlaidLinkToken(normalizedAccount)])
    .then(([plaid, tokenPayload]) => {
      session.handler = plaid.create({
        token: tokenPayload.linkToken,
        onSuccess: async (publicToken, metadata) => {
          try {
            const exchange = await exchangePlaidPublicToken(publicToken, metadata);
            session.activeResolve?.({
              ...exchange,
              institutionName: metadata?.institution?.name || exchange.institutionName || "Linked institution"
            });
          } catch (error) {
            session.activeReject?.(error);
          } finally {
            session.activeResolve = null;
            session.activeReject = null;
          }
        },
        onExit: (error) => {
          const reject = session.activeReject;
          session.activeResolve = null;
          session.activeReject = null;

          if (error) {
            reject?.(new Error(error.display_message || error.error_message || "Plaid Link exited before the account was connected."));
            return;
          }

          reject?.(new Error("Plaid Link was closed before the account was connected."));
        }
      });
      session.ready = true;
      return session;
    })
    .catch((error) => {
      resetPreparedLink(session);
      throw error;
    });

  preparedLink = { key, promise, session };
  return promise;
}

export function preloadPlaidLink(account) {
  const key = getAccountKey(account);
  if (preparedLink?.key === key) {
    return preparedLink.promise;
  }

  return createPreparedSession(account);
}

export function getReadyPlaidLink(account) {
  const key = getAccountKey(account);
  if (preparedLink?.key === key && preparedLink.session?.ready) {
    return preparedLink.session;
  }

  return null;
}

export async function launchPlaidLink(account, readySession = null) {
  const session = readySession || await preloadPlaidLink(account);

  try {
    return await session.open();
  } finally {
    resetPreparedLink(session);
  }
}
