import type { FastifyInstance } from "fastify";
import { isKafkaReady } from "../messaging/kafka.js";
import { ingestRoutes } from "./routes/ingest.js";
import { queryRoutes } from "./routes/query.js";

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(
    async (scoped) => {
      await ingestRoutes(scoped);
      await queryRoutes(scoped);
    },
    { prefix: "/api/v1" },
  );

  app.get("/health", async (_request, reply) => {
    if (!isKafkaReady()) {
      return reply.code(503).send({ status: "unavailable", kafka: "disconnected" });
    }
    return { status: "ok", kafka: "connected" };
  });
}
