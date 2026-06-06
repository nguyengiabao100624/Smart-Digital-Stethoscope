#include "driver/i2s.h"
#include <Arduino.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <math.h>
#include <string.h>

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

const char *WIFI_SSID = SMART_HEALTH_WIFI_SSID;
const char *WIFI_PASS = SMART_HEALTH_WIFI_PASS;

// IP may tinh hoac VPS chay Node.js server
const char *AUDIO_HOST = SMART_HEALTH_AUDIO_HOST;
const int AUDIO_UDP_PORT = SMART_HEALTH_AUDIO_UDP_PORT;

// =======================
// MSM261S4030H0 I2S pins
// =======================
#define MIC_I2S_PORT I2S_NUM_0

#define I2S_WS 12
#define I2S_SCK 11
#define I2S_SD 10

#define SAMPLE_RATE 16000
// 16 ms packets reduce Wi-Fi jitter without adding heavy delay.
#define BUFFER_LEN 256
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

int32_t abs32(int32_t value) { return value < 0 ? -value : value; }

float maxFloat(float a, float b) { return a > b ? a : b; }

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
  if (strlen(WIFI_SSID) == 0 || strlen(WIFI_PASS) == 0) {
    Serial.println("Missing WiFi config. Set SMART_HEALTH_WIFI_SSID and SMART_HEALTH_WIFI_PASS in PlatformIO build flags.");
    while (true) {
      delay(1000);
    }
  }

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

void setupAudioUdp() {
  if (strlen(AUDIO_HOST) == 0) {
    Serial.println("Missing audio host. Set SMART_HEALTH_AUDIO_HOST in PlatformIO build flags.");
    while (true) {
      delay(1000);
    }
  }

  if (!audioServerIp.fromString(AUDIO_HOST) &&
      WiFi.hostByName(AUDIO_HOST, audioServerIp) != 1) {
    Serial.print("Cannot resolve audio server: ");
    Serial.println(AUDIO_HOST);
    while (true) {
      delay(1000);
    }
  }

  Serial.print("UDP audio target: ");
  Serial.print(audioServerIp);
  Serial.print(":");
  Serial.println(AUDIO_UDP_PORT);
}

void sendAudioUdp(const int samplesRead) {
  if (WiFi.status() != WL_CONNECTED || samplesRead <= 0) {
    return;
  }

  const size_t bytesToSend = samplesRead * sizeof(int16_t);

  audioUdp.beginPacket(audioServerIp, AUDIO_UDP_PORT);
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
      .dma_buf_count = 8,
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
  setupAudioUdp();
  setupI2S();
  setupHeartbeatFilters();

  Serial.println("UDP heartbeat audio streaming started");
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected, reconnecting...");
    setupWiFi();
    setupAudioUdp();
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

    sendAudioUdp(samplesRead);
  }
}
