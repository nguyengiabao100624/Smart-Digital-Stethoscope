#include "ShcareDeviceProtocol.h"

#include <algorithm>
#include <array>
#include <cstring>

namespace shcare {
namespace {

constexpr std::size_t kSha256BlockBytes = 64;
constexpr char kSetupPasswordDomain[] = "shcare-device-setup-pop-v1\n";
constexpr char kSetupSsidDomain[] = "shcare-device-setup-ssid-v1\n";
constexpr char kBase64UrlAlphabet[] =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
constexpr char kUpperHexAlphabet[] = "0123456789ABCDEF";

constexpr std::uint32_t kSha256RoundConstants[64] = {
    0x428a2f98U, 0x71374491U, 0xb5c0fbcfU, 0xe9b5dba5U,
    0x3956c25bU, 0x59f111f1U, 0x923f82a4U, 0xab1c5ed5U,
    0xd807aa98U, 0x12835b01U, 0x243185beU, 0x550c7dc3U,
    0x72be5d74U, 0x80deb1feU, 0x9bdc06a7U, 0xc19bf174U,
    0xe49b69c1U, 0xefbe4786U, 0x0fc19dc6U, 0x240ca1ccU,
    0x2de92c6fU, 0x4a7484aaU, 0x5cb0a9dcU, 0x76f988daU,
    0x983e5152U, 0xa831c66dU, 0xb00327c8U, 0xbf597fc7U,
    0xc6e00bf3U, 0xd5a79147U, 0x06ca6351U, 0x14292967U,
    0x27b70a85U, 0x2e1b2138U, 0x4d2c6dfcU, 0x53380d13U,
    0x650a7354U, 0x766a0abbU, 0x81c2c92eU, 0x92722c85U,
    0xa2bfe8a1U, 0xa81a664bU, 0xc24b8b70U, 0xc76c51a3U,
    0xd192e819U, 0xd6990624U, 0xf40e3585U, 0x106aa070U,
    0x19a4c116U, 0x1e376c08U, 0x2748774cU, 0x34b0bcb5U,
    0x391c0cb3U, 0x4ed8aa4aU, 0x5b9cca4fU, 0x682e6ff3U,
    0x748f82eeU, 0x78a5636fU, 0x84c87814U, 0x8cc70208U,
    0x90befffaU, 0xa4506cebU, 0xbef9a3f7U, 0xc67178f2U,
};

struct Sha256Context {
  std::array<std::uint32_t, 8> state = {
      0x6a09e667U, 0xbb67ae85U, 0x3c6ef372U, 0xa54ff53aU,
      0x510e527fU, 0x9b05688cU, 0x1f83d9abU, 0x5be0cd19U,
  };
  std::array<std::uint8_t, kSha256BlockBytes> block{};
  std::size_t blockBytes = 0;
  std::uint64_t messageBytes = 0;
};

std::uint32_t rotateRight(std::uint32_t value, std::uint32_t bits) {
  return (value >> bits) | (value << (32U - bits));
}

void secureZero(void *buffer, std::size_t bytes) {
  volatile std::uint8_t *cursor =
      static_cast<volatile std::uint8_t *>(buffer);
  while (bytes-- > 0) {
    *cursor++ = 0;
  }
}

void transformSha256(Sha256Context &context, const std::uint8_t *block) {
  std::uint32_t schedule[64] = {};
  for (std::size_t index = 0; index < 16; ++index) {
    const std::size_t offset = index * 4;
    schedule[index] =
        (static_cast<std::uint32_t>(block[offset]) << 24U) |
        (static_cast<std::uint32_t>(block[offset + 1]) << 16U) |
        (static_cast<std::uint32_t>(block[offset + 2]) << 8U) |
        static_cast<std::uint32_t>(block[offset + 3]);
  }
  for (std::size_t index = 16; index < 64; ++index) {
    const std::uint32_t previous15 = schedule[index - 15];
    const std::uint32_t previous2 = schedule[index - 2];
    const std::uint32_t sigma0 = rotateRight(previous15, 7U) ^
                                 rotateRight(previous15, 18U) ^
                                 (previous15 >> 3U);
    const std::uint32_t sigma1 = rotateRight(previous2, 17U) ^
                                 rotateRight(previous2, 19U) ^
                                 (previous2 >> 10U);
    schedule[index] = schedule[index - 16] + sigma0 +
                      schedule[index - 7] + sigma1;
  }

  std::uint32_t a = context.state[0];
  std::uint32_t b = context.state[1];
  std::uint32_t c = context.state[2];
  std::uint32_t d = context.state[3];
  std::uint32_t e = context.state[4];
  std::uint32_t f = context.state[5];
  std::uint32_t g = context.state[6];
  std::uint32_t h = context.state[7];

  for (std::size_t index = 0; index < 64; ++index) {
    const std::uint32_t sum1 = rotateRight(e, 6U) ^ rotateRight(e, 11U) ^
                               rotateRight(e, 25U);
    const std::uint32_t choose = (e & f) ^ ((~e) & g);
    const std::uint32_t temp1 = h + sum1 + choose +
                                kSha256RoundConstants[index] +
                                schedule[index];
    const std::uint32_t sum0 = rotateRight(a, 2U) ^ rotateRight(a, 13U) ^
                               rotateRight(a, 22U);
    const std::uint32_t majority = (a & b) ^ (a & c) ^ (b & c);
    const std::uint32_t temp2 = sum0 + majority;

    h = g;
    g = f;
    f = e;
    e = d + temp1;
    d = c;
    c = b;
    b = a;
    a = temp1 + temp2;
  }

  context.state[0] += a;
  context.state[1] += b;
  context.state[2] += c;
  context.state[3] += d;
  context.state[4] += e;
  context.state[5] += f;
  context.state[6] += g;
  context.state[7] += h;
  secureZero(schedule, sizeof(schedule));
}

void updateSha256(Sha256Context &context, const std::uint8_t *data,
                  std::size_t bytes) {
  if (bytes == 0) {
    return;
  }
  context.messageBytes += bytes;
  while (bytes > 0) {
    const std::size_t available = kSha256BlockBytes - context.blockBytes;
    const std::size_t copied = std::min(available, bytes);
    std::memcpy(context.block.data() + context.blockBytes, data, copied);
    context.blockBytes += copied;
    data += copied;
    bytes -= copied;
    if (context.blockBytes == kSha256BlockBytes) {
      transformSha256(context, context.block.data());
      context.blockBytes = 0;
    }
  }
}

void finishSha256(Sha256Context &context,
                  std::uint8_t output[kSetupSecretHashBytes]) {
  const std::uint64_t messageBits = context.messageBytes * 8U;
  context.block[context.blockBytes++] = 0x80U;
  if (context.blockBytes > 56) {
    std::fill(context.block.begin() + context.blockBytes,
              context.block.end(), 0U);
    transformSha256(context, context.block.data());
    context.blockBytes = 0;
  }
  std::fill(context.block.begin() + context.blockBytes,
            context.block.begin() + 56, 0U);
  for (std::size_t index = 0; index < 8; ++index) {
    context.block[63 - index] =
        static_cast<std::uint8_t>(messageBits >> (index * 8U));
  }
  transformSha256(context, context.block.data());

  for (std::size_t index = 0; index < context.state.size(); ++index) {
    output[index * 4] =
        static_cast<std::uint8_t>(context.state[index] >> 24U);
    output[index * 4 + 1] =
        static_cast<std::uint8_t>(context.state[index] >> 16U);
    output[index * 4 + 2] =
        static_cast<std::uint8_t>(context.state[index] >> 8U);
    output[index * 4 + 3] =
        static_cast<std::uint8_t>(context.state[index]);
  }
  secureZero(&context, sizeof(context));
}

void sha256(const std::uint8_t *data, std::size_t bytes,
            std::uint8_t output[kSetupSecretHashBytes]) {
  Sha256Context context;
  updateSha256(context, data, bytes);
  finishSha256(context, output);
}

void hmacSha256(const std::uint8_t *key, std::size_t keyBytes,
                const std::uint8_t *message, std::size_t messageBytes,
                std::uint8_t output[kSetupSecretHashBytes]) {
  std::uint8_t normalizedKey[kSha256BlockBytes] = {};
  if (keyBytes > kSha256BlockBytes) {
    sha256(key, keyBytes, normalizedKey);
  } else if (keyBytes > 0) {
    std::memcpy(normalizedKey, key, keyBytes);
  }

  std::uint8_t innerPad[kSha256BlockBytes];
  std::uint8_t outerPad[kSha256BlockBytes];
  for (std::size_t index = 0; index < kSha256BlockBytes; ++index) {
    innerPad[index] = normalizedKey[index] ^ 0x36U;
    outerPad[index] = normalizedKey[index] ^ 0x5cU;
  }

  std::uint8_t innerDigest[kSetupSecretHashBytes];
  Sha256Context inner;
  updateSha256(inner, innerPad, sizeof(innerPad));
  updateSha256(inner, message, messageBytes);
  finishSha256(inner, innerDigest);

  Sha256Context outer;
  updateSha256(outer, outerPad, sizeof(outerPad));
  updateSha256(outer, innerDigest, sizeof(innerDigest));
  finishSha256(outer, output);

  secureZero(normalizedKey, sizeof(normalizedKey));
  secureZero(innerPad, sizeof(innerPad));
  secureZero(outerPad, sizeof(outerPad));
  secureZero(innerDigest, sizeof(innerDigest));
}

std::string base64UrlNoPadding(const std::uint8_t *data,
                               std::size_t bytes) {
  std::string output;
  output.reserve((bytes * 4 + 2) / 3);
  for (std::size_t offset = 0; offset < bytes; offset += 3) {
    const std::size_t remaining = bytes - offset;
    const std::uint32_t block =
        (static_cast<std::uint32_t>(data[offset]) << 16U) |
        (remaining > 1
             ? static_cast<std::uint32_t>(data[offset + 1]) << 8U
             : 0U) |
        (remaining > 2 ? static_cast<std::uint32_t>(data[offset + 2]) : 0U);
    output.push_back(kBase64UrlAlphabet[(block >> 18U) & 0x3fU]);
    output.push_back(kBase64UrlAlphabet[(block >> 12U) & 0x3fU]);
    if (remaining > 1) {
      output.push_back(kBase64UrlAlphabet[(block >> 6U) & 0x3fU]);
    }
    if (remaining > 2) {
      output.push_back(kBase64UrlAlphabet[block & 0x3fU]);
    }
  }
  return output;
}

std::string setupMessage(const char *domain, const std::string &deviceId) {
  std::string message(domain);
  message += deviceId;
  return message;
}

SetupAccessPointCredentials setupError(SetupAccessPointCode code) {
  SetupAccessPointCredentials result;
  result.code = code;
  return result;
}

}  // namespace

bool validCanonicalDeviceId(const std::string &deviceId) {
  if (deviceId.size() < 3 || deviceId.size() > 63) {
    return false;
  }
  const auto alphaNumeric = [](const char character) {
    return (character >= '0' && character <= '9') ||
           (character >= 'A' && character <= 'Z') ||
           (character >= 'a' && character <= 'z');
  };
  if (!alphaNumeric(deviceId.front())) {
    return false;
  }
  return std::all_of(deviceId.begin() + 1, deviceId.end(),
                     [&alphaNumeric](const char character) {
                       return alphaNumeric(character) || character == '_' ||
                              character == '-';
                     });
}

SetupAccessPointCredentials deriveSetupAccessPoint(
    const std::string &deviceId,
    const std::uint8_t secretHash[kSetupSecretHashBytes]) {
  if (!validCanonicalDeviceId(deviceId)) {
    return setupError(SetupAccessPointCode::InvalidDeviceId);
  }
  if (secretHash == nullptr) {
    return setupError(SetupAccessPointCode::MissingDeviceSecret);
  }

  const std::string passwordMessage =
      setupMessage(kSetupPasswordDomain, deviceId);
  std::uint8_t passwordDigest[kSetupSecretHashBytes];
  hmacSha256(secretHash, kSetupSecretHashBytes,
             reinterpret_cast<const std::uint8_t *>(passwordMessage.data()),
             passwordMessage.size(), passwordDigest);

  const std::string ssidMessage = setupMessage(kSetupSsidDomain, deviceId);
  std::uint8_t ssidDigest[kSetupSecretHashBytes];
  sha256(reinterpret_cast<const std::uint8_t *>(ssidMessage.data()),
         ssidMessage.size(), ssidDigest);

  SetupAccessPointCredentials result;
  result.code = SetupAccessPointCode::Ok;
  result.password = base64UrlNoPadding(passwordDigest,
                                       sizeof(passwordDigest))
                        .substr(0, 20);
  result.ssid = "Shcare-";
  result.ssid.reserve(19);
  for (std::size_t index = 0; index < 6; ++index) {
    result.ssid.push_back(kUpperHexAlphabet[(ssidDigest[index] >> 4U) & 0x0fU]);
    result.ssid.push_back(kUpperHexAlphabet[ssidDigest[index] & 0x0fU]);
  }

  secureZero(passwordDigest, sizeof(passwordDigest));
  secureZero(ssidDigest, sizeof(ssidDigest));
  if (result.password.size() != 20 || result.ssid.size() != 19) {
    result.password.clear();
    result.ssid.clear();
    result.code = SetupAccessPointCode::DerivationFailed;
  }
  return result;
}

SetupAccessPointCredentials deriveSetupAccessPointFromSecret(
    const std::string &deviceId, const std::string &deviceSecret) {
  if (!validCanonicalDeviceId(deviceId)) {
    return setupError(SetupAccessPointCode::InvalidDeviceId);
  }
  if (deviceSecret.empty()) {
    return setupError(SetupAccessPointCode::MissingDeviceSecret);
  }

  std::uint8_t secretHash[kSetupSecretHashBytes];
  sha256(reinterpret_cast<const std::uint8_t *>(deviceSecret.data()),
         deviceSecret.size(), secretHash);
  SetupAccessPointCredentials result =
      deriveSetupAccessPoint(deviceId, secretHash);
  secureZero(secretHash, sizeof(secretHash));
  return result;
}

}  // namespace shcare
