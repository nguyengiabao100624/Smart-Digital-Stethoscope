# Smart Health - Hướng Dẫn Dùng Skills Và Handoff

Last updated: 2026-07-09

## 2026-07-09 Skill Bundle Rule

For broad Smart Health work such as "complete everything", "sync the whole system", "audit all functions", or cross-repo parity, do not stop at one project skill. Use the smallest effective bundle:

- Always start with `smart-health-project`, `context-budget`, and `strategic-compact`.
- Add implementation skills for each touched surface: web/React, Android, embedded, Supabase/Postgres, backend/API, deployment, docs, or handoff.
- For UI/UX changes, load `impeccable` and `gpt-taste`, then every materially relevant UI/UX skill from the global registry.
- For auth, account, session, tenant isolation, password, or production data changes, include security-aware validation and runnable smoke evidence.
- Do not claim Smart Health is complete from navigation-only checks. Account settings, password/security flows, notification preferences, workspace settings, write paths, backend contracts, and adjacent surface parity need fresh verification.

File này dùng để chọn đúng skill khi làm Smart Health mà không phải đọc toàn bộ bộ skill mỗi lần. Quy tắc chính: chỉ mở `SKILL.md` của skill đang cần cho nhiệm vụ hiện tại, không tải hàng loạt.

Registry và thứ tự dùng canonical: `C:\Users\baobe\.codex\GLOBAL_AGENT_TOOLING.md`.

Mặc định mọi task đều có routing gate nhẹ cho toàn bộ skill/tool đã cài: tự suy luận capability phù hợp từ yêu cầu, chọn nguồn/tool rẻ nhất, rồi chỉ mở `SKILL.md` cần thiết. Trong gate này luôn áp dụng `context-budget` để giới hạn phạm vi và `strategic-compact` để quyết định có cần compact/handoff theo mốc hay không. Chỉ mở đầy đủ hai skill ECC khi task rộng, dài, nhiều repo, audit/cài tooling, hoặc context bắt đầu nặng.

## Bộ Skill Hiện Có

- Skill dự án chính: `C:\Users\baobe\.codex\skills\smart-health-project\SKILL.md`
- Thư mục skill bên thứ ba dùng chung: `C:\Users\baobe\.agents\skills`; không còn bản skill project-local trong `D:\Study\KLTN`.
- Skill global chọn lọc: 26 skill Matt Pocock hiện hành, `impeccable`, 11/13 Taste skills, `academic-research-suite`, `context-budget`, `strategic-compact`, và `agent-reach`.
- Sau khi cài skill mới bằng `npx skills@latest add ...`, nên khởi động lại Codex/new chat để hệ thống tự nhận danh sách skill mới.

## Quy Tắc Chọn Skill

| Việc cần làm | Skill nên dùng | Ghi chú |
| --- | --- | --- |
| Bất kỳ code/config Smart Health | `smart-health-project` | Luôn đọc trước vì chứa quy tắc cập nhật context, phạm vi dự án và yêu cầu final. |
| Debug lỗi thật | `diagnosing-bugs` | Dùng vòng lặp tái hiện lỗi, thu nhỏ nguyên nhân, sửa, rồi regression test. |
| QA Android/app | `test-android-apps` plugin nếu cần, kèm `diagnosing-bugs` | Ưu tiên build Gradle, ADB/emulator, UI tree, logcat. |
| QA web/admin | Chrome/Browser plugin, `build-web-apps:frontend-testing-debugging` khi cần | Không chỉ build, phải smoke giao diện nếu sửa UI quan trọng. |
| Handoff ngắn sau phiên dài | `handoff` | Chỉ dùng để tạo ghi chú tạm/compact; nguồn trạng thái chính vẫn là các file `SMART_HEALTH_*`. Không ghi secret. |
| Mọi công việc giao diện | UI/UX Skill Pool trong global registry | Luôn mở `impeccable` + `gpt-taste`, rồi mở mọi skill UI/UX phù hợp với surface: visual design, frontend implementation, accessibility, responsive, motion, Figma/image-to-code, platform UI, UI QA hoặc UI performance. Design system và yêu cầu sản phẩm có quyền ưu tiên khi quy tắc chung xung đột. |
| Style/workflow UI chuyên biệt | Mọi Taste/UI skill phù hợp | Không còn giới hạn tối đa một skill. Thêm tất cả skill phù hợp trong `redesign-existing-projects`, `image-to-code`, imagegen web/mobile, minimalist, brutalist, premium, brandkit, Stitch, output enforcement, frontend/testing, Figma, Android/iOS UI QA hoặc visual asset khi task cần. |
| Review code theo checklist | `code-reviewer` hoặc `gstack-review` | Dùng khi user yêu cầu review; findings trước, summary sau. |
| Tạo PRD/issue từ yêu cầu | `to-prd`, `to-issues` | Chỉ dùng khi cần biến yêu cầu dài thành tài liệu backlog/issue. |
| Supabase/Postgres | `supabase:supabase` hoặc `supabase:supabase-postgres-best-practices` | Dùng plugin Supabase hiện hành; bản project-local trùng đã được bỏ khỏi discovery. |
| Viết/nghiên cứu báo cáo luận văn | `academic-research-suite` | Dùng một router duy nhất cho literature review, dàn ý, viết, kiểm tra trích dẫn, peer review và revision. |
| Nghiên cứu web/YouTube/GitHub/RSS | `agent-reach` | Dùng các kênh zero-config trước; kênh cần cookie chỉ bật khi user cung cấp đăng nhập/credential. |
| Tự chọn skill/tool cho task | Global registry + guide này | Assistant phải tự map yêu cầu sang skill/tool đã cài; user không cần nhớ tên skill. Nếu nhiều skill trùng nhau, chọn cái nhỏ nhất/phù hợp nhất và không nạp hàng loạt. |
| Tối ưu context/token | `context-budget` + `strategic-compact` | Áp dụng nhẹ mặc định cho mọi task: scope trước khi đọc, compact/handoff theo mốc hợp lý. Chỉ mở full cả hai khi task rộng/dài/audit/cài tooling hoặc context-pressure cao. |

