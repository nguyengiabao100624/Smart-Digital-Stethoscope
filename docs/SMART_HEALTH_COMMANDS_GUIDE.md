# Smart Health - Commands Guide

Last updated: 2026-06-06

This file contains the commands future new chats should use instead of rediscovering how to run the project. Update it whenever commands, ports, env vars, scripts, or verification steps change. Keeping this file current reduces quota/token usage in new chats because the assistant can read this guide instead of scanning package files and scripts first.

All commands are for Windows PowerShell unless noted.

## 1. Backend - `web-monitor`

Working directory:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
```

Run local backend with Firebase auth and JSON demo state:

```powershell
$env:AUTH_MODE="production"
$env:FIREBASE_AUTH_ENABLED="true"
$env:FIREBASE_PROJECT_ID="smart-health-stethoscope"
$env:GOOGLE_APPLICATION_CREDENTIALS="D:\Study\KLTN\firebase\smart-health-stethoscope-firebase-adminsdk-fbsvc-7dc21dbffc.json"
$env:DATA_BACKEND="json"
npm start
```

If admin web login shows `Phiên đăng nhập Firebase không hợp lệ hoặc đã hết hạn`, check the backend was started with the Firebase env above. Also verify the JSON demo user email maps to the current Firebase UID. The 2026-05-26 repair set `nguyengiabao100624@gmail.com` to UID `YOPbEgWu4pfRjMsbb8X5zOFBwUx1`, and backend login now self-heals stale stored UIDs when the verified token email matches.

Backend syntax/check:

```powershell
npm run check
```

Last verified on 2026-06-06 after the cloud-device backend changes: passed.

Production readiness check:

```powershell
npm.cmd run check:production
npm.cmd run check:production:strict
```

`check:production` prints a deployment checklist and exits normally. `check:production:strict` exits nonzero if required production items are missing. In the current local/demo env it is expected to report `BLOCKED` until real third-party setup is supplied.

Platform-only readiness API used by Web Admin Settings > `Triển khai`:

```text
GET /api/v1/settings/production-readiness
```

Third-party setup guide:

```text
D:\Study\KLTN\docs\SMART_HEALTH_THIRD_PARTY_SETUP.md
```

Workspace/RBAC HTTP smoke test with real temporary accounts:

```powershell
npm run smoke:workspace-access
```

This seeds `.test-data/workspace-access`, starts a temporary backend on port `3432`, logs in `platform_admin`, `workspace_admin`, `doctor`, `technician`, `billing`, and `viewer`, then verifies workspace scoping, storage share/delete, export download, package edit denial, and technician device pairing.

Last verified on 2026-06-06 after the cloud-device backend changes: passed. A separate 2026-06-05 runtime smoke on temporary ports `PORT=3450` and `AUDIO_UDP_PORT=3451` also passed `/api/health`, WebSocket `/app`, and UDP audio packet checks.

Doctor signup catalog smoke after restarting backend. `/api/catalog/clinics` includes admin-created active clinics plus the built-in hospital catalog used by Android signup search:

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:3000/api/catalog/clinics
Invoke-WebRequest -UseBasicParsing http://localhost:3000/api/catalog/specialties
```

Doctor delete behavior: web admin `DELETE /api/admin/doctors/:id` requires Firebase Admin env when the doctor has `firebaseUid`. The backend deletes the Firebase Auth user first, then removes backend user/session/membership/device-token/access links. If Firebase deletion fails, the API returns an error and backend data is not reported as successfully deleted.

Clinic management behavior: web admin uses `POST /api/admin/clinics` to create, `PATCH /api/admin/clinics/:id` to edit or toggle `status=inactive|active`, and `DELETE /api/admin/clinics/:id` to delete. Delete is rejected while the clinic still has doctors, patients, or devices.

Workspace/package behavior: new code should treat `organizationId` as `workspaceId` while keeping old route compatibility. `GET /api/admin/workspaces` returns the same workspace list as `GET /api/admin/clinics`, including `workspaceType`, usage, quota, package, and subscription fields. Service package CRUD is available through `GET|POST /api/admin/packages`, `PATCH|DELETE /api/admin/packages/:id`, and assignment through `POST /api/admin/workspaces/:id/package`.

