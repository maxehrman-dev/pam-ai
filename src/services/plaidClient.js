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

export async function createPlaidLinkToken(account) {
  const response = await fetch("/api/plaid-link-token", {
    method: "POST",
    headers: getJsonHeaders(),
    body: JSON.stringify({
      clientUserId: account?.email || `pam-${Date.now()}`,
      legalName: account?.name || "PAM AI user",
      emailAddress: account?.email || ""
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

export async function launchPlaidLink(account) {
  const [plaid, tokenPayload] = await Promise.all([loadPlaidScript(), createPlaidLinkToken(account)]);

  return new Promise((resolve, reject) => {
    const handler = plaid.create({
      token: tokenPayload.linkToken,
      onSuccess: async (publicToken, metadata) => {
        try {
          const exchange = await exchangePlaidPublicToken(publicToken, metadata);
          resolve({
            ...exchange,
            institutionName: metadata?.institution?.name || exchange.institutionName || "Linked institution"
          });
        } catch (error) {
          reject(error);
        }
      },
      onExit: (error) => {
        if (error) {
          reject(new Error(error.display_message || error.error_message || "Plaid Link exited before the account was connected."));
          return;
        }

        reject(new Error("Plaid Link was closed before the account was connected."));
      }
    });

    handler.open();
  });
}
