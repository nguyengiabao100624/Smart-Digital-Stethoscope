#include "driver/i2s.h"
#include <Arduino.h>
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
#include <math.h>
#include <mbedtls/sha256.h>
#include <string.h>

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
#define SMART_HEALTH_FIRMWARE_VERSION "0.1.0"
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

#ifndef SMART_HEALTH_ENABLE_LAN_OTA
#define SMART_HEALTH_ENABLE_LAN_OTA 0
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
const char *FIRMWARE_VERSION = SMART_HEALTH_FIRMWARE_VERSION;
char wifiSsid[64] = "";
char wifiPass[96] = "";
char audioHost[128] = "";
char backendHost[128] = "";
char deviceName[48] = "";
char deviceId[64] = "";
char deviceSecret[96] = "";
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
const unsigned long CLOUD_RECONNECT_INTERVAL_MS = 5000;
const unsigned long CLOUD_TELEMETRY_INTERVAL_MS = 10000;
const int FACTORY_RESET_PIN = SMART_HEALTH_FACTORY_RESET_PIN;
const unsigned long FACTORY_RESET_HOLD_MS = SMART_HEALTH_FACTORY_RESET_HOLD_MS;
IPAddress setupPortalIp(192, 168, 4, 1);
IPAddress setupPortalGateway(192, 168, 4, 1);
IPAddress setupPortalSubnet(255, 255, 255, 0);
String setupPortalReason = "";
bool setupPortalActive = false;
bool configServerStarted = false;
bool otaReady = false;
bool mdnsReady = false;
bool i2sReady = false;
bool cloudConnected = false;
bool cloudConfigured = false;
bool udpAudioReady = false;
bool deviceLocked = false;
unsigned long factoryResetPressedAtMs = 0;
bool factoryResetWarningPrinted = false;
unsigned long lastCloudConnectAttemptMs = 0;
unsigned long lastCloudTelemetryMs = 0;

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

int32_t abs32(int32_t value) { return value < 0 ? -value : value; }

float maxFloat(float a, float b) { return a > b ? a : b; }

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

void saveRuntimeConfig();
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
  Serial.print("Factory reset button ready on GPIO");
  Serial.print(FACTORY_RESET_PIN);
  Serial.print(". Hold for ");
  Serial.print(FACTORY_RESET_HOLD_MS / 1000UL);
  Serial.println(" seconds while device is running.");
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

void loadRuntimeConfig() {
  copyConfigValue(wifiSsid, sizeof(wifiSsid), DEFAULT_WIFI_SSID);
  copyConfigValue(wifiPass, sizeof(wifiPass), DEFAULT_WIFI_PASS);
  copyConfigValue(audioHost, sizeof(audioHost), DEFAULT_AUDIO_HOST);
  copyConfigValue(backendHost, sizeof(backendHost), DEFAULT_BACKEND_HOST);
  copyConfigValue(deviceName, sizeof(deviceName), DEFAULT_DEVICE_NAME);
  copyConfigValue(deviceId, sizeof(deviceId), DEFAULT_DEVICE_ID);
  copyConfigValue(deviceSecret, sizeof(deviceSecret), DEFAULT_DEVICE_SECRET, false);
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
    copyConfigValue(deviceId, sizeof(deviceId),
                    devicePrefs.getString("deviceId", ""));
  }

  if (devicePrefs.isKey("deviceSecret")) {
    copyConfigValue(deviceSecret, sizeof(deviceSecret),
                    devicePrefs.getString("deviceSecret", ""), false);
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

  devicePrefs.end();

  bool shouldPersistDefaults = false;
  if (strlen(deviceName) == 0) {
    copyConfigValue(deviceName, sizeof(deviceName), getDefaultDeviceName());
    shouldPersistDefaults = true;
  }

  if (strlen(deviceId) == 0) {
    copyConfigValue(deviceId, sizeof(deviceId), deviceName);
    shouldPersistDefaults = true;
  }

  if (strlen(otaPassword) == 0) {
    copyConfigValue(otaPassword, sizeof(otaPassword), generateOtaPassword(),
                    false);
    shouldPersistDefaults = true;
  }

  copyConfigValue(deviceName, sizeof(deviceName),
                  sanitizeDeviceName(deviceName));
  copyConfigValue(deviceId, sizeof(deviceId), sanitizeDeviceName(deviceId));

  if (shouldPersistDefaults) {
    saveRuntimeConfig();
  }
}

