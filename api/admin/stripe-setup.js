/**
 * ONE-TIME setup endpoint. Deleted immediately after use.
 * Creates PAM AI products, prices, and webhook in Stripe.
 */
const { sendJson } = require("../_lib/http.js");

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const PAM_ADMIN_SECRET = process.env.PAM_ADMIN_SECRET || "";

async function stripePost(path, bodyString) {
  const res = await fetch("https://api.stripe.com/v1" + path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: bodyString
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data;
}

async function stripeGet(path) {
  const res = await fetch("https://api.stripe.com/v1" + path, {
    headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` }
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
    // Reuse existing PAM AI product/prices if they exist (avoid duplicates)
    const existingPrices = await stripeGet("/prices?limit=100&active=true");
    let price999 = (existingPrices.data || []).find((p) => p.unit_amount === 999 && p.recurring);
    let price799 = (existingPrices.data || []).find((p) => p.unit_amount === 799 && p.recurring);

    let productId = price999?.product || price799?.product;

    if (!productId) {
      const product = await stripePost("/products",
        "name=PAM+AI&description=" + encodeURIComponent("Personal Asset Manager — financial decision modeling for young adults"));
      productId = product.id;
    }

    if (!price999) {
      price999 = await stripePost("/prices",
        `product=${productId}&unit_amount=999&currency=usd&recurring[interval]=month&nickname=Monthly`);
    }
    if (!price799) {
      price799 = await stripePost("/prices",
        `product=${productId}&unit_amount=799&currency=usd&recurring[interval]=month&nickname=${encodeURIComponent("Founding member")}`);
    }

    // Reuse existing webhook to this URL if present
    const existingHooks = await stripeGet("/webhook_endpoints?limit=100");
    const hookUrl = "https://pamadvisor.com/api/integrations/stripe-webhook";
    let webhook = (existingHooks.data || []).find((h) => h.url === hookUrl);

    const events = [
      "checkout.session.completed",
      "customer.subscription.deleted",
      "customer.subscription.updated",
      "invoice.payment_failed",
      "invoice.payment_succeeded"
    ];
    const eventsParam = events.map((e) => `enabled_events[]=${encodeURIComponent(e)}`).join("&");

    if (!webhook) {
      webhook = await stripePost("/webhook_endpoints",
        `url=${encodeURIComponent(hookUrl)}&${eventsParam}`);
    }

    return sendJson(res, 200, {
      ok: true,
      STRIPE_PRICE_ID_MONTHLY: price999.id,
      STRIPE_PRICE_ID_FOUNDING: price799.id,
      STRIPE_WEBHOOK_SECRET: webhook.secret || "(existing webhook — secret only shown at creation; recreate if needed)",
      productId,
      webhookId: webhook.id
    });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error.message });
  }
};
