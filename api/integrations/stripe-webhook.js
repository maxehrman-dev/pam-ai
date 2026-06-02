const { sendJson } = require("../_lib/http.js");
const { hasSupabaseConfig, upsertSubscription } = require("../_lib/supabase.js");

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

function hasStripeConfig() {
  return Boolean(STRIPE_SECRET_KEY && STRIPE_WEBHOOK_SECRET);
}

async function verifyStripeSignature(rawBody, signatureHeader) {
  if (!STRIPE_WEBHOOK_SECRET) return null;
  try {
    // Parse the Stripe-Signature header
    const parts = Object.fromEntries(
      signatureHeader.split(",").map((part) => part.split("="))
    );
    const timestamp = parts.t;
    const signature = parts.v1;
    if (!timestamp || !signature) return null;

    // Verify timestamp is within 5 minutes
    const timeDiff = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (timeDiff > 300) return null;

    // Compute expected signature
    const payload = `${timestamp}.${rawBody}`;
    const { createHmac } = require("crypto");
    const expected = createHmac("sha256", STRIPE_WEBHOOK_SECRET)
      .update(payload)
      .digest("hex");

    // Timing-safe comparison
    if (expected.length !== signature.length) return null;
    const { timingSafeEqual } = require("crypto");
    const match = timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    if (!match) return null;

    return JSON.parse(rawBody);
  } catch (_error) {
    return null;
  }
}

async function handleCheckoutCompleted(session) {
  const clerkUserId = session.client_reference_id || session.metadata?.clerkUserId;
  if (!clerkUserId) return;

  const subscriptionId = session.subscription;
  const customerId = session.customer;
  const priceId = session.metadata?.priceId;
  const isFoundingMember = priceId === process.env.STRIPE_PRICE_ID_FOUNDING;

  if (hasSupabaseConfig()) {
    await upsertSubscription({
      clerkUserId,
      customerId,
      subscriptionId,
      status: "active",
      priceId,
      isFoundingMember
    }).catch(() => null);
  }
}

async function handleSubscriptionUpdated(subscription) {
  const clerkUserId = subscription.metadata?.clerkUserId;
  if (!clerkUserId) return;

  if (hasSupabaseConfig()) {
    await upsertSubscription({
      clerkUserId,
      customerId: subscription.customer,
      subscriptionId: subscription.id,
      status: subscription.status,
      priceId: subscription.items?.data?.[0]?.price?.id,
      isFoundingMember: subscription.metadata?.isFoundingMember === "true"
    }).catch(() => null);
  }
}

async function handleSubscriptionDeleted(subscription) {
  const clerkUserId = subscription.metadata?.clerkUserId;
  if (!clerkUserId) return;

  if (hasSupabaseConfig()) {
    await upsertSubscription({
      clerkUserId,
      customerId: subscription.customer,
      subscriptionId: subscription.id,
      status: "canceled",
      priceId: subscription.items?.data?.[0]?.price?.id,
      isFoundingMember: false
    }).catch(() => null);
  }
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  if (!hasStripeConfig()) {
    return sendJson(res, 503, { error: "Stripe is not configured." });
  }

  const signature = req.headers["stripe-signature"];
  if (!signature) {
    return sendJson(res, 400, { error: "Missing Stripe signature." });
  }

  // Raw body needed for signature verification
  const rawBody = JSON.stringify(req.body);
  const event = await verifyStripeSignature(rawBody, signature);

  if (!event) {
    return sendJson(res, 400, { error: "Invalid Stripe signature." });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object);
        break;
      case "customer.subscription.updated":
        await handleSubscriptionUpdated(event.data.object);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object);
        break;
      case "invoice.payment_failed":
        // Log but don't block — subscription status will update via subscription.updated
        break;
      case "invoice.payment_succeeded":
        break;
      default:
        break;
    }

    return sendJson(res, 200, { received: true });
  } catch (_error) {
    return sendJson(res, 500, { error: "Webhook handler failed." });
  }
};
