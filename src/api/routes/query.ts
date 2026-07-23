import type { FastifyInstance } from "fastify";
import { getClickHouseClient } from "../../db/client.js";
import { AnalyticAgent } from "../../services/AnalyticAgent.js";
import type { QueryPayload, QueryResponse } from "../../types/log.js";

const FORBIDDEN_PATTERN = /\b(DROP|ALTER|TRUNCATE|DELETE|INSERT|UPDATE|CREATE)\b/i;

const queryBodySchema = {
  type: "object",
  required: ["question"],
  properties: {
    question: { type: "string", minLength: 3, maxLength: 1000 },
  },
} as const;

export async function queryRoutes(app: FastifyInstance): Promise<void> {
  const agent = new AnalyticAgent();

  app.post<{ Body: QueryPayload }>(
    "/query",
    { schema: { body: queryBodySchema } },
    async (request, reply) => {
      const { question } = request.body;

      const sql = await agent.textToSQL(question);

      if (FORBIDDEN_PATTERN.test(sql)) {
        return reply.code(400).send({
          error: "Generated query contains a forbidden operation",
          sql,
        });
      }

      const client = getClickHouseClient();
      const resultSet = await client.query({
        query: sql,
        format: "JSONEachRow",
      });

      const rows = await resultSet.json() as Record<string, unknown>[];

      const response: QueryResponse = { question, sql, result: rows };
      return reply.send(response);
    },
  );
}
