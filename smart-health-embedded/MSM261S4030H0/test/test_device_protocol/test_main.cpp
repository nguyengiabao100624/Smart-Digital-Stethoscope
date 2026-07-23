#include <unity.h>

#include "ShcareDeviceProtocol.h"

#include <cstring>

#ifdef ARDUINO
#include <Arduino.h>
#else
#include <fstream>
#include <iterator>
#endif

using shcare::CommandEnvelope;
using shcare::CommandParseCode;
using shcare::RecentCommandIds;

void setUp() {}
void tearDown() {}

namespace {

constexpr std::int64_t kNowEpochMs = 1783987200000LL;  // 2026-07-14T00:00:00Z

const std::string kGoldenOtaCommand = R"json({
  "protocolVersion": 1,
  "id": "cmd-ota-001",
  "type": "ota.update",
  "issuedAt": "2026-07-13T23:59:00Z",
  "expiresAt": "2026-07-14T00:01:00Z",
  "correlationId": "ota-fixture-001",
  "payload": {
    "url": "https://firmware.shcare.example/devices/msm261/1.2.3.bin",
    "firmwareVersion": "1.2.3",
    "checksum": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "signature": "AQIDBA==",
    "hardwareTarget": "MSM261S4030H0",
    "partitionTarget": "app",
    "minimumProtocolVersion": 1
  }
})json";

shcare::OtaManifestValidation validateOtaFixture(
    const std::string &json = kGoldenOtaCommand,
    const std::string &currentVersion = "1.2.2",
    int protocolVersion = shcare::kDeviceProtocolVersion) {
  const auto command = shcare::parseCommandEnvelope(json, kNowEpochMs);
  TEST_ASSERT_TRUE(command.ok());
  return shcare::validateOtaManifest(command.command, currentVersion,
                                     protocolVersion);
}

void test_parses_versioned_command_and_nested_payload() {
  const std::string json = R"json({
    "protocolVersion": 1,
    "id": "cmd-001",
    "type": "wifi.update",
    "issuedAt": "2026-07-13T23:59:00Z",
    "expiresAt": "2026-07-14T00:01:00Z",
    "correlationId": "corr-001",
    "payload": {"ssid": "Clinic WiFi", "password": "not-logged"}
  })json";

  const auto result = shcare::parseCommandEnvelope(json, kNowEpochMs);

  TEST_ASSERT_EQUAL(CommandParseCode::Ok, result.code);
  TEST_ASSERT_EQUAL_STRING("cmd-001", result.command.id.c_str());
  TEST_ASSERT_EQUAL_STRING("wifi.update", result.command.type.c_str());
  TEST_ASSERT_EQUAL_STRING("corr-001", result.command.correlationId.c_str());
  TEST_ASSERT_EQUAL_STRING("Clinic WiFi", result.command.payloadString("ssid").c_str());
  TEST_ASSERT_EQUAL_STRING("not-logged", result.command.payloadString("password").c_str());
}

void test_rejects_missing_required_command_id() {
  const std::string json = R"json({
    "protocolVersion": 1,
    "type": "restart",
    "issuedAt": "2026-07-13T23:59:00Z",
    "expiresAt": "2026-07-14T00:01:00Z",
    "correlationId": "corr-002",
    "payload": {}
  })json";

  const auto result = shcare::parseCommandEnvelope(json, kNowEpochMs);

  TEST_ASSERT_EQUAL(CommandParseCode::MissingField, result.code);
  TEST_ASSERT_EQUAL_STRING("MISSING_ID", result.stableCode.c_str());
}

void test_rejects_expired_command() {
  const std::string json = R"json({
    "protocolVersion": 1,
    "id": "cmd-expired",
    "type": "restart",
    "issuedAt": "2026-07-13T23:58:00Z",
    "expiresAt": "2026-07-13T23:59:59Z",
    "correlationId": "corr-expired",
    "payload": {}
  })json";

  const auto result = shcare::parseCommandEnvelope(json, kNowEpochMs);

  TEST_ASSERT_EQUAL(CommandParseCode::Expired, result.code);
  TEST_ASSERT_EQUAL_STRING("COMMAND_EXPIRED", result.stableCode.c_str());
}

void test_rejects_command_issued_materially_in_the_future() {
  const std::string json = R"json({
    "protocolVersion": 1,
    "id": "cmd-future",
    "type": "wifi.status",
    "issuedAt": "2026-07-14T00:05:00Z",
    "expiresAt": "2026-07-14T00:06:00Z",
    "correlationId": "corr-future",
    "payload": {}
  })json";

  const auto result = shcare::parseCommandEnvelope(json, kNowEpochMs);

  TEST_ASSERT_EQUAL(shcare::CommandParseCode::IssuedInFuture, result.code);
  TEST_ASSERT_EQUAL_STRING("COMMAND_ISSUED_IN_FUTURE",
                           result.stableCode.c_str());
}

void test_rejects_unknown_command_with_stable_error() {
  const std::string json = R"json({
    "protocolVersion": 1,
    "id": "cmd-calibrate",
    "type": "calibrate",
    "issuedAt": "2026-07-13T23:59:00Z",
    "expiresAt": "2026-07-14T00:01:00Z",
    "correlationId": "corr-calibrate",
    "payload": {}
  })json";

  const auto result = shcare::parseCommandEnvelope(json, kNowEpochMs);

  TEST_ASSERT_EQUAL(CommandParseCode::UnknownCommand, result.code);
  TEST_ASSERT_EQUAL_STRING("UNKNOWN_COMMAND", result.stableCode.c_str());
}

