import "dotenv/config";
import type { EachBatchPayload } from "kafkajs";
import { v4 as uuidv4, validate as isUuid } from "uuid";
import { closeClickHouseClients, getWriterClickHouseClient } from "../db/client.js";
import { clickHouseWriterConsumer, rawEventsTopic } from "../messaging/kafka.js";
import type { LogEvent } from "../types/log.js";

const INSERT_CHUNK_SIZE = Math.max(1, Number(process.env.CLICKHOUSE_INSERT_CHUNK_SIZE ?? 1_000));
let shuttingDown = false;

async function main(): Promise<void> {
  await clickHouseWriterConsumer.connect();
  await clickHouseWriterConsumer.subscribe({ topic: rawEventsTopic, fromBeginning: false });

  await clickHouseWriterConsumer.run({
    autoCommit: false,
    eachBatchAutoResolve: false,
    eachBatch: processBatch,
  });

  console.log(`[ingest-worker] listening for '${rawEventsTopic}' across assigned partitions`);
}

async function processBatch({ batch, resolveOffset, heartbeat, isRunning, isStale }: EachBatchPayload): Promise<void> {
  if (!isRunning() || isStale()) return;

  const records: LogEvent[] = [];
  for (const message of batch.messages) {
    if (!isRunning() || isStale()) return;

    try {
      records.push(normalizeEvent(JSON.parse(message.value?.toString("utf8") ?? "")));
    } catch (error) {
      // A malformed record must not block its partition forever.
      console.warn(`[ingest-worker] skipping corrupt record at ${batch.partition}:${message.offset}`, error);
    }
  }

  const writer = getWriterClickHouseClient();
  let inserted = 0;
  for (const chunk of chunkRecords(records, INSERT_CHUNK_SIZE)) {
    if (!isRunning() || isStale()) return;

    await writer.insert({
      table: "events",
      values: chunk,
      format: "JSONEachRow",
      // Kafka offsets are committed only after ClickHouse confirms the batch.
      clickhouse_settings: { async_insert: 1, wait_for_async_insert: 1 },
    });
    inserted += chunk.length;
    await heartbeat();
  }

  for (const message of batch.messages) {
    resolveOffset(message.offset);
    await heartbeat();
  }

  const firstOffset = batch.messages[0]?.offset;
  const lastOffset = batch.messages.at(-1)?.offset;
  if (lastOffset) {
    await clickHouseWriterConsumer.commitOffsets([{
      topic: batch.topic,
      partition: batch.partition,
      offset: (BigInt(lastOffset) + 1n).toString(),
    }]);
  }

  console.log(
    `[ingest-worker] partition=${batch.partition} offsets=${firstOffset}-${lastOffset} inserted=${inserted}`,
  );
}

function normalizeEvent(value: unknown): LogEvent {
  if (!isRecord(value)) throw new Error("message must contain a JSON object");

  const eventType = requiredString(value.event_type, "event_type");
  const url = requiredString(value.url, "url");
  const latencyMs = Number(value.latency_ms);
  if (!Number.isFinite(latencyMs)) throw new Error("latency_ms must be a finite number");

  const metadata = isRecord(value.metadata) ? value.metadata : {};
  const timestamp = toClickHouseTimestamp(value.timestamp);
  const eventId = typeof value.event_id === "string" && isUuid(value.event_id) ? value.event_id : uuidv4();

  return {
    event_id: eventId,
    timestamp,
    event_type: eventType,
    url,
    latency_ms: latencyMs,
    user_agent: optionalString(value.user_agent) ?? "",
    service: optionalString(value.service) ?? optionalString(metadata.service) ?? "unknown",
    level: optionalString(value.level) ?? optionalString(metadata.level) ?? "info",
    metadata,
  };
}

function toClickHouseTimestamp(value: unknown): string {
  const date = typeof value === "string" ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function requiredString(value: unknown, field: string): string {
  const normalized = optionalString(value);
  if (!normalized) throw new Error(`${field} must be a non-empty string`);
  return normalized;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function* chunkRecords(records: LogEvent[], chunkSize: number): Generator<LogEvent[]> {
  for (let index = 0; index < records.length; index += chunkSize) {
    yield records.slice(index, index + chunkSize);
  }
}

async function shutdown(signal: string, exitCode = 0): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[ingest-worker] ${signal} received; disconnecting`);
  try {
    await clickHouseWriterConsumer.disconnect();
    await closeClickHouseClients();
    console.log("[ingest-worker] shutdown complete");
  } finally {
    process.exit(exitCode);
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

main().catch(async (error) => {
  console.error("[ingest-worker] fatal error", error);
  await shutdown("fatal error", 1);
});
