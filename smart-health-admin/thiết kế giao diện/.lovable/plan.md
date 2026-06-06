# Tối ưu Mobile & Tablet cho Smart Health Admin

## Hiện trạng

- `Layout.tsx` đã có sidebar 3 chế độ (drawer mobile, rail tablet, expanded desktop) + topbar mobile search → **giữ nguyên**.
- `Overview.tsx` đã responsive cơ bản → chỉ tinh chỉnh nhẹ.
- **Vấn đề chính:** 8 trang dữ liệu (Doctors, DoctorApproval, Patients, Clinics, Devices, AIMeasurements, AuditLog, Settings) hiển thị bảng HTML rộng cố định → trên mobile bị tràn/khó đọc. Dialog (Export, NotificationDetail, AccountSettings…) chưa tối ưu chiều cao mobile. Bộ lọc/toolbar xếp ngang gây vỡ layout < 640px.

## Mục tiêu

Web hiển thị mượt và dùng được tay-trái-một-ngón trên: mobile 360–430px, tablet dọc 768px, tablet ngang 1024px. Không đụng business logic, route, hay backend.

## Phạm vi thay đổi

### 1. Bảng dữ liệu (8 trang)

Bọc mọi `<table>` trong wrapper `overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0` để cuộn ngang sạch sẽ. Trên mobile (< `md`):

- Ẩn các cột phụ ít quan trọng bằng `hidden md:table-cell` (giữ tên + trạng thái + action).
- Giảm padding ô (`px-3 py-2` thay vì `px-6 py-4`), font `text-xs`.
- Cột Hành động dính phải bằng `sticky right-0 bg-card`.

### 2. Toolbar / bộ lọc

Chuyển hàng filter từ `flex` cố định sang `flex flex-col sm:flex-row gap-3`. Input search full width trên mobile. Nhóm select/dropdown gói vào `flex flex-wrap gap-2`. Nút "Thêm mới" trên mobile chuyển thành FAB tròn góc phải-dưới (`fixed bottom-4 right-4 md:static`).

### 3. Dialog (`src/components/admin/dialogs/*`)

- Mobile (< `sm`): `max-w-[100vw] h-[100dvh] rounded-none` để full-screen, body `overflow-y-auto`.
- Tablet+: giữ kích thước hiện tại.
- Footer dialog luôn `sticky bottom-0 bg-card border-t` để nút Lưu/Hủy không bị che bởi bàn phím.

### 4. Lưới KPI và card

- `grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6` cho stat cards (đã có ở Overview, áp dụng cho các trang khác).
- Card chart `min-w-0` + responsive height (`h-56 md:h-72`).

### 5. Typography & spacing toàn cục

- Tiêu đề trang: `text-lg md:text-2xl`.
- Padding main đã có `p-4 md:p-6 lg:p-8` → giữ.
- Tap target tối thiểu 40×40px cho mọi icon button (thêm `p-2`).

### 6. Tinh chỉnh `Layout.tsx`

- Topbar avatar mobile: ẩn email phụ, chỉ giữ ảnh.
- Notification popover: đã có `w-[calc(100vw-2rem)] max-w-sm` → giữ.
- Drawer width hiện 72 → giảm `w-64 max-w-[80vw]` để có khoảng tap đóng bên ngoài.

## Kỹ thuật

- Chỉ sửa file presentation trong `src/components/admin/**`.
- Dùng Tailwind breakpoints có sẵn (`sm 640 / md 768 / lg 1024 / xl 1280`).
- Không thêm dependency, không đụng `export-utils`, không đụng route/server.

## Kết quả kỳ vọng

- Mobile 390px: mọi trang không có scroll ngang ngoài ý muốn; bảng cuộn ngang chủ động, hành động luôn thấy.
- Tablet 768px: sidebar rail + layout 2 cột hợp lý, dialog vẫn dạng modal.
- Desktop ≥ 1024px: không đổi so với bản hiện tại.

Sau khi bạn duyệt, tôi sẽ triển khai theo thứ tự: bảng → dialog → toolbar → tinh chỉnh.
