import "dotenv/config";
import Fastify from "fastify";
import { registerRoutes } from "./api/index.js";
import { closeClickHouseClients } from "./db/client.js";
import { connectKafkaProducer, disconnectKafkaProducer } from "./messaging/kafka.js";

async function main(): Promise<void> {
  const isProd = process.env.NODE_ENV === "production";

  const app = Fastify({
    logger: isProd
      ? { level: "info" }
      : {
          level: "info",
          transport: {
            target: "pino-pretty",
            options: { translateTime: "HH:MM:ss Z", ignore: "pid,hostname" },
          },
        },
    trustProxy: true,
  });

  // Do not accept HTTP traffic until the shared producer can reach Kafka.
  await connectKafkaProducer();
  await registerRoutes(app);

  const shutdown = async (): Promise<void> => {
    app.log.info("shutting down...");
    await disconnectKafkaProducer();
    await closeClickHouseClients();
    await app.close();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  const port = Number(process.env.PORT) || 3100;
  const host = process.env.HOST ?? "0.0.0.0";

  await app.listen({ port, host });
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
