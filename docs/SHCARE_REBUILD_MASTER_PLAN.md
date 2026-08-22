# Kế hoạch tái thiết toàn diện Shcare Web, Portal, Platform Admin, Android và firmware

Trạng thái tài liệu: kế hoạch gốc đã được người dùng chấp thuận và yêu cầu triển
khai. Tài liệu này là nguồn tham chiếu phạm vi lâu dài sau khi hết quota, compact,
khởi động lại Codex hoặc tắt máy. Việc cập nhật tiến độ không được sửa âm thầm nội
dung kế hoạch này; tiến độ hiện hành nằm trong
`SMART_HEALTH_ACTIVE_CHECKPOINT.md`, bằng chứng đã đóng nằm trong
`SMART_HEALTH_CONTEXT_NEW_CHAT.md` và
`SMART_HEALTH_REBUILD_EXECUTION_LEDGER.md`.

## 1. Mục tiêu và tiêu chuẩn hoàn thành

- Phạm vi gồm toàn bộ Public Website, Auth, Workspace Portal, Platform Admin và
  những API/database bắt buộc để các luồng hoạt động thật.
- Bổ sung toàn bộ Android app, backend contract và firmware sản xuất
  `MSM261S4030H0`.
- Kết quả phải hoàn chỉnh về nhận diện, UI/UX, responsive/adaptive,
  light/dark/system, nội dung, animation, quyền truy cập và trạng thái
  loading/empty/error/offline/403/404.
- Không còn nút chết, số liệu dựng, dữ liệu AI mẫu, timeline giả, thông báo thành
  công giả hoặc chức năng chỉ đổi local state.
- Mọi lỗi tái hiện được trong phạm vi phải được sửa; không phát hành khi còn
  P0/P1, vi phạm tenant/RBAC, mutation không cleanup được hoặc chức năng quan
  trọng thiếu failure/retry state.
- Giữ URL hiện hành. Không viết lại router hoặc toàn bộ ứng dụng nếu chưa có lý
  do kỹ thuật; nâng cấp theo lát cắt và bảo vệ hành vi bằng test.
- Build/source proof, emulator/device proof, hardware proof và provider/live
  proof phải được ghi nhận riêng.

## 2. Kế hoạch UI/UX và tái thương hiệu Web

### Nhận diện Shcare mới

- Tên chính: `Shcare`.
- Lockup bảo chứng: `Shcare — Smart Health Care`.
- SEO/copy dài: `Shcare — Nền tảng Smart Health Care theo dõi tim phổi từ xa`.
- Logo: chữ S tạo từ hai nét tín hiệu sinh học bo tròn, không dùng biểu tượng tim,
  dấu thập hoặc ống nghe phổ biến.
- Xuất đủ symbol, horizontal lockup, monochrome, light/dark, favicon và OG
  1200×630; SVG là nguồn gốc.
- Typography Web:
  - Manrope 600/700 cho brand và heading public.
  - Source Sans 3 400/500/600/700 cho Auth, Portal, Admin và dữ liệu.
  - Font tự host, đủ tiếng Việt, WOFF2 subset, `font-display: swap`.
- Palette:
  - Ink `#0B1F33`, text `#102A43`, muted `#52677A`.
  - Primary cobalt `#2457D6`, vital teal `#087F75`.
  - Canvas `#F4F8FB`, surface `#FFFFFF`, border `#D8E3EA`.
  - Dark canvas `#071722`, dark surface `#0D2533`.
  - Success `#18794E`, warning `#A15C00`, danger `#B4233A`, info `#2563A6`.
- Không dùng neon, gradient text, glassmorphism, glow, orb hoặc hiệu ứng mang cảm
  giác dashboard demo.

### Design system Web/Admin

- Tạo package React-free `@shcare/brand` tại `packages/shcare-brand`, xuất
  `tokens.css`, token JSON/TypeScript, font CSS, motion token và SVG.
- Web dùng một cây primitive canonical tại `src/components/ui`.
- Admin giữ adapter component riêng nhưng dùng cùng brand token Web.
- Chuẩn hóa Button, IconButton, Field, Input, Select, Combobox, DatePicker, Card,
  PageHeader, FilterBar, DataTable, StatusBadge, Skeleton,
  Empty/Error/Permission State, Dialog, Drawer, Toast và destructive
  confirmation.
- Di chuyển route theo từng lát cắt rồi mới xóa primitive trùng và bốn lớp CSS cũ.
- Không tạo lớp override thứ năm; loại `glass-panel`, `premium-button`,
  `brand-gradient-text`, cyber CSS và các `!important` chữa cascade.