void test_accepts_session_wrapped_device_credential_rotation_command() {
  const std::string json = R"json({
    "protocolVersion": 1,
    "id": "cmd-rotate-001",
    "type": "device.rotate_secret",
    "issuedAt": "2026-07-14T00:00:00Z",
    "expiresAt": "2026-07-14T00:10:00Z",
    "correlationId": "rotation-001",
    "payload": {
      "rotationId": "rotation-001",
      "expiresAt": "2026-07-14T00:10:00Z",
      "wrapAlgorithm": "A256GCM",
      "wrapKeyDerivation": "HMAC-SHA256/device-session-v1",
      "wrapIv": "AAAAAAAAAAAAAAAA",
      "wrapCiphertext": "YmFzZTY0dXJsY2lwaGVydGV4dA",
      "wrapTag": "AAAAAAAAAAAAAAAAAAAAAA"
    }
  })json";
  const auto result = shcare::parseCommandEnvelope(json, 1783987200000LL);
  TEST_ASSERT_TRUE(result.ok());
  TEST_ASSERT_EQUAL_STRING("device.rotate_secret", result.command.type.c_str());
  TEST_ASSERT_EQUAL_STRING("rotation-001",
                           result.command.payloadString("rotationId").c_str());
  TEST_ASSERT_EQUAL_STRING("A256GCM",
                           result.command.payloadString("wrapAlgorithm").c_str());
}

void test_production_security_profile_requires_wss_ca_and_device_credential() {
  shcare::RuntimeSecurityConfig config;
  config.productionProfile = true;
  config.backendConfigured = true;
  config.tlsEnabled = true;
  config.caTrustConfigured = true;
  config.deviceIdentityConfigured = true;
  config.deviceSecretConfigured = true;
  config.credentialStorageEncrypted = true;

  auto decision = shcare::evaluateRuntimeSecurity(config);
  TEST_ASSERT_TRUE(decision.ready());
  TEST_ASSERT_EQUAL(shcare::CloudTransport::Wss, decision.transport);
  TEST_ASSERT_EQUAL_STRING("WSS",
                           shcare::cloudTransportLabel(decision.transport));

  config.tlsEnabled = false;
  decision = shcare::evaluateRuntimeSecurity(config);
  TEST_ASSERT_EQUAL(shcare::RuntimeSecurityCode::ProductionTlsRequired,
                    decision.code);

  config.tlsEnabled = true;
  config.caTrustConfigured = false;
  decision = shcare::evaluateRuntimeSecurity(config);
  TEST_ASSERT_EQUAL(shcare::RuntimeSecurityCode::CaTrustRequired,
                    decision.code);

  config.caTrustConfigured = true;
  config.deviceSecretConfigured = false;
  decision = shcare::evaluateRuntimeSecurity(config);
  TEST_ASSERT_EQUAL(shcare::RuntimeSecurityCode::DeviceCredentialRequired,
                    decision.code);

  config.deviceSecretConfigured = true;
  config.credentialStorageEncrypted = false;
  decision = shcare::evaluateRuntimeSecurity(config);
  TEST_ASSERT_EQUAL(
      shcare::RuntimeSecurityCode::CredentialStorageEncryptionRequired,
      decision.code);
}

void test_plain_ws_and_udp_require_explicit_development_profile() {
  shcare::RuntimeSecurityConfig config;
  config.productionProfile = false;
  config.backendConfigured = true;
  config.tlsEnabled = false;
  config.deviceIdentityConfigured = true;
  config.deviceSecretConfigured = true;

  auto decision = shcare::evaluateRuntimeSecurity(config);
  TEST_ASSERT_EQUAL(shcare::RuntimeSecurityCode::DevelopmentWsNotEnabled,
                    decision.code);

  config.developmentWsEnabled = true;
  decision = shcare::evaluateRuntimeSecurity(config);
  TEST_ASSERT_TRUE(decision.ready());
  TEST_ASSERT_EQUAL(shcare::CloudTransport::WsDevelopment,
                    decision.transport);
  TEST_ASSERT_EQUAL_STRING("WS_DEVELOPMENT",
                           shcare::cloudTransportLabel(decision.transport));

  TEST_ASSERT_FALSE(shcare::developmentUdpAllowed(true, true));
  TEST_ASSERT_FALSE(shcare::developmentUdpAllowed(false, false));
  TEST_ASSERT_TRUE(shcare::developmentUdpAllowed(false, true));
}

void test_cloud_reconnect_backoff_is_exponential_and_bounded() {
  TEST_ASSERT_EQUAL_UINT32(
      1000, shcare::reconnectBackoffDelayMs(1, 1000, 30000));
  TEST_ASSERT_EQUAL_UINT32(
      2000, shcare::reconnectBackoffDelayMs(2, 1000, 30000));
  TEST_ASSERT_EQUAL_UINT32(
      4000, shcare::reconnectBackoffDelayMs(3, 1000, 30000));
  TEST_ASSERT_EQUAL_UINT32(
      16000, shcare::reconnectBackoffDelayMs(5, 1000, 30000));
  TEST_ASSERT_EQUAL_UINT32(
      30000, shcare::reconnectBackoffDelayMs(6, 1000, 30000));
  TEST_ASSERT_EQUAL_UINT32(
      30000, shcare::reconnectBackoffDelayMs(32, 1000, 30000));
  TEST_ASSERT_EQUAL_UINT32(
      0, shcare::reconnectBackoffDelayMs(1, 0, 30000));
  TEST_ASSERT_EQUAL_UINT32(
      1000, shcare::reconnectBackoffDelayMs(0, 1000, 30000));
}

