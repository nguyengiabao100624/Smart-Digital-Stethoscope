# Kế hoạch tích hợp Phase 0–7, bổ sung UI còn thiếu và phát hành Shcare

Trạng thái: **ACTIVE v4 — người dùng xác nhận `2026-08-23`**
Ngày cập nhật: `2026-08-23`

## 1. Nguyên tắc chính

- Phase 0–7 của [kế hoạch tổng thể](SHCARE_REBUILD_MASTER_PLAN.md) đã hoàn thành ở mức `source/build/local`; **không phát triển lại và không chạy lại từ đầu**.
- Lấy toàn bộ logic, API, contract, validation, RBAC, dữ liệu, Android và firmware đã hoàn thành làm nguồn chức năng cố định.
- Công việc mới là: **ghép các chức năng đó vào giao diện production hiện tại**; chức năng nào giao diện cũ chưa có thì thiết kế thêm màn/control/flow cần thiết trong đúng phong cách hiện tại.
- Chức năng đã có UI thì giữ và sửa chất lượng; chức năng chưa có UI thì bổ sung UI/UX đầy đủ; chỉ khi test chứng minh nghiệp vụ/contract thật sự còn hở mới phát triển đúng phần thiếu đó.
- Backend/database/provider chỉ được sửa khi test chứng minh có regression, contract mismatch hoặc cấu hình release chưa nối đúng; không mở lại domain đã PASS chỉ để “hoàn thiện thêm”.
- Web và Admin giữ phong cách hiện tại nhưng được sửa chữ to/nhỏ thất thường, màu xấu, contrast, spacing, responsive, accessibility và hiệu ứng chưa tốt.
- Chỉ Portal dùng màu, component, icon, state và motion gần Admin ở lớp frontend; không sao chép menu, route, quyền hoặc chức năng platform-admin. Workflow Portal được định hình riêng theo actor/capability và chức năng Phase 0–7.
- Sau khi tất cả gate xanh: tự backup, deploy production, smoke/canary và rollback lane lỗi; không chờ thêm một vòng duyệt deploy.

### Ranh giới bắt buộc cho Android

- **Giữ nguyên chức năng mới:** API/repository/domain/ViewModel, `UiState`/`UiAction`/`UiEffect`, navigation, role/capability, validation, lifecycle, offline/retry, audit, receipt backend/device và các workflow mới không được thay bằng logic cũ.
- **Phục hồi lớp UI/UX:** màu semantic, typography, spacing, card, header, icon treatment, trạng thái trực quan và motion phải kế thừa ngôn ngữ Android gốc tại commit `2e5be444` cùng prototype `smart-health-android/figma`.
- **Màn mới không có bản gốc:** giữ nguyên chức năng mới nhưng dựng bằng cùng primitive và vocabulary gốc; không tự phát minh một design system khác và không sao chép layout Web/Admin sang Compose.
- **Ngoại lệ đã chốt:** giữ logo tín hiệu Shcare hiện tại; không phục hồi dữ liệu mẫu, AI/chẩn đoán giả, Bluetooth/QR giả hoặc tuyên bố y tế chưa được hỗ trợ.
- Test source phải chặn màu light-only/hard-code và `TopAppBar` phẳng quay lại các màn đã migrate; test runtime phải giữ 48dp, semantics, light/dark và luồng chức năng thật.

## 2. Lỗi phải xử lý trong lúc ghép

- Theme `light | dark | system`, contrast, typography, mobile overflow/IME, focus và touch target.
- Menu Public: underline/dropdown có motion, dropdown đóng sau điều hướng và route cuộn đúng vị trí.
- `/quen-mat-khau`: nút gửi nhìn rõ, trạng thái API thật.
- Đăng ký mobile: cuộn tới được nút và liên kết đăng nhập.
- Admin **Lưu trữ**: kiểm tra RouteContract/menu/direct URL/RBAC/API. Có capability thì thấy menu và dữ liệu thật; không quyền vẫn 403.
- Không còn fake KPI, seeded AI/diagnosis, QR giả, nút chết, toast-only mutation hoặc success trước receipt thật.