## Quyết Định Về Trùng Lặp Skill

- Không xóa skill hệ thống/plugin trong `C:\Users\baobe\.codex\skills` hoặc cache plugin vì đó là tài nguyên dùng chung.
- Không tạo lại `.ai_skills`, `.agents/skills`, hoặc `skills-lock.json` trong từng repo Smart Health. Skill bên thứ ba dùng bản user-wide ở `C:\Users\baobe\.agents\skills`.
- Bộ Matt Pocock global đã lọc bỏ deprecated/trùng/Claude-only: `design-an-interface`, `qa`, `review`, `request-refactor-plan`, `ubiquitous-language`, `git-guardrails-claude-code`, `setup-matt-pocock-skills`, và `migrate-to-shoehorn`.
- Taste global giữ 11 skill có vai trò riêng; bỏ `design-taste-frontend-v1` vì cũ và bỏ `design-taste-frontend` vì trùng trực tiếp với `gpt-taste` dành cho Codex.
- Mục tiêu tiết kiệm token là chọn đúng skill cho từng việc, không phải xóa sạch mọi skill dự phòng. Riêng UI/UX là ngoại lệ: mở base pair và mọi skill UI/UX thật sự phù hợp, không dừng ở 1-2 skill nếu task cần nhiều hơn.

Kết quả so sánh nhanh:

- `diagnosing-bugs`, `handoff`, `to-prd`, `to-issues`, `tdd`, `triage`, `codebase-design`, và `improve-codebase-architecture` hữu ích khi có nhiệm vụ đúng loại.
- Các skill writing/in-progress còn lại dùng có chọn lọc, không dùng mặc định cho code Android/firmware/backend.

## Handoff Chuẩn Cho Smart Health

Mỗi lần sửa code/config đáng kể, cập nhật tối thiểu:

- `D:\Study\KLTN\docs\SMART_HEALTH_CONTEXT_NEW_CHAT.md`
- `D:\Study\KLTN\docs\SMART_HEALTH_IMPLEMENTATION_STATUS.md`
- `D:\Study\KLTN\docs\SMART_HEALTH_PRODUCTION_BACKLOG.md`
- `D:\Study\KLTN\docs\SMART_HEALTH_COMMANDS_GUIDE.md` nếu thay đổi command, env, runbook hoặc bước verify

Handoff nên ghi:

- Đã sửa file nào và hành vi nào thay đổi.
- Đã chạy lệnh verify nào, pass/fail ra sao.
- Còn thiếu gì để báo cáo KLTN hoặc chạy thực tế.
- Có cần user tự setup secret, Firebase, Supabase, Render, SMTP, SMS/Zalo hay phần cứng không.

## Android Debug Checklist Nhanh

Khi user báo app “bấm không ra gì” hoặc “lỗi tùm lum”:

1. Tìm màn hình liên quan và kiểm tra state `enabled`, loading, empty/error state.
2. Chạy `.\gradlew.bat :app:compileDebugKotlin --console=plain`.
3. Chạy `.\gradlew.bat :app:assembleDebug --console=plain`.
4. Cài APK vào emulator bằng ADB.
5. Dùng `uiautomator dump` kiểm tra node thật sự clickable và text lỗi có xuất hiện.
6. Dùng `logcat` lọc `FATAL EXCEPTION`, `AndroidRuntime`, package app.

Không kết luận hoàn thành nếu chỉ đọc code mà chưa build hoặc smoke được đường người dùng đang báo lỗi.
