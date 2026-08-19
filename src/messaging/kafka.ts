import { Kafka, logLevel, type Consumer, type Producer } from "kafkajs";
import type { LogEvent } from "../types/log.js";

const brokers = (process.env.KAFKA_BROKERS ?? "localhost:9094")
  .split(",")
  .map((broker) => broker.trim())
  .filter(Boolean);
const topic = process.env.KAFKA_RAW_EVENTS_TOPIC ?? "raw-events";

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID ?? "sentient-log-api",
  brokers,
  logLevel: logLevel.NOTHING,
});

let producer: Producer | null = null;
let producerReady = false;

/** Dedicated consumer group for independently scalable ClickHouse writers. */
export const clickHouseWriterConsumer: Consumer = kafka.consumer({
  groupId: "clickhouse-writers-group",
  sessionTimeout: 30_000,
  heartbeatInterval: 3_000,
});

export const rawEventsTopic = topic;

function getProducer(): Producer {
  if (!producer) {
    producer = kafka.producer({ allowAutoTopicCreation: true });
    producer.on(producer.events.CONNECT, () => { producerReady = true; });
    producer.on(producer.events.DISCONNECT, () => { producerReady = false; });
  }
  return producer;
}

export async function connectKafkaProducer(): Promise<void> {
  const sharedProducer = getProducer();
  await sharedProducer.connect();
  producerReady = true;
}

export async function publishEvents(events: LogEvent[]): Promise<void> {
  if (!producerReady) throw new Error("Kafka producer is not connected");

  await getProducer().send({
    topic,
    acks: -1,
    messages: events.map((event) => ({
      // Keeps a tenant/service's ordered stream in a consistent partition.
      key: getPartitionKey(event),
      value: JSON.stringify(event),
    })),
  });
}

export function isKafkaReady(): boolean {
  return producerReady;
}

export async function disconnectKafkaProducer(): Promise<void> {
  if (producer) await producer.disconnect();
  producerReady = false;
}

function getPartitionKey(event: LogEvent): string {
  const tenantId = event.metadata.tenant_id;
  if (typeof tenantId === "string" && tenantId) return tenantId;

  const service = event.service || event.metadata.service;
  if (typeof service === "string" && service) return service;

  return event.url;
}