## 3. Tiến độ mới G0–G4

### G0 — Khóa nguồn ghép

- Bảo toàn worktree, SHA và toàn bộ bằng chứng Phase 0–7.
- Khóa hai nguồn: functional RC đã hoàn thành và giao diện Live Web/Admin hiện tại.
- Phân loại từng chức năng theo `ĐÃ_CÓ_UI`, `CHƯA_CÓ_UI`, `MIXED_CẦN_GHÉP`, `REGRESSION` và `NGHIỆP_VỤ_THẬT_SỰ_CÒN_THIẾU`.
- Ghi production target/recovery reference cho Firebase, backend, database và storage.

**PASS:** có manifest nguồn ghép; không có phần Phase 0–7 nào bị mở lại vô lý.

### G1 — Ghép chức năng và bổ sung UI còn thiếu

- Dùng functional RC làm nền; giữ handler/API/state/capability/test và đưa lớp trình bày về phong cách Live tương ứng.
- Ghép Public/Auth/Portal trước, sau đó Admin; không checkout nguyên file cũ làm mất logic mới.
- Với chức năng chưa có trong giao diện cũ, thiết kế đủ entry point, màn hình/control, validation, loading/empty/error/offline/403/retry/confirm và responsive bằng component vocabulary hiện tại.
- Portal hội tụ frontend với Admin nhưng workflow theo người dùng Portal; khôi phục phần frontend của mục Lưu trữ trong Admin.
- Sửa các lỗi hình ảnh nêu ở mục 2 trong khi vẫn giữ nhận diện hiện tại.

**PASS:** mọi chức năng Phase 0–7 có UI sử dụng được trên surface phù hợp, giao diện đúng phong cách hiện tại và không còn visual regression ngoài allowlist.

### G2 — Kiểm tra mối nối và chỉ sửa regression

- Chạy route–role–state–action, direct URL, API mutation, offline/retry, tenant-negative và cleanup test.
- Browser test 360/390/768/1024/1440, light/dark/system; zero Axe serious/critical.
- Hoàn tất backend/RBAC/data/audit của Lưu trữ nếu test G1 chứng minh mối nối còn thiếu.
- Chỉ phát triển/sửa backend, migration `044–054`, provider, Android hoặc firmware khi có lỗi tái hiện hoặc workflow bắt buộc thật sự còn thiếu; bằng chứng cũ còn hiệu lực thì tái sử dụng.

**PASS:** mọi lỗi ghép đã đóng; không biến G2 thành một vòng phát triển lại hệ thống.

### G3 — Khóa release candidate và test ESP32 hai mic

- Chạy focused test theo diff rồi aggregate gate; hoàn tất Deep Security scan hiện có trước release.
- Tạo candidate SHA, artifact hash và compatibility manifest.
- Preflight model ESP, PlatformIO environment, flash/partition và chân nguồn/clock/data/LR; không tự suy diễn stereo/multiplex.
- Tự dò cổng, build/nạp firmware và test serial, Wi‑Fi/WSS, auth, reconnect, telemetry, command ACK, audio-v2, từng mic, luồng hai mic, packet loss và OTA rollback; không log secret hoặc dùng audio có PHI.
- Android chỉ build/test lại phần bị ảnh hưởng bởi mối nối/contract.

**PASS:** release candidate tái lập được; HIL có log thật cho ESP32 và hai mic; không còn P0/P1.

### G4 — Tự động phát hành và kiểm tra production

1. Backup/restore reference cho database, storage và hai Firebase site.
2. Deploy backend cùng migration/config release đã hoàn thành; xác minh version marker.
3. Deploy Admin; smoke Lưu trữ, RBAC và mutation cleanup.
4. Deploy Web/Portal; smoke Public/Auth/Portal/theme/WSS.
5. Nạp lại firmware nếu artifact thay đổi; test ESP32 + hai mic bằng workspace/device thử nghiệm với production.
6. Canary theo ngưỡng đã ghi; tự rollback riêng lane lỗi.
7. Cập nhật deploy ID, smoke ID, hash, HIL log và handoff.

