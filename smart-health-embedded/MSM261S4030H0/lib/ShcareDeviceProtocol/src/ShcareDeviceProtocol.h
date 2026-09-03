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
constexpr const char *kAudioV2FrameEncoding = "shcare_audio_v2";
constexpr const char *kAudioPcmEncoding = "pcm_s16le";
constexpr const char *kAudioV1RawFrameEncoding = "raw_pcm_s16le";
constexpr int kAudioSampleRate = 16000;
constexpr std::size_t kAudioPacketSamples = 128;
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
bool setupPortalAllowed(bool hasWifiConfig, bool physicalGesture,
                        bool trustedRecovery = false);
bool shouldOpenSetupPortalAfterReconnectFailures(std::uint32_t failureCount,
                                                 std::uint32_t threshold);
bool setupPortalExpired(std::uint32_t nowMs, std::uint32_t startedAtMs,
                        std::uint32_t ttlMs);
bool validSetupPortalCsrf(const std::string &expectedToken,
                          const std::string &providedToken);
bool validWifiCredentials(const std::string &ssid,
                          const std::string &password);

enum class SetupWifiProvisioningParseCode {
  Ok,
  PayloadTooLarge,
  MalformedJson,
  UnsupportedProtocol,
  DeviceMismatch,
  InvalidSession,
  InvalidCredentials,
};

struct SetupWifiProvisioningRequest {
  std::string deviceId;
  std::string ssid;
  std::string password;
};

struct SetupWifiProvisioningParseResult {
  SetupWifiProvisioningParseCode code =
      SetupWifiProvisioningParseCode::MalformedJson;
  SetupWifiProvisioningRequest request;

  bool ok() const { return code == SetupWifiProvisioningParseCode::Ok; }
};

SetupWifiProvisioningParseResult parseSetupWifiProvisioningRequest(
    const std::string &json, const std::string &expectedDeviceId,
    const std::string &expectedCsrfToken);

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

enum class DeviceCommandAdmission {
  Allowed,
  OtaBusy,
  RecordingActive,
};

DeviceCommandAdmission evaluateDeviceCommandAdmission(
    const std::string &commandType, bool otaInProgress,
    bool audioSessionActive);

enum class OtaRollbackAction {
  None,
  Wait,
  Terminal,
  FailUnavailable,
  RequestRollback,
};

OtaRollbackAction evaluateOtaRollbackAction(
    bool pendingVerification, bool timeoutElapsed, bool rollbackPossible,
    bool terminal);

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
// The value is only suitable for setting the local clock after the caller has
// authenticated the enclosing WSS session and bound this acceptance to its
// outstanding device challenge.
bool parseAuthAcceptedServerTimeEpochMillis(const AuthAcceptedMessage &accepted,
                                            std::int64_t &epochMs);
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

enum class AudioSessionContractCode {
  AcceptedV2,
  LegacyReceiverOnly,
  UnsupportedProtocol,
  FrameEncodingMismatch,
  PayloadEncodingMismatch,
  SampleRateMismatch,
  SampleCountMismatch,
};

struct AudioSessionContractDecision {
  explicit AudioSessionContractDecision(
      AudioSessionContractCode nextCode =
          AudioSessionContractCode::UnsupportedProtocol)
      : code(nextCode) {}

  AudioSessionContractCode code;

  bool accepted() const {
    return code == AudioSessionContractCode::AcceptedV2;
  }
};

AudioSessionContractDecision evaluateAudioSessionContract(
    int protocolVersion, const std::string &frameEncoding,
    const std::string &payloadEncoding, int sampleRate,
    std::size_t sampleCount);

enum class AudioCaptureProfile {
  Unsupported,
  Heart,
  Lung,
};

struct AudioCaptureProfileDecision {
  AudioCaptureProfileDecision() = default;
  AudioCaptureProfileDecision(AudioCaptureProfile nextProfile,
                              float nextLowCutHz, float nextHighCutHz,
                              float nextListenGain,
                              bool nextHeartMetricsEnabled)
      : profile(nextProfile),
        lowCutHz(nextLowCutHz),
        highCutHz(nextHighCutHz),
        listenGain(nextListenGain),
        heartMetricsEnabled(nextHeartMetricsEnabled) {}

  AudioCaptureProfile profile = AudioCaptureProfile::Unsupported;
  float lowCutHz = 0.0f;
  float highCutHz = 0.0f;
  float listenGain = 1.0f;
  bool heartMetricsEnabled = false;

  bool accepted() const {
    return profile != AudioCaptureProfile::Unsupported;
  }
};

AudioCaptureProfileDecision resolveAudioCaptureProfile(
    const std::string &profileName);

struct AudioSlotFrameStats {
  AudioSlotFrameStats() = default;
  AudioSlotFrameStats(std::uint64_t nextEnergy, std::uint32_t nextPeak,
                      std::uint32_t nextNonZeroSamples,
                      std::uint32_t nextClippedSamples)
      : energy(nextEnergy),
        peak(nextPeak),
        nonZeroSamples(nextNonZeroSamples),
        clippedSamples(nextClippedSamples) {}

  std::uint64_t energy = 0;
  std::uint32_t peak = 0;
  std::uint32_t nonZeroSamples = 0;
  std::uint32_t clippedSamples = 0;
};

