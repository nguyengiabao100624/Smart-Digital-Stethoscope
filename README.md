# Smart Digital Stethoscope 🫀🎧
*(Hệ thống Ống nghe điện tử Thông minh tích hợp Edge AI)*

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Android](https://img.shields.io/badge/Android-Jetpack%20Compose-3DDC84.svg?logo=android)](https://developer.android.com/)
[![Embedded](https://img.shields.io/badge/Embedded-ESP32_C3-E7352C.svg?logo=espressif)](https://www.espressif.com/)
[![Language: Kotlin](https://img.shields.io/badge/Kotlin-1.9.0-7F52FF.svg?logo=kotlin)](https://kotlinlang.org/)
[![Language: C++](https://img.shields.io/badge/C++-14-00599C.svg?logo=c%2B%2B)](https://isocpp.org/)

## 🌐 Overview (Tổng quan)

**Smart Digital Stethoscope** is an innovative medical IoT system that digitizes heart and lung sounds using I2S technology. It features Edge AI on an ESP32-C3 microcontroller to perform real-time preliminary anomaly detection. The captured audio and diagnosis are streamed via WebSocket to a companion Android app for live monitoring and cloud synchronization.

*(**Hệ thống Ống nghe điện tử Thông minh** là một hệ thống y tế IoT đột phá giúp số hóa âm thanh tim phổi sử dụng công nghệ I2S. Hệ thống tích hợp Edge AI trên vi điều khiển ESP32-C3 để tự động phát hiện sớm các âm thanh bất thường theo thời gian thực. Âm thanh và kết quả chẩn đoán sơ bộ được truyền qua WebSocket đến ứng dụng Android để bác sĩ có thể nghe trực tiếp và lưu trữ hồ sơ trên đám mây.)*

### 🌟 Key Features (Tính năng Nổi bật)
* **Real-time Digital Audio (I2S):** High-fidelity heart/lung sound capture with hardware noise filtering.
* **Edge AI Integration:** On-device Machine Learning model to classify normal/abnormal sounds instantly.
* **WebSocket Streaming:** Low-latency live audio streaming to the mobile application.
* **Modern Android Dashboard:** Built with Jetpack Compose & MVVM architecture for doctors and patients.
* **Cloud Electronic Health Records:** Secure medical history storage and remote consultation support.

---

## 🏗️ System Architecture (Kiến trúc Hệ thống)

*(Add architecture diagram here - Thêm sơ đồ kiến trúc tại đây)*
`![System Architecture](docs/architecture_placeholder.png)`

The system consists of two main components:
1. **Embedded System (`/smart-health-embedded`):** C++ based firmware for ESP32-C3, handling I2S digital microphones, DSP filters, Edge AI inference (TFLite Micro), and WebSocket Server.
2. **Android Application (`/smart-health-android`):** Kotlin-based mobile app for doctors/patients, utilizing Jetpack Compose, Coroutines, and MVVM architecture to display real-time waveforms and manage patient records.

---

## 🚀 Getting Started (Hướng dẫn Cài đặt)

### 1. Hardware (Phần cứng)
* **ESP32-C3 Development Board**
* **INMP441 I2S Digital Microphone**
* Install [ESP-IDF v5.1+](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/) to build the embedded firmware.
```bash
cd smart-health-embedded
idf.py build
idf.py flash monitor
```

### 2. Android App (Ứng dụng Android)
* Requires **Android Studio Koala** or newer.
* Open the `smart-health-android` folder in Android Studio.
* Build and run the app on an Android 8.0+ device or emulator.

---

## 📂 Project Structure (Cấu trúc Thư mục)

* `smart-health-android/`: Android mobile application codebase.
* `smart-health-embedded/`: Firmware and Edge AI models for the stethoscope hardware.
* `docs/`: Technical documents, thesis reports, and system diagrams.
* `.github/`: Issue templates, PR templates, and CI workflows.

---

## 🤝 Contributing (Đóng góp)
Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details on our code of conduct, and the process for submitting pull requests to us.

## 🛡️ Security (Bảo mật)
If you discover any security related issues, please check [SECURITY.md](SECURITY.md) for reporting guidelines.

## 📄 License (Giấy phép)
This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---
*Created as a Graduation Thesis for IoT and Applied AI Major - 2026*
*Developers: Nguyen Quang Danh & Nguyen Gia Bao*