void test_setup_portal_requires_factory_state_or_physical_gesture() {
  TEST_ASSERT_TRUE(shcare::setupPortalAllowed(false, false));
  TEST_ASSERT_TRUE(shcare::setupPortalAllowed(false, true));
  TEST_ASSERT_TRUE(shcare::setupPortalAllowed(true, true));
  TEST_ASSERT_FALSE(shcare::setupPortalAllowed(true, false));
}

void test_setup_portal_expiry_is_bounded_and_wrap_safe() {
  TEST_ASSERT_FALSE(shcare::setupPortalExpired(1500U, 1000U, 1000U));
  TEST_ASSERT_TRUE(shcare::setupPortalExpired(2000U, 1000U, 1000U));
  TEST_ASSERT_TRUE(shcare::setupPortalExpired(1000U, 1000U, 0U));

  const std::uint32_t nearWrap = UINT32_MAX - 15U;
  TEST_ASSERT_FALSE(shcare::setupPortalExpired(15U, nearWrap, 32U));
  TEST_ASSERT_TRUE(shcare::setupPortalExpired(16U, nearWrap, 32U));
}

void test_setup_portal_csrf_requires_exact_non_empty_token() {
  TEST_ASSERT_TRUE(shcare::validSetupPortalCsrf(
      "0123456789abcdef0123456789abcdef",
      "0123456789abcdef0123456789abcdef"));
  TEST_ASSERT_FALSE(shcare::validSetupPortalCsrf("", ""));
  TEST_ASSERT_FALSE(shcare::validSetupPortalCsrf(
      "0123456789abcdef0123456789abcdef",
      "0123456789abcdef0123456789abcdee"));
  TEST_ASSERT_FALSE(shcare::validSetupPortalCsrf(
      "0123456789abcdef0123456789abcdef",
      "0123456789abcdef0123456789abcdef00"));
}

void test_setup_access_point_accepts_only_canonical_device_ids() {
  TEST_ASSERT_TRUE(shcare::validCanonicalDeviceId("dev_alpha"));
  TEST_ASSERT_TRUE(shcare::validCanonicalDeviceId("A-b_9"));
  TEST_ASSERT_TRUE(shcare::validCanonicalDeviceId(
      "A23456789012345678901234567890123456789012345678901234567890123"));

  TEST_ASSERT_FALSE(shcare::validCanonicalDeviceId("ab"));
  TEST_ASSERT_FALSE(shcare::validCanonicalDeviceId(
      "A234567890123456789012345678901234567890123456789012345678901234"));
  TEST_ASSERT_FALSE(shcare::validCanonicalDeviceId("_dev_alpha"));
  TEST_ASSERT_FALSE(shcare::validCanonicalDeviceId("dev.alpha"));
  TEST_ASSERT_FALSE(shcare::validCanonicalDeviceId(" dev_alpha"));
}

void test_setup_access_point_matches_shared_golden_vector() {
  std::uint8_t secretHash[shcare::kSetupSecretHashBytes];
  memset(secretHash, 0xab, sizeof(secretHash));

  const auto result =
      shcare::deriveSetupAccessPoint("dev_alpha", secretHash);

  TEST_ASSERT_TRUE(result.ok());
  TEST_ASSERT_EQUAL_STRING("Shcare-9487FC14F3E6", result.ssid.c_str());
  TEST_ASSERT_EQUAL_STRING("4hxulJ_mCLIz2XhP-KXh", result.password.c_str());
}

void test_setup_access_point_hashes_raw_device_secret_before_hmac() {
  const auto result = shcare::deriveSetupAccessPointFromSecret(
      "dev_alpha", "test-device-secret-0001");

  TEST_ASSERT_TRUE(result.ok());
  TEST_ASSERT_EQUAL_STRING("Shcare-9487FC14F3E6", result.ssid.c_str());
  TEST_ASSERT_EQUAL_STRING("CHrs6KuwJicXOJ0hAeM7", result.password.c_str());
}

void test_setup_access_point_fails_closed_without_identity_or_secret() {
  std::uint8_t secretHash[shcare::kSetupSecretHashBytes];
  memset(secretHash, 0xab, sizeof(secretHash));

  auto result = shcare::deriveSetupAccessPoint("dev.alpha", secretHash);
  TEST_ASSERT_EQUAL(shcare::SetupAccessPointCode::InvalidDeviceId,
                    result.code);
  TEST_ASSERT_TRUE(result.ssid.empty());
  TEST_ASSERT_TRUE(result.password.empty());

  result = shcare::deriveSetupAccessPointFromSecret("dev_alpha", "");
  TEST_ASSERT_EQUAL(shcare::SetupAccessPointCode::MissingDeviceSecret,
                    result.code);
  TEST_ASSERT_TRUE(result.ssid.empty());
  TEST_ASSERT_TRUE(result.password.empty());
}