Workspace smoke examples:

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:3000/api/admin/workspaces
Invoke-WebRequest -UseBasicParsing http://localhost:3000/api/admin/packages
```

Cloud device API shape:

- `POST /api/v1/devices/:id/commands` sends backend-mediated commands such as `restart`, `wifi.status`, `device.lock`, `device.revoke`, or future control messages.
- `POST /api/v1/devices/:id/ota` creates a cloud OTA command. Body can include either `firmwareVersion`, `url`/`downloadUrl`, and optional SHA-256 `checksum`, or `firmwareFileId` for a `.bin` uploaded to bucket `device-firmware`.
- When `firmwareFileId` is used, backend creates `/api/v1/devices/:id/ota/:otaId/firmware?token=...` for the ESP. The tokenized URL is intentionally hidden from normal device API responses.
- `GET /api/v1/devices/:id/events` returns recent heartbeat, command, OTA, disconnect, and error events.
- The ESP connection is outbound to backend WebSocket/WSS. The web/app does not need to be on the same WiFi/LAN as the ESP.

If `npm run check` is unavailable or broken, fall back to:

```powershell
node --check server.js
Get-ChildItem .\src -Filter *.js | ForEach-Object { node --check $_.FullName }
```

Useful smoke commands if scripts exist in current checkout:

```powershell
npm run smoke:storage
npm run smoke:api-production
npm run smoke:workspace-access
npm run smoke:postgres
npm run smoke:mqtt
```

Do not assume these smoke scripts exist; check `package.json` first.

`npm run smoke:storage` passed on 2026-06-06 after storage uploads started recording firmware SHA-256/version metadata for cloud OTA.

## 2. Web Admin

Working directory:

```powershell
cd "D:\Study\KLTN\smart-health-admin\thiết kế giao diện"
```

Run against production/Firebase backend config:

```powershell
npm run dev:prod -- --host 127.0.0.1 --port 5174
```

Build check:

```powershell
npm run build
```

Last verified in this workspace on 2026-06-06 after the cloud-first Devices page rewrite, storage-backed firmware selector, and admin copy cleanup. Build passed; Vite warned that some export-related chunks are larger than 500 kB. After Chrome DevTools previously found an Overview crash, `src/components/admin/Overview.tsx` was fixed by importing `Users` from `lucide-react`.

If the UI still shows stale data after frontend edits, restart Vite or hard-refresh the browser.

Device management in Web Admin:

- Use the main Web Admin Devices page, not `smarthealth-xxxxxx.local/admin`, for normal operations.
- The Devices page shows backend-derived online/offline, heartbeat, WiFi/IP/RSSI, firmware, audio, OTA status, latest command, and event timeline.
- Cloud OTA can select an uploaded `.bin` from bucket `device-firmware` to prefill firmware version/checksum, or use a manual firmware URL/checksum fallback.

## 3. Android

Working directory:

```powershell
cd D:\Study\KLTN\smart-health-android
```

Compile Kotlin:

```powershell
.\gradlew.bat :app:compileDebugKotlin
```

Last verified on 2026-06-05 for KLTN evidence and again on 2026-06-06 after Android cloud device status/live audio auth changes: passed. Gradle installed Android SDK Build-Tools 36 and Android SDK Platform 36 during the earlier evidence run.

Full assemble debug when needed:

```powershell
.\gradlew.bat :app:assembleDebug
```

Last verified on 2026-06-05 for KLTN evidence: passed. The debug APK installed and launched on emulator `Pixel_8_Pro_2`; screenshots were saved under `D:\Study\KLTN\docs\report-evidence\2026-06-05\screenshots\android`.

Emulator install/launch/screenshot evidence pattern used on 2026-06-05:

```powershell
$adb="C:\Users\baobe\AppData\Local\Android\Sdk\platform-tools\adb.exe"
$apk="D:\Study\KLTN\smart-health-android\app\build\outputs\apk\debug\app-debug.apk"
& $adb install -r $apk
& $adb shell am start -n com.example.smart_health_android/.MainActivity
& $adb shell screencap -p /sdcard/smart-health-launch.png
& $adb pull /sdcard/smart-health-launch.png "D:\Study\KLTN\docs\report-evidence\2026-06-05\screenshots\android\01-android-launch.png"
```

Use Android Studio/emulator/device for end-to-end login and doctor approval flow.

## 4. Firmware - MSM261S4030H0

Working directory:

```powershell
cd D:\Study\KLTN\smart-health-embedded\MSM261S4030H0
```

PlatformIO path on this machine:

```powershell
C:\Users\baobe\.platformio\penv\Scripts\platformio.exe
```

Build default firmware:

```powershell
C:\Users\baobe\.platformio\penv\Scripts\platformio.exe run
```

Build both normal and OTA PlatformIO environments:

```powershell
C:\Users\baobe\.platformio\penv\Scripts\platformio.exe run -e esp32-s3-devkitm-1
C:\Users\baobe\.platformio\penv\Scripts\platformio.exe run -e esp32-s3-ota
```

Last verified on 2026-06-06 after cloud-first firmware changes: both environments passed. Approximate result for the current build was RAM 15.7%, flash 29.7%.

Upload when board is on the configured COM port:

```powershell
C:\Users\baobe\.platformio\penv\Scripts\platformio.exe run --target upload
```

Monitor:

```powershell
C:\Users\baobe\.platformio\penv\Scripts\platformio.exe device monitor
```

Device discovery check:

```powershell
C:\Users\baobe\.platformio\penv\Scripts\platformio.exe device list
```

On 2026-06-05 this only detected COM3/COM4 Bluetooth serial links. COM6/ESP32-S3 was not detected, so physical upload/serial monitor evidence was not captured in that evidence set.

Cloud-first firmware configuration:

- First wired flash is still required at least once unless the device already has a working firmware and credentials.
- Provide WiFi/backend/device values through local build flags or NVS/runtime config. Do not commit real WiFi passwords, backend secrets, or device secrets.
- Relevant build flags in `MSM261S4030H0\platformio.ini`:
  - `SMART_HEALTH_WIFI_SSID`
  - `SMART_HEALTH_WIFI_PASS`
  - `SMART_HEALTH_BACKEND_HOST`
  - `SMART_HEALTH_BACKEND_PORT`
  - `SMART_HEALTH_BACKEND_TLS`
  - `SMART_HEALTH_DEVICE_ID`
  - `SMART_HEALTH_DEVICE_SECRET`
  - `SMART_HEALTH_FIRMWARE_VERSION`
- `SMART_HEALTH_AUDIO_HOST` and `SMART_HEALTH_AUDIO_UDP_PORT` are optional local UDP development fallback only.

Example local build flags to put temporarily in an ignored/local working copy before flashing:

```ini
build_flags =
  -DSMART_HEALTH_WIFI_SSID=\"YourWiFi\"
  -DSMART_HEALTH_WIFI_PASS=\"YourPassword\"
  -DSMART_HEALTH_BACKEND_HOST=\"api.smart-health.example.com\"
  -DSMART_HEALTH_BACKEND_PORT=443
  -DSMART_HEALTH_BACKEND_TLS=1
  -DSMART_HEALTH_DEVICE_ID=\"smarthealth-ABCDEF\"
  -DSMART_HEALTH_DEVICE_SECRET=\"device-secret-issued-by-web-admin\"
  -DSMART_HEALTH_FIRMWARE_VERSION=\"1.0.0\"
