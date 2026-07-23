#include "driver/i2s.h"
#include "ShcareDeviceProtocol.h"
#include <Arduino.h>
#include <ArduinoJson.h>
#include <ArduinoOTA.h>
#include <ArduinoWebsockets.h>
#include <DNSServer.h>
#include <ESPmDNS.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <Update.h>
#include <WebServer.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WiFiUdp.h>
#include <esp_app_format.h>
#include <esp_flash_encrypt.h>
#include <esp_ota_ops.h>
#include <esp_system.h>
#include <math.h>
#include <mbedtls/base64.h>
#include <mbedtls/gcm.h>
#include <mbedtls/md.h>
#include <mbedtls/pk.h>
#include <mbedtls/sha256.h>
#include <algorithm>
#include <string.h>
#include <time.h>

using namespace websockets;

// =======================
// WiFi + UDP audio server
// =======================
#ifndef SMART_HEALTH_WIFI_SSID
#define SMART_HEALTH_WIFI_SSID ""
#endif

#ifndef SMART_HEALTH_WIFI_PASS
#define SMART_HEALTH_WIFI_PASS ""
#endif

#ifndef SMART_HEALTH_AUDIO_HOST
#define SMART_HEALTH_AUDIO_HOST ""
#endif

#ifndef SMART_HEALTH_AUDIO_UDP_PORT
#define SMART_HEALTH_AUDIO_UDP_PORT 3001
#endif

#ifndef SMART_HEALTH_BACKEND_HOST
#define SMART_HEALTH_BACKEND_HOST SMART_HEALTH_AUDIO_HOST
#endif

#ifndef SMART_HEALTH_BACKEND_PORT
#define SMART_HEALTH_BACKEND_PORT 3000
#endif

#ifndef SMART_HEALTH_BACKEND_TLS
#define SMART_HEALTH_BACKEND_TLS 0
#endif

#ifndef SMART_HEALTH_DEVICE_NAME
#define SMART_HEALTH_DEVICE_NAME ""
#endif

#ifndef SMART_HEALTH_DEVICE_ID
#define SMART_HEALTH_DEVICE_ID ""
#endif

#ifndef SMART_HEALTH_DEVICE_SECRET
#define SMART_HEALTH_DEVICE_SECRET ""
#endif

#ifndef SMART_HEALTH_FIRMWARE_VERSION
#define SMART_HEALTH_FIRMWARE_VERSION "1.0.0"
#endif

#ifndef SMART_HEALTH_OTA_PASSWORD
#define SMART_HEALTH_OTA_PASSWORD ""
#endif

#ifndef SMART_HEALTH_FACTORY_RESET_PIN
#define SMART_HEALTH_FACTORY_RESET_PIN -1
#endif

#ifndef SMART_HEALTH_FACTORY_RESET_HOLD_MS
#define SMART_HEALTH_FACTORY_RESET_HOLD_MS 8000
#endif

#ifndef SMART_HEALTH_SETUP_PORTAL_TTL_MS
#define SMART_HEALTH_SETUP_PORTAL_TTL_MS 600000
#endif

#ifndef SMART_HEALTH_ENABLE_LAN_OTA
#define SMART_HEALTH_ENABLE_LAN_OTA 0
#endif

#ifndef SMART_HEALTH_PRODUCTION_PROFILE
#define SMART_HEALTH_PRODUCTION_PROFILE 1
#endif

#ifndef SMART_HEALTH_ENABLE_DEVELOPMENT_WS
#define SMART_HEALTH_ENABLE_DEVELOPMENT_WS 0
#endif

#ifndef SMART_HEALTH_ENABLE_DEVELOPMENT_UDP
#define SMART_HEALTH_ENABLE_DEVELOPMENT_UDP 0
#endif

#ifndef SMART_HEALTH_BACKEND_CA_CERT
#define SMART_HEALTH_BACKEND_CA_CERT ""
#endif

#ifndef SMART_HEALTH_OTA_CA_CERT
#define SMART_HEALTH_OTA_CA_CERT SMART_HEALTH_BACKEND_CA_CERT
#endif

#ifndef SMART_HEALTH_OTA_PUBLIC_KEY_PEM
#define SMART_HEALTH_OTA_PUBLIC_KEY_PEM ""
#endif

#ifndef SMART_HEALTH_OTA_BOOT_STABILITY_MS
#define SMART_HEALTH_OTA_BOOT_STABILITY_MS 15000
#endif

#ifndef SMART_HEALTH_OTA_BOOT_HEALTH_TIMEOUT_MS
#define SMART_HEALTH_OTA_BOOT_HEALTH_TIMEOUT_MS 120000
#endif

const char *DEFAULT_WIFI_SSID = SMART_HEALTH_WIFI_SSID;
const char *DEFAULT_WIFI_PASS = SMART_HEALTH_WIFI_PASS;

// Backend host may be a LAN IP or a production DNS name. It can be provided by
// build flags or saved once through the setup portal below.
const char *DEFAULT_AUDIO_HOST = SMART_HEALTH_AUDIO_HOST;
const char *DEFAULT_BACKEND_HOST = SMART_HEALTH_BACKEND_HOST;
const char *DEFAULT_DEVICE_NAME = SMART_HEALTH_DEVICE_NAME;
const char *DEFAULT_DEVICE_ID = SMART_HEALTH_DEVICE_ID;
const char *DEFAULT_DEVICE_SECRET = SMART_HEALTH_DEVICE_SECRET;
const char *DEFAULT_OTA_PASSWORD = SMART_HEALTH_OTA_PASSWORD;
const char *BACKEND_CA_CERT = SMART_HEALTH_BACKEND_CA_CERT;
const char *OTA_CA_CERT = SMART_HEALTH_OTA_CA_CERT;
const char *OTA_PUBLIC_KEY_PEM = SMART_HEALTH_OTA_PUBLIC_KEY_PEM;
const char *FIRMWARE_VERSION = SMART_HEALTH_FIRMWARE_VERSION;
char wifiSsid[64] = "";
char wifiPass[96] = "";
char audioHost[128] = "";
char backendHost[128] = "";
char deviceName[48] = "";
char deviceId[64] = "";
char deviceSecret[96] = "";
char pendingDeviceSecret[96] = "";
char otaPassword[64] = "";
int audioUdpPort = SMART_HEALTH_AUDIO_UDP_PORT;
int backendPort = SMART_HEALTH_BACKEND_PORT;
bool backendUseTls = SMART_HEALTH_BACKEND_TLS != 0;

Preferences devicePrefs;
WebServer setupServer(80);
DNSServer setupDns;
WebsocketsClient cloudSocket;
const byte SETUP_DNS_PORT = 53;
const unsigned long WIFI_CONNECT_TIMEOUT_MS = 20000;
const unsigned long CLOUD_RECONNECT_BASE_MS = 1000;
const unsigned long CLOUD_RECONNECT_MAX_MS = 30000;
const unsigned long CLOUD_TELEMETRY_INTERVAL_MS = 10000;
const unsigned long OTA_BOOT_STABILITY_MS =
    SMART_HEALTH_OTA_BOOT_STABILITY_MS;
const unsigned long OTA_BOOT_HEALTH_TIMEOUT_MS =
    SMART_HEALTH_OTA_BOOT_HEALTH_TIMEOUT_MS;
const int FACTORY_RESET_PIN = SMART_HEALTH_FACTORY_RESET_PIN;
const unsigned long FACTORY_RESET_HOLD_MS = SMART_HEALTH_FACTORY_RESET_HOLD_MS;
const unsigned long SETUP_PORTAL_TTL_MS = SMART_HEALTH_SETUP_PORTAL_TTL_MS;
IPAddress setupPortalIp(192, 168, 4, 1);
IPAddress setupPortalGateway(192, 168, 4, 1);
IPAddress setupPortalSubnet(255, 255, 255, 0);
String setupPortalReason = "";
String setupPortalCsrfToken = "";
bool setupPortalActive = false;
bool setupPortalPhysicalGesture = false;
bool configServerStarted = false;
bool otaReady = false;
bool mdnsReady = false;
bool i2sReady = false;
bool cloudTransportConnected = false;
bool cloudConnected = false;
bool cloudConfigured = false;
bool udpAudioReady = false;
bool deviceLocked = false;
bool authenticatedProductionHeartbeatObserved = false;
bool pendingFirmwareVerification = false;
bool otaRollbackAttempted = false;
unsigned long factoryResetPressedAtMs = 0;
bool factoryResetWarningPrinted = false;
unsigned long setupPortalStartedAtMs = 0;
unsigned long pendingFirmwareBootStartedMs = 0;
unsigned long pendingFirmwareLastStatusMs = 0;
unsigned long lastCloudConnectAttemptMs = 0;
unsigned long cloudReconnectDelayMs = 0;
std::uint32_t cloudReconnectFailureCount = 0;
unsigned long lastCloudTelemetryMs = 0;
String cloudSessionId = "";
String cloudAuthChallengeId = "";
String cloudAuthNonce = "";
String pendingCredentialRotationId = "";
String pendingCredentialRotationExpiresAt = "";
String pendingCredentialRotationCommandId = "";
String pendingCredentialRotationCorrelationId = "";
bool pendingCredentialRotationReady = false;
bool authUsingPendingCredential = false;
String activeAudioSessionId = "";
String activeAudioScanId = "";
bool audioSessionActive = false;
bool audioDiscontinuityPending = false;
uint32_t audioSequence = 0;
shcare::RecentCommandIds recentCommandIds(32);
shcare::CommandJournal commandJournal(6);
shcare::AuthHandshakeState cloudAuthHandshake;
shcare::RuntimeSecurityDecision cloudSecurityDecision;

void sendCloudEvent(const char *type, const char *status = "",
                    const char *detail = "");
void handlePendingFirmwareHealth();

// =======================
// MSM261S4030H0 I2S pins
// =======================
#define MIC_I2S_PORT I2S_NUM_0

#define I2S_WS 12
#define I2S_SCK 11
#define I2S_SD 10

#define SAMPLE_RATE 16000
// 8 ms packets keep latency low while avoiding browser/network underruns.
#define BUFFER_LEN 128
#define I2S_CHANNEL_COUNT 2

int32_t micBuffer[BUFFER_LEN * I2S_CHANNEL_COUNT];
int16_t pcmBuffer[BUFFER_LEN];
uint8_t audioFrameBuffer[shcare::kAudioV2FixedHeaderBytes +
                         shcare::kAudioV2MaxSessionIdBytes +
                         shcare::kAudioV2MaxScanIdBytes +
                         BUFFER_LEN * sizeof(int16_t)];

WiFiUDP audioUdp;
IPAddress audioServerIp;

// =======================
// Heartbeat listening profile
// =======================
// For listening to heart sounds through a stethoscope earpiece. This keeps the
// main S1/S2 band while rejecting low rumble that sounds like wind.
const float HEART_LOW_CUT_HZ = 55.0f;
const float HEART_HIGH_CUT_HZ = 190.0f;
const bool ENABLE_HUM_NOTCH = true;
const bool ENABLE_HUM_HARMONIC_NOTCH = true;
const bool ENABLE_EXTRA_LOW_PASS_STAGE = true;
const float HUM_NOTCH_Q = 35.0f;
const float FILTER_Q = 0.70710678f;

struct Biquad {
  float b0 = 1.0f;
  float b1 = 0.0f;
  float b2 = 0.0f;
  float a1 = 0.0f;
  float a2 = 0.0f;
  float z1 = 0.0f;
  float z2 = 0.0f;

  void reset() {
    z1 = 0.0f;
    z2 = 0.0f;
  }

  void setLowPass(float cutoffHz, float q) {
    const float omega = 2.0f * PI * cutoffHz / SAMPLE_RATE;
    const float sinOmega = sinf(omega);
    const float cosOmega = cosf(omega);
    const float alpha = sinOmega / (2.0f * q);

    const float rawB0 = (1.0f - cosOmega) * 0.5f;
    const float rawB1 = 1.0f - cosOmega;
    const float rawB2 = (1.0f - cosOmega) * 0.5f;
    const float rawA0 = 1.0f + alpha;
    const float rawA1 = -2.0f * cosOmega;
    const float rawA2 = 1.0f - alpha;

    b0 = rawB0 / rawA0;
    b1 = rawB1 / rawA0;
    b2 = rawB2 / rawA0;
    a1 = rawA1 / rawA0;
    a2 = rawA2 / rawA0;
    reset();
  }

  void setHighPass(float cutoffHz, float q) {
    const float omega = 2.0f * PI * cutoffHz / SAMPLE_RATE;
    const float sinOmega = sinf(omega);
    const float cosOmega = cosf(omega);
    const float alpha = sinOmega / (2.0f * q);

    const float rawB0 = (1.0f + cosOmega) * 0.5f;
    const float rawB1 = -(1.0f + cosOmega);
    const float rawB2 = (1.0f + cosOmega) * 0.5f;
    const float rawA0 = 1.0f + alpha;
    const float rawA1 = -2.0f * cosOmega;
    const float rawA2 = 1.0f - alpha;

    b0 = rawB0 / rawA0;
    b1 = rawB1 / rawA0;
    b2 = rawB2 / rawA0;
    a1 = rawA1 / rawA0;
    a2 = rawA2 / rawA0;
    reset();
  }

  void setNotch(float notchHz, float q) {
    const float omega = 2.0f * PI * notchHz / SAMPLE_RATE;
    const float sinOmega = sinf(omega);
    const float cosOmega = cosf(omega);
    const float alpha = sinOmega / (2.0f * q);

    const float rawB0 = 1.0f;
    const float rawB1 = -2.0f * cosOmega;
    const float rawB2 = 1.0f;
    const float rawA0 = 1.0f + alpha;
    const float rawA1 = -2.0f * cosOmega;
    const float rawA2 = 1.0f - alpha;

    b0 = rawB0 / rawA0;
    b1 = rawB1 / rawA0;
    b2 = rawB2 / rawA0;
    a1 = rawA1 / rawA0;
    a2 = rawA2 / rawA0;
    reset();
  }

  float process(float x) {
    const float y = b0 * x + z1;
    z1 = b1 * x - a1 * y + z2;
    z2 = b2 * x - a2 * y;
    return y;
  }
};

Biquad heartHighPass;
Biquad heartHighPass2;
Biquad humNotch50;
Biquad humNotch100;
Biquad heartLowPass1;
Biquad heartLowPass2;
Biquad heartLowPass3;
Biquad metricHighPass;
Biquad metricLowPass1;
Biquad metricLowPass2;

// =======================
// Audio tuning
// =======================
const int RAW_SHIFT = 14;
float volumeGain = 4.2f;
float dcOffset = 0.0f;
float inputSmooth = 0.0f;
float outputSmooth = 0.0f;

// UDP stream mode:
// 0 = listen DSP, 1 = centered raw monitor, 2 = light heart band-pass.
// Keep LISTEN as default so the current receiver format stays unchanged.
const uint8_t STREAM_LISTEN = 0;
const uint8_t STREAM_RAW = 1;
const uint8_t STREAM_LIGHT_FILTERED = 2;
const uint8_t AUDIO_STREAM_MODE = STREAM_LISTEN;
const float rawMonitorGain = 2.0f;

