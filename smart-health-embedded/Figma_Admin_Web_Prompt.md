# PROMPT FIGMA WEB ADMIN DASHBOARD - SMART HEALTH STETHOSCOPE

**[COPY PHẦN BÊN DƯỚI ĐỂ DÁN VÀO FIGMA AI / RELUME / UIZARD / DESIGN TOOL]**

## CẬP NHẬT PHẠM VI 2026-06-12

File này chỉ dùng để thiết kế `shcare-admin.web.app` - Platform Admin Console của Smart Health.

Không thiết kế portal vận hành dành cho bác sĩ, bác sĩ tư, phòng khám/cơ sở y tế trong file này. Các màn quản lý bệnh nhân, thiết bị workspace, staff phòng khám, monitoring theo workspace, consent và báo cáo workspace đã được tách sang prompt riêng:

`D:\Study\KLTN\smart-health-embedded\Figma_Shcare_Web_Portal_Prompt.md`

`shcare-admin.web.app` chỉ dành cho quản trị nền tảng:

- Duyệt và cấp quyền bác sĩ.
- Quản lý workspace/phòng khám ở cấp hệ thống.
- Quản lý gói dịch vụ toàn hệ thống.
- Quản lý tài khoản platform admin.
- Production readiness.
- Global audit.
- Cấu hình hệ thống.
- Khóa/mở tài khoản cấp nền tảng.

Nếu trong các phần cũ bên dưới có nhắc admin phòng khám/clinic manager hoặc vận hành bệnh nhân/thiết bị theo workspace, hãy hiểu đó là nội dung đã chuyển sang `shcare.web.app` và không đưa vào thiết kế admin mới.

## Vai Trò & Mục Tiêu

Hãy đóng vai một Senior Product Designer chuyên về HealthTech, B2B SaaS và IoT medical device. Thiết kế giao diện Platform Admin Console cho hệ thống "Edge AI Smart Digital Stethoscope" dùng để quản trị nền tảng Smart Health, duyệt quyền bác sĩ, quản lý workspace ở cấp hệ thống, quản lý gói dịch vụ, tài khoản admin, audit log toàn hệ thống và cấu hình vận hành.

Dashboard này dành cho:

- Platform/System Admin của nền tảng Smart Health.
- Bộ phận vận hành nền tảng, kiểm duyệt hồ sơ bác sĩ, subscription và readiness.
- Nhóm kỹ thuật/quản trị hệ thống cần kiểm tra global audit, cấu hình và sự cố cấp nền tảng.

Ngôn ngữ hiển thị: tiếng Việt chuyên nghiệp, rõ ràng, đúng văn phong y khoa. Không dùng tiếng Anh trong label người dùng nhìn thấy, trừ thuật ngữ bắt buộc như UID, ID, API, Firebase.

## Đồng Bộ Với App Android Và Figma Hiện Có

Bắt buộc thiết kế web admin như một phần của cùng hệ sinh thái Smart Health, không tạo style riêng. Hãy tham chiếu app Android và Figma hiện có trong `smart-health-android/figma`.

Design language hiện tại của app:

- Nền light: `#F5F7FA` hoặc `#F5F7FF`.
- Card: `#FFFFFF`.
- Border: `#E2E8F0`.
- Text chính: `#0F172A` hoặc `#1A202C`.
- Text phụ: `#64748B`.
- Primary Medical Blue: `#0B5C9A`.
- Secondary/Turquoise: `#00A896`.
- Success/Emerald: `#10B981`.
- Warning/Amber: `#F59E0B`.
- Error/Destructive: `#EF4444`.
- Font: Inter.
- Radius mobile thường 12-16px; web admin dùng 8-12px để gọn, dễ đọc bảng.
- Icon style: lucide-like line icon, stroke rõ, không dùng icon đổ màu quá nặng.
- Component style: card trắng, border mỏng, status badge màu nhẹ, nút primary xanh y tế, nút danger nền đỏ nhạt/text đỏ.
- Màn thiết bị trong app có status dot xanh pulsing, icon ống nghe, pin %, phương thức kết nối. Web admin quản lý thiết bị phải lặp lại đúng pattern này.
- Live/AI/scan có thể dùng dark visualization cho waveform/charts, với token: background `#0F1419`, card `#1A202C`, border `#334155`, text `#E2E8F0`, chart primary `#0EA5E9` hoặc `#00A896`.

