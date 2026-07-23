const { getAiProviderAvailability } = require("./aiProvider");
const { getOtaSignerAvailability } = require("./otaManifestSigning");
const { getTwoFactorAvailability } = require("./twoFactorAuth");

function readString(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function readBool(value) {
  return String(value || "").toLowerCase() === "true";
}

function hasAnyEnv(env, names) {
  return names.some((name) => readString(env[name]));
}

function maskUrl(value) {
  const raw = readString(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    if (url.username) url.username = "***";
    if (url.password) url.password = "***";
    return url.toString();
  } catch {
    return raw.replace(/\/\/([^:@/]+):([^@/]+)@/, "//***:***@");
  }
}

function isLikelyLocalHost(hostname = "") {
  const host = String(hostname || "").toLowerCase();
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host === "10.0.2.2" ||
    host.endsWith(".local") ||
    /^192\.168\./.test(host) ||
    /^10\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
  );
}

function inspectUrl(value) {
  const raw = readString(value);
  if (!raw) return { present: false, raw: "" };
  try {
    const url = new URL(raw);
    return {
      present: true,
      valid: true,
      protocol: url.protocol.replace(":", ""),
      hostname: url.hostname,
      isHttps: url.protocol === "https:",
      isLocal: isLikelyLocalHost(url.hostname),
      display: maskUrl(raw),
    };
  } catch {
    return { present: true, valid: false, raw, display: maskUrl(raw) };
  }
}

