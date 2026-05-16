#include <Arduino.h>
#include <WiFi.h>
#include <ArduinoWebsockets.h>
#include "driver/i2s.h"

using namespace websockets;

// =======================
// WiFi + WebSocket server
// =======================
const char* WIFI_SSID = "Quang_Danh";
const char* WIFI_PASS = "#Danh28042004";

// IP máy tính hoặc VPS chạy Node.js server
const char* WS_HOST = "192.168.1.60";
const int WS_PORT = 3000;

// =======================
// INMP441 I2S pins
// =======================
#define MIC_I2S_PORT I2S_NUM_0

#define I2S_WS   5
#define I2S_SD   6
#define I2S_SCK  4

#define SAMPLE_RATE 16000

// Giảm buffer để giảm độ trễ
#define BUFFER_LEN 128

int32_t micBuffer[BUFFER_LEN];
int16_t pcmBuffer[BUFFER_LEN];

WebsocketsClient wsClient;

// =======================
// FIR Bandpass Hamming Filter
// Voice band: 300 Hz - 3400 Hz
// =======================
#define FIR_TAPS 63

float firCoeff[FIR_TAPS];
float firBuffer[FIR_TAPS];
int firIndex = 0;

const float LOW_CUT_HZ  = 300.0f;
const float HIGH_CUT_HZ = 3400.0f;

// =======================
// Audio tuning
// =======================
float volumeGain = 1.3f;
int noiseGateThreshold = 120;
const float limiterThreshold = 26000.0f;

float dcOffset = 0.0f;

// AGC nhẹ
float agcGain = 1.0f;
const float targetRms = 5000.0f;
const float agcMin = 0.6f;
const float agcMax = 2.5f;

// =======================
// Serial Plotter
// =======================
unsigned long lastPlotMs = 0;
int32_t plotPeak = 0;
uint64_t plotSumSq = 0;
uint16_t plotCount = 0;
uint16_t clipCount = 0;
int16_t lastWave = 0;

int32_t abs32(int32_t value) {
  return value < 0 ? -value : value;
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

void designFIRBandpass() {
  int M = (FIR_TAPS - 1) / 2;

  float wa = 2.0f * PI * LOW_CUT_HZ / SAMPLE_RATE;
  float wb = 2.0f * PI * HIGH_CUT_HZ / SAMPLE_RATE;

  for (int n = 0; n < FIR_TAPS; n++) {
    int m = n - M;

    float ideal;

    if (m == 0) {
      ideal = (wb - wa) / PI;
    } else {
      ideal = (sin(wb * m) - sin(wa * m)) / (PI * m);
    }

    float hamming = 0.54f - 0.46f * cos((2.0f * PI * n) / (FIR_TAPS - 1));

    firCoeff[n] = ideal * hamming;
    firBuffer[n] = 0.0f;
  }

  Serial.println("FIR Hamming bandpass ready");
}

float applyFIR(float input) {
  firBuffer[firIndex] = input;

  float output = 0.0f;
  int index = firIndex;

  for (int i = 0; i < FIR_TAPS; i++) {
    output += firCoeff[i] * firBuffer[index];

    index--;
    if (index < 0) {
      index = FIR_TAPS - 1;
    }
  }

  firIndex++;
  if (firIndex >= FIR_TAPS) {
    firIndex = 0;
  }

  return output;
}

void setupWiFi() {
  Serial.println();
  Serial.print("Connecting WiFi: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false); // giảm delay WiFi
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

    // Giảm DMA buffer để giảm độ trễ
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
  float x = (float)(raw >> 14);

  dcOffset = dcOffset * 0.999f + x * 0.001f;
  x = x - dcOffset;

  float y = applyFIR(x);

  if (abs((int)y) < noiseGateThreshold) {
    y = 0.0f;
  }

  y *= volumeGain;
  y *= agcGain;

  y = softLimiter(y);

  return clamp16((int32_t)y);
}

void updateAgcAndPlotter(int16_t audio) {
  int32_t a = abs32(audio);

  if (a > plotPeak) {
    plotPeak = a;
  }

  int32_t scaled = audio / 8;
  plotSumSq += (uint64_t)(scaled * scaled);
  plotCount++;
  lastWave = audio;

  unsigned long now = millis();

  // In mỗi 150ms để không làm nghẽn audio
  if (now - lastPlotMs >= 150) {
    int32_t rms = 0;

    if (plotCount > 0) {
      rms = sqrt((float)plotSumSq / plotCount) * 8;
    }

    if (rms > 200) {
      float desiredGain = targetRms / (float)rms;

      if (desiredGain < agcMin) desiredGain = agcMin;
      if (desiredGain > agcMax) desiredGain = agcMax;

      agcGain = agcGain * 0.97f + desiredGain * 0.03f;
    }

    Serial.print(">wave:");
    Serial.println(lastWave);

    Serial.print(">rms:");
    Serial.println(rms);

    Serial.print(">peak:");
    Serial.println(plotPeak);

    Serial.print(">clip:");
    Serial.println(clipCount);

    Serial.print(">agc:");
    Serial.println(agcGain * 100);

    plotPeak = 0;
    plotSumSq = 0;
    plotCount = 0;
    clipCount = 0;
    lastPlotMs = now;
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  setupWiFi();
  setupI2S();
  designFIRBandpass();
  connectWebSocket();

  Serial.println("Low latency audio streaming started");
}

void loop() {
  wsClient.poll();

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected, reconnecting...");
    setupWiFi();
  }

  if (!wsClient.available()) {
    Serial.println("WebSocket disconnected, reconnecting...");
    delay(300);
    connectWebSocket();
    return;
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
      int16_t audio16 = processAudioSample(micBuffer[i]);

      pcmBuffer[i] = audio16;

      updateAgcAndPlotter(audio16);
    }

    wsClient.sendBinary(
      (const char*)pcmBuffer,
      samplesRead * sizeof(int16_t)
    );
  }
}