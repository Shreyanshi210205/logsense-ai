export interface LogEvent {
  event_id: string;
  timestamp: string;
  event_type: string;
  url: string;
  latency_ms: number;
  user_agent: string;
  metadata: Record<string, unknown>;
}

export interface IngestPayload {
  events: LogEvent[];
}

export interface QueryPayload {
  question: string;
}

export interface QueryResponse {
  question: string;
  sql: string;
  result: Record<string, unknown>[];
}