- Theme lần đầu theo hệ điều hành, hỗ trợ `light|dark|system`, lưu preference,
  đồng bộ cross-tab và chống flash.
- Toaster, chart, dialog, logo và print view phải dùng đúng theme.

### Thiết kế theo bề mặt Web

- Public:
  - Hero dùng copy/CTA bên trái và composite thiết bị + UI thật bên phải.
  - CTA chính `Đăng ký sử dụng`, CTA phụ `Xem giải pháp`.
  - Hệ thống hóa trang sản phẩm, thiết bị, RPM, giải pháp bác sĩ/phòng
    khám/bệnh nhân, tài nguyên, pricing, contact, security, legal, maintenance
    và 404.
  - Không dùng testimonial, metric hoặc logo khách hàng chưa xác minh.
- Auth:
  - Một shell thống nhất cho login, quên mật khẩu, xác minh email, đăng ký bác
    sĩ/phòng khám và trạng thái chờ duyệt.
  - Form có label thật, validation theo trường, server error, upload progress,
    unsaved-change guard và phục hồi rõ ràng.
- Portal:
  - Sidebar/drawer, workspace switcher, notification/user menu và command
    palette theo role/capability.
  - Dashboard theo vai trò và chỉ hiển thị KPI backend thật.
  - Mọi trang có loading, empty, partial, stale, offline, retry,
    permission-denied và destructive state.
- Admin:
  - Route permission tách khỏi menu để direct URL không bị chặn sai.
  - Global search thành command palette; tìm dữ liệu thật nằm trong từng danh
    sách bằng query API.
  - Chuẩn hóa shell quản trị, filter bar, data table, detail drawer, audit JSON
    viewer và mutation review.

### Motion, accessibility và hiệu năng Web

- Public dùng animation 300–500ms cho hero, product reveal và chuyển cảnh có mục
  đích; stagger tối đa bốn phần tử.
- Portal/Admin dùng microinteraction 150–220ms; drawer/dialog tối đa 240ms.
- Chỉ animate `opacity` và `transform`; không scroll hijack hoặc loop trang trí.
- `prefers-reduced-motion` tắt choreography, autoplay và animation lặp.
- WCAG 2.2 AA, target tối thiểu 44×44, contrast 4.5:1, skip link, label/error
  association, focus-visible, zoom 200–400%.
- Mục tiêu CSS ≤70KB gzip, font ≤220KB tổng, public initial JS ≤250KB gzip, LCP
  ≤2,5s, INP ≤200ms, CLS ≤0,1.

## 3. Hoàn chỉnh chức năng Web/Admin và API/data

### Hợp đồng chung

- Tạo `RouteContract` gồm `path`, `surface`, `requiredCapabilities`, `nav`,
  `stateCoverage`, `smokeId`.
- Router, menu, permission gate và browser smoke cùng đọc contract.
- Mutation mới dùng `Idempotency-Key`; lỗi chuẩn hóa thành
  `{code, message, fieldErrors?, requestId}`.
- Migration chỉ additive, nullable/default và có backfill; giữ tương thích
  `/api/v1` và alias cũ trong compatibility window.
- Firebase chỉ xác thực danh tính. Quyền workspace lấy từ membership backend;
  client không tự suy diễn hoặc cấp quyền.

### Các lát cắt chức năng

| Nhóm | Phạm vi phải hoàn chỉnh |
| --- | --- |
| Bệnh nhân | Create/edit có gender, contact, DOB, patient code, blood type, allergies, emergency contact; tuổi tính từ DOB; delete có busy/confirm/audit. |
| Import CSV | `validate → preview → commit`, UTF-8 tối đa 5MB/5.000 dòng, phát hiện trùng, batch hết hạn 24 giờ, transaction all-or-nothing và idempotent. |
| Lịch hẹn | Detail/edit; kiểm tra thời gian và conflict; state machine `scheduled → confirmed/cancelled/no_show`, `confirmed → completed/cancelled/no_show`; cancel có lý do; soft-delete. |
| Nhân sự | Workspace admin, doctor, nurse, technician, billing, viewer; invite, resend, revoke, suspend/reactivate; không mất owner cuối cùng. |
| Scan review | `pending|reviewed`, decision `accepted|repeat_measurement|follow_up_required`, note, reviewer, timestamp và optimistic version. |
| Alert | Ledger `open|acknowledged|resolved`, dedupe theo source, acknowledge/resolve có audit. |
| Admin | Loại dữ liệu fake ở Overview, Patients, Doctors, AI Measurements và Audit; filter/range dùng dữ liệu thật. |
| Notifications | Audience theo workspace/role/users; `in_app`, `email`, `push` có trạng thái riêng; provider thiếu phải hiện unavailable. |
| Audit/Export | Audit log thật; export CSV/XLSX/PDF/JSON theo filter và được audit; bỏ tuyên bố mã hóa/nén chưa có thật. |
| Billing | Chỉ giữ summary gói, usage/quota, billing contact và quy trình thủ công trung thực. Không thêm thanh toán thật trong đợt này. |

