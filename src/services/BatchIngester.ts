import { getWriterClickHouseClient } from "../db/client.js";
import type { LogEvent } from "../types/log.js";

export class BatchIngester {
  private buffer: LogEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;

  private readonly batchSize: number;
  private readonly flushIntervalMs: number;

  constructor(
    batchSize = Number(process.env.FLUSH_BATCH_SIZE) || 1000,
    flushIntervalMs = Number(process.env.FLUSH_INTERVAL_MS) || 5_000,
  ) {
    this.batchSize = batchSize;
    this.flushIntervalMs = flushIntervalMs;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.flush(), this.flushIntervalMs);
    this.timer.unref();
  }

  stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    return this.flush();
  }

  enqueue(events: LogEvent[]): void {
    this.buffer.push(...events);
    if (this.buffer.length >= this.batchSize) {
      void this.flush();
    }
  }

  get pendingCount(): number {
    return this.buffer.length;
  }

  async flush(): Promise<void> {
    if (this.flushing || this.buffer.length === 0) return;
    this.flushing = true;

    const batch = this.buffer.splice(0, this.batchSize);

    try {
      const client = getWriterClickHouseClient();
      await client.insert({
        table: "sentient_log.events",
        values: batch.map((e) => ({
          ...e,
          timestamp: e.timestamp
          ? new Date(e.timestamp).toISOString()
              .replace('T', ' ')
              .replace(/\.\d{3}Z$/, '')   // ← removes .811Z at the end
          : new Date().toISOString()
              .replace('T', ' ')
              .replace(/\.\d{3}Z$/, ''),
          metadata: e.metadata ?? {},
        })),
        format: "JSONEachRow",
      });
      console.log(`[BatchIngester] flushed ${batch.length} rows`);
    } catch (err) {
      console.error("[BatchIngester] flush failed, re-queuing", err);
    } finally {
      this.flushing = false;
    }
  }
}
