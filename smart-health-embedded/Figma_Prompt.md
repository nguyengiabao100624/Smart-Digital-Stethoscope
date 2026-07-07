# PROMPT FIGMA ỨNG DỤNG ANDROID - SMART HEALTH STETHOSCOPE

**[COPY PHẦN BÊN DƯỚI ĐỂ DÁN VÀO FIGMA AI / RELUME / UIZARD / DESIGN TOOL]**

## Vai Trò & Mục Tiêu

Hãy đóng vai một Senior UI/UX Designer chuyên về HealthTech, IoT medical device và ứng dụng y khoa đạt chuẩn FDA. Thiết kế giao diện Android cho hệ thống "Edge AI Smart Digital Stethoscope" dùng cho bác sĩ và bệnh nhân.

Ứng dụng phải tạo cảm giác chuyên nghiệp, đáng tin cậy, hiện đại, phù hợp môi trường y tế. Không thiết kế như landing page; màn hình đầu tiên phải là trải nghiệm sử dụng thật của app.

Ngôn ngữ hiển thị: tiếng Việt y khoa chuyên nghiệp, rõ ràng, dễ hiểu.

## Design System Chung

- Font: Inter.
- Spacing: 8dp/16dp.
- Primary Medical Blue: `#0B5C9A`.
- Turquoise: `#00A896`.
- Success/Emerald: `#10B981`.
- Warning/Amber: `#F59E0B`.
- Error/Medical Red: `#EF4444`.
- Background: `#F5F7FA` hoặc `#F5F7FF`.
- Card: `#FFFFFF`.
- Border: `#E2E8F0`.
- Text chính: `#0F172A`.
- Text phụ: `#64748B`.
- Live/Dark background: `#0F1419`.
- Live/Dark card: `#1A202C`.
- Live/Dark border: `#334155`.
- Waveform: `#0EA5E9` hoặc `#00A896`.
- Button/card/input radius: 12-16dp.
- Icon style: line icon giống lucide/material, nét rõ, không dùng icon quá nặng.
- Không dùng neon cyberpunk, glassmorphism, gradient orb, minh họa trang trí rườm rà.

## Màn Hình Bắt Buộc

### 1. Splash & Onboarding

Mục tiêu: giới thiệu thương hiệu và định vị hệ thống ống nghe AI.

Thành phần:

- Logo ống nghe số kết hợp sóng âm/AI.
- Tên: "Smart Health Stethoscope".
- Badge nhỏ: "Powered by Edge AI".
- Loading indicator mượt.
- 2-3 màn onboarding ngắn:
  - "Nghe tim phổi thời gian thực".
  - "Phân tích AI hỗ trợ bác sĩ".
  - "Quản lý hồ sơ và thiết bị an toàn".

### 2. Đăng Nhập / Đăng Ký

Mục tiêu: đăng nhập cho bác sĩ và bệnh nhân bằng Firebase Auth.

Thành phần:

- Toggle vai trò: "Bác sĩ" / "Bệnh nhân".
- Email, mật khẩu.
- Nút "Đăng nhập".
- Link "Quên mật khẩu".
- Link "Tạo tài khoản".
- Form đăng ký bác sĩ có thêm:
  - Họ tên.
  - Cơ sở y tế.
  - Số điện thoại.
  - Email.
  - Mật khẩu.
  - Xác nhận mật khẩu.
  - Checkbox đồng ý điều khoản.
- Nếu bác sĩ đăng ký xong nhưng chưa được duyệt, hiển thị text tiếng Việt:
  - "Tài khoản bác sĩ đang chờ quản trị viên phê duyệt."
- Tất cả lỗi phải Việt hóa:
  - "Email này đã được sử dụng bởi một tài khoản khác."
  - "Email hoặc mật khẩu không đúng."
  - "Mật khẩu phải có ít nhất 6 ký tự."

### 3. Dashboard

Mục tiêu: bác sĩ hoặc bệnh nhân xem nhanh trạng thái hệ thống.

Thành phần:

- Header chào người dùng, ví dụ: "Xin chào, BS. Nguyễn".
- Notification bell.
- Search bệnh nhân hoặc hồ sơ.
- Card trạng thái thiết bị:
  - Tên thiết bị: "Stetho-AI-Pro".
  - Pin: "85%".
  - Phương thức: "Bluetooth" hoặc "Quét mã QR".
  - Dot xanh pulsing khi thiết bị đang hoạt động.
- Quick actions:
  - "Bắt đầu lượt đo".
  - "Hồ sơ bệnh nhân".
  - "Kết nối thiết bị".
  - "Trợ lý AI".
- Danh sách lượt đo gần đây:
  - Thời gian.
  - Bệnh nhân.
  - Vùng nghe: tim/phổi.
  - Trạng thái AI: bình thường/cần xem lại.

### 4. Luồng Kết Nối & Quản Lý Thiết Bị

#### 4.1 Bluetooth Radar Scan

Mục tiêu: tìm thiết bị ống nghe gần đó.

UI:

- Nền sáng đồng bộ app.
- Radar tròn ở giữa, vòng quét turquoise/blue.
- Danh sách thiết bị tìm thấy.
- Mỗi thiết bị có tên, RSSI, pin nếu có, trạng thái "Sẵn sàng ghép nối".
- Khi đang quét: hiển thị "Đang quét thiết bị gần bạn...".