Web admin là bản desktop/B2B của cùng design system Android, không phải một sản phẩm riêng. Không dùng neon cyberpunk, glassmorphism, gradient orb, hero marketing hoặc minh họa trang trí. Nếu cần gradient, chỉ dùng rất tiết chế như app Dashboard: `#0B5C9A -> #00A896` cho header nhỏ hoặc KPI highlight, không làm nền toàn trang.

## Phong Cách Thiết Kế

- Tổng màu: Deep Medical Blue, Turquoise, trắng, xám nhạt.
- Font: Inter.
- Spacing: 8px/16px grid.
- Border radius: 8-12px cho card/table/button.
- Giao diện: SaaS y tế cao cấp, sạch, nghiêm túc, dễ scan thông tin.
- Layout: desktop first 1440px, responsive tablet 1024px.
- Ưu tiên bảng dữ liệu, filter, bulk action, detail drawer.
- Không làm landing page, không hero marketing, không dùng bố cục trang trí rườm rà.

## Kiến Trúc Layout Chung

Thiết kế một web app dashboard gồm:

- Sidebar trái có icon + label.
- Top bar có search global, tên tổ chức, notification, admin avatar.
- Main content có title, breadcrumb, filter/action bar, table/card/detail panel.
- Drawer bên phải cho xem nhanh hồ sơ.
- Modal xác nhận cho hành động nguy hiểm.
- Toast notification ở góc phải trên.

Sidebar menu:

1. Tổng quan
2. Duyệt bác sĩ
3. Phòng khám
4. Bác sĩ
5. Bệnh nhân
6. Thiết bị
7. Lượt đo & AI
8. Gói dịch vụ
9. Thông báo
10. Audit log
11. Cài đặt hệ thống

## Màn Hình Bắt Buộc

### 1. Đăng Nhập Admin

Mục tiêu: đăng nhập an toàn cho admin.

Thành phần:

- Logo Smart Health Stethoscope.
- Tiêu đề: "Cổng quản trị Smart Health".
- Email, mật khẩu.
- Nút "Đăng nhập".
- Link "Quên mật khẩu".
- Badge bảo mật: "Xác thực quản trị bằng Firebase".
- Trạng thái lỗi bằng tiếng Việt:
  - "Email hoặc mật khẩu không đúng."
  - "Tài khoản chưa có quyền quản trị."
  - "Phiên đăng nhập đã hết hạn."

### 2. Tổng Quan Hệ Thống

Mục tiêu: admin nắm nhanh tình trạng toàn hệ thống.

KPI cards:

- Phòng khám đang hoạt động.
- Bác sĩ chờ duyệt.
- Thiết bị đang online.
- Lượt đo trong 24 giờ.
- Job AI thất bại.
- Dung lượng audio đã sử dụng.

Charts:

- Lượt đo theo ngày.
- Tỷ lệ thiết bị online/offline.
- Trạng thái AI job: đang chờ, đang xử lý, hoàn tất, thất bại.

Bảng cảnh báo gần đây:

- Thiết bị mất kết nối.
- AI job lỗi.
- Bác sĩ mới đang chờ duyệt.
- Storage gần đầy.

### 3. Duyệt Bác Sĩ

Đây là màn hình quan trọng nhất.

Mục tiêu: admin xem yêu cầu bác sĩ mới, xác minh thông tin, chấp nhận hoặc từ chối.

Layout:

- Header: "Duyệt tài khoản bác sĩ".
- Tabs:
  - "Chờ duyệt"
  - "Đã duyệt"
  - "Từ chối"
- Filter:
  - Cơ sở y tế.
  - Ngày gửi yêu cầu.
  - Trạng thái xác minh.
- Data table:
  - Họ tên.
  - Email.
  - Số điện thoại.
  - Cơ sở y tế.
  - Chuyên khoa.
  - Ngày gửi.
  - Trạng thái.
  - Hành động.

Detail drawer:

- Ảnh đại diện hoặc placeholder.
- Họ tên, email, UID Firebase.
- Cơ sở y tế.
- Số giấy phép hành nghề.
- Chuyên khoa.
- Lý do đăng ký.
- Lịch sử đăng nhập nếu có.
- Audit timeline.

Actions:

- "Phê duyệt".
- "Từ chối".
- "Yêu cầu bổ sung thông tin".

Modal phê duyệt:

- Text: "Sau khi phê duyệt, bác sĩ có thể đăng nhập và truy cập dữ liệu bệnh nhân theo quyền được cấp."
- Chọn tổ chức/phòng khám.
- Chọn vai trò: bác sĩ, trưởng khoa, admin phòng khám.
- Nút xác nhận: "Phê duyệt tài khoản".

