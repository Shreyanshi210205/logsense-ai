import type { FastifyInstance } from "fastify";
import { v4 as uuidv4 } from "uuid";
import type { IngestPayload } from "../../types/log.js";
import type { BatchIngester } from "../../services/BatchIngester.js";

const ingestBodySchema = {
  type: "object",
  required: ["events"],
  properties: {
    events: {
      type: "array",
      maxItems: 5000,
      items: {
        type: "object",
        required: ["event_type", "url", "latency_ms"],
        properties: {
          event_id: { type: "string" },
          timestamp: { type: "string" },
          event_type: { type: "string" },
          url: { type: "string" },
          latency_ms: { type: "number" },
          user_agent: { type: "string" },
          metadata: { type: "object" },
        },
      },
    },
  },
} as const;

export async function ingestRoutes(
  app: FastifyInstance,
  opts: { ingester: BatchIngester },
): Promise<void> {
  app.post<{ Body: IngestPayload }>(
    "/ingest",
    { schema: { body: ingestBodySchema } },
    async (request, reply) => {
      const now = new Date().toISOString();
      const events = request.body.events.map((e) => ({
        event_id: e.event_id || uuidv4(),
        timestamp: e.timestamp || now,
        event_type: e.event_type,
        url: e.url,
        latency_ms: e.latency_ms,
        user_agent: e.user_agent || request.headers["user-agent"] || "",
        metadata: e.metadata ?? {},
      }));

      opts.ingester.enqueue(events);

      return reply.code(202).send({
        accepted: events.length,
        buffered: opts.ingester.pendingCount,
      });
    },
  );
}
