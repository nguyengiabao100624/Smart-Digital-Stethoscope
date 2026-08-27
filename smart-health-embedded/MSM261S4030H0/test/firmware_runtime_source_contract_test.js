const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const source = fs.readFileSync(path.join(projectRoot, "src", "main.cpp"), "utf8");
const otaTrustAnchorPath = path.join(
  projectRoot,
  "include",
  "shcare_ota_trust_anchor.h",
);
assert.equal(
  fs.existsSync(otaTrustAnchorPath),
  true,
  "production firmware must pin the Shcare OTA public key",
);
const otaTrustAnchor = fs.readFileSync(otaTrustAnchorPath, "utf8");
assert.match(source, /#include\s+"shcare_ota_trust_anchor\.h"/);
const otaPublicKeyMatch = /R"SHCARE_OTA\((-----BEGIN PUBLIC KEY-----[\s\S]+?-----END PUBLIC KEY-----)\r?\n\)SHCARE_OTA"/.exec(
  otaTrustAnchor,
);
assert.ok(otaPublicKeyMatch, "OTA trust anchor must use the bounded raw PEM literal");
const otaPublicKey = crypto.createPublicKey(otaPublicKeyMatch[1]);
assert.equal(otaPublicKey.asymmetricKeyType, "rsa");
assert.ok(
  Number(otaPublicKey.asymmetricKeyDetails?.modulusLength || 0) >= 2048,
  "OTA trust anchor must use RSA-2048 or stronger",
);
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
const wifiDiagnostics = section(
  "void handleWifiDiagnosticEvent(arduino_event_t *event)",
  "bool startSmartConfigProvisioning(",
);
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
const cloudConnect = section(
  "void connectCloudSocketIfNeeded()",
  "void handleCloudSocket()",
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
assert.match(
  source,
  /#if CONFIG_APP_ROLLBACK_ENABLE\s+extern "C" bool verifyRollbackLater\(\) \{ return true; \}\s+#endif/,
  "Arduino's eager rollback verifier must be deferred until Shcare boot health is durable",
);
assert.match(command, /evaluateDeviceCommandAdmission\(/);
assert.match(command, /DEVICE_BUSY_OTA/);
assert.match(command, /OTA_RECORDING_ACTIVE/);
assert.match(source, /SC_TYPE_ESPTOUCH_V2/);
assert.match(source, /"shcare\/esptouch-v2\/aes128\\n"/);
assert.match(source, /"shcare\/esptouch-v2\/device\\n"/);
assert.match(source, /bool smartConfigV2GoldenVectorMatches\(\)/);
assert.match(runtimeSetup, /smartConfigKdfVerified = smartConfigV2GoldenVectorMatches\(\);/);
assert.match(source, /0x0b, 0x0b, 0xeb, 0x38/);
assert.match(source, /esp_smartconfig_get_rvd_data/);
assert.match(source, /WiFi\.persistent\(false\)/);
assert.match(source, /constexpr time_t TLS_CERT_TIME_FLOOR = 1700000000;/);
assert.match(source, /bool hasTrustedClock\(\) \{ return time\(nullptr\) >= TLS_CERT_TIME_FLOOR; \}/);
assert.match(source, /#define SMART_HEALTH_HIL_CLOCK_EPOCH 0/);
assert.match(source, /static_assert\(!\(SMART_HEALTH_HIL_RUNTIME_CONFIG && SMART_HEALTH_PRODUCTION_PROFILE\)/);
const hilClockBootstrap = section("void bootstrapHilTrustedClock()", "bool isProductionProfile()");
assert.match(hilClockBootstrap, /#if SMART_HEALTH_HIL_RUNTIME_CONFIG/);
assert.match(hilClockBootstrap, /SMART_HEALTH_HIL_CLOCK_EPOCH >= TLS_CERT_TIME_FLOOR/);
assert.match(hilClockBootstrap, /settimeofday\(&bootstrapTime, nullptr\)/);
assert.match(hilClockBootstrap, /TLS validation remains enabled\./);
assert.doesNotMatch(hilClockBootstrap, /setInsecure\(/);
const authenticatedClockSync = section("bool synchronizeClockFromAuthenticatedServer(", "bool isProductionProfile()");
assert.match(authenticatedClockSync, /parseAuthAcceptedServerTimeEpochMillis/);
assert.match(authenticatedClockSync, /TLS_CERT_TIME_FLOOR/);
assert.match(authenticatedClockSync, /settimeofday\(&authenticatedTime, nullptr\)/);
assert.match(authenticatedClockSync, /authenticatedServerEpochBaseMs = serverEpochMs/);
assert.match(authenticatedClockSync, /authenticatedServerEpochAtUptimeMs = static_cast<uint32_t>\(millis\(\)\)/);
assert.doesNotMatch(authenticatedClockSync, /setInsecure\(/);
const cloudAuth = section("void handleCloudAuthMessage(", "void sendCommandState(");
assert.match(cloudAuth, /authAcceptanceMatchesCredentialAttempt/);
assert.match(cloudAuth, /synchronizeClockFromAuthenticatedServer\(accepted\.message\)/);
assert.match(cloudAuth, /AUTH_SERVER_TIME_INVALID/);
assert.match(
  cloudAuth,
  /if \(pendingFirmwareVerification\) \{\s*pendingFirmwareBootStartedMs = millis\(\) - OTA_BOOT_HEALTH_TIMEOUT_MS;/,
  "an OTA image rejected by authenticated WSS must enter the guarded rollback path without waiting out the full window",
);
assert.match(cloudAuth, /rollback is scheduled/);
const currentClock = section("int64_t currentEpochMillis()", "std::uint32_t nextAudioSessionGeneration");
assert.match(currentClock, /cloudConnected/);
assert.match(currentClock, /authenticatedServerEpochBaseMs/);
assert.match(currentClock, /authenticatedServerEpochAtUptimeMs/);
assert.match(cloudConnect, /cloudSecurityDecision\.transport == shcare::CloudTransport::Wss/);
assert.match(cloudConnect, /!hasTrustedClock\(\)/);
assert.match(cloudConnect, /WSS waits for trusted network time before certificate validation\./);
assert.doesNotMatch(
  cloudConnect,
  /setInsecure\(/,
  "WSS must wait for a trusted clock rather than disabling certificate validation",
);
assert.match(source, /const unsigned long WIFI_ASSOCIATION_TIMEOUT_MS = 15000;/);
const wifiReconnect = section("void handleWiFiReconnect()", "void setupWiFi()");
assert.match(wifiReconnect, /bootstrapHilTrustedClock\(\);/);
assert.match(
  wifiReconnect,
  /std::max\(wifiReconnectDelayMs, WIFI_ASSOCIATION_TIMEOUT_MS\)/,
  "a WPA association must complete before reconnect retry can replace it",
);
assert.match(source, /#define SMART_HEALTH_HIL_RUNTIME_CONFIG 0/);
const hilTlsPreflight = section("void connectCloudSocketIfNeeded()", "void handleCloudSocket()");
assert.match(hilTlsPreflight, /#if SMART_HEALTH_HIL_RUNTIME_CONFIG/);
assert.match(hilTlsPreflight, /Local HIL TLS preflight: epoch=%lld, caTrust=%s/);
assert.doesNotMatch(hilTlsPreflight, /setInsecure\(/);
assert.match(source, /class HilSecureCloudTcpClient final/);
assert.match(source, /client\.connect\(\s*target, port, host\.c_str\(\), BACKEND_CA_CERT, nullptr, nullptr\)/);
assert.match(source, /#if SMART_HEALTH_PRODUCTION_PROFILE \|\| SMART_HEALTH_HIL_RUNTIME_CONFIG/);
const runtimeConfig = section("void loadRuntimeConfig()", "bool saveRuntimeConfig()");
assert.match(
  runtimeConfig,
  /!SMART_HEALTH_HIL_RUNTIME_CONFIG && devicePrefs\.isKey\("backendHost"\)/,
  "a HIL fixture must not inherit an unrelated persisted backend host",
);
assert.match(
  runtimeConfig,
  /!SMART_HEALTH_HIL_RUNTIME_CONFIG && devicePrefs\.isKey\("deviceSecret"\)/,
  "a HIL fixture must not inherit an unrelated persisted device credential",
);
assert.match(runtimeConfig, /if \(!SMART_HEALTH_HIL_RUNTIME_CONFIG\) \{\s*backendUseTls =/);
assert.match(runtimeSetup, /registerWifiDiagnosticEvent\(\);/);
assert.match(wifiDiagnostics, /ARDUINO_EVENT_WIFI_STA_DISCONNECTED/);
assert.match(wifiDiagnostics, /WiFi station connection failed; reason=/);
assert.doesNotMatch(
  wifiDiagnostics,
  /wifiSsid|wifiPass|smartConfigCandidatePassword/,
  "WiFi diagnostics must not disclose the SSID or password",
);
assert.match(command, /startSmartConfigProvisioning\(/);
assert.match(command, /SMARTCONFIG_LISTENING/);
assert.doesNotMatch(command, /runSetupPortal\(/);

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
assert.match(ota, /firmware download http error \("\) \+ String\(httpCode\)/);
assert.match(ota, /OTA_HIL_URL_MISMATCH/);
assert.match(
  ota,
  /secureClient\.connect\(target,[\s\S]*?"shcare-hil\.local", OTA_CA_CERT/,
  "the HIL OTA client must connect to the fixture IP while retaining hostname and CA validation",
);
assert.match(
  ota,
  /http\.begin\(secureClient, String\("shcare-hil\.local"\),/,
  "the HIL OTA request must reuse the verified fixture-host connection",
);
assert.match(
  source,
  /health\.productionProfile = isProductionProfile\(\) \|\|\s*SMART_HEALTH_HIL_RUNTIME_CONFIG/,
  "HIL OTA boot health must require the authenticated WSS control plane",
);
assert.match(source, /HIL bootstrap cleared only stale OTA recovery state/);
assert.match(source, /SMART_HEALTH_HIL_RESET_OTA_STATE/);
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

const portalCallSites = [...setupWifi.matchAll(/runSetupPortal\([^;]+\);/g)];
assert.equal(portalCallSites.length, 1, "only a physical gesture may open the recovery portal");
const unconfiguredWifiStart = setupWifi.indexOf("if (!hasWiFiConfig())");
const physicalGestureStart = setupWifi.indexOf("if (setupPortalPhysicalGesture)");
assert.notEqual(unconfiguredWifiStart, -1, "missing unconfigured WiFi boot branch");
assert.notEqual(physicalGestureStart, -1, "missing physical recovery branch");
const unconfiguredWifi = setupWifi.slice(unconfiguredWifiStart, physicalGestureStart);
assert.match(
  unconfiguredWifi,
  /startSmartConfigProvisioning\("WiFi setup is required before cloud connection"\);/,
  "an unconfigured device must start its encrypted ESPTouch V2 listener",
);
assert.doesNotMatch(
  unconfiguredWifi,
  /WiFi\.mode\(WIFI_OFF\)/,
  "an unconfigured device must not disable the WiFi radio before app setup",
);
assert.doesNotMatch(unconfiguredWifi, /runSetupPortal\(/);
assert.match(setupWifi, /runSetupPortal\("Physical setup gesture requested WiFi recovery\."\);/);
assert.doesNotMatch(setupPortal, /while\s*\(/, "recovery portal must not block audio, OTA or reset handling");
assert.match(runtimeLoop, /handleSetupPortal\(\)/);
assert.match(runtimeLoop, /handleSmartConfigProvisioning\(\)/);

assert.doesNotMatch(lanOta, /resetAudioSession\(\)/);
assert.match(services, /otaReady && !audioSessionActive && !otaInProgress/);

console.log("firmware runtime source contract: PASS");