```

Local WiFi recovery portal:

- If WiFi is missing or connection fails, the ESP opens AP `SmartHealth-<suffix>`.
- Connect a phone/laptop to that AP and open `http://192.168.4.1`.
- The page only saves WiFi SSID/password. It does not expose OTA password, backend host, device secret, ownership, restart, browser firmware upload, or admin settings.
- After WiFi reconnects and the device has Internet, management returns to the main Web Admin through backend cloud.

Cloud OTA production flow:

1. Build firmware `.bin`.
2. Upload the `.bin` to Web Admin Storage bucket `device-firmware`, or host it through a HTTPS URL reachable by the ESP.
3. Backend storage upload computes SHA-256 and infers firmware version from the filename when possible. For manual URLs, compute and paste the SHA-256 checksum yourself.
4. In Web Admin Devices, select the target device and choose the uploaded firmware file, or paste manual firmware version/URL/checksum.
5. If a storage file is selected, backend creates a short-lived tokenized firmware download URL for the ESP and sends that URL through the cloud OTA command.
6. ESP receives the command through the outbound backend WebSocket/WSS connection, downloads the file, verifies SHA-256 when provided, writes OTA partition, emits OTA events, and reboots.

LAN ArduinoOTA/espota:

- This is dev-only and not the product OTA path because it requires the laptop and ESP to be on the same LAN.
- It is disabled by default.
- Enable only for internal debugging with:

```ini
build_flags =
  -DSMART_HEALTH_ENABLE_LAN_OTA=1
  -DSMART_HEALTH_OTA_PASSWORD=\"local-dev-ota-password\"
```

- Keep the real LAN OTA password out of source. For KLTN/product demo, prefer cloud OTA from Web Admin.

## 5. Firebase Admin Claims