void test_auth_acceptance_is_bound_to_outstanding_challenge_device_and_session() {
  shcare::AuthHandshakeState handshake;
  TEST_ASSERT_TRUE(handshake.beginChallenge("challenge-123456"));
  TEST_ASSERT_TRUE(handshake.awaitingAcceptance());

  TEST_ASSERT_EQUAL(
      shcare::AuthAcceptanceCode::ChallengeMismatch,
      handshake.accept("challenge-other", "device-001", "device-001",
                       "session-12345678"));

  handshake.reset();
  TEST_ASSERT_TRUE(handshake.beginChallenge("challenge-123456"));
  TEST_ASSERT_EQUAL(
      shcare::AuthAcceptanceCode::DeviceMismatch,
      handshake.accept("challenge-123456", "device-001", "device-999",
                       "session-12345678"));

  handshake.reset();
  TEST_ASSERT_TRUE(handshake.beginChallenge("challenge-123456"));
  TEST_ASSERT_EQUAL(
      shcare::AuthAcceptanceCode::InvalidSession,
      handshake.accept("challenge-123456", "device-001", "device-001", ""));

  handshake.reset();
  TEST_ASSERT_TRUE(handshake.beginChallenge("challenge-123456"));
  TEST_ASSERT_EQUAL(
      shcare::AuthAcceptanceCode::Accepted,
      handshake.accept("challenge-123456", "device-001", "device-001",
                       "session-12345678"));
  TEST_ASSERT_FALSE(handshake.awaitingAcceptance());
  TEST_ASSERT_EQUAL_STRING("session-12345678", handshake.sessionId().c_str());
  TEST_ASSERT_EQUAL(
      shcare::AuthAcceptanceCode::NoOutstandingChallenge,
      handshake.accept("challenge-123456", "device-001", "device-001",
                       "session-12345678"));
}

void test_auth_handshake_rejects_overlapping_challenges() {
  shcare::AuthHandshakeState handshake;
  TEST_ASSERT_TRUE(handshake.beginChallenge("challenge-123456"));
  TEST_ASSERT_FALSE(handshake.beginChallenge("challenge-654321"));
}

void test_ota_boot_health_requires_authenticated_production_wss_heartbeat() {
  shcare::OtaBootHealthInput health;
  health.pendingVerification = true;
  health.i2sReady = true;
  health.stabilityWindowElapsed = true;
  health.productionProfile = true;
  health.runtimeSecurityReady = true;
  health.transport = shcare::CloudTransport::Wss;
  health.authenticated = true;
  health.authenticatedHeartbeatObserved = true;

  TEST_ASSERT_TRUE(shcare::otaBootHealthReady(health));

  health.recoveryPortalActive = true;
  TEST_ASSERT_FALSE(shcare::otaBootHealthReady(health));
  health.recoveryPortalActive = false;

  health.authenticatedHeartbeatObserved = false;
  TEST_ASSERT_FALSE(shcare::otaBootHealthReady(health));
  health.authenticatedHeartbeatObserved = true;

  health.transport = shcare::CloudTransport::WsDevelopment;
  TEST_ASSERT_FALSE(shcare::otaBootHealthReady(health));
  health.transport = shcare::CloudTransport::Wss;

  health.productionProfile = false;
  TEST_ASSERT_FALSE(shcare::otaBootHealthReady(health));
}

void test_deduplicates_recent_command_ids() {
  RecentCommandIds recent(3);

  TEST_ASSERT_FALSE(recent.seen("cmd-1"));
  recent.remember("cmd-1");
  TEST_ASSERT_TRUE(recent.seen("cmd-1"));
  recent.remember("cmd-2");
  recent.remember("cmd-3");
  recent.remember("cmd-4");
  TEST_ASSERT_FALSE(recent.seen("cmd-1"));
  TEST_ASSERT_TRUE(recent.seen("cmd-4"));
}

void test_invalid_action_does_not_poison_recent_command_dedupe() {
  RecentCommandIds recent(3);

  TEST_ASSERT_FALSE(recent.rememberValidated("cmd-invalid", false));
  TEST_ASSERT_FALSE(recent.seen("cmd-invalid"));
  TEST_ASSERT_TRUE(recent.rememberValidated("cmd-valid", true));
  TEST_ASSERT_TRUE(recent.seen("cmd-valid"));
}

void test_terminal_command_journal_survives_simulated_reboot() {
  shcare::CommandJournal journal(4);
  shcare::CommandJournalEntry entry;
  entry.commandId = "cmd-wifi-status-001";
  entry.correlationId = "corr-wifi-status-001";
  entry.type = "wifi.status";
  entry.state = "applied";
  entry.code = "OK";
  entry.result = "telemetry sent";

  TEST_ASSERT_TRUE(journal.recordTerminal(entry));
  const std::string persisted = journal.serialize();
  TEST_ASSERT_FALSE(persisted.empty());

  shcare::CommandJournal afterReboot(4);
  TEST_ASSERT_TRUE(afterReboot.restore(persisted));
  shcare::CommandJournalEntry replay;
  TEST_ASSERT_TRUE(afterReboot.find("cmd-wifi-status-001", replay));
  TEST_ASSERT_EQUAL_STRING("corr-wifi-status-001",
                           replay.correlationId.c_str());
  TEST_ASSERT_EQUAL_STRING("wifi.status", replay.type.c_str());
  TEST_ASSERT_EQUAL_STRING("applied", replay.state.c_str());
  TEST_ASSERT_EQUAL_STRING("OK", replay.code.c_str());
  TEST_ASSERT_EQUAL_STRING("telemetry sent", replay.result.c_str());
}

