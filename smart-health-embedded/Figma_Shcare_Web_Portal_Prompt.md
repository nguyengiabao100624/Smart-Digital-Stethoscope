# PROMPT FIGMA SHCARE WEB PORTAL - SMART HEALTH

**[COPY PHẦN BÊN DƯỚI ĐỂ DÁN VÀO FIGMA AI / RELUME / UIZARD / DESIGN TOOL]**

## Mục Tiêu

Thiết kế toàn bộ `shcare.web.app`, bao gồm public commercial website và web portal vận hành dành cho bác sĩ, bác sĩ tư và phòng khám/cơ sở y tế trong hệ sinh thái Smart Health.

Đây là website sản phẩm + portal người dùng chuyên môn y tế. Khi chưa đăng nhập, `shcare.web.app` cần có giao diện giới thiệu/thương mại rõ ràng kiểu các sản phẩm SaaS nghiêm túc như Firebase/Supabase: trang chủ, giới thiệu giải pháp, tính năng, thiết bị, bảo mật, bảng giá/liên hệ, tài nguyên, CTA đăng nhập/đăng ký. Khi đã đăng nhập, `shcare.web.app` trở thành portal vận hành hằng ngày để quản lý bệnh nhân, thiết bị ống nghe thông minh, lượt đo, cảnh báo, consent, ghi chú lâm sàng và báo cáo workspace. Đây không phải Platform Admin Console.

Kiến trúc sản phẩm cần phân biệt rõ:

- `shcare-admin.web.app`: chỉ dành cho Platform Admin/quản trị hệ thống Smart Health.
- `shcare.web.app`: public website + portal dành cho bác sĩ, bác sĩ tư, phòng khám/cơ sở y tế.
- Android app: dành cho bệnh nhân/người dùng cá nhân và bác sĩ.

`shcare.web.app` phải vừa tạo được niềm tin như một website thương mại y tế hiện đại, vừa đủ mạnh như một portal vận hành thật. Giao diện phải đồng bộ về màu sắc, typography, component và cảm giác sản phẩm với Android app cũng như web admin hiện có.

## Vai Trò Thiết Kế

Hãy đóng vai Senior Product Designer chuyên HealthTech SaaS, clinical operations, IoT medical devices và remote patient monitoring.

Thiết kế bằng tiếng Việt, desktop-first, giao diện sẵn sàng chuyển thành frontend thực tế. Mỗi màn hình cần có đủ thành phần, state, nội dung mẫu, route intent và CTA để developer có thể map sang route/component.

Website/portal phục vụ 4 nhóm chính:

- Khách chưa đăng nhập: bác sĩ, chủ phòng khám, quản lý cơ sở y tế, bệnh nhân/người nhà đang tìm hiểu giải pháp Smart Health.
- Bác sĩ cá nhân/bác sĩ tư: quản lý bệnh nhân của mình, mời bệnh nhân, xem lượt đo, theo dõi cảnh báo, ghi chú lâm sàng, quản lý thiết bị được gán, xem consent và hồ sơ gần đây.
- Phòng khám/cơ sở y tế: quản lý bác sĩ/nhân sự trong workspace, bệnh nhân, thiết bị, gán bác sĩ cho bệnh nhân, gán thiết bị, theo dõi trực tiếp, báo cáo và cài đặt workspace.
- Bệnh nhân/người dùng cá nhân: không quản lý trên web portal chính, nhưng public website cần giải thích cách tải Android app, chấp nhận consent, dùng thiết bị tại nhà và chia sẻ dữ liệu với bác sĩ.

Không thiết kế các chức năng Platform Admin trong portal:

- Duyệt bác sĩ toàn hệ thống.
- Tài khoản admin nền tảng.
- Gói dịch vụ toàn hệ thống.
- Global config.
- Global audit.
- Production readiness.
- Khóa/mở tài khoản cấp nền tảng.

Nếu tài khoản Platform Admin vào `shcare.web.app`, thiết kế permission screen/redirect CTA về `https://shcare-admin.web.app`. Nếu tài khoản bác sĩ/phòng khám vào `shcare-admin.web.app`, web admin sẽ chặn và CTA về portal, nhưng không thiết kế chi tiết trong file này.

## Đồng Bộ Với Android App Và Web Admin Hiện Có

Bắt buộc thiết kế portal như một phần của cùng hệ sinh thái Smart Health. Không tạo style riêng.

Ngôn ngữ thiết kế cần giống Android app và web admin:

- Y tế, tin cậy, rõ ràng, ít trang trí.
- Nền sáng, card trắng, border mỏng, text tương phản tốt.
- Màu chính là xanh y tế và turquoise.
- Badge trạng thái nhẹ màu, text rõ, icon line.
- Biểu đồ/waveform có thể dùng dark panel như app scan/live monitor.
- Các bảng, filter, drawer, modal và toast phải có phong cách đồng nhất với web admin.

Design tokens bắt buộc:

- Background light: `#F5F7FA` hoặc `#F5F7FF`.
- Surface/card: `#FFFFFF`.
- Surface subtle: `#F8FAFC`.
- Border: `#E2E8F0`.
- Border strong: `#CBD5E1`.
- Text primary: `#0F172A`.
- Text secondary: `#64748B`.
- Text muted: `#94A3B8`.
- Primary Medical Blue: `#0B5C9A`.
- Primary hover: `#084B7D`.
- Primary soft background: `#E6F1F8`.
- Secondary/Turquoise: `#00A896`.
- Secondary soft background: `#E6FAF6`.
- Chart blue: `#0EA5E9`.
- Success/Emerald: `#10B981`.
- Success soft background: `#ECFDF5`.
- Warning/Amber: `#F59E0B`.
- Warning soft background: `#FFFBEB`.
- Error/Destructive: `#EF4444`.
- Error soft background: `#FEF2F2`.
- Neutral badge background: `#F1F5F9`.
- Dark visualization background: `#0F1419`.
- Dark visualization card: `#1A202C`.
- Dark visualization border: `#334155`.
- Dark visualization text: `#E2E8F0`.

Typography:

- Font: Inter.
- Page title: 24-28px, semibold, line-height 32-36px.
- Section title: 18-20px, semibold.
- Card title/table title: 15-16px, semibold.
- Body: 14px, regular/medium.
- Table cell: 13-14px.
- Caption/help text: 12-13px.
- Không scale font theo viewport width.
- Letter spacing mặc định 0.

Spacing, radius và density:

- Dùng 8px grid.
- Page padding desktop: 24px hoặc 32px.
- Gap giữa section: 20-24px.
- Card padding: 16-20px.
- Table row height: 52-56px.
- Button height: 36-40px.
- Input height: 40-44px.
- Icon button: 36px.
- Radius button/input/table/card: 8px.
- Radius modal/drawer: 10-12px.
- Sidebar width desktop: 260px.
- Topbar height: 64px.
- Right drawer width: 420-520px tùy loại detail.

Icon và hình ảnh:

- Dùng lucide-like line icons, stroke rõ, không đổ màu nặng.
- Icon kích thước 16px cho table/action nhỏ, 20px cho nav/button, 24px cho KPI.
- Thiết bị ống nghe thông minh cần có icon thiết bị/stethoscope và status dot.
- Không dùng minh họa marketing, gradient orb, glassmorphism, neon cyberpunk, màu tím/kem/nâu làm chủ đạo.

Gradient:

- Chỉ dùng tiết chế cho KPI highlight, small header strip hoặc active workspace card.
- Nếu dùng gradient, dùng `#0B5C9A -> #00A896`.
- Không dùng gradient làm nền toàn trang.

## Phong Cách Public Website

Public website của `shcare.web.app` cần có cảm giác sản phẩm thương mại hiện đại như Firebase/Supabase/Linear/Stripe nhưng chuyển ngữ sang HealthTech Việt Nam:

- Rõ sản phẩm ngay từ viewport đầu tiên: Smart Health, ống nghe thông minh, theo dõi sức khỏe từ xa, bác sĩ/phòng khám quản lý bệnh nhân.
- Không chỉ là dashboard nội bộ. Cần có trang giới thiệu sản phẩm, trang giải pháp, trang tính năng, trang thiết bị, trang bảo mật/consent, trang bảng giá/liên hệ, tài nguyên/hỗ trợ.
- Giao diện có tính thương mại, đáng tin và dễ hiểu với bác sĩ/phòng khám không rành kỹ thuật.
- Vẫn giữ palette Smart Health: xanh y tế, turquoise, trắng, xám nhạt. Không chuyển sang style công nghệ tối màu toàn trang.
- Có thể dùng các visual dạng product mockup: màn hình dashboard, app Android, thiết bị ống nghe, waveform, card cảnh báo, sơ đồ luồng bệnh nhân-bác sĩ.
- Không dùng ảnh stock bác sĩ quá chung chung. Nếu cần người thật, dùng ảnh/visual có ngữ cảnh khám từ xa, thiết bị tại nhà, bác sĩ xem dữ liệu, nhưng không làm mờ tối khó nhìn.
- Hero public phải có tín hiệu sản phẩm ở viewport đầu tiên: tên Smart Health, thiết bị/ứng dụng/dashboard, CTA rõ.
- Hero text không đặt trong card nổi. Có thể dùng background visual full-bleed hoặc product composition rõ ràng, nhưng không dùng gradient orb trang trí.
- Sau hero phải thấy gợi ý phần tiếp theo trên desktop và mobile.