void saveRuntimeConfig() {
  devicePrefs.begin("smart-health", false);
  devicePrefs.putString("wifiSsid", wifiSsid);
  devicePrefs.putString("wifiPass", wifiPass);
  devicePrefs.putString("audioHost", audioHost);
  devicePrefs.putString("backendHost", backendHost);
  devicePrefs.putString("deviceName", deviceName);
  devicePrefs.putString("deviceId", deviceId);
  devicePrefs.putString("deviceSecret", deviceSecret);
  devicePrefs.putString("otaPass", otaPassword);
  devicePrefs.putInt("udpPort", audioUdpPort);
  devicePrefs.putInt("backendPort", backendPort);
  devicePrefs.putBool("backendTls", backendUseTls);
  devicePrefs.end();
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

  page += F("<form method=\"post\" action=\"/save\">"
            "<label for=\"ssid\">WiFi SSID</label><input id=\"ssid\" name=\"ssid\" required value=\"");
  page += htmlEscape(wifiSsid);
  page += F("\"><label for=\"pass\">WiFi password</label><input id=\"pass\" name=\"pass\" type=\"password\" value=\"");
  page += htmlEscape(wifiPass);
  page += F("\"><div class=\"hint\">Leave blank only for an open WiFi network. This page cannot change OTA, backend URL, device secret or admin rights.</div>");
  page += F("<button type=\"submit\">Save and restart</button></form>"
            "<p class=\"hint\">After saving, the device restarts and connects to the selected WiFi. When Internet is available it reconnects to the main Web Admin through the backend cloud.</p>"
            "</section></main></body></html>");

  return page;
}

void handleSetupRoot() {
  setupServer.send(200, "text/html",
                   buildSetupPage(setupPortalReason.c_str()));
}