API tối thiểu:

- Patient import: validate, batch detail và commit.
- Staff: list, invitation create/resend/revoke/accept, membership update/revoke.
- Review: review queue và decision.
- Alerts: list, acknowledge và resolve.
- Admin list API bổ sung `q/page/limit/sort` nhưng giữ body tương thích;
  pagination qua header.
- Mọi mutation phải tenant-scoped, capability-checked, audit cùng transaction và
  có negative test cross-workspace.

## 4. Trình tự Web/Admin, kiểm thử và phát hành đã chốt

1. Bảo toàn worktree bằng manifest hash và backup allowlist ngoài repo; không
   reset, stash-all, force-push hoặc `git add -A`.
2. Khởi tạo Admin CodeGraph khi bắt đầu triển khai và giữ index local/untracked.
3. Chốt route–role–state–action matrix và bug ledger.
4. Làm brand package, token, theme, typography, motion và primitive trước.
5. Migrate Public → Auth → Portal shell.
6. Portal theo lát cắt: Account/Workspace → Patients/Import → Appointments →
   Review/Alerts/Live → Devices/Consent →
   Staff/Notifications/Reports/Audit/Settings/Help/Billing.
7. Admin theo lát cắt: route/capability → Overview/list/detail →
   Doctors/Patients/Devices/Packages/Storage →
   Notifications/Audit/Settings/Export.
8. Mỗi slice phải qua unit/component, browser local, API permission và cleanup
   proof.
9. Tạo clean release worktree tại candidate SHA; stage thay đổi có chủ đích.

Kiểm thử Web/Admin:

- Vitest, Testing Library, `@playwright/test`, `@axe-core/playwright`.
- Chromium chạy toàn route contract ở 360/390/768/1024/1440,
  light/dark/system và các role.
- Firefox/WebKit chạy hành trình quan trọng desktop/mobile.
- Visual snapshot dùng fixture cố định; đóng băng thời gian, animation và dữ liệu
  động.
- Zero axe serious/critical, zero console error không chủ đích, zero
  unauthorized request, zero overflow/scroll trap.
- Happy path, validation, API error/retry, 403, cross-tenant denial, destructive
  confirm, double-submit và cleanup.
- Chạy lint/type/build, backend check/test/repository/workspace/role smoke.

Phát hành:

- Backend additive deploy trước.
- Firebase preview Web/Admin trên hai channel riêng.
- Backup hai live channel trước production.
- Promote Admin trước, chạy read-only và một mutation smoke có cleanup; sau đó
  mới promote Web/Portal.
- Rollback Firebase độc lập bằng backup channel; backend rollback bằng previous
  deploy hoặc commit revert.
- Đồng bộ toàn bộ handoff docs bằng candidate SHA, deploy ID,
  preview/live version, smoke run ID và cleanup result.

## 5. Giả định và giới hạn đã khóa

- Rebrand bao phủ Public/Auth/Portal/Admin; legal chỉ đổi nhận diện, không tự viết
  lại nội dung pháp lý.
- Android và firmware được đưa vào phạm vi bổ sung từ mục 6 trở đi; đây là thay
  đổi duy nhất đối với giới hạn cũ.
- Chưa thay domain, email template, payment provider hoặc tự tuyên bố chứng nhận
  y tế.
- Media lâm sàng phải có quyền sử dụng và không chứa PHI.
- AI chỉ hỗ trợ phân tích/review; quyết định lâm sàng thuộc người có chuyên môn.
- Nếu Render suspended/503 hoặc provider thiếu credential, có thể hoàn thành
  source/build/local/preview nhưng live promotion phải ghi `blocked`.
- Hiện không có Android hoặc ESP32 gắn máy; runtime/device/hardware proof chưa
  được coi là hoàn thành.

## 6. Nguyên tắc bổ sung: Web và App phải tách UI/UX

### Ba lớp đồng bộ

1. Đồng bộ nghiệp vụ:
   - Cùng API contract, quyền, validation, lifecycle, lỗi, audit và mutation
     outcome khi workflow có đối ứng.
2. Đồng bộ thương hiệu:
   - Cùng tên Shcare, logo, ý nghĩa màu, thuật ngữ, tone of voice và chuẩn
     accessibility.
