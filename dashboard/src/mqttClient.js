import mqtt from "mqtt";

const URL = import.meta.env.VITE_IOT_WEBSOCKET_URL;

export function connectTelemetry(onMessage, onStatus) {
  if (!URL) {
    onStatus?.("mock");
    return {
      end() {}
    };
  }

  const client = mqtt.connect(URL, {
    protocolVersion: 5,
    reconnectPeriod: 3000,
    clean: true
  });

  client.on("connect", () => {
    onStatus?.("connected");
    client.subscribe("env/+/telemetry");
    client.subscribe("env/+/status");
    client.subscribe("env/+/alerts");
  });
  client.on("reconnect", () => onStatus?.("reconnecting"));
  client.on("close", () => onStatus?.("closed"));
  client.on("error", (error) => onStatus?.(`error: ${error.message}`));
  client.on("message", (topic, payload) => {
    try {
      onMessage?.(topic, JSON.parse(payload.toString()));
    } catch {
      onMessage?.(topic, { raw: payload.toString() });
    }
  });

  return client;
}
