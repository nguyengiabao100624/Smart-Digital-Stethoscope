# PROMPT FIGMA MÀN HÌNH PHẦN CỨNG - 4 INCH 320x480

**[COPY PHẦN BÊN DƯỚI ĐỂ DÁN VÀO FIGMA AI / DESIGN TOOL]**

## Vai Trò & Mục Tiêu

Hãy đóng vai một Senior Embedded UI/UX Designer chuyên thiết kế giao diện cho thiết bị y tế nhỏ gọn. Thiết kế UI cho màn hình cảm ứng 4 inch của thiết bị "Edge AI Smart Digital Stethoscope".

Màn hình chạy trên ESP32-S3 với TFT cảm ứng, độ phân giải mục tiêu 320x480 portrait. Cần tạo mockup đầy đủ các trạng thái và màn hình cho firmware thiết bị. UI phải đơn giản, rõ ràng, dễ đọc trong môi trường phòng khám, không giống app mobile đầy đủ.

Ngôn ngữ hiển thị: tiếng Việt y khoa chuyên nghiệp, ngắn gọn, dễ đọc trên màn hình nhỏ.

## Đồng Bộ Với Hệ Sinh Thái App Android

Bắt buộc thiết kế theo cùng ngôn ngữ giao diện với app Android hiện có trong `smart-health-android` và các file Figma trong `smart-health-android/figma`.

Phong cách app hiện tại:

- Tổng thể sạch, y khoa, hiện đại, tin cậy.
- Nền app light: `#F5F7FA` hoặc `#F5F7FF`.
- Card trắng `#FFFFFF`, border `#E2E8F0`, text chính `#0F172A`, text phụ `#64748B`.
- Primary Medical Blue `#0B5C9A`.
- Secondary/Turquoise `#00A896`.
- Success/Emerald `#10B981`.
- Warning `#F59E0B`.
- Error `#EF4444`.
- Font Inter, weight 400/500/600/700.
- Button/card/input trong app có radius mềm, thường 12-16px trên mobile; với embedded có thể giảm còn 8-12px để dễ render.
- Icon style tương tự lucide/material: stroke đơn giản, dễ nhận diện.
- Các màn Bluetooth/Device Management có card trắng, status dot xanh pulsing, icon ống nghe, pin, phương thức kết nối.
- Live Monitoring trong app dùng dark mode để waveform nổi bật. Màn hình phần cứng nên dùng dark mode cho live/recording, light mode cho setup/idle nếu cần, nhưng palette phải nhìn cùng một sản phẩm.

Không tạo style mới khác app như neon cyberpunk, gradient phức tạp, glassmorphism, card quá bóng bẩy. Giao diện thiết bị phải là bản rút gọn, embedded-friendly của app Android.

## Thông Tin Từ Firmware Hiện Tại

- Firmware `MSM261S4030H0` dùng microphone MSM261S4030H0 qua I2S.
- Audio sample rate: 16000 Hz.
- Buffer audio: 128 samples, gửi audio latency thấp.
- Audio plane hiện tại: UDP đến server port 3001.
- WiFi không hardcode, lấy qua build flags/provisioning.
- Metrics có sẵn: BPM, rawPeak, filteredPeak, clipCount, agcGain, udpPacketsSent, udpSendFailures.
- DSP hiện có: heart band-pass, hum notch 50/100Hz, soft compressor, click tamer, AGC.
- Có các stream mode: nghe tim, raw monitor, light filtered.
- Code firmware production hiện dùng `MSM261S4030H0`; INMP441 không còn nằm trong scope hiện tại.
- Màn hình cần thiết kế để sau này implement bằng TFT_eSPI/LVGL, tránh thành phần quá nặng.

## Ràng Buộc Thiết Kế