Public website tone:

- Chuyên nghiệp, rõ lợi ích, không hứa hẹn y khoa quá mức.
- Không nói "AI chẩn đoán thay bác sĩ". Dùng wording an toàn: "hỗ trợ phân tích", "gợi ý cảnh báo", "giúp bác sĩ xem lại nhanh hơn".
- Không nói "demo", "prototype", "backend", "API", "Firebase", "Render" trong UI public.
- CTA chính: "Đăng nhập", "Đăng ký bác sĩ", "Đăng ký phòng khám", "Liên hệ tư vấn", "Tải app bệnh nhân".
- CTA phụ: "Xem cách hoạt động", "Xem giải pháp cho phòng khám", "Xem bảo mật & consent".

Public nav desktop:

- Logo Smart Health.
- Sản phẩm.
- Giải pháp.
- Thiết bị.
- Bảng giá.
- Tài nguyên.
- Bảo mật.
- Liên hệ.
- Nút "Đăng nhập".
- Nút primary "Đăng ký dùng thử" hoặc "Liên hệ triển khai".

Public nav mobile:

- Logo.
- Menu icon.
- Primary CTA cố định hoặc nổi nhẹ ở cuối menu.
- Các link rút gọn, không quá dài.

Public footer:

- Mô tả ngắn Smart Health.
- Sản phẩm: Ống nghe thông minh, Theo dõi từ xa, Hồ sơ lượt đo, Cảnh báo.
- Giải pháp: Bác sĩ cá nhân, Phòng khám, Cơ sở y tế, Bệnh nhân tại nhà.
- Hỗ trợ: Trung tâm hỗ trợ, FAQ, Liên hệ, Hướng dẫn tải app.
- Pháp lý: Chính sách bảo mật, Điều khoản sử dụng, Consent dữ liệu.
- CTA nhỏ đăng nhập/đăng ký.

## Ngôn Ngữ Và Nội Dung UI

Ngôn ngữ hiển thị:

- Tiếng Việt rõ ràng, ngắn gọn, đúng ngữ cảnh y tế.
- Không dùng tone marketing quá đà.
- Không dùng thuật ngữ kỹ thuật người dùng không cần thấy như Render, Firebase, Supabase, API, backend, endpoint, token, cloud deployment.
- Có thể dùng các từ thông dụng: "lượt đo", "thiết bị", "consent", "quyền theo dõi", "cảnh báo", "hồ sơ", "workspace" nếu cần, nhưng ưu tiên tiếng Việt.

Dữ liệu mẫu bắt buộc:

- Không dùng Lorem ipsum.
- Dùng tên người Việt thực tế:
  - Bệnh nhân: Nguyễn Văn An, Trần Minh Châu, Lê Hoàng Phúc, Phạm Ngọc Mai, Đỗ Quang Huy.
  - Bác sĩ: BS. Nguyễn Minh Anh, ThS.BS. Trần Quốc Huy, BS. Lê Thu Hà.
  - Phòng khám: Phòng khám Tim mạch An Khang, Phòng khám Hô hấp Việt, Trung tâm Sức khỏe Gia đình.
- Thiết bị:
  - SHS-2406-001
  - SHS-2406-014
  - SHS-2501-008
- Trạng thái mẫu:
  - Đang theo dõi
  - Chờ consent
  - Đã chấp nhận
  - Bị thu hồi
  - Online
  - Offline 12 phút
  - Pin yếu
  - Đang đo
  - Scan mới chưa xem
  - Cần bác sĩ xem lại

## Phạm Vi Chức Năng A-Z

Thiết kế phải bao phủ đủ vòng đời người dùng từ lúc chưa biết Smart Health đến khi dùng portal hằng ngày.

Public website:

- Trang chủ giới thiệu Smart Health.
- Trang sản phẩm/tính năng.
- Trang giải pháp cho bác sĩ cá nhân.
- Trang giải pháp cho phòng khám/cơ sở y tế.
- Trang dành cho bệnh nhân/người dùng tại nhà.
- Trang thiết bị ống nghe thông minh.
- Trang theo dõi từ xa.
- Trang hồ sơ lượt đo và AI hỗ trợ phân tích.
- Trang bảo mật, quyền riêng tư và consent.
- Trang bảng giá/gói dịch vụ hoặc liên hệ triển khai.
- Trang tài nguyên/hỗ trợ/FAQ.
- Trang liên hệ tư vấn.
- Footer đầy đủ link pháp lý và hỗ trợ.

Auth & onboarding:

- Đăng nhập.
- Quên mật khẩu.
- Đặt lại mật khẩu.
- Đăng ký bác sĩ cá nhân.
- Đăng ký bác sĩ thuộc phòng khám/cơ sở.
- Đăng ký phòng khám/cơ sở y tế.
- Xác thực email.
- Gửi lại email xác thực.
- Hồ sơ chờ duyệt.
- Admin yêu cầu bổ sung thông tin.
- Bổ sung thông tin và gửi lại.
- Hồ sơ bị từ chối.
- Tài khoản chưa có quyền portal.
- Sai surface: Platform Admin vào portal thì CTA sang `shcare-admin.web.app`.

Portal core:

- Dashboard theo role.
- Workspace/role switcher.
- Quản lý bệnh nhân.
- Tạo bệnh nhân.
- Import danh sách bệnh nhân.
- Gửi lời mời bệnh nhân.
- Quản lý consent.
- Quản lý hồ sơ/lượt đo.
- Scan detail và review queue.
- Live monitoring.
- Cảnh báo và triage.
- Quản lý thiết bị.
- Claim/add device.
- Assign/revoke device.
- Device event log.
- Device maintenance/firmware state.
- Staff/doctors trong workspace.
- Role & permission.
- Reports/export.
- Notifications/task inbox.
- Workspace settings.
- Help/support trong portal.

Doctor workflow:

- Bác sĩ tạo bệnh nhân hoặc nhận bệnh nhân được phòng khám gán.
- Bác sĩ gửi lời mời consent cho bệnh nhân.
- Bệnh nhân chấp nhận trên Android.
- Bác sĩ xem trạng thái consent.
- Bác sĩ gán hoặc yêu cầu gán thiết bị.
- Bác sĩ xem scan mới, nghe lại audio/waveform, đọc AI hỗ trợ, thêm ghi chú.
- Bác sĩ đánh dấu đã xem, tạo follow-up, gửi nhắc đo lại.
- Bác sĩ thu hồi theo dõi khi không còn chăm sóc bệnh nhân.

Clinic/facility workflow:

- Chủ phòng khám tạo workspace hoặc được cấp workspace.
- Mời bác sĩ/nhân sự.
- Phân vai trò.
- Tạo/import bệnh nhân.
- Gán bác sĩ chính/phụ cho bệnh nhân.
- Quản lý kho thiết bị.
- Gán thiết bị cho bệnh nhân.
- Theo dõi cảnh báo workspace.
- Xuất báo cáo vận hành.
- Cấu hình thông báo, branding và quyền trong workspace.

Patient-facing touchpoints trên public web:

- Giải thích bệnh nhân dùng Android app để đo, xem hồ sơ và chấp nhận consent.
- CTA tải app Android hoặc quét QR.
- Giải thích dữ liệu chỉ chia sẻ với bác sĩ/phòng khám khi bệnh nhân đồng ý.
- FAQ cho bệnh nhân: thiết bị, đo tại nhà, quyền riêng tư, thu hồi consent.

Support & commercial:

- Form liên hệ tư vấn.
- Form đăng ký phòng khám.
- Form yêu cầu demo/triển khai.
- FAQ.
- Trung tâm hỗ trợ.
- Trạng thái gửi form thành công/thất bại.
- CTA gọi hotline/email.
- Trang cảm ơn sau khi gửi yêu cầu.

## Kiến Trúc Thông Tin

`shcare.web.app` có 2 surface rõ ràng:

1. Public website chưa đăng nhập.
2. Authenticated portal sau đăng nhập.

Public website routes gợi ý:

