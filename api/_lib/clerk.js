const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY || "";
const CLERK_PUBLISHABLE_KEY = process.env.CLERK_PUBLISHABLE_KEY || "";

function hasClerkConfig() {
  return Boolean(CLERK_SECRET_KEY && CLERK_PUBLISHABLE_KEY);
}

function getClerkPublishableKey() {
  return CLERK_PUBLISHABLE_KEY;
}

async function verifyClerkToken(authHeader) {
  if (!hasClerkConfig()) return null;
  if (!authHeader || !authHeader.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7).trim();
  if (!token) return null;

  try {
    const { createClerkClient } = require("@clerk/backend");
    const clerk = createClerkClient({ secretKey: CLERK_SECRET_KEY });

    const payload = await clerk.verifyToken(token);
    if (!payload?.sub) return null;

    const user = await clerk.users.getUser(payload.sub);
    if (!user?.id) return null;

    const email = user.emailAddresses?.find((e) => e.id === user.primaryEmailAddressId)?.emailAddress || "";
    const firstName = user.firstName || email.split("@")[0] || "User";

    return {
      id: user.id,
      clerkUserId: user.id,
      firstName,
      emailAddress: email,
      employmentStatus: user.publicMetadata?.employmentStatus || "Not sure yet",
      stateCode: user.publicMetadata?.stateCode || "OTHER",
      age: user.publicMetadata?.age || null,
      creditScore: user.publicMetadata?.creditScore || null,
      createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : new Date().toISOString()
    };
  } catch (_error) {
    return null;
  }
}

async function updateClerkUserMetadata(clerkUserId, metadata = {}) {
  if (!hasClerkConfig() || !clerkUserId) return false;
  try {
    const { createClerkClient } = require("@clerk/backend");
    const clerk = createClerkClient({ secretKey: CLERK_SECRET_KEY });
    await clerk.users.updateUserMetadata(clerkUserId, {
      publicMetadata: metadata
    });
    return true;
  } catch (_error) {
    return false;
  }
}

module.exports = {
  getClerkPublishableKey,
  hasClerkConfig,
  updateClerkUserMetadata,
  verifyClerkToken
};
