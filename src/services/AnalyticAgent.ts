import { GoogleGenAI } from "@google/genai";

const CLICKHOUSE_SCHEMA = `
Table: events (database: default)
Columns:
  - event_id     UUID
  - timestamp    DateTime64(3, 'UTC')
  - event_type   LowCardinality(String)   -- e.g. 'click', 'page_view', 'api_call', 'error'
  - url          String                   -- page or endpoint URL
  - latency_ms   Float32                  -- response / interaction latency in milliseconds
  - user_agent   String                   -- raw User-Agent header
  - metadata     JSON                     -- flexible key-value interaction data

Engine: MergeTree
ORDER BY (timestamp, event_type)
PARTITION BY toYYYYMM(timestamp)
`;

const SYSTEM_PROMPT = `You are a ClickHouse SQL expert embedded inside the SentientLog observability platform.

Given the following schema:
${CLICKHOUSE_SCHEMA}

Rules:
1. Output ONLY a single valid ClickHouse SQL query — no explanation, no markdown fences.
2. Always qualify ambiguous column references with the table name.
3. Use appropriate ClickHouse functions (quantile, toStartOfMinute, etc.) when relevant.
4. Default to the last 24 hours if no time range is specified: WHERE timestamp >= now() - INTERVAL 1 DAY
5. Limit results to 100 rows unless the user requests otherwise.
6. Never execute destructive operations (DROP, ALTER, TRUNCATE, DELETE).
`;

export class AnalyticAgent {
  private ai: GoogleGenAI;
  private model: string;

  constructor() {
    this.ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY!,
    });

    this.model =
        process.env.GEMINI_MODEL ||
        "gemini-2.5-flash";
}

  async textToSQL(question: string): Promise<string> {
    const response = await this.ai.models.generateContent({
    model: this.model,
    contents: `${SYSTEM_PROMPT}

User Question:
${question}`,
});

const sql = response.text;

    if (!sql) {
      throw new Error("AnalyticAgent returned an empty response");
    }
    console.log(sql);
    return sql;
  }
}
