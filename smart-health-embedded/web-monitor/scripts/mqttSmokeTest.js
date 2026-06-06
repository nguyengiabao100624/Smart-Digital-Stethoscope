const { createMqttControlPlane } = require("../src/mqttControlPlane");

async function main() {
  const plane = createMqttControlPlane({
    env: process.env,
    onTelemetry() {},
    onEvent() {},
  });
  if (!plane.enabled) {
    console.log("MQTT_URL is not set; mqtt smoke test skipped");
    return;
  }
  plane.publishCommand("smoke-device", { type: "ping", createdAt: new Date().toISOString() });
  await new Promise((resolve) => setTimeout(resolve, 500));
  plane.close();
  console.log("mqtt smoke test passed");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