void test_command_journal_is_bounded_and_rejects_non_terminal_state() {
  shcare::CommandJournal journal(2);
  shcare::CommandJournalEntry entry;
  entry.correlationId = "corr";
  entry.type = "wifi.status";
  entry.code = "OK";
  entry.result = "telemetry sent";

  entry.commandId = "cmd-applying";
  entry.state = "applying";
  TEST_ASSERT_FALSE(journal.recordTerminal(entry));
  TEST_ASSERT_EQUAL(0, journal.size());

  entry.state = "applied";
  entry.commandId = "cmd-1";
  TEST_ASSERT_TRUE(journal.recordTerminal(entry));
  entry.commandId = "cmd-2";
  TEST_ASSERT_TRUE(journal.recordTerminal(entry));
  entry.commandId = "cmd-3";
  TEST_ASSERT_TRUE(journal.recordTerminal(entry));
  TEST_ASSERT_EQUAL(2, journal.size());

  shcare::CommandJournalEntry replay;
  TEST_ASSERT_FALSE(journal.find("cmd-1", replay));
  TEST_ASSERT_TRUE(journal.find("cmd-3", replay));
}

void test_serializes_correlated_command_state() {
  const std::string json = shcare::buildCommandStateJson(
      "cmd-001", "corr-001", "applied", "OK", "wifi saved");

  TEST_ASSERT_NOT_EQUAL(std::string::npos, json.find("\"protocolVersion\":1"));
  TEST_ASSERT_NOT_EQUAL(std::string::npos, json.find("\"type\":\"command.status\""));
  TEST_ASSERT_NOT_EQUAL(std::string::npos, json.find("\"commandId\":\"cmd-001\""));
  TEST_ASSERT_NOT_EQUAL(std::string::npos, json.find("\"correlationId\":\"corr-001\""));
  TEST_ASSERT_NOT_EQUAL(std::string::npos, json.find("\"state\":\"applied\""));
}

void test_accepts_audio_session_start_command() {
  const std::string json = R"json({
    "protocolVersion": 1,
    "id": "cmd-audio-001",
    "type": "audio.session.start",
    "issuedAt": "2026-07-13T23:59:00Z",
    "expiresAt": "2026-07-14T00:01:00Z",
    "correlationId": "scan-fixture-001",
    "payload": {
      "protocolVersion": 2,
      "sessionId": "audio-session-fixture-001",
      "scanId": "scan-fixture-001",
      "sampleRate": 16000,
      "sampleCount": 128,
      "encoding": "pcm_s16le"
    }
  })json";

  const auto result = shcare::parseCommandEnvelope(json, kNowEpochMs);

  TEST_ASSERT_EQUAL(CommandParseCode::Ok, result.code);
  TEST_ASSERT_EQUAL_STRING("audio.session.start", result.command.type.c_str());
  TEST_ASSERT_EQUAL_STRING("audio-session-fixture-001",
                           result.command.payloadString("sessionId").c_str());
  TEST_ASSERT_EQUAL(2, result.command.payloadInt("protocolVersion", 0));
}

void test_builds_audio_v2_frame_in_network_byte_order() {
  const int16_t samples[] = {-1, 0, 1, 32767};
  uint8_t frame[128] = {};
  const auto result = shcare::buildAudioFrameV2(
      "audio-session-fixture-001", "scan-fixture-001", 0,
      1783987200123ULL, samples, 4, shcare::kAudioV2FlagStart, frame,
      sizeof(frame));

  TEST_ASSERT_EQUAL(shcare::AudioFrameBuildCode::Ok, result.code);
  TEST_ASSERT_EQUAL(79, result.bytesWritten);
  TEST_ASSERT_EQUAL_UINT8('S', frame[0]);
  TEST_ASSERT_EQUAL_UINT8('H', frame[1]);
  TEST_ASSERT_EQUAL_UINT8('C', frame[2]);
  TEST_ASSERT_EQUAL_UINT8('2', frame[3]);
  TEST_ASSERT_EQUAL_UINT8(2, frame[4]);
  TEST_ASSERT_EQUAL_UINT8(shcare::kAudioV2FlagStart, frame[5]);
  TEST_ASSERT_EQUAL_UINT8(0, frame[6]);
  TEST_ASSERT_EQUAL_UINT8(71, frame[7]);
  TEST_ASSERT_EQUAL_UINT8(0, frame[10]);
  TEST_ASSERT_EQUAL_UINT8(8, frame[11]);
  TEST_ASSERT_EQUAL_UINT8(0, frame[24]);
  TEST_ASSERT_EQUAL_UINT8(4, frame[25]);
  TEST_ASSERT_EQUAL_UINT8(0, frame[26]);
  TEST_ASSERT_EQUAL_UINT8(25, frame[27]);
  TEST_ASSERT_EQUAL_UINT8(0, frame[28]);
  TEST_ASSERT_EQUAL_UINT8(16, frame[29]);
  TEST_ASSERT_EQUAL_STRING_LEN("audio-session-fixture-001",
                               reinterpret_cast<const char *>(frame + 30), 25);
  TEST_ASSERT_EQUAL_STRING_LEN("scan-fixture-001",
                               reinterpret_cast<const char *>(frame + 55), 16);
  TEST_ASSERT_EQUAL_UINT8(0xFF, frame[71]);
  TEST_ASSERT_EQUAL_UINT8(0xFF, frame[72]);
  TEST_ASSERT_EQUAL_UINT8(0xFF, frame[77]);
  TEST_ASSERT_EQUAL_UINT8(0x7F, frame[78]);
}

