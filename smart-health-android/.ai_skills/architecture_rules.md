# KIẾN TRÚC HỆ THỐNG (Clean Architecture)

Tổ chức mã nguồn Jetpack Compose và ESP32 theo các lớp tách biệt:
1. **UI Layer (Giao diện):** Chỉ chứa các hàm `@Composable`. Không nhét logic tính toán nhịp tim vào đây.
2. **Logic Layer (Xử lý):** Sử dụng ViewModel để quản lý State (trạng thái) truyền từ cảm biến lên.
3. **Hardware Layer (Phần cứng):** Firmware ESP32 tập trung chạy TinyML và gửi dữ liệu thô/đã xử lý nhẹ. Không đẩy tính toán quá nặng lên App nếu Edge AI làm được.