void handleSetupSave() {
  String ssid = setupServer.arg("ssid");
  String pass = setupServer.arg("pass");

  ssid.trim();

  if (ssid.length() == 0) {
    setupServer.send(
        400, "text/html",
        buildSetupPage("WiFi SSID is required."));
    return;
  }

  copyConfigValue(wifiSsid, sizeof(wifiSsid), ssid);
  copyConfigValue(wifiPass, sizeof(wifiPass), pass, false);
  saveRuntimeConfig();

  setupServer.send(200, "text/html",
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
  WiFi.disconnect(false);
  delay(250);
  WiFi.mode(WIFI_AP);
  WiFi.softAPConfig(setupPortalIp, setupPortalGateway, setupPortalSubnet);

  String apName = "SmartHealth-" + getDeviceSuffix();

  if (!WiFi.softAP(apName.c_str())) {
    Serial.println("Cannot start Smart Health setup access point.");
    while (true) {
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
  Serial.println("AP security: open WiFi recovery");
  Serial.print("Open: http://");
  Serial.println(setupPortalIp);

  while (true) {
    setupDns.processNextRequest();
    setupServer.handleClient();
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

String extractJsonString(const String &json, const char *key) {
  String pattern = "\"";
  pattern += key;
  pattern += "\"";
  int pos = json.indexOf(pattern);
  if (pos < 0) {
    return "";
  }
  pos = json.indexOf(':', pos + pattern.length());
  if (pos < 0) {
    return "";
  }
  pos++;
  while (pos < (int)json.length() && isspace((unsigned char)json[pos])) {
    pos++;
  }
  if (pos >= (int)json.length() || json[pos] != '"') {
    return "";
  }
  pos++;
  String value = "";
  bool escaped = false;
  for (; pos < (int)json.length(); pos++) {
    const char c = json[pos];
    if (escaped) {
      value += c;
      escaped = false;
    } else if (c == '\\') {
      escaped = true;
    } else if (c == '"') {
      break;
    } else {
      value += c;
    }
  }
  return value;
}

bool commandTypeIs(const String &json, const char *type) {
  String currentType = extractJsonString(json, "type");
  return currentType == String(type);
}

String cloudWsUrl() {
  String url = backendUseTls ? "wss://" : "ws://";
  url += backendHost;
  url += ":";
  url += String(backendPort);
  url += "/esp?deviceId=";
  url += deviceId;
  if (strlen(deviceSecret) > 0) {
    url += "&secret=";
    url += deviceSecret;
  }
  return url;
}

String cloudTelemetryJson(const char *type) {
  String json = "{";
  json += "\"type\":\"";
  json += type;
  json += "\",";
  json += "\"deviceId\":\"";
  json += jsonEscape(deviceId);
  json += "\",";
  if (strlen(deviceSecret) > 0) {
    json += "\"secret\":\"";
    json += jsonEscape(deviceSecret);
    json += "\",";
  }
  json += "\"name\":\"";
  json += jsonEscape(deviceName);
  json += "\",";
  json += "\"firmwareVersion\":\"";
  json += jsonEscape(FIRMWARE_VERSION);
  json += "\",";
  json += "\"status\":\"connected\",";
  json += "\"connectionMethod\":\"WSS\",";
  json += "\"audioStatus\":\"";
  json += cloudConnected ? "streaming" : "reconnecting";
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

void sendCloudEvent(const char *type, const char *status = "", const char *detail = "") {
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

void sendCloudTelemetry(const char *type = "telemetry") {
  if (!cloudConnected) {
    return;
  }
  cloudSocket.send(cloudTelemetryJson(type));
  lastCloudTelemetryMs = millis();
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

bool performCloudOta(const String &url, const String &version, const String &checksum) {
  if (url.length() == 0) {
    sendCloudEvent("ota.failed", "failed", "missing firmware url");
    return false;
  }

  Serial.print("Cloud OTA URL: ");
  Serial.println(url);
  sendCloudEvent("ota.downloading", "downloading", "download started");

  if (i2sReady) {
    i2s_stop(MIC_I2S_PORT);
  }

  HTTPClient http;
  WiFiClient plainClient;
  WiFiClientSecure secureClient;
  bool began = false;
  if (url.startsWith("https://")) {
    secureClient.setInsecure();
    began = http.begin(secureClient, url);
  } else {
    began = http.begin(plainClient, url);
  }

  if (!began) {
    sendCloudEvent("ota.failed", "failed", "cannot open firmware url");
    return false;
  }

  const int httpCode = http.GET();
  if (httpCode != HTTP_CODE_OK) {
    http.end();
    sendCloudEvent("ota.failed", "failed", "firmware download http error");
    return false;
  }

  const int totalSize = http.getSize();
  if (!Update.begin(totalSize > 0 ? totalSize : UPDATE_SIZE_UNKNOWN)) {
    http.end();
    sendCloudEvent("ota.failed", "failed", "cannot begin update");
    return false;
  }

  mbedtls_sha256_context shaContext;
  mbedtls_sha256_init(&shaContext);
  mbedtls_sha256_starts_ret(&shaContext, 0);

  WiFiClient *stream = http.getStreamPtr();
  uint8_t buffer[1024];
  int downloaded = 0;
  unsigned long lastProgressMs = 0;
  unsigned long lastReadMs = millis();

  while (http.connected() && (totalSize < 0 || downloaded < totalSize)) {
    const size_t available = stream->available();
    if (available > 0) {
      const int readBytes = stream->readBytes(buffer, min(available, sizeof(buffer)));
      if (readBytes <= 0) {
        break;
      }
      lastReadMs = millis();
      if (Update.write(buffer, readBytes) != (size_t)readBytes) {
        Update.abort();
        http.end();
        mbedtls_sha256_free(&shaContext);
        sendCloudEvent("ota.failed", "failed", "flash write failed");
        return false;
      }
      mbedtls_sha256_update_ret(&shaContext, buffer, readBytes);
      downloaded += readBytes;

      if (millis() - lastProgressMs > 1500) {
        lastProgressMs = millis();
        sendCloudEvent("ota.downloading", "downloading", "download progress");
      }
    } else {
      if (millis() - lastReadMs > 15000) {
        Update.abort();
        http.end();
        mbedtls_sha256_free(&shaContext);
        sendCloudEvent("ota.failed", "failed", "download timeout");
        return false;
      }
      delay(5);
      cloudSocket.poll();
    }
  }

  uint8_t digest[32];
  mbedtls_sha256_finish_ret(&shaContext, digest);
  mbedtls_sha256_free(&shaContext);
  http.end();

  const String actualChecksum = sha256Hex(digest);
  String expectedChecksum = checksum;
  expectedChecksum.toLowerCase();
  if (expectedChecksum.length() == 64 && expectedChecksum != actualChecksum) {
    Update.abort();
    sendCloudEvent("ota.failed", "failed", "sha256 mismatch");
    return false;
  }

  sendCloudEvent("ota.verifying", "verifying", "firmware downloaded");

  if (!Update.end(true)) {
    sendCloudEvent("ota.failed", "failed", "update finalize failed");
    return false;
  }

  sendCloudEvent("ota.rebooting", "rebooting", version.c_str());
  delay(1000);
  ESP.restart();
  return true;
}

void handleCloudCommand(String message) {
  Serial.print("Cloud command: ");
  Serial.println(message);

  if (commandTypeIs(message, "restart")) {
    sendCloudEvent("restart.accepted", "", "device restarting");
    delay(500);
    ESP.restart();
    return;
  }

  if (commandTypeIs(message, "wifi.status")) {
    sendCloudTelemetry("telemetry");
    return;
  }

  if (commandTypeIs(message, "device.lock") || commandTypeIs(message, "device.revoke")) {
    deviceLocked = true;
    sendCloudEvent("device.locked", "", "cloud lock accepted");
    return;
  }

  if (commandTypeIs(message, "wifi.update")) {
    String ssid = extractJsonString(message, "ssid");
    String password = extractJsonString(message, "password");
    if (password.length() == 0) {
      password = extractJsonString(message, "pass");
    }
    ssid.trim();
    if (ssid.length() > 0) {
      copyConfigValue(wifiSsid, sizeof(wifiSsid), ssid);
      copyConfigValue(wifiPass, sizeof(wifiPass), password, false);
      saveRuntimeConfig();
      sendCloudEvent("wifi.update.accepted", "", "wifi saved");
      delay(500);
      ESP.restart();
    } else {
      sendCloudEvent("wifi.update.failed", "", "missing ssid");
    }
    return;
  }

  if (commandTypeIs(message, "ota.update") || commandTypeIs(message, "ota")) {
    const String url = extractJsonString(message, "url");
    const String version = extractJsonString(message, "firmwareVersion");
    const String checksum = extractJsonString(message, "checksum");
    performCloudOta(url, version, checksum);
  }
}

void setupCloudSocket() {
  if (!hasBackendConfig()) {
    Serial.println("Cloud WSS disabled: backend host/port is missing.");
    cloudConfigured = false;
    return;
  }
  if (cloudConfigured) {
    return;
  }
  cloudSocket.onMessage([](WebsocketsMessage message) {
    handleCloudCommand(message.data());
  });
  cloudSocket.onEvent([](WebsocketsEvent event, String data) {
    if (event == WebsocketsEvent::ConnectionOpened) {
      cloudConnected = true;
      Serial.println("Cloud WSS connected.");
      sendCloudTelemetry("hello");
    } else if (event == WebsocketsEvent::ConnectionClosed) {
      cloudConnected = false;
      Serial.println("Cloud WSS disconnected.");
    } else if (event == WebsocketsEvent::GotPing) {
      Serial.println("Cloud WSS ping.");
    } else if (event == WebsocketsEvent::GotPong) {
      Serial.println("Cloud WSS pong.");
    }
  });
  cloudConfigured = true;
}

void connectCloudSocketIfNeeded() {
  if (!cloudConfigured || WiFi.status() != WL_CONNECTED || deviceLocked) {
    return;
  }
  if (cloudConnected) {
    return;
  }
  if (millis() - lastCloudConnectAttemptMs < CLOUD_RECONNECT_INTERVAL_MS) {
    return;
  }
  lastCloudConnectAttemptMs = millis();
  const String url = cloudWsUrl();
  Serial.print("Connecting cloud WSS: ");
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

  const size_t bytesToSend = samplesRead * sizeof(int16_t);
  if (cloudConnected && cloudSocket.sendBinary((const char *)pcmBuffer, bytesToSend)) {
    wsPacketsSent++;
    return;
  }

  if (cloudConfigured) {
    wsSendFailures++;
  }
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
  Serial.print("ESP32 IP: ");
  Serial.println(WiFi.localIP());
}

void setupAudioUdp() {
  udpAudioReady = false;
  if (!hasUdpAudioConfig()) {
    Serial.println("UDP fallback disabled: audio host/port is missing.");
    return;
  }

  if (!audioServerIp.fromString(audioHost) &&
      WiFi.hostByName(audioHost, audioServerIp) != 1) {
    Serial.print("Cannot resolve audio server: ");
    Serial.println(audioHost);
    Serial.println("UDP fallback disabled; cloud WSS remains primary.");
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
    while (true)
      delay(1000);
  }

  err = i2s_set_pin(MIC_I2S_PORT, &pin_config);
  if (err != ESP_OK) {
    Serial.print("i2s_set_pin failed: ");
    Serial.println(err);
    while (true)
      delay(1000);
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

  setupFactoryResetButton();
  loadRuntimeConfig();
  setupWiFi();
  setupAudioUdp();
  startStationServices();
  setupI2S();
  setupHeartbeatFilters();

  Serial.println("UDP heartbeat audio streaming started");
}

void loop() {
  handleDeviceServices();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected, reconnecting...");
    setupWiFi();
    setupAudioUdp();
    startStationServices();
  }

  size_t bytesRead = 0;

  esp_err_t result = i2s_read(MIC_I2S_PORT, micBuffer, sizeof(micBuffer),
                              &bytesRead, portMAX_DELAY);

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
}
