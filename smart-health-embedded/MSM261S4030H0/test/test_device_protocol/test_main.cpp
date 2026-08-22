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
constexpr const char *kOtaManifestFingerprint =
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const std::string kGoldenOtaCommand = R"json({
  "protocolVersion": 1,
  "id": "cmd-ota-001",
  "type": "ota.update",
  "issuedAt": "2026-07-13T23:59:00Z",
  "expiresAt": "2026-07-14T00:01:00Z",
  "correlationId": "ota-fixture-001",
  "payload": {
    "url": "https://firmware.shcare.example/devices/msm261/1.2.3.bin",
    "downloadAuthorization": "abcdefghijklmnopqrstuvwxyzABCDEFGH1234567890_-",
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

void test_wifi_credentials_enforce_esp32_and_wpa_bounds() {
  TEST_ASSERT_TRUE(shcare::validWifiCredentials("Clinic WiFi", ""));
  TEST_ASSERT_TRUE(
      shcare::validWifiCredentials("Clinic WiFi", "12345678"));
  TEST_ASSERT_TRUE(shcare::validWifiCredentials(
      std::string(32, 's'), std::string(63, 'p')));
  TEST_ASSERT_FALSE(shcare::validWifiCredentials("", "12345678"));
  TEST_ASSERT_FALSE(shcare::validWifiCredentials(
      std::string(33, 's'), "12345678"));
  TEST_ASSERT_FALSE(
      shcare::validWifiCredentials("Clinic WiFi", "1234567"));
  TEST_ASSERT_FALSE(shcare::validWifiCredentials(
      "Clinic WiFi", std::string(64, 'p')));
  TEST_ASSERT_FALSE(
      shcare::validWifiCredentials("Clinic\nWiFi", "12345678"));
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

void test_ota_recovery_safe_mode_blocks_services_for_every_rollback_failure() {
  TEST_ASSERT_TRUE(shcare::otaRecoveryServicesAllowed(
      shcare::OtaRecoverySafeModeReason::None));
  TEST_ASSERT_EQUAL_STRING(
      "OTA_RECOVERY_NONE",
      shcare::otaRecoverySafeModeStableCode(
          shcare::OtaRecoverySafeModeReason::None));

  struct FailureCase {
    shcare::OtaRecoverySafeModeReason reason;
    const char *stableCode;
  };
  const FailureCase failures[] = {
      {shcare::OtaRecoverySafeModeReason::RollbackUnavailable,
       "OTA_RECOVERY_ROLLBACK_UNAVAILABLE"},
      {shcare::OtaRecoverySafeModeReason::RollbackIntentPersistenceFailed,
       "OTA_RECOVERY_ROLLBACK_INTENT_NOT_DURABLE"},
      {shcare::OtaRecoverySafeModeReason::RollbackApiReturned,
       "OTA_RECOVERY_ROLLBACK_API_RETURNED"},
  };
  for (const auto &failure : failures) {
    TEST_ASSERT_FALSE(shcare::otaRecoveryServicesAllowed(failure.reason));
    TEST_ASSERT_EQUAL_STRING(
        failure.stableCode,
        shcare::otaRecoverySafeModeStableCode(failure.reason));
  }
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

void test_offline_operational_queue_is_bounded_and_prefers_events() {
  shcare::OfflineOperationalQueue queue(3);
  TEST_ASSERT_TRUE(queue.enqueueTelemetry(100));
  TEST_ASSERT_TRUE(queue.enqueueTelemetry(200));
  TEST_ASSERT_EQUAL_UINT32(1, queue.size());
  TEST_ASSERT_EQUAL_UINT32(1, queue.coalescedCount());

  TEST_ASSERT_TRUE(queue.enqueueEvent("i2s.degraded", "degraded", 300));
  TEST_ASSERT_TRUE(queue.enqueueEvent("i2s.degraded", "degraded", 400));
  TEST_ASSERT_TRUE(queue.enqueueEvent(
      "ota.failed", "failed", 500, "cmd-ota-001", "corr-ota-001",
      "cmd-ota-001"));
  TEST_ASSERT_EQUAL_UINT32(3, queue.size());
  TEST_ASSERT_EQUAL_UINT32(2, queue.coalescedCount());

  // At capacity, the replaceable telemetry marker is dropped before an
  // operational event.
  TEST_ASSERT_TRUE(queue.enqueueEvent("audio.failed", "failed", 600));
  TEST_ASSERT_EQUAL_UINT32(3, queue.size());
  TEST_ASSERT_EQUAL_UINT32(1, queue.droppedCount());

  shcare::OfflineOperationalRecord record;
  TEST_ASSERT_TRUE(queue.front(record));
  TEST_ASSERT_EQUAL(shcare::OfflineOperationalKind::Event, record.kind);
  TEST_ASSERT_EQUAL_STRING("i2s.degraded", record.type.c_str());
  TEST_ASSERT_EQUAL_UINT32(2, record.occurrences);
  TEST_ASSERT_TRUE(queue.popFront());
}

void test_offline_ota_events_require_and_preserve_exact_binding() {
  shcare::OfflineOperationalQueue queue(4);
  TEST_ASSERT_FALSE(queue.enqueueEvent("ota.failed", "failed", 10));
  TEST_ASSERT_TRUE(queue.enqueueEvent(
      "ota.downloading", "downloading", 20, "cmd-ota-001",
      "corr-ota-001", "cmd-ota-001"));
  TEST_ASSERT_TRUE(queue.enqueueEvent(
      "ota.downloading", "downloading", 30, "cmd-ota-002",
      "corr-ota-002", "cmd-ota-002"));
  TEST_ASSERT_EQUAL_UINT32(2, queue.size());
  TEST_ASSERT_EQUAL_UINT32(0, queue.coalescedCount());

  shcare::OfflineOperationalRecord record;
  TEST_ASSERT_TRUE(queue.front(record));
  TEST_ASSERT_EQUAL_STRING("cmd-ota-001", record.commandId.c_str());
  TEST_ASSERT_EQUAL_STRING("corr-ota-001", record.correlationId.c_str());
  TEST_ASSERT_EQUAL_STRING("cmd-ota-001", record.otaId.c_str());
}

void test_pending_ota_receipt_survives_reboot_without_bearer() {
  shcare::PendingOtaReceipt receipt;
  receipt.commandId = "cmd-ota-001";
  receipt.correlationId = "corr-ota-001";
  receipt.otaId = "cmd-ota-001";
  receipt.firmwareVersion = "1.2.3";
  receipt.manifestFingerprint = kOtaManifestFingerprint;
  receipt.status = "downloading";
  const std::string serialized = shcare::serializePendingOtaReceipt(receipt);
  TEST_ASSERT_FALSE(serialized.empty());
  TEST_ASSERT_EQUAL(std::string::npos,
                    serialized.find("downloadAuthorization"));
  TEST_ASSERT_EQUAL(std::string::npos,
                    serialized.find("abcdefghijklmnopqrstuvwxyz"));

  shcare::PendingOtaReceipt restored;
  TEST_ASSERT_TRUE(shcare::restorePendingOtaReceipt(serialized, restored));
  TEST_ASSERT_EQUAL_STRING("cmd-ota-001", restored.commandId.c_str());
  TEST_ASSERT_EQUAL_STRING("corr-ota-001", restored.correlationId.c_str());
  TEST_ASSERT_EQUAL_STRING("cmd-ota-001", restored.otaId.c_str());
  TEST_ASSERT_EQUAL_STRING("1.2.3", restored.firmwareVersion.c_str());
  TEST_ASSERT_EQUAL_STRING(kOtaManifestFingerprint,
                           restored.manifestFingerprint.c_str());
  TEST_ASSERT_EQUAL_STRING("downloading", restored.status.c_str());

  receipt.otaId = "cmd-other";
  TEST_ASSERT_TRUE(shcare::serializePendingOtaReceipt(receipt).empty());
}

void test_pending_ota_receipt_is_a_durable_command_identity_fence() {
  shcare::PendingOtaReceipt receipt;
  receipt.commandId = "cmd-ota-001";
  receipt.correlationId = "corr-ota-001";
  receipt.otaId = "cmd-ota-001";
  receipt.firmwareVersion = "1.2.3";
  receipt.manifestFingerprint = kOtaManifestFingerprint;
  receipt.status = "rebooting";

  TEST_ASSERT_EQUAL(
      shcare::PendingOtaCommandDecision::Replay,
      shcare::evaluatePendingOtaCommand(
          receipt, true, "cmd-ota-001", "corr-ota-001", "ota.update",
          kOtaManifestFingerprint));
  TEST_ASSERT_EQUAL(
      shcare::PendingOtaCommandDecision::CommandIdConflict,
      shcare::evaluatePendingOtaCommand(
          receipt, true, "cmd-ota-001", "corr-ota-other", "ota.update",
          kOtaManifestFingerprint));
  TEST_ASSERT_EQUAL(
      shcare::PendingOtaCommandDecision::CommandIdConflict,
      shcare::evaluatePendingOtaCommand(
          receipt, true, "cmd-ota-001", "corr-ota-001", "restart", ""));
  TEST_ASSERT_EQUAL(
      shcare::PendingOtaCommandDecision::CommandIdConflict,
      shcare::evaluatePendingOtaCommand(
          receipt, true, "cmd-ota-001", "corr-ota-001", "ota.update",
          "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"));
  TEST_ASSERT_EQUAL(
      shcare::PendingOtaCommandDecision::OtaReceiptBusy,
      shcare::evaluatePendingOtaCommand(
          receipt, true, "cmd-ota-002", "corr-ota-002", "ota.update",
          "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"));
  TEST_ASSERT_EQUAL(
      shcare::PendingOtaCommandDecision::NoFence,
      shcare::evaluatePendingOtaCommand(
          receipt, true, "cmd-wifi-002", "corr-wifi-002", "wifi.status",
          ""));
  TEST_ASSERT_EQUAL(
      shcare::PendingOtaCommandDecision::NoFence,
      shcare::evaluatePendingOtaCommand(
          receipt, false, "cmd-ota-001", "corr-ota-001", "ota.update",
          kOtaManifestFingerprint));

  receipt.status = "not-valid";
  TEST_ASSERT_EQUAL(
      shcare::PendingOtaCommandDecision::InvalidFence,
      shcare::evaluatePendingOtaCommand(
          receipt, true, "cmd-ota-001", "corr-ota-001", "ota.update",
          kOtaManifestFingerprint));
}

void test_pending_ota_replay_preserves_current_durable_outcome() {
  struct ExpectedReplay {
    const char *status;
    const char *commandState;
    const char *commandCode;
    const char *eventType;
  };
  const ExpectedReplay cases[] = {
      {"pending", "acknowledged", "OTA_PENDING", ""},
      {"delivered", "acknowledged", "OTA_DELIVERED", ""},
      {"downloading", "applying", "OTA_DOWNLOADING", "ota.downloading"},
      {"verifying", "applying", "OTA_VERIFYING", "ota.verifying"},
      {"rebooting", "applying", "OTA_REBOOTING", "ota.rebooting"},
      {"rolling_back", "applying", "OTA_ROLLING_BACK", "ota.rollback"},
      {"confirmed", "applied", "OTA_CONFIRMED", "ota.confirmed"},
      {"rolled_back", "failed", "OTA_ROLLED_BACK", "ota.rollback"},
      {"failed", "failed", "OTA_FAILED", "ota.failed"},
      {"expired", "expired", "OTA_EXPIRED", "ota.failed"},
  };

  for (const ExpectedReplay &expected : cases) {
    shcare::PendingOtaReceipt receipt;
    receipt.commandId = "cmd-ota-001";
    receipt.correlationId = "corr-ota-001";
    receipt.otaId = "cmd-ota-001";
    receipt.firmwareVersion = "1.2.3";
    receipt.manifestFingerprint = kOtaManifestFingerprint;
    receipt.status = expected.status;
    shcare::PendingOtaReplayOutcome outcome;
    TEST_ASSERT_TRUE(shcare::buildPendingOtaReplayOutcome(receipt, outcome));
    TEST_ASSERT_EQUAL_STRING(expected.commandState,
                             outcome.commandState.c_str());
    TEST_ASSERT_EQUAL_STRING(expected.commandCode,
                             outcome.commandCode.c_str());
    TEST_ASSERT_EQUAL_STRING(expected.eventType, outcome.eventType.c_str());
  }
}

void test_pending_ota_recovery_distinguishes_new_image_rollback_and_power_loss() {
  shcare::PendingOtaReceipt receipt;
  receipt.commandId = "cmd-ota-001";
  receipt.correlationId = "corr-ota-001";
  receipt.otaId = "cmd-ota-001";
  receipt.firmwareVersion = "1.2.3";
  receipt.manifestFingerprint = kOtaManifestFingerprint;
  receipt.status = "downloading";

  TEST_ASSERT_EQUAL(
      shcare::PendingOtaRecoveryAction::AwaitBootHealth,
      shcare::evaluatePendingOtaRecovery(receipt, true, true, true, true,
                                         false, "pending"));
  TEST_ASSERT_EQUAL(
      shcare::PendingOtaRecoveryAction::RollbackRequired,
      shcare::evaluatePendingOtaRecovery(receipt, false, true, true, true,
                                         false, "pending"));
  TEST_ASSERT_EQUAL(
      shcare::PendingOtaRecoveryAction::RollbackRequired,
      shcare::evaluatePendingOtaRecovery(receipt, true, true, true, false,
                                         false, "pending"));
  const std::string validFingerprint = receipt.manifestFingerprint;
  receipt.manifestFingerprint = "invalid";
  TEST_ASSERT_EQUAL(
      shcare::PendingOtaRecoveryAction::RollbackRequired,
      shcare::evaluatePendingOtaRecovery(receipt, true, true, true, true,
                                         false, "pending"));
  receipt.manifestFingerprint = validFingerprint;
  TEST_ASSERT_EQUAL(
      shcare::PendingOtaRecoveryAction::Failed,
      shcare::evaluatePendingOtaRecovery(receipt, true, true, false, false,
                                         true, "prepared"));
  // A stale success marker cannot bless an older running image after a new
  // OTA receipt was installed.
  TEST_ASSERT_EQUAL(
      shcare::PendingOtaRecoveryAction::Failed,
      shcare::evaluatePendingOtaRecovery(receipt, true, true, false, false,
                                         true, "confirmed"));

  receipt.status = "rebooting";
  TEST_ASSERT_EQUAL(
      shcare::PendingOtaRecoveryAction::RolledBack,
      shcare::evaluatePendingOtaRecovery(receipt, true, true, false, false,
                                         true, "pending"));
  TEST_ASSERT_EQUAL(
      shcare::PendingOtaRecoveryAction::RolledBack,
      shcare::evaluatePendingOtaRecovery(receipt, true, true, false, false,
                                         true, "rolled_back"));
  TEST_ASSERT_EQUAL(
      shcare::PendingOtaRecoveryAction::Confirmed,
      shcare::evaluatePendingOtaRecovery(receipt, true, true, false, true,
                                         true, "pending"));
  TEST_ASSERT_EQUAL(
      shcare::PendingOtaRecoveryAction::Confirmed,
      shcare::evaluatePendingOtaRecovery(receipt, true, true, false, true,
                                         false, "confirmed"));
  TEST_ASSERT_EQUAL(
      shcare::PendingOtaRecoveryAction::None,
      shcare::evaluatePendingOtaRecovery(receipt, true, false, false, true,
                                         false, "pending"));

  receipt.status = "confirmed";
  TEST_ASSERT_EQUAL(
      shcare::PendingOtaRecoveryAction::RollbackRequired,
      shcare::evaluatePendingOtaRecovery(receipt, true, true, true, true,
                                         false, "confirmed"));
  TEST_ASSERT_EQUAL(
      shcare::PendingOtaRecoveryAction::Terminal,
      shcare::evaluatePendingOtaRecovery(receipt, true, true, false, true,
                                         true, "confirmed"));
}

void test_ota_confirmation_requires_durable_two_phase_state() {
  TEST_ASSERT_EQUAL(
      shcare::OtaConfirmationAction::PersistConfirmingMarker,
      shcare::evaluateOtaConfirmationAction(false, false, false, false));
  TEST_ASSERT_EQUAL(
      shcare::OtaConfirmationAction::CancelRollback,
      shcare::evaluateOtaConfirmationAction(true, false, false, false));
  TEST_ASSERT_EQUAL(
      shcare::OtaConfirmationAction::PersistConfirmedState,
      shcare::evaluateOtaConfirmationAction(true, true, false, false));
  TEST_ASSERT_EQUAL(
      shcare::OtaConfirmationAction::PersistConfirmedState,
      shcare::evaluateOtaConfirmationAction(true, true, true, false));
  TEST_ASSERT_EQUAL(
      shcare::OtaConfirmationAction::PublishConfirmed,
      shcare::evaluateOtaConfirmationAction(true, true, true, true));
}

void test_ota_effect_binding_covers_signed_manifest_but_excludes_bearer() {
  const shcare::OtaManifestValidation validation = validateOtaFixture();
  TEST_ASSERT_TRUE(validation.ok());
  const shcare::OtaManifest manifest = validation.manifest;
  const std::string canonical =
      shcare::buildOtaEffectBindingMessage(manifest);
  TEST_ASSERT_FALSE(canonical.empty());
  TEST_ASSERT_NOT_EQUAL(std::string::npos,
                        canonical.find("url=https://firmware.shcare.example"));
  TEST_ASSERT_NOT_EQUAL(std::string::npos,
                        canonical.find("firmwareVersion=1.2.3"));
  TEST_ASSERT_NOT_EQUAL(std::string::npos, canonical.find("sha256="));
  TEST_ASSERT_NOT_EQUAL(std::string::npos, canonical.find("signature=AQIDBA=="));
  TEST_ASSERT_NOT_EQUAL(std::string::npos,
                        canonical.find("hardwareTarget=MSM261S4030H0"));
  TEST_ASSERT_NOT_EQUAL(std::string::npos,
                        canonical.find("partitionTarget=app"));
  TEST_ASSERT_NOT_EQUAL(std::string::npos,
                        canonical.find("minimumProtocolVersion=1"));
  TEST_ASSERT_EQUAL(std::string::npos,
                    canonical.find("downloadAuthorization"));
  TEST_ASSERT_EQUAL(std::string::npos,
                    canonical.find(manifest.downloadAuthorization));

  shcare::OtaManifest changed = manifest;
  changed.downloadAuthorization = std::string(48, 'z');
  TEST_ASSERT_EQUAL_STRING(
      canonical.c_str(),
      shcare::buildOtaEffectBindingMessage(changed).c_str());

  changed = manifest;
  changed.url += "?artifact=other";
  TEST_ASSERT_TRUE(canonical != shcare::buildOtaEffectBindingMessage(changed));
  changed = manifest;
  changed.checksum[0] = 'f';
  TEST_ASSERT_TRUE(canonical != shcare::buildOtaEffectBindingMessage(changed));
  changed = manifest;
  changed.signature = "BQYHCA==";
  TEST_ASSERT_TRUE(canonical != shcare::buildOtaEffectBindingMessage(changed));
  changed = manifest;
  changed.hardwareTarget = "OTHER";
  TEST_ASSERT_TRUE(canonical != shcare::buildOtaEffectBindingMessage(changed));
  changed = manifest;
  changed.partitionTarget = "other";
  TEST_ASSERT_TRUE(canonical != shcare::buildOtaEffectBindingMessage(changed));
  changed = manifest;
  changed.minimumProtocolVersion = 2;
  TEST_ASSERT_TRUE(canonical != shcare::buildOtaEffectBindingMessage(changed));
  changed = manifest;
  changed.firmwareVersion = "1.2.4";
  TEST_ASSERT_TRUE(canonical != shcare::buildOtaEffectBindingMessage(changed));
}

void test_offline_operational_queue_rejects_raw_audio_and_unapproved_data() {
  shcare::OfflineOperationalQueue queue(4);
  TEST_ASSERT_FALSE(queue.enqueueEvent("audio.pcm", "queued", 10));
  TEST_ASSERT_FALSE(queue.enqueueEvent("audio.frame", "queued", 20));
  TEST_ASSERT_FALSE(queue.enqueueEvent("scan.upload", "queued", 30));
  TEST_ASSERT_FALSE(
      queue.enqueueEvent("i2s.degraded", "degraded\npatient", 40));
  TEST_ASSERT_EQUAL_UINT32(0, queue.size());
  TEST_ASSERT_EQUAL_UINT32(4, queue.rejectedCount());

  // Only the fixed, payload-free operational marker is accepted.
  TEST_ASSERT_TRUE(queue.enqueueEvent("audio.failed", "failed", 50));
  shcare::OfflineOperationalRecord record;
  TEST_ASSERT_TRUE(queue.front(record));
  TEST_ASSERT_EQUAL_STRING("audio.failed", record.type.c_str());
  TEST_ASSERT_EQUAL_STRING("failed", record.status.c_str());
}

void test_pending_restart_requires_authenticated_reconnect_after_reboot() {
  shcare::PendingReconnectCommand pending;
  pending.commandId = "cmd-restart-001";
  pending.correlationId = "corr-restart-001";
  pending.type = "restart";

  const std::string persisted =
      shcare::serializePendingReconnectCommand(pending);
  TEST_ASSERT_FALSE(persisted.empty());

  shcare::PendingReconnectCommand afterReboot;
  TEST_ASSERT_TRUE(
      shcare::restorePendingReconnectCommand(persisted, afterReboot));
  TEST_ASSERT_EQUAL_STRING("cmd-restart-001", afterReboot.commandId.c_str());
  TEST_ASSERT_EQUAL(
      shcare::PendingReconnectDecision::WaitingForReconnect,
      shcare::evaluatePendingReconnectCommand(afterReboot, false, true, "",
                                               ""));
  TEST_ASSERT_EQUAL(
      shcare::PendingReconnectDecision::WaitingForReconnect,
      shcare::evaluatePendingReconnectCommand(afterReboot, true, false, "",
                                               ""));
  TEST_ASSERT_EQUAL(
      shcare::PendingReconnectDecision::Confirmed,
      shcare::evaluatePendingReconnectCommand(afterReboot, true, true, "",
                                               ""));
}

void test_wifi_update_requires_exact_new_network_after_reboot() {
  shcare::PendingReconnectCommand pending;
  pending.commandId = "cmd-wifi-update-001";
  pending.correlationId = "corr-wifi-update-001";
  pending.type = "wifi.update";
  pending.expectedWifiSsid = "Clinic New WiFi";
  pending.expectedWifiConfigProof =
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

  const std::string persisted =
      shcare::serializePendingReconnectCommand(pending);
  TEST_ASSERT_FALSE(persisted.empty());

  shcare::PendingReconnectCommand afterReboot;
  TEST_ASSERT_TRUE(
      shcare::restorePendingReconnectCommand(persisted, afterReboot));
  TEST_ASSERT_EQUAL(
      shcare::PendingReconnectDecision::WaitingForReconnect,
      shcare::evaluatePendingReconnectCommand(
          afterReboot, false, true, "Clinic New WiFi",
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
  TEST_ASSERT_EQUAL(
      shcare::PendingReconnectDecision::NetworkMismatch,
      shcare::evaluatePendingReconnectCommand(
          afterReboot, true, true, "Clinic Old WiFi",
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
  TEST_ASSERT_EQUAL(
      shcare::PendingReconnectDecision::NetworkMismatch,
      shcare::evaluatePendingReconnectCommand(
          afterReboot, true, true, "Clinic New WiFi",
          "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"));
  TEST_ASSERT_EQUAL(
      shcare::PendingReconnectDecision::Confirmed,
      shcare::evaluatePendingReconnectCommand(
          afterReboot, true, true, "Clinic New WiFi",
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
}

void test_pending_reconnect_receipt_rejects_unsupported_or_incomplete_data() {
  shcare::PendingReconnectCommand pending;
  pending.commandId = "cmd-unsupported-001";
  pending.correlationId = "corr-unsupported-001";
  pending.type = "device.lock";
  TEST_ASSERT_TRUE(
      shcare::serializePendingReconnectCommand(pending).empty());

  pending.type = "wifi.update";
  TEST_ASSERT_TRUE(
      shcare::serializePendingReconnectCommand(pending).empty());

  shcare::PendingReconnectCommand restored;
  TEST_ASSERT_FALSE(shcare::restorePendingReconnectCommand(
      R"json({"version":1,"id":"cmd","correlationId":"corr","type":"wifi.update","expectedWifiSsid":""})json",
      restored));
}

void test_terminal_journal_accepts_reconnect_confirmed_results() {
  shcare::CommandJournal journal(4);
  shcare::CommandJournalEntry entry;
  entry.commandId = "cmd-restart-terminal-001";
  entry.correlationId = "corr-restart-terminal-001";
  entry.type = "restart";
  entry.state = "applied";
  entry.code = "RESTART_RECONNECT_CONFIRMED";
  entry.result = "authenticated reconnect confirmed";
  TEST_ASSERT_TRUE(journal.recordTerminal(entry));

  entry.commandId = "cmd-wifi-terminal-001";
  entry.correlationId = "corr-wifi-terminal-001";
  entry.type = "wifi.update";
  entry.code = "WIFI_RECONNECT_CONFIRMED";
  TEST_ASSERT_TRUE(journal.recordTerminal(entry));
}

void test_terminal_journal_persists_bounded_ota_tombstones() {
  shcare::CommandJournal journal(3);
  shcare::CommandJournalEntry entry;
  entry.commandId = "cmd-ota-tombstone-001";
  entry.correlationId = "corr-ota-tombstone-001";
  entry.type = "ota.update";
  entry.state = "applied";
  entry.code = "OTA_CONFIRMED";
  entry.result = "durable ota terminal event accepted";
  entry.effectFingerprint = kOtaManifestFingerprint;
  TEST_ASSERT_TRUE(journal.recordTerminal(entry));

  const std::string serialized = journal.serialize();
  TEST_ASSERT_FALSE(serialized.empty());
  TEST_ASSERT_EQUAL(std::string::npos,
                    serialized.find("downloadAuthorization"));
  shcare::CommandJournal afterReboot(3);
  TEST_ASSERT_TRUE(afterReboot.restore(serialized));
  shcare::CommandJournalEntry restored;
  TEST_ASSERT_TRUE(afterReboot.find("cmd-ota-tombstone-001", restored));
  TEST_ASSERT_EQUAL_STRING(kOtaManifestFingerprint,
                           restored.effectFingerprint.c_str());

  entry.commandId = "cmd-ota-tombstone-002";
  entry.correlationId = "corr-ota-tombstone-002";
  entry.state = "failed";
  entry.code = "OTA_ROLLED_BACK";
  TEST_ASSERT_TRUE(afterReboot.recordTerminal(entry));
  TEST_ASSERT_EQUAL_UINT32(2, afterReboot.size());

  entry.commandId = "cmd-ota-invalid";
  entry.correlationId = "corr-ota-invalid";
  entry.effectFingerprint.clear();
  TEST_ASSERT_FALSE(afterReboot.recordTerminal(entry));
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

void test_serializes_stable_ack_progress_and_reconnect_result_states() {
  const std::string acknowledged = shcare::buildCommandStateJson(
      "cmd-reconnect-001", "corr-reconnect-001", "acknowledged", "OK",
      "command authenticated");
  const std::string applying = shcare::buildCommandStateJson(
      "cmd-reconnect-001", "corr-reconnect-001", "applying",
      "WIFI_RECONNECTING", "applied requires authenticated reconnect");
  const std::string applied = shcare::buildCommandStateJson(
      "cmd-reconnect-001", "corr-reconnect-001", "applied",
      "WIFI_RECONNECT_CONFIRMED", "authenticated reconnect confirmed");

  TEST_ASSERT_NOT_EQUAL(
      std::string::npos,
      acknowledged.find("\"state\":\"acknowledged\""));
  TEST_ASSERT_NOT_EQUAL(std::string::npos,
                        applying.find("\"state\":\"applying\""));
  TEST_ASSERT_TRUE(applying.find("\"state\":\"applied\"") ==
                   std::string::npos);
  TEST_ASSERT_NOT_EQUAL(
      std::string::npos,
      applying.find("\"code\":\"WIFI_RECONNECTING\""));
  TEST_ASSERT_NOT_EQUAL(
      std::string::npos,
      applied.find("\"code\":\"WIFI_RECONNECT_CONFIRMED\""));
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
      "frameEncoding": "shcare_audio_v2",
      "workspaceId": "workspace-fixture-001",
      "patientId": "patient-fixture-001",
      "deviceId": "smarthealth-fixture-001",
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
  TEST_ASSERT_EQUAL_STRING(
      "shcare_audio_v2",
      result.command.payloadString("frameEncoding").c_str());
}

void test_audio_session_contract_accepts_v2_and_rejects_legacy_emission() {
  auto decision = shcare::evaluateAudioSessionContract(
      2, "shcare_audio_v2", "pcm_s16le", 16000, 128);
  TEST_ASSERT_EQUAL(shcare::AudioSessionContractCode::AcceptedV2,
                    decision.code);
  TEST_ASSERT_TRUE(decision.accepted());

  decision = shcare::evaluateAudioSessionContract(
      2, "raw_pcm_s16le", "pcm_s16le", 16000, 128);
  TEST_ASSERT_EQUAL(shcare::AudioSessionContractCode::FrameEncodingMismatch,
                    decision.code);
  TEST_ASSERT_FALSE(decision.accepted());

  decision = shcare::evaluateAudioSessionContract(
      1, "raw_pcm_s16le", "pcm_s16le", 16000, 128);
  TEST_ASSERT_EQUAL(shcare::AudioSessionContractCode::LegacyReceiverOnly,
                    decision.code);
  TEST_ASSERT_FALSE(decision.accepted());
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
  TEST_ASSERT_EQUAL_UINT8(0, frame[12]);
  TEST_ASSERT_EQUAL_UINT8(0, frame[13]);
  TEST_ASSERT_EQUAL_UINT8(0, frame[14]);
  TEST_ASSERT_EQUAL_UINT8(0, frame[15]);
  const uint8_t expectedTimestamp[] = {0x00, 0x00, 0x01, 0x9F,
                                       0x5D, 0xEC, 0x60, 0x7B};
  TEST_ASSERT_EQUAL_UINT8_ARRAY(expectedTimestamp, frame + 16,
                                sizeof(expectedTimestamp));
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

  uint8_t largeFrame[64] = {};
  result = shcare::buildAudioFrameV2(
      "session", "scan", 0, 1783987200123ULL, &sample, 1, 0,
      largeFrame, sizeof(largeFrame));
  TEST_ASSERT_EQUAL(shcare::AudioFrameBuildCode::InvalidFlags, result.code);

  result = shcare::buildAudioFrameV2(
      "session", "scan", 1, 1783987200123ULL, &sample, 1,
      shcare::kAudioV2FlagStart, largeFrame, sizeof(largeFrame));
  TEST_ASSERT_EQUAL(shcare::AudioFrameBuildCode::InvalidFlags, result.code);

  result = shcare::buildAudioFrameV2(
      "session", "scan", 1, 1783987200123ULL, &sample, 1,
      shcare::kAudioV2FlagDiscontinuity, largeFrame, sizeof(largeFrame));
  TEST_ASSERT_EQUAL(shcare::AudioFrameBuildCode::Ok, result.code);
}

void test_accepts_complete_ota_manifest_golden_fixture() {
  const auto result = validateOtaFixture();

  TEST_ASSERT_EQUAL(shcare::OtaManifestCode::Ok, result.code);
  TEST_ASSERT_EQUAL_STRING("OK", result.stableCode.c_str());
  TEST_ASSERT_EQUAL_STRING("1.2.3", result.manifest.firmwareVersion.c_str());
  TEST_ASSERT_EQUAL_STRING(
      "abcdefghijklmnopqrstuvwxyzABCDEFGH1234567890_-",
      result.manifest.downloadAuthorization.c_str());
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
  const std::string authorization =
      "abcdefghijklmnopqrstuvwxyzABCDEFGH1234567890_-";
  json.replace(json.find(authorization), authorization.size(),
               "invalid bearer value with spaces");
  result = validateOtaFixture(json);
  TEST_ASSERT_EQUAL(shcare::OtaManifestCode::InvalidDownloadAuthorization,
                    result.code);
  TEST_ASSERT_EQUAL_STRING("OTA_DOWNLOAD_AUTHORIZATION_INVALID",
                           result.stableCode.c_str());

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

void test_ota_command_admission_blocks_reentrancy_and_active_recording() {
  const char *nestedTypes[] = {
      "restart",          "wifi.status",       "device.lock",
      "device.revoke",    "device.rotate_secret", "wifi.update",
      "ota.update",       "audio.session.start", "audio.session.stop",
  };
  for (const char *type : nestedTypes) {
    TEST_ASSERT_EQUAL(
        shcare::DeviceCommandAdmission::OtaBusy,
        shcare::evaluateDeviceCommandAdmission(type, true, false));
  }

  TEST_ASSERT_EQUAL(
      shcare::DeviceCommandAdmission::RecordingActive,
      shcare::evaluateDeviceCommandAdmission("ota.update", false, true));
  TEST_ASSERT_EQUAL(
      shcare::DeviceCommandAdmission::Allowed,
      shcare::evaluateDeviceCommandAdmission("wifi.status", false, true));
  TEST_ASSERT_EQUAL(
      shcare::DeviceCommandAdmission::Allowed,
      shcare::evaluateDeviceCommandAdmission("ota.update", false, false));
}

void test_ota_rollback_policy_is_feasibility_gated_and_terminal() {
  TEST_ASSERT_EQUAL(
      shcare::OtaRollbackAction::None,
      shcare::evaluateOtaRollbackAction(false, true, true, false));
  TEST_ASSERT_EQUAL(
      shcare::OtaRollbackAction::Wait,
      shcare::evaluateOtaRollbackAction(true, false, true, false));
  TEST_ASSERT_EQUAL(
      shcare::OtaRollbackAction::FailUnavailable,
      shcare::evaluateOtaRollbackAction(true, true, false, false));
  TEST_ASSERT_EQUAL(
      shcare::OtaRollbackAction::RequestRollback,
      shcare::evaluateOtaRollbackAction(true, true, true, false));
  TEST_ASSERT_EQUAL(
      shcare::OtaRollbackAction::Terminal,
      shcare::evaluateOtaRollbackAction(true, true, true, true));
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

void test_pending_reconnect_fixture_restores_exact_network_authority() {
  const std::string payload =
      readGoldenFixture("test/fixtures/pending_reconnect_v1.json");
  shcare::PendingReconnectCommand pending;
  TEST_ASSERT_TRUE(
      shcare::restorePendingReconnectCommand(payload, pending));
  TEST_ASSERT_EQUAL_STRING("cmd-wifi-reconnect-fixture-001",
                           pending.commandId.c_str());
  TEST_ASSERT_EQUAL_STRING("corr-wifi-reconnect-fixture-001",
                           pending.correlationId.c_str());
  TEST_ASSERT_EQUAL_STRING("wifi.update", pending.type.c_str());
  TEST_ASSERT_EQUAL_STRING("Clinic New WiFi",
                           pending.expectedWifiSsid.c_str());
  TEST_ASSERT_EQUAL_STRING(
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      pending.expectedWifiConfigProof.c_str());
  TEST_ASSERT_EQUAL(
      shcare::PendingReconnectDecision::NetworkMismatch,
      shcare::evaluatePendingReconnectCommand(
          pending, true, true, "Clinic Old WiFi",
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
  TEST_ASSERT_EQUAL(
      shcare::PendingReconnectDecision::NetworkMismatch,
      shcare::evaluatePendingReconnectCommand(
          pending, true, true, "Clinic New WiFi",
          "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"));
  TEST_ASSERT_EQUAL(
      shcare::PendingReconnectDecision::Confirmed,
      shcare::evaluatePendingReconnectCommand(
          pending, true, true, "Clinic New WiFi",
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
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
  RUN_TEST(test_wifi_credentials_enforce_esp32_and_wpa_bounds);
  RUN_TEST(test_setup_access_point_accepts_only_canonical_device_ids);
  RUN_TEST(test_setup_access_point_matches_shared_golden_vector);
  RUN_TEST(test_setup_access_point_hashes_raw_device_secret_before_hmac);
  RUN_TEST(test_setup_access_point_fails_closed_without_identity_or_secret);
  RUN_TEST(test_auth_acceptance_is_bound_to_outstanding_challenge_device_and_session);
  RUN_TEST(test_auth_handshake_rejects_overlapping_challenges);
  RUN_TEST(test_ota_boot_health_requires_authenticated_production_wss_heartbeat);
  RUN_TEST(test_ota_recovery_safe_mode_blocks_services_for_every_rollback_failure);
  RUN_TEST(test_deduplicates_recent_command_ids);
  RUN_TEST(test_invalid_action_does_not_poison_recent_command_dedupe);
  RUN_TEST(test_terminal_command_journal_survives_simulated_reboot);
  RUN_TEST(test_command_journal_is_bounded_and_rejects_non_terminal_state);
  RUN_TEST(test_offline_operational_queue_is_bounded_and_prefers_events);
  RUN_TEST(test_offline_operational_queue_rejects_raw_audio_and_unapproved_data);
  RUN_TEST(test_offline_ota_events_require_and_preserve_exact_binding);
  RUN_TEST(test_pending_ota_receipt_survives_reboot_without_bearer);
  RUN_TEST(test_pending_ota_receipt_is_a_durable_command_identity_fence);
  RUN_TEST(test_pending_ota_replay_preserves_current_durable_outcome);
  RUN_TEST(test_pending_ota_recovery_distinguishes_new_image_rollback_and_power_loss);
  RUN_TEST(test_ota_confirmation_requires_durable_two_phase_state);
  RUN_TEST(test_ota_effect_binding_covers_signed_manifest_but_excludes_bearer);
  RUN_TEST(test_pending_restart_requires_authenticated_reconnect_after_reboot);
  RUN_TEST(test_wifi_update_requires_exact_new_network_after_reboot);
  RUN_TEST(test_pending_reconnect_receipt_rejects_unsupported_or_incomplete_data);
  RUN_TEST(test_terminal_journal_accepts_reconnect_confirmed_results);
  RUN_TEST(test_terminal_journal_persists_bounded_ota_tombstones);
  RUN_TEST(test_serializes_correlated_command_state);
  RUN_TEST(test_serializes_stable_ack_progress_and_reconnect_result_states);
  RUN_TEST(test_accepts_audio_session_start_command);
  RUN_TEST(test_audio_session_contract_accepts_v2_and_rejects_legacy_emission);
  RUN_TEST(test_builds_audio_v2_frame_in_network_byte_order);
  RUN_TEST(test_rejects_invalid_audio_v2_identity_and_capacity);
  RUN_TEST(test_accepts_complete_ota_manifest_golden_fixture);
  RUN_TEST(test_rejects_ota_transport_integrity_and_signature_downgrades);
  RUN_TEST(test_rejects_ota_target_partition_and_protocol_mismatch);
  RUN_TEST(test_rejects_malformed_equal_and_downgrade_ota_versions);
  RUN_TEST(test_requires_signature_minimum_protocol_and_strict_semver);
  RUN_TEST(test_auth_acceptance_is_bound_to_the_credential_attempt);
  RUN_TEST(test_ota_command_admission_blocks_reentrancy_and_active_recording);
  RUN_TEST(test_ota_rollback_policy_is_feasibility_gated_and_terminal);
#ifndef ARDUINO
  RUN_TEST(test_versioned_ota_fixture_files_match_canonical_bytes);
  RUN_TEST(test_versioned_command_journal_fixture_restores_terminal_result);
  RUN_TEST(test_pending_reconnect_fixture_restores_exact_network_authority);
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
