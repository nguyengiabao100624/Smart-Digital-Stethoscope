const crypto = require("node:crypto");
const dgram = require("node:dgram");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const nodemailer = require("nodemailer");
const { createDataStore, resolveBackendFromEnv } = require("./src/dataStore");
const { getFirebaseAdmin, isFirebaseAuthEnabled, verifyFirebaseIdToken } = require("./src/firebaseAuth");
const { processAudioFile } = require("./src/audioProcessing");
const { createAudioQueue } = require("./src/queue");
const { createRepositories } = require("./src/repositories");
const { attachActor, createRequestContext, getRequestContext } = require("./src/requestContext");
const { createMqttControlPlane } = require("./src/mqttControlPlane");
const { buildProductionReadiness } = require("./src/productionReadiness");
const { buildScanObjectKey, createStorageAdapter } = require("./src/storageAdapter");
const { encryptJson } = require("./src/cryptoPhi");

const PORT = Number(process.env.PORT || 3000);
const AUDIO_UDP_PORT = Number(process.env.AUDIO_UDP_PORT || 3001);
const SAMPLE_RATE = Number(process.env.SAMPLE_RATE || 16000);
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const HOST = "0.0.0.0";

const PUBLIC_DIR = path.join(__dirname, "public");
const INDEX_FILE = path.join(PUBLIC_DIR, "index.html");
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, "data"));
const AUDIO_DIR = path.join(DATA_DIR, "audio");
const TMP_DIR = path.join(DATA_DIR, "tmp");
const DB_FILE = path.join(DATA_DIR, "db.json");
const DATA_BACKEND = resolveBackendFromEnv(process.env);
const AUTH_MODE = String(process.env.AUTH_MODE || "demo").toLowerCase();
const FIREBASE_AUTH_ENABLED = isFirebaseAuthEnabled(process.env);
const ALLOW_DEMO_AUTH = String(process.env.ALLOW_DEMO_AUTH || "").toLowerCase() === "true";

const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 100 * 1024 * 1024);
const UDP_SOURCE_TIMEOUT_MS = 3000;
const LIVE_METRIC_INTERVAL_MS = 250;
const SPECIALTY_CATALOG = [
  { id: "general", name: "Đa khoa" },
  { id: "internal_medicine", name: "Nội tổng quát" },
  { id: "cardiology", name: "Tim mạch" },
  { id: "respiratory", name: "Hô hấp" },
  { id: "pediatrics", name: "Nhi khoa" },
  { id: "obstetrics_gynecology", name: "Sản phụ khoa" },
  { id: "surgery", name: "Ngoại tổng quát" },
  { id: "orthopedics", name: "Chấn thương chỉnh hình" },
  { id: "neurology", name: "Thần kinh" },
  { id: "neurosurgery", name: "Ngoại thần kinh" },
  { id: "gastroenterology", name: "Tiêu hóa" },
  { id: "hepatobiliary", name: "Gan mật" },
  { id: "endocrinology", name: "Nội tiết" },
  { id: "nephrology", name: "Thận - tiết niệu" },
  { id: "urology", name: "Tiết niệu" },
  { id: "oncology", name: "Ung bướu" },
  { id: "hematology", name: "Huyết học" },
  { id: "infectious_diseases", name: "Truyền nhiễm" },
  { id: "dermatology", name: "Da liễu" },
  { id: "ent", name: "Tai mũi họng" },
  { id: "ophthalmology", name: "Mắt" },
  { id: "dentistry", name: "Răng hàm mặt" },
  { id: "psychiatry", name: "Tâm thần" },
  { id: "rehabilitation", name: "Phục hồi chức năng" },
  { id: "traditional_medicine", name: "Y học cổ truyền" },
  { id: "emergency", name: "Cấp cứu" },
  { id: "icu", name: "Hồi sức tích cực" },
  { id: "family_medicine", name: "Y học gia đình" },
  { id: "radiology", name: "Chẩn đoán hình ảnh" },
  { id: "anesthesiology", name: "Gây mê hồi sức" },
];
const DEFAULT_CLINIC_CATALOG = [
  { id: "vn_hospital_cho_ray", name: "Bệnh viện Chợ Rẫy", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_thong_nhat_hcm", name: "Bệnh viện Thống Nhất", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_dhyd_hcm", name: "Bệnh viện Đại học Y Dược TP.HCM", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_nhan_dan_115", name: "Bệnh viện Nhân Dân 115", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_nhan_dan_gia_dinh", name: "Bệnh viện Nhân Dân Gia Định", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_binh_dan", name: "Bệnh viện Bình Dân", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_trung_vuong", name: "Bệnh viện Trưng Vương", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_an_binh", name: "Bệnh viện An Bình", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_nguyen_tri_phuong", name: "Bệnh viện Nguyễn Tri Phương", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_saigon_general", name: "Bệnh viện Sài Gòn", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_hung_vuong", name: "Bệnh viện Hùng Vương", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_tu_du", name: "Bệnh viện Từ Dũ", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_nhi_dong_thanh_pho", name: "Bệnh viện Nhi Đồng Thành Phố", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_nhi_dong_1", name: "Bệnh viện Nhi Đồng 1", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_nhi_dong_2", name: "Bệnh viện Nhi Đồng 2", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_ung_buou_hcm", name: "Bệnh viện Ung Bướu TP.HCM", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_tam_than_hcm", name: "Bệnh viện Tâm Thần TP.HCM", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_mat_hcm", name: "Bệnh viện Mắt TP.HCM", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_tai_mui_hong_hcm", name: "Bệnh viện Tai Mũi Họng TP.HCM", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_rang_ham_mat_tw_hcm", name: "Bệnh viện Răng Hàm Mặt Trung ương TP.HCM", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_da_lieu_hcm", name: "Bệnh viện Da Liễu TP.HCM", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_chan_thuong_chinh_hinh_hcm", name: "Bệnh viện Chấn thương Chỉnh hình TP.HCM", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_pham_ngoc_thach", name: "Bệnh viện Phạm Ngọc Thạch", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_benh_nhiet_doi_hcm", name: "Bệnh viện Bệnh Nhiệt Đới TP.HCM", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_truyen_mau_huyet_hoc", name: "Bệnh viện Truyền máu Huyết học", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_tim_tam_duc", name: "Bệnh viện Tim Tâm Đức", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_vien_tim_hcm", name: "Viện Tim TP.HCM", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_y_hoc_co_truyen_hcm", name: "Bệnh viện Y học Cổ truyền TP.HCM", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_phuc_hoi_chuc_nang_hcm", name: "Bệnh viện Phục hồi Chức năng - Điều trị Bệnh nghề nghiệp", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_quan_y_175", name: "Bệnh viện Quân y 175", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_7a", name: "Bệnh viện Quân y 7A", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_30_4", name: "Bệnh viện 30-4", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_199", name: "Bệnh viện 199", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_quoc_te_city", name: "Bệnh viện Quốc tế City", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_fv", name: "Bệnh viện FV", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_tam_anh_hcm", name: "Bệnh viện Đa khoa Tâm Anh TP.HCM", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_vinmec_central_park", name: "Bệnh viện Đa khoa Quốc tế Vinmec Central Park", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_hoan_my_sai_gon", name: "Bệnh viện Hoàn Mỹ Sài Gòn", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_columbia_asia_gia_dinh", name: "Bệnh viện Columbia Asia Gia Định", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_aih", name: "Bệnh viện Quốc tế Mỹ AIH", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_gia_an_115", name: "Bệnh viện Gia An 115", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_xuyen_a_hcm", name: "Bệnh viện Đa khoa Xuyên Á TP.HCM", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_nam_sai_gon", name: "Bệnh viện Đa khoa Nam Sài Gòn", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_van_hanh", name: "Bệnh viện Vạn Hạnh", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_an_sinh", name: "Bệnh viện An Sinh", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_trieu_an", name: "Bệnh viện Triều An", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_minh_anh", name: "Bệnh viện Đa khoa Minh Anh", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_hoan_my_thu_duc", name: "Bệnh viện Hoàn Mỹ Thủ Đức", type: "hospital", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_clinic_victoria_healthcare", name: "Phòng khám Victoria Healthcare", type: "clinic", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_clinic_careplus", name: "Phòng khám CarePlus", type: "clinic", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_clinic_jio_health", name: "Phòng khám Jio Health", type: "clinic", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_clinic_raffles_medical_hcm", name: "Phòng khám Raffles Medical TP.HCM", type: "clinic", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_clinic_family_medical_practice_hcm", name: "Phòng khám Family Medical Practice TP.HCM", type: "clinic", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_clinic_international_sos_hcm", name: "Phòng khám International SOS TP.HCM", type: "clinic", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_clinic_maple_healthcare", name: "Phòng khám Maple Healthcare", type: "clinic", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_clinic_bernard_healthcare", name: "Phòng khám Bernard Healthcare", type: "clinic", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_clinic_yersin", name: "Phòng khám Đa khoa Quốc tế Yersin", type: "clinic", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_clinic_diamond", name: "Phòng khám Đa khoa Diamond", type: "clinic", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_clinic_hanh_phuc_hcm", name: "Phòng khám Hạnh Phúc TP.HCM", type: "clinic", address: "TP. Hồ Chí Minh", status: "active" },
  { id: "vn_hospital_bach_mai", name: "Bệnh viện Bạch Mai", type: "hospital", address: "Hà Nội", status: "active" },
  { id: "vn_hospital_viet_duc", name: "Bệnh viện Hữu nghị Việt Đức", type: "hospital", address: "Hà Nội", status: "active" },
  { id: "vn_hospital_108", name: "Bệnh viện Trung ương Quân đội 108", type: "hospital", address: "Hà Nội", status: "active" },
  { id: "vn_hospital_nhi_trung_uong", name: "Bệnh viện Nhi Trung ương", type: "hospital", address: "Hà Nội", status: "active" },
  { id: "vn_hospital_tam_anh_hn", name: "Bệnh viện Đa khoa Tâm Anh Hà Nội", type: "hospital", address: "Hà Nội", status: "active" },
  { id: "vn_hospital_vinmec_times_city", name: "Bệnh viện Đa khoa Quốc tế Vinmec Times City", type: "hospital", address: "Hà Nội", status: "active" },
  { id: "vn_hospital_da_nang", name: "Bệnh viện Đà Nẵng", type: "hospital", address: "Đà Nẵng", status: "active" },
  { id: "vn_hospital_hue_central", name: "Bệnh viện Trung ương Huế", type: "hospital", address: "Thừa Thiên Huế", status: "active" },
  { id: "vn_hospital_can_tho_central", name: "Bệnh viện Đa khoa Trung ương Cần Thơ", type: "hospital", address: "Cần Thơ", status: "active" },
];
const ROLE_INFO_FIELDS = new Set(["name", "phone", "license", "clinic", "specialty", "reason"]);
const WORKSPACE_TYPES = new Set(["hospital", "clinic", "solo_practice", "personal"]);
const PACKAGE_SEGMENTS = new Set(["organization", "solo_practice", "personal"]);

function normalizeWorkspaceType(value, fallback = "clinic") {
  const raw = String(value || "").trim();
  if (WORKSPACE_TYPES.has(raw)) return raw;
  if (["general", "cardiology", "respiratory", "pediatrics", "specialist"].includes(raw)) return "clinic";
  return fallback;
}

function normalizePackageSegment(value, fallback = "organization") {
  const raw = String(value || "").trim();
  return PACKAGE_SEGMENTS.has(raw) ? raw : fallback;
}

const espClients = new Set();
const listenClients = new Set();
const udpAudioSources = new Map();
const deviceSockets = new Map();
const rateLimitBuckets = new Map();
const requestMetrics = {
  startedAt: nowIso(),
  total: 0,
  errors: 0,
  byStatus: {},
};

let dataStore = null;
let repositories = null;
let storageAdapter = null;
let audioQueue = null;
let mqttControlPlane = null;
let pendingSave = Promise.resolve();
let db = createEmptyDb();
let activeRecording = null;
let lastAudioSourceCount = 0;
let lastMetricBroadcastAt = 0;
let liveMetrics;
let liveBeatDetector;

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `${prefix}_${stamp}_${crypto.randomBytes(4).toString("hex")}`;
}

function ensureDataDirs() {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

function createEmptyDb() {
  const createdAt = nowIso();
  return {
    version: 1,
    createdAt,
    updatedAt: createdAt,
    patients: [],
    scans: [],
    users: [],
    organizations: [],
    memberships: [],
    doctorPatientAccess: [],
    idempotencyKeys: [],
    deviceClaims: [],
    sessions: [],
    authSessions: [],
    notifications: [],
    notificationDevices: [],
    accessLogs: [],
    auditLogs: [],
    devices: [],
    deviceEvents: [],
    audioFiles: [],
    aiResults: [],
    storageBuckets: [],
    storageFiles: [],
    servicePackages: [],
    subscriptions: [],
    exports: [],
    settings: createDefaultSettings(),
    chatMessages: [],
  };
}

function loadDb() {
  ensureDataDirs();

  if (!fs.existsSync(DB_FILE)) {
    const freshDb = createEmptyDb();
    fs.writeFileSync(DB_FILE, JSON.stringify(freshDb, null, 2));
    return freshDb;
  }

  try {
    const loaded = JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
    return normalizeDb(loaded);
  } catch (err) {
    const brokenFile = `${DB_FILE}.broken-${Date.now()}`;
    fs.copyFileSync(DB_FILE, brokenFile);
    console.error(`Cannot read db.json, copied broken file to ${brokenFile}`);
    return createEmptyDb();
  }
}

function normalizeDb(value) {
  const normalized = value && typeof value === "object" ? value : createEmptyDb();
  normalized.version = Number(normalized.version || 1);
  normalized.createdAt = normalized.createdAt || nowIso();
  normalized.updatedAt = normalized.updatedAt || normalized.createdAt;
  normalized.patients = Array.isArray(normalized.patients) ? normalized.patients : [];
  normalized.scans = Array.isArray(normalized.scans) ? normalized.scans : [];
  normalized.users = Array.isArray(normalized.users) ? normalized.users : [];
  normalized.organizations = Array.isArray(normalized.organizations) ? normalized.organizations : [];
  normalized.memberships = Array.isArray(normalized.memberships) ? normalized.memberships : [];
  normalized.doctorPatientAccess = Array.isArray(normalized.doctorPatientAccess) ? normalized.doctorPatientAccess : [];
  normalized.idempotencyKeys = Array.isArray(normalized.idempotencyKeys) ? normalized.idempotencyKeys : [];
  normalized.deviceClaims = Array.isArray(normalized.deviceClaims) ? normalized.deviceClaims : [];
  normalized.sessions = Array.isArray(normalized.sessions) ? normalized.sessions : [];
  normalized.authSessions = Array.isArray(normalized.authSessions) ? normalized.authSessions : [];
  normalized.notifications = Array.isArray(normalized.notifications) ? normalized.notifications : [];
  normalized.notificationDevices = Array.isArray(normalized.notificationDevices) ? normalized.notificationDevices : [];
  normalized.accessLogs = Array.isArray(normalized.accessLogs) ? normalized.accessLogs : [];
  normalized.auditLogs = Array.isArray(normalized.auditLogs) ? normalized.auditLogs : [];
  normalized.devices = Array.isArray(normalized.devices) ? normalized.devices : [];
  normalized.deviceEvents = Array.isArray(normalized.deviceEvents) ? normalized.deviceEvents : [];
  normalized.audioFiles = Array.isArray(normalized.audioFiles) ? normalized.audioFiles : [];
  normalized.aiResults = Array.isArray(normalized.aiResults) ? normalized.aiResults : [];
  normalized.storageBuckets = Array.isArray(normalized.storageBuckets) ? normalized.storageBuckets : [];
  normalized.storageFiles = Array.isArray(normalized.storageFiles) ? normalized.storageFiles : [];
  normalized.servicePackages = Array.isArray(normalized.servicePackages) ? normalized.servicePackages : [];
  normalized.subscriptions = Array.isArray(normalized.subscriptions) ? normalized.subscriptions : [];
  normalized.exports = Array.isArray(normalized.exports) ? normalized.exports : [];
  normalized.settings = {
    ...createDefaultSettings(),
    ...(normalized.settings && typeof normalized.settings === "object" ? normalized.settings : {}),
  };
  normalized.settings.notifications = {
    ...createDefaultSettings().notifications,
    ...(normalized.settings.notifications || {}),
  };
  normalized.settings.privacy = {
    ...createDefaultSettings().privacy,
    ...(normalized.settings.privacy || {}),
  };
  normalized.settings.dataAccess = {
    ...createDefaultSettings().dataAccess,
    ...(normalized.settings.dataAccess || {}),
  };
  normalized.settings.storage = {
    ...createDefaultSettings().storage,
    ...(normalized.settings.storage || {}),
  };
  normalized.settings.stethoscope = {
    ...createDefaultSettings().stethoscope,
    ...(normalized.settings.stethoscope || {}),
  };
  normalized.settings.ai = {
    ...createDefaultSettings().ai,
    ...(normalized.settings.ai || {}),
  };
  normalized.settings.system = {
    ...createDefaultSettings().system,
    ...(normalized.settings.system || {}),
  };
  normalized.settings.branding = {
    ...createDefaultSettings().branding,
    ...(normalized.settings.branding || {}),
  };
  normalized.settings.outbound = {
    ...createDefaultSettings().outbound,
    ...(normalized.settings.outbound || {}),
  };
  normalized.settings.outbound.email = {
    ...createDefaultSettings().outbound.email,
    ...(normalized.settings.outbound.email || {}),
  };
  normalized.settings.outbound.webhook = {
    ...createDefaultSettings().outbound.webhook,
    ...(normalized.settings.outbound.webhook || {}),
  };
  normalized.settings.outbound.sms = {
    ...createDefaultSettings().outbound.sms,
    ...(normalized.settings.outbound.sms || {}),
  };
  normalized.settings.outbound.zalo = {
    ...createDefaultSettings().outbound.zalo,
    ...(normalized.settings.outbound.zalo || {}),
  };
  normalized.settings.securityPolicy = {
    ...createDefaultSettings().securityPolicy,
    ...(normalized.settings.securityPolicy || {}),
  };
  normalized.settings.securityPolicy.passwordRules = {
    ...createDefaultSettings().securityPolicy.passwordRules,
    ...(normalized.settings.securityPolicy.passwordRules || {}),
  };
  for (const user of normalized.users) {
    if (!user || typeof user !== "object") continue;
    user.accountStatus = user.accountStatus || "active";

    // Older admin builds used roleRequestStatus="locked" to mean account lock.
    // Keep approval state and lock state separate so dashboard counts stay consistent.
    if (user.requestedRole === "doctor" && user.roleRequestStatus === "locked") {
      if (user.role === "doctor") {
        user.roleRequestStatus = "approved";
        user.accountStatus = "locked";
      } else {
        user.roleRequestStatus = "pending";
        user.accountStatus = "active";
      }
    }
    user.roleInfoRequiredFields = normalizeRoleInfoFields(user.roleInfoRequiredFields);
  }
  normalized.chatMessages = Array.isArray(normalized.chatMessages) ? normalized.chatMessages : [];
  return normalized;
}

function saveDb() {
  db.updatedAt = nowIso();
  if (!dataStore) {
    return Promise.resolve();
  }
  pendingSave = pendingSave
    .catch(() => {})
    .then(() => dataStore.save(db))
    .catch((err) => {
      console.error(`Cannot persist backend state: ${err.message}`);
    });
  return pendingSave;
}

async function flushDb() {
  await pendingSave;
}

function createDefaultSettings() {
  return {
    system: {
      name: "Smart Health B2B Platform",
      supportEmail: "support@smarthealth.vn",
      supportHotline: "1900 8888",
      timezone: "Asia/Ho_Chi_Minh",
      source: "backend-default",
      updatedAt: "2026-06-05T00:00:00.000Z",
    },
    branding: {
      logoFileId: "",
      logoUrl: "",
      primaryColor: "#0B5C9A",
      accentColor: "#00A896",
      updatedAt: "",
    },
    notifications: {
      enabled: true,
      sound: true,
      vibration: true,
      abnormalResults: true,
      deviceConnection: true,
      appointments: true,
      aiUpdates: false,
      messages: true,
    },
    privacy: {
      biometric: true,
      twoFactor: false,
      encryption: true,
      passwordUpdatedAt: "2026-03-15T08:00:00.000Z",
    },
    dataAccess: {
      shareDoctors: true,
      cloudSync: false,
      aiResearch: false,
      thirdParty: false,
    },
    storage: {
      autoSync: true,
      cloudBackup: true,
      localUsedMb: 2450,
      localTotalMb: 8192,
      cloudUsedMb: 12800,
      cloudTotalMb: 51200,
      cacheMb: 450,
    },
    stethoscope: {
      volume: 75,
      sensitivity: 60,
      noiseCancel: true,
      autoConnect: true,
      lastCalibrationAt: "2026-05-19T08:00:00.000Z",
    },
    ai: {
      selectedModel: "balanced",
      version: "AI Medical Analysis v3.2.1",
      heartAccuracy: 96.8,
      lungAccuracy: 94.2,
      sensitivity: 95.5,
      specificity: 97.1,
      updatedAt: "2026-05-20T08:00:00.000Z",
    },
    outbound: {
      email: {
        enabled: true,
        provider: "gmail-smtp",
        host: "smtp.gmail.com",
        port: 587,
        encryption: "tls",
        from: "",
        testRecipient: "",
      },
      webhook: {
        enabled: false,
        url: "",
        events: {
          deviceOffline: true,
          aiJobFailed: true,
          doctorRegistered: true,
        },
      },
      sms: {
        enabled: false,
        provider: "webhook",
        testRecipient: "",
      },
      zalo: {
        enabled: false,
        provider: "webhook",
        testRecipient: "",
      },
    },
    securityPolicy: {
      sessionTimeoutMinutes: 30,
      maxSessionsPerUser: 3,
      requireAdmin2fa: false,
      ipWhitelist: "",
      retentionDays: 1825,
      rateLimitPerMinute: Number(process.env.RATE_LIMIT_PER_MINUTE || 300),
      passwordRules: {
        minLength: 8,
        requireMixedCase: true,
        requireNumber: true,
        requireSpecial: false,
        expireDays: 0,
      },
      backupCheckEnabled: false,
      lastBackupCheckAt: "",
      lastBackupStatus: "",
      apiKeys: [
        {
          id: "key_production",
          name: "API Key Production",
          keyPreview: "sk_live_********1234",
          status: "active",
          scope: "platform",
          createdAt: "2026-06-05T00:00:00.000Z",
          updatedAt: "2026-06-05T00:00:00.000Z",
          lastRotatedAt: "",
        },
        {
          id: "key_staging",
          name: "API Key Staging",
          keyPreview: "sk_test_********7788",
          status: "active",
          scope: "workspace",
          createdAt: "2026-06-05T00:00:00.000Z",
          updatedAt: "2026-06-05T00:00:00.000Z",
          lastRotatedAt: "",
        },
      ],
    },
  };
}

function ensureAppDefaults() {
  let changed = false;

  if (db.users.length === 0) {
    const createdAt = nowIso();
    db.users.push(
      {
        id: "usr_doctor_default",
        role: "doctor",
        name: "Bs. Tuấn",
        email: "bacsytuan@benhvien.com",
        phone: "0912345678",
        password: "12345678",
        license: "123456/BYT-CCHN",
        hospital: "Bệnh viện Đa khoa Trung ương",
        department: "Khoa Tim mạch",
        address: "123 Đường Láng, Đống Đa, Hà Nội",
        verifiedEmail: true,
        verifiedPhone: true,
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "usr_patient_default",
        role: "patient",
        name: "Nguyễn Văn A",
        email: "nguyenvana@gmail.com",
        phone: "0900000000",
        password: "12345678",
        address: "Hồ Chí Minh",
        verifiedEmail: true,
        verifiedPhone: true,
        createdAt,
        updatedAt: createdAt,
      }
    );
    changed = true;
  }

  if (db.organizations.length === 0) {
    const createdAt = nowIso();
    db.organizations.push({
      id: "org_default_clinic",
      name: "Smart Health Clinic",
      type: "clinic",
      workspaceType: "clinic",
      packageId: "pkg_clinic_basic",
      subscriptionStatus: "trial",
      billingCycle: "monthly",
      createdAt,
      updatedAt: createdAt,
    });
    changed = true;
  }

  if (db.servicePackages.length === 0) {
    const createdAt = nowIso();
    db.servicePackages.push(
      {
        id: "pkg_clinic_basic",
        name: "Clinic Basic",
        type: "basic",
        segment: "organization",
        price: 2500000,
        currency: "VND",
        duration: "monthly",
        maxDevices: 3,
        maxDoctors: 5,
        maxPatients: 1000,
        storageGb: 200,
        aiMonthly: 2000,
        retentionDays: 365,
        features: { cloudStorage: true, analytics: true, aiDiagnosis: true },
        status: "active",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "pkg_solo_doctor",
        name: "Solo Doctor",
        type: "solo",
        segment: "solo_practice",
        price: 490000,
        currency: "VND",
        duration: "monthly",
        maxDevices: 1,
        maxDoctors: 1,
        maxPatients: 150,
        storageGb: 50,
        aiMonthly: 500,
        retentionDays: 180,
        features: { cloudStorage: true, analytics: true, aiDiagnosis: true },
        status: "active",
        createdAt,
        updatedAt: createdAt,
      },
      {
        id: "pkg_personal_family",
        name: "Personal Family",
        type: "personal",
        segment: "personal",
        price: 99000,
        currency: "VND",
        duration: "monthly",
        maxDevices: 2,
        maxDoctors: 0,
        maxPatients: 6,
        storageGb: 20,
        aiMonthly: 100,
        retentionDays: 180,
        features: { cloudStorage: true, analytics: false, aiDiagnosis: true },
        status: "active",
        createdAt,
        updatedAt: createdAt,
      }
    );
    changed = true;
  }

  for (const org of db.organizations) {
    const nextWorkspaceType = normalizeWorkspaceType(org.workspaceType || org.type, org.type === "hospital" ? "hospital" : "clinic");
    if (org.workspaceType !== nextWorkspaceType) {
      org.workspaceType = nextWorkspaceType;
      org.updatedAt = nowIso();
      changed = true;
    }
    if (!org.subscriptionStatus) {
      org.subscriptionStatus = "trial";
      changed = true;
    }
    if (!org.billingCycle) {
      org.billingCycle = "monthly";
      changed = true;
    }
  }

  for (const user of db.users) {
    if (!user.organizationId) {
      user.organizationId = "org_default_clinic";
      user.updatedAt = nowIso();
      changed = true;
    }

    if (!db.memberships.some((item) => item.userId === user.id && item.organizationId === user.organizationId)) {
      db.memberships.push({
        id: createId("mbr"),
        organizationId: user.organizationId,
        userId: user.id,
        role: user.role || "patient",
        createdAt: nowIso(),
      });
      changed = true;
    }

    if (user.role === "patient") {
      const patient = ensurePatientProfileForUser(user);
      if (patient && user.patientId !== patient.id) {
        user.patientId = patient.id;
        user.updatedAt = nowIso();
        changed = true;
      }
    }
  }

  if (db.devices.length === 0) {
    const updatedAt = nowIso();
    db.devices.push(
      {
        id: "esp32-stethoscope",
        name: "StethoEdge Pro",
        type: "stethoscope",
        status: "connected",
        signal: -45,
        battery: 85,
        connected: true,
        lastSeenAt: updatedAt,
        updatedAt,
      },
      {
        id: "lite-steth-a92",
        name: "LiteSteth-A92",
        type: "stethoscope",
        status: "available",
        signal: -68,
        battery: 72,
        connected: false,
        lastSeenAt: updatedAt,
        updatedAt,
      }
    );
    changed = true;
  }

  if (db.notifications.length === 0) {
    seedNotification("info", "Máy chủ đã sẵn sàng", "Ứng dụng đã kết nối với máy chủ Smart Health.", true);
    seedNotification("success", "Thiết bị khả dụng", "ESP32 đang gửi tín hiệu âm thanh qua UDP.", false);
    changed = true;
  }

  if (changed) {
    saveDb();
  }
}

function seedNotification(type, title, message, read = false) {
  db.notifications.unshift({
    id: createId("noti"),
    type,
    title,
    message,
    read,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
}

function createDemoSecret(prefix = "sk_demo") {
  return `${prefix}_${crypto.randomBytes(18).toString("base64url")}`;
}

function maskSecret(secret) {
  const value = readString(secret, 200);
  if (!value) return "";
  const prefix = value.startsWith("sk_live")
    ? "sk_live"
    : value.startsWith("sk_test")
      ? "sk_test"
      : value.startsWith("sk_ws")
        ? "sk_ws"
        : "sk_demo";
  return `${prefix}_********${value.slice(-4)}`;
}

function createRecoveryCodes(count = 8) {
  return Array.from({ length: count }, () => crypto.randomBytes(4).toString("hex").toUpperCase());
}

function normalizeNotificationPreferences(value = {}) {
  const current = value && typeof value === "object" ? value : {};
  return {
    doctorRequests: current.doctorRequests !== false,
    abnormalResults: current.abnormalResults !== false,
    deviceOffline: current.deviceOffline !== false,
    newLogin: current.newLogin !== false,
  };
}

function publicUser(user) {
  if (!user) return null;
  const { password, avatarStorage, ...safeUser } = user;
  const organization = getClinicById(user.organizationId);
  const workspaceContext = getUserWorkspaceContext(user);
  return {
    ...safeUser,
    title: user.title || "",
    avatarFileId: user.avatarFileId || "",
    avatarUrl: user.avatarUrl || "",
    twoFactorEnabled: Boolean(user.twoFactorEnabled),
    twoFactorMethod: user.twoFactorMethod || "",
    notificationPreferences: normalizeNotificationPreferences(user.notificationPreferences),
    hospital: user.hospital || organization?.name || "",
    clinicName: user.hospital || organization?.name || "",
    specialty: user.specialty || user.department || "",
    roleInfoRequiredFields: normalizeRoleInfoFields(user.roleInfoRequiredFields),
    workspaceId: workspaceContext.currentWorkspaceId,
    currentWorkspaceId: workspaceContext.currentWorkspaceId,
    currentMembership: workspaceContext.currentMembership,
    memberships: workspaceContext.memberships,
    workspace: workspaceContext.workspace,
    capabilities: workspaceContext.capabilities,
  };
}

function publicDoctorRoleRequest(user) {
  const organization = getClinicById(user.organizationId);
  return {
    ...publicUser(user),
    hospital: user.hospital || organization?.name || "",
    clinicName: user.hospital || organization?.name || "",
    specialty: user.department || "",
    roleInfoRequiredFields: normalizeRoleInfoFields(user.roleInfoRequiredFields),
    status: user.roleRequestStatus || "pending",
    requestedAt: user.roleRequestedAt || user.createdAt || "",
    approvedAt: user.roleApprovedAt || "",
    rejectedAt: user.roleRejectedAt || "",
    rejectReason: user.roleRejectReason || "",
  };
}

function isApprovedDoctorRole(user) {
  return user && user.requestedRole === "doctor" && user.roleRequestStatus === "approved" && user.role === "doctor";
}

function normalizeLookup(value) {
  return readString(value, 240).toLowerCase();
}

function getClinicById(id) {
  const clinicId = readString(id, 120);
  if (!clinicId) return null;
  return db.organizations.find((item) => item.id === clinicId) || null;
}

function normalizeWorkspaceRole(role) {
  const raw = readString(role, 80).toLowerCase();
  if (raw === "admin") return "workspace_admin";
  if (raw === "owner") return "workspace_owner";
  if (raw === "nurse") return "nurse";
  if (raw === "technician") return "technician";
  if (raw === "billing") return "billing";
  if (raw === "viewer") return "viewer";
  if (raw === "doctor") return "doctor";
  if (raw === "patient") return "patient";
  if (raw === "platform_admin") return "platform_admin";
  if (raw === "workspace_admin") return "workspace_admin";
  if (raw === "workspace_owner") return "workspace_owner";
  return raw || "viewer";
}

function getUserMemberships(user) {
  if (!user) return [];
  const existingMemberships = db.memberships.filter((item) => item.userId === user.id);
  const memberships = existingMemberships.length
    ? existingMemberships
    : [
        {
          id: "",
          organizationId: user.organizationId || "org_default_clinic",
          userId: user.id,
          role: user.role || "patient",
          createdAt: user.createdAt || "",
        },
      ];

  return memberships.map((membership) => {
    const workspace = getClinicById(membership.organizationId);
    const role = user.role === "admin" ? "platform_admin" : normalizeWorkspaceRole(membership.role || user.role);
    return {
      id: membership.id || "",
      workspaceId: membership.organizationId || "",
      organizationId: membership.organizationId || "",
      workspaceName: workspace?.name || "",
      workspaceType: workspace?.workspaceType || workspace?.type || "",
      role,
      legacyRole: membership.role || user.role || "",
      createdAt: membership.createdAt || "",
    };
  });
}

function getCapabilitiesForRole(role) {
  const normalizedRole = normalizeWorkspaceRole(role);
  const common = ["notifications.view", "account.manage"];
  const workspaceRead = [
    "workspace.dashboard.view",
    "workspace.patients.view",
    "workspace.devices.view",
    "workspace.scans.view",
  ];
  const workspaceManage = [
    "workspace.staff.manage",
    "workspace.patients.manage",
    "workspace.devices.manage",
    "workspace.scans.manage",
    "workspace.storage.manage",
    "workspace.reports.view",
    "workspace.audit.view",
    "workspace.settings.manage",
  ];

  if (normalizedRole === "platform_admin") {
    return [
      ...common,
      "platform.dashboard.view",
      "platform.doctorRequests.manage",
      "platform.workspaces.manage",
      "platform.users.manage",
      "platform.patients.view",
      "platform.patients.manage",
      "platform.devices.view",
      "platform.devices.manage",
      "platform.scans.view",
      "platform.scans.manage",
      "platform.reports.view",
      "platform.packages.manage",
      "platform.storage.manage",
      "platform.audit.view",
      "platform.settings.manage",
      "billing.manage",
      ...workspaceRead,
      ...workspaceManage,
    ];
  }

  if (normalizedRole === "workspace_owner" || normalizedRole === "workspace_admin") {
    return [...common, ...workspaceRead, ...workspaceManage, "billing.view"];
  }

  if (normalizedRole === "doctor") {
    return [
      ...common,
      "workspace.dashboard.view",
      "workspace.patients.view",
      "workspace.patients.manage",
      "workspace.devices.view",
      "workspace.scans.view",
      "workspace.scans.manage",
      "workspace.reports.view",
    ];
  }

  if (normalizedRole === "nurse" || normalizedRole === "technician") {
    return [
      ...common,
      "workspace.dashboard.view",
      "workspace.patients.view",
      "workspace.devices.view",
      "workspace.devices.manage",
      "workspace.scans.view",
      "workspace.scans.manage",
    ];
  }

  if (normalizedRole === "billing") {
    return [...common, "workspace.dashboard.view", "billing.view", "workspace.reports.view"];
  }

  if (normalizedRole === "patient") {
    return [
      ...common,
      "personal.dashboard.view",
      "personal.profiles.manage",
      "personal.devices.manage",
      "personal.scans.manage",
      "personal.sharing.manage",
    ];
  }

  return [...common, "workspace.dashboard.view", "workspace.reports.view"];
}

function getUserWorkspaceContext(user) {
  const memberships = getUserMemberships(user);
  const currentWorkspaceId = user?.organizationId || memberships[0]?.workspaceId || "org_default_clinic";
  const currentMembership =
    memberships.find((membership) => membership.workspaceId === currentWorkspaceId) ||
    memberships[0] ||
    null;
  const workspace = getClinicById(currentWorkspaceId);
  const roleForCapabilities = user?.role === "admin" ? "platform_admin" : currentMembership?.role || user?.role;
  const capabilitySet = new Set(getCapabilitiesForRole(roleForCapabilities));
  if (
    user &&
    workspace &&
    workspace.workspaceType === "solo_practice" &&
    workspace.ownerUserId === user.id &&
    normalizeWorkspaceRole(roleForCapabilities) === "doctor"
  ) {
    capabilitySet.add("workspace.devices.manage");
  }
  const capabilities = Array.from(capabilitySet);

  return {
    memberships,
    currentWorkspaceId,
    currentMembership,
    workspace: workspace
      ? {
          id: workspace.id,
          name: workspace.name,
          type: workspace.type || "",
          workspaceType: workspace.workspaceType || workspace.type || "",
          packageId: workspace.packageId || "",
          subscriptionStatus: workspace.subscriptionStatus || "",
          billingCycle: workspace.billingCycle || "",
        }
      : null,
    capabilities,
  };
}

function getCatalogClinicById(id) {
  const clinicId = readString(id, 120);
  if (!clinicId) return null;
  return getClinicById(clinicId) || DEFAULT_CLINIC_CATALOG.find((item) => item.id === clinicId) || null;
}

function getClinicFromPayload(payload) {
  const requestedId = readString(payload.organizationId || payload.clinicId || payload.clinic, 120);
  if (requestedId) {
    const byId = getCatalogClinicById(requestedId);
    if (byId) return byId;
  }

  const requestedName = normalizeLookup(payload.hospital || payload.clinicName || payload.clinic);
  if (!requestedName) return null;
  return (
    db.organizations.find((item) => normalizeLookup(item.name) === requestedName) ||
    DEFAULT_CLINIC_CATALOG.find((item) => normalizeLookup(item.name) === requestedName) ||
    null
  );
}

function ensureOrganizationFromCatalog(clinic) {
  if (!clinic || getClinicById(clinic.id)) return;
  db.organizations.push({
    id: clinic.id,
    name: clinic.name,
    type: clinic.type || "hospital",
    workspaceType: normalizeWorkspaceType(clinic.workspaceType || clinic.type, clinic.type === "hospital" ? "hospital" : "clinic"),
    address: clinic.address || "",
    phone: clinic.phone || "",
    email: clinic.email || "",
    website: clinic.website || "",
    status: clinic.status || "active",
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
}

function ensurePersonalWorkspaceForUser(user) {
  const id = `org_personal_${String(user.id || user.firebaseUid || "user").replace(/[^a-zA-Z0-9_]/g, "_")}`;
  let workspace = db.organizations.find((item) => item.id === id);
  if (!workspace) {
    const createdAt = nowIso();
    workspace = {
      id,
      name: `Hồ sơ cá nhân - ${user.name || user.email || user.id}`,
      type: "personal",
      workspaceType: "personal",
      status: "active",
      ownerUserId: user.id,
      packageId: "pkg_personal_family",
      subscriptionStatus: "trial",
      billingCycle: "monthly",
      createdAt,
      updatedAt: createdAt,
    };
    db.organizations.unshift(workspace);
  }
  return workspace;
}

function ensureSoloPracticeWorkspaceForUser(user, payload = {}) {
  const id = `org_solo_${String(user.id || user.firebaseUid || "doctor").replace(/[^a-zA-Z0-9_]/g, "_")}`;
  let workspace = db.organizations.find((item) => item.id === id);
  const name =
    readString(payload.workspaceName || payload.clinicName || payload.hospital, 160) ||
    `Phòng khám cá nhân - ${user.name || user.email || user.id}`;
  if (!workspace) {
    const createdAt = nowIso();
    workspace = {
      id,
      name,
      type: "solo_practice",
      workspaceType: "solo_practice",
      address: readString(payload.address, 240),
      phone: readString(payload.phone, 40) || user.phone || "",
      email: readString(payload.email, 160).toLowerCase() || user.email || "",
      website: "",
      status: "active",
      ownerUserId: user.id,
      packageId: "pkg_solo_doctor",
      subscriptionStatus: "trial",
      billingCycle: "monthly",
      createdAt,
      updatedAt: createdAt,
    };
    db.organizations.unshift(workspace);
  } else {
    workspace.name = name || workspace.name;
    workspace.workspaceType = "solo_practice";
    workspace.ownerUserId = workspace.ownerUserId || user.id;
    workspace.packageId = workspace.packageId || "pkg_solo_doctor";
    workspace.subscriptionStatus = workspace.subscriptionStatus || "trial";
    workspace.updatedAt = nowIso();
  }
  return workspace;
}

function publicClinic(org) {
  return {
    id: org.id,
    name: org.name,
    type: org.type || "general",
    workspaceType: normalizeWorkspaceType(org.workspaceType || org.type, org.type === "hospital" ? "hospital" : "clinic"),
    address: org.address || "",
    phone: org.phone || "",
    email: org.email || "",
    website: org.website || "",
    status: org.status || "active",
    packageId: org.packageId || "",
    subscriptionStatus: org.subscriptionStatus || "trial",
    billingCycle: org.billingCycle || "monthly",
    ownerUserId: org.ownerUserId || "",
    createdAt: org.createdAt || "",
    updatedAt: org.updatedAt || "",
  };
}

function isDoctorWorkspaceUser(user) {
  return user && (user.role === "doctor" || user.requestedRole === "doctor");
}

function getWorkspaceLinkSummary(organizationId) {
  const users = db.users.filter((user) => user.organizationId === organizationId);
  const doctors = users.filter(isDoctorWorkspaceUser);
  const patients = db.patients.filter((patient) => patient.organizationId === organizationId);
  const devices = db.devices.filter((device) => device.organizationId === organizationId);
  return {
    accounts: users.length,
    doctors: doctors.length,
    patients: patients.length,
    devices: devices.length,
    total: users.length + patients.length + devices.length,
    samples: {
      accounts: users.slice(0, 3).map((user) => ({ id: user.id, name: user.name || user.email || user.id, role: user.role })),
      patients: patients.slice(0, 3).map((patient) => ({ id: patient.id, name: patient.name || patient.id })),
      devices: devices.slice(0, 3).map((device) => ({ id: device.id, name: device.name || device.id })),
    },
  };
}

function getWorkspaceUsage(organizationId) {
  const audioStorageBytes = db.storageFiles
    .filter((file) => file.organizationId === organizationId)
    .reduce((total, file) => total + Number(file.sizeBytes || file.size || 0), 0);
  const linkSummary = getWorkspaceLinkSummary(organizationId);
  return {
    doctors: linkSummary.doctors,
    patients: linkSummary.patients,
    devices: linkSummary.devices,
    aiMonthly: db.aiResults.filter((result) => result.organizationId === organizationId).length,
    storageGb: Math.round((audioStorageBytes / 1024 / 1024 / 1024) * 100) / 100,
  };
}

function getPackageQuota(packageId) {
  const servicePackage = db.servicePackages.find((item) => item.id === packageId);
  if (!servicePackage) {
    return {
      maxDoctors: 0,
      maxPatients: 0,
      maxDevices: 0,
      storageGb: 0,
      aiMonthly: 0,
      retentionDays: 0,
    };
  }
  return {
    maxDoctors: Number(servicePackage.maxDoctors || 0),
    maxPatients: Number(servicePackage.maxPatients || 0),
    maxDevices: Number(servicePackage.maxDevices || 0),
    storageGb: Number(servicePackage.storageGb || 0),
    aiMonthly: Number(servicePackage.aiMonthly || 0),
    retentionDays: Number(servicePackage.retentionDays || 0),
  };
}

function publicWorkspace(org) {
  const clinic = publicClinic(org);
  const linkSummary = getWorkspaceLinkSummary(org.id);
  return {
    ...clinic,
    usage: getWorkspaceUsage(org.id),
    quota: getPackageQuota(org.packageId),
    userCount: linkSummary.accounts,
    doctorCount: linkSummary.doctors,
    patientCount: linkSummary.patients,
    deviceCount: linkSummary.devices,
  };
}

function getActiveClinics() {
  const byId = new Map();
  for (const org of db.organizations.filter((item) => String(item.status || "active") === "active")) {
    byId.set(org.id, publicClinic(org));
  }
  for (const clinic of DEFAULT_CLINIC_CATALOG) {
    if (!byId.has(clinic.id)) {
      byId.set(clinic.id, publicClinic(clinic));
    }
  }
  return [...byId.values()].sort((a, b) => String(a.name).localeCompare(String(b.name), "vi"));
}

function normalizeRoleInfoFields(value) {
  const fields = Array.isArray(value) ? value : [];
  return [...new Set(fields.map((field) => readString(field, 40)).filter((field) => ROLE_INFO_FIELDS.has(field)))];
}

function isAwaitingDoctorApproval(user) {
  return (
    user &&
    user.requestedRole === "doctor" &&
    !["approved", "rejected"].includes(String(user.roleRequestStatus || "pending"))
  );
}

function findUserByLogin(login) {
  const value = readString(login, 160).toLowerCase();
  return db.users.find(
    (user) =>
      String(user.email || "").toLowerCase() === value ||
      String(user.phone || "").replace(/\s/g, "") === value.replace(/\s/g, "")
  );
}

function getCurrentUser() {
  return (
    db.users.find((user) => user.role === "admin" || user.requestedRole === "admin") ||
    db.users.find((user) => user.roleRequestStatus === "approved" && user.requestedRole === "doctor") ||
    db.users[0] ||
    null
  );
}

function addAccessLog(action, detail = {}) {
  const log = {
    id: createId("log"),
    action,
    device: detail.device || "Ứng dụng Android",
    location: detail.location || "Mạng nội bộ",
    ip: detail.ip || "",
    userId: detail.userId || "",
    organizationId: detail.organizationId || "",
    severity: detail.severity || "info",
    createdAt: nowIso(),
  };
  db.accessLogs.unshift(log);
  db.accessLogs = db.accessLogs.slice(0, 200);
  return log;
}

function createNotification(type, title, message, metadata = {}) {
  const notification = {
    id: createId("noti"),
    type,
    title,
    message,
    userId: readString(metadata.userId, 120),
    organizationId: readString(metadata.organizationId, 120),
    channel: readString(metadata.channel, 40) || "in_app",
    read: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  db.notifications.unshift(notification);
  db.notifications = db.notifications.slice(0, 200);
  return notification;
}

async function createBackendNotification(input) {
  const createdAfter = Date.now() - 5000;
  const duplicate = db.notifications.find((notification) => {
    const createdAt = new Date(notification.createdAt || 0).getTime();
    return (
      createdAt >= createdAfter &&
      notification.type === input.type &&
      notification.title === input.title &&
      notification.message === input.message
    );
  });
  if (duplicate) {
    input = {
      ...duplicate,
      ...input,
      id: duplicate.id,
    };
  }
  if (repositories) {
    return repositories.notifications.create(input);
  }
  return createNotification(input.type, input.title, input.message, input);
}

async function appendAudit(action, req, detail = {}) {
  const context = getRequestContext(req) || createRequestContext(req);
  const actorUserId = detail.actorUserId || (context.actor ? context.actor.id : "");
  const log = {
    action,
    actorUserId,
    organizationId: detail.organizationId || context.organizationId || "",
    resourceType: detail.resourceType || "",
    resourceId: detail.resourceId || "",
    ip: detail.ip || context.ip || "",
    userAgent: detail.userAgent || context.userAgent || "",
    metadata: detail.metadata || {},
  };
  if (repositories) {
    return repositories.auditLogs.append(log);
  }
  log.id = createId("audit");
  log.createdAt = nowIso();
  db.auditLogs.unshift(log);
  db.auditLogs = db.auditLogs.slice(0, 1000);
  return log;
}

async function saveDeviceRecord(device) {
  if (repositories) {
    await repositories.devices.save(device);
    return;
  }
  saveDb();
}

async function saveScanRecord(scan) {
  if (repositories) {
    await repositories.scans.save(scan);
    return;
  }
  saveDb();
}

async function saveAudioArtifacts(scan, audioFile, aiResult) {
  if (repositories) {
    await repositories.audioFiles.save(audioFile);
    await repositories.aiResults.save(aiResult);
    await repositories.scans.save(scan);
    return;
  }
  saveDb();
}

function getScanOrgId(scan) {
  if (scan.organizationId) return scan.organizationId;
  const patient = db.patients.find((item) => item.id === scan.patientId);
  return patient ? patient.organizationId || "org_default_clinic" : "org_default_clinic";
}

async function runInlineAudioProcessing(scan, wavFilePath) {
  if (!storageAdapter) {
    storageAdapter = createStorageAdapter({ dataDir: DATA_DIR, env: process.env });
  }
  const orgId = getScanOrgId(scan);
  const audioObjectKey = buildScanObjectKey(orgId, scan.patientId, scan.id, "audio.wav");
  const waveformObjectKey = buildScanObjectKey(orgId, scan.patientId, scan.id, "waveform.json");
  const audioUpload = await storageAdapter.putFile(audioObjectKey, wavFilePath, "audio/wav");
  const processed = await processAudioFile({
    filePath: wavFilePath,
    scanId: scan.id,
    sampleRate: scan.sampleRate || SAMPLE_RATE,
  });
  await storageAdapter.putBuffer(waveformObjectKey, Buffer.from(JSON.stringify(processed.waveform)), "application/json");
  return {
    audioObjectKey,
    waveformObjectKey,
    audioUpload,
    processed,
  };
}

async function enqueueAudioProcessing(scan, wavFilePath) {
  if (!audioQueue) {
    return false;
  }
  return audioQueue.enqueue({
    scanId: scan.id,
    patientId: scan.patientId,
    organizationId: getScanOrgId(scan),
    wavFilePath,
    sampleRate: scan.sampleRate || SAMPLE_RATE,
  });
}

async function handleDeviceTelemetry(deviceId, payload = {}) {
  let device = repositories ? await repositories.devices.findById(deviceId) : db.devices.find((item) => item.id === deviceId);
  if (!device) {
    device = {
      id: deviceId,
      name: payload.name || deviceId,
      type: "stethoscope",
      status: "available",
      connected: false,
      createdAt: nowIso(),
    };
  }
  if (device.revokedAt) {
    await appendDeviceEvent(device.id, "telemetry_rejected", { reason: "revoked" });
    return;
  }
  device.connected = true;
  device.status = payload.status || "connected";
  device.signal = readOptionalNumber(payload.signal ?? payload.rssi) ?? device.signal;
  device.wifiRssi = readOptionalNumber(payload.wifiRssi ?? payload.rssi) ?? device.wifiRssi;
  device.battery = readOptionalNumber(payload.battery) ?? device.battery;
  device.connectionMethod = payload.connectionMethod || device.connectionMethod || "MQTT";
  device.firmwareVersion = payload.firmwareVersion || payload.firmware || device.firmwareVersion;
  device.ipAddress = readString(payload.ipAddress || payload.ip, 80) || device.ipAddress;
  device.wifiSsid = readString(payload.wifiSsid, 120) || device.wifiSsid;
  device.audioStatus = readString(payload.audioStatus, 80) || device.audioStatus || "streaming";
  device.otaStatus = readString(payload.otaStatus, 80) || device.otaStatus || "";
  device.backendHost = readString(payload.backendHost, 160) || device.backendHost;
  device.backendPort = readOptionalNumber(payload.backendPort) ?? device.backendPort;
  device.lastSeenAt = nowIso();
  device.updatedAt = nowIso();
  await saveDeviceRecord(device);
  await appendDeviceEvent(device.id, "telemetry", payload);
}

async function handleDeviceEvent(deviceId, payload = {}) {
  const eventType = readString(payload.type || payload.eventType, 120) || "event";
  let device = repositories ? await repositories.devices.findById(deviceId) : db.devices.find((item) => item.id === deviceId);
  if (device) {
    if (payload.otaStatus || eventType.startsWith("ota.")) {
      device.otaStatus = readString(payload.otaStatus || eventType.replace(/^ota\./, ""), 80) || device.otaStatus;
    }
    if (payload.audioStatus) {
      device.audioStatus = readString(payload.audioStatus, 80);
    }
    if (payload.firmwareVersion) {
      device.firmwareVersion = readString(payload.firmwareVersion, 80);
    }
    device.lastSeenAt = nowIso();
    device.updatedAt = nowIso();
    await saveDeviceRecord(device);
  }
  await appendDeviceEvent(deviceId, eventType, payload);
}

async function registerDeviceSocket(socket, payload = {}) {
  const deviceId = readString(payload.deviceId || socket._queryDeviceId, 120) || "esp32-stethoscope";
  const suppliedSecret = readString(payload.secret || socket._querySecret, 160);
  let device = repositories ? await repositories.devices.findById(deviceId) : db.devices.find((item) => item.id === deviceId);
  if (device && device.secret && suppliedSecret !== device.secret) {
    await appendDeviceEvent(deviceId, "socket_rejected", { reason: "invalid_secret" });
    closeSocket(socket);
    return false;
  }
  socket._deviceId = deviceId;
  deviceSockets.set(deviceId, socket);
  await handleDeviceTelemetry(deviceId, {
    ...(payload.telemetry || payload),
    connectionMethod: "WSS",
    status: "connected",
    audioStatus: "streaming",
  });
  return true;
}

function publishDeviceCommand(deviceId, command) {
  const socket = deviceSockets.get(deviceId);
  let websocket = false;
  if (socket && socket.writable && !socket.destroyed) {
    sendText(socket, JSON.stringify(command));
    websocket = true;
  }
  let mqtt = false;
  if (mqttControlPlane && mqttControlPlane.enabled) {
    mqttControlPlane.publishCommand(deviceId, command);
    mqtt = true;
  }
  return { websocket, mqtt, delivered: websocket || mqtt };
}

async function appendDeviceEvent(deviceId, eventType, payload = {}) {
  if (repositories) {
    await repositories.deviceEvents.append({ deviceId, eventType, payload });
    return;
  }
  db.deviceEvents.unshift({
    id: createId("devevt"),
    deviceId,
    eventType,
    payload,
    createdAt: nowIso(),
  });
  db.deviceEvents = db.deviceEvents.slice(0, 1000);
  saveDb();
}

function localizePatientName(value) {
  const name = readString(value, 120);
  switch (name) {
    case "Walk-in patient":
      return "Bệnh nhân vãng lai";
    case "Unknown patient":
      return "Bệnh nhân chưa xác định";
    default:
      return name;
  }
}

function localizeAiSummary(value) {
  const text = readString(value, 4000);
  if (!text) {
    return "";
  }

  if (text.includes("Signal level is very low")) {
    return "Mức tín hiệu rất thấp. Kiểm tra tiếp xúc cảm biến và đo lại nếu dạng sóng gần như phẳng.";
  }
  if (text.includes("Scan audio was captured and stored")) {
    return "Âm thanh đã được ghi và lưu. Hệ thống hiện chỉ kiểm tra chất lượng tín hiệu; phần chẩn đoán lâm sàng có thể bổ sung sau.";
  }
  if (text.includes("Recording is shorter than 1 second")) {
    return "Thời lượng ghi dưới 1 giây. Hãy ghi lâu hơn trước khi xem xét kết quả.";
  }
  if (text.includes("Signal contains peaks close to clipping")) {
    return "Tín hiệu có đỉnh quá cao, gần bị méo. Giảm gain hoặc đặt lại cảm biến trước khi đánh giá.";
  }
  if (text.includes("Recording was still active when the backend started")) {
    return "Lượt ghi còn mở khi máy chủ khởi động lại. Hãy tạo lượt đo mới để có file WAV hoàn chỉnh.";
  }
  if (text.includes("Recording was stopped without an active audio stream")) {
    return "Lượt ghi đã dừng nhưng không còn luồng âm thanh hoạt động. Không tạo được file WAV hoàn chỉnh.";
  }
  if (text.includes("Recording was stopped after the active audio stream was already closed")) {
    return "Lượt ghi được dừng sau khi luồng âm thanh đã đóng. Hãy tạo lượt đo mới để có file WAV đầy đủ.";
  }

  return text;
}

function localizeLegacyDbText() {
  let changed = false;

  for (const patient of db.patients) {
    const localizedName = localizePatientName(patient.name);
    if (localizedName && localizedName !== patient.name) {
      patient.name = localizedName;
      patient.updatedAt = nowIso();
      changed = true;
    }
  }

  for (const scan of db.scans) {
    if (scan.patient) {
      const localizedName = localizePatientName(scan.patient.name);
      if (localizedName && localizedName !== scan.patient.name) {
        scan.patient.name = localizedName;
        scan.updatedAt = nowIso();
        changed = true;
      }
    }

    const localizedSummary = localizeAiSummary(scan.aiSummary);
    if (localizedSummary !== (scan.aiSummary || "")) {
      scan.aiSummary = localizedSummary;
      scan.updatedAt = nowIso();
      changed = true;
    }
  }

  if (changed) {
    saveDb();
  }
}

function markInterruptedRecordings() {
  let changed = false;

  for (const scan of db.scans) {
    if (scan.status === "recording") {
      scan.status = "interrupted";
      scan.endedAt = scan.endedAt || nowIso();
      scan.aiLabel = scan.aiLabel || "interrupted";
      scan.aiSummary =
        scan.aiSummary ||
        "Lượt ghi còn mở khi máy chủ khởi động lại. Hãy tạo lượt đo mới để có file WAV hoàn chỉnh.";
      changed = true;
    }
  }

  if (changed) {
    saveDb();
  }
}

class BeatDetector {
  constructor(sampleRate) {
    this.sampleRate = sampleRate;
    this.envelope = 0;
    this.envelopeMean = 0;
    this.threshold = 600;
    this.sampleCounter = 0;
    this.lastBeatSample = 0;
    this.beatArmed = true;
    this.intervals = [];
    this.minBeatIntervalSamples = Math.round((sampleRate * 280) / 1000);
    this.maxBeatIntervalSamples = Math.round((sampleRate * 1800) / 1000);
  }

  ingest(sample) {
    this.sampleCounter++;
    const rectified = Math.abs(sample);
    const envelopeAlpha = rectified > this.envelope ? 0.0062 : 0.00052;
    this.envelope += envelopeAlpha * (rectified - this.envelope);

    if (this.envelopeMean < 1) {
      this.envelopeMean = this.envelope;
    } else {
      this.envelopeMean += 0.00002 * (this.envelope - this.envelopeMean);
    }

    this.threshold = Math.max(600, this.envelopeMean * 1.9);
    const sinceLastBeat = this.sampleCounter - this.lastBeatSample;

    if (
      this.beatArmed &&
      this.envelope > this.threshold &&
      sinceLastBeat > this.minBeatIntervalSamples
    ) {
      if (this.lastBeatSample > 0 && sinceLastBeat < this.maxBeatIntervalSamples) {
        this.intervals.push(sinceLastBeat);
        if (this.intervals.length > 8) {
          this.intervals.shift();
        }
      }

      this.lastBeatSample = this.sampleCounter;
      this.beatArmed = false;
    }

    if (!this.beatArmed && this.envelope < this.threshold * 0.55) {
      this.beatArmed = true;
    }
  }

  getBpm() {
    if (this.intervals.length === 0) {
      return 0;
    }

    const total = this.intervals.reduce((sum, value) => sum + value, 0);
    const averageInterval = total / this.intervals.length;
    return Math.round((60 * this.sampleRate) / averageInterval);
  }
}

class RecordingMetrics {
  constructor() {
    this.sampleCount = 0;
    this.sumSquares = 0;
    this.peak = 0;
    this.beatDetector = new BeatDetector(SAMPLE_RATE);
  }

  ingestBuffer(buffer) {
    for (let offset = 0; offset + 1 < buffer.length; offset += 2) {
      const sample = buffer.readInt16LE(offset);
      const abs = Math.abs(sample);
      this.sampleCount++;
      this.sumSquares += sample * sample;
      if (abs > this.peak) {
        this.peak = abs;
      }
      this.beatDetector.ingest(sample);
    }
  }

  getSummary() {
    const rms = this.sampleCount > 0 ? Math.sqrt(this.sumSquares / this.sampleCount) : 0;
    return {
      sampleCount: this.sampleCount,
      durationSeconds: roundNumber(this.sampleCount / SAMPLE_RATE, 3),
      peak: this.peak,
      rms: Math.round(rms),
      levelPercent: Math.min(100, Math.round((rms / 32768) * 180)),
      bpm: this.beatDetector.getBpm(),
    };
  }
}

function roundNumber(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function createEmptyLiveMetrics() {
  return {
    sampleRate: SAMPLE_RATE,
    channels: CHANNELS,
    bitsPerSample: BITS_PER_SAMPLE,
    peak: 0,
    rms: 0,
    levelPercent: 0,
    bpm: 0,
    source: null,
    updatedAt: null,
  };
}

liveMetrics = createEmptyLiveMetrics();
liveBeatDetector = new BeatDetector(SAMPLE_RATE);

function websocketAcceptKey(key) {
  return crypto
    .createHash("sha1")
    .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
    .digest("base64");
}

function sendFrame(socket, opcode, payload) {
  if (!socket.writable || socket.destroyed) {
    return;
  }

  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  let header;

  if (body.length < 126) {
    header = Buffer.from([0x80 | opcode, body.length]);
  } else if (body.length <= 0xffff) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(body.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(body.length), 2);
  }

  try {
    socket.write(Buffer.concat([header, body]));
  } catch {
    cleanupSocket(socket);
    socket.destroy();
  }
}

function sendText(socket, value) {
  sendFrame(socket, 0x1, value);
}

function sendBinary(socket, value) {
  sendFrame(socket, 0x2, value);
}

function getStatusPayload() {
  const espCount = getAudioSourceCount();
  return {
    type: "status",
    esp: espCount,
    wsEsp: espClients.size,
    udpEsp: Math.max(0, espCount - espClients.size),
    listeners: listenClients.size,
    recording: Boolean(activeRecording),
    activeScanId: activeRecording ? activeRecording.scanId : null,
    activeScanStartedAt: activeRecording ? activeRecording.startedAt : null,
    sampleRate: SAMPLE_RATE,
    udpPort: AUDIO_UDP_PORT,
    httpPort: PORT,
    updatedAt: nowIso(),
  };
}

function broadcastStatus() {
  const status = getStatusPayload();
  lastAudioSourceCount = status.esp;
  const message = JSON.stringify(status);

  for (const socket of listenClients) {
    sendText(socket, message);
  }
}

function broadcastScanEvent(type, scan) {
  const message = JSON.stringify({
    type,
    scan,
    activeScanId: activeRecording ? activeRecording.scanId : null,
  });

  for (const socket of listenClients) {
    sendText(socket, message);
  }

  broadcastStatus();
}

function cleanupSocket(socket) {
  if (socket._cleanedUp) {
    return;
  }

  socket._cleanedUp = true;

  if (socket._wsRole === "esp") {
    espClients.delete(socket);
    if (socket._deviceId && deviceSockets.get(socket._deviceId) === socket) {
      deviceSockets.delete(socket._deviceId);
      void handleDeviceEvent(socket._deviceId, { type: "socket_disconnected" }).catch((err) =>
        console.error(`Device socket cleanup error: ${err.message}`)
      );
    }
    console.log("ESP disconnected");
  } else if (socket._wsRole === "listen") {
    listenClients.delete(socket);
    console.log("App/browser disconnected");
  }

  broadcastStatus();
}

function closeSocket(socket) {
  cleanupSocket(socket);
  try {
    sendFrame(socket, 0x8, Buffer.alloc(0));
    socket.end();
  } catch {
    socket.destroy();
  }
}

function pruneUdpAudioSources(now = Date.now()) {
  for (const [source, lastSeenAt] of udpAudioSources) {
    if (now - lastSeenAt > UDP_SOURCE_TIMEOUT_MS) {
      udpAudioSources.delete(source);
      console.log(`UDP audio source timed out: ${source}`);
    }
  }
}

function getAudioSourceCount() {
  pruneUdpAudioSources();
  return espClients.size + udpAudioSources.size;
}

function refreshDevicePresence() {
  const espCount = getAudioSourceCount();
  const device = db.devices.find((item) => item.id === "esp32-stethoscope");
  if (device) {
    device.connected = espCount > 0;
    device.status = espCount > 0 ? "connected" : "available";
    device.lastSeenAt = espCount > 0 ? nowIso() : device.lastSeenAt;
    device.updatedAt = nowIso();
  }
}

function refreshAudioSourceStatus() {
  const count = getAudioSourceCount();
  if (count !== lastAudioSourceCount) {
    lastAudioSourceCount = count;
    refreshDevicePresence();
    broadcastStatus();
  }
}

function broadcastAudio(payload) {
  for (const listener of listenClients) {
    sendBinary(listener, payload);
  }
}

function updateLiveMetrics(payload, source) {
  let sumSquares = 0;
  let peak = 0;
  let sampleCount = 0;

  for (let offset = 0; offset + 1 < payload.length; offset += 2) {
    const sample = payload.readInt16LE(offset);
    const abs = Math.abs(sample);
    sumSquares += sample * sample;
    sampleCount++;
    if (abs > peak) {
      peak = abs;
    }
    liveBeatDetector.ingest(sample);
  }

  const rms = sampleCount > 0 ? Math.sqrt(sumSquares / sampleCount) : 0;
  liveMetrics = {
    sampleRate: SAMPLE_RATE,
    channels: CHANNELS,
    bitsPerSample: BITS_PER_SAMPLE,
    peak,
    rms: Math.round(rms),
    levelPercent: Math.min(100, Math.round((rms / 32768) * 180)),
    bpm: liveBeatDetector.getBpm(),
    source,
    updatedAt: nowIso(),
  };
}

function maybeBroadcastLiveMetrics() {
  const now = Date.now();
  if (now - lastMetricBroadcastAt < LIVE_METRIC_INTERVAL_MS) {
    return;
  }

  lastMetricBroadcastAt = now;
  const message = JSON.stringify({
    type: "metrics",
    ...liveMetrics,
    recording: Boolean(activeRecording),
    activeScanId: activeRecording ? activeRecording.scanId : null,
  });

  for (const socket of listenClients) {
    sendText(socket, message);
  }
}

function handleIncomingAudio(payload, source) {
  if (payload.length === 0 || payload.length % 2 !== 0) {
    return false;
  }

  updateLiveMetrics(payload, source);
  recordAudioPayload(payload);
  broadcastAudio(payload);
  maybeBroadcastLiveMetrics();
  return true;
}

function handleBinary(socket, payload) {
  if (socket._wsRole !== "esp") {
    return;
  }

  if (socket._deviceId && (!socket._lastAudioTelemetryAt || Date.now() - socket._lastAudioTelemetryAt > 5000)) {
    socket._lastAudioTelemetryAt = Date.now();
    void handleDeviceTelemetry(socket._deviceId, {
      status: "connected",
      connectionMethod: "WSS",
      audioStatus: "streaming",
    }).catch((err) => console.error(`Device audio telemetry error: ${err.message}`));
  }

  handleIncomingAudio(payload, "websocket");
}

function handleEspText(socket, payload) {
  let message;
  try {
    message = JSON.parse(payload.toString("utf8"));
  } catch {
    return;
  }

  const type = readString(message.type, 80);
  if (type === "hello" || type === "telemetry") {
    void registerDeviceSocket(socket, message).catch((err) => {
      console.error(`Device hello/telemetry error: ${err.message}`);
      closeSocket(socket);
    });
    return;
  }

  const deviceId = readString(message.deviceId || socket._deviceId || socket._queryDeviceId, 120);
  if (!deviceId) {
    return;
  }
  void handleDeviceEvent(deviceId, message).catch((err) =>
    console.error(`Device event error: ${err.message}`)
  );
}

function handleText(socket, payload) {
  if (socket._wsRole === "esp") {
    handleEspText(socket, payload);
    return;
  }

  if (socket._wsRole !== "listen") {
    return;
  }

  let message;
  try {
    message = JSON.parse(payload.toString("utf8"));
  } catch {
    return;
  }

  if (message.type === "ping") {
    sendText(
      socket,
      JSON.stringify({
        type: "pong",
        id: message.id,
        sentAt: message.sentAt,
        serverAt: Date.now(),
      })
    );
    return;
  }

  if (message.type === "start_scan" || message.type === "stop_scan") {
    void handleScanSocketCommand(socket, message);
  }
}

async function handleScanSocketCommand(socket, message) {
  try {
    if (message.type === "start_scan") {
      const scan = startRecording(message.payload || message);
      sendText(socket, JSON.stringify({ type: "scan_started", scan }));
      return;
    }

    const scanId = message.scanId || (activeRecording && activeRecording.scanId);
    const scan = scanId ? await stopRecording(scanId) : await stopActiveRecording();
    sendText(socket, JSON.stringify({ type: "scan_stopped", scan }));
  } catch (err) {
    sendText(
      socket,
      JSON.stringify({
        type: "error",
        message: err.message || "Scan command failed",
      })
    );
  }
}

function readNextFrame(buffer) {
  if (buffer.length < 2) {
    return null;
  }

  const first = buffer[0];
  const second = buffer[1];
  const opcode = first & 0x0f;
  const masked = (second & 0x80) !== 0;
  let length = second & 0x7f;
  let offset = 2;

  if (length === 126) {
    if (buffer.length < offset + 2) {
      return null;
    }
    length = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (length === 127) {
    if (buffer.length < offset + 8) {
      return null;
    }
    const bigLength = buffer.readBigUInt64BE(offset);
    if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error("WebSocket frame is too large");
    }
    length = Number(bigLength);
    offset += 8;
  }

  let mask;
  if (masked) {
    if (buffer.length < offset + 4) {
      return null;
    }
    mask = buffer.subarray(offset, offset + 4);
    offset += 4;
  }

  if (buffer.length < offset + length) {
    return null;
  }

  const payload = Buffer.from(buffer.subarray(offset, offset + length));
  if (masked) {
    for (let i = 0; i < payload.length; i++) {
      payload[i] ^= mask[i % 4];
    }
  }

  return {
    frame: { opcode, payload },
    rest: buffer.subarray(offset + length),
  };
}

function handleWebSocketData(socket, chunk) {
  socket._wsBuffer = Buffer.concat([socket._wsBuffer, chunk]);

  while (socket._wsBuffer.length > 0) {
    const parsed = readNextFrame(socket._wsBuffer);
    if (!parsed) {
      return;
    }

    socket._wsBuffer = parsed.rest;
    const { opcode, payload } = parsed.frame;

    if (opcode === 0x8) {
      closeSocket(socket);
      return;
    }

    if (opcode === 0x9) {
      sendFrame(socket, 0xA, payload);
      continue;
    }

    if (opcode === 0x2) {
      handleBinary(socket, payload);
    } else if (opcode === 0x1) {
      handleText(socket, payload);
    }
  }
}

function readString(value, maxLength = 200) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().slice(0, maxLength);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function readOptionalNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function hashValue(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function publicDevice(device) {
  if (!device) return null;
  const { secret, claimCodeHash, ...safeDevice } = device;
  if (safeDevice.ota && typeof safeDevice.ota === "object") {
    const { token, ...safeOta } = safeDevice.ota;
    if (safeOta.firmwareFileId) {
      safeOta.url = "";
    }
    safeDevice.ota = safeOta;
  }
  const lastSeenMs = Date.parse(safeDevice.lastSeenAt || "");
  const heartbeatOnline = Number.isFinite(lastSeenMs) && Date.now() - lastSeenMs < 90 * 1000;
  return {
    ...safeDevice,
    online: Boolean(safeDevice.connected || heartbeatOnline),
  };
}

function publicDevices(devices) {
  return devices.map(publicDevice);
}

function getIdempotencyKey(req, payload = {}) {
  return readString(req.headers["idempotency-key"] || payload.idempotencyKey, 160);
}

function getIdempotencyScope(user) {
  return user ? user.id : "anonymous";
}

function findIdempotentResource(user, key, operation) {
  if (!key) {
    return null;
  }

  const scope = getIdempotencyScope(user);
  const entry = db.idempotencyKeys.find(
    (item) => item.key === key && item.scope === scope && item.operation === operation
  );
  if (!entry) {
    return null;
  }

  entry.lastSeenAt = nowIso();
  if (entry.resourceType === "scan") {
    return findScan(entry.resourceId);
  }
  return null;
}

function rememberIdempotentResource(user, key, operation, resourceType, resourceId) {
  if (!key) {
    return;
  }

  const scope = getIdempotencyScope(user);
  const existing = db.idempotencyKeys.find(
    (item) => item.key === key && item.scope === scope && item.operation === operation
  );

  if (existing) {
    existing.resourceType = resourceType;
    existing.resourceId = resourceId;
    existing.updatedAt = nowIso();
    return;
  }

  db.idempotencyKeys.unshift({
    id: createId("idem"),
    key,
    scope,
    operation,
    resourceType,
    resourceId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    lastSeenAt: nowIso(),
  });
  db.idempotencyKeys = db.idempotencyKeys.slice(0, 500);
}

function createPatientRecord(payload = {}) {
  const createdAt = nowIso();
  const patient = {
    id: createId("pat"),
    patientCode: readString(payload.patientCode, 80) || `PAT-${createdAt.slice(0, 10).replace(/-/g, "")}`,
    name: localizePatientName(payload.name) || "Bệnh nhân chưa xác định",
    age: readOptionalNumber(payload.age),
    gender: readString(payload.gender, 40),
    phone: readString(payload.phone, 40),
    email: readString(payload.email, 120),
    address: readString(payload.address, 240),
    notes: readString(payload.notes, 2000),
    organizationId: readString(payload.organizationId, 120) || "org_default_clinic",
    ownerUserId: readString(payload.ownerUserId, 120),
    guardianUserId: readString(payload.guardianUserId, 120),
    profileType: readString(payload.profileType, 60) || (payload.ownerUserId ? "dependent" : "patient"),
    relationship: readString(payload.relationship, 80),
    familyGroupId: readString(payload.familyGroupId, 120),
    accountUserId: readString(payload.accountUserId, 120),
    primaryDoctorId: readString(payload.primaryDoctorId, 120),
    doctorName: readString(payload.doctorName, 160),
    createdAt,
    updatedAt: createdAt,
  };

  db.patients.unshift(patient);
  return patient;
}

function updatePatientRecord(patient, payload = {}) {
  const fields = [
    "patientCode",
    "name",
    "gender",
    "phone",
    "email",
    "address",
    "notes",
    "profileType",
    "relationship",
    "familyGroupId",
    "guardianUserId",
    "accountUserId",
    "primaryDoctorId",
    "doctorName",
  ];

  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      patient[field] = readString(payload[field], field === "notes" ? 2000 : 240);
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "age")) {
    patient.age = readOptionalNumber(payload.age);
  }

  patient.updatedAt = nowIso();
  return patient;
}

function getPatientStats(patientId) {
  const scans = db.scans.filter((scan) => scan.patientId === patientId);
  const latest = scans.reduce((winner, scan) => {
    const time = scan.startedAt || scan.createdAt || "";
    if (!winner || time > (winner.startedAt || winner.createdAt || "")) {
      return scan;
    }
    return winner;
  }, null);

  return {
    scanCount: scans.length,
    lastScanAt: latest ? latest.startedAt : null,
    lastAiLabel: latest ? latest.aiLabel : null,
  };
}

function withPatientStats(patient) {
  const doctorId =
    readString(patient.primaryDoctorId, 120) ||
    readString(patient.doctorUserId, 120) ||
    readString(patient.doctorId, 120) ||
    readString(patient.assignedDoctorId, 120) ||
    readString(patient.ownerUserId, 120);
  const doctor = doctorId ? db.users.find((user) => user.id === doctorId && user.role === "doctor") : null;
  return {
    ...patient,
    primaryDoctorId: doctor?.id || readString(patient.primaryDoctorId, 120),
    doctorName: doctor?.name || readString(patient.doctorName, 160),
    ...getPatientStats(patient.id),
  };
}

function findPatient(patientId) {
  return db.patients.find((patient) => patient.id === patientId);
}

function findScan(scanId) {
  return db.scans.find((scan) => scan.id === scanId);
}

function findDevice(deviceId) {
  return db.devices.find((device) => device.id === deviceId);
}

function isDoctorUser(user) {
  return user && (user.role === "doctor" || user.role === "admin");
}

function isPatientUser(user) {
  return user && user.role === "patient";
}

function hasCapability(user, capability) {
  return getUserWorkspaceContext(user).capabilities.includes(capability);
}

function hasAnyCapability(user, capabilities) {
  return capabilities.some((capability) => hasCapability(user, capability));
}

function isPlatformAdminUser(user) {
  return Boolean(user && (user.role === "admin" || hasCapability(user, "platform.dashboard.view")));
}

function requireAnyCapability(user, capabilities, message = "Không có quyền thực hiện thao tác này") {
  if (!hasAnyCapability(user, capabilities)) {
    throw httpError(403, message);
  }
}

const DASHBOARD_VIEW_CAPABILITIES = [
  "platform.dashboard.view",
  "workspace.dashboard.view",
];
const STORAGE_READ_CAPABILITIES = [
  "platform.storage.manage",
  "workspace.storage.manage",
  "workspace.scans.view",
  "workspace.scans.manage",
  "personal.scans.manage",
];
const STORAGE_MANAGE_CAPABILITIES = ["platform.storage.manage", "workspace.storage.manage"];
const REPORT_EXPORT_CAPABILITIES = [
  "platform.reports.view",
  "workspace.reports.view",
  "billing.view",
  "platform.storage.manage",
  "workspace.storage.manage",
  "personal.scans.manage",
];
const WORKSPACE_VIEW_CAPABILITIES = ["platform.workspaces.manage", "workspace.dashboard.view"];
const WORKSPACE_MANAGE_CAPABILITIES = ["platform.workspaces.manage", "workspace.settings.manage"];
const PACKAGE_MANAGE_CAPABILITIES = ["platform.packages.manage"];
const DOCTOR_MANAGE_CAPABILITIES = [
  "platform.doctorRequests.manage",
  "platform.users.manage",
  "workspace.staff.manage",
];
const PATIENT_MANAGE_CAPABILITIES = [
  "platform.patients.manage",
  "workspace.patients.manage",
  "personal.profiles.manage",
];
const SHARING_MANAGE_CAPABILITIES = [
  "platform.patients.manage",
  "workspace.patients.manage",
  "personal.sharing.manage",
];
const MANAGED_ADMIN_ROLES = new Set(["admin", "platform_admin", "workspace_admin", "workspace_owner"]);

function requireRole(req, roles) {
  const user = requireSessionUser(req);
  if (!roles.includes(user.role)) {
    throw httpError(403, "Role is not allowed for this endpoint");
  }
  return user;
}

function ensurePatientProfileForUser(user) {
  if (!isPatientUser(user)) {
    return null;
  }

  if (user.patientId) {
    const existing = findPatient(user.patientId);
    if (existing) {
      return existing;
    }
  }

  const email = readString(user.email, 160).toLowerCase();
  const phone = readString(user.phone, 40).replace(/\s/g, "");
  let patient = db.patients.find((item) => {
    const itemEmail = readString(item.email, 160).toLowerCase();
    const itemPhone = readString(item.phone, 40).replace(/\s/g, "");
    return (email && itemEmail === email) || (phone && itemPhone === phone);
  });

  if (!patient) {
    patient = createPatientRecord({
      patientCode: `SELF-${user.id.replace(/^usr_?/, "").slice(0, 12)}`,
      name: user.name,
      phone: user.phone,
      email: user.email,
      address: user.address,
      ownerUserId: user.id,
      accountUserId: user.id,
      profileType: "self",
      relationship: "self",
      organizationId: user.organizationId,
      notes: "Patient profile created for app account",
    });
  }

  user.patientId = patient.id;
  patient.ownerUserId = user.id;
  patient.accountUserId = patient.accountUserId || user.id;
  patient.profileType = patient.profileType || "self";
  patient.relationship = patient.relationship || "self";
  patient.organizationId = patient.organizationId || user.organizationId || "org_default_clinic";
  return patient;
}

function isActiveAccessGrant(grant) {
  if (!grant || grant.revokedAt) {
    return false;
  }
  if (!grant.expiresAt) {
    return true;
  }
  const expiresAt = new Date(grant.expiresAt).getTime();
  return Number.isNaN(expiresAt) || expiresAt > Date.now();
}

function getDoctorPatientGrantIds(user) {
  if (!user) {
    return new Set();
  }
  return new Set(
    db.doctorPatientAccess
      .filter((grant) => (grant.doctorUserId === user.id || grant.doctorId === user.id) && isActiveAccessGrant(grant))
      .map((grant) => grant.patientId)
      .filter(Boolean),
  );
}

function getWorkspacePatientGrantIds(user) {
  if (!user) {
    return new Set();
  }
  const workspaceId = getUserWorkspaceContext(user).currentWorkspaceId;
  if (!workspaceId) {
    return new Set();
  }
  return new Set(
    db.doctorPatientAccess
      .filter((grant) => grant.organizationId === workspaceId && isActiveAccessGrant(grant))
      .map((grant) => grant.patientId)
      .filter(Boolean),
  );
}

function getActivePatientGrantsForUser(user, patientId) {
  if (!user || !patientId) {
    return [];
  }
  const workspaceId = getUserWorkspaceContext(user).currentWorkspaceId;
  return db.doctorPatientAccess.filter((grant) => {
    if (grant.patientId !== patientId || !isActiveAccessGrant(grant)) {
      return false;
    }
    if (grant.doctorUserId === user.id || grant.doctorId === user.id) {
      return true;
    }
    return Boolean(workspaceId && grant.organizationId === workspaceId);
  });
}

function hasDirectPatientAccess(user, patient) {
  if (!user || !patient) {
    return false;
  }
  if (isPlatformAdminUser(user)) {
    return true;
  }
  if (isPatientUser(user)) {
    const selfProfile = ensurePatientProfileForUser(user);
    return Boolean((selfProfile && selfProfile.id === patient.id) || patient.ownerUserId === user.id);
  }
  if (patient.ownerUserId && patient.ownerUserId === user.id) {
    return true;
  }
  const workspaceContext = getUserWorkspaceContext(user);
  return Boolean(
    patient.organizationId &&
      patient.organizationId === workspaceContext.currentWorkspaceId &&
      hasAnyCapability(user, ["workspace.patients.view", "workspace.patients.manage"]),
  );
}

function canAccessPatient(user, patientId) {
  if (!user || !patientId) {
    return false;
  }
  if (isPlatformAdminUser(user)) {
    return true;
  }
  const requestedPatient = findPatient(patientId);
  if (hasDirectPatientAccess(user, requestedPatient)) {
    return true;
  }
  if (isPatientUser(user)) {
    return false;
  }
  const patient = requestedPatient;
  if (!patient) {
    return false;
  }
  const workspaceContext = getUserWorkspaceContext(user);
  const isSameWorkspace = Boolean(
    patient.organizationId &&
      workspaceContext.currentWorkspaceId &&
      patient.organizationId === workspaceContext.currentWorkspaceId,
  );
  const grantIds = getDoctorPatientGrantIds(user);
  if (user.role === "doctor" && grantIds.size > 0) {
    return grantIds.has(patient.id);
  }
  const workspaceGrantIds = getWorkspacePatientGrantIds(user);
  if (workspaceGrantIds.has(patient.id) && hasAnyCapability(user, ["workspace.patients.view", "workspace.patients.manage"])) {
    return true;
  }
  return isSameWorkspace && hasAnyCapability(user, ["workspace.patients.view", "workspace.patients.manage"]);
}

function assertCanAccessPatient(user, patientId) {
  if (!canAccessPatient(user, patientId)) {
    throw httpError(403, "Patient record is outside current user scope");
  }
}

function canManagePatientSharing(user, patient) {
  if (!user || !patient) {
    return false;
  }
  if (isPlatformAdminUser(user)) {
    return true;
  }
  if (patient.ownerUserId && patient.ownerUserId === user.id && hasCapability(user, "personal.sharing.manage")) {
    return true;
  }
  return canAccessPatient(user, patient.id) && hasAnyCapability(user, SHARING_MANAGE_CAPABILITIES);
}

function assertCanManagePatientSharing(user, patient) {
  if (!canManagePatientSharing(user, patient)) {
    throw httpError(403, "Không có quyền chia sẻ hồ sơ sức khỏe này");
  }
}

function canAccessScan(user, scan) {
  if (!scan) {
    return false;
  }
  const patient = findPatient(scan.patientId);
  if (hasDirectPatientAccess(user, patient)) {
    return true;
  }
  const grants = getActivePatientGrantsForUser(user, scan.patientId);
  if (grants.length > 0) {
    return grants.some((grant) => {
      const scanIds = Array.isArray(grant.scanIds) ? grant.scanIds : [];
      return scanIds.length === 0 || grant.scope !== "selected_scans" || scanIds.includes(scan.id);
    });
  }
  return false;
}

function assertCanAccessScan(user, scan) {
  if (!canAccessScan(user, scan)) {
    throw httpError(403, "Scan is outside current user scope");
  }
}

function filterPatientsForUser(user, patients) {
  if (isPlatformAdminUser(user)) {
    return patients;
  }
  if (isPatientUser(user)) {
    const patient = ensurePatientProfileForUser(user);
    return patient ? patients.filter((item) => item.id === patient.id || item.ownerUserId === user.id) : [];
  }
  if (hasAnyCapability(user, ["workspace.patients.view", "workspace.patients.manage"])) {
    const workspaceContext = getUserWorkspaceContext(user);
    const grantIds = getDoctorPatientGrantIds(user);
    const workspaceGrantIds = getWorkspacePatientGrantIds(user);
    return patients.filter((patient) => {
      if (patient.ownerUserId && patient.ownerUserId === user.id) {
        return true;
      }
      if (user.role === "doctor" && grantIds.size > 0) {
        return grantIds.has(patient.id);
      }
      if (workspaceGrantIds.has(patient.id)) {
        return true;
      }
      return Boolean(patient.organizationId && patient.organizationId === workspaceContext.currentWorkspaceId);
    });
  }
  return [];
}

function filterScansForUser(user, scans) {
  if (isPlatformAdminUser(user)) {
    return scans;
  }
  return scans.filter((scan) => canAccessPatient(user, scan.patientId));
}

function getWritableWorkspaceIdForUser(user, requestedWorkspaceId = "") {
  if (isPlatformAdminUser(user)) {
    return readString(requestedWorkspaceId, 120) || user.organizationId || "org_default_clinic";
  }
  return getUserWorkspaceContext(user).currentWorkspaceId || user?.organizationId || "org_default_clinic";
}

function getDeviceWorkspaceId(device) {
  return device?.organizationId || "org_default_clinic";
}

function canAccessDevice(user, device) {
  if (!user || !device) {
    return false;
  }
  if (isPlatformAdminUser(user)) {
    return true;
  }
  if (device.pairedUserId && device.pairedUserId === user.id) {
    return true;
  }
  const workspaceContext = getUserWorkspaceContext(user);
  const isSameWorkspace = getDeviceWorkspaceId(device) === workspaceContext.currentWorkspaceId;
  return (
    isSameWorkspace &&
    hasAnyCapability(user, [
      "workspace.devices.view",
      "workspace.devices.manage",
      "personal.devices.manage",
    ])
  );
}

function canManageDevice(user, device) {
  return (
    canAccessDevice(user, device) &&
    hasAnyCapability(user, [
      "platform.devices.manage",
      "workspace.devices.manage",
      "personal.devices.manage",
    ])
  );
}

function assertCanAccessDevice(user, device) {
  if (!canAccessDevice(user, device)) {
    throw httpError(403, "Device is outside current user scope");
  }
}

function assertCanManageDevice(user, device) {
  if (!canManageDevice(user, device)) {
    throw httpError(403, "Không có quyền quản lý thiết bị trong workspace này");
  }
}

function filterDevicesForUser(user, devices) {
  if (isPlatformAdminUser(user)) {
    return devices;
  }
  return devices.filter((device) => canAccessDevice(user, device));
}

function canManageScan(user, scan) {
  return (
    scan &&
    canAccessPatient(user, scan.patientId) &&
    hasAnyCapability(user, [
      "platform.scans.manage",
      "workspace.scans.manage",
      "personal.scans.manage",
    ])
  );
}

function assertCanManageScan(user, scan) {
  if (!canManageScan(user, scan)) {
    throw httpError(403, "Không có quyền cập nhật lượt đo trong workspace này");
  }
}

function getObjectKeyOrganizationId(objectKey) {
  const parts = readString(objectKey, 1000).split(/[\\/]+/).filter(Boolean);
  const orgIndex = parts.findIndex((part) => part === "org");
  return orgIndex >= 0 ? readString(parts[orgIndex + 1], 120) : "";
}

function isSameCurrentWorkspace(user, organizationId) {
  const orgId = readString(organizationId, 120);
  return Boolean(orgId && getUserWorkspaceContext(user).currentWorkspaceId === orgId);
}

function canAccessStorageRecord(user, record) {
  if (!user || !record) {
    return false;
  }
  if (isPlatformAdminUser(user)) {
    return true;
  }
  const source = getStorageFileSource(record);
  if (source.scan) {
    return canAccessScan(user, source.scan);
  }
  if (source.storageFile?.createdByUserId && source.storageFile.createdByUserId === user.id) {
    return true;
  }
  const organizationId =
    record.organizationId ||
    source.storageFile?.organizationId ||
    getObjectKeyOrganizationId(record.objectKey || source.audioFile?.objectKey || source.storageFile?.objectKey);
  if (source.storageFile && !source.scan) {
    return isSameCurrentWorkspace(user, organizationId) && hasCapability(user, "workspace.storage.manage");
  }
  return (
    isSameCurrentWorkspace(user, organizationId) &&
    hasAnyCapability(user, ["workspace.storage.manage", "workspace.scans.view", "workspace.scans.manage"])
  );
}

function canManageStorageRecord(user, record) {
  return (
    canAccessStorageRecord(user, record) &&
    hasAnyCapability(user, ["platform.storage.manage", "workspace.storage.manage"])
  );
}

function assertCanAccessStorageRecord(user, record) {
  if (!canAccessStorageRecord(user, record)) {
    throw httpError(403, "Storage file is outside current user scope");
  }
}

function assertCanManageStorageRecord(user, record) {
  if (!canManageStorageRecord(user, record)) {
    throw httpError(403, "Không có quyền quản lý tệp lưu trữ trong workspace này");
  }
}

function filterStorageRecordsForUser(user, records) {
  if (isPlatformAdminUser(user)) {
    return records;
  }
  return records.filter((record) => canAccessStorageRecord(user, record));
}

function canAccessObjectKey(user, objectKey) {
  if (!user || !objectKey) {
    return false;
  }
  if (isPlatformAdminUser(user)) {
    return true;
  }
  const audioFile = db.audioFiles.find((file) => file.objectKey === objectKey);
  const scan = audioFile ? findScan(audioFile.scanId) : null;
  if (scan) {
    return canAccessScan(user, scan);
  }
  const storageFile = db.storageFiles.find((file) => file.objectKey === objectKey);
  if (storageFile) {
    return canAccessStorageRecord(user, {
      id: storageFile.id,
      objectKey,
      organizationId: storageFile.organizationId,
      scanId: "",
    });
  }
  const organizationId = getObjectKeyOrganizationId(objectKey);
  return (
    isSameCurrentWorkspace(user, organizationId) &&
    hasAnyCapability(user, [
      "workspace.storage.manage",
      "workspace.scans.view",
      "workspace.scans.manage",
      "personal.scans.manage",
    ])
  );
}

function canAccessNotification(user, notification) {
  if (!user || !notification) {
    return false;
  }
  if (isPlatformAdminUser(user)) {
    return true;
  }
  if (notification.userId && notification.userId === user.id) {
    return true;
  }
  if (notification.organizationId) {
    return isSameCurrentWorkspace(user, notification.organizationId) && hasCapability(user, "notifications.view");
  }
  return !notification.userId && !notification.organizationId;
}

function filterNotificationsForUser(user, notifications) {
  if (isPlatformAdminUser(user)) {
    return notifications;
  }
  return notifications.filter((notification) => canAccessNotification(user, notification));
}

function filterExportsForUser(user, exportsList) {
  if (isPlatformAdminUser(user)) {
    return exportsList;
  }
  return exportsList.filter((exportJob) => {
    if (exportJob.createdByUserId && exportJob.createdByUserId === user.id) {
      return true;
    }
    return exportJob.organizationId && isSameCurrentWorkspace(user, exportJob.organizationId);
  });
}

function filterAccessLogsForUser(user, logs) {
  if (isPlatformAdminUser(user)) {
    return logs;
  }
  if (!hasAnyCapability(user, ["workspace.audit.view", "workspace.settings.manage"])) {
    return [];
  }
  return logs.filter((log) => {
    if (log.userId && log.userId === user.id) {
      return true;
    }
    return log.organizationId && isSameCurrentWorkspace(user, log.organizationId);
  });
}

function resolvePatientForScan(payload, actorUser = null) {
  if (isPatientUser(actorUser)) {
    const patientId = readString(payload.patientId, 120);
    if (patientId) {
      const patient = findPatient(patientId);
      if (!patient) {
        throw httpError(404, "Không tìm thấy hồ sơ sức khỏe");
      }
      assertCanAccessPatient(actorUser, patient.id);
      return patient;
    }
    return ensurePatientProfileForUser(actorUser);
  }

  const patientId = readString(payload.patientId, 120);
  if (patientId) {
    const patient = findPatient(patientId);
    if (!patient) {
      throw httpError(404, "Không tìm thấy bệnh nhân");
    }
    if (actorUser) {
      assertCanAccessPatient(actorUser, patient.id);
    }
    return patient;
  }

  const inlinePatient = payload.patient && typeof payload.patient === "object" ? payload.patient : {};
  const patientName = localizePatientName(payload.patientName);
  const patientCode = readString(payload.patientCode, 80);
  const organizationId = getWritableWorkspaceIdForUser(actorUser, payload.organizationId || inlinePatient.organizationId);

  if (patientName || patientCode || Object.keys(inlinePatient).length > 0) {
    return createPatientRecord({
      ...inlinePatient,
      name: inlinePatient.name || patientName,
      patientCode: inlinePatient.patientCode || patientCode,
      organizationId,
      ownerUserId: isPatientUser(actorUser) ? actorUser.id : readString(inlinePatient.ownerUserId, 120),
    });
  }

  return createPatientRecord({
    name: "Bệnh nhân vãng lai",
    patientCode: `WALKIN-${Date.now()}`,
    organizationId,
    ownerUserId: isPatientUser(actorUser) ? actorUser.id : "",
  });
}

function buildPatientSnapshot(patient) {
  if (!patient) {
    return null;
  }

  return {
    id: patient.id,
    patientCode: patient.patientCode,
    name: patient.name,
    age: patient.age,
    gender: patient.gender,
  };
}

async function createScanSession(payload = {}, actorUser = null) {
  const patient = resolvePatientForScan(payload, actorUser);
  const createdAt = nowIso();
  const deviceId = readString(payload.deviceId, 120) || "esp32-stethoscope";
  const device = findDevice(deviceId);
  if (device && actorUser) {
    assertCanAccessDevice(actorUser, device);
  }
  const scan = {
    id: createId("scan"),
    organizationId: patient.organizationId || (actorUser ? actorUser.organizationId : "") || "org_default_clinic",
    patientId: patient.id,
    patient: buildPatientSnapshot(patient),
    status: "created",
    processingStatus: "created",
    mode: readString(payload.mode, 40) || "heart",
    bodySite: readString(payload.bodySite || payload.location, 120),
    deviceId,
    startedAt: createdAt,
    endedAt: null,
    sampleRate: SAMPLE_RATE,
    channels: CHANNELS,
    bitsPerSample: BITS_PER_SAMPLE,
    sampleCount: 0,
    durationSeconds: 0,
    peak: 0,
    rms: 0,
    levelPercent: 0,
    bpm: 0,
    aiLabel: "created",
    aiConfidence: null,
    aiSummary: "",
    processingChunks: [],
    doctorNotes: readString(payload.doctorNotes || payload.notes, 4000),
    createdByUserId: actorUser ? actorUser.id : "",
    idempotencyKey: readString(payload.idempotencyKey, 160),
    audioUrl: null,
    wavFile: null,
    createdAt,
    updatedAt: createdAt,
  };
  db.scans.unshift(scan);
  await saveScanRecord(scan);
  broadcastScanEvent("scan_created", scan);
  return scan;
}

async function appendScanAudioChunk(scan, chunkBuffer) {
  if (!chunkBuffer.length) {
    throw httpError(400, "Audio chunk is empty");
  }
  const chunkFile = path.join(TMP_DIR, `${scan.id}.chunks.pcm`);
  await fs.promises.appendFile(chunkFile, chunkBuffer);
  scan.status = "uploading";
  scan.processingStatus = "uploading";
  scan.uploadedBytes = Number(scan.uploadedBytes || 0) + chunkBuffer.length;
  scan.updatedAt = nowIso();
  await saveScanRecord(scan);
  return {
    scan,
    uploadedBytes: scan.uploadedBytes,
  };
}

async function completeUploadedScan(scan) {
  const chunkFile = path.join(TMP_DIR, `${scan.id}.chunks.pcm`);
  if (!fs.existsSync(chunkFile)) {
    throw httpError(404, "Không tìm thấy audio chunk để hoàn tất lượt đo");
  }
  const wavFile = `${scan.id}.wav`;
  const wavFilePath = path.join(AUDIO_DIR, wavFile);
  const byteSize = fs.statSync(chunkFile).size;
  await writeWavFile(chunkFile, wavFilePath, byteSize);
  fs.rmSync(chunkFile, { force: true });

  scan.status = "queued";
  scan.processingStatus = "queued";
  scan.wavFile = wavFile;
  scan.endedAt = nowIso();
  scan.updatedAt = nowIso();
  await saveScanRecord(scan);

  const processingResult = await runInlineAudioProcessing(scan, wavFilePath);
  const quality = processingResult.processed.quality;
  const audioFile = {
    id: createId("audio"),
    scanId: scan.id,
    patientId: scan.patientId,
    storageProvider: processingResult.audioUpload.provider,
    objectKey: processingResult.audioObjectKey,
    contentType: "audio/wav",
    byteSize: processingResult.audioUpload.byteSize,
    sampleRate: scan.sampleRate || SAMPLE_RATE,
    createdAt: nowIso(),
  };
  const aiResult = {
    id: createId("ai"),
    scanId: scan.id,
    modelVersion: db.settings.ai.version || "signal-quality-demo",
    label: quality.label,
    confidence: quality.confidence,
    summary: quality.summary,
    rawResult: {
      quality,
      waveformObjectKey: processingResult.waveformObjectKey,
    },
    status: "completed",
    createdAt: nowIso(),
  };
  Object.assign(scan, {
    status: "completed",
    processingStatus: "completed",
    sampleCount: Math.max(0, Math.floor(byteSize / 2)),
    durationSeconds: Number((Math.max(0, Math.floor(byteSize / 2)) / (scan.sampleRate || SAMPLE_RATE)).toFixed(2)),
    peak: quality.peak,
    rms: quality.rms,
    levelPercent: quality.signalLevel,
    aiLabel: aiResult.label,
    aiConfidence: aiResult.confidence,
    aiSummary: aiResult.summary,
    aiResultId: aiResult.id,
    audioFileId: audioFile.id,
    audioUrl: `/api/scans/${scan.id}/audio`,
    updatedAt: nowIso(),
  });
  db.audioFiles.unshift(audioFile);
  db.aiResults.unshift(aiResult);
  await saveAudioArtifacts(scan, audioFile, aiResult);
  await enqueueAudioProcessing(scan, wavFilePath);
  broadcastScanEvent("scan_completed", scan);
  return scan;
}

function startRecording(payload = {}, actorUser = null) {
  if (activeRecording) {
    throw httpError(409, "Đang có lượt ghi khác");
  }

  const patient = resolvePatientForScan(payload, actorUser);
  const scanId = createId("scan");
  const startedAt = nowIso();
  const wavFile = `${scanId}.wav`;
  const rawFilePath = path.join(TMP_DIR, `${scanId}.pcm`);
  const wavFilePath = path.join(AUDIO_DIR, wavFile);
  const mode = readString(payload.mode, 40) || "heart";
  const bodySite = readString(payload.bodySite || payload.location, 120);
  const deviceId = readString(payload.deviceId, 120) || "esp32-stethoscope";
  const device = findDevice(deviceId);
  if (device && actorUser) {
    assertCanAccessDevice(actorUser, device);
  }

  const scan = {
    id: scanId,
    organizationId: patient.organizationId || (actorUser ? actorUser.organizationId : "") || "org_default_clinic",
    patientId: patient.id,
    patient: buildPatientSnapshot(patient),
    status: "recording",
    mode,
    bodySite,
    deviceId,
    startedAt,
    endedAt: null,
    sampleRate: SAMPLE_RATE,
    channels: CHANNELS,
    bitsPerSample: BITS_PER_SAMPLE,
    sampleCount: 0,
    durationSeconds: 0,
    peak: 0,
    rms: 0,
    levelPercent: 0,
    bpm: 0,
    aiLabel: "recording",
    aiConfidence: null,
    aiSummary: "",
    processingStatus: "recording",
    doctorNotes: readString(payload.doctorNotes || payload.notes, 4000),
    createdByUserId: actorUser ? actorUser.id : "",
    idempotencyKey: readString(payload.idempotencyKey, 160),
    audioUrl: null,
    wavFile: null,
    createdAt: startedAt,
    updatedAt: startedAt,
  };

  db.scans.unshift(scan);
  activeRecording = {
    scanId,
    startedAt,
    rawFilePath,
    wavFilePath,
    wavFile,
    bytes: 0,
    metrics: new RecordingMetrics(),
    stream: fs.createWriteStream(rawFilePath),
    lastSavedAt: 0,
  };

  activeRecording.stream.on("error", (err) => {
    console.error(`Recording stream error: ${err.message}`);
  });

  void saveScanRecord(scan);
  broadcastScanEvent("scan_started", scan);
  return scan;
}

function recordAudioPayload(payload) {
  if (!activeRecording) {
    return;
  }

  activeRecording.stream.write(payload);
  activeRecording.bytes += payload.length;
  activeRecording.metrics.ingestBuffer(payload);
  saveActiveRecordingProgress(false);
}

function saveActiveRecordingProgress(force) {
  if (!activeRecording) {
    return null;
  }

  const now = Date.now();
  if (!force && now - activeRecording.lastSavedAt < 1000) {
    return null;
  }

  const scan = findScan(activeRecording.scanId);
  if (!scan) {
    return null;
  }

  Object.assign(scan, activeRecording.metrics.getSummary(), {
    updatedAt: nowIso(),
  });
  activeRecording.lastSavedAt = now;
  void saveScanRecord(scan);
  return scan;
}

async function stopRecording(scanId) {
  if (!scanId) {
    throw httpError(400, "Thiếu mã lượt đo");
  }

  const scan = findScan(scanId);
  if (!scan) {
    throw httpError(404, "Không tìm thấy lượt đo");
  }

  if (!activeRecording || activeRecording.scanId !== scanId) {
    if (scan.status === "completed") {
      return scan;
    }
    if (scan.status === "recording") {
      return markRecordingInterrupted(scan, "Lượt ghi đã dừng nhưng không còn luồng âm thanh hoạt động. Không tạo được file WAV hoàn chỉnh.");
    }
    return scan;
  }

  const recording = activeRecording;
  saveActiveRecordingProgress(true);
  activeRecording = null;

  await finishWriteStream(recording.stream);
  await writeWavFile(recording.rawFilePath, recording.wavFilePath, recording.bytes);
  fs.rmSync(recording.rawFilePath, { force: true });

  const summary = recording.metrics.getSummary();
  const signalReview = buildSignalReview(summary);
  const processingResult = await runInlineAudioProcessing(scan, recording.wavFilePath);
  const audioFile = {
    id: createId("audio"),
    scanId: scan.id,
    patientId: scan.patientId,
    storageProvider: processingResult.audioUpload.provider,
    objectKey: processingResult.audioObjectKey,
    contentType: "audio/wav",
    byteSize: processingResult.audioUpload.byteSize || recording.bytes + 44,
    sampleRate: SAMPLE_RATE,
    createdAt: nowIso(),
  };
  const aiResult = {
    id: createId("ai"),
    scanId: scan.id,
    modelVersion: db.settings.ai.version || "signal-quality-demo",
    label: processingResult.processed.quality.label || signalReview.label,
    confidence: processingResult.processed.quality.confidence || signalReview.confidence,
    summary: processingResult.processed.quality.summary || signalReview.summary,
    rawResult: {
      quality: processingResult.processed.quality,
      waveformObjectKey: processingResult.waveformObjectKey,
    },
    status: "completed",
    createdAt: nowIso(),
  };
  db.audioFiles.unshift(audioFile);
  db.aiResults.unshift(aiResult);
  db.audioFiles = db.audioFiles.slice(0, 500);
  db.aiResults = db.aiResults.slice(0, 500);
  Object.assign(scan, summary, {
    status: "completed",
    processingStatus: "completed",
    endedAt: nowIso(),
    aiLabel: aiResult.label,
    aiConfidence: aiResult.confidence,
    aiSummary: aiResult.summary,
    aiResultId: aiResult.id,
    audioFileId: audioFile.id,
    audioUrl: `/api/scans/${scan.id}/audio`,
    wavFile: recording.wavFile,
    updatedAt: nowIso(),
  });

  await saveAudioArtifacts(scan, audioFile, aiResult);
  await enqueueAudioProcessing(scan, recording.wavFilePath);
  broadcastScanEvent("scan_stopped", scan);
  return scan;
}

async function stopActiveRecording() {
  if (activeRecording) {
    return stopRecording(activeRecording.scanId);
  }

  const staleScan = db.scans.find((scan) => scan.status === "recording");
  if (staleScan) {
    return markRecordingInterrupted(staleScan, "Lượt ghi được dừng sau khi luồng âm thanh đã đóng. Hãy tạo lượt đo mới để có file WAV đầy đủ.");
  }

  throw httpError(409, "Không có lượt ghi đang chạy");
}

function markRecordingInterrupted(scan, summary) {
  Object.assign(scan, {
    status: "interrupted",
    endedAt: scan.endedAt || nowIso(),
    aiLabel: "interrupted",
    aiConfidence: null,
    aiSummary: scan.aiSummary || summary,
    updatedAt: nowIso(),
  });

  saveDb();
  broadcastScanEvent("scan_interrupted", scan);
  return scan;
}

function finishWriteStream(stream) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const settle = (err) => {
      if (settled) {
        return;
      }
      settled = true;
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    };

    stream.once("error", settle);
    stream.end(() => settle());
  });
}

function buildSignalReview(summary) {
  if (summary.durationSeconds < 1) {
    return {
      label: "too_short",
      confidence: 0.4,
      summary: "Thời lượng ghi dưới 1 giây. Hãy ghi lâu hơn trước khi xem xét kết quả.",
    };
  }

  if (summary.rms < 80 || summary.levelPercent < 1) {
    return {
      label: "low_signal",
      confidence: 0.7,
      summary: "Mức tín hiệu rất thấp. Kiểm tra tiếp xúc cảm biến và đo lại nếu dạng sóng gần như phẳng.",
    };
  }

  if (summary.peak > 32000) {
    return {
      label: "clipping_risk",
      confidence: 0.75,
      summary: "Tín hiệu có đỉnh quá cao, gần bị méo. Giảm gain hoặc đặt lại cảm biến trước khi đánh giá.",
    };
  }

  return {
    label: "captured",
    confidence: 0.65,
    summary:
      "Âm thanh đã được ghi và lưu. Hệ thống hiện chỉ kiểm tra chất lượng tín hiệu; phần chẩn đoán lâm sàng có thể bổ sung sau.",
  };
}

function buildWavHeader(dataBytes) {
  const header = Buffer.alloc(44);
  const byteRate = SAMPLE_RATE * CHANNELS * (BITS_PER_SAMPLE / 8);
  const blockAlign = CHANNELS * (BITS_PER_SAMPLE / 8);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + dataBytes, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(CHANNELS, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(BITS_PER_SAMPLE, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataBytes, 40);

  return header;
}

function writeWavFile(rawFilePath, wavFilePath, dataBytes) {
  return new Promise((resolve, reject) => {
    const input = fs.createReadStream(rawFilePath);
    const output = fs.createWriteStream(wavFilePath);

    input.on("error", reject);
    output.on("error", reject);
    output.on("finish", resolve);
    output.write(buildWavHeader(dataBytes));
    input.pipe(output);
  });
}

function defaultErrorCode(statusCode) {
  if (statusCode === 400) return "BAD_REQUEST";
  if (statusCode === 401) return "UNAUTHORIZED";
  if (statusCode === 403) return "FORBIDDEN";
  if (statusCode === 404) return "NOT_FOUND";
  if (statusCode === 409) return "CONFLICT";
  if (statusCode === 410) return "GONE";
  if (statusCode === 413) return "PAYLOAD_TOO_LARGE";
  if (statusCode === 429) return "RATE_LIMITED";
  return statusCode >= 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR";
}

function normalizeErrorCode(code, statusCode) {
  if (!code) {
    return defaultErrorCode(statusCode);
  }
  return String(code).trim().replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toUpperCase() || defaultErrorCode(statusCode);
}

function httpError(statusCode, message, code, details) {
  const err = new Error(message);
  err.statusCode = statusCode;
  if (code) {
    err.code = code;
  }
  if (details) {
    err.details = details;
  }
  return err;
}

function getConfiguredCorsOrigins() {
  const raw = readString(process.env.CORS_ORIGIN, 2000) || "*";
  if (raw === "*") return ["*"];
  return raw
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function resolveCorsOrigin(req) {
  const configured = getConfiguredCorsOrigins();
  if (!configured.length || configured.includes("*")) {
    return "*";
  }
  const requestOrigin = req && typeof req.headers.origin === "string" ? req.headers.origin.trim() : "";
  if (requestOrigin && configured.includes(requestOrigin)) {
    return requestOrigin;
  }
  return configured[0];
}

function setCommonHeaders(res, req = res.__smartHealthRequest) {
  const corsOrigin = resolveCorsOrigin(req);
  res.setHeader("Access-Control-Allow-Origin", corsOrigin);
  if (corsOrigin !== "*") {
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Idempotency-Key, X-File-Name");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

function sendJson(res, statusCode, value) {
  setCommonHeaders(res);
  requestMetrics.total += 1;
  requestMetrics.byStatus[statusCode] = (requestMetrics.byStatus[statusCode] || 0) + 1;
  if (statusCode >= 400) requestMetrics.errors += 1;
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value, null, 2));
}

function assertRateLimit(req) {
  const limit = Number(process.env.RATE_LIMIT_PER_MINUTE || 300);
  if (!limit || limit <= 0) return;
  const context = getRequestContext(req) || createRequestContext(req);
  const key = `${context.ip || "unknown"}:${Math.floor(Date.now() / 60000)}`;
  const count = (rateLimitBuckets.get(key) || 0) + 1;
  rateLimitBuckets.set(key, count);
  if (rateLimitBuckets.size > 2000) {
    for (const itemKey of rateLimitBuckets.keys()) {
      if (!itemKey.endsWith(`:${Math.floor(Date.now() / 60000)}`)) {
        rateLimitBuckets.delete(itemKey);
      }
    }
  }
  if (count > limit) {
    throw httpError(429, "Quá nhiều yêu cầu. Vui lòng thử lại sau.", "RATE_LIMITED");
  }
}

function getMetricsText() {
  const lines = [
    "# HELP smart_health_requests_total Total HTTP JSON responses.",
    "# TYPE smart_health_requests_total counter",
    `smart_health_requests_total ${requestMetrics.total}`,
    "# HELP smart_health_request_errors_total Total HTTP JSON error responses.",
    "# TYPE smart_health_request_errors_total counter",
    `smart_health_request_errors_total ${requestMetrics.errors}`,
    "# HELP smart_health_active_recording Active recording flag.",
    "# TYPE smart_health_active_recording gauge",
    `smart_health_active_recording ${activeRecording ? 1 : 0}`,
    "# HELP smart_health_devices_online Online devices.",
    "# TYPE smart_health_devices_online gauge",
    `smart_health_devices_online ${db.devices.filter((device) => device.connected).length}`,
  ];
  for (const [status, count] of Object.entries(requestMetrics.byStatus)) {
    lines.push(`smart_health_responses_by_status_total{status="${status}"} ${count}`);
  }
  return `${lines.join("\n")}\n`;
}

function parseRequestPath(req) {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    return {
      pathname: url.pathname,
      hasQuery: Boolean(url.search),
    };
  } catch {
    return {
      pathname: req.url || "",
      hasQuery: false,
    };
  }
}

function auditForbiddenError(req, err, statusCode, code) {
  if (statusCode !== 403) {
    return;
  }

  const context = getRequestContext(req) || createRequestContext(req);
  const actorUserId = context.actor ? context.actor.id : "";
  const organizationId = context.organizationId || "";
  const { pathname, hasQuery } = parseRequestPath(req);
  addAccessLog("API request blocked by access control", {
    severity: "warning",
    userId: actorUserId,
    organizationId,
    ip: context.ip || "",
    device: "Smart Health API",
    location: pathname || "API",
  });

  void appendAudit("access.denied", req, {
    actorUserId,
    organizationId,
    resourceType: "http_request",
    resourceId: pathname || "",
    metadata: {
      method: req.method || "",
      path: pathname,
      hasQuery,
      code,
      message: err && err.message ? err.message : "",
      requestId: context.requestId || "",
      authSource: req.authSource || "none",
    },
  })
    .then(() => {
      if (!repositories) {
        return saveDb();
      }
      return null;
    })
    .catch((auditErr) => {
      console.error("Failed to audit forbidden request:", auditErr && auditErr.message ? auditErr.message : auditErr);
    });
}

function sendError(req, res, err) {
  const statusCode = err.statusCode || 500;
  const message = statusCode >= 500 ? "Internal server error" : err.message;
  const context = getRequestContext(req);
  const requestId = context ? context.requestId : "";
  const code = normalizeErrorCode(err.code, statusCode);
  if (statusCode >= 500) {
    console.error({ requestId, err });
  }
  auditForbiddenError(req, err, statusCode, code);
  sendJson(res, statusCode, {
    error: {
      code,
      message,
      requestId,
      details: err.details,
    },
    message,
    code: code.toLowerCase(),
    details: err.details,
    statusCode,
    requestId,
  });
}

async function readRequestBody(req) {
  const buffer = await readRequestBuffer(req);
  return buffer.toString("utf8");
}

async function readRequestBuffer(req) {
  const chunks = [];
  let total = 0;

  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BODY_BYTES) {
      throw httpError(413, "Request body is too large");
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

async function readJsonBody(req) {
  const text = await readRequestBody(req);
  if (!text.trim()) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    throw httpError(400, "Request body must be valid JSON");
  }
}

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : "";
}

function findSessionUserByToken(token) {
  if (!token) {
    return null;
  }

  const session = db.sessions.find((item) => item.token === token && !item.revokedAt);
  if (!session) {
    return null;
  }

  const user = db.users.find((item) => item.id === session.userId);
  if (!user) {
    return null;
  }

  session.lastSeenAt = nowIso();
  return { user, session };
}

function normalizeFirebaseRole(decodedToken) {
  const directRole = readString(decodedToken.role, 40);
  const nestedRole =
    decodedToken.smartHealth && typeof decodedToken.smartHealth === "object"
      ? readString(decodedToken.smartHealth.role, 40)
      : "";
  const role = (directRole || nestedRole).toLowerCase();
  if (role === "admin" || role === "platform_admin") {
    return "admin";
  }
  const normalizedRole = normalizeWorkspaceRole(role);
  if (["workspace_admin", "workspace_owner", "doctor", "patient", "nurse", "technician", "billing", "viewer"].includes(normalizedRole)) {
    return normalizedRole;
  }
  return "patient";
}

function ensureMembershipForUser(user) {
  if (!user.organizationId) {
    user.organizationId = "org_default_clinic";
  }

  const membership = db.memberships.find((item) => item.userId === user.id && item.organizationId === user.organizationId);
  if (membership) {
    membership.role = user.role || membership.role || "patient";
    return;
  }

  if (!membership) {
    db.memberships.push({
      id: createId("mbr"),
      organizationId: user.organizationId,
      userId: user.id,
      role: user.role || "patient",
      createdAt: nowIso(),
    });
  }
}

function upsertFirebaseUser(decodedToken, req) {
  const firebaseUid = readString(decodedToken.uid, 160);
  if (!firebaseUid) {
    throw httpError(401, "Firebase token is missing uid");
  }

  const email = readString(decodedToken.email, 160).toLowerCase();
  const phone = readString(decodedToken.phone_number || decodedToken.phoneNumber, 40);
  const claimedRole = normalizeFirebaseRole(decodedToken);
  const organizationId =
    readString(decodedToken.organizationId, 120) ||
    (decodedToken.smartHealth && typeof decodedToken.smartHealth === "object"
      ? readString(decodedToken.smartHealth.organizationId, 120)
      : "") ||
    "org_default_clinic";

  let user = db.users.find((item) => item.firebaseUid === firebaseUid);
  let matchedByEmail = false;
  if (!user && email) {
    user = db.users.find((item) => readString(item.email, 160).toLowerCase() === email);
    matchedByEmail = Boolean(user);
  }

  const now = nowIso();
  if (!user) {
    const displayName = readString(decodedToken.name, 120) || (email ? email.split("@")[0] : "Người dùng Smart Health");
    const initialRole = claimedRole === "admin" ? "admin" : claimedRole;
    user = {
      id: createId("usr"),
      role: initialRole,
      name: displayName,
      email,
      phone,
      firebaseUid,
      organizationId,
      verifiedEmail: Boolean(decodedToken.email_verified),
      verifiedPhone: Boolean(phone),
      createdAt: now,
      updatedAt: now,
    };
    db.users.unshift(user);
    addAccessLog(`Tạo user từ Firebase ${displayName}`, { ip: req.socket.remoteAddress || "" });
  } else {
    const previousFirebaseUid = user.firebaseUid || "";
    if (!previousFirebaseUid || previousFirebaseUid !== firebaseUid) {
      user.firebaseUid = firebaseUid;
      if (matchedByEmail && previousFirebaseUid) {
        addAccessLog("Đồng bộ Firebase UID từ email đã xác thực", {
          severity: "warning",
          userId: user.id,
          previousFirebaseUid,
          firebaseUid,
        });
      }
    }
    if (user.role === "admin" || claimedRole === "admin") {
      user.role = "admin";
    } else if (claimedRole === "workspace_admin" || claimedRole === "workspace_owner") {
      user.role = claimedRole;
    } else if (["nurse", "technician", "billing", "viewer"].includes(claimedRole)) {
      user.role = claimedRole;
    } else if (isApprovedDoctorRole(user)) {
      user.role = "doctor";
    } else {
      user.role = "patient";
    }
    user.organizationId = organizationId || user.organizationId || "org_default_clinic";
    if (email && user.email !== email) {
      user.email = email;
    }
    if (phone && user.phone !== phone) {
      user.phone = phone;
    }
    user.verifiedEmail = user.verifiedEmail || Boolean(decodedToken.email_verified);
    user.verifiedPhone = user.verifiedPhone || Boolean(phone);
    user.updatedAt = now;
  }

  ensureMembershipForUser(user);
  if (isPatientUser(user)) {
    ensurePatientProfileForUser(user);
  }
  req.authSession = rememberAuthSession(user, decodedToken, req);
  return user;
}

function rememberAuthSession(user, decodedToken, req) {
  const userAgent = readString(req.headers["user-agent"] || "Android", 240);
  const sessionKey = hashValue(`${user.id}:${decodedToken.uid}:${userAgent}`);
  let session = db.authSessions.find((item) => item.sessionKey === sessionKey && !item.revokedAt);
  const now = nowIso();

  if (!session) {
    session = {
      id: createId("authsess"),
      userId: user.id,
      provider: "firebase",
      firebaseUid: decodedToken.uid,
      sessionKey,
      device: userAgent,
      ip: req.socket.remoteAddress || "",
      createdAt: now,
      lastSeenAt: now,
      revokedAt: null,
    };
    db.authSessions.unshift(session);
    db.authSessions = db.authSessions.slice(0, 500);
  } else {
    session.lastSeenAt = now;
    session.ip = req.socket.remoteAddress || session.ip;
  }

  return session;
}

async function authenticateRequest(req) {
  if (req.authResolved) {
    return;
  }

  req.authResolved = true;
  req.authSource = "none";
  req.authUser = null;

  const token = getBearerToken(req);
  const sessionAuth = findSessionUserByToken(token);
  if (sessionAuth) {
    req.authSource = "demo-session";
    req.authUser = sessionAuth.user;
    req.authSession = sessionAuth.session;
    attachActor(req, sessionAuth.user);
    return;
  }

  if (!token || !FIREBASE_AUTH_ENABLED) {
    return;
  }

  let decodedToken;
  try {
    decodedToken = await verifyFirebaseIdToken(token, process.env);
  } catch (err) {
    const authErr = httpError(401, "Invalid Firebase ID token");
    authErr.code = "invalid_firebase_token";
    throw authErr;
  }

  if (!decodedToken) {
    return;
  }

  req.authSource = "firebase";
  req.firebaseToken = decodedToken;
  req.authUser = upsertFirebaseUser(decodedToken, req);
  attachActor(req, req.authUser);
  if (repositories) {
    await repositories.users.save(req.authUser);
    await repositories.memberships.ensureForUser(req.authUser);
  } else {
    await saveDb();
  }
}

function getRequestUser(req) {
  if (req.authUser) {
    attachActor(req, req.authUser);
    return req.authUser;
  }
  return AUTH_MODE === "production" ? null : getCurrentUser();
}

function requireUser(req) {
  const user = getRequestUser(req);
  if (!user) {
    throw httpError(401, "Chưa đăng nhập");
  }
  attachActor(req, user);
  return user;
}

function requireSessionUser(req) {
  const token = getBearerToken(req);
  if (!token) {
    throw httpError(401, "Missing bearer token");
  }

  if (req.authUser) {
    attachActor(req, req.authUser);
    return req.authUser;
  }

  throw httpError(401, "Invalid or expired session");
}

function assertDemoAuthAllowed() {
  if (AUTH_MODE === "production" && !ALLOW_DEMO_AUTH) {
    throw httpError(403, "Demo password auth is disabled in production mode");
  }
}

function createSession(user, req) {
  const session = {
    id: createId("sess"),
    userId: user.id,
    token: crypto.randomBytes(32).toString("hex"),
    device: req.headers["user-agent"] || "Ứng dụng Android",
    ip: req.socket.remoteAddress || "",
    createdAt: nowIso(),
    lastSeenAt: nowIso(),
    revokedAt: null,
  };
  db.sessions.unshift(session);
  db.sessions = db.sessions.slice(0, 100);
  return session;
}

function publicAuthSession(session, current = false) {
  if (!session) return null;
  return {
    id: session.id,
    provider: session.provider || "demo-password",
    device: session.device || session.userAgent || "Smart Health",
    userAgent: session.userAgent || session.device || "",
    ip: session.ip || "",
    createdAt: session.createdAt || "",
    lastSeenAt: session.lastSeenAt || "",
    revokedAt: session.revokedAt || null,
    current,
  };
}

function mergeSettingsSection(section, patch, currentSettings = db.settings) {
  const current = currentSettings[section] && typeof currentSettings[section] === "object" ? currentSettings[section] : {};
  const next = {
    ...current,
    ...patch,
  };
  if (section === "outbound") {
    next.email = {
      ...(current.email || {}),
      ...(patch.email || {}),
    };
    next.webhook = {
      ...(current.webhook || {}),
      ...(patch.webhook || {}),
    };
    next.webhook.events = {
      ...(current.webhook?.events || {}),
      ...(patch.webhook?.events || {}),
    };
    next.sms = {
      ...(current.sms || {}),
      ...(patch.sms || {}),
    };
    next.zalo = {
      ...(current.zalo || {}),
      ...(patch.zalo || {}),
    };
    delete next.email.password;
    delete next.email.pass;
    delete next.email.smtpPass;
    delete next.sms.apiKey;
    delete next.zalo.accessToken;
  }
  if (section === "securityPolicy") {
    next.passwordRules = {
      ...(current.passwordRules || {}),
      ...(patch.passwordRules || {}),
    };
    if (Array.isArray(patch.apiKeys)) {
      next.apiKeys = patch.apiKeys;
    }
  }
  return next;
}

function parseSettingsPatch(payload = {}, currentSettings = db.settings) {
  const next = {};
  for (const section of [
    "notifications",
    "privacy",
    "dataAccess",
    "storage",
    "stethoscope",
    "ai",
    "system",
    "branding",
    "outbound",
    "securityPolicy",
  ]) {
    if (payload[section] && typeof payload[section] === "object") {
      next[section] = mergeSettingsSection(section, payload[section], currentSettings);
    }
  }
  return next;
}

function mergeSettingsObjects(base = {}, override = {}) {
  const merged = {
    ...base,
    ...override,
  };
  for (const section of [
    "notifications",
    "privacy",
    "dataAccess",
    "storage",
    "stethoscope",
    "ai",
    "system",
    "branding",
    "outbound",
    "securityPolicy",
  ]) {
    merged[section] = {
      ...(base[section] && typeof base[section] === "object" ? base[section] : {}),
      ...(override[section] && typeof override[section] === "object" ? override[section] : {}),
    };
  }
  if (merged.outbound) {
    merged.outbound.email = {
      ...(base.outbound?.email || {}),
      ...(override.outbound?.email || {}),
    };
    merged.outbound.webhook = {
      ...(base.outbound?.webhook || {}),
      ...(override.outbound?.webhook || {}),
    };
    merged.outbound.webhook.events = {
      ...(base.outbound?.webhook?.events || {}),
      ...(override.outbound?.webhook?.events || {}),
    };
    merged.outbound.sms = {
      ...(base.outbound?.sms || {}),
      ...(override.outbound?.sms || {}),
    };
    merged.outbound.zalo = {
      ...(base.outbound?.zalo || {}),
      ...(override.outbound?.zalo || {}),
    };
  }
  if (merged.securityPolicy) {
    merged.securityPolicy.passwordRules = {
      ...(base.securityPolicy?.passwordRules || {}),
      ...(override.securityPolicy?.passwordRules || {}),
    };
    merged.securityPolicy.apiKeys = Array.isArray(override.securityPolicy?.apiKeys)
      ? override.securityPolicy.apiKeys
      : Array.isArray(base.securityPolicy?.apiKeys)
        ? base.securityPolicy.apiKeys
        : [];
  }
  return merged;
}

function getEffectiveSettingsForUser(user) {
  if (!user || isPlatformAdminUser(user)) {
    return db.settings;
  }
  const workspace = getClinicById(getUserWorkspaceContext(user).currentWorkspaceId);
  const settings = mergeSettingsObjects(db.settings, workspace?.settings || {});
  settings.securityPolicy = {
    ...(settings.securityPolicy || {}),
    apiKeys: (Array.isArray(settings.securityPolicy?.apiKeys) ? settings.securityPolicy.apiKeys : []).filter(
      (apiKey) => apiKey && apiKey.scope !== "platform"
    ),
  };
  return settings;
}

function getSmtpRuntimeStatus() {
  const missing = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"].filter((key) => !process.env[key]);
  return {
    configured: missing.length === 0,
    missing,
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 0) || null,
    from: process.env.SMTP_FROM || "",
  };
}

function getOutboundWebhookRuntimeStatus(settings = db.settings) {
  const settingsUrl = readString(settings.outbound?.webhook?.url, 1000);
  const url = process.env.OUTBOUND_WEBHOOK_URL || settingsUrl;
  return {
    configured: Boolean(url),
    missing: url ? [] : ["OUTBOUND_WEBHOOK_URL or settings.outbound.webhook.url"],
    urlConfiguredIn: process.env.OUTBOUND_WEBHOOK_URL ? "env" : settingsUrl ? "settings" : "",
  };
}

function publicSettings(user) {
  const settings = getEffectiveSettingsForUser(user);
  return {
    ...settings,
    scope: isPlatformAdminUser(user)
      ? { type: "platform", organizationId: "", name: "Smart Health Platform" }
      : {
          type: "workspace",
          organizationId: getUserWorkspaceContext(user).currentWorkspaceId || "",
          name: getUserWorkspaceContext(user).workspace?.name || "",
        },
    runtime: {
      smtp: getSmtpRuntimeStatus(),
      outboundWebhook: getOutboundWebhookRuntimeStatus(settings),
      twoFactorAvailable: true,
      apiKeyRotationAvailable: true,
      backupTestAvailable: true,
      aiModelUpdateAvailable: true,
    },
  };
}

function getMutableSettingsForUser(user) {
  if (isPlatformAdminUser(user)) {
    return { settings: db.settings, workspace: null };
  }
  const workspace = getClinicById(getUserWorkspaceContext(user).currentWorkspaceId);
  if (!workspace) {
    throw httpError(403, "Không tìm thấy workspace hiện tại");
  }
  workspace.settings = mergeSettingsObjects(db.settings, workspace.settings || {});
  workspace.settings.securityPolicy = {
    ...(workspace.settings.securityPolicy || {}),
    apiKeys: (Array.isArray(workspace.settings.securityPolicy?.apiKeys) ? workspace.settings.securityPolicy.apiKeys : []).filter(
      (apiKey) => apiKey && apiKey.scope !== "platform"
    ),
  };
  return { settings: workspace.settings, workspace };
}

async function persistMutableSettings(user, settings, workspace = null) {
  if (workspace) {
    workspace.settings = settings;
    workspace.updatedAt = nowIso();
  } else {
    db.settings = settings;
  }
  await saveDb();
}

function normalizeSmtpSecret(value, host) {
  const raw = String(value || "").trim();
  if (/gmail/i.test(host) && raw.replace(/\s+/g, "").length === 16) {
    return raw.replace(/\s+/g, "");
  }
  return raw;
}

function getSmtpEnv() {
  const host = String(process.env.SMTP_HOST || "").trim();
  return {
    host,
    port: Number(process.env.SMTP_PORT || 587),
    user: String(process.env.SMTP_USER || "").trim(),
    pass: normalizeSmtpSecret(process.env.SMTP_PASS, host),
    from: String(process.env.SMTP_FROM || "").trim(),
  };
}

function describeSmtpFailure(error) {
  const message = String(error && error.message ? error.message : error || "");
  const response = String(error && error.response ? error.response : "");
  const code = String(error && (error.code || error.command || error.responseCode) ? error.code || error.command || error.responseCode : "");
  const combined = `${code} ${message} ${response}`.toLowerCase();

  if (combined.includes("invalid login") || combined.includes("535") || combined.includes("badcredentials")) {
    return "Gmail từ chối đăng nhập SMTP. Hãy kiểm tra SMTP_USER và SMTP_PASS; SMTP_PASS phải là Gmail App Password 16 ký tự, không phải mật khẩu Gmail thường.";
  }
  if (combined.includes("less secure") || combined.includes("application-specific password required")) {
    return "Gmail yêu cầu App Password. Hãy bật 2-Step Verification rồi tạo App Password cho SMTP_PASS.";
  }
  if (combined.includes("mail from") || combined.includes("sender") || combined.includes("from address")) {
    return "Gmail không chấp nhận địa chỉ gửi. Nên đặt SMTP_FROM trùng email SMTP_USER, ví dụ: Smart Health <SMTP_USER>.";
  }
  if (combined.includes("etimedout") || combined.includes("timeout") || combined.includes("econnrefused") || combined.includes("enetunreach")) {
    return "Backend không kết nối được tới SMTP Gmail trong thời gian cho phép. Hãy kiểm tra Render đã redeploy sau khi set env và mạng SMTP không bị chặn.";
  }
  return `Không thể gửi email qua SMTP Gmail: ${message || "lỗi không xác định"}`;
}

function createSmtpTransport() {
  const runtime = getSmtpRuntimeStatus();
  if (!runtime.configured) {
    throw httpError(400, `SMTP chưa được cấu hình: ${runtime.missing.join(", ")}`, "SMTP_NOT_CONFIGURED", { missing: runtime.missing });
  }
  const smtp = getSmtpEnv();
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    requireTLS: smtp.port === 587,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
  });
}

async function sendTestEmail(payload = {}) {
  const to = readString(payload.to || db.settings.outbound?.email?.testRecipient, 240);
  if (!to) {
    throw httpError(400, "Cần nhập email người nhận để gửi thử", "SMTP_TEST_RECIPIENT_REQUIRED");
  }
  const subject = readString(payload.subject, 180) || "Smart Health test email";
  const text =
    readString(payload.message, 2000) ||
    "Đây là email kiểm tra từ hệ thống Smart Health. Nếu bạn nhận được email này, cấu hình SMTP đang hoạt động.";
  const transporter = createSmtpTransport();
  let info;
  try {
    info = await transporter.sendMail({
      from: getSmtpEnv().from,
      to,
      subject,
      text,
      html: `<p>${escapeHtml(text).replace(/\n/g, "<br />")}</p>`,
    });
  } catch (error) {
    throw httpError(400, describeSmtpFailure(error), "SMTP_SEND_FAILED", {
      smtpHost: getSmtpEnv().host,
      smtpPort: getSmtpEnv().port,
      smtpUser: getSmtpEnv().user,
      smtpFrom: getSmtpEnv().from,
      providerCode: String(error && (error.code || error.command || error.responseCode) ? error.code || error.command || error.responseCode : ""),
    });
  }
  return {
    messageId: info.messageId || "",
    accepted: info.accepted || [],
    rejected: info.rejected || [],
  };
}

function buildOutboundWebhookPayload(channel, payload = {}) {
  const message =
    readString(payload.message, 2000) ||
    `Smart Health test ${channel}: he thong webhook da duoc kich hoat.`;
  return {
    channel,
    to: readString(payload.to, 240),
    message,
    templateId: readString(payload.templateId, 120),
    metadata: {
      source: "smart-health-web-admin",
      event: "test",
      sentAt: nowIso(),
      ...(payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {}),
    },
  };
}

async function sendTestOutbound(payload = {}, user = null) {
  const channel = readString(payload.channel, 20).toLowerCase();
  if (!["sms", "zalo"].includes(channel)) {
    throw httpError(400, "Kenh gui thu chi ho tro sms hoac zalo");
  }
  const settings = getEffectiveSettingsForUser(user);
  const url = process.env.OUTBOUND_WEBHOOK_URL || readString(settings.outbound?.webhook?.url, 1000);
  if (!url) {
    throw httpError(400, "Webhook SMS/Zalo chua duoc cau hinh");
  }
  const body = buildOutboundWebhookPayload(channel, payload);
  const bodyText = JSON.stringify(body);
  const headers = {
    "Content-Type": "application/json",
    "User-Agent": "SmartHealthWebhook/1.0",
  };
  if (process.env.OUTBOUND_WEBHOOK_SECRET) {
    headers["X-Smart-Health-Signature"] = crypto
      .createHmac("sha256", process.env.OUTBOUND_WEBHOOK_SECRET)
      .update(bodyText)
      .digest("hex");
  }
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: bodyText,
  });
  const responseText = await response.text();
  if (!response.ok) {
    throw httpError(502, `Webhook ${channel} tra ve HTTP ${response.status}: ${responseText.slice(0, 300)}`);
  }
  return {
    channel,
    statusCode: response.status,
    response: responseText.slice(0, 1000),
  };
}

async function setFirebaseRoleClaimsForUser(user, role, organizationId) {
  if (!user.firebaseUid || !FIREBASE_AUTH_ENABLED) {
    return { updated: false };
  }

  const admin = getFirebaseAdmin(process.env);
  if (!admin) {
    return { updated: false };
  }

  const claims = {
    role,
    organizationId,
    smartHealth: {
      role,
      organizationId,
    },
  };
  await admin.auth().setCustomUserClaims(user.firebaseUid, claims);
  return { updated: true, claims };
}

function isValidEmailAddress(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || ""));
}

function normalizeManagedAdminRole(value) {
  const raw = readString(value, 40).toLowerCase();
  if (raw === "admin" || raw === "platform_admin") {
    return {
      role: "admin",
      claimRole: "admin",
      title: "Quản trị viên hệ thống",
      label: "Quản trị toàn hệ thống",
      requiresWorkspace: false,
    };
  }
  if (raw === "workspace_owner") {
    return {
      role: "workspace_owner",
      claimRole: "workspace_owner",
      title: "Chủ sở hữu workspace",
      label: "Chủ sở hữu bệnh viện",
      requiresWorkspace: true,
    };
  }
  if (raw === "workspace_admin" || raw === "hospital_admin") {
    return {
      role: "workspace_admin",
      claimRole: "workspace_admin",
      title: "Admin bệnh viện",
      label: "Admin bệnh viện",
      requiresWorkspace: true,
    };
  }
  throw httpError(400, "Vai trò admin không hợp lệ");
}

function isManagedAdminAccount(user) {
  if (!user) return false;
  const role = readString(user.role || user.requestedRole, 40);
  return MANAGED_ADMIN_ROLES.has(role);
}

function activePlatformAdminCount(excludeUserId = "") {
  return db.users.filter((user) => {
    if (!user || user.id === excludeUserId) return false;
    if (readString(user.accountStatus, 40) === "locked") return false;
    return isPlatformAdminUser(user);
  }).length;
}

async function persistUserRecord(user) {
  user.updatedAt = nowIso();
  if (repositories) {
    await repositories.users.save(user);
    await repositories.memberships.ensureForUser(user);
  } else {
    const index = db.users.findIndex((item) => item.id === user.id);
    if (index >= 0) {
      db.users[index] = user;
    } else {
      db.users.unshift(user);
    }
    await saveDb();
  }
  return user;
}

async function findManagedAdminAccount(userId) {
  const id = readString(userId, 160);
  const user = repositories
    ? await repositories.users.findByIdOrFirebaseUid(id)
    : db.users.find((item) => item.id === id || item.firebaseUid === id);
  if (!user || !isManagedAdminAccount(user)) {
    throw httpError(404, "Không tìm thấy tài khoản admin");
  }
  return user;
}

function assertAdminAccountCanBeLockedOrDeleted(actorUser, targetUser, action) {
  if (actorUser.id === targetUser.id || actorUser.firebaseUid === targetUser.firebaseUid) {
    throw httpError(400, `Không thể ${action} tài khoản đang đăng nhập`);
  }
  if (isPlatformAdminUser(targetUser) && activePlatformAdminCount(targetUser.id) === 0) {
    throw httpError(400, "Không thể vô hiệu hóa tài khoản admin toàn hệ thống cuối cùng");
  }
}

function publicManagedAdminAccount(user) {
  const organization = getClinicById(user.organizationId);
  const sessions = db.authSessions.filter((session) => session.userId === user.id && !session.revokedAt);
  const lastSession = sessions
    .slice()
    .sort((a, b) => String(b.lastSeenAt || b.createdAt || "").localeCompare(String(a.lastSeenAt || a.createdAt || "")))[0];
  return {
    ...publicUser(user),
    managedAdmin: true,
    workspaceName: organization?.name || user.hospital || "",
    workspaceType: organization?.workspaceType || organization?.type || "",
    activeSessionCount: sessions.length,
    lastLoginAt: lastSession?.lastSeenAt || lastSession?.createdAt || "",
  };
}

async function updateFirebaseAdminAccount(targetUser, payload = {}) {
  if (!targetUser.firebaseUid || !FIREBASE_AUTH_ENABLED) {
    return { updated: false };
  }
  const firebaseAdminApp = getFirebaseAdmin(process.env);
  if (!firebaseAdminApp) {
    return { updated: false };
  }
  const updates = {};
  if (Object.prototype.hasOwnProperty.call(payload, "displayName")) {
    updates.displayName = readString(payload.displayName, 160);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "disabled")) {
    updates.disabled = Boolean(payload.disabled);
  }
  if (Object.keys(updates).length > 0) {
    await firebaseAdminApp.auth().updateUser(targetUser.firebaseUid, updates);
  }
  return { updated: true };
}

async function applyManagedAdminRole(targetUser, roleValue, organizationIdValue) {
  const roleInfo = normalizeManagedAdminRole(roleValue || targetUser.role || "workspace_admin");
  let organizationId = readString(organizationIdValue || targetUser.organizationId, 120);
  let organization = null;
  if (roleInfo.requiresWorkspace) {
    if (!organizationId) {
      throw httpError(400, "Admin bệnh viện phải được gán workspace/bệnh viện");
    }
    organization = db.organizations.find((item) => item.id === organizationId) || null;
    if (!organization) {
      throw httpError(404, "Không tìm thấy workspace/bệnh viện để cấp quyền");
    }
  } else {
    organizationId = organizationId || "org_default_clinic";
    organization = db.organizations.find((item) => item.id === organizationId) || null;
  }

  targetUser.role = roleInfo.role;
  targetUser.requestedRole = roleInfo.role;
  targetUser.roleRequestStatus = "approved";
  targetUser.organizationId = organizationId;
  targetUser.hospital = organization?.name || targetUser.hospital || "Smart Health";
  targetUser.title = targetUser.title || roleInfo.title;

  const firebaseResult = await setFirebaseRoleClaimsForUser(targetUser, roleInfo.claimRole, organizationId);
  if (firebaseResult.claims) {
    targetUser.firebaseClaims = firebaseResult.claims;
  }

  ensureMembershipForUser(targetUser);
  return { roleInfo, organization };
}

async function createManagedAdminAccount(payload = {}, actorUser, req) {
  requireAnyCapability(actorUser, ["platform.users.manage"], "Chỉ platform admin mới được tạo tài khoản quản trị");

  if (!FIREBASE_AUTH_ENABLED) {
    throw httpError(503, "Firebase Admin chưa được cấu hình trên backend production");
  }
  const firebaseAdminApp = getFirebaseAdmin(process.env);
  if (!firebaseAdminApp) {
    throw httpError(503, "Không thể khởi tạo Firebase Admin. Kiểm tra service account trên backend");
  }

  const email = readString(payload.email, 160).toLowerCase();
  const password = readString(payload.password, 200);
  const name = readString(payload.name || payload.fullName || payload.displayName, 160);
  const phone = readString(payload.phone, 40);
  const roleInfo = normalizeManagedAdminRole(payload.role || "workspace_admin");

  if (!isValidEmailAddress(email)) {
    throw httpError(400, "Email admin không hợp lệ");
  }
  if (!name) {
    throw httpError(400, "Họ tên admin là bắt buộc");
  }
  if (password.length < 8) {
    throw httpError(400, "Mật khẩu tạm thời phải có ít nhất 8 ký tự");
  }
  if (findUserByLogin(email)) {
    throw httpError(409, "Email này đã tồn tại trong hệ thống Smart Health");
  }

  let organizationId = readString(payload.organizationId || payload.workspaceId, 120);
  let organization = null;
  if (roleInfo.requiresWorkspace) {
    if (!organizationId) {
      throw httpError(400, "Admin bệnh viện phải được gán workspace/bệnh viện");
    }
    organization = db.organizations.find((item) => item.id === organizationId) || null;
    if (!organization) {
      throw httpError(404, "Không tìm thấy workspace/bệnh viện để cấp quyền");
    }
  } else {
    organizationId = organizationId || "org_default_clinic";
    organization = db.organizations.find((item) => item.id === organizationId) || null;
  }

  try {
    await firebaseAdminApp.auth().getUserByEmail(email);
    throw httpError(409, "Email này đã tồn tại trên Firebase Auth");
  } catch (err) {
    if (err && err.statusCode === 409) {
      throw err;
    }
    if (!err || err.code !== "auth/user-not-found") {
      throw err;
    }
  }

  const firebaseUser = await firebaseAdminApp.auth().createUser({
    email,
    password,
    displayName: name,
    emailVerified: true,
    disabled: false,
  });

  const claims = {
    role: roleInfo.claimRole,
    organizationId,
    smartHealth: {
      role: roleInfo.claimRole,
      organizationId,
    },
  };
  await firebaseAdminApp.auth().setCustomUserClaims(firebaseUser.uid, claims);

  const now = nowIso();
  const backendUser = {
    id: createId("usr"),
    role: roleInfo.role,
    requestedRole: roleInfo.role,
    roleRequestStatus: "approved",
    accountStatus: "active",
    name,
    title: readString(payload.title, 120) || roleInfo.title,
    email,
    phone,
    firebaseUid: firebaseUser.uid,
    organizationId,
    hospital: readString(payload.hospital, 160) || organization?.name || "Smart Health",
    verifiedEmail: true,
    verifiedPhone: Boolean(phone),
    roleRequestedAt: now,
    roleApprovedAt: now,
    firebaseClaims: claims,
    createdAt: now,
    updatedAt: now,
  };

  if (repositories) {
    await repositories.users.save(backendUser);
    await repositories.memberships.ensureForUser(backendUser);
  } else {
    db.users.unshift(backendUser);
    ensureMembershipForUser(backendUser);
    await saveDb();
  }

  await appendAudit("admin.user.create", req, {
    actorUserId: actorUser.id,
    organizationId,
    resourceType: "user",
    resourceId: backendUser.id,
    metadata: {
      role: backendUser.role,
      email,
      firebaseUid: firebaseUser.uid,
      workspaceName: organization?.name || "",
    },
  });
  addAccessLog(`Tạo tài khoản ${roleInfo.label}: ${email}`, {
    severity: "success",
    userId: actorUser.id,
    organizationId,
  });
  createNotification(
    "success",
    "Đã tạo tài khoản admin",
    `${name} đã được cấp quyền ${roleInfo.label}.`,
    { userId: actorUser.id, organizationId, targetUserId: backendUser.id },
  );
  await saveDb();

  return {
    user: publicUser(backendUser),
    firebase: {
      uid: firebaseUser.uid,
      email,
      created: true,
      claims,
    },
  };
}

function getStorageSummary() {
  const audioBytes = fs.existsSync(AUDIO_DIR)
    ? fs
        .readdirSync(AUDIO_DIR)
        .filter((name) => name.endsWith(".wav"))
        .reduce((total, name) => total + fs.statSync(path.join(AUDIO_DIR, name)).size, 0)
    : 0;
  const audioMb = Math.round(audioBytes / 1024 / 1024);
  return {
    ...db.settings.storage,
    scanCount: db.scans.length,
    patientCount: db.patients.length,
    audioFileCount: db.scans.filter((scan) => scan.wavFile).length,
    audioUsedMb: audioMb,
    updatedAt: nowIso(),
  };
}

function getStorageSummaryForUser(user) {
  const files = buildStorageFileRecords(user);
  const audioBytes = files.reduce((total, file) => total + Number(file.byteSize || 0), 0);
  return {
    ...db.settings.storage,
    scanCount: filterScansForUser(user, db.scans).length,
    patientCount: filterPatientsForUser(user, db.patients).length,
    audioFileCount: files.filter((file) => file.type === "wav" || file.bucket === "heart-audio").length,
    audioUsedMb: Math.round(audioBytes / 1024 / 1024),
    updatedAt: nowIso(),
  };
}

function bytesToGb(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return 0;
  }
  return Number((bytes / 1024 / 1024 / 1024).toFixed(3));
}

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${Number((bytes / 1024 / 1024).toFixed(1))} MB`;
  }
  return `${Number((bytes / 1024 / 1024 / 1024).toFixed(2))} GB`;
}

function getScanAudioByteSize(scan, audioFile) {
  if (audioFile && Number(audioFile.byteSize) > 0) {
    return Number(audioFile.byteSize);
  }
  if (scan && scan.wavFile) {
    const audioPath = path.join(AUDIO_DIR, path.basename(scan.wavFile));
    if (fs.existsSync(audioPath)) {
      return fs.statSync(audioPath).size;
    }
  }
  return 0;
}

function formatDateTime(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(date);
}

const SYSTEM_STORAGE_BUCKETS = [
  {
    id: "medical-images",
    name: "Hình ảnh y khoa",
    description: "Hình ảnh DICOM, X-quang, siêu âm và ảnh lâm sàng",
    desc: "Hình ảnh DICOM, X-quang, siêu âm và ảnh lâm sàng",
    iconKey: "dicom",
    colorKey: "blue",
    category: "medical_image",
    quotaGb: 2500,
    quota: 2500,
    visibility: "private",
    allowedExtensions: ["dcm", "dicom", "jpg", "jpeg", "png", "webp"],
    allowedMimeTypes: ["application/dicom", "image/jpeg", "image/png", "image/webp"],
    maxFileSizeMb: 500,
    retentionDays: 3650,
    encryptionRequired: true,
    color: "from-blue-500 to-cyan-500",
  },
  {
    id: "heart-audio",
    name: "Âm thanh tim/phổi",
    description: "Audio nghe tim/phổi từ lượt đo ống nghe thông minh",
    desc: "Audio nghe tim/phổi từ lượt đo ống nghe thông minh",
    iconKey: "audio",
    colorKey: "emerald",
    category: "clinical_audio",
    quotaGb: 1500,
    quota: 1500,
    visibility: "private",
    allowedExtensions: ["wav", "mp3", "m4a", "flac", "json"],
    allowedMimeTypes: ["audio/wav", "audio/mpeg", "audio/mp4", "audio/flac", "application/json"],
    maxFileSizeMb: 500,
    retentionDays: 3650,
    encryptionRequired: true,
    color: "from-emerald-500 to-teal-500",
  },
  {
    id: "patient-reports",
    name: "Báo cáo bệnh nhân",
    description: "Báo cáo PDF, đơn thuốc, kết quả đo và hồ sơ xuất dữ liệu",
    desc: "Báo cáo PDF, đơn thuốc, kết quả đo và hồ sơ xuất dữ liệu",
    iconKey: "report",
    colorKey: "amber",
    category: "patient_report",
    quotaGb: 1000,
    quota: 1000,
    visibility: "private",
    allowedExtensions: ["pdf", "docx", "xlsx", "csv", "json"],
    allowedMimeTypes: [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv",
      "application/json",
    ],
    maxFileSizeMb: 200,
    retentionDays: 3650,
    encryptionRequired: true,
    color: "from-amber-500 to-orange-500",
  },
  {
    id: "device-firmware",
    name: "Firmware thiết bị",
    description: "Firmware OTA, manifest cập nhật và checksum cho thiết bị",
    desc: "Firmware OTA, manifest cập nhật và checksum cho thiết bị",
    iconKey: "firmware",
    colorKey: "slate",
    category: "device_firmware",
    quotaGb: 300,
    quota: 300,
    visibility: "private",
    allowedExtensions: ["bin", "json", "txt"],
    allowedMimeTypes: ["application/octet-stream", "application/json", "text/plain"],
    maxFileSizeMb: 100,
    retentionDays: 1825,
    encryptionRequired: false,
    color: "from-violet-500 to-fuchsia-500",
  },
  {
    id: "avatars",
    name: "Ảnh đại diện",
    description: "Ảnh đại diện người dùng, bác sĩ và phòng khám",
    desc: "Ảnh đại diện người dùng, bác sĩ và phòng khám",
    iconKey: "avatar",
    colorKey: "rose",
    category: "avatar",
    quotaGb: 200,
    quota: 200,
    visibility: "public",
    allowedExtensions: ["jpg", "jpeg", "png", "webp"],
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    maxFileSizeMb: 10,
    retentionDays: 3650,
    encryptionRequired: false,
    color: "from-rose-500 to-pink-500",
  },
];

function sanitizeStorageId(value, fallback = "") {
  const id = readString(value, 160)
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return id || fallback;
}

function toAsciiSlug(value, fallback = "file") {
  const text = readString(value, 240)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return text || fallback;
}

function parseCsvList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => readString(item, 80).toLowerCase()).filter(Boolean);
  }
  return readString(value, 1000)
    .split(",")
    .map((item) => item.trim().toLowerCase().replace(/^\./, ""))
    .filter(Boolean);
}

function normalizeBucketPayload(payload = {}, existing = null) {
  const now = nowIso();
  const id = sanitizeStorageId(payload.id || payload.name, existing ? existing.id : "");
  if (!id) {
    throw httpError(400, "Tên bucket không hợp lệ");
  }
  const name = readString(payload.name, 120) || existing?.name || id;
  const description = readString(payload.description || payload.desc, 500) || existing?.description || "";
  const iconKey = readString(payload.iconKey, 40) || existing?.iconKey || "database";
  const colorKey = readString(payload.colorKey, 40) || existing?.colorKey || "blue";
  const category = readString(payload.category, 80) || existing?.category || "custom";
  const quotaGb = Math.max(1, Number(payload.quotaGb || payload.quota || existing?.quotaGb || existing?.quota || 100));
  const visibility = ["public", "private", "encrypted"].includes(payload.visibility)
    ? payload.visibility
    : existing?.visibility || "private";
  const maxFileSizeMb = Math.max(1, Number(payload.maxFileSizeMb || existing?.maxFileSizeMb || 500));
  const retentionDays = Math.max(0, Number(payload.retentionDays ?? existing?.retentionDays ?? 3650));
  const allowedExtensions = parseCsvList(payload.allowedExtensions || payload.allowed || existing?.allowedExtensions);
  const allowedMimeTypes = parseCsvList(payload.allowedMimeTypes || existing?.allowedMimeTypes);

  return {
    ...(existing || {}),
    id,
    name,
    description,
    desc: description,
    iconKey,
    colorKey,
    category,
    quotaGb,
    quota: quotaGb,
    visibility,
    allowedExtensions,
    allowedMimeTypes,
    maxFileSizeMb,
    retentionDays,
    encryptionRequired: Boolean(payload.encryptionRequired ?? existing?.encryptionRequired ?? visibility !== "public"),
    system: Boolean(existing?.system || payload.system),
    color: readString(payload.color || existing?.color, 80),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
}

function getStorageBucketsConfig() {
  const map = new Map();
  for (const bucket of SYSTEM_STORAGE_BUCKETS) {
    map.set(bucket.id, {
      ...bucket,
      system: true,
      createdAt: db.createdAt || nowIso(),
    });
  }
  for (const bucket of db.storageBuckets) {
    if (!bucket || !bucket.id) continue;
    map.set(bucket.id, {
      ...map.get(bucket.id),
      ...bucket,
      system: Boolean(bucket.system || map.get(bucket.id)?.system),
    });
  }
  return Array.from(map.values());
}

function getStorageBucket(bucketId) {
  const id = sanitizeStorageId(bucketId);
  return getStorageBucketsConfig().find((bucket) => bucket.id === id) || null;
}

function getStorageRecord(fileId, user = null) {
  const records = user ? buildStorageFileRecords(user) : buildStorageFileRecords();
  return records.find((item) => item.id === fileId || item.scanId === fileId) || null;
}

function getStorageFileSource(record) {
  if (!record) return { scan: null, audioFile: null, storageFile: null };
  const scan = record.scanId ? findScan(record.scanId) : null;
  const audioFile = db.audioFiles.find((file) => file.id === record.id || file.scanId === record.scanId) || null;
  const storageFile = db.storageFiles.find((file) => file.id === record.id) || null;
  return { scan, audioFile, storageFile };
}

function buildStorageObjectKey(orgId, bucketId, fileId, originalName) {
  const ext = path.extname(originalName || "").toLowerCase();
  const base = toAsciiSlug(path.basename(originalName || "file", ext), "file");
  return `org/${orgId || "org_default_clinic"}/storage/${bucketId}/${fileId}-${base}${ext}`;
}

function inferFirmwareVersionFromName(name = "") {
  const base = path.basename(String(name || ""));
  const match =
    base.match(/(?:^|[_\-\s])v?(\d+\.\d+\.\d+(?:[-+][a-zA-Z0-9_.-]+)?)(?:[_\-\s.]|$)/) ||
    base.match(/firmware[_\-\s]?([a-zA-Z0-9_.-]+)/i);
  return match ? readString(match[1], 80) : "";
}

function getBackendPublicBaseUrl(req) {
  const configured = readString(process.env.PUBLIC_BACKEND_URL || process.env.SMART_HEALTH_PUBLIC_URL, 300);
  if (configured) return configured.replace(/\/+$/, "");
  const proto = readString(req.headers["x-forwarded-proto"], 20) || (req.socket.encrypted ? "https" : "http");
  const host = readString(req.headers["x-forwarded-host"] || req.headers.host, 240) || `localhost:${PORT}`;
  return `${proto}://${host}`.replace(/\/+$/, "");
}

function buildOtaFirmwareDownloadUrl(req, deviceId, otaId, token) {
  return `${getBackendPublicBaseUrl(req)}/api/v1/devices/${encodeURIComponent(deviceId)}/ota/${encodeURIComponent(otaId)}/firmware?token=${encodeURIComponent(token)}`;
}

function buildStorageDownloadFilename(record, source = {}) {
  const ext = path.extname(record.name || source.storageFile?.name || source.audioFile?.objectKey || "").toLowerCase();
  const safeExt = ext || `.${record.type || "bin"}`;
  const created = new Date(source.storageFile?.createdAt || source.audioFile?.createdAt || source.scan?.createdAt || Date.now());
  const stamp = Number.isNaN(created.getTime())
    ? new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")
    : created.toISOString().slice(0, 16).replace(/[-:T]/g, "");
  const shortId = toAsciiSlug(record.id, "file").slice(-10);
  if (source.scan) {
    const patient = toAsciiSlug(source.scan.patientName || source.scan.patientId || "benh-nhan", "benh-nhan");
    const bodySite = toAsciiSlug(source.scan.bodySite || source.scan.mode || "luot-do", "luot-do");
    return `smart-health_scan-${toAsciiSlug(source.scan.id, "scan")}_${patient}_${bodySite}_${stamp}${safeExt}`;
  }
  const bucket = toAsciiSlug(record.bucket || "storage", "storage");
  const base = toAsciiSlug(path.basename(record.name || "file", ext), "file");
  return `smart-health_${bucket}_${base}_${stamp}_${shortId}${safeExt}`;
}

function assertStorageUploadAllowed(bucket, fileName, contentType, byteSize) {
  const ext = path.extname(fileName || "").replace(".", "").toLowerCase();
  if (bucket.allowedExtensions?.length && ext && !bucket.allowedExtensions.includes(ext)) {
    throw httpError(400, `Bucket ${bucket.id} không cho phép file .${ext}`);
  }
  const maxBytes = Number(bucket.maxFileSizeMb || 500) * 1024 * 1024;
  if (byteSize > maxBytes) {
    throw httpError(413, `File vượt quá giới hạn ${bucket.maxFileSizeMb || 500} MB của bucket ${bucket.id}`);
  }
  if (bucket.allowedMimeTypes?.length && contentType && !bucket.allowedMimeTypes.includes(contentType.toLowerCase())) {
    const broadType = contentType.toLowerCase().split(";")[0];
    if (!bucket.allowedMimeTypes.includes(broadType)) {
      throw httpError(400, `Bucket ${bucket.id} không cho phép loại nội dung ${contentType}`);
    }
  }
}

function getStorageFileType(name, contentType = "") {
  const ext = path.extname(name || "").replace(".", "").toLowerCase();
  if (ext) return ext;
  if (contentType.includes("pdf")) return "pdf";
  if (contentType.includes("image")) return "jpg";
  if (contentType.includes("audio")) return "wav";
  if (contentType.includes("video")) return "mp4";
  return "bin";
}

function buildStorageFileRecords(user = null) {
  const audioByScanId = new Map(db.audioFiles.map((file) => [file.scanId, file]));
  const usedAudioIds = new Set();
  const records = [];

  for (const scan of db.scans.filter((item) => item.wavFile || item.audioFileId || audioByScanId.has(item.id))) {
    if (user && !canAccessScan(user, scan)) {
      continue;
    }
    const audioFile = audioByScanId.get(scan.id) || db.audioFiles.find((file) => file.id === scan.audioFileId) || null;
    if (audioFile) {
      usedAudioIds.add(audioFile.id);
    }
    const id = audioFile ? audioFile.id : scan.id;
    const byteSize = getScanAudioByteSize(scan, audioFile);
    records.push({
      id,
      scanId: scan.id,
      organizationId: getScanOrgId(scan),
      objectKey: audioFile ? audioFile.objectKey : "",
      name: scan.wavFile || `${scan.id}.wav`,
      bucket: "heart-audio",
      type: "wav",
      size: formatFileSize(byteSize),
      byteSize,
      uploader: scan.patientName || scan.doctorName || "Nguoi dung Smart Health",
      uploadedAt: formatDateTime((audioFile && audioFile.createdAt) || scan.endedAt || scan.createdAt),
      createdAt: (audioFile && audioFile.createdAt) || scan.endedAt || scan.createdAt || nowIso(),
      visibility: "private",
      tags: [scan.mode || "audio", scan.status || "scan"].filter(Boolean),
      downloadUrl: `/api/admin/storage-files/${encodeURIComponent(id)}/download`,
    });
  }

  for (const audioFile of db.audioFiles.filter((file) => !usedAudioIds.has(file.id))) {
    const scan = audioFile.scanId ? findScan(audioFile.scanId) : null;
    const organizationId = scan ? getScanOrgId(scan) : getObjectKeyOrganizationId(audioFile.objectKey);
    if (user && !canAccessStorageRecord(user, { id: audioFile.id, scanId: audioFile.scanId || "", objectKey: audioFile.objectKey || "", organizationId })) {
      continue;
    }
    const fileName = audioFile.objectKey ? path.basename(audioFile.objectKey) : `${audioFile.id}.wav`;
    records.push({
      id: audioFile.id,
      scanId: audioFile.scanId || "",
      organizationId,
      objectKey: audioFile.objectKey || "",
      name: fileName,
      bucket: "heart-audio",
      type: path.extname(fileName).replace(".", "").toLowerCase() || "wav",
      size: formatFileSize(Number(audioFile.byteSize || 0)),
      byteSize: Number(audioFile.byteSize || 0),
      uploader: "He thong Smart Health",
      uploadedAt: formatDateTime(audioFile.createdAt),
      createdAt: audioFile.createdAt || nowIso(),
      visibility: "private",
      tags: ["audio"].filter(Boolean),
      downloadUrl: `/api/admin/storage-files/${encodeURIComponent(audioFile.id)}/download`,
    });
  }

  for (const file of db.storageFiles) {
    const organizationId = file.organizationId || getObjectKeyOrganizationId(file.objectKey);
    if (user && !canAccessStorageRecord(user, { id: file.id, objectKey: file.objectKey || "", organizationId, scanId: "" })) {
      continue;
    }
    records.push({
      id: file.id,
      scanId: "",
      organizationId,
      objectKey: file.objectKey || "",
      name: file.name || path.basename(file.objectKey || file.id),
      bucket: file.bucket || "heart-audio",
      type: file.type || getStorageFileType(file.name, file.contentType),
      size: formatFileSize(Number(file.byteSize || 0)),
      byteSize: Number(file.byteSize || 0),
      uploader: file.uploader || "Quản trị hệ thống",
      uploadedAt: formatDateTime(file.createdAt),
      createdAt: file.createdAt || nowIso(),
      visibility: file.visibility || "private",
      tags: Array.isArray(file.tags) ? file.tags : [],
      checksum: file.checksum || file.sha256 || "",
      sha256: file.sha256 || file.checksum || "",
      firmwareVersion: file.firmwareVersion || inferFirmwareVersionFromName(file.name),
      downloadUrl: `/api/admin/storage-files/${encodeURIComponent(file.id)}/download`,
      previewUrl: String(file.contentType || "").startsWith("image/")
        ? `/api/admin/storage-files/${encodeURIComponent(file.id)}/download`
        : "",
      shareUrl: `/api/admin/storage-files/${encodeURIComponent(file.id)}/share`,
    });
  }

  return records.sort((a, b) => String(b.uploadedAt).localeCompare(String(a.uploadedAt)));
}

async function serveObjectBufferDownload(req, res, objectFile, downloadName) {
  const objectKey = readString(objectFile?.objectKey, 1000);
  if (!objectKey) {
    throw httpError(404, "Không tìm thấy file trên storage");
  }
  const buffer = await storageAdapter.getBuffer(objectKey);
  setCommonHeaders(res, req);
  res.writeHead(200, {
    "Content-Type": objectFile.contentType || "application/octet-stream",
    "Content-Length": buffer.length,
    "Content-Disposition": `inline; filename="${downloadName || path.basename(objectKey)}"`,
  });
  res.end(buffer);
}

async function serveStorageFileDownload(req, res, fileId, options = {}) {
  const user = requireUser(req);
  const record = getStorageRecord(fileId);
  if (!record) {
    throw httpError(404, "Không tìm thấy tệp lưu trữ");
  }

  if (!options.skipAccessCheck) {
    assertCanAccessStorageRecord(user, record);
  }
  const { scan, audioFile, storageFile } = getStorageFileSource(record);
  const downloadName = buildStorageDownloadFilename(record, { scan, audioFile, storageFile });

  await appendAudit("storage.download", req, {
    resourceType: "storage_file",
    resourceId: record.id,
    organizationId: record.organizationId || (scan ? scan.organizationId || getScanOrgId(scan) : ""),
    metadata: { name: record.name, bucket: record.bucket },
  });

  if (scan && scan.wavFile) {
    const audioPath = path.join(AUDIO_DIR, path.basename(scan.wavFile));
    if (fs.existsSync(audioPath)) {
      setCommonHeaders(res);
      res.writeHead(200, {
        "Content-Type": "audio/wav",
        "Content-Length": fs.statSync(audioPath).size,
        "Content-Disposition": `attachment; filename="${downloadName}"`,
      });
      fs.createReadStream(audioPath).pipe(res);
      return;
    }
  }

  const objectFile = storageFile || audioFile;
  if (objectFile && objectFile.objectKey) {
    const url = await storageAdapter.getSignedUrl(objectFile.objectKey, 900);
    if (/^https?:\/\//i.test(url)) {
      res.writeHead(302, { Location: url });
      res.end();
      return;
    }
    const localRoot = path.resolve(process.env.LOCAL_OBJECT_STORAGE_DIR || path.join(DATA_DIR, "objects"));
    const target = path.join(localRoot, objectFile.objectKey.split("/").map((part) => path.basename(part)).join(path.sep));
    const resolved = path.resolve(target);
    if (resolved.startsWith(localRoot) && fs.existsSync(resolved)) {
      setCommonHeaders(res);
      res.writeHead(200, {
        "Content-Type": objectFile.contentType || "application/octet-stream",
        "Content-Length": fs.statSync(resolved).size,
        "Content-Disposition": `attachment; filename="${downloadName}"`,
      });
      fs.createReadStream(resolved).pipe(res);
      return;
    }
  }

  throw httpError(404, "Không tìm thấy file trên storage");
}

async function serveDeviceOtaFirmwareDownload(req, res, url, segments) {
  const deviceId = decodeURIComponent(segments[2] || "");
  const otaId = decodeURIComponent(segments[4] || "");
  const token = readString(url.searchParams.get("token"), 180);
  const device = db.devices.find((item) => item.id === deviceId);
  const ota = device && device.ota && typeof device.ota === "object" ? device.ota : null;

  if (!device || !ota || ota.id !== otaId || !token || token !== ota.token) {
    throw httpError(404, "Firmware OTA không hợp lệ hoặc đã hết hạn");
  }
  if (ota.expiresAt && Date.parse(ota.expiresAt) < Date.now()) {
    device.otaStatus = "failed";
    device.ota = { ...ota, status: "failed", error: "Firmware download token expired", updatedAt: nowIso() };
    device.updatedAt = nowIso();
    await saveDeviceRecord(device);
    await appendDeviceEvent(device.id, "ota.download_expired", { otaId });
    throw httpError(410, "Firmware OTA đã hết hạn");
  }

  const firmwareFileId = readString(ota.firmwareFileId, 120);
  const record = firmwareFileId ? getStorageRecord(firmwareFileId) : null;
  if (!record || record.bucket !== "device-firmware") {
    throw httpError(404, "Không tìm thấy firmware trong bucket device-firmware");
  }

  const { storageFile } = getStorageFileSource(record);
  if (!storageFile || !storageFile.objectKey) {
    throw httpError(404, "Không tìm thấy file firmware trên storage");
  }

  await appendDeviceEvent(device.id, "ota.download", {
    otaId,
    firmwareFileId: record.id,
    firmwareVersion: ota.firmwareVersion || record.firmwareVersion || "",
  });

  const urlOrPath = await storageAdapter.getSignedUrl(storageFile.objectKey, 900);
  if (/^https?:\/\//i.test(urlOrPath)) {
    res.writeHead(302, { Location: urlOrPath, "Cache-Control": "no-store" });
    res.end();
    return;
  }

  const localRoot = path.resolve(process.env.LOCAL_OBJECT_STORAGE_DIR || path.join(DATA_DIR, "objects"));
  const target = path.join(localRoot, storageFile.objectKey.split("/").map((part) => path.basename(part)).join(path.sep));
  const resolved = path.resolve(target);
  if (!resolved.startsWith(localRoot) || !fs.existsSync(resolved)) {
    throw httpError(404, "Không tìm thấy file firmware trên storage");
  }

  setCommonHeaders(res);
  res.writeHead(200, {
    "Content-Type": storageFile.contentType || "application/octet-stream",
    "Content-Length": fs.statSync(resolved).size,
    "Content-Disposition": `attachment; filename="${path.basename(record.name || "firmware.bin")}"`,
    "Cache-Control": "no-store",
    "X-Smart-Health-Firmware-Version": ota.firmwareVersion || record.firmwareVersion || "",
    "X-Smart-Health-SHA256": ota.checksum || record.checksum || record.sha256 || "",
  });
  fs.createReadStream(resolved).pipe(res);
}

function buildStorageBucketSummaries(user = null) {
  const files = buildStorageFileRecords(user);
  return getStorageBucketsConfig().map((bucket) => {
    const bucketFiles = files.filter((file) => file.bucket === bucket.id);
    const byteSize = bucketFiles.reduce((sum, file) => sum + Number(file.byteSize || 0), 0);
    return {
      id: bucket.id,
      name: bucket.name || bucket.id,
      description: bucket.description || bucket.desc || "",
      desc: bucket.desc || bucket.description || "",
      iconKey: bucket.iconKey || "database",
      colorKey: bucket.colorKey || "blue",
      category: bucket.category || "custom",
      used: bytesToGb(byteSize),
      quota: Number(bucket.quotaGb || bucket.quota || 1),
      quotaGb: Number(bucket.quotaGb || bucket.quota || 1),
      files: bucketFiles.length,
      createdAt: bucket.createdAt ? formatDateTime(bucket.createdAt) : "",
      visibility: bucket.visibility || "private",
      allowedExtensions: bucket.allowedExtensions || [],
      allowedMimeTypes: bucket.allowedMimeTypes || [],
      maxFileSizeMb: Number(bucket.maxFileSizeMb || 500),
      retentionDays: Number(bucket.retentionDays || 0),
      encryptionRequired: Boolean(bucket.encryptionRequired),
      color: bucket.color || "from-blue-500 to-cyan-500",
      system: Boolean(bucket.system),
    };
  });
}

function buildAiReply(message) {
  const text = readString(message, 2000).toLowerCase();
  if (!text) {
    return "Bạn hãy nhập câu hỏi hoặc chọn một hồ sơ đo để tôi hỗ trợ phân tích.";
  }
  if (text.includes("ran") || text.includes("phổi") || text.includes("ho")) {
    return "Tín hiệu phổi bất thường cần đối chiếu với triệu chứng, SpO2, nhiệt độ và X-quang ngực. Nếu có ran nổ khu trú, nên cân nhắc viêm phổi, phù phổi hoặc xẹp phổi tùy bối cảnh lâm sàng.";
  }
  if (text.includes("tim") || text.includes("bpm") || text.includes("nhịp")) {
    return "Với tín hiệu tim, cần xem nhịp đều hay không, tần số BPM, tiếng T1/T2 và dấu hiệu âm thổi. Kết quả trong app hiện là hỗ trợ sàng lọc, không thay thế kết luận của bác sĩ.";
  }
  if (text.includes("tín hiệu") || text.includes("yếu") || text.includes("nhiễu")) {
    return "Nếu tín hiệu yếu, hãy kiểm tra tiếp xúc cảm biến, giảm nhiễu môi trường, giữ đầu nghe ổn định và đo lại ít nhất 10-15 giây để có file đủ chất lượng.";
  }
  return "Tôi đã ghi nhận câu hỏi. Với bản production, phần này có thể nối sang mô hình AI y khoa riêng; hiện backend trả gợi ý dựa trên ngữ cảnh đo và chất lượng tín hiệu.";
}

async function handleAuthApi(req, res, segments) {
  const method = req.method || "GET";

  if (segments.length === 3 && segments[2] === "firebase" && (method === "GET" || method === "POST")) {
    const user = requireSessionUser(req);
    sendJson(res, 200, {
      provider: req.authSource,
      user: publicUser(user),
      session: req.authSession || null,
    });
    return;
  }

  if (segments.length === 3 && segments[2] === "role-request" && method === "POST") {
    const user = requireSessionUser(req);
    const payload = await readJsonBody(req);
    const requestedRole = readString(payload.requestedRole || payload.role, 40);
    if (!["doctor", "patient"].includes(requestedRole)) {
      throw httpError(400, "Requested role is not supported");
    }

    const requestedWorkspaceType = normalizeWorkspaceType(
      payload.workspaceType || payload.accountType,
      payload.accountType === "solo_doctor" ? "solo_practice" : "clinic"
    );
    let selectedClinic = getClinicFromPayload(payload);
    if (requestedRole === "patient" && requestedWorkspaceType === "personal") {
      selectedClinic = ensurePersonalWorkspaceForUser(user);
    }
    if (requestedRole === "doctor" && requestedWorkspaceType === "solo_practice" && !selectedClinic) {
      selectedClinic = ensureSoloPracticeWorkspaceForUser(user, payload);
    }
    const requestedClinicId = readString(payload.organizationId || payload.clinicId || payload.clinic, 120);
    if (requestedRole === "doctor" && requestedClinicId && !selectedClinic && requestedWorkspaceType !== "solo_practice") {
      throw httpError(400, "Clinic is not available");
    }

    user.requestedRole = requestedRole;
    user.accountStatus = user.accountStatus || "active";
    if (requestedRole === "doctor") {
      user.roleRequestStatus = isApprovedDoctorRole(user) || user.role === "admin" ? "approved" : "pending";
      if (user.role !== "admin" && user.roleRequestStatus !== "approved") {
        user.role = "patient";
      }
      user.roleInfoRequiredFields = [];
      user.roleInfoRequestMessage = "";
    } else {
      user.role = "patient";
      user.roleRequestStatus = "approved";
    }
    user.roleRequestedAt = nowIso();
    user.name = readString(payload.name || payload.fullName, 160) || user.name;
    user.phone = readString(payload.phone, 40) || user.phone;
    user.license = readString(payload.license, 120) || user.license;
    if (selectedClinic) {
      ensureOrganizationFromCatalog(selectedClinic);
    }
    user.workspaceType = requestedWorkspaceType;
    user.organizationId = selectedClinic?.id || user.organizationId || "org_default_clinic";
    user.hospital = selectedClinic?.name || readString(payload.hospital || payload.clinicName, 160) || user.hospital;
    user.clinicSuggestion = selectedClinic ? "" : readString(payload.hospital || payload.clinicName, 160);
    user.department = readString(payload.department || payload.specialty, 160) || user.department;
    user.registrationReason = readString(payload.reason || payload.registrationReason, 1000) || user.registrationReason || "";
    user.updatedAt = nowIso();
    ensureMembershipForUser(user);

    if (repositories) {
      await repositories.users.save(user);
      await repositories.memberships.ensureForUser(user);
    }

    if (requestedRole === "doctor" && user.role !== "doctor" && user.role !== "admin") {
      await createBackendNotification({
        type: "info",
        title: "Yêu cầu duyệt bác sĩ",
        message: `${user.name || user.email || user.id} đang chờ admin cấp quyền bác sĩ.`,
        userId: user.id,
        organizationId: user.organizationId || "",
      });
      addAccessLog("Doctor role approval requested", { ip: req.socket.remoteAddress || "" });
    }

    await saveDb();
    sendJson(res, 200, {
      user: publicUser(user),
      roleRequest: {
        requestedRole: user.requestedRole,
        status: user.roleRequestStatus,
        requestedAt: user.roleRequestedAt,
      },
    });
    return;
  }

  if (segments.length === 3 && segments[2] === "login" && method === "POST") {
    assertDemoAuthAllowed();
    const payload = await readJsonBody(req);
    const user = findUserByLogin(payload.email || payload.phone || payload.login);
    if (!user || user.password !== readString(payload.password, 200)) {
      addAccessLog("Đăng nhập thất bại", { severity: "warning", ip: req.socket.remoteAddress || "" });
      saveDb();
      throw httpError(401, "Email/số điện thoại hoặc mật khẩu không đúng");
    }
    if (payload.role && user.role !== payload.role) {
      throw httpError(403, "Tài khoản không đúng vai trò đăng nhập");
    }
    const session = createSession(user, req);
    addAccessLog("Đăng nhập thành công", { ip: req.socket.remoteAddress || "" });
    saveDb();
    sendJson(res, 200, { token: session.token, user: publicUser(user) });
    return;
  }

  if (segments.length === 3 && segments[2] === "register" && method === "POST") {
    assertDemoAuthAllowed();
    const payload = await readJsonBody(req);
    const email = readString(payload.email, 160).toLowerCase();
    const phone = readString(payload.phone, 40);
    if (!email && !phone) {
      throw httpError(400, "Cần email hoặc số điện thoại");
    }
    if (email && findUserByLogin(email)) {
      throw httpError(409, "Email đã được sử dụng");
    }
    const createdAt = nowIso();
    const user = {
      id: createId("usr"),
      role: readString(payload.role || payload.accountType, 20) || "patient",
      name: readString(payload.name, 120) || "Người dùng Smart Health",
      email,
      phone,
      password: readString(payload.password, 200) || "12345678",
      license: readString(payload.license, 120),
      hospital: readString(payload.hospital, 160),
      department: readString(payload.department, 160),
      address: readString(payload.address, 240),
      organizationId: readString(payload.organizationId, 120) || "org_default_clinic",
      verifiedEmail: false,
      verifiedPhone: false,
      createdAt,
      updatedAt: createdAt,
    };
    db.users.unshift(user);
    if (user.role === "patient") {
      ensurePatientProfileForUser(user);
    }
    const session = createSession(user, req);
    createNotification("success", "Tạo tài khoản thành công", "Tài khoản Smart Health đã được tạo.");
    addAccessLog("Tạo tài khoản mới", { ip: req.socket.remoteAddress || "" });
    saveDb();
    sendJson(res, 201, { token: session.token, user: publicUser(user) });
    return;
  }

  if (segments.length === 3 && segments[2] === "logout" && method === "POST") {
    const token = getBearerToken(req);
    const session = db.sessions.find((item) => item.token === token);
    if (session) {
      session.revokedAt = nowIso();
    }
    if (req.authSession) {
      req.authSession.revokedAt = nowIso();
    }
    addAccessLog("Đăng xuất");
    saveDb();
    sendJson(res, 200, { ok: true });
    return;
  }

  if (segments.length === 3 && segments[2] === "sessions" && method === "GET") {
    const token = getBearerToken(req);
    const user = requireUser(req);
    const demoSessions = db.sessions
      .filter((item) => item.userId === user.id)
      .map((item) => publicAuthSession(item, Boolean(token && item.token === token)));
    const firebaseSessions = db.authSessions
      .filter((item) => item.userId === user.id)
      .map((item) => publicAuthSession(item, Boolean(req.authSession && req.authSession.id === item.id)));
    sendJson(res, 200, { sessions: [...firebaseSessions, ...demoSessions] });
    return;
  }

  if (segments.length === 5 && segments[2] === "sessions" && segments[4] === "revoke" && method === "POST") {
    const user = requireSessionUser(req);
    const sessionId = decodeURIComponent(segments[3]);
    const demoSession = db.sessions.find((item) => item.id === sessionId && item.userId === user.id);
    const firebaseSession = db.authSessions.find((item) => item.id === sessionId && item.userId === user.id);
    const sessionToRevoke = demoSession || firebaseSession;
    if (!sessionToRevoke) {
      throw httpError(404, "Session not found");
    }
    sessionToRevoke.revokedAt = nowIso();
    addAccessLog("Revoke auth session", { severity: "warning" });
    saveDb();
    sendJson(res, 200, { session: publicAuthSession(sessionToRevoke, false) });
    return;
  }

  if (segments.length === 3 && segments[2] === "password-reset" && method === "POST") {
    const payload = await readJsonBody(req);
    const login = readString(payload.email || payload.phone || payload.login, 160);
    addAccessLog(`Yêu cầu đặt lại mật khẩu cho ${login || "tài khoản"}`);
    createNotification("info", "Yêu cầu đặt lại mật khẩu", "Hướng dẫn đặt lại mật khẩu đã được ghi nhận.");
    saveDb();
    sendJson(res, 200, { ok: true, message: "Đã ghi nhận yêu cầu đặt lại mật khẩu" });
    return;
  }

  sendJson(res, 404, { error: "Auth route not found" });
}

async function handleAdminApi(req, res, url, segments) {
  const method = req.method || "GET";
  const adminUser = requireUser(req);

  if (segments[2] === "overview-stats" && method === "GET") {
    requireAnyCapability(adminUser, DASHBOARD_VIEW_CAPABILITIES, "Không có quyền xem tổng quan workspace");
    const workspaceId = getUserWorkspaceContext(adminUser).currentWorkspaceId || "";
    const scopedPatients = filterPatientsForUser(adminUser, db.patients);
    const scopedDevices = filterDevicesForUser(adminUser, db.devices);
    const scopedScans = filterScansForUser(adminUser, db.scans);
    const scopedFiles = buildStorageFileRecords(adminUser);
    const pendingDoctors = db.users
      .filter(isAwaitingDoctorApproval)
      .filter((user) => isPlatformAdminUser(adminUser) || !workspaceId || user.organizationId === workspaceId).length;
    const devicesOnline = scopedDevices.filter((d) => d.status === "active" || d.status === "connected" || d.connected).length;
    const devicesOffline = Math.max(0, scopedDevices.length - devicesOnline);
    const scansCount = scopedScans.length;
    const aiJobsFailed = scopedScans.filter((s) => s.status === "failed" || s.status === "error").length;
    const storageUsedGb = scopedFiles.reduce((sum, file) => sum + Number(file.byteSize || 0), 0) / 1024 / 1024 / 1024;

    const measureData = [
      { time: "00:00", count: Math.round(scansCount * 0.1) },
      { time: "08:00", count: Math.round(scansCount * 0.3) },
      { time: "16:00", count: Math.round(scansCount * 0.4) },
      { time: "23:59", count: Math.round(scansCount * 0.2) },
    ];

    const deviceData = [
      { name: "Đang hoạt động", value: devicesOnline, color: "#10B981" },
      { name: "Mất kết nối", value: devicesOffline, color: "#E2E8F0" },
    ];

    const aiJobData = [
      { name: "Đang xử lý", value: scopedScans.filter((s) => s.status === "processing").length, color: "#0EA5E9" },
      { name: "Hoàn tất", value: scopedScans.filter((s) => s.status === "completed" || s.aiLabel).length, color: "#10B981" },
      { name: "Thất bại", value: aiJobsFailed, color: "#EF4444" },
    ];

    sendJson(res, 200, {
      stats: {
        clinics: isPlatformAdminUser(adminUser) ? db.organizations.length || 1 : 1,
        workspaces: isPlatformAdminUser(adminUser) ? db.organizations.length || 1 : 1,
        patientsCount: scopedPatients.length,
        pendingDoctors,
        devicesOnline,
        scansCount,
        aiJobsFailed,
        storageUsed: storageUsedGb >= 1 ? `${storageUsedGb.toFixed(1)} GB` : `${Math.round(storageUsedGb * 1024)} MB`
      },
      measureData,
      deviceData,
      aiJobData
    });
    return;
  }

  if (segments[2] === "storage-stats" && method === "GET") {
    requireAnyCapability(adminUser, STORAGE_READ_CAPABILITIES, "Không có quyền xem storage workspace");
    const files = buildStorageFileRecords(adminUser);
    const buckets = buildStorageBucketSummaries(adminUser);
    const totalBytes = files.reduce((sum, file) => sum + Number(file.byteSize || 0), 0);
    const typeColors = {
      dcm: "#0B5C9A",
      dicom: "#0B5C9A",
      jpg: "#0EA5E9",
      jpeg: "#0EA5E9",
      png: "#0EA5E9",
      wav: "#10B981",
      mp3: "#10B981",
      pdf: "#F59E0B",
      json: "#64748B",
      bin: "#334155",
    };
    const typeTotals = new Map();
    for (const file of files) {
      const type = String(file.type || "bin").toLowerCase();
      typeTotals.set(type, Number(typeTotals.get(type) || 0) + Number(file.byteSize || 0));
    }
    const typeData = Array.from(typeTotals.entries()).map(([type, bytes]) => ({
      name: type.toUpperCase(),
      value: bytesToGb(bytes),
      color: typeColors[type] || "#64748B",
    }));
    const topBuckets = buckets
      .map((bucket) => ({ name: bucket.name || bucket.id, gb: bucket.used }))
      .sort((a, b) => b.gb - a.gb)
      .slice(0, 8);
    const byDay = new Map();
    for (const file of files) {
      const day = String(file.uploadedAt || "").split(" ")[0] || "";
      byDay.set(day, Number(byDay.get(day) || 0) + Number(file.byteSize || 0));
    }
    const growthData = Array.from(byDay.entries())
      .map(([day, bytes]) => ({ day, gb: bytesToGb(bytes) }))
      .slice(-30);
    const recentActivity = files.slice(0, 8).map((file) => ({
      who: file.uploader,
      what: "đã tải tệp lên storage",
      target: file.name,
      when: file.uploadedAt,
      action: "upload",
    }));
    const orgUsage = new Map();
    for (const scan of filterScansForUser(adminUser, db.scans)) {
      const audioFile = db.audioFiles.find((file) => file.scanId === scan.id);
      const bytes = getScanAudioByteSize(scan, audioFile);
      const org = db.organizations.find((item) => item.id === (scan.organizationId || "org_default_clinic"));
      const name = org ? org.name : scan.organizationId || "Smart Health";
      orgUsage.set(name, Number(orgUsage.get(name) || 0) + bytes);
    }
    const topClinicUsage = Array.from(orgUsage.entries())
      .map(([name, bytes]) => ({
        name,
        gb: bytesToGb(bytes),
        percent: totalBytes > 0 ? Math.round((Number(bytes) / totalBytes) * 100) : 0,
      }))
      .sort((a, b) => b.gb - a.gb);

    sendJson(res, 200, {
      totalUsed: buckets.reduce((sum, bucket) => sum + bucket.used, 0),
      totalQuota: buckets.reduce((sum, bucket) => sum + bucket.quota, 0),
      totalFiles: files.length,
      buckets,
      growthData,
      typeData,
      topBuckets,
      recentActivity,
      topClinicUsage,
    });
    return;
  }

  if (segments[2] === "storage-buckets" && segments.length === 3 && method === "POST") {
    requireAnyCapability(adminUser, STORAGE_MANAGE_CAPABILITIES, "Không có quyền tạo bucket storage");
    const payload = await readJsonBody(req);
    const id = sanitizeStorageId(payload.id || payload.name);
    if (getStorageBucket(id)) {
      throw httpError(409, "Bucket đã tồn tại");
    }
    const bucket = normalizeBucketPayload(payload);
    db.storageBuckets.unshift(bucket);
    await appendAudit("storage.bucket.create", req, {
      resourceType: "storage_bucket",
      resourceId: bucket.id,
      organizationId: adminUser.organizationId || "",
      metadata: { name: bucket.name, iconKey: bucket.iconKey, colorKey: bucket.colorKey },
    });
    saveDb();
    sendJson(res, 201, { bucket: buildStorageBucketSummaries().find((item) => item.id === bucket.id) });
    return;
  }

  if (segments[2] === "storage-buckets" && segments.length === 4 && method === "DELETE") {
    requireAnyCapability(adminUser, STORAGE_MANAGE_CAPABILITIES, "Không có quyền xóa bucket storage");
    const bucketId = decodeURIComponent(segments[3]);
    const bucket = getStorageBucket(bucketId);
    if (!bucket) {
      throw httpError(404, "Không tìm thấy bucket");
    }
    if (bucket.system) {
      throw httpError(400, "Bucket hệ thống không thể xóa");
    }
    const files = buildStorageFileRecords().filter((file) => file.bucket === bucket.id);
    if (files.length > 0) {
      throw httpError(400, "Chỉ có thể xóa bucket đang rỗng");
    }
    db.storageBuckets = db.storageBuckets.filter((item) => item.id !== bucket.id);
    await appendAudit("storage.bucket.delete", req, {
      resourceType: "storage_bucket",
      resourceId: bucket.id,
      organizationId: adminUser.organizationId || "",
    });
    saveDb();
    sendJson(res, 200, { deleted: true, bucketId: bucket.id });
    return;
  }

  if (segments.length === 5 && segments[2] === "storage-files" && segments[4] === "share" && method === "POST") {
    requireAnyCapability(adminUser, STORAGE_MANAGE_CAPABILITIES, "Không có quyền tạo signed URL chia sẻ file");
    const fileId = decodeURIComponent(segments[3]);
    const record = getStorageRecord(fileId);
    if (!record) {
      throw httpError(404, "Không tìm thấy tệp lưu trữ");
    }
    assertCanManageStorageRecord(adminUser, record);
    const { audioFile, storageFile } = getStorageFileSource(record);
    const objectFile = storageFile || audioFile;
    const shareUrl = objectFile?.objectKey
      ? await storageAdapter.getSignedUrl(objectFile.objectKey, 900)
      : record.downloadUrl;
    await appendAudit("storage.share", req, {
      resourceType: "storage_file",
      resourceId: record.id,
      organizationId: record.organizationId || adminUser.organizationId || "",
      metadata: { name: record.name, bucket: record.bucket },
    });
    sendJson(res, 200, { url: shareUrl, shareUrl, expiresInSeconds: 900 });
    return;
  }

  if (segments[2] === "storage-files" && segments.length === 3 && method === "GET") {
    requireAnyCapability(adminUser, STORAGE_READ_CAPABILITIES, "Không có quyền xem tệp storage");
    sendJson(res, 200, { files: buildStorageFileRecords(adminUser) });
    return;
  }

  if (segments[2] === "storage-files" && segments.length === 3 && method === "POST") {
    requireAnyCapability(adminUser, STORAGE_MANAGE_CAPABILITIES, "Không có quyền upload storage");
    const bucketId = sanitizeStorageId(url.searchParams.get("bucket") || req.headers["x-storage-bucket"], "heart-audio");
    const bucket = getStorageBucket(bucketId);
    if (!bucket) {
      throw httpError(404, "Không tìm thấy bucket");
    }
    const originalName = readString(url.searchParams.get("filename") || req.headers["x-file-name"], 240) || `${createId("file")}.bin`;
    const contentType = readString(req.headers["content-type"], 160) || "application/octet-stream";
    const buffer = await readRequestBuffer(req);
    if (!buffer.length) {
      throw httpError(400, "File tải lên đang rỗng");
    }
    assertStorageUploadAllowed(bucket, originalName, contentType, buffer.length);
    const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
    const fileId = createId("file");
    const organizationId = getWritableWorkspaceIdForUser(adminUser, url.searchParams.get("organizationId") || req.headers["x-organization-id"]);
    const objectKey = buildStorageObjectKey(organizationId, bucket.id, fileId, originalName);
    const upload = await storageAdapter.putBuffer(objectKey, buffer, contentType);
    const firmwareVersion =
      bucket.id === "device-firmware"
        ? readString(url.searchParams.get("firmwareVersion") || req.headers["x-firmware-version"], 80) ||
          inferFirmwareVersionFromName(originalName)
        : "";
    const storageFile = {
      id: fileId,
      bucket: bucket.id,
      name: path.basename(originalName),
      objectKey,
      storageProvider: upload.provider,
      contentType,
      type: getStorageFileType(originalName, contentType),
      byteSize: upload.byteSize || buffer.length,
      checksum,
      sha256: checksum,
      firmwareVersion,
      visibility: readString(url.searchParams.get("visibility"), 40) || bucket.visibility || "private",
      tags: parseCsvList(url.searchParams.get("tags") || req.headers["x-file-tags"]),
      uploader: adminUser.name || adminUser.email || "Quản trị hệ thống",
      createdByUserId: adminUser.id,
      organizationId,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    db.storageFiles.unshift(storageFile);
    db.storageFiles = db.storageFiles.slice(0, 1000);
    await appendAudit("storage.upload", req, {
      resourceType: "storage_file",
      resourceId: storageFile.id,
      organizationId: storageFile.organizationId,
      metadata: { name: storageFile.name, bucket: storageFile.bucket, byteSize: storageFile.byteSize },
    });
    saveDb();
    const file = buildStorageFileRecords(adminUser).find((item) => item.id === storageFile.id);
    sendJson(res, 201, { file });
    return;
  }

  if (segments[2] === "storage-files" && segments.length === 4 && method === "DELETE") {
    requireAnyCapability(adminUser, STORAGE_MANAGE_CAPABILITIES, "Không có quyền xóa tệp storage");
    const fileId = decodeURIComponent(segments[3]);
    const record = getStorageRecord(fileId);
    if (!record) {
      throw httpError(404, "Không tìm thấy tệp lưu trữ");
    }
    assertCanManageStorageRecord(adminUser, record);
    const { storageFile } = getStorageFileSource(record);
    if (!storageFile) {
      throw httpError(400, "Chỉ có thể xóa tệp được tải lên thủ công từ trang lưu trữ");
    }
    if (storageFile.objectKey && storageAdapter.deleteObject) {
      await storageAdapter.deleteObject(storageFile.objectKey);
    }
    db.storageFiles = db.storageFiles.filter((item) => item.id !== storageFile.id);
    await appendAudit("storage.delete", req, {
      resourceType: "storage_file",
      resourceId: storageFile.id,
      organizationId: storageFile.organizationId || adminUser.organizationId || "",
      metadata: { name: storageFile.name, bucket: storageFile.bucket },
    });
    saveDb();
    sendJson(res, 200, { deleted: true, fileId: storageFile.id });
    return;
  }

  if (segments[2] === "storage-stats" && method === "GET") {
    requireAnyCapability(adminUser, STORAGE_READ_CAPABILITIES, "Không có quyền xem storage workspace");
    {
    const files = buildStorageFileRecords(adminUser);
    const audioBytes = files.reduce((sum, file) => sum + Number(file.byteSize || 0), 0);
    const audioGb = bytesToGb(audioBytes);
    const firstAudio = files[files.length - 1];
    const buckets = [
      {
        id: "heart-audio",
        desc: "Audio nghe tim/phoi tu cac luot do that",
        used: audioGb,
        quota: Number(db.settings.storage.audioQuotaGb || db.settings.storage.quotaGb || 1),
        files: files.length,
        createdAt: firstAudio ? firstAudio.uploadedAt : "",
        visibility: "private",
        color: "from-emerald-500 to-teal-500",
      },
    ];
    const typeData = [{ name: "Audio tim/phoi", value: audioGb, color: "#10B981" }];
    const topBuckets = [{ name: "heart-audio", gb: audioGb }];
    const byDay = new Map();
    for (const file of files) {
      const day = String(file.uploadedAt || "").split(" ")[0] || "";
      byDay.set(day, Number(byDay.get(day) || 0) + Number(file.byteSize || 0));
    }
    const growthData = Array.from(byDay.entries()).map(([day, bytes]) => ({ day, gb: bytesToGb(bytes) }));
    const recentActivity = files.slice(0, 8).map((file) => ({
      who: file.uploader,
      what: "da tai audio len storage",
      target: file.name,
      when: file.uploadedAt,
      action: "upload",
    }));
    const orgUsage = new Map();
    for (const scan of filterScansForUser(adminUser, db.scans)) {
      const audioFile = db.audioFiles.find((file) => file.scanId === scan.id);
      const bytes = getScanAudioByteSize(scan, audioFile);
      const org = db.organizations.find((item) => item.id === (scan.organizationId || "org_default_clinic"));
      const name = org ? org.name : scan.organizationId || "Smart Health";
      orgUsage.set(name, Number(orgUsage.get(name) || 0) + bytes);
    }
    const topClinicUsage = Array.from(orgUsage.entries())
      .map(([name, bytes]) => ({
        name,
        gb: bytesToGb(bytes),
        percent: audioBytes > 0 ? Math.round((Number(bytes) / audioBytes) * 100) : 0,
      }))
      .sort((a, b) => b.gb - a.gb);

    sendJson(res, 200, {
      totalUsed: buckets.reduce((sum, bucket) => sum + bucket.used, 0),
      totalQuota: buckets.reduce((sum, bucket) => sum + bucket.quota, 0),
      totalFiles: files.length,
      buckets,
      growthData,
      typeData,
      topBuckets,
      recentActivity,
      topClinicUsage,
    });
    return;
    }

    const totalAudioCount = db.scans.filter((s) => s.wavFile).length;
    const audioGb = (totalAudioCount * 1.5) / 1024; // ~1.5MB per file

    const dicomGb = 1820;
    const reportGb = 610;
    const fwGb = 240;
    const avatarGb = 95;

    const buckets = [
      { id: "medical-images", desc: "Hình ảnh DICOM, X-quang, MRI", used: dicomGb, quota: 2500, files: 184320, createdAt: "12/01/2025", visibility: "private", color: "from-blue-500 to-cyan-500" },
      { id: "heart-audio", desc: "Audio nghe tim/phổi", used: audioGb < 1 ? 980 : Math.round(audioGb), quota: 1500, files: totalAudioCount || 92410, createdAt: "18/01/2025", visibility: "private", color: "from-emerald-500 to-teal-500" },
      { id: "patient-reports", desc: "Báo cáo PDF", used: reportGb, quota: 1000, files: 56120, createdAt: "05/02/2025", visibility: "private", color: "from-amber-500 to-orange-500" },
      { id: "device-firmware", desc: "Firmware OTA cho thiết bị", used: fwGb, quota: 300, files: 142, createdAt: "20/02/2025", visibility: "private", color: "from-violet-500 to-fuchsia-500" },
      { id: "avatars", desc: "Ảnh đại diện người dùng", used: avatarGb, quota: 200, files: 4280, createdAt: "01/01/2025", visibility: "public", color: "from-rose-500 to-pink-500" },
    ];

    const typeData = [
      { name: "DICOM", value: dicomGb, color: "#0B5C9A" },
      { name: "Audio tim/phổi", value: buckets[1].used, color: "#10B981" },
      { name: "PDF báo cáo", value: reportGb, color: "#F59E0B" },
      { name: "Video", value: 420, color: "#8B5CF6" },
      { name: "Khác", value: 370, color: "#94A3B8" },
    ];

    const topBuckets = [
      { name: "medical-images", gb: dicomGb },
      { name: "heart-audio", gb: buckets[1].used },
      { name: "patient-reports", gb: reportGb },
      { name: "device-firmware", gb: fwGb },
      { name: "avatars", gb: avatarGb },
    ];

    const growthData = Array.from({ length: 30 }, (_, i) => ({
      day: `${i + 1}`,
      gb: Math.round(3800 + i * 14 + Math.sin(i / 3) * 60),
    }));

    const recentActivity = [
      { who: "Hệ thống", what: "đã cập nhật dữ liệu", target: "db.json", when: "Vừa xong", action: "backup" }
    ];

    const topClinicUsage = [
      { name: "PK Đa khoa Tâm Anh", gb: 642, percent: 28 },
      { name: "PK Hô hấp Việt", gb: 488, percent: 21 },
      { name: "PK Tim mạch Minh Tâm", gb: 392, percent: 17 },
      { name: "PK Đa khoa Hoà Hảo", gb: 215, percent: 9 },
      { name: "PK Sài Gòn ITO", gb: 156, percent: 7 },
    ];

    const totalUsed = buckets.reduce((s, b) => s + b.used, 0);
    const totalQuota = buckets.reduce((s, b) => s + b.quota, 0);
    const totalFiles = buckets.reduce((s, b) => s + b.files, 0);

    sendJson(res, 200, {
      totalUsed,
      totalQuota,
      totalFiles,
      buckets,
      growthData,
      typeData,
      topBuckets,
      recentActivity,
      topClinicUsage
    });
    return;
  }

  if (segments.length === 5 && segments[2] === "storage-files" && segments[4] === "download" && method === "GET") {
    requireAnyCapability(adminUser, STORAGE_READ_CAPABILITIES, "Không có quyền tải file storage");
    await serveStorageFileDownload(req, res, decodeURIComponent(segments[3]));
    return;
  }

  if (segments[2] === "storage-files" && method === "GET") {
    requireAnyCapability(adminUser, STORAGE_READ_CAPABILITIES, "Không có quyền xem tệp storage");
    {
    sendJson(res, 200, { files: buildStorageFileRecords(adminUser) });
    return;
    }

    const files = db.scans.filter((s) => s.wavFile).map((s) => ({
      id: s.id,
      name: s.wavFile,
      bucket: "heart-audio",
      type: "wav",
      size: "1.2 MB",
      uploader: s.patientName || "Bệnh nhân",
      uploadedAt: new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(s.createdAt)),
      visibility: "private",
      tags: [s.mode || "audio"]
    }));

    files.unshift(
      { id: "f1", name: "patient_8821_ecg.dcm", bucket: "medical-images", type: "dcm", size: "24.6 MB", uploader: "BS. Trần Văn Nam", uploadedAt: "24/05/2026 09:12", visibility: "encrypted", tags: ["ecg", "khẩn cấp"] },
      { id: "f3", name: "bao-cao-thang-05.pdf", bucket: "patient-reports", type: "pdf", size: "1.4 MB", uploader: "Admin", uploadedAt: "23/05/2026 17:25", visibility: "private", tags: ["báo cáo"] },
      { id: "f4", name: "stetho_x1_fw_v2.1.4.bin", bucket: "device-firmware", type: "bin", size: "12.8 MB", uploader: "Hệ thống", uploadedAt: "23/05/2026 10:02", visibility: "private", tags: ["ota", "firmware"] }
    );

    sendJson(res, 200, { files });
    return;
  }

  if (segments[2] === "sync-firebase" && method === "POST") {
    requireAnyCapability(adminUser, ["platform.users.manage"], "Chỉ platform admin mới được đồng bộ Firebase");
    let deletedCount = 0;
    if (FIREBASE_AUTH_ENABLED) {
      try {
        const listUsersResult = await getFirebaseAdmin().auth().listUsers(1000);
        const firebaseUids = new Set(listUsersResult.users.map((u) => u.uid));
        
        const initialCount = db.users.length;
        db.users = db.users.filter((user) => {
          if (user.firebaseUid && !firebaseUids.has(user.firebaseUid) && user.role !== "admin") {
            db.memberships = db.memberships.filter((m) => m.userId !== user.id);
            db.sessions = db.sessions.filter((s) => s.userId !== user.id);
            db.authSessions = db.authSessions.filter((s) => s.userId !== user.id);
            return false;
          }
          return true;
        });
        
        deletedCount = initialCount - db.users.length;
        if (deletedCount > 0) {
          addAccessLog("Admin đồng bộ Firebase: xóa tài khoản không tồn tại", { severity: "warning", userId: adminUser.id, deletedCount });
          await saveDb();
        }
      } catch (err) {
        throw httpError(500, "Lỗi khi gọi Firebase Admin API: " + err.message);
      }
    }
    sendJson(res, 200, { deletedCount });
    return;
  }

  if (segments[2] === "admin-users" && segments.length === 3 && method === "GET") {
    requireAnyCapability(adminUser, ["platform.users.manage"], "Chỉ platform admin mới được xem tài khoản quản trị");
    const role = readString(url.searchParams.get("role"), 40);
    const status = readString(url.searchParams.get("status"), 40);
    const q = readString(url.searchParams.get("q"), 160).toLowerCase();
    const adminUsers = db.users
      .filter(isManagedAdminAccount)
      .filter((user) => !role || user.role === role || user.requestedRole === role)
      .filter((user) => !status || readString(user.accountStatus || "active", 40) === status)
      .filter((user) => {
        if (!q) return true;
        return [user.name, user.email, user.phone, user.hospital, user.organizationId]
          .map((value) => readString(value, 240).toLowerCase())
          .some((value) => value.includes(q));
      })
      .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))
      .map(publicManagedAdminAccount);
    sendJson(res, 200, { users: adminUsers });
    return;
  }

  if (segments[2] === "admin-users" && segments.length === 3 && method === "POST") {
    const payload = await readJsonBody(req);
    const result = await createManagedAdminAccount(payload, adminUser, req);
    sendJson(res, 201, result);
    return;
  }

  if (segments[2] === "admin-users" && segments.length === 4 && method === "PATCH") {
    requireAnyCapability(adminUser, ["platform.users.manage"], "Chỉ platform admin mới được cập nhật tài khoản quản trị");
    const targetUser = await findManagedAdminAccount(decodeURIComponent(segments[3]));
    const payload = await readJsonBody(req);
    const currentRole = normalizeManagedAdminRole(targetUser.role);
    const currentOrganizationId = readString(targetUser.organizationId || targetUser.workspaceId || "", 120);
    const nextRole = Object.prototype.hasOwnProperty.call(payload, "role")
      ? normalizeManagedAdminRole(payload.role)
      : currentRole;
    const nextOrganizationId = Object.prototype.hasOwnProperty.call(payload, "organizationId") ||
      Object.prototype.hasOwnProperty.call(payload, "workspaceId")
      ? readString(payload.organizationId || payload.workspaceId, 120) || currentOrganizationId
      : currentOrganizationId;

    if (Object.prototype.hasOwnProperty.call(payload, "name")) {
      targetUser.name = readString(payload.name, 160);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "phone")) {
      targetUser.phone = readString(payload.phone, 40);
      targetUser.verifiedPhone = Boolean(targetUser.phone);
    }
    if (Object.prototype.hasOwnProperty.call(payload, "title")) {
      targetUser.title = readString(payload.title, 120);
    }

    const roleChanged = nextRole !== currentRole || nextOrganizationId !== currentOrganizationId;
    if (roleChanged) {
      if (targetUser.id === adminUser.id) {
        throw httpError(400, "Không thể tự thay đổi vai trò/workspace của tài khoản đang đăng nhập");
      }
      await applyManagedAdminRole(targetUser, nextRole, nextOrganizationId);
    }

    if (Object.prototype.hasOwnProperty.call(payload, "accountStatus")) {
      const nextStatus = readString(payload.accountStatus, 40) || "active";
      if (!["active", "locked"].includes(nextStatus)) {
        throw httpError(400, "Trạng thái tài khoản admin không hợp lệ");
      }
      if (nextStatus === "locked") {
        assertAdminAccountCanBeLockedOrDeleted(adminUser, targetUser, "khóa");
      }
      targetUser.accountStatus = nextStatus;
      await updateFirebaseAdminAccount(targetUser, { disabled: nextStatus === "locked" });
      if (nextStatus === "locked") {
        db.authSessions = db.authSessions.map((session) =>
          session.userId === targetUser.id ? { ...session, revokedAt: session.revokedAt || nowIso() } : session,
        );
      }
    }

    await updateFirebaseAdminAccount(targetUser, { displayName: targetUser.name });
    await persistUserRecord(targetUser);
    await appendAudit("admin.user.update", req, {
      actorUserId: adminUser.id,
      organizationId: targetUser.organizationId || "",
      resourceType: "user",
      resourceId: targetUser.id,
      metadata: { role: targetUser.role, accountStatus: targetUser.accountStatus || "active" },
    });
    addAccessLog("Cập nhật tài khoản admin", { severity: "info", userId: adminUser.id, targetUserId: targetUser.id });
    sendJson(res, 200, { user: publicManagedAdminAccount(targetUser) });
    return;
  }

  if (segments[2] === "admin-users" && segments.length === 5 && segments[4] === "reset-password" && method === "POST") {
    requireAnyCapability(adminUser, ["platform.users.manage"], "Chỉ platform admin mới được đặt lại mật khẩu admin");
    const targetUser = await findManagedAdminAccount(decodeURIComponent(segments[3]));
    const payload = await readJsonBody(req);
    const nextPassword = readString(payload.password || payload.newPassword || payload.temporaryPassword, 200);
    if (nextPassword.length < 8) {
      throw httpError(400, "Mật khẩu mới cần tối thiểu 8 ký tự");
    }
    if (FIREBASE_AUTH_ENABLED) {
      if (!targetUser.firebaseUid) {
        throw httpError(400, "Tài khoản này chưa liên kết Firebase Auth nên không thể đặt lại mật khẩu");
      }
      const firebaseAdminApp = getFirebaseAdmin(process.env);
      if (!firebaseAdminApp) {
        throw httpError(503, "Firebase Admin chưa sẵn sàng");
      }
      await firebaseAdminApp.auth().updateUser(targetUser.firebaseUid, { password: nextPassword, disabled: false });
      await firebaseAdminApp.auth().revokeRefreshTokens(targetUser.firebaseUid);
    } else {
      assertDemoAuthAllowed();
      targetUser.password = nextPassword;
    }
    targetUser.accountStatus = "active";
    targetUser.updatedAt = nowIso();
    db.authSessions = db.authSessions.map((session) =>
      session.userId === targetUser.id ? { ...session, revokedAt: session.revokedAt || nowIso() } : session,
    );
    await persistUserRecord(targetUser);
    await appendAudit("admin.user.reset_password", req, {
      actorUserId: adminUser.id,
      organizationId: targetUser.organizationId || "",
      resourceType: "user",
      resourceId: targetUser.id,
    });
    createNotification("warning", "Mật khẩu admin đã được đặt lại", `Tài khoản ${targetUser.email} vừa được cấp mật khẩu mới.`, {
      userId: adminUser.id,
      organizationId: targetUser.organizationId || "",
      targetUserId: targetUser.id,
    });
    sendJson(res, 200, { ok: true, user: publicManagedAdminAccount(targetUser) });
    return;
  }

  if (segments[2] === "admin-users" && segments.length === 5 && ["lock", "unlock"].includes(segments[4]) && method === "POST") {
    requireAnyCapability(adminUser, ["platform.users.manage"], "Chỉ platform admin mới được khóa/mở khóa admin");
    const targetUser = await findManagedAdminAccount(decodeURIComponent(segments[3]));
    const action = segments[4];
    if (action === "lock") {
      assertAdminAccountCanBeLockedOrDeleted(adminUser, targetUser, "khóa");
    }
    targetUser.accountStatus = action === "lock" ? "locked" : "active";
    await updateFirebaseAdminAccount(targetUser, { disabled: action === "lock" });
    if (action === "lock") {
      db.authSessions = db.authSessions.map((session) =>
        session.userId === targetUser.id ? { ...session, revokedAt: session.revokedAt || nowIso() } : session,
      );
    }
    await persistUserRecord(targetUser);
    await appendAudit(`admin.user.${action}`, req, {
      actorUserId: adminUser.id,
      organizationId: targetUser.organizationId || "",
      resourceType: "user",
      resourceId: targetUser.id,
    });
    sendJson(res, 200, { user: publicManagedAdminAccount(targetUser) });
    return;
  }

  if (segments[2] === "admin-users" && segments.length === 4 && method === "DELETE") {
    requireAnyCapability(adminUser, ["platform.users.manage"], "Chỉ platform admin mới được xóa tài khoản admin");
    const targetUser = await findManagedAdminAccount(decodeURIComponent(segments[3]));
    assertAdminAccountCanBeLockedOrDeleted(adminUser, targetUser, "xóa");
    let firebaseDeleted = false;
    let firebaseAlreadyMissing = false;
    if (targetUser.firebaseUid && FIREBASE_AUTH_ENABLED) {
      const firebaseAdminApp = getFirebaseAdmin(process.env);
      if (firebaseAdminApp) {
        try {
          await firebaseAdminApp.auth().deleteUser(targetUser.firebaseUid);
          firebaseDeleted = true;
        } catch (err) {
          if (err && err.code === "auth/user-not-found") {
            firebaseAlreadyMissing = true;
          } else {
            throw err;
          }
        }
      }
    }
    if (repositories) {
      await repositories.users.deleteById(targetUser.id);
    } else {
      db.users = db.users.filter((user) => user.id !== targetUser.id);
      db.memberships = db.memberships.filter((membership) => membership.userId !== targetUser.id);
      db.sessions = db.sessions.filter((session) => session.userId !== targetUser.id);
      db.authSessions = db.authSessions.filter((session) => session.userId !== targetUser.id);
      await saveDb();
    }
    await appendAudit("admin.user.delete", req, {
      actorUserId: adminUser.id,
      organizationId: targetUser.organizationId || "",
      resourceType: "user",
      resourceId: targetUser.id,
      metadata: { firebaseUid: targetUser.firebaseUid || "", firebaseDeleted, firebaseAlreadyMissing },
    });
    sendJson(res, 200, {
      deleted: true,
      userId: targetUser.id,
      firebaseUid: targetUser.firebaseUid || "",
      firebaseDeleted,
      firebaseAlreadyMissing,
    });
    return;
  }

  if (segments[2] === "clinics" || segments[2] === "workspaces") {
    if (segments.length === 3 && method === "GET") {
      requireAnyCapability(adminUser, WORKSPACE_VIEW_CAPABILITIES, "Không có quyền xem workspace");
      const currentWorkspaceId = getUserWorkspaceContext(adminUser).currentWorkspaceId;
      const sourceWorkspaces = isPlatformAdminUser(adminUser)
        ? db.organizations
        : db.organizations.filter((item) => item.id === currentWorkspaceId);
      const clinics = sourceWorkspaces.map(publicWorkspace);
      sendJson(res, 200, { clinics, workspaces: clinics });
      return;
    }

    if (segments.length === 3 && method === "POST") {
      requireAnyCapability(adminUser, ["platform.workspaces.manage"], "Chỉ platform admin mới được tạo workspace");
      const payload = await readJsonBody(req);
      const name = readString(payload.name, 160);
      if (!name) {
        throw httpError(400, "Tên phòng khám là bắt buộc");
      }
      const id = readString(payload.id, 120) || createId("org");
      if (db.organizations.some((item) => item.id === id)) {
        throw httpError(409, "Mã phòng khám đã tồn tại");
      }
      const clinic = {
        id,
        name,
        type: readString(payload.type, 80) || "general",
        workspaceType: normalizeWorkspaceType(payload.workspaceType || payload.type, "clinic"),
        address: readString(payload.address, 240),
        phone: readString(payload.phone, 40),
        email: readString(payload.email, 160).toLowerCase(),
        website: readString(payload.website, 240),
        status: readString(payload.status, 40) || "active",
        legalName: readString(payload.legalName, 200),
        representative: readString(payload.representative, 160),
        ownerUserId: readString(payload.ownerUserId, 120),
        packageId: readString(payload.packageId, 120),
        subscriptionStatus: readString(payload.subscriptionStatus, 40) || "trial",
        billingCycle: readString(payload.billingCycle, 40) || "monthly",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      if (repositories) {
        await repositories.organizations.upsert(clinic);
      } else {
        db.organizations.unshift(clinic);
      }
      await appendAudit("clinic.create", req, {
        actorUserId: adminUser.id,
        organizationId: clinic.id,
        resourceType: "organization",
        resourceId: clinic.id,
      });
      addAccessLog(`Tạo phòng khám ${clinic.name}`, { severity: "success", userId: adminUser.id });
      await saveDb();
      sendJson(res, 201, { clinic: publicWorkspace(clinic), workspace: publicWorkspace(clinic) });
      return;
    }

    if (segments.length === 5 && segments[4] === "package" && method === "POST") {
      requireAnyCapability(adminUser, PACKAGE_MANAGE_CAPABILITIES, "Không có quyền gán gói dịch vụ");
      const clinicId = decodeURIComponent(segments[3]);
      const clinic = db.organizations.find((item) => item.id === clinicId);
      if (!clinic) {
        throw httpError(404, "Không tìm thấy workspace");
      }
      const payload = await readJsonBody(req);
      const packageId = readString(payload.packageId, 120);
      const servicePackage = db.servicePackages.find((item) => item.id === packageId);
      if (!servicePackage) {
        throw httpError(404, "Không tìm thấy gói dịch vụ");
      }
      clinic.packageId = packageId;
      clinic.subscriptionStatus = readString(payload.subscriptionStatus, 40) || clinic.subscriptionStatus || "active";
      clinic.billingCycle = readString(payload.billingCycle, 40) || servicePackage.duration || "monthly";
      clinic.updatedAt = nowIso();
      db.subscriptions.unshift({
        id: createId("sub"),
        organizationId: clinic.id,
        packageId,
        status: clinic.subscriptionStatus,
        billingCycle: clinic.billingCycle,
        startedAt: nowIso(),
        createdAt: nowIso(),
      });
      await appendAudit("workspace.package.assign", req, {
        actorUserId: adminUser.id,
        organizationId: clinic.id,
        resourceType: "organization",
        resourceId: clinic.id,
        metadata: { packageId },
      });
      await saveDb();
      sendJson(res, 200, { clinic: publicWorkspace(clinic), workspace: publicWorkspace(clinic) });
      return;
    }

    if (segments.length === 4 && method === "DELETE") {
      requireAnyCapability(adminUser, ["platform.workspaces.manage"], "Chỉ platform admin mới được xóa workspace");
      const clinicId = decodeURIComponent(segments[3]);
      const clinic = db.organizations.find((item) => item.id === clinicId);
      if (!clinic) {
        throw httpError(404, "Không tìm thấy phòng khám");
      }
      const linkSummary = getWorkspaceLinkSummary(clinicId);
      if (linkSummary.total > 0) {
        throw httpError(
          409,
          "Không thể xóa phòng khám đang còn tài khoản, bệnh nhân hoặc thiết bị liên kết",
          "WORKSPACE_IN_USE",
          { workspaceId: clinicId, workspaceName: clinic.name, ...linkSummary },
        );
      }
      db.organizations = db.organizations.filter((item) => item.id !== clinicId);
      await appendAudit("clinic.delete", req, {
        actorUserId: adminUser.id,
        organizationId: clinicId,
        resourceType: "organization",
        resourceId: clinicId,
      });
      addAccessLog(`Xóa phòng khám ${clinic.name}`, { severity: "warning", userId: adminUser.id });
      await saveDb();
      sendJson(res, 200, { deleted: true, clinicId });
      return;
    }

    if (segments.length === 4 && method === "PATCH") {
      const clinicId = decodeURIComponent(segments[3]);
      const clinic = db.organizations.find((item) => item.id === clinicId);
      requireAnyCapability(adminUser, WORKSPACE_MANAGE_CAPABILITIES, "Không có quyền cập nhật workspace");
      if (!isPlatformAdminUser(adminUser) && clinicId !== getUserWorkspaceContext(adminUser).currentWorkspaceId) {
        throw httpError(403, "Workspace nam ngoai pham vi hien tai");
      }
      if (!clinic) {
        throw httpError(404, "Không tìm thấy phòng khám");
      }

      const payload = await readJsonBody(req);
      if (!isPlatformAdminUser(adminUser)) {
        for (const restrictedField of ["type", "workspaceType", "status", "ownerUserId", "packageId", "subscriptionStatus", "billingCycle"]) {
          if (Object.prototype.hasOwnProperty.call(payload, restrictedField)) {
            throw httpError(403, "Workspace Portal không được sửa gói, billing hoặc loại workspace");
          }
        }
      }
      if (Object.prototype.hasOwnProperty.call(payload, "name")) {
        const name = readString(payload.name, 160);
        if (!name) {
          throw httpError(400, "Tên phòng khám là bắt buộc");
        }
        clinic.name = name;
      }
      for (const field of [
        "type",
        "workspaceType",
        "address",
        "phone",
        "email",
        "website",
        "status",
        "legalName",
        "representative",
        "ownerUserId",
        "packageId",
        "subscriptionStatus",
        "billingCycle",
      ]) {
        if (Object.prototype.hasOwnProperty.call(payload, field)) {
          const maxLength = field === "address" || field === "website" ? 240 : field === "legalName" ? 200 : 160;
          clinic[field] = field === "workspaceType"
            ? normalizeWorkspaceType(payload[field], clinic.workspaceType || "clinic")
            : readString(payload[field], maxLength);
        }
      }
      if (!["active", "inactive"].includes(String(clinic.status || "active"))) {
        clinic.status = "active";
      }
      clinic.updatedAt = nowIso();

      if (repositories) {
        await repositories.organizations.upsert(clinic);
      } else {
        await saveDb();
      }
      await appendAudit("clinic.update", req, {
        actorUserId: adminUser.id,
        organizationId: clinic.id,
        resourceType: "organization",
        resourceId: clinic.id,
        metadata: { status: clinic.status || "active" },
      });
      addAccessLog(`Cập nhật phòng khám ${clinic.name}`, { severity: "success", userId: adminUser.id });
      await saveDb();
      sendJson(res, 200, { clinic: publicWorkspace(clinic), workspace: publicWorkspace(clinic) });
      return;
    }
  }

  if (segments[2] === "packages") {
    if (segments.length === 3 && method === "GET") {
      requireAnyCapability(adminUser, ["platform.packages.manage"], "Không có quyền xem gói dịch vụ hệ thống");
      sendJson(res, 200, { packages: db.servicePackages });
      return;
    }

    if (segments.length === 3 && method === "POST") {
      requireAnyCapability(adminUser, PACKAGE_MANAGE_CAPABILITIES, "Không có quyền tạo gói dịch vụ");
      const payload = await readJsonBody(req);
      const name = readString(payload.name || payload.packageName, 160);
      if (!name) {
        throw httpError(400, "Tên gói dịch vụ là bắt buộc");
      }
      const servicePackage = {
        id: readString(payload.id, 120) || createId("pkg"),
        name,
        type: readString(payload.type || payload.packageType, 80) || "basic",
        segment: normalizePackageSegment(payload.segment, "organization"),
        price: readOptionalNumber(payload.price) ?? 0,
        currency: readString(payload.currency, 20) || "VND",
        duration: readString(payload.duration, 40) || "monthly",
        maxDevices: readOptionalNumber(payload.maxDevices) ?? 0,
        maxDoctors: readOptionalNumber(payload.maxDoctors) ?? 0,
        maxPatients: readOptionalNumber(payload.maxPatients) ?? 0,
        storageGb: readOptionalNumber(payload.storageGb) ?? 0,
        aiMonthly: readOptionalNumber(payload.aiMonthly) ?? 0,
        retentionDays: readOptionalNumber(payload.retentionDays) ?? 0,
        features: payload.features && typeof payload.features === "object" ? payload.features : {},
        status: "active",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      db.servicePackages.unshift(servicePackage);
      await appendAudit("package.create", req, {
        actorUserId: adminUser.id,
        resourceType: "service_package",
        resourceId: servicePackage.id,
      });
      addAccessLog(`Tạo gói dịch vụ ${servicePackage.name}`, { severity: "success", userId: adminUser.id });
      await saveDb();
      sendJson(res, 201, { package: servicePackage });
      return;
    }

    if (segments.length === 4 && method === "PATCH") {
      requireAnyCapability(adminUser, PACKAGE_MANAGE_CAPABILITIES, "Không có quyền sửa gói dịch vụ");
      const packageId = decodeURIComponent(segments[3]);
      const servicePackage = db.servicePackages.find((item) => item.id === packageId);
      if (!servicePackage) {
        throw httpError(404, "Không tìm thấy gói dịch vụ");
      }
      const payload = await readJsonBody(req);
      if (Object.prototype.hasOwnProperty.call(payload, "name") || Object.prototype.hasOwnProperty.call(payload, "packageName")) {
        const name = readString(payload.name || payload.packageName, 160);
        if (!name) {
          throw httpError(400, "Tên gói dịch vụ là bắt buộc");
        }
        servicePackage.name = name;
      }
      for (const field of ["type", "packageType", "currency", "duration", "status"]) {
        if (Object.prototype.hasOwnProperty.call(payload, field)) {
          const target = field === "packageType" ? "type" : field;
          servicePackage[target] = readString(payload[field], 80);
        }
      }
      if (Object.prototype.hasOwnProperty.call(payload, "segment")) {
        servicePackage.segment = normalizePackageSegment(payload.segment, servicePackage.segment || "organization");
      }
      for (const field of ["price", "maxDevices", "maxDoctors", "maxPatients", "storageGb", "aiMonthly", "retentionDays"]) {
        if (Object.prototype.hasOwnProperty.call(payload, field)) {
          servicePackage[field] = readOptionalNumber(payload[field]) ?? 0;
        }
      }
      if (payload.features && typeof payload.features === "object") {
        servicePackage.features = payload.features;
      }
      servicePackage.updatedAt = nowIso();
      await appendAudit("package.update", req, {
        actorUserId: adminUser.id,
        resourceType: "service_package",
        resourceId: packageId,
      });
      addAccessLog(`Cập nhật gói dịch vụ ${servicePackage.name}`, { severity: "success", userId: adminUser.id });
      await saveDb();
      sendJson(res, 200, { package: servicePackage });
      return;
    }

    if (segments.length === 4 && method === "DELETE") {
      requireAnyCapability(adminUser, PACKAGE_MANAGE_CAPABILITIES, "Không có quyền xóa gói dịch vụ");
      const packageId = decodeURIComponent(segments[3]);
      const servicePackage = db.servicePackages.find((item) => item.id === packageId);
      if (!servicePackage) {
        throw httpError(404, "Không tìm thấy gói dịch vụ");
      }
      db.servicePackages = db.servicePackages.filter((item) => item.id !== packageId);
      await appendAudit("package.delete", req, {
        actorUserId: adminUser.id,
        resourceType: "service_package",
        resourceId: packageId,
      });
      addAccessLog(`Xóa gói dịch vụ ${servicePackage.name}`, { severity: "warning", userId: adminUser.id });
      await saveDb();
      sendJson(res, 200, { deleted: true, packageId });
      return;
    }
  }

  if (segments[2] === "doctor-requests") {
    requireAnyCapability(adminUser, ["platform.doctorRequests.manage"], "Chỉ platform admin mới được xử lý yêu cầu bác sĩ");
    if (segments.length === 3 && method === "GET") {
      const status = readString(url.searchParams.get("status"), 40);
      const users = repositories ? await repositories.users.listDoctorRequests(status) : db.users
        .filter((user) => user.requestedRole === "doctor")
        .filter((user) => !status || status === "all" || user.roleRequestStatus === status)
        .sort((a, b) => String(b.roleRequestedAt || b.createdAt || "").localeCompare(String(a.roleRequestedAt || a.createdAt || "")));
      const requests = users.map(publicDoctorRoleRequest);

      sendJson(res, 200, { requests });
      return;
    }

    const targetUserId = segments[3] ? decodeURIComponent(segments[3]) : "";
    const targetUser = repositories
      ? await repositories.users.findByIdOrFirebaseUid(targetUserId)
      : db.users.find((user) => user.id === targetUserId || user.firebaseUid === targetUserId);
    if (!targetUser) {
      throw httpError(404, "Doctor request not found");
    }

    if (segments[4] === "approve" && method === "POST") {
      const payload = await readJsonBody(req);
      const organizationId = readString(payload.organizationId, 120) || targetUser.organizationId || "org_default_clinic";
      targetUser.role = "doctor";
      targetUser.requestedRole = "doctor";
      targetUser.roleRequestStatus = "approved";
      targetUser.accountStatus = "active";
      targetUser.roleApprovedAt = nowIso();
      targetUser.roleRejectedAt = "";
      targetUser.roleRejectReason = "";
      targetUser.organizationId = organizationId;
      targetUser.updatedAt = nowIso();
      ensureMembershipForUser(targetUser);
      if (repositories) {
        await repositories.users.save(targetUser);
        await repositories.memberships.ensureForUser(targetUser);
      }

      let firebaseClaims;
      try {
        firebaseClaims = await setFirebaseRoleClaimsForUser(targetUser, "doctor", organizationId);
        targetUser.firebaseClaims = firebaseClaims;
      } catch (err) {
        firebaseClaims = {
          updated: false,
          warning: "Không thể cập nhật Firebase custom claims, quyền bác sĩ vẫn đã được lưu trong backend.",
          error: err && err.message ? err.message : String(err),
        };
      }
      if (repositories) {
        await repositories.users.save(targetUser);
      }
      createNotification(
        "success",
        "Tài khoản bác sĩ đã được phê duyệt",
        `${targetUser.name || targetUser.email || targetUser.id} đã được cấp quyền bác sĩ.`
      );
      addAccessLog("Doctor role request approved", {
        severity: "success",
        userId: adminUser.id,
        ip: req.socket.remoteAddress || "",
      });
      await createBackendNotification({
        type: "success",
        title: "Tài khoản bác sĩ đã được phê duyệt",
        message: `${targetUser.name || targetUser.email || targetUser.id} đã được cấp quyền bác sĩ.`,
        userId: targetUser.id,
        organizationId,
      });
      await appendAudit("doctor.approve", req, {
        actorUserId: adminUser.id,
        organizationId,
        resourceType: "user",
        resourceId: targetUser.id,
        metadata: { firebaseUid: targetUser.firebaseUid || "", firebaseClaims },
      });
      await saveDb();

      sendJson(res, 200, {
        request: publicDoctorRoleRequest(targetUser),
        firebaseClaims,
      });
      return;
    }

    if (segments[4] === "reject" && method === "POST") {
      const payload = await readJsonBody(req);
      const reason = readString(payload.reason, 1000);
      if (!reason) {
        throw httpError(400, "Reject reason is required");
      }

      targetUser.requestedRole = "doctor";
      targetUser.role = targetUser.role === "admin" ? "admin" : "patient";
      targetUser.roleRequestStatus = "rejected";
      targetUser.accountStatus = "active";
      targetUser.roleRejectedAt = nowIso();
      targetUser.roleRejectReason = reason;
      targetUser.updatedAt = nowIso();
      if (repositories) {
        await repositories.users.save(targetUser);
      }
      createNotification(
        "warning",
        "Yêu cầu bác sĩ đã bị từ chối",
        `${targetUser.name || targetUser.email || targetUser.id}: ${reason}`
      );
      addAccessLog("Doctor role request rejected", {
        severity: "warning",
        userId: adminUser.id,
        ip: req.socket.remoteAddress || "",
      });
      await createBackendNotification({
        type: "warning",
        title: "Yêu cầu bác sĩ đã bị từ chối",
        message: `${targetUser.name || targetUser.email || targetUser.id}: ${reason}`,
        userId: targetUser.id,
        organizationId: targetUser.organizationId || "",
      });
      await appendAudit("doctor.reject", req, {
        actorUserId: adminUser.id,
        organizationId: targetUser.organizationId || "",
        resourceType: "user",
        resourceId: targetUser.id,
        metadata: { reason },
      });
      await saveDb();

      sendJson(res, 200, { request: publicDoctorRoleRequest(targetUser) });
      return;
    }

    if (segments[4] === "request-info" && method === "POST") {
      const payload = await readJsonBody(req);
      const message = readString(payload.message, 1000);
      const requiredFields = normalizeRoleInfoFields(payload.requiredFields);
      if (!message) {
        throw httpError(400, "Additional information message is required");
      }

      targetUser.requestedRole = "doctor";
      targetUser.role = targetUser.role === "admin" ? "admin" : "patient";
      targetUser.roleRequestStatus = "needs_info";
      targetUser.accountStatus = "active";
      targetUser.roleInfoRequestAt = nowIso();
      targetUser.roleInfoRequestMessage = message;
      targetUser.roleInfoRequiredFields = requiredFields;
      targetUser.updatedAt = nowIso();
      if (repositories) {
        await repositories.users.save(targetUser);
      }
      createNotification(
        "warning",
        "Yêu cầu bổ sung hồ sơ bác sĩ",
        `${targetUser.name || targetUser.email || targetUser.id}: ${message}`
      );
      addAccessLog("Doctor role request needs additional information", {
        severity: "warning",
        userId: adminUser.id,
        ip: req.socket.remoteAddress || "",
      });
      await createBackendNotification({
        type: "warning",
        title: "Yêu cầu bổ sung hồ sơ bác sĩ",
        message: `${targetUser.name || targetUser.email || targetUser.id}: ${message}`,
        userId: targetUser.id,
        organizationId: targetUser.organizationId || "",
      });
      await appendAudit("doctor.request_info", req, {
        actorUserId: adminUser.id,
        organizationId: targetUser.organizationId || "",
        resourceType: "user",
        resourceId: targetUser.id,
        metadata: { message, requiredFields },
      });
      await saveDb();

      sendJson(res, 200, { request: publicDoctorRoleRequest(targetUser) });
      return;
    }
  }

  if (segments[2] === "doctors" && segments.length === 3 && method === "GET") {
    requireAnyCapability(adminUser, ["platform.users.manage", "workspace.staff.manage"], "Không có quyền xem nhân sự bác sĩ");
    const users = (repositories ? await repositories.users.listApprovedDoctors() : db.users
      .filter((user) => user.requestedRole === "doctor" && user.roleRequestStatus === "approved"))
      .filter((user) => isPlatformAdminUser(adminUser) || user.organizationId === getUserWorkspaceContext(adminUser).currentWorkspaceId)
      .sort((a, b) => String(b.roleApprovedAt || b.updatedAt || "").localeCompare(String(a.roleApprovedAt || a.updatedAt || "")));
    const doctors = users.map(publicUser);

    sendJson(res, 200, { doctors });
    return;
  }

  if (segments[2] === "doctors" && segments.length === 3 && method === "POST") {
    requireAnyCapability(adminUser, DOCTOR_MANAGE_CAPABILITIES, "Không có quyền tạo tài khoản bác sĩ");
    const payload = await readJsonBody(req);
    const email = readString(payload.email, 160).toLowerCase();
    const phone = readString(payload.phone, 40);
    if (!email && !phone) {
      throw httpError(400, "Cần email hoặc số điện thoại để tạo bác sĩ");
    }
    if (email && findUserByLogin(email)) {
      throw httpError(409, "Email đã được sử dụng");
    }
    const selectedClinic = getClinicFromPayload(payload);
    const organizationId = isPlatformAdminUser(adminUser)
      ? selectedClinic?.id || readString(payload.organizationId || payload.clinic, 120) || "org_default_clinic"
      : getUserWorkspaceContext(adminUser).currentWorkspaceId || adminUser.organizationId || "org_default_clinic";
    const doctor = {
      id: createId("usr"),
      role: "doctor",
      requestedRole: "doctor",
      roleRequestStatus: "approved",
      accountStatus: "active",
      name: readString(payload.name || payload.fullName, 160) || email || phone,
      email,
      phone,
      license: readString(payload.license || payload.licenseNumber, 120),
      hospital: selectedClinic?.name || readString(payload.hospital || payload.clinicName, 160),
      department: readString(payload.department || payload.specialty, 160),
      organizationId,
      verifiedEmail: false,
      verifiedPhone: false,
      roleRequestedAt: nowIso(),
      roleApprovedAt: nowIso(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    db.users.unshift(doctor);
    ensureMembershipForUser(doctor);
    if (repositories) {
      await repositories.users.save(doctor);
      await repositories.memberships.ensureForUser(doctor);
    }
    await appendAudit("doctor.create", req, {
      actorUserId: adminUser.id,
      organizationId,
      resourceType: "user",
      resourceId: doctor.id,
    });
    addAccessLog(`Admin tạo bác sĩ ${doctor.name}`, { severity: "success", userId: adminUser.id });
    await saveDb();
    sendJson(res, 201, { doctor: publicUser(doctor) });
    return;
  }

  if (segments[2] === "doctors" && segments.length === 4 && method === "DELETE") {
    requireAnyCapability(adminUser, DOCTOR_MANAGE_CAPABILITIES, "Không có quyền xóa tài khoản bác sĩ");
    const targetUserId = decodeURIComponent(segments[3]);
    const targetUser = repositories
      ? await repositories.users.findByIdOrFirebaseUid(targetUserId)
      : db.users.find((user) => user.id === targetUserId || user.firebaseUid === targetUserId);
    if (!targetUser) {
      throw httpError(404, "User not found");
    }

    if (targetUser.role === "admin" || (targetUser.role !== "doctor" && targetUser.requestedRole !== "doctor")) {
      throw httpError(400, "Only doctor accounts can be deleted from this endpoint");
    }
    if (!isPlatformAdminUser(adminUser) && targetUser.organizationId !== getUserWorkspaceContext(adminUser).currentWorkspaceId) {
      throw httpError(403, "Không được xóa bác sĩ ngoài workspace");
    }

    let firebaseDeleted = false;
    let firebaseAlreadyMissing = false;
    let warning = "";
    if (targetUser.firebaseUid) {
      if (FIREBASE_AUTH_ENABLED) {
        try {
          const admin = getFirebaseAdmin(process.env);
          if (!admin) {
            warning = "Firebase Auth đang tắt nên hệ thống chỉ xóa dữ liệu backend.";
          } else {
            await admin.auth().deleteUser(targetUser.firebaseUid);
            firebaseDeleted = true;
          }
        } catch (err) {
          if (err && err.code === "auth/user-not-found") {
            firebaseAlreadyMissing = true;
          } else {
            throw httpError(502, "Không thể xóa tài khoản Firebase Auth: " + (err && err.message ? err.message : String(err)));
          }
        }
      } else {
        warning = "Firebase Auth đang tắt nên hệ thống chỉ xóa dữ liệu backend.";
      }
    } else {
      warning = "Tài khoản backend này chưa có firebaseUid nên không có tài khoản Firebase Auth liên kết để xóa.";
    }

    if (repositories) {
      await repositories.users.deleteById(targetUser.id);
    } else {
      db.users = db.users.filter((user) => user.id !== targetUser.id);
      db.memberships = db.memberships.filter((item) => item.userId !== targetUser.id);
      db.sessions = db.sessions.filter((item) => item.userId !== targetUser.id);
      db.authSessions = db.authSessions.filter((item) => item.userId !== targetUser.id);
      db.notificationDevices = db.notificationDevices.filter((item) => item.userId !== targetUser.id);
      db.doctorPatientAccess = db.doctorPatientAccess.filter((item) => item.doctorUserId !== targetUser.id && item.doctorId !== targetUser.id);
      for (const item of db.doctorPatientAccess) {
        if (item.grantedByUserId === targetUser.id) item.grantedByUserId = "";
      }
      for (const item of db.devices) {
        if (item.pairedUserId === targetUser.id) item.pairedUserId = "";
      }
      for (const item of db.patients) {
        if (item.ownerUserId === targetUser.id) item.ownerUserId = "";
      }
      for (const item of db.scans) {
        if (item.createdByUserId === targetUser.id) item.createdByUserId = "";
      }
      for (const item of db.notifications) {
        if (item.userId === targetUser.id) item.userId = "";
      }
      await saveDb();
    }

    await appendAudit("doctor.delete", req, {
      actorUserId: adminUser.id,
      organizationId: targetUser.organizationId || "",
      resourceType: "user",
      resourceId: targetUser.id,
      metadata: {
        firebaseUid: targetUser.firebaseUid || "",
        firebaseDeleted,
        firebaseAlreadyMissing,
        warning,
      },
    });
    addAccessLog("Admin xóa tài khoản bác sĩ", {
      severity: "warning",
      userId: adminUser.id,
      targetUserId: targetUser.id,
      firebaseUid: targetUser.firebaseUid || "",
      firebaseDeleted,
      firebaseAlreadyMissing,
    });
    await saveDb();

    sendJson(res, 200, {
      deleted: true,
      firebaseDeleted,
      firebaseAlreadyMissing,
      firebaseUid: targetUser.firebaseUid || "",
      warning,
    });
    return;
  }

  if (segments[2] === "doctors" && segments.length === 5 && segments[4] === "lock" && method === "PATCH") {
    requireAnyCapability(adminUser, DOCTOR_MANAGE_CAPABILITIES, "Không có quyền khóa tài khoản bác sĩ");
    const targetUserId = decodeURIComponent(segments[3]);
    const targetUser = repositories ? await repositories.users.findByIdOrFirebaseUid(targetUserId) : db.users.find((u) => u.id === targetUserId);
    if (!targetUser) {
      throw httpError(404, "User not found");
    }
    if (!isPlatformAdminUser(adminUser) && targetUser.organizationId !== getUserWorkspaceContext(adminUser).currentWorkspaceId) {
      throw httpError(403, "Không được khóa bác sĩ ngoài workspace");
    }
    
    targetUser.role = "patient";
    targetUser.requestedRole = "doctor";
    targetUser.roleRequestStatus = "approved";
    targetUser.accountStatus = "locked";
    targetUser.updatedAt = nowIso();
    if (repositories) {
      await repositories.users.save(targetUser);
    }
    
    if (targetUser.firebaseUid && FIREBASE_AUTH_ENABLED) {
      try {
        await setFirebaseRoleClaimsForUser(targetUser, "patient", targetUser.organizationId);
      } catch (err) {
        console.error("Failed to update firebase claim when locking account:", err);
      }
    }
    await appendAudit("doctor.lock", req, {
      actorUserId: adminUser.id,
      organizationId: targetUser.organizationId || "",
      resourceType: "user",
      resourceId: targetUser.id,
    });
    
    addAccessLog("Admin khóa tài khoản bác sĩ", { severity: "warning", userId: adminUser.id });
    await saveDb();
    
    sendJson(res, 200, { request: publicUser(targetUser) });
    return;
  }

  if (segments[2] === "doctors" && segments.length === 5 && segments[4] === "unlock" && method === "PATCH") {
    requireAnyCapability(adminUser, DOCTOR_MANAGE_CAPABILITIES, "Không có quyền mở khóa tài khoản bác sĩ");
    const targetUserId = decodeURIComponent(segments[3]);
    const targetUser = repositories ? await repositories.users.findByIdOrFirebaseUid(targetUserId) : db.users.find((u) => u.id === targetUserId);
    if (!targetUser) {
      throw httpError(404, "User not found");
    }
    if (!isPlatformAdminUser(adminUser) && targetUser.organizationId !== getUserWorkspaceContext(adminUser).currentWorkspaceId) {
      throw httpError(403, "Không được mở khóa bác sĩ ngoài workspace");
    }
    
    targetUser.role = "doctor";
    targetUser.requestedRole = "doctor";
    targetUser.roleRequestStatus = "approved";
    targetUser.accountStatus = "active";
    targetUser.updatedAt = nowIso();
    if (repositories) {
      await repositories.users.save(targetUser);
    }
    
    if (targetUser.firebaseUid && FIREBASE_AUTH_ENABLED) {
      try {
        await setFirebaseRoleClaimsForUser(targetUser, "doctor", targetUser.organizationId);
      } catch (err) {
        console.error("Failed to update firebase claim when unlocking account:", err);
      }
    }
    await appendAudit("doctor.unlock", req, {
      actorUserId: adminUser.id,
      organizationId: targetUser.organizationId || "",
      resourceType: "user",
      resourceId: targetUser.id,
    });
    
    addAccessLog("Admin mở khóa tài khoản bác sĩ", { severity: "success", userId: adminUser.id });
    await saveDb();
    
    sendJson(res, 200, { request: publicUser(targetUser) });
    return;
  }

  sendJson(res, 404, { error: "Admin route not found" });
}

async function handleMeApi(req, res, segments) {
  const method = req.method || "GET";
  const user = requireUser(req);
  if (isPatientUser(user)) {
    ensurePatientProfileForUser(user);
  }

  if (segments.length === 2 && method === "GET") {
    sendJson(res, 200, { user: publicUser(user) });
    return;
  }

  if (segments.length === 2 && method === "PATCH") {
    const payload = await readJsonBody(req);
    const selectedClinic = getClinicFromPayload(payload);
    for (const field of [
      "name",
      "title",
      "phone",
      "license",
      "hospital",
      "department",
      "address",
      "avatarFileId",
      "avatarUrl",
    ]) {
      if (Object.prototype.hasOwnProperty.call(payload, field)) {
        const maxLength = field === "address" || field === "avatarUrl" ? 1000 : 160;
        user[field] = readString(payload[field], maxLength);
      }
    }
    if (Object.prototype.hasOwnProperty.call(payload, "specialty")) {
      user.specialty = readString(payload.specialty, 160);
      user.department = user.specialty;
    }
    if (Object.prototype.hasOwnProperty.call(payload, "notificationPreferences")) {
      user.notificationPreferences = normalizeNotificationPreferences(payload.notificationPreferences);
    }
    if (selectedClinic) {
      user.organizationId = selectedClinic.id;
      user.hospital = selectedClinic.name;
      ensureMembershipForUser(user);
    }
    user.updatedAt = nowIso();
    addAccessLog("Cập nhật thông tin cá nhân");
    if (repositories) {
      await repositories.users.save(user);
      await repositories.memberships.ensureForUser(user);
    }
    await saveDb();
    sendJson(res, 200, { user: publicUser(user) });
    return;
  }

  if (segments.length === 3 && segments[2] === "avatar" && method === "GET") {
    const avatarFileId = readString(user.avatarFileId, 160);
    const avatarStorage =
      user.avatarStorage && typeof user.avatarStorage === "object" && !Array.isArray(user.avatarStorage)
        ? user.avatarStorage
        : {};
    if (!avatarFileId && !avatarStorage.objectKey) {
      throw httpError(404, "Tài khoản chưa có ảnh đại diện");
    }
    if (avatarFileId) {
      const record = getStorageRecord(avatarFileId);
      const source = record ? getStorageFileSource(record) : {};
      if (record && record.bucket === "avatars" && (!source.storageFile?.createdByUserId || source.storageFile.createdByUserId === user.id)) {
        const objectFile = source.storageFile || record;
        await serveObjectBufferDownload(req, res, objectFile, objectFile.name || record.name || "avatar.png");
        return;
      }
    }
    if (avatarStorage.objectKey) {
      await serveObjectBufferDownload(req, res, avatarStorage, avatarStorage.name || "avatar.png");
      return;
    }
    throw httpError(404, "Không tìm thấy ảnh đại diện của tài khoản");
  }

  if (segments.length === 3 && segments[2] === "avatar" && method === "POST") {
    const bucket = getStorageBucket("avatars");
    if (!bucket) {
      throw httpError(500, "Bucket avatars chưa sẵn sàng");
    }
    const originalName = readString(req.headers["x-file-name"], 240) || `${user.id || "avatar"}.png`;
    const contentType = readString(req.headers["content-type"], 160) || "application/octet-stream";
    const buffer = await readRequestBuffer(req);
    if (!buffer.length) {
      throw httpError(400, "File ảnh đại diện đang rỗng");
    }
    assertStorageUploadAllowed(bucket, originalName, contentType, buffer.length);
    const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
    const fileId = createId("file");
    const organizationId = user.organizationId || getUserWorkspaceContext(user).currentWorkspaceId || "org_default_clinic";
    const objectKey = buildStorageObjectKey(organizationId, bucket.id, fileId, originalName);
    const upload = await storageAdapter.putBuffer(objectKey, buffer, contentType);
    const storageFile = {
      id: fileId,
      bucket: bucket.id,
      name: path.basename(originalName),
      objectKey,
      storageProvider: upload.provider,
      contentType,
      type: getStorageFileType(originalName, contentType),
      byteSize: upload.byteSize || buffer.length,
      checksum,
      sha256: checksum,
      firmwareVersion: "",
      visibility: "public",
      tags: ["avatar", "account"],
      uploader: user.name || user.email || "Tài khoản Smart Health",
      createdByUserId: user.id,
      organizationId,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    db.storageFiles.unshift(storageFile);
    db.storageFiles = db.storageFiles.slice(0, 1000);
    const previousAvatarFileId = readString(user.avatarFileId, 160);
    const previousAvatarStorage =
      user.avatarStorage && typeof user.avatarStorage === "object" && !Array.isArray(user.avatarStorage)
        ? user.avatarStorage
        : {};
    user.avatarFileId = storageFile.id;
    user.avatarUrl = "/api/me/avatar";
    user.avatarStorage = {
      objectKey: storageFile.objectKey,
      storageProvider: storageFile.storageProvider,
      contentType: storageFile.contentType,
      name: storageFile.name,
      byteSize: storageFile.byteSize,
      checksum: storageFile.checksum,
      uploadedAt: storageFile.createdAt,
    };
    await persistUserRecord(user);
    if (previousAvatarStorage.objectKey && previousAvatarStorage.objectKey !== storageFile.objectKey) {
      storageAdapter.deleteObject(previousAvatarStorage.objectKey).catch(() => {});
    }
    if (previousAvatarFileId && previousAvatarFileId !== storageFile.id) {
      db.storageFiles = db.storageFiles.filter((file) => file.id !== previousAvatarFileId);
    }
    await appendAudit("account.avatar.update", req, {
      actorUserId: user.id,
      organizationId,
      resourceType: "storage_file",
      resourceId: storageFile.id,
    });
    await saveDb();
    const file = buildStorageFileRecords(user).find((item) => item.id === storageFile.id) || {
      id: storageFile.id,
      bucket: storageFile.bucket,
      name: storageFile.name,
      downloadUrl: "/api/me/avatar",
    };
    sendJson(res, 201, { user: publicUser(user), file: { ...file, downloadUrl: "/api/me/avatar" } });
    return;
  }

  if (segments.length === 3 && segments[2] === "avatar" && method === "DELETE") {
    const avatarFileId = readString(user.avatarFileId, 160);
    const avatarStorage =
      user.avatarStorage && typeof user.avatarStorage === "object" && !Array.isArray(user.avatarStorage)
        ? user.avatarStorage
        : {};
    if (avatarStorage.objectKey) {
      await storageAdapter.deleteObject(avatarStorage.objectKey).catch(() => {});
    }
    if (avatarFileId) {
      db.storageFiles = db.storageFiles.filter((file) => file.id !== avatarFileId);
    }
    user.avatarFileId = "";
    user.avatarUrl = "";
    user.avatarStorage = {};
    await persistUserRecord(user);
    await appendAudit("account.avatar.delete", req, {
      actorUserId: user.id,
      organizationId: user.organizationId || "",
      resourceType: "user",
      resourceId: user.id,
    });
    sendJson(res, 200, { user: publicUser(user) });
    return;
  }

  if (segments.length === 3 && segments[2] === "password" && method === "POST") {
    const payload = await readJsonBody(req);
    if (FIREBASE_AUTH_ENABLED && user.firebaseUid) {
      if (payload.firebaseClientUpdated !== true) {
        throw httpError(400, "Đổi mật khẩu Firebase cần xác thực lại trên Web Admin trước khi ghi nhận backend.");
      }
      user.updatedAt = nowIso();
      db.settings.privacy.passwordUpdatedAt = nowIso();
      await persistUserRecord(user);
      await appendAudit("account.password.change", req, {
        actorUserId: user.id,
        organizationId: user.organizationId || "",
        resourceType: "user",
        resourceId: user.id,
      });
      createNotification("success", "Đã đổi mật khẩu", "Mật khẩu Firebase của tài khoản vừa được cập nhật.", {
        userId: user.id,
        organizationId: user.organizationId || "",
      });
      await saveDb();
      sendJson(res, 200, { ok: true, provider: "firebase" });
      return;
    }

    assertDemoAuthAllowed();
    if (user.password !== readString(payload.currentPassword, 200)) {
      throw httpError(400, "Mật khẩu hiện tại không đúng");
    }
    const nextPassword = readString(payload.newPassword, 200);
    if (nextPassword.length < 8) {
      throw httpError(400, "Mật khẩu mới cần tối thiểu 8 ký tự");
    }
    user.password = nextPassword;
    user.updatedAt = nowIso();
    db.settings.privacy.passwordUpdatedAt = nowIso();
    addAccessLog("Đổi mật khẩu tài khoản");
    createNotification("success", "Đã đổi mật khẩu", "Mật khẩu tài khoản vừa được cập nhật.", {
      userId: user.id,
      organizationId: user.organizationId || "",
    });
    saveDb();
    sendJson(res, 200, { ok: true });
    return;
  }

  if (segments.length === 3 && segments[2] === "2fa" && method === "POST") {
    const payload = await readJsonBody(req);
    const action = readString(payload.action, 40) || "enable";
    const methodName = readString(payload.method, 40) || "app";

    if (action === "disable") {
      user.twoFactorEnabled = false;
      user.twoFactorMethod = "";
      user.twoFactorSecretPreview = "";
      user.twoFactorRecoveryCodes = [];
      user.updatedAt = nowIso();
      await appendAudit("account.2fa.disable", req, {
        actorUserId: user.id,
        organizationId: user.organizationId || "",
        resourceType: "user",
        resourceId: user.id,
      });
      await saveDb();
      sendJson(res, 200, { user: publicUser(user), twoFactor: { enabled: false, method: "" } });
      return;
    }

    if (!["app", "sms"].includes(methodName)) {
      throw httpError(400, "Phương thức 2FA không hợp lệ");
    }
    if (methodName === "sms" && !readString(user.phone, 40)) {
      throw httpError(400, "Cần cập nhật số điện thoại trước khi bật 2FA SMS");
    }

    const secret = crypto.randomBytes(10).toString("base64url").toUpperCase();
    const recoveryCodes = createRecoveryCodes();
    user.twoFactorEnabled = true;
    user.twoFactorMethod = methodName;
    user.twoFactorSecretPreview = `${secret.slice(0, 4)}••••${secret.slice(-4)}`;
    user.twoFactorRecoveryCodes = recoveryCodes;
    user.updatedAt = nowIso();
    await appendAudit("account.2fa.enable", req, {
      actorUserId: user.id,
      organizationId: user.organizationId || "",
      resourceType: "user",
      resourceId: user.id,
      metadata: { method: methodName },
    });
    await saveDb();
    sendJson(res, 200, {
      user: publicUser(user),
      twoFactor: {
        enabled: true,
        method: methodName,
        secretPreview: user.twoFactorSecretPreview,
        recoveryCodes,
        note: "2FA demo đã được lưu vào backend. OTP provider thật sẽ tích hợp sau.",
      },
    });
    return;
  }

  sendJson(res, 404, { error: "Me route not found" });
}

async function handleSettingsApi(req, res, segments) {
  const method = req.method || "GET";
  const user = requireUser(req);

  if (segments.length === 2 && method === "GET") {
    sendJson(res, 200, { settings: publicSettings(user) });
    return;
  }

  if (segments.length === 3 && segments[2] === "production-readiness" && method === "GET") {
    requireAnyCapability(user, ["platform.settings.manage"], "Không có quyền xem cấu hình triển khai");
    sendJson(res, 200, { readiness: buildProductionReadiness(process.env) });
    return;
  }

  if (segments.length === 3 && segments[2] === "test-email" && method === "POST") {
    requireAnyCapability(user, ["platform.settings.manage", "workspace.settings.manage"], "Không có quyền test email");
    const payload = await readJsonBody(req);
    const result = await sendTestEmail(payload);
    await appendAudit("settings.test_email", req, {
      actorUserId: user.id,
      organizationId: user.organizationId || "",
      resourceType: "settings",
      resourceId: "outbound.email",
      metadata: { to: readString(payload.to, 240), accepted: result.accepted, rejected: result.rejected },
    });
    sendJson(res, 200, { ok: true, result });
    return;
  }

  if (segments.length === 3 && segments[2] === "test-outbound" && method === "POST") {
    requireAnyCapability(user, ["platform.settings.manage", "workspace.settings.manage"], "Không có quyền test webhook");
    const payload = await readJsonBody(req);
    const result = await sendTestOutbound(payload, user);
    await appendAudit("settings.test_outbound", req, {
      actorUserId: user.id,
      organizationId: user.organizationId || "",
      resourceType: "settings",
      resourceId: `outbound.${result.channel}`,
      metadata: { channel: result.channel, statusCode: result.statusCode },
    });
    sendJson(res, 200, { ok: true, result });
    return;
  }

  if (segments.length === 3 && segments[2] === "backup-check" && method === "POST") {
    requireAnyCapability(user, ["platform.settings.manage", "workspace.settings.manage"], "Không có quyền kiểm tra backup");
    const { settings, workspace } = getMutableSettingsForUser(user);
    const files = buildStorageFileRecords(user);
    const summary = {
      checkedAt: nowIso(),
      mode: "json-local",
      databaseFile: DB_FILE,
      users: isPlatformAdminUser(user)
        ? db.users.length
        : db.users.filter((item) => item.organizationId === getUserWorkspaceContext(user).currentWorkspaceId).length,
      patients: filterPatientsForUser(user, db.patients).length,
      devices: filterDevicesForUser(user, db.devices).length,
      scans: filterScansForUser(user, db.scans).length,
      storageFiles: files.length,
      storageBytes: files.reduce((sum, file) => sum + Number(file.byteSize || 0), 0),
      status: "ok",
    };
    settings.securityPolicy = {
      ...(settings.securityPolicy || {}),
      backupCheckEnabled: true,
      lastBackupCheckAt: summary.checkedAt,
      lastBackupStatus: summary.status,
      lastBackupSummary: summary,
    };
    await persistMutableSettings(user, settings, workspace);
    await appendAudit("settings.backup_check", req, {
      actorUserId: user.id,
      organizationId: getUserWorkspaceContext(user).currentWorkspaceId || user.organizationId || "",
      resourceType: "settings",
      resourceId: "backup",
      metadata: summary,
    });
    sendJson(res, 200, { ok: true, backup: summary, settings: publicSettings(user) });
    return;
  }

  if (segments.length === 3 && segments[2] === "api-keys" && method === "POST") {
    requireAnyCapability(user, ["platform.settings.manage", "workspace.settings.manage"], "Không có quyền tạo API key");
    const payload = await readJsonBody(req);
    const { settings, workspace } = getMutableSettingsForUser(user);
    const secret = createDemoSecret(isPlatformAdminUser(user) ? "sk_live" : "sk_ws");
    const apiKey = {
      id: createId("key"),
      name: readString(payload.name, 120) || "API Key mới",
      keyPreview: maskSecret(secret),
      status: "active",
      scope: isPlatformAdminUser(user) ? "platform" : "workspace",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      lastRotatedAt: "",
    };
    settings.securityPolicy = {
      ...(settings.securityPolicy || {}),
      apiKeys: [...(Array.isArray(settings.securityPolicy?.apiKeys) ? settings.securityPolicy.apiKeys : []), apiKey],
    };
    await persistMutableSettings(user, settings, workspace);
    await appendAudit("settings.api_key.create", req, {
      actorUserId: user.id,
      organizationId: getUserWorkspaceContext(user).currentWorkspaceId || user.organizationId || "",
      resourceType: "api_key",
      resourceId: apiKey.id,
      metadata: { name: apiKey.name, scope: apiKey.scope },
    });
    sendJson(res, 201, { ok: true, apiKey, secret, settings: publicSettings(user) });
    return;
  }

  if (segments.length === 5 && segments[2] === "api-keys" && segments[4] === "rotate" && method === "POST") {
    requireAnyCapability(user, ["platform.settings.manage", "workspace.settings.manage"], "Không có quyền rotate API key");
    const keyId = decodeURIComponent(segments[3]);
    const { settings, workspace } = getMutableSettingsForUser(user);
    const apiKeys = Array.isArray(settings.securityPolicy?.apiKeys) ? settings.securityPolicy.apiKeys : [];
    const apiKey = apiKeys.find((item) => item.id === keyId);
    if (!apiKey) {
      throw httpError(404, "Không tìm thấy API key");
    }
    const secret = createDemoSecret(apiKey.scope === "platform" ? "sk_live" : "sk_ws");
    apiKey.keyPreview = maskSecret(secret);
    apiKey.status = "active";
    apiKey.updatedAt = nowIso();
    apiKey.lastRotatedAt = apiKey.updatedAt;
    settings.securityPolicy.apiKeys = apiKeys;
    await persistMutableSettings(user, settings, workspace);
    await appendAudit("settings.api_key.rotate", req, {
      actorUserId: user.id,
      organizationId: getUserWorkspaceContext(user).currentWorkspaceId || user.organizationId || "",
      resourceType: "api_key",
      resourceId: apiKey.id,
      metadata: { name: apiKey.name, scope: apiKey.scope },
    });
    sendJson(res, 200, { ok: true, apiKey, secret, settings: publicSettings(user) });
    return;
  }

  if (segments.length === 4 && segments[2] === "api-keys" && method === "DELETE") {
    requireAnyCapability(user, ["platform.settings.manage", "workspace.settings.manage"], "Không có quyền thu hồi API key");
    const keyId = decodeURIComponent(segments[3]);
    const { settings, workspace } = getMutableSettingsForUser(user);
    const apiKeys = Array.isArray(settings.securityPolicy?.apiKeys) ? settings.securityPolicy.apiKeys : [];
    const apiKey = apiKeys.find((item) => item.id === keyId);
    if (!apiKey) {
      throw httpError(404, "Không tìm thấy API key");
    }
    apiKey.status = "revoked";
    apiKey.updatedAt = nowIso();
    settings.securityPolicy.apiKeys = apiKeys;
    await persistMutableSettings(user, settings, workspace);
    await appendAudit("settings.api_key.revoke", req, {
      actorUserId: user.id,
      organizationId: getUserWorkspaceContext(user).currentWorkspaceId || user.organizationId || "",
      resourceType: "api_key",
      resourceId: apiKey.id,
      metadata: { name: apiKey.name, scope: apiKey.scope },
    });
    sendJson(res, 200, { ok: true, apiKey, settings: publicSettings(user) });
    return;
  }

  if (segments.length === 4 && segments[2] === "ai" && segments[3] === "check-update" && method === "POST") {
    requireAnyCapability(user, ["platform.settings.manage", "workspace.settings.manage"], "Không có quyền kiểm tra AI");
    const settings = getEffectiveSettingsForUser(user);
    const currentVersion = readString(settings.ai?.version, 120) || "AI Medical Analysis v3.2.1";
    sendJson(res, 200, {
      ok: true,
      update: {
        available: true,
        currentVersion,
        latestVersion: "AI Medical Analysis v3.2.2-local",
        notes: "Bản local-demo cập nhật metadata model cho báo cáo KLTN; chưa tải model cloud.",
        checkedAt: nowIso(),
      },
    });
    return;
  }

  if (segments.length === 4 && segments[2] === "ai" && segments[3] === "update" && method === "POST") {
    requireAnyCapability(user, ["platform.settings.manage", "workspace.settings.manage"], "Không có quyền cập nhật AI");
    const { settings, workspace } = getMutableSettingsForUser(user);
    settings.ai = {
      ...(settings.ai || {}),
      version: "AI Medical Analysis v3.2.2-local",
      updatedAt: nowIso(),
      lastUpdateStatus: "updated",
    };
    await persistMutableSettings(user, settings, workspace);
    await appendAudit("settings.ai.update", req, {
      actorUserId: user.id,
      organizationId: getUserWorkspaceContext(user).currentWorkspaceId || user.organizationId || "",
      resourceType: "settings",
      resourceId: "ai",
      metadata: { version: settings.ai.version },
    });
    createNotification("success", "Đã cập nhật mô hình AI", "Metadata model AI local-demo vừa được cập nhật.");
    sendJson(res, 200, { ok: true, settings: publicSettings(user), ai: settings.ai });
    return;
  }

  if (segments.length === 2 && method === "PATCH") {
    requireAnyCapability(user, ["platform.settings.manage", "workspace.settings.manage"], "Không có quyền cập nhật cài đặt");
    const payload = await readJsonBody(req);
    const currentSettings = getEffectiveSettingsForUser(user);
    const patch = parseSettingsPatch(payload, currentSettings);
    if (isPlatformAdminUser(user)) {
      db.settings = {
        ...db.settings,
        ...patch,
      };
    } else {
      const workspace = getClinicById(getUserWorkspaceContext(user).currentWorkspaceId);
      if (!workspace) {
        throw httpError(404, "Không tìm thấy workspace hiện tại");
      }
      workspace.settings = {
        ...(workspace.settings || {}),
        ...patch,
      };
      workspace.updatedAt = nowIso();
    }
    addAccessLog(isPlatformAdminUser(user) ? "Cập nhật cài đặt nền tảng" : "Cập nhật cài đặt workspace");
    await saveDb();
    sendJson(res, 200, { settings: publicSettings(user) });
    return;
  }

  sendJson(res, 404, { error: "Settings route not found" });
}

async function handleNotificationsApi(req, res, segments) {
  const method = req.method || "GET";
  const user = requireUser(req);
  const context = getRequestContext(req) || createRequestContext(req);

  if (segments.length === 2 && method === "GET") {
    const notifications = repositories ? await repositories.notifications.list() : db.notifications;
    sendJson(res, 200, { notifications: filterNotificationsForUser(user, notifications) });
    return;
  }

  if (segments.length === 2 && method === "POST") {
    const payload = await readJsonBody(req);
    const organizationId = isPlatformAdminUser(user)
      ? readString(payload.organizationId, 120) || context.organizationId || ""
      : getUserWorkspaceContext(user).currentWorkspaceId || "";
    const input = {
      type: readString(payload.type, 40) || "info",
      title: readString(payload.title, 180),
      message: readString(payload.message, 2000),
      channel: readString(payload.channel, 40) || "in_app",
      organizationId,
      userId: readString(payload.userId, 120),
      read: false,
    };
    if (!input.title || !input.message) {
      throw httpError(400, "Can nhap tieu de va noi dung thong bao");
    }
    const notification = repositories
      ? await repositories.notifications.create(input)
      : createNotification(input.type, input.title, input.message, input);
    await appendAudit("notification.create", req, {
      resourceType: "notification",
      resourceId: notification.id,
      organizationId: notification.organizationId || context.organizationId || "",
    });
    saveDb();
    sendJson(res, 201, { notification });
    return;
  }

  if (segments.length === 2 && method === "DELETE") {
    const scopedNotifications = filterNotificationsForUser(user, repositories ? await repositories.notifications.list() : db.notifications);
    const count = scopedNotifications.length;
    if (repositories) {
      for (const notification of scopedNotifications) {
        await repositories.notifications.delete(notification.id, context);
      }
    } else {
      const scopedIds = new Set(scopedNotifications.map((notification) => notification.id));
      db.notifications = db.notifications.filter((notification) => !scopedIds.has(notification.id));
      await appendAudit("notification.delete", req, { resourceType: "notification", resourceId: "all" });
      saveDb();
    }
    sendJson(res, 200, { deleted: true, count });
    return;
  }

  if (segments.length === 3 && segments[2] === "read-all" && method === "POST") {
    const notifications = filterNotificationsForUser(user, repositories ? await repositories.notifications.list() : db.notifications);
    if (!repositories) {
      for (const notification of notifications) {
        notification.read = true;
        notification.readAt = notification.readAt || nowIso();
        notification.updatedAt = nowIso();
      }
      await appendAudit("notification.read", req, { resourceType: "notification", resourceId: "all" });
      saveDb();
    } else {
      for (const notification of notifications) {
        await repositories.notifications.markRead(notification.id, context);
      }
    }
    sendJson(res, 200, { notifications: notifications.map((notification) => ({ ...notification, read: true, readAt: notification.readAt || nowIso() })) });
    return;
  }

  if (segments.length === 3 && segments[2] === "unread-count" && method === "GET") {
    const notifications = repositories ? await repositories.notifications.list() : db.notifications;
    sendJson(res, 200, { count: filterNotificationsForUser(user, notifications).filter((notification) => !notification.read).length });
    return;
  }

  if (segments.length === 3 && segments[2] === "register-device" && method === "POST") {
    const user = requireUser(req);
    const payload = await readJsonBody(req);
    const fcmToken = readString(payload.fcmToken, 4096);
    if (!fcmToken) {
      throw httpError(400, "FCM token is required");
    }
    const device = await repositories.notificationDevices.register({
      userId: user.id,
      platform: readString(payload.platform, 40) || "android",
      fcmToken,
      enabled: payload.enabled !== false,
    });
    sendJson(res, 200, { device });
    return;
  }

  if (repositories) {
    await repositories.notifications.list();
  }
  const notification = segments[2]
    ? filterNotificationsForUser(user, db.notifications).find((item) => item.id === decodeURIComponent(segments[2]))
    : null;
  if (!notification) {
    throw httpError(404, "Không tìm thấy thông báo");
  }

  if (segments.length === 4 && segments[3] === "read" && method === "POST") {
    const updated = repositories ? await repositories.notifications.markRead(notification.id, context) : notification;
    if (!repositories) {
      notification.read = true;
      notification.readAt = notification.readAt || nowIso();
      notification.updatedAt = nowIso();
      await appendAudit("notification.read", req, { resourceType: "notification", resourceId: notification.id });
      saveDb();
    }
    sendJson(res, 200, { notification: updated });
    return;
  }

  if (segments.length === 4 && segments[3] === "events" && method === "GET") {
    const events = db.deviceEvents.filter((event) => event.deviceId === device.id).slice(0, 100);
    sendJson(res, 200, { events });
    return;
  }

  assertCanManageDevice(user, device);

  if (segments.length === 3 && method === "DELETE") {
    if (repositories) {
      await repositories.notifications.delete(notification.id, context);
    } else {
      db.notifications = db.notifications.filter((item) => item.id !== notification.id);
      await appendAudit("notification.delete", req, { resourceType: "notification", resourceId: notification.id });
      saveDb();
    }
    sendJson(res, 200, { deleted: true });
    return;
  }

  sendJson(res, 404, { error: "Notification route not found" });
}

async function handleObjectsApi(req, res, url, segments) {
  const user = requireUser(req);
  if (segments.length === 3 && segments[2] === "local" && (req.method || "GET") === "GET") {
    const objectKey = readString(url.searchParams.get("key"), 1000);
    if (!objectKey) {
      throw httpError(400, "Object key is required");
    }
    if (!canAccessObjectKey(user, objectKey)) {
      throw httpError(403, "Object is outside current user scope");
    }
    const localRoot = path.resolve(process.env.LOCAL_OBJECT_STORAGE_DIR || path.join(DATA_DIR, "objects"));
    const target = path.join(localRoot, objectKey.split("/").map((part) => path.basename(part)).join(path.sep));
    const resolved = path.resolve(target);
    if (!resolved.startsWith(localRoot) || !fs.existsSync(resolved)) {
      throw httpError(404, "Không tìm thấy object");
    }
    await appendAudit("object.local_download", req, {
      resourceType: "object",
      resourceId: objectKey,
      organizationId: getObjectKeyOrganizationId(objectKey) || getUserWorkspaceContext(user).currentWorkspaceId || "",
    });
    res.writeHead(200, { "Content-Type": "application/octet-stream" });
    fs.createReadStream(resolved).pipe(res);
    return;
  }
  sendJson(res, 404, { error: "Object route not found" });
}

async function handleAccessLogsApi(req, res, segments) {
  const user = requireUser(req);
  if (segments.length === 2 && (req.method || "GET") === "GET") {
    sendJson(res, 200, { logs: filterAccessLogsForUser(user, db.accessLogs).slice(0, 100) });
    return;
  }
  sendJson(res, 404, { error: "Access log route not found" });
}

async function handleDevicesApi(req, res, segments) {
  const method = req.method || "GET";
  const user = requireUser(req);

  if (segments.length === 2 && method === "GET") {
    if (repositories) {
      await repositories.devices.list();
    }
    refreshDevicePresence();
    sendJson(res, 200, { devices: publicDevices(filterDevicesForUser(user, db.devices)) });
    return;
  }

  if (segments.length === 3 && segments[2] === "scan" && method === "GET") {
    if (repositories) {
      await repositories.devices.list();
    }
    refreshDevicePresence();
    sendJson(res, 200, {
      devices: publicDevices(filterDevicesForUser(user, db.devices).filter((device) => device.status === "available" || device.connected)),
    });
    return;
  }

  if (segments.length === 3 && segments[2] === "provision-qr" && method === "POST") {
    requireAnyCapability(user, ["platform.devices.manage", "workspace.devices.manage", "personal.devices.manage"]);
    const payload = await readJsonBody(req);
    const deviceId = readString(payload.deviceId, 120) || createId("dev");
    const claimCode = crypto.randomBytes(6).toString("hex").toUpperCase();
    let device = repositories ? await repositories.devices.findById(deviceId) : db.devices.find((item) => item.id === deviceId);
    if (!device) {
      device = {
        id: deviceId,
        name: readString(payload.name, 120) || "Ống nghe Smart Health",
        type: "stethoscope",
        status: "unclaimed",
        signal: -60,
        battery: 0,
        connected: false,
        secret: crypto.randomBytes(32).toString("hex"),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      db.devices.unshift(device);
    }

    device.name = readString(payload.name, 120) || device.name;
    device.organizationId = getWritableWorkspaceIdForUser(user, payload.organizationId || device.organizationId);
    assertCanAccessDevice(user, device);
    device.claimCodeHash = hashValue(`${device.id}:${claimCode}`);
    device.claimCodeExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    device.status = "unclaimed";
    device.updatedAt = nowIso();
    db.deviceClaims.unshift({
      id: createId("claim"),
      deviceId: device.id,
      organizationId: device.organizationId,
      createdByUserId: user.id,
      claimCodeHash: device.claimCodeHash,
      expiresAt: device.claimCodeExpiresAt,
      claimedAt: null,
      createdAt: nowIso(),
    });
    db.deviceClaims = db.deviceClaims.slice(0, 500);
    addAccessLog(`Tạo QR claim cho thiết bị ${device.name}`);
    if (repositories) {
      await repositories.devices.save(device);
    } else {
      saveDb();
    }
    sendJson(res, 201, {
      device: publicDevice(device),
      claim: {
        deviceId: device.id,
        claimCode,
        expiresAt: device.claimCodeExpiresAt,
        qrPayload: {
          deviceId: device.id,
          claimCode,
        },
      },
    });
    return;
  }

  if (segments.length === 3 && segments[2] === "pair" && method === "POST") {
    requireAnyCapability(user, ["platform.devices.manage", "workspace.devices.manage", "personal.devices.manage"]);
    const payload = await readJsonBody(req);
    const deviceId = readString(payload.deviceId, 120) || createId("dev");
    const claimCode = readString(payload.claimCode, 80);
    const connectionMethod = readString(payload.connectionMethod, 60);
    let device = repositories ? await repositories.devices.findById(deviceId) : db.devices.find((item) => item.id === deviceId);
    if (!device) {
      if (claimCode) {
        throw httpError(404, "Không tìm thấy thiết bị để claim");
      }
      device = {
        id: deviceId,
        name: readString(payload.name, 120) || "Ống nghe Smart Health",
        type: "stethoscope",
        status: "available",
        organizationId: getWritableWorkspaceIdForUser(user, payload.organizationId),
        signal: readOptionalNumber(payload.signal) || -55,
        battery: readOptionalNumber(payload.battery) || 85,
        connected: false,
        secret: crypto.randomBytes(16).toString("hex"),
        lastSeenAt: nowIso(),
        updatedAt: nowIso(),
      };
      db.devices.unshift(device);
    }

    if (device.revokedAt) {
      throw httpError(403, "Thiết bị đã bị thu hồi");
    }

    device.organizationId = device.organizationId || getWritableWorkspaceIdForUser(user, payload.organizationId);
    assertCanManageDevice(user, device);

    if (device.claimCodeHash) {
      if (!claimCode || hashValue(`${device.id}:${claimCode}`) !== device.claimCodeHash) {
        throw httpError(403, "Claim code không hợp lệ");
      }
      const expiresAt = Date.parse(device.claimCodeExpiresAt || "");
      if (Number.isFinite(expiresAt) && expiresAt < Date.now()) {
        throw httpError(410, "Claim code đã hết hạn");
      }
      const claim = db.deviceClaims.find((item) => item.deviceId === device.id && item.claimCodeHash === device.claimCodeHash);
      if (claim) {
        claim.claimedAt = nowIso();
        claim.claimedByUserId = user.id;
      }
      delete device.claimCodeHash;
    }

    device.pairedUserId = user.id;
    device.status = "connected";
    device.connected = true;
    device.connectionMethod = connectionMethod || (claimCode ? "QR" : "Bluetooth");
    device.updatedAt = nowIso();
    addAccessLog(`Ghép nối thiết bị ${device.name}`);
    createNotification("success", "Đã ghép nối thiết bị", `${device.name} đã sẵn sàng sử dụng.`);
    if (repositories) {
      await repositories.devices.save(device);
    } else {
      saveDb();
    }
    sendJson(res, 200, { device: publicDevice(device) });
    return;
  }

  const device = segments[2]
    ? repositories
      ? await repositories.devices.findById(decodeURIComponent(segments[2]))
      : db.devices.find((item) => item.id === decodeURIComponent(segments[2]))
    : null;
  if (device) {
    assertCanManageDevice(user, device);
  }
  if (!device) {
    throw httpError(404, "Không tìm thấy thiết bị");
  }

  if (segments.length === 3 && method === "DELETE") {
    if (repositories) {
      await repositories.devices.delete(device.id);
    } else {
      const index = db.devices.findIndex((item) => item.id === device.id);
      if (index >= 0) {
        db.devices.splice(index, 1);
      }
    }
    addAccessLog(`Xóa thiết bị ${device.name}`);
    saveDb();
    sendJson(res, 200, { deleted: true, deviceId: device.id });
    return;
  }

  if (segments.length === 3 && method === "PATCH") {
    const payload = await readJsonBody(req);
    for (const field of ["name", "status"]) {
      if (Object.prototype.hasOwnProperty.call(payload, field)) {
        device[field] = readString(payload[field], 120);
      }
    }
    for (const field of ["signal", "battery"]) {
      if (Object.prototype.hasOwnProperty.call(payload, field)) {
        device[field] = readOptionalNumber(payload[field]) ?? device[field];
      }
    }
    device.updatedAt = nowIso();
    if (repositories) {
      await repositories.devices.save(device);
    } else {
      saveDb();
    }
    sendJson(res, 200, { device: publicDevice(device) });
    return;
  }

  if (segments.length === 4 && segments[3] === "connect" && method === "POST") {
    device.connected = true;
    device.status = "connected";
    device.lastSeenAt = nowIso();
    device.updatedAt = nowIso();
    addAccessLog(`Kết nối thiết bị ${device.name}`);
    await saveDeviceRecord(device);
    sendJson(res, 200, { device: publicDevice(device) });
    return;
  }

  if (segments.length === 4 && segments[3] === "disconnect" && method === "POST") {
    device.connected = false;
    device.status = "available";
    device.updatedAt = nowIso();
    addAccessLog(`Ngắt kết nối thiết bị ${device.name}`);
    await saveDeviceRecord(device);
    sendJson(res, 200, { device: publicDevice(device) });
    return;
  }

  if (segments.length === 4 && segments[3] === "calibrate" && method === "POST") {
    db.settings.stethoscope.lastCalibrationAt = nowIso();
    addAccessLog(`Hiệu chuẩn thiết bị ${device.name}`);
    createNotification("success", "Đã hiệu chuẩn thiết bị", `${device.name} đã được hiệu chuẩn.`);
    await saveDeviceRecord(device);
    sendJson(res, 200, { device: publicDevice(device), settings: db.settings.stethoscope });
    return;
  }

  if (segments.length === 4 && segments[3] === "unpair" && method === "POST") {
    device.pairedUserId = null;
    device.connected = false;
    device.status = "available";
    device.updatedAt = nowIso();
    addAccessLog(`Hủy ghép nối thiết bị ${device.name}`);
    await saveDeviceRecord(device);
    await appendDeviceEvent(device.id, "unpair", { actorUserId: user.id });
    await appendAudit("device.unpair", req, { resourceType: "device", resourceId: device.id, organizationId: device.organizationId || "" });
    sendJson(res, 200, { device: publicDevice(device) });
    return;
  }

  if (segments.length === 4 && segments[3] === "revoke" && method === "POST") {
    device.revokedAt = nowIso();
    device.connected = false;
    device.status = "revoked";
    device.updatedAt = nowIso();
    addAccessLog(`Thu hồi thiết bị ${device.name}`, { severity: "warning" });
    await saveDeviceRecord(device);
    await appendDeviceEvent(device.id, "revoke", { actorUserId: user.id });
    await appendAudit("device.revoke", req, { resourceType: "device", resourceId: device.id, organizationId: device.organizationId || "" });
    sendJson(res, 200, { device: publicDevice(device) });
    return;
  }

  if (segments.length === 4 && segments[3] === "rotate-secret" && method === "POST") {
    device.secret = crypto.randomBytes(32).toString("hex");
    device.secretRotatedAt = nowIso();
    device.updatedAt = nowIso();
    addAccessLog(`Rotate secret thiết bị ${device.name}`, { severity: "warning" });
    await saveDeviceRecord(device);
    await appendDeviceEvent(device.id, "rotate_secret", { actorUserId: user.id });
    await appendAudit("device.rotate_secret", req, { resourceType: "device", resourceId: device.id, organizationId: device.organizationId || "" });
    sendJson(res, 200, { device: publicDevice(device), rotated: true });
    return;
  }

  if (segments.length === 4 && segments[3] === "transfer" && method === "POST") {
    if (!isPlatformAdminUser(user)) {
      throw httpError(403, "Only platform admin can transfer devices between workspaces");
    }
    const payload = await readJsonBody(req);
    device.organizationId = readString(payload.organizationId, 120) || device.organizationId;
    device.pairedUserId = readString(payload.ownerUserId, 120) || device.pairedUserId;
    device.updatedAt = nowIso();
    await saveDeviceRecord(device);
    await appendDeviceEvent(device.id, "transfer", { organizationId: device.organizationId, ownerUserId: device.pairedUserId });
    await appendAudit("device.transfer", req, { resourceType: "device", resourceId: device.id, organizationId: device.organizationId || "" });
    sendJson(res, 200, { device: publicDevice(device) });
    return;
  }

  if (segments.length === 4 && segments[3] === "commands" && method === "POST") {
    const payload = await readJsonBody(req);
    const commandType = readString(payload.type, 80);
    if (!commandType) {
      throw httpError(400, "Device command type is required");
    }
    const command = {
      id: createId("cmd"),
      type: commandType,
      payload: payload.payload && typeof payload.payload === "object" ? payload.payload : {},
      createdAt: nowIso(),
      requestedByUserId: user.id,
    };
    const delivery = publishDeviceCommand(device.id, command);
    device.lastCommand = {
      id: command.id,
      type: command.type,
      status: delivery.delivered ? "sent" : "queued",
      deliveredVia: delivery,
      createdAt: command.createdAt,
    };
    device.updatedAt = nowIso();
    await saveDeviceRecord(device);
    await appendDeviceEvent(device.id, "command", { ...command, delivery });
    await appendAudit("device.command", req, {
      resourceType: "device",
      resourceId: device.id,
      organizationId: device.organizationId || "",
      metadata: { type: command.type, delivery },
    });
    sendJson(res, 202, { device: publicDevice(device), command, delivery });
    return;
  }

  if (segments.length === 4 && segments[3] === "ota" && method === "POST") {
    const payload = await readJsonBody(req);
    const firmwareFileId = readString(payload.firmwareFileId || payload.fileId, 120);
    let firmwareRecord = null;
    if (firmwareFileId) {
      firmwareRecord = getStorageRecord(firmwareFileId);
      if (!firmwareRecord || firmwareRecord.bucket !== "device-firmware") {
        throw httpError(404, "Firmware file not found in device-firmware bucket");
      }
      assertCanAccessStorageRecord(user, firmwareRecord);
    }
    const otaId = createId("ota");
    const token = firmwareFileId ? crypto.randomBytes(32).toString("base64url") : "";
    const firmwareUrl = firmwareFileId
      ? buildOtaFirmwareDownloadUrl(req, device.id, otaId, token)
      : readString(payload.url || payload.downloadUrl, 800);
    if (!firmwareUrl) {
      throw httpError(400, "Firmware URL or firmwareFileId is required for cloud OTA");
    }
    const firmwareVersion =
      readString(payload.firmwareVersion, 80) ||
      readString(firmwareRecord?.firmwareVersion, 80) ||
      inferFirmwareVersionFromName(firmwareRecord?.name || "");
    const checksum =
      readString(payload.checksum, 160) ||
      readString(firmwareRecord?.checksum || firmwareRecord?.sha256, 160);
    const ota = {
      id: otaId,
      firmwareVersion,
      url: firmwareUrl,
      checksum,
      firmwareFileId,
      firmwareFileName: firmwareRecord?.name || "",
      token,
      expiresAt: firmwareFileId ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : "",
      status: "pending",
      requestedByUserId: user.id,
      createdAt: nowIso(),
    };
    device.ota = ota;
    device.otaStatus = "pending";
    device.lastCommand = {
      id: ota.id,
      type: "ota.update",
      status: "pending",
      createdAt: ota.createdAt,
    };
    device.updatedAt = nowIso();
    await saveDeviceRecord(device);
    const command = {
      id: ota.id,
      type: "ota.update",
      payload: ota,
      createdAt: ota.createdAt,
      requestedByUserId: user.id,
    };
    const delivery = publishDeviceCommand(device.id, command);
    device.lastCommand.status = delivery.delivered ? "sent" : "queued";
    device.lastCommand.deliveredVia = delivery;
    device.otaStatus = delivery.delivered ? "sent" : "queued";
    await saveDeviceRecord(device);
    await appendDeviceEvent(device.id, "ota.requested", { ...ota, delivery });
    await appendAudit("device.ota", req, {
      resourceType: "device",
      resourceId: device.id,
      organizationId: device.organizationId || "",
      metadata: { firmwareVersion: ota.firmwareVersion, checksum: ota.checksum, delivery },
    });
    sendJson(res, 202, { device: publicDevice(device), ota, command, delivery });
    return;
  }

  sendJson(res, 404, { error: "Device route not found" });
}

async function handleAiApi(req, res, segments) {
  const method = req.method || "GET";
  const user = requireUser(req);

  if (segments.length === 3 && segments[2] === "chat" && method === "GET") {
    sendJson(res, 200, { messages: db.chatMessages.slice(-100) });
    return;
  }

  if (segments.length === 3 && segments[2] === "chat" && method === "POST") {
    const payload = await readJsonBody(req);
    const userMessage = {
      id: createId("msg"),
      role: "user",
      content: readString(payload.message, 2000),
      createdAt: nowIso(),
    };
    const assistantMessage = {
      id: createId("msg"),
      role: "assistant",
      content: buildAiReply(userMessage.content),
      createdAt: nowIso(),
    };
    db.chatMessages.push(userMessage, assistantMessage);
    db.chatMessages = db.chatMessages.slice(-200);
    addAccessLog("Sử dụng trợ lý AI");
    saveDb();
    sendJson(res, 200, { message: assistantMessage, messages: db.chatMessages.slice(-100) });
    return;
  }

  if (segments.length === 3 && segments[2] === "settings" && method === "PATCH") {
    requireAnyCapability(user, ["platform.settings.manage", "workspace.settings.manage"], "Không có quyền cập nhật AI");
    const payload = await readJsonBody(req);
    db.settings.ai = {
      ...db.settings.ai,
      ...payload,
      updatedAt: nowIso(),
    };
    addAccessLog("Cập nhật cấu hình AI");
    saveDb();
    sendJson(res, 200, { settings: db.settings.ai });
    return;
  }

  if (segments.length === 3 && segments[2] === "update" && method === "POST") {
    requireAnyCapability(user, ["platform.settings.manage", "workspace.settings.manage"], "Không có quyền cập nhật AI");
    db.settings.ai.updatedAt = nowIso();
    createNotification("success", "Đã cập nhật mô hình AI", "Mô hình AI đang dùng là phiên bản mới nhất.");
    saveDb();
    sendJson(res, 200, { settings: db.settings.ai });
    return;
  }

  sendJson(res, 404, { error: "AI route not found" });
}

async function handleExportsApi(req, res, segments) {
  const method = req.method || "GET";
  const user = requireUser(req);

  if (segments.length === 2 && method === "GET") {
    requireAnyCapability(user, REPORT_EXPORT_CAPABILITIES, "Không có quyền xem bản xuất dữ liệu");
    sendJson(res, 200, { exports: filterExportsForUser(user, db.exports) });
    return;
  }

  if (segments.length === 2 && method === "POST") {
    requireAnyCapability(user, REPORT_EXPORT_CAPABILITIES, "Không có quyền tạo bản xuất dữ liệu");
    const payload = await readJsonBody(req);
    const scopedScans = filterScansForUser(user, db.scans);
    const organizationId = isPlatformAdminUser(user)
      ? readString(payload.organizationId, 120) || getUserWorkspaceContext(user).currentWorkspaceId || ""
      : getUserWorkspaceContext(user).currentWorkspaceId || "";
    const exportJob = {
      id: createId("export"),
      organizationId,
      createdByUserId: user.id,
      format: readString(payload.format, 20) || "pdf",
      includeAudio: payload.includeAudio !== false,
      includeReports: payload.includeReports !== false,
      includeHistory: payload.includeHistory !== false,
      startDate: readString(payload.startDate, 40),
      endDate: readString(payload.endDate, 40),
      status: "ready",
      recordCount: scopedScans.length,
      downloadUrl: `/api/exports/download/${Date.now()}.json`,
      protectedMetadata: encryptJson({
        requestedByUserId: user.id,
        organizationId,
        includeAudio: payload.includeAudio !== false,
        includeReports: payload.includeReports !== false,
        includeHistory: payload.includeHistory !== false,
      }),
      createdAt: nowIso(),
    };
    db.exports.unshift(exportJob);
    addAccessLog("Tạo bản xuất dữ liệu");
    createNotification("success", "Đã tạo bản xuất dữ liệu", "Bản xuất dữ liệu đã sẵn sàng để tải xuống.");
    await appendAudit("export.create", req, {
      resourceType: "export",
      resourceId: exportJob.id,
      organizationId,
      metadata: { format: exportJob.format, recordCount: exportJob.recordCount },
    });
    saveDb();
    sendJson(res, 201, { export: exportJob });
    return;
  }

  if (segments.length === 4 && segments[2] === "download" && method === "GET") {
    requireAnyCapability(user, REPORT_EXPORT_CAPABILITIES, "Không có quyền tải bản xuất dữ liệu");
    const requestedExportId = decodeURIComponent(segments[3] || "");
    const scopedExport = filterExportsForUser(user, db.exports).find((item) => {
      return item.id === requestedExportId || path.basename(item.downloadUrl || "") === requestedExportId;
    });
    if (!scopedExport && db.exports.length > 0) {
      throw httpError(403, "Export nam ngoai pham vi workspace hien tai");
    }
    const scopedScans = filterScansForUser(user, db.scans);
    const scopedPatients = filterPatientsForUser(user, db.patients).map(withPatientStats);
    const scopedExports = filterExportsForUser(user, db.exports);
    await appendAudit("export.download", req, {
      resourceType: "export",
      resourceId: scopedExport?.id || requestedExportId,
      organizationId: getUserWorkspaceContext(user).currentWorkspaceId || "",
      metadata: { scanCount: scopedScans.length, patientCount: scopedPatients.length },
    });
    sendJson(res, 200, {
      generatedAt: nowIso(),
      patients: scopedPatients,
      scans: scopedScans,
      exports: scopedExports,
    });
    return;
  }

  sendJson(res, 404, { error: "Export route not found" });
}

async function handleDataApi(req, res, segments) {
  const method = req.method || "GET";
  requireUser(req);

  if (segments.length === 3 && segments[2] === "summary" && method === "GET") {
    const user = requireUser(req);
    requireAnyCapability(user, STORAGE_READ_CAPABILITIES, "Không có quyền xem tổng hợp storage");
    sendJson(res, 200, { storage: getStorageSummaryForUser(user) });
    return;
  }

  if (segments.length === 3 && segments[2] === "cache" && method === "DELETE") {
    requireAnyCapability(requireUser(req), STORAGE_MANAGE_CAPABILITIES, "Không có quyền xóa cache storage");
    db.settings.storage.cacheMb = 0;
    addAccessLog("Xóa bộ nhớ tạm");
    saveDb();
    sendJson(res, 200, { storage: getStorageSummary() });
    return;
  }

  if (segments.length === 3 && segments[2] === "all" && method === "DELETE") {
    requireAnyCapability(requireUser(req), ["platform.storage.manage"], "Chỉ platform admin mới được xóa toàn bộ dữ liệu");
    const payload = await readJsonBody(req);
    if (readString(payload.confirm, 40) !== "XOA DU LIEU") {
      throw httpError(400, "Cần nhập XOA DU LIEU để xác nhận");
    }
    if (activeRecording) {
      await stopRecording(activeRecording.scanId);
    }
    db.patients = [];
    db.scans = [];
    db.exports = [];
    for (const fileName of fs.readdirSync(AUDIO_DIR)) {
      if (fileName.endsWith(".wav")) {
        fs.rmSync(path.join(AUDIO_DIR, fileName), { force: true });
      }
    }
    addAccessLog("Xóa toàn bộ dữ liệu y tế", { severity: "warning" });
    createNotification("warning", "Đã xóa dữ liệu", "Toàn bộ hồ sơ và bản ghi âm đã được xóa theo yêu cầu.");
    saveDb();
    sendJson(res, 200, { deleted: true, storage: getStorageSummary() });
    return;
  }

  sendJson(res, 404, { error: "Data route not found" });
}

async function handlePatientPortalApi(req, res, url, segments) {
  const method = req.method || "GET";
  const user = requireRole(req, ["patient"]);
  const patient = ensurePatientProfileForUser(user);
  const accessibleProfileIds = new Set(filterPatientsForUser(user, db.patients).map((item) => item.id));
  const ownScans = db.scans.filter((scan) => accessibleProfileIds.has(scan.patientId));

  if (segments.length === 3 && segments[2] === "dashboard" && method === "GET") {
    const recentScans = ownScans.slice(0, 5);
    sendJson(res, 200, {
      patient: withPatientStats(patient),
      stats: {
        scanCount: ownScans.length,
        completedCount: ownScans.filter((scan) => scan.status === "completed").length,
        recordingCount: ownScans.filter((scan) => scan.status === "recording").length,
        abnormalCount: ownScans.filter((scan) => scan.aiLabel && !["captured", "recording"].includes(scan.aiLabel)).length,
      },
      recentScans,
    });
    saveDb();
    return;
  }

  if (segments.length === 3 && segments[2] === "me" && method === "GET") {
    sendJson(res, 200, { patient: withPatientStats(patient) });
    saveDb();
    return;
  }

  if (segments.length === 3 && segments[2] === "scans" && method === "GET") {
    const status = url.searchParams.get("status");
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || 50)));
    const scans = ownScans
      .filter((scan) => !status || scan.status === status)
      .slice(0, limit);
    sendJson(res, 200, { scans });
    saveDb();
    return;
  }

  if (segments.length === 4 && segments[2] === "scans" && segments[3] === "start" && method === "POST") {
    const payload = await readJsonBody(req);
    const idempotencyKey = getIdempotencyKey(req, payload);
    const existingScan = findIdempotentResource(user, idempotencyKey, "start_scan");
    if (existingScan) {
      sendJson(res, 200, { scan: existingScan, idempotent: true });
      saveDb();
      return;
    }
    delete payload.patient;
    delete payload.patientName;
    delete payload.patientCode;
    delete payload.doctorNotes;
    delete payload.notes;
    const scan = startRecording({ ...payload, idempotencyKey }, user);
    rememberIdempotentResource(user, idempotencyKey, "start_scan", "scan", scan.id);
    saveDb();
    sendJson(res, 201, { scan });
    return;
  }

  if (segments.length >= 4 && segments[2] === "scans") {
    const scan = findScan(decodeURIComponent(segments[3]));
    if (!scan || !accessibleProfileIds.has(scan.patientId)) {
      throw httpError(404, "Scan not found");
    }

    if (segments.length === 4 && method === "GET") {
      sendJson(res, 200, { scan });
      saveDb();
      return;
    }

    if (segments.length === 5 && segments[4] === "stop" && method === "POST") {
      const stopped = await stopRecording(scan.id);
      sendJson(res, 200, { scan: stopped });
      return;
    }

    if (segments.length === 5 && segments[4] === "audio" && method === "GET") {
      serveScanAudio(res, scan);
      saveDb();
      return;
    }
  }

  sendJson(res, 404, { error: "Patient route not found" });
}

async function handleDoctorPortalApi(req, res, url, segments) {
  const method = req.method || "GET";
  const user = requireRole(req, ["doctor", "admin"]);

  if (segments.length === 3 && segments[2] === "dashboard" && method === "GET") {
    sendJson(res, 200, {
      status: getStatusPayload(),
      stats: {
        patientCount: filterPatientsForUser(user, db.patients).length,
        scanCount: filterScansForUser(user, db.scans).length,
        activeScanId: activeRecording ? activeRecording.scanId : null,
      },
      recentScans: filterScansForUser(user, db.scans).slice(0, 5),
    });
    return;
  }

  if (segments[2] === "patients") {
    await handlePatientsApi(req, res, url, ["api", ...segments.slice(2)]);
    return;
  }

  if (segments[2] === "scans") {
    await handleScansApi(req, res, url, ["api", ...segments.slice(2)]);
    return;
  }

  sendJson(res, 404, { error: "Doctor route not found" });
}

async function handleApi(req, res, url) {
  const method = req.method || "GET";
  let segments = url.pathname.split("/").filter(Boolean);
  if (segments[1] === "v1") {
    segments = [segments[0], ...segments.slice(2)];
  }

  if (method === "GET" && segments[1] === "health") {
    sendJson(res, 200, {
      ok: true,
      service: "smart-health-backend",
      status: getStatusPayload(),
      now: nowIso(),
    });
    return;
  }

  if (method === "GET" && segments[1] === "status") {
    sendJson(res, 200, getStatusPayload());
    return;
  }

  if (method === "GET" && segments[1] === "catalog" && segments[2] === "clinics") {
    sendJson(res, 200, { clinics: getActiveClinics() });
    return;
  }

  if (method === "GET" && segments[1] === "catalog" && segments[2] === "specialties") {
    sendJson(res, 200, { specialties: SPECIALTY_CATALOG });
    return;
  }

  if (
    method === "GET" &&
    segments[1] === "devices" &&
    segments.length === 6 &&
    segments[3] === "ota" &&
    segments[5] === "firmware"
  ) {
    await serveDeviceOtaFirmwareDownload(req, res, url, segments);
    return;
  }

  await authenticateRequest(req);

  if (segments[1] === "auth") {
    await handleAuthApi(req, res, segments);
    return;
  }

  if (segments[1] === "admin") {
    await handleAdminApi(req, res, url, segments);
    return;
  }

  if (segments[1] === "me") {
    await handleMeApi(req, res, segments);
    return;
  }

  if (segments[1] === "settings") {
    await handleSettingsApi(req, res, segments);
    return;
  }

  if (segments[1] === "notifications") {
    await handleNotificationsApi(req, res, segments);
    return;
  }

  if (segments[1] === "objects") {
    await handleObjectsApi(req, res, url, segments);
    return;
  }

  if (segments[1] === "access-logs") {
    await handleAccessLogsApi(req, res, segments);
    return;
  }

  if (segments[1] === "devices") {
    await handleDevicesApi(req, res, segments);
    return;
  }

  if (segments[1] === "ai") {
    await handleAiApi(req, res, segments);
    return;
  }

  if (segments[1] === "exports") {
    await handleExportsApi(req, res, segments);
    return;
  }

  if (segments[1] === "data") {
    await handleDataApi(req, res, segments);
    return;
  }

  if (segments[1] === "patient") {
    await handlePatientPortalApi(req, res, url, segments);
    return;
  }

  if (segments[1] === "doctor") {
    await handleDoctorPortalApi(req, res, url, segments);
    return;
  }

  if (segments[1] === "patients") {
    await handlePatientsApi(req, res, url, segments);
    return;
  }

  if (segments[1] === "scans") {
    await handleScansApi(req, res, url, segments);
    return;
  }

  sendJson(res, 404, { error: "API route not found" });
}

async function handlePatientsApi(req, res, url, segments) {
  const method = req.method || "GET";
  const user = requireUser(req);
  const patientId = segments[2] ? decodeURIComponent(segments[2]) : "";

  if (segments.length === 2 && method === "GET") {
    if (repositories) {
      await repositories.patients.list();
    }
    const q = (url.searchParams.get("q") || "").trim().toLowerCase();
    const patients = filterPatientsForUser(user, db.patients)
      .filter((patient) => {
        if (!q) {
          return true;
        }
        return [patient.name, patient.patientCode, patient.phone]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(q));
      })
      .map(withPatientStats);

    sendJson(res, 200, { patients });
    return;
  }

  if (segments.length === 2 && method === "POST") {
    requireAnyCapability(
      user,
      ["platform.patients.manage", "workspace.patients.manage", "personal.profiles.manage"],
      "Không có quyền tạo hồ sơ bệnh nhân trong workspace hiện tại",
    );
    const payload = await readJsonBody(req);
    const workspaceContext = getUserWorkspaceContext(user);
    const isPlatformAdmin = isPlatformAdminUser(user);
    const organizationId = isPlatformAdmin
      ? readString(payload.organizationId, 120) || user.organizationId || "org_default_clinic"
      : workspaceContext.currentWorkspaceId || user.organizationId || "org_default_clinic";
    const patient = createPatientRecord({
      ...payload,
      organizationId,
      ownerUserId: isPatientUser(user) ? user.id : readString(payload.ownerUserId, 120),
      guardianUserId: isPatientUser(user) ? user.id : readString(payload.guardianUserId, 120),
      profileType: isPatientUser(user) ? readString(payload.profileType, 60) || "dependent" : readString(payload.profileType, 60) || "patient",
    });
    if (repositories) {
      await repositories.patients.save(patient);
    } else {
      saveDb();
    }
    await appendAudit("patient.create", req, {
      actorUserId: user.id,
      organizationId: patient.organizationId || "",
      resourceType: "patient",
      resourceId: patient.id,
    });
    sendJson(res, 201, { patient: withPatientStats(patient) });
    return;
  }

  const patient = repositories ? await repositories.patients.findById(patientId) : findPatient(patientId);
  if (!patient) {
    throw httpError(404, "Không tìm thấy hồ sơ sức khỏe");
  }

  if (segments.length === 4 && segments[3] === "shares" && method === "GET") {
    assertCanAccessPatient(user, patient.id);
    assertCanManagePatientSharing(user, patient);
    const shares = db.doctorPatientAccess
      .filter((grant) => grant.patientId === patient.id && !grant.revokedAt)
      .map((grant) => ({
        ...grant,
        active: isActiveAccessGrant(grant),
      }));
    sendJson(res, 200, { shares });
    return;
  }

  if (segments.length === 4 && segments[3] === "shares" && method === "POST") {
    assertCanAccessPatient(user, patient.id);
    assertCanManagePatientSharing(user, patient);
    const payload = await readJsonBody(req);
    const doctorUserId = readString(payload.doctorUserId || payload.targetDoctorUserId || payload.targetUserId, 120);
    const organizationId = readString(payload.organizationId || payload.targetWorkspaceId || payload.workspaceId, 120);
    if (!doctorUserId && !organizationId) {
      throw httpError(400, "Can chon bac si hoac workspace de chia se");
    }
    if (doctorUserId) {
      const doctor = db.users.find((item) => item.id === doctorUserId || item.firebaseUid === doctorUserId);
      if (!doctor || doctor.role !== "doctor") {
        throw httpError(404, "Không tìm thấy bác sĩ nhận chia sẻ");
      }
    }
    if (organizationId && !getClinicById(organizationId)) {
      throw httpError(404, "Không tìm thấy workspace nhận chia sẻ");
    }
    const scanIds = Array.isArray(payload.scanIds)
      ? payload.scanIds.map((item) => readString(item, 120)).filter(Boolean)
      : readString(payload.scanId, 120)
        ? [readString(payload.scanId, 120)]
        : [];
    for (const scanId of scanIds) {
      const scan = findScan(scanId);
      if (!scan || scan.patientId !== patient.id || !canAccessScan(user, scan)) {
        throw httpError(403, "Luot do chia se nam ngoai ho so hien tai");
      }
    }
    const grant = {
      id: createId("share"),
      patientId: patient.id,
      doctorUserId,
      doctorId: doctorUserId,
      organizationId,
      scope: readString(payload.scope, 80) || (scanIds.length ? "selected_scans" : "patient_profile"),
      scanIds,
      expiresAt: readString(payload.expiresAt, 80),
      grantedByUserId: user.id,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    db.doctorPatientAccess.unshift(grant);
    db.doctorPatientAccess = db.doctorPatientAccess.slice(0, 1000);
    await appendAudit("patient.share", req, {
      actorUserId: user.id,
      organizationId: patient.organizationId || getUserWorkspaceContext(user).currentWorkspaceId || "",
      resourceType: "patient",
      resourceId: patient.id,
      metadata: { doctorUserId, organizationId, scope: grant.scope, scanIds },
    });
    saveDb();
    sendJson(res, 201, { share: { ...grant, active: true } });
    return;
  }

  if (segments.length === 5 && segments[3] === "shares" && method === "DELETE") {
    assertCanAccessPatient(user, patient.id);
    assertCanManagePatientSharing(user, patient);
    const grantId = decodeURIComponent(segments[4]);
    const grant = db.doctorPatientAccess.find((item) => item.id === grantId && item.patientId === patient.id);
    if (!grant) {
      throw httpError(404, "Không tìm thấy quyền chia sẻ");
    }
    grant.revokedAt = nowIso();
    grant.revokedByUserId = user.id;
    grant.updatedAt = nowIso();
    await appendAudit("patient.share.revoke", req, {
      actorUserId: user.id,
      organizationId: patient.organizationId || getUserWorkspaceContext(user).currentWorkspaceId || "",
      resourceType: "patient_share",
      resourceId: grant.id,
      metadata: { patientId: patient.id },
    });
    saveDb();
    sendJson(res, 200, { revoked: true, share: grant });
    return;
  }
  if (!patient) {
    throw httpError(404, "Không tìm thấy bệnh nhân");
  }

  if (segments.length === 3 && method === "GET") {
    assertCanAccessPatient(user, patient.id);
    sendJson(res, 200, { patient: withPatientStats(patient) });
    return;
  }

  if (segments.length === 3 && method === "PATCH") {
    assertCanAccessPatient(user, patient.id);
    requireAnyCapability(
      user,
      ["platform.patients.manage", "workspace.patients.manage", "personal.profiles.manage"],
      "Không có quyền cập nhật hồ sơ bệnh nhân này",
    );
    const payload = await readJsonBody(req);
    updatePatientRecord(patient, payload);
    if (!isPlatformAdminUser(user)) {
      patient.organizationId = patient.organizationId || getUserWorkspaceContext(user).currentWorkspaceId || user.organizationId || "";
      patient.ownerUserId = patient.ownerUserId || user.id;
    }
    if (repositories) {
      await repositories.patients.save(patient);
    } else {
      saveDb();
    }
    sendJson(res, 200, { patient: withPatientStats(patient) });
    return;
  }

  if (segments.length === 3 && method === "DELETE") {
    assertCanAccessPatient(user, patient.id);
    requireAnyCapability(
      user,
      ["platform.patients.manage", "workspace.patients.manage", "personal.profiles.manage"],
      "Không có quyền xóa hồ sơ bệnh nhân này",
    );
    if (repositories) {
      await repositories.patients.delete(patient.id);
    } else {
      db.patients = db.patients.filter((item) => item.id !== patient.id);
      saveDb();
    }
    sendJson(res, 200, { deleted: true });
    return;
  }

  sendJson(res, 404, { error: "Patient route not found" });
}

async function handleScansApi(req, res, url, segments) {
  const method = req.method || "GET";
  const user = requireUser(req);
  const scanId = segments[2] ? decodeURIComponent(segments[2]) : "";

  if (segments.length === 2 && method === "GET") {
    const patientId = url.searchParams.get("patientId");
    const status = url.searchParams.get("status");
    const organizationId = url.searchParams.get("organizationId");
    const deviceId = url.searchParams.get("deviceId");
    const createdFrom = url.searchParams.get("createdFrom");
    const createdTo = url.searchParams.get("createdTo");
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || 50)));
    const sourceScans = repositories
      ? await repositories.scans.list({ patientId, status, organizationId, deviceId, createdFrom, createdTo, limit })
      : db.scans;
    const scans = filterScansForUser(user, sourceScans)
      .filter((scan) => !patientId || scan.patientId === patientId)
      .filter((scan) => !status || scan.status === status)
      .filter((scan) => !organizationId || scan.organizationId === organizationId)
      .filter((scan) => !deviceId || scan.deviceId === deviceId)
      .slice(0, limit);

    sendJson(res, 200, { scans });
    return;
  }

  if (segments.length === 2 && method === "POST") {
    requireAnyCapability(user, ["platform.scans.manage", "workspace.scans.manage", "personal.scans.manage"]);
    const payload = await readJsonBody(req);
    if (isDoctorUser(user) && payload.patientId) {
      assertCanAccessPatient(user, readString(payload.patientId, 120));
    }
    if (isPatientUser(user)) {
      delete payload.doctorNotes;
      delete payload.notes;
    }
    const scan = await createScanSession(payload, user);
    sendJson(res, 201, { scan });
    return;
  }

  if (segments.length === 3 && segments[2] === "start" && method === "POST") {
    requireAnyCapability(user, ["platform.scans.manage", "workspace.scans.manage", "personal.scans.manage"]);
    const payload = await readJsonBody(req);
    const idempotencyKey = getIdempotencyKey(req, payload);
    const existingScan = findIdempotentResource(user, idempotencyKey, "start_scan");
    if (existingScan) {
      sendJson(res, 200, { scan: existingScan, idempotent: true });
      saveDb();
      return;
    }
    if (isDoctorUser(user) && payload.patientId) {
      assertCanAccessPatient(user, readString(payload.patientId, 120));
    }
    if (isPatientUser(user)) {
      delete payload.doctorNotes;
      delete payload.notes;
    }
    const scan = startRecording({ ...payload, idempotencyKey }, user);
    rememberIdempotentResource(user, idempotencyKey, "start_scan", "scan", scan.id);
    saveDb();
    sendJson(res, 201, { scan });
    return;
  }

  if (segments.length === 4 && segments[2] === "active" && segments[3] === "stop" && method === "POST") {
    const activeScan = activeRecording
      ? findScan(activeRecording.scanId)
      : db.scans.find((item) => item.status === "recording");
    if (activeScan) {
      assertCanManageScan(user, activeScan);
    }
    const stopped = await stopActiveRecording();
    sendJson(res, 200, { scan: stopped });
    return;
  }

  const scan = scanId && scanId !== "start" ? (repositories ? await repositories.scans.findById(scanId) : findScan(scanId)) : null;
  if (!scan) {
    throw httpError(404, "Không tìm thấy lượt đo");
  }

  if (segments.length === 3 && method === "GET") {
    assertCanAccessScan(user, scan);
    sendJson(res, 200, { scan });
    return;
  }

  if (segments.length === 3 && method === "PATCH") {
    requireAnyCapability(user, ["platform.scans.manage", "workspace.scans.manage"]);
    assertCanManageScan(user, scan);
    const payload = await readJsonBody(req);
    const editableFields = ["bodySite", "mode", "doctorNotes", "aiLabel", "aiSummary"];
    for (const field of editableFields) {
      if (Object.prototype.hasOwnProperty.call(payload, field)) {
        scan[field] = readString(payload[field], field === "doctorNotes" || field === "aiSummary" ? 4000 : 200);
      }
    }
    if (Object.prototype.hasOwnProperty.call(payload, "aiConfidence")) {
      scan.aiConfidence = readOptionalNumber(payload.aiConfidence);
    }
    scan.updatedAt = nowIso();
    await saveScanRecord(scan);
    sendJson(res, 200, { scan });
    return;
  }

  if (segments.length === 4 && segments[3] === "stop" && method === "POST") {
    assertCanManageScan(user, scan);
    const stopped = await stopRecording(scan.id);
    sendJson(res, 200, { scan: stopped });
    return;
  }

  if (segments.length === 4 && segments[3] === "audio" && method === "GET") {
    assertCanAccessScan(user, scan);
    serveScanAudio(res, scan);
    return;
  }

  if (segments.length === 4 && segments[3] === "audio-chunks" && method === "POST") {
    assertCanManageScan(user, scan);
    const chunk = await readRequestBuffer(req);
    const result = await appendScanAudioChunk(scan, chunk);
    sendJson(res, 200, result);
    return;
  }

  if (segments.length === 4 && segments[3] === "complete" && method === "POST") {
    assertCanManageScan(user, scan);
    const completed = await completeUploadedScan(scan);
    await appendAudit("scan.complete", req, {
      resourceType: "scan",
      resourceId: completed.id,
      organizationId: completed.organizationId || getScanOrgId(completed),
    });
    sendJson(res, 200, { scan: completed });
    return;
  }

  if (segments.length === 4 && segments[3] === "audio-url" && method === "GET") {
    assertCanAccessScan(user, scan);
    const audioFile = repositories ? await repositories.audioFiles.findByScanId(scan.id) : db.audioFiles.find((file) => file.scanId === scan.id);
    if (!audioFile) {
      throw httpError(404, "Chưa có file âm thanh cho lượt đo này");
    }
    const url = await storageAdapter.getSignedUrl(audioFile.objectKey, 900);
    await appendAudit("scan.audio_url", req, {
      resourceType: "scan",
      resourceId: scan.id,
      organizationId: scan.organizationId || getScanOrgId(scan),
    });
    sendJson(res, 200, { url, expiresInSeconds: 900, objectKey: audioFile.objectKey });
    return;
  }

  sendJson(res, 404, { error: "Scan route not found" });
}

function serveScanAudio(res, scan) {
  if (!scan.wavFile) {
    throw httpError(404, "Chưa có file âm thanh cho lượt đo này");
  }

  const audioPath = path.join(AUDIO_DIR, path.basename(scan.wavFile));
  if (!fs.existsSync(audioPath)) {
    throw httpError(404, "Không tìm thấy file âm thanh");
  }

  setCommonHeaders(res);
  res.writeHead(200, {
    "Content-Type": "audio/wav",
    "Content-Length": fs.statSync(audioPath).size,
    "Content-Disposition": `inline; filename="${path.basename(scan.wavFile)}"`,
  });
  fs.createReadStream(audioPath).pipe(res);
}

function getContentType(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function serveStatic(req, res, url) {
  let requestedPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  requestedPath = requestedPath.replace(/^[/\\]+/, "");
  const staticPath = path.resolve(PUBLIC_DIR, requestedPath);

  if (!staticPath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  fs.readFile(staticPath, (err, content) => {
    setCommonHeaders(res);
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    res.writeHead(200, { "Content-Type": getContentType(staticPath) });
    res.end(content);
  });
}

function getLocalUrls() {
  const urls = [`http://localhost:${PORT}`];
  for (const values of Object.values(os.networkInterfaces())) {
    for (const item of values || []) {
      if (item.family === "IPv4" && !item.internal) {
        urls.push(`http://${item.address}:${PORT}`);
      }
    }
  }
  return urls;
}

const server = http.createServer((req, res) => {
  void (async () => {
    const context = createRequestContext(req);
    res.__smartHealthRequest = req;
    setCommonHeaders(res, req);
    res.setHeader("X-Request-Id", context.requestId);

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (url.pathname === "/metrics") {
      res.writeHead(200, { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" });
      res.end(getMetricsText());
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      assertRateLimit(req);
      await handleApi(req, res, url);
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Method not allowed");
      return;
    }

    serveStatic(req, res, url);
  })().catch((err) => sendError(req, res, err));
});

const audioUdp = dgram.createSocket("udp4");

audioUdp.on("message", (message, rinfo) => {
  const source = rinfo.address;
  const sourceLabel = `${rinfo.address}:${rinfo.port}`;
  const isNewSource = !udpAudioSources.has(source);
  const accepted = handleIncomingAudio(message, sourceLabel);

  if (!accepted) {
    return;
  }

  udpAudioSources.set(source, Date.now());

  if (isNewSource) {
    console.log(`UDP audio source connected: ${sourceLabel}`);
    refreshAudioSourceStatus();
  }
});

audioUdp.on("error", (err) => {
  console.error(`UDP audio error: ${err.message}`);
});

server.on("upgrade", (req, socket) => {
  socket.setNoDelay(true);

  const url = new URL(req.url, `http://${req.headers.host}`);
  const role =
    url.pathname === "/esp" || url.pathname === "/device"
      ? "esp"
      : url.pathname === "/listen" || url.pathname === "/app"
        ? "listen"
        : "";
  const key = req.headers["sec-websocket-key"];

  if (!role || !key) {
    socket.destroy();
    return;
  }

  socket.write(
    [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${websocketAcceptKey(key)}`,
      "",
      "",
    ].join("\r\n")
  );

  socket._wsRole = role;
  socket._wsBuffer = Buffer.alloc(0);
  socket._queryDeviceId = readString(url.searchParams.get("deviceId"), 120);
  socket._querySecret = readString(url.searchParams.get("secret"), 160);

  if (role === "esp") {
    espClients.add(socket);
    if (socket._queryDeviceId) {
      deviceSockets.set(socket._queryDeviceId, socket);
      socket._deviceId = socket._queryDeviceId;
    }
    console.log("ESP connected");
  } else {
    listenClients.add(socket);
    console.log("App/browser connected");
    sendText(socket, JSON.stringify(getStatusPayload()));
    sendText(
      socket,
      JSON.stringify({
        type: "metrics",
        ...liveMetrics,
        recording: Boolean(activeRecording),
        activeScanId: activeRecording ? activeRecording.scanId : null,
      })
    );
  }

  socket.on("data", (chunk) => {
    try {
      handleWebSocketData(socket, chunk);
    } catch (err) {
      console.error(err.message);
      closeSocket(socket);
    }
  });
  socket.on("close", () => cleanupSocket(socket));
  socket.on("error", () => cleanupSocket(socket));

  broadcastStatus();
});

function startNetworkServers() {
  server.listen(PORT, HOST, () => {
    console.log(`Smart Health backend listening on port ${PORT}`);
    console.log(`Data backend: ${DATA_BACKEND}`);
    console.log(`Auth mode: ${AUTH_MODE}; Firebase auth: ${FIREBASE_AUTH_ENABLED ? "enabled" : "disabled"}`);
    for (const url of getLocalUrls()) {
      console.log(`Open ${url}`);
    }
    console.log(`App WebSocket: ws://<this-computer-ip>:${PORT}/app`);
    console.log(`ESP WebSocket firmware should connect to ws://<this-computer-ip>:${PORT}/esp`);
    console.log(`UDP firmware should send PCM16 audio to <this-computer-ip>:${AUDIO_UDP_PORT}`);
  });

  audioUdp.bind(AUDIO_UDP_PORT, HOST, () => {
    console.log(`UDP audio listening on port ${AUDIO_UDP_PORT}`);
  });

  setInterval(refreshAudioSourceStatus, 1000);
}

async function startRuntime() {
  ensureDataDirs();
  dataStore = createDataStore({
    backend: DATA_BACKEND,
    databaseUrl: process.env.DATABASE_URL,
    dbFile: DB_FILE,
    ensureDataDirs,
    createEmptyDb,
    normalizeDb,
  });
  await dataStore.init();
  db = normalizeDb(await dataStore.load());
  storageAdapter = createStorageAdapter({ dataDir: DATA_DIR, env: process.env });
  audioQueue = createAudioQueue(process.env);
  repositories = createRepositories({
    getDb: () => db,
    saveDb,
    createId,
    nowIso,
    getPool: () => (dataStore && dataStore.pool ? dataStore.pool : null),
  });
  const hydratedCounts = await repositories.hydrateCoreState();
  if (hydratedCounts) {
    console.log(`PostgreSQL normalized state loaded: users=${hydratedCounts.users}, patients=${hydratedCounts.patients}, devices=${hydratedCounts.devices}, scans=${hydratedCounts.scans}, audioFiles=${hydratedCounts.audioFiles}, aiResults=${hydratedCounts.aiResults}, organizations=${hydratedCounts.organizations}, notifications=${hydratedCounts.notifications}, auditLogs=${hydratedCounts.auditLogs}`);
  }
  ensureAppDefaults();
  localizeLegacyDbText();
  markInterruptedRecordings();
  await saveDb();
  mqttControlPlane = createMqttControlPlane({
    env: process.env,
    onTelemetry: (deviceId, payload) => {
      void handleDeviceTelemetry(deviceId, payload).catch((err) => console.error(`MQTT telemetry error: ${err.message}`));
    },
    onEvent: (deviceId, payload) => {
      void handleDeviceEvent(deviceId, payload).catch((err) => console.error(`MQTT event error: ${err.message}`));
    },
  });
  startNetworkServers();
}

startRuntime().catch((err) => {
  console.error(`Cannot start Smart Health backend: ${err.message}`);
  process.exit(1);
});

server.on("error", (err) => {
  console.error(err.message);
  audioUdp.close();
  process.exit(1);
});

process.on("SIGINT", async () => {
  try {
    if (activeRecording) {
      await stopRecording(activeRecording.scanId);
    }
    await flushDb();
    if (audioQueue) {
      await audioQueue.close();
    }
    if (mqttControlPlane) {
      mqttControlPlane.close();
    }
    if (dataStore) {
      await dataStore.close();
    }
  } catch (err) {
    console.error(`Cannot close active recording: ${err.message}`);
  } finally {
    audioUdp.close();
    server.close(() => process.exit(0));
  }
});