- `/` - Trang chủ giới thiệu Smart Health.
- `/san-pham` - Tổng quan sản phẩm.
- `/san-pham/ong-nghe-thong-minh` - Thiết bị ống nghe thông minh.
- `/san-pham/theo-doi-tu-xa` - Remote patient monitoring.
- `/san-pham/ho-so-luot-do` - Hồ sơ lượt đo, waveform, AI hỗ trợ.
- `/giai-phap/bac-si-ca-nhan` - Giải pháp cho bác sĩ cá nhân/bác sĩ tư.
- `/giai-phap/phong-kham` - Giải pháp cho phòng khám/cơ sở y tế.
- `/giai-phap/benh-nhan-tai-nha` - Giải thích cho bệnh nhân/người dùng cá nhân.
- `/bao-mat-consent` - Bảo mật, quyền riêng tư, consent.
- `/bang-gia` - Gói dịch vụ/bảng giá/liên hệ triển khai.
- `/tai-nguyen` - FAQ, hướng dẫn, tài nguyên.
- `/lien-he` - Form liên hệ tư vấn.
- `/login` - Đăng nhập portal.
- `/register/doctor` - Đăng ký bác sĩ.
- `/register/clinic` - Đăng ký phòng khám/cơ sở y tế.

Public website layout:

- Sticky top nav.
- Hero có product visual rõ.
- Section giới thiệu vấn đề và giải pháp.
- Feature grid.
- Solution cards theo đối tượng.
- Product/device section.
- Workflow section.
- Security/consent section.
- Pricing/contact section.
- FAQ.
- Footer đầy đủ.

Portal dùng layout dashboard desktop-first:

- Sidebar trái: logo Smart Health, workspace hiện tại, icon + label, active item rõ.
- Top bar: global search, workspace/role switcher, notification bell, user avatar, quick create.
- Main content: page title, breadcrumb nhẹ, filter/action bar, table/card/detail drawer.
- Right drawer: hồ sơ bệnh nhân, chi tiết scan, chi tiết thiết bị, consent, lịch sử cảnh báo.
- Modal: tạo bệnh nhân, gán thiết bị, mời nhân sự, xác nhận thu hồi, xác nhận hành động nguy hiểm.
- Toast: góc phải trên, có success/error/warning.
- Empty/error/loading states phải có hướng xử lý rõ.

Menu portal:

1. Tổng quan
2. Bệnh nhân
3. Theo dõi trực tiếp
4. Lượt đo & hồ sơ
5. Thiết bị
6. Lời mời & consent
7. Bác sĩ/nhân sự
8. Báo cáo
9. Thông báo
10. Cài đặt workspace

Menu theo role:

- Bác sĩ cá nhân: Tổng quan, Bệnh nhân, Theo dõi trực tiếp, Lượt đo & hồ sơ, Thiết bị, Lời mời & consent, Thông báo, Cài đặt cá nhân/workspace nhỏ.
- Bác sĩ thuộc phòng khám: Tổng quan, Bệnh nhân được phân công, Theo dõi trực tiếp, Lượt đo & hồ sơ, Thiết bị liên quan, Lời mời & consent nếu có quyền, Thông báo.
- Chủ phòng khám/quản lý phòng khám: đầy đủ menu, bao gồm Bác sĩ/nhân sự, Báo cáo, Cài đặt workspace.
- Điều dưỡng/kỹ thuật viên: thấy thiết bị, monitoring, bệnh nhân được giao, hạn chế báo cáo/cài đặt.

## Component Rules

Buttons:

- Primary: nền `#0B5C9A`, text trắng, hover `#084B7D`.
- Secondary: nền trắng, border `#E2E8F0`, text `#0F172A`.
- Tertiary/ghost: nền trong suốt, text `#0B5C9A`.
- Danger: nền `#FEF2F2`, text `#EF4444`, border `#FECACA`.
- Icon-only button phải có tooltip.
- Button text không được tràn khung.

Inputs và filters:

- Search input có icon search, placeholder cụ thể theo context.
- Select/filter có chip hiện điều kiện đang lọc.
- Date range có preset: Hôm nay, 7 ngày, 30 ngày, Tùy chỉnh.
- Form field có label, help text khi cần, error text rõ bằng tiếng Việt.
- Validation error nằm gần field, không chỉ hiện toast.

Tables:

- Header sticky nếu bảng dài.
- Row hover nhẹ.
- Checkbox bulk action nếu cần.
- Column status dùng badge màu.
- Action cuối row dùng icon + menu ba chấm.
- Có empty state riêng khi không có data và khi filter không có kết quả.

Cards:

- Card chỉ dùng cho KPI, patient summary, device summary, notification item, không lồng card trong card.
- KPI card cần có số chính, label, delta nhỏ và icon.
- Device card cần có online dot, pin %, last seen, assigned patient, CTA.

Drawers:

- Right drawer có title, status, tabs hoặc section, sticky action footer nếu có hành động.
- Drawer đóng bằng close icon và Escape.
- Drawer không che mất toast.

Modals:

- Modal tạo/gán/thu hồi có title rõ, nội dung ngắn, action primary/secondary.
- Hành động nguy hiểm phải có confirm text và copy giải thích tác động.
- Sau khi thành công có success state hoặc toast và CTA mở đối tượng liên quan.

Status badges:

- Online: green dot/text `#10B981`, nền `#ECFDF5`.
- Offline: gray/red, nếu offline lâu dùng error.
- Pin yếu: amber `#F59E0B`, nền `#FFFBEB`.
- Chờ consent: amber.
- Đã chấp nhận: success.
- Bị thu hồi: error/neutral.
- Đang xử lý scan: blue.
- Scan lỗi: error.
- Cần bác sĩ xem lại: amber hoặc red tùy mức độ.

Charts và live visualization:

- Biểu đồ line/bar dùng màu chính xanh y tế/turquoise, không dùng palette cầu vồng.
- Waveform/live panel có thể dùng nền dark `#0F1419`, grid line nhẹ, line waveform `#00A896` hoặc `#0EA5E9`.
- Cần có state: đang kết nối, đang đo, mất kết nối, không có dữ liệu.

Notifications:

- Inbox có unread dot, filter, timestamp tương đối, CTA đến bệnh nhân/thiết bị/scan.
- Cần phân biệt cảnh báo thiết bị, scan mới, consent, lời mời, phân công bệnh nhân.

Accessibility:

- Text contrast đạt chuẩn để đọc trong mọi state.
- Không đưa trạng thái chỉ bằng màu, phải có text/icon.
- Focus state rõ cho input/button/dropdown.
- Table có hit area đủ lớn.

## Responsive Rules

Desktop 1440px:

- Sidebar cố định 260px.
- Main content dùng 12-column grid.
- Bảng đủ cột, drawer 420-520px.

Tablet 1024px:

- Sidebar có thể thu gọn icon-only.
- Bảng có thể ẩn bớt cột phụ và đưa vào drawer.
- Topbar search ngắn hơn nhưng vẫn có workspace switcher.

Mobile:

- Không cần ưu tiên bảng desktop đầy đủ, nhưng các flow chính vẫn phải dùng được.
- Sidebar thành bottom/nav drawer.
- Patient list thành card list.
- Patient detail dùng tabs cuộn ngang.
- Action quan trọng gần cuối màn hình, không che nội dung.

## Màn Hình Bắt Buộc

### Public 1. Trang Chủ / Homepage

Mục tiêu: khách truy cập hiểu ngay Smart Health là gì, dành cho ai, giải quyết vấn đề gì và bấm được CTA phù hợp.

Hero:

- Brand/product name: "Smart Health".
- Headline rõ nghĩa: "Theo dõi sức khỏe tim phổi từ xa với ống nghe thông minh".
- Supporting copy: giải thích bác sĩ/phòng khám có thể quản lý bệnh nhân, lượt đo, cảnh báo và thiết bị; bệnh nhân đo tại nhà bằng Android app.
- CTA primary: "Đăng ký dùng thử" hoặc "Liên hệ tư vấn".
- CTA secondary: "Đăng nhập".
- CTA phụ: "Xem cách hoạt động".
- Visual bắt buộc: product composition có dashboard web, màn hình Android, thiết bị ống nghe thông minh, waveform/cảnh báo. Không dùng hero chỉ chữ hoặc ảnh stock mơ hồ.

Sections:

- Vấn đề: bệnh nhân cần theo dõi tại nhà, bác sĩ khó nắm trạng thái sau khám, thiết bị rời rạc.
- Giải pháp: thiết bị + app Android + portal bác sĩ/phòng khám.
- Dành cho ai: Bác sĩ cá nhân, Phòng khám/cơ sở y tế, Bệnh nhân tại nhà.
- Tính năng nổi bật:
  - Quản lý bệnh nhân.
  - Theo dõi lượt đo.
  - Live monitoring.
  - Cảnh báo thiết bị/offline/pin yếu.
  - Consent và chia sẻ dữ liệu.
  - Báo cáo workspace.
