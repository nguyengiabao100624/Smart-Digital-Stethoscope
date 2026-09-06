#include "driver/i2s.h"
#include "ShcareDeviceProtocol.h"
#include <Arduino.h>
#include <ArduinoJson.h>
#include <ArduinoOTA.h>
#include <ArduinoWebsockets.h>
#include "shcare_ota_trust_anchor.h"
#include <tiny_websockets/network/esp32/esp32_tcp.hpp>
#include <DNSServer.h>
#include <ESPmDNS.h>
#include <HTTPClient.h>
#include <NimBLEDevice.h>
#include <Preferences.h>
#include <Update.h>
#include <WebServer.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WiFiUdp.h>
#include <esp_app_format.h>
#include <esp_flash_encrypt.h>
#include <esp_ota_ops.h>
#include <esp_smartconfig.h>
#include <esp_system.h>
#include <esp_task_wdt.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <freertos/semphr.h>
#include <freertos/task.h>
#include <sdkconfig.h>
#include <math.h>
#include <mbedtls/base64.h>
#include <mbedtls/gcm.h>
#include <mbedtls/md.h>
#include <mbedtls/pk.h>
#include <mbedtls/sha256.h>
#include <algorithm>
#include <memory>
#include <string.h>
#include <sys/time.h>
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
#define SMART_HEALTH_FIRMWARE_VERSION "1.0.1"
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

#ifndef SMART_HEALTH_SETUP_PORTAL_AUTO_RECOVERY_FAILURES
#define SMART_HEALTH_SETUP_PORTAL_AUTO_RECOVERY_FAILURES 3
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

// Set only by the ignored, generated local HIL header. It makes the factory
// fixture's cloud identity authoritative while still reading a user-provided
// Wi-Fi credential from NVS. Normal development and production builds keep
// persisted cloud configuration behavior unchanged.
#ifndef SMART_HEALTH_HIL_RUNTIME_CONFIG
#define SMART_HEALTH_HIL_RUNTIME_CONFIG 0
#endif

// Defined only by the ignored local HIL header.  A local fixture may set a
// fresh build timestamp before it makes its first mutually-authenticated WSS
// connection, because NTP is not always reachable from an isolated LAN.  It
// is intentionally unavailable to production images and never bypasses CA or
// certificate-chain verification.
#ifndef SMART_HEALTH_HIL_CLOCK_EPOCH
#define SMART_HEALTH_HIL_CLOCK_EPOCH 0
#endif
static_assert(!(SMART_HEALTH_HIL_RUNTIME_CONFIG && SMART_HEALTH_PRODUCTION_PROFILE),
              "HIL runtime configuration must never be compiled into a production image.");

// Arduino-ESP32 supplies a weak verifyOta() implementation that accepts a
// PENDING_VERIFY image during framework startup.  That runs before setup(),
// so relying solely on the application-level boot-health state machine below
// would silently cancel ESP-IDF A/B rollback before it has authenticated with
// Shcare.  Defer that framework decision and let
// confirmPendingFirmwareIfHealthy() be the single, durable confirmation path.
// This symbol intentionally has C linkage because the Arduino core is C.
#if CONFIG_APP_ROLLBACK_ENABLE
extern "C" bool verifyRollbackLater() { return true; }
#endif

// Physical HIL may opt in to compare the persisted device identity with the
// factory material compiled into an ignored local header.  The check reports
// only a boolean and is not compiled into normal production images.
#ifndef SMART_HEALTH_HIL_EXPECTED_IDENTITY_CHECK
#define SMART_HEALTH_HIL_EXPECTED_IDENTITY_CHECK 0
#endif

// ESPTouch V2 encrypted broadcast is the supported customer provisioning
// transport. BLE is deliberately disabled; the SoftAP portal is physical
// recovery only and is never opened by the Android customer flow.
#ifndef SMART_HEALTH_ENABLE_BLE_PROVISIONING
#define SMART_HEALTH_ENABLE_BLE_PROVISIONING 0
#endif
static_assert(SMART_HEALTH_ENABLE_BLE_PROVISIONING == 0,
              "BLE provisioning is retired; use ESPTouch V2 SmartConfig.");

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

const std::uint32_t CLOUD_SOCKET_CONNECT_TIMEOUT_MS = 1000;
const std::uint32_t CLOUD_SOCKET_IO_TIMEOUT_SECONDS = 1;
const std::uint32_t CLOUD_SOCKET_HANDSHAKE_TIMEOUT_SECONDS = 1;

#if SMART_HEALTH_PRODUCTION_PROFILE
class BoundedSecureCloudTcpClient final
    : public websockets::network::SecuredEsp32TcpClient {
public:
  BoundedSecureCloudTcpClient() { configureTimeouts(); }

  bool connect(const WSString &host, const int port) override {
    configureTimeouts();
    yield();
    const bool connected = client.connect(
        host.c_str(), port, CLOUD_SOCKET_CONNECT_TIMEOUT_MS);
    client.setNoDelay(true);
    return connected;
  }

  void send(const WSString &data) override {
    send(reinterpret_cast<const uint8_t *>(data.c_str()), data.size());
  }

  void send(const WSString &&data) override {
    send(reinterpret_cast<const uint8_t *>(data.c_str()), data.size());
  }

  void send(const uint8_t *data, const uint32_t len) override {
    yield();
    const size_t written = client.write(data, len);
    observedWrite = true;
    observedWriteExpectedBytes = len;
    observedWriteActualBytes = written;
    yield();
  }

  void beginObservedWrite() {
    observedWrite = false;
    observedWriteExpectedBytes = 0;
    observedWriteActualBytes = 0;
  }

  bool consumeObservedWriteComplete() {
    const bool complete = observedWrite && observedWriteExpectedBytes > 0 &&
                          observedWriteActualBytes == observedWriteExpectedBytes &&
                          client.connected();
    beginObservedWrite();
    return complete;
  }

  void forceClose() {
    client.stop();
    beginObservedWrite();
  }

private:
  void configureTimeouts() {
    client.setTimeout(CLOUD_SOCKET_IO_TIMEOUT_SECONDS);
    client.setHandshakeTimeout(CLOUD_SOCKET_HANDSHAKE_TIMEOUT_SECONDS);
  }

  bool observedWrite = false;
  size_t observedWriteExpectedBytes = 0;
  size_t observedWriteActualBytes = 0;
};
#elif SMART_HEALTH_HIL_RUNTIME_CONFIG
#ifndef SMART_HEALTH_HIL_BACKEND_CONNECT_IP
#define SMART_HEALTH_HIL_BACKEND_CONNECT_IP ""
#endif
#ifndef SMART_HEALTH_HIL_RESET_OTA_STATE
#define SMART_HEALTH_HIL_RESET_OTA_STATE 0
#endif

// Local HIL has no authoritative LAN DNS. Preserve the production-like
// hostname-verifying TLS flow while routing the fixture hostname to its
// explicit LAN IP. CA validation remains mandatory.
class HilSecureCloudTcpClient final
    : public websockets::network::SecuredEsp32TcpClient {
public:
  bool connect(const WSString &host, const int port) override {
    IPAddress target;
    if (!target.fromString(SMART_HEALTH_HIL_BACKEND_CONNECT_IP)) {
      // A local HIL normally pins the resolved address so the TLS SNI/CA
      // hostname remains production-like.  For a cloud fixture the address
      // may be omitted or rotated; resolve the same hostname instead of
      // failing closed with an opaque "route invalid" loop.
      Serial.println("Local HIL TLS route pin missing; resolving cloud host.");
      if (WiFi.hostByName(host.c_str(), target) != 1) {
        Serial.println("Local HIL TLS DNS resolution failed.");
        return false;
      }
    }
    const bool connected = client.connect(
        target, port, host.c_str(), BACKEND_CA_CERT, nullptr, nullptr);
    client.setNoDelay(true);
    return connected;
  }
};
#endif

Preferences devicePrefs;
WebServer setupServer(80);
DNSServer setupDns;
NimBLEServer *bleProvisioningServer = nullptr;
NimBLECharacteristic *bleProvisioningIdentityCharacteristic = nullptr;
NimBLECharacteristic *bleProvisioningChallengeCharacteristic = nullptr;
NimBLECharacteristic *bleProvisioningWifiCharacteristic = nullptr;
NimBLECharacteristic *bleProvisioningStatusCharacteristic = nullptr;
String bleProvisioningNonce = "";
unsigned long bleProvisioningNonceIssuedAtMs = 0;
unsigned long bleProvisioningRestartAtMs = 0;
bool bleProvisioningStarted = false;
#if SMART_HEALTH_PRODUCTION_PROFILE
std::shared_ptr<BoundedSecureCloudTcpClient> boundedCloudTcpClient =
    std::make_shared<BoundedSecureCloudTcpClient>();
WebsocketsClient cloudSocket(boundedCloudTcpClient);
#elif SMART_HEALTH_HIL_RUNTIME_CONFIG
std::shared_ptr<HilSecureCloudTcpClient> hilSecureCloudTcpClient =
    std::make_shared<HilSecureCloudTcpClient>();
WebsocketsClient cloudSocket(hilSecureCloudTcpClient);
#else
WebsocketsClient cloudSocket;
#endif
const byte SETUP_DNS_PORT = 53;
const unsigned long WIFI_RECONNECT_BASE_MS = 1000;
const unsigned long WIFI_RECONNECT_MAX_MS = 30000;
// WPA association and DHCP need materially longer than the exponential retry
// base. Calling WiFi.begin again earlier tears down the in-flight station
// attempt (reported by ESP-IDF as ASSOC_LEAVE/reason 8).
const unsigned long WIFI_ASSOCIATION_TIMEOUT_MS = 15000;
const unsigned long CLOUD_RECONNECT_BASE_MS = 1000;
const unsigned long CLOUD_RECONNECT_MAX_MS = 30000;
// The backend challenge expires after roughly ten seconds. Some Arduino
// WebSockets close paths do not reliably emit ConnectionClosed, so the device
// owns a slightly longer watchdog and forces a fresh bounded handshake.
const unsigned long CLOUD_AUTH_HANDSHAKE_TIMEOUT_MS = 12000;
constexpr time_t TLS_CERT_TIME_FLOOR = 1700000000;
const unsigned long CLOUD_TELEMETRY_INTERVAL_MS = 10000;
const unsigned long I2S_RETRY_BASE_MS = 1000;
const unsigned long I2S_RETRY_MAX_MS = 60000;
const unsigned long BLE_PROVISIONING_NONCE_TTL_MS = 90000;
const unsigned long BLE_PROVISIONING_RESTART_DELAY_MS = 3500;
const char *BLE_PROVISIONING_SERVICE_UUID =
    "a4d35bd2-6641-4e2d-b61f-6db74a3b8a10";
const char *BLE_PROVISIONING_IDENTITY_UUID =
    "a4d35bd3-6641-4e2d-b61f-6db74a3b8a10";
const char *BLE_PROVISIONING_CHALLENGE_UUID =
    "a4d35bd4-6641-4e2d-b61f-6db74a3b8a10";
const char *BLE_PROVISIONING_WIFI_UUID =
    "a4d35bd5-6641-4e2d-b61f-6db74a3b8a10";
const char *BLE_PROVISIONING_STATUS_UUID =
    "a4d35bd6-6641-4e2d-b61f-6db74a3b8a10";
const std::uint32_t I2S_READ_FAILURE_THRESHOLD = 3;
const std::uint32_t TASK_WATCHDOG_TIMEOUT_SECONDS = 30;
const std::uint32_t BUILT_TASK_WATCHDOG_TIMEOUT_SECONDS =
    CONFIG_ESP_TASK_WDT_TIMEOUT_S;
const unsigned long TASK_WATCHDOG_RETRY_MS = 60000;
const std::size_t OFFLINE_OPERATIONAL_QUEUE_CAPACITY = 8;
const std::size_t AUDIO_CAPTURE_QUEUE_CAPACITY = 8;
const std::size_t AUDIO_CAPTURE_MAX_DRAIN_PER_LOOP = 2;
const unsigned long AUDIO_CAPTURE_MAX_FRAME_AGE_MS = 1000;
const unsigned long AUDIO_CAPTURE_PAUSE_TIMEOUT_MS = 1000;
const std::uint32_t AUDIO_CAPTURE_TASK_STACK_BYTES = 8192;
const UBaseType_t AUDIO_CAPTURE_TASK_PRIORITY = 3;
const unsigned long OTA_BOOT_STABILITY_MS =
    SMART_HEALTH_OTA_BOOT_STABILITY_MS;
const unsigned long OTA_BOOT_HEALTH_TIMEOUT_MS =
    SMART_HEALTH_OTA_BOOT_HEALTH_TIMEOUT_MS;
const unsigned long OTA_RECOVERY_SAFE_MODE_STATUS_MS = 15000;
const int FACTORY_RESET_PIN = SMART_HEALTH_FACTORY_RESET_PIN;
const unsigned long FACTORY_RESET_HOLD_MS = SMART_HEALTH_FACTORY_RESET_HOLD_MS;
const unsigned long SETUP_PORTAL_TTL_MS = SMART_HEALTH_SETUP_PORTAL_TTL_MS;
const std::uint32_t SETUP_PORTAL_AUTO_RECOVERY_FAILURES =
    SMART_HEALTH_SETUP_PORTAL_AUTO_RECOVERY_FAILURES;
IPAddress setupPortalIp(192, 168, 4, 1);
IPAddress setupPortalGateway(192, 168, 4, 1);
IPAddress setupPortalSubnet(255, 255, 255, 0);
String setupPortalReason = "";
String setupPortalCsrfToken = "";
bool setupPortalActive = false;
bool setupPortalPhysicalGesture = false;
bool configServerStarted = false;
bool smartConfigActive = false;
bool smartConfigCandidateReady = false;
bool smartConfigCandidateBindingValid = false;
bool smartConfigCandidateValidationReported = false;
bool smartConfigEventRegistered = false;
bool wifiDiagnosticEventRegistered = false;
bool smartConfigKdfVerified = false;
unsigned long smartConfigStartedAtMs = 0;
unsigned long smartConfigNextAttemptAtMs = 0;
char smartConfigProvisioningKey[17] = {0};
char smartConfigExpectedBinding[36] = {0};
char smartConfigCandidateSsid[33] = {0};
char smartConfigCandidatePassword[65] = {0};
bool otaReady = false;
bool mdnsReady = false;
bool i2sReady = false;
bool i2sDriverInstalled = false;
bool i2sMaintenancePaused = false;
bool taskWatchdogReady = false;
bool cloudTransportConnected = false;
bool cloudConnected = false;
unsigned long cloudTransportConnectedAtMs = 0;
int64_t authenticatedServerEpochBaseMs = 0;
uint32_t authenticatedServerEpochAtUptimeMs = 0;
bool cloudConfigured = false;
bool cloudClockWaitReported = false;
bool udpAudioReady = false;
bool deviceLocked = false;
bool authenticatedProductionHeartbeatObserved = false;
bool pendingFirmwareVerification = false;
bool otaRollbackTerminal = false;
bool otaInProgress = false;
bool otaTaskWatchdogSuspended = false;
unsigned long factoryResetPressedAtMs = 0;
bool factoryResetWarningPrinted = false;
unsigned long setupPortalStartedAtMs = 0;
unsigned long pendingFirmwareBootStartedMs = 0;
unsigned long pendingFirmwareLastStatusMs = 0;
unsigned long pendingOtaEventLastAttemptMs = 0;
unsigned long lastWifiConnectAttemptMs = 0;
unsigned long wifiReconnectDelayMs = 0;
std::uint32_t wifiReconnectFailureCount = 0;
bool wifiReconnectAttempted = false;
bool wifiConnectionObserved = false;
unsigned long lastCloudConnectAttemptMs = 0;
unsigned long cloudReconnectDelayMs = 0;
std::uint32_t cloudReconnectFailureCount = 0;
unsigned long lastCloudTelemetryMs = 0;
unsigned long lastOfflineTelemetryMarkerMs = 0;
unsigned long lastI2sAttemptMs = 0;
unsigned long lastTaskWatchdogSetupAttemptMs = 0;
unsigned long i2sRetryDelayMs = I2S_RETRY_BASE_MS;
std::uint32_t i2sBackoffAttemptCount = 0;
std::uint32_t i2sRecoveryAttemptCount = 0;
std::uint32_t i2sRecoverySuccessCount = 0;
std::uint32_t i2sInitFailureCount = 0;
std::uint32_t i2sReadFailureCount = 0;
std::uint32_t i2sConsecutiveReadFailures = 0;
std::uint32_t taskWatchdogFeedFailures = 0;
std::uint32_t offlineQueueFlushFailures = 0;
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
String activeAudioProfileName = "heart";
String otaBootOutcome = "";
bool audioSessionActive = false;
bool audioDiscontinuityPending = false;
uint32_t audioSequence = 0;
uint32_t audioSessionGeneration = 1;
uint32_t audioCaptureOrdinal = 0;
uint32_t nextExpectedCaptureOrdinal = 0;
bool nextExpectedCaptureOrdinalReady = false;
shcare::RecentCommandIds recentCommandIds(32);
shcare::CommandJournal commandJournal(6);
shcare::OfflineOperationalQueue offlineOperationalQueue(
    OFFLINE_OPERATIONAL_QUEUE_CAPACITY);
shcare::PendingReconnectCommand pendingReconnectCommand;
bool pendingReconnectCommandReady = false;
shcare::PendingOtaReceipt pendingOtaReceipt;
bool pendingOtaReceiptReady = false;
bool pendingOtaConfirmationPersistence = false;
bool otaRecoverySafeMode = false;
shcare::OtaRecoverySafeModeReason otaRecoverySafeModeReason =
    shcare::OtaRecoverySafeModeReason::None;
unsigned long otaRecoverySafeModeLastStatusMs = 0;
shcare::AuthHandshakeState cloudAuthHandshake;
shcare::RuntimeSecurityDecision cloudSecurityDecision;

enum class I2sRuntimeState {
  Starting,
  Ready,
  Degraded,
  Retrying,
};

I2sRuntimeState i2sRuntimeState = I2sRuntimeState::Starting;
String lastI2sFailureCode = "";

bool sendCloudEvent(const char *type, const char *status = "",
                    const char *detail = "");
bool setupTaskWatchdog();
void feedTaskWatchdog();
void maintainTaskWatchdog();
bool beginBlockingOtaRuntime(String &failureCode);
void endBlockingOtaRuntime();
bool persistOtaBootOutcome(const char *outcome);
String loadOtaBootOutcome();
void handleI2SRecovery();
bool releaseI2SDriver();
void markI2sCaptureDegraded(const char *stableCode);
void queueOfflineTelemetryIfDue();
void flushOfflineOperationalQueue(std::size_t maxRecords = 2);
void handlePendingFirmwareHealth();
bool finalizeConfirmedOtaDurably();
bool otaRecoveryRuntimeServicesAllowed();
void enterOtaRecoverySafeMode(shcare::OtaRecoverySafeModeReason reason);
void handleOtaRecoverySafeMode();
void confirmPendingReconnectCommand();
bool erasePendingReconnectReceipt();
bool persistPendingOtaReceipt(const shcare::CommandEnvelope &command,
                              const shcare::OtaManifest &manifest,
                              const std::string &manifestFingerprint);
bool persistPendingOtaStatus(const char *status);
bool erasePendingOtaReceipt();
void loadPendingOtaReceipt();
void replayPendingOtaTerminalEvent();
String buildWifiConfigProof(const String &ssid, const String &password);
String jsonEscape(String value);
void setupAudioUdp();
void startStationServices();
void captureI2sFrame();
void audioCaptureTask(void *context);
bool startAudioCaptureTask();
bool pauseAudioCaptureTask();
void resumeAudioCaptureTask();
void drainAudioCaptureQueue(std::size_t maxPackets =
                                AUDIO_CAPTURE_MAX_DRAIN_PER_LOOP);
void configureAudioProfile(
    const shcare::AudioCaptureProfileDecision &profile);

// =======================
// MSM261S4030H0 I2S pins
// =======================
#define MIC_I2S_PORT I2S_NUM_0

#define I2S_WS 12
#define I2S_SCK 11
#define I2S_SD 10
// Both microphones share BCLK, WS and DATA. Their hardware select pins must be
// wired to opposite L/R select levels so each microphone occupies one I2S slot.
// MSM261S4030H0: L/R=GND emits the Left slot and L/R=VDD (3.3 V) emits the
// Right slot. ESP32-S3 stereo RX is interleaved [Left, Right], therefore slot 0
// is Left and slot 1 is Right. These channel names describe the I2S frame; the
// capsule's physical position in the enclosure still depends on its wiring.

#define SAMPLE_RATE 16000
// 8 ms packets keep latency low while avoiding browser/network underruns.
#define BUFFER_LEN 128
#define I2S_CHANNEL_COUNT 2
constexpr std::uint8_t I2S_LEFT_SLOT_INDEX = 0;
constexpr std::uint8_t I2S_RIGHT_SLOT_INDEX = 1;

static_assert(SAMPLE_RATE == shcare::kAudioSampleRate,
              "capture rate must match the canonical audio contract");
static_assert(BUFFER_LEN == shcare::kAudioPacketSamples,
              "capture packet size must match the canonical audio contract");

int32_t micBuffer[BUFFER_LEN * I2S_CHANNEL_COUNT];
uint8_t audioFrameBuffer[shcare::kAudioV2FixedHeaderBytes +
                         shcare::kAudioV2MaxSessionIdBytes +
                         shcare::kAudioV2MaxScanIdBytes +
                         BUFFER_LEN * sizeof(int16_t)];

struct AudioCaptureItem {
  std::uint32_t sessionGeneration = 0;
  std::uint32_t captureOrdinal = 0;
  std::uint32_t capturedAtMonotonicMs = 0;
  std::uint64_t capturedAtEpochMs = 0;
  std::uint16_t sampleCount = 0;
  bool sessionBound = false;
  int16_t pcm[BUFFER_LEN] = {};
};

AudioCaptureItem audioCaptureQueueStorage[AUDIO_CAPTURE_QUEUE_CAPACITY];
StaticQueue_t audioCaptureQueueControl;
QueueHandle_t audioCaptureQueue = nullptr;
StaticSemaphore_t audioCapturePausedAckControl;
SemaphoreHandle_t audioCapturePausedAck = nullptr;
TaskHandle_t audioCaptureTaskHandle = nullptr;
portMUX_TYPE audioCaptureStateMux = portMUX_INITIALIZER_UNLOCKED;
volatile bool audioCapturePauseRequested = false;
volatile bool audioCapturePaused = false;
volatile bool pendingI2sCaptureFault = false;
volatile bool pendingI2sCaptureEmptyFault = false;
std::uint32_t audioCaptureFramesEnqueued = 0;
std::uint32_t audioCaptureFramesDropped = 0;
std::uint32_t audioCaptureFramesStale = 0;
std::uint32_t audioCaptureQueueHighWater = 0;

struct I2sSlotDiagnostics {
  std::uint32_t rms = 0;
  std::uint32_t peak = 0;
  std::uint32_t windowCount = 0;
  std::uint32_t activeWindowCount = 0;
  std::uint32_t sampleCount = 0;
  std::uint32_t nonZeroSampleCount = 0;
};

