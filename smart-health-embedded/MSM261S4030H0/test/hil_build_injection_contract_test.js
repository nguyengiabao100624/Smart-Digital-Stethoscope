const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const ini = fs.readFileSync(path.join(root, "platformio.ini"), "utf8");
const hook = fs.readFileSync(
  path.join(root, "scripts", "inject_hil_config.py"),
  "utf8",
);
const builder = fs.readFileSync(
  path.join(root, "scripts", "buildDeviceHilFirmware.mjs"),
  "utf8",
);

assert.match(
  ini,
  /\[env:esp32-s3-development\][\s\S]*?extra_scripts\s*=\s*pre:scripts\/inject_hil_config\.py/,
  "only the development environment may load the HIL configuration hook",
);
assert.doesNotMatch(
  ini.split("[env:esp32-s3-development]")[0],
  /inject_hil_config/,
  "the production environment must not load HIL credentials",
);
assert.match(
  ini,
  /\[env:esp32-s3-development\][\s\S]*?-DCORE_DEBUG_LEVEL=5/,
  "TLS diagnostics must be confined to the HIL development environment",
);
assert.doesNotMatch(
  ini.split("[env:esp32-s3-development]")[0],
  /CORE_DEBUG_LEVEL=5/,
  "production builds must not inherit verbose HIL diagnostics",
);
assert.match(hook, /SHCARE_HIL_CONFIG_HEADER/);
assert.match(hook, /header\.relative_to\(temp_root\)/);
assert.match(hook, /header\.name != "hil-config\.h"/);
assert.match(hook, /env\.Append\(CCFLAGS=\["-include", str\(header\)\]\)/);
assert.match(builder, /SHCARE_HIL_CONFIG_HEADER:\s*generatedHeaderPath/);
assert.match(builder, /#define SMART_HEALTH_HIL_RUNTIME_CONFIG 1/);
assert.match(builder, /#define SMART_HEALTH_BACKEND_HOST.*shcare-hil\.local/);
assert.match(builder, /#define SMART_HEALTH_HIL_BACKEND_CONNECT_IP/);
assert.match(builder, /path\.join\(runtimeDir, "server-ca\.crt"\)/);
assert.match(builder, /SHCARE_HIL_FIRMWARE_VERSION/);
assert.match(builder, /SHCARE_HIL_OTA_FORCED_AUTH_FAILURE/);
assert.match(builder, /SHCARE_HIL_RESET_OTA_STATE/);
assert.match(builder, /resetOtaState && !shouldUpload/);
assert.match(builder, /SHCARE_HIL_OTA_FORCED_AUTH_FAILURE may build an OTA artifact only/);
assert.match(builder, /ota-signing-private\.pem/);
assert.match(builder, /#define SMART_HEALTH_OTA_PUBLIC_KEY_PEM/);
assert.doesNotMatch(
  builder,
  /SMART_HEALTH_OTA_PRIVATE_KEY_PEM/,
  "the firmware builder must never inject an OTA private key",
);
assert.doesNotMatch(
  builder,
  /PLATFORMIO_BUILD_FLAGS\s*:/,
  "the builder must not rely on ignored transient project build flags",
);

process.stdout.write("HIL build injection contract: PASS\n");
