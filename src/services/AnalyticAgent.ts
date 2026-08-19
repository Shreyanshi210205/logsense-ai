import { GoogleGenAI } from "@google/genai";

const CLICKHOUSE_SCHEMA = `
Table: sentient_log.events
Columns:
  - event_id     UUID
  - timestamp    DateTime64(3, 'UTC')
  - event_type   LowCardinality(String) -- e.g. 'click', 'page_view', 'api_call', 'error'
  - url          String
  - latency_ms   Float32
  - user_agent   String
  - metadata     JSON

Engine: MergeTree
ORDER BY (timestamp, event_type)
PARTITION BY toYYYYMM(timestamp)
`;

const SYSTEM_PROMPT = `You are a ClickHouse SQL expert embedded inside the SentientLog observability platform.

Given the following schema:
${CLICKHOUSE_SCHEMA}

Rules:
1. Output raw SQL only: no explanation, markdown fences, or conversational text.
2. Output exactly one statement, and it must be a SELECT statement. A WITH clause is allowed only when its final statement is SELECT.
3. Query only sentient_log.events. Never reference another table, database, table function, or system table.
4. Always qualify ambiguous column references with the table name.
5. Use appropriate ClickHouse functions (quantile, toStartOfMinute, etc.) when relevant.
6. If the user does not specify a date range, include: WHERE timestamp >= now() - INTERVAL 1 DAY.
7. Every query must end with LIMIT 100, including when the user asks for more rows.
8. Never output write, DDL, administrative, multi-statement, or external-data SQL.
`;

export class AnalyticAgent {
  private readonly ai: GoogleGenAI;
  private readonly model: string;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    this.model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  }

  async textToSQL(question: string): Promise<string> {
    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: `${SYSTEM_PROMPT}

User Question:
${question}`,
    });

    const sql = response.text?.trim();
    if (!sql) throw new Error("AnalyticAgent returned an empty response");
    return sql;
  }
}
