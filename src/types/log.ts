export interface LogEvent {
  event_id: string;
  timestamp: string;
  event_type: string;
  url: string;
  latency_ms: number;
  user_agent: string;
  service: string;
  level: string;
  metadata: Record<string, unknown>;
}

export interface IngestEvent extends Omit<LogEvent, "event_id" | "timestamp" | "user_agent" | "service" | "level" | "metadata"> {
  event_id?: string;
  timestamp?: string;
  user_agent?: string;
  service?: string;
  level?: string;
  metadata?: Record<string, unknown>;
}

export interface IngestPayload {
  events: IngestEvent[];
}

export interface QueryPayload {
  question: string;
}

export interface QueryResponse {
  question: string;
  sql: string;
  result: Record<string, unknown>[];
}
