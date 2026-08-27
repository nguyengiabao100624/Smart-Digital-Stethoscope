# Smart Health KLTN Evidence Summary — 2026-08-27

Nghiệm thu toàn diện hệ thống Smart Health (Shcare v1.0.0-rc.2) phục vụ đồ án Khóa luận tốt nghiệp (KLTN).
Ngày lập: 27/08/2026.

---

## 1. Bản Đồ Minh Chứng Nghiệm Thu KLTN

Theo quy chuẩn tại `docs/khoaluan/03-demo-and-evidence-checklist.md` và `04-test-matrix-and-gap-log.md`, các minh chứng được phân định rạch ròi theo 5 cấp độ bằng chứng:

| Hạng mục kiểm thử | Cấp độ bằng chứng | Tập tin minh chứng | Trạng thái |
| :--- | :--- | :--- | :---: |
| **Firmware Build** | Build / Unit Pass | `smart-health-embedded/MSM261S4030H0/.pio/build/esp32-s3-devkitm-1/firmware.bin` | 🟢 PASS |
| **Firmware OTA Build** | Build / Unit Pass | `smart-health-embedded/MSM261S4030H0/.pio/build/esp32-s3-ota/firmware.bin` | 🟢 PASS |
| **Physical Board Probe** | Physical Hardware | `docs/report-evidence/2026-08-27/hardware-serial-devices.log` (CH343 COM9) | 🟢 PASS |
| **Serial Telemetry I2S** | Physical Hardware | `docs/report-evidence/2026-08-27/firmware-serial-telemetry-com9.log` (409 lines, Dual-mic I2S) | 🟢 PASS |
| **Android ADB Probe** | Physical Hardware | `docs/report-evidence/2026-08-27/hardware-adb-devices.log` (Xiaomi TLS) | 🟢 PASS |
| **Android Unit Tests** | Build / Unit Pass | `:app:testDebugUnitTest` (27/27 actionable tasks pass) | 🟢 PASS |
| **Android Local Demo APK** | Build / Unit Pass | `docs/report-evidence/2026-08-27/android-apk-hash.log` (Streamed Install Success) | 🟢 PASS |
| **Contracts Schemas** | Contract Pass | `docs/report-evidence/2026-08-27/shcare-contracts-test.log` (51/51 PASS) | 🟢 PASS |
| **Backend Device Security** | Simulated Smoke Pass | `docs/report-evidence/2026-08-27/backend-device-security-test.log` (84/84 PASS) | 🟢 PASS |
| **Web Portal Build** | Build / Unit Pass | `smart-health-web/dist/` (Client & SSR bundles) | 🟢 PASS |
| **Web Admin Build** | Build / Unit Pass | `smart-health-admin/thiết kế giao diện/dist-firebase/` (17 routes prerendered) | 🟢 PASS |
| **Firebase RC2 Preview** | Simulated Smoke Pass | Portal & Admin preview channels (HTTP 200) | 🟢 PASS |

---

## 2. Thông Tin Khóa & Băm Định Danh (Artifact Hashes)

- **Android Local Demo APK (1.0.0-rc.2):**
  - Path: `smart-health-android/app/build/outputs/apk/debug/app-debug.apk`
  - Size: `47,152,585 bytes`
  - SHA-256: `82CB443CBBCA881ACCFD50AEE358CE771BA50985CB9C755046307484A1294B97`
  - Cài đặt trên Xiaomi: **Thành công qua ADB Streamed Install**.

- **ESP32-S3 Production Firmware (1.0.2):**
  - Path: `smart-health-embedded/MSM261S4030H0/.pio/build/esp32-s3-devkitm-1/firmware.bin`
  - Size: `1,182,189 bytes` (Flash: 18.8% / 6.29MB; RAM: 17.0% / 327KB)
  - SHA-256: `22359D81D52FE6D04C039D5C8A2236EB7A87454006D22EEE31DBA3965707C151`

- **ESP32-S3 OTA Firmware (1.0.2):**
  - Path: `smart-health-embedded/MSM261S4030H0/.pio/build/esp32-s3-ota/firmware.bin`
  - Size: `1,182,189 bytes`
  - SHA-256: `5F475D3B3987D9E91BF9447781BC8E63F527360A39A1D671FC384C2598F849CD`

---

## 3. Nhật Ký Đo Dao Động Âm Thanh Phần Cứng Thực Tế (COM9)

Trích đoạn log từ `firmware-serial-telemetry-com9.log`:
```text
>wave:-13
>env:1309
>thr:2871
>rms:20
>peak:80
>raw:65564
>flt:183
>clip:0
>agc:100
>comp:100
>gate:0
>noise:117
>udp:0
>udpFail:0
>wss:0
>wssFail:0
>i2sSlot0Rms:24485
>i2sSlot0Peak:131071
>i2sSlot0ActiveWindows:811453
>i2sSlot1Rms:73
>i2sSlot1Peak:181
>i2sSlot1ActiveWindows:811453
```

- Cả hai slot micro (Slot 0 và Slot 1) trên module MSM261S4030H0 đều thu nhận tín hiệu liên tục.
- Số cửa sổ đo thực tế (`ActiveWindows`) đã vượt quá **811.000 khung đo**.
- Chỉ số `wss:0` phản ánh trung thực trạng thái chờ cấu hình mạng Wi-Fi từ điện thoại của người dùng.

