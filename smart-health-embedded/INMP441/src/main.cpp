#include <Arduino.h>
#include <WiFi.h>
#include <ArduinoWebsockets.h>
#include "driver/i2s.h"
#include <math.h>

using namespace websockets;

// =======================
// WiFi + WebSocket server
// =======================
const char* WIFI_SSID = "Quang_Danh";
const char* WIFI_PASS = "#Danh28042004";

// IP may tinh hoac VPS chay Node.js server
const char* WS_HOST = "192.168.1.60";
const int WS_PORT = 3000;

// =======================
// INMP441 I2S pins
// =======================
#define MIC_I2S_PORT I2S_NUM_0

#define I2S_WS   5
#define I2S_SD   6
#define I2S_SCK  4

// Keep 16 kHz so the current WebSocket/audio pipeline does not need changes.
#define SAMPLE_RATE 16000
#define BUFFER_LEN 128

int32_t micBuffer[BUFFER_LEN];
int16_t pcmBuffer[BUFFER_LEN];

WebsocketsClient wsClient;

// =======================
// Heartbeat listening profile
// =======================
// For listening to heart sounds through a stethoscope earpiece. This preserves
// S1/S2 and many murmur components while rejecting speech and room noise.
const float HEART_LOW_CUT_HZ = 15.0f;
const float HEART_HIGH_CUT_HZ = 550.0f;
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

  float process(float x) {
    const float y = b0 * x + z1;
    z1 = b1 * x - a1 * y + z2;
    z2 = b2 * x - a2 * y;
    return y;
  }
};

Biquad heartHighPass;
Biquad heartLowPass1;
Biquad heartLowPass2;

// =======================
// Audio tuning
// =======================
const int RAW_SHIFT = 14;
float volumeGain = 6.0f;
float dcOffset = 0.0f;

// Keep this off while finding the heartbeat signal. A gate before gain can
// remove quiet S1/S2 sounds completely.
const bool ENABLE_SOFT_NOISE_FLOOR = false;
const float noiseFloorStart = 6.0f;
const float noiseFloorFull = 45.0f;
const float limiterThreshold = 30000.0f;

float agcGain = 1.0f;
const float targetRms = 9000.0f;
const float agcMin = 1.0f;
const float agcMax = 14.0f;
const int32_t agcActivityRms = 4;

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
const uint32_t minBeatIntervalSamples = (SAMPLE_RATE * 280UL) / 1000UL;  // ~214 BPM max
const uint32_t maxBeatIntervalSamples = (SAMPLE_RATE * 1800UL) / 1000UL; // ~33 BPM min

// =======================
// Serial Plotter
// =======================
unsigned long lastPlotMs = 0;
int32_t plotPeak = 0;
uint64_t plotSumSq = 0;
uint16_t plotCount = 0;
uint16_t clipCount = 0;
int16_t lastWave = 0;
int32_t rawPeak = 0;
int32_t filteredPeak = 0;

unsigned long lastWsConnectAttemptMs = 0;
const unsigned long WS_RECONNECT_INTERVAL_MS = 1200;

int32_t abs32(int32_t value) {
  return value < 0 ? -value : value;
}

float maxFloat(float a, float b) {
  return a > b ? a : b;
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

float softLimiter(float x) {
  if (x > limiterThreshold) {
    x = limiterThreshold + (x - limiterThreshold) * 0.08f;
  } else if (x < -limiterThreshold) {
    x = -limiterThreshold + (x + limiterThreshold) * 0.08f;
  }

  if (x > 32767.0f) x = 32767.0f;
  if (x < -32768.0f) x = -32768.0f;

  return x;
}

float applySoftNoiseFloor(float x) {
  const float magnitude = fabsf(x);

  if (magnitude <= noiseFloorStart) {
    return 0.0f;
  }

  if (magnitude < noiseFloorFull) {
    const float scale = (magnitude - noiseFloorStart) / (noiseFloorFull - noiseFloorStart);
    return x * scale;
  }

  return x;
}

void setupHeartbeatFilters() {
  heartHighPass.setHighPass(HEART_LOW_CUT_HZ, FILTER_Q);
  heartLowPass1.setLowPass(HEART_HIGH_CUT_HZ, FILTER_Q);
  heartLowPass2.setLowPass(HEART_HIGH_CUT_HZ, FILTER_Q);

  Serial.print("Heartbeat listen band ready: ");
  Serial.print(HEART_LOW_CUT_HZ);
  Serial.print(" - ");
  Serial.print(HEART_HIGH_CUT_HZ);
  Serial.println(" Hz");
}

void setupWiFi() {
  Serial.println();
  Serial.print("Connecting WiFi: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
    Serial.print(".");
  }

  Serial.println();
  Serial.println("WiFi connected");
  Serial.print("ESP32 IP: ");
  Serial.println(WiFi.localIP());
}

bool connectWebSocket() {
  lastWsConnectAttemptMs = millis();
  String url = "ws://" + String(WS_HOST) + ":" + String(WS_PORT) + "/esp";

  Serial.print("Connecting WebSocket: ");
  Serial.println(url);

  bool connected = wsClient.connect(url);

  if (connected) {
    Serial.println("WebSocket connected");
  } else {
    Serial.println("WebSocket connection failed");
  }

  return connected;
}

void setupI2S() {
  const i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_STAND_I2S,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 4,
    .dma_buf_len = BUFFER_LEN,
    .use_apll = false,
    .tx_desc_auto_clear = false,
    .fixed_mclk = 0
  };

  const i2s_pin_config_t pin_config = {
    .bck_io_num = I2S_SCK,
    .ws_io_num = I2S_WS,
    .data_out_num = I2S_PIN_NO_CHANGE,
    .data_in_num = I2S_SD
  };

  esp_err_t err;

  err = i2s_driver_install(MIC_I2S_PORT, &i2s_config, 0, NULL);
  if (err != ESP_OK) {
    Serial.print("i2s_driver_install failed: ");
    Serial.println(err);
    while (true) delay(1000);
  }

  err = i2s_set_pin(MIC_I2S_PORT, &pin_config);
  if (err != ESP_OK) {
    Serial.print("i2s_set_pin failed: ");
    Serial.println(err);
    while (true) delay(1000);
  }

  i2s_zero_dma_buffer(MIC_I2S_PORT);

  Serial.println("I2S microphone ready");
}

