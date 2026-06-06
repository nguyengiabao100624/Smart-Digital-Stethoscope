# Firebase Setup Cho Smart Health

Tài liệu này dùng Firebase cho **Auth** và **FCM**, còn dữ liệu nghiệp vụ y tế vẫn nằm ở backend/PostgreSQL. Backend sẽ verify Firebase ID token bằng Firebase Admin SDK, sau đó map `firebaseUid` vào user nội bộ.

Nguồn chính:

- https://firebase.google.com/docs/android/setup
- https://firebase.google.com/docs/auth/admin/verify-id-tokens
- https://firebase.google.com/docs/auth/admin/custom-claims

## 1. Tạo Firebase Project Trên Web

1. Vào https://console.firebase.google.com/.
2. Chọn **Add project**.
3. Nhập tên project, ví dụ `smart-health-stethoscope`.
4. Google Analytics có thể bật hoặc tắt. Với đồ án/demo có thể tắt để đơn giản.
5. Chọn **Create project** và đợi Firebase tạo xong.

## 2. Thêm Android App

1. Trong Firebase project, ở trang **Project overview**, chọn icon **Android**.
2. Android package name nhập:

```text
com.example.smart_health_android
```

3. App nickname có thể nhập `Smart Health Android`.
4. Debug SHA-1 có thể bổ sung sau. Nếu dùng Google Sign-In hoặc Dynamic Links thì cần SHA-1; email/password không bắt buộc ngay.
5. Chọn **Register app**.
6. Tải file `google-services.json`.
7. Đặt file vào:

```text
D:\Study\KLTN\smart-health-android\app\google-services.json
```

Không commit file này nếu repo public.

## 3. Bật Firebase Authentication

1. Trong Firebase Console, mở **Build > Authentication**.
2. Chọn **Get started**.
3. Vào tab **Sign-in method**.
4. Bật **Email/Password**.
5. Tạo user test ở tab **Users**, ví dụ:

```text
doctor.demo@smarthealth.local
patient.demo@smarthealth.local
```

## 4. Tạo Service Account Cho Backend

1. Vào **Project settings** bằng icon bánh răng.
2. Mở tab **Service accounts**.
3. Chọn **Generate new private key**.
4. Tải file JSON về máy, ví dụ:

```text
D:\Study\KLTN\firebase\smart-health-service-account.json
```

5. Không commit file service account này.

Backend có thể dùng file đó qua biến môi trường:

```powershell
$env:AUTH_MODE="production"
$env:ALLOW_DEMO_AUTH="false"
$env:FIREBASE_AUTH_ENABLED="true"
$env:FIREBASE_PROJECT_ID="smart-health-stethoscope"
$env:GOOGLE_APPLICATION_CREDENTIALS="D:\Study\KLTN\firebase\smart-health-service-account.json"
```

Hoặc dùng `FIREBASE_SERVICE_ACCOUNT_JSON` nếu deploy lên server có secret manager.

## 5. Set Role Bằng Custom Claims

Sau khi tạo user trong Firebase Authentication, copy `uid` của user đó. Chạy backend script:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
$env:GOOGLE_APPLICATION_CREDENTIALS="D:\Study\KLTN\firebase\smart-health-service-account.json"
$env:FIREBASE_AUTH_ENABLED="true"
npm run firebase:claims -- <firebaseUid> doctor org_default_clinic
```

Role hợp lệ:

```text
admin
doctor
patient
```

Backend vẫn lấy role/quyền chính từ DB. Custom claims chỉ giúp bootstrap user Firebase mới đúng vai trò ban đầu.

Luồng đăng ký bác sĩ trong Android:

1. App tạo Firebase account bằng Email/Password.
2. App lấy Firebase ID token.
3. Backend map user nội bộ qua `/api/v1/auth/firebase`.
4. App gửi `/api/v1/auth/role-request` với `requestedRole=doctor`, số chứng chỉ và cơ sở y tế.
5. Admin kiểm tra thông tin, rồi cấp quyền bằng custom claims.
6. Bác sĩ đăng xuất/đăng nhập lại để nhận ID token có role mới.

Với UID demo hiện tại của dự án:

```text
doctor:  sx6V0vpXCzdFEnn5MrTSiPIngyw2
patient: k5v6vTvpAuQUgXxzdX6cL58FokA3
```

Chạy nhanh bằng PowerShell:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
powershell -ExecutionPolicy Bypass -File .\scripts\setSmartHealthDemoClaims.ps1 -ServiceAccountPath "D:\Study\KLTN\firebase\smart-health-stethoscope-firebase-adminsdk-fbsvc-7dc21dbffc.json"
```

Nếu terminal báo:

```text
Firebase Admin is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS.
```

thì bạn đang thiếu **service account JSON** cho backend. File `smart-health-android/app/google-services.json` chỉ dành cho Android app, không đủ quyền để set custom claims.

## 6. Chạy Backend Với Firebase Auth

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
$env:AUTH_MODE="production"
$env:ALLOW_DEMO_AUTH="false"
$env:FIREBASE_AUTH_ENABLED="true"
$env:FIREBASE_PROJECT_ID="smart-health-stethoscope"
$env:GOOGLE_APPLICATION_CREDENTIALS="D:\Study\KLTN\firebase\smart-health-service-account.json"
$env:DATA_BACKEND="postgres"
$env:DATABASE_URL="postgresql://smart_health:smart_health_dev@localhost:5432/smart_health"
npm run migrate
npm run seed
npm start
```

Android cần gửi Firebase ID token trong header:

```http
Authorization: Bearer <firebase-id-token>
```

Endpoint kiểm tra backend đã nhận Firebase user:

```http
GET /api/v1/auth/firebase
Authorization: Bearer <firebase-id-token>
```

Kết quả trả về gồm `provider: "firebase"`, user nội bộ và auth session.