3. UI/UX độc lập:
   - Public Web tối ưu marketing và responsive browser.
   - Portal tối ưu nghiệp vụ desktop/tablet.
   - Admin tối ưu mật độ dữ liệu và thao tác bàn phím.
   - Android tối ưu native mobile, thao tác một tay, back navigation, permission,
     keyboard, offline, lifecycle, TalkBack và haptic.

### Ranh giới kỹ thuật

- App không dùng component, layout, spacing scale hoặc motion implementation của
  Web.
- `@shcare/brand` tiếp tục là package dành cho Web/Admin.
- Android có `ShcareMobileTheme` và bộ Compose component riêng.
- App chỉ tái sử dụng logo, tên thương hiệu và một số semantic brand color;
  typography scale, elevation, shape, spacing, navigation và motion được thiết
  kế riêng.
- Không pixel-match App với Web và không dùng screenshot Web làm tiêu chí nghiệm
  thu App.
- Mỗi feature phải có impact record:
  - Actor.
  - API/event bị ảnh hưởng.
  - Web route.
  - Admin route.
  - Android screen hoặc `N/A` kèm lý do.
  - Firmware impact.
  - Migration, notification, audit, test, deploy order và rollback.

### Những phần hợp lệ là Web/Admin-only

- Platform approval, package management, platform storage, batch patient import
  và platform audit/export không bắt buộc có giao diện Android.
- Staff lifecycle và billing tiếp tục web-first; App chỉ hiển thị
  membership/workspace hoặc thông tin cần cho người dùng.
- OTA trigger, rotate secret, revoke thiết bị và fleet management thuộc Admin.
- Android được xem trạng thái firmware/maintenance phù hợp quyền, nhưng không tự
  có quyền quản trị platform.

## 7. Kế hoạch UI/UX Android độc lập

### Nền tảng kiến trúc

- Nâng cấp module Compose hiện tại, không viết lại từ đầu.
- Tách `SmartHealthApi` và logic trực tiếp trong screen thành
  repository/domain/ViewModel theo feature.
- Mỗi màn dùng immutable `UiState`, `UiAction`, one-shot `UiEffect`; tránh API
  call và local mutable state rải rác trong composable.
- Tạo typed mobile route contract cho navigation, deep link, role, capability và
  test tag.
- Thay inline copy bằng resource có hỗ trợ tiếng Việt chuẩn và sẵn cấu trúc
  i18n.
- Chuyển danh sách dài sang lazy list; thêm paging/search/filter khi dữ liệu lớn.
- Loại bản duplicate cũ khỏi canonical scope; chỉ archive sau khi kiểm tra
  checksum, không xóa mù.

### `ShcareMobileTheme`

- Mobile color scheme riêng cho light/dark, không copy surface/elevation Web.
- Mobile typography scale riêng; có thể dùng cùng font brand nhưng kích thước,
  line-height và weight theo Android.
- Token riêng cho 4/8dp spacing, shape, elevation, divider, status color, chart
  và motion.
- Component riêng:
  - `ShcareScaffold`, top app bar, bottom navigation, navigation rail.
  - Mobile field, date/time picker, search, filter chip, status chip.
  - Vital card, device card, appointment card, record card.
  - Skeleton, empty, error, offline, permission và retry state.
  - Bottom sheet, confirmation sheet, snackbar và destructive dialog.
  - Timeline, waveform, audio player, progress và sync status.
- Loại raw color, raw font size và raw corner radius khỏi screen sau khi migrate.
- Dark mode phải qua từng màn; không để `Color.White` hoặc nền sáng phá theme.

### Kiến trúc thông tin native

Patient compact navigation:

- `Tổng quan`
- `Đo`
- `Hồ sơ`
- `Tài khoản`
- Thông báo mở từ app bar và deep link.

Doctor compact navigation:

- `Hôm nay`
- `Bệnh nhân`
- `Cảnh báo`
- `Tài khoản`
- Record review, appointment và scan mở theo ngữ cảnh.

Tablet/foldable:

- Bottom navigation chuyển thành rail.
- Detail dùng two-pane khi đủ chiều rộng.
- Không kéo giãn phone layout thành tablet.

### Các nhóm màn hình

