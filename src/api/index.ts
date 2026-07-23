import type { FastifyInstance } from "fastify";
import type { BatchIngester } from "../services/BatchIngester.js";
import { ingestRoutes } from "./routes/ingest.js";
import { queryRoutes } from "./routes/query.js";

export async function registerRoutes(
  app: FastifyInstance,
  ingester: BatchIngester,
): Promise<void> {
  await app.register(
    async (scoped) => {
      await ingestRoutes(scoped, { ingester });
      await queryRoutes(scoped);
    },
    { prefix: "/api/v1" },
  );

  app.get("/health", async () => ({ status: "ok" }));
}
