#include "ShcareDeviceProtocol.h"

#include <ArduinoJson.h>

#include <algorithm>
#include <cstdio>
#include <limits>
#include <utility>

namespace shcare {
namespace {

constexpr std::size_t kMaxCommandBytes = 4096;
constexpr std::size_t kMaxIdBytes = 128;
constexpr std::size_t kMaxTypeBytes = 64;
constexpr std::size_t kMaxTimestampBytes = 40;
constexpr std::size_t kMaxPayloadBytes = 2048;
constexpr std::size_t kMaxOtaUrlBytes = 1024;
constexpr std::size_t kMaxOtaDownloadAuthorizationBytes = 180;
constexpr std::size_t kMaxOtaVersionBytes = 80;
constexpr std::size_t kMaxOtaSignatureEncodedBytes = 684;
constexpr std::size_t kMaxCommandJournalBytes = 4096;
constexpr std::size_t kMaxCommandResultBytes = 192;
constexpr std::size_t kMaxPendingReconnectBytes = 768;
constexpr std::size_t kMaxPendingOtaReceiptBytes = 768;
constexpr std::size_t kMaxSetupWifiRequestBytes = 768;
constexpr std::size_t kMaxWifiSsidBytes = 63;
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
      "device.revoke", "device.rotate_secret", "wifi.setup.open", "wifi.update", "ota.update",
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

bool validOperationalStatus(const std::string &value) {
  if (value.size() > 40) {
    return false;
  }
  return std::all_of(value.begin(), value.end(), [](unsigned char character) {
    const bool alphaNumeric =
        (character >= 'a' && character <= 'z') ||
        (character >= 'A' && character <= 'Z') ||
        (character >= '0' && character <= '9');
    return alphaNumeric || character == '.' || character == '_' ||
           character == '-';
  });
}

bool queueableOperationalEventType(const std::string &type) {
  return type == "ota.confirmed" || type == "ota.rollback" ||
         type == "ota.failed" || type == "ota.downloading" ||
         type == "ota.verifying" || type == "ota.rebooting" ||
         type == "audio.failed" || type == "i2s.degraded" ||
         type == "i2s.recovered" || type == "watchdog.degraded";
}

bool isOtaOperationalEventType(const std::string &type) {
  return type.rfind("ota.", 0) == 0;
}

bool validBoundedId(const std::string &value) {
  return !value.empty() && value.size() <= kMaxIdBytes &&
         !hasControlCharacter(value);
}

bool validOtaDownloadAuthorization(const std::string &value) {
  if (value.empty()) {
    return true;
  }
  if (value.size() < 32 ||
      value.size() > kMaxOtaDownloadAuthorizationBytes ||
      hasControlCharacter(value)) {
    return false;
  }
  return std::all_of(value.begin(), value.end(), [](unsigned char character) {
    const bool alphaNumeric =
        (character >= 'a' && character <= 'z') ||
        (character >= 'A' && character <= 'Z') ||
        (character >= '0' && character <= '9');
    return alphaNumeric || character == '-' || character == '_';
  });
}

bool isSha256Hex(const std::string &value);

bool validPendingOtaReceipt(const PendingOtaReceipt &receipt) {
  static constexpr const char *kStatuses[] = {
      "pending",      "delivered",  "downloading", "verifying",
      "rebooting",    "rolling_back", "confirmed", "rolled_back",
      "failed",       "expired",
  };
  const bool validStatus = std::any_of(
      std::begin(kStatuses), std::end(kStatuses),
      [&receipt](const char *status) { return receipt.status == status; });
  return validBoundedId(receipt.commandId) &&
         validBoundedId(receipt.correlationId) &&
         validBoundedId(receipt.otaId) &&
         receipt.otaId == receipt.commandId &&
         !receipt.firmwareVersion.empty() &&
         receipt.firmwareVersion.size() <= kMaxOtaVersionBytes &&
         !hasControlCharacter(receipt.firmwareVersion) &&
         isSha256Hex(receipt.manifestFingerprint) && validStatus;
}

void incrementSaturated(std::uint32_t &value) {
  if (value != UINT32_MAX) {
    ++value;
  }
}

bool validPendingReconnectCommand(
    const PendingReconnectCommand &command) {
  if (command.commandId.empty() || command.commandId.size() > kMaxIdBytes ||
      command.correlationId.empty() ||
      command.correlationId.size() > kMaxIdBytes ||
      hasControlCharacter(command.commandId) ||
      hasControlCharacter(command.correlationId) ||
      hasControlCharacter(command.expectedWifiSsid) ||
      hasControlCharacter(command.expectedWifiConfigProof)) {
    return false;
  }
  if (command.type == "restart") {
    return command.expectedWifiSsid.empty() &&
           command.expectedWifiConfigProof.empty();
  }
  return command.type == "wifi.update" &&
         !command.expectedWifiSsid.empty() &&
         command.expectedWifiSsid.size() <= kMaxWifiSsidBytes &&
         isSha256Hex(command.expectedWifiConfigProof);
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

bool validAudioV2SequenceFlags(std::uint32_t sequence, std::uint8_t flags) {
  constexpr std::uint8_t kKnownFlags =
      kAudioV2FlagStart | kAudioV2FlagEnd | kAudioV2FlagDiscontinuity |
      kAudioV2FlagRetransmit;
  if ((flags & static_cast<std::uint8_t>(~kKnownFlags)) != 0) {
    return false;
  }
  const bool start = (flags & kAudioV2FlagStart) != 0;
  if ((sequence == 0) != start) {
    return false;
  }
  return sequence != 0 || (flags & kAudioV2FlagDiscontinuity) == 0;
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

bool cloudAuthenticationTimedOut(bool transportConnected, bool authenticated,
                                 std::uint32_t nowMs,
                                 std::uint32_t connectedAtMs,
                                 std::uint32_t timeoutMs) {
  if (!transportConnected || authenticated || timeoutMs == 0U) {
    return false;
  }
  return static_cast<std::uint32_t>(nowMs - connectedAtMs) >= timeoutMs;
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

bool setupPortalAllowed(bool hasWifiConfig, bool physicalGesture,
                        bool trustedRecovery) {
  return !hasWifiConfig || physicalGesture || trustedRecovery;
}

bool shouldOpenSetupPortalAfterReconnectFailures(std::uint32_t failureCount,
                                                 std::uint32_t threshold) {
  return threshold > 0 && failureCount >= threshold;
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

bool validWifiCredentials(const std::string &ssid,
                          const std::string &password) {
  if (ssid.empty() || ssid.size() > 32 || hasControlCharacter(ssid)) {
    return false;
  }
  if (password.empty()) {
    return true;
  }
  if (password.size() < 8 || password.size() > 63) {
    return false;
  }
  return std::all_of(password.begin(), password.end(),
                     [](const unsigned char character) {
                       return character >= 0x20 && character <= 0x7e;
                     });
}

SetupWifiProvisioningParseResult parseSetupWifiProvisioningRequest(
    const std::string &json, const std::string &expectedDeviceId,
    const std::string &expectedCsrfToken) {
  SetupWifiProvisioningParseResult result;
  if (json.empty() || json.size() > kMaxSetupWifiRequestBytes) {
    result.code = SetupWifiProvisioningParseCode::PayloadTooLarge;
    return result;
  }

  JsonDocument document;
  if (deserializeJson(document, json) || !document.is<JsonObject>()) {
    result.code = SetupWifiProvisioningParseCode::MalformedJson;
    return result;
  }

  const JsonObject object = document.as<JsonObject>();
  if (!object["protocolVersion"].is<int>() ||
      object["protocolVersion"].as<int>() != 1) {
    result.code = SetupWifiProvisioningParseCode::UnsupportedProtocol;
    return result;
  }
  if (!object["deviceId"].is<const char *>() ||
      !object["csrfToken"].is<const char *>() ||
      !object["ssid"].is<const char *>() ||
      !object["password"].is<const char *>()) {
    result.code = SetupWifiProvisioningParseCode::MalformedJson;
    return result;
  }

  const std::string deviceId = object["deviceId"].as<const char *>();
  const std::string providedCsrf = object["csrfToken"].as<const char *>();
  const std::string ssid = object["ssid"].as<const char *>();
  const std::string password = object["password"].as<const char *>();
  if (!validCanonicalDeviceId(expectedDeviceId) || deviceId != expectedDeviceId) {
    result.code = SetupWifiProvisioningParseCode::DeviceMismatch;
    return result;
  }
  if (!validSetupPortalCsrf(expectedCsrfToken, providedCsrf)) {
    result.code = SetupWifiProvisioningParseCode::InvalidSession;
    return result;
  }
  if (!validWifiCredentials(ssid, password)) {
    result.code = SetupWifiProvisioningParseCode::InvalidCredentials;
    return result;
  }

  result.code = SetupWifiProvisioningParseCode::Ok;
  result.request.deviceId = deviceId;
  result.request.ssid = ssid;
  result.request.password = password;
  return result;
}

bool otaBootHealthReady(const OtaBootHealthInput &input) {
  return input.pendingVerification && input.i2sReady &&
         input.stabilityWindowElapsed && input.productionProfile &&
         input.runtimeSecurityReady &&
         input.transport == CloudTransport::Wss && input.authenticated &&
         input.authenticatedHeartbeatObserved &&
         !input.recoveryPortalActive;
}

DeviceCommandAdmission evaluateDeviceCommandAdmission(
    const std::string &commandType, bool otaInProgress,
    bool audioSessionActive) {
  if (otaInProgress) {
    return DeviceCommandAdmission::OtaBusy;
  }
  if (commandType == "ota.update" && audioSessionActive) {
    return DeviceCommandAdmission::RecordingActive;
  }
  return DeviceCommandAdmission::Allowed;
}

OtaRollbackAction evaluateOtaRollbackAction(
    bool pendingVerification, bool timeoutElapsed, bool rollbackPossible,
    bool terminal) {
  if (!pendingVerification) {
    return OtaRollbackAction::None;
  }
  if (terminal) {
    return OtaRollbackAction::Terminal;
  }
  if (!timeoutElapsed) {
    return OtaRollbackAction::Wait;
  }
  return rollbackPossible ? OtaRollbackAction::RequestRollback
                          : OtaRollbackAction::FailUnavailable;
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

bool parseAuthAcceptedServerTimeEpochMillis(const AuthAcceptedMessage &accepted,
                                            std::int64_t &epochMs) {
  return parseIso8601UtcMillis(accepted.serverTime, epochMs);
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

AudioSessionContractDecision evaluateAudioSessionContract(
    int protocolVersion, const std::string &frameEncoding,
    const std::string &payloadEncoding, int sampleRate,
    std::size_t sampleCount) {
  if (protocolVersion != 1 && protocolVersion != 2) {
    return AudioSessionContractDecision(
        AudioSessionContractCode::UnsupportedProtocol);
  }
  if (protocolVersion == 1) {
    if (frameEncoding != kAudioV1RawFrameEncoding) {
      return AudioSessionContractDecision(
          AudioSessionContractCode::FrameEncodingMismatch);
    }
  } else if (frameEncoding != kAudioV2FrameEncoding) {
    return AudioSessionContractDecision(
        AudioSessionContractCode::FrameEncodingMismatch);
  }
  if (payloadEncoding != kAudioPcmEncoding) {
    return AudioSessionContractDecision(
        AudioSessionContractCode::PayloadEncodingMismatch);
  }
  if (sampleRate != kAudioSampleRate) {
    return AudioSessionContractDecision(
        AudioSessionContractCode::SampleRateMismatch);
  }
  if (sampleCount != kAudioPacketSamples) {
    return AudioSessionContractDecision(
        AudioSessionContractCode::SampleCountMismatch);
  }
  if (protocolVersion == 1) {
    return AudioSessionContractDecision(
        AudioSessionContractCode::LegacyReceiverOnly);
  }
  return AudioSessionContractDecision(AudioSessionContractCode::AcceptedV2);
}

AudioCaptureProfileDecision resolveAudioCaptureProfile(
    const std::string &profileName) {
  if (profileName == "heart") {
    return {AudioCaptureProfile::Heart, 30.0f, 220.0f, 4.2f, true};
  }
  if (profileName == "lung") {
    return {AudioCaptureProfile::Lung, 80.0f, 2000.0f, 2.6f, false};
  }
  return {};
}

namespace {

bool isUsableAudioSlot(const AudioSlotFrameStats &stats,
                       std::size_t sampleCount) {
  if (sampleCount == 0 || stats.nonZeroSamples < sampleCount / 4U) {
    return false;
  }
  const std::uint32_t allowedClipped =
      static_cast<std::uint32_t>(sampleCount / 50U) + 1U;
  if (stats.clippedSamples > allowedClipped) {
    return false;
  }
  return stats.energy >= static_cast<std::uint64_t>(sampleCount) * 64ULL;
}

}  // namespace

std::uint8_t selectAudioCaptureSlot(
    const AudioSlotFrameStats &slot0, const AudioSlotFrameStats &slot1,
    std::uint8_t currentSlot, std::size_t sampleCount) {
  const bool slot0Usable = isUsableAudioSlot(slot0, sampleCount);
  const bool slot1Usable = isUsableAudioSlot(slot1, sampleCount);
  if (slot0Usable != slot1Usable) {
    return slot0Usable ? 0U : 1U;
  }

  if (!slot0Usable && !slot1Usable) {
    if (slot0.clippedSamples != slot1.clippedSamples) {
      return slot0.clippedSamples < slot1.clippedSamples ? 0U : 1U;
    }
    return slot1.energy > slot0.energy ? 1U : 0U;
  }

  const std::uint8_t stableCurrent = currentSlot == 1U ? 1U : 0U;
  const AudioSlotFrameStats &current = stableCurrent == 0U ? slot0 : slot1;
  const AudioSlotFrameStats &candidate = stableCurrent == 0U ? slot1 : slot0;
  if (candidate.energy > current.energy &&
      candidate.energy - current.energy > current.energy) {
    return stableCurrent == 0U ? 1U : 0U;
  }
  return stableCurrent;
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
  if (!validAudioV2SequenceFlags(sequence, flags)) {
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
  manifest.downloadAuthorization =
      command.payloadString("downloadAuthorization");
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
  if (!validOtaDownloadAuthorization(manifest.downloadAuthorization)) {
    return otaError(OtaManifestCode::InvalidDownloadAuthorization,
                    "OTA_DOWNLOAD_AUTHORIZATION_INVALID", manifest);
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

std::string serializePendingOtaReceipt(const PendingOtaReceipt &receipt) {
  if (!validPendingOtaReceipt(receipt)) {
    return {};
  }
  JsonDocument document;
  document["version"] = 1;
  document["commandId"] = receipt.commandId;
  document["correlationId"] = receipt.correlationId;
  document["otaId"] = receipt.otaId;
  document["firmwareVersion"] = receipt.firmwareVersion;
  document["manifestFingerprint"] = receipt.manifestFingerprint;
  document["status"] = receipt.status;
  std::string serialized;
  serializeJson(document, serialized);
  return serialized.size() <= kMaxPendingOtaReceiptBytes ? serialized
                                                          : std::string{};
}

bool restorePendingOtaReceipt(const std::string &serialized,
                              PendingOtaReceipt &receipt) {
  receipt = PendingOtaReceipt{};
  if (serialized.empty() || serialized.size() > kMaxPendingOtaReceiptBytes) {
    return false;
  }
  JsonDocument document;
  if (deserializeJson(document, serialized) ||
      !document["version"].is<int>() ||
      document["version"].as<int>() != 1) {
    return false;
  }
  const JsonObjectConst root = document.as<JsonObjectConst>();
  PendingOtaReceipt restored;
  if (!readRequiredString(root, "commandId", kMaxIdBytes,
                          restored.commandId) ||
      !readRequiredString(root, "correlationId", kMaxIdBytes,
                          restored.correlationId) ||
      !readRequiredString(root, "otaId", kMaxIdBytes, restored.otaId) ||
      !readRequiredString(root, "firmwareVersion", kMaxOtaVersionBytes,
                          restored.firmwareVersion) ||
      !readRequiredString(root, "manifestFingerprint", 64,
                          restored.manifestFingerprint) ||
      !readRequiredString(root, "status", kMaxTypeBytes, restored.status) ||
      !validPendingOtaReceipt(restored)) {
    return false;
  }
  receipt = restored;
  return true;
}

PendingOtaCommandDecision evaluatePendingOtaCommand(
    const PendingOtaReceipt &receipt, bool receiptReady,
    const std::string &commandId, const std::string &correlationId,
    const std::string &commandType,
    const std::string &manifestFingerprint) {
  if (!receiptReady) {
    return PendingOtaCommandDecision::NoFence;
  }
  if (!validPendingOtaReceipt(receipt)) {
    return PendingOtaCommandDecision::InvalidFence;
  }
  if (receipt.commandId == commandId) {
    const bool exactBinding = commandType == "ota.update" &&
                              receipt.correlationId == correlationId &&
                              receipt.otaId == commandId &&
                              receipt.manifestFingerprint ==
                                  manifestFingerprint;
    return exactBinding ? PendingOtaCommandDecision::Replay
                        : PendingOtaCommandDecision::CommandIdConflict;
  }
  return commandType == "ota.update"
             ? PendingOtaCommandDecision::OtaReceiptBusy
             : PendingOtaCommandDecision::NoFence;
}

bool buildPendingOtaReplayOutcome(const PendingOtaReceipt &receipt,
                                  PendingOtaReplayOutcome &outcome) {
  outcome = PendingOtaReplayOutcome{};
  if (!validPendingOtaReceipt(receipt)) {
    return false;
  }
  if (receipt.status == "pending") {
    outcome.commandState = "acknowledged";
    outcome.commandCode = "OTA_PENDING";
  } else if (receipt.status == "delivered") {
    outcome.commandState = "acknowledged";
    outcome.commandCode = "OTA_DELIVERED";
  } else if (receipt.status == "downloading") {
    outcome.commandState = "applying";
    outcome.commandCode = "OTA_DOWNLOADING";
    outcome.eventType = "ota.downloading";
  } else if (receipt.status == "verifying") {
    outcome.commandState = "applying";
    outcome.commandCode = "OTA_VERIFYING";
    outcome.eventType = "ota.verifying";
  } else if (receipt.status == "rebooting") {
    outcome.commandState = "applying";
    outcome.commandCode = "OTA_REBOOTING";
    outcome.eventType = "ota.rebooting";
  } else if (receipt.status == "rolling_back") {
    outcome.commandState = "applying";
    outcome.commandCode = "OTA_ROLLING_BACK";
    outcome.eventType = "ota.rollback";
  } else if (receipt.status == "confirmed") {
    outcome.commandState = "applied";
    outcome.commandCode = "OTA_CONFIRMED";
    outcome.eventType = "ota.confirmed";
  } else if (receipt.status == "rolled_back") {
    outcome.commandState = "failed";
    outcome.commandCode = "OTA_ROLLED_BACK";
    outcome.eventType = "ota.rollback";
  } else if (receipt.status == "failed") {
    outcome.commandState = "failed";
    outcome.commandCode = "OTA_FAILED";
    outcome.eventType = "ota.failed";
  } else if (receipt.status == "expired") {
    outcome.commandState = "expired";
    outcome.commandCode = "OTA_EXPIRED";
    outcome.eventType = "ota.failed";
  }
  return !outcome.commandState.empty() && !outcome.commandCode.empty();
}

PendingOtaRecoveryAction evaluatePendingOtaRecovery(
    const PendingOtaReceipt &receipt, bool receiptReady,
    bool partitionStateKnown, bool pendingImage,
    bool targetFirmwareRunning, bool runningImageValid,
    const std::string &bootOutcome) {
  const bool receiptValid = receiptReady && validPendingOtaReceipt(receipt);
  const bool terminal =
      receiptValid && (receipt.status == "confirmed" ||
                       receipt.status == "rolled_back" ||
                       receipt.status == "failed" ||
                       receipt.status == "expired");
  if (pendingImage) {
    return receiptValid && !terminal && targetFirmwareRunning
               ? PendingOtaRecoveryAction::AwaitBootHealth
               : PendingOtaRecoveryAction::RollbackRequired;
  }
  if (!receiptReady) {
    return PendingOtaRecoveryAction::None;
  }
  if (!receiptValid) {
    return PendingOtaRecoveryAction::Failed;
  }
  if (terminal) {
    return PendingOtaRecoveryAction::Terminal;
  }
  if (!partitionStateKnown) {
    return PendingOtaRecoveryAction::None;
  }
  if (targetFirmwareRunning &&
      (runningImageValid || bootOutcome == "confirmed")) {
    return PendingOtaRecoveryAction::Confirmed;
  }
  const bool rollbackObserved =
      !targetFirmwareRunning &&
      (receipt.status == "rolling_back" || receipt.status == "rebooting" ||
       bootOutcome == "pending" || bootOutcome == "rollback_requested" ||
       bootOutcome == "rolled_back");
  return rollbackObserved ? PendingOtaRecoveryAction::RolledBack
                          : PendingOtaRecoveryAction::Failed;
}

bool otaRecoveryServicesAllowed(const OtaRecoverySafeModeReason reason) {
  return reason == OtaRecoverySafeModeReason::None;
}

const char *otaRecoverySafeModeStableCode(
    const OtaRecoverySafeModeReason reason) {
  switch (reason) {
    case OtaRecoverySafeModeReason::None:
      return "OTA_RECOVERY_NONE";
    case OtaRecoverySafeModeReason::RollbackUnavailable:
      return "OTA_RECOVERY_ROLLBACK_UNAVAILABLE";
    case OtaRecoverySafeModeReason::RollbackIntentPersistenceFailed:
      return "OTA_RECOVERY_ROLLBACK_INTENT_NOT_DURABLE";
    case OtaRecoverySafeModeReason::RollbackApiReturned:
      return "OTA_RECOVERY_ROLLBACK_API_RETURNED";
  }
  return "OTA_RECOVERY_UNKNOWN";
}

OtaConfirmationAction evaluateOtaConfirmationAction(
    bool confirmingMarkerDurable, bool rollbackCancelled,
    bool confirmedMarkerDurable, bool receiptConfirmedDurable) {
  if (!confirmingMarkerDurable) {
    return OtaConfirmationAction::PersistConfirmingMarker;
  }
  if (!rollbackCancelled) {
    return OtaConfirmationAction::CancelRollback;
  }
  if (!confirmedMarkerDurable || !receiptConfirmedDurable) {
    return OtaConfirmationAction::PersistConfirmedState;
  }
  return OtaConfirmationAction::PublishConfirmed;
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

std::string buildOtaEffectBindingMessage(const OtaManifest &manifest) {
  std::string checksum = manifest.checksum;
  std::transform(checksum.begin(), checksum.end(), checksum.begin(),
                 [](const unsigned char character) {
                   return character >= 'A' && character <= 'F'
                              ? static_cast<char>(character - 'A' + 'a')
                              : static_cast<char>(character);
                 });
  std::string message;
  message.reserve(256 + manifest.url.size() + manifest.signature.size());
  message += "SHCARE-OTA-EFFECT-V1\nurl=";
  message += manifest.url;
  message += "\nfirmwareVersion=";
  message += manifest.firmwareVersion;
  message += "\nsha256=";
  message += checksum;
  message += "\nsignature=";
  message += manifest.signature;
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

std::string serializePendingReconnectCommand(
    const PendingReconnectCommand &command) {
  if (!validPendingReconnectCommand(command)) {
    return {};
  }
  JsonDocument document;
  document["version"] = 1;
  document["id"] = command.commandId;
  document["correlationId"] = command.correlationId;
  document["type"] = command.type;
  document["expectedWifiSsid"] = command.expectedWifiSsid;
  document["expectedWifiConfigProof"] = command.expectedWifiConfigProof;
  std::string serialized;
  serializeJson(document, serialized);
  return serialized.size() <= kMaxPendingReconnectBytes ? serialized
                                                         : std::string{};
}

bool restorePendingReconnectCommand(
    const std::string &serialized, PendingReconnectCommand &command) {
  command = PendingReconnectCommand{};
  if (serialized.empty() || serialized.size() > kMaxPendingReconnectBytes) {
    return false;
  }
  JsonDocument document;
  if (deserializeJson(document, serialized) ||
      !document["version"].is<int>() ||
      document["version"].as<int>() != 1) {
    return false;
  }

  PendingReconnectCommand restored;
  const JsonObjectConst root = document.as<JsonObjectConst>();
  if (!readRequiredString(root, "id", kMaxIdBytes, restored.commandId) ||
      !readRequiredString(root, "correlationId", kMaxIdBytes,
                          restored.correlationId) ||
      !readRequiredString(root, "type", kMaxTypeBytes, restored.type) ||
      !root["expectedWifiSsid"].is<const char *>() ||
      !root["expectedWifiConfigProof"].is<const char *>()) {
    return false;
  }
  restored.expectedWifiSsid =
      root["expectedWifiSsid"].as<const char *>();
  restored.expectedWifiConfigProof =
      root["expectedWifiConfigProof"].as<const char *>();
  if (!validPendingReconnectCommand(restored)) {
    return false;
  }
  command = restored;
  return true;
}

PendingReconnectDecision evaluatePendingReconnectCommand(
    const PendingReconnectCommand &command, bool cloudAuthenticated,
    bool wifiConnected, const std::string &connectedWifiSsid,
    const std::string &currentWifiConfigProof) {
  if (!validPendingReconnectCommand(command)) {
    return PendingReconnectDecision::InvalidReceipt;
  }
  if (!cloudAuthenticated || !wifiConnected) {
    return PendingReconnectDecision::WaitingForReconnect;
  }
  if (command.type == "wifi.update" &&
      (connectedWifiSsid != command.expectedWifiSsid ||
       currentWifiConfigProof != command.expectedWifiConfigProof)) {
    return PendingReconnectDecision::NetworkMismatch;
  }
  return PendingReconnectDecision::Confirmed;
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
  const bool supportedType = entry.type == "wifi.status" ||
                             entry.type == "restart" ||
                             entry.type == "wifi.setup.open" ||
                             entry.type == "wifi.update" ||
                             entry.type == "ota.update";
  const bool validEffectFingerprint =
      entry.type == "ota.update" ? isSha256Hex(entry.effectFingerprint)
                                 : entry.effectFingerprint.empty();
  if (!entry.terminal() || !supportedType ||
      !validEffectFingerprint ||
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
    if (!entry.effectFingerprint.empty()) {
      item["effectFingerprint"] = entry.effectFingerprint;
    }
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
    const JsonVariantConst effectFingerprint = item["effectFingerprint"];
    if (!effectFingerprint.isNull()) {
      if (!effectFingerprint.is<const char *>()) {
        return false;
      }
      entry.effectFingerprint = effectFingerprint.as<const char *>();
    }
    if (!restored.recordTerminal(entry)) {
      return false;
    }
  }
  entries_ = restored.entries_;
  return true;
}

OfflineOperationalQueue::OfflineOperationalQueue(std::size_t capacity)
    : capacity_(capacity == 0 ? 1 : std::min<std::size_t>(capacity, 32)) {}

bool OfflineOperationalQueue::enqueueTelemetry(
    std::uint32_t occurredAtUptimeMs) {
  OfflineOperationalRecord record;
  record.kind = OfflineOperationalKind::Telemetry;
  record.type = "telemetry";
  record.occurredAtUptimeMs = occurredAtUptimeMs;
  return push(std::move(record));
}

bool OfflineOperationalQueue::enqueueEvent(
    const std::string &type, const std::string &status,
    std::uint32_t occurredAtUptimeMs, const std::string &commandId,
    const std::string &correlationId, const std::string &otaId) {
  if (!queueableOperationalEventType(type) ||
      !validOperationalStatus(status) ||
      (isOtaOperationalEventType(type) &&
       (!validBoundedId(commandId) || !validBoundedId(correlationId) ||
        !validBoundedId(otaId))) ||
      (!commandId.empty() && !validBoundedId(commandId)) ||
      (!correlationId.empty() && !validBoundedId(correlationId)) ||
      (!otaId.empty() && !validBoundedId(otaId))) {
    incrementSaturated(rejectedCount_);
    return false;
  }
  OfflineOperationalRecord record;
  record.kind = OfflineOperationalKind::Event;
  record.type = type;
  record.status = status;
  record.commandId = commandId;
  record.correlationId = correlationId;
  record.otaId = otaId;
  record.occurredAtUptimeMs = occurredAtUptimeMs;
  return push(std::move(record));
}

bool OfflineOperationalQueue::push(OfflineOperationalRecord record) {
  if (record.kind == OfflineOperationalKind::Telemetry) {
    const auto existing = std::find_if(
        entries_.begin(), entries_.end(),
        [](const OfflineOperationalRecord &entry) {
          return entry.kind == OfflineOperationalKind::Telemetry;
        });
    if (existing != entries_.end()) {
      existing->occurredAtUptimeMs = record.occurredAtUptimeMs;
      incrementSaturated(existing->occurrences);
      incrementSaturated(coalescedCount_);
      return true;
    }
  } else if (!entries_.empty()) {
    OfflineOperationalRecord &last = entries_.back();
    if (last.kind == OfflineOperationalKind::Event &&
        last.type == record.type && last.status == record.status &&
        last.commandId == record.commandId &&
        last.correlationId == record.correlationId &&
        last.otaId == record.otaId) {
      last.occurredAtUptimeMs = record.occurredAtUptimeMs;
      incrementSaturated(last.occurrences);
      incrementSaturated(coalescedCount_);
      return true;
    }
  }

  if (entries_.size() >= capacity_) {
    const auto telemetry = std::find_if(
        entries_.begin(), entries_.end(),
        [](const OfflineOperationalRecord &entry) {
          return entry.kind == OfflineOperationalKind::Telemetry;
        });
    if (telemetry != entries_.end()) {
      entries_.erase(telemetry);
    } else {
      entries_.pop_front();
    }
    incrementSaturated(droppedCount_);
  }
  entries_.push_back(std::move(record));
  return true;
}

bool OfflineOperationalQueue::front(OfflineOperationalRecord &record) const {
  if (entries_.empty()) {
    return false;
  }
  record = entries_.front();
  return true;
}

bool OfflineOperationalQueue::popFront() {
  if (entries_.empty()) {
    return false;
  }
  entries_.pop_front();
  return true;
}

}  // namespace shcare
