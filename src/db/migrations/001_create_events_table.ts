import "dotenv/config";
import { createClient } from "@clickhouse/client";

const DATABASE = process.env.CLICKHOUSE_DATABASE ?? "sentient_log";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS ${DATABASE}.events (
    event_id     UUID,
    timestamp    DateTime64(3, 'UTC'),
    event_type   LowCardinality(String),
    url          String,
    latency_ms   Float32,
    user_agent   String,
    service      LowCardinality(String),
    level        LowCardinality(String),
    metadata     JSON
)
ENGINE = MergeTree
ORDER BY (timestamp, event_type)
PARTITION BY toYYYYMM(timestamp)
TTL toDateTime(timestamp) + INTERVAL 90 DAY
SETTINGS index_granularity = 8192
`;

async function migrate(): Promise<void> {
  const client = createClient({
    url: process.env.CLICKHOUSE_URL ?? "http://localhost:8123",
    database: DATABASE,
    username: process.env.CLICKHOUSE_USER ?? "default",
    password: process.env.CLICKHOUSE_PASSWORD ?? "",
  });

  try {
    await client.command({
      query: `CREATE DATABASE IF NOT EXISTS ${DATABASE}`,
    });
    console.log("[migrate] database ensured");

    await client.command({
      query: SCHEMA,
      clickhouse_settings: {
        enable_json_type: 1,
      },
    });
    console.log("[migrate] events table created");
  } finally {
    await client.close();
  }
}

migrate().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