- Workflow 4 bước:
  1. Bác sĩ/phòng khám mời bệnh nhân.
  2. Bệnh nhân chấp nhận consent trên Android.
  3. Thiết bị ghi nhận lượt đo tại nhà.
  4. Bác sĩ xem hồ sơ/cảnh báo và theo dõi tiếp.
- Trust section: bảo mật, quyền riêng tư, consent, audit workspace.
- CTA cuối trang: "Bắt đầu với Smart Health".

### Public 2. Trang Sản Phẩm

Mục tiêu: giới thiệu hệ sinh thái sản phẩm đầy đủ.

Thành phần:

- Overview: Web portal, Android app, thiết bị ống nghe thông minh.
- Product cards:
  - Portal bác sĩ/phòng khám.
  - Android app bệnh nhân.
  - Ống nghe thông minh.
  - Live monitoring.
  - Hồ sơ lượt đo.
  - Cảnh báo và thông báo.
- Screenshot gallery: dashboard, patient detail, scan detail, device list, Android consent.
- Section "Từ thiết bị đến quyết định theo dõi": minh họa data flow không quá kỹ thuật.
- CTA: "Xem giải pháp cho bác sĩ", "Xem giải pháp cho phòng khám".

### Public 3. Trang Thiết Bị Ống Nghe Thông Minh

Mục tiêu: giải thích thiết bị, cách gán, cách dùng tại nhà và trạng thái thiết bị.

Thành phần:

- Product visual rõ thiết bị.
- Các điểm chính:
  - Ghi âm/thu tín hiệu tim phổi.
  - Kết nối với app.
  - Gán cho bệnh nhân bằng claim code/QR.
  - Theo dõi pin, online/offline, firmware.
  - Cảnh báo khi thiết bị mất kết nối hoặc pin yếu.
- Use cases:
  - Bác sĩ cho bệnh nhân mượn/mua thiết bị.
  - Phòng khám quản lý kho thiết bị.
  - Bệnh nhân đo tại nhà theo hướng dẫn.
- FAQ thiết bị.
- CTA: "Liên hệ triển khai thiết bị".

### Public 4. Trang Giải Pháp Cho Bác Sĩ Cá Nhân

Mục tiêu: thuyết phục bác sĩ tư dùng Smart Health để theo dõi bệnh nhân sau khám/tại nhà.

Thành phần:

- Hero riêng cho bác sĩ cá nhân.
- Pain points:
  - Khó theo dõi bệnh nhân ngoài phòng khám.
  - Bệnh nhân gửi thông tin rời rạc.
  - Không biết thiết bị có đang hoạt động hay không.
- Solution:
  - Danh sách bệnh nhân.
  - Lượt đo và scan detail.
  - Cảnh báo cần xử lý.
  - Ghi chú bác sĩ.
  - Consent rõ ràng.
- Workflow bác sĩ tư:
  - Đăng ký tài khoản.
  - Chờ xác minh hồ sơ bác sĩ.
  - Tạo bệnh nhân.
  - Gửi lời mời.
  - Theo dõi lượt đo.
- CTA: "Đăng ký bác sĩ".

### Public 5. Trang Giải Pháp Cho Phòng Khám/Cơ Sở Y Tế

Mục tiêu: giải thích portal quản lý vận hành cho phòng khám/cơ sở.

Thành phần:

- Hero riêng cho clinic/facility.
- Capability grid:
  - Quản lý bác sĩ/nhân sự.
  - Quản lý bệnh nhân.
  - Quản lý thiết bị.
  - Gán bác sĩ cho bệnh nhân.
  - Gán thiết bị.
  - Monitoring.
  - Báo cáo.
  - Role & permission.
- Team workflow:
  - Chủ phòng khám tạo workspace.
  - Mời bác sĩ/nhân sự.
  - Gán bệnh nhân và thiết bị.
  - Theo dõi cảnh báo toàn workspace.
- CTA: "Đăng ký phòng khám" và "Liên hệ tư vấn".

### Public 6. Trang Dành Cho Bệnh Nhân Tại Nhà

Mục tiêu: bệnh nhân/người nhà hiểu họ dùng Android app, consent và thiết bị như thế nào.

Thành phần:

- Giải thích đơn giản: bệnh nhân dùng app Android để đăng nhập, đo, xem hồ sơ, chấp nhận hoặc thu hồi quyền theo dõi.
- App download CTA: "Tải app Android" hoặc QR placeholder.
- Consent explainer:
  - Bệnh nhân quyết định chia sẻ dữ liệu với bác sĩ/phòng khám.
  - Có thể thu hồi quyền khi cần.
  - Khi thu hồi, bác sĩ/phòng khám không còn xem dữ liệu mới.
- Device at home flow:
  - Nhận thiết bị.
  - Kết nối app.
  - Đo theo hướng dẫn.
  - Bác sĩ xem kết quả.
- FAQ bệnh nhân.

### Public 7. Trang Bảo Mật, Quyền Riêng Tư Và Consent

Mục tiêu: tạo niềm tin cho bác sĩ, phòng khám và bệnh nhân.

Thành phần:

- Nguyên tắc dữ liệu:
  - Dữ liệu y tế cần quyền truy cập rõ ràng.
  - Bệnh nhân có consent.
  - Workspace chỉ thấy dữ liệu trong phạm vi quyền.
  - Hành động quan trọng có lịch sử/audit trong workspace.
- Consent lifecycle visual:
  - Gửi lời mời.
  - Chờ chấp nhận.
  - Đã chấp nhận.
  - Bị thu hồi.
- Role-based access visual.
- FAQ bảo mật.
- CTA: "Xem cách Smart Health quản lý quyền theo dõi".

Không trình bày như tài liệu pháp lý khô cứng; cần dễ hiểu với người dùng.

### Public 8. Trang Bảng Giá / Gói Dịch Vụ

Mục tiêu: trình bày lựa chọn thương mại mà không biến thành trang quản trị gói nền tảng.

Gói gợi ý:

- Bác sĩ cá nhân.
- Phòng khám nhỏ.
- Cơ sở y tế/triển khai tùy chỉnh.

Mỗi gói có:

- Số bệnh nhân theo dõi.
- Số thiết bị.
- Staff/workspace.
- Monitoring.
- Báo cáo.
- Hỗ trợ triển khai.
- CTA: "Đăng ký", "Liên hệ tư vấn".

State:

- Monthly/yearly toggle nếu cần.
- Contact sales form.
- FAQ bảng giá.

Không hiển thị chức năng platform package management.

### Public 9. Trang Tài Nguyên / FAQ / Hỗ Trợ

Mục tiêu: giúp người dùng tự hiểu và tìm hỗ trợ.

Thành phần:

- Search tài nguyên.
- FAQ nhóm theo:
  - Bác sĩ.
  - Phòng khám.
  - Bệnh nhân.
  - Thiết bị.
  - Consent.
  - Tài khoản.
- Cards hướng dẫn:
  - Cách đăng ký bác sĩ.
  - Cách mời bệnh nhân.
  - Cách gán thiết bị.
  - Cách bệnh nhân chấp nhận consent.
  - Cách xử lý thiết bị offline.
- Contact support CTA.

### Public 10. Trang Liên Hệ / Request Demo

Mục tiêu: thu lead bác sĩ/phòng khám/cơ sở y tế.

Form fields:

- Họ tên.
- Vai trò: Bác sĩ, Chủ phòng khám, Quản lý cơ sở, Khác.
- Email.
- Số điện thoại.
- Tên phòng khám/cơ sở nếu có.
- Quy mô bệnh nhân/thiết bị dự kiến.
- Nội dung cần tư vấn.

State:

- Validation error.
- Sending.
- Success page: "Đã gửi yêu cầu tư vấn".
- Error retry.

CTA phụ:

- "Đăng nhập nếu đã có tài khoản".
- "Đăng ký bác sĩ".

### Public 11. Legal / Terms / Privacy

Mục tiêu: có đủ khung cho website thương mại.

Màn hình:

- Chính sách bảo mật.
- Điều khoản sử dụng.
- Chính sách consent dữ liệu.
- Thông tin liên hệ hỗ trợ.

Không cần viết legal text hoàn chỉnh, nhưng phải thiết kế layout và nội dung mẫu đủ để thay bằng legal copy thật sau này.

### Public 12. Trang 404 / Maintenance

Mục tiêu: public website có trạng thái hoàn chỉnh.

Thành phần:

- 404: không tìm thấy trang, CTA về trang chủ, CTA đăng nhập.
- Maintenance: hệ thống đang bảo trì, CTA liên hệ hỗ trợ.

### 1. Login / Forgot Password

Mục tiêu: bác sĩ/phòng khám đăng nhập đúng portal, không nhầm với admin hệ thống.

Thành phần:

