import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import pg from "pg";

const { Client } = pg;
const root = process.cwd();

function loadEnvFile(fileName) {
  const filePath = path.join(root, fileName);
  if (!fs.existsSync(filePath)) return;

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

loadEnvFile(".env.local");
loadEnvFile(".env");

const connectionString =
  process.env.PAM_SUPABASE_POSTGRES_URL_NON_POOLING ||
  process.env.PAM_SUPABASE_POSTGRES_URL ||
  process.env.PAM_SUPABASE_POSTGRES_PRISMA_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL;

if (!connectionString) {
  console.error("Missing Supabase Postgres connection string.");
  process.exit(1);
}

const connectionUrl = new URL(connectionString);
connectionUrl.searchParams.set("sslmode", "no-verify");

const schemaPath = path.join(root, "supabase", "schema.sql");
const schemaSql = fs.readFileSync(schemaPath, "utf8");
const client = new Client({
  connectionString: connectionUrl.toString(),
  ssl: { rejectUnauthorized: false }
});

try {
  await client.connect();
  await client.query(schemaSql);
  const { rows } = await client.query(`
    select table_name
    from information_schema.tables
    where table_schema = 'public'
      and table_name like 'pam_%'
    order by table_name
  `);
  console.log(JSON.stringify({
    ok: true,
    tables: rows.map((row) => row.table_name)
  }, null, 2));
} finally {
  await client.end().catch(() => {});
}