- Canvas chính: 320x480 px, portrait.
- Tạo thêm 1 frame phụ 480x320 landscape nếu cần, vì firmware hiện tại có thể đang `setRotation(1)`.
- Touch target tối thiểu 44x44 px.
- Font: Inter hoặc font sans-serif tương đương, nhưng phải dễ port sang embedded font.
- Không dùng text quá dài. Mỗi dòng tối đa 24-28 ký tự.
- Ưu tiên icon rõ nghĩa: WiFi, pin, cloud/server, microphone, record, play, settings, warning, check.
- Dùng đúng design token của app:
  - Primary Blue `#0B5C9A`
  - Teal `#00A896`
  - Success `#10B981`
  - Warning `#F59E0B`
  - Error `#EF4444`
  - Light background `#F5F7FA` / `#F5F7FF`
  - Light surface `#FFFFFF`
  - Light muted surface `#DFE7F1`
  - Border `#E2E8F0`
  - Text primary `#0F172A`
  - Text secondary `#64748B`
  - Dark live background `#0F1419`
  - Dark live card `#1A202C`
  - Dark live border `#334155`
  - Dark live text `#E2E8F0`
- Màn hình live/recording nên dùng dark mode để waveform nổi bật, lấy dark token từ Figma theme: background `#0F1419`, card `#1A202C`, border `#334155`, primary `#0EA5E9` hoặc `#00A896` cho waveform.
- Không dùng gradient phức tạp, blur, shadow nặng hoặc hiệu ứng khó vẽ trên TFT.
- UI phải thiết kế như thiết bị y tế FDA-grade: chuyên nghiệp, tiết chế, chính xác.
- Tất cả text hiển thị bằng tiếng Việt.

## Kiến Trúc Điều Hướng

Màn hình có 3 khu vực chính:

1. Status bar trên cùng 32 px:
   - Tên thiết bị rút gọn: "StethoEdge".
   - Trạng thái WiFi.
   - Trạng thái server/audio.
   - Pin %.
   - Giờ hoặc uptime.

2. Nội dung chính:
   - Tùy màn hình: waveform, metrics, provisioning, diagnostics.

3. Bottom navigation / action bar 64 px:
   - Trang chính.
   - Ghi âm.
   - Kết nối.
   - Cài đặt.

## Màn Hình Cần Thiết Kế

### 1. Boot / Splash

Mục tiêu: hiển thị khi bật thiết bị.

Thành phần:

- Logo ống nghe tối giản.
- Tên: "StethoEdge AI".
- Subtitle: "Đang khởi động...".
- Progress bar nhỏ.
- Version firmware, ví dụ: "FW v0.2.0".
- Footer: "Smart Health".

Trạng thái lỗi boot:

- "Lỗi cấu hình WiFi".
- "Chưa có thông tin kết nối".
- Nút: "Mở chế độ cài đặt".

### 2. Provisioning / Cài Đặt Kết Nối Lần Đầu

Mục tiêu: khi thiết bị chưa có WiFi/server.

Frame 1: Chờ cấu hình

- Icon WiFi lớn.
- Tiêu đề: "Cần cấu hình kết nối".
- Mô tả ngắn: "Dùng ứng dụng để quét QR hoặc kết nối Bluetooth."
- QR placeholder chứa:
  - deviceId.
  - claimCode.
- Trạng thái: "Đang chờ ghép nối".
- Nút phụ: "Làm mới mã QR".

Frame 2: Đang nhận cấu hình

- Stepper:
  1. Nhận WiFi.
  2. Xác thực thiết bị.
  3. Kết nối máy chủ.
- Hiển thị SSID đã ẩn bớt: "PhongKham_***".
- Spinner nhỏ.

Frame 3: Kết nối thành công

- Vòng tròn Emerald `#10B981` có check.
- Text: "Đã kết nối".
- Subtext: "Thiết bị sẵn sàng ghi âm."
- Nút: "Bắt đầu".

### 3. Trang Chính / Sẵn Sàng Đo

Mục tiêu: màn hình idle khi thiết bị sẵn sàng.