const bool ENABLE_INPUT_DEGLITCH = true;
const float inputMaxStep = 1600.0f;
const float inputSmoothAlpha = 0.65f;

const bool ENABLE_SOFT_NOISE_FLOOR = false;
const float noiseFloorStart = 3.0f;
const float noiseFloorFull = 30.0f;
const float limiterThreshold = 18000.0f;
const bool ENABLE_CLICK_TAMER = true;
const float clickMaxStep = 700.0f;
const float postSmoothAlpha = 0.085f;

const bool ENABLE_SOFT_COMPRESSOR = true;
const float compressorFloorLevel = 0.12f;
const float compressorThresholdMin = 20.0f;
const float compressorThresholdMultiplier = 2.6f;
const float compressorActivityKnee = 1.25f;
const float compressorNoiseAlpha = 0.00006f;
const float compressorEnvelopeAttack = 0.018f;
const float compressorEnvelopeRelease = 0.00065f;
const float compressorGainMax = 2.10f;
const float compressorGainAttack = 0.026f;
const float compressorGainRelease = 0.0038f;
const uint32_t compressorHoldSamples = (SAMPLE_RATE * 90UL) / 1000UL;
const float compressorHoldActivity = 0.32f;
float compressorEnvelope = 0.0f;
float compressorNoise = 8.0f;
float compressorActivity = 0.0f;
float compressorGain = 1.0f;
uint32_t compressorHoldCounter = 0;

float agcGain = 1.0f;
const float targetRms = 2500.0f;
const float agcMin = 1.0f;
const float agcMax = 1.18f;
const int32_t agcActivityRms = 150;

const float METRIC_LOW_CUT_HZ = 35.0f;
const float METRIC_HIGH_CUT_HZ = 180.0f;
const float metricGain = 5.8f;

// =======================
// Heart metrics for Serial Plotter
// =======================
float heartEnvelope = 0.0f;
float heartEnvelopeMean = 0.0f;
float heartThreshold = 500.0f;
float heartBpm = 0.0f;

uint32_t sampleCounter = 0;
uint32_t lastBeatSample = 0;
uint16_t beatsInPlotWindow = 0;
bool beatArmed = true;

const float envelopeAttackAlpha = 0.0062f;   // about 10 ms at 16 kHz
const float envelopeReleaseAlpha = 0.00052f; // about 120 ms at 16 kHz
const float envelopeMeanAlpha = 0.00002f;
const float beatThresholdMultiplier = 1.9f;
const float beatThresholdMin = 600.0f;
const uint32_t minBeatIntervalSamples =
    (SAMPLE_RATE * 280UL) / 1000UL; // ~214 BPM max
const uint32_t maxBeatIntervalSamples =
    (SAMPLE_RATE * 1800UL) / 1000UL; // ~33 BPM min

// =======================
// Serial Plotter
// =======================
unsigned long lastPlotMs = 0;
const unsigned long PLOT_INTERVAL_MS = 300;
int32_t plotPeak = 0;
uint64_t plotSumSq = 0;
uint16_t plotCount = 0;
uint16_t clipCount = 0;
int16_t lastWave = 0;
int32_t rawPeak = 0;
int32_t filteredPeak = 0;

uint32_t udpPacketsSent = 0;
uint32_t udpSendFailures = 0;
uint32_t wsPacketsSent = 0;
uint32_t wsSendFailures = 0;
String lastCommandId = "";
String lastCommandState = "";
String lastCommandCode = "";
String lastOtaStatus = "";
unsigned long lastCommandUptimeMs = 0;

int32_t abs32(int32_t value) { return value < 0 ? -value : value; }

float maxFloat(float a, float b) { return a > b ? a : b; }

const char *resetReasonLabel() {
  switch (esp_reset_reason()) {
  case ESP_RST_POWERON:
    return "power_on";
  case ESP_RST_EXT:
    return "external";
  case ESP_RST_SW:
    return "software";
  case ESP_RST_PANIC:
    return "panic";
  case ESP_RST_INT_WDT:
    return "interrupt_watchdog";
  case ESP_RST_TASK_WDT:
    return "task_watchdog";
  case ESP_RST_WDT:
    return "watchdog";
  case ESP_RST_DEEPSLEEP:
    return "deep_sleep";
  case ESP_RST_BROWNOUT:
    return "brownout";
  case ESP_RST_SDIO:
    return "sdio";
  default:
    return "unknown";
  }
}

void copyConfigValue(char *target, size_t targetSize, const char *value) {
  if (targetSize == 0) {
    return;
  }

  if (value == NULL) {
    value = "";
  }

  strncpy(target, value, targetSize - 1);
  target[targetSize - 1] = '\0';
}

void copyConfigValue(char *target, size_t targetSize, String value,
                     const bool trimValue = true) {
  if (trimValue) {
    value.trim();
  }
  copyConfigValue(target, targetSize, value.c_str());
}

String htmlEscape(const char *value) {
  String escaped = "";
  if (value == NULL) {
    return escaped;
  }

  for (size_t i = 0; value[i] != '\0'; i++) {
    switch (value[i]) {
    case '&':
      escaped += "&amp;";
      break;
    case '<':
      escaped += "&lt;";
      break;
    case '>':
      escaped += "&gt;";
      break;
    case '"':
      escaped += "&quot;";
      break;
    case '\'':
      escaped += "&#39;";
      break;
    default:
      escaped += value[i];
      break;
    }
  }

  return escaped;
}

bool hasWiFiConfig() { return strlen(wifiSsid) > 0; }

bool hasBackendConfig() { return strlen(backendHost) > 0 && backendPort > 0 && backendPort <= 65535; }

bool isProductionProfile() { return SMART_HEALTH_PRODUCTION_PROFILE != 0; }

bool isCredentialStorageEncrypted() {
#if defined(CONFIG_NVS_ENCRYPTION) && CONFIG_NVS_ENCRYPTION
  // NVS uses its own XTS scheme; generic flash encryption alone is not proof
  // that Preferences-backed device credentials are encrypted at rest.
  return esp_flash_encryption_enabled();
#else
  return false;
#endif
}

shcare::RuntimeSecurityDecision evaluateCloudSecurity() {
  shcare::RuntimeSecurityConfig config;
  config.productionProfile = isProductionProfile();
  config.backendConfigured = hasBackendConfig();
  config.tlsEnabled = backendUseTls;
  config.caTrustConfigured = strlen(BACKEND_CA_CERT) > 0;
  config.deviceIdentityConfigured =
      shcare::validCanonicalDeviceId(std::string(deviceId));
  config.deviceSecretConfigured = strlen(deviceSecret) >= 16;
  config.credentialStorageEncrypted = isCredentialStorageEncrypted();
  config.developmentWsEnabled = SMART_HEALTH_ENABLE_DEVELOPMENT_WS != 0;
  return shcare::evaluateRuntimeSecurity(config);
}

const char *activeAudioTransportLabel() {
  if (cloudConnected) {
    return shcare::cloudTransportLabel(cloudSecurityDecision.transport);
  }
  return udpAudioReady ? "UDP_DEVELOPMENT" : "DISABLED";
}

bool hasUdpAudioConfig() {
  return strlen(audioHost) > 0 && audioUdpPort > 0 && audioUdpPort <= 65535;
}

bool hasOtaPassword() { return strlen(otaPassword) >= 8; }

String getDeviceSuffix() {
  char buffer[7];
  snprintf(buffer, sizeof(buffer), "%06X",
           (uint32_t)(ESP.getEfuseMac() & 0xFFFFFF));
  return String(buffer);
}

String getDefaultDeviceName() { return "smarthealth-" + getDeviceSuffix(); }

