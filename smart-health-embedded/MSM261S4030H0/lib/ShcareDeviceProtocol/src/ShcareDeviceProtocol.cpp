#include "ShcareDeviceProtocol.h"

#include <ArduinoJson.h>

#include <algorithm>
#include <cstdio>
#include <limits>

namespace shcare {
namespace {

constexpr std::size_t kMaxCommandBytes = 4096;
constexpr std::size_t kMaxIdBytes = 128;
constexpr std::size_t kMaxTypeBytes = 64;
constexpr std::size_t kMaxTimestampBytes = 40;
constexpr std::size_t kMaxPayloadBytes = 2048;
constexpr std::size_t kMaxOtaUrlBytes = 1024;
constexpr std::size_t kMaxOtaVersionBytes = 80;
constexpr std::size_t kMaxOtaSignatureEncodedBytes = 684;
constexpr std::size_t kMaxCommandJournalBytes = 4096;
constexpr std::size_t kMaxCommandResultBytes = 192;
constexpr std::size_t kMinAuthBindingBytes = 16;
constexpr std::size_t kMaxAuthBindingBytes = 160;
constexpr std::size_t kMaxAuthDeviceIdBytes = 120;

struct SemanticVersion {
  std::uint32_t major = 0;
  std::uint32_t minor = 0;
  std::uint32_t patch = 0;
  std::string prerelease;
};

CommandParseResult error(CommandParseCode code, const char *stableCode) {
  CommandParseResult result;
  result.code = code;
  result.stableCode = stableCode;
  return result;
}

bool readRequiredString(JsonObjectConst root, const char *key,
                        std::size_t maxBytes, std::string &output) {
  const JsonVariantConst value = root[key];
  if (!value.is<const char *>()) {
    return false;
  }
  const char *raw = value.as<const char *>();
  if (raw == nullptr) {
    return false;
  }
  output = raw;
  return !output.empty() && output.size() <= maxBytes;
}

bool isLeapYear(int year) {
  return year % 4 == 0 && (year % 100 != 0 || year % 400 == 0);
}

int daysInMonth(int year, int month) {
  static constexpr int kDays[] = {31, 28, 31, 30, 31, 30,
                                  31, 31, 30, 31, 30, 31};
  if (month == 2 && isLeapYear(year)) {
    return 29;
  }
  return month >= 1 && month <= 12 ? kDays[month - 1] : 0;
}

std::int64_t daysFromCivil(int year, unsigned month, unsigned day) {
  year -= month <= 2;
  const int era = (year >= 0 ? year : year - 399) / 400;
  const unsigned yearOfEra = static_cast<unsigned>(year - era * 400);
  const unsigned adjustedMonth = month > 2 ? month - 3 : month + 9;
  const unsigned dayOfYear = (153 * adjustedMonth + 2) / 5 + day - 1;
  const unsigned dayOfEra =
      yearOfEra * 365 + yearOfEra / 4 - yearOfEra / 100 + dayOfYear;
  return static_cast<std::int64_t>(era) * 146097 + dayOfEra - 719468;
}

bool parseIso8601UtcMillis(const std::string &value, std::int64_t &epochMs) {
  if (value.size() < 20 || value.size() > kMaxTimestampBytes ||
      value[4] != '-' || value[7] != '-' || value[10] != 'T' ||
      value[13] != ':' || value[16] != ':' || value.back() != 'Z') {
    return false;
  }

  int year = 0;
  int month = 0;
  int day = 0;
  int hour = 0;
  int minute = 0;
  int second = 0;
  if (std::sscanf(value.c_str(), "%4d-%2d-%2dT%2d:%2d:%2d", &year, &month,
                  &day, &hour, &minute, &second) != 6) {
    return false;
  }
  if (year < 1970 || month < 1 || month > 12 || day < 1 ||
      day > daysInMonth(year, month) || hour < 0 || hour > 23 || minute < 0 ||
      minute > 59 || second < 0 || second > 59) {
    return false;
  }

  int millis = 0;
  if (value.size() > 20) {
    if (value[19] != '.') {
      return false;
    }
    const std::size_t digits = value.size() - 21;
    if (digits == 0 || digits > 3) {
      return false;
    }
    int scale = 100;
    for (std::size_t index = 20; index < value.size() - 1; ++index) {
      const char digit = value[index];
      if (digit < '0' || digit > '9') {
        return false;
      }
      millis += (digit - '0') * scale;
      scale /= 10;
    }
  }

  epochMs =
      ((daysFromCivil(year, static_cast<unsigned>(month),
                      static_cast<unsigned>(day)) *
            24 +
        hour) *
           60 +
       minute) *
          60 *
          1000 +
      second * 1000 + millis;
  return true;
}

bool isSupportedCommand(const std::string &type) {
  static constexpr const char *kSupported[] = {
      "restart",      "wifi.status", "device.lock",
      "device.revoke", "device.rotate_secret", "wifi.update", "ota.update",
      "audio.session.start", "audio.session.stop",
  };
  return std::any_of(std::begin(kSupported), std::end(kSupported),
                     [&type](const char *candidate) { return type == candidate; });
}

bool hasControlCharacter(const std::string &value) {
  return std::any_of(value.begin(), value.end(), [](unsigned char character) {
    return character < 0x20 || character == 0x7f;
  });
}

bool parseUnsignedVersionPart(const std::string &value,
                              std::uint32_t &output) {
  if (value.empty() || (value.size() > 1 && value.front() == '0')) {
    return false;
  }
  std::uint64_t parsed = 0;
  for (const char character : value) {
    if (character < '0' || character > '9') {
      return false;
    }
    parsed = parsed * 10 + static_cast<unsigned>(character - '0');
    if (parsed > std::numeric_limits<std::uint32_t>::max()) {
      return false;
    }
  }
  output = static_cast<std::uint32_t>(parsed);
  return true;
}

bool validSemanticIdentifiers(const std::string &value,
                              bool rejectNumericLeadingZeros) {
  if (value.empty()) {
    return false;
  }
  std::size_t start = 0;
  while (start < value.size()) {
    const std::size_t end = value.find('.', start);
    const std::size_t length =
        (end == std::string::npos ? value.size() : end) - start;
    if (length == 0) {
      return false;
    }
    bool numeric = true;
    for (std::size_t index = start; index < start + length; ++index) {
      const char character = value[index];
      const bool alphaNumeric =
          (character >= '0' && character <= '9') ||
          (character >= 'A' && character <= 'Z') ||
          (character >= 'a' && character <= 'z');
      if (!alphaNumeric && character != '-') {
        return false;
      }
      numeric = numeric && character >= '0' && character <= '9';
    }
    if (rejectNumericLeadingZeros && numeric && length > 1 &&
        value[start] == '0') {
      return false;
    }
    if (end == std::string::npos) {
      break;
    }
    start = end + 1;
  }
  return true;
}

bool parseSemanticVersion(const std::string &value, SemanticVersion &output) {
  if (value.empty() || value.size() > kMaxOtaVersionBytes ||
      hasControlCharacter(value)) {
    return false;
  }

  const std::size_t plus = value.find('+');
  if (plus != std::string::npos) {
    if (value.find('+', plus + 1) != std::string::npos ||
        !validSemanticIdentifiers(value.substr(plus + 1), false)) {
      return false;
    }
  }
  const std::string withoutBuild = value.substr(0, plus);
  const std::size_t dash = withoutBuild.find('-');
  const std::string core = withoutBuild.substr(0, dash);
  output.prerelease =
      dash == std::string::npos ? std::string{} : withoutBuild.substr(dash + 1);
  if (dash != std::string::npos &&
      !validSemanticIdentifiers(output.prerelease, true)) {
    return false;
  }

  std::uint32_t *parts[] = {&output.major, &output.minor, &output.patch};
  std::size_t start = 0;
  for (std::size_t index = 0; index < 3; ++index) {
    const std::size_t end = core.find('.', start);
    if ((index < 2 && end == std::string::npos) ||
        (index == 2 && end != std::string::npos)) {
      return false;
    }
    const std::string part = core.substr(
        start, (end == std::string::npos ? core.size() : end) - start);
    if (!parseUnsignedVersionPart(part, *parts[index])) {
      return false;
    }
    start = end == std::string::npos ? core.size() : end + 1;
  }
  return start == core.size();
}

bool numericIdentifier(const std::string &value) {
  return !value.empty() &&
         std::all_of(value.begin(), value.end(), [](const char character) {
           return character >= '0' && character <= '9';
         });
}

int comparePrerelease(const std::string &left, const std::string &right) {
  if (left.empty() || right.empty()) {
    if (left == right) return 0;
    return left.empty() ? 1 : -1;
  }

  std::size_t leftStart = 0;
  std::size_t rightStart = 0;
  while (leftStart < left.size() || rightStart < right.size()) {
    if (leftStart >= left.size()) return -1;
    if (rightStart >= right.size()) return 1;
    const std::size_t leftEnd = left.find('.', leftStart);
    const std::size_t rightEnd = right.find('.', rightStart);
    const std::string leftPart = left.substr(
        leftStart, (leftEnd == std::string::npos ? left.size() : leftEnd) -
                       leftStart);
    const std::string rightPart = right.substr(
        rightStart,
        (rightEnd == std::string::npos ? right.size() : rightEnd) - rightStart);
    const bool leftNumeric = numericIdentifier(leftPart);
    const bool rightNumeric = numericIdentifier(rightPart);
    if (leftNumeric && rightNumeric) {
      if (leftPart.size() != rightPart.size()) {
        return leftPart.size() < rightPart.size() ? -1 : 1;
      }
    } else if (leftNumeric != rightNumeric) {
      return leftNumeric ? -1 : 1;
    }
    if (leftPart != rightPart) {
      return leftPart < rightPart ? -1 : 1;
    }
    leftStart = leftEnd == std::string::npos ? left.size() : leftEnd + 1;
    rightStart = rightEnd == std::string::npos ? right.size() : rightEnd + 1;
  }
  return 0;
}

int compareSemanticVersions(const SemanticVersion &left,
                            const SemanticVersion &right) {
  const std::uint32_t leftParts[] = {left.major, left.minor, left.patch};
  const std::uint32_t rightParts[] = {right.major, right.minor, right.patch};
  for (std::size_t index = 0; index < 3; ++index) {
    if (leftParts[index] != rightParts[index]) {
      return leftParts[index] < rightParts[index] ? -1 : 1;
    }
  }
  return comparePrerelease(left.prerelease, right.prerelease);
}

bool isSha256Hex(const std::string &value) {
  return value.size() == 64 &&
         std::all_of(value.begin(), value.end(), [](const char character) {
           return (character >= '0' && character <= '9') ||
                  (character >= 'a' && character <= 'f') ||
                  (character >= 'A' && character <= 'F');
         });
}

bool isValidBase64Signature(const std::string &value) {
  if (value.empty() || value.size() > kMaxOtaSignatureEncodedBytes ||
      value.size() % 4 == 1) {
    return false;
  }
  std::size_t padding = 0;
  bool sawPadding = false;
  for (const char character : value) {
    if (character == '=') {
      sawPadding = true;
      ++padding;
      if (padding > 2) return false;
      continue;
    }
    if (sawPadding) return false;
    const bool alphaNumeric =
        (character >= '0' && character <= '9') ||
        (character >= 'A' && character <= 'Z') ||
        (character >= 'a' && character <= 'z');
    if (!alphaNumeric && character != '+' && character != '/' &&
        character != '-' && character != '_') {
      return false;
    }
  }
  return padding == 0 || value.size() % 4 == 0;
}

bool isHttpsUrl(const std::string &value) {
  constexpr const char kPrefix[] = "https://";
  if (value.size() <= sizeof(kPrefix) - 1 || value.size() > kMaxOtaUrlBytes ||
      value.compare(0, sizeof(kPrefix) - 1, kPrefix) != 0 ||
      hasControlCharacter(value)) {
    return false;
  }
  const std::size_t authorityStart = sizeof(kPrefix) - 1;
  const std::size_t authorityEnd = value.find_first_of("/?#", authorityStart);
  const std::string authority = value.substr(
      authorityStart,
      (authorityEnd == std::string::npos ? value.size() : authorityEnd) -
          authorityStart);
  return !authority.empty() && authority.find('@') == std::string::npos &&
         authority.find(' ') == std::string::npos;
}

OtaManifestValidation otaError(OtaManifestCode code, const char *stableCode,
                               const OtaManifest &manifest) {
  OtaManifestValidation result;
  result.code = code;
  result.stableCode = stableCode;
  result.manifest = manifest;
  return result;
}

void writeUint16Be(std::uint8_t *output, std::size_t offset,
                   std::uint16_t value) {
  output[offset] = static_cast<std::uint8_t>((value >> 8) & 0xff);
  output[offset + 1] = static_cast<std::uint8_t>(value & 0xff);
}

void writeUint32Be(std::uint8_t *output, std::size_t offset,
                   std::uint32_t value) {
  output[offset] = static_cast<std::uint8_t>((value >> 24) & 0xff);
  output[offset + 1] = static_cast<std::uint8_t>((value >> 16) & 0xff);
  output[offset + 2] = static_cast<std::uint8_t>((value >> 8) & 0xff);
  output[offset + 3] = static_cast<std::uint8_t>(value & 0xff);
}

void writeUint64Be(std::uint8_t *output, std::size_t offset,
                   std::uint64_t value) {
  for (std::size_t index = 0; index < 8; ++index) {
    const std::size_t shift = (7 - index) * 8;
    output[offset + index] =
        static_cast<std::uint8_t>((value >> shift) & 0xff);
  }
}

}  // namespace

std::uint32_t reconnectBackoffDelayMs(std::uint32_t attemptCount,
                                      std::uint32_t baseDelayMs,
                                      std::uint32_t maxDelayMs) {
  if (baseDelayMs == 0 || maxDelayMs == 0) {
    return 0;
  }
  std::uint32_t delayMs = std::min(baseDelayMs, maxDelayMs);
  std::uint32_t remainingDoublings = attemptCount > 0 ? attemptCount - 1 : 0;
  while (remainingDoublings-- > 0 && delayMs < maxDelayMs) {
    if (delayMs > maxDelayMs / 2U) {
      return maxDelayMs;
    }
    delayMs *= 2U;
  }
  return std::min(delayMs, maxDelayMs);
}

RuntimeSecurityDecision evaluateRuntimeSecurity(
    const RuntimeSecurityConfig &config) {
  if (!config.backendConfigured) {
    return {RuntimeSecurityCode::BackendNotConfigured,
            CloudTransport::Disabled, "BACKEND_NOT_CONFIGURED"};
  }
  if (!config.deviceIdentityConfigured || !config.deviceSecretConfigured) {
    return {RuntimeSecurityCode::DeviceCredentialRequired,
            CloudTransport::Disabled, "DEVICE_CREDENTIAL_REQUIRED"};
  }
  if (config.productionProfile && !config.credentialStorageEncrypted) {
    return {RuntimeSecurityCode::CredentialStorageEncryptionRequired,
            CloudTransport::Disabled,
            "CREDENTIAL_STORAGE_ENCRYPTION_REQUIRED"};
  }
  if (config.tlsEnabled) {
    if (!config.caTrustConfigured) {
      return {RuntimeSecurityCode::CaTrustRequired, CloudTransport::Disabled,
              "CA_TRUST_REQUIRED"};
    }
    return {RuntimeSecurityCode::Ready, CloudTransport::Wss, "READY"};
  }
  if (config.productionProfile) {
    return {RuntimeSecurityCode::ProductionTlsRequired,
            CloudTransport::Disabled, "PRODUCTION_TLS_REQUIRED"};
  }
  if (!config.developmentWsEnabled) {
    return {RuntimeSecurityCode::DevelopmentWsNotEnabled,
            CloudTransport::Disabled, "DEVELOPMENT_WS_NOT_ENABLED"};
  }
  return {RuntimeSecurityCode::Ready, CloudTransport::WsDevelopment,
          "READY"};
}

const char *cloudTransportLabel(CloudTransport transport) {
  switch (transport) {
    case CloudTransport::Wss:
      return "WSS";
    case CloudTransport::WsDevelopment:
      return "WS_DEVELOPMENT";
    case CloudTransport::Disabled:
    default:
      return "DISABLED";
  }
}

bool developmentUdpAllowed(bool productionProfile,
                           bool developmentUdpEnabled) {
  return !productionProfile && developmentUdpEnabled;
}

bool setupPortalAllowed(bool hasWifiConfig, bool physicalGesture) {
  return !hasWifiConfig || physicalGesture;
}

bool setupPortalExpired(std::uint32_t nowMs, std::uint32_t startedAtMs,
                        std::uint32_t ttlMs) {
  if (ttlMs == 0) {
    return true;
  }
  return static_cast<std::uint32_t>(nowMs - startedAtMs) >= ttlMs;
}

bool validSetupPortalCsrf(const std::string &expectedToken,
                          const std::string &providedToken) {
  constexpr std::size_t kMaxSetupPortalCsrfBytes = 128;
  if (expectedToken.empty() || providedToken.empty() ||
      expectedToken.size() > kMaxSetupPortalCsrfBytes ||
      providedToken.size() > kMaxSetupPortalCsrfBytes) {
    return false;
  }

  const std::size_t comparedBytes =
      std::max(expectedToken.size(), providedToken.size());
  std::uint32_t difference =
      static_cast<std::uint32_t>(expectedToken.size() ^
                                 providedToken.size());
  for (std::size_t index = 0; index < comparedBytes; ++index) {
    const std::uint8_t expected =
        index < expectedToken.size()
            ? static_cast<std::uint8_t>(expectedToken[index])
            : 0;
    const std::uint8_t provided =
        index < providedToken.size()
            ? static_cast<std::uint8_t>(providedToken[index])
            : 0;
    difference |= static_cast<std::uint32_t>(expected ^ provided);
  }
  return difference == 0;
}

bool otaBootHealthReady(const OtaBootHealthInput &input) {
  return input.pendingVerification && input.i2sReady &&
         input.stabilityWindowElapsed && input.productionProfile &&
         input.runtimeSecurityReady &&
         input.transport == CloudTransport::Wss && input.authenticated &&
         input.authenticatedHeartbeatObserved &&
         !input.recoveryPortalActive;
}

AuthAcceptedParseResult parseAuthAccepted(const std::string &json) {
  AuthAcceptedParseResult result;
  if (json.empty() || json.size() > 2048) {
    return result;
  }
  JsonDocument document;
  if (deserializeJson(document, json)) {
    return result;
  }
  const JsonObjectConst root = document.as<JsonObjectConst>();
  if (root.isNull() || (root.size() != 7 && root.size() != 10) ||
      !root["type"].is<const char *>() ||
      std::string(root["type"].as<const char *>()) != "auth.accepted") {
    result.code = AuthAcceptedParseCode::InvalidField;
    result.stableCode = "AUTH_ACCEPTED_INVALID_FIELD";
    return result;
  }
  if (!root["protocolVersion"].is<int>() ||
      root["protocolVersion"].as<int>() != kDeviceProtocolVersion) {
    result.code = AuthAcceptedParseCode::UnsupportedProtocol;
    result.stableCode = "AUTH_ACCEPTED_UNSUPPORTED_PROTOCOL";
    return result;
  }

  result.message.protocolVersion = kDeviceProtocolVersion;
  if (!readRequiredString(root, "challengeId", kMaxAuthBindingBytes,
                          result.message.challengeId) ||
      result.message.challengeId.size() < kMinAuthBindingBytes ||
      !readRequiredString(root, "deviceId", kMaxAuthDeviceIdBytes,
                          result.message.deviceId) ||
      !readRequiredString(root, "sessionId", kMaxAuthBindingBytes,
                          result.message.sessionId) ||
      result.message.sessionId.size() < kMinAuthBindingBytes ||
      !readRequiredString(root, "serverTime", kMaxTimestampBytes,
                          result.message.serverTime) ||
      !root["telemetryIntervalMs"].is<int>()) {
    result.code = AuthAcceptedParseCode::InvalidField;
    result.stableCode = "AUTH_ACCEPTED_INVALID_FIELD";
    return result;
  }
  std::int64_t serverTimeMs = 0;
  result.message.telemetryIntervalMs =
      root["telemetryIntervalMs"].as<int>();
  if (!parseIso8601UtcMillis(result.message.serverTime, serverTimeMs) ||
      result.message.telemetryIntervalMs < 1000 ||
      result.message.telemetryIntervalMs > 300000) {
    result.code = AuthAcceptedParseCode::InvalidField;
    result.stableCode = "AUTH_ACCEPTED_INVALID_FIELD";
    return result;
  }

  if (root.size() == 10) {
    const JsonVariantConst rotationId = root["rotationId"];
    const JsonVariantConst rotationState = root["rotationState"];
    if (!readRequiredString(root, "credentialSlot", 32,
                            result.message.credentialSlot) ||
        !rotationId.is<const char *>() ||
        !rotationState.is<const char *>()) {
      result.code = AuthAcceptedParseCode::InvalidField;
      result.stableCode = "AUTH_ACCEPTED_INVALID_FIELD";
      return result;
    }
    result.message.rotationId = rotationId.as<const char *>();
    result.message.rotationState = rotationState.as<const char *>();
    if (result.message.rotationId.size() > kMaxAuthBindingBytes ||
        result.message.rotationState.size() > 32 ||
        (result.message.credentialSlot != "current" &&
         result.message.credentialSlot != "rotation_candidate") ||
        (result.message.rotationState != "" &&
         result.message.rotationState != "confirmed") ||
        (result.message.credentialSlot == "rotation_candidate" &&
         (result.message.rotationId.empty() ||
          result.message.rotationState != "confirmed"))) {
      result.code = AuthAcceptedParseCode::InvalidField;
      result.stableCode = "AUTH_ACCEPTED_INVALID_FIELD";
      return result;
    }
  } else {
    result.message.credentialSlot = "current";
  }

  result.code = AuthAcceptedParseCode::Ok;
  result.stableCode = "OK";
  return result;
}

bool authAcceptanceMatchesCredentialAttempt(
    const AuthAcceptedMessage &accepted, bool usedPendingCredential,
    const std::string &pendingRotationId) {
  const bool acceptedAsCurrent = accepted.credentialSlot == "current" &&
                                 accepted.rotationId.empty() &&
                                 accepted.rotationState.empty();
  if (!usedPendingCredential) return acceptedAsCurrent;
  if (pendingRotationId.empty()) return false;
  // A lost auth.accepted can leave the candidate commit-marked on the device
  // after the backend has already promoted it to the canonical current slot.
  return acceptedAsCurrent ||
         (accepted.credentialSlot == "rotation_candidate" &&
          accepted.rotationId == pendingRotationId &&
          accepted.rotationState == "confirmed");
}

bool AuthHandshakeState::beginChallenge(const std::string &challengeId) {
  if (awaitingAcceptance() || challengeId.size() < kMinAuthBindingBytes ||
      challengeId.size() > kMaxAuthBindingBytes ||
      hasControlCharacter(challengeId)) {
    return false;
  }
  challengeId_ = challengeId;
  sessionId_.clear();
  return true;
}

AuthAcceptanceCode AuthHandshakeState::accept(
    const std::string &challengeId, const std::string &expectedDeviceId,
    const std::string &acceptedDeviceId, const std::string &sessionId) {
  if (!awaitingAcceptance()) {
    return AuthAcceptanceCode::NoOutstandingChallenge;
  }
  if (challengeId != challengeId_) {
    return AuthAcceptanceCode::ChallengeMismatch;
  }
  if (expectedDeviceId.empty() || acceptedDeviceId != expectedDeviceId) {
    return AuthAcceptanceCode::DeviceMismatch;
  }
  if (sessionId.size() < kMinAuthBindingBytes ||
      sessionId.size() > kMaxAuthBindingBytes ||
      hasControlCharacter(sessionId)) {
    return AuthAcceptanceCode::InvalidSession;
  }
  challengeId_.clear();
  sessionId_ = sessionId;
  return AuthAcceptanceCode::Accepted;
}

void AuthHandshakeState::reset() {
  challengeId_.clear();
  sessionId_.clear();
}

AudioFrameBuildResult buildAudioFrameV2(
    const std::string &sessionId, const std::string &scanId,
    std::uint32_t sequence, std::uint64_t timestampMs,
    const std::int16_t *samples, std::size_t sampleCount,
    std::uint8_t flags, std::uint8_t *output, std::size_t outputCapacity) {
  if (sessionId.empty() || sessionId.size() > kAudioV2MaxSessionIdBytes ||
      scanId.empty() || scanId.size() > kAudioV2MaxScanIdBytes ||
      hasControlCharacter(sessionId) || hasControlCharacter(scanId)) {
    return {AudioFrameBuildCode::InvalidIdentity, 0};
  }
  if (samples == nullptr || sampleCount == 0 ||
      sampleCount > kAudioV2MaxSamples) {
    return {AudioFrameBuildCode::InvalidSamples, 0};
  }
  constexpr std::uint8_t kKnownFlags =
      kAudioV2FlagStart | kAudioV2FlagEnd | kAudioV2FlagDiscontinuity |
      kAudioV2FlagRetransmit;
  if ((flags & static_cast<std::uint8_t>(~kKnownFlags)) != 0) {
    return {AudioFrameBuildCode::InvalidFlags, 0};
  }

  const std::size_t payloadBytes = sampleCount * sizeof(std::int16_t);
  const std::size_t headerBytes =
      kAudioV2FixedHeaderBytes + sessionId.size() + scanId.size();
  const std::size_t requiredBytes = headerBytes + payloadBytes;
  if (output == nullptr || outputCapacity < requiredBytes ||
      headerBytes > UINT16_MAX || payloadBytes > UINT32_MAX) {
    return {AudioFrameBuildCode::BufferTooSmall, 0};
  }

  output[0] = 'S';
  output[1] = 'H';
  output[2] = 'C';
  output[3] = '2';
  output[4] = 2;
  output[5] = flags;
  writeUint16Be(output, 6, static_cast<std::uint16_t>(headerBytes));
  writeUint32Be(output, 8, static_cast<std::uint32_t>(payloadBytes));
  writeUint32Be(output, 12, sequence);
  writeUint64Be(output, 16, timestampMs);
  writeUint16Be(output, 24, static_cast<std::uint16_t>(sampleCount));
  writeUint16Be(output, 26, static_cast<std::uint16_t>(sessionId.size()));
  writeUint16Be(output, 28, static_cast<std::uint16_t>(scanId.size()));

  std::copy(sessionId.begin(), sessionId.end(),
            output + kAudioV2FixedHeaderBytes);
  std::copy(scanId.begin(), scanId.end(),
            output + kAudioV2FixedHeaderBytes + sessionId.size());
  const std::size_t payloadOffset = headerBytes;
  for (std::size_t index = 0; index < sampleCount; ++index) {
    const std::uint16_t sample = static_cast<std::uint16_t>(samples[index]);
    output[payloadOffset + index * 2] =
        static_cast<std::uint8_t>(sample & 0xff);
    output[payloadOffset + index * 2 + 1] =
        static_cast<std::uint8_t>((sample >> 8) & 0xff);
  }

  return {AudioFrameBuildCode::Ok, requiredBytes};
}

std::string CommandEnvelope::payloadString(const char *key) const {
  if (key == nullptr || payloadJson.empty()) {
    return {};
  }
  JsonDocument document;
  if (deserializeJson(document, payloadJson)) {
    return {};
  }
  const JsonVariantConst value = document[key];
  if (!value.is<const char *>()) {
    return {};
  }
  const char *raw = value.as<const char *>();
  return raw == nullptr ? std::string{} : std::string(raw);
}

int CommandEnvelope::payloadInt(const char *key, int fallback) const {
  if (key == nullptr || payloadJson.empty()) {
    return fallback;
  }
  JsonDocument document;
  if (deserializeJson(document, payloadJson)) {
    return fallback;
  }
  const JsonVariantConst value = document[key];
  return value.is<int>() ? value.as<int>() : fallback;
}

CommandParseResult parseCommandEnvelope(const std::string &json,
                                        std::int64_t nowEpochMs) {
  if (json.empty() || json.size() > kMaxCommandBytes) {
    return error(CommandParseCode::InvalidJson, "INVALID_JSON");
  }

  JsonDocument document;
  if (deserializeJson(document, json)) {
    return error(CommandParseCode::InvalidJson, "INVALID_JSON");
  }
  const JsonObjectConst root = document.as<JsonObjectConst>();
  if (root.isNull()) {
    return error(CommandParseCode::InvalidJson, "INVALID_JSON");
  }

  if (!root["protocolVersion"].is<int>()) {
    return error(CommandParseCode::MissingField, "MISSING_PROTOCOL_VERSION");
  }
  const int protocolVersion = root["protocolVersion"].as<int>();
  if (protocolVersion != kDeviceProtocolVersion) {
    return error(CommandParseCode::UnsupportedProtocol,
                 "UNSUPPORTED_PROTOCOL");
  }

  CommandEnvelope command;
  command.protocolVersion = protocolVersion;
  if (!readRequiredString(root, "id", kMaxIdBytes, command.id)) {
    return error(CommandParseCode::MissingField, "MISSING_ID");
  }
  if (!readRequiredString(root, "type", kMaxTypeBytes, command.type)) {
    return error(CommandParseCode::MissingField, "MISSING_TYPE");
  }
  if (!readRequiredString(root, "issuedAt", kMaxTimestampBytes,
                          command.issuedAt)) {
    return error(CommandParseCode::MissingField, "MISSING_ISSUED_AT");
  }
  if (!readRequiredString(root, "expiresAt", kMaxTimestampBytes,
                          command.expiresAt)) {
    return error(CommandParseCode::MissingField, "MISSING_EXPIRES_AT");
  }
  if (!readRequiredString(root, "correlationId", kMaxIdBytes,
                          command.correlationId)) {
    return error(CommandParseCode::MissingField, "MISSING_CORRELATION_ID");
  }

  const JsonVariantConst payload = root["payload"];
  if (!payload.is<JsonObjectConst>()) {
    return error(CommandParseCode::InvalidField, "INVALID_PAYLOAD");
  }
  serializeJson(payload, command.payloadJson);
  if (command.payloadJson.size() > kMaxPayloadBytes) {
    return error(CommandParseCode::InvalidField, "PAYLOAD_TOO_LARGE");
  }

  std::int64_t issuedAtMs = 0;
  std::int64_t expiresAtMs = 0;
  if (!parseIso8601UtcMillis(command.issuedAt, issuedAtMs) ||
      !parseIso8601UtcMillis(command.expiresAt, expiresAtMs) ||
      expiresAtMs <= issuedAtMs) {
    return error(CommandParseCode::InvalidField, "INVALID_COMMAND_TIME");
  }
  if (nowEpochMs <= 0) {
    return error(CommandParseCode::ClockUnavailable, "CLOCK_UNAVAILABLE");
  }
  if (expiresAtMs <= nowEpochMs) {
    CommandParseResult result =
        error(CommandParseCode::Expired, "COMMAND_EXPIRED");
    result.command = command;
    return result;
  }
  if (issuedAtMs > nowEpochMs + kMaxCommandFutureSkewMs) {
    CommandParseResult result =
        error(CommandParseCode::IssuedInFuture, "COMMAND_ISSUED_IN_FUTURE");
    result.command = command;
    return result;
  }
  if (!isSupportedCommand(command.type)) {
    CommandParseResult result =
        error(CommandParseCode::UnknownCommand, "UNKNOWN_COMMAND");
    result.command = command;
    return result;
  }

  CommandParseResult result;
  result.code = CommandParseCode::Ok;
  result.stableCode = "OK";
  result.command = command;
  return result;
}

OtaManifestValidation validateOtaManifest(
    const CommandEnvelope &command,
    const std::string &currentFirmwareVersion,
    int deviceProtocolVersion) {
  OtaManifest manifest;
  manifest.url = command.payloadString("url");
  manifest.firmwareVersion = command.payloadString("firmwareVersion");
  manifest.checksum = command.payloadString("checksum");
  manifest.signature = command.payloadString("signature");
  manifest.hardwareTarget = command.payloadString("hardwareTarget");
  manifest.partitionTarget = command.payloadString("partitionTarget");
  manifest.minimumProtocolVersion =
      command.payloadInt("minimumProtocolVersion", 0);

  if (command.type != "ota.update") {
    return otaError(OtaManifestCode::WrongCommandType,
                    "OTA_COMMAND_TYPE_INVALID", manifest);
  }
  if (!isHttpsUrl(manifest.url)) {
    return otaError(OtaManifestCode::HttpsRequired, "OTA_HTTPS_REQUIRED",
                    manifest);
  }
  if (!isSha256Hex(manifest.checksum)) {
    return otaError(OtaManifestCode::InvalidChecksum,
                    "OTA_SHA256_REQUIRED", manifest);
  }
  if (manifest.signature.empty()) {
    return otaError(OtaManifestCode::MissingSignature,
                    "OTA_SIGNATURE_REQUIRED", manifest);
  }
  if (!isValidBase64Signature(manifest.signature)) {
    return otaError(OtaManifestCode::InvalidSignature,
                    "OTA_SIGNATURE_ENCODING_INVALID", manifest);
  }
  if (manifest.hardwareTarget != kOtaHardwareTarget) {
    return otaError(OtaManifestCode::HardwareTargetMismatch,
                    "OTA_HARDWARE_TARGET_MISMATCH", manifest);
  }
  if (manifest.partitionTarget != kOtaPartitionTarget) {
    return otaError(OtaManifestCode::PartitionTargetMismatch,
                    "OTA_PARTITION_TARGET_MISMATCH", manifest);
  }
  if (manifest.minimumProtocolVersion <= 0 || deviceProtocolVersion <= 0) {
    return otaError(OtaManifestCode::InvalidMinimumProtocol,
                    "OTA_MIN_PROTOCOL_INVALID", manifest);
  }
  if (manifest.minimumProtocolVersion > deviceProtocolVersion) {
    return otaError(OtaManifestCode::ProtocolTooOld, "OTA_PROTOCOL_TOO_OLD",
                    manifest);
  }

  SemanticVersion candidate;
  SemanticVersion current;
  if (!parseSemanticVersion(manifest.firmwareVersion, candidate) ||
      !parseSemanticVersion(currentFirmwareVersion, current)) {
    return otaError(OtaManifestCode::InvalidVersion, "OTA_VERSION_INVALID",
                    manifest);
  }
  if (compareSemanticVersions(candidate, current) <= 0) {
    return otaError(OtaManifestCode::DowngradeRejected,
                    "OTA_DOWNGRADE_REJECTED", manifest);
  }

  OtaManifestValidation result;
  result.code = OtaManifestCode::Ok;
  result.stableCode = "OK";
  result.manifest = manifest;
  return result;
}

std::string buildOtaSignatureMessage(const OtaManifest &manifest) {
  std::string checksum = manifest.checksum;
  std::transform(checksum.begin(), checksum.end(), checksum.begin(),
                 [](const unsigned char character) {
                   return character >= 'A' && character <= 'F'
                              ? static_cast<char>(character - 'A' + 'a')
                              : static_cast<char>(character);
                 });
  std::string message;
  message.reserve(192 + checksum.size() + manifest.firmwareVersion.size());
  message += "SHCARE-OTA-MANIFEST-V1\n";
  message += "sha256=";
  message += checksum;
  message += "\nfirmwareVersion=";
  message += manifest.firmwareVersion;
  message += "\nhardwareTarget=";
  message += manifest.hardwareTarget;
  message += "\npartitionTarget=";
  message += manifest.partitionTarget;
  message += "\nminimumProtocolVersion=";
  message += std::to_string(manifest.minimumProtocolVersion);
  message += '\n';
  return message;
}

std::string buildCommandStateJson(const std::string &commandId,
                                  const std::string &correlationId,
                                  const std::string &state,
                                  const std::string &code,
                                  const std::string &detail) {
  JsonDocument document;
  document["protocolVersion"] = kDeviceProtocolVersion;
  document["type"] = "command.status";
  document["commandId"] = commandId;
  document["correlationId"] = correlationId;
  document["state"] = state;
  document["code"] = code;
  if (!detail.empty()) {
    document["detail"] = detail;
  }
  std::string json;
  serializeJson(document, json);
  return json;
}

RecentCommandIds::RecentCommandIds(std::size_t capacity)
    : capacity_(capacity == 0 ? 1 : capacity) {}

bool RecentCommandIds::seen(const std::string &commandId) const {
  return !commandId.empty() &&
         std::find(commandIds_.begin(), commandIds_.end(), commandId) !=
             commandIds_.end();
}

void RecentCommandIds::remember(const std::string &commandId) {
  if (commandId.empty() || seen(commandId)) {
    return;
  }
  commandIds_.push_back(commandId);
  while (commandIds_.size() > capacity_) {
    commandIds_.pop_front();
  }
}

bool RecentCommandIds::rememberValidated(const std::string &commandId,
                                         bool actionValid) {
  if (!actionValid || commandId.empty()) {
    return false;
  }
  remember(commandId);
  return seen(commandId);
}

bool CommandJournalEntry::terminal() const {
  return state == "applied" || state == "failed" || state == "expired";
}

CommandJournal::CommandJournal(std::size_t capacity)
    : capacity_(capacity == 0 ? 1 : std::min<std::size_t>(capacity, 16)) {}

bool CommandJournal::recordTerminal(const CommandJournalEntry &entry) {
  if (!entry.terminal() || entry.type != "wifi.status" ||
      entry.commandId.empty() || entry.commandId.size() > kMaxIdBytes ||
      entry.correlationId.empty() ||
      entry.correlationId.size() > kMaxIdBytes || entry.code.empty() ||
      entry.code.size() > kMaxTypeBytes ||
      entry.result.size() > kMaxCommandResultBytes ||
      hasControlCharacter(entry.commandId) ||
      hasControlCharacter(entry.correlationId) ||
      hasControlCharacter(entry.code) || hasControlCharacter(entry.result)) {
    return false;
  }

  entries_.erase(
      std::remove_if(entries_.begin(), entries_.end(),
                     [&entry](const CommandJournalEntry &candidate) {
                       return candidate.commandId == entry.commandId;
                     }),
      entries_.end());
  entries_.push_back(entry);
  while (entries_.size() > capacity_) {
    entries_.pop_front();
  }
  return true;
}

bool CommandJournal::find(const std::string &commandId,
                          CommandJournalEntry &entry) const {
  for (auto current = entries_.rbegin(); current != entries_.rend();
       ++current) {
    if (current->commandId == commandId) {
      entry = *current;
      return true;
    }
  }
  return false;
}

std::string CommandJournal::serialize() const {
  JsonDocument document;
  document["version"] = 1;
  JsonArray entries = document["entries"].to<JsonArray>();
  for (const CommandJournalEntry &entry : entries_) {
    JsonObject item = entries.add<JsonObject>();
    item["id"] = entry.commandId;
    item["correlationId"] = entry.correlationId;
    item["type"] = entry.type;
    item["state"] = entry.state;
    item["code"] = entry.code;
    item["result"] = entry.result;
  }
  std::string serialized;
  serializeJson(document, serialized);
  return serialized.size() <= kMaxCommandJournalBytes ? serialized
                                                       : std::string{};
}

bool CommandJournal::restore(const std::string &serialized) {
  if (serialized.empty() || serialized.size() > kMaxCommandJournalBytes) {
    return false;
  }
  JsonDocument document;
  if (deserializeJson(document, serialized) ||
      !document["version"].is<int>() ||
      document["version"].as<int>() != 1 ||
      !document["entries"].is<JsonArrayConst>()) {
    return false;
  }

  CommandJournal restored(capacity_);
  for (JsonObjectConst item : document["entries"].as<JsonArrayConst>()) {
    CommandJournalEntry entry;
    if (!readRequiredString(item, "id", kMaxIdBytes, entry.commandId) ||
        !readRequiredString(item, "correlationId", kMaxIdBytes,
                            entry.correlationId) ||
        !readRequiredString(item, "type", kMaxTypeBytes, entry.type) ||
        !readRequiredString(item, "state", kMaxTypeBytes, entry.state) ||
        !readRequiredString(item, "code", kMaxTypeBytes, entry.code)) {
      return false;
    }
    const JsonVariantConst result = item["result"];
    if (!result.is<const char *>()) {
      return false;
    }
    entry.result = result.as<const char *>();
    if (!restored.recordTerminal(entry)) {
      return false;
    }
  }
  entries_ = restored.entries_;
  return true;
}

}  // namespace shcare
