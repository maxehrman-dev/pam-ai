// Shared Postgres connection helpers for the backup/restore scripts.
// Reads .env.local / .env the same way apply-supabase-schema.mjs does.
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

export function loadEnvFiles(root = process.cwd()) {
  for (const fileName of [".env.local", ".env"]) {
    const filePath = path.join(root, fileName);
    if (!fs.existsSync(filePath)) continue;
    for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const separator = line.indexOf("=");
      if (separator <= 0) continue;
      const key = line.slice(0, separator).trim();
      const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

export function productionConnectionString() {
  return (
    process.env.PAM_SUPABASE_POSTGRES_URL_NON_POOLING ||
    process.env.PAM_SUPABASE_POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_URL ||
    ""
  );
}

// Supabase requires TLS; local test databases usually don't offer it.
export function clientConfig(connectionString) {
  const url = new URL(connectionString);
  const local = ["localhost", "127.0.0.1", ""].includes(url.hostname) || url.searchParams.get("sslmode") === "disable";
  if (!local) url.searchParams.set("sslmode", "no-verify");
  return { connectionString: url.toString(), ...(local ? {} : { ssl: { rejectUnauthorized: false } }) };
}

export function sameDatabase(a, b) {
  try {
    const left = new URL(a);
    const right = new URL(b);
    return left.hostname === right.hostname && left.port === right.port && left.pathname === right.pathname;
  } catch (_error) {
    return false;
  }
}
