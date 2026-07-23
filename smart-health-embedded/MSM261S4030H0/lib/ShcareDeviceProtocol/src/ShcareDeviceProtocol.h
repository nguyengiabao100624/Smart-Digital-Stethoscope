#pragma once

#include <cstddef>
#include <cstdint>
#include <deque>
#include <string>

namespace shcare {

constexpr int kDeviceProtocolVersion = 1;
constexpr std::int64_t kMaxCommandFutureSkewMs = 120000;
constexpr std::uint8_t kAudioV2FlagStart = 1U << 0;
constexpr std::uint8_t kAudioV2FlagEnd = 1U << 1;
constexpr std::uint8_t kAudioV2FlagDiscontinuity = 1U << 2;
constexpr std::uint8_t kAudioV2FlagRetransmit = 1U << 3;
constexpr std::size_t kAudioV2FixedHeaderBytes = 30;
constexpr std::size_t kAudioV2MaxSessionIdBytes = 160;
constexpr std::size_t kAudioV2MaxScanIdBytes = 120;
constexpr std::size_t kAudioV2MaxSamples = 1024;

enum class CloudTransport {
  Disabled,
  Wss,
  WsDevelopment,
};

enum class RuntimeSecurityCode {
  Ready,
  BackendNotConfigured,
  DeviceCredentialRequired,
  CredentialStorageEncryptionRequired,
  ProductionTlsRequired,
  CaTrustRequired,
  DevelopmentWsNotEnabled,
};

struct RuntimeSecurityConfig {
  bool productionProfile = true;
  bool backendConfigured = false;
  bool tlsEnabled = false;
  bool caTrustConfigured = false;
  bool deviceIdentityConfigured = false;
  bool deviceSecretConfigured = false;
  bool credentialStorageEncrypted = false;
  bool developmentWsEnabled = false;
};

struct RuntimeSecurityDecision {
  RuntimeSecurityDecision(
      RuntimeSecurityCode nextCode =
          RuntimeSecurityCode::BackendNotConfigured,
      CloudTransport nextTransport = CloudTransport::Disabled,
      const char *nextStableCode = "BACKEND_NOT_CONFIGURED")
      : code(nextCode),
        transport(nextTransport),
        stableCode(nextStableCode) {}

  RuntimeSecurityCode code = RuntimeSecurityCode::BackendNotConfigured;
  CloudTransport transport = CloudTransport::Disabled;
  const char *stableCode = "BACKEND_NOT_CONFIGURED";

  bool ready() const { return code == RuntimeSecurityCode::Ready; }
};

RuntimeSecurityDecision evaluateRuntimeSecurity(
    const RuntimeSecurityConfig &config);
const char *cloudTransportLabel(CloudTransport transport);
bool developmentUdpAllowed(bool productionProfile,
                           bool developmentUdpEnabled);
std::uint32_t reconnectBackoffDelayMs(std::uint32_t attemptCount,
                                      std::uint32_t baseDelayMs,
                                      std::uint32_t maxDelayMs);
bool setupPortalAllowed(bool hasWifiConfig, bool physicalGesture);
bool setupPortalExpired(std::uint32_t nowMs, std::uint32_t startedAtMs,
                        std::uint32_t ttlMs);
bool validSetupPortalCsrf(const std::string &expectedToken,
                          const std::string &providedToken);

constexpr std::size_t kSetupSecretHashBytes = 32;

enum class SetupAccessPointCode {
  Ok,
  InvalidDeviceId,
  MissingDeviceSecret,
  DerivationFailed,
};

struct SetupAccessPointCredentials {
  SetupAccessPointCode code = SetupAccessPointCode::DerivationFailed;
  std::string ssid;
  std::string password;

  bool ok() const { return code == SetupAccessPointCode::Ok; }
};

bool validCanonicalDeviceId(const std::string &deviceId);
SetupAccessPointCredentials deriveSetupAccessPoint(
    const std::string &deviceId,
    const std::uint8_t secretHash[kSetupSecretHashBytes]);
SetupAccessPointCredentials deriveSetupAccessPointFromSecret(
    const std::string &deviceId, const std::string &deviceSecret);

struct OtaBootHealthInput {
  bool pendingVerification = false;
  bool i2sReady = false;
  bool stabilityWindowElapsed = false;
  bool productionProfile = true;
  bool runtimeSecurityReady = false;
  CloudTransport transport = CloudTransport::Disabled;
  bool authenticated = false;
  bool authenticatedHeartbeatObserved = false;
  bool recoveryPortalActive = false;
};

bool otaBootHealthReady(const OtaBootHealthInput &input);

enum class AuthAcceptanceCode {
  Accepted,
  NoOutstandingChallenge,
  ChallengeMismatch,
  DeviceMismatch,
  InvalidSession,
};

enum class AuthAcceptedParseCode {
  Ok,
  InvalidJson,
  UnsupportedProtocol,
  InvalidField,
};

struct AuthAcceptedMessage {
  int protocolVersion = 0;
  std::string challengeId;
  std::string deviceId;
  std::string sessionId;
  std::string serverTime;
  int telemetryIntervalMs = 0;
  std::string credentialSlot;
  std::string rotationId;
  std::string rotationState;
};

struct AuthAcceptedParseResult {
  AuthAcceptedParseCode code = AuthAcceptedParseCode::InvalidJson;
  const char *stableCode = "AUTH_ACCEPTED_INVALID_JSON";
  AuthAcceptedMessage message;