String sanitizeDeviceName(String value) {
  value.trim();
  value.toLowerCase();

  String sanitized = "";
  bool lastWasDash = false;
  for (size_t i = 0; i < value.length(); i++) {
    const char c = value[i];
    const bool allowed = (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9');
    if (allowed) {
      sanitized += c;
      lastWasDash = false;
    } else if (!lastWasDash && sanitized.length() > 0) {
      sanitized += "-";
      lastWasDash = true;
    }
  }

  while (sanitized.endsWith("-")) {
    sanitized.remove(sanitized.length() - 1);
  }

  if (sanitized.length() == 0) {
    sanitized = getDefaultDeviceName();
  }

  if (sanitized.length() > 40) {
    sanitized = sanitized.substring(0, 40);
    while (sanitized.endsWith("-")) {
      sanitized.remove(sanitized.length() - 1);
    }
  }

  return sanitized;
}

String generateOtaPassword() {
  char buffer[22];
  snprintf(buffer, sizeof(buffer), "sh-%06X-%08X",
           (uint32_t)(ESP.getEfuseMac() & 0xFFFFFF),
           (uint32_t)esp_random());
  return String(buffer);
}

String generateSetupPortalCsrfToken() {
  char token[65];
  for (size_t index = 0; index < 8; ++index) {
    snprintf(token + index * 8, 9, "%08lX",
             static_cast<unsigned long>(esp_random()));
  }
  token[64] = '\0';
  return String(token);
}

bool saveRuntimeConfig();
void sendAudioUdp(const int samplesRead);

void eraseRuntimeConfigAndRestart(const char *reason) {
  Serial.println();
  Serial.println("Factory reset requested.");
  if (reason != NULL && strlen(reason) > 0) {
    Serial.print("Reason: ");
    Serial.println(reason);
  }

  devicePrefs.begin("smart-health", false);
  devicePrefs.clear();
  devicePrefs.end();

  delay(500);
  ESP.restart();
}

void setupFactoryResetButton() {
  if (FACTORY_RESET_PIN < 0) {
    Serial.println("Factory reset button disabled.");
    return;
  }

  pinMode(FACTORY_RESET_PIN, INPUT_PULLUP);
  delay(20);
  setupPortalPhysicalGesture = digitalRead(FACTORY_RESET_PIN) == LOW;
  Serial.print("Factory reset button ready on GPIO");
  Serial.print(FACTORY_RESET_PIN);
  Serial.print(". Hold for ");
  Serial.print(FACTORY_RESET_HOLD_MS / 1000UL);
  Serial.println(" seconds while device is running.");
  if (setupPortalPhysicalGesture) {
    Serial.println(
        "Physical setup gesture detected; WiFi recovery is authorized for this boot.");
  }
}

void handleFactoryResetButton() {
  if (FACTORY_RESET_PIN < 0) {
    return;
  }

  const bool pressed = digitalRead(FACTORY_RESET_PIN) == LOW;
  if (!pressed) {
    factoryResetPressedAtMs = 0;
    factoryResetWarningPrinted = false;
    return;
  }

  if (factoryResetPressedAtMs == 0) {
    factoryResetPressedAtMs = millis();
    factoryResetWarningPrinted = false;
    return;
  }

  const unsigned long heldMs = millis() - factoryResetPressedAtMs;
  if (!factoryResetWarningPrinted && heldMs >= 2000) {
    factoryResetWarningPrinted = true;
    Serial.println("Keep holding factory reset button to erase WiFi/device config.");
  }

  if (heldMs >= FACTORY_RESET_HOLD_MS) {
    eraseRuntimeConfigAndRestart("factory reset button held");
  }
}

void clearPendingCredentialRotationState(bool eraseNvs) {
  if (eraseNvs) {
    devicePrefs.begin("smart-health", false);
    devicePrefs.putBool("rotReady", false);
    devicePrefs.remove("rotNext");
    devicePrefs.remove("rotId");
    devicePrefs.remove("rotExpiry");
    devicePrefs.remove("rotCmd");
    devicePrefs.remove("rotCorr");
    devicePrefs.end();
  }
  memset(pendingDeviceSecret, 0, sizeof(pendingDeviceSecret));
  pendingCredentialRotationId = "";
  pendingCredentialRotationExpiresAt = "";
  pendingCredentialRotationCommandId = "";
  pendingCredentialRotationCorrelationId = "";
  pendingCredentialRotationReady = false;
  authUsingPendingCredential = false;
}

bool persistPendingCredentialRotation(
    const String &rotationId, const char *nextSecret,
    const String &expiresAt, const std::string &commandId,
    const std::string &correlationId) {
  if (rotationId.length() < 8 || rotationId.length() > 128 ||
      expiresAt.length() < 20 || expiresAt.length() > 40 ||
      nextSecret == nullptr || strlen(nextSecret) < 32 ||
      strlen(nextSecret) >= sizeof(pendingDeviceSecret) ||
      commandId.empty() || correlationId.empty()) {
    return false;
  }
  devicePrefs.begin("smart-health", false);
  devicePrefs.putBool("rotReady", false);
  bool saved = true;
  saved = devicePrefs.putString("rotNext", nextSecret) > 0 && saved;
  saved = devicePrefs.putString("rotId", rotationId) > 0 && saved;
  saved = devicePrefs.putString("rotExpiry", expiresAt) > 0 && saved;
  saved = devicePrefs.putString("rotCmd", commandId.c_str()) > 0 && saved;
  saved = devicePrefs.putString("rotCorr", correlationId.c_str()) > 0 && saved;
  saved = devicePrefs.putBool("rotReady", saved) > 0 && saved;
  if (!saved) {
    devicePrefs.putBool("rotReady", false);
    devicePrefs.remove("rotNext");
    devicePrefs.remove("rotId");
    devicePrefs.remove("rotExpiry");
    devicePrefs.remove("rotCmd");
    devicePrefs.remove("rotCorr");
  }
  devicePrefs.end();
  if (!saved) return false;
  copyConfigValue(pendingDeviceSecret, sizeof(pendingDeviceSecret),
                  nextSecret);
  pendingCredentialRotationId = rotationId;
  pendingCredentialRotationExpiresAt = expiresAt;
  pendingCredentialRotationCommandId = commandId.c_str();
  pendingCredentialRotationCorrelationId = correlationId.c_str();
  pendingCredentialRotationReady = true;
  return true;
}

bool commitPendingCredentialRotation() {
  if (!pendingCredentialRotationReady ||
      strlen(pendingDeviceSecret) < 32) {
    return false;
  }
  devicePrefs.begin("smart-health", false);
  const bool committed =
      devicePrefs.putString("deviceSecret", pendingDeviceSecret) > 0;
  if (committed) {
    devicePrefs.putBool("rotReady", false);
    devicePrefs.remove("rotNext");
    devicePrefs.remove("rotId");
    devicePrefs.remove("rotExpiry");
    devicePrefs.remove("rotCmd");
    devicePrefs.remove("rotCorr");
  }
  devicePrefs.end();
  if (!committed) return false;
  copyConfigValue(deviceSecret, sizeof(deviceSecret), pendingDeviceSecret,
                  false);
  clearPendingCredentialRotationState(false);
  return true;
}

void loadRuntimeConfig() {
  copyConfigValue(wifiSsid, sizeof(wifiSsid), DEFAULT_WIFI_SSID);
  copyConfigValue(wifiPass, sizeof(wifiPass), DEFAULT_WIFI_PASS);
  copyConfigValue(audioHost, sizeof(audioHost), DEFAULT_AUDIO_HOST);
  copyConfigValue(backendHost, sizeof(backendHost), DEFAULT_BACKEND_HOST);
  copyConfigValue(deviceName, sizeof(deviceName), DEFAULT_DEVICE_NAME);
  memset(deviceId, 0, sizeof(deviceId));
  bool deviceIdentityRejected = false;
  const std::string defaultDeviceId(DEFAULT_DEVICE_ID);
  if (!defaultDeviceId.empty()) {
    if (shcare::validCanonicalDeviceId(defaultDeviceId)) {
      copyConfigValue(deviceId, sizeof(deviceId), DEFAULT_DEVICE_ID);
    } else {
      deviceIdentityRejected = true;
    }
  }
  memset(deviceSecret, 0, sizeof(deviceSecret));
  bool deviceSecretRejected = false;
  const std::string defaultDeviceSecret(DEFAULT_DEVICE_SECRET);
  if (!defaultDeviceSecret.empty()) {
    if (defaultDeviceSecret.size() >= 16 &&
        defaultDeviceSecret.size() < sizeof(deviceSecret)) {
      copyConfigValue(deviceSecret, sizeof(deviceSecret),
                      DEFAULT_DEVICE_SECRET, false);
    } else {
      deviceSecretRejected = true;
    }
  }
  copyConfigValue(otaPassword, sizeof(otaPassword), DEFAULT_OTA_PASSWORD,
                  false);
  audioUdpPort = SMART_HEALTH_AUDIO_UDP_PORT;

  devicePrefs.begin("smart-health", true);

  if (devicePrefs.isKey("wifiSsid")) {
    copyConfigValue(wifiSsid, sizeof(wifiSsid),
                    devicePrefs.getString("wifiSsid", ""));
  }

  if (devicePrefs.isKey("wifiPass")) {
    copyConfigValue(wifiPass, sizeof(wifiPass),
                    devicePrefs.getString("wifiPass", ""), false);
  }

  if (devicePrefs.isKey("audioHost")) {
    copyConfigValue(audioHost, sizeof(audioHost),
                    devicePrefs.getString("audioHost", ""));
  }

  if (devicePrefs.isKey("backendHost")) {
    copyConfigValue(backendHost, sizeof(backendHost),
                    devicePrefs.getString("backendHost", ""));
  } else if (strlen(backendHost) == 0 && strlen(audioHost) > 0) {
    copyConfigValue(backendHost, sizeof(backendHost), audioHost);
  }

  if (devicePrefs.isKey("deviceName")) {
    copyConfigValue(deviceName, sizeof(deviceName),
                    devicePrefs.getString("deviceName", ""));
  }

  if (devicePrefs.isKey("deviceId")) {
    const String storedDeviceId = devicePrefs.getString("deviceId", "");
    const std::string canonicalStoredDeviceId(storedDeviceId.c_str());
    memset(deviceId, 0, sizeof(deviceId));
    deviceIdentityRejected = false;
    if (!canonicalStoredDeviceId.empty()) {
      if (shcare::validCanonicalDeviceId(canonicalStoredDeviceId)) {
        copyConfigValue(deviceId, sizeof(deviceId), storedDeviceId, false);
      } else {
        deviceIdentityRejected = true;
      }
    }
  }

  if (devicePrefs.isKey("deviceSecret")) {
    const String storedDeviceSecret =
        devicePrefs.getString("deviceSecret", "");
    memset(deviceSecret, 0, sizeof(deviceSecret));
    deviceSecretRejected = false;
    if (storedDeviceSecret.length() > 0) {
      if (storedDeviceSecret.length() >= 16 &&
          storedDeviceSecret.length() < sizeof(deviceSecret)) {
        copyConfigValue(deviceSecret, sizeof(deviceSecret),
                        storedDeviceSecret, false);
      } else {
        deviceSecretRejected = true;
      }
    }
  }

  pendingCredentialRotationReady = devicePrefs.getBool("rotReady", false);
  if (pendingCredentialRotationReady) {
    copyConfigValue(pendingDeviceSecret, sizeof(pendingDeviceSecret),
                    devicePrefs.getString("rotNext", ""), false);
    pendingCredentialRotationId = devicePrefs.getString("rotId", "");
    pendingCredentialRotationExpiresAt =
        devicePrefs.getString("rotExpiry", "");
    pendingCredentialRotationCommandId =
        devicePrefs.getString("rotCmd", "");
    pendingCredentialRotationCorrelationId =
        devicePrefs.getString("rotCorr", "");
  }

  if (devicePrefs.isKey("otaPass")) {
    copyConfigValue(otaPassword, sizeof(otaPassword),
                    devicePrefs.getString("otaPass", ""), false);
  }

  const int storedUdpPort =
      devicePrefs.getInt("udpPort", SMART_HEALTH_AUDIO_UDP_PORT);
  if (storedUdpPort > 0 && storedUdpPort <= 65535) {
    audioUdpPort = storedUdpPort;
  }

  const int storedBackendPort =
      devicePrefs.getInt("backendPort", SMART_HEALTH_BACKEND_PORT);
  if (storedBackendPort > 0 && storedBackendPort <= 65535) {
    backendPort = storedBackendPort;
  }
  backendUseTls = devicePrefs.getBool("backendTls", backendUseTls);
  deviceLocked = devicePrefs.getBool("deviceLocked", false);
  const String persistedCommandJournal =
      devicePrefs.getString("cmdJournal", "");
  if (persistedCommandJournal.length() > 0 &&
      !commandJournal.restore(
          std::string(persistedCommandJournal.c_str()))) {
    Serial.println(
        "Command journal ignored: stored data is invalid or incompatible.");
  }

  devicePrefs.end();

  if (pendingCredentialRotationReady &&
      (strlen(pendingDeviceSecret) < 32 ||
       strlen(pendingDeviceSecret) >= sizeof(pendingDeviceSecret) ||
       pendingCredentialRotationId.length() < 8 ||
       pendingCredentialRotationCommandId.length() == 0 ||
       pendingCredentialRotationCorrelationId.length() == 0)) {
    clearPendingCredentialRotationState(true);
  }

  bool shouldPersistDefaults = false;
  if (strlen(deviceName) == 0) {
    copyConfigValue(deviceName, sizeof(deviceName), getDefaultDeviceName());
    shouldPersistDefaults = true;
  }

  copyConfigValue(deviceName, sizeof(deviceName),
                  sanitizeDeviceName(deviceName));

  if (strlen(otaPassword) == 0) {
    copyConfigValue(otaPassword, sizeof(otaPassword), generateOtaPassword(),
                    false);
    shouldPersistDefaults = true;
  }

  if (deviceIdentityRejected ||
      !shcare::validCanonicalDeviceId(std::string(deviceId))) {
    memset(deviceId, 0, sizeof(deviceId));
    Serial.println(
        "Device identity unavailable or rejected: expected canonical 3-63 "
        "character ID; "
        "cloud authentication and setup AP remain disabled.");
  }

  if (deviceSecretRejected || strlen(deviceSecret) < 16) {
    memset(deviceSecret, 0, sizeof(deviceSecret));
    Serial.println(
        "Device credential unavailable or rejected; cloud authentication "
        "and setup AP remain disabled.");
  }

  if (shouldPersistDefaults) {
    saveRuntimeConfig();
  }
}

bool saveRuntimeConfig() {
  devicePrefs.begin("smart-health", false);
  bool saved = true;
  saved = devicePrefs.putString("wifiSsid", wifiSsid) > 0 && saved;
  saved = devicePrefs.putString("wifiPass", wifiPass) > 0 && saved;
  saved = devicePrefs.putString("audioHost", audioHost) > 0 && saved;
  saved = devicePrefs.putString("backendHost", backendHost) > 0 && saved;
  saved = devicePrefs.putString("deviceName", deviceName) > 0 && saved;
  saved = devicePrefs.putString("deviceId", deviceId) > 0 && saved;
  saved = devicePrefs.putString("deviceSecret", deviceSecret) > 0 && saved;
  saved = devicePrefs.putString("otaPass", otaPassword) > 0 && saved;
  saved = devicePrefs.putInt("udpPort", audioUdpPort) > 0 && saved;
  saved = devicePrefs.putInt("backendPort", backendPort) > 0 && saved;
  saved = devicePrefs.putBool("backendTls", backendUseTls) > 0 && saved;
  saved = devicePrefs.putBool("deviceLocked", deviceLocked) > 0 && saved;
  devicePrefs.end();
  return saved;
}

bool persistCommandJournalSnapshot(
    const shcare::CommandJournal &candidate) {
  const std::string serialized = candidate.serialize();
  if (serialized.empty()) {
    return false;
  }
  devicePrefs.begin("smart-health", false);
  const size_t written =
      devicePrefs.putString("cmdJournal", serialized.c_str());
  devicePrefs.end();
  if (written == 0) {
    return false;
  }

  devicePrefs.begin("smart-health", true);
  const String persisted = devicePrefs.getString("cmdJournal", "");
  devicePrefs.end();
  return persisted == String(serialized.c_str());
}

bool persistTerminalCommand(const shcare::CommandEnvelope &command,
                            const char *state, const char *code,
                            const char *result) {
  shcare::CommandJournal candidate = commandJournal;
  shcare::CommandJournalEntry entry;
  entry.commandId = command.id;
  entry.correlationId = command.correlationId;
  entry.type = command.type;
  entry.state = state == nullptr ? "failed" : state;
  entry.code = code == nullptr ? "COMMAND_FAILED" : code;
  entry.result = result == nullptr ? "" : result;
  if (!candidate.recordTerminal(entry) ||
      !persistCommandJournalSnapshot(candidate)) {
    return false;
  }
  commandJournal = candidate;
  return true;
}

String buildSetupPage(const char *message) {
  String page =
      F("<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">"
        "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
        "<title>Smart Health WiFi Recovery</title><style>"
        "body{margin:0;font-family:Arial,sans-serif;background:#f7f9fc;color:#172033}"
        ".wrap{max-width:520px;margin:0 auto;padding:28px 18px}"
        ".panel{background:#fff;border:1px solid #dde5ef;border-radius:12px;padding:22px;box-shadow:0 12px 35px rgba(16,24,40,.08)}"
        ".grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:14px 0}"
        ".kv{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;font-size:13px}"
        "h1{font-size:24px;margin:0 0 8px}p{line-height:1.5;color:#58677c}"
        "label{display:block;font-weight:700;margin:16px 0 6px}"
        "input{box-sizing:border-box;width:100%;padding:12px;border:1px solid #c9d4e2;border-radius:8px;font-size:16px}"
        "button{display:block;box-sizing:border-box;width:100%;margin-top:20px;padding:13px 16px;border:0;border-radius:8px;background:#0f766e;color:#fff;font-size:16px;font-weight:700}"
        ".msg{padding:10px 12px;background:#fff3cd;border:1px solid #ffe08a;border-radius:8px;color:#7a4b00}"
        ".hint{font-size:13px;color:#6b7788}</style></head><body><main class=\"wrap\"><section class=\"panel\">"
        "<h1>Smart Health WiFi Recovery</h1>"
        "<p>This local page only reconnects the device to WiFi. Firmware update, backend settings, device secret and ownership are managed from the main Smart Health Web Admin.</p>");

  if (message != NULL && strlen(message) > 0) {
    page += F("<div class=\"msg\">");
    page += htmlEscape(message);
    page += F("</div>");
  }

  page += F("<div class=\"grid\"><div class=\"kv\"><b>Mode</b><br>");
  page += setupPortalActive ? "WiFi recovery AP" : "WiFi station";
  page += F("</div><div class=\"kv\"><b>IP</b><br>");
  page += WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString()
                                        : setupPortalIp.toString();
  page += F("</div><div class=\"kv\"><b>Device ID</b><br>");
  page += htmlEscape(deviceId);
  page += F("</div><div class=\"kv\"><b>Cloud</b><br>");
  page += cloudConnected ? "Connected" : "Waiting for Internet";
  page += F("</div></div>");

  page += F("<form method=\"post\" action=\"/save\"><input type=\"hidden\" name=\"csrf\" value=\"");
  page += htmlEscape(setupPortalCsrfToken.c_str());
  page += F("\">"
            "<label for=\"ssid\">WiFi SSID</label><input id=\"ssid\" name=\"ssid\" required value=\"");
  page += htmlEscape(wifiSsid);
  page += F("\"><label for=\"pass\">WiFi password</label><input id=\"pass\" name=\"pass\" type=\"password\" autocomplete=\"new-password\" value=\"\">"
            "<div class=\"hint\">The saved WiFi password is never displayed. Enter it again to reconnect, or leave blank only for an open network. This page cannot change OTA, backend URL, device secret or admin rights.</div>");
  page += F("<button type=\"submit\">Save and restart</button></form>"
            "<p class=\"hint\">After saving, the device restarts and connects to the selected WiFi. When Internet is available it reconnects to the main Web Admin through the backend cloud.</p>"
            "</section></main></body></html>");

  return page;
}

void sendSetupSecurityHeaders() {
  setupServer.sendHeader("Cache-Control", "no-store, max-age=0");
  setupServer.sendHeader("Pragma", "no-cache");
  setupServer.sendHeader("X-Content-Type-Options", "nosniff");
  setupServer.sendHeader("X-Frame-Options", "DENY");
  setupServer.sendHeader("Referrer-Policy", "no-referrer");
  setupServer.sendHeader(
      "Content-Security-Policy",
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; "
      "frame-ancestors 'none'; base-uri 'none'");
}

void sendSetupHtml(int status, const String &body) {
  sendSetupSecurityHeaders();
  setupServer.send(status, "text/html", body);
}

void handleSetupRoot() {
  sendSetupHtml(200, buildSetupPage(setupPortalReason.c_str()));
}

void handleSetupSave() {
  if (shcare::setupPortalExpired(
          static_cast<std::uint32_t>(millis()),
          static_cast<std::uint32_t>(setupPortalStartedAtMs),
          static_cast<std::uint32_t>(SETUP_PORTAL_TTL_MS))) {
    sendSetupHtml(410, buildSetupPage("This recovery session has expired."));
    return;
  }

  const String providedCsrf = setupServer.arg("csrf");
  if (!shcare::validSetupPortalCsrf(
          std::string(setupPortalCsrfToken.c_str()),
          std::string(providedCsrf.c_str()))) {
    sendSetupHtml(403, buildSetupPage("Invalid recovery session token."));
    return;
  }

  String ssid = setupServer.arg("ssid");
  String pass = setupServer.arg("pass");

  ssid.trim();

  if (ssid.length() == 0) {
    sendSetupHtml(400, buildSetupPage("WiFi SSID is required."));
    return;
  }

  const String previousSsid = wifiSsid;
  const String previousPassword = wifiPass;
  copyConfigValue(wifiSsid, sizeof(wifiSsid), ssid);
  copyConfigValue(wifiPass, sizeof(wifiPass), pass, false);
  if (!saveRuntimeConfig()) {
    copyConfigValue(wifiSsid, sizeof(wifiSsid), previousSsid);
    copyConfigValue(wifiPass, sizeof(wifiPass), previousPassword, false);
    sendSetupHtml(
        500, buildSetupPage("WiFi configuration could not be stored."));
    return;
  }

  sendSetupHtml(
      200,
      F("<!doctype html><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
        "<body style=\"font-family:Arial,sans-serif;padding:24px\"><h1>Saved</h1>"
        "<p>Smart Health device is restarting with the new configuration.</p></body>"));
  delay(1200);
  ESP.restart();
}

void handleStatusJson() {
  String json = "{";
  json += "\"deviceId\":\"";
  json += deviceId;
  json += "\",";
  json += "\"deviceName\":\"";
  json += deviceName;
  json += "\",";
  json += "\"wifiConnected\":";
  json += WiFi.status() == WL_CONNECTED ? "true" : "false";
  json += ",";
  json += "\"ip\":\"";
  json += WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString()
                                        : setupPortalIp.toString();
  json += "\",";
  json += "\"cloudConnected\":";
  json += cloudConnected ? "true" : "false";
  json += ",";
  json += "\"firmwareVersion\":\"";
  json += FIRMWARE_VERSION;
  json += "\"";
  json += ",";
  json += "\"portalActive\":";
  json += setupPortalActive ? "true" : "false";
  json += "}";
  sendSetupSecurityHeaders();
  setupServer.send(200, "application/json", json);
}

void handleConfigNotFound() {
  if (setupPortalActive) {
    setupServer.sendHeader("Location", "/", true);
    setupServer.send(302, "text/plain", "");
    return;
  }

  setupServer.send(404, "text/plain", "Not found");
}

void startConfigWebServer(const bool portalMode, const char *reason) {
  setupPortalActive = portalMode;
  setupPortalReason = reason == NULL ? "" : reason;

  if (configServerStarted) {
    return;
  }

  setupServer.on("/", HTTP_GET, handleSetupRoot);
  setupServer.on("/save", HTTP_POST, handleSetupSave);
  setupServer.on("/status", HTTP_GET, handleStatusJson);
  setupServer.onNotFound(handleConfigNotFound);
  setupServer.begin();
  configServerStarted = true;

  Serial.println("Smart Health WiFi recovery server ready on port 80.");
}

void runSetupPortal(const char *reason) {
  if (!shcare::setupPortalAllowed(hasWiFiConfig(),
                                  setupPortalPhysicalGesture)) {
    Serial.println();
    Serial.println(
        "WiFi recovery AP remains closed: configured devices require the "
        "physical setup gesture at boot.");
    if (FACTORY_RESET_PIN < 0) {
      Serial.println(
          "No setup/reset GPIO is configured; use a wired recovery flash.");
    }
    while (WiFi.status() != WL_CONNECTED) {
      handleFactoryResetButton();
      handlePendingFirmwareHealth();
      delay(100);
    }
    return;
  }

  WiFi.disconnect(false);
  delay(250);
  WiFi.mode(WIFI_AP);
  WiFi.softAPConfig(setupPortalIp, setupPortalGateway, setupPortalSubnet);

  if (!shcare::validCanonicalDeviceId(std::string(deviceId)) ||
      strlen(deviceSecret) < 16) {
    Serial.println(
        "WiFi recovery AP remains closed: canonical device identity and "
        "device credential are required.");
    while (true) {
      handleFactoryResetButton();
      handlePendingFirmwareHealth();
      delay(100);
    }
  }

  shcare::SetupAccessPointCredentials apCredentials =
      shcare::deriveSetupAccessPointFromSecret(std::string(deviceId),
                                                std::string(deviceSecret));
  if (!apCredentials.ok()) {
    Serial.println(
        "WiFi recovery AP remains closed: per-device WPA2 derivation failed.");
    while (true) {
      handleFactoryResetButton();
      handlePendingFirmwareHealth();
      delay(100);
    }
  }

  String apName(apCredentials.ssid.c_str());
  String apPassword(apCredentials.password.c_str());
  std::fill(apCredentials.password.begin(), apCredentials.password.end(),
            '\0');
  apCredentials.password.clear();
  setupPortalCsrfToken = generateSetupPortalCsrfToken();
  setupPortalStartedAtMs = millis();

  const bool accessPointStarted =
      WiFi.softAP(apName.c_str(), apPassword.c_str());
  for (size_t index = 0; index < apPassword.length(); ++index) {
    apPassword.setCharAt(index, '\0');
  }
  apPassword = "";

  if (!accessPointStarted) {
    Serial.println("Cannot start Smart Health setup access point.");
    while (true) {
      handlePendingFirmwareHealth();
      delay(1000);
    }
  }

  setupDns.start(SETUP_DNS_PORT, "*", setupPortalIp);
  startConfigWebServer(true, reason);

  Serial.println();
  Serial.println("Smart Health setup portal started.");
  if (reason != NULL && strlen(reason) > 0) {
    Serial.print("Reason: ");
    Serial.println(reason);
  }
  Serial.print("AP SSID: ");
  Serial.println(apName);
  Serial.println(
      "AP access: factory/physical-gated, time-bounded and protected by "
      "per-device WPA2 proof of possession.");
  Serial.print("Open: http://");
  Serial.println(setupPortalIp);

  while (true) {
    if (shcare::setupPortalExpired(
            static_cast<std::uint32_t>(millis()),
            static_cast<std::uint32_t>(setupPortalStartedAtMs),
            static_cast<std::uint32_t>(SETUP_PORTAL_TTL_MS))) {
      Serial.println(
          "WiFi recovery session expired; access point is shutting down.");
      setupServer.stop();
      setupDns.stop();
      WiFi.softAPdisconnect(true);
      setupPortalActive = false;
      configServerStarted = false;
      setupPortalCsrfToken = "";
      while (true) {
        handleFactoryResetButton();
        handlePendingFirmwareHealth();
        delay(100);
      }
    }
    setupDns.processNextRequest();
    setupServer.handleClient();
    handlePendingFirmwareHealth();
    delay(2);
  }
}

String jsonEscape(String value) {
  String escaped = "";
  for (size_t i = 0; i < value.length(); i++) {
    const char c = value[i];
    if (c == '\\' || c == '"') {
      escaped += '\\';
      escaped += c;
    } else if (c == '\n') {
      escaped += "\\n";
    } else if (c == '\r') {
      escaped += "\\r";
    } else {
      escaped += c;
    }
  }
  return escaped;
}

int64_t currentEpochMillis() {
  const time_t now = time(nullptr);
  if (now < 1700000000) {
    return 0;
  }
  return static_cast<int64_t>(now) * 1000;
}

void resetAudioSession() {
  audioSessionActive = false;
  audioDiscontinuityPending = false;
  audioSequence = 0;
  activeAudioSessionId = "";
  activeAudioScanId = "";
}

String base64UrlEncode(const uint8_t *bytes, size_t length) {
  if (bytes == nullptr || length == 0) {
    return "";
  }
  unsigned char encoded[96];
  size_t encodedLength = 0;
  if (mbedtls_base64_encode(encoded, sizeof(encoded), &encodedLength, bytes,
                            length) != 0) {
    return "";
  }
  String value;
  value.reserve(encodedLength);
  for (size_t index = 0; index < encodedLength; ++index) {
    const char current = static_cast<char>(encoded[index]);
    if (current == '=') {
      break;
    }
    value += current == '+' ? '-' : current == '/' ? '_' : current;
  }
  return value;
}

bool base64UrlDecode(const String &value, uint8_t *output,
                     size_t outputCapacity, size_t &outputLength) {
  outputLength = 0;
  if (value.length() == 0 || output == nullptr || outputCapacity == 0) {
    return false;
  }
  String normalized = value;
  normalized.replace('-', '+');
  normalized.replace('_', '/');
  while (normalized.length() % 4 != 0) normalized += '=';
  return mbedtls_base64_decode(
             output, outputCapacity, &outputLength,
             reinterpret_cast<const unsigned char *>(normalized.c_str()),
             normalized.length()) == 0;
}

bool deriveRotationWrapKey(const char *sessionSecret, uint8_t output[32]) {
  if (sessionSecret == nullptr || strlen(sessionSecret) < 16 ||
      cloudAuthChallengeId.length() == 0 || cloudAuthNonce.length() == 0 ||
      cloudSessionId.length() == 0 || strlen(deviceId) == 0) {
    return false;
  }
  uint8_t verificationKey[32];
  if (mbedtls_sha256_ret(
          reinterpret_cast<const unsigned char *>(sessionSecret),
          strlen(sessionSecret), verificationKey, 0) != 0) {
    return false;
  }
  String binding = "smart-health-device-rotation-wrap-v1\n";
  binding += cloudAuthChallengeId;
  binding += "\n";
  binding += cloudAuthNonce;
  binding += "\n";
  binding += deviceId;
  binding += "\n";
  binding += cloudSessionId;
  const mbedtls_md_info_t *sha256 =
      mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  const int result = sha256 == nullptr
                         ? -1
                         : mbedtls_md_hmac(
                               sha256, verificationKey,
                               sizeof(verificationKey),
                               reinterpret_cast<const unsigned char *>(
                                   binding.c_str()),
                               binding.length(), output);
  memset(verificationKey, 0, sizeof(verificationKey));
  return result == 0;
}

bool decryptRotationCredential(const shcare::CommandEnvelope &command,
                               char output[96]) {
  const String rotationId(command.payloadString("rotationId").c_str());
  const String expiresAt(command.payloadString("expiresAt").c_str());
  const String algorithm(command.payloadString("wrapAlgorithm").c_str());
  const String keyDerivation(
      command.payloadString("wrapKeyDerivation").c_str());
  const String ivValue(command.payloadString("wrapIv").c_str());
  const String ciphertextValue(
      command.payloadString("wrapCiphertext").c_str());
  const String tagValue(command.payloadString("wrapTag").c_str());
  if (rotationId.length() < 8 || rotationId.length() > 128 ||
      rotationId != String(command.correlationId.c_str()) ||
      expiresAt != String(command.expiresAt.c_str()) ||
      algorithm != "A256GCM" ||
      keyDerivation != "HMAC-SHA256/device-session-v1") {
    return false;
  }

  uint8_t iv[12];
  uint8_t tag[16];
  uint8_t ciphertext[95];
  uint8_t plaintext[96];
  uint8_t wrapKey[32];
  size_t ivLength = 0;
  size_t tagLength = 0;
  size_t ciphertextLength = 0;
  const char *sessionSecret = authUsingPendingCredential
                                  ? pendingDeviceSecret
                                  : deviceSecret;
  bool valid =
      base64UrlDecode(ivValue, iv, sizeof(iv), ivLength) &&
      base64UrlDecode(tagValue, tag, sizeof(tag), tagLength) &&
      base64UrlDecode(ciphertextValue, ciphertext, sizeof(ciphertext),
                      ciphertextLength) &&
      ivLength == sizeof(iv) && tagLength == sizeof(tag) &&
      ciphertextLength >= 32 && ciphertextLength < sizeof(plaintext) &&
      deriveRotationWrapKey(sessionSecret, wrapKey);
  if (!valid) {
    memset(wrapKey, 0, sizeof(wrapKey));
    return false;
  }

  String aad = "smart-health-device-rotation-aad-v1\n";
  aad += rotationId;
  aad += "\n";
  aad += deviceId;
  aad += "\n";
  aad += cloudSessionId;
  mbedtls_gcm_context gcm;
  mbedtls_gcm_init(&gcm);
  int result = mbedtls_gcm_setkey(&gcm, MBEDTLS_CIPHER_ID_AES,
                                  wrapKey, 256);
  if (result == 0) {
    result = mbedtls_gcm_auth_decrypt(
        &gcm, ciphertextLength, iv, ivLength,
        reinterpret_cast<const unsigned char *>(aad.c_str()), aad.length(),
        tag, tagLength, ciphertext, plaintext);
  }
  mbedtls_gcm_free(&gcm);
  memset(wrapKey, 0, sizeof(wrapKey));
  if (result != 0) {
    memset(plaintext, 0, sizeof(plaintext));
    return false;
  }
  for (size_t index = 0; index < ciphertextLength; ++index) {
    const uint8_t character = plaintext[index];
    const bool allowed =
        (character >= 'A' && character <= 'Z') ||
        (character >= 'a' && character <= 'z') ||
        (character >= '0' && character <= '9') ||
        character == '_' || character == '-';
    if (!allowed) {
      memset(plaintext, 0, sizeof(plaintext));
      return false;
    }
  }
  memcpy(output, plaintext, ciphertextLength);
  output[ciphertextLength] = '\0';
  memset(plaintext, 0, sizeof(plaintext));
  return true;
}

String buildDeviceAuthProof(const String &challengeId, const String &nonce,
                            const char *authSecret) {
  if (challengeId.length() == 0 || nonce.length() == 0 ||
      strlen(deviceId) == 0 || authSecret == nullptr ||
      strlen(authSecret) == 0) {
    return "";
  }

  uint8_t verificationKey[32];
  if (mbedtls_sha256_ret(
          reinterpret_cast<const unsigned char *>(authSecret),
          strlen(authSecret), verificationKey, 0) != 0) {
    return "";
  }

  String canonical = "smart-health-device-auth-v1\n";
  canonical += challengeId;
  canonical += "\n";
  canonical += nonce;
  canonical += "\n";
  canonical += deviceId;

  const mbedtls_md_info_t *sha256 =
      mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  uint8_t proof[32];
  if (sha256 == nullptr ||
      mbedtls_md_hmac(
          sha256, verificationKey, sizeof(verificationKey),
          reinterpret_cast<const unsigned char *>(canonical.c_str()),
          canonical.length(), proof) != 0) {
    memset(verificationKey, 0, sizeof(verificationKey));
    return "";
  }
  memset(verificationKey, 0, sizeof(verificationKey));
  return base64UrlEncode(proof, sizeof(proof));
}

String cloudWsUrl() {
  String url = backendUseTls ? "wss://" : "ws://";
  url += backendHost;
  url += ":";
  url += String(backendPort);
  url += "/esp";
  return url;
}

bool sendCloudTelemetry(const char *type);

String cloudTelemetryJson(const char *type) {
  String json = "{";
  json += "\"type\":\"";
  json += type;
  json += "\",";
  json += "\"deviceId\":\"";
  json += jsonEscape(deviceId);
  json += "\",";
  json += "\"protocolVersion\":";
  json += String(shcare::kDeviceProtocolVersion);
  json += ",";
  json += "\"name\":\"";
  json += jsonEscape(deviceName);
  json += "\",";
  json += "\"firmwareVersion\":\"";
  json += jsonEscape(FIRMWARE_VERSION);
  json += "\",";
  json += "\"status\":\"";
  json += deviceLocked ? "revoked" : "connected";
  json += "\",";
  json += "\"connectionMethod\":\"";
  json += shcare::cloudTransportLabel(cloudSecurityDecision.transport);
  json += "\",";
  json += "\"audioTransport\":\"";
  json += activeAudioTransportLabel();
  json += "\",";
  json += "\"audioStatus\":\"";
  json += audioSessionActive ? "recording" : (i2sReady ? "ready" : "degraded");
  json += "\",";
  json += "\"uptimeMs\":";
  json += String(millis());
  json += ",";
  json += "\"resetReason\":\"";
  json += resetReasonLabel();
  json += "\",";
  json += "\"freeHeapBytes\":";
  json += String(ESP.getFreeHeap());
  json += ",";
  json += "\"i2sStatus\":\"";
  json += i2sReady ? "ready" : "degraded";
  json += "\",";
  json += "\"audioPacketsSent\":";
  json += String(wsPacketsSent + udpPacketsSent);
  json += ",";
  json += "\"audioPacketsDropped\":";
  json += String(wsSendFailures + udpSendFailures);
  json += ",";
  json += "\"audioSendFailures\":";
  json += String(wsSendFailures + udpSendFailures);
  json += ",";
  json += "\"lastCommandId\":\"";
  json += jsonEscape(lastCommandId.c_str());
  json += "\",";
  json += "\"lastCommandState\":\"";
  json += jsonEscape(lastCommandState.c_str());
  json += "\",";
  json += "\"lastCommandCode\":\"";
  json += jsonEscape(lastCommandCode.c_str());
  json += "\",";
  json += "\"lastCommandUptimeMs\":";
  json += String(lastCommandUptimeMs);
  json += ",";
  json += "\"otaStatus\":\"";
  if (lastOtaStatus.length() > 0) {
    json += jsonEscape(lastOtaStatus.c_str());
  } else if (pendingFirmwareVerification) {
    json += "pending_verification";
  } else if (otaRollbackAttempted) {
    json += "rolling_back";
  }
  json += "\",";
  json += "\"wifiSsid\":\"";
  json += jsonEscape(wifiSsid);
  json += "\",";
  json += "\"wifiRssi\":";
  json += String(WiFi.RSSI());
  json += ",";
  json += "\"ipAddress\":\"";
  json += WiFi.localIP().toString();
  json += "\",";
  json += "\"backendHost\":\"";
  json += jsonEscape(backendHost);
  json += "\",";
  json += "\"backendPort\":";
  json += String(backendPort);
  json += "}";
  return json;
}

void rejectCloudTransport(const char *code) {
  JsonDocument response;
  response["type"] = "auth.client_error";
  response["protocolVersion"] = shcare::kDeviceProtocolVersion;
  response["code"] = code == nullptr ? "INVALID_CHALLENGE" : code;
  String json;
  serializeJson(response, json);
  if (cloudTransportConnected) {
    cloudSocket.send(json);
    delay(25);
    cloudSocket.close();
  }
  cloudConnected = false;
  cloudTransportConnected = false;
  cloudSessionId = "";
  cloudAuthHandshake.reset();
  authenticatedProductionHeartbeatObserved = false;
  resetAudioSession();
}

void beginPendingFirmwareHealthCheck() {
  const esp_partition_t *runningPartition = esp_ota_get_running_partition();
  esp_ota_img_states_t state = ESP_OTA_IMG_UNDEFINED;
  if (runningPartition != nullptr &&
      esp_ota_get_state_partition(runningPartition, &state) == ESP_OK &&
      state == ESP_OTA_IMG_PENDING_VERIFY) {
    pendingFirmwareVerification = true;
    pendingFirmwareBootStartedMs = millis();
    pendingFirmwareLastStatusMs = pendingFirmwareBootStartedMs;
    otaRollbackAttempted = false;
    Serial.print("OTA image pending boot-health confirmation on partition ");
    Serial.println(runningPartition->label);
  }
}

bool pendingFirmwareHealthReady() {
  shcare::OtaBootHealthInput health;
  health.pendingVerification = pendingFirmwareVerification;
  health.i2sReady = i2sReady;
  health.stabilityWindowElapsed =
      millis() - pendingFirmwareBootStartedMs >= OTA_BOOT_STABILITY_MS;
  health.productionProfile = isProductionProfile();
  health.runtimeSecurityReady = cloudSecurityDecision.ready();
  health.transport = cloudSecurityDecision.transport;
  health.authenticated = cloudConnected;
  health.authenticatedHeartbeatObserved =
      authenticatedProductionHeartbeatObserved;
  health.recoveryPortalActive = setupPortalActive;
  return shcare::otaBootHealthReady(health);
}

void confirmPendingFirmwareIfHealthy() {
  if (!pendingFirmwareHealthReady()) {
    return;
  }
  const esp_partition_t *runningPartition = esp_ota_get_running_partition();
  esp_ota_img_states_t state = ESP_OTA_IMG_UNDEFINED;
  if (runningPartition != nullptr &&
      esp_ota_get_state_partition(runningPartition, &state) == ESP_OK &&
      state == ESP_OTA_IMG_PENDING_VERIFY) {
    const esp_err_t result = esp_ota_mark_app_valid_cancel_rollback();
    if (result == ESP_OK) {
      pendingFirmwareVerification = false;
      sendCloudEvent("ota.confirmed", "confirmed",
                     "boot health confirmed; rollback cancelled");
      Serial.println("OTA boot health confirmed; rollback cancelled.");
      return;
    }
    Serial.print("OTA boot confirmation failed: ");
    Serial.println(esp_err_to_name(result));
  }
}

void handlePendingFirmwareHealth() {
  if (!pendingFirmwareVerification) {
    return;
  }

  const esp_partition_t *runningPartition = esp_ota_get_running_partition();
  esp_ota_img_states_t state = ESP_OTA_IMG_UNDEFINED;
  if (runningPartition != nullptr &&
      esp_ota_get_state_partition(runningPartition, &state) == ESP_OK &&
      state != ESP_OTA_IMG_PENDING_VERIFY) {
    pendingFirmwareVerification = false;
    Serial.println("OTA boot-health check stopped: image is no longer pending verification.");
    return;
  }

  confirmPendingFirmwareIfHealthy();
  if (!pendingFirmwareVerification) {
    return;
  }

  const unsigned long elapsed = millis() - pendingFirmwareBootStartedMs;
  if (elapsed < OTA_BOOT_HEALTH_TIMEOUT_MS) {
    if (millis() - pendingFirmwareLastStatusMs >= 15000) {
      pendingFirmwareLastStatusMs = millis();
      Serial.println("OTA boot health still pending.");
    }
    return;
  }
  if (otaRollbackAttempted) {
    return;
  }
  otaRollbackAttempted = true;
  Serial.println("OTA boot health timed out; rolling back to the last valid slot.");
  sendCloudEvent("ota.rollback", "rolling_back",
                 "boot health timeout; reverting firmware");
  delay(100);
  if (!esp_ota_check_rollback_is_possible()) {
    Serial.println("OTA rollback unavailable: no valid alternate app slot.");
    otaRollbackAttempted = false;
    pendingFirmwareLastStatusMs = millis();
    return;
  }
  const esp_err_t result = esp_ota_mark_app_invalid_rollback_and_reboot();
  Serial.print("OTA rollback request failed: ");
  Serial.println(esp_err_to_name(result));
  otaRollbackAttempted = false;
}

void answerCloudAuthChallenge(const String &message) {
  JsonDocument challenge;
  if (deserializeJson(challenge, message)) {
    rejectCloudTransport("INVALID_CHALLENGE");
    return;
  }
  const int protocolVersion = challenge["protocolVersion"] | 0;
  const String challengeId = challenge["challengeId"] | "";
  const String nonce = challenge["nonce"] | "";
  if (protocolVersion != shcare::kDeviceProtocolVersion ||
      challengeId.length() < 8 || challengeId.length() > 128 ||
      nonce.length() < 16 || nonce.length() > 128) {
    rejectCloudTransport(protocolVersion == shcare::kDeviceProtocolVersion
                             ? "INVALID_CHALLENGE"
                             : "UNSUPPORTED_PROTOCOL");
    return;
  }

  const char *authSecret = pendingCredentialRotationReady
                               ? pendingDeviceSecret
                               : deviceSecret;
  authUsingPendingCredential = pendingCredentialRotationReady;
  const String proof = buildDeviceAuthProof(challengeId, nonce, authSecret);
  if (proof.length() == 0) {
    rejectCloudTransport("MISSING_DEVICE_CREDENTIAL");
    return;
  }
  if (!cloudAuthHandshake.beginChallenge(
          std::string(challengeId.c_str()))) {
    rejectCloudTransport("AUTH_CHALLENGE_OVERLAP");
    return;
  }
  cloudAuthChallengeId = challengeId;
  cloudAuthNonce = nonce;

  JsonDocument response;
  response["type"] = "auth.response";
  response["protocolVersion"] = shcare::kDeviceProtocolVersion;
  response["deviceId"] = deviceId;
  response["challengeId"] = challengeId;
  response["proof"] = proof;
  JsonDocument telemetry;
  if (!deserializeJson(telemetry, cloudTelemetryJson("telemetry"))) {
    response["telemetry"] = telemetry.as<JsonObjectConst>();
  }
  String json;
  serializeJson(response, json);
  if (!cloudSocket.send(json)) {
    rejectCloudTransport("AUTH_RESPONSE_SEND_FAILED");
  }
}

void handleCloudAuthMessage(const String &type, const String &message) {
  if (type == "auth.challenge") {
    answerCloudAuthChallenge(message);
    return;
  }

  JsonDocument document;
  if (deserializeJson(document, message)) {
    rejectCloudTransport("INVALID_AUTH_MESSAGE");
    return;
  }

  if (type == "auth.accepted") {
    const shcare::AuthAcceptedParseResult accepted =
        shcare::parseAuthAccepted(std::string(message.c_str()));
    if (!accepted.ok()) {
      rejectCloudTransport(accepted.stableCode);
      return;
    }
    const shcare::AuthAcceptanceCode acceptance = cloudAuthHandshake.accept(
        accepted.message.challengeId, std::string(deviceId),
        accepted.message.deviceId, accepted.message.sessionId);
    if (acceptance != shcare::AuthAcceptanceCode::Accepted) {
      const char *code = "AUTH_BINDING_INVALID";
      if (acceptance == shcare::AuthAcceptanceCode::NoOutstandingChallenge) {
        code = "AUTH_CHALLENGE_NOT_OUTSTANDING";
      } else if (acceptance ==
                 shcare::AuthAcceptanceCode::ChallengeMismatch) {
        code = "AUTH_CHALLENGE_MISMATCH";
      } else if (acceptance == shcare::AuthAcceptanceCode::DeviceMismatch) {
        code = "AUTH_IDENTITY_MISMATCH";
      } else if (acceptance == shcare::AuthAcceptanceCode::InvalidSession) {
        code = "AUTH_SESSION_INVALID";
      }
      rejectCloudTransport(code);
      return;
    }
    cloudSessionId = String(cloudAuthHandshake.sessionId().c_str());
    if (!shcare::authAcceptanceMatchesCredentialAttempt(
            accepted.message, authUsingPendingCredential,
            std::string(pendingCredentialRotationId.c_str()))) {
      rejectCloudTransport("CREDENTIAL_SLOT_BINDING_INVALID");
      return;
    }
    if (authUsingPendingCredential) {
      if (!commitPendingCredentialRotation()) {
        // The candidate remains in the commit-marked NVS slot and will still
        // be used on the next reconnect; never fall back after the backend has
        // authenticated it successfully.
        Serial.println(
            "Credential rotation confirmed; canonical NVS commit will retry on reconnect.");
      } else {
        Serial.println("Credential rotation confirmed and committed.");
      }
    }
    resetAudioSession();
    cloudConnected = true;
    cloudReconnectFailureCount = 0;
    cloudReconnectDelayMs = CLOUD_RECONNECT_BASE_MS;
    lastCloudConnectAttemptMs = millis();
    Serial.print("Cloud device authentication accepted over ");
    Serial.println(
        shcare::cloudTransportLabel(cloudSecurityDecision.transport));
    sendCloudTelemetry("telemetry");
    confirmPendingFirmwareIfHealthy();
    return;
  }

  if (type == "auth.rejected") {
    const String code = document["code"] | "INVALID_CREDENTIALS";
    Serial.print("Cloud device authentication rejected: ");
    Serial.println(code);
    if (authUsingPendingCredential) {
      clearPendingCredentialRotationState(true);
      Serial.println(
          "Pending credential rejected; restored the previous credential.");
    }
    cloudConnected = false;
    cloudSessionId = "";
    cloudAuthHandshake.reset();
    authenticatedProductionHeartbeatObserved = false;
    resetAudioSession();
    cloudSocket.close();
  }
}

void sendCommandState(const shcare::CommandEnvelope &command,
                      const char *state, const char *code,
                      const char *detail = "") {
  lastCommandId = String(command.id.c_str());
  lastCommandState = state == nullptr ? "failed" : state;
  lastCommandCode = code == nullptr ? "COMMAND_FAILED" : code;
  lastCommandUptimeMs = millis();
  if (!cloudConnected) {
    return;
  }
  const std::string json = shcare::buildCommandStateJson(
      command.id, command.correlationId, state == nullptr ? "failed" : state,
      code == nullptr ? "COMMAND_FAILED" : code,
      detail == nullptr ? "" : detail);
  cloudSocket.send(String(json.c_str()));
}

void sendCloudEvent(const char *type, const char *status, const char *detail) {
  if (type != nullptr && String(type).startsWith("ota.")) {
    lastOtaStatus = status == nullptr ? "" : status;
  }
  if (!cloudConnected) {
    return;
  }
  String json = "{";
  json += "\"type\":\"";
  json += type;
  json += "\",\"deviceId\":\"";
  json += jsonEscape(deviceId);
  json += "\"";
  if (status != NULL && strlen(status) > 0) {
    json += ",\"otaStatus\":\"";
    json += jsonEscape(status);
    json += "\"";
  }
  if (detail != NULL && strlen(detail) > 0) {
    json += ",\"detail\":\"";
    json += jsonEscape(detail);
    json += "\"";
  }
  json += "}";
  cloudSocket.send(json);
}

bool sendCloudTelemetry(const char *type = "telemetry") {
  if (!cloudConnected) {
    return false;
  }
  if (!cloudSocket.send(cloudTelemetryJson(type))) {
    return false;
  }
  lastCloudTelemetryMs = millis();
  if (isProductionProfile() && cloudSecurityDecision.ready() &&
      cloudSecurityDecision.transport == shcare::CloudTransport::Wss) {
    authenticatedProductionHeartbeatObserved = true;
  }
  return true;
}

String sha256Hex(const uint8_t digest[32]) {
  const char *hex = "0123456789abcdef";
  String value = "";
  value.reserve(64);
  for (int i = 0; i < 32; i++) {
    value += hex[(digest[i] >> 4) & 0x0F];
    value += hex[digest[i] & 0x0F];
  }
  return value;
}

bool decodeBase64Url(const String &value, uint8_t *output,
                     size_t outputCapacity, size_t &outputLength) {
  if (value.length() == 0 || output == nullptr || outputCapacity == 0) {
    return false;
  }
  String normalized = value;
  normalized.replace('-', '+');
  normalized.replace('_', '/');
  while (normalized.length() % 4 != 0) {
    normalized += '=';
  }
  return mbedtls_base64_decode(
             output, outputCapacity, &outputLength,
             reinterpret_cast<const unsigned char *>(normalized.c_str()),
             normalized.length()) == 0;
}

bool verifyOtaSignature(const uint8_t digest[32], const String &signature) {
  if (strlen(OTA_PUBLIC_KEY_PEM) == 0 || signature.length() == 0) {
    return false;
  }
  uint8_t decodedSignature[512];
  size_t decodedLength = 0;
  if (!decodeBase64Url(signature, decodedSignature, sizeof(decodedSignature),
                       decodedLength)) {
    return false;
  }

  mbedtls_pk_context publicKey;
  mbedtls_pk_init(&publicKey);
  const int parseResult = mbedtls_pk_parse_public_key(
      &publicKey, reinterpret_cast<const unsigned char *>(OTA_PUBLIC_KEY_PEM),
      strlen(OTA_PUBLIC_KEY_PEM) + 1);
  const int verifyResult =
      parseResult == 0
          ? mbedtls_pk_verify(&publicKey, MBEDTLS_MD_SHA256, digest, 32,
                              decodedSignature, decodedLength)
          : parseResult;
  mbedtls_pk_free(&publicKey);
  memset(decodedSignature, 0, sizeof(decodedSignature));
  return verifyResult == 0;
}

bool sha256Buffer(const uint8_t *data, size_t length, uint8_t digest[32]) {
  if (data == nullptr || length == 0 || digest == nullptr) {
    return false;
  }
  return mbedtls_sha256_ret(data, length, digest, 0) == 0;
}

bool performCloudOta(const shcare::OtaManifest &manifest,
                     String &failureCode) {
  const String url(manifest.url.c_str());
  const String version(manifest.firmwareVersion.c_str());
  const String signature(manifest.signature.c_str());
  String expectedChecksum(manifest.checksum.c_str());
  expectedChecksum.toLowerCase();
  failureCode = "OTA_FAILED";
  if (!url.startsWith("https://")) {
    failureCode = "OTA_HTTPS_REQUIRED";
    sendCloudEvent("ota.failed", "failed", "https firmware url required");
    return false;
  }
  if (expectedChecksum.length() != 64) {
    failureCode = "OTA_SHA256_REQUIRED";
    sendCloudEvent("ota.failed", "failed", "sha256 checksum required");
    return false;
  }
  if (signature.length() == 0 || strlen(OTA_PUBLIC_KEY_PEM) == 0) {
    failureCode = "OTA_TRUST_ANCHOR_MISSING";
    sendCloudEvent("ota.failed", "failed", "signed firmware required");
    return false;
  }
  if (strlen(OTA_CA_CERT) == 0) {
    failureCode = "OTA_CA_CERT_REQUIRED";
    sendCloudEvent("ota.failed", "failed", "ota ca certificate missing");
    return false;
  }

  const esp_partition_t *runningPartition = esp_ota_get_running_partition();
  const esp_partition_t *updatePartition =
      esp_ota_get_next_update_partition(nullptr);
  const uint64_t updatePartitionEnd =
      updatePartition == nullptr
          ? 0
          : static_cast<uint64_t>(updatePartition->address) +
                updatePartition->size;
  const bool updatePartitionIsOtaApp =
      updatePartition != nullptr && updatePartition != runningPartition &&
      updatePartition->type == ESP_PARTITION_TYPE_APP &&
      updatePartition->subtype >= ESP_PARTITION_SUBTYPE_APP_OTA_MIN &&
      updatePartition->subtype < ESP_PARTITION_SUBTYPE_APP_OTA_MAX &&
      updatePartitionEnd <= ESP.getFlashChipSize();
  if (esp_ota_get_app_partition_count() < 2 || !updatePartitionIsOtaApp) {
    failureCode = "OTA_AB_PARTITION_REQUIRED";
    sendCloudEvent("ota.failed", "failed",
                   "rollback-capable a/b app partitions required");
    return false;
  }

  Serial.println("Starting verified cloud OTA download.");
  sendCloudEvent("ota.downloading", "downloading", "download started");

  HTTPClient http;
  WiFiClientSecure secureClient;
  secureClient.setCACert(OTA_CA_CERT);
  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
  http.setRedirectLimit(3);
  http.setConnectTimeout(10000);
  http.setTimeout(15000);
  const bool began = http.begin(secureClient, url);

  if (!began) {
    failureCode = "OTA_DOWNLOAD_OPEN_FAILED";
    sendCloudEvent("ota.failed", "failed", "cannot open firmware url");
    return false;
  }

  const int httpCode = http.GET();
  if (httpCode != HTTP_CODE_OK) {
    http.end();
    failureCode = "OTA_DOWNLOAD_HTTP_FAILED";
    sendCloudEvent("ota.failed", "failed", "firmware download http error");
    return false;
  }

  const int totalSize = http.getSize();
  if (totalSize <= 0 ||
      static_cast<size_t>(totalSize) > updatePartition->size) {
    http.end();
    failureCode = "OTA_IMAGE_SIZE_INVALID";
    sendCloudEvent("ota.failed", "failed",
                   "firmware content length missing or too large");
    return false;
  }

  bool audioPaused = false;
  if (i2sReady) {
    i2s_stop(MIC_I2S_PORT);
    audioPaused = true;
  }

  auto failOta = [&](const char *code, const char *detail, bool abortUpdate) {
    failureCode = code;
    if (abortUpdate) {
      Update.abort();
    }
    http.end();
    if (audioPaused) {
      i2s_start(MIC_I2S_PORT);
      audioPaused = false;
    }
    sendCloudEvent("ota.failed", "failed", detail);
    return false;
  };

  if (!Update.begin(static_cast<size_t>(totalSize), U_FLASH)) {
    return failOta("OTA_FLASH_BEGIN_FAILED", "cannot begin update", false);
  }

  mbedtls_sha256_context shaContext;
  mbedtls_sha256_init(&shaContext);
  if (mbedtls_sha256_starts_ret(&shaContext, 0) != 0) {
    mbedtls_sha256_free(&shaContext);
    return failOta("OTA_SHA256_INIT_FAILED", "sha256 initialization failed",
                   true);
  }

  WiFiClient *stream = http.getStreamPtr();
  uint8_t buffer[1024];
  size_t downloaded = 0;
  esp_image_header_t imageHeader = {};
  size_t imageHeaderBytes = 0;
  unsigned long lastProgressMs = 0;
  unsigned long lastReadMs = millis();

  while (http.connected() && downloaded < static_cast<size_t>(totalSize)) {
    const size_t available = stream->available();
    if (available > 0) {
      const size_t remaining = static_cast<size_t>(totalSize) - downloaded;
      const size_t readCapacity = min(min(available, sizeof(buffer)), remaining);
      const int readBytes = stream->readBytes(buffer, readCapacity);
      if (readBytes <= 0) {
        break;
      }
      lastReadMs = millis();
      if (imageHeaderBytes < sizeof(imageHeader)) {
        const size_t headerBytes =
            min(static_cast<size_t>(readBytes),
                sizeof(imageHeader) - imageHeaderBytes);
        memcpy(reinterpret_cast<uint8_t *>(&imageHeader) + imageHeaderBytes,
               buffer, headerBytes);
        imageHeaderBytes += headerBytes;
      }
      if (Update.write(buffer, readBytes) != (size_t)readBytes) {
        mbedtls_sha256_free(&shaContext);
        return failOta("OTA_FLASH_WRITE_FAILED", "flash write failed", true);
      }
      if (mbedtls_sha256_update_ret(&shaContext, buffer, readBytes) != 0) {
        mbedtls_sha256_free(&shaContext);
        return failOta("OTA_SHA256_UPDATE_FAILED", "sha256 update failed",
                       true);
      }
      downloaded += static_cast<size_t>(readBytes);

      if (millis() - lastProgressMs > 1500) {
        lastProgressMs = millis();
        sendCloudEvent("ota.downloading", "downloading", "download progress");
      }
    } else {
      if (millis() - lastReadMs > 15000) {
        mbedtls_sha256_free(&shaContext);
        return failOta("OTA_DOWNLOAD_TIMEOUT", "download timeout", true);
      }
      delay(5);
      cloudSocket.poll();
    }
  }

  uint8_t digest[32];
  const int finishResult = mbedtls_sha256_finish_ret(&shaContext, digest);
  mbedtls_sha256_free(&shaContext);
  if (finishResult != 0) {
    return failOta("OTA_SHA256_FINAL_FAILED", "sha256 finalization failed",
                   true);
  }
  if (downloaded != static_cast<size_t>(totalSize)) {
    memset(digest, 0, sizeof(digest));
    return failOta("OTA_DOWNLOAD_INCOMPLETE", "firmware download incomplete",
                   true);
  }
  if (imageHeaderBytes != sizeof(imageHeader) ||
      imageHeader.magic != ESP_IMAGE_HEADER_MAGIC ||
      imageHeader.chip_id != ESP_CHIP_ID_ESP32S3) {
    memset(digest, 0, sizeof(digest));
    return failOta("OTA_IMAGE_TARGET_MISMATCH",
                   "firmware image is not for ESP32-S3", true);
  }

  const String actualChecksum = sha256Hex(digest);
  if (expectedChecksum != actualChecksum) {
    memset(digest, 0, sizeof(digest));
    return failOta("OTA_SHA256_MISMATCH", "sha256 mismatch", true);
  }

  const std::string signatureMessage =
      shcare::buildOtaSignatureMessage(manifest);
  uint8_t signatureDigest[32];
  const bool signatureDigestReady = sha256Buffer(
      reinterpret_cast<const uint8_t *>(signatureMessage.data()),
      signatureMessage.size(), signatureDigest);
  memset(digest, 0, sizeof(digest));
  if (!signatureDigestReady ||
      !verifyOtaSignature(signatureDigest, signature)) {
    memset(signatureDigest, 0, sizeof(signatureDigest));
    return failOta("OTA_SIGNATURE_INVALID", "firmware signature invalid",
                   true);
  }
  memset(signatureDigest, 0, sizeof(signatureDigest));

  sendCloudEvent("ota.verifying", "verifying", "firmware downloaded");

  if (!Update.end()) {
    return failOta("OTA_FINALIZE_FAILED", "update finalize failed", false);
  }
  if (esp_ota_get_boot_partition() != updatePartition) {
    if (runningPartition != nullptr) {
      esp_ota_set_boot_partition(runningPartition);
    }
    return failOta("OTA_BOOT_PARTITION_MISMATCH",
                   "updated partition was not selected for boot", false);
  }

  http.end();

  sendCloudEvent("ota.rebooting", "rebooting", version.c_str());
  delay(1000);
  ESP.restart();
  return true;
}

void sendCommandProtocolError(const shcare::CommandParseResult &result) {
  if (!result.command.id.empty()) {
    sendCommandState(result.command,
                     result.code == shcare::CommandParseCode::Expired
                         ? "expired"
                         : "failed",
                     result.stableCode.c_str(), "command rejected");
    return;
  }
  if (!cloudConnected) {
    return;
  }
  JsonDocument response;
  response["protocolVersion"] = shcare::kDeviceProtocolVersion;
  response["type"] = "protocol.error";
  response["code"] = result.stableCode;
  String json;
  serializeJson(response, json);
  cloudSocket.send(json);
}

bool replayTerminalCommand(const shcare::CommandEnvelope &command) {
  shcare::CommandJournalEntry entry;
  if (!commandJournal.find(command.id, entry)) {
    return false;
  }
  if (entry.type != command.type ||
      entry.correlationId != command.correlationId) {
    sendCommandState(command, "failed", "COMMAND_ID_CONFLICT",
                     "command id was already used for another request");
    return true;
  }
  sendCommandState(command, entry.state.c_str(), entry.code.c_str(),
                   entry.result.c_str());
  return true;
}

void beginValidatedCommand(const shcare::CommandEnvelope &command,
                           bool rememberInMemory = true) {
  if (rememberInMemory) {
    recentCommandIds.rememberValidated(command.id, true);
  }
  sendCommandState(command, "acknowledged", "OK", "command authenticated");
  sendCommandState(command, "applying", "OK", "command applying");
}

void handleCloudCommand(const String &message) {
  const shcare::CommandParseResult result = shcare::parseCommandEnvelope(
      std::string(message.c_str()), currentEpochMillis());
  if (!result.ok()) {
    if (result.code == shcare::CommandParseCode::Expired &&
        replayTerminalCommand(result.command)) {
      return;
    }
    sendCommandProtocolError(result);
    return;
  }

  const shcare::CommandEnvelope &command = result.command;
  if (replayTerminalCommand(command)) {
    return;
  }
  if (recentCommandIds.seen(command.id)) {
    sendCommandState(command, "acknowledged", "DUPLICATE_COMMAND",
                     "command already received; no action repeated");
    return;
  }

  Serial.print("Cloud command accepted: ");
  Serial.print(command.type.c_str());
  Serial.print(" id=");
  Serial.println(command.id.c_str());

  if (command.type == "restart") {
    beginValidatedCommand(command);
    sendCommandState(command, "applying", "RESTARTING",
                     "device is restarting; applied requires reconnect");
    delay(500);
    ESP.restart();
    return;
  }

  if (command.type == "wifi.status") {
    beginValidatedCommand(command, false);
    const bool telemetrySent = sendCloudTelemetry("telemetry");
    const char *state = telemetrySent ? "applied" : "failed";
    const char *code = telemetrySent ? "OK" : "TELEMETRY_SEND_FAILED";
    const char *detail = telemetrySent ? "telemetry sent"
                                       : "telemetry transport failed";
    if (!persistTerminalCommand(command, state, code, detail)) {
      sendCommandState(command, "failed", "COMMAND_JOURNAL_WRITE_FAILED",
                       "terminal result was not durably stored");
      return;
    }
    sendCommandState(command, state, code, detail);
    return;
  }

  if (command.type == "device.lock" || command.type == "device.revoke") {
    beginValidatedCommand(command);
    deviceLocked = true;
    if (!saveRuntimeConfig()) {
      deviceLocked = false;
      sendCommandState(command, "failed", "DEVICE_LOCK_PERSIST_FAILED",
                       "device lock was not durably stored");
      return;
    }
    sendCommandState(command, "applied", "OK",
                     "device access disabled and persisted");
    delay(25);
    cloudSocket.close();
    cloudConnected = false;
    cloudTransportConnected = false;
    cloudSessionId = "";
    resetAudioSession();
    return;
  }

  if (command.type == "device.rotate_secret") {
    if (pendingCredentialRotationReady) {
      sendCommandState(command, "failed", "ROTATION_ALREADY_PENDING",
                       "another credential candidate is pending confirmation");
      return;
    }
    char candidateSecret[96] = "";
    if (!decryptRotationCredential(command, candidateSecret)) {
      memset(candidateSecret, 0, sizeof(candidateSecret));
      sendCommandState(command, "failed", "ROTATION_WRAP_INVALID",
                       "session-bound credential envelope rejected");
      return;
    }
    const String rotationId(command.payloadString("rotationId").c_str());
    const String expiresAt(command.payloadString("expiresAt").c_str());
    if (!persistPendingCredentialRotation(
            rotationId, candidateSecret, expiresAt, command.id,
            command.correlationId)) {
      memset(candidateSecret, 0, sizeof(candidateSecret));
      sendCommandState(command, "failed",
                       "ROTATION_CANDIDATE_PERSIST_FAILED",
                       "credential candidate was not durably stored");
      return;
    }
    memset(candidateSecret, 0, sizeof(candidateSecret));
    recentCommandIds.rememberValidated(command.id, true);
    sendCommandState(command, "acknowledged",
                     "ROTATION_CANDIDATE_PERSISTED",
                     "credential candidate persisted");
    sendCommandState(command, "applying", "ROTATION_RECONNECTING",
                     "reconnecting with candidate credential");
    delay(100);
    cloudReconnectFailureCount = 0;
    cloudReconnectDelayMs = 0;
    lastCloudConnectAttemptMs = 0;
    cloudSocket.close();
    cloudConnected = false;
    cloudTransportConnected = false;
    cloudSessionId = "";
    cloudAuthHandshake.reset();
    authenticatedProductionHeartbeatObserved = false;
    resetAudioSession();
    return;
  }

  if (command.type == "audio.session.start") {
    const int audioProtocolVersion =
        command.payloadInt("protocolVersion", 0);
    const String commandDeviceId(command.payloadString("deviceId").c_str());
    const String sessionId(command.payloadString("sessionId").c_str());
    const String scanId(command.payloadString("scanId").c_str());
    const String workspaceId(command.payloadString("workspaceId").c_str());
    const String patientId(command.payloadString("patientId").c_str());
    const String encoding(command.payloadString("encoding").c_str());
    const int sampleRate = command.payloadInt("sampleRate", 0);
    const int sampleCount = command.payloadInt("sampleCount", 0);
    if (!i2sReady) {
      sendCommandState(command, "failed", "AUDIO_NOT_READY",
                       "i2s capture is unavailable");
      return;
    }
    if (audioProtocolVersion != 2 || commandDeviceId != String(deviceId) ||
        workspaceId.length() == 0 || patientId.length() == 0 ||
        sessionId.length() == 0 ||
        sessionId.length() > shcare::kAudioV2MaxSessionIdBytes ||
        scanId.length() == 0 ||
        scanId.length() > shcare::kAudioV2MaxScanIdBytes ||
        sampleRate != SAMPLE_RATE || sampleCount != BUFFER_LEN ||
        encoding != "pcm_s16le") {
      sendCommandState(command, "failed", "INVALID_AUDIO_SESSION",
                       "audio session contract rejected");
      return;
    }
    beginValidatedCommand(command);
    activeAudioSessionId = sessionId;
    activeAudioScanId = scanId;
    audioSequence = 0;
    audioDiscontinuityPending = false;
    audioSessionActive = true;
    sendCommandState(command, "applied", "OK", "audio session ready");
    sendCloudTelemetry("telemetry");
    return;
  }

  if (command.type == "audio.session.stop") {
    const String sessionId(command.payloadString("sessionId").c_str());
    const String scanId(command.payloadString("scanId").c_str());
    if (!audioSessionActive || sessionId != activeAudioSessionId ||
        scanId != activeAudioScanId) {
      sendCommandState(command, "failed", "AUDIO_SESSION_MISMATCH",
                       "audio session is not active");
      return;
    }
    beginValidatedCommand(command);
    resetAudioSession();
    sendCommandState(command, "applied", "OK", "audio session stopped");
    sendCloudTelemetry("telemetry");
    return;
  }

  if (command.type == "wifi.update") {
    String ssid(command.payloadString("ssid").c_str());
    String password(command.payloadString("password").c_str());
    if (password.length() == 0) {
      password = String(command.payloadString("pass").c_str());
    }
    ssid.trim();
    if (ssid.length() == 0 || ssid.length() >= sizeof(wifiSsid) ||
        password.length() >= sizeof(wifiPass)) {
      sendCommandState(command, "failed", "INVALID_WIFI_CONFIG",
                       "ssid/password length invalid");
      return;
    }
    beginValidatedCommand(command);
    const String previousSsid = wifiSsid;
    const String previousPassword = wifiPass;
    copyConfigValue(wifiSsid, sizeof(wifiSsid), ssid);
    copyConfigValue(wifiPass, sizeof(wifiPass), password, false);
    if (!saveRuntimeConfig()) {
      copyConfigValue(wifiSsid, sizeof(wifiSsid), previousSsid);
      copyConfigValue(wifiPass, sizeof(wifiPass), previousPassword, false);
      sendCommandState(command, "failed", "WIFI_CONFIG_PERSIST_FAILED",
                       "wifi configuration was not durably stored");
      return;
    }
    sendCommandState(command, "applied", "OK",
                     "wifi configuration persisted; restarting");
    delay(500);
    ESP.restart();
    return;
  }

  if (command.type == "ota.update") {
    const shcare::OtaManifestValidation ota = shcare::validateOtaManifest(
        command, std::string(FIRMWARE_VERSION),
        shcare::kDeviceProtocolVersion);
    if (!ota.ok()) {
      sendCommandState(command, "failed", ota.stableCode.c_str(),
                       "ota manifest rejected");
      return;
    }

    beginValidatedCommand(command);
    String failureCode;
    const bool applied = performCloudOta(ota.manifest, failureCode);
    if (!applied) {
      sendCommandState(command, "failed", failureCode.c_str(),
                       "verified firmware update failed");
    }
    return;
  }
}

void handleCloudMessage(const String &message) {
  JsonDocument document;
  if (deserializeJson(document, message)) {
    rejectCloudTransport("INVALID_JSON");
    return;
  }
  const String type = document["type"] | "";
  if (type.startsWith("auth.")) {
    handleCloudAuthMessage(type, message);
    return;
  }
  if (!cloudConnected) {
    rejectCloudTransport("AUTH_REQUIRED");
    return;
  }
  const String messageDeviceId = document["deviceId"] | "";
  if (messageDeviceId.length() > 0 && messageDeviceId != String(deviceId)) {
    rejectCloudTransport("AUTH_IDENTITY_MISMATCH");
    return;
  }
  handleCloudCommand(message);
}

void setupCloudSocket() {
  cloudSecurityDecision = evaluateCloudSecurity();
  if (!cloudSecurityDecision.ready()) {
    Serial.print("Cloud control disabled: ");
    Serial.println(cloudSecurityDecision.stableCode);
    cloudConfigured = false;
    return;
  }
  if (cloudConfigured) {
    return;
  }
  if (cloudSecurityDecision.transport == shcare::CloudTransport::Wss) {
    cloudSocket.setCACert(BACKEND_CA_CERT);
  }
  cloudSocket.onMessage([](WebsocketsMessage message) {
    handleCloudMessage(message.data());
  });
  cloudSocket.onEvent([](WebsocketsEvent event, String data) {
    if (event == WebsocketsEvent::ConnectionOpened) {
      cloudTransportConnected = true;
      cloudConnected = false;
      cloudSessionId = "";
      cloudAuthHandshake.reset();
      authenticatedProductionHeartbeatObserved = false;
      Serial.print("Cloud transport connected over ");
      Serial.print(
          shcare::cloudTransportLabel(cloudSecurityDecision.transport));
      Serial.println("; awaiting challenge.");
    } else if (event == WebsocketsEvent::ConnectionClosed) {
      cloudTransportConnected = false;
      cloudConnected = false;
      cloudSessionId = "";
      cloudAuthHandshake.reset();
      authenticatedProductionHeartbeatObserved = false;
      resetAudioSession();
      Serial.println("Cloud transport disconnected.");
    } else if (event == WebsocketsEvent::GotPing) {
      Serial.println("Cloud transport ping.");
    } else if (event == WebsocketsEvent::GotPong) {
      Serial.println("Cloud transport pong.");
    }
  });
  cloudConfigured = true;
}

void connectCloudSocketIfNeeded() {
  if (!cloudConfigured || WiFi.status() != WL_CONNECTED || deviceLocked) {
    return;
  }
  if (cloudTransportConnected) {
    return;
  }
  const unsigned long nowMs = millis();
  if (nowMs - lastCloudConnectAttemptMs < cloudReconnectDelayMs) {
    return;
  }
  lastCloudConnectAttemptMs = nowMs;
  if (cloudReconnectFailureCount < 31U) {
    cloudReconnectFailureCount++;
  }
  cloudReconnectDelayMs = shcare::reconnectBackoffDelayMs(
      cloudReconnectFailureCount, CLOUD_RECONNECT_BASE_MS,
      CLOUD_RECONNECT_MAX_MS);
  const String url = cloudWsUrl();
  Serial.print("Connecting cloud control transport: ");
  Serial.println(url);
  cloudSocket.connect(url);
}

void handleCloudSocket() {
  if (!cloudConfigured) {
    return;
  }
  cloudSocket.poll();
  connectCloudSocketIfNeeded();
  if (cloudConnected && millis() - lastCloudTelemetryMs > CLOUD_TELEMETRY_INTERVAL_MS) {
    sendCloudTelemetry("telemetry");
  }
}

void sendAudioCloud(const int samplesRead) {
  if (samplesRead <= 0 || WiFi.status() != WL_CONNECTED || deviceLocked) {
    return;
  }

  if (cloudConnected) {
    if (!audioSessionActive) {
      return;
    }
    const int64_t timestampMs = currentEpochMillis();
    if (timestampMs <= 0) {
      wsSendFailures++;
      audioDiscontinuityPending = true;
      return;
    }
    uint8_t flags = audioSequence == 0 ? shcare::kAudioV2FlagStart : 0;
    if (audioDiscontinuityPending && audioSequence > 0) {
      flags |= shcare::kAudioV2FlagDiscontinuity;
    }
    const auto frame = shcare::buildAudioFrameV2(
        std::string(activeAudioSessionId.c_str()),
        std::string(activeAudioScanId.c_str()), audioSequence,
        static_cast<uint64_t>(timestampMs), pcmBuffer,
        static_cast<size_t>(samplesRead), flags, audioFrameBuffer,
        sizeof(audioFrameBuffer));
    if (!frame.ok()) {
      wsSendFailures++;
      resetAudioSession();
      sendCloudEvent("audio.failed", "failed", "audio v2 frame rejected");
      return;
    }
    if (cloudSocket.sendBinary((const char *)audioFrameBuffer,
                               frame.bytesWritten)) {
      wsPacketsSent++;
      audioDiscontinuityPending = false;
      if (audioSequence == UINT32_MAX) {
        resetAudioSession();
        sendCloudEvent("audio.failed", "failed", "audio sequence exhausted");
      } else {
        audioSequence++;
      }
      return;
    }
    wsSendFailures++;
    if (audioSequence > 0 && audioSequence < UINT32_MAX) {
      audioSequence++;
    }
    audioDiscontinuityPending = true;
    return;
  }

  if (cloudConfigured) wsSendFailures++;
  sendAudioUdp(samplesRead);
}

void startMdns() {
  if (mdnsReady) {
    return;
  }

  if (!MDNS.begin(deviceName)) {
    Serial.println("mDNS start failed.");
    return;
  }

  MDNS.addService("http", "tcp", 80);
  mdnsReady = true;
  Serial.print("mDNS config URL: http://");
  Serial.print(deviceName);
  Serial.println(".local");
}

void setupArduinoOta() {
  if (otaReady) {
    return;
  }

  if (SMART_HEALTH_ENABLE_LAN_OTA == 0) {
    return;
  }

  if (!hasOtaPassword()) {
    Serial.println("OTA disabled: set an OTA password with at least 8 characters.");
    return;
  }

  ArduinoOTA.setHostname(deviceName);
  ArduinoOTA.setPassword(otaPassword);
  ArduinoOTA.onStart([]() {
    Serial.println("ArduinoOTA update started.");
    if (i2sReady) {
      i2s_stop(MIC_I2S_PORT);
    }
  });
  ArduinoOTA.onEnd([]() { Serial.println("ArduinoOTA update finished."); });
  ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
    Serial.printf("ArduinoOTA progress: %u%%\r", (progress * 100) / total);
  });
  ArduinoOTA.onError([](ota_error_t error) {
    Serial.printf("ArduinoOTA error[%u]\n", error);
  });
  ArduinoOTA.begin();
  otaReady = true;

  Serial.print("ArduinoOTA ready: ");
  Serial.println(deviceName);
}