function readOriginList(value) {
  return readString(value)
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function createItem(items, input) {
  const required = Boolean(input.required);
  const item = {
    id: input.id,
    group: input.group,
    label: input.label,
    status: input.status,
    required,
    detail: input.detail || "",
    env: input.env || [],
    setup: input.setup || "",
  };
  items.push(item);
  return item;
}

function statusFromBoolean(ok, required = true) {
  if (ok) return "pass";
  return required ? "fail" : "warn";
}

function buildProductionReadiness(env = process.env) {
  const items = [];
  const authMode = readString(env.AUTH_MODE, "demo").toLowerCase();
  const dataBackend = readString(env.DATA_BACKEND, env.DATABASE_URL ? "postgres" : "json").toLowerCase();
  const storageProvider = readString(env.OBJECT_STORAGE_PROVIDER, "local").toLowerCase();
  const publicBackendUrl =
    readString(env.PUBLIC_BACKEND_URL) ||
    readString(env.SMART_HEALTH_PUBLIC_URL) ||
    readString(env.PUBLIC_API_BASE_URL).replace(/\/api(?:\/v1)?\/?$/, "");
  const publicUrl = inspectUrl(publicBackendUrl);
  const corsOrigin = readString(env.CORS_ORIGIN);
  const corsOrigins = corsOrigin && corsOrigin !== "*" ? readOriginList(corsOrigin) : [];
  const corsUrls = corsOrigins.map(inspectUrl);
  const corsReady =
    corsOrigins.length > 0 && corsUrls.every((item) => item.valid && item.isHttps && !item.isLocal);
  const databaseUrl = readString(env.DATABASE_URL);
  const databaseDisplay = maskUrl(databaseUrl);
  const s3Endpoint = inspectUrl(env.S3_ENDPOINT);
  const mqttUrl = inspectUrl(env.MQTT_URL);
  const aiProviderAvailability = getAiProviderAvailability({ ...env, NODE_ENV: "production" });
  const aiProviderEndpoint = inspectUrl(env.AI_PROVIDER_ENDPOINT);
  const aiProviderName = aiProviderAvailability.provider;
  const aiProviderModel = readString(env.AI_PROVIDER_MODEL);
  const aiProviderHasCredential = Boolean(readString(env.AI_PROVIDER_API_KEY));
  const aiProviderReady = Boolean(
    aiProviderAvailability.available &&
      aiProviderEndpoint.valid &&
      aiProviderEndpoint.isHttps &&
      !aiProviderEndpoint.isLocal,
  );
  const aiProviderPartiallyConfigured = Boolean(
    aiProviderEndpoint.present || aiProviderHasCredential || aiProviderModel,
  );
  const twoFactorAvailability = getTwoFactorAvailability(env);
  const otaSignerAvailability = getOtaSignerAvailability(env);
  const emailProvider = readString(env.EMAIL_PROVIDER || env.OUTBOUND_EMAIL_PROVIDER).toLowerCase();
  const brevoReady = ["BREVO_API_KEY", "BREVO_FROM_EMAIL"].every((key) => readString(env[key]));
  const smtpReady = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"].every((key) =>
    readString(env[key]),
  );
  const emailReady =
    emailProvider === "brevo" || emailProvider === "brevo-api"
      ? brevoReady
      : emailProvider === "smtp" || emailProvider === "gmail" || emailProvider === "gmail-smtp"
        ? smtpReady
        : brevoReady || smtpReady;
  const emailDetail = brevoReady
    ? `Brevo API from ${readString(env.BREVO_FROM_EMAIL)}`
    : smtpReady
      ? `SMTP=${readString(env.SMTP_HOST)}:${readString(env.SMTP_PORT)} from ${readString(env.SMTP_FROM)}`
      : "Chưa cấu hình Brevo API hoặc SMTP fallback.";
  const outboundWebhookReady = Boolean(readString(env.OUTBOUND_WEBHOOK_URL));

  createItem(items, {
    id: "auth.production_mode",
    group: "identity",
    label: "Backend chạy ở chế độ production auth",
    status: statusFromBoolean(authMode === "production", true),
    required: true,
    detail:
      authMode === "production"
        ? "AUTH_MODE=production"
        : `AUTH_MODE hiện là ${authMode || "trống"}; không dùng mode demo cho bản triển khai.`,
    env: ["AUTH_MODE"],
    setup: "Đặt AUTH_MODE=production trên hosting backend.",
  });

  createItem(items, {
    id: "auth.demo_disabled",
    group: "identity",
    label: "Tắt đăng nhập password demo",
    status: statusFromBoolean(!readBool(env.ALLOW_DEMO_AUTH), true),
    required: true,
    detail: readBool(env.ALLOW_DEMO_AUTH)
      ? "ALLOW_DEMO_AUTH=true đang mở cửa đăng nhập demo."
      : "ALLOW_DEMO_AUTH không bật.",
    env: ["ALLOW_DEMO_AUTH"],
    setup: "Đặt ALLOW_DEMO_AUTH=false hoặc bỏ biến này ở production.",
  });

  createItem(items, {
    id: "firebase.admin",
    group: "identity",
    label: "Firebase Admin/service account",
    status: statusFromBoolean(
      readBool(env.FIREBASE_AUTH_ENABLED) &&
        readString(env.FIREBASE_PROJECT_ID) &&
        hasAnyEnv(env, ["GOOGLE_APPLICATION_CREDENTIALS", "FIREBASE_SERVICE_ACCOUNT_JSON"]),
      true,
    ),
    required: true,
    detail: readBool(env.FIREBASE_AUTH_ENABLED)
      ? `Firebase enabled cho project ${readString(env.FIREBASE_PROJECT_ID, "(chưa có project id)")}.`
      : "FIREBASE_AUTH_ENABLED chưa bật.",
    env: ["FIREBASE_AUTH_ENABLED", "FIREBASE_PROJECT_ID", "GOOGLE_APPLICATION_CREDENTIALS", "FIREBASE_SERVICE_ACCOUNT_JSON"],
    setup: "Tạo Firebase project, bật Authentication, tạo service account JSON và cấu hình env trên backend.",
  });

  createItem(items, {
    id: "backend.public_https",
    group: "network",
    label: "Backend public HTTPS URL",
    status: statusFromBoolean(publicUrl.valid && publicUrl.isHttps && !publicUrl.isLocal, true),
    required: true,
    detail: publicUrl.present
      ? `${publicUrl.display}${publicUrl.isLocal ? " đang là local/LAN." : ""}`
      : "Chưa có PUBLIC_BACKEND_URL/SMART_HEALTH_PUBLIC_URL.",
    env: ["PUBLIC_BACKEND_URL", "SMART_HEALTH_PUBLIC_URL", "PUBLIC_API_BASE_URL"],
    setup: "Triển khai backend lên domain HTTPS thật rồi đặt PUBLIC_BACKEND_URL=https://<api-domain>.",
  });

  createItem(items, {
    id: "network.cors",
    group: "network",
    label: "CORS giới hạn về Web Admin/Web App domain",
    status: corsReady ? "pass" : "warn",
    required: false,
    detail: corsOrigin ? `CORS_ORIGIN=${corsOrigin}` : "CORS_ORIGIN chưa cấu hình; backend sẽ dùng *.",
    env: ["CORS_ORIGIN"],
    setup: "Sau khi có Firebase Hosting domains, đặt CORS_ORIGIN=https://shcare-admin.web.app,https://shcare.web.app thay vì *.",
  });

  createItem(items, {
    id: "data.postgres",
    group: "data",
    label: "PostgreSQL là source of truth",
    status: statusFromBoolean(dataBackend === "postgres" && Boolean(databaseUrl), true),
    required: true,
    detail:
      dataBackend === "postgres" && databaseUrl
        ? `DATABASE_URL=${databaseDisplay}`
        : `DATA_BACKEND hiện là ${dataBackend}; production không dùng JSON runtime.`,
    env: ["DATA_BACKEND", "DATABASE_URL"],
    setup: "Tạo Postgres managed database, chạy migration, đặt DATA_BACKEND=postgres và DATABASE_URL.",
  });

  createItem(items, {
    id: "data.redis",
    group: "data",
    label: "Redis cho queue/realtime worker",
    status: readString(env.REDIS_URL) ? "pass" : "warn",
    required: false,
    detail: readString(env.REDIS_URL) ? `REDIS_URL=${maskUrl(env.REDIS_URL)}` : "Chưa có REDIS_URL; worker/queue chạy fallback.",
    env: ["REDIS_URL"],
    setup: "Tạo Redis managed instance nếu cần AI/audio queue nhiều instance.",
  });

  createItem(items, {
    id: "ai.provider",
    group: "ai",
    label: "AI chat provider thật",
    status: aiProviderReady ? "pass" : "warn",
    required: false,
    detail: aiProviderReady
      ? `${aiProviderName} đã cấu hình qua HTTPS với model ${aiProviderModel}.`
      : aiProviderPartiallyConfigured
        ? "Cấu hình AI provider chưa đủ hoặc endpoint chưa đạt HTTPS production; AI chat sẽ fail closed."
        : "Chưa cấu hình AI provider; AI chat báo unavailable và không tạo phản hồi cục bộ.",
    env: ["AI_PROVIDER_NAME", "AI_PROVIDER_ENDPOINT", "AI_PROVIDER_API_KEY", "AI_PROVIDER_MODEL", "AI_PROVIDER_TIMEOUT_MS"],
    setup: "Đặt endpoint HTTPS OpenAI-compatible, credential trong secret manager, model và timeout hữu hạn.",
  });

  createItem(items, {
    id: "security.two_factor_encryption",
    group: "security",
    label: "Mã hóa bí mật TOTP",
    status: twoFactorAvailability.available ? "pass" : "warn",
    required: false,
    detail: twoFactorAvailability.available
      ? "TOTP dùng khóa mã hóa 32 byte hợp lệ; khóa và recovery code không xuất hiện trong báo cáo."
      : twoFactorAvailability.reason === "invalid_encryption_key"
        ? "TWO_FACTOR_ENCRYPTION_KEY không hợp lệ; 2FA fail closed."
        : "Chưa có TWO_FACTOR_ENCRYPTION_KEY; 2FA báo unavailable và không cho enrollment/challenge giả.",
    env: ["TWO_FACTOR_ENCRYPTION_KEY", "TWO_FACTOR_CHALLENGE_TTL_MS", "TWO_FACTOR_DISABLE_LOCK_MS"],
    setup: "Đặt TWO_FACTOR_ENCRYPTION_KEY là đúng 32 byte dạng hex hoặc base64 trong secret manager.",
  });

  createItem(items, {
    id: "storage.s3",
    group: "storage",
    label: "Object storage S3/R2 cho audio, avatar, firmware",
    status: statusFromBoolean(
      storageProvider === "s3" &&
        readString(env.OBJECT_STORAGE_BUCKET) &&
        readString(env.S3_ACCESS_KEY_ID) &&
        readString(env.S3_SECRET_ACCESS_KEY),
      true,
    ),
    required: true,
    detail:
      storageProvider === "s3"
        ? `Bucket=${readString(env.OBJECT_STORAGE_BUCKET, "(chưa có bucket)")}; endpoint=${s3Endpoint.display || "AWS default"}`
        : `OBJECT_STORAGE_PROVIDER=${storageProvider}; production không dùng local object storage.`,
    env: ["OBJECT_STORAGE_PROVIDER", "OBJECT_STORAGE_BUCKET", "S3_ENDPOINT", "S3_REGION", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"],
    setup: "Tạo bucket S3-compatible như Cloudflare R2/S3, cấp access key, đặt OBJECT_STORAGE_PROVIDER=s3.",
  });

  createItem(items, {
    id: "storage.https_endpoint",
    group: "storage",
    label: "Storage endpoint dùng HTTPS",
    status: !s3Endpoint.present || (s3Endpoint.valid && s3Endpoint.isHttps && !s3Endpoint.isLocal) ? "pass" : "warn",
    required: false,
    detail: s3Endpoint.present ? s3Endpoint.display : "Không đặt S3_ENDPOINT; dùng endpoint mặc định của provider.",
    env: ["S3_ENDPOINT"],
    setup: "Nếu dùng R2/S3 public provider, dùng endpoint HTTPS. HTTP MinIO chỉ phù hợp nội bộ.",
  });

  createItem(items, {
    id: "security.phi_encryption",
    group: "security",
    label: "Mã hóa dữ liệu nhạy cảm",
    status: statusFromBoolean(Boolean(readString(env.PHI_ENCRYPTION_KEY)), true),
    required: true,
    detail: readString(env.PHI_ENCRYPTION_KEY)
      ? "PHI_ENCRYPTION_KEY đã cấu hình."
      : "Chưa có PHI_ENCRYPTION_KEY; dữ liệu nhạy cảm có thể không được mã hóa.",
    env: ["PHI_ENCRYPTION_KEY"],
    setup: "Tạo secret 32 byte hoặc chuỗi hex 64 ký tự và lưu trong secret manager của hosting.",
  });

  createItem(items, {
    id: "security.rate_limit",
    group: "security",
    label: "Rate limit API",
    status: Number(env.RATE_LIMIT_PER_MINUTE || 300) > 0 ? "pass" : "warn",
    required: false,
    detail: `RATE_LIMIT_PER_MINUTE=${env.RATE_LIMIT_PER_MINUTE || "300 mặc định"}`,
    env: ["RATE_LIMIT_PER_MINUTE"],
    setup: "Giữ rate limit bật; thêm WAF/CDN nếu backend public.",
  });

  createItem(items, {
    id: "email.outbound",
    group: "outbound",
    label: "Email outbound Brevo API / SMTP fallback",
    status: emailReady ? "pass" : "warn",
    required: false,
    detail: emailDetail,
    env: [
      "EMAIL_PROVIDER",
      "BREVO_API_KEY",
      "BREVO_FROM_EMAIL",
      "BREVO_FROM_NAME",
      "SMTP_HOST",
      "SMTP_PORT",
      "SMTP_USER",
      "SMTP_PASS",
      "SMTP_FROM",
    ],
    setup:
      "Render Free bị chặn SMTP 25/465/587, nên ưu tiên Brevo API qua HTTPS. SMTP/Gmail chỉ dùng làm fallback khi hosting cho phép SMTP.",
  });

  createItem(items, {
    id: "outbound.webhook",
    group: "outbound",
    label: "Webhook SMS/Zalo",
    status: outboundWebhookReady ? "pass" : "warn",
    required: false,
    detail: outboundWebhookReady
      ? `Webhook=${maskUrl(env.OUTBOUND_WEBHOOK_URL)}`
      : "Chưa có OUTBOUND_WEBHOOK_URL; SMS/Zalo sẽ không gửi thật.",
    env: ["OUTBOUND_WEBHOOK_URL", "OUTBOUND_WEBHOOK_SECRET"],
    setup: "Tạo webhook trung gian hoặc provider SMS/Zalo OA, đặt URL/secret rồi dùng Settings > Test SMS/Zalo.",
  });

  createItem(items, {
    id: "mqtt.control",
    group: "device",
    label: "MQTT/TLS control plane",
    status: readString(env.MQTT_URL) ? (mqttUrl.valid && mqttUrl.protocol === "mqtts" ? "pass" : "warn") : "warn",
    required: false,
    detail: readString(env.MQTT_URL)
      ? `${maskUrl(env.MQTT_URL)}${mqttUrl.protocol !== "mqtts" ? " - nên dùng mqtts:// khi triển khai." : ""}`
      : "Chưa có MQTT_URL; backend vẫn dùng WebSocket device control chính.",
    env: ["MQTT_URL", "MQTT_USERNAME", "MQTT_PASSWORD", "MQTT_CLIENT_ID"],
    setup: "Tạo MQTT broker có TLS nếu muốn tách control plane khỏi WebSocket backend.",
  });

  createItem(items, {
    id: "firmware.ota_url",
    group: "device",
    label: "Cloud OTA URL cho ESP",
    status: statusFromBoolean(publicUrl.valid && publicUrl.isHttps && !publicUrl.isLocal, true),
    required: true,
    detail: publicUrl.present
      ? "Backend có public URL để tạo OTA firmware link cho ESP."
      : "Chưa có public backend URL; OTA token URL có thể rơi về host local.",
    env: ["PUBLIC_BACKEND_URL", "SMART_HEALTH_PUBLIC_URL"],
    setup: "Dùng cùng HTTPS API domain cho Web Admin, Android và ESP cloud OTA.",
  });

  createItem(items, {
    id: "firmware.signing",
    group: "device",
    label: "Backend OTA signing key",
    status: statusFromBoolean(otaSignerAvailability.available, true),
    required: true,
    detail: otaSignerAvailability.available
      ? `OTA manifest signer sẵn sàng (${otaSignerAvailability.keyType}).`
      : otaSignerAvailability.code === "OTA_SIGNER_INVALID"
        ? "OTA_SIGNING_PRIVATE_KEY_PEM không phải private key hợp lệ; OTA production bị khóa."
        : "Chưa có OTA_SIGNING_PRIVATE_KEY_PEM; OTA production bị khóa.",
    env: ["OTA_SIGNING_PRIVATE_KEY_PEM"],
    setup: "Cấu hình private key OTA ở secret manager của backend; không ghi key vào repository hoặc client.",
  });

  createItem(items, {
    id: "clients.web_admin",
    group: "clients",
    label: "Web Admin dùng HTTPS backend",
    status: "manual",
    required: false,
    detail: "Backend không đọc được env build của Web Admin. Dùng npm run build:product để kiểm tra.",
    env: ["VITE_SMART_HEALTH_BASE_URL", "VITE_SMART_HEALTH_API_BASE_URL"],
    setup: "Trong web admin, đặt VITE_* trỏ tới HTTPS backend thật rồi chạy npm run build:product.",
  });

  createItem(items, {
    id: "clients.android",
    group: "clients",
    label: "Android release dùng HTTPS backend",
    status: "manual",
    required: false,
    detail: "Backend không đọc được Gradle property của Android. Release build đã có guard.",
    env: ["SMART_HEALTH_BASE_URL", "google-services.json"],
    setup: "Build Android release với -PSMART_HEALTH_BASE_URL=https://<api-domain> và google-services.json đúng Firebase app.",
  });

  const counts = items.reduce(
    (acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    },
    { pass: 0, warn: 0, fail: 0, manual: 0 },
  );
  const requiredFailures = items.filter((item) => item.required && item.status === "fail");

  return {
    ok: requiredFailures.length === 0,
    generatedAt: new Date().toISOString(),
    environment: {
      nodeEnv: readString(env.NODE_ENV, "development"),
      authMode,
      dataBackend,
      storageProvider,
      publicBackendUrl: publicUrl.display || "",
    },
    counts,
    requiredFailures: requiredFailures.map((item) => item.id),
    items,
  };
}

function formatProductionReadiness(readiness) {
  const lines = [
    `Smart Health production readiness: ${readiness.ok ? "PASS" : "BLOCKED"}`,
    `Generated: ${readiness.generatedAt}`,
    `Counts: pass=${readiness.counts.pass || 0}, warn=${readiness.counts.warn || 0}, fail=${readiness.counts.fail || 0}, manual=${readiness.counts.manual || 0}`,
    "",
  ];
  for (const item of readiness.items) {
    const prefix =
      item.status === "pass" ? "[PASS]" : item.status === "fail" ? "[FAIL]" : item.status === "manual" ? "[MANUAL]" : "[WARN]";
    lines.push(`${prefix} ${item.label}`);
    lines.push(`  ${item.detail}`);
    if (item.env.length) lines.push(`  Env: ${item.env.join(", ")}`);
    if (item.status !== "pass" && item.setup) lines.push(`  Setup: ${item.setup}`);
    lines.push("");
  }
  return lines.join("\n");
}

module.exports = {
  buildProductionReadiness,
  formatProductionReadiness,
};