Thành phần:

- Nền light giống app Android: background `#F5F7FA`, card trắng, text `#0F172A`.
- Status card lớn giống "Thiết Bị Đang Kết Nối" trong app:
  - "Sẵn sàng".
  - "Đã kết nối máy chủ".
  - Dot xanh pulsing.
  - Icon ống nghe trong vòng tròn xanh nhạt.
  - Border/left accent màu `#10B981` khi đang hoạt động.
- 2 metric chính:
  - BPM hiện tại: "--" nếu chưa có tín hiệu.
  - Mức tín hiệu: thanh level 0-100%.
- Device info nhỏ:
  - Sample: "16 kHz".
  - Audio: "UDP 3001" hiện tại, sau này có thể là "WSS/TLS".
  - Mode: "Tim".
- Nút primary lớn: "Bắt đầu ghi".
- Nút secondary: "Kiểm tra tín hiệu".

### 4. Live Monitoring / Đang Nghe Tín Hiệu

Đây là màn hình quan trọng nhất.

Thành phần:

- Dark mode đồng bộ với Live Monitoring của app: nền `#0F1419`, card `#1A202C`, grid `#334155`, waveform turquoise.
- Header compact:
  - "Đang nghe".
  - WiFi RSSI icon.
  - Server connected icon.
  - Pin.
- Waveform realtime chiếm 45-55% chiều cao.
- Grid nhẹ giống oscilloscope, không quá dày.
- Chỉ số lớn:
  - BPM.
  - Peak.
  - Gain.
- Stream mode selector:
  - "Tim".
  - "Raw".
  - "Lọc nhẹ".
- Footer controls:
  - Nút record đỏ.
  - Nút pause/play.
  - Nút lưu.
  - Nút settings nhỏ.

Trạng thái cảnh báo:

- Nếu clipCount tăng: badge cam "Tín hiệu quá lớn".
- Nếu udpSendFailures tăng: badge đỏ "Lỗi gửi audio".
- Nếu tín hiệu yếu: badge vàng "Áp sát đầu nghe".

### 5. Recording / Đang Ghi Lượt Đo

Mục tiêu: ghi audio cho một scan session.

UI:

- Dark mode.
- Timer lớn: "00:24".
- Badge đỏ: "Đang ghi".
- Waveform vẫn chạy.
- Progress bar thời lượng nếu có giới hạn.
- Metadata nhỏ:
  - Bệnh nhân: nếu đã nhận từ app.
  - Vùng nghe: "Tim" hoặc "Phổi".
  - Thiết bị: deviceId rút gọn.
- Nút lớn:
  - "Dừng".
  - "Hủy".

Sau khi bấm dừng:

- State "Đang tải lên".
- State "Đang xử lý AI".
- State "Hoàn tất".
- State "Thất bại" có nút "Thử lại".

### 6. Kết Quả Sau Ghi

Mục tiêu: xác nhận scan đã được lưu và báo trạng thái xử lý.

Các trạng thái:

1. Uploading:
   - Icon cloud upload.
   - Text: "Đang tải audio lên".
   - Progress %.

2. Processing:
   - Icon AI/spark đơn giản.
   - Text: "Đang phân tích AI".
   - Subtext: "Có thể xem kết quả trên ứng dụng."

3. Completed:
   - Check xanh.
   - Text: "Lượt đo đã lưu".
   - Subtext: "Kết quả đã sẵn sàng trên ứng dụng."
   - Nút "Về trang chính".

4. Failed:
   - Warning đỏ.
   - Text: "Không thể lưu lượt đo".
   - Mô tả lỗi ngắn.
   - Nút "Thử lại".
   - Nút "Lưu tạm".

### 7. Kết Nối / Network

Mục tiêu: kiểm tra WiFi, server và audio transport.

Thành phần:

- Card WiFi:
  - SSID.
  - RSSI.
  - IP.
  - Trạng thái: "Đã kết nối".