| Nhóm | Nâng cấp độc lập trên App |
| --- | --- |
| Splash/Auth | Splash nhẹ, login patient/doctor rõ ràng, signup theo bước, email verification deep link, forgot password, approval timeline và recovery state. |
| Dashboard | Patient: thiết bị, lần đo gần nhất, lịch hẹn, hồ sơ đang chọn. Doctor: lịch hôm nay, bệnh nhân cần review, alert và device status. |
| Profile/Family | Chuyển profile đang hoạt động, editor mobile, dependent CRUD, validation và unsaved-change guard. |
| Consent/Data access | Phân biệt consent bệnh nhân, clinician access grant và administrative assignment; hiển thị scope, recipient, expiry, revoke và audit. |
| Appointment | Bổ sung list/detail/create/request-reschedule/cancel cho patient; agenda/detail/status action cho doctor theo quyền. |
| Device | Đổi tên luồng thành `Ghép thiết bị`; QR thật, manual code, provisioning progress, online confirmation, reconnect và recovery. |
| Scan/Live | Readiness checklist, body-site guide, timer, waveform thật, chất lượng kết nối, reconnect, audio focus và interrupted state. |
| Record | Lazy timeline, search/filter, waveform/audio thật, signed download, Sharesheet, consent/share state và review result. |
| Alert/Notification | Alert ledger phù hợp role, FCM display/deep link, read/read-all, filter và preference thật. |
| AI | Bỏ hội thoại/chẩn đoán mẫu; empty state thật, disclaimer rõ, loading/retry và không tự tạo dữ liệu khi backend lỗi. |
| Settings/Security | Profile, workspace switcher, password, session, 2FA enrollment/challenge, biometric local unlock, notification, storage/export/delete data. |

### Motion mobile

- Navigation và component transition 180–260ms, tối ưu thao tác native.
- Không dùng scroll reveal, hover animation hoặc choreography kiểu Public Web.
- Haptic chỉ dùng cho confirm quan trọng, warning và successful device
  connection.
- Tôn trọng system `Remove animations`/animator scale; reduced mode bỏ
  slide/scale và dùng state change tức thời hoặc fade ngắn.
- Không áp cùng một slide/fade/scale cho mọi route bất kể ngữ cảnh.

### Accessibility và responsive mobile

- Touch target tối thiểu 48dp.
- TalkBack semantics, heading, state description và action label đầy đủ.
- Không truyền đạt trạng thái chỉ bằng màu.
- Hỗ trợ font 200%, display size lớn, portrait/landscape và
  360/412/600/840dp.
- Xử lý edge-to-edge, status/navigation bar, display cutout và IME inset.
- Mọi form phải giữ được nút chính khi bàn phím mở.
- Waveform phải có mô tả số liệu thay thế cho người không nhìn được đồ thị.

### Lỗi Android phải sửa

- Xóa QR scanner giả và pairing thiết bị mẫu.
- Không gọi backend inventory scan là Bluetooth.
- Lựa chọn canonical là QR + secure Wi‑Fi provisioning; ẩn/bỏ Bluetooth cho đến
  khi có BLE GATT thật trên cả App lẫn firmware.
- Xóa AI seeded conversation và seeded diagnostic.
- FCM phải tạo channel, hiển thị notification, xin permission đúng thời điểm và
  deep-link đúng màn.
- Notification preference dùng PATCH theo trường; không hardcode và ghi đè
  thiết lập từ Portal.
- Record share dùng Android Sharesheet; download có progress, authorization và
  vị trí lưu rõ ràng.
- Live audio thêm reconnect/backoff, lifecycle, audio focus và error recovery.
- Phone login chỉ xuất hiện khi Firebase Phone Auth/provider thật đã cấu hình;
  không để placeholder.
- 2FA chỉ được ghi enabled sau enrollment và OTP challenge thành công.
- PII không lưu plaintext SharedPreferences; cấu hình backup phải loại dữ liệu
  nhạy cảm.
- Release chỉ dùng HTTPS; cleartext chỉ được phép trong debug emulator.
- Thêm cache/outbox có mã hóa cho read model và mutation an toàn; không cache raw
  PHI/audio ngoài chính sách.
- REST phải có timeout hữu hạn, retry có điều kiện và cancellation theo
  lifecycle.
- Settings phải capability-gated và phân biệt dữ liệu local với cloud.

## 8. Đồng bộ chức năng và contract toàn hệ thống

### Nguồn sự thật

- Backend quyết định RBAC, tenant/workspace, ownership, lifecycle và audit.
- ID canonical: `userId`, `workspaceId`, `patientId`, `deviceId`, `scanId`.
- Alias cũ được hỗ trợ trong compatibility window rồi loại dần bằng telemetry.
- Tạo versioned schema/fixture cho HTTP, WSS, device command/event và client
  model.
- Web/Admin/Android không tự tạo success state khi backend hoặc thiết bị chưa
  xác nhận.

### Ma trận chức năng