void test_rejects_invalid_audio_v2_identity_and_capacity() {
  const int16_t sample = 0;
  uint8_t frame[32] = {};
  auto result = shcare::buildAudioFrameV2(
      "", "scan-fixture-001", 0, 1783987200123ULL, &sample, 1,
      shcare::kAudioV2FlagStart, frame, sizeof(frame));
  TEST_ASSERT_EQUAL(shcare::AudioFrameBuildCode::InvalidIdentity, result.code);

  result = shcare::buildAudioFrameV2(
      "audio-session-fixture-001", "scan-fixture-001", 0,
      1783987200123ULL, &sample, 1, shcare::kAudioV2FlagStart, frame,
      sizeof(frame));
  TEST_ASSERT_EQUAL(shcare::AudioFrameBuildCode::BufferTooSmall, result.code);
}

void test_accepts_complete_ota_manifest_golden_fixture() {
  const auto result = validateOtaFixture();

  TEST_ASSERT_EQUAL(shcare::OtaManifestCode::Ok, result.code);
  TEST_ASSERT_EQUAL_STRING("OK", result.stableCode.c_str());
  TEST_ASSERT_EQUAL_STRING("1.2.3", result.manifest.firmwareVersion.c_str());
  TEST_ASSERT_EQUAL_STRING("app", result.manifest.partitionTarget.c_str());
  TEST_ASSERT_EQUAL(1, result.manifest.minimumProtocolVersion);

  const std::string signatureMessage =
      shcare::buildOtaSignatureMessage(result.manifest);
  TEST_ASSERT_EQUAL_STRING(
      "SHCARE-OTA-MANIFEST-V1\n"
      "sha256=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef\n"
      "firmwareVersion=1.2.3\n"
      "hardwareTarget=MSM261S4030H0\n"
      "partitionTarget=app\n"
      "minimumProtocolVersion=1\n",
      signatureMessage.c_str());
}

void test_rejects_ota_transport_integrity_and_signature_downgrades() {
  std::string json = kGoldenOtaCommand;
  json.replace(json.find("https://"), 8, "http://");
  auto result = validateOtaFixture(json);
  TEST_ASSERT_EQUAL(shcare::OtaManifestCode::HttpsRequired, result.code);
  TEST_ASSERT_EQUAL_STRING("OTA_HTTPS_REQUIRED", result.stableCode.c_str());

  json = kGoldenOtaCommand;
  json.replace(json.find("0123456789abcdef"), 64, "not-a-sha256");
  result = validateOtaFixture(json);
  TEST_ASSERT_EQUAL(shcare::OtaManifestCode::InvalidChecksum, result.code);
  TEST_ASSERT_EQUAL_STRING("OTA_SHA256_REQUIRED", result.stableCode.c_str());

  json = kGoldenOtaCommand;
  json.replace(json.find("AQIDBA=="), 8, "***");
  result = validateOtaFixture(json);
  TEST_ASSERT_EQUAL(shcare::OtaManifestCode::InvalidSignature, result.code);
  TEST_ASSERT_EQUAL_STRING("OTA_SIGNATURE_ENCODING_INVALID",
                           result.stableCode.c_str());
}

void test_rejects_ota_target_partition_and_protocol_mismatch() {
  std::string json = kGoldenOtaCommand;
  const std::string hardwareTarget = "MSM261S4030H0";
  json.replace(json.find(hardwareTarget), hardwareTarget.size(),
               "INMP441-legacy");
  auto result = validateOtaFixture(json);
  TEST_ASSERT_EQUAL(shcare::OtaManifestCode::HardwareTargetMismatch,
                    result.code);
  TEST_ASSERT_EQUAL_STRING("OTA_HARDWARE_TARGET_MISMATCH",
                           result.stableCode.c_str());

  json = kGoldenOtaCommand;
  const std::size_t partition = json.find("\"app\"");
  json.replace(partition, 5, "\"spiffs\"");
  result = validateOtaFixture(json);
  TEST_ASSERT_EQUAL(shcare::OtaManifestCode::PartitionTargetMismatch,
                    result.code);
  TEST_ASSERT_EQUAL_STRING("OTA_PARTITION_TARGET_MISMATCH",
                           result.stableCode.c_str());

  json = kGoldenOtaCommand;
  const std::string minimumProtocol = "\"minimumProtocolVersion\": 1";
  json.replace(json.find(minimumProtocol), minimumProtocol.size(),
               "\"minimumProtocolVersion\": 2");
  result = validateOtaFixture(json);
  TEST_ASSERT_EQUAL(shcare::OtaManifestCode::ProtocolTooOld, result.code);
  TEST_ASSERT_EQUAL_STRING("OTA_PROTOCOL_TOO_OLD", result.stableCode.c_str());
}