void startStationServices() {
  setupCloudSocket();
  connectCloudSocketIfNeeded();
  if (SMART_HEALTH_ENABLE_LAN_OTA != 0) {
    startMdns();
  }
  setupArduinoOta();
  Serial.println("Local admin server disabled; device is managed through Smart Health cloud.");
}

void handleDeviceServices() {
  handleFactoryResetButton();

  if (setupPortalActive && configServerStarted) {
    setupServer.handleClient();
  }

  if (otaReady) {
    ArduinoOTA.handle();
  }

  handleCloudSocket();
}

int16_t clamp16(int32_t value) {
  if (value > 32767) {
    clipCount++;
    return 32767;
  }

  if (value < -32768) {
    clipCount++;
    return -32768;
  }

  return (int16_t)value;
}

int16_t clamp16NoClipCount(int32_t value) {
  if (value > 32767) {
    return 32767;
  }

  if (value < -32768) {
    return -32768;
  }

  return (int16_t)value;
}

float softLimiter(float x) {
  x = limiterThreshold * tanhf(x / limiterThreshold);

  if (x > 32767.0f)
    x = 32767.0f;
  if (x < -32768.0f)
    x = -32768.0f;

  return x;
}

float applySoftNoiseFloor(float x) {
  const float magnitude = fabsf(x);

  if (magnitude <= noiseFloorStart) {
    return 0.0f;
  }

  if (magnitude < noiseFloorFull) {
    const float scale =
        (magnitude - noiseFloorStart) / (noiseFloorFull - noiseFloorStart);
    return x * scale;
  }

  return x;
}