std::uint8_t selectAudioCaptureSlot(
    const AudioSlotFrameStats &slot0, const AudioSlotFrameStats &slot1,
    std::uint8_t currentSlot, std::size_t sampleCount);

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
  InvalidDownloadAuthorization,
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
  // Transient bearer value used only for the authenticated firmware GET.
  // It is deliberately excluded from the signed artifact message and from
  // every durable OTA receipt.
  std::string downloadAuthorization;
  std::string firmwareVersion;
  std::string checksum;
  std::string signature;
  std::string hardwareTarget;
  std::string partitionTarget;
  int minimumProtocolVersion = 0;
};

struct PendingOtaReceipt {
  std::string commandId;
  std::string correlationId;
  std::string otaId;
  std::string firmwareVersion;
  std::string manifestFingerprint;
  std::string status;
};

std::string serializePendingOtaReceipt(const PendingOtaReceipt &receipt);
bool restorePendingOtaReceipt(const std::string &serialized,
                              PendingOtaReceipt &receipt);

enum class PendingOtaCommandDecision {
  NoFence,
  Replay,
  CommandIdConflict,
  OtaReceiptBusy,
  InvalidFence,
};

PendingOtaCommandDecision evaluatePendingOtaCommand(
    const PendingOtaReceipt &receipt, bool receiptReady,
    const std::string &commandId, const std::string &correlationId,
    const std::string &commandType,
    const std::string &manifestFingerprint);

struct PendingOtaReplayOutcome {
  std::string commandState;
  std::string commandCode;
  std::string eventType;

  bool emitsEvent() const { return !eventType.empty(); }
};

bool buildPendingOtaReplayOutcome(const PendingOtaReceipt &receipt,
                                  PendingOtaReplayOutcome &outcome);

enum class PendingOtaRecoveryAction {
  None,
  AwaitBootHealth,
  RollbackRequired,
  Terminal,
  Confirmed,
  RolledBack,
  Failed,
};

PendingOtaRecoveryAction evaluatePendingOtaRecovery(
    const PendingOtaReceipt &receipt, bool receiptReady,
    bool partitionStateKnown, bool pendingImage,
    bool targetFirmwareRunning, bool runningImageValid,
    const std::string &bootOutcome);

enum class OtaRecoverySafeModeReason {
  None,
  RollbackUnavailable,
  RollbackIntentPersistenceFailed,
  RollbackApiReturned,
};

bool otaRecoveryServicesAllowed(OtaRecoverySafeModeReason reason);
const char *otaRecoverySafeModeStableCode(OtaRecoverySafeModeReason reason);

enum class OtaConfirmationAction {
  PersistConfirmingMarker,
  CancelRollback,
  PersistConfirmedState,
  PublishConfirmed,
};

OtaConfirmationAction evaluateOtaConfirmationAction(
    bool confirmingMarkerDurable, bool rollbackCancelled,
    bool confirmedMarkerDurable, bool receiptConfirmedDurable);

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
std::string buildOtaEffectBindingMessage(const OtaManifest &manifest);

std::string buildCommandStateJson(const std::string &commandId,
                                  const std::string &correlationId,
                                  const std::string &state,
                                  const std::string &code,
                                  const std::string &detail);

struct PendingReconnectCommand {
  std::string commandId;
  std::string correlationId;
  std::string type;
  std::string expectedWifiSsid;
  std::string expectedWifiConfigProof;
};

enum class PendingReconnectDecision {
  WaitingForReconnect,
  Confirmed,
  NetworkMismatch,
  InvalidReceipt,
};

std::string serializePendingReconnectCommand(
    const PendingReconnectCommand &command);
bool restorePendingReconnectCommand(
    const std::string &serialized, PendingReconnectCommand &command);
PendingReconnectDecision evaluatePendingReconnectCommand(
    const PendingReconnectCommand &command, bool cloudAuthenticated,
    bool wifiConnected, const std::string &connectedWifiSsid,
    const std::string &currentWifiConfigProof);

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
  // Required for ota.update tombstones; empty for other command types.
  std::string effectFingerprint;

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

// The device deliberately keeps only compact operational markers while it is
// offline. This contract has no byte or payload field, so PCM, clinical media
// and PHI cannot enter the retry queue through it.
enum class OfflineOperationalKind {
  Telemetry,
  Event,
};

struct OfflineOperationalRecord {
  OfflineOperationalKind kind = OfflineOperationalKind::Telemetry;
  std::string type;
  std::string status;
  std::string commandId;
  std::string correlationId;
  std::string otaId;
  std::uint32_t occurredAtUptimeMs = 0;
  std::uint32_t occurrences = 1;
};

class OfflineOperationalQueue {
 public:
  explicit OfflineOperationalQueue(std::size_t capacity);

  bool enqueueTelemetry(std::uint32_t occurredAtUptimeMs);
  bool enqueueEvent(const std::string &type, const std::string &status,
                    std::uint32_t occurredAtUptimeMs,
                    const std::string &commandId = {},
                    const std::string &correlationId = {},
                    const std::string &otaId = {});
  bool front(OfflineOperationalRecord &record) const;
  bool popFront();

  std::size_t size() const { return entries_.size(); }
  std::uint32_t droppedCount() const { return droppedCount_; }
  std::uint32_t coalescedCount() const { return coalescedCount_; }
  std::uint32_t rejectedCount() const { return rejectedCount_; }

 private:
  bool push(OfflineOperationalRecord record);

  std::size_t capacity_;
  std::deque<OfflineOperationalRecord> entries_;
  std::uint32_t droppedCount_ = 0;
  std::uint32_t coalescedCount_ = 0;
  std::uint32_t rejectedCount_ = 0;
};

}  // namespace shcare