Logic UI:

- Sau timeout khoảng 2.5-3 giây nếu không có thiết bị, hiển thị empty state:
  - "Chưa tìm thấy thiết bị nào."
  - Nút "Quét lại" có icon Refresh.
- Khi bấm "Quét lại":
  - Clear danh sách thiết bị.
  - Reset trạng thái `isScanning = true`.
  - Chạy lại animation radar 2.5-3 giây.
- Người dùng cũng có thể bấm "Quét lại" khi muốn làm mới danh sách.

#### 4.2 Kết Nối Thành Công

Mục tiêu: tránh cảm giác app nhảy thẳng về Dashboard sau khi kết nối xong.

UI:

- Chính giữa là vòng tròn Emerald `#10B981`.
- Bên trong có icon check màu trắng.
- Animation pop-up scale/spring mượt.
- Text:
  - "Kết nối thành công!"
  - "Thiết bị [Tên_Thiết_Bị] đã sẵn sàng để sử dụng."
- Nút primary ở cuối màn hình:
  - "Đến Bảng điều khiển".

Logic UI:

- Tự động chuyển về Dashboard sau 2.5 giây.
- Nếu người dùng bấm nút thì chuyển ngay lập tức.

#### 4.3 Cài Đặt & Quản Lý Thiết Bị

Mục tiêu: quản lý thiết bị đã kết nối và lịch sử ghép nối.

Yêu cầu:

- Không hiển thị toggle bật/tắt Bluetooth hệ thống.
- Section trên cùng: "Thiết Bị Đang Kết Nối".
- Card thiết bị hiện tại:
  - Icon ống nghe.
  - Tên: "Stetho-AI-Pro".
  - Dot xanh pulsing + text "Đang hoạt động".
  - Pin: "85%".
  - Phương thức: "Quét mã QR" hoặc "Bluetooth".
  - Nút "Ngắt kết nối" có background đỏ nhạt, text đỏ, icon Power.
- Section bên dưới: "Lịch Sử Ghép Nối".
- Danh sách thiết bị đã lưu.
- Nút "+ Thêm thiết bị" mở lại luồng quét/kết nối.

### 5. Live Monitoring

Mục tiêu: màn hình chính khi nghe tim/phổi thời gian thực.

UI:

- Dark mode để waveform nổi bật.
- Waveform realtime lớn ở giữa màn hình.
- Chỉ số:
  - BPM.
  - Mức tín hiệu.
  - Trạng thái AI.
- Toggle chế độ:
  - "Tim".
  - "Phổi".
  - "Raw".
- Control dưới cùng:
  - Record.
  - Stop.
  - Lưu lượt đo.
- AI alert pill:
  - Bình thường: xanh.
  - Cần xem lại: cam/đỏ.
  - Text ví dụ: "AI phát hiện âm bất thường, cần bác sĩ xác nhận."

### 6. Hồ Sơ & Lịch Sử Lượt Đo

Mục tiêu: quản lý dữ liệu y khoa của bệnh nhân.

Thành phần:

- Danh sách hồ sơ bệnh nhân.
- Search/filter.
- Tabs:
  - "Gần đây".
  - "Tim".
  - "Phổi".
  - "Bất thường".
- Card lượt đo:
  - Ngày giờ.
  - Bệnh nhân.
  - Thời lượng.
  - Kết luận AI.
  - Trạng thái xử lý: "Đang tải lên", "Đang xử lý", "Hoàn tất", "Thất bại".

### 7. Chi Tiết Lượt Đo & Phát Lại

Thành phần:

- Waveform preview.
- Audio playback:
  - Play/pause.
  - Timeline.
  - Tua 10 giây.
- Kết quả AI:
  - Model version.
  - Confidence.
  - Nhãn kết quả.
  - Ghi chú: "AI chỉ hỗ trợ tham khảo, bác sĩ chịu trách nhiệm kết luận cuối cùng."
- Ghi chú bác sĩ.
- Nút chia sẻ hồ sơ có kiểm soát quyền.

### 8. Trợ Lý AI Y Khoa

Mục tiêu: hỗ trợ bác sĩ đọc kết quả và giải thích dữ liệu.

UI:

- Chat interface sạch, chuyên nghiệp.
- Bubble người dùng màu xanh.
- Bubble AI nền trắng/xám nhạt.
- Nút: "Đính kèm lượt đo gần nhất".
- AI trả lời có cấu trúc:
  - Tóm tắt.
  - Dấu hiệu đáng chú ý.
  - Khuyến nghị bác sĩ kiểm tra thêm.

## Output Mong Muốn

Tạo high-fidelity Android mobile mockup đầy đủ các màn hình trên. Thiết kế phải đồng bộ toàn hệ thống Smart Health: app bác sĩ, app bệnh nhân, web admin và màn hình phần cứng. Ưu tiên giao diện y khoa chuyên nghiệp, dễ đọc, thao tác nhanh, có thể đưa vào production.

**[END MOBILE APP PROMPT]**

---

## Prompt Đã Tách Riêng

- Web admin dashboard: `Figma_Admin_Web_Prompt.md`
- Màn hình phần cứng 4 inch 320x480: `Figma_Hardware_Display_Prompt.md`