float applySoftCompressor(float x) {
  const float magnitude = fabsf(x);
  const float envelopeAlpha = magnitude > compressorEnvelope
                                  ? compressorEnvelopeAttack
                                  : compressorEnvelopeRelease;
  compressorEnvelope += envelopeAlpha * (magnitude - compressorEnvelope);

  const float threshold = maxFloat(
      compressorThresholdMin, compressorNoise * compressorThresholdMultiplier);

  if (compressorActivity < 0.18f) {
    compressorNoise +=
        compressorNoiseAlpha * (compressorEnvelope - compressorNoise);
  }

  float targetActivity =
      (compressorEnvelope - threshold) / (threshold * compressorActivityKnee);
  if (targetActivity < 0.0f) {
    targetActivity = 0.0f;
  } else if (targetActivity > 1.0f) {
    targetActivity = 1.0f;
  }

  if (targetActivity > 0.45f) {
    compressorHoldCounter = compressorHoldSamples;
  } else if (compressorHoldCounter > 0) {
    compressorHoldCounter--;
    if (targetActivity < compressorHoldActivity) {
      targetActivity = compressorHoldActivity;
    }
  }

  const float activityAlpha = targetActivity > compressorActivity
                                  ? compressorGainAttack
                                  : compressorGainRelease;
  compressorActivity += activityAlpha * (targetActivity - compressorActivity);

  const float shapedActivity = compressorActivity * compressorActivity;

  const float targetGain = 1.0f + (compressorGainMax - 1.0f) * shapedActivity;
  const float gainAlpha = targetGain > compressorGain ? compressorGainAttack
                                                      : compressorGainRelease;
  compressorGain += gainAlpha * (targetGain - compressorGain);

  const float floorMix =
      compressorFloorLevel + (1.0f - compressorFloorLevel) * shapedActivity;

  return x * floorMix * compressorGain;
}

