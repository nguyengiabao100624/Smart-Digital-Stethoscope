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