Modal từ chối:

- Bắt buộc nhập lý do.
- Nút xác nhận: "Từ chối yêu cầu".

### 4. Quản Lý Phòng Khám / Tổ Chức

Mục tiêu: quản lý mô hình B2B.

Thành phần:

- Danh sách phòng khám.
- KPI mỗi phòng khám:
  - Số bác sĩ.
  - Số bệnh nhân.
  - Số thiết bị.
  - Dung lượng audio.
  - Gói hiện tại.
- Nút "Tạo phòng khám".
- Drawer chi tiết phòng khám:
  - Thông tin pháp lý.
  - Người đại diện.
  - Thành viên.
  - Thiết bị được gán.
  - Subscription.
  - Audit log.

### 5. Quản Lý Bác Sĩ

Mục tiêu: quản lý tài khoản bác sĩ đã được duyệt.

Thành phần:

- Data table bác sĩ.
- Filter theo phòng khám, vai trò, trạng thái.
- Status:
  - "Đang hoạt động".
  - "Tạm khóa".
  - "Chờ duyệt".
- Actions:
  - Xem hồ sơ.
  - Khóa/mở tài khoản.
  - Gán phòng khám.
  - Gán bệnh nhân.
  - Thu hồi quyền truy cập.

### 6. Quản Lý Bệnh Nhân

Mục tiêu: quản lý hồ sơ bệnh nhân và quan hệ bác sĩ-bệnh nhân.

Thành phần:

- Danh sách bệnh nhân.
- Search theo tên, email, mã hồ sơ.
- Filter theo phòng khám, bác sĩ phụ trách.
- Drawer chi tiết:
  - Thông tin cơ bản.
  - Bác sĩ được cấp quyền.
  - Lượt đo gần đây.
  - Consent/chia sẻ hồ sơ.
  - Audit log truy cập.

Actions:

- Cấp quyền bác sĩ xem hồ sơ.
- Thu hồi quyền.
- Tạo link chia sẻ có thời hạn.
- Export dữ liệu theo quyền.

### 7. Quản Lý Thiết Bị

Mục tiêu: quản lý thiết bị bán ra, kích hoạt, bảo hành và trạng thái vận hành.

Table columns:

- Device ID.
- Tên thiết bị.
- Serial.
- Phòng khám sở hữu.
- Người dùng hiện tại.
- Firmware.
- Pin.
- Phương thức kết nối.
- Trạng thái online/offline.
- Heartbeat cuối.
- Bảo hành.
- Hành động.

Device detail drawer:

- Status card giống app:
  - Icon ống nghe.
  - Dot xanh pulsing + "Đang hoạt động" nếu online.
  - Pin %, RSSI, audio transport.
  - Firmware version.
  - Uptime.
- Claim info:
  - Claim code.
  - Chủ sở hữu.
  - Ngày kích hoạt.
- Device events timeline:
  - Kết nối.
  - Mất kết nối.
  - Revoke.
  - Rotate secret.
  - OTA update.
- Actions:
  - Revoke thiết bị.
  - Unpair.
  - Chuyển chủ sở hữu.
  - Rotate secret.
  - Đẩy OTA.
  - Xem log kỹ thuật.

### 8. Lượt Đo & AI Processing

Mục tiêu: theo dõi scan session, audio file và kết quả AI.

Tabs:

- "Đang ghi".
- "Đang tải lên".
- "Đang xử lý".
- "Hoàn tất".
- "Thất bại".

Table columns:

- Scan ID.
- Bệnh nhân.
- Bác sĩ.
- Thiết bị.
- Vùng nghe: tim/phổi.
- Thời lượng.
- Audio file.
- Processing status.
- Model version.
- Confidence.
- Thời gian tạo.

Detail view:

- Waveform preview.
- Audio metadata.
- Quality check:
  - Clip count.
  - Signal level.
  - Noise level.
- AI result.
- Job retry history.
- Nút "Chạy lại AI".
- Nút "Tải xuống audio" qua signed URL.

### 9. Gói Dịch Vụ & Subscription

Mục tiêu: quản lý kinh doanh B2B.

Thành phần:

- Danh sách gói:
  - Trial.
  - Clinic Basic.
  - Clinic Pro.
  - Enterprise.
- Mỗi gói hiển thị:
  - Số bác sĩ.
  - Số thiết bị.
  - Dung lượng audio.
  - Số lượt AI/tháng.
  - Retention policy.