void setupHeartbeatFilters() {
  heartHighPass.setHighPass(HEART_LOW_CUT_HZ, FILTER_Q);
  heartHighPass2.setHighPass(HEART_LOW_CUT_HZ, FILTER_Q);
  humNotch50.setNotch(50.0f, HUM_NOTCH_Q);
  humNotch100.setNotch(100.0f, HUM_NOTCH_Q);
  heartLowPass1.setLowPass(HEART_HIGH_CUT_HZ, FILTER_Q);
  heartLowPass2.setLowPass(HEART_HIGH_CUT_HZ, FILTER_Q);

  Serial.print("Heartbeat listen band ready: ");
  Serial.print(HEART_LOW_CUT_HZ);
  Serial.print(" - ");
  Serial.print(HEART_HIGH_CUT_HZ);
  Serial.println(" Hz");
  if (ENABLE_HUM_NOTCH) {
    Serial.println(ENABLE_HUM_HARMONIC_NOTCH
                       ? "Hum notches ready: 50 Hz and 100 Hz"
                       : "Hum notch ready: 50 Hz");
  }
  if (ENABLE_EXTRA_LOW_PASS_STAGE) {
    heartLowPass3.setLowPass(HEART_HIGH_CUT_HZ, FILTER_Q);
  }

  metricHighPass.setHighPass(METRIC_LOW_CUT_HZ, FILTER_Q);
  metricLowPass1.setLowPass(METRIC_HIGH_CUT_HZ, FILTER_Q);
  metricLowPass2.setLowPass(METRIC_HIGH_CUT_HZ, FILTER_Q);

  Serial.print("Heartbeat metrics band ready: ");
  Serial.print(METRIC_LOW_CUT_HZ);
  Serial.print(" - ");
  Serial.print(METRIC_HIGH_CUT_HZ);
  Serial.println(" Hz");
  Serial.print("UDP stream mode: ");
  Serial.println(AUDIO_STREAM_MODE);
}