- Logo Smart Health.
- Title: "Cổng thông tin Smart Health".
- Subtitle: "Dành cho bác sĩ và phòng khám/cơ sở y tế".
- Email, mật khẩu.
- Nút "Đăng nhập".
- Link "Quên mật khẩu".
- Link hỗ trợ: "Chưa có tài khoản bác sĩ?" hoặc "Liên hệ Smart Health".
- State sai mật khẩu.
- State tài khoản không có quyền portal.
- State Platform Admin đăng nhập nhầm: CTA "Mở cổng quản trị hệ thống".
- Forgot password screen có email, nút gửi, success state "Đã gửi hướng dẫn đặt lại mật khẩu nếu email hợp lệ".

Không hiện chữ "admin hệ thống" trên login portal trừ khi thông báo sai role.

### 1B. Register Doctor

Mục tiêu: bác sĩ cá nhân hoặc bác sĩ thuộc cơ sở có thể đăng ký đúng loại hồ sơ.

Layout:

- Form nhiều bước, có progress stepper.
- Bên phải hoặc dưới form có summary "Quy trình xét duyệt bác sĩ".
- Copy rõ: "Thông tin này dùng để xác minh quyền bác sĩ trước khi mở portal".

Steps:

1. Tài khoản:
   - Họ và tên.
   - Email.
   - Số điện thoại.
   - Mật khẩu.
   - Xác nhận mật khẩu.
2. Loại đăng ký:
   - Bác sĩ tư/cá nhân.
   - Bác sĩ thuộc phòng khám/cơ sở y tế.
3. Thông tin chuyên môn:
   - Chuyên khoa.
   - Số chứng chỉ hành nghề/mã giấy phép.
   - Năm kinh nghiệm nếu cần.
   - Lý do đăng ký sử dụng Smart Health.
4. Nơi làm việc:
   - Nếu bác sĩ tư: nhập tên phòng khám tư/nơi hành nghề tự do, địa chỉ, số điện thoại phòng khám nếu có.
   - Nếu bác sĩ thuộc cơ sở: chọn/tìm cơ sở y tế hoặc nhập yêu cầu nếu chưa có trong hệ thống.
5. Tài liệu xác minh:
   - Upload giấy phép/chứng chỉ.
   - Upload giấy tờ liên quan nếu có.
6. Xác nhận:
   - Review toàn bộ thông tin.
   - Checkbox đồng ý điều khoản.
   - CTA "Gửi hồ sơ đăng ký".

State:

- Validation error từng field.
- Email đã tồn tại.
- Upload lỗi.
- Gửi hồ sơ thành công.
- Chuyển sang xác thực email/chờ duyệt.

### 1C. Register Clinic / Facility

Mục tiêu: chủ phòng khám/cơ sở y tế gửi yêu cầu tạo workspace.

Steps:

1. Thông tin người đại diện:
   - Họ tên.
   - Email.
   - Số điện thoại.
   - Vai trò.
2. Thông tin cơ sở:
   - Tên phòng khám/cơ sở.
   - Loại: phòng khám tư, phòng khám chuyên khoa, cơ sở y tế, trung tâm chăm sóc tại nhà.
   - Địa chỉ.
   - Số điện thoại.
   - Email liên hệ.
   - Website nếu có.
3. Quy mô triển khai:
   - Số bác sĩ/nhân sự.
   - Số bệnh nhân dự kiến.
   - Số thiết bị dự kiến.
   - Nhu cầu: monitoring, quản lý thiết bị, báo cáo, remote care.
4. Tài liệu:
   - Giấy phép hoạt động nếu có.
   - Logo nếu muốn.
5. Xác nhận và gửi yêu cầu.

State:

- Success page: "Đã gửi yêu cầu tạo workspace".
- CTA "Đăng nhập nếu đã có tài khoản".
- CTA "Liên hệ tư vấn".

### 1D. Email Verification

Mục tiêu: người dùng biết cần xác thực email trước khi tiếp tục.

Thành phần:

- Title: "Xác thực email của bạn".
- Hiển thị email đã đăng ký.
- Copy: "Chúng tôi đã gửi email xác thực. Vui lòng mở email và bấm liên kết xác thực."
- CTA "Tôi đã xác thực email".
- CTA secondary "Gửi lại email xác thực".
- Link "Đổi email" nếu cần.

State:

- Đang kiểm tra xác thực.
- Đã xác thực, chuyển tiếp.
- Chưa xác thực.
- Không gửi lại được email, có retry.
- Email xác thực hết hạn.

### 1E. Approval Pending / Info Requested / Rejected

Mục tiêu: sau đăng ký bác sĩ, user luôn được đưa vào màn đúng trạng thái, không chỉ hiện chữ đỏ.

Các trạng thái bắt buộc:

- Chờ duyệt:
  - Hiển thị timeline: đã gửi hồ sơ, đã xác thực email, đang chờ admin xem xét.
  - CTA cập nhật thông tin liên hệ nếu cần.
  - CTA đăng xuất.
- Cần bổ sung:
  - Hiển thị lý do admin yêu cầu bổ sung.
  - Hiển thị danh sách field cần sửa.
  - Form bổ sung phải giống loại đăng ký ban đầu:
    - Bác sĩ tư vẫn nhập tên phòng khám tư, không bắt chọn cơ sở lớn.
    - Bác sĩ thuộc cơ sở vẫn chọn/tìm cơ sở.
  - CTA "Cập nhật và gửi lại".
  - Sau khi gửi lại, chuyển về Chờ duyệt.
- Bị từ chối:
  - Hiển thị lý do từ chối nếu có.
  - CTA liên hệ hỗ trợ.
  - CTA đăng ký lại nếu chính sách cho phép.
- Đã được duyệt:
  - CTA "Vào portal".

Màn trạng thái phải thân thiện, có card/timeline rõ ràng, không chỉ một dòng lỗi màu đỏ.

### 1F. Reset Password

Mục tiêu: hoàn chỉnh luồng quên mật khẩu.

Màn hình:

- Request reset: nhập email, CTA gửi hướng dẫn.
- Email sent: thông báo đã gửi nếu email hợp lệ.
- Set new password: mật khẩu mới, xác nhận mật khẩu.
- Success: CTA đăng nhập.
- Error states: link hết hạn, mật khẩu yếu, không thể đặt lại.

### 2. Workspace / Role Switcher

Mục tiêu: user có nhiều vai trò/workspace chọn đúng nơi làm việc.

Thành phần:

- Workspace hiện tại: tên phòng khám/cơ sở hoặc phòng khám tư.
- Vai trò hiện tại: Bác sĩ, Chủ phòng khám, Quản lý phòng khám, Điều dưỡng/Kỹ thuật viên.
- Dropdown danh sách workspace/membership.
- Mỗi workspace card có:
  - Tên workspace.
  - Loại: Bác sĩ tư, Phòng khám, Cơ sở y tế.
  - Vai trò của user.
  - Số bệnh nhân.
  - Số thiết bị online.
  - Số cảnh báo cần xử lý.
  - Trạng thái gói/workspace nếu cần.
- Search workspace nếu có nhiều.
- Empty state khi user chưa có workspace hợp lệ.

### 3. Doctor Dashboard

Mục tiêu: bác sĩ cá nhân xem nhanh những việc cần xử lý trong ngày.

Thành phần:

- KPI:
  - Bệnh nhân đang theo dõi.
  - Lượt đo mới.
  - Cảnh báo cần xử lý.
  - Thiết bị online.
- Priority patient list:
  - Bệnh nhân có scan mới chưa xem.
  - Thiết bị offline.
  - Pin yếu.
  - Consent đang chờ.
- Activity timeline:
  - Bệnh nhân chấp nhận consent.
  - Có scan mới.
  - Thiết bị mất kết nối.
  - Bác sĩ thêm ghi chú.
- Quick actions:
  - Tạo bệnh nhân.
  - Gửi lời mời.
  - Gán thiết bị.
  - Mở theo dõi trực tiếp.
- Small chart:
  - Lượt đo 7 ngày.
  - Cảnh báo theo mức độ.

### 4. Doctor Patient List

Mục tiêu: bác sĩ tìm, lọc, thao tác nhanh trên bệnh nhân của mình.

Bảng cột:

- Tên bệnh nhân.
- Mã hồ sơ.
- Tuổi/giới.
- Số điện thoại.
- Thiết bị.
- Bác sĩ phụ trách.
- Scan gần nhất.
- Consent.
- Cảnh báo.
- Trạng thái theo dõi.
- Action.

Filter:

- Search theo tên/số điện thoại/mã hồ sơ.
- Có cảnh báo.
- Thiết bị offline.
- Chưa có consent.
- Có scan mới.
- Đang theo dõi/đã tạm dừng.

Action:

- Xem chi tiết.
- Gửi nhắc đo.
- Gán thiết bị.
- Gửi/nhắc consent.
- Thu hồi theo dõi.

Có drawer xem nhanh bệnh nhân khi click row.

### 5. Patient Detail

Mục tiêu: trung tâm làm việc với một bệnh nhân.

Header:

