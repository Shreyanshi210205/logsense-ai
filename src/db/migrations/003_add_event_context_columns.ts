import "dotenv/config";
import { createClient } from "@clickhouse/client";

const DATABASE = process.env.CLICKHOUSE_DATABASE ?? "sentient_log";

async function migrate(): Promise<void> {
  const client = createClient({
    url: process.env.CLICKHOUSE_URL ?? "http://localhost:8123",
    database: DATABASE,
    username: process.env.CLICKHOUSE_USER ?? "default",
    password: process.env.CLICKHOUSE_PASSWORD ?? "",
  });

  try {
    await client.command({
      query: `ALTER TABLE ${DATABASE}.events
        ADD COLUMN IF NOT EXISTS service LowCardinality(String) DEFAULT 'unknown',
        ADD COLUMN IF NOT EXISTS level LowCardinality(String) DEFAULT 'info'`,
    });
    console.log("[migrate] event service and level columns ensured");
  } finally {
    await client.close();
  }
}

migrate().catch((err) => {
  console.error("[migrate] event context migration failed:", err);
  process.exit(1);
});