int16_t processAudioSample(int32_t raw) {
  float x = (float)(raw >> RAW_SHIFT);

  dcOffset = dcOffset * 0.9995f + x * 0.0005f;
  x = x - dcOffset;

  float y = heartHighPass.process(x);
  y = heartLowPass1.process(y);
  y = heartLowPass2.process(y);

  int32_t filteredLevel = (int32_t)fabsf(y);
  if (filteredLevel > filteredPeak) {
    filteredPeak = filteredLevel;
  }

  if (ENABLE_SOFT_NOISE_FLOOR) {
    y = applySoftNoiseFloor(y);
  }

  y *= volumeGain;
  y *= agcGain;
  y = softLimiter(y);

  return clamp16((int32_t)y);
}

void updateHeartMetrics(int16_t audio) {
  sampleCounter++;

  const float rectified = fabsf((float)audio);
  const float envelopeAlpha = rectified > heartEnvelope
                                ? envelopeAttackAlpha
                                : envelopeReleaseAlpha;

  heartEnvelope += envelopeAlpha * (rectified - heartEnvelope);

  if (heartEnvelopeMean < 1.0f) {
    heartEnvelopeMean = heartEnvelope;
  } else {
    heartEnvelopeMean += envelopeMeanAlpha * (heartEnvelope - heartEnvelopeMean);
  }

  heartThreshold = maxFloat(beatThresholdMin, heartEnvelopeMean * beatThresholdMultiplier);

  const uint32_t samplesSinceLastBeat = sampleCounter - lastBeatSample;

  if (beatArmed &&
      heartEnvelope > heartThreshold &&
      samplesSinceLastBeat > minBeatIntervalSamples) {
    if (lastBeatSample > 0 && samplesSinceLastBeat < maxBeatIntervalSamples) {
      const float instantBpm = 60.0f * SAMPLE_RATE / (float)samplesSinceLastBeat;
      heartBpm = heartBpm <= 0.1f ? instantBpm : heartBpm * 0.8f + instantBpm * 0.2f;
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

void updateAgcAndPlotter(int16_t audio) {
  updateHeartMetrics(audio);

  int32_t a = abs32(audio);

  if (a > plotPeak) {
    plotPeak = a;
  }

  int32_t scaled = audio / 8;
  plotSumSq += (uint64_t)(scaled * scaled);
  plotCount++;
  lastWave = audio;

  unsigned long now = millis();

  if (now - lastPlotMs >= 150) {
    int32_t rms = 0;

    if (plotCount > 0) {
      rms = sqrtf((float)plotSumSq / plotCount) * 8;
    }

    if (rms > agcActivityRms) {
      float desiredGain = targetRms / (float)rms;

      if (desiredGain < agcMin) desiredGain = agcMin;
      if (desiredGain > agcMax) desiredGain = agcMax;

      agcGain = agcGain * 0.94f + desiredGain * 0.06f;
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

  setupWiFi();
  setupI2S();
  setupHeartbeatFilters();
  connectWebSocket();

  Serial.println("Amplified heartbeat audio streaming started");
}

void loop() {
  wsClient.poll();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected, reconnecting...");
    setupWiFi();
  }

  if (!wsClient.available() &&
      millis() - lastWsConnectAttemptMs >= WS_RECONNECT_INTERVAL_MS) {
    Serial.println("WebSocket disconnected, reconnecting...");
    connectWebSocket();
  }

  size_t bytesRead = 0;

  esp_err_t result = i2s_read(
    MIC_I2S_PORT,
    micBuffer,
    sizeof(micBuffer),
    &bytesRead,
    portMAX_DELAY
  );

  if (result == ESP_OK && bytesRead > 0) {
    int samplesRead = bytesRead / sizeof(int32_t);

    for (int i = 0; i < samplesRead; i++) {
      int32_t rawLevel = abs32(micBuffer[i] >> RAW_SHIFT);
      if (rawLevel > rawPeak) {
        rawPeak = rawLevel;
      }

      int16_t audio16 = processAudioSample(micBuffer[i]);

      pcmBuffer[i] = audio16;

      updateAgcAndPlotter(audio16);
    }

    if (wsClient.available()) {
      wsClient.sendBinary(
        (const char*)pcmBuffer,
        samplesRead * sizeof(int16_t)
      );
    }
  }
}
