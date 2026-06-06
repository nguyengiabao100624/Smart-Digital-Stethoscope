function createMqttControlPlane(options = {}) {
  const env = options.env || process.env;
  const mqttUrl = env.MQTT_URL;
  if (!mqttUrl) {
    return {
      enabled: false,
      publishCommand() {},
      close() {},
    };
  }

  const mqtt = require("mqtt");
  const client = mqtt.connect(mqttUrl, {
    username: env.MQTT_USERNAME || undefined,
    password: env.MQTT_PASSWORD || undefined,
    clientId: env.MQTT_CLIENT_ID || `smart-health-backend-${process.pid}`,
  });

  const onTelemetry = options.onTelemetry || (() => {});
  const onEvent = options.onEvent || (() => {});

  client.on("connect", () => {
    client.subscribe(["devices/+/telemetry", "devices/+/events"]);
  });

  client.on("message", (topic, payload) => {
    const match = /^devices\/([^/]+)\/(telemetry|events)$/.exec(topic);
    if (!match) return;
    let body = {};
    try {
      body = JSON.parse(payload.toString("utf8"));
    } catch {
      body = { raw: payload.toString("utf8") };
    }
    const [, deviceId, kind] = match;
    if (kind === "telemetry") {
      onTelemetry(deviceId, body);
    } else {
      onEvent(deviceId, body);
    }
  });

  return {
    enabled: true,
    publishCommand(deviceId, command) {
      client.publish(`devices/${deviceId}/commands`, JSON.stringify(command || {}), { qos: 1 });
    },
    close() {
      client.end(true);
    },
  };
}

module.exports = {
  createMqttControlPlane,
};