I2sSlotDiagnostics i2sSlot0Diagnostics;
I2sSlotDiagnostics i2sSlot1Diagnostics;
std::uint8_t selectedAudioCaptureSlot = 0;
std::uint32_t audioCaptureSlotSwitchCount = 0;
shcare::AudioSlotSignalState selectedAudioSignalState =
    shcare::AudioSlotSignalState::TooWeak;

WiFiUDP audioUdp;
IPAddress audioServerIp;

// =======================
// Session-bound auscultation profiles
// =======================
const float HUM_NOTCH_Q = 35.0f;
const float FILTER_Q = 0.70710678f;
std::uint8_t activeHighPassStages = 1;
std::uint8_t activeLowPassStages = 2;
bool activeHumNotch50Enabled = true;
bool activeHumNotch100Enabled = false;

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

Biquad listenHighPass;
Biquad listenHighPass2;
Biquad humNotch50;
Biquad humNotch100;
Biquad listenLowPass1;
Biquad listenLowPass2;
Biquad listenLowPass3;
Biquad metricHighPass;
Biquad metricLowPass1;
Biquad metricLowPass2;

// =======================
// Audio tuning
// =======================
const int RAW_SHIFT = 14;
const std::uint32_t I2S_SLOT_CLIP_LEVEL = 120000U;
float volumeGain = 4.2f;
shcare::AudioCaptureProfile activeAudioProfile =
    shcare::AudioCaptureProfile::Heart;
bool activeProfileUsesHeartMetrics = true;
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
float outputSmoothingAlpha = 0.12f;

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
const float targetRms = 3200.0f;
const float agcMin = 1.0f;
float agcMaxGain = 6.0f;
int32_t agcActivityRms = 32;

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

bool setupTaskWatchdog() {
  lastTaskWatchdogSetupAttemptMs = millis();
  bool initializedHere = false;
  esp_err_t status = esp_task_wdt_status(nullptr);
  if (status == ESP_OK) {
    taskWatchdogReady = true;
    Serial.printf(
        "Task watchdog already active with built %lu second timeout.\n",
        static_cast<unsigned long>(BUILT_TASK_WATCHDOG_TIMEOUT_SECONDS));
    return true;
  }
  if (status == ESP_ERR_INVALID_STATE) {
    status = esp_task_wdt_init(TASK_WATCHDOG_TIMEOUT_SECONDS, true);
    if (status != ESP_OK) {
      taskWatchdogReady = false;
      offlineOperationalQueue.enqueueEvent(
          "watchdog.degraded", "degraded",
          static_cast<std::uint32_t>(millis()));
      Serial.printf("Task watchdog initialization failed: %s\n",
                    esp_err_to_name(status));
      return false;
    }
    initializedHere = true;
  }

  status = esp_task_wdt_add(nullptr);
  taskWatchdogReady = status == ESP_OK;
  if (!taskWatchdogReady) {
    offlineOperationalQueue.enqueueEvent(
        "watchdog.degraded", "degraded",
        static_cast<std::uint32_t>(millis()));
    Serial.printf("Task watchdog registration failed: %s\n",
                  esp_err_to_name(status));
    return false;
  }
  Serial.printf("Task watchdog active with %lu second timeout.\n",
                static_cast<unsigned long>(
                    initializedHere ? TASK_WATCHDOG_TIMEOUT_SECONDS
                                    : BUILT_TASK_WATCHDOG_TIMEOUT_SECONDS));
  return true;
}

void feedTaskWatchdog() {
  if (!taskWatchdogReady) {
    return;
  }
  const esp_err_t result = esp_task_wdt_reset();
  if (result == ESP_OK) {
    return;
  }
  if (taskWatchdogFeedFailures != UINT32_MAX) {
    ++taskWatchdogFeedFailures;
  }
  taskWatchdogReady = false;
  offlineOperationalQueue.enqueueEvent(
      "watchdog.degraded", "degraded",
      static_cast<std::uint32_t>(millis()));
  Serial.printf("Task watchdog feed failed: %s\n", esp_err_to_name(result));
}

void maintainTaskWatchdog() {
  if (otaInProgress || otaTaskWatchdogSuspended) {
    return;
  }
  if (!taskWatchdogReady &&
      millis() - lastTaskWatchdogSetupAttemptMs >=
          TASK_WATCHDOG_RETRY_MS) {
    setupTaskWatchdog();
  }
  feedTaskWatchdog();
}

bool pauseAudioCaptureTask() {
  if (audioCaptureTaskHandle == nullptr || audioCapturePausedAck == nullptr) {
    return true;
  }
  while (xSemaphoreTake(audioCapturePausedAck, 0) == pdTRUE) {
  }
  portENTER_CRITICAL(&audioCaptureStateMux);
  audioCapturePauseRequested = true;
  const bool alreadyPaused = audioCapturePaused;
  portEXIT_CRITICAL(&audioCaptureStateMux);
  if (alreadyPaused) {
    return true;
  }
  if (xSemaphoreTake(audioCapturePausedAck,
                     pdMS_TO_TICKS(AUDIO_CAPTURE_PAUSE_TIMEOUT_MS)) == pdTRUE) {
    return true;
  }
  portENTER_CRITICAL(&audioCaptureStateMux);
  audioCapturePauseRequested = false;
  portEXIT_CRITICAL(&audioCaptureStateMux);
  Serial.println("Audio capture pause acknowledgement timed out.");
  return false;
}

void resumeAudioCaptureTask() {
  portENTER_CRITICAL(&audioCaptureStateMux);
  audioCapturePauseRequested = false;
  portEXIT_CRITICAL(&audioCaptureStateMux);
}

bool beginBlockingOtaRuntime(String &failureCode) {
  if (otaInProgress) {
    failureCode = "DEVICE_BUSY_OTA";
    return false;
  }
  if (audioSessionActive) {
    failureCode = "OTA_RECORDING_ACTIVE";
    return false;
  }
  if (!pauseAudioCaptureTask()) {
    failureCode = "OTA_AUDIO_CAPTURE_PAUSE_FAILED";
    return false;
  }

  const esp_err_t watchdogStatus = esp_task_wdt_status(nullptr);
  if (watchdogStatus == ESP_OK) {
    const esp_err_t deleteResult = esp_task_wdt_delete(nullptr);
    if (deleteResult != ESP_OK) {
      resumeAudioCaptureTask();
      failureCode = "OTA_WATCHDOG_HANDOFF_FAILED";
      Serial.printf("OTA watchdog handoff failed: %s\n",
                    esp_err_to_name(deleteResult));
      return false;
    }
    otaTaskWatchdogSuspended = true;
    taskWatchdogReady = false;
  } else if (watchdogStatus != ESP_ERR_NOT_FOUND &&
             watchdogStatus != ESP_ERR_INVALID_STATE) {
    resumeAudioCaptureTask();
    failureCode = "OTA_WATCHDOG_STATE_INVALID";
    Serial.printf("OTA watchdog state check failed: %s\n",
                  esp_err_to_name(watchdogStatus));
    return false;
  }

  otaInProgress = true;
  Serial.printf(
      "Cloud OTA entered blocking runtime; loop task left built %lu second TWDT.\n",
      static_cast<unsigned long>(BUILT_TASK_WATCHDOG_TIMEOUT_SECONDS));
  return true;
}

