const { hasClerkConfig, verifyClerkToken } = require("../_lib/clerk.js");
const { sendJson, sendMethodNotAllowed } = require("../_lib/http.js");
const { assertServiceEnabled, checkRateLimit, validatePayload } = require("../_lib/security.js");

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_PRICE_ID_MONTHLY = process.env.STRIPE_PRICE_ID_MONTHLY || "";
const STRIPE_PRICE_ID_FOUNDING = process.env.STRIPE_PRICE_ID_FOUNDING || "";
const PAM_SITE_URL = process.env.PAM_SITE_URL || "https://pamadvisor.com";

function hasStripeConfig() {
  return Boolean(STRIPE_SECRET_KEY && (STRIPE_PRICE_ID_MONTHLY || STRIPE_PRICE_ID_FOUNDING));
}

async function stripePost(path, body) {
  const res = await fetch("https://api.stripe.com/v1" + path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams(body).toString()
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data;
}

const checkoutSchema = {
  properties: {
    plan: { type: "string", enum: ["monthly", "founding"] }
  },
  required: ["plan"]
};

module.exports = async (req, res) => {
  if (req.method !== "POST") return sendMethodNotAllowed(res);

  if (!hasStripeConfig()) {
    return sendJson(res, 503, { ok: false, error: "Billing is not configured yet." });
  }

  if (!assertServiceEnabled(res, { serviceName: "Billing", envKeys: ["PAM_DISABLE_BILLING"] })) return;

  if (!checkRateLimit(req, res, {
    routeKey: "checkout",
    ipLimit: { windowMs: 60 * 1000, max: 10 }
  })) return;

  let clerkUserId = null;
  let userEmail = null;

  if (hasClerkConfig()) {
    const account = await verifyClerkToken(req.headers?.authorization);
    if (!account?.id) {
      return sendJson(res, 401, { ok: false, error: "Sign in before starting checkout." });
    }
    clerkUserId = account.id;
    userEmail = account.emailAddress;
  } else {
    return sendJson(res, 401, { ok: false, error: "Authentication required." });
  }

  const body = validatePayload(req.body, checkoutSchema, "request body");
  const isFounding = body.plan === "founding";
  const priceId = isFounding ? STRIPE_PRICE_ID_FOUNDING : STRIPE_PRICE_ID_MONTHLY;

  if (!priceId) {
    return sendJson(res, 503, { ok: false, error: "That plan is not available yet." });
  }

  try {
    const session = await stripePost("/checkout/sessions", {
      mode: "subscription",
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      client_reference_id: clerkUserId,
      customer_email: userEmail,
      "metadata[clerkUserId]": clerkUserId,
      "metadata[priceId]": priceId,
      "metadata[isFoundingMember]": isFounding ? "true" : "false",
      "subscription_data[metadata][clerkUserId]": clerkUserId,
      "subscription_data[metadata][isFoundingMember]": isFounding ? "true" : "false",
      success_url: `${PAM_SITE_URL}/?checkout=success`,
      cancel_url: `${PAM_SITE_URL}/?checkout=cancelled`,
      allow_promotion_codes: "true"
    });

    return sendJson(res, 200, { ok: true, url: session.url });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error.message || "Could not create checkout session." });
  }
};