| Domain | Web/Portal/Admin | Android độc lập | Firmware |
| --- | --- | --- | --- |
| Auth/role/workspace | Đăng ký, approval, membership, workspace switch | Login/signup/status/switch theo UX mobile | N/A |
| Patient/family | CRUD và import cho workspace | Cá nhân, dependent và profile switch | N/A |
| Appointment | Clinic operation đầy đủ | Patient và doctor mobile workflow | N/A |
| Staff | Web-first lifecycle | Chỉ membership/status/switch | N/A |
| Consent/share | Portal quản lý theo capability | Patient consent và share UX native | N/A |
| Device | Provision/claim/assign/command/OTA | Claim, Wi‑Fi provision, own-device status | Identity, telemetry, command, OTA |
| Scan/audio | Portal live/review/report | Guided scan, live audio, record/playback | Capture và gửi PCM |
| Alert | Ledger và workflow xử lý | Patient/doctor alert theo role | Event/status source |
| Notification | Audience/provider/admin settings | FCM display, deep link, preference | Device event tạo notification gián tiếp |
| Audit/export | Workspace/platform export | Personal export/access history | Event correlation |
| Billing | Summary thủ công trên Web | N/A hoặc read-only plan status | N/A |

### Lifecycle phải chuẩn hóa

- Scan upload: `created → uploading → queued → processing → completed|failed`.
- Scan live: `recording → completed|interrupted`.
- Appointment: `scheduled|confirmed|completed|cancelled|no_show`.
- Consent/share: `active|revoked|expired`.
- Device:
  - Ownership: `provisioned → claimed → assigned|unassigned → revoked`.
  - Presence tách riêng: `offline|connecting|online|degraded`.
- Device command:
  `accepted → queued|delivered → acknowledged → applying → applied|failed|expired`.
- Notification delivery:
  `ready|disabled|skipped|no_devices|sent|partial|failed`; `sent` không có nghĩa
  người dùng đã xem.
- OTA:
  `pending → delivered → downloading → verifying → rebooting → confirmed|rolled_back|failed`.

### Những khoảng trống phải đóng

- Portal “LIVE” chuyển sang WebSocket thật với waveform, reconnect và nguồn
  recording rõ ràng; REST polling chỉ là fallback và phải ghi đúng.
- Appointment được bổ sung trên Android.
- Notification schema dùng chung và PATCH theo field.
- Consent tách đúng actor pháp lý.
- Admin notification settings phải persist hoặc bị loại, không local toast.
- Portal/App chỉ báo “đã gửi lệnh” khi backend accepted; chỉ báo “thiết bị đã áp
  dụng” sau ACK.
- MQTT được xác định là scaffold tùy chọn. WSS là transport sản phẩm canonical
  trong đợt này; UI/docs không được tuyên bố MQTT production-complete.

## 9. Kế hoạch firmware và thiết bị

### Canonical target

- Chỉ `smart-health-embedded/MSM261S4030H0`.
- Giữ PCM16 little-endian mono 16kHz và 128 sample/packet trong compatibility
  phase.
- `main_backup.cpp` được đánh dấu legacy, không dùng làm nguồn sản xuất.
- Kiểm tra thực tế flash 16MB và partition trên board; bỏ COM hardcode khỏi
  config chia sẻ.

### P0 bảo mật WSS và secret

- Không đăng ký socket thiết bị trước khi xác thực thành công.
- Không đặt secret trong query string, telemetry hoặc log.
- Dùng challenge–response với nonce và device credential; backend chỉ lưu
  hash/verification material.
- SQL và JSON repository phải có cùng quy tắc secret enforcement.
- Revoke phải đóng socket hiện tại, từ chối binary audio và không cho presence
  đánh dấu connected.
- TLS production phải xác minh CA; không dùng `setInsecure()`.
- Credential rotation dùng giai đoạn overlap, device ACK secret mới rồi mới thu
  hồi secret cũ.

### Command contract

- Chuẩn envelope:
  - `protocolVersion`
  - `id`
  - `type`
  - `issuedAt`
  - `expiresAt`
  - `payload`
  - `correlationId`
- Firmware đọc dữ liệu trong `payload`, không đọc nhầm top-level.
- Unknown command trả stable error code, không im lặng.
- Có dedupe/idempotency theo command ID.
- Bổ sung ACK/progress/result.
- `calibrate` chỉ được giữ nếu firmware triển khai thật, có thuật toán, giới hạn,
  persistence và kết quả; nếu không thì bỏ control khỏi các client.
- Lock/revoke phải persist qua reboot theo policy.

### Provision/claim thật

- Admin provision thiết bị và sinh QR chứa `deviceId`, one-time claim code và
  proof-of-possession.