void endBlockingOtaRuntime() {
  if (otaTaskWatchdogSuspended) {
    const esp_err_t addResult = esp_task_wdt_add(nullptr);
    taskWatchdogReady = addResult == ESP_OK;
    otaTaskWatchdogSuspended = false;
    if (!taskWatchdogReady) {
      offlineOperationalQueue.enqueueEvent(
          "watchdog.degraded", "degraded",
          static_cast<std::uint32_t>(millis()));
      Serial.printf("Task watchdog restore after OTA failed: %s\n",
                    esp_err_to_name(addResult));
    }
  }
  otaInProgress = false;
  resumeAudioCaptureTask();
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

bool hasTrustedClock() { return time(nullptr) >= TLS_CERT_TIME_FLOOR; }

void bootstrapHilTrustedClock() {
#if SMART_HEALTH_HIL_RUNTIME_CONFIG
  if (!hasTrustedClock() && SMART_HEALTH_HIL_CLOCK_EPOCH >= TLS_CERT_TIME_FLOOR) {
    timeval bootstrapTime = {
        .tv_sec = static_cast<time_t>(SMART_HEALTH_HIL_CLOCK_EPOCH),
        .tv_usec = 0,
    };
    settimeofday(&bootstrapTime, nullptr);
    if (hasTrustedClock()) {
      Serial.println("Local HIL clock bootstrap accepted; TLS validation remains enabled.");
    }
  }
#endif
}

bool synchronizeClockFromAuthenticatedServer(
    const shcare::AuthAcceptedMessage &accepted) {
  std::int64_t serverEpochMs = 0;
  if (!shcare::parseAuthAcceptedServerTimeEpochMillis(accepted,
                                                       serverEpochMs)) {
    return false;
  }
  const time_t serverEpoch = static_cast<time_t>(serverEpochMs / 1000);
  if (serverEpoch < TLS_CERT_TIME_FLOOR) {
    return false;
  }
  const timeval authenticatedTime = {
      .tv_sec = serverEpoch,
      .tv_usec = static_cast<suseconds_t>((serverEpochMs % 1000) * 1000),
  };
  settimeofday(&authenticatedTime, nullptr);
  if (!hasTrustedClock()) {
    return false;
  }
  // Commands are accepted only on an authenticated WSS session.  Anchor their
  // expiry checks to the TLS-authenticated server time and monotonic uptime so
  // a late SNTP correction cannot turn a fresh command into an expired one.
  authenticatedServerEpochBaseMs = serverEpochMs;
  authenticatedServerEpochAtUptimeMs = static_cast<uint32_t>(millis());
  return true;
}

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

const char *audioSignalStateLabel(
    shcare::AudioSlotSignalState state) {
  switch (state) {
  case shcare::AudioSlotSignalState::Detected:
    return "detected";
  case shcare::AudioSlotSignalState::Clipped:
    return "clipped";
  case shcare::AudioSlotSignalState::TooWeak:
  default:
    return "too_weak";
  }
}

const char *i2sStatusLabel() {
  if (i2sMaintenancePaused) {
    return "maintenance";
  }
  switch (i2sRuntimeState) {
  case I2sRuntimeState::Starting:
    return "starting";
  case I2sRuntimeState::Ready:
    return "ready";
  case I2sRuntimeState::Retrying:
    return "retrying";
  case I2sRuntimeState::Degraded:
  default:
    return "degraded";
  }
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
void sendAudioUdp(const int16_t *samples, const int samplesRead);

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

bool persistPendingReconnectReceipt(
    const shcare::CommandEnvelope &command,
    const String &expectedWifiSsid = "",
    const String &expectedWifiConfigProof = "") {
  if (pendingReconnectCommandReady) {
    return false;
  }
  shcare::PendingReconnectCommand candidate;
  candidate.commandId = command.id;
  candidate.correlationId = command.correlationId;
  candidate.type = command.type;
  candidate.expectedWifiSsid = expectedWifiSsid.c_str();
  candidate.expectedWifiConfigProof = expectedWifiConfigProof.c_str();
  const std::string serialized =
      shcare::serializePendingReconnectCommand(candidate);
  if (serialized.empty()) {
    return false;
  }

  devicePrefs.begin("smart-health", false);
  const size_t written =
      devicePrefs.putString("pendingCmd", serialized.c_str());
  devicePrefs.end();
  if (written == 0) {
    erasePendingReconnectReceipt();
    return false;
  }

  devicePrefs.begin("smart-health", true);
  const String persisted = devicePrefs.getString("pendingCmd", "");
  devicePrefs.end();
  if (persisted != String(serialized.c_str())) {
    erasePendingReconnectReceipt();
    return false;
  }
  pendingReconnectCommand = candidate;
  pendingReconnectCommandReady = true;
  return true;
}

bool erasePendingReconnectReceipt() {
  devicePrefs.begin("smart-health", false);
  if (devicePrefs.isKey("pendingCmd")) {
    devicePrefs.remove("pendingCmd");
  }
  devicePrefs.end();
  devicePrefs.begin("smart-health", true);
  const bool erased = !devicePrefs.isKey("pendingCmd");
  devicePrefs.end();
  if (erased) {
    pendingReconnectCommand = shcare::PendingReconnectCommand{};
    pendingReconnectCommandReady = false;
  }
  return erased;
}

bool persistPendingOtaReceipt(const shcare::CommandEnvelope &command,
                              const shcare::OtaManifest &manifest,
                              const std::string &manifestFingerprint) {
  shcare::PendingOtaReceipt candidate;
  candidate.commandId = command.id;
  candidate.correlationId = command.correlationId;
  candidate.otaId = command.id;
  candidate.firmwareVersion = manifest.firmwareVersion;
  candidate.manifestFingerprint = manifestFingerprint;
  candidate.status = "pending";
  const std::string serialized = shcare::serializePendingOtaReceipt(candidate);
  if (serialized.empty()) {
    return false;
  }
  if (pendingOtaReceiptReady) {
    // An existing receipt is a durable idempotency fence. The command handler
    // must replay or reject it; it must never turn an existing receipt into
    // authorization for a second download/flash side effect.
    return false;
  }

  if (!devicePrefs.begin("smart-health", false)) {
    return false;
  }
  const size_t written = devicePrefs.putString("pendingOta", serialized.c_str());
  devicePrefs.end();
  if (written == 0 || !devicePrefs.begin("smart-health", true)) {
    erasePendingOtaReceipt();
    return false;
  }
  const String persisted = devicePrefs.getString("pendingOta", "");
  devicePrefs.end();
  if (persisted != String(serialized.c_str())) {
    erasePendingOtaReceipt();
    return false;
  }
  pendingOtaReceipt = candidate;
  pendingOtaReceiptReady = true;
  return true;
}

bool persistPendingOtaStatus(const char *status) {
  if (!pendingOtaReceiptReady || status == nullptr || strlen(status) == 0) {
    return false;
  }
  if (pendingOtaReceipt.status == status) {
    return true;
  }
  shcare::PendingOtaReceipt candidate = pendingOtaReceipt;
  candidate.status = status;
  const std::string serialized = shcare::serializePendingOtaReceipt(candidate);
  if (serialized.empty() || !devicePrefs.begin("smart-health", false)) {
    return false;
  }
  const size_t written = devicePrefs.putString("pendingOta", serialized.c_str());
  devicePrefs.end();
  if (written == 0 || !devicePrefs.begin("smart-health", true)) {
    return false;
  }
  const String persisted = devicePrefs.getString("pendingOta", "");
  devicePrefs.end();
  if (persisted != String(serialized.c_str())) {
    return false;
  }
  pendingOtaReceipt = candidate;
  return true;
}

bool erasePendingOtaReceipt() {
  if (!devicePrefs.begin("smart-health", false)) {
    return false;
  }
  if (devicePrefs.isKey("pendingOta")) {
    devicePrefs.remove("pendingOta");
  }
  devicePrefs.end();
  if (!devicePrefs.begin("smart-health", true)) {
    return false;
  }
  const bool erased = !devicePrefs.isKey("pendingOta");
  devicePrefs.end();
  if (erased) {
    pendingOtaReceipt = shcare::PendingOtaReceipt{};
    pendingOtaReceiptReady = false;
  }
  return erased;
}

void loadPendingOtaReceipt() {
  pendingOtaReceipt = shcare::PendingOtaReceipt{};
  pendingOtaReceiptReady = false;
  if (!devicePrefs.begin("smart-health", true)) {
    return;
  }
  const String serialized = devicePrefs.getString("pendingOta", "");
  devicePrefs.end();
  if (serialized.length() == 0) {
    return;
  }
  pendingOtaReceiptReady = shcare::restorePendingOtaReceipt(
      std::string(serialized.c_str()), pendingOtaReceipt);
  if (!pendingOtaReceiptReady) {
    Serial.println("Pending OTA receipt ignored: stored data is invalid.");
    erasePendingOtaReceipt();
  }
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

  if (!SMART_HEALTH_HIL_RUNTIME_CONFIG && devicePrefs.isKey("audioHost")) {
    copyConfigValue(audioHost, sizeof(audioHost),
                    devicePrefs.getString("audioHost", ""));
  }

  if (!SMART_HEALTH_HIL_RUNTIME_CONFIG && devicePrefs.isKey("backendHost")) {
    copyConfigValue(backendHost, sizeof(backendHost),
                    devicePrefs.getString("backendHost", ""));
  } else if (strlen(backendHost) == 0 && strlen(audioHost) > 0) {
    copyConfigValue(backendHost, sizeof(backendHost), audioHost);
  }

  if (devicePrefs.isKey("deviceName")) {
    copyConfigValue(deviceName, sizeof(deviceName),
                    devicePrefs.getString("deviceName", ""));
  }

  if (!SMART_HEALTH_HIL_RUNTIME_CONFIG && devicePrefs.isKey("deviceId")) {
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

  if (!SMART_HEALTH_HIL_RUNTIME_CONFIG && devicePrefs.isKey("deviceSecret")) {
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

  const int storedUdpPort = SMART_HEALTH_HIL_RUNTIME_CONFIG
                                ? SMART_HEALTH_AUDIO_UDP_PORT
                                : devicePrefs.getInt(
                                      "udpPort", SMART_HEALTH_AUDIO_UDP_PORT);
  if (storedUdpPort > 0 && storedUdpPort <= 65535) {
    audioUdpPort = storedUdpPort;
  }

  const int storedBackendPort = SMART_HEALTH_HIL_RUNTIME_CONFIG
                                    ? SMART_HEALTH_BACKEND_PORT
                                    : devicePrefs.getInt(
                                          "backendPort", SMART_HEALTH_BACKEND_PORT);
  if (storedBackendPort > 0 && storedBackendPort <= 65535) {
    backendPort = storedBackendPort;
  }
  if (!SMART_HEALTH_HIL_RUNTIME_CONFIG) {
    backendUseTls = devicePrefs.getBool("backendTls", backendUseTls);
  }
  deviceLocked = devicePrefs.getBool("deviceLocked", false);
  const String persistedCommandJournal =
      devicePrefs.getString("cmdJournal", "");
  if (persistedCommandJournal.length() > 0 &&
      !commandJournal.restore(
          std::string(persistedCommandJournal.c_str()))) {
    Serial.println(
        "Command journal ignored: stored data is invalid or incompatible.");
  }
  const String persistedPendingCommand =
      devicePrefs.getString("pendingCmd", "");
  bool invalidPendingCommand = false;
  pendingReconnectCommand = shcare::PendingReconnectCommand{};
  pendingReconnectCommandReady = false;
  if (persistedPendingCommand.length() > 0) {
    pendingReconnectCommandReady =
        shcare::restorePendingReconnectCommand(
            std::string(persistedPendingCommand.c_str()),
            pendingReconnectCommand);
    invalidPendingCommand = !pendingReconnectCommandReady;
    if (pendingReconnectCommandReady) {
      Serial.print("Pending reconnect command restored: ");
      Serial.println(pendingReconnectCommand.type.c_str());
    } else {
      Serial.println(
          "Pending reconnect command ignored: stored receipt is invalid.");
    }
  }

  devicePrefs.end();

  if (invalidPendingCommand) {
    erasePendingReconnectReceipt();
  }

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
                             const char *result,
                             const std::string &effectFingerprint = {}) {
  shcare::CommandJournal candidate = commandJournal;
  shcare::CommandJournalEntry entry;
  entry.commandId = command.id;
  entry.correlationId = command.correlationId;
  entry.type = command.type;
  entry.state = state == nullptr ? "failed" : state;
  entry.code = code == nullptr ? "COMMAND_FAILED" : code;
  entry.result = result == nullptr ? "" : result;
  entry.effectFingerprint = effectFingerprint;
  if (!candidate.recordTerminal(entry) ||
      !persistCommandJournalSnapshot(candidate)) {
    return false;
  }
  commandJournal = candidate;
  return true;
}

String buildSetupPage(const char *message) {
  String page =
      F("<!doctype html><html lang=\"vi\"><head><meta charset=\"utf-8\">"
        "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
        "<title>Shcare - Kết nối Wi-Fi</title><style>"
        ":root{color-scheme:light dark;--bg:#f4f8fb;--surface:#fff;--text:#102a43;--muted:#52677a;--border:#d8e3ea;--primary:#2457d6;--focus:#087f75;--soft:#eef4f8}"
        "*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:var(--bg);color:var(--text)}"
        ".wrap{max-width:560px;margin:0 auto;padding:24px 16px 40px}"
        ".brand{font-size:15px;font-weight:700;color:var(--primary);margin:0 0 14px}.panel{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:24px}"
        ".grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:20px 0}.kv{background:var(--soft);border-radius:9px;padding:11px;font-size:13px;overflow-wrap:anywhere}"
        "h1{font-size:26px;line-height:1.2;margin:0 0 10px;letter-spacing:-.02em}p{line-height:1.55;color:var(--muted)}label{display:block;font-weight:650;margin:18px 0 7px}"
        "input{width:100%;min-height:48px;padding:11px 12px;border:1px solid var(--border);border-radius:9px;background:var(--surface);color:var(--text);font-size:16px}input:focus-visible,button:focus-visible{outline:3px solid var(--focus);outline-offset:2px}"
        "button{display:block;width:100%;min-height:48px;margin-top:22px;padding:12px 16px;border:0;border-radius:9px;background:var(--primary);color:#fff;font-size:16px;font-weight:700}.msg{padding:11px 12px;background:#fff5db;border:1px solid #e6b85c;border-radius:9px;color:#6f4300}.hint{font-size:13px;color:var(--muted)}"
        "@media(max-width:420px){.grid{grid-template-columns:1fr}.panel{padding:20px}}@media(prefers-color-scheme:dark){:root{--bg:#071722;--surface:#0d2533;--text:#edf6fb;--muted:#b5c8d3;--border:#294554;--primary:#7fa4ff;--focus:#55c8bb;--soft:#132f3e}.msg{background:#3b2d11;border-color:#8b6824;color:#ffe3a4}button{background:#5f82e5;color:#fff}}</style></head><body><main class=\"wrap\"><p class=\"brand\">Shcare - Smart Health Care</p><section class=\"panel\">"
        "<h1>Kết nối thiết bị với Wi-Fi</h1>"
        "<p>Trang cục bộ này chỉ gửi Wi-Fi cho thiết bị Shcare. Trang không thể thay đổi quyền sở hữu, khóa thiết bị, máy chủ hoặc chính sách cập nhật.</p>");

  if (message != NULL && strlen(message) > 0) {
    page += F("<div class=\"msg\">");
    page += htmlEscape(message);
    page += F("</div>");
  }

  page += F("<div class=\"grid\"><div class=\"kv\"><b>Chế độ</b><br>");
  page += setupPortalActive ? "Thiết lập Wi-Fi" : "Đã kết nối Wi-Fi";
  page += F("</div><div class=\"kv\"><b>Địa chỉ cục bộ</b><br>");
  page += WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString()
                                        : setupPortalIp.toString();
  page += F("</div><div class=\"kv\"><b>Mã thiết bị</b><br>");
  page += htmlEscape(deviceId);
  page += F("</div><div class=\"kv\"><b>Shcare Cloud</b><br>");
  page += cloudConnected ? "Đã kết nối" : "Đang chờ mạng";
  page += F("</div></div>");

  page += F("<form method=\"post\" action=\"/save\"><input type=\"hidden\" name=\"csrf\" value=\"");
  page += htmlEscape(setupPortalCsrfToken.c_str());
  page += F("\">"
            "<label for=\"ssid\">Tên Wi-Fi</label><input id=\"ssid\" name=\"ssid\" required autocomplete=\"off\" value=\"");
  page += htmlEscape(wifiSsid);
  page += F("\"><label for=\"pass\">Mật khẩu Wi-Fi</label><input id=\"pass\" name=\"pass\" type=\"password\" autocomplete=\"new-password\" value=\"\">"
            "<div class=\"hint\">Mật khẩu đã lưu không bao giờ được hiển thị lại. Để trống chỉ khi Wi-Fi không có mật khẩu.</div>");
  page += F("<button type=\"submit\">Lưu và kết nối</button></form>"
            "<p class=\"hint\">Thiết bị sẽ khởi động lại, kết nối Wi-Fi vừa nhập và chỉ báo hoàn tất trong App sau khi đăng nhập Shcare Cloud thành công.</p>"
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

void sendSetupJson(int status, const String &body) {
  sendSetupSecurityHeaders();
  setupServer.send(status, "application/json", body);
}

void sendSetupApiError(int status, const char *code, const char *message) {
  String body = "{\"code\":\"";
  body += jsonEscape(code == NULL ? "SETUP_ERROR" : code);
  body += "\",\"message\":\"";
  body += jsonEscape(message == NULL ? "Setup request failed." : message);
  body += "\"}";
  sendSetupJson(status, body);
}

bool persistSetupWifi(const String &ssid, const String &pass) {
  const String previousSsid = wifiSsid;
  const String previousPassword = wifiPass;
  copyConfigValue(wifiSsid, sizeof(wifiSsid), ssid);
  copyConfigValue(wifiPass, sizeof(wifiPass), pass, false);
  if (saveRuntimeConfig()) {
    return true;
  }
  copyConfigValue(wifiSsid, sizeof(wifiSsid), previousSsid);
  copyConfigValue(wifiPass, sizeof(wifiPass), previousPassword, false);
  return false;
}

void handleSetupRoot() {
  sendSetupHtml(200, buildSetupPage(setupPortalReason.c_str()));
}

void handleSetupSave() {
  if (shcare::setupPortalExpired(
          static_cast<std::uint32_t>(millis()),
          static_cast<std::uint32_t>(setupPortalStartedAtMs),
          static_cast<std::uint32_t>(SETUP_PORTAL_TTL_MS))) {
    sendSetupHtml(410, buildSetupPage("Phiên thiết lập đã hết hạn. Hãy mở lại chế độ ghép thiết bị rồi thử lại."));
    return;
  }

  const String providedCsrf = setupServer.arg("csrf");
  if (!shcare::validSetupPortalCsrf(
          std::string(setupPortalCsrfToken.c_str()),
          std::string(providedCsrf.c_str()))) {
    sendSetupHtml(403, buildSetupPage("Phiên thiết lập không hợp lệ. Hãy kết nối lại với thiết bị."));
    return;
  }

  String ssid = setupServer.arg("ssid");
  String pass = setupServer.arg("pass");

  ssid.trim();

  if (!shcare::validWifiCredentials(
          std::string(ssid.c_str()), std::string(pass.c_str()))) {
    sendSetupHtml(
        400,
        buildSetupPage(
            "Tên Wi-Fi phải dài 1-32 byte. Mật khẩu WPA phải dài 8-63 ký tự hoặc để trống với mạng mở."));
    return;
  }

  if (!persistSetupWifi(ssid, pass)) {
    sendSetupHtml(
        500, buildSetupPage("Không thể lưu cấu hình Wi-Fi. Vui lòng thử lại."));
    return;
  }

  sendSetupHtml(
      200,
      F("<!doctype html><html lang=\"vi\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
        "<title>Shcare - Đã nhận Wi-Fi</title><style>:root{color-scheme:light dark;--bg:#f4f8fb;--surface:#fff;--text:#102a43;--muted:#52677a;--border:#d8e3ea;--success:#18794e}"
        "*{box-sizing:border-box}body{margin:0;padding:24px 16px;background:var(--bg);color:var(--text);font-family:system-ui,-apple-system,Segoe UI,sans-serif}.panel{max-width:520px;margin:0 auto;padding:24px;border:1px solid var(--border);border-radius:14px;background:var(--surface)}"
        ".brand{font-size:15px;font-weight:700;color:#2457d6}.status{color:var(--success)}p{line-height:1.55;color:var(--muted)}@media(prefers-color-scheme:dark){:root{--bg:#071722;--surface:#0d2533;--text:#edf6fb;--muted:#b5c8d3;--border:#294554;--success:#66d3a3}.brand{color:#7fa4ff}}</style></head>"
        "<body><main class=\"panel\"><p class=\"brand\">Shcare - Smart Health Care</p><h1 class=\"status\">Đã nhận thông tin Wi-Fi</h1>"
        "<p>Thiết bị đang khởi động lại và kết nối mạng. Hãy quay lại ứng dụng Shcare; ứng dụng chỉ báo hoàn tất sau khi thiết bị đăng nhập Shcare Cloud thành công.</p></main></body></html>"));
  delay(1200);
  ESP.restart();
}

void handleSetupSessionJson() {
  if (!setupPortalActive) {
    sendSetupApiError(403, "SETUP_PORTAL_INACTIVE",
                      "The local setup portal is not active.");
    return;
  }
  const std::uint32_t nowMs = static_cast<std::uint32_t>(millis());
  const std::uint32_t startedAtMs =
      static_cast<std::uint32_t>(setupPortalStartedAtMs);
  if (shcare::setupPortalExpired(
          nowMs, startedAtMs,
          static_cast<std::uint32_t>(SETUP_PORTAL_TTL_MS))) {
    sendSetupApiError(410, "SETUP_SESSION_EXPIRED",
                      "The local setup session has expired.");
    return;
  }
  const std::uint32_t elapsedMs = nowMs - startedAtMs;
  const std::uint32_t remainingMs =
      elapsedMs >= SETUP_PORTAL_TTL_MS ? 0 : SETUP_PORTAL_TTL_MS - elapsedMs;
  const std::uint32_t expiresInSeconds =
      std::max<std::uint32_t>(1U, remainingMs / 1000U);
  String body = "{\"protocolVersion\":1,\"deviceId\":\"";
  body += jsonEscape(deviceId);
  body += "\",\"csrfToken\":\"";
  body += jsonEscape(setupPortalCsrfToken.c_str());
  body += "\",\"expiresInSeconds\":";
  body += String(expiresInSeconds);
  body += "}";
  sendSetupJson(200, body);
}

void handleSetupWifiJson() {
  if (!setupPortalActive) {
    sendSetupApiError(403, "SETUP_PORTAL_INACTIVE",
                      "The local setup portal is not active.");
    return;
  }
  if (shcare::setupPortalExpired(
          static_cast<std::uint32_t>(millis()),
          static_cast<std::uint32_t>(setupPortalStartedAtMs),
          static_cast<std::uint32_t>(SETUP_PORTAL_TTL_MS))) {
    sendSetupApiError(410, "SETUP_SESSION_EXPIRED",
                      "The local setup session has expired.");
    return;
  }

  String rawBody = setupServer.arg("plain");
  auto parsed = shcare::parseSetupWifiProvisioningRequest(
      std::string(rawBody.c_str()), std::string(deviceId),
      std::string(setupPortalCsrfToken.c_str()));
  for (size_t index = 0; index < rawBody.length(); ++index) {
    rawBody.setCharAt(index, '\0');
  }
  rawBody = "";

  if (!parsed.ok()) {
    const auto code = parsed.code;
    if (code == shcare::SetupWifiProvisioningParseCode::InvalidSession) {
      sendSetupApiError(403, "SETUP_SESSION_INVALID",
                        "The local setup session is invalid.");
    } else if (code ==
               shcare::SetupWifiProvisioningParseCode::PayloadTooLarge) {
      sendSetupApiError(413, "SETUP_PAYLOAD_TOO_LARGE",
                        "The local setup payload is too large.");
    } else {
      sendSetupApiError(400, "SETUP_PAYLOAD_INVALID",
                        "The local WiFi setup payload is invalid.");
    }
    return;
  }

  String ssid(parsed.request.ssid.c_str());
  String pass(parsed.request.password.c_str());
  std::fill(parsed.request.password.begin(), parsed.request.password.end(),
            '\0');
  parsed.request.password.clear();
  if (!persistSetupWifi(ssid, pass)) {
    for (size_t index = 0; index < pass.length(); ++index) {
      pass.setCharAt(index, '\0');
    }
    sendSetupApiError(500, "SETUP_STORAGE_FAILED",
                      "The WiFi configuration could not be stored.");
    return;
  }
  for (size_t index = 0; index < pass.length(); ++index) {
    pass.setCharAt(index, '\0');
  }
  pass = "";

  String response = "{\"protocolVersion\":1,\"accepted\":true,\"deviceId\":\"";
  response += jsonEscape(deviceId);
  response += "\",\"nextState\":\"restarting\"}";
  sendSetupJson(202, response);
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
  setupServer.on("/api/v1/setup/session", HTTP_GET,
                 handleSetupSessionJson);
  setupServer.on("/api/v1/setup/wifi", HTTP_POST, handleSetupWifiJson);
  setupServer.onNotFound(handleConfigNotFound);
  setupServer.begin();
  configServerStarted = true;

  Serial.println("Smart Health WiFi recovery server ready on port 80.");
}

void stopSetupPortal() {
  if (configServerStarted) setupServer.stop();
  setupDns.stop();
  WiFi.softAPdisconnect(true);
  setupPortalActive = false;
  configServerStarted = false;
  setupPortalCsrfToken = "";
}

void runSetupPortal(const char *reason) {
  if (setupPortalActive) return;
  if (!shcare::setupPortalAllowed(hasWiFiConfig(), setupPortalPhysicalGesture,
                                  false)) {
    Serial.println("WiFi recovery AP remains closed without a physical setup gesture.");
    return;
  }
  if (!shcare::validCanonicalDeviceId(std::string(deviceId)) ||
      strlen(deviceSecret) < 16) {
    Serial.println("WiFi recovery AP remains closed: device identity is unavailable.");
    return;
  }

  WiFi.disconnect(false);
  WiFi.mode(WIFI_AP);
  WiFi.softAPConfig(setupPortalIp, setupPortalGateway, setupPortalSubnet);
  shcare::SetupAccessPointCredentials apCredentials =
      shcare::deriveSetupAccessPointFromSecret(std::string(deviceId),
                                                std::string(deviceSecret));
  if (!apCredentials.ok()) {
    Serial.println("WiFi recovery AP remains closed: credential derivation failed.");
    return;
  }
  String apName(apCredentials.ssid.c_str());
  String apPassword(apCredentials.password.c_str());
  std::fill(apCredentials.password.begin(), apCredentials.password.end(), '\0');
  apCredentials.password.clear();
  const bool accessPointStarted = WiFi.softAP(apName.c_str(), apPassword.c_str());
  for (size_t index = 0; index < apPassword.length(); ++index) apPassword.setCharAt(index, '\0');
  apPassword = "";
  if (!accessPointStarted) {
    Serial.println("Cannot start physical WiFi recovery access point.");
    return;
  }
  setupPortalCsrfToken = generateSetupPortalCsrfToken();
  setupPortalStartedAtMs = millis();
  setupDns.start(SETUP_DNS_PORT, "*", setupPortalIp);
  startConfigWebServer(true, reason);
  Serial.println("Physical WiFi recovery portal started; it expires automatically.");
}

void handleSetupPortal() {
  if (!setupPortalActive) return;
  if (shcare::setupPortalExpired(static_cast<std::uint32_t>(millis()),
                                 static_cast<std::uint32_t>(setupPortalStartedAtMs),
                                 static_cast<std::uint32_t>(SETUP_PORTAL_TTL_MS))) {
    Serial.println("Physical WiFi recovery session expired; access point is shutting down.");
    stopSetupPortal();
    return;
  }
  setupDns.processNextRequest();
  setupServer.handleClient();
}

bool deriveSmartConfigV2MaterialForIdentity(const char *canonicalDeviceId,
                                            const char *rawDeviceSecret,
                                            uint8_t provisioningKey[16],
                                            char expectedBinding[36]) {
  if (canonicalDeviceId == nullptr || rawDeviceSecret == nullptr ||
      provisioningKey == nullptr || expectedBinding == nullptr ||
      !shcare::validCanonicalDeviceId(std::string(canonicalDeviceId)) ||
      strlen(rawDeviceSecret) < 16) {
    return false;
  }
  uint8_t verificationKey[32] = {0};
  uint8_t derivedKey[32] = {0};
  uint8_t bindingDigest[32] = {0};
  const String keyDomain = String("shcare/esptouch-v2/aes128\n") + canonicalDeviceId;
  const String bindingDomain = String("shcare/esptouch-v2/device\n") + canonicalDeviceId;
  const mbedtls_md_info_t *sha256 =
      mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  const bool verified = mbedtls_sha256_ret(
                            reinterpret_cast<const unsigned char *>(rawDeviceSecret),
                            strlen(rawDeviceSecret), verificationKey, 0) == 0 &&
                        sha256 != nullptr &&
                        mbedtls_md_hmac(
                            sha256, verificationKey, sizeof(verificationKey),
                            reinterpret_cast<const unsigned char *>(keyDomain.c_str()),
                            keyDomain.length(), derivedKey) == 0 &&
                        mbedtls_sha256_ret(
                            reinterpret_cast<const unsigned char *>(bindingDomain.c_str()),
                            bindingDomain.length(), bindingDigest, 0) == 0;
  if (verified) {
    memcpy(provisioningKey, derivedKey, 16);
    constexpr char kHex[] = "0123456789abcdef";
    expectedBinding[0] = 'v';
    expectedBinding[1] = '2';
    expectedBinding[2] = ':';
    for (size_t index = 0; index < 16; ++index) {
      expectedBinding[3 + (index * 2)] = kHex[(bindingDigest[index] >> 4) & 0x0f];
      expectedBinding[4 + (index * 2)] = kHex[bindingDigest[index] & 0x0f];
    }
    expectedBinding[35] = '\0';
  }
  memset(verificationKey, 0, sizeof(verificationKey));
  memset(derivedKey, 0, sizeof(derivedKey));
  memset(bindingDigest, 0, sizeof(bindingDigest));
  return verified;
}

bool deriveSmartConfigV2Material(uint8_t provisioningKey[16],
                                 char expectedBinding[36]) {
  return deriveSmartConfigV2MaterialForIdentity(
      deviceId, deviceSecret, provisioningKey, expectedBinding);
}

#if SMART_HEALTH_HIL_EXPECTED_IDENTITY_CHECK
bool hilExpectedIdentityMatchesPersisted() {
  if (!shcare::validCanonicalDeviceId(std::string(DEFAULT_DEVICE_ID)) ||
      !shcare::validCanonicalDeviceId(std::string(deviceId)) ||
      strlen(DEFAULT_DEVICE_SECRET) < 16 || strlen(deviceSecret) < 16) {
    return false;
  }
  uint8_t expectedDigest[32] = {0};
  uint8_t persistedDigest[32] = {0};
  const bool hashed =
      mbedtls_sha256_ret(
          reinterpret_cast<const unsigned char *>(DEFAULT_DEVICE_SECRET),
          strlen(DEFAULT_DEVICE_SECRET), expectedDigest, 0) == 0 &&
      mbedtls_sha256_ret(
          reinterpret_cast<const unsigned char *>(deviceSecret),
          strlen(deviceSecret), persistedDigest, 0) == 0;
  uint8_t difference = 0;
  for (size_t index = 0; index < sizeof(expectedDigest); ++index) {
    difference |= expectedDigest[index] ^ persistedDigest[index];
  }
  memset(expectedDigest, 0, sizeof(expectedDigest));
  memset(persistedDigest, 0, sizeof(persistedDigest));
  return hashed && difference == 0 && String(DEFAULT_DEVICE_ID) == String(deviceId);
}
#endif

bool smartConfigV2GoldenVectorMatches() {
  // This non-secret fixture is shared with the JavaScript/Kotlin contract.
  constexpr char kFixtureDeviceId[] = "dev_alpha";
  constexpr char kFixtureRawSecret[] = "0123456789abcdef0123456789abcdef";
  constexpr uint8_t kExpectedKey[16] = {
      0x0b, 0x0b, 0xeb, 0x38, 0x35, 0xec, 0x3e, 0x93,
      0xfd, 0x94, 0x5c, 0xf6, 0x12, 0x16, 0x84, 0x29,
  };
  constexpr char kExpectedBinding[] = "v2:ec1ed31a41a7430defd880bc96532810";
  uint8_t derivedKey[16] = {0};
  char derivedBinding[36] = {0};
  const bool derived = deriveSmartConfigV2MaterialForIdentity(
      kFixtureDeviceId, kFixtureRawSecret, derivedKey, derivedBinding);
  uint8_t difference = 0;
  for (size_t index = 0; index < sizeof(derivedKey); ++index) {
    difference |= derivedKey[index] ^ kExpectedKey[index];
  }
  for (size_t index = 0; index < sizeof(derivedBinding); ++index) {
    difference |= derivedBinding[index] ^ kExpectedBinding[index];
  }
  memset(derivedKey, 0, sizeof(derivedKey));
  memset(derivedBinding, 0, sizeof(derivedBinding));
  return derived && difference == 0;
}

enum class SmartConfigBindingLayout : uint8_t {
  Exact,
  LeadingProtocolByteStripped,
  LeadingPaddingByteAdded,
  Different,
};

SmartConfigBindingLayout inspectSmartConfigBinding(const uint8_t received[65]) {
  if (received == nullptr) return SmartConfigBindingLayout::Different;
  uint8_t difference = 0;
  for (size_t index = 0; index < sizeof(smartConfigExpectedBinding) - 1; ++index) {
    difference |= received[index] ^ static_cast<uint8_t>(smartConfigExpectedBinding[index]);
  }
  if (difference == 0) return SmartConfigBindingLayout::Exact;

  // The diagnostic only reports a layout class, never reserved-data bytes.
  // It distinguishes an IDF/client framing change from a wrong-device attack.
  uint8_t strippedDifference = 0;
  uint8_t paddedDifference = 0;
  for (size_t index = 0; index < sizeof(smartConfigExpectedBinding) - 2; ++index) {
    strippedDifference |= received[index] ^ static_cast<uint8_t>(smartConfigExpectedBinding[index + 1]);
    paddedDifference |= received[index + 1] ^ static_cast<uint8_t>(smartConfigExpectedBinding[index]);
  }
  if (strippedDifference == 0) {
    return SmartConfigBindingLayout::LeadingProtocolByteStripped;
  }
  if (paddedDifference == 0) {
    return SmartConfigBindingLayout::LeadingPaddingByteAdded;
  }
  return SmartConfigBindingLayout::Different;
}

void clearSmartConfigSensitiveMaterial() {
  memset(smartConfigProvisioningKey, 0, sizeof(smartConfigProvisioningKey));
  memset(smartConfigExpectedBinding, 0, sizeof(smartConfigExpectedBinding));
  memset(smartConfigCandidateSsid, 0, sizeof(smartConfigCandidateSsid));
  memset(smartConfigCandidatePassword, 0, sizeof(smartConfigCandidatePassword));
  smartConfigCandidateReady = false;
  smartConfigCandidateBindingValid = false;
  smartConfigCandidateValidationReported = false;
}

void handleSmartConfigEvent(arduino_event_t *event) {
  if (event == nullptr || !smartConfigActive) {
    return;
  }
  if (event->event_id == ARDUINO_EVENT_SC_FOUND_CHANNEL) {
    // This proves that the ESP radio can hear the ESPTouch broadcast, without
    // revealing the target SSID, password, provisioning key or binding.
    // It lets field HIL distinguish RF/router multicast isolation from a
    // cryptographic binding rejection before a customer is asked to retry.
    Serial.println("ESPTouch V2 signal detected on a target WiFi channel.");
    return;
  }
  if (event->event_id != ARDUINO_EVENT_SC_GOT_SSID_PSWD) {
    return;
  }
  const auto &credential = event->event_info.sc_got_ssid_pswd;
  memcpy(smartConfigCandidateSsid, credential.ssid,
         std::min(sizeof(smartConfigCandidateSsid) - 1, sizeof(credential.ssid)));
  memcpy(smartConfigCandidatePassword, credential.password,
         std::min(sizeof(smartConfigCandidatePassword) - 1, sizeof(credential.password)));
  uint8_t receivedBinding[65] = {0};
  const esp_err_t reservedResult =
      esp_smartconfig_get_rvd_data(receivedBinding, sizeof(receivedBinding));
  const SmartConfigBindingLayout bindingLayout =
      reservedResult == ESP_OK ? inspectSmartConfigBinding(receivedBinding)
                               : SmartConfigBindingLayout::Different;
  smartConfigCandidateBindingValid = bindingLayout == SmartConfigBindingLayout::Exact;
  if (!smartConfigCandidateBindingValid) {
    switch (bindingLayout) {
      case SmartConfigBindingLayout::LeadingProtocolByteStripped:
        Serial.println("ESPTouch V2 reserved-data layout: leading protocol byte was stripped.");
        break;
      case SmartConfigBindingLayout::LeadingPaddingByteAdded:
        Serial.println("ESPTouch V2 reserved-data layout: leading padding byte was added.");
        break;
      case SmartConfigBindingLayout::Different:
        Serial.println("ESPTouch V2 reserved-data layout: binding differs from this device.");
        break;
      case SmartConfigBindingLayout::Exact:
        break;
    }
  }
  memset(receivedBinding, 0, sizeof(receivedBinding));
  smartConfigCandidateReady = true;
}

void handleWifiDiagnosticEvent(arduino_event_t *event) {
  if (event == nullptr ||
      event->event_id != ARDUINO_EVENT_WIFI_STA_DISCONNECTED) {
    return;
  }
  // The numeric reason is enough to distinguish router rejection, an absent
  // AP and radio/authentication failures. Never log SSID or password values.
  Serial.print("WiFi station connection failed; reason=");
  Serial.println(event->event_info.wifi_sta_disconnected.reason);
}

void registerWifiDiagnosticEvent() {
  if (wifiDiagnosticEventRegistered) return;
  WiFi.onEvent(handleWifiDiagnosticEvent, ARDUINO_EVENT_WIFI_STA_DISCONNECTED);
  wifiDiagnosticEventRegistered = true;
}

bool startSmartConfigProvisioning(const char *reason) {
  if (smartConfigActive) return true;
  if (!smartConfigKdfVerified) {
    Serial.println("ESPTouch V2 listener remains closed: KDF self-test failed.");
    return false;
  }
  if (setupPortalActive) stopSetupPortal();
  clearSmartConfigSensitiveMaterial();
  if (!deriveSmartConfigV2Material(
          reinterpret_cast<uint8_t *>(smartConfigProvisioningKey),
          smartConfigExpectedBinding)) {
    Serial.println("ESPTouch V2 listener was not opened: device identity is unavailable.");
    clearSmartConfigSensitiveMaterial();
    return false;
  }
  if (!smartConfigEventRegistered) {
    WiFi.onEvent(handleSmartConfigEvent, ARDUINO_EVENT_SC_FOUND_CHANNEL);
    WiFi.onEvent(handleSmartConfigEvent, ARDUINO_EVENT_SC_GOT_SSID_PSWD);
    smartConfigEventRegistered = true;
  }
  WiFi.persistent(false);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  if (!WiFi.beginSmartConfig(SC_TYPE_ESPTOUCH_V2, smartConfigProvisioningKey)) {
    clearSmartConfigSensitiveMaterial();
    Serial.println("ESPTouch V2 listener failed to start.");
    return false;
  }
  smartConfigActive = true;
  smartConfigStartedAtMs = millis();
  Serial.print("ESPTouch V2 listener opened");
  if (reason != nullptr && strlen(reason) > 0) {
    Serial.print(": ");
    Serial.print(reason);
  }
  Serial.println();
  return true;
}

void stopSmartConfigProvisioning(const bool retry) {
  if (smartConfigActive) WiFi.stopSmartConfig();
  smartConfigActive = false;
  clearSmartConfigSensitiveMaterial();
  smartConfigNextAttemptAtMs = retry ? millis() + 3000UL : 0;
}

void handleSmartConfigProvisioning() {
  if (!smartConfigActive) {
    if (!hasWiFiConfig() && smartConfigNextAttemptAtMs > 0 &&
        static_cast<long>(millis() - smartConfigNextAttemptAtMs) >= 0) {
      startSmartConfigProvisioning("retrying encrypted WiFi configuration");
    }
    return;
  }
  if (smartConfigCandidateReady) {
    if (!smartConfigCandidateBindingValid) {
      Serial.println("ESPTouch V2 credential rejected: device binding mismatch.");
      WiFi.disconnect(false);
      stopSmartConfigProvisioning(!hasWiFiConfig());
      return;
    }
    if (!smartConfigCandidateValidationReported) {
      // Safe HIL milestone: the encrypted packet was decrypted and bound to
      // this device.  Never include SSID, password, key or binding bytes.
      Serial.println("ESPTouch V2 credentials decrypted and device binding accepted; awaiting WiFi association.");
      smartConfigCandidateValidationReported = true;
    }
    if (WiFi.status() == WL_CONNECTED) {
      const bool persisted = persistSetupWifi(
          String(smartConfigCandidateSsid), String(smartConfigCandidatePassword));
      if (persisted) {
        Serial.println("ESPTouch V2 WiFi association and DHCP succeeded; configuration saved.");
        smartConfigActive = false;
        clearSmartConfigSensitiveMaterial();
        smartConfigNextAttemptAtMs = 0;
      } else {
        Serial.println("ESPTouch V2 WiFi configuration was not saved; previous network is retained.");
        WiFi.disconnect(false);
        stopSmartConfigProvisioning(!hasWiFiConfig());
      }
      return;
    }
  }
  if (millis() - smartConfigStartedAtMs >= 120000UL) {
    Serial.println("ESPTouch V2 listener timed out without a valid WiFi association.");
    WiFi.disconnect(false);
    stopSmartConfigProvisioning(!hasWiFiConfig());
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
  if (cloudConnected &&
      authenticatedServerEpochBaseMs >=
          static_cast<int64_t>(TLS_CERT_TIME_FLOOR) * 1000) {
    const uint32_t elapsedMs = static_cast<uint32_t>(
        static_cast<uint32_t>(millis()) - authenticatedServerEpochAtUptimeMs);
    return authenticatedServerEpochBaseMs + static_cast<int64_t>(elapsedMs);
  }
  const time_t now = time(nullptr);
  if (now < 1700000000) {
    return 0;
  }
  return static_cast<int64_t>(now) * 1000;
}

std::uint32_t nextAudioSessionGeneration(const std::uint32_t current) {
  return current == UINT32_MAX ? 1U : current + 1U;
}

std::uint32_t currentAudioSessionGeneration() {
  portENTER_CRITICAL(&audioCaptureStateMux);
  const std::uint32_t generation = audioSessionGeneration;
  portEXIT_CRITICAL(&audioCaptureStateMux);
  return generation;
}

void resetAudioSession() {
  portENTER_CRITICAL(&audioCaptureStateMux);
  audioSessionActive = false;
  audioSessionGeneration = nextAudioSessionGeneration(audioSessionGeneration);
  audioCaptureOrdinal = 0;
  portEXIT_CRITICAL(&audioCaptureStateMux);
  if (audioCaptureQueue != nullptr) {
    xQueueReset(audioCaptureQueue);
  }
  audioDiscontinuityPending = false;
  audioSequence = 0;
  nextExpectedCaptureOrdinal = 0;
  nextExpectedCaptureOrdinalReady = false;
  activeAudioSessionId = "";
  activeAudioScanId = "";
}

void activateAudioSessionCapture() {
  if (audioCaptureQueue != nullptr) {
    xQueueReset(audioCaptureQueue);
  }
  portENTER_CRITICAL(&audioCaptureStateMux);
  audioSessionGeneration = nextAudioSessionGeneration(audioSessionGeneration);
  audioCaptureOrdinal = 0;
  audioSessionActive = true;
  portEXIT_CRITICAL(&audioCaptureStateMux);
  audioDiscontinuityPending = false;
  audioSequence = 0;
  nextExpectedCaptureOrdinal = 0;
  nextExpectedCaptureOrdinalReady = false;
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

String buildWifiConfigProof(const String &ssid, const String &password) {
  if (ssid.length() == 0 || strlen(deviceSecret) == 0) {
    return "";
  }
  const mbedtls_md_info_t *sha256 =
      mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  if (sha256 == nullptr) {
    return "";
  }
  const char label[] = "SHCARE-WIFI-CONFIG-V1";
  const auto writeLength = [](size_t length, uint8_t output[4]) {
    output[0] = static_cast<uint8_t>((length >> 24) & 0xffU);
    output[1] = static_cast<uint8_t>((length >> 16) & 0xffU);
    output[2] = static_cast<uint8_t>((length >> 8) & 0xffU);
    output[3] = static_cast<uint8_t>(length & 0xffU);
  };
  uint8_t ssidLength[4];
  uint8_t passwordLength[4];
  uint8_t proof[32];
  writeLength(ssid.length(), ssidLength);
  writeLength(password.length(), passwordLength);

  mbedtls_md_context_t context;
  mbedtls_md_init(&context);
  int result = mbedtls_md_setup(&context, sha256, 1);
  if (result == 0) {
    result = mbedtls_md_hmac_starts(
        &context, reinterpret_cast<const unsigned char *>(deviceSecret),
        strlen(deviceSecret));
  }
  if (result == 0) {
    result = mbedtls_md_hmac_update(
        &context, reinterpret_cast<const unsigned char *>(label),
        sizeof(label) - 1);
  }
  if (result == 0) {
    result = mbedtls_md_hmac_update(&context, ssidLength,
                                    sizeof(ssidLength));
  }
  if (result == 0) {
    result = mbedtls_md_hmac_update(
        &context, reinterpret_cast<const unsigned char *>(ssid.c_str()),
        ssid.length());
  }
  if (result == 0) {
    result = mbedtls_md_hmac_update(&context, passwordLength,
                                    sizeof(passwordLength));
  }
  if (result == 0 && password.length() > 0) {
    result = mbedtls_md_hmac_update(
        &context, reinterpret_cast<const unsigned char *>(password.c_str()),
        password.length());
  }
  if (result == 0) {
    result = mbedtls_md_hmac_finish(&context, proof);
  }
  mbedtls_md_free(&context);
  if (result != 0) {
    memset(proof, 0, sizeof(proof));
    return "";
  }

  const char *hex = "0123456789abcdef";
  String encoded;
  encoded.reserve(sizeof(proof) * 2);
  for (const uint8_t value : proof) {
    encoded += hex[(value >> 4) & 0x0fU];
    encoded += hex[value & 0x0fU];
  }
  memset(proof, 0, sizeof(proof));
  return encoded;
}

bool constantTimeEquals(const String &left, const String &right) {
  if (left.length() != right.length()) {
    return false;
  }
  uint8_t difference = 0;
  for (size_t index = 0; index < left.length(); ++index) {
    difference |= static_cast<uint8_t>(left[index] ^ right[index]);
  }
  return difference == 0;
}

void setBleProvisioningStatus(const char *state, const char *code) {
  JsonDocument status;
  status["protocolVersion"] = 1;
  status["state"] = state == nullptr ? "rejected" : state;
  status["deviceId"] = deviceId;
  status["code"] = code == nullptr ? "BLE_PROVISIONING_FAILED" : code;
  String serialized;
  serializeJson(status, serialized);
  if (bleProvisioningStatusCharacteristic != nullptr) {
    bleProvisioningStatusCharacteristic->setValue(serialized.c_str());
    bleProvisioningStatusCharacteristic->notify();
  }
}

void clearBleProvisioningNonce() {
  for (size_t index = 0; index < bleProvisioningNonce.length(); ++index) {
    bleProvisioningNonce.setCharAt(index, '\0');
  }
  bleProvisioningNonce = "";
  bleProvisioningNonceIssuedAtMs = 0;
}

bool bleProvisioningNonceIsFresh() {
  return bleProvisioningNonce.length() > 0 &&
         static_cast<unsigned long>(millis() - bleProvisioningNonceIssuedAtMs) <
             BLE_PROVISIONING_NONCE_TTL_MS;
}

String createBleProvisioningChallenge() {
  uint8_t nonceBytes[16];
  for (size_t index = 0; index < sizeof(nonceBytes); index += sizeof(uint32_t)) {
    const uint32_t randomValue = esp_random();
    memcpy(nonceBytes + index, &randomValue,
           std::min(sizeof(randomValue), sizeof(nonceBytes) - index));
  }
  clearBleProvisioningNonce();
  bleProvisioningNonce = base64UrlEncode(nonceBytes, sizeof(nonceBytes));
  memset(nonceBytes, 0, sizeof(nonceBytes));
  bleProvisioningNonceIssuedAtMs = millis();

  JsonDocument challenge;
  challenge["protocolVersion"] = 1;
  challenge["deviceId"] = deviceId;
  challenge["nonce"] = bleProvisioningNonce;
  challenge["expiresInSeconds"] =
      static_cast<unsigned long>(BLE_PROVISIONING_NONCE_TTL_MS / 1000UL);
  String serialized;
  serializeJson(challenge, serialized);
  return serialized;
}

bool deriveBleProvisioningKey(const String &nonce, uint8_t key[32]) {
  if (key == nullptr || !shcare::validCanonicalDeviceId(std::string(deviceId)) ||
      strlen(deviceSecret) < 16 || nonce.length() == 0) {
    return false;
  }
  shcare::SetupAccessPointCredentials access =
      shcare::deriveSetupAccessPointFromSecret(std::string(deviceId),
                                                std::string(deviceSecret));
  if (!access.ok() || access.password.length() != 20) {
    return false;
  }
  String input = "shcare-ble-wifi-v1\n";
  input += access.password.c_str();
  input += "\n";
  input += deviceId;
  input += "\n";
  input += nonce;
  const int result = mbedtls_sha256_ret(
      reinterpret_cast<const unsigned char *>(input.c_str()), input.length(),
      key, 0);
  std::fill(access.password.begin(), access.password.end(), '\0');
  access.password.clear();
  for (size_t index = 0; index < input.length(); ++index) {
    input.setCharAt(index, '\0');
  }
  return result == 0;
}

std::string buildBleAdvertisementToken() {
  if (!shcare::validCanonicalDeviceId(std::string(deviceId))) {
    return "";
  }
  const String material = String("shcare-ble-advertisement-v1\n") + deviceId;
  uint8_t digest[32] = {0};
  const int result = mbedtls_sha256_ret(
      reinterpret_cast<const unsigned char *>(material.c_str()), material.length(),
      digest, 0);
  if (result != 0) {
    memset(digest, 0, sizeof(digest));
    return "";
  }
  const std::string token(reinterpret_cast<const char *>(digest), 8);
  memset(digest, 0, sizeof(digest));
  return token;
}

void rejectBleProvisioning(const char *code) {
  clearBleProvisioningNonce();
  setBleProvisioningStatus("rejected", code);
}

void handleBleWifiProvisioning(const std::string &rawValue) {
  constexpr size_t kMaxBleProvisioningBytes = 480;
  if (rawValue.empty() || rawValue.size() > kMaxBleProvisioningBytes ||
      bleProvisioningRestartAtMs != 0) {
    rejectBleProvisioning("BLE_PAYLOAD_INVALID");
    return;
  }
  if (isProductionProfile() && !isCredentialStorageEncrypted()) {
    rejectBleProvisioning("BLE_CREDENTIAL_STORAGE_ENCRYPTION_REQUIRED");
    return;
  }
  if (!bleProvisioningNonceIsFresh()) {
    rejectBleProvisioning("BLE_CHALLENGE_EXPIRED");
    return;
  }

  JsonDocument envelope;
  if (deserializeJson(envelope, rawValue) ||
      !envelope.is<JsonObjectConst>()) {
    rejectBleProvisioning("BLE_PAYLOAD_INVALID");
    return;
  }
  const int protocolVersion = envelope["protocolVersion"] | 0;
  const String requestedDeviceId = envelope["deviceId"] | "";
  const String requestedNonce = envelope["nonce"] | "";
  const String ivValue = envelope["iv"] | "";
  const String ciphertextValue = envelope["ciphertext"] | "";
  const String tagValue = envelope["tag"] | "";
  if (protocolVersion != 1 || requestedDeviceId != String(deviceId) ||
      !constantTimeEquals(requestedNonce, bleProvisioningNonce) ||
      ivValue.length() > 32 || ciphertextValue.length() > 360 ||
      tagValue.length() > 32) {
    rejectBleProvisioning("BLE_PAYLOAD_INVALID");
    return;
  }

  uint8_t iv[12];
  uint8_t tag[16];
  uint8_t ciphertext[256];
  uint8_t plaintext[257];
  uint8_t key[32];
  size_t ivLength = 0;
  size_t tagLength = 0;
  size_t ciphertextLength = 0;
  const bool encodedValuesValid =
      base64UrlDecode(ivValue, iv, sizeof(iv), ivLength) &&
      base64UrlDecode(tagValue, tag, sizeof(tag), tagLength) &&
      base64UrlDecode(ciphertextValue, ciphertext, sizeof(ciphertext),
                      ciphertextLength) &&
      ivLength == sizeof(iv) && tagLength == sizeof(tag) &&
      ciphertextLength > 0 && ciphertextLength < sizeof(plaintext) &&
      deriveBleProvisioningKey(bleProvisioningNonce, key);
  if (!encodedValuesValid) {
    memset(iv, 0, sizeof(iv));
    memset(tag, 0, sizeof(tag));
    memset(ciphertext, 0, sizeof(ciphertext));
    memset(key, 0, sizeof(key));
    rejectBleProvisioning("BLE_PAYLOAD_INVALID");
    return;
  }

  String aad = "shcare-ble-wifi-aad-v1\n";
  aad += deviceId;
  aad += "\n";
  aad += bleProvisioningNonce;
  mbedtls_gcm_context gcm;
  mbedtls_gcm_init(&gcm);
  int cryptoResult = mbedtls_gcm_setkey(&gcm, MBEDTLS_CIPHER_ID_AES, key, 256);
  if (cryptoResult == 0) {
    cryptoResult = mbedtls_gcm_auth_decrypt(
        &gcm, ciphertextLength, iv, sizeof(iv),
        reinterpret_cast<const unsigned char *>(aad.c_str()), aad.length(),
        tag, sizeof(tag), ciphertext, plaintext);
  }
  mbedtls_gcm_free(&gcm);
  memset(iv, 0, sizeof(iv));
  memset(tag, 0, sizeof(tag));
  memset(ciphertext, 0, sizeof(ciphertext));
  memset(key, 0, sizeof(key));
  for (size_t index = 0; index < aad.length(); ++index) {
    aad.setCharAt(index, '\0');
  }
  if (cryptoResult != 0) {
    memset(plaintext, 0, sizeof(plaintext));
    rejectBleProvisioning("BLE_AUTHENTICATION_FAILED");
    return;
  }
  plaintext[ciphertextLength] = '\0';

  JsonDocument provisioning;
  const bool payloadValid =
      !deserializeJson(provisioning, plaintext, ciphertextLength) &&
      provisioning.is<JsonObjectConst>() &&
      (provisioning["protocolVersion"] | 0) == 1 &&
      String(provisioning["deviceId"] | "") == String(deviceId) &&
      constantTimeEquals(String(provisioning["nonce"] | ""),
                         bleProvisioningNonce);
  if (!payloadValid) {
    memset(plaintext, 0, sizeof(plaintext));
    rejectBleProvisioning("BLE_PAYLOAD_INVALID");
    return;
  }
  String ssid = provisioning["ssid"] | "";
  String password = provisioning["password"] | "";
  memset(plaintext, 0, sizeof(plaintext));
  clearBleProvisioningNonce();
  if (!shcare::validWifiCredentials(std::string(ssid.c_str()),
                                    std::string(password.c_str()))) {
    for (size_t index = 0; index < password.length(); ++index) {
      password.setCharAt(index, '\0');
    }
    rejectBleProvisioning("BLE_WIFI_INVALID");
    return;
  }
  const bool persisted = persistSetupWifi(ssid, password);
  for (size_t index = 0; index < password.length(); ++index) {
    password.setCharAt(index, '\0');
  }
  password = "";
  if (!persisted) {
    rejectBleProvisioning("BLE_WIFI_STORAGE_FAILED");
    return;
  }
  setBleProvisioningStatus("accepted", "BLE_WIFI_ACCEPTED");
  bleProvisioningRestartAtMs = millis() + BLE_PROVISIONING_RESTART_DELAY_MS;
}

class ShcareBleProvisioningServerCallbacks final : public NimBLEServerCallbacks {
 public:
  void onDisconnect(NimBLEServer *server, NimBLEConnInfo &, int) override {
    clearBleProvisioningNonce();
    if (server != nullptr && bleProvisioningRestartAtMs == 0) {
      server->startAdvertising();
    }
  }
};

class ShcareBleProvisioningCharacteristicCallbacks final
    : public NimBLECharacteristicCallbacks {
 public:
  void onRead(NimBLECharacteristic *characteristic, NimBLEConnInfo &) override {
    if (characteristic != bleProvisioningChallengeCharacteristic) {
      return;
    }
    const String challenge = createBleProvisioningChallenge();
    characteristic->setValue(challenge.c_str());
    setBleProvisioningStatus("ready", "BLE_CHALLENGE_READY");
  }

  void onWrite(NimBLECharacteristic *characteristic, NimBLEConnInfo &) override {
    if (characteristic != bleProvisioningWifiCharacteristic) {
      return;
    }
    const NimBLEAttValue value = characteristic->getValue();
    handleBleWifiProvisioning(
        std::string(reinterpret_cast<const char *>(value.data()), value.size()));
  }
};

ShcareBleProvisioningServerCallbacks bleProvisioningServerCallbacks;
ShcareBleProvisioningCharacteristicCallbacks bleProvisioningCharacteristicCallbacks;

void setupBleProvisioning() {
  if (bleProvisioningStarted ||
      !shcare::validCanonicalDeviceId(std::string(deviceId)) ||
      strlen(deviceSecret) < 16) {
    return;
  }
  if (!NimBLEDevice::init("Shcare")) {
    Serial.println("BLE provisioning unavailable.");
    return;
  }
  NimBLEDevice::setMTU(247);
  bleProvisioningServer = NimBLEDevice::createServer();
  if (bleProvisioningServer == nullptr) {
    Serial.println("BLE provisioning server unavailable.");
    return;
  }
  bleProvisioningServer->setCallbacks(&bleProvisioningServerCallbacks, false);
  bleProvisioningServer->advertiseOnDisconnect(true);
  NimBLEService *service =
      bleProvisioningServer->createService(BLE_PROVISIONING_SERVICE_UUID);
  if (service == nullptr) {
    Serial.println("BLE provisioning service unavailable.");
    return;
  }
  bleProvisioningIdentityCharacteristic = service->createCharacteristic(
      BLE_PROVISIONING_IDENTITY_UUID, NIMBLE_PROPERTY::READ, 96);
  bleProvisioningChallengeCharacteristic = service->createCharacteristic(
      BLE_PROVISIONING_CHALLENGE_UUID, NIMBLE_PROPERTY::READ, 256);
  bleProvisioningWifiCharacteristic = service->createCharacteristic(
      BLE_PROVISIONING_WIFI_UUID, NIMBLE_PROPERTY::WRITE, 512);
  bleProvisioningStatusCharacteristic = service->createCharacteristic(
      BLE_PROVISIONING_STATUS_UUID,
      NIMBLE_PROPERTY::READ | NIMBLE_PROPERTY::NOTIFY, 192);
  if (bleProvisioningIdentityCharacteristic == nullptr ||
      bleProvisioningChallengeCharacteristic == nullptr ||
      bleProvisioningWifiCharacteristic == nullptr ||
      bleProvisioningStatusCharacteristic == nullptr) {
    Serial.println("BLE provisioning characteristic unavailable.");
    return;
  }
  bleProvisioningIdentityCharacteristic->setValue(deviceId);
  bleProvisioningChallengeCharacteristic->setCallbacks(
      &bleProvisioningCharacteristicCallbacks);
  bleProvisioningWifiCharacteristic->setCallbacks(
      &bleProvisioningCharacteristicCallbacks);
  setBleProvisioningStatus("ready", "BLE_READY");
  if (!bleProvisioningServer->start()) {
    Serial.println("BLE provisioning start failed.");
    return;
  }
  NimBLEAdvertising *advertising = NimBLEDevice::getAdvertising();
  if (advertising == nullptr) {
    Serial.println("BLE provisioning advertising unavailable.");
    return;
  }
  const std::string advertisementToken = buildBleAdvertisementToken();
  NimBLEAdvertisementData advertisementData;
  // NimBLEAdvertising::setServiceData() may transparently move a field to
  // scan response data when the current payload is full. Xiaomi/Android HIL
  // must see the discriminator in the primary packet, so construct the
  // canonical payload directly and install it without the fallback path.
  if (advertisementToken.length() != 8 ||
      !advertisementData.setFlags(BLE_HS_ADV_F_DISC_GEN) ||
      !advertisementData.setServiceData(
          NimBLEUUID(BLE_PROVISIONING_SERVICE_UUID), advertisementToken) ||
      !advertising->setAdvertisementData(advertisementData)) {
    Serial.println("BLE provisioning advertisement token unavailable.");
    return;
  }
  if (!NimBLEDevice::startAdvertising()) {
    Serial.println("BLE provisioning advertising failed.");
    return;
  }
  bleProvisioningStarted = true;
  Serial.println("BLE WiFi provisioning ready.");
}

void handleBleProvisioningRestart() {
  if (bleProvisioningRestartAtMs == 0 ||
      static_cast<long>(millis() - bleProvisioningRestartAtMs) < 0) {
    return;
  }
  bleProvisioningRestartAtMs = 0;
  Serial.println("BLE WiFi provisioning persisted; restarting.");
  delay(50);
  ESP.restart();
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
  const bool wifiConnected = WiFi.status() == WL_CONNECTED;
  const String connectedWifiSsid = wifiConnected ? WiFi.SSID() : String("");
  const String connectedIpAddress = wifiConnected ? WiFi.localIP().toString() : String("");
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
  json += i2sStatusLabel();
  json += "\",";
  json += "\"i2sLastFailureCode\":\"";
  json += jsonEscape(lastI2sFailureCode.c_str());
  json += "\",";
  json += "\"i2sRecoveryAttempts\":";
  json += String(i2sRecoveryAttemptCount);
  json += ",";
  json += "\"i2sRecoverySuccesses\":";
  json += String(i2sRecoverySuccessCount);
  json += ",";
  json += "\"i2sInitFailures\":";
  json += String(i2sInitFailureCount);
  json += ",";
  json += "\"i2sReadFailures\":";
  json += String(i2sReadFailureCount);
  json += ",";
  json += "\"audioProfile\":\"";
  json += jsonEscape(activeAudioProfileName.c_str());
  json += "\",";
  json += "\"audioCaptureSlot\":";
  json += String(selectedAudioCaptureSlot);
  json += ",";
  json += "\"audioCaptureSlotSwitches\":";
  json += String(audioCaptureSlotSwitchCount);
  json += ",";
  json += "\"audioSignalQuality\":\"";
  json += audioSignalStateLabel(selectedAudioSignalState);
  json += "\",";
  json += "\"i2sSlot0Rms\":";
  json += String(i2sSlot0Diagnostics.rms);
  json += ",";
  json += "\"i2sSlot0Peak\":";
  json += String(i2sSlot0Diagnostics.peak);
  json += ",";
  json += "\"i2sSlot0WindowCount\":";
  json += String(i2sSlot0Diagnostics.windowCount);
  json += ",";
  json += "\"i2sSlot0ActiveWindowCount\":";
  json += String(i2sSlot0Diagnostics.activeWindowCount);
  json += ",";
  json += "\"i2sSlot0SampleCount\":";
  json += String(i2sSlot0Diagnostics.sampleCount);
  json += ",";
  json += "\"i2sSlot0NonZeroSampleCount\":";
  json += String(i2sSlot0Diagnostics.nonZeroSampleCount);
  json += ",";
  json += "\"i2sSlot1Rms\":";
  json += String(i2sSlot1Diagnostics.rms);
  json += ",";
  json += "\"i2sSlot1Peak\":";
  json += String(i2sSlot1Diagnostics.peak);
  json += ",";
  json += "\"i2sSlot1WindowCount\":";
  json += String(i2sSlot1Diagnostics.windowCount);
  json += ",";
  json += "\"i2sSlot1ActiveWindowCount\":";
  json += String(i2sSlot1Diagnostics.activeWindowCount);
  json += ",";
  json += "\"i2sSlot1SampleCount\":";
  json += String(i2sSlot1Diagnostics.sampleCount);
  json += ",";
  json += "\"i2sSlot1NonZeroSampleCount\":";
  json += String(i2sSlot1Diagnostics.nonZeroSampleCount);
  json += ",";
  json += "\"i2sRetryDelayMs\":";
  json += String(i2sReady ? 0 : i2sRetryDelayMs);
  json += ",";
  json += "\"taskWatchdogStatus\":\"";
  json += taskWatchdogReady ? "active" : "degraded";
  json += "\",";
  json += "\"taskWatchdogFeedFailures\":";
  json += String(taskWatchdogFeedFailures);
  json += ",";
  json += "\"offlineQueueDepth\":";
  json += String(offlineOperationalQueue.size());
  json += ",";
  json += "\"offlineQueueDropped\":";
  json += String(offlineOperationalQueue.droppedCount());
  json += ",";
  json += "\"offlineQueueCoalesced\":";
  json += String(offlineOperationalQueue.coalescedCount());
  json += ",";
  json += "\"offlineQueueRejected\":";
  json += String(offlineOperationalQueue.rejectedCount());
  json += ",";
  json += "\"offlineQueueFlushFailures\":";
  json += String(offlineQueueFlushFailures);
  json += ",";
  json += "\"audioPacketsSent\":";
  json += String(wsPacketsSent + udpPacketsSent);
  json += ",";
  json += "\"audioPacketsDropped\":";
  json += String(wsSendFailures + udpSendFailures + audioCaptureFramesDropped +
                 audioCaptureFramesStale);
  json += ",";
  json += "\"audioSendFailures\":";
  json += String(wsSendFailures + udpSendFailures);
  json += ",";
  json += "\"audioCaptureQueueDepth\":";
  json += String(audioCaptureQueue == nullptr
                     ? 0
                     : uxQueueMessagesWaiting(audioCaptureQueue));
  json += ",";
  json += "\"audioCaptureQueueHighWater\":";
  json += String(audioCaptureQueueHighWater);
  json += ",";
  json += "\"audioCaptureFramesEnqueued\":";
  json += String(audioCaptureFramesEnqueued);
  json += ",";
  json += "\"audioCaptureFramesDropped\":";
  json += String(audioCaptureFramesDropped);
  json += ",";
  json += "\"audioCaptureFramesStale\":";
  json += String(audioCaptureFramesStale);
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
  }
  json += "\",";
  json += "\"otaBootOutcome\":\"";
  json += jsonEscape(otaBootOutcome.c_str());
  json += "\",";
  json += "\"wifiSsid\":\"";
  json += jsonEscape(connectedWifiSsid);
  json += "\",";
  json += "\"wifiRssi\":";
  json += String(wifiConnected ? WiFi.RSSI() : 0);
  json += ",";
  json += "\"ipAddress\":\"";
  json += jsonEscape(connectedIpAddress);
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

bool validOtaBootOutcome(const String &outcome) {
  return outcome == "prepared" || outcome == "pending" ||
         outcome == "confirming" ||
         outcome == "confirmed" ||
         outcome == "rollback_requested" || outcome == "rolled_back" ||
         outcome == "rollback_unavailable" || outcome == "rollback_failed";
}

String loadOtaBootOutcome() {
  if (!devicePrefs.begin("smart-health", true)) {
    return "";
  }
  const String outcome = devicePrefs.getString("otaBoot", "");
  devicePrefs.end();
  return validOtaBootOutcome(outcome) ? outcome : String("");
}

bool persistOtaBootOutcome(const char *outcome) {
  const String candidate = outcome == nullptr ? "" : String(outcome);
  if (!validOtaBootOutcome(candidate) ||
      !devicePrefs.begin("smart-health", false)) {
    return false;
  }
  const bool written = devicePrefs.putString("otaBoot", candidate) > 0;
  devicePrefs.end();
  if (!written || !devicePrefs.begin("smart-health", true)) {
    return false;
  }
  const String verified = devicePrefs.getString("otaBoot", "");
  devicePrefs.end();
  if (verified != candidate) {
    return false;
  }
  otaBootOutcome = candidate;
  return true;
}

bool otaRecoveryRuntimeServicesAllowed() {
  return !otaRecoverySafeMode &&
         shcare::otaRecoveryServicesAllowed(otaRecoverySafeModeReason);
}

void enterOtaRecoverySafeMode(
    const shcare::OtaRecoverySafeModeReason reason) {
  if (shcare::otaRecoveryServicesAllowed(reason)) {
    return;
  }
  if (!otaRecoverySafeMode) {
    otaRecoverySafeModeReason = reason;
  }
  otaRecoverySafeMode = true;
  pendingFirmwareVerification = false;
  pendingOtaConfirmationPersistence = false;
  otaRollbackTerminal = true;
  otaInProgress = false;
  cloudSocket.close();
  audioUdp.stop();
  if (configServerStarted) {
    setupServer.stop();
  }
  setupDns.stop();
  if (mdnsReady) {
    MDNS.end();
  }
  WiFi.softAPdisconnect(true);
  WiFi.disconnect(true, false);
  WiFi.mode(WIFI_OFF);
  releaseI2SDriver();
  cloudConnected = false;
  cloudTransportConnected = false;
  cloudConfigured = false;
  authenticatedProductionHeartbeatObserved = false;
  udpAudioReady = false;
  otaReady = false;
  mdnsReady = false;
  setupPortalActive = false;
  configServerStarted = false;
  setupPortalCsrfToken = "";
  i2sReady = false;
  resetAudioSession();

  Serial.print("OTA recovery safe mode active: ");
  Serial.println(
      shcare::otaRecoverySafeModeStableCode(otaRecoverySafeModeReason));
  Serial.println(
      "Network, cloud control, OTA control, and audio services are disabled. "
      "Hold the physical factory-reset button for local recovery; a signed "
      "serial reflash may be required.");
}

void handleOtaRecoverySafeMode() {
  maintainTaskWatchdog();
  handleFactoryResetButton();
  const unsigned long now = millis();
  if (otaRecoverySafeModeLastStatusMs == 0 ||
      now - otaRecoverySafeModeLastStatusMs >=
          OTA_RECOVERY_SAFE_MODE_STATUS_MS) {
    otaRecoverySafeModeLastStatusMs = now;
    Serial.print("OTA recovery safe mode remains active: ");
    Serial.println(
        shcare::otaRecoverySafeModeStableCode(otaRecoverySafeModeReason));
  }
  delay(25);
  feedTaskWatchdog();
}

void beginPendingFirmwareHealthCheck() {
  loadPendingOtaReceipt();
#if SMART_HEALTH_HIL_RESET_OTA_STATE
  // A wired HIL bootstrap may clean up a stranded test receipt without
  // touching Wi-Fi, identity, or any other device configuration. OTA targets
  // never include this one-shot fixture flag.
  const bool receiptCleared = erasePendingOtaReceipt();
  bool markerCleared = false;
  if (devicePrefs.begin("smart-health", false)) {
    markerCleared = !devicePrefs.isKey("otaBoot") ||
                    devicePrefs.remove("otaBoot") > 0;
    devicePrefs.end();
  }
  if (receiptCleared && markerCleared) {
    Serial.println("HIL bootstrap cleared only stale OTA recovery state.");
  }
#endif
  otaBootOutcome = loadOtaBootOutcome();
  const esp_partition_t *runningPartition = esp_ota_get_running_partition();
  esp_ota_img_states_t state = ESP_OTA_IMG_UNDEFINED;
  const bool stateKnown =
      runningPartition != nullptr &&
      esp_ota_get_state_partition(runningPartition, &state) == ESP_OK;
  const bool pendingImage =
      stateKnown && state == ESP_OTA_IMG_PENDING_VERIFY;
  const bool targetFirmwareRunning =
      pendingOtaReceiptReady &&
      pendingOtaReceipt.firmwareVersion == FIRMWARE_VERSION;
  const shcare::PendingOtaRecoveryAction recovery =
      shcare::evaluatePendingOtaRecovery(
          pendingOtaReceipt, pendingOtaReceiptReady, stateKnown, pendingImage,
          targetFirmwareRunning, stateKnown && state == ESP_OTA_IMG_VALID,
          std::string(otaBootOutcome.c_str()));
  if (recovery == shcare::PendingOtaRecoveryAction::Confirmed) {
    pendingFirmwareVerification = false;
    otaRollbackTerminal = true;
    pendingOtaConfirmationPersistence = true;
    if (!finalizeConfirmedOtaDurably()) {
      Serial.println(
          "Recovered OTA confirmation is waiting for durable persistence.");
    }
  } else if (recovery == shcare::PendingOtaRecoveryAction::RolledBack) {
    // The boot-slot inference is not reportable until its durable marker is
    // updated. This prevents a stale marker from contaminating the next OTA.
    const bool markerStored = persistOtaBootOutcome("rolled_back");
    const bool receiptStored =
        markerStored && persistPendingOtaStatus("rolled_back");
    if (receiptStored) {
      Serial.println(
          "Recovered an interrupted OTA as rolled_back on the previous app slot.");
    } else {
      persistOtaBootOutcome("rollback_failed");
      persistPendingOtaStatus("failed");
      Serial.println(
          "Rollback inference could not be made durable; failed closed.");
    }
  } else if (recovery == shcare::PendingOtaRecoveryAction::Failed) {
    if (persistPendingOtaStatus("failed")) {
      Serial.println("Recovered an OTA interrupted before reboot as failed.");
    } else {
      Serial.println("Interrupted OTA failure could not be persisted.");
    }
  } else if (recovery ==
             shcare::PendingOtaRecoveryAction::RollbackRequired) {
    pendingFirmwareVerification = false;
    otaRollbackTerminal = true;
    if (!esp_ota_check_rollback_is_possible()) {
      enterOtaRecoverySafeMode(
          shcare::OtaRecoverySafeModeReason::RollbackUnavailable);
      persistOtaBootOutcome("rollback_unavailable");
      if (pendingOtaReceiptReady) {
        persistPendingOtaStatus("failed");
      }
      Serial.println(
          "Unbound or mismatched pending image rejected; rollback unavailable.");
      return;
    }
    if (!persistOtaBootOutcome("rollback_requested")) {
      enterOtaRecoverySafeMode(
          shcare::OtaRecoverySafeModeReason::RollbackIntentPersistenceFailed);
      persistOtaBootOutcome("rollback_failed");
      if (pendingOtaReceiptReady) {
        persistPendingOtaStatus("failed");
      }
      Serial.println(
          "Unbound or mismatched pending image rejected; rollback intent persistence failed.");
      return;
    }
    if (pendingOtaReceiptReady) {
      persistPendingOtaStatus("rolling_back");
    }
    Serial.println(
        "Unbound or mismatched pending image rejected; rolling back.");
    delay(100);
    const esp_err_t result = esp_ota_mark_app_invalid_rollback_and_reboot();
    enterOtaRecoverySafeMode(
        shcare::OtaRecoverySafeModeReason::RollbackApiReturned);
    persistOtaBootOutcome("rollback_failed");
    if (pendingOtaReceiptReady) {
      persistPendingOtaStatus("failed");
    }
    Serial.print("Rejected pending-image rollback failed: ");
    Serial.println(esp_err_to_name(result));
    return;
  }
  if (recovery == shcare::PendingOtaRecoveryAction::AwaitBootHealth) {
    pendingFirmwareVerification = true;
    pendingFirmwareBootStartedMs = millis();
    pendingFirmwareLastStatusMs = pendingFirmwareBootStartedMs;
    otaRollbackTerminal = false;
    if (otaBootOutcome == "rollback_requested") {
      enterOtaRecoverySafeMode(
          shcare::OtaRecoverySafeModeReason::RollbackApiReturned);
      persistOtaBootOutcome("rollback_failed");
      Serial.println(
          "OTA rollback request returned to the same pending image; automatic retry disabled.");
    } else if (otaBootOutcome == "rollback_unavailable") {
      enterOtaRecoverySafeMode(
          shcare::OtaRecoverySafeModeReason::RollbackUnavailable);
      Serial.println(
          "OTA rollback remains unavailable from the durable boot marker; automatic retry disabled.");
    } else if (otaBootOutcome == "rollback_failed") {
      enterOtaRecoverySafeMode(
          shcare::OtaRecoverySafeModeReason::RollbackApiReturned);
      Serial.println(
          "OTA rollback is terminal from the durable boot marker; automatic retry disabled.");
    } else if (!persistOtaBootOutcome("pending")) {
      Serial.println("OTA pending boot marker could not be persisted.");
    }
    Serial.print("OTA image pending boot-health confirmation on partition ");
    Serial.println(runningPartition->label);
    return;
  }

  if (stateKnown && otaBootOutcome == "rollback_requested") {
    if (persistOtaBootOutcome("rolled_back")) {
      sendCloudEvent("ota.rollback", "rolled_back",
                     "booted a non-pending image after durable rollback request");
      Serial.println("OTA rollback outcome inferred from the booted app slot.");
    } else {
      Serial.println("OTA rollback outcome marker could not be finalized.");
    }
  }
}

bool pendingFirmwareHealthReady() {
  shcare::OtaBootHealthInput health;
  health.pendingVerification = pendingFirmwareVerification;
  health.i2sReady = i2sReady;
  health.stabilityWindowElapsed =
      millis() - pendingFirmwareBootStartedMs >= OTA_BOOT_STABILITY_MS;
  // HIL uses the production WSS trust/authentication path with short-lived
  // local credentials even though its profile permits development audio
  // diagnostics. An OTA image in HIL must therefore meet the same
  // authenticated WSS boot-health bar; otherwise a bad credential could be
  // marked valid without proving it can rejoin the control plane.
  health.productionProfile = isProductionProfile() ||
                             SMART_HEALTH_HIL_RUNTIME_CONFIG;
  health.runtimeSecurityReady = cloudSecurityDecision.ready();
  health.transport = cloudSecurityDecision.transport;
  health.authenticated = cloudConnected;
  health.authenticatedHeartbeatObserved =
      authenticatedProductionHeartbeatObserved;
  health.recoveryPortalActive = setupPortalActive;
  return shcare::otaBootHealthReady(health);
}

bool finalizeConfirmedOtaDurably() {
  if (!pendingOtaConfirmationPersistence || !pendingOtaReceiptReady) {
    return false;
  }
  const bool markerStored = persistOtaBootOutcome("confirmed");
  const bool receiptStored =
      markerStored && persistPendingOtaStatus("confirmed");
  const shcare::OtaConfirmationAction action =
      shcare::evaluateOtaConfirmationAction(true, true, markerStored,
                                             receiptStored);
  if (action != shcare::OtaConfirmationAction::PublishConfirmed) {
    return false;
  }
  pendingOtaConfirmationPersistence = false;
  sendCloudEvent("ota.confirmed", "confirmed",
                 "boot health confirmed; rollback cancelled");
  Serial.println("OTA boot health confirmed and durably recorded.");
  return true;
}

void confirmPendingFirmwareIfHealthy() {
  if (pendingOtaConfirmationPersistence) {
    finalizeConfirmedOtaDurably();
    return;
  }
  if (otaRollbackTerminal || !pendingFirmwareHealthReady()) {
    return;
  }
  const esp_partition_t *runningPartition = esp_ota_get_running_partition();
  esp_ota_img_states_t state = ESP_OTA_IMG_UNDEFINED;
  if (runningPartition != nullptr &&
      esp_ota_get_state_partition(runningPartition, &state) == ESP_OK &&
      state == ESP_OTA_IMG_PENDING_VERIFY) {
    const bool confirmingMarkerStored =
        persistOtaBootOutcome("confirming");
    if (shcare::evaluateOtaConfirmationAction(
            confirmingMarkerStored, false, false, false) !=
        shcare::OtaConfirmationAction::CancelRollback) {
      Serial.println(
          "OTA confirmation blocked: durable confirming marker unavailable.");
      return;
    }
    const esp_err_t result = esp_ota_mark_app_valid_cancel_rollback();
    if (result == ESP_OK) {
      pendingFirmwareVerification = false;
      otaRollbackTerminal = true;
      pendingOtaConfirmationPersistence = true;
      if (!finalizeConfirmedOtaDurably()) {
        Serial.println(
            "OTA rollback was cancelled; durable confirmation will retry.");
      }
      return;
    }
    persistOtaBootOutcome("pending");
    Serial.print("OTA boot confirmation failed: ");
    Serial.println(esp_err_to_name(result));
  }
}

void handlePendingFirmwareHealth() {
  if (pendingOtaConfirmationPersistence) {
    finalizeConfirmedOtaDurably();
    return;
  }
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
  const bool timeoutElapsed = elapsed >= OTA_BOOT_HEALTH_TIMEOUT_MS;
  if (!timeoutElapsed) {
    if (millis() - pendingFirmwareLastStatusMs >= 15000) {
      pendingFirmwareLastStatusMs = millis();
      Serial.println("OTA boot health still pending.");
    }
    return;
  }
  if (otaRollbackTerminal) {
    return;
  }

  const bool rollbackPossible = esp_ota_check_rollback_is_possible();
  const shcare::OtaRollbackAction action = shcare::evaluateOtaRollbackAction(
      pendingFirmwareVerification, timeoutElapsed, rollbackPossible,
      otaRollbackTerminal);
  if (action == shcare::OtaRollbackAction::Terminal ||
      action == shcare::OtaRollbackAction::None ||
      action == shcare::OtaRollbackAction::Wait) {
    return;
  }

  if (action == shcare::OtaRollbackAction::FailUnavailable) {
    enterOtaRecoverySafeMode(
        shcare::OtaRecoverySafeModeReason::RollbackUnavailable);
    persistOtaBootOutcome("rollback_unavailable");
    Serial.println("OTA rollback unavailable: no valid alternate app slot.");
    sendCloudEvent("ota.failed", "failed",
                   "boot health timeout; rollback slot unavailable");
    return;
  }

  if (!persistOtaBootOutcome("rollback_requested")) {
    enterOtaRecoverySafeMode(
        shcare::OtaRecoverySafeModeReason::RollbackIntentPersistenceFailed);
    persistOtaBootOutcome("rollback_failed");
    Serial.println("OTA rollback blocked: durable intent marker failed.");
    sendCloudEvent("ota.failed", "failed",
                   "rollback intent could not be persisted");
    return;
  }

  otaRollbackTerminal = true;
  Serial.println("OTA boot health timed out; rolling back to the last valid slot.");
  sendCloudEvent("ota.rollback", "rolling_back",
                 "boot health timeout; reverting firmware");
  delay(100);
  const esp_err_t result = esp_ota_mark_app_invalid_rollback_and_reboot();
  enterOtaRecoverySafeMode(
      shcare::OtaRecoverySafeModeReason::RollbackApiReturned);
  Serial.print("OTA rollback request failed: ");
  Serial.println(esp_err_to_name(result));
  persistOtaBootOutcome("rollback_failed");
  sendCloudEvent("ota.failed", "failed", "bootloader rollback request failed");
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
    // The accepted message arrives only after the TLS server certificate,
    // challenge, device identity, session and credential slot are all bound.
    // It corrects a stale RTC without weakening command expiry validation.
    if (!synchronizeClockFromAuthenticatedServer(accepted.message)) {
      rejectCloudTransport("AUTH_SERVER_TIME_INVALID");
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
    flushOfflineOperationalQueue();
    sendCloudTelemetry("telemetry");
    confirmPendingReconnectCommand();
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
    // A newly installed OTA image has not earned validity yet. An authenticated
    // WSS rejection proves it cannot rejoin the control plane with its device
    // identity. Leave the actual rollback to the single guarded loop path,
    // which persists intent and checks A/B feasibility before rebooting.
    if (pendingFirmwareVerification) {
      pendingFirmwareBootStartedMs = millis() - OTA_BOOT_HEALTH_TIMEOUT_MS;
      pendingFirmwareLastStatusMs = 0;
      Serial.println(
          "OTA boot health rejected by WSS authentication; rollback is scheduled.");
    }
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

void sendDurableReconnectFailure(
    const shcare::CommandEnvelope &command, const char *code,
    const char *detail) {
  if (!persistTerminalCommand(command, "failed", code, detail)) {
    sendCommandState(
        command, "applying", "COMMAND_JOURNAL_RETRY",
        "failure result persistence unavailable; exact command may be retried");
    return;
  }
  sendCommandState(command, "failed", code, detail);
}

void queueOfflineTelemetryIfDue() {
  const unsigned long nowMs = millis();
  if (lastOfflineTelemetryMarkerMs == 0) {
    lastOfflineTelemetryMarkerMs = nowMs;
    return;
  }
  if (nowMs - lastOfflineTelemetryMarkerMs <
      CLOUD_TELEMETRY_INTERVAL_MS) {
    return;
  }
  offlineOperationalQueue.enqueueTelemetry(
      static_cast<std::uint32_t>(nowMs));
  lastOfflineTelemetryMarkerMs = nowMs;
}

String queuedOperationalJson(
    const shcare::OfflineOperationalRecord &record) {
  JsonDocument document;
  if (record.kind == shcare::OfflineOperationalKind::Telemetry) {
    if (deserializeJson(document, cloudTelemetryJson("telemetry"))) {
      return "";
    }
  } else {
    document["type"] = record.type;
    document["deviceId"] = deviceId;
    document["protocolVersion"] = shcare::kDeviceProtocolVersion;
    if (!record.status.empty()) {
      if (record.type.rfind("ota.", 0) == 0) {
        document["otaStatus"] = record.status;
      } else if (record.type.rfind("audio.", 0) == 0) {
        document["audioStatus"] = record.status;
      } else {
        document["status"] = record.status;
      }
    }
    if (record.type.rfind("ota.", 0) == 0) {
      document["commandId"] = record.commandId;
      document["correlationId"] = record.correlationId;
      document["otaId"] = record.otaId;
      if (record.status == "confirmed") {
        document["firmwareVersion"] = FIRMWARE_VERSION;
        document["otaBootOutcome"] = otaBootOutcome;
      }
    }
  }
  document["queuedOffline"] = true;
  document["occurredAtUptimeMs"] = record.occurredAtUptimeMs;
  document["occurrences"] = record.occurrences;
  document["offlineQueueDropped"] = offlineOperationalQueue.droppedCount();
  String json;
  serializeJson(document, json);
  return json;
}

void flushOfflineOperationalQueue(std::size_t maxRecords) {
  if (!cloudConnected || maxRecords == 0) {
    return;
  }
  for (std::size_t sent = 0; sent < maxRecords; ++sent) {
    shcare::OfflineOperationalRecord record;
    if (!offlineOperationalQueue.front(record)) {
      return;
    }
    const String json = queuedOperationalJson(record);
    if (json.length() == 0 || !cloudSocket.send(json)) {
      if (offlineQueueFlushFailures != UINT32_MAX) {
        ++offlineQueueFlushFailures;
      }
      return;
    }
    offlineOperationalQueue.popFront();
    if (record.kind == shcare::OfflineOperationalKind::Telemetry) {
      lastCloudTelemetryMs = millis();
      lastOfflineTelemetryMarkerMs = lastCloudTelemetryMs;
    }
  }
}

bool sendCloudEvent(const char *type, const char *status, const char *detail) {
  const std::string eventType = type == nullptr ? "" : type;
  const std::string eventStatus = status == nullptr ? "" : status;
  const bool otaEvent = eventType.rfind("ota.", 0) == 0;
  if (otaEvent) {
    if (!pendingOtaReceiptReady ||
        (!eventStatus.empty() && !persistPendingOtaStatus(eventStatus.c_str()))) {
      return false;
    }
    lastOtaStatus = status == nullptr ? "" : status;
  }
  const std::string commandId = otaEvent && pendingOtaReceiptReady
                                    ? pendingOtaReceipt.commandId
                                    : std::string{};
  const std::string correlationId = otaEvent && pendingOtaReceiptReady
                                        ? pendingOtaReceipt.correlationId
                                        : std::string{};
  const std::string otaId = otaEvent && pendingOtaReceiptReady
                                ? pendingOtaReceipt.otaId
                                : std::string{};
  if (!cloudConnected) {
    offlineOperationalQueue.enqueueEvent(
        eventType, eventStatus, static_cast<std::uint32_t>(millis()),
        commandId, correlationId, otaId);
    return false;
  }
  JsonDocument document;
  document["type"] = eventType;
  document["deviceId"] = deviceId;
  document["protocolVersion"] = shcare::kDeviceProtocolVersion;
  if (!eventStatus.empty()) {
    if (otaEvent) {
      document["otaStatus"] = eventStatus;
    } else if (eventType.rfind("audio.", 0) == 0) {
      document["audioStatus"] = eventStatus;
    } else {
      document["status"] = eventStatus;
    }
  }
  if (otaEvent) {
    document["commandId"] = commandId;
    document["correlationId"] = correlationId;
    document["otaId"] = otaId;
    if (eventStatus == "confirmed") {
      document["firmwareVersion"] = FIRMWARE_VERSION;
      document["otaBootOutcome"] = otaBootOutcome;
    }
  }
  if (detail != nullptr && strlen(detail) > 0) {
    document["detail"] = detail;
  }
  String json;
  serializeJson(document, json);
  const bool sent = cloudSocket.send(json);
  if (!sent) {
    offlineOperationalQueue.enqueueEvent(
        eventType, eventStatus, static_cast<std::uint32_t>(millis()),
        commandId, correlationId, otaId);
    return false;
  }
  return true;
}

void replayPendingOtaTerminalEvent() {
  if (!cloudConnected || !pendingOtaReceiptReady ||
      millis() - pendingOtaEventLastAttemptMs < 5000UL) {
    return;
  }
  const std::string status = pendingOtaReceipt.status;
  const bool terminal = status == "confirmed" || status == "rolled_back" ||
                        status == "failed" || status == "expired";
  if (!terminal) {
    return;
  }
  pendingOtaEventLastAttemptMs = millis();
  const char *eventType = status == "confirmed"
                              ? "ota.confirmed"
                              : status == "rolled_back" ? "ota.rollback"
                                                        : "ota.failed";
  sendCloudEvent(eventType, status.c_str(),
                 "durable terminal OTA outcome replay");
}

bool sendCloudTelemetry(const char *type = "telemetry") {
  if (!cloudConnected) {
    offlineOperationalQueue.enqueueTelemetry(
        static_cast<std::uint32_t>(millis()));
    lastOfflineTelemetryMarkerMs = millis();
    return false;
  }
  if (!cloudSocket.send(cloudTelemetryJson(type))) {
    offlineOperationalQueue.enqueueTelemetry(
        static_cast<std::uint32_t>(millis()));
    lastOfflineTelemetryMarkerMs = millis();
    return false;
  }
  lastCloudTelemetryMs = millis();
  lastOfflineTelemetryMarkerMs = lastCloudTelemetryMs;
  if (isProductionProfile() && cloudSecurityDecision.ready() &&
      cloudSecurityDecision.transport == shcare::CloudTransport::Wss) {
    authenticatedProductionHeartbeatObserved = true;
  }
  return true;
}

void confirmPendingReconnectCommand() {
  if (!pendingReconnectCommandReady) {
    return;
  }
  const String connectedSsid = WiFi.status() == WL_CONNECTED
                                   ? WiFi.SSID()
                                   : String("");
  const String currentWifiConfigProof =
      pendingReconnectCommand.type == "wifi.update"
          ? buildWifiConfigProof(String(wifiSsid), String(wifiPass))
          : String("");
  const shcare::PendingReconnectDecision decision =
      shcare::evaluatePendingReconnectCommand(
          pendingReconnectCommand, cloudConnected,
          WiFi.status() == WL_CONNECTED,
          std::string(connectedSsid.c_str()),
          std::string(currentWifiConfigProof.c_str()));
  if (decision ==
      shcare::PendingReconnectDecision::WaitingForReconnect) {
    return;
  }

  shcare::CommandEnvelope command;
  command.protocolVersion = shcare::kDeviceProtocolVersion;
  command.id = pendingReconnectCommand.commandId;
  command.correlationId = pendingReconnectCommand.correlationId;
  command.type = pendingReconnectCommand.type;

  shcare::CommandJournalEntry existing;
  if (commandJournal.find(command.id, existing)) {
    if (existing.type != command.type ||
        existing.correlationId != command.correlationId) {
      sendCommandState(command, "failed", "COMMAND_ID_CONFLICT",
                       "pending reconnect receipt conflicts with terminal journal");
    } else {
      sendCommandState(command, existing.state.c_str(),
                       existing.code.c_str(), existing.result.c_str());
    }
    if (!erasePendingReconnectReceipt()) {
      Serial.println(
          "Pending reconnect receipt cleanup will retry after next boot.");
    }
    return;
  }

  const bool confirmed =
      decision == shcare::PendingReconnectDecision::Confirmed;
  const char *state = confirmed ? "applied" : "failed";
  const char *code = nullptr;
  const char *detail = nullptr;
  if (!confirmed) {
    code = decision == shcare::PendingReconnectDecision::NetworkMismatch
               ? "WIFI_RECONNECT_NETWORK_MISMATCH"
               : "RECONNECT_RECEIPT_INVALID";
    detail = decision == shcare::PendingReconnectDecision::NetworkMismatch
                 ? "authenticated reconnect did not match the staged WiFi configuration"
                 : "pending reconnect receipt rejected";
  } else if (command.type == "wifi.update") {
    code = "WIFI_RECONNECT_CONFIRMED";
    detail = "configured WiFi and authenticated cloud reconnect confirmed";
  } else {
    code = "RESTART_RECONNECT_CONFIRMED";
    detail = "device reboot and authenticated cloud reconnect confirmed";
  }

  if (!persistTerminalCommand(command, state, code, detail)) {
    sendCommandState(command, "applying", "COMMAND_JOURNAL_RETRY",
                     "reconnect confirmed; terminal persistence will retry");
    return;
  }
  if (!erasePendingReconnectReceipt()) {
    Serial.println(
        "Pending reconnect receipt cleanup will retry after next boot.");
  }
  sendCommandState(command, state, code, detail);
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

std::string otaManifestEffectFingerprint(
    const shcare::OtaManifest &manifest) {
  const std::string binding = shcare::buildOtaEffectBindingMessage(manifest);
  uint8_t digest[32];
  if (binding.empty() ||
      !sha256Buffer(reinterpret_cast<const uint8_t *>(binding.data()),
                    binding.size(), digest)) {
    return {};
  }
  const String encoded = sha256Hex(digest);
  memset(digest, 0, sizeof(digest));
  return std::string(encoded.c_str());
}

std::string otaCommandEffectFingerprint(
    const shcare::CommandEnvelope &command) {
  if (command.type != "ota.update") {
    return {};
  }
  shcare::OtaManifest manifest;
  manifest.url = command.payloadString("url");
  manifest.firmwareVersion = command.payloadString("firmwareVersion");
  manifest.checksum = command.payloadString("checksum");
  manifest.signature = command.payloadString("signature");
  manifest.hardwareTarget = command.payloadString("hardwareTarget");
  manifest.partitionTarget = command.payloadString("partitionTarget");
  manifest.minimumProtocolVersion =
      command.payloadInt("minimumProtocolVersion", 0);
  return otaManifestEffectFingerprint(manifest);
}

bool performCloudOta(const shcare::CommandEnvelope &command,
                     const shcare::OtaManifest &manifest,
                     const std::string &manifestFingerprint,
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
  const shcare::PendingOtaCommandDecision fence =
      shcare::evaluatePendingOtaCommand(
          pendingOtaReceipt, pendingOtaReceiptReady, command.id,
          command.correlationId, command.type, manifestFingerprint);
  if (fence != shcare::PendingOtaCommandDecision::Replay ||
      pendingOtaReceipt.status != "pending" ||
      otaBootOutcome != "prepared") {
    failureCode = "OTA_RECEIPT_REQUIRED";
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

  if (!beginBlockingOtaRuntime(failureCode)) {
    sendCloudEvent("ota.failed", "failed", failureCode.c_str());
    return false;
  }

  Serial.println("Starting verified cloud OTA download.");
  sendCloudEvent("ota.downloading", "downloading", "download started");

  HTTPClient http;
  bool audioPaused = false;
  auto failOta = [&](const char *code, const char *detail, bool abortUpdate) {
    failureCode = code;
    if (abortUpdate) {
      Update.abort();
    }
    http.end();
    if (audioPaused) {
      const esp_err_t resumeResult = i2s_start(MIC_I2S_PORT);
      audioPaused = false;
      i2sMaintenancePaused = false;
      if (resumeResult != ESP_OK) {
        markI2sCaptureDegraded("I2S_OTA_RESUME_FAILED");
      }
    }
    endBlockingOtaRuntime();
    sendCloudEvent("ota.failed", "failed", detail);
    return false;
  };

  WiFiClientSecure secureClient;
  secureClient.setCACert(OTA_CA_CERT);
  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
  http.setRedirectLimit(3);
  http.setConnectTimeout(10000);
  http.setTimeout(15000);
#if SMART_HEALTH_HIL_RUNTIME_CONFIG
  // The local HIL TLS proxy is reached at an explicit LAN IP, while its
  // certificate is issued to shcare-hil.local. Reuse the same hostname-
  // verified connection model as the WSS transport; never relax certificate
  // verification merely to make the OTA fixture reachable.
  const String scheme("https://");
  const int pathOffset = url.indexOf('/', scheme.length());
  const String authority = pathOffset >= 0
                               ? url.substring(scheme.length(), pathOffset)
                               : url.substring(scheme.length());
  const String requestUri =
      pathOffset >= 0 ? url.substring(pathOffset) : String("/");
  const String expectedAuthority =
      String(SMART_HEALTH_HIL_BACKEND_CONNECT_IP) + ":" + String(backendPort);
  IPAddress target;
  if (authority != expectedAuthority ||
      !target.fromString(SMART_HEALTH_HIL_BACKEND_CONNECT_IP)) {
    return failOta("OTA_HIL_URL_MISMATCH", "local ota route is invalid", false);
  }
  if (!secureClient.connect(target, static_cast<uint16_t>(backendPort),
                            "shcare-hil.local", OTA_CA_CERT, nullptr,
                            nullptr)) {
    return failOta("OTA_DOWNLOAD_CONNECT_FAILED",
                   "firmware tls connection failed", false);
  }
  const bool began = http.begin(secureClient, String("shcare-hil.local"),
                                static_cast<uint16_t>(backendPort), requestUri,
                                true);
#else
  const bool began = http.begin(secureClient, url);
#endif

  if (!began) {
    return failOta("OTA_DOWNLOAD_OPEN_FAILED", "cannot open firmware url",
                   false);
  }

  if (!manifest.downloadAuthorization.empty()) {
    const String authorization =
        String("Bearer ") + manifest.downloadAuthorization.c_str();
    http.addHeader("Authorization", authorization, true, true);
  }

  const int httpCode = http.GET();
  if (httpCode != HTTP_CODE_OK) {
    const String httpDetail =
        String("firmware download http error (") + String(httpCode) + ")";
    return failOta("OTA_DOWNLOAD_HTTP_FAILED",
                   httpDetail.c_str(), false);
  }

  const int totalSize = http.getSize();
  if (totalSize <= 0 ||
      static_cast<size_t>(totalSize) > updatePartition->size) {
    return failOta("OTA_IMAGE_SIZE_INVALID",
                   "firmware content length missing or too large", false);
  }

  if (i2sReady) {
    const esp_err_t pauseResult = i2s_stop(MIC_I2S_PORT);
    if (pauseResult == ESP_OK) {
      i2sMaintenancePaused = true;
      audioPaused = true;
    } else {
      markI2sCaptureDegraded("I2S_OTA_PAUSE_FAILED");
    }
  }

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
      // The loop task is intentionally not watched during blocking OTA; yield
      // so the still-watched idle task can satisfy the SDK's built 5s TWDT.
      delay(1);
      // Service WSS receipts even while the HTTP stream remains continuously
      // readable; otherwise event.accepted can be starved for the full flash.
      cloudSocket.poll();
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
  if (!persistOtaBootOutcome("pending")) {
    if (runningPartition != nullptr) {
      esp_ota_set_boot_partition(runningPartition);
    }
    return failOta("OTA_BOOT_MARKER_PERSIST_FAILED",
                   "pending boot outcome marker could not be persisted",
                   false);
  }

  http.end();

  sendCloudEvent("ota.rebooting", "rebooting", version.c_str());
  delay(1000);
  ESP.restart();
  endBlockingOtaRuntime();
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
  const std::string effectFingerprint =
      command.type == "ota.update" ? otaCommandEffectFingerprint(command)
                                   : std::string{};
  if (entry.type != command.type ||
      entry.correlationId != command.correlationId ||
      (entry.type == "ota.update" &&
       (effectFingerprint.empty() ||
        entry.effectFingerprint != effectFingerprint))) {
    sendCommandState(command, "failed", "COMMAND_ID_CONFLICT",
                     "command id was already used for another request");
    return true;
  }
  sendCommandState(command, entry.state.c_str(), entry.code.c_str(),
                   entry.result.c_str());
  return true;
}

bool handlePendingOtaCommandFence(
    const shcare::CommandEnvelope &command) {
  const shcare::PendingOtaCommandDecision decision =
      shcare::evaluatePendingOtaCommand(
          pendingOtaReceipt, pendingOtaReceiptReady, command.id,
          command.correlationId, command.type,
          otaCommandEffectFingerprint(command));
  if (decision == shcare::PendingOtaCommandDecision::NoFence) {
    return false;
  }
  if (decision ==
      shcare::PendingOtaCommandDecision::CommandIdConflict) {
    sendCommandState(command, "failed", "COMMAND_ID_CONFLICT",
                     "command id conflicts with the durable ota binding");
    return true;
  }
  if (decision == shcare::PendingOtaCommandDecision::OtaReceiptBusy) {
    sendCommandState(
        command, "failed", "OTA_RECEIPT_BUSY",
        "the previous ota outcome still awaits durable acknowledgement");
    return true;
  }
  if (decision == shcare::PendingOtaCommandDecision::InvalidFence) {
    sendCommandState(command, "failed", "OTA_RECEIPT_INVALID",
                     "the durable ota identity fence is invalid");
    return true;
  }

  shcare::PendingOtaReplayOutcome outcome;
  if (!shcare::buildPendingOtaReplayOutcome(pendingOtaReceipt, outcome)) {
    sendCommandState(command, "failed", "OTA_RECEIPT_INVALID",
                     "the durable ota outcome cannot be replayed");
    return true;
  }
  sendCommandState(command, outcome.commandState.c_str(),
                   outcome.commandCode.c_str(),
                   "durable ota command outcome replay");
  if (outcome.emitsEvent()) {
    sendCloudEvent(outcome.eventType.c_str(),
                   pendingOtaReceipt.status.c_str(),
                   "durable ota event outcome replay");
  }
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
  if (!otaRecoveryRuntimeServicesAllowed()) {
    return;
  }
  const shcare::CommandParseResult result = shcare::parseCommandEnvelope(
      std::string(message.c_str()), currentEpochMillis());
  if (!result.ok()) {
    if (result.code == shcare::CommandParseCode::Expired) {
      if (replayTerminalCommand(result.command) ||
          handlePendingOtaCommandFence(result.command)) {
        return;
      }
    }
    sendCommandProtocolError(result);
    return;
  }

  const shcare::CommandEnvelope &command = result.command;
  if (replayTerminalCommand(command)) {
    return;
  }
  if (handlePendingOtaCommandFence(command)) {
    return;
  }
  if (recentCommandIds.seen(command.id)) {
    if (pendingReconnectCommandReady &&
        pendingReconnectCommand.commandId == command.id &&
        (pendingReconnectCommand.type != command.type ||
         pendingReconnectCommand.correlationId != command.correlationId)) {
      sendCommandState(command, "failed", "COMMAND_ID_CONFLICT",
                       "command id was already used for another request");
      return;
    }
    sendCommandState(command, "acknowledged", "DUPLICATE_COMMAND",
                     "command already received; no action repeated");
    return;
  }
  if (pendingReconnectCommandReady &&
      pendingReconnectCommand.commandId == command.id &&
      pendingReconnectCommand.type == command.type &&
      pendingReconnectCommand.correlationId == command.correlationId) {
    confirmPendingReconnectCommand();
    return;
  }

  const shcare::DeviceCommandAdmission admission =
      shcare::evaluateDeviceCommandAdmission(
          command.type, otaInProgress, audioSessionActive);
  if (admission == shcare::DeviceCommandAdmission::OtaBusy) {
    recentCommandIds.rememberValidated(command.id, true);
    sendCommandState(command, "acknowledged", "DEVICE_BUSY_OTA",
                     "command authenticated while verified ota is applying");
    sendCommandState(command, "failed", "DEVICE_BUSY_OTA",
                     "verified ota is already applying");
    return;
  }
  if (admission == shcare::DeviceCommandAdmission::RecordingActive) {
    recentCommandIds.rememberValidated(command.id, true);
    sendCommandState(command, "acknowledged", "OTA_RECORDING_ACTIVE",
                     "command authenticated while recording is active");
    sendCommandState(command, "failed", "OTA_RECORDING_ACTIVE",
                     "stop the active recording before ota");
    return;
  }

  Serial.print("Cloud command accepted: ");
  Serial.print(command.type.c_str());
  Serial.print(" id=");
  Serial.println(command.id.c_str());

  if (command.type == "wifi.setup.open") {
    beginValidatedCommand(command);
    if (!startSmartConfigProvisioning("authorized Shcare app requested WiFi setup")) {
      sendCommandState(command, "failed", "SMARTCONFIG_LISTENER_START_FAILED",
                       "encrypted WiFi listener could not be opened");
      return;
    }
    if (!persistTerminalCommand(
            command, "applied", "SMARTCONFIG_LISTENING",
            "authorized app opened the encrypted ESPTouch V2 listener")) {
      sendCommandState(command, "failed", "COMMAND_JOURNAL_WRITE_FAILED",
                       "terminal result was not durably stored");
      return;
    }
    sendCommandState(command, "applied", "SMARTCONFIG_LISTENING",
                     "encrypted ESPTouch V2 listener is ready");
    return;
  }

  if (command.type == "restart") {
    beginValidatedCommand(command, false);
    if (pendingReconnectCommandReady) {
      sendDurableReconnectFailure(
          command, "RECONNECT_COMMAND_ALREADY_PENDING",
          "another reboot-dependent command is awaiting confirmation");
      return;
    }
    if (!persistPendingReconnectReceipt(command)) {
      sendDurableReconnectFailure(command, "RECONNECT_RECEIPT_WRITE_FAILED",
                                  "restart receipt was not durably stored");
      return;
    }
    recentCommandIds.rememberValidated(command.id, true);
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
    const String frameEncoding(
        command.payloadString("frameEncoding").c_str());
    const String encoding(command.payloadString("encoding").c_str());
    const String audioProfileName(
        command.payloadString("audioProfile").c_str());
    const int sampleRate = command.payloadInt("sampleRate", 0);
    const int sampleCount = command.payloadInt("sampleCount", 0);
    const auto audioContract = shcare::evaluateAudioSessionContract(
        audioProtocolVersion, std::string(frameEncoding.c_str()),
        std::string(encoding.c_str()), sampleRate,
        sampleCount > 0 ? static_cast<size_t>(sampleCount) : 0);
    const auto audioProfile = shcare::resolveAudioCaptureProfile(
        std::string(audioProfileName.c_str()));
    if (!i2sReady || i2sMaintenancePaused) {
      sendCommandState(command, "failed", "AUDIO_NOT_READY",
                       "i2s capture is unavailable");
      return;
    }
    if (!audioContract.accepted() || !audioProfile.accepted() ||
        commandDeviceId != String(deviceId) ||
        workspaceId.length() == 0 || patientId.length() == 0 ||
        sessionId.length() == 0 ||
        sessionId.length() > shcare::kAudioV2MaxSessionIdBytes ||
        scanId.length() == 0 ||
        scanId.length() > shcare::kAudioV2MaxScanIdBytes) {
      sendCommandState(command, "failed", "INVALID_AUDIO_SESSION",
                       "audio session contract rejected");
      return;
    }
    if (!pauseAudioCaptureTask()) {
      sendCommandState(command, "failed", "AUDIO_PROFILE_SWITCH_TIMEOUT",
                       "audio capture did not pause for profile switch");
      return;
    }
    configureAudioProfile(audioProfile);
    resumeAudioCaptureTask();
    beginValidatedCommand(command);
    activeAudioSessionId = sessionId;
    activeAudioScanId = scanId;
    activateAudioSessionCapture();
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
    if (!shcare::validWifiCredentials(
            std::string(ssid.c_str()), std::string(password.c_str()))) {
      sendDurableReconnectFailure(
          command, "INVALID_WIFI_CONFIG",
          "WiFi requires SSID 1-32 bytes and open or WPA password 8-63 characters");
      return;
    }
    beginValidatedCommand(command, false);
    if (pendingReconnectCommandReady) {
      sendDurableReconnectFailure(
          command, "RECONNECT_COMMAND_ALREADY_PENDING",
          "another reboot-dependent command is awaiting confirmation");
      return;
    }
    const String previousSsid = wifiSsid;
    const String previousPassword = wifiPass;
    const String expectedWifiConfigProof =
        buildWifiConfigProof(ssid, password);
    if (expectedWifiConfigProof.length() != 64 ||
        !persistPendingReconnectReceipt(command, ssid,
                                        expectedWifiConfigProof)) {
      sendDurableReconnectFailure(
          command, "RECONNECT_RECEIPT_WRITE_FAILED",
          "WiFi reconnect receipt was not durably stored");
      return;
    }
    copyConfigValue(wifiSsid, sizeof(wifiSsid), ssid);
    copyConfigValue(wifiPass, sizeof(wifiPass), password, false);
    if (!saveRuntimeConfig()) {
      copyConfigValue(wifiSsid, sizeof(wifiSsid), previousSsid);
      copyConfigValue(wifiPass, sizeof(wifiPass), previousPassword, false);
      const bool rollbackStored = saveRuntimeConfig();
      const bool receiptErased = erasePendingReconnectReceipt();
      sendDurableReconnectFailure(
          command,
          rollbackStored && receiptErased ? "WIFI_CONFIG_PERSIST_FAILED"
                                          : "WIFI_CONFIG_ROLLBACK_FAILED",
          rollbackStored && receiptErased
              ? "wifi configuration was not durably stored"
              : "wifi configuration rollback requires local recovery");
      return;
    }
    recentCommandIds.rememberValidated(command.id, true);
    sendCommandState(command, "applying", "WIFI_RECONNECTING",
                     "wifi configuration persisted; applied requires authenticated reconnect");
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
    const std::string manifestFingerprint =
        otaManifestEffectFingerprint(ota.manifest);
    if (manifestFingerprint.empty()) {
      sendCommandState(command, "failed", "OTA_FINGERPRINT_FAILED",
                       "signed ota effect fingerprint could not be created");
      return;
    }

    // Reset any terminal marker from a previous OTA before installing the new
    // durable receipt. A power loss after this write but before the receipt is
    // harmless; no download or flash side effect has started.
    if (!persistOtaBootOutcome("prepared")) {
      sendCommandState(command, "failed", "OTA_BOOT_MARKER_PREPARE_FAILED",
                       "new ota boot marker could not be prepared durably");
      return;
    }
    if (!persistPendingOtaReceipt(command, ota.manifest,
                                  manifestFingerprint)) {
      sendCommandState(command, "failed", "OTA_RECEIPT_PERSIST_FAILED",
                       "ota identity receipt could not be stored durably");
      return;
    }

    beginValidatedCommand(command);
    String failureCode;
    const bool applied = performCloudOta(
        command, ota.manifest, manifestFingerprint, failureCode);
    if (!applied) {
      sendCommandState(command, "failed", failureCode.c_str(),
                       "verified firmware update failed");
    }
    return;
  }
}

void handleCloudMessage(const String &message) {
  if (!otaRecoveryRuntimeServicesAllowed()) {
    return;
  }
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
  if (type == "event.accepted" || type == "event.rejected") {
    const String eventType = document["eventType"] | "";
    const String acceptedStatus = document["otaStatus"] | "";
    const String commandId = document["commandId"] | "";
    const String correlationId = document["correlationId"] | "";
    const String otaId = document["otaId"] | "";
    const bool terminal = acceptedStatus == "confirmed" ||
                          acceptedStatus == "rolled_back" ||
                          acceptedStatus == "failed" ||
                          acceptedStatus == "expired";
    if (type == "event.accepted" && pendingOtaReceiptReady && terminal &&
        eventType.startsWith("ota.") &&
        commandId == pendingOtaReceipt.commandId.c_str() &&
        correlationId == pendingOtaReceipt.correlationId.c_str() &&
        otaId == pendingOtaReceipt.otaId.c_str() &&
        acceptedStatus == pendingOtaReceipt.status.c_str()) {
      shcare::PendingOtaReplayOutcome outcome;
      shcare::CommandEnvelope tombstoneCommand;
      tombstoneCommand.protocolVersion = shcare::kDeviceProtocolVersion;
      tombstoneCommand.id = pendingOtaReceipt.commandId;
      tombstoneCommand.correlationId = pendingOtaReceipt.correlationId;
      tombstoneCommand.type = "ota.update";
      const bool tombstoneStored =
          shcare::buildPendingOtaReplayOutcome(pendingOtaReceipt, outcome) &&
          persistTerminalCommand(
              tombstoneCommand, outcome.commandState.c_str(),
              outcome.commandCode.c_str(),
              "durable ota terminal event accepted",
              pendingOtaReceipt.manifestFingerprint);
      if (!tombstoneStored) {
        Serial.println(
            "Accepted OTA event tombstone persistence failed; receipt retained.");
      } else if (!erasePendingOtaReceipt()) {
        Serial.println("Accepted OTA event receipt cleanup will retry.");
      }
    } else if (type == "event.rejected") {
      const String rejectionCode = document["code"] | "DEVICE_EVENT_REJECTED";
      Serial.print("OTA event receipt was rejected and will retry: ");
      Serial.println(rejectionCode);
    }
    return;
  }
  handleCloudCommand(message);
}

void setupCloudSocket() {
  if (!otaRecoveryRuntimeServicesAllowed()) {
    return;
  }
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
#if SMART_HEALTH_PRODUCTION_PROFILE
    boundedCloudTcpClient->setCACert(BACKEND_CA_CERT);
#elif SMART_HEALTH_HIL_RUNTIME_CONFIG
    hilSecureCloudTcpClient->setCACert(BACKEND_CA_CERT);
#else
    cloudSocket.setCACert(BACKEND_CA_CERT);
#endif
  }
  cloudSocket.onMessage([](WebsocketsMessage message) {
    handleCloudMessage(message.data());
  });
  cloudSocket.onEvent([](WebsocketsEvent event, String data) {
    if (event == WebsocketsEvent::ConnectionOpened) {
      cloudTransportConnected = true;
      cloudConnected = false;
      cloudTransportConnectedAtMs = millis();
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
      cloudTransportConnectedAtMs = 0;
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
  if (!otaRecoveryRuntimeServicesAllowed()) {
    return;
  }
  if (!cloudConfigured || WiFi.status() != WL_CONNECTED || deviceLocked) {
    return;
  }
  if (cloudSecurityDecision.transport == shcare::CloudTransport::Wss &&
      !hasTrustedClock()) {
    if (!cloudClockWaitReported) {
      Serial.println(
          "WSS waits for trusted network time before certificate validation.");
      cloudClockWaitReported = true;
    }
    return;
  }
  cloudClockWaitReported = false;
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
#if SMART_HEALTH_HIL_RUNTIME_CONFIG
  // Deliberately expose only the non-secret prerequisites for a local TLS
  // diagnosis. The production image never contains this HIL-only message.
  Serial.printf("Local HIL TLS preflight: epoch=%lld, caTrust=%s.\n",
                static_cast<long long>(time(nullptr)),
                strlen(BACKEND_CA_CERT) > 0 ? "configured" : "missing");
#endif
#if SMART_HEALTH_PRODUCTION_PROFILE || SMART_HEALTH_HIL_RUNTIME_CONFIG
  // Production security already requires WSS. Calling the host/port/path
  // overload retains the bounded, CA-configured transport instead of letting
  // ArduinoWebsockets replace it with its default 30-120 second TLS client.
  cloudSocket.connect(String(backendHost), backendPort, String("/esp"));
#else
  cloudSocket.connect(url);
#endif
}

void handleCloudSocket() {
  if (!otaRecoveryRuntimeServicesAllowed()) {
    return;
  }
  if (!cloudConfigured) {
    queueOfflineTelemetryIfDue();
    return;
  }
  cloudSocket.poll();
  if (shcare::cloudAuthenticationTimedOut(
          cloudTransportConnected, cloudConnected,
          static_cast<std::uint32_t>(millis()),
          static_cast<std::uint32_t>(cloudTransportConnectedAtMs),
          static_cast<std::uint32_t>(CLOUD_AUTH_HANDSHAKE_TIMEOUT_MS))) {
    Serial.println(
        "Cloud authentication timed out; reopening the bounded WSS session.");
    // Reset locally before close(): this also recovers libraries/transports
    // that never deliver their ConnectionClosed callback after a server-side
    // AUTH_TIMEOUT close.
    cloudTransportConnected = false;
    cloudConnected = false;
    cloudTransportConnectedAtMs = 0;
    cloudSessionId = "";
    cloudAuthChallengeId = "";
    cloudAuthNonce = "";
    cloudAuthHandshake.reset();
    authenticatedProductionHeartbeatObserved = false;
    resetAudioSession();
    cloudSocket.close();
    lastCloudConnectAttemptMs = millis();
  }
  connectCloudSocketIfNeeded();
  if (!cloudConnected) {
    queueOfflineTelemetryIfDue();
    return;
  }
  flushOfflineOperationalQueue();
  replayPendingOtaTerminalEvent();
  if (millis() - lastCloudTelemetryMs > CLOUD_TELEMETRY_INTERVAL_MS) {
    sendCloudTelemetry("telemetry");
  }
}

void drainAudioCaptureQueue(std::size_t maxPackets) {
  if (audioCaptureQueue == nullptr || maxPackets == 0 ||
      !otaRecoveryRuntimeServicesAllowed()) {
    return;
  }

  AudioCaptureItem item;
  for (std::size_t drained = 0;
       drained < maxPackets &&
       xQueueReceive(audioCaptureQueue, &item, 0) == pdTRUE;
       ++drained) {
    const std::uint32_t ageMs =
        static_cast<std::uint32_t>(millis()) - item.capturedAtMonotonicMs;
    if (ageMs > AUDIO_CAPTURE_MAX_FRAME_AGE_MS) {
      if (audioCaptureFramesStale != UINT32_MAX) {
        ++audioCaptureFramesStale;
      }
      if (item.sessionBound &&
          item.sessionGeneration == currentAudioSessionGeneration()) {
        audioDiscontinuityPending = true;
      }
      continue;
    }

    if (item.sessionBound) {
      portENTER_CRITICAL(&audioCaptureStateMux);
      const bool currentSession =
          audioSessionActive &&
          item.sessionGeneration == audioSessionGeneration;
      portEXIT_CRITICAL(&audioCaptureStateMux);
      if (!currentSession) {
        if (audioCaptureFramesStale != UINT32_MAX) {
          ++audioCaptureFramesStale;
        }
        continue;
      }
    }

    if (!cloudConnected) {
      if (cloudConfigured && wsSendFailures != UINT32_MAX) {
        ++wsSendFailures;
      }
      sendAudioUdp(item.pcm, item.sampleCount);
      continue;
    }
    if (!item.sessionBound || item.sampleCount == 0 ||
        item.capturedAtEpochMs == 0) {
      if (item.sessionBound) {
        if (wsSendFailures != UINT32_MAX) {
          ++wsSendFailures;
        }
        audioDiscontinuityPending = true;
      }
      continue;
    }

    if (nextExpectedCaptureOrdinalReady &&
        item.captureOrdinal != nextExpectedCaptureOrdinal) {
      audioDiscontinuityPending = true;
    }
    uint8_t flags = audioSequence == 0 ? shcare::kAudioV2FlagStart : 0;
    if (audioSequence > 0 && audioDiscontinuityPending) {
      flags |= shcare::kAudioV2FlagDiscontinuity;
    }
    const auto frame = shcare::buildAudioFrameV2(
        std::string(activeAudioSessionId.c_str()),
        std::string(activeAudioScanId.c_str()), audioSequence,
        item.capturedAtEpochMs, item.pcm,
        static_cast<size_t>(item.sampleCount), flags, audioFrameBuffer,
        sizeof(audioFrameBuffer));
    if (!frame.ok()) {
      if (wsSendFailures != UINT32_MAX) {
        ++wsSendFailures;
      }
      resetAudioSession();
      sendCloudEvent("audio.failed", "failed", "audio v2 frame rejected");
      return;
    }

    nextExpectedCaptureOrdinal = item.captureOrdinal + 1U;
    nextExpectedCaptureOrdinalReady = true;
    bool transportWriteComplete = true;
#if SMART_HEALTH_PRODUCTION_PROFILE
    boundedCloudTcpClient->beginObservedWrite();
#endif
    const bool websocketAccepted = cloudSocket.sendBinary(
        (const char *)audioFrameBuffer, frame.bytesWritten);
#if SMART_HEALTH_PRODUCTION_PROFILE
    transportWriteComplete =
        boundedCloudTcpClient->consumeObservedWriteComplete();
#endif
    if (websocketAccepted && transportWriteComplete) {
      if (wsPacketsSent != UINT32_MAX) {
        ++wsPacketsSent;
      }
      audioDiscontinuityPending = false;
      if (audioSequence == UINT32_MAX) {
        resetAudioSession();
        sendCloudEvent("audio.failed", "failed", "audio sequence exhausted");
        return;
      }
      ++audioSequence;
      continue;
    }

#if SMART_HEALTH_PRODUCTION_PROFILE
    if (websocketAccepted && !transportWriteComplete) {
      // ArduinoWebsockets 0.5.4 reports true after invoking a void transport
      // send. A short TLS write corrupts the frame boundary, so fail the socket
      // and let the normal close callback clear authentication/session state.
      boundedCloudTcpClient->forceClose();
      cloudSocket.available();
    }
#endif

    if (wsSendFailures != UINT32_MAX) {
      ++wsSendFailures;
    }
    // A failed START is retried as sequence zero with the next captured frame.
    // Later failed attempts consume their sequence and mark the next frame as a
    // discontinuity, preserving the existing SHC2 sender contract.
    if (audioSequence > 0 && audioSequence < UINT32_MAX) {
      ++audioSequence;
    }
    audioDiscontinuityPending = true;
  }
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
  if (!otaRecoveryRuntimeServicesAllowed()) {
    return;
  }
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
    if (!pauseAudioCaptureTask()) {
      Serial.println("ArduinoOTA aborted: audio capture did not pause safely.");
      Update.abort();
      otaInProgress = false;
      return;
    }
    otaInProgress = true;
    if (i2sReady) {
      const esp_err_t pauseResult = i2s_stop(MIC_I2S_PORT);
      if (pauseResult == ESP_OK) {
        i2sMaintenancePaused = true;
      } else {
        resumeAudioCaptureTask();
        markI2sCaptureDegraded("I2S_LAN_OTA_PAUSE_FAILED");
      }
    }
  });
  ArduinoOTA.onEnd([]() {
    Serial.println("ArduinoOTA update finished.");
    if (i2sReady && i2sMaintenancePaused) {
      const esp_err_t result = i2s_start(MIC_I2S_PORT);
      i2sMaintenancePaused = false;
      if (result != ESP_OK) {
        markI2sCaptureDegraded("I2S_LAN_OTA_RESUME_FAILED");
      } else {
        resumeAudioCaptureTask();
      }
    } else {
      resumeAudioCaptureTask();
    }
    otaInProgress = false;
  });
  ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
    feedTaskWatchdog();
    Serial.printf("ArduinoOTA progress: %u%%\r", (progress * 100) / total);
  });
  ArduinoOTA.onError([](ota_error_t error) {
    Serial.printf("ArduinoOTA error[%u]\n", error);
    if (i2sReady && i2sMaintenancePaused) {
      const esp_err_t result = i2s_start(MIC_I2S_PORT);
      i2sMaintenancePaused = false;
      if (result != ESP_OK) {
        markI2sCaptureDegraded("I2S_LAN_OTA_RESUME_FAILED");
      } else {
        resumeAudioCaptureTask();
      }
    } else {
      resumeAudioCaptureTask();
    }
    otaInProgress = false;
  });
  ArduinoOTA.begin();
  otaReady = true;

  Serial.print("ArduinoOTA ready: ");
  Serial.println(deviceName);
}

void startStationServices() {
  if (!otaRecoveryRuntimeServicesAllowed()) {
    return;
  }
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }
  setupCloudSocket();
  connectCloudSocketIfNeeded();
  if (SMART_HEALTH_ENABLE_LAN_OTA != 0) {
    startMdns();
  }
  setupArduinoOta();
  Serial.println("Local admin server disabled; device is managed through Smart Health cloud.");
}

void handleDeviceServices() {
  maintainTaskWatchdog();
  handleFactoryResetButton();

  if (!otaRecoveryRuntimeServicesAllowed()) {
    return;
  }
  handleI2SRecovery();

  if (setupPortalActive && configServerStarted) {
    setupServer.handleClient();
  }

  if (otaReady && !audioSessionActive && !otaInProgress) {
    ArduinoOTA.handle();
  }

  drainAudioCaptureQueue(AUDIO_CAPTURE_MAX_DRAIN_PER_LOOP);
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

void resetAudioSignalState() {
  dcOffset = 0.0f;
  inputSmooth = 0.0f;
  outputSmooth = 0.0f;
  compressorEnvelope = 0.0f;
  compressorNoise = 8.0f;
  compressorActivity = 0.0f;
  compressorGain = 1.0f;
  compressorHoldCounter = 0;
  agcGain = 1.0f;
  heartEnvelope = 0.0f;
  heartEnvelopeMean = 0.0f;
  heartThreshold = 500.0f;
  heartBpm = 0.0f;
  sampleCounter = 0;
  lastBeatSample = 0;
  beatsInPlotWindow = 0;
  beatArmed = true;
}

void configureAudioProfile(
    const shcare::AudioCaptureProfileDecision &profile) {
  activeAudioProfile = profile.profile;
  activeProfileUsesHeartMetrics = profile.heartMetricsEnabled;
  activeAudioProfileName =
      profile.profile == shcare::AudioCaptureProfile::Lung ? "lung" : "heart";
  volumeGain = profile.listenGain;
  agcMaxGain = profile.agcMaxGain;
  outputSmoothingAlpha = profile.outputSmoothingAlpha;
  activeHighPassStages = profile.highPassStages;
  activeLowPassStages = profile.lowPassStages;
  activeHumNotch50Enabled = profile.humNotch50Enabled;
  activeHumNotch100Enabled = profile.humNotch100Enabled;
  agcActivityRms =
      profile.profile == shcare::AudioCaptureProfile::Lung ? 48 : 32;
  listenHighPass.setHighPass(profile.lowCutHz, FILTER_Q);
  listenHighPass2.setHighPass(profile.lowCutHz, FILTER_Q);
  humNotch50.setNotch(50.0f, HUM_NOTCH_Q);
  humNotch100.setNotch(100.0f, HUM_NOTCH_Q);
  listenLowPass1.setLowPass(profile.highCutHz, FILTER_Q);
  listenLowPass2.setLowPass(profile.highCutHz, FILTER_Q);
  listenLowPass3.setLowPass(profile.highCutHz, FILTER_Q);
  resetAudioSignalState();

  Serial.print("Auscultation profile ready: ");
  Serial.print(activeAudioProfileName);
  Serial.print(" ");
  Serial.print(profile.lowCutHz);
  Serial.print(" - ");
  Serial.print(profile.highCutHz);
  Serial.println(" Hz");
  if (activeHumNotch50Enabled) {
    Serial.println(activeHumNotch100Enabled
                       ? "Hum notches ready: 50 Hz and 100 Hz"
                       : "Hum notch ready: 50 Hz");
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

void setupAudioFilters() {
  configureAudioProfile(shcare::resolveAudioCaptureProfile("heart"));
}

void handleWiFiReconnect() {
  if (!otaRecoveryRuntimeServicesAllowed()) {
    return;
  }
  if (setupPortalActive || smartConfigActive || !hasWiFiConfig()) {
    return;
  }

  if (WiFi.status() == WL_CONNECTED) {
    if (!wifiConnectionObserved) {
      wifiConnectionObserved = true;
      wifiReconnectAttempted = false;
      wifiReconnectFailureCount = 0;
      wifiReconnectDelayMs = 0;
      lastWifiConnectAttemptMs = 0;
      cloudReconnectFailureCount = 0;
      cloudReconnectDelayMs = 0;
      lastCloudConnectAttemptMs = 0;
      Serial.println();
      Serial.println("WiFi connected");
      Serial.print("ESP32 IP: ");
      Serial.println(WiFi.localIP());
      bootstrapHilTrustedClock();
      configTime(0, 0, "pool.ntp.org", "time.google.com");
      setupAudioUdp();
      startStationServices();
    }
    return;
  }

  if (wifiConnectionObserved) {
    wifiConnectionObserved = false;
    udpAudioReady = false;
    Serial.println("WiFi disconnected; local I2S capture remains active.");
  }

  const unsigned long nowMs = millis();
  const unsigned long minimumWaitMs =
      std::max(wifiReconnectDelayMs, WIFI_ASSOCIATION_TIMEOUT_MS);
  if (wifiReconnectAttempted &&
      nowMs - lastWifiConnectAttemptMs < minimumWaitMs) {
    return;
  }

  lastWifiConnectAttemptMs = nowMs;
  wifiReconnectAttempted = true;
  if (wifiReconnectFailureCount < 31U) {
    ++wifiReconnectFailureCount;
  }
  if (shcare::shouldOpenSetupPortalAfterReconnectFailures(
          wifiReconnectFailureCount, SETUP_PORTAL_AUTO_RECOVERY_FAILURES)) {
    startSmartConfigProvisioning("saved WiFi could not reconnect");
    return;
  }
  wifiReconnectDelayMs = shcare::reconnectBackoffDelayMs(
      wifiReconnectFailureCount, WIFI_RECONNECT_BASE_MS,
      WIFI_RECONNECT_MAX_MS);

  Serial.print("Starting bounded WiFi reconnect attempt ");
  Serial.println(wifiReconnectFailureCount);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(wifiSsid, wifiPass);
}

void setupWiFi() {
  if (!otaRecoveryRuntimeServicesAllowed()) {
    return;
  }
  if (!hasWiFiConfig()) {
    startSmartConfigProvisioning("WiFi setup is required before cloud connection");
    return;
  }
  if (setupPortalPhysicalGesture) {
    runSetupPortal("Physical setup gesture requested WiFi recovery.");
    if (!otaRecoveryRuntimeServicesAllowed()) {
      return;
    }
  }
  handleWiFiReconnect();
}

void setupAudioUdp() {
  if (!otaRecoveryRuntimeServicesAllowed()) {
    return;
  }
  udpAudioReady = false;
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }
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

void sendAudioUdp(const int16_t *samples, const int samplesRead) {
  if (!otaRecoveryRuntimeServicesAllowed() || !udpAudioReady ||
      WiFi.status() != WL_CONNECTED || samples == nullptr || samplesRead <= 0) {
    return;
  }

  const size_t bytesToSend = samplesRead * sizeof(int16_t);

  audioUdp.beginPacket(audioServerIp, audioUdpPort);
  audioUdp.write((const uint8_t *)samples, bytesToSend);

  if (audioUdp.endPacket() == 1) {
    udpPacketsSent++;
  } else {
    udpSendFailures++;
  }
}

bool releaseI2SDriver() {
  if (!pauseAudioCaptureTask()) {
    return false;
  }
  i2sReady = false;
  if (!i2sDriverInstalled) {
    return true;
  }
  const esp_err_t stopResult = i2s_stop(MIC_I2S_PORT);
  const esp_err_t uninstallResult = i2s_driver_uninstall(MIC_I2S_PORT);
  if (uninstallResult != ESP_OK) {
    Serial.printf("i2s_driver_uninstall failed after capture pause: %s\n",
                  esp_err_to_name(uninstallResult));
    return false;
  }
  i2sDriverInstalled = false;
  i2sMaintenancePaused = true;
  if (stopResult != ESP_OK && stopResult != ESP_ERR_INVALID_STATE) {
    Serial.printf("i2s_stop reported during release: %s\n",
                  esp_err_to_name(stopResult));
  }
  return true;
}

void scheduleI2sRetry(const char *stableCode, bool initFailure) {
  i2sReady = false;
  i2sRuntimeState = I2sRuntimeState::Degraded;
  lastI2sFailureCode = stableCode == nullptr ? "I2S_FAILED" : stableCode;
  lastI2sAttemptMs = millis();
  if (initFailure && i2sInitFailureCount != UINT32_MAX) {
    ++i2sInitFailureCount;
  }
  if (i2sBackoffAttemptCount < 31U) {
    ++i2sBackoffAttemptCount;
  }
  i2sRetryDelayMs = shcare::reconnectBackoffDelayMs(
      i2sBackoffAttemptCount, I2S_RETRY_BASE_MS, I2S_RETRY_MAX_MS);
  resetAudioSession();
  sendCloudEvent("i2s.degraded", "degraded",
                 lastI2sFailureCode.c_str());
}

bool setupI2S(bool recoveryAttempt) {
  if (!otaRecoveryRuntimeServicesAllowed()) {
    return false;
  }
  if (!pauseAudioCaptureTask()) {
    scheduleI2sRetry("I2S_CAPTURE_PAUSE_TIMEOUT", true);
    return false;
  }
  if (i2sDriverInstalled && !releaseI2SDriver()) {
    scheduleI2sRetry("I2S_DRIVER_RELEASE_FAILED", true);
    resumeAudioCaptureTask();
    return false;
  }
  i2sReady = false;
  i2sRuntimeState = recoveryAttempt ? I2sRuntimeState::Retrying
                                    : I2sRuntimeState::Starting;
  lastI2sAttemptMs = millis();
  if (recoveryAttempt && i2sRecoveryAttemptCount != UINT32_MAX) {
    ++i2sRecoveryAttemptCount;
  }
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
    Serial.println(esp_err_to_name(err));
    scheduleI2sRetry("I2S_DRIVER_INSTALL_FAILED", true);
    resumeAudioCaptureTask();
    return false;
  }
  i2sDriverInstalled = true;

  err = i2s_set_pin(MIC_I2S_PORT, &pin_config);
  if (err != ESP_OK) {
    Serial.print("i2s_set_pin failed: ");
    Serial.println(esp_err_to_name(err));
    releaseI2SDriver();
    scheduleI2sRetry("I2S_PIN_CONFIG_FAILED", true);
    resumeAudioCaptureTask();
    return false;
  }

  err = i2s_zero_dma_buffer(MIC_I2S_PORT);
  if (err != ESP_OK) {
    Serial.print("i2s_zero_dma_buffer failed: ");
    Serial.println(esp_err_to_name(err));
    releaseI2SDriver();
    scheduleI2sRetry("I2S_DMA_INIT_FAILED", true);
    resumeAudioCaptureTask();
    return false;
  }
  i2sReady = true;
  i2sMaintenancePaused = false;
  i2sRuntimeState = I2sRuntimeState::Ready;
  i2sConsecutiveReadFailures = 0;
  const bool recovered = recoveryAttempt || i2sBackoffAttemptCount > 0;
  i2sBackoffAttemptCount = 0;
  i2sRetryDelayMs = I2S_RETRY_BASE_MS;
  lastI2sFailureCode = "";
  if (recovered) {
    if (i2sRecoverySuccessCount != UINT32_MAX) {
      ++i2sRecoverySuccessCount;
    }
    sendCloudEvent("i2s.recovered", "ready",
                   "i2s capture recovered; a new audio session is required");
  }

  Serial.println("I2S microphone ready");
  resumeAudioCaptureTask();
  return true;
}

void markI2sCaptureDegraded(const char *stableCode) {
  const bool sessionInterrupted = audioSessionActive;
  if (!releaseI2SDriver()) {
    stableCode = "I2S_DRIVER_RELEASE_FAILED";
  }
  scheduleI2sRetry(stableCode, false);
  resumeAudioCaptureTask();
  if (sessionInterrupted) {
    sendCloudEvent("audio.failed", "failed",
                   "i2s capture interrupted; session was closed");
  }
}

void handleI2SRecovery() {
  bool captureFault = false;
  bool emptyFault = false;
  portENTER_CRITICAL(&audioCaptureStateMux);
  captureFault = pendingI2sCaptureFault;
  emptyFault = pendingI2sCaptureEmptyFault;
  pendingI2sCaptureFault = false;
  pendingI2sCaptureEmptyFault = false;
  portEXIT_CRITICAL(&audioCaptureStateMux);
  if (captureFault) {
    markI2sCaptureDegraded(emptyFault ? "I2S_READ_EMPTY" : "I2S_READ_FAILED");
    return;
  }
  if (i2sReady ||
      millis() - lastI2sAttemptMs < i2sRetryDelayMs) {
    return;
  }
  setupI2S(true);
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
  float y = listenHighPass.process(x);
  if (activeHighPassStages > 1U) {
    y = listenHighPass2.process(y);
  }
  if (activeHumNotch50Enabled) {
    y = humNotch50.process(y);
    if (activeHumNotch100Enabled) {
      y = humNotch100.process(y);
    }
  }
  y = listenLowPass1.process(y);
  if (activeLowPassStages > 1U) {
    y = listenLowPass2.process(y);
  }
  if (activeLowPassStages > 2U) {
    y = listenLowPass3.process(y);
  }

  int32_t filteredLevel = (int32_t)fabsf(y);
  if (filteredLevel > filteredPeak) {
    filteredPeak = filteredLevel;
  }

  if (ENABLE_SOFT_NOISE_FLOOR) {
    y = applySoftNoiseFloor(y);
  }

  const bool biologicalSignalDetected =
      selectedAudioSignalState == shcare::AudioSlotSignalState::Detected;
  if (ENABLE_SOFT_COMPRESSOR && biologicalSignalDetected) {
    y = applySoftCompressor(y);
  } else {
    // Preserve a quiet monitor path for placement diagnostics, but never let
    // the adaptive compressor turn a stationary MEMS noise floor into loud
    // fake heart/lung audio.
    compressorActivity += 0.04f * (0.0f - compressorActivity);
    compressorGain += 0.04f * (1.0f - compressorGain);
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

  outputSmooth += outputSmoothingAlpha * (y - outputSmooth);

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
  if (activeProfileUsesHeartMetrics) {
    updateHeartMetrics(metricAudio);
  } else {
    heartBpm = 0.0f;
  }

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

    const bool biologicalSignalDetected =
        selectedAudioSignalState == shcare::AudioSlotSignalState::Detected;
    if (biologicalSignalDetected && rms > agcActivityRms &&
        compressorActivity > 0.45f) {
      float desiredGain = targetRms / (float)rms;

      if (desiredGain < agcMin)
        desiredGain = agcMin;
      if (desiredGain > agcMaxGain)
        desiredGain = agcMaxGain;

      const float agcAlpha = desiredGain < agcGain ? 0.18f : 0.10f;
      agcGain += agcAlpha * (desiredGain - agcGain);
    } else if (agcGain > agcMin) {
      const float releaseAlpha = biologicalSignalDetected ? 0.035f : 0.18f;
      agcGain += releaseAlpha * (agcMin - agcGain);
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

    Serial.print(">i2sSlot0Rms:");
    Serial.println(i2sSlot0Diagnostics.rms);

    Serial.print(">i2sSlot0Peak:");
    Serial.println(i2sSlot0Diagnostics.peak);

    Serial.print(">i2sSlot0ActiveWindows:");
    Serial.println(i2sSlot0Diagnostics.activeWindowCount);

    Serial.print(">i2sSlot1Rms:");
    Serial.println(i2sSlot1Diagnostics.rms);

    Serial.print(">i2sSlot1Peak:");
    Serial.println(i2sSlot1Diagnostics.peak);

    Serial.print(">i2sSlot1ActiveWindows:");
    Serial.println(i2sSlot1Diagnostics.activeWindowCount);

    Serial.print(">audioProfile:");
    Serial.println(activeAudioProfileName);

    Serial.print(">audioCaptureSlot:");
    Serial.println(selectedAudioCaptureSlot);

    Serial.print(">audioCaptureSlotSwitches:");
    Serial.println(audioCaptureSlotSwitchCount);

    Serial.print(">audioSignalQuality:");
    Serial.println(audioSignalStateLabel(selectedAudioSignalState));

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

std::uint32_t saturatingCounterAdd(std::uint32_t current,
                                   std::uint32_t increment) {
  return current > UINT32_MAX - increment ? UINT32_MAX : current + increment;
}

void updateI2sSlotDiagnostics(const int32_t *interleavedSamples,
                              const int frameCount) {
  if (interleavedSamples == nullptr || frameCount <= 0) {
    return;
  }

  I2sSlotDiagnostics *slots[I2S_CHANNEL_COUNT] = {
      &i2sSlot0Diagnostics,
      &i2sSlot1Diagnostics,
  };
  for (int slotIndex = 0; slotIndex < I2S_CHANNEL_COUNT; ++slotIndex) {
    std::uint64_t sumSquares = 0;
    std::uint32_t peak = 0;
    std::uint32_t nonZeroSamples = 0;
    for (int frame = 0; frame < frameCount; ++frame) {
      const std::int64_t shiftedSample =
          static_cast<std::int64_t>(
              interleavedSamples[frame * I2S_CHANNEL_COUNT + slotIndex]) >>
          RAW_SHIFT;
      const std::uint64_t magnitude =
          shiftedSample < 0 ? static_cast<std::uint64_t>(-shiftedSample)
                            : static_cast<std::uint64_t>(shiftedSample);
      sumSquares += magnitude * magnitude;
      if (magnitude > peak) {
        peak = static_cast<std::uint32_t>(magnitude);
      }
      if (magnitude != 0) {
        ++nonZeroSamples;
      }
    }

    I2sSlotDiagnostics &diagnostics = *slots[slotIndex];
    const std::uint32_t frameRms = static_cast<std::uint32_t>(
        sqrtf(static_cast<float>(sumSquares / frameCount)));
    diagnostics.rms = frameRms;
    diagnostics.peak = peak;
    diagnostics.windowCount =
        saturatingCounterAdd(diagnostics.windowCount, 1);
    // Do not count the MEMS noise floor as an active biological-signal
    // window. This threshold matches the slot classifier used for capture.
    const bool signalDetected = frameRms >= 96U && peak >= 256U;
    diagnostics.activeWindowCount = saturatingCounterAdd(
        diagnostics.activeWindowCount, signalDetected ? 1U : 0U);
    diagnostics.sampleCount = saturatingCounterAdd(
        diagnostics.sampleCount, static_cast<std::uint32_t>(frameCount));
    diagnostics.nonZeroSampleCount = saturatingCounterAdd(
        diagnostics.nonZeroSampleCount, nonZeroSamples);
  }
}

void captureI2sFrame() {
  if (!otaRecoveryRuntimeServicesAllowed() || !i2sReady ||
      i2sMaintenancePaused) {
    return;
  }

  size_t bytesRead = 0;
  const esp_err_t result =
      i2s_read(MIC_I2S_PORT, micBuffer, sizeof(micBuffer), &bytesRead,
               pdMS_TO_TICKS(250));

  if (result == ESP_OK && bytesRead > 0) {
    i2sConsecutiveReadFailures = 0;
    const int samplesRead =
        bytesRead / (sizeof(int32_t) * I2S_CHANNEL_COUNT);
    updateI2sSlotDiagnostics(micBuffer, samplesRead);

    shcare::AudioSlotFrameStats slot0Stats;
    shcare::AudioSlotFrameStats slot1Stats;
    for (int i = 0; i < samplesRead; ++i) {
      const int sampleOffset = i * I2S_CHANNEL_COUNT;
      const int32_t shifted0 =
          micBuffer[sampleOffset + I2S_LEFT_SLOT_INDEX] >> RAW_SHIFT;
      const int32_t shifted1 =
          micBuffer[sampleOffset + I2S_RIGHT_SLOT_INDEX] >> RAW_SHIFT;
      const std::uint32_t absolute0 = static_cast<std::uint32_t>(abs32(shifted0));
      const std::uint32_t absolute1 = static_cast<std::uint32_t>(abs32(shifted1));
      slot0Stats.energy += static_cast<std::uint64_t>(
          static_cast<std::int64_t>(shifted0) * shifted0);
      slot1Stats.energy += static_cast<std::uint64_t>(
          static_cast<std::int64_t>(shifted1) * shifted1);
      if (absolute0 > slot0Stats.peak) {
        slot0Stats.peak = absolute0;
      }
      if (absolute1 > slot1Stats.peak) {
        slot1Stats.peak = absolute1;
      }
      slot0Stats.nonZeroSamples += shifted0 != 0 ? 1U : 0U;
      slot1Stats.nonZeroSamples += shifted1 != 0 ? 1U : 0U;
      slot0Stats.clippedSamples += absolute0 >= I2S_SLOT_CLIP_LEVEL ? 1U : 0U;
      slot1Stats.clippedSamples += absolute1 >= I2S_SLOT_CLIP_LEVEL ? 1U : 0U;
    }
    const std::uint8_t nextCaptureSlot = shcare::selectAudioCaptureSlot(
        slot0Stats, slot1Stats, selectedAudioCaptureSlot,
        static_cast<std::size_t>(samplesRead));
    if (nextCaptureSlot != selectedAudioCaptureSlot) {
      selectedAudioCaptureSlot = nextCaptureSlot;
      if (audioCaptureSlotSwitchCount != UINT32_MAX) {
        ++audioCaptureSlotSwitchCount;
      }
    }
    selectedAudioSignalState = shcare::classifyAudioSlotSignal(
        selectedAudioCaptureSlot == 0U ? slot0Stats : slot1Stats,
        static_cast<std::size_t>(samplesRead));

    AudioCaptureItem item;
    item.sampleCount = static_cast<std::uint16_t>(samplesRead);
    item.capturedAtMonotonicMs = static_cast<std::uint32_t>(millis());
    for (int i = 0; i < samplesRead; i++) {
      const int sampleOffset = i * I2S_CHANNEL_COUNT;
      const int32_t rawSelected =
          micBuffer[sampleOffset + selectedAudioCaptureSlot];

      const int32_t rawLevel = abs32(rawSelected >> RAW_SHIFT);
      if (rawLevel > rawPeak) {
        rawPeak = rawLevel;
      }

      const float centered = preprocessRawSample(rawSelected);
      const int16_t listen16 = processListenSample(centered);
      const int16_t metric16 = processMetricSample(centered);

      item.pcm[i] = selectStreamSample(centered, listen16, metric16);
      updateAgcAndPlotter(listen16, metric16);
    }
    portENTER_CRITICAL(&audioCaptureStateMux);
    item.sessionBound = audioSessionActive;
    item.sessionGeneration = audioSessionGeneration;
    if (item.sessionBound) {
      item.captureOrdinal = audioCaptureOrdinal;
      if (audioCaptureOrdinal != UINT32_MAX) {
        ++audioCaptureOrdinal;
      }
    }
    portEXIT_CRITICAL(&audioCaptureStateMux);
    if (item.sessionBound) {
      const int64_t epochMs = currentEpochMillis();
      item.capturedAtEpochMs = epochMs > 0 ? static_cast<uint64_t>(epochMs) : 0;
    }
    if (audioCaptureQueue != nullptr && (item.sessionBound || udpAudioReady)) {
      if (xQueueSend(audioCaptureQueue, &item, 0) == pdTRUE) {
        portENTER_CRITICAL(&audioCaptureStateMux);
        if (audioCaptureFramesEnqueued != UINT32_MAX) {
          ++audioCaptureFramesEnqueued;
        }
        const std::uint32_t queueDepth =
            static_cast<std::uint32_t>(uxQueueMessagesWaiting(audioCaptureQueue));
        if (queueDepth > audioCaptureQueueHighWater) {
          audioCaptureQueueHighWater = queueDepth;
        }
        portEXIT_CRITICAL(&audioCaptureStateMux);
      } else {
        portENTER_CRITICAL(&audioCaptureStateMux);
        if (audioCaptureFramesDropped != UINT32_MAX) {
          ++audioCaptureFramesDropped;
        }
        portEXIT_CRITICAL(&audioCaptureStateMux);
      }
    }
    return;
  }

  if (i2sReadFailureCount != UINT32_MAX) {
    ++i2sReadFailureCount;
  }
  if (i2sConsecutiveReadFailures != UINT32_MAX) {
    ++i2sConsecutiveReadFailures;
  }
  if (i2sConsecutiveReadFailures >= I2S_READ_FAILURE_THRESHOLD) {
    const char *stableCode =
        result == ESP_OK ? "I2S_READ_EMPTY" : "I2S_READ_FAILED";
    Serial.print("I2S capture degraded after bounded read failures: ");
    Serial.println(result == ESP_OK ? stableCode : esp_err_to_name(result));
    i2sConsecutiveReadFailures = 0;
    portENTER_CRITICAL(&audioCaptureStateMux);
    pendingI2sCaptureFault = true;
    pendingI2sCaptureEmptyFault = result == ESP_OK;
    audioCapturePauseRequested = true;
    i2sReady = false;
    portEXIT_CRITICAL(&audioCaptureStateMux);
  }
}

void audioCaptureTask(void *context) {
  (void)context;
  while (true) {
    portENTER_CRITICAL(&audioCaptureStateMux);
    const bool pauseRequested = audioCapturePauseRequested;
    if (pauseRequested && !audioCapturePaused) {
      audioCapturePaused = true;
    } else if (!pauseRequested && audioCapturePaused) {
      audioCapturePaused = false;
    }
    const bool acknowledgePause = pauseRequested && audioCapturePaused;
    portEXIT_CRITICAL(&audioCaptureStateMux);
    if (acknowledgePause) {
      if (audioCapturePausedAck != nullptr) {
        xSemaphoreGive(audioCapturePausedAck);
      }
      vTaskDelay(pdMS_TO_TICKS(2));
      continue;
    }
    captureI2sFrame();
    if (!i2sReady) {
      vTaskDelay(pdMS_TO_TICKS(10));
    }
  }
}

bool startAudioCaptureTask() {
  if (audioCaptureTaskHandle != nullptr) {
    return true;
  }
  if (audioCaptureQueue == nullptr) {
    audioCaptureQueue = xQueueCreateStatic(
        AUDIO_CAPTURE_QUEUE_CAPACITY, sizeof(AudioCaptureItem),
        reinterpret_cast<std::uint8_t *>(audioCaptureQueueStorage),
        &audioCaptureQueueControl);
  }
  if (audioCapturePausedAck == nullptr) {
    audioCapturePausedAck =
        xSemaphoreCreateBinaryStatic(&audioCapturePausedAckControl);
  }
  if (audioCaptureQueue == nullptr || audioCapturePausedAck == nullptr) {
    Serial.println("Audio capture task unavailable: static IPC setup failed.");
    return false;
  }
  const BaseType_t created = xTaskCreatePinnedToCore(
      audioCaptureTask, "shcare-audio-capture",
      AUDIO_CAPTURE_TASK_STACK_BYTES, nullptr, AUDIO_CAPTURE_TASK_PRIORITY,
      &audioCaptureTaskHandle, ARDUINO_RUNNING_CORE);
  if (created != pdPASS || audioCaptureTaskHandle == nullptr) {
    audioCaptureTaskHandle = nullptr;
    Serial.println("Audio capture task unavailable: task creation failed.");
    return false;
  }
  return true;
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  beginPendingFirmwareHealthCheck();
  setupFactoryResetButton();
  setupTaskWatchdog();
  if (!otaRecoveryRuntimeServicesAllowed()) {
    Serial.println(
        "Startup remains fail-closed in OTA recovery safe mode; only watchdog "
        "and physical recovery input are active.");
    return;
  }
  loadRuntimeConfig();
  Serial.println(hasWiFiConfig() && strlen(wifiPass) > 0
                     ? "WiFi configuration is present; attempting saved network."
                     : "WiFi configuration is absent or incomplete.");
  registerWifiDiagnosticEvent();
#if SMART_HEALTH_HIL_EXPECTED_IDENTITY_CHECK
  Serial.println(hilExpectedIdentityMatchesPersisted()
                     ? "HIL identity material matches the backend fixture."
                     : "HIL identity material does not match the backend fixture.");
#endif
  smartConfigKdfVerified = smartConfigV2GoldenVectorMatches();
  if (!smartConfigKdfVerified) {
    Serial.println("ESPTouch V2 KDF golden-vector self-test failed; provisioning is fail-closed.");
  } else {
    Serial.println("ESPTouch V2 KDF golden-vector self-test passed.");
  }
  Serial.println("ESPTouch V2 provisioning enabled; BLE provisioning disabled.");
  setupI2S(false);
  setupAudioFilters();
  if (!startAudioCaptureTask()) {
    markI2sCaptureDegraded("AUDIO_CAPTURE_TASK_START_FAILED");
  }
  setupWiFi();
  setupAudioUdp();
  startStationServices();
  handlePendingFirmwareHealth();

  if (!i2sReady || i2sMaintenancePaused) {
    Serial.println("Audio capture degraded; device services remain active");
  } else {
    Serial.print("Audio capture ready; active transport: ");
    Serial.println(activeAudioTransportLabel());
  }
}

void loop() {
  if (!otaRecoveryRuntimeServicesAllowed()) {
    handleOtaRecoverySafeMode();
    return;
  }
  handleDeviceServices();
  handlePendingFirmwareHealth();
  drainAudioCaptureQueue(2);
  handleSetupPortal();
  handleSmartConfigProvisioning();
  handleWiFiReconnect();
  if (!i2sReady || i2sMaintenancePaused) {
    delay(25);
  }
  handleDeviceServices();
  handlePendingFirmwareHealth();
}