- Tên, mã hồ sơ, tuổi/giới, số điện thoại.
- Status consent.
- Bác sĩ phụ trách.
- Thiết bị đang gán.
- Last scan.
- Cảnh báo hiện tại.
- Quick actions: tạo lượt đo, gán thiết bị, gửi consent, thu hồi theo dõi.

Tabs:

- Tổng quan.
- Lượt đo.
- Theo dõi trực tiếp.
- Thiết bị.
- Ghi chú.
- Consent.
- Lịch sử.

Tổng quan:

- Summary card về số lượt đo, lần đo gần nhất, thiết bị, cảnh báo.
- Vitals/scan summary nếu có.
- Recent records.
- Recent alerts.
- Doctor notes.

Ghi chú:

- Composer ghi chú.
- Timeline ghi chú có timestamp, người tạo, loại ghi chú.
- State không có ghi chú.

Consent:

- Scope quyền theo dõi.
- Người được cấp quyền.
- Ngày chấp nhận.
- CTA thu hồi.

### 6. Scan / Record Detail

Mục tiêu: bác sĩ xem một lượt đo đầy đủ và ra quyết định follow-up.

Thành phần:

- Metadata:
  - Thời gian đo.
  - Vị trí đo.
  - Thiết bị.
  - Bệnh nhân.
  - Người tạo.
  - Trạng thái xử lý.
- Waveform/audio panel:
  - Dark visualization.
  - Play/pause, progress, volume nếu cần.
  - State đang xử lý/không có âm thanh/lỗi.
- AI result:
  - Nhãn kết quả.
  - Độ tin cậy.
  - Tóm tắt.
  - Cảnh báo.
  - CTA "Đánh dấu đã xem".
- Doctor notes:
  - Thêm ghi chú.
  - Theo dõi tiếp.
  - Hẹn đo lại.
- Export/share nội bộ workspace nếu có quyền.

Không biến màn này thành "AI demo". Phải là hồ sơ lượt đo thật.

### 7. Live Monitoring

Mục tiêu: theo dõi thiết bị/bệnh nhân đang online theo thời gian gần thực.

Layout:

- Left panel: danh sách bệnh nhân/thiết bị.
- Main panel: waveform/live status.
- Right/Bottom lane: cảnh báo và event.

Card live device:

- Tên bệnh nhân.
- ID thiết bị.
- Online/offline.
- Pin.
- RSSI/kết nối nếu có.
- Last seen.
- Đang đo/chờ đo.
- CTA mở patient detail.

Alert lane:

- Pin yếu.
- Offline.
- Âm thanh lỗi.
- Nhịp bất thường.
- Scan thất bại.
- Consent hết hiệu lực.

Filter:

- Bác sĩ phụ trách.
- Workspace.
- Online/offline.
- Đang có cảnh báo.
- Đang đo.

State:

- Đang kết nối.
- Không có thiết bị online.
- Mất kết nối.
- Reconnect.

### 8. Devices

Mục tiêu: quản lý thiết bị trong phạm vi bác sĩ/workspace.

Bảng cột:

- Tên/ID thiết bị.
- Bệnh nhân đang gán.
- Trạng thái.
- Pin.
- Firmware.
- Workspace.
- Last seen.
- Cảnh báo.
- Action.

CTA:

- Thêm thiết bị.
- Gán thiết bị.
- Thu hồi thiết bị.
- Xem sự kiện.
- Gửi lệnh restart nếu role cho phép.

Badge:

- Online.
- Offline.
- Đang đo.
- Pin yếu.
- Chưa gán.
- Bị thu hồi.

Detail drawer:

- Thông tin thiết bị.
- Bệnh nhân đang gán.
- Lịch sử sự kiện.
- Lịch sử gán/thu hồi.
- Cảnh báo gần đây.

### 9. Assign Device

Mục tiêu: gán thiết bị cho bệnh nhân rõ ràng, tránh gán nhầm.

Wizard 3 bước:

1. Chọn bệnh nhân.
2. Chọn thiết bị hoặc nhập claim code/scan QR.
3. Xác nhận quyền theo dõi và hướng dẫn bệnh nhân.

State bắt buộc:

- Thiết bị chưa gán.
- Thiết bị đang gán cho bệnh nhân khác.
- Thiết bị không thuộc workspace.
- Claim code sai/hết hạn.
- Gán thành công.

Sau khi gán thành công:

- Hiện success state.
- CTA "Mở hồ sơ bệnh nhân".
- CTA "Mở theo dõi trực tiếp".

### 10. Invitations & Consent

Mục tiêu: quản lý lời mời bệnh nhân và quyền theo dõi.

Thành phần:

- Tabs:
  - Tất cả.
  - Chờ chấp nhận.
  - Đã chấp nhận.
  - Hết hạn.
  - Bị thu hồi.
- Bảng/danh sách lời mời:
  - Bệnh nhân.
  - Kênh mời: email/số điện thoại.
  - Người gửi.
  - Scope consent.
  - Trạng thái.
  - Ngày gửi.
  - Hết hạn.
  - Action.
- Flow gửi lời mời:
  - Chọn bệnh nhân.
  - Nhập email/số điện thoại.
  - Chọn scope: xem hồ sơ, xem lượt đo, live monitoring, ghi chú.
  - Gửi lời mời.
- Patient accept from Android:
  - Portal cập nhật thành "Đã chấp nhận".
  - Notification và activity timeline cập nhật.
- Revoke flow:
  - Xác nhận thu hồi.
  - Giải thích sau khi thu hồi bác sĩ/phòng khám không còn xem dữ liệu mới.

### 11. Clinic Dashboard

Mục tiêu: quản lý phòng khám/cơ sở y tế ở mức vận hành, không phải cấp nền tảng.

KPI:

- Bệnh nhân đang theo dõi.
- Bác sĩ/nhân sự.
- Thiết bị online/offline.
- Lượt đo trong ngày.
- Cảnh báo cần xử lý.
- Consent chờ chấp nhận.

Sections:

- Work queue cho quản lý phòng khám.
- Cảnh báo theo mức độ.
- Thiết bị offline/pin yếu.
- Scan mới chưa được bác sĩ xem.
- Phân công bệnh nhân gần đây.
- Biểu đồ lượt đo 7/30 ngày.

Không hiện duyệt bác sĩ toàn hệ thống, global audit, system packages.

### 12. Clinic Staff / Doctors

Mục tiêu: quản lý nhân sự trong workspace.

Bảng cột:

- Tên.
- Vai trò.
- Chuyên khoa.
- Email/số điện thoại.
- Số bệnh nhân đang phụ trách.
- Trạng thái lời mời/tài khoản.
- Last active.
- Action.

Role:

- Bác sĩ.
- Điều dưỡng.
- Kỹ thuật viên.
- Quản lý phòng khám.

Action:

- Mời nhân sự.
- Chỉnh vai trò.
- Gán bệnh nhân.
- Tạm khóa trong workspace.
- Mời lại.
- Xóa khỏi workspace.

Permission:

- Không có Platform Admin.
- Hành động chỉ trong workspace hiện tại.

### 13. Clinic Patients

Mục tiêu: phòng khám quản lý toàn bộ bệnh nhân trong workspace.

Bảng cột:

- Tên bệnh nhân.
- Mã hồ sơ.
- Bác sĩ chính.
- Thiết bị.
- Consent.
- Scan gần nhất.
- Cảnh báo.
- Trạng thái theo dõi.
- Action.

Filter:

- Bác sĩ phụ trách.
- Thiết bị.
- Có cảnh báo.
- Consent.
- Scan gần đây.
- Đang theo dõi/tạm dừng.

Action:

- Gán bác sĩ.
- Gán thiết bị.
- Mời consent.
- Mở patient detail.
- Thu hồi theo dõi.

### 14. Clinic Devices

Mục tiêu: phòng khám quản lý kho thiết bị và việc gán cho bệnh nhân.

Thành phần:

- Inventory summary:
  - Tổng thiết bị.
  - Online.
  - Offline.
  - Pin yếu.
  - Chưa gán.
- Bảng thiết bị scoped theo workspace.
- Detail drawer sự kiện thiết bị.
- Modal gán/thu hồi.
- Alert khi thiết bị offline/pin yếu.

### 15. Reports

Mục tiêu: báo cáo vận hành workspace, không phải báo cáo nền tảng.

Filter:

- Hôm nay.
- 7 ngày.
- 30 ngày.
- Tùy chỉnh.
- Bác sĩ.
- Loại thiết bị/trạng thái.

Báo cáo:

- Số lượt đo.
- Số bệnh nhân được theo dõi.
- Thiết bị online/offline.
- Cảnh báo theo mức độ.
- Consent pending/accepted/revoked.
- Dung lượng lưu trữ nếu có.

Export:

- PDF.
- Excel.

Không có doanh thu/giá gói toàn nền tảng.