void test_rejects_malformed_equal_and_downgrade_ota_versions() {
  std::string json = kGoldenOtaCommand;
  const std::string firmwareVersion = "\"firmwareVersion\": \"1.2.3\"";
  json.replace(json.find(firmwareVersion), firmwareVersion.size(),
               "\"firmwareVersion\": \"1.2.x\"");
  auto result = validateOtaFixture(json);
  TEST_ASSERT_EQUAL(shcare::OtaManifestCode::InvalidVersion, result.code);
  TEST_ASSERT_EQUAL_STRING("OTA_VERSION_INVALID", result.stableCode.c_str());

  result = validateOtaFixture(kGoldenOtaCommand, "1.2.3");
  TEST_ASSERT_EQUAL(shcare::OtaManifestCode::DowngradeRejected, result.code);
  TEST_ASSERT_EQUAL_STRING("OTA_DOWNGRADE_REJECTED", result.stableCode.c_str());

  result = validateOtaFixture(kGoldenOtaCommand, "2.0.0");
  TEST_ASSERT_EQUAL(shcare::OtaManifestCode::DowngradeRejected, result.code);
}

void test_requires_signature_minimum_protocol_and_strict_semver() {
  std::string json = kGoldenOtaCommand;
  json.replace(json.find("AQIDBA=="), 8, "");
  auto result = validateOtaFixture(json);
  TEST_ASSERT_EQUAL(shcare::OtaManifestCode::MissingSignature, result.code);
  TEST_ASSERT_EQUAL_STRING("OTA_SIGNATURE_REQUIRED", result.stableCode.c_str());

  json = kGoldenOtaCommand;
  const std::string minimumProtocol = "\"minimumProtocolVersion\": 1";
  json.replace(json.find(minimumProtocol), minimumProtocol.size(),
               "\"minimumProtocolVersion\": 0");
  result = validateOtaFixture(json);
  TEST_ASSERT_EQUAL(shcare::OtaManifestCode::InvalidMinimumProtocol,
                    result.code);
  TEST_ASSERT_EQUAL_STRING("OTA_MIN_PROTOCOL_INVALID",
                           result.stableCode.c_str());

  json = kGoldenOtaCommand;
  const std::string version = "\"firmwareVersion\": \"1.2.3\"";
  json.replace(json.find(version), version.size(),
               "\"firmwareVersion\": \"01.2.3\"");
  result = validateOtaFixture(json);
  TEST_ASSERT_EQUAL(shcare::OtaManifestCode::InvalidVersion, result.code);

  json = kGoldenOtaCommand;
  json.replace(json.find(version), version.size(),
               "\"firmwareVersion\": \"1.2.3-rc.1\"");
  result = validateOtaFixture(json, "1.2.3-beta.2");
  TEST_ASSERT_EQUAL(shcare::OtaManifestCode::Ok, result.code);
}

void test_auth_acceptance_is_bound_to_the_credential_attempt() {
  shcare::AuthAcceptedMessage current;
  current.credentialSlot = "current";
  TEST_ASSERT_TRUE(shcare::authAcceptanceMatchesCredentialAttempt(
      current, false, ""));
  // If the backend committed the candidate but auth.accepted was lost, the
  // next candidate proof is correctly reported as the canonical current slot.
  TEST_ASSERT_TRUE(shcare::authAcceptanceMatchesCredentialAttempt(
      current, true, "rotation-0001"));

  shcare::AuthAcceptedMessage candidate;
  candidate.credentialSlot = "rotation_candidate";
  candidate.rotationId = "rotation-0001";
  candidate.rotationState = "confirmed";
  TEST_ASSERT_TRUE(shcare::authAcceptanceMatchesCredentialAttempt(
      candidate, true, "rotation-0001"));
  TEST_ASSERT_FALSE(shcare::authAcceptanceMatchesCredentialAttempt(
      candidate, false, ""));
  TEST_ASSERT_FALSE(shcare::authAcceptanceMatchesCredentialAttempt(
      candidate, true, "rotation-0002"));

  candidate.rotationState = "";
  TEST_ASSERT_FALSE(shcare::authAcceptanceMatchesCredentialAttempt(
      candidate, true, "rotation-0001"));
}

#ifndef ARDUINO
std::string readGoldenFixture(const char *path) {
  std::ifstream input(path, std::ios::binary);
  TEST_ASSERT_TRUE(input.good());
  return std::string(std::istreambuf_iterator<char>(input),
                     std::istreambuf_iterator<char>());
}

void test_versioned_ota_fixture_files_match_canonical_bytes() {
  const std::string payload =
      readGoldenFixture("test/fixtures/ota_manifest_v1.json");
  const std::string commandJson =
      "{\"protocolVersion\":1,\"id\":\"cmd-ota-fixture\","
      "\"type\":\"ota.update\",\"issuedAt\":\"2026-07-13T23:59:00Z\","
      "\"expiresAt\":\"2026-07-14T00:01:00Z\","
      "\"correlationId\":\"ota-fixture-file\",\"payload\":" +
      payload + "}";
  const auto result = validateOtaFixture(commandJson);
  TEST_ASSERT_EQUAL(shcare::OtaManifestCode::Ok, result.code);

  const std::string expectedMessage =
      readGoldenFixture("test/fixtures/ota_signature_message_v1.txt");
  TEST_ASSERT_EQUAL_STRING(expectedMessage.c_str(),
                           shcare::buildOtaSignatureMessage(result.manifest)
                               .c_str());
}