- Trang hóa đơn/chu kỳ thanh toán.
- Cảnh báo vượt dung lượng.

### 10. Thông Báo

Mục tiêu: quản lý notification DB và kênh push FCM.

Thành phần:

- Danh sách thông báo đã gửi.
- Filter theo người nhận, phòng khám, loại thông báo.
- Loại:
  - Thiết bị mất kết nối.
  - AI xử lý xong.
  - Bác sĩ được duyệt.
  - Storage gần đầy.
- Trạng thái:
  - Chờ gửi.
  - Đã gửi.
  - Thất bại.
  - Đã đọc.
- Form tạo thông báo:
  - Tiêu đề.
  - Nội dung.
  - Người nhận.
  - Kênh: in-app, FCM, email.

### 11. Audit Log

Mục tiêu: phục vụ bảo mật y tế và truy vết.

Table columns:

- Thời gian.
- Actor.
- Vai trò.
- Tổ chức.
- Hành động.
- Resource type.
- Resource ID.
- IP.
- User agent.
- Kết quả.

Banner:

"Audit log là bất biến. Dữ liệu chỉ được export theo quyền quản trị."

Actions:

- Export CSV.
- Export PDF.
- Xem chi tiết JSON metadata.

### 12. Cài Đặt Hệ Thống

Sections:

- Cấu hình Firebase Auth.
- Cấu hình object storage.
- Cấu hình AI model.
- Data retention.
- Rate limit.
- Webhook.
- Backup/restore.

Không hiển thị secret trực tiếp. Hiển thị dạng masked:

```text
sk_live_********1234
```

## Component System Cần Thiết Kế

- Sidebar navigation.
- Top bar.
- KPI card.
- Data table có sort/filter/pagination.
- Status badge.
- Role badge.
- Detail drawer.
- Confirm modal.
- Empty state.
- Loading skeleton.
- Error state.
- Toast.
- Search input.
- Date range picker.
- Multi-select filter.
- Danger action button.
- Audit timeline.
- Device health timeline.
- Waveform preview card.

## Component Pattern Phải Đồng Bộ Với App

- Nút primary: nền `#0B5C9A`, text trắng, icon line màu trắng, radius 8-10px.
- Nút secondary: nền trắng, border `#E2E8F0`, text `#0F172A`.
- Nút danger: nền đỏ rất nhạt, text `#EF4444`, icon Power/Lock/Trash tùy hành động.
- Status online: dot `#10B981` có pulsing nhẹ, label "Đang hoạt động".
- Status warning: badge amber nhạt, text `#B45309`.
- Status error/offline: badge đỏ nhạt, text `#EF4444`.
- Thiết bị ống nghe: dùng icon stethoscope line giống app, hiển thị pin %, phương thức kết nối, firmware, lần heartbeat cuối.
- Bảng dữ liệu: header nền xám rất nhạt, border mỏng, row hover `#F8FAFC`, action nằm bên phải.
- Drawer chi tiết: mở từ bên phải, có header icon, title, subtitle, status badge, tabs "Thông tin", "Lịch sử", "Audit".
- Toast: góc phải trên, tone màu theo trạng thái, text ngắn bằng tiếng Việt.

## Yêu Cầu UX

- Mọi hành động nguy hiểm phải có confirm modal.
- Approve/reject bác sĩ phải ghi rõ hậu quả.
- Sau khi approve bác sĩ, hiển thị thông báo người dùng cần đăng nhập lại.
- Tất cả lỗi hiển thị bằng tiếng Việt.
- Table phải dễ scan, không quá nhiều màu.
- Sidebar luôn cho biết đang ở module nào.
- Empty state thân thiện:
  - "Chưa có yêu cầu duyệt bác sĩ."
  - "Chưa có thiết bị nào được gán."
  - "Không tìm thấy kết quả phù hợp."

## Output Mong Muốn

Tạo high-fidelity web dashboard mockup gồm đầy đủ các màn hình trên. Ưu tiên desktop 1440px, có responsive tablet 1024px. Dùng design system thống nhất với app Android/Figma hiện có: font Inter, màu Medical Blue/Turquoise, background `#F5F7FA`, card trắng, border `#E2E8F0`, spacing 8/16px, card radius 8px, badge và icon line đồng bộ. Giao diện phải trông như sản phẩm SaaS y tế có thể đưa vào production, không phải landing page, không tạo style riêng tách khỏi app bệnh nhân/bác sĩ.

**[END ADMIN WEB PROMPT]**