void setupWiFi() {
  if (!hasWiFiConfig()) {
    runSetupPortal("WiFi SSID is missing.");
  }
  if (setupPortalPhysicalGesture) {
    runSetupPortal("Physical setup gesture requested WiFi recovery.");
  }

  Serial.println();
  Serial.print("Connecting WiFi: ");
  Serial.println(wifiSsid);

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(wifiSsid, wifiPass);

  const unsigned long startedAt = millis();
  while (WiFi.status() != WL_CONNECTED &&
         millis() - startedAt < WIFI_CONNECT_TIMEOUT_MS) {
    delay(300);
    Serial.print(".");
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println();
    runSetupPortal("Cannot connect to the configured WiFi network.");
  }

  Serial.println();
  Serial.println("WiFi connected");
  cloudReconnectFailureCount = 0;
  cloudReconnectDelayMs = 0;
  lastCloudConnectAttemptMs = 0;
  Serial.print("ESP32 IP: ");
  Serial.println(WiFi.localIP());
  configTime(0, 0, "pool.ntp.org", "time.google.com");
}

void setupAudioUdp() {
  udpAudioReady = false;
  if (!shcare::developmentUdpAllowed(
          isProductionProfile(),
          SMART_HEALTH_ENABLE_DEVELOPMENT_UDP != 0)) {
    Serial.println(
        "UDP audio disabled: development profile and explicit opt-in are required.");
    return;
  }
  if (!hasUdpAudioConfig()) {
    Serial.println("UDP fallback disabled: audio host/port is missing.");
    return;
  }

  if (!audioServerIp.fromString(audioHost) &&
      WiFi.hostByName(audioHost, audioServerIp) != 1) {
    Serial.print("Cannot resolve audio server: ");
    Serial.println(audioHost);
    Serial.println("UDP fallback disabled; cloud control remains primary.");
    return;
  }

  Serial.print("UDP audio target: ");
  Serial.print(audioServerIp);
  Serial.print(":");
  Serial.println(audioUdpPort);
  udpAudioReady = true;
}