- App quét QR thật hoặc nhập mã thủ công.
- Backend claim trước, sau đó App hướng dẫn kết nối secure setup AP để gửi
  Wi‑Fi.
- Setup AP:
  - Chỉ mở sau physical gesture hoặc factory state.
  - Có password/PoP theo từng thiết bị.
  - Hết hạn tự động.
  - Không prefill hoặc render lại Wi‑Fi password.
  - Có CSRF/session protection.
  - Không cho sửa ownership, secret hoặc OTA policy.
- Pair chỉ hoàn tất sau khi firmware đăng nhập WSS và backend xác nhận online;
  không đặt `connected=true` ngay sau REST call.
- BLE không nằm trong release canonical này; chỉ mở lại khi có firmware GATT,
  Android BLE, security contract và hardware proof cùng đợt.

### Audio protocol và scan binding

- Loại global recording có thể nhận audio từ bất kỳ thiết bị.
- Mỗi recording phải bind rõ `workspaceId`, `patientId`, `deviceId`, `scanId` và
  authenticated socket.
- Bổ sung protocol v2 có version, session/scan identity, sequence, timestamp,
  sample count và flags.
- Backend hỗ trợ v1 raw PCM trong migration window nhưng production mới phải
  dùng v2.
- Giới hạn frame size, kiểm tra sequence/gap/order và ghi dropped packet
  metrics.
- UDP chỉ là local development fallback; không được dùng làm production-secure
  path.
- Listener Web/App nhận metadata trước khi phát PCM và không được trộn nguồn
  thiết bị.

### Telemetry và resilience

- Telemetry thật gồm firmware/protocol version, uptime, reset reason, RSSI, IP,
  free heap, I2S/audio health, packet sent/dropped/failure, last command và OTA
  state.
- Không hardcode `audioStatus=streaming` chỉ vì socket đang kết nối.
- Thêm NTP/time sync và monotonic sequence.
- Có reconnect exponential backoff và watchdog.
- Tách capture khỏi tác vụ network/blocking OTA để tránh ngừng audio ngoài ý
  muốn.
- I2S init failure chuyển sang degraded/retry state thay vì infinite loop.
- Offline chỉ lưu bounded event/telemetry queue; không tuyên bố 2GB audio offline
  nếu chưa có storage phần cứng.

### OTA

- Chỉ HTTPS có CA validation.
- SHA-256 là bắt buộc.
- Firmware artifact có chữ ký bất đối xứng và public key pin trong firmware.
- Kiểm tra hardware target, partition, version, minimum protocol và chống
  downgrade.
- Dùng A/B/rollback-capable partition, boot health confirmation và tự rollback
  khi firmware mới không heartbeat.
- OTA failure phải khôi phục audio/network state hoặc reboot an toàn.
- Thành công chỉ được xác nhận khi thiết bị reconnect với firmware version mới.
- LAN ArduinoOTA tiếp tục là development-only.

## 10. Trình tự triển khai bổ sung và release train

### Phase 0 — Bảo toàn và baseline

- Giữ toàn bộ quy tắc worktree sạch của kế hoạch cũ.
- Chốt canonical modules và loại duplicate khỏi phạm vi.
- Chụp baseline route/screen/contract/build.
- Tạo bug ledger P0/P1/P2 và impact matrix cho từng feature.
- Không chỉnh code UI trước khi biết control nào đang giả hoặc thiếu
  backend/device support.

### Phase 1 — Contract và security foundation

- Versioned HTTP/WSS/device schema.
- Chuẩn ID, enum, error và command state.
- Sửa WSS authentication, secret, revoke và cross-device audio contamination.
- Thêm contract fixture và device simulator.
- Đây là blocker trước khi bật device control mới trên Web/App.

### Phase 2 — Hai UI foundation chạy song song

Web track:

- Giữ nguyên brand package, Web primitives, CSS consolidation và
  Public/Auth/Portal/Admin migration của kế hoạch cũ.

Android track:

- `ShcareMobileTheme`, resources, component native, ViewModel/UiState, typed
  navigation, state components và adaptive shell.
- Không dùng hoặc port Web component sang Compose.

### Phase 3 — Identity, profile và security

- Web Auth/Account/Workspace.
- App Auth/Profile/Family/Workspace/Sessions/2FA.
- Backend role/membership/session contract.
- Provider-dependent phone/2FA chỉ được hiện khi runtime thật đã sẵn sàng.

### Phase 4 — Device provisioning và command

- Provision/QR claim/secure Wi‑Fi setup.
- Firmware authentication/telemetry/ACK.
- Admin device inventory/command/OTA status.
- Portal device state.
- App mobile pairing/reconnect UX.
- Chỉ đóng slice sau simulator test và physical hardware proof; nếu chưa có board
  phải ghi `blocked`.

