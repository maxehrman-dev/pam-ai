// Load a backup made by backup-supabase.mjs into a database: the schema first,
// then every table's rows. Use it to test that backups actually restore.
//
//   RESTORE_DATABASE_URL=postgres://... node scripts/restore-backup.mjs backups/<stamp>
//
// Refuses to target the production database; restore production from a
// checked copy deliberately, never by accident.
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";
import { clientConfig, loadEnvFiles, productionConnectionString, sameDatabase } from "./db-connection.mjs";

// Parents before children so foreign keys are satisfied.
const ORDER = ["pam_accounts"];

loadEnvFiles();
const dir = process.argv[2];
const target = process.env.RESTORE_DATABASE_URL || "";
if (!dir || !fs.existsSync(path.join(dir, "manifest.json"))) {
  console.error("Usage: RESTORE_DATABASE_URL=postgres://... node scripts/restore-backup.mjs backups/<stamp>");
  process.exit(1);
}
if (!target) {
  console.error("Set RESTORE_DATABASE_URL to a test database (a fresh Supabase project or local Postgres).");
  process.exit(1);
}
if (sameDatabase(target, productionConnectionString())) {
  console.error("RESTORE_DATABASE_URL points at production. Restore into a separate database.");
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
const tables = Object.keys(manifest.tables).sort((a, b) => {
  const rank = (t) => (ORDER.includes(t) ? ORDER.indexOf(t) : ORDER.length);
  return rank(a) - rank(b) || a.localeCompare(b);
});

const client = new pg.Client(clientConfig(target));
await client.connect();
try {
  await client.query(fs.readFileSync(path.join(process.cwd(), "supabase/schema.sql"), "utf8"));
  const restored = {};
  for (const table of tables) {
    const rows = JSON.parse(fs.readFileSync(path.join(dir, `${table}.json`), "utf8"));
    let inserted = 0;
    for (const row of rows) {
      const columns = Object.keys(row);
      if (!columns.length) continue;
      const values = columns.map((column) => (row[column] !== null && typeof row[column] === "object" && !(row[column] instanceof Date) ? JSON.stringify(row[column]) : row[column]));
      const placeholders = columns.map((_c, index) => `$${index + 1}`).join(", ");
      const result = await client.query(
        `insert into public."${table}" (${columns.map((c) => `"${c}"`).join(", ")}) values (${placeholders}) on conflict do nothing`,
        values
      );
      inserted += result.rowCount;
    }
    restored[table] = inserted;
  }
  let ok = true;
  for (const table of tables) {
    const { rows } = await client.query(`select count(*)::int as n from public."${table}"`);
    const expected = manifest.tables[table];
    const match = rows[0].n >= expected;
    ok &&= match;
    console.log(`${match ? "ok " : "MISSING"} ${table}: ${rows[0].n} rows (backup had ${expected})`);
  }
  console.log(ok ? "Restore test passed." : "Restore test FAILED: some rows did not come back.");
  process.exit(ok ? 0 : 1);
} finally {
  await client.end();
}