void sendAudioUdp(const int samplesRead) {
  if (!udpAudioReady || WiFi.status() != WL_CONNECTED || samplesRead <= 0) {
    return;
  }

  const size_t bytesToSend = samplesRead * sizeof(int16_t);

  audioUdp.beginPacket(audioServerIp, audioUdpPort);
  audioUdp.write((const uint8_t *)pcmBuffer, bytesToSend);

  if (audioUdp.endPacket() == 1) {
    udpPacketsSent++;
  } else {
    udpSendFailures++;
  }
}

void setupI2S() {
  i2sReady = false;
  const i2s_config_t i2s_config = {
      .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
      .sample_rate = SAMPLE_RATE,
      .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,
      .channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT,
      .communication_format = I2S_COMM_FORMAT_STAND_I2S,
      .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
      .dma_buf_count = 4,
      .dma_buf_len = BUFFER_LEN,
      .use_apll = false,
      .tx_desc_auto_clear = false,
      .fixed_mclk = 0};

  const i2s_pin_config_t pin_config = {.bck_io_num = I2S_SCK,
                                       .ws_io_num = I2S_WS,
                                       .data_out_num = I2S_PIN_NO_CHANGE,
                                       .data_in_num = I2S_SD};

  esp_err_t err;

  err = i2s_driver_install(MIC_I2S_PORT, &i2s_config, 0, NULL);
  if (err != ESP_OK) {
    Serial.print("i2s_driver_install failed: ");
    Serial.println(err);
    return;
  }

  err = i2s_set_pin(MIC_I2S_PORT, &pin_config);
  if (err != ESP_OK) {
    Serial.print("i2s_set_pin failed: ");
    Serial.println(err);
    i2s_driver_uninstall(MIC_I2S_PORT);
    return;
  }

  i2s_zero_dma_buffer(MIC_I2S_PORT);
  i2sReady = true;

  Serial.println("I2S microphone ready");
}

float preprocessRawSample(int32_t raw) {
  float x = (float)(raw >> RAW_SHIFT);

  dcOffset = dcOffset * 0.9995f + x * 0.0005f;
  const float centered = x - dcOffset;

  if (!ENABLE_INPUT_DEGLITCH) {
    return centered;
  }

  float limited = centered;
  const float delta = centered - inputSmooth;
  if (delta > inputMaxStep) {
    limited = inputSmooth + inputMaxStep;
  } else if (delta < -inputMaxStep) {
    limited = inputSmooth - inputMaxStep;
  }

  inputSmooth += inputSmoothAlpha * (limited - inputSmooth);
  return inputSmooth;
}

int16_t processListenSample(float x) {
  float y = heartHighPass.process(x);
  y = heartHighPass2.process(y);
  if (ENABLE_HUM_NOTCH) {
    y = humNotch50.process(y);
    if (ENABLE_HUM_HARMONIC_NOTCH) {
      y = humNotch100.process(y);
    }
  }
  y = heartLowPass1.process(y);
  y = heartLowPass2.process(y);
  if (ENABLE_EXTRA_LOW_PASS_STAGE) {
    y = heartLowPass3.process(y);
  }

  int32_t filteredLevel = (int32_t)fabsf(y);
  if (filteredLevel > filteredPeak) {
    filteredPeak = filteredLevel;
  }

  if (ENABLE_SOFT_NOISE_FLOOR) {
    y = applySoftNoiseFloor(y);
  }

  if (ENABLE_SOFT_COMPRESSOR) {
    y = applySoftCompressor(y);
  }

  y *= volumeGain;
  y *= agcGain;
  y = softLimiter(y);

  if (ENABLE_CLICK_TAMER) {
    const float delta = y - outputSmooth;
    if (delta > clickMaxStep) {
      y = outputSmooth + clickMaxStep;
    } else if (delta < -clickMaxStep) {
      y = outputSmooth - clickMaxStep;
    }
  }

  outputSmooth += postSmoothAlpha * (y - outputSmooth);

  return clamp16((int32_t)outputSmooth);
}

int16_t processMetricSample(float x) {
  float y = metricHighPass.process(x);
  y = metricLowPass1.process(y);
  y = metricLowPass2.process(y);
  y = softLimiter(y * metricGain);

  return clamp16NoClipCount((int32_t)y);
}

int16_t selectStreamSample(float centered, int16_t listenAudio,
                           int16_t metricAudio) {
  if (AUDIO_STREAM_MODE == STREAM_RAW) {
    return clamp16NoClipCount((int32_t)(centered * rawMonitorGain));
  }

  if (AUDIO_STREAM_MODE == STREAM_LIGHT_FILTERED) {
    return metricAudio;
  }

  return listenAudio;
}

void updateHeartMetrics(int16_t audio) {
  sampleCounter++;

  const float rectified = fabsf((float)audio);
  const float envelopeAlpha =
      rectified > heartEnvelope ? envelopeAttackAlpha : envelopeReleaseAlpha;

  heartEnvelope += envelopeAlpha * (rectified - heartEnvelope);

  if (heartEnvelopeMean < 1.0f) {
    heartEnvelopeMean = heartEnvelope;
  } else {
    heartEnvelopeMean +=
        envelopeMeanAlpha * (heartEnvelope - heartEnvelopeMean);
  }

  heartThreshold =
      maxFloat(beatThresholdMin, heartEnvelopeMean * beatThresholdMultiplier);

  const uint32_t samplesSinceLastBeat = sampleCounter - lastBeatSample;

  if (beatArmed && heartEnvelope > heartThreshold &&
      samplesSinceLastBeat > minBeatIntervalSamples) {
    if (lastBeatSample > 0 && samplesSinceLastBeat < maxBeatIntervalSamples) {
      const float instantBpm =
          60.0f * SAMPLE_RATE / (float)samplesSinceLastBeat;
      heartBpm =
          heartBpm <= 0.1f ? instantBpm : heartBpm * 0.8f + instantBpm * 0.2f;
    }

    lastBeatSample = sampleCounter;
    beatArmed = false;
    beatsInPlotWindow++;
  }

  if (!beatArmed && heartEnvelope < heartThreshold * 0.55f) {
    beatArmed = true;
  }

  if (lastBeatSample > 0 && samplesSinceLastBeat > maxBeatIntervalSamples) {
    heartBpm = 0.0f;
  }
}

void updateAgcAndPlotter(int16_t listenAudio, int16_t metricAudio) {
  updateHeartMetrics(metricAudio);

  int32_t a = abs32(listenAudio);

  if (a > plotPeak) {
    plotPeak = a;
  }

  int32_t scaled = listenAudio / 8;
  plotSumSq += (uint64_t)(scaled * scaled);
  plotCount++;
  lastWave = listenAudio;

  unsigned long now = millis();

  if (now - lastPlotMs >= PLOT_INTERVAL_MS) {
    int32_t rms = 0;

    if (plotCount > 0) {
      rms = sqrtf((float)plotSumSq / plotCount) * 8;
    }

    if (rms > agcActivityRms && compressorActivity > 0.45f) {
      float desiredGain = targetRms / (float)rms;

      if (desiredGain < agcMin)
        desiredGain = agcMin;
      if (desiredGain > agcMax)
        desiredGain = agcMax;

      const float agcAlpha = desiredGain < agcGain ? 0.14f : 0.025f;
      agcGain += agcAlpha * (desiredGain - agcGain);
    } else if (agcGain > agcMin) {
      agcGain += 0.035f * (agcMin - agcGain);
    }

    Serial.print(">wave:");
    Serial.println(lastWave);

    Serial.print(">env:");
    Serial.println((int32_t)heartEnvelope);

    Serial.print(">thr:");
    Serial.println((int32_t)heartThreshold);

    Serial.print(">bpm:");
    Serial.println((int32_t)heartBpm);

    Serial.print(">beat:");
    Serial.println(beatsInPlotWindow > 0 ? 20000 : 0);

    Serial.print(">rms:");
    Serial.println(rms);

    Serial.print(">peak:");
    Serial.println(plotPeak);

    Serial.print(">raw:");
    Serial.println(rawPeak);

    Serial.print(">flt:");
    Serial.println(filteredPeak);

    Serial.print(">clip:");
    Serial.println(clipCount);

    Serial.print(">agc:");
    Serial.println((int32_t)(agcGain * 100.0f));

    Serial.print(">comp:");
    Serial.println((int32_t)(compressorGain * 100.0f));

    Serial.print(">gate:");
    Serial.println((int32_t)(compressorActivity * 100.0f));

    Serial.print(">noise:");
    Serial.println((int32_t)compressorNoise);

    Serial.print(">udp:");
    Serial.println((int32_t)udpPacketsSent);

    Serial.print(">udpFail:");
    Serial.println((int32_t)udpSendFailures);

    Serial.print(">wss:");
    Serial.println((int32_t)wsPacketsSent);

    Serial.print(">wssFail:");
    Serial.println((int32_t)wsSendFailures);

    plotPeak = 0;
    rawPeak = 0;
    filteredPeak = 0;
    plotSumSq = 0;
    plotCount = 0;
    clipCount = 0;
    beatsInPlotWindow = 0;
    lastPlotMs = now;
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  beginPendingFirmwareHealthCheck();
  setupFactoryResetButton();
  loadRuntimeConfig();
  setupI2S();
  setupHeartbeatFilters();
  setupWiFi();
  setupAudioUdp();
  startStationServices();
  handlePendingFirmwareHealth();

  if (!i2sReady) {
    Serial.println("Audio capture degraded; device services remain active");
  } else {
    Serial.print("Audio capture ready; active transport: ");
    Serial.println(activeAudioTransportLabel());
  }
}

void loop() {
  handleDeviceServices();
  handlePendingFirmwareHealth();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected, reconnecting...");
    setupWiFi();
    setupAudioUdp();
    startStationServices();
  }

  if (!i2sReady) {
    delay(25);
    handleDeviceServices();
    handlePendingFirmwareHealth();
    return;
  }

  size_t bytesRead = 0;

  esp_err_t result = i2s_read(MIC_I2S_PORT, micBuffer, sizeof(micBuffer),
                              &bytesRead, pdMS_TO_TICKS(250));

  if (result == ESP_OK && bytesRead > 0) {
    int samplesRead = bytesRead / (sizeof(int32_t) * I2S_CHANNEL_COUNT);

    for (int i = 0; i < samplesRead; i++) {
      const int sampleOffset = i * I2S_CHANNEL_COUNT;
      const int32_t rawA = micBuffer[sampleOffset];
      const int32_t rawB = micBuffer[sampleOffset + 1];
      const int32_t rawMixed = (int32_t)(((int64_t)rawA + rawB) / 2);

      int32_t rawLevel = abs32(rawMixed >> RAW_SHIFT);
      if (rawLevel > rawPeak) {
        rawPeak = rawLevel;
      }

      float centered = preprocessRawSample(rawMixed);
      int16_t listen16 = processListenSample(centered);
      int16_t metric16 = processMetricSample(centered);

      pcmBuffer[i] = selectStreamSample(centered, listen16, metric16);

      updateAgcAndPlotter(listen16, metric16);
    }

    sendAudioCloud(samplesRead);
  }

  handleDeviceServices();
  handlePendingFirmwareHealth();
}
