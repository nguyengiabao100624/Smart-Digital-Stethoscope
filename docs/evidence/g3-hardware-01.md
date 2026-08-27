# G3 ESP32-S3 dual-microphone HIL evidence

Date: 2026-08-24 ICT
Scope: canonical `smart-health-embedded/MSM261S4030H0` only
Data policy: aggregate diagnostics only; no SSID, IP, MAC, credential, token,
raw PCM or PHI is retained in this evidence.

## Bound target and image

- Serial port: `COM9`, USB CH343 `VID:PID 1A86:55D3`.
- Same-run esptool probe: ESP32-S3 QFN56 revision `0.2`, 16 MB flash,
  8 MB embedded PSRAM, 40 MHz crystal, 3.3 V quad flash.
- Environment: `esp32-s3-devkitm-1`, DIO, 16 MB flash,
  `partitions_16mb_ota.csv`.
- Production firmware image: `1,124,704` bytes; linked program uses
  `1,124,333` bytes in a `6,291,456` byte app slot (`17.9%`).
- Production firmware SHA-256:
  `A31F9F6B32AF05F253AEB5D00063F8BA0318D6C9965CB0F9EE01B9CB02E54004`.
- OTA-build firmware SHA-256:
  `ECB97D1D56561D954425365CF15E7FE35F3A7C26BDC65B659196FFB028A3A9E1`.
- Production image checksum and validation hash
  `1b8ef1f5fe091925db520edf88e59bc001c514d2d678eab022acac782c76eeac`:
  valid.
- OTA image checksum and validation hash
  `0bc9f1f814e1734dc328e6ef34199be80936c64bf6b47bfa64b19cc01ad7cf5e`:
  valid.
- Dual OTA partitions end exactly at the 16 MiB flash boundary; each app slot
  is `6,291,456` bytes and the final image leaves `5,166,752` bytes free.
- Wired upload completed successfully; bootloader, partition table, OTA data
  and app writes were hash-verified by esptool.

## Canonical two-microphone wiring contract

- Both microphones: `3V3` and `GND`.
- Shared `BCLK/SCK -> GPIO11`.
- Shared `LRCLK/WS -> GPIO12`.
- Shared `SD/DOUT -> GPIO10`.
- The two microphone `L/R` select pins use opposite levels so each microphone
  occupies one I2S slot.
- Firmware retains PCM16 little-endian mono 16 kHz and mixes the two slots with
  the existing `(rawA + rawB) / 2` rule.

## Sanitized serial result

Bounded 20-second boot capture after a controlled reset and the final wired
flash (preceded by a separate stable 25-second capture with `82/82` non-zero
RMS/peak samples per slot and no reboot/degraded marker):

| Metric | Samples | Min | Max | Last |
|---|---:|---:|---:|---:|
| Slot 0 active windows | 63 | 1 | 2,358 | 2,358 |
| Slot 0 peak | 63 | 53 | 7,892 | 177 |
| Slot 0 RMS | 63 | 21 | 5,696 | 94 |
| Slot 1 active windows | 63 | 1 | 2,358 | 2,358 |
| Slot 1 peak | 63 | 49 | 7,154 | 283 |
| Slot 1 RMS | 63 | 17 | 4,634 | 128 |

Assertions:

- Watchdog initialized with the built 5-second timeout: PASS.
- `I2S microphone ready`: PASS.
- Both slots produced diagnostic windows: PASS.
- Both slots produced non-zero RMS in all `63/63` boot-capture samples: PASS.
- Both slots produced non-zero peak in all `63/63` boot-capture samples: PASS.
- No `I2S capture degraded`, `Audio capture degraded` or capture-task
  unavailable line was observed in the bounded capture: PASS.
- No post-boot reboot marker was observed: PASS.
- Local I2S capture continues while Wi-Fi/cloud are unavailable: PASS.

## Separated release claims

- Two-slot I2S and serial HIL: PASS.
- Production WSS/auth, command ACK, audio-v2 delivery, packet-loss metrics and
  OTA rollback on this board: BLOCKED until production device identity,
  credential, CA trust and encrypted NVS provisioning exist.
- The current Arduino/ESP-IDF build has no `nvs_keys` partition and flash
  encryption is disabled. Production cloud therefore remains deliberately
  fail-closed; no compiler-define workaround or irreversible eFuse operation was
  performed.

## 2026-08-24 local setup AP and dual-surface provisioning addendum

- Source checkpoint: `bb8b5f4ea31e5ff6c798007d70cf1ef2dcc372a5` (core firmware/provisioning implementation `6a28fe2b431ffae5bb9d62d26d712136359f3bd9`).
- Physical ESP Unity runner passed `54/54`, including the version/device/session-bound setup Wi-Fi JSON parser. The application HIL firmware was wired-flashed back to COM9 afterward with hash verification.
- A bounded host HIL connected temporarily to the per-device WPA2 setup AP, verified the Vietnamese Shcare captive HTML, validated the exact device/session response, proved an invalid CSRF token returns `403 SETUP_SESSION_INVALID`, deleted the temporary AP profile and confirmed the original host Wi-Fi was restored.
- Final serial reset after restoring application firmware reported `I2S microphone ready`, `Smart Health WiFi recovery server ready on port 80`, setup portal/AP readiness and non-zero RMS values for both I2S slots.
- No real target-network password was read from the host. A successful target-Wi-Fi POST remains intentionally reserved for a password entered by the user in the Android App or captive Web portal. Android runtime evidence remains blocked until an ADB device is attached.
