# Figma Route Parity Audit

Ngày kiểm tra: 2026-05-23

Nguồn đối chiếu:
- Figma React: `figma/src/app/routes.tsx`
- Android Compose: `app/src/main/java/com/example/smart_health_android/navigation/AppNavGraph.kt`

## Kết quả route

Tất cả màn hình sản phẩm trong Figma đều có màn hình Compose tương ứng.

| Figma route | Android route | Trạng thái |
| --- | --- | --- |
| `/` | `splash` | Khớp chức năng |
| `/login` | `login` | Khớp |
| `/forgot-password` | `forgot-password` | Khớp |
| `/signup` | `sign-up` | Khác tên route, khớp màn hình |
| `/phone-login` | `phone-login` | Khớp |
| `/verify-email` | `verify-email` | Khớp |
| `/re-verify` | `re-verify/{type}/{contact}` | Android có tham số động |
| `/verify-phone-settings` | `verify-phone-settings` | Khớp |
| `/dashboard` | `dashboard` | Khớp |
| `/patient-dashboard` | `patient-dashboard` | Khớp |
| `/monitoring` | `monitoring?scanId={scanId}` | Android có query scan |
| `/records` | `records` | Khớp |
| `/records/detail` | `record-detail/{recordId}` | Android có tham số động |
| `/assistant` | `ai-assistant` | Khác tên route, khớp màn hình |
| `/bluetooth` | `bluetooth?returnRoute={returnRoute}` | Android có return route |
| `/settings` | `settings` | Khớp |
| `/notifications` | `notifications` | Khớp |
| `/profile` | `profile` | Khớp |
| `/privacy` | `privacy` | Khớp |
| `/stethoscope-settings` | `stethoscope-settings` | Khớp |
| `/ai-calibration` | `ai-calibration` | Khớp |
| `/notification-settings` | `notification-settings` | Khớp |
| `/data-storage` | `data-storage` | Khớp |
| `/new-scan` | `new-scan` | Khớp |
| `/change-password` | `change-password` | Khớp |
| `/data-access` | `data-access` | Khớp |
| `/access-log` | `access-log` | Khớp |
| `/bluetooth-settings` | `bluetooth-settings` | Khớp |
| `/delete-data` | `delete-data` | Khớp |
| `/export-data` | `export-data` | Khớp |

## Các điểm parity đã sửa

- `BluetoothPairingScreen`: màn chọn kết nối chỉ còn QR và Bluetooth như Figma; nhập tay nằm trong QR scanner.
- `BluetoothPairingScreen`: thêm callout xanh cuối màn chọn kết nối về bật nguồn và đèn xanh dương nhấp nháy.
- `BluetoothPairingScreen`: giữ `Quét lại` ở Bluetooth radar, reset danh sách và chạy lại radar.
- `StethoscopeSettingsScreen`: section `QUẢN LÝ KẾT NỐI` có đủ `Tự động kết nối`, `Ghép nối thiết bị mới`, `Quản lý thiết bị đã lưu`.
- `BluetoothSettingsScreen`: giữ header trắng, connected-device card, pulsing dot, pin, phương thức kết nối, lịch sử ghép nối và ghi chú cuối màn.
- `AppNavGraph`: bỏ route phụ `device-management`; chỉ giữ đường `bluetooth-settings` tương ứng Figma.

## Follow-up không sửa trong đợt này

- Các route khác có thể còn khác biệt pixel-level so với Figma, nhưng chưa thấy thiếu UI/copy rõ ràng qua audit route và callout.
- Các khác biệt tên route như `signup` vs `sign-up`, `assistant` vs `ai-assistant` không ảnh hưởng UX vì navigation nội bộ Android đang hoạt động.