### 16. Notifications

Mục tiêu: hộp thư công việc cần xử lý.

Loại thông báo:

- Scan mới.
- Cảnh báo thiết bị.
- Consent.
- Lời mời.
- Phân công bệnh nhân.
- Thiết bị offline.
- Pin yếu.

Thành phần:

- Inbox list.
- Unread/read.
- Filter theo loại.
- Filter theo mức độ.
- Detail drawer.
- CTA đến bệnh nhân/thiết bị/scan liên quan.
- Mark as read.

### 17. Workspace Settings

Mục tiêu: quản lý thông tin workspace và cấu hình vận hành.

Tabs:

- Thông tin chung.
- Vai trò & quyền.
- Thông báo.
- Branding.
- Bảo mật.
- Lịch sử thay đổi trong workspace.

Thông tin chung:

- Tên workspace.
- Loại: Bác sĩ tư, Phòng khám, Cơ sở y tế.
- Địa chỉ.
- Số điện thoại.
- Email liên hệ.
- Người đại diện.

Branding:

- Logo nhỏ.
- Tên hiển thị.
- Màu phụ nếu cần, nhưng không phá design system chính.

Notification preferences:

- Scan mới.
- Thiết bị offline.
- Pin yếu.
- Consent.
- Lời mời.

Không có global system config.

### 18. Review Queue / Lượt Đo Cần Xem

Mục tiêu: bác sĩ/phòng khám xử lý các lượt đo mới hoặc bất thường theo hàng đợi công việc.

Thành phần:

- Queue tabs:
  - Tất cả.
  - Mới chưa xem.
  - Có cảnh báo.
  - Đang xử lý.
  - Đã xem.
- Filter:
  - Bác sĩ phụ trách.
  - Bệnh nhân.
  - Mức độ cảnh báo.
  - Khoảng thời gian.
  - Thiết bị.
- List/table:
  - Bệnh nhân.
  - Thời gian đo.
  - Vị trí đo.
  - Kết quả hỗ trợ.
  - Mức cảnh báo.
  - Bác sĩ phụ trách.
  - Trạng thái review.
  - Action.
- Bulk action:
  - Đánh dấu đã xem.
  - Gán cho bác sĩ.
  - Tạo follow-up.
- Detail side panel:
  - Waveform preview.
  - AI summary.
  - Quick note.

### 19. Alert Center / Cảnh Báo Cần Xử Lý

Mục tiêu: gom tất cả cảnh báo thiết bị, scan và consent vào một nơi để xử lý.

Loại cảnh báo:

- Thiết bị offline.
- Pin yếu.
- Scan lỗi.
- Scan có dấu hiệu cần xem lại.
- Consent hết hạn/bị thu hồi.
- Bệnh nhân lâu chưa đo.
- Thiết bị chưa đồng bộ.

Thành phần:

- Alert severity: Cao, Trung bình, Thấp.
- SLA/age: bao lâu chưa xử lý.
- Owner: bác sĩ/nhân sự phụ trách.
- CTA:
  - Acknowledge.
  - Assign.
  - Mở bệnh nhân.
  - Mở thiết bị.
  - Tạo task follow-up.
- State:
  - Mới.
  - Đang xử lý.
  - Đã xử lý.
  - Đã bỏ qua.

### 20. Patient Import / Bulk Onboarding

Mục tiêu: phòng khám thêm nhiều bệnh nhân nhanh, không phải nhập từng người.

Thành phần:

- Upload CSV/Excel.
- Download template.
- Mapping columns:
  - Họ tên.
  - Số điện thoại.
  - Email.
  - Ngày sinh.
  - Giới tính.
  - Mã hồ sơ.
  - Bác sĩ phụ trách.
- Preview rows.
- Validation results:
  - Dòng hợp lệ.
  - Dòng thiếu dữ liệu.
  - Số điện thoại/email trùng.
- Import success summary.
- Error retry.

### 21. Workspace Audit / Activity Log

Mục tiêu: workspace nhìn được lịch sử hành động quan trọng trong phạm vi của mình, không phải global audit của platform admin.

Events:

- Mời bệnh nhân.
- Bệnh nhân chấp nhận/thu hồi consent.
- Gán/thu hồi thiết bị.
- Gán bác sĩ.
- Thay đổi role nhân sự.
- Export báo cáo.
- Cập nhật cài đặt workspace.

Thành phần:

- Filter theo người thực hiện, loại sự kiện, thời gian.
- Detail drawer sự kiện.
- Copy dễ hiểu, không kỹ thuật.

### 22. Workspace Plan / Billing Summary

Mục tiêu: người quản lý workspace biết gói đang dùng và giới hạn, nhưng không quản lý gói toàn nền tảng.

Thành phần:

- Gói hiện tại.
- Số bệnh nhân đã dùng/tối đa.
- Số thiết bị đã dùng/tối đa.
- Số nhân sự đã dùng/tối đa.
- Dung lượng lưu trữ nếu có.
- Renewal/contact info.
- CTA "Liên hệ nâng gói".
- Billing contact form.

Không thiết kế màn tạo/sửa package toàn hệ thống.

### 23. Help & Support Trong Portal

Mục tiêu: người dùng đang đăng nhập có thể tìm hỗ trợ ngay trong portal.

Thành phần:

- Search help.
- Quick guides:
  - Mời bệnh nhân.
  - Gán thiết bị.
  - Xử lý thiết bị offline.
  - Bệnh nhân chưa nhận email/app invite.
  - Thu hồi consent.
- Contact support form:
  - Loại vấn đề.
  - Mô tả.
  - Ảnh/file đính kèm nếu cần.
- Support ticket list:
  - Mã ticket.
  - Trạng thái.
  - Người gửi.
  - Cập nhật gần nhất.

### 24. Onboarding Checklist

Mục tiêu: sau khi bác sĩ/phòng khám được duyệt, họ biết cần làm gì để bắt đầu dùng thật.

Checklist cho bác sĩ:

- Hoàn tất hồ sơ.
- Tạo bệnh nhân đầu tiên.
- Gửi lời mời consent.
- Gán thiết bị.
- Xem lượt đo đầu tiên.

Checklist cho phòng khám:

- Cập nhật workspace.
- Mời bác sĩ/nhân sự.
- Import bệnh nhân.
- Thêm thiết bị.
- Gán bác sĩ và thiết bị.
- Cấu hình thông báo.

Thiết kế checklist có progress, trạng thái completed/current/locked và CTA đến đúng màn.

## Flow Prototype Bắt Buộc

Thiết kế prototype có liên kết click được cho các flow sau:

0. Public website đến portal.
   - Trang chủ -> CTA Đăng nhập -> Login -> Dashboard đúng role.
   - Trang chủ -> CTA Đăng ký dùng thử -> chọn Bác sĩ/Phòng khám -> form đăng ký tương ứng.

0A. Khách tìm hiểu giải pháp bác sĩ.
   - Trang chủ -> Giải pháp cho bác sĩ -> Đăng ký bác sĩ -> Register Doctor -> Email Verification -> Approval Pending.

0B. Khách tìm hiểu giải pháp phòng khám.
   - Trang chủ -> Giải pháp cho phòng khám -> Đăng ký phòng khám -> Register Clinic -> Success request -> Liên hệ tư vấn.

0C. Bệnh nhân tìm hiểu app.
   - Trang chủ -> Giải pháp bệnh nhân tại nhà -> Tải app Android/Quét QR -> FAQ consent.

0D. Quên mật khẩu.
   - Login -> Quên mật khẩu -> nhập email -> Email sent -> Set new password -> Login success.

0E. Admin yêu cầu bổ sung hồ sơ bác sĩ.
   - Login -> Info Requested screen -> sửa đúng form theo loại đăng ký ban đầu -> Cập nhật và gửi lại -> Approval Pending.

1. Bác sĩ tạo bệnh nhân và gửi lời mời.
   - Dashboard -> Tạo bệnh nhân -> nhập thông tin -> gửi consent -> Patient Detail -> status Chờ consent.

2. Bệnh nhân accept consent từ Android.
   - Invitations & Consent -> lời mời chờ chấp nhận -> state cập nhật Đã chấp nhận -> notification -> Patient Detail hiện consent active.

3. Phòng khám gán bác sĩ cho bệnh nhân.
   - Clinic Patients -> chọn bệnh nhân -> modal Gán bác sĩ -> confirm -> Patient Detail cập nhật bác sĩ chính.

4. Gán thiết bị cho bệnh nhân.
   - Devices -> Assign Device wizard -> chọn bệnh nhân -> chọn thiết bị -> confirm -> success -> Patient Detail/Live Monitoring.

5. Bác sĩ xem scan mới.
   - Notification scan mới -> Scan Detail -> xem waveform/AI result -> thêm ghi chú -> đánh dấu đã xem.