  bool ok() const { return code == AuthAcceptedParseCode::Ok; }
};

AuthAcceptedParseResult parseAuthAccepted(const std::string &json);
bool authAcceptanceMatchesCredentialAttempt(
    const AuthAcceptedMessage &accepted, bool usedPendingCredential,
    const std::string &pendingRotationId);

class AuthHandshakeState {
 public:
  bool beginChallenge(const std::string &challengeId);
  AuthAcceptanceCode accept(const std::string &challengeId,
                            const std::string &expectedDeviceId,
                            const std::string &acceptedDeviceId,
                            const std::string &sessionId);
  void reset();

  bool awaitingAcceptance() const { return !challengeId_.empty(); }
  const std::string &sessionId() const { return sessionId_; }

 private:
  std::string challengeId_;
  std::string sessionId_;
};

enum class AudioFrameBuildCode {
  Ok,
  InvalidIdentity,
  InvalidSamples,
  InvalidFlags,
  BufferTooSmall,
};

struct AudioFrameBuildResult {
  AudioFrameBuildResult(
      AudioFrameBuildCode nextCode = AudioFrameBuildCode::InvalidSamples,
      std::size_t nextBytesWritten = 0)
      : code(nextCode), bytesWritten(nextBytesWritten) {}

  AudioFrameBuildCode code;
  std::size_t bytesWritten;

  bool ok() const { return code == AudioFrameBuildCode::Ok; }
};

AudioFrameBuildResult buildAudioFrameV2(
    const std::string &sessionId, const std::string &scanId,
    std::uint32_t sequence, std::uint64_t timestampMs,
    const std::int16_t *samples, std::size_t sampleCount,
    std::uint8_t flags, std::uint8_t *output, std::size_t outputCapacity);

enum class CommandParseCode {
  Ok,
  InvalidJson,
  UnsupportedProtocol,
  MissingField,
  InvalidField,
  ClockUnavailable,
  Expired,
  IssuedInFuture,
  UnknownCommand,
};

struct CommandEnvelope {
  int protocolVersion = 0;
  std::string id;
  std::string type;
  std::string issuedAt;
  std::string expiresAt;
  std::string correlationId;
  std::string payloadJson;

  std::string payloadString(const char *key) const;
  int payloadInt(const char *key, int fallback = 0) const;
};

struct CommandParseResult {
  CommandParseCode code = CommandParseCode::InvalidJson;
  std::string stableCode;
  CommandEnvelope command;

  bool ok() const { return code == CommandParseCode::Ok; }
};

CommandParseResult parseCommandEnvelope(const std::string &json,
                                        std::int64_t nowEpochMs);

constexpr const char *kOtaHardwareTarget = "MSM261S4030H0";
constexpr const char *kOtaPartitionTarget = "app";

enum class OtaManifestCode {
  Ok,
  WrongCommandType,
  HttpsRequired,
  InvalidVersion,
  DowngradeRejected,
  InvalidChecksum,
  MissingSignature,
  InvalidSignature,
  HardwareTargetMismatch,
  PartitionTargetMismatch,
  InvalidMinimumProtocol,
  ProtocolTooOld,
};

struct OtaManifest {
  std::string url;
  std::string firmwareVersion;
  std::string checksum;
  std::string signature;
  std::string hardwareTarget;
  std::string partitionTarget;
  int minimumProtocolVersion = 0;
};

struct OtaManifestValidation {
  OtaManifestCode code = OtaManifestCode::WrongCommandType;
  std::string stableCode;
  OtaManifest manifest;

  bool ok() const { return code == OtaManifestCode::Ok; }
};

OtaManifestValidation validateOtaManifest(
    const CommandEnvelope &command,
    const std::string &currentFirmwareVersion,
    int deviceProtocolVersion = kDeviceProtocolVersion);

std::string buildOtaSignatureMessage(const OtaManifest &manifest);

std::string buildCommandStateJson(const std::string &commandId,
                                  const std::string &correlationId,
                                  const std::string &state,
                                  const std::string &code,
                                  const std::string &detail);

class RecentCommandIds {
 public:
  explicit RecentCommandIds(std::size_t capacity);

  bool seen(const std::string &commandId) const;
  void remember(const std::string &commandId);
  bool rememberValidated(const std::string &commandId, bool actionValid);

 private:
  std::size_t capacity_;
  std::deque<std::string> commandIds_;
};

struct CommandJournalEntry {
  std::string commandId;
  std::string correlationId;
  std::string type;
  std::string state;
  std::string code;
  std::string result;

  bool terminal() const;
};

class CommandJournal {
 public:
  explicit CommandJournal(std::size_t capacity);

  bool recordTerminal(const CommandJournalEntry &entry);
  bool find(const std::string &commandId, CommandJournalEntry &entry) const;
  bool restore(const std::string &serialized);
  std::string serialize() const;
  std::size_t size() const { return entries_.size(); }

 private:
  std::size_t capacity_;
  std::deque<CommandJournalEntry> entries_;
};

}  // namespace shcare
