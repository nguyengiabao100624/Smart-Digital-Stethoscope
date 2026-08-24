const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(projectRoot, "src", "main.cpp"), "utf8");
const protocolSource = fs.readFileSync(
  path.join(
    projectRoot,
    "lib",
    "ShcareDeviceProtocol",
    "src",
    "ShcareDeviceProtocol.cpp",
  ),
  "utf8",
);
const protocolHeader = fs.readFileSync(
  path.join(
    projectRoot,
    "lib",
    "ShcareDeviceProtocol",
    "src",
    "ShcareDeviceProtocol.h",
  ),
  "utf8",
);

function section(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

const ota = section("bool performCloudOta(", "void sendCommandProtocolError(");
const otaReceiptStart = source.lastIndexOf("bool persistPendingOtaReceipt(");
assert.notEqual(otaReceiptStart, -1, "missing OTA receipt implementation");
const otaReceiptEnd = source.indexOf(
  "bool persistPendingOtaStatus(",
  otaReceiptStart,
);
assert.notEqual(otaReceiptEnd, -1, "missing OTA receipt implementation end");
const otaReceipt = source.slice(otaReceiptStart, otaReceiptEnd);
const command = section("void handleCloudCommand(", "void handleCloudMessage(");
const cloudMessage = section("void handleCloudMessage(", "void setupCloudSocket(");
const bootHealth = section(
  "void beginPendingFirmwareHealthCheck() {",
  "bool pendingFirmwareHealthReady()",
);
const rollback = section(
  "void handlePendingFirmwareHealth() {",
  "void answerCloudAuthChallenge(",
);
const confirmation = section(
  "bool finalizeConfirmedOtaDurably()",
  "void handlePendingFirmwareHealth()",
);
const safeMode = section(
  "bool otaRecoveryRuntimeServicesAllowed() {",
  "void beginPendingFirmwareHealthCheck()",
);
const lanOta = section("void setupArduinoOta()", "void startStationServices()");
const stationServices = section(
  "void startStationServices()",
  "void handleDeviceServices()",
);
const services = section("void handleDeviceServices()", "int16_t clamp16(");
const setupI2s = section("bool setupI2S(bool recoveryAttempt)", "void handleI2SRecovery()");
const setupPortal = section(
  "void runSetupPortal(const char *reason) {",
  "String jsonEscape(",
);
const setupWifi = section("void setupWiFi()", "void setupAudioUdp()");
const runtimeSetup = section("void setup() {", "void loop() {");
const runtimeLoop = source.slice(source.indexOf("void loop() {"));
const cloudEvent = section(
  "bool sendCloudEvent(const char *type, const char *status, const char *detail)",
  "bool sendCloudTelemetry(",
);
const audioStart = section(
  'if (command.type == "audio.session.start") {',
  'if (command.type == "audio.session.stop") {',
);
const audioSend = section(
  "void drainAudioCaptureQueue(std::size_t maxPackets) {",
  "void startMdns()",
);

assert.match(audioStart, /payloadString\("frameEncoding"\)/);
assert.match(audioStart, /evaluateAudioSessionContract\(/);
assert.match(audioSend, /buildAudioFrameV2\(/);
assert.doesNotMatch(
  audioSend,
  /sendBinary\([^\n]*pcmBuffer/,
  "new firmware must not emit receiver-only raw PCM v1",
);
assert.match(protocolHeader, /"shcare_audio_v2"/);
assert.match(protocolSource, /LegacyReceiverOnly/);
assert.match(protocolSource, /validAudioV2SequenceFlags\(sequence, flags\)/);

assert.match(source, /bool otaInProgress = false;/);
assert.match(command, /evaluateDeviceCommandAdmission\(/);
assert.match(command, /DEVICE_BUSY_OTA/);
assert.match(command, /OTA_RECORDING_ACTIVE/);

assert.match(ota, /beginBlockingOtaRuntime\(/);
assert.match(ota, /endBlockingOtaRuntime\(/);
assert.ok(
  ota.indexOf("beginBlockingOtaRuntime(") < ota.indexOf("http.GET()"),
  "the watched loop task must leave TWDT before blocking HTTP/flash work",
);
assert.doesNotMatch(ota, /resetAudioSession\(\)/);
assert.match(ota, /cloudSocket\.poll\(\)/);
assert.ok(
  (ota.match(/cloudSocket\.poll\(\)/g) || []).length >= 2,
  "WSS must be polled in both continuously-readable and idle HTTP branches",
);
assert.match(ota, /http\.addHeader\("Authorization", authorization/);
assert.ok(
  ota.indexOf('http.addHeader("Authorization", authorization') <
    ota.indexOf("http.GET()"),
  "the transient OTA bearer must be attached before the firmware GET",
);
assert.doesNotMatch(ota, /Serial\.(?:print|println)\([^\n]*downloadAuthorization/);
assert.match(command, /handlePendingOtaCommandFence\(command\)/);
assert.match(
  command,
  /CommandParseCode::Expired[\s\S]*handlePendingOtaCommandFence\(result\.command\)/,
  "expired retries must still consult the durable OTA fence",
);
assert.ok(
  command.indexOf("handlePendingOtaCommandFence(command)") <
    command.indexOf("validateOtaManifest("),
  "durable OTA replay/conflict must be resolved before version validation",
);
assert.match(command, /persistOtaBootOutcome\("prepared"\)/);
assert.match(
  command,
  /persistPendingOtaReceipt\(command, ota\.manifest,[\s\S]*manifestFingerprint\)/,
);
assert.ok(
  command.indexOf('persistOtaBootOutcome("prepared")') <
    command.indexOf("persistPendingOtaReceipt(command, ota.manifest"),
  "the stale boot marker must be reset before installing the new OTA fence",
);
assert.ok(
  command.indexOf("persistPendingOtaReceipt(command, ota.manifest") <
    command.indexOf("const bool applied = performCloudOta("),
  "the OTA command/correlation receipt must be durable before download or reboot",
);
assert.match(ota, /evaluatePendingOtaCommand\(/);
assert.match(ota, /otaBootOutcome != "prepared"/);
assert.match(
  otaReceipt,
  /if \(pendingOtaReceiptReady\) \{[\s\S]*return false;\s*\}/,
  "an existing receipt must never authorize another OTA side effect",
);
assert.ok(
  ota.indexOf("evaluatePendingOtaCommand(") <
    ota.indexOf("beginBlockingOtaRuntime("),
  "the exact durable OTA binding must be verified before any blocking side effect",
);
assert.match(source, /otaCommandEffectFingerprint\(command\)/);
assert.match(source, /entry\.effectFingerprint != effectFingerprint/);
assert.match(protocolSource, /manifestFingerprint/);
const effectBindingStart = protocolSource.indexOf(
  "std::string buildOtaEffectBindingMessage(",
);
assert.notEqual(effectBindingStart, -1, "missing OTA effect binding helper");
const effectBindingEnd = protocolSource.indexOf(
  "std::string buildCommandStateJson(",
  effectBindingStart,
);
const effectBinding = protocolSource.slice(effectBindingStart, effectBindingEnd);
for (const field of [
  "url=",
  "firmwareVersion=",
  "sha256=",
  "signature=",
  "hardwareTarget=",
  "partitionTarget=",
  "minimumProtocolVersion=",
]) {
  assert.match(effectBinding, new RegExp(field));
}
assert.doesNotMatch(effectBinding, /downloadAuthorization/);

assert.match(cloudMessage, /persistTerminalCommand\(/);
assert.match(cloudMessage, /pendingOtaReceipt\.manifestFingerprint/);
assert.ok(
  cloudMessage.indexOf("persistTerminalCommand(") <
    cloudMessage.indexOf("erasePendingOtaReceipt()"),
  "the bounded OTA tombstone must be durable before receipt cleanup",
);

assert.match(cloudEvent, /document\["commandId"\] = commandId/);
assert.match(cloudEvent, /document\["correlationId"\] = correlationId/);
assert.match(cloudEvent, /document\["otaId"\] = otaId/);
assert.match(cloudEvent, /document\["audioStatus"\] = eventStatus/);
assert.match(
  cloudEvent,
  /if \(otaEvent\) \{\s*document\["otaStatus"\] = eventStatus;\s*\} else if \(eventType\.rfind\("audio\.", 0\) == 0\) \{\s*document\["audioStatus"\] = eventStatus;/,
);

assert.match(source, /esp_task_wdt_delete\(nullptr\)/);
assert.match(source, /esp_task_wdt_add\(nullptr\)/);
assert.match(source, /CONFIG_ESP_TASK_WDT_TIMEOUT_S/);

assert.match(rollback, /evaluateOtaRollbackAction\(/);
assert.match(rollback, /otaRollbackTerminal = true/);
assert.doesNotMatch(rollback, /otaRollbackAttempted = false/);
for (const reason of [
  "RollbackUnavailable",
  "RollbackIntentPersistenceFailed",
  "RollbackApiReturned",
]) {
  assert.match(
    rollback,
    new RegExp(`enterOtaRecoverySafeMode\\([\\s\\S]*?${reason}\\)`),
    `runtime rollback failure ${reason} must tear down live services`,
  );
}
assert.ok(
  rollback.indexOf("esp_ota_check_rollback_is_possible()") <
    rollback.indexOf('sendCloudEvent("ota.rollback"'),
  "rollback must not be announced before feasibility is known",
);
assert.ok(
  rollback.indexOf('persistOtaBootOutcome("rollback_requested")') <
    rollback.indexOf('sendCloudEvent("ota.rollback"'),
  "rollback intent must be durable before it is announced or applied",
);
assert.match(bootHealth, /otaBootOutcome == "rollback_unavailable"/);
assert.match(bootHealth, /otaBootOutcome == "rollback_failed"/);
assert.match(bootHealth, /otaRollbackTerminal = true/);
assert.match(bootHealth, /evaluatePendingOtaRecovery\(/);
assert.match(bootHealth, /PendingOtaRecoveryAction::RollbackRequired/);
assert.ok(
  bootHealth.indexOf('persistOtaBootOutcome("rollback_requested")') <
    bootHealth.indexOf("esp_ota_mark_app_invalid_rollback_and_reboot()"),
  "an unbound pending image must durably request rollback before applying it",
);
assert.ok(
  bootHealth.indexOf('persistOtaBootOutcome("rolled_back")') <
    bootHealth.indexOf('persistPendingOtaStatus("rolled_back")'),
  "rollback inference must persist its boot marker before reporting rolled_back",
);
assert.match(bootHealth, /persistPendingOtaStatus\("failed"\)/);

assert.ok(
  confirmation.indexOf('persistOtaBootOutcome("confirming")') <
    confirmation.indexOf("esp_ota_mark_app_valid_cancel_rollback()"),
  "confirmation intent must be durable before rollback is cancelled",
);
assert.ok(
  confirmation.indexOf('persistOtaBootOutcome("confirmed")') <
    confirmation.indexOf('persistPendingOtaStatus("confirmed")') &&
    confirmation.indexOf('persistPendingOtaStatus("confirmed")') <
      confirmation.indexOf('sendCloudEvent("ota.confirmed"'),
  "confirmed must not be emitted before marker and receipt are durable",
);
assert.match(confirmation, /pendingOtaConfirmationPersistence = true/);

const rollbackRequiredStart = bootHealth.indexOf(
  "shcare::PendingOtaRecoveryAction::RollbackRequired",
);
const awaitBootHealthStart = bootHealth.indexOf(
  "shcare::PendingOtaRecoveryAction::AwaitBootHealth",
  rollbackRequiredStart,
);
assert.notEqual(rollbackRequiredStart, -1, "missing rollback-required branch");
assert.notEqual(awaitBootHealthStart, -1, "missing await-health branch");
const rollbackRequired = bootHealth.slice(
  rollbackRequiredStart,
  awaitBootHealthStart,
);
for (const reason of [
  "RollbackUnavailable",
  "RollbackIntentPersistenceFailed",
  "RollbackApiReturned",
]) {
  assert.match(
    rollbackRequired,
    new RegExp(`enterOtaRecoverySafeMode\\([\\s\\S]*?${reason}\\)`),
    `${reason} must enter fail-closed OTA recovery safe mode`,
  );
}
assert.doesNotMatch(
  rollbackRequired,
  /startStationServices\(|setupI2S\(|setupWiFi\(|setupAudioUdp\(|handleCloudCommand\(|sendAudio(?:Cloud|Udp)\(/,
  "rollback failure branches must not start station, control, or audio services",
);

assert.match(safeMode, /otaRecoverySafeMode = true/);
assert.match(safeMode, /otaRecoverySafeModeReason = reason/);
assert.match(safeMode, /pendingFirmwareVerification = false/);
assert.match(safeMode, /cloudConnected = false/);
assert.match(safeMode, /udpAudioReady = false/);
assert.match(safeMode, /i2sReady = false/);
assert.match(safeMode, /cloudSocket\.close\(\)/);
assert.match(safeMode, /audioUdp\.stop\(\)/);
assert.match(safeMode, /setupServer\.stop\(\)/);
assert.match(safeMode, /setupDns\.stop\(\)/);
assert.match(safeMode, /MDNS\.end\(\)/);
assert.match(safeMode, /WiFi\.softAPdisconnect\(true\)/);
assert.match(safeMode, /WiFi\.disconnect\(true, false\)/);
assert.match(safeMode, /WiFi\.mode\(WIFI_OFF\)/);
assert.match(safeMode, /releaseI2SDriver\(\)/);
assert.match(safeMode, /maintainTaskWatchdog\(\)/);
assert.match(safeMode, /handleFactoryResetButton\(\)/);
assert.match(safeMode, /delay\(25\)/);
assert.doesNotMatch(
  safeMode,
  /setupWiFi\(|setupCloudSocket\(|connectCloudSocketIfNeeded\(|setupI2S\(|startStationServices\(|handleCloudCommand\(|sendAudio(?:Cloud|Udp)\(/,
  "safe-mode handler must expose only watchdog-safe physical recovery",
);

assert.match(stationServices, /if \(!otaRecoveryRuntimeServicesAllowed\(\)\) \{\s*return;/);
assert.match(setupI2s, /if \(!otaRecoveryRuntimeServicesAllowed\(\)\) \{\s*return false;/);
assert.match(services, /if \(!otaRecoveryRuntimeServicesAllowed\(\)\) \{\s*return;/);
const setupGate = runtimeSetup.indexOf("if (!otaRecoveryRuntimeServicesAllowed())");
assert.notEqual(setupGate, -1, "setup must gate OTA recovery safe mode");
for (const serviceStart of [
  "loadRuntimeConfig()",
  "setupI2S(false)",
  "setupWiFi()",
  "setupAudioUdp()",
  "startStationServices()",
]) {
  assert.ok(
    setupGate < runtimeSetup.indexOf(serviceStart),
    `setup safe-mode gate must precede ${serviceStart}`,
  );
}
const loopGate = runtimeLoop.indexOf("if (!otaRecoveryRuntimeServicesAllowed())");
assert.notEqual(loopGate, -1, "loop must gate OTA recovery safe mode");
assert.ok(
  loopGate < runtimeLoop.indexOf("handleDeviceServices()") &&
    loopGate < runtimeLoop.indexOf("handleWiFiReconnect()") &&
    loopGate < runtimeLoop.indexOf("drainAudioCaptureQueue(2)"),
  "loop safe-mode gate must precede reconnect, control, and audio services",
);
assert.match(runtimeLoop, /handleOtaRecoverySafeMode\(\);\s*return;/);

assert.match(protocolSource, /OtaRecoverySafeModeReason::None/);
assert.match(protocolSource, /return reason == OtaRecoverySafeModeReason::None/);

const pendingHealthCall = "handlePendingFirmwareHealth();";
const portalHealthCalls = [
  ...setupPortal.matchAll(/handlePendingFirmwareHealth\(\);/g),
];
assert.equal(
  portalHealthCalls.length,
  6,
  "every blocking setup-portal health call must remain explicitly audited",
);
for (const call of portalHealthCalls) {
  const afterCall = setupPortal.slice(call.index + pendingHealthCall.length);
  assert.match(
    afterCall,
    /^\s*if \(!otaRecoveryRuntimeServicesAllowed\(\)\) \{\s*handleOtaRecoverySafeMode\(\);\s*return;\s*\}/,
    "setup-portal work must return immediately after OTA safe-mode activation",
  );
}
assert.equal(
  (setupPortal.match(/handleFactoryResetButton\(\);/g) || []).length,
  portalHealthCalls.length,
  "every blocking setup-portal loop must retain physical factory recovery",
);

const portalCallSites = [...setupWifi.matchAll(/runSetupPortal\([^;]+\);/g)];
assert.equal(portalCallSites.length, 2, "all setup-portal callers must be gated");
for (const call of portalCallSites) {
  const afterCall = setupWifi.slice(call.index + call[0].length);
  assert.match(
    afterCall,
    /^\s*if \(!otaRecoveryRuntimeServicesAllowed\(\)\) \{\s*return;\s*\}/,
    "safe-mode return from the portal must not resume WiFi startup",
  );
}

assert.doesNotMatch(lanOta, /resetAudioSession\(\)/);
assert.match(services, /otaReady && !audioSessionActive && !otaInProgress/);

console.log("firmware runtime source contract: PASS");
