import "dotenv/config";
import { createClient } from "@clickhouse/client";

const DATABASE = process.env.CLICKHOUSE_DATABASE ?? "sentient_log";
const AI_USER = process.env.CLICKHOUSE_AI_USER ?? "sentient_ai";
const AI_PASSWORD = process.env.CLICKHOUSE_AI_PASSWORD;
const PROFILE = "sentient_ai_restricted";

function quoteIdentifier(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error("ClickHouse identifiers may contain only letters, numbers, and underscores");
  }
  return identifier;
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

async function migrate(): Promise<void> {
  if (!AI_PASSWORD) {
    throw new Error("CLICKHOUSE_AI_PASSWORD is required to create the restricted AI user");
  }

  const database = quoteIdentifier(DATABASE);
  const aiUser = quoteIdentifier(AI_USER);
  const client = createClient({
    url: process.env.CLICKHOUSE_URL ?? "http://localhost:8123",
    database,
    username: process.env.CLICKHOUSE_USER ?? "default",
    password: process.env.CLICKHOUSE_PASSWORD ?? "",
  });

  try {
    await client.command({
      query: `CREATE SETTINGS PROFILE IF NOT EXISTS ${PROFILE} SETTINGS
        readonly = 1 READONLY,
        max_execution_time = 10 READONLY,
        max_rows_to_read = 5000000 READONLY,
        max_memory_usage = 1000000000 READONLY`,
    });
    await client.command({
      query: `CREATE USER IF NOT EXISTS ${aiUser} IDENTIFIED BY ${quoteLiteral(AI_PASSWORD)} SETTINGS PROFILE ${PROFILE}`,
    });
    await client.command({ query: `ALTER USER ${aiUser} SETTINGS PROFILE ${PROFILE}` });
    await client.command({ query: `GRANT SELECT ON ${database}.events TO ${aiUser}` });
    console.log(`[migrate] restricted AI user '${aiUser}' configured for ${database}.events`);
  } finally {
    await client.close();
  }
}

migrate().catch((err) => {
  console.error("[migrate] AI analytics security setup failed:", err);
  process.exit(1);
});
