# Smart Health Admin Production Runbook

## 1. Firebase Web App

Create a Web app in Firebase project `smart-health-stethoscope`, then copy the Web config values into `.env.production`.

Use `.env.production.example` as the template:

```powershell
Copy-Item .env.production.example .env.production
notepad .env.production
```

Required values:

- `VITE_FIREBASE_API_KEY`
- `VITE_FIREBASE_AUTH_DOMAIN`
- `VITE_FIREBASE_PROJECT_ID`
- `VITE_FIREBASE_STORAGE_BUCKET`
- `VITE_FIREBASE_MESSAGING_SENDER_ID`
- `VITE_FIREBASE_APP_ID`

Production admin login requires Firebase Auth. The local mock account is disabled when `VITE_AUTH_MODE=production`.

## 2. Backend Production

Run the backend with PostgreSQL and Firebase ID token verification:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
docker compose up -d postgres redis minio

$env:DATABASE_URL="postgresql://smart_health:smart_health_dev@localhost:5432/smart_health"
$env:DATA_BACKEND="postgres"
$env:AUTH_MODE="production"
$env:ALLOW_DEMO_AUTH="false"
$env:FIREBASE_AUTH_ENABLED="true"
$env:FIREBASE_PROJECT_ID="smart-health-stethoscope"
$env:GOOGLE_APPLICATION_CREDENTIALS="D:\Study\KLTN\firebase\smart-health-stethoscope-firebase-adminsdk-fbsvc-7dc21dbffc.json"
$env:CORS_ORIGIN="https://admin.smarthealth.example.com"

npm run migrate
npm run seed
npm start
```

Replace `CORS_ORIGIN` with the final admin web domain. For LAN testing, use the actual admin origin such as `http://192.168.1.10:4173`.

## 3. Admin Claims

Set an admin custom claim for Firebase users that can access this dashboard:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm run firebase:claims -- <firebaseUid> admin org_default_clinic
```

Users without role `admin` will see `Tài khoản chưa có quyền quản trị.` on the admin login screen.

## 4. Build Web Admin

```powershell
cd "D:\Study\KLTN\smart-health-admin\thiết kế giao diện"
npm install
npm run build
npm run preview -- --host 0.0.0.0 --port 4173
```

Deploy the generated `dist` output to your hosting target. Keep `.env.production` out of Git.

## 5. Smoke Test

1. Open the admin web URL.
2. Log in with a Firebase user that has custom claim `role=admin`.
3. Confirm these pages load backend data:
   - Bệnh nhân
   - Thiết bị
   - Lượt đo & AI
   - Thông báo
   - Audit log
4. Confirm non-admin users cannot enter the dashboard.
