/**
 * Run once to create PAM AI products, prices, and webhook in Stripe.
 * Usage: STRIPE_SECRET_KEY=sk_... node scripts/stripe-setup.mjs
 */

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("Set STRIPE_SECRET_KEY=sk_... before running this script.");
  process.exit(1);
}

async function stripe(path, body) {
  const res = await fetch("https://api.stripe.com/v1" + path, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + key,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams(body).toString()
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data;
}

(async () => {
  console.log("Creating PAM AI product...");
  const product = await stripe("/products", {
    name: "PAM AI",
    description: "Personal Asset Manager — financial decision modeling for young adults"
  });

  console.log("Creating $9.99/month price...");
  const price999 = await stripe("/prices", {
    product: product.id,
    unit_amount: "999",
    currency: "usd",
    "recurring[interval]": "month",
    nickname: "Monthly"
  });

  console.log("Creating $7.99/month founding price...");
  const price799 = await stripe("/prices", {
    product: product.id,
    unit_amount: "799",
    currency: "usd",
    "recurring[interval]": "month",
    nickname: "Founding member"
  });

  console.log("Creating webhook endpoint...");
  const webhook = await stripe("/webhook_endpoints", {
    url: "https://pamadvisor.com/api/integrations/stripe-webhook",
    "enabled_events[]": "checkout.session.completed",
    "enabled_events[1]": "customer.subscription.deleted",
    "enabled_events[2]": "customer.subscription.updated",
    "enabled_events[3]": "invoice.payment_failed",
    "enabled_events[4]": "invoice.payment_succeeded"
  });

  console.log("\n✅ Done. Add these to Vercel environment variables:\n");
  console.log(`STRIPE_PRICE_ID_MONTHLY=${price999.id}`);
  console.log(`STRIPE_PRICE_ID_FOUNDING=${price799.id}`);
  console.log(`STRIPE_WEBHOOK_SECRET=${webhook.secret}`);
  console.log(`\nProduct ID (for reference): ${product.id}`);
  console.log(`Webhook ID (for reference): ${webhook.id}`);
})().catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});
