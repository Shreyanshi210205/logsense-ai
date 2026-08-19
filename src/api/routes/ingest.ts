import type { FastifyInstance } from "fastify";
import { v4 as uuidv4 } from "uuid";
import { publishEvents } from "../../messaging/kafka.js";
import type { IngestPayload } from "../../types/log.js";

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
          service: { type: "string" },
          level: { type: "string" },
          metadata: { type: "object" },
        },
      },
    },
  },
} as const;

export async function ingestRoutes(app: FastifyInstance): Promise<void> {
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
        service: e.service || getMetadataString(e.metadata, "service") || "unknown",
        level: e.level || getMetadataString(e.metadata, "level") || "info",
        metadata: e.metadata ?? {},
      }));

      try {
        // Kafka acknowledgement makes the 202 response a durable hand-off,
        // rather than an in-memory promise that disappears on restart.
        await publishEvents(events);
      } catch (error) {
        request.log.error(error, "Kafka event publication failed");
        return reply.code(503).send({ error: "Event pipeline is unavailable" });
      }

      return reply.code(202).send({
        accepted: events.length,
        queued: events.length,
      });
    },
  );
}

function getMetadataString(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
