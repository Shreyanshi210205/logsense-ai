import { createClient, ClickHouseClient } from "@clickhouse/client";

let writerClient: ClickHouseClient | null = null;
let readerClient: ClickHouseClient | null = null;

/** Used only by ingestion and administrative migrations. */
export function getWriterClickHouseClient(): ClickHouseClient {
  if (!writerClient) {
    writerClient = createClient({
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
  return writerClient;
}

/** Used only for AI-generated read queries. */
export function getReaderClickHouseClient(): ClickHouseClient {
  if (!readerClient) {
    const username = process.env.CLICKHOUSE_AI_USER ?? "sentient_ai";
    const password = process.env.CLICKHOUSE_AI_PASSWORD;

    if (!password) {
      throw new Error("CLICKHOUSE_AI_PASSWORD must be configured for AI analytics");
    }

    readerClient = createClient({
      url: process.env.CLICKHOUSE_URL ?? "http://localhost:8123",
      database: process.env.CLICKHOUSE_DATABASE ?? "sentient_log",
      username,
      password,
    });
  }
  return readerClient;
}

export async function closeClickHouseClients(): Promise<void> {
  if (writerClient) {
    await writerClient.close();
    writerClient = null;
  }
  if (readerClient) {
    await readerClient.close();
    readerClient = null;
  }
}
