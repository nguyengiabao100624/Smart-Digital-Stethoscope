# Smart Health Audio Packet And Realtime Contract

Last updated: 2026-07-10

This document is the shared audio contract for firmware, backend, Android, web/admin evidence, and KLTN report text.

## Source-Mapped Constants

| Field | Value | Source |
| --- | --- | --- |
| Microphone | MSM261S4030H0 MEMS/I2S | `smart-health-embedded/MSM261S4030H0/src/main.cpp` |
| Board target | ESP32-S3 DevKitM-1 | `smart-health-embedded/MSM261S4030H0/platformio.ini` |
| I2S pins | WS 12, SCK 11, SD 10 | Firmware `I2S_WS`, `I2S_SCK`, `I2S_SD` |
| Firmware sample rate | 16000 Hz | Firmware `SAMPLE_RATE` |
| Backend sample rate | 16000 Hz by default | Backend `SAMPLE_RATE` |
| Channels | 1 output channel | Backend `CHANNELS = 1`, firmware mixed stereo I2S input to mono PCM |
| Bits per sample | 16-bit signed PCM | Backend `BITS_PER_SAMPLE = 16`, firmware `int16_t pcmBuffer` |
| Firmware packet size | 128 samples, 256 bytes per packet | Firmware `BUFFER_LEN = 128` |
| UDP fallback port | 3001 by default | Firmware/backend `SMART_HEALTH_AUDIO_UDP_PORT` / `AUDIO_UDP_PORT` |

## PCM Payload Format

Each live audio payload is raw PCM with no custom header:

| Property | Contract |
| --- | --- |
| Encoding | Signed 16-bit integer PCM |
| Endianness | Little-endian |
| Channels | Mono |
| Sample rate | 16000 Hz |
| Nominal firmware packet | 128 samples = 256 bytes = about 8 ms |
| Backend validation | Payload is ignored if length is zero or odd |

Because there is no packet header, device identity comes from the authenticated WebSocket device connection or UDP source label plus backend device fallback. Do not infer patient, scan, or diagnosis from the packet itself.

## Firmware Transport Priority

Firmware uses this order:

1. If cloud WebSocket/WSS is configured and connected, send binary PCM payloads through the backend device socket.
2. If cloud socket is unavailable and UDP fallback is configured, send the same binary PCM payload to backend UDP port 3001.
3. If neither path is available, keep device services alive and report failures through counters/logs instead of pretending audio was captured.

The UDP fallback is for local demo and development. Production direction is authenticated TLS/WSS for realtime preview plus HTTPS chunk upload or durable storage path for scan artifacts.

## Backend Realtime Contract

Backend listener sockets:

- `/app` and `/listen`: app/browser listener sockets.
- `/esp` and `/device`: firmware/device sockets.
- UDP socket: accepts local PCM payloads on `AUDIO_UDP_PORT`.

When a listener connects, backend sends two JSON text frames:

```json
{
  "type": "status",
  "esp": 1,
  "wsEsp": 0,
  "udpEsp": 1,
  "listeners": 1,
  "recording": false,
  "activeScanId": null,
  "activeScanStartedAt": null,
  "sampleRate": 16000,
  "udpPort": 3001,
  "httpPort": 3000,
  "updatedAt": "ISO-8601"
}
```

```json
{
  "type": "metrics",
  "sampleRate": 16000,
  "channels": 1,
  "bitsPerSample": 16,
  "peak": 0,
  "rms": 0,
  "levelPercent": 0,
  "bpm": 0,
  "source": "",
  "updatedAt": "ISO-8601",
  "recording": false,
  "activeScanId": null
}
```

During live audio, backend also sends binary WebSocket frames containing the same raw PCM16 little-endian payload received from firmware/UDP.

## Android Live-Audio Contract

Android `LiveAudioClient` must:

- Connect to the app WebSocket URL.
- Parse JSON text event `type=status` into `BackendStatus`.
- Parse JSON text event `type=metrics` into `LiveMetrics`.
- Play binary frames as PCM16 little-endian mono 16 kHz audio.
- Treat live metrics and BPM as advisory signal-quality/monitoring information.

Android must not fabricate a saved scan. Saved scan state comes from backend scan APIs and scan events.

## Scan Recording Contract

When backend has an active recording:

1. `startRecording` creates a scan with `status="recording"`, sample format metadata, patient/device references, and an active raw PCM stream.
2. Every accepted PCM payload is appended to the raw stream, included in live metrics, and broadcast to listeners.
3. `stopRecording` closes the stream, writes a WAV header, stores the WAV/audio file metadata, creates or queues an AI-quality result, sets scan `status="completed"`, and broadcasts scan event/status.
4. If the active audio stream is gone, backend marks the scan `interrupted` instead of producing a fake success.

### Idempotent Chunk Upload And Processing

- Each chunk is bound to the authenticated workspace and scan, uses `Idempotency-Key`, carries a contiguous sequence and is verified against its SHA-256 body digest. An exact retry replays the recorded result, including after upload completion; a changed key fingerprint, body or sequence fails closed.
- The accepted limits are 1 MiB per chunk, 32 MiB for one scan and 32,768 chunks. The HTTP boundary rejects an oversized body before writing a temporary file, and repository/import/database guards enforce the same totals.
- Completion uses a 15-minute lease. An exact retry may atomically reclaim an expired lease, while an old lease token cannot finish or fail a newer generation.
- Processing persists generation, intent, artifact fingerprint and run ID. Queue, inline and worker paths use deterministic identities and atomically save the matching scan, audio file and AI-quality result; terminal failure cannot overwrite a newer reprocess generation.
- Rejected gaps/mismatches remove only unreferenced files created by that request. Completion and exact replay purge temporary chunk/aggregate PCM after the durable artifact is accepted.

## Simulated Evidence Rule

Simulation is allowed only when it is explicitly labeled. A simulated UDP packet or generated WAV can prove backend parser/storage behavior, but it cannot prove:

- MSM261S4030H0 electrical/I2S behavior.
- ESP32-S3 WiFi stability.
- Real microphone signal quality.
- Physical device latency or dropouts.
- Real serial metrics such as peak/RMS/UDP counters.

For physical proof, capture serial monitor output from the connected ESP32-S3 plus backend logs and saved audio evidence from the same run.