6. Thiết bị offline/pin yếu tạo cảnh báo.
   - Live Monitoring -> device offline/pin yếu -> Dashboard KPI tăng -> Notifications có item -> Device Detail drawer.

7. Thu hồi quyền theo dõi.
   - Patient Detail -> Consent tab -> Thu hồi -> confirm -> state Bị thu hồi -> patient list cập nhật.

8. Thu hồi thiết bị.
   - Device Detail -> Thu hồi -> confirm -> device Chưa gán -> Patient Detail mất thiết bị active.

9. Mời nhân sự phòng khám.
   - Clinic Staff -> Mời nhân sự -> chọn role -> gửi mời -> trạng thái Chờ chấp nhận.

10. Sai role vào portal.
   - Login -> account Platform Admin -> permission screen -> CTA sang `shcare-admin.web.app`.

## State Bắt Buộc

Mỗi màn hình chính cần có:

- Public landing ready state.
- Public form sending/success/error.
- Public 404 state.
- Maintenance state.
- Login error.
- Forgot password email sent.
- Email verification pending/success/error.
- Doctor approval pending.
- Doctor info requested.
- Doctor rejected.
- Loading skeleton cho table/card/detail.
- Empty state có CTA.
- Error state có nút thử lại.
- Permission denied state giải thích role/workspace.
- Offline state cho live/device.
- Low battery alert.
- Consent pending/accepted/revoked.
- Device assigned/unassigned/revoked.
- Save success toast.
- Form validation error.
- Confirm modal cho hành động nguy hiểm.

Ví dụ copy:

- "Chưa có bệnh nhân nào trong workspace này."
- "Không tải được danh sách thiết bị. Vui lòng thử lại."
- "Bạn không có quyền xem workspace này."
- "Thiết bị SHS-2406-014 đã offline 12 phút."
- "Bệnh nhân đã chấp nhận quyền theo dõi."
- "Quyền theo dõi đã được thu hồi."

## Permission Và Security UX

Thiết kế UI phải thể hiện đúng giới hạn quyền:

- Bác sĩ chỉ thấy bệnh nhân được gán hoặc bệnh nhân của mình.
- Quản lý phòng khám thấy dữ liệu trong workspace của mình.
- Điều dưỡng/kỹ thuật viên bị hạn chế một số hành động như export, thu hồi consent, đổi role.
- Hành động không có quyền phải disabled có tooltip hoặc ẩn hành động nếu không cần hiện.
- Permission denied page phải có CTA quay lại dashboard hoặc đổi workspace.

Không thiết kế UI tạo cảm giác frontend filter là lớp bảo mật duy nhất. Copy nên nói rõ "Bạn không có quyền trong workspace này" thay vì lỗi kỹ thuật.

## Figma Deliverables Bắt Buộc

Tạo file Figma gồm các page:

1. Cover & Design Direction
2. Tokens & Components
3. Public Website
4. Auth & Onboarding
5. Portal Layout
6. Doctor Screens
7. Clinic Screens
8. Patient & Scan Details
9. Devices & Monitoring
10. Invitations & Consent
11. Reports & Settings
12. Support & Billing
13. Prototype Flows
14. Responsive Variants

Frame desktop high-fidelity bắt buộc:

- Public Homepage.
- Product Overview.
- Smart Stethoscope Device Page.
- Doctor Solution Page.
- Clinic/Facility Solution Page.
- Patient At Home Page.
- Security & Consent Page.
- Pricing/Plans Page.
- Resources/FAQ Page.
- Contact/Request Demo Page.
- Legal/Privacy Layout.
- Public 404/Maintenance.
- Login.
- Forgot Password.
- Reset Password.
- Register Doctor.
- Register Clinic/Facility.
- Email Verification.
- Approval Pending.
- Info Requested.
- Rejected.
- Workspace/Role Switcher.
- Doctor Dashboard.
- Doctor Patient List.
- Patient Detail.
- Scan/Record Detail.
- Review Queue.
- Alert Center.
- Live Monitoring.
- Devices.
- Assign Device Wizard.
- Invitations & Consent.
- Clinic Dashboard.
- Clinic Staff/Doctors.
- Clinic Patients.
- Clinic Devices.
- Reports.
- Notifications.
- Workspace Settings.
- Patient Import.
- Workspace Audit/Activity Log.
- Workspace Plan/Billing Summary.
- Help & Support.
- Onboarding Checklist.
- Permission Denied/Wrong Surface.

Responsive variants bắt buộc:

- Public Homepage mobile.
- Public nav mobile.
- Pricing mobile.
- Contact form mobile.
- Login mobile.
- Register Doctor mobile.
- Doctor Dashboard tablet.
- Patient List mobile.
- Patient Detail mobile.
- Live Monitoring tablet.

Components bắt buộc:

- Public sticky navbar.
- Public footer.
- Hero section.
- Product visual/mockup block.
- Feature grid.
- Solution card.
- Pricing card.
- FAQ accordion.
- Contact form.
- Testimonial/trust block nếu dùng.
- Sidebar.
- Topbar.
- Workspace switcher.
- KPI card.
- Table.
- Filter bar.
- Status badge.
- Patient card.
- Device card.
- Alert item.
- Notification item.
- Drawer.
- Modal.
- Wizard stepper.
- Tabs.
- Empty state.
- Error state.
- Loading skeleton.
- Toast.
- Form stepper.
- File upload.
- QR/download app block.

Annotation bắt buộc:

- Frame nào thuộc public website, frame nào thuộc portal sau đăng nhập.
- CTA nào chuyển từ public sang login/register.
- Role nào được xem/action nào.
- State nào xuất hiện khi data lỗi hoặc không có dữ liệu, nhưng không hiện chữ API trong UI.
- Nơi nào là flow của bác sĩ cá nhân, nơi nào là flow của phòng khám.
- Nơi nào sẽ đồng bộ với Android consent/device invite.

## Acceptance Checklist

Thiết kế chỉ được xem là đạt nếu:

- Nhìn vào public website biết ngay Smart Health là sản phẩm ống nghe thông minh + app + portal y tế, không phải trang placeholder.
- Nhìn vào portal biết ngay đây là `shcare.web.app` cho bác sĩ/phòng khám, không phải web admin hệ thống.
- Màu sắc, card, border, typography, badge và icon đồng bộ với Android app và web admin.
- Có public landing/commercial website đầy đủ: trang chủ, sản phẩm, giải pháp, thiết bị, bảo mật, bảng giá/liên hệ, tài nguyên, footer.
- Public website có CTA rõ: đăng nhập, đăng ký bác sĩ, đăng ký phòng khám, liên hệ tư vấn, tải app Android.
- Portal sau đăng nhập không dùng hero marketing rườm rà; portal phải ưu tiên workflow, bảng, filter, drawer, chart, alert.
- Không có gradient orb, glassmorphism, neon/cyberpunk hoặc style lệch khỏi Smart Health.
- Không có module duyệt bác sĩ toàn hệ thống, global audit, platform packages, admin accounts.
- Mỗi màn hình bắt buộc có đủ state loading/empty/error/permission.
- Auth/onboarding có đủ register, verify email, forgot/reset password, pending approval, info requested, rejected.
- Các flow prototype bắt buộc có liên kết rõ.
- Dữ liệu mẫu là tiếng Việt thực tế, không Lorem ipsum.
- Text không tràn container, không overlap, đọc tốt ở desktop/tablet/mobile.
- Dashboard, table, drawer, modal đủ tính operational, sẵn sàng để developer implement.
- Portal thể hiện đủ logic bác sĩ cá nhân và phòng khám/cơ sở y tế, nhưng không thêm clinic-admin mode vào Android.

## Ghi Chú Cuối

Thiết kế này cần bao phủ cả hành trình thương mại và workflow thực tế:

- Khách truy cập hiểu Smart Health là gì ngay từ trang chủ.
- Bác sĩ/phòng khám có CTA rõ để đăng ký, đăng nhập hoặc liên hệ tư vấn.
- Public website đủ độ tin cậy như một sản phẩm SaaS thương mại, nhưng vẫn đúng ngữ cảnh HealthTech.
- Auth/onboarding xử lý đủ đăng ký, xác thực email, quên mật khẩu, chờ duyệt, bổ sung hồ sơ và bị từ chối.
- Portal sau đăng nhập không phải trang giới thiệu nữa, mà là công cụ vận hành hằng ngày.

- Bác sĩ theo dõi bệnh nhân.
- Bệnh nhân cấp consent từ Android.
- Phòng khám gán bác sĩ và thiết bị.
- Thiết bị gửi cảnh báo offline/pin yếu.
- Bác sĩ xem scan, ghi chú và theo dõi tiếp.

Hãy ưu tiên sự rõ ràng, độ tin cậy và tốc độ thao tác. Smart Health là sản phẩm y tế dùng hằng ngày, không phải dashboard demo.