Working directory:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
```

Set env:

```powershell
$env:FIREBASE_AUTH_ENABLED="true"
$env:FIREBASE_PROJECT_ID="smart-health-stethoscope"
$env:GOOGLE_APPLICATION_CREDENTIALS="D:\Study\KLTN\firebase\smart-health-stethoscope-firebase-adminsdk-fbsvc-7dc21dbffc.json"
```

Set custom claims:

```powershell
npm run firebase:claims -- <UID> admin org_default_clinic
npm run firebase:claims -- <UID> doctor org_default_clinic
npm run firebase:claims -- <UID> patient org_default_clinic
```

After changing claims, the user must sign out and sign in again or force refresh the Firebase ID token. Old tokens do not immediately receive new claims.

Known admin UID used during setup:

```text
fQwjTYSCBOdGU5Hd0jbC1hkaaze2
```

## 6. Local AI/MCP Tooling

Check MCP servers:

```powershell
codex mcp list
```

Expected MCP entries:

- `chrome-devtools`
- `codegraph`
- `context7`

Best-effort claude-mem check/start for new Smart Health chats:

```powershell
try { Invoke-WebRequest -UseBasicParsing http://localhost:37777 -TimeoutSec 2 | Out-Null; "claude-mem running" } catch { Start-Process -FilePath "cmd.exe" -ArgumentList @('/c','npx','claude-mem','start') -WindowStyle Hidden; "claude-mem start requested" }
```

Manual claude-mem worker start:

```powershell
npx claude-mem start
```

Open memory viewer:

```text
http://localhost:37777
```

Check Context7 login:

```powershell
npx -y ctx7 whoami
```

Use Context7 docs lookup:

```powershell
npx -y ctx7 library React "hooks and useEffect"
npx -y ctx7 docs /facebook/react "useEffect examples"
```

Use skills search/install only when needed:

```powershell
npx -y ctx7 skills search "code review"
npx -y skills find "code review"
```

Smart Health project skill location:

```text
C:\Users\baobe\.codex\skills\smart-health-project\SKILL.md
```

The old `D:\Study\KLTN\docs\.ai_skills` folder was consolidated into this global Codex skill to avoid scattering duplicated skill files across the project.

## 7. CodeGraph

CodeGraph is installed as MCP. It is best for structural code questions.

If an index is missing or stale, run from the project root:

```powershell
cd D:\Study\KLTN\smart-health-embedded
codegraph init -i
```

Do not use CodeGraph for literal string search; use `rg`.

## 8. Recommended Search Commands

Fast file search:

```powershell
rg --files
```

Find text:

```powershell
rg -n "pattern" .
```

Find likely mojibake:

```powershell
rg -n "Ã|Ä|áº|á»|â€|�" D:\Study\KLTN\smart-health-admin D:\Study\KLTN\smart-health-android D:\Study\KLTN\smart-health-embedded
```

Search route/API references:

```powershell
rg -n "/api/|api/v1|doctor-requests|notifications|storage|scans" D:\Study\KLTN\smart-health-embedded D:\Study\KLTN\smart-health-admin D:\Study\KLTN\smart-health-android
```

## 9. Context Maintenance Commands

Open/edit context docs:

```powershell
code D:\Study\KLTN\docs\SMART_HEALTH_CONTEXT_NEW_CHAT.md
code D:\Study\KLTN\docs\SMART_HEALTH_IMPLEMENTATION_STATUS.md
code D:\Study\KLTN\docs\SMART_HEALTH_PRODUCTION_BACKLOG.md
code D:\Study\KLTN\docs\SMART_HEALTH_COMMANDS_GUIDE.md
```

Quick context sanity check:

```powershell
rg -n "Last updated|Mandatory Context Maintenance|quota|token|Next Sprint|Known" D:\Study\KLTN\docs\SMART_HEALTH_*.md
```

Every code/config change that affects future work should update at least one of the context files. This is mandatory for the Smart Health project because it avoids repeated codebase scanning in future new chats.

Catalog smoke check:

```powershell
Invoke-WebRequest -UseBasicParsing http://localhost:3000/api/catalog/clinics
Invoke-WebRequest -UseBasicParsing http://localhost:3000/api/catalog/specialties
```

The backend catalog includes admin-created active clinics plus a built-in demo list of major hospitals/clinics, currently weighted toward TP.HCM for doctor signup testing.

## 10. Git Safety

Check current changes:

```powershell
git -C D:\Study\KLTN\smart-health-embedded status --short
```

Do not run destructive cleanup commands such as `git reset --hard`, `git checkout --`, or recursive deletes unless the user explicitly asks for that operation.

## 2026-06-05 Admin Basic Functions Verification Commands

PowerShell may block `npm.ps1`; use `npm.cmd` when that happens:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm.cmd run check
node --check server.js
```

```powershell
cd "D:\Study\KLTN\smart-health-admin\thiết kế giao diện"
npm.cmd run build
```

Local dev servers used for smoke:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
node server.js
```

```powershell
cd "D:\Study\KLTN\smart-health-admin\thiết kế giao diện"
npm.cmd run dev -- --host 127.0.0.1 --port 5174
```

Admin basic function audit:

```powershell
rg -n 'window\.confirm|alert\(' -S "D:\Study\KLTN\smart-health-admin\thiết kế giao diện\src"
```

Settings outbound envs expected by backend:

```powershell
$env:SMTP_HOST="smtp.gmail.com"
$env:SMTP_PORT="587"
$env:SMTP_USER="your-gmail@gmail.com"
$env:SMTP_PASS="your-gmail-app-password"
$env:SMTP_FROM="Smart Health <your-gmail@gmail.com>"
$env:OUTBOUND_WEBHOOK_URL="https://your-webhook.example/smart-health"
$env:OUTBOUND_WEBHOOK_SECRET="optional-shared-secret"
```

Smoke endpoints after backend is running:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/me
Invoke-RestMethod http://127.0.0.1:3000/api/auth/sessions
Invoke-RestMethod http://127.0.0.1:3000/api/settings
$body=@{to='demo@example.com'} | ConvertTo-Json
Invoke-RestMethod http://127.0.0.1:3000/api/settings/test-email -Method POST -ContentType 'application/json' -Body $body
$body=@{channel='sms';to='0900000000';message='Smart Health webhook test'} | ConvertTo-Json
Invoke-RestMethod http://127.0.0.1:3000/api/settings/test-outbound -Method POST -ContentType 'application/json' -Body $body
```

Expected without env/config: test email returns 400 listing missing `SMTP_*`; SMS/Zalo test returns 400 when webhook URL is missing.

## 2026-06-06 Production Readiness And Third-Party Env

Use this after deploying or configuring any real provider:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm.cmd run check
npm.cmd run check:production
```

Use strict mode in deployment/CI:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm.cmd run check:production:strict
```

Current required production env shape:

```env
AUTH_MODE=production
ALLOW_DEMO_AUTH=false
FIREBASE_AUTH_ENABLED=true
FIREBASE_PROJECT_ID=smart-health-stethoscope
GOOGLE_APPLICATION_CREDENTIALS=/run/secrets/firebase-service-account.json
DATA_BACKEND=postgres
DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<database>?sslmode=require
PUBLIC_BACKEND_URL=https://api.smart-health.example.com
PUBLIC_API_BASE_URL=https://api.smart-health.example.com/api/v1
CORS_ORIGIN=https://admin.smart-health.example.com
OBJECT_STORAGE_PROVIDER=s3
OBJECT_STORAGE_BUCKET=smart-health-production
S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_ACCESS_KEY_ID=<access-key>
S3_SECRET_ACCESS_KEY=<secret-key>
PHI_ENCRYPTION_KEY=<64-hex-character-secret>
```

Optional but recommended:

```env
REDIS_URL=rediss://:<password>@<host>:6379
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-gmail@gmail.com
SMTP_PASS=<gmail-app-password>
SMTP_FROM="Smart Health <your-gmail@gmail.com>"
OUTBOUND_WEBHOOK_URL=https://your-provider-or-relay.example.com/smart-health/outbound
OUTBOUND_WEBHOOK_SECRET=<shared-secret>
MQTT_URL=mqtts://<broker-host>:8883
MQTT_USERNAME=<username>
MQTT_PASSWORD=<password>
MQTT_CLIENT_ID=smart-health-backend
RATE_LIMIT_PER_MINUTE=300
```

Generate a `PHI_ENCRYPTION_KEY` locally:

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
[Convert]::ToHexString($bytes)
```

Web Admin production build after backend domain exists:

```powershell
cd "D:\Study\KLTN\smart-health-admin\thiết kế giao diện"
cmd.exe /c "set ""VITE_AUTH_MODE=production"" && set ""VITE_SMART_HEALTH_BASE_URL=https://api.smart-health.example.com"" && set ""VITE_SMART_HEALTH_API_BASE_URL=https://api.smart-health.example.com/api"" && npm.cmd run build:product"
```

Android release build after Firebase Android setup and backend domain exist:

```powershell
cd D:\Study\KLTN\smart-health-android
.\gradlew.bat :app:assembleRelease -PSMART_HEALTH_BASE_URL=https://api.smart-health.example.com
```

## 2026-06-06 Production Auth Smoke For Web Admin Login

When the web admin uses `VITE_AUTH_MODE=production`, start the backend with Firebase verification enabled. Do not use a demo-mode backend for login testing, because it can reject Firebase login flows or return misleading no-token demo admin data.

Run backend production/Firebase mode:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
cmd.exe /c "set ""AUTH_MODE=production"" && set ""FIREBASE_AUTH_ENABLED=true"" && set ""FIREBASE_PROJECT_ID=smart-health-stethoscope"" && set ""GOOGLE_APPLICATION_CREDENTIALS=D:\Study\KLTN\firebase\smart-health-stethoscope-firebase-adminsdk-fbsvc-7dc21dbffc.json"" && set ""DATA_BACKEND=json"" && node server.js"
```

Run web admin:

```powershell
cd "D:\Study\KLTN\smart-health-admin\thiết kế giao diện"
npm.cmd run dev:prod -- --host 127.0.0.1 --port 5174
```

Smoke expectations:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/api/health

try {
  Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000/api/me -ErrorAction Stop
} catch {
  $_.Exception.Response.StatusCode.value__
}
```

Expected: `/api/health` returns 200 and unauthenticated `/api/me` returns `401`. The backend log should include:

```text
Auth mode: production; Firebase auth: enabled
```

Browser smoke used on 2026-06-06:

- `http://127.0.0.1:5174/login` renders correct Vietnamese login text.
- Fake credentials call Firebase `accounts:signInWithPassword` and show `Email hoặc mật khẩu không đúng.`
- Real successful login still requires a valid Firebase admin account/password.
## 2026-06-06 Clinic Delete Diagnostics

Check why a workspace/clinic cannot be deleted in JSON mode:

```powershell
cd D:\Study\KLTN\smart-health-embedded
$env:PYTHONIOENCODING='utf-8'
@'
import json
from pathlib import Path
db = json.loads(Path(r"D:\Study\KLTN\smart-health-embedded\web-monitor\data\db.json").read_text(encoding="utf-8"))
clinic_id = "org_default_clinic"
for org in db.get("organizations", []):
    if org.get("id") == clinic_id:
        print("ORG", org.get("id"), org.get("name"))
        print("USERS", [(u.get("id"), u.get("role"), u.get("email"), u.get("name")) for u in db.get("users", []) if u.get("organizationId") == clinic_id])
        print("PATIENTS", [(p.get("id"), p.get("name"), p.get("ownerUserId")) for p in db.get("patients", []) if p.get("organizationId") == clinic_id])
        print("DEVICES", [(d.get("id"), d.get("name"), d.get("status")) for d in db.get("devices", []) if d.get("organizationId") == clinic_id])
'@ | python -
```

Expected current result for `Smart Health Clinic` / `org_default_clinic`: 4 linked accounts, 4 linked patients, 0 linked devices. `DELETE /api/admin/clinics/:id` should return `409 WORKSPACE_IN_USE` with details until those links are transferred or removed.

## 2026-06-06 Firebase Workspace Admin Smoke

Create or refresh a real Firebase workspace admin for local browser smoke:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
$env:FIREBASE_PROJECT_ID="smart-health-stethoscope"
$env:GOOGLE_APPLICATION_CREDENTIALS="D:\Study\KLTN\firebase\smart-health-stethoscope-firebase-adminsdk-fbsvc-7dc21dbffc.json"
$env:WORKSPACE_ADMIN_EMAIL="workspace.admin.demo@smarthealth.test"
$env:WORKSPACE_ADMIN_PASSWORD="change-this-local-demo-password"
$env:WORKSPACE_ADMIN_ORG_ID="org_workspace_demo_hospital"
$env:WORKSPACE_ADMIN_ORG_NAME="Bệnh viện Demo Workspace"
npm.cmd run firebase:create-workspace-admin
```

The script sets Firebase custom claims:

```json
{
  "role": "workspace_admin",
  "organizationId": "org_workspace_demo_hospital",
  "smartHealth": {
    "role": "workspace_admin",
    "organizationId": "org_workspace_demo_hospital"
  }
}
```

Start backend in production Firebase mode:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
cmd.exe /c "set ""AUTH_MODE=production"" && set ""FIREBASE_AUTH_ENABLED=true"" && set ""FIREBASE_PROJECT_ID=smart-health-stethoscope"" && set ""GOOGLE_APPLICATION_CREDENTIALS=D:\Study\KLTN\firebase\smart-health-stethoscope-firebase-adminsdk-fbsvc-7dc21dbffc.json"" && set ""DATA_BACKEND=json"" && node server.js"
```

Start web admin:

```powershell
cd "D:\Study\KLTN\smart-health-admin\thiết kế giao diện"
npm.cmd run dev:prod -- --host 127.0.0.1 --port 5174
```

Workspace-admin browser smoke expectations:

- Login succeeds with the Firebase workspace-admin account.
- Sidebar/topbar/dropdown show `Admin bệnh viện`, `Bệnh viện Demo Workspace`, and `Bệnh viện`.
- Visible menu excludes platform-only pages: `Gói dịch vụ`, `Phòng khám`, `Duyệt bác sĩ`, Firebase sync/admin actions.
- Direct `/packages` and `/doctor-approval` show `Không có quyền truy cập`.
- `/doctors`, `/patients`, `/devices`, `/storage`, `/settings` show only workspace-scoped data.
- `/settings` heading is `Cài đặt bệnh viện`, and `/api/settings` returns `scope.type = "workspace"`.

Fast API smoke after logging in through Firebase Web Auth should show:

- `/api/me`: `role = workspace_admin`, `currentWorkspaceId = org_workspace_demo_hospital`.
- `/api/admin/clinics`: exactly `Bệnh viện Demo Workspace`.
- `/api/admin/doctors`: exactly `Bác sĩ Demo Workspace`.
- `/api/patients`: exactly `Bệnh nhân Demo Workspace`, `doctorName = Bác sĩ Demo Workspace`.
- `/api/devices`: exactly `Ống nghe Demo Workspace`.
- `/api/admin/packages`: `403`.
- `/api/admin/doctor-requests`: `403`.

## 2026-06-06 Account/Settings Function Smoke

After starting backend in Firebase production mode and web admin on `5174`, use the Firebase workspace-admin account to verify unlocked Account/Settings functions.

Backend/API expectations:

- `GET /api/me` returns `role = workspace_admin` and `currentWorkspaceId = org_workspace_demo_hospital`.
- `PATCH /api/me` saves `notificationPreferences` and avatar fields.
- `POST /api/me/2fa` with `{ "action": "enable", "method": "app" }` returns enabled demo 2FA and recovery codes; `{ "action": "disable" }` clears it.
- `POST /api/admin/storage-files?bucket=avatars&filename=avatar-smoke.png` with raw image body returns a file with `downloadUrl`/`previewUrl`; authenticated download returns `image/png`.
- `PATCH /api/settings` saves `branding.logoFileId/logoUrl` for workspace settings.
- `POST /api/settings/backup-check` returns `backup.status = ok`.
- `POST /api/settings/api-keys`, `POST /api/settings/api-keys/:id/rotate`, and `DELETE /api/settings/api-keys/:id` create, rotate, and revoke a workspace-scoped key.
- `POST /api/settings/ai/check-update` and `POST /api/settings/ai/update` return/update local-demo AI model metadata.
- Workspace `/api/settings` must not expose any `securityPolicy.apiKeys` with `scope = platform`.

Verification commands used on 2026-06-06:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm.cmd run check
npm.cmd run smoke:workspace-access
```

```powershell
cd "D:\Study\KLTN\smart-health-admin\thiết kế giao diện"
npm.cmd run build
```

```powershell
rg -n 'window\.confirm|alert\(' -S "D:\Study\KLTN\smart-health-admin\thiết kế giao diện\src"
```

Expected `rg` result: no matches. The 2026-06-06 browser smoke screenshot for workspace Settings is:

```text
D:\Study\KLTN\docs\report-evidence\2026-06-05\screenshots\web-admin-settings-workspace-unlocked-20260606.png
```

## 2026-06-06 KLTN Product-Readiness Commands

Backend and web admin verification:

```powershell
cd D:\Study\KLTN\smart-health-embedded\web-monitor
npm.cmd run check
npm.cmd run smoke:workspace-access
```

```powershell
cd "D:\Study\KLTN\smart-health-admin\thiết kế giao diện"
npm.cmd run build
```

Web admin product build for a real backend. This must use production auth and HTTPS non-local backend URLs:

```powershell
cd "D:\Study\KLTN\smart-health-admin\thiết kế giao diện"
cmd.exe /c "set ""VITE_AUTH_MODE=production"" && set ""VITE_SMART_HEALTH_BASE_URL=https://api.smart-health.example.com"" && set ""VITE_SMART_HEALTH_API_BASE_URL=https://api.smart-health.example.com/api"" && npm.cmd run build:product"
```

Expected guard check:

```powershell
cd "D:\Study\KLTN\smart-health-admin\thiết kế giao diện"
npm.cmd run build:product
```

With the current local `.env.local`, the no-override product command should fail with `VITE_SMART_HEALTH_BASE_URL must use HTTPS for product builds`.

Android debug build for emulator/dev:

```powershell
cd D:\Study\KLTN\smart-health-android
.\gradlew.bat :app:compileDebugKotlin
```

Android release build for a real backend. This must use HTTPS and must not be localhost, `127.0.0.1`, `0.0.0.0`, or emulator `10.0.2.2`:

```powershell
cd D:\Study\KLTN\smart-health-android
.\gradlew.bat :app:assembleRelease -PSMART_HEALTH_BASE_URL=https://api.smart-health.example.com
```

Expected guard check:

```powershell
cd D:\Study\KLTN\smart-health-android
.\gradlew.bat :app:assembleRelease
```

The no-URL release command should fail with `SMART_HEALTH_BASE_URL is required for release builds`.

Firmware compile:

```powershell
cd D:\Study\KLTN\smart-health-embedded\MSM261S4030H0
& "C:\Users\baobe\.platformio\penv\Scripts\platformio.exe" run
```

Firmware OTA env compile:

```powershell
cd D:\Study\KLTN\smart-health-embedded\MSM261S4030H0
& "C:\Users\baobe\.platformio\penv\Scripts\platformio.exe" run -e esp32-s3-ota
```

Firmware flash and monitor after the ESP32-S3 board appears as a real COM port:

```powershell
cd D:\Study\KLTN\smart-health-embedded\MSM261S4030H0
& "C:\Users\baobe\.platformio\penv\Scripts\platformio.exe" device list
& "C:\Users\baobe\.platformio\penv\Scripts\platformio.exe" run --target upload --upload-port COM6
& "C:\Users\baobe\.platformio\penv\Scripts\platformio.exe" device monitor --port COM6 --baud 115200
```

Firmware setup portal behavior:

- If WiFi config is missing or WiFi cannot connect, the board starts AP `SmartHealth-<suffix>`.
- On a phone or laptop, open WiFi settings and connect to that AP.
- The recovery AP is open/no password in this KLTN slice because it only accepts WiFi SSID/password; it does not expose backend host, device secret, owner, OTA, restart, or admin settings.
- Many phones show a captive portal automatically. If not, open a browser manually and type exactly `http://192.168.4.1` (use `http`, not `https`).
- Enter only WiFi SSID/password. Save restarts the board and stores WiFi config in ESP32 NVS namespace `smart-health`.
- Backend host, device id, device secret, firmware version, ownership, and OTA are managed through build/provisioning plus the main Web Admin/backend cloud flow.

Firmware cloud operation after the first wired flash:

- If the ESP is not configured or cannot join WiFi: connect to `SmartHealth-<suffix>` and open `http://192.168.4.1`.
- If the ESP joins WiFi and has Internet/backend access, do not use a local `.local` admin page for management. Open the main Web Admin Devices page.
- Web Admin receives status from backend heartbeat/events and can send restart/revoke/lock/status/OTA commands through backend cloud.
- Realtime listening uses ESP outbound WebSocket/WSS to backend and Web Admin/app WebSocket from backend; the ESP and web/app do not need to be on the same WiFi.

Cloud OTA from Web Admin:

1. Build firmware:

```powershell
cd D:\Study\KLTN\smart-health-embedded\MSM261S4030H0
& "C:\Users\baobe\.platformio\penv\Scripts\platformio.exe" run -e esp32-s3-devkitm-1
```

2. Host/upload this file where the ESP can download it:

```text
D:\Study\KLTN\smart-health-embedded\MSM261S4030H0\.pio\build\esp32-s3-devkitm-1\firmware.bin
```

3. Compute SHA-256, then send firmware version, URL, and checksum from Web Admin Devices. The ESP downloads through HTTP/HTTPS, verifies SHA-256 when provided, writes OTA, emits OTA events, and reboots.

LAN ArduinoOTA/PlatformIO OTA is dev-only. It requires same LAN and is disabled unless `SMART_HEALTH_ENABLE_LAN_OTA=1` plus a local `SMART_HEALTH_OTA_PASSWORD` is set. Do not use this as the KLTN product OTA story.

Hardware status from the 2026-06-06 check:

```text
PlatformIO device list showed only COM3 and COM4 Bluetooth serial links. ESP32-S3/COM6 was not connected yet.
```
