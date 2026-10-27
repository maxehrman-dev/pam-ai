// Export PAM's Supabase tables to JSON (one file per table) under backups/.
// Free Supabase plans have no automatic backups, so run this on a schedule and
// keep the files somewhere safe (they contain emails and financial profiles).
//
//   node scripts/backup-supabase.mjs              # secrets left out (default)
//   node scripts/backup-supabase.mjs --include-secrets
//
// Restore-test it with scripts/restore-backup.mjs.
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";
import { clientConfig, loadEnvFiles, productionConnectionString } from "./db-connection.mjs";

// Plaid tokens, login sessions, verification codes and rate-limit counters
// are either secrets or throwaway; leaving them out keeps backups safe to hold.
const SKIPPED_BY_DEFAULT = new Set(["pam_sessions", "pam_verification_requests", "pam_rate_limits"]);
const SECRET_COLUMNS = { pam_plaid_items: ["access_token_reference"] };

loadEnvFiles();
const includeSecrets = process.argv.includes("--include-secrets");
const connectionString = process.env.BACKUP_DATABASE_URL || productionConnectionString();
if (!connectionString) {
  console.error("Missing a Postgres connection string (BACKUP_DATABASE_URL or the Supabase POSTGRES_URL env vars).");
  process.exit(1);
}

const client = new pg.Client(clientConfig(connectionString));
await client.connect();
try {
  const { rows: tables } = await client.query(
    "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' and table_name like 'pam\\_%' order by table_name"
  );
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.join(process.env.BACKUP_DIR || "backups", stamp);
  fs.mkdirSync(dir, { recursive: true });

  const manifest = { createdAt: new Date().toISOString(), includeSecrets, tables: {} };
  for (const { table_name: table } of tables) {
    if (!includeSecrets && SKIPPED_BY_DEFAULT.has(table)) continue;
    const { rows } = await client.query(`select * from public."${table}"`);
    const redact = includeSecrets ? [] : SECRET_COLUMNS[table] || [];
    const cleaned = redact.length ? rows.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, redact.includes(k) ? null : v]))) : rows;
    fs.writeFileSync(path.join(dir, `${table}.json`), JSON.stringify(cleaned, null, 1));
    manifest.tables[table] = cleaned.length;
  }
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 1));
  console.log(`Backed up ${Object.keys(manifest.tables).length} tables to ${dir}`);
  for (const [table, count] of Object.entries(manifest.tables)) console.log(`  ${table}: ${count} rows`);
} finally {
  await client.end();
}
