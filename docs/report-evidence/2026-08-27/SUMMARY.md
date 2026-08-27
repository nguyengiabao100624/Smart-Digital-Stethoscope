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

## 4. Tuyên Bố Giới Hạn & Ranh Giới Bắt Buộc (Thesis Limitations)

Theo đúng quy định chống báo cáo khống:
1. **Thiết bị hỗ trợ theo dõi, không phải thiết bị y tế đã được chứng nhận (Not FDA/CE-certified medical device).**
2. **AI Signal Quality / Chatbot là công cụ hỗ trợ thông tin lâm sàng tham khảo, không tự ý đưa ra kết luận chẩn đoán độc lập.**
3. **Mật khẩu Wi-Fi của người dùng chỉ được nhập trực tiếp trên màn hình bảo mật của ứng dụng Shcare, không bao giờ được ghi vào mã nguồn, log hay công cụ terminal.**
4. **Cổng G4 (Production Promotion) vẫn ở trạng thái PENDING cho đến khi thao tác nhập Wi-Fi trên điện thoại Xiaomi được thực hiện và các biến môi trường Production được gắn trên Render.**
