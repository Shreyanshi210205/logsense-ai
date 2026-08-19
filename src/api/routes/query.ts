import type { FastifyInstance } from "fastify";
import { getReaderClickHouseClient } from "../../db/client.js";
import { AnalyticAgent } from "../../services/AnalyticAgent.js";
import { SqlQueryValidator } from "../../services/SqlQueryValidator.js";
import type { QueryPayload, QueryResponse } from "../../types/log.js";

const queryBodySchema = {
  type: "object",
  required: ["question"],
  properties: {
    question: { type: "string", minLength: 3, maxLength: 1000 },
  },
} as const;

export async function queryRoutes(app: FastifyInstance): Promise<void> {
  const agent = new AnalyticAgent();
  const validator = new SqlQueryValidator();

  app.post<{ Body: QueryPayload }>(
    "/query",
    { schema: { body: queryBodySchema } },
    async (request, reply) => {
      const { question } = request.body;

      let sql: string;
      try {
        sql = validator.validateAndNormalize(await agent.textToSQL(question));
      } catch (error) {
        return reply.code(400).send({
          error: error instanceof Error ? error.message : "Generated query is invalid",
        });
      }

      const client = getReaderClickHouseClient();
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