### Phase 5 — Scan, audio, record và review

- Per-device scan binding và protocol v2.
- Portal WebSocket live.
- App guided scan, audio lifecycle, waveform và record playback.
- Firmware DSP/audio transport.
- Review/alert backend và clinical-safe copy.

### Phase 6 — Appointment, consent, alert và notification

- Portal appointment/staff/consent/alert.
- App appointment, consent, alert và notification.
- FCM channel/deep link và field-level preference.
- Admin notification persistence.
- Consent actor/audit/expiry/revoke.

### Phase 7 — Admin operation và remaining functions

- Patients, doctors, devices, packages, storage, audit, export, settings.
- Loại mọi fake count, toast-only mutation và unsupported claim.
- Billing vẫn là summary thủ công.

### Phase 8 — Release candidate, deploy và rollback

- Build từ clean candidate SHA.
- Backend deploy backward-compatible trước.
- Device/protocol feature dùng feature flag.
- Firmware canary trước; sau health confirmation mới mở rộng fleet.
- Admin preview → live, sau đó Web/Portal preview → live như kế hoạch cũ.
- Android build/version/signing cùng release train; internal/device smoke trước
  production distribution.
- Chỉ bật feature khi backend, client và minimum firmware version đều tương
  thích.
- UI-only change không buộc phát hành firmware, nhưng phải có compatibility
  verdict rõ ràng.

## 11. Kiểm thử và tiêu chí nghiệm thu mở rộng

### Backend

- `npm.cmd run check`
- `npm.cmd test`
- `npm.cmd run smoke:klt-contract`
- `npm.cmd run smoke:workspace-access`
- `npm.cmd run smoke:repositories`
- Theo phạm vi: storage, notification push, Postgres và production readiness.
- Cross-tenant, role-negative, idempotency, command ACK, revocation và
  audio-source isolation.

### Web/Portal

- Typecheck, lint, Firebase build.
- Route contract browser sweep.
- Portal browser, mutation, accessibility và performance smoke.
- WebSocket live audio, reconnect và device-source identity.
- Light/dark/system, responsive và reduced motion.

### Admin

- Lint/build.
- Admin mutation smoke.
- Permission/direct URL matrix.
- Notification persistence, audit/export, device command state và OTA status.
- Không có success toast nếu chưa có mutation thật.

### Android

- Unit test contract, repository và ViewModel.
- Compose navigation, semantics và state test.
- Golden screenshot ở light/dark, 360/412/600/840dp và font 200%.
- `compileDebugKotlin`, `assembleDebug`, `testDebugUnitTest`.
- `connectedDebugAndroidTest` trên emulator/device.
- Auth, permission, back stack, offline/reconnect, pairing, scan/audio,
  appointment, FCM display/deep link và mutation thật.
- TalkBack manual pass và performance trace.
- Do AVD hiện không an toàn trên AEHD, runtime QA dùng WHPX sau restart hoặc thiết
  bị thật.

### Firmware

- PlatformIO normal và OTA build.
- Unit/golden test cho parser, command envelope, state machine, signature và
  protocol fixture.
- Device simulator test authenticated WSS, telemetry, audio và mọi command.
- Hardware-in-loop:
  - Flash và serial.
  - I2S/audio metrics.
  - Secure WSS.
  - QR/Wi‑Fi provision.
  - Command ACK.
  - Reconnect/offline.
  - OTA success và forced-failure rollback.
- Build pass không thay cho physical proof.

### Definition of Done toàn hệ thống

- Web và App đều được sửa/nâng cấp toàn diện nhưng giữ hai UI/UX riêng.
- Mọi route/screen có loading, empty, error, retry, permission và offline state
  phù hợp.
- Không còn dữ liệu mẫu hoặc chức năng giả trong production path.
- Không còn P0/P1, auth bypass, tenant leak hoặc device/audio source
  contamination.
- Workflow tương đương có contract và state đồng bộ; `N/A` phải có lý do
  actor/surface.
- Không có thông báo thành công trước xác nhận đúng cấp: backend accepted, device
  acknowledged hoặc provider delivered.
- Web/Admin/App/Firmware có version và compatibility record trong cùng release
  manifest.
- Handoff docs và `docs/khoaluan` được cập nhật bằng bằng chứng thật.
- Phần chưa có thiết bị/provider phải ghi `BLOCKED`, không được báo hoàn tất ảo.
- Thanh toán thật, chứng nhận y tế và BLE chỉ được mở thành dự án riêng khi có yêu
  cầu và điều kiện kiểm thử phù hợp.