**PASS:** production chạy đúng candidate mới nhất và phần cứng giao tiếp thật với production.

## 4. Chống làm lại sau khi ngắt

- Bảng tiến độ chỉ hiển thị `G0–G4`; task con không đưa lên tổng quan.
- Checkpoint ghi SHA, dirty hash, nguồn ghép, G-phase, gate vừa PASS, lỗi đang mở và bước tiếp theo.
- Khi mở lại: đọc kế hoạch gốc → bản v4 này → checkpoint → git diff; tiếp tục đúng mối nối/lỗi đang dở, không chạy lại Phase 0–7.

## 5. Cổng xác nhận

Kế hoạch đã được người dùng xác nhận. Bắt đầu tại **G0** và tự đi tiếp đến G4; mọi deploy/nạp firmware vẫn phải qua đúng gate tương ứng.

## 2026-08-24 — G3 Android legacy visual-language restoration checkpoint

- Ranh giới bất biến: giữ mọi workflow Phase 0–7/chức năng mới, repository, ViewModel, `UiState`, RBAC, validation, offline/retry và backend/device receipt; chỉ phục hồi lớp trình bày Android theo ngôn ngữ sản phẩm gốc. Chức năng mới chưa có màn cũ phải mở rộng cùng ngôn ngữ đó. Giữ logo tín hiệu Shcare hiện tại.
- Nguồn hình ảnh chuẩn là Git commit `2e5be444` và prototype `smart-health-android/figma` trong RC1. Vocabulary đã khóa: canvas sáng `#F5F7FA`, card trắng, xanh `#0B5C9A`, teal `#00A896`, viền/bóng mềm, radius 12–18dp, hierarchy gọn và motion native có mục đích. Không phục hồi Bluetooth giả, AI/chẩn đoán mẫu hoặc claim y tế chưa hỗ trợ.
- Đã phục hồi theme semantic light/dark, Splash, Login và Dashboard bệnh nhân. Dashboard dùng lại gradient/card và quick-action tile xanh/trắng/teal; logo hiện tại được giữ. App bar gradient bo đáy canonical đã phủ device management/pairing, appointment, new scan, notification, family profile, consent, security, workspace, profile, AI và các màn settings/detail dùng header chung.
- Đã tái hiện và sửa contract đăng nhập tích hợp thật: demo patient thiếu `accountStatus` rõ ràng và `publicUser` bỏ `deletedAt` khi chưa xóa. Backend giờ gửi lifecycle tường minh; Android vẫn fail-closed. Regression `releaseRuntimeContractTest.js` pass `2/2`.
- Bằng chứng: Xiaomi thật pass Firebase emulator → backend owner/lifecycle/workspace → Dashboard bệnh nhân `1/1`; Android compile/assemble/lint và JVM đầy đủ `840/840` pass. Ảnh cục bộ: `%TEMP%/shcare-restored-dashboard-v2.png`.
- Không làm lại lát cắt này sau khi mở lại. Bước G3 kế tiếp: đánh thức/mở khóa Xiaomi rồi chạy lại 5 focused Compose/runtime test độc lập, visual-check các route chức năng mới, sau đó tiếp tục gate demo ESP32 hai mic hiện hữu. Aggregate device run gần nhất không có Compose hierarchy vì `mWakefulness=Asleep` và MIUI chặn shell input; đây không phải code PASS hoặc code failure.

### 2026-08-24 — G3 Android runtime proof continuation

- Xiaomi đã thức: original-style UI runtime `4/4` pass và Firebase emulator → backend → patient Dashboard `1/1` pass. Full connected run có `78 PASS`, `0 FAIL`, `2 SKIPPED`; hai proof notification bị MIUI chặn quyền instrumentation nên vẫn mở cho emulator, không tính pass ảo.
- JVM aggregate mới là `841/841`; `lintDebug` và `assembleDebug` pass. APK debug production-default SHA-256: `91D3BC26C9CEE92A8E008A91C0CBE11660F0DC329A546DDADFE9A8F180F91186`.
- Quy tắc chống hồi quy đã phủ 19 màn chức năng mới/đã mở rộng: giữ workflow mới nhưng bắt buộc dùng header/semantic theme phong cách Android gốc. Dashboard hiển thị mã hồ sơ có nhãn và cho phép xuống dòng. G3 vẫn `in progress` cho tới khi visual route proof và hai notification proof còn mở được đóng.

