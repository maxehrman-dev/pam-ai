/**
 * ONE-TIME setup endpoint. Deleted immediately after use.
 * Creates PAM AI products, prices, and webhook in Stripe.
 */
const { sendJson } = require("../_lib/http.js");

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const PAM_ADMIN_SECRET = process.env.PAM_ADMIN_SECRET || "";

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

module.exports = async (req, res) => {
  if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });

  const secret = req.headers["x-admin-secret"] || req.body?.adminSecret || "";
  if (!PAM_ADMIN_SECRET || secret !== PAM_ADMIN_SECRET) {
    return sendJson(res, 401, { error: "Unauthorized" });
  }

  if (!STRIPE_SECRET_KEY) return sendJson(res, 503, { error: "STRIPE_SECRET_KEY not set" });

  try {
    const product = await stripePost("/products", {
      name: "PAM AI",
      description: "Personal Asset Manager — financial decision modeling for young adults"
    });

    const price999 = await stripePost("/prices", {
      product: product.id,
      unit_amount: "999",
      currency: "usd",
      "recurring[interval]": "month",
      nickname: "Monthly"
    });

    const price799 = await stripePost("/prices", {
      product: product.id,
      unit_amount: "799",
      currency: "usd",
      "recurring[interval]": "month",
      nickname: "Founding member"
    });

    const webhook = await stripePost("/webhook_endpoints", {
      url: "https://pamadvisor.com/api/integrations/stripe-webhook",
      "enabled_events[]": "checkout.session.completed",
      "enabled_events[1]": "customer.subscription.deleted",
      "enabled_events[2]": "customer.subscription.updated",
      "enabled_events[3]": "invoice.payment_failed",
      "enabled_events[4]": "invoice.payment_succeeded"
    });

    return sendJson(res, 200, {
      ok: true,
      STRIPE_PRICE_ID_MONTHLY: price999.id,
      STRIPE_PRICE_ID_FOUNDING: price799.id,
      STRIPE_WEBHOOK_SECRET: webhook.secret,
      productId: product.id,
      webhookId: webhook.id
    });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error.message });
  }
};
