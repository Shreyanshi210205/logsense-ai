import { createClient, ClickHouseClient } from "@clickhouse/client";

let client: ClickHouseClient | null = null;

export function getClickHouseClient(): ClickHouseClient {
  if (!client) {
    client = createClient({
      url: process.env.CLICKHOUSE_URL ?? "http://localhost:8123",
      database: process.env.CLICKHOUSE_DATABASE ?? "sentient_log",
      username: process.env.CLICKHOUSE_USER ?? "default",
      password: process.env.CLICKHOUSE_PASSWORD ?? "",
      clickhouse_settings: {
         enable_json_type: 1,
        async_insert: 1,
        wait_for_async_insert: 0,
      },
    });
  }
  return client;
}

export async function closeClickHouseClient(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
  }
}