### 2026-08-24 — G3 legacy Web candidate and attached-device checkpoint

- Product-source candidate đã khóa tại `f6b6e2aa4a957ccfb395ec265348950e407bbeb8`; các commit tài liệu sau đó không thay đổi binary sản phẩm.
- Giữ nguyên ranh giới giao diện đã khóa: phong cách Web/Admin cũ và logo Shcare hiện tại; chỉ sửa lỗi tương phản, theme, responsive, motion, asset/performance và thêm UI cho chức năng thật. Hero chỉ còn một video chuẩn, không còn lớp video trùng.
- Web candidate mới nhất pass Auth `390/390`, contract `137/137`, TypeScript, lint và Firebase build. Production-preview pass LCP `668ms`, CLS `0.05436187199931413`, INP dưới `16ms`, JavaScript `248111` bytes và CSS `64920` bytes.
- Xiaomi đã online, APK debug production-default được cài/mở thành công, SHA-256 `8EB49417A11D33388D3C04BB339916ED8A7E978EDD193D5F432A531ABBC159D3`. Bằng chứng aggregate hiện hành là `83` execution, `0` fail, `3` skip; hai notification proof vẫn bị chính sách MIUI chặn, không tính PASS giả.
- ESP32-S3 CH343 hiện ở COM9. Captive-portal HIL pass HTML/session binding/invalid-session denial/Wi-Fi restore; serial xác nhận hai mic hoạt động nhưng `wss=0` vì target Wi-Fi chưa được người dùng nhập qua App/Web.
- G3 vẫn `in progress`. Trước G4 phải hoàn tất target-Wi-Fi → authenticated WSS → ACK → audio-v2 → durable scan; exact-preview CORS/backend migrations/provider; và các gate signing/OTA hoặc ghi blocker không thể phát hành. G4 chưa bắt đầu và chưa có live promotion mới.

### 2026-08-25 — G3 Web preview gate

- Product binary/source đã khóa tại `6c6d79f67c6d03e464545d37bf50bd31a57312e2`; commit `b09461428818da90e34ad05641e16a329df92a03` chỉ cập nhật test. Preview riêng `https://shcare--rc2-web-6c6d79f6-fz0by6g2.web.app`, chưa promote live.
- Preview Home và Quên mật khẩu pass `102/102` kiểm tra ở mobile với `light|dark|system`. Aggregate Web pass Auth `390/390`, contracts `138/138`, TypeScript, lint, Firebase build và performance budget.
- G3 tiếp tục ở backend/provider/CORS và authenticated ESP HIL; G4 vẫn pending.

### 2026-08-25 — G3 backend CORS và ESP setup gate

- Backend CORS source đã đóng tại `4727e183d85e8368203d2f0bcd1ba9f6154105ca`: exact live/preview origin được echo, unknown origin không có ACAO; test policy + HTTP `4/4`, backend aggregate và device security `82/82` PASS. Live backend chưa deploy nên chưa tính live PASS.
- ESP32-S3 COM9 đã reset và setup AP được xác nhận đang phát. Target Wi-Fi vẫn chờ người dùng nhập qua App/Web; G3 chỉ hoàn tất sau authenticated WSS, command ACK, audio-v2, durable scan, migration/provider và signed OTA/rollback proof.
- G4 vẫn pending; không promote production trước các gate trên.

### 2026-08-25 — G3 release marker và signed-OTA foundation

- Backend đã có release ID + actual commit marker và smoke fail-closed khi deploy sai candidate. Firmware đã pin public trust anchor RSA-3072, build production/OTA PASS và production image mới đã nạp/verify qua COM9.
- Đây chưa phải OTA runtime PASS: target Wi-Fi/WSS, command/audio HIL, boot-health và forced rollback vẫn phải chạy thật. G3 tiếp tục; G4 vẫn pending.