void test_versioned_command_journal_fixture_restores_terminal_result() {
  const std::string payload =
      readGoldenFixture("test/fixtures/command_journal_v1.json");
  shcare::CommandJournal journal(4);
  TEST_ASSERT_TRUE(journal.restore(payload));

  shcare::CommandJournalEntry replay;
  TEST_ASSERT_TRUE(journal.find("cmd-wifi-fixture-001", replay));
  TEST_ASSERT_EQUAL_STRING("corr-wifi-fixture-001",
                           replay.correlationId.c_str());
  TEST_ASSERT_EQUAL_STRING("applied", replay.state.c_str());
  TEST_ASSERT_EQUAL_STRING("telemetry sent", replay.result.c_str());
}

void test_shared_auth_accepted_fixture_binds_exact_handshake_identity() {
  const std::string payload =
      readGoldenFixture("test/fixtures/auth_accepted_v1.json");
  const auto accepted = shcare::parseAuthAccepted(payload);
  TEST_ASSERT_TRUE(accepted.ok());
  TEST_ASSERT_EQUAL_STRING("challenge_fixture_0001",
                           accepted.message.challengeId.c_str());
  TEST_ASSERT_EQUAL_STRING("dev_fixture_0001",
                           accepted.message.deviceId.c_str());
  TEST_ASSERT_EQUAL_STRING("session_fixture_0001",
                           accepted.message.sessionId.c_str());
  TEST_ASSERT_EQUAL_STRING("rotation_candidate",
                           accepted.message.credentialSlot.c_str());
  TEST_ASSERT_EQUAL_STRING("rotation_fixture_0001",
                           accepted.message.rotationId.c_str());
  TEST_ASSERT_EQUAL_STRING("confirmed",
                           accepted.message.rotationState.c_str());

  shcare::AuthHandshakeState handshake;
  TEST_ASSERT_TRUE(handshake.beginChallenge(accepted.message.challengeId));
  TEST_ASSERT_EQUAL(
      shcare::AuthAcceptanceCode::Accepted,
      handshake.accept(accepted.message.challengeId, "dev_fixture_0001",
                       accepted.message.deviceId,
                       accepted.message.sessionId));
}
#endif

}  // namespace

void runTests() {
  UNITY_BEGIN();
  RUN_TEST(test_parses_versioned_command_and_nested_payload);
  RUN_TEST(test_rejects_missing_required_command_id);
  RUN_TEST(test_rejects_expired_command);
  RUN_TEST(test_rejects_command_issued_materially_in_the_future);
  RUN_TEST(test_rejects_unknown_command_with_stable_error);
  RUN_TEST(test_accepts_session_wrapped_device_credential_rotation_command);
  RUN_TEST(test_production_security_profile_requires_wss_ca_and_device_credential);
  RUN_TEST(test_plain_ws_and_udp_require_explicit_development_profile);
  RUN_TEST(test_cloud_reconnect_backoff_is_exponential_and_bounded);
  RUN_TEST(test_setup_portal_requires_factory_state_or_physical_gesture);
  RUN_TEST(test_setup_portal_expiry_is_bounded_and_wrap_safe);
  RUN_TEST(test_setup_portal_csrf_requires_exact_non_empty_token);
  RUN_TEST(test_setup_access_point_accepts_only_canonical_device_ids);
  RUN_TEST(test_setup_access_point_matches_shared_golden_vector);
  RUN_TEST(test_setup_access_point_hashes_raw_device_secret_before_hmac);
  RUN_TEST(test_setup_access_point_fails_closed_without_identity_or_secret);
  RUN_TEST(test_auth_acceptance_is_bound_to_outstanding_challenge_device_and_session);
  RUN_TEST(test_auth_handshake_rejects_overlapping_challenges);
  RUN_TEST(test_ota_boot_health_requires_authenticated_production_wss_heartbeat);
  RUN_TEST(test_deduplicates_recent_command_ids);
  RUN_TEST(test_invalid_action_does_not_poison_recent_command_dedupe);
  RUN_TEST(test_terminal_command_journal_survives_simulated_reboot);
  RUN_TEST(test_command_journal_is_bounded_and_rejects_non_terminal_state);
  RUN_TEST(test_serializes_correlated_command_state);
  RUN_TEST(test_accepts_audio_session_start_command);
  RUN_TEST(test_builds_audio_v2_frame_in_network_byte_order);
  RUN_TEST(test_rejects_invalid_audio_v2_identity_and_capacity);
  RUN_TEST(test_accepts_complete_ota_manifest_golden_fixture);
  RUN_TEST(test_rejects_ota_transport_integrity_and_signature_downgrades);
  RUN_TEST(test_rejects_ota_target_partition_and_protocol_mismatch);
  RUN_TEST(test_rejects_malformed_equal_and_downgrade_ota_versions);
  RUN_TEST(test_requires_signature_minimum_protocol_and_strict_semver);
  RUN_TEST(test_auth_acceptance_is_bound_to_the_credential_attempt);
#ifndef ARDUINO
  RUN_TEST(test_versioned_ota_fixture_files_match_canonical_bytes);
  RUN_TEST(test_versioned_command_journal_fixture_restores_terminal_result);
  RUN_TEST(test_shared_auth_accepted_fixture_binds_exact_handshake_identity);
#endif
  UNITY_END();
}

#ifdef ARDUINO
void setup() {
  delay(2000);
  runTests();
}

void loop() {}
#else
int main(int, char **) {
  runTests();
  return 0;
}
#endif