- Card Server:
  - Host/IP.
  - WebSocket/MQTT/API status.
  - Audio plane: "UDP 3001" hoặc "WSS/TLS".
- Card Health:
  - Heartbeat cuối.
  - Uptime.
  - Packet sent.
  - Send failures.
- Actions:
  - "Kiểm tra kết nối".
  - "Cấu hình lại WiFi".
  - "Gửi log".

### 8. Diagnostics / Chẩn Đoán Thiết Bị

Mục tiêu: dành cho kỹ thuật viên kiểm tra thiết bị.

Thành phần:

- Raw peak.
- Filtered peak.
- Clip count.
- AGC gain.
- UDP packets sent.
- UDP send failures.
- Free heap nếu có.
- Firmware version.
- Device secret status: chỉ hiển thị "Đã bảo mật", không lộ secret.

Actions:

- "Kiểm tra microphone".
- "Reset bộ lọc".
- "Xuất log".
- "Khởi động lại".

### 9. Quick Settings

Mục tiêu: cấu hình nhanh trên thiết bị.

Options:

- Chế độ nghe mặc định:
  - Tim.
  - Raw.
  - Lọc nhẹ.
- Độ sáng màn hình.
- Âm cảnh báo bật/tắt.
- Auto sleep.
- Ngôn ngữ: "Tiếng Việt".
- Thông tin thiết bị.

### 10. OTA Update

Mục tiêu: cập nhật firmware production.

States:

- "Có bản cập nhật mới".
- "Đang tải firmware".
- "Đang cài đặt".
- "Khởi động lại để hoàn tất".
- "Cập nhật thất bại".

UI phải có:

- Progress bar.
- Warning không tắt nguồn.
- Version hiện tại và version mới.

### 11. Error States

Thiết kế các lỗi production:

- Mất WiFi:
  - "Mất kết nối WiFi".
  - Nút "Kết nối lại".
- Mất server:
  - "Không kết nối được máy chủ".
  - Nút "Thử lại".
- Audio lỗi:
  - "Không gửi được audio".
  - Nút "Kiểm tra mạng".
- Mic lỗi:
  - "Không nhận tín hiệu microphone".
  - Nút "Kiểm tra microphone".
- Bộ nhớ tạm đầy:
  - "Bộ nhớ tạm gần đầy".
  - Nút "Đồng bộ ngay".

## Component Cần Thiết Kế

- Status bar nhỏ.
- Card thông tin thiết bị.
- Dot xanh pulsing.
- Waveform graph dark mode.
- Metric tile.
- Record button.
- Bottom navigation.
- QR placeholder.
- Stepper provisioning.
- Progress bar.
- Warning/error banner.
- Modal xác nhận.
- Toggle/segmented control cho mode.
- Slider độ sáng.
- List item settings.

## Microcopy Tiếng Việt

Text phải ngắn và dễ đọc:

- "Sẵn sàng".
- "Đang nghe".
- "Đang ghi".
- "Đang tải lên".
- "Đang xử lý AI".
- "Hoàn tất".
- "Thử lại".
- "Mất kết nối".
- "Áp sát đầu nghe".
- "Tín hiệu quá lớn".
- "Thiết bị đã sẵn sàng".

## Output Mong Muốn

Tạo high-fidelity mockup cho màn hình phần cứng 4 inch 320x480, gồm đầy đủ các frame: boot, provisioning, idle, live monitoring, recording, result, network, diagnostics, settings, OTA và error states. Giao diện phải đồng bộ với app Android/Figma hiện có, dùng cùng màu Medical Blue/Turquoise, font Inter, spacing 8/16px, card trắng, dark waveform screen và icon line rõ ràng. Thiết kế cần đủ thực tế để triển khai bằng TFT_eSPI hoặc LVGL trên ESP32-S3.

**[END HARDWARE DISPLAY PROMPT]**