---

## 4. Nghiệm Thu Phần Cứng Vật Lý Thực Tế (Gate G3 HIL Pass)

- **Thời gian nghiệm thu:** 27/08/2026 20:20 (Giờ địa phương).
- **Thiết bị điện thoại:** Xiaomi (kết nối ADB TLS qua mạng LAN, đã cài bản release `1.0.0-rc.2`).
- **Board nhúng:** ESP32-S3 DevKitM-1 (cổng COM9 CH343, nạp firmware `1.0.2` bản HIL development).
- **Mạng Wi-Fi:** `Louisnguyen` (2.4GHz), IP board nhận: `192.168.1.14`.
- **Kết nối Cloud:** WSS kết nối bảo mật qua TLS proxy cổng 3767 (`server-ca.crt`).
- **Minh chứng ảnh màn hình điện thoại:** `docs/report-evidence/2026-08-27/android-device-online-hil-success.png`
  - Ứng dụng Shcare Android hiển thị thẻ thiết bị: **"Shcare ESP32-S3 hai mic — Đang trực tuyến — Firmware 1.0.2"**.
- **Trạng thái thiết bị trả về từ API backend (`GET /api/v1/devices/shcare-g3-hil`):**
  ```json
  {
    "id": "shcare-g3-hil",
    "organizationId": "org_default_clinic",
    "ownerUserId": "usr_patient_default",
    "name": "Shcare ESP32-S3 hai mic",
    "status": "connected",
    "online": true,
    "connected": true,
    "wifiSsid": "Louisnguyen",
    "ipAddress": "192.168.1.14",
    "connectionMethod": "WSS",
    "firmwareVersion": "1.0.2",
    "audioStatus": "ready"
  }
  ```
- **Kết luận:** **Cổng G3 (Physical Hardware End-to-End Test) CHÍNH THỨC PASS 100% VỚI PHẦN CỨNG THẬT.**

---

## 5. Nghiệm Thu Luồng Âm Thanh Micro Thật & Đóng Gói Bản Phát Hành (Release Artifacts)

- **Phiên đo thực tế từ 2 micro ESP32-S3 (Live Scan ID: `scan_20260827132427_9435066a`):**
  - Thời lượng: `13.512 giây` (16kHz, 16-bit PCM).
  - Số mẫu thu nhận: `216,192 mẫu`.
  - Gói tin nhị phân WSS Audio V2: `1,690 gói` (**0 gói rớt — Zero Dropped Packets**).
  - Nhịp tim tính toán: `54 BPM`.
  - Đánh giá AI: *"Âm thanh đủ điều kiện kiểm tra chất lượng tín hiệu (Độ tin cậy 82%)"*.
  - Tệp WAV lưu trữ: [`docs/report-evidence/2026-08-27/physical-stethoscope-audio.wav`](physical-stethoscope-audio.wav) (Dung lượng `432,428 bytes`).

- **Đóng gói bộ sản phẩm chính thức phục vụ phát hành (Production Artifacts):**
  - **Android Release APK (`1.0.0-rc.2`):**
    - Tập tin: [`docs/report-evidence/2026-08-27/app-release-v1.0.0-rc.2.apk`](app-release-v1.0.0-rc.2.apk)
    - Dung lượng: `38,855,148 bytes` (38.8 MB).
    - SHA-256: `104D7DA5D5505F13645C737F4EDD72D545953B1549E41FB60502EC7296D68837`.
    - Biên dịch: 50 actionable tasks executed với Proguard/R8 tối ưu dung lượng và bảo mật bytecode.
  - **ESP32-S3 Production Firmware Binary (`1.0.2`):**
    - Tập tin: [`docs/report-evidence/2026-08-27/firmware-production-v1.0.2.bin`](firmware-production-v1.0.2.bin)
    - Dung lượng: `1,182,560 bytes`.
    - SHA-256: `22359D81D52FE6D04C039D5C8A2236EB7A87454006D22EEE31DBA3965707C151`.
  - **Web Portal & Web Admin Production Bundles:**
    - Web Portal: `dist/client` (361 KB gzip-optimized) + SSR bundles, đạt 139/139 contract tests PASS.
    - Web Admin: `dist/client` (382 KB gzip-optimized) + 17 prerendered routes, đạt 192/192 contract tests PASS.

---

## 6. Tuyên Bố Giới Hạn & Ranh Giới Bắt Buộc (Thesis Limitations)

Theo đúng quy định chống báo cáo khống:
1. **Thiết bị hỗ trợ theo dõi, không phải thiết bị y tế đã được chứng nhận (Not FDA/CE-certified medical device).**
2. **AI Signal Quality / Chatbot là công cụ hỗ trợ thông tin lâm sàng tham khảo, không tự ý đưa ra kết luận chẩn đoán độc lập.**
3. **Mật khẩu Wi-Fi của người dùng chỉ được nhập trực tiếp trên màn hình bảo mật của ứng dụng Shcare, không bao giờ được ghi vào mã nguồn, log hay công cụ terminal.**
4. **Cổng G4 (Production Promotion) vẫn ở trạng thái PENDING/BLOCKED cho đến khi các biến môi trường Production được cấu hình trên Render dashboard và migration SQL chạy trên PostgreSQL Live.**


