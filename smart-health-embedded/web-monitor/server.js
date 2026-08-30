const crypto = require("node:crypto");
const dgram = require("node:dgram");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const nodemailer = require("nodemailer");
const { createDataStore, resolveBackendFromEnv } = require("./src/dataStore");
const { resolveCorsOrigin } = require("./src/corsPolicy");
const { buildReleaseIdentity } = require("./src/releaseIdentity");
const {
  getFirebaseIdTokenErrorCode,
  getFirebaseAdmin,
  isFirebaseAuthEnabled,
  isFirebaseProviderMutationConfirmed,
  normalizeFirebaseAuthTime,
  verifyFirebaseIdToken,
} = require("./src/firebaseAuth");
const {
  createCompletedEnrollmentSession,
  createEnrollmentStartBinding,
  createEnrollmentRecoveryAcknowledgementBinding,
  createEnrollmentRecoveryDelivery,
  createTwoFactorToken,
  createTotpEnrollment,
  getEnrollmentRecoveryDelivery,
  getTwoFactorAvailability,
  hashPrimaryBinding,
  hashTwoFactorToken,
  isEnrollmentRecoveryDeliveryReplay,
  materializeTotpEnrollment,
  verifyRecoveryCode,
  verifyRecoveryAckToken,
  verifyTotpCode,
} = require("./src/twoFactorAuth");
const { processAudioFile } = require("./src/audioProcessing");
const { createAudioQueue } = require("./src/queue");
const { createRepositories } = require("./src/repositories");
const {
  normalizeWorkspaceSettingsUpdate,
} = require("./src/workspaceLifecycleContract");
const {
  MAX_ROLE_REQUEST_DOCUMENT_BYTES,
  persistRoleRequestDocumentUpload,
  publicDocument: publicRoleRequestDocument,
} = require("./src/roleRequestDocumentRepository");
const {
  MAX_AVATAR_BYTES,
  executeAvatarDeleteMutation,
  executeAvatarUploadMutation,
  validateAvatarUpload,
} = require("./src/avatarMutationRepository");
const { createAvatarCleanupWorker } = require("./src/avatarCleanupWorker");
const {
  createPasswordIdempotencyFingerprint,
} = require("./src/passwordChangeSecurity");
const {
  isPasswordHash,
  normalizePasswordHash,
  verifyPasswordSecret,
} = require("./src/passwordHash");
const {
  createFirebasePasswordProof,
} = require("./src/firebasePasswordVerifier");
const {
  executeIdentityProviderMutationOnce,
  reconciliationError,
} = require("./src/identityProviderExecution");
const {
  EXPORT_ARTIFACT_RENDERER_VERSION,
  EXPORT_FORMATS,
  buildExportArtifact,
  normalizeExportFormat,
} = require("./src/exportArtifact");
const { normalizeAuditLogQuery, sanitizeAuditMetadata } = require("./src/auditLogContract");
const { paginateAdminList } = require("./src/adminListContract");
const { buildOverviewRangeSnapshot } = require("./src/overviewStatsContract");
const {
  buildClinicalDashboardStatus,
  buildPublicHealthStatus,
  selectWorkspaceRecording,
} = require("./src/clinicalDashboardStatus");
const {
  assertPatientDashboardAccess,
  buildPatientDashboardLegacyStats,
  buildPatientDashboardSnapshot,
} = require("./src/patientDashboardContract");
const {
  PATIENT_IMPORT_MAX_BYTES,
  PATIENT_IMPORT_TTL_MS,
  validatePatientImportCsv,
} = require("./src/patientImportContract");
const { MAX_SCAN_AUDIO_CHUNK_BYTES } = require("./src/scanAudioUploadRepository");
const { createKeyedSerialExecutor } = require("./src/deviceEventQueue");
const { attachActor, createRequestContext, getRequestContext } = require("./src/requestContext");
const { createMqttControlPlane } = require("./src/mqttControlPlane");
const { buildProductionReadiness } = require("./src/productionReadiness");
const { assertRuntimeSecurity, resolveAuthMode } = require("./src/runtimeSecurity");
const { postOutboundWebhook } = require("./src/outboundWebhookSecurity");
const { buildPushNotificationPayload } = require("./src/notificationPushPayload");
const {
  resolveEligibleNotificationDevices,
} = require("./src/notificationDeviceEligibility");
const {
  isValidFcmRegistrationToken,
  selectBoundedNotificationDevices,
} = require("./src/notificationDeviceLimits");
const {
  buildBrevoEventReportUrl,
  isDeliverableNotificationEmailAddress,
  resolveBrevoDeliveryPatch,
  summarizeNotificationCampaignDelivery,
} = require("./src/notificationEmailDelivery");
const {
  CLOUD_NOTIFICATION_PREFERENCE_KEYS,
  mergeNotificationPreferences,
  mergeNotificationPushStatus,
  normalizeNotificationPreferences,
  parseNotificationCampaignType,
  parseNotificationPreferencePatch,
  resolveNotificationPreferenceDecision,
} = require("./src/notificationPreferences");
const {
  activateManagedAdminProvider,
  assertActiveManagedAdminWorkspace,
  assertManagedAdminAssignableRole,
  assertPendingManagedAdminProvider,
  assertManagedAdminReplayBackendState,
  assertManagedAdminReplayProvider,
  managedAdminIdempotencyPayload,
} = require("./src/managedAdminProvisioning");
const { getAiProviderAvailability, requestAiChat } = require("./src/aiProvider");
const {
  SIGNAL_QUALITY_ANALYZER_VERSION,
  buildAiRuntimeStatus,
  buildAiUpdateStatus,
  buildSignalQualityRawResult,
  normalizeAiSettings,
} = require("./src/aiRuntime");
const { buildScanObjectKey, createStorageAdapter } = require("./src/storageAdapter");
const {
  DEVICE_AUTH_CHALLENGE_TTL_MS,
  assertDeviceAuthenticationFence,
  canonicalDeviceSecretHash,
  containsSensitiveDeviceCredential,
  createDeviceAuthenticator,
  normalizeDeviceSecretMaterial,
  sanitizeDeviceCredentialRotation,
  sanitizeDeviceTelemetry,
  sanitizePublicDeviceEventPayload,
  wrapDeviceRotationSecret,
} = require("./src/deviceSessionSecurity");
const {
  AUDIO_V2_MAGIC,
  AudioSequenceGuard,
  decodeAudioFrameV2,
  encodeAudioFrameV2,
} = require("./src/audioProtocolV2");
const {
  applyDeviceCommandDelivery,
  applyDeviceReportedCommandStatus,
  createDeviceCommandEnvelope,
  createDeviceCommandRecord,
  expireDeviceCommandIfOverdue,
  getSpecializedDeviceCommandRoute,
  isGenericSafeDeviceCommandType,
  isSupportedDeviceCommandType,
  publicDeviceCommand,
  transitionDeviceCommand,
} = require("./src/deviceCommandLifecycle");
const {
  createDeviceOtaAuthoritySnapshot,
  createDeviceOtaOwnershipBinding,
  isCanonicalDeviceOtaLifecycle,
  isCanonicalPrivateDeviceOtaGrant,
  OTA_TERMINAL_STATUSES,
  normalizeDeviceOtaStatus,
  sanitizeDeviceOtaLifecycle,
  transitionDeviceOtaLifecycle,
} = require("./src/deviceOtaLifecycle");
const {
  applyDeviceOwnershipTransition,
  inferDeviceOwnershipState,
  validateActiveDeviceClaim,
} = require("./src/deviceOwnershipLifecycle");
const {
  assertCanonicalDeviceId,
  buildSecureSetupQrPayload,
} = require("./src/deviceSetupSecurity");
const {
  SMART_CONFIG_TRANSPORT,
  buildSmartConfigV2Material,
} = require("./src/deviceSmartConfigSecurity");
const {
  STAFF_INVITATION_STATUSES,
  assertStaffInvitationToken,
  generateStaffInvitationToken,
  hashStaffInvitationToken,
  normalizeStaffInvitationCreate,
  normalizeStaffInvitationRevoke,
} = require("./src/staffInvitationContract");
const {
  normalizeSupportTicketCreate,
} = require("./src/supportTicketContract");
const {
  assertOtaUpgradeVersion,
  buildSignedOtaManifest,
  hashOtaDownloadToken,
  verifyOtaDownloadToken,
} = require("./src/otaManifestSigning");

const PORT = Number(process.env.PORT || 3000);
const AUDIO_UDP_PORT = Number(process.env.AUDIO_UDP_PORT || 3001);
const SAMPLE_RATE = Number(process.env.SAMPLE_RATE || 16000);
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const HOST = "0.0.0.0";
const LEGACY_DEFAULT_PLATFORM_NAME = "Smart Health B2B Platform";
const DEFAULT_PLATFORM_NAME = "Shcare";
const LEGACY_DEFAULT_DOCTOR_NAME = "Bác sĩ Smart Health";
const DEFAULT_DOCTOR_NAME = "Bác sĩ Shcare";
const deviceEventExecutor = createKeyedSerialExecutor();
const scanAudioFileMutationExecutor = createKeyedSerialExecutor();
const scanAudioReprocessExecutor = createKeyedSerialExecutor();

const PUBLIC_DIR = path.join(__dirname, "public");
const INDEX_FILE = path.join(PUBLIC_DIR, "index.html");
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, "data"));
const AUDIO_DIR = path.join(DATA_DIR, "audio");
const TMP_DIR = path.join(DATA_DIR, "tmp");
const DB_FILE = path.join(DATA_DIR, "db.json");
const DATA_BACKEND = resolveBackendFromEnv(process.env);
const AUTH_MODE = resolveAuthMode(process.env);
const FIREBASE_AUTH_ENABLED = isFirebaseAuthEnabled(process.env);
const ALLOW_DEMO_AUTH = String(process.env.ALLOW_DEMO_AUTH || "").toLowerCase() === "true";
const SHOULD_SEED_DEMO_DATA = AUTH_MODE === "demo";

const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES || 100 * 1024 * 1024);
const MAX_JSON_BODY_BYTES = Math.min(
  1024 * 1024,
  Math.max(4 * 1024, Number(process.env.MAX_JSON_BODY_BYTES || 64 * 1024) || 64 * 1024),
);
const MAX_WS_BUFFER_BYTES = Number(process.env.MAX_WS_BUFFER_BYTES || 1024 * 1024);
const MAX_DEVICE_AUDIO_FRAME_BYTES = Number(process.env.MAX_DEVICE_AUDIO_FRAME_BYTES || 4 * 1024);
const MAX_SCAN_WAVEFORM_BYTES = 256 * 1024;
const MAX_SCAN_WAVEFORM_POINTS = 512;
const ALLOW_AUDIO_V1_COMPAT = String(process.env.ALLOW_AUDIO_V1_COMPAT || "true").toLowerCase() === "true";
const DEVICE_SECRET_ROTATION_TTL_RAW_MS = Number(process.env.DEVICE_SECRET_ROTATION_TTL_MS || 10 * 60 * 1000);
const DEVICE_SECRET_ROTATION_TTL_MS = Number.isFinite(DEVICE_SECRET_ROTATION_TTL_RAW_MS)
  ? Math.max(60_000, Math.min(24 * 60 * 60 * 1000, DEVICE_SECRET_ROTATION_TTL_RAW_MS))
  : 10 * 60 * 1000;
const UDP_SOURCE_TIMEOUT_MS = 3000;
const LIVE_METRIC_INTERVAL_MS = 250;
const REALTIME_AUTH_SESSION_RECHECK_RAW_MS = Number(process.env.REALTIME_AUTH_SESSION_RECHECK_MS || 15000);
const REALTIME_AUTH_SESSION_RECHECK_MS = Number.isFinite(REALTIME_AUTH_SESSION_RECHECK_RAW_MS)
  ? Math.max(5000, REALTIME_AUTH_SESSION_RECHECK_RAW_MS)
  : 15000;
const REALTIME_FIREBASE_ACCOUNT_RECHECK_RAW_MS = Number(process.env.REALTIME_FIREBASE_ACCOUNT_RECHECK_MS || 60000);
const REALTIME_FIREBASE_ACCOUNT_RECHECK_MS = Number.isFinite(REALTIME_FIREBASE_ACCOUNT_RECHECK_RAW_MS)
  ? Math.max(15000, REALTIME_FIREBASE_ACCOUNT_RECHECK_RAW_MS)
  : 60000;
const STAFF_INVITATION_TTL_HOURS_RAW = Number(process.env.STAFF_INVITATION_TTL_HOURS || 168);
const STAFF_INVITATION_TTL_HOURS = Number.isFinite(STAFF_INVITATION_TTL_HOURS_RAW)
  ? Math.max(1, Math.min(720, STAFF_INVITATION_TTL_HOURS_RAW))
  : 168;
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
const ROLE_INFO_FIELDS = new Set([
  "name",
  "phone",
  "license",
  "clinic",
  "specialty",
  "reason",
  "workspaceName",
  "address",
  "representative",
  "legalName",
  "email",
]);
const ROLE_REQUEST_INPUT_FIELDS = new Set([
  "expectedUserId",
  "expectedWorkspaceId",
  "requestedRole",
  "role",
  "accountType",
  "workspaceType",
  "organizationId",
  "clinicId",
  "clinic",
  "name",
  "fullName",
  "phone",
  "email",
  "license",
  "hospital",
  "clinicName",
  "department",
  "specialty",
  "reason",
  "registrationReason",
  "workspaceName",
  "address",
]);
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
const deviceRotationSessionKeys = new WeakMap();
const rateLimitBuckets = new Map();
const managedAdminCreateInFlight = new Map();
const scanAudioCompletionInFlight = new Map();
const scanMutationInFlight = new Map();
const requestMetrics = {
  startedAt: nowIso(),
  total: 0,
  errors: 0,
  legacyAuthSessionRevoke: 0,
  legacyWorkspaceSettingsUpdate: 0,
  legacyAvatarMutation: 0,
  legacyAccountProfileUpdate: 0,
  legacyAccountProfileWorkspaceMix: 0,
  legacyWorkspaceSwitchAlias: 0,
  byStatus: {},
};

let dataStore = null;
let repositories = null;
let storageAdapter = null;
let avatarCleanupWorker = null;
let audioQueue = null;
let mqttControlPlane = null;
let pendingSave = Promise.resolve();
let db = createEmptyDb();
const activeRecordingsByScanId = new Map();
const activeRecordingScanIdByDeviceId = new Map();
let lastAudioSourceCount = 0;
let liveMetrics;
const deviceAuthenticator = createDeviceAuthenticator({
  findDeviceById: async (deviceId) =>
    repositories ? repositories.devices.findById(deviceId) : db.devices.find((item) => item.id === deviceId) || null,
});

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
    patientImportBatches: [],
    appointments: [],
    scans: [],
    scanAudioChunks: [],
    scanAudioCompletions: [],
    scanReviews: [],
    clinicalAlerts: [],
    users: [],
    organizations: [],
    memberships: [],
    staffInvitations: [],
    supportTickets: [],
    roleRequestDocuments: [],
    avatarMutationOperations: [],
    doctorPatientAccess: [],
    idempotencyKeys: [],
    deviceClaims: [],
    sessions: [],
    authSessions: [],
    twoFactorCredentials: [],
    twoFactorEnrollments: [],
    twoFactorChallenges: [],
    twoFactorTokens: [],
    notifications: [],
    notificationDevices: [],
    accessLogs: [],
    auditLogs: [],
    devices: [],
    deviceEvents: [],
    deviceCommands: [],
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
  normalized.patientImportBatches = Array.isArray(normalized.patientImportBatches)
    ? normalized.patientImportBatches
    : [];
  normalized.appointments = Array.isArray(normalized.appointments) ? normalized.appointments : [];
  normalized.scans = Array.isArray(normalized.scans) ? normalized.scans : [];
  normalized.scanAudioChunks = Array.isArray(normalized.scanAudioChunks) ? normalized.scanAudioChunks : [];
  normalized.scanAudioCompletions = Array.isArray(normalized.scanAudioCompletions) ? normalized.scanAudioCompletions : [];
  normalized.scanReviews = Array.isArray(normalized.scanReviews) ? normalized.scanReviews : [];
  normalized.clinicalAlerts = Array.isArray(normalized.clinicalAlerts) ? normalized.clinicalAlerts : [];
  normalized.users = (Array.isArray(normalized.users) ? normalized.users : []).map(
    (user) => {
      const normalizedUser = { ...user };
      const passwordHash = normalizePasswordHash(
        normalizedUser.passwordHash || normalizedUser.password || "",
      );
      if (passwordHash) normalizedUser.password = passwordHash;
      else delete normalizedUser.password;
      delete normalizedUser.passwordHash;
      return normalizedUser;
    },
  );
  normalized.organizations = (Array.isArray(normalized.organizations) ? normalized.organizations : []).map(
    (organization) => ({
      ...organization,
      version: Number.isInteger(Number(organization?.version)) && Number(organization.version) > 0
        ? Number(organization.version)
        : 1,
      deletedAt: organization?.deletedAt || "",
    }),
  );
  normalized.memberships = (Array.isArray(normalized.memberships) ? normalized.memberships : []).map(
    (membership) => ({
      ...membership,
      status: readString(membership?.status || "active", 40).toLowerCase() || "active",
      suspendedAt: membership?.suspendedAt || "",
      updatedAt: membership?.updatedAt || membership?.createdAt || "",
    }),
  );
  normalized.staffInvitations = Array.isArray(normalized.staffInvitations)
    ? normalized.staffInvitations
    : [];
  normalized.supportTickets = Array.isArray(normalized.supportTickets)
    ? normalized.supportTickets
    : [];
  normalized.roleRequestDocuments = Array.isArray(normalized.roleRequestDocuments)
    ? normalized.roleRequestDocuments
    : [];
  normalized.avatarMutationOperations = Array.isArray(normalized.avatarMutationOperations)
    ? normalized.avatarMutationOperations
    : [];
  normalized.doctorPatientAccess = Array.isArray(normalized.doctorPatientAccess) ? normalized.doctorPatientAccess : [];
  const canonicalDoctorByIdentity = new Map();
  const ambiguousDoctorIdentities = new Set();
  for (const user of normalized.users) {
    if (!user || user.role !== "doctor") continue;
    for (const identity of [user.id, user.firebaseUid].filter(Boolean)) {
      if (canonicalDoctorByIdentity.has(identity) && canonicalDoctorByIdentity.get(identity) !== user.id) {
        canonicalDoctorByIdentity.delete(identity);
        ambiguousDoctorIdentities.add(identity);
      } else if (!ambiguousDoctorIdentities.has(identity)) {
        canonicalDoctorByIdentity.set(identity, user.id);
      }
    }
  }
  normalized.doctorPatientAccess = normalized.doctorPatientAccess.map((grant) => {
    const requestedIdentity = grant?.doctorUserId || grant?.doctorId || "";
    const canonicalDoctorId = canonicalDoctorByIdentity.get(requestedIdentity);
    const patient = normalized.patients.find((item) => item.id === grant?.patientId) || null;
    const grantedByUserId = readString(grant?.grantedByUserId, 120);
    const grantedByUser = normalized.users.find((item) => item.id === grantedByUserId) || null;
    const isPatientAuthority = Boolean(
      grantedByUserId &&
      grantedByUser?.role === "patient" &&
      patient &&
      [patient.ownerUserId, patient.accountUserId, patient.guardianUserId].includes(grantedByUserId),
    );
    const canonicalGrant = canonicalDoctorId
      ? { ...grant, doctorUserId: canonicalDoctorId, doctorId: canonicalDoctorId }
      : { ...grant };
    const authorityType = [
      "patient_consent",
      "clinician_access_grant",
      "administrative_assignment",
    ].includes(canonicalGrant.authorityType)
      ? canonicalGrant.authorityType
      : isPatientAuthority
        ? "patient_consent"
        : canonicalGrant.doctorUserId || canonicalGrant.doctorId
          ? "clinician_access_grant"
          : "administrative_assignment";
    return {
      ...canonicalGrant,
      authorityType,
      purpose: readString(canonicalGrant.purpose, 2000),
      consentedAt:
        authorityType === "patient_consent"
          ? canonicalGrant.consentedAt || canonicalGrant.createdAt || ""
          : "",
    };
  });
  normalized.idempotencyKeys = Array.isArray(normalized.idempotencyKeys) ? normalized.idempotencyKeys : [];
  normalized.identityOperations = Array.isArray(normalized.identityOperations) ? normalized.identityOperations : [];
  normalized.deviceClaims = Array.isArray(normalized.deviceClaims) ? normalized.deviceClaims : [];
  normalized.sessions = Array.isArray(normalized.sessions) ? normalized.sessions : [];
  normalized.authSessions = Array.isArray(normalized.authSessions) ? normalized.authSessions : [];
  normalized.twoFactorCredentials = Array.isArray(normalized.twoFactorCredentials) ? normalized.twoFactorCredentials : [];
  normalized.twoFactorEnrollments = Array.isArray(normalized.twoFactorEnrollments) ? normalized.twoFactorEnrollments : [];
  normalized.twoFactorChallenges = Array.isArray(normalized.twoFactorChallenges) ? normalized.twoFactorChallenges : [];
  normalized.twoFactorTokens = Array.isArray(normalized.twoFactorTokens) ? normalized.twoFactorTokens : [];
  normalized.notifications = Array.isArray(normalized.notifications) ? normalized.notifications : [];
  normalized.notificationDevices = Array.isArray(normalized.notificationDevices) ? normalized.notificationDevices : [];
  normalized.accessLogs = Array.isArray(normalized.accessLogs) ? normalized.accessLogs : [];
  normalized.auditLogs = Array.isArray(normalized.auditLogs) ? normalized.auditLogs : [];
  normalized.devices = Array.isArray(normalized.devices)
    ? normalized.devices.map((device) => {
        const normalizedDevice = normalizeDeviceSecretMaterial(device);
        const legacyToken = readString(normalizedDevice.ota?.token, 180);
        const ota = sanitizeDeviceOtaLifecycle({
          ...normalizedDevice.ota,
          tokenHash:
            normalizedDevice.ota?.tokenHash ||
            (legacyToken ? hashOtaDownloadToken(legacyToken) : ""),
        });
        const otaStatus = normalizeDeviceOtaStatus(normalizedDevice.otaStatus || ota.status);
        if (otaStatus) ota.status = otaStatus;
        normalizedDevice.ota = ota;
        normalizedDevice.otaStatus = otaStatus;
        return normalizedDevice;
      })
    : [];
  normalized.deviceEvents = Array.isArray(normalized.deviceEvents) ? normalized.deviceEvents : [];
  normalized.deviceCommands = (Array.isArray(normalized.deviceCommands) ? normalized.deviceCommands : []).map(
    (command) => {
      const normalizedCommand = { ...command };
      if (
        normalizedCommand.type === "ota.update" &&
        ["acknowledged", "applying"].includes(normalizedCommand.state) &&
        !normalizedCommand.executionExpiresAt
      ) {
        const matchingOta = normalized.devices.find(
          (device) => device.id === normalizedCommand.deviceId && device.ota?.commandId === normalizedCommand.id,
        )?.ota;
        const otaDeadlineMs = Date.parse(matchingOta?.expiresAt || "");
        const deliveryDeadlineMs = Date.parse(normalizedCommand.expiresAt || "");
        const updatedAtMs = Date.parse(normalizedCommand.updatedAt || normalizedCommand.issuedAt || "");
        const compatibilityDeadlineMs = Math.max(
          Number.isFinite(deliveryDeadlineMs) ? deliveryDeadlineMs : 0,
          Number.isFinite(updatedAtMs) ? updatedAtMs : 0,
          Date.now(),
        ) + 2 * 60 * 60_000;
        normalizedCommand.executionExpiresAt = new Date(
          Number.isFinite(otaDeadlineMs) && otaDeadlineMs > deliveryDeadlineMs
            ? otaDeadlineMs
            : compatibilityDeadlineMs,
        ).toISOString();
      }
      return normalizedCommand;
    },
  );
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
  normalized.settings.ai = normalizeAiSettings(normalized.settings.ai);
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
    delete user.twoFactorSecret;
    delete user.twoFactorSecretPreview;
    delete user.twoFactorRecoveryCodes;
    user.firebaseClaims = sanitizePublicFirebaseClaims(user.firebaseClaims);
    const credential = normalized.twoFactorCredentials.find(
      (item) => item && item.userId === user.id && !item.disabledAt,
    );
    user.twoFactorEnabled = Boolean(credential);
    user.twoFactorMethod = credential ? credential.method || "app" : "";
    user.firebaseClaims.profile = {
      ...(user.firebaseClaims.profile || {}),
      twoFactorEnabled: user.twoFactorEnabled,
      twoFactorMethod: user.twoFactorMethod,
    };

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

function saveDbStrict() {
  db.updatedAt = nowIso();
  if (!dataStore) {
    return Promise.resolve();
  }
  const operation = pendingSave
    .catch(() => {})
    .then(() => dataStore.save(db));
  pendingSave = operation.catch((err) => {
    console.error(`Cannot persist backend state: ${err.message}`);
  });
  return operation;
}

function listActiveRecordings() {
  return Array.from(activeRecordingsByScanId.values());
}

function getActiveRecordingByScanId(scanId) {
  return activeRecordingsByScanId.get(readString(scanId, 120)) || null;
}

function getActiveRecordingForDevice(deviceId) {
  const scanId = activeRecordingScanIdByDeviceId.get(readString(deviceId, 120));
  return scanId ? getActiveRecordingByScanId(scanId) : null;
}

function getActiveRecordingByCommandId(commandId) {
  const scopedCommandId = readString(commandId, 128);
  if (!scopedCommandId) return null;
  return listActiveRecordings().find(
    (recording) =>
      recording.startCommandId === scopedCommandId || recording.stopCommandId === scopedCommandId,
  ) || null;
}

function registerActiveRecording(recording) {
  if (!recording?.scanId || !recording?.deviceId) {
    throw new Error("Active recording requires scan and device identity");
  }
  if (activeRecordingsByScanId.has(recording.scanId)) {
    throw httpError(409, "Lượt ghi này đang hoạt động", "SCAN_ALREADY_RECORDING");
  }
  const existingScanId = activeRecordingScanIdByDeviceId.get(recording.deviceId);
  if (existingScanId) {
    throw httpError(409, "Thiết bị đang thực hiện một lượt ghi khác", "DEVICE_ALREADY_RECORDING");
  }
  activeRecordingsByScanId.set(recording.scanId, recording);
  activeRecordingScanIdByDeviceId.set(recording.deviceId, recording.scanId);
  return recording;
}

function releaseActiveRecording(recordingOrScanId) {
  const recording =
    typeof recordingOrScanId === "string"
      ? getActiveRecordingByScanId(recordingOrScanId)
      : recordingOrScanId;
  if (!recording) return null;
  if (recording.startExpiryTimer) {
    clearTimeout(recording.startExpiryTimer);
    recording.startExpiryTimer = null;
  }
  activeRecordingsByScanId.delete(recording.scanId);
  if (activeRecordingScanIdByDeviceId.get(recording.deviceId) === recording.scanId) {
    activeRecordingScanIdByDeviceId.delete(recording.deviceId);
  }
  for (const listener of listenClients) {
    if (listener._listenerScanId === recording.scanId) {
      listener._listenerScanId = null;
      listener._audioSessionId = null;
      listener._audioFrameSessionId = null;
      listener._audioProtocolVersion = null;
      listener._audioSourceBaseSequence = null;
      listener._audioListenerSequence = null;
    }
  }
  return recording;
}

const DEVICE_CREDENTIAL_ALPHABET = Buffer.from(
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-",
  "ascii",
);

function generateDeviceCredentialBuffer(length = 64) {
  const boundedLength = Math.max(32, Math.min(95, Number(length) || 64));
  const output = Buffer.alloc(boundedLength);
  let offset = 0;
  while (offset < output.length) {
    const entropy = crypto.randomBytes(output.length - offset);
    for (const value of entropy) {
      output[offset] = DEVICE_CREDENTIAL_ALPHABET[value & 63];
      offset += 1;
      if (offset >= output.length) break;
    }
    entropy.fill(0);
  }
  return output;
}

function saveDb() {
  return saveDbStrict().catch(() => undefined);
}

async function flushDb() {
  await pendingSave;
}

function createDefaultSettings() {
  return {
    system: {
      name: DEFAULT_PLATFORM_NAME,
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
      autoSync: false,
      cloudBackup: false,
      localUsedMb: 0,
      localTotalMb: 0,
      cloudUsedMb: 0,
      cloudTotalMb: 0,
      cacheMb: 0,
    },
    stethoscope: {
      volume: 75,
      sensitivity: 60,
      noiseCancel: true,
      autoConnect: true,
      lastCalibrationAt: "2026-05-19T08:00:00.000Z",
    },
    ai: normalizeAiSettings(),
    outbound: {
      email: {
        enabled: true,
        provider: "brevo-api",
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
  const seededDemoUserIds = new Set();

  if (db.settings?.system?.name === LEGACY_DEFAULT_PLATFORM_NAME) {
    db.settings.system.name = DEFAULT_PLATFORM_NAME;
    changed = true;
  }

  const legacyDefaultDoctor = db.users.find(
    (user) =>
      user?.id === "usr_doctor_default" &&
      user?.name === LEGACY_DEFAULT_DOCTOR_NAME,
  );
  if (legacyDefaultDoctor) {
    legacyDefaultDoctor.name = DEFAULT_DOCTOR_NAME;
    legacyDefaultDoctor.updatedAt = nowIso();
    changed = true;
  }

  if (SHOULD_SEED_DEMO_DATA && db.users.length === 0) {
    const createdAt = nowIso();
    db.users.push(
      {
        id: "usr_doctor_default",
        role: "doctor",
        requestedRole: "doctor",
        roleRequestStatus: "approved",
        accountStatus: "active",
        name: DEFAULT_DOCTOR_NAME,
        email: "doctor@example.com",
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
        accountStatus: "active",
        name: "Người dùng Smart Health",
        email: "patient@example.com",
        phone: "0900000000",
        password: "12345678",
        address: "Hồ Chí Minh",
        verifiedEmail: true,
        verifiedPhone: true,
        createdAt,
        updatedAt: createdAt,
      }
    );
    seededDemoUserIds.add("usr_doctor_default");
    seededDemoUserIds.add("usr_patient_default");
    changed = true;
  }

  if (SHOULD_SEED_DEMO_DATA && db.organizations.length === 0) {
    const createdAt = nowIso();
    db.organizations.push({
      id: "org_default_clinic",
      name: "Smart Health Clinic",
      type: "clinic",
      workspaceType: "clinic",
      status: "active",
      version: 1,
      deletedAt: "",
      packageId: "pkg_clinic_basic",
      subscriptionStatus: "trial",
      billingCycle: "monthly",
      createdAt,
      updatedAt: createdAt,
    });
    changed = true;
  }

  if (SHOULD_SEED_DEMO_DATA && db.servicePackages.length === 0) {
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
    if (!org.status) {
      // Legacy rows were historically treated as active by public/auth reads.
      // Persist that interpretation so lifecycle validation sees the same state.
      org.status = "active";
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
    if (!user.organizationId && seededDemoUserIds.has(user.id)) {
      user.organizationId = "org_default_clinic";
      user.updatedAt = nowIso();
      changed = true;
    }

    if (
      seededDemoUserIds.has(user.id) &&
      user.organizationId &&
      !db.memberships.some((item) => item.userId === user.id && item.organizationId === user.organizationId)
    ) {
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

  if (SHOULD_SEED_DEMO_DATA && db.devices.length === 0) {
    const updatedAt = nowIso();
    db.devices.push(
      {
        id: "shcare-g3-hil",
        name: "Shcare ESP32-S3 hai mic",
        type: "stethoscope",
        status: "claimed",
        signal: -45,
        battery: 85,
        connected: true,
        organizationId: "org_default_clinic",
        lastSeenAt: updatedAt,
        updatedAt,
      },
      {
        id: "dev_workspace_demo_001",
        name: "Ống nghe Demo Workspace",
        type: "stethoscope",
        status: "available",
        signal: -52,
        battery: 92,
        connected: false,
        organizationId: "org_workspace_demo_hospital",
        lastSeenAt: updatedAt,
        updatedAt,
      }
    );
    changed = true;
  }

  if (SHOULD_SEED_DEMO_DATA && db.notifications.length === 0) {
    seedNotification("info", "Máy chủ đã sẵn sàng", "Ứng dụng đã kết nối với máy chủ Smart Health.", true);
    seedNotification("success", "Thiết bị khả dụng", "ESP32 đang gửi tín hiệu âm thanh qua UDP.", false);
    changed = true;
  }

  for (const user of db.users) {
    const passwordHash = normalizePasswordHash(
      user.passwordHash || user.password || "",
    );
    if (passwordHash && passwordHash !== user.password) {
      user.password = passwordHash;
      changed = true;
    }
    if (Object.prototype.hasOwnProperty.call(user, "passwordHash")) {
      delete user.passwordHash;
      changed = true;
    }
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

function getDemoDeviceId() {
  return db.devices.find((item) => item.type === "stethoscope" && !item.revokedAt)?.id || "";
}

function resolveIncomingDeviceId(payload = {}, socket = null) {
  const explicitDeviceId = readString(payload.deviceId || socket?._queryDeviceId, 120);
  if (explicitDeviceId) {
    return explicitDeviceId;
  }
  if (SHOULD_SEED_DEMO_DATA) {
    return getDemoDeviceId();
  }
  return "";
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

function sanitizePublicFirebaseClaims(value = {}) {
  const claims = value && typeof value === "object" && !Array.isArray(value) ? { ...value } : {};
  delete claims.twoFactorSecret;
  delete claims.twoFactorSecretPreview;
  delete claims.twoFactorRecoveryCodes;
  const profile =
    claims.profile && typeof claims.profile === "object" && !Array.isArray(claims.profile)
      ? { ...claims.profile }
      : {};
  delete profile.twoFactorSecret;
  delete profile.twoFactorSecretPreview;
  delete profile.twoFactorRecoveryCodes;
  claims.profile = profile;
  return claims;
}

function publicUser(user) {
  if (!user) return null;
  const {
    password,
    avatarStorage,
    twoFactorSecret,
    twoFactorSecretPreview,
    twoFactorRecoveryCodes,
    firebaseClaims,
    roleRequestDocuments,
    ...safeUser
  } = user;
  const organization = isPlatformAdminUser(user) ? null : getClinicById(user.organizationId);
  const workspaceContext = getUserWorkspaceContext(user);
  const surfaceInfo = getUserSurfaceInfo(user, workspaceContext);
  const isPlatformAdmin = isPlatformAdminUser(user);
  const workspace = isPlatformAdmin
    ? {
        id: "platform",
        name: "Quản trị toàn hệ thống",
        type: "platform",
        workspaceType: "platform",
        packageId: "",
        subscriptionStatus: "",
        billingCycle: "",
      }
    : workspaceContext.workspace;
  const workspaceType = isPlatformAdmin
    ? "platform"
    : user.workspaceType || workspace?.workspaceType || workspace?.type || organization?.workspaceType || organization?.type || "";
  const accountType =
    user.accountType ||
    (workspaceType === "solo_practice"
      ? "solo_doctor"
      : workspaceType === "personal"
        ? "personal"
        : user.requestedRole === "doctor"
          ? "doctor"
          : user.role || "");
  return {
    ...safeUser,
    // Authentication clients must never infer lifecycle defaults. Keep these
    // fields explicit even for older records that predate lifecycle storage.
    accountStatus: user.accountStatus || "active",
    deletedAt: user.deletedAt || null,
    roleRequestDocuments: (Array.isArray(roleRequestDocuments)
      ? roleRequestDocuments
      : []
    ).map(publicRoleRequestDocument),
    firebaseClaims: sanitizePublicFirebaseClaims(firebaseClaims),
    title: user.title || "",
    avatarFileId: user.avatarFileId || "",
    avatarUrl: user.avatarUrl || "",
    twoFactorEnabled: Boolean(user.twoFactorEnabled),
    twoFactorMethod: user.twoFactorMethod || "",
    notificationPreferences: normalizeNotificationPreferences(user.notificationPreferences),
    hospital: isPlatformAdmin ? "" : user.hospital || organization?.name || "",
    clinicName: isPlatformAdmin ? "" : user.hospital || organization?.name || "",
    specialty: user.specialty || user.department || "",
    roleInfoRequiredFields: normalizeRoleInfoFields(user.roleInfoRequiredFields),
    workspaceId: workspaceContext.currentWorkspaceId,
    currentWorkspaceId: workspaceContext.currentWorkspaceId,
    currentMembership: workspaceContext.currentMembership,
    memberships: workspaceContext.memberships,
    workspace,
    currentWorkspace: workspace,
    capabilities: workspaceContext.capabilities,
    allowedSurfaces: surfaceInfo.allowedSurfaces,
    defaultSurface: surfaceInfo.defaultSurface,
    workspaceType,
    accountType,
    clinicSuggestion: user.clinicSuggestion || "",
    scopeType: isPlatformAdmin ? "platform" : workspaceType,
    scopeLabel: isPlatformAdmin ? "Quản trị toàn hệ thống" : workspace?.name || "",
  };
}

function publicDoctorRoleRequest(user) {
  const roleRequestOrganizationId = readString(
    user.roleRequestOrganizationId || user.organizationId,
    120,
  );
  const organization = getClinicById(roleRequestOrganizationId);
  const workspaceType = user.workspaceType || organization?.workspaceType || organization?.type || "";
  return {
    ...publicUser(user),
    roleRequestOrganizationId,
    hospital: user.hospital || organization?.name || "",
    clinicName: user.hospital || organization?.name || "",
    specialty: user.department || "",
    registrationReason: user.registrationReason || "",
    workspaceType,
    accountType: user.accountType || (workspaceType === "solo_practice" ? "solo_doctor" : "doctor"),
    clinicSuggestion: user.clinicSuggestion || "",
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

function isDoctorRoleRequestTargetLocked(user) {
  return Boolean(
    user &&
    readString(user.requestedRole, 40).toLowerCase() === "doctor" &&
    ["pending", "needs_info", "rejected"].includes(
      readString(user.roleRequestStatus, 40).toLowerCase(),
    ),
  );
}

function isApprovedActiveDoctorPrincipal(user) {
  return Boolean(
    isActiveUserAccount(user) &&
    isApprovedDoctorRole(user) &&
    getUserMemberships(user).some((membership) => membership.role === "doctor" && membership.operational),
  );
}

function isApprovedWorkspaceRole(user) {
  const role = normalizeWorkspaceRole(user?.role || "");
  return (
    user &&
    ["workspace_owner", "workspace_admin", "nurse", "technician", "billing", "viewer"].includes(role) &&
    user.roleRequestStatus === "approved" &&
    user.role === role
  );
}

function normalizeLookup(value) {
  return readString(value, 240).toLowerCase();
}

function getClinicById(id) {
  const clinicId = readString(id, 120);
  if (!clinicId) return null;
  return db.organizations.find((item) => item.id === clinicId && !item.deletedAt) || null;
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

function isActiveWorkspaceMembershipRecord(membership) {
  return Boolean(
    membership &&
    readString(membership.status || "active", 40).toLowerCase() === "active",
  );
}

function isOperationalWorkspaceMembership(user, membership, workspace = null) {
  if (!user || !isActiveWorkspaceMembershipRecord(membership) || !isActiveUserAccount(user)) return false;
  const resolvedWorkspace = workspace || getClinicById(membership.organizationId);
  if (!resolvedWorkspace || readString(resolvedWorkspace.status || "active", 40).toLowerCase() !== "active") {
    return false;
  }
  const role = user.role === "admin"
    ? "platform_admin"
    : normalizeWorkspaceRole(membership.role || "viewer");
  if (role === "platform_admin") return true;
  const workspaceType = normalizeWorkspaceType(
    resolvedWorkspace.workspaceType || resolvedWorkspace.type,
    resolvedWorkspace.type === "hospital" ? "hospital" : "clinic",
  );
  if (role !== "patient" && workspaceType === "personal") return false;
  // A membership cannot silently change the identity's product persona. An
  // approved doctor may retain an old personal membership for history, but it
  // is not a valid active doctor/Portal context.
  if (role === "patient") return isPatientUser(user);
  if (role === "doctor") return isApprovedDoctorRole(user);
  return readString(user.roleRequestStatus, 40).toLowerCase() === "approved";
}

function getUserMemberships(user) {
  if (!user) return [];
  const memberships = db.memberships.filter((item) => item.userId === user.id);

  return memberships.map((membership) => {
    const workspace = getClinicById(membership.organizationId);
    const role = user.role === "admin" ? "platform_admin" : normalizeWorkspaceRole(membership.role || "viewer");
    const operational = isOperationalWorkspaceMembership(user, membership, workspace);
    const workspaceSummary = workspace && operational ? getWorkspaceOperationalSummary(workspace.id) : {};
    return {
      id: membership.id || "",
      workspaceId: membership.organizationId || "",
      organizationId: membership.organizationId || "",
      workspaceName: workspace?.name || "",
      workspaceType: workspace?.workspaceType || workspace?.type || "",
      role,
      legacyRole: membership.role || user.role || "",
      operational,
      status: readString(membership.status || "active", 40).toLowerCase() || "active",
      suspendedAt: membership.suspendedAt || "",
      workspaceStatus: workspace?.status || "",
      createdAt: membership.createdAt || "",
      updatedAt: membership.updatedAt || membership.createdAt || "",
      ...workspaceSummary,
    };
  });
}

function getCapabilitiesForRole(role) {
  const normalizedRole = normalizeWorkspaceRole(role);
  const common = ["notifications.view", "account.manage"];
  const workspaceRead = [
    "workspace.dashboard.view",
    "workspace.patients.view",
    "workspace.appointments.view",
    "workspace.devices.view",
    "workspace.scans.view",
  ];
  const workspaceManage = [
    "workspace.staff.manage",
    "workspace.patients.manage",
    "workspace.appointments.manage",
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
      "platform.appointments.view",
      "platform.appointments.manage",
      "platform.devices.view",
      "platform.devices.manage",
      "platform.scans.view",
      "platform.scans.manage",
      "platform.review.view",
      "platform.review.manage",
      "platform.alerts.view",
      "platform.alerts.manage",
      "platform.reports.view",
      "platform.packages.manage",
      "platform.storage.manage",
      "platform.audit.view",
      "platform.audit.export",
      "platform.exports.manage",
      "platform.settings.manage",
      "billing.manage",
      ...workspaceRead,
      ...workspaceManage,
    ];
  }

  if (normalizedRole === "workspace_owner" || normalizedRole === "workspace_admin") {
    return [
      ...common,
      ...workspaceRead,
      ...workspaceManage,
      "workspace.review.view",
      "workspace.review.manage",
      "workspace.alerts.view",
      "workspace.alerts.manage",
      "workspace.audit.export",
      "workspace.exports.manage",
      "billing.view",
    ];
  }

  if (normalizedRole === "doctor") {
    return [
      ...common,
      "workspace.dashboard.view",
      "workspace.patients.view",
      "workspace.patients.manage",
      "workspace.appointments.view",
      "workspace.appointments.manage",
      "workspace.devices.view",
      "workspace.scans.view",
      "workspace.scans.manage",
      "workspace.review.view",
      "workspace.review.manage",
      "workspace.alerts.view",
      "workspace.alerts.manage",
      "workspace.reports.view",
      "workspace.assigned_data.export",
    ];
  }

  if (normalizedRole === "nurse") {
    return [
      ...common,
      "workspace.dashboard.view",
      "workspace.patients.view",
      "workspace.appointments.view",
      "workspace.devices.view",
      "workspace.devices.manage",
      "workspace.scans.view",
      "workspace.scans.manage",
      "workspace.review.view",
      "workspace.alerts.view",
      "workspace.alerts.manage",
    ];
  }

  if (normalizedRole === "technician") {
    return [
      ...common,
      "workspace.dashboard.view",
      "workspace.patients.view",
      "workspace.appointments.view",
      "workspace.devices.view",
      "workspace.devices.manage",
      "workspace.scans.view",
      "workspace.scans.manage",
      "workspace.alerts.view",
      "workspace.alerts.manage",
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
      "personal.appointments.view",
      "personal.appointments.manage",
      "personal.devices.manage",
      "personal.scans.manage",
      "personal.sharing.manage",
      "personal.data.export",
    ];
  }

  return [...common, "workspace.dashboard.view", "workspace.reports.view"];
}

function getUserWorkspaceContext(user) {
  const memberships = getUserMemberships(user).filter(
    (membership) => Boolean(getClinicById(membership.workspaceId || membership.organizationId)),
  );
  const preferredMembership = memberships.find((membership) => membership.workspaceId === user?.organizationId) || null;
  const selectedMembership = preferredMembership?.operational
    ? preferredMembership
    : memberships.find((membership) => membership.operational) || null;
  const currentWorkspaceId = selectedMembership?.workspaceId || "";
  const currentMembership =
    memberships.find((membership) => membership.workspaceId === currentWorkspaceId) ||
    null;
  const workspace = getClinicById(currentWorkspaceId);
  const workspaceSummary = workspace ? getWorkspaceOperationalSummary(workspace.id) : {};
  const roleForCapabilities = user?.role === "admin"
    ? "platform_admin"
    : currentMembership?.operational
      ? currentMembership.role || ""
      : "";
  const capabilitySet = new Set(
    roleForCapabilities ? getCapabilitiesForRole(roleForCapabilities) : ["notifications.view", "account.manage"],
  );
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
          status: workspace.status || "active",
          address: workspace.address || "",
          phone: workspace.phone || "",
          email: workspace.email || "",
          website: workspace.website || "",
          legalName: workspace.legalName || "",
          representative: workspace.representative || "",
          packageId: workspace.packageId || "",
          subscriptionStatus: workspace.subscriptionStatus || "",
          billingCycle: workspace.billingCycle || "",
          ...workspaceSummary,
        }
      : null,
    capabilities,
  };
}

function getUserSurfaceInfo(user, context = getUserWorkspaceContext(user)) {
  if (!user) {
    return { allowedSurfaces: [], defaultSurface: "" };
  }

  const capabilities = context.capabilities || [];
  if (isPlatformAdminUser(user) || capabilities.some((capability) => capability.startsWith("platform."))) {
    return { allowedSurfaces: ["admin"], defaultSurface: "admin" };
  }

  if (isPatientUser(user)) {
    return { allowedSurfaces: ["android"], defaultSurface: "android" };
  }

  const role = context.currentMembership?.operational
    ? normalizeWorkspaceRole(context.currentMembership.role)
    : "";
  const hasWorkspaceSurface =
    ["workspace_owner", "workspace_admin", "doctor", "nurse", "technician", "billing", "viewer"].includes(role) ||
    capabilities.some((capability) => capability.startsWith("workspace."));

  if (hasWorkspaceSurface) {
    const allowedSurfaces = role === "doctor" ? ["portal", "android"] : ["portal"];
    return { allowedSurfaces, defaultSurface: "portal" };
  }

  return { allowedSurfaces: [], defaultSurface: "" };
}

function assertWorkspaceSelectionSurfaceCompatible(user, workspaceId) {
  if (isPlatformAdminUser(user)) return;
  const candidateUser = { ...user, organizationId: workspaceId };
  const candidateContext = getUserWorkspaceContext(candidateUser);
  if (
    candidateContext.currentWorkspaceId !== workspaceId ||
    !candidateContext.currentMembership?.operational
  ) {
    throw httpError(
      409,
      "Workspace is not compatible with this account role",
      "WORKSPACE_SURFACE_INCOMPATIBLE",
      { workspaceId },
    );
  }
  const candidateSurfaces = getUserSurfaceInfo(candidateUser, candidateContext).allowedSurfaces;
  const requiredSurface = isPatientUser(user)
    ? "android"
    : isApprovedDoctorRole(user) || isApprovedWorkspaceRole(user)
      ? "portal"
      : "";
  if (requiredSurface && !candidateSurfaces.includes(requiredSurface)) {
    throw httpError(
      409,
      "Workspace does not grant the surface required by this account",
      "WORKSPACE_SURFACE_INCOMPATIBLE",
      { workspaceId, requiredSurface },
    );
  }
}

function hasPortalSurfaceAccess(user) {
  return getUserSurfaceInfo(user).allowedSurfaces.includes("portal");
}

function requirePortalSurfaceUser(req) {
  const user = requireUser(req);
  if (!hasPortalSurfaceAccess(user)) {
    throw httpError(403, "Tài khoản không có quyền truy cập Shcare Web Portal", "PORTAL_ACCESS_DENIED");
  }
  return user;
}

function getCatalogClinicById(id) {
  const clinicId = readString(id, 120);
  if (!clinicId) return null;
  if (db.organizations.some((item) => item.id === clinicId && item.deletedAt)) return null;
  return getClinicById(clinicId) || DEFAULT_CLINIC_CATALOG.find((item) => item.id === clinicId) || null;
}

function getClinicFromPayload(payload) {
  if (Object.prototype.hasOwnProperty.call(payload, "organizationId")) {
    const requestedId = readString(payload.organizationId, 120);
    return requestedId ? getCatalogClinicById(requestedId) : null;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "clinicId")) {
    const requestedId = readString(payload.clinicId, 120);
    return requestedId ? getCatalogClinicById(requestedId) : null;
  }

  const legacyClinic = readString(payload.clinic, 120);
  if (legacyClinic) {
    const byId = getCatalogClinicById(legacyClinic);
    if (byId) return byId;
  }

  const requestedName = normalizeLookup(payload.hospital || payload.clinicName || payload.clinic);
  if (!requestedName) return null;
  return (
    db.organizations.find((item) => !item.deletedAt && normalizeLookup(item.name) === requestedName) ||
    DEFAULT_CLINIC_CATALOG.find((item) => normalizeLookup(item.name) === requestedName) ||
    null
  );
}

function getExplicitWorkspaceSelectionFromPayload(payload = {}) {
  if (
    !Object.prototype.hasOwnProperty.call(payload, "organizationId") &&
    !Object.prototype.hasOwnProperty.call(payload, "clinicId") &&
    !Object.prototype.hasOwnProperty.call(payload, "clinic")
  ) {
    return null;
  }
  const requestedId = readString(payload.organizationId || payload.clinicId || payload.clinic, 120);
  if (!requestedId) return null;
  return getCatalogClinicById(requestedId);
}

function hasExplicitWorkspaceSelection(payload = {}) {
  return ["organizationId", "clinicId", "clinic"].some((key) =>
    Object.prototype.hasOwnProperty.call(payload, key),
  );
}

function getRequestedWorkspaceId(payload = {}) {
  for (const key of ["organizationId", "clinicId", "clinic"]) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      return readString(payload[key], 120);
    }
  }
  return "";
}

function assertConsistentWorkspaceSelection(payload = {}) {
  const selections = ["organizationId", "clinicId", "clinic"]
    .filter((key) => Object.prototype.hasOwnProperty.call(payload, key))
    .map((key) => ({ key, value: readString(payload[key], 120) }));
  if (selections.length <= 1) return selections;
  const values = new Set(selections.map((selection) => selection.value));
  if (values.size !== 1 || values.has("")) {
    throw httpError(
      400,
      "Workspace selection aliases must identify the same non-empty workspace",
      "WORKSPACE_SELECTION_CONFLICT",
    );
  }
  return selections;
}

function hasWorkspaceMembership(user, organizationId) {
  const nextOrganizationId = readString(organizationId, 120);
  if (!user || !nextOrganizationId) return false;
  const membership = db.memberships.find(
    (membership) =>
      membership.userId === user.id && membership.organizationId === nextOrganizationId,
  );
  return isOperationalWorkspaceMembership(user, membership, getClinicById(nextOrganizationId));
}

function hasWorkspaceRelationship(user, organizationId) {
  const workspaceId = readString(organizationId, 120);
  if (!isActiveUserAccount(user) || !workspaceId) return false;
  const workspace = getClinicById(workspaceId);
  const membership = db.memberships.find(
    (item) => item.userId === user.id && item.organizationId === workspaceId,
  );
  return isOperationalWorkspaceMembership(user, membership, workspace);
}

function ensureOrganizationFromCatalog(clinic) {
  if (!clinic) return null;
  const existing = getClinicById(clinic.id);
  if (existing) return existing;
  if (db.organizations.some((item) => item.id === clinic.id && item.deletedAt)) {
    throw httpError(410, "Workspace đã được lưu trữ", "WORKSPACE_ARCHIVED");
  }
  const organization = {
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
  };
  db.organizations.push(organization);
  return organization;
}

function getPersonalWorkspaceCandidate(user) {
  const id = `org_personal_${String(user.id || user.firebaseUid || "user").replace(/[^a-zA-Z0-9_]/g, "_")}`;
  const workspace = db.organizations.find((item) => item.id === id);
  if (workspace?.deletedAt) throw httpError(410, "Workspace cá nhân đã được lưu trữ", "WORKSPACE_ARCHIVED");
  if (workspace) return workspace;
  const createdAt = nowIso();
  return {
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
}

function ensurePersonalWorkspaceForUser(user) {
  const candidate = getPersonalWorkspaceCandidate(user);
  const existing = db.organizations.find((item) => item.id === candidate.id);
  if (existing) return existing;
  db.organizations.unshift(candidate);
  return candidate;
}

function getSoloPracticeWorkspaceCandidate(user, payload = {}) {
  const id = `org_solo_${String(user.id || user.firebaseUid || "doctor").replace(/[^a-zA-Z0-9_]/g, "_")}`;
  const workspace = db.organizations.find((item) => item.id === id);
  if (workspace?.deletedAt) throw httpError(410, "Workspace phòng khám đã được lưu trữ", "WORKSPACE_ARCHIVED");
  const name =
    readString(payload.workspaceName || payload.clinicName || payload.hospital, 160) ||
    `Phòng khám cá nhân - ${user.name || user.email || user.id}`;
  if (!workspace) {
    const createdAt = nowIso();
    return {
      id,
      name,
      type: "clinic",
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
  }
  return {
    ...workspace,
    name: name || workspace.name,
    type: "clinic",
    workspaceType: "solo_practice",
    ownerUserId: workspace.ownerUserId || user.id,
    packageId: workspace.packageId || "pkg_solo_doctor",
    subscriptionStatus: workspace.subscriptionStatus || "trial",
    updatedAt: nowIso(),
  };
}

function ensureSoloPracticeWorkspaceForUser(user, payload = {}) {
  const candidate = getSoloPracticeWorkspaceCandidate(user, payload);
  const existing = db.organizations.find((item) => item.id === candidate.id);
  if (!existing) {
    db.organizations.unshift(candidate);
    return candidate;
  }
  Object.assign(existing, candidate);
  return existing;
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
    legalName: org.legalName || "",
    representative: org.representative || "",
    requestMetadata: org.requestMetadata && typeof org.requestMetadata === "object" ? org.requestMetadata : {},
    packageId: org.packageId || "",
    subscriptionStatus: org.subscriptionStatus || "trial",
    billingCycle: org.billingCycle || "monthly",
    ownerUserId: org.ownerUserId || "",
    version: Number.isInteger(Number(org.version)) && Number(org.version) > 0 ? Number(org.version) : 1,
    deletedAt: org.deletedAt || "",
    createdAt: org.createdAt || "",
    updatedAt: org.updatedAt || "",
  };
}

function isDoctorWorkspaceUser(user, organizationId) {
  if (!isActiveUserAccount(user) || !isApprovedDoctorRole(user)) return false;
  return db.memberships.some(
    (membership) =>
      membership.userId === user.id &&
      membership.organizationId === organizationId &&
      normalizeWorkspaceRole(membership.role) === "doctor" &&
      isActiveWorkspaceMembershipRecord(membership),
  );
}

function getWorkspaceLinkSummary(organizationId) {
  const workspace = getClinicById(organizationId);
  const users = db.users.filter((user) =>
    db.memberships.some(
      (membership) =>
        membership.userId === user.id &&
        membership.organizationId === organizationId &&
        isOperationalWorkspaceMembership(user, membership, workspace),
    ),
  );
  const doctors = users.filter((user) => isDoctorWorkspaceUser(user, organizationId));
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

function getWorkspaceOperationalSummary(organizationId) {
  const workspaceId = readString(organizationId, 120);
  const patients = db.patients.filter((patient) => patient.organizationId === workspaceId);
  const devices = db.devices.filter((device) => device.organizationId === workspaceId);
  const scans = db.scans.filter((scan) => getScanOrgId(scan) === workspaceId);
  const devicesOnline = devices.filter((device) => publicDevice(device).online).length;
  const alertsCount = devices.filter((device) => {
    const status = String(device.status || "").toLowerCase();
    return device.connected === false || status.includes("offline") || status.includes("error") || status.includes("fail");
  }).length;

  return {
    patientCount: patients.length,
    patientsCount: patients.length,
    deviceCount: devices.length,
    devicesCount: devices.length,
    deviceOnline: devicesOnline,
    devicesOnline,
    alertCount: alertsCount,
    alertsCount,
    scanCount: scans.length,
    scansCount: scans.length,
  };
}

function getWorkspaceUsage(organizationId) {
  const totalStorageBytes = db.storageFiles
    .filter((file) => file.organizationId === organizationId)
    .reduce((total, file) => total + Number(file.byteSize || file.sizeBytes || file.size || 0), 0);
  const linkSummary = getWorkspaceLinkSummary(organizationId);
  return {
    doctors: linkSummary.doctors,
    patients: linkSummary.patients,
    devices: linkSummary.devices,
    aiMonthly: db.aiResults.filter((result) => {
      const resultOrgId = result.organizationId || getScanOrgId(findScan(result.scanId));
      return resultOrgId === organizationId;
    }).length,
    storageGb: Math.round((totalStorageBytes / 1024 / 1024 / 1024) * 100) / 100,
    storageMetric: "total_storage",
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
  const operationalSummary = getWorkspaceOperationalSummary(org.id);
  return {
    ...clinic,
    usage: getWorkspaceUsage(org.id),
    quota: getPackageQuota(org.packageId),
    userCount: linkSummary.accounts,
    doctorCount: linkSummary.doctors,
    patientCount: linkSummary.patients,
    deviceCount: linkSummary.devices,
    ...operationalSummary,
  };
}

function getWorkspaceExpectedVersion(req, payload = {}, url = null) {
  const bodyVersion = Object.prototype.hasOwnProperty.call(payload, "expectedVersion")
    ? payload.expectedVersion
    : payload.version;
  if (bodyVersion !== undefined && bodyVersion !== null && bodyVersion !== "") return bodyVersion;
  const queryVersion = url?.searchParams?.get("version") || url?.searchParams?.get("expectedVersion");
  if (queryVersion) return queryVersion;
  const ifMatch = readString(req.headers["if-match"], 80).replace(/^W\//i, "").replace(/^"|"$/g, "");
  return ifMatch || undefined;
}

function requireWorkspaceLifecycleRepository() {
  if (!repositories?.workspaceLifecycle) {
    throw httpError(
      503,
      "Canonical workspace lifecycle repository is unavailable",
      "WORKSPACE_LIFECYCLE_REPOSITORY_UNAVAILABLE",
    );
  }
  return repositories.workspaceLifecycle;
}

function setWorkspacePaginationHeaders(res, pageResult) {
  const total = Number(pageResult.total || 0);
  const page = Number(pageResult.page || 1);
  const limit = Number(pageResult.limit || 25);
  const pageCount = total === 0 ? 0 : Math.ceil(total / limit);
  res.setHeader("X-Total-Count", String(total));
  res.setHeader("X-Pagination-Total", String(total));
  res.setHeader("X-Page", String(page));
  res.setHeader("X-Page-Limit", String(limit));
  res.setHeader("X-Page-Count", String(pageCount));
}

function resolveAdminListPage(items, url, options) {
  try {
    return paginateAdminList(items, url.searchParams, options);
  } catch (error) {
    throw httpError(400, error.message, error.code || "ADMIN_LIST_QUERY_INVALID", {
      field: error.field || "",
    });
  }
}

async function approveWorkspaceOwnerIdentity(req, actorUser, workspace, payload = {}) {
  if (!workspace || workspace.deletedAt) {
    throw httpError(404, "Không tìm thấy workspace", "WORKSPACE_NOT_FOUND");
  }
  if (normalizeWorkspaceType(workspace.workspaceType || workspace.type, "clinic") === "personal") {
    throw httpError(409, "Workspace cá nhân không dùng luồng phê duyệt owner", "PERSONAL_WORKSPACE_OWNER_IMMUTABLE");
  }
  const ownerUserId = readString(workspace.ownerUserId, 120);
  if (!ownerUserId) {
    throw httpError(409, "Workspace hoạt động phải có chủ sở hữu", "WORKSPACE_OWNER_REQUIRED");
  }
  const idempotencyKey = getRequiredIdempotencyKey(req, payload, "workspace owner approval");
  if (
    !repositories?.organizations?.beginOwnerTransfer ||
    !repositories?.organizations?.completeOwnerTransfer
  ) {
    throw httpError(503, "Kho dữ liệu phê duyệt workspace chưa sẵn sàng", "WORKSPACE_APPROVAL_UNAVAILABLE");
  }
  const requestContext = getRequestContext(req) || createRequestContext(req);
  const idempotency = {
    scope: getIdempotencyScope(actorUser, workspace.id),
    operation: "workspace.owner.approval",
    key: idempotencyKey,
    fingerprint: createIdempotencyFingerprint({
      organizationId: workspace.id,
      ownerUserId,
      target: "identity_ready",
    }),
  };
  const operationId = `workspace_owner_approval_${crypto
    .createHash("sha256")
    .update(`${idempotency.scope}:${idempotency.key}`)
    .digest("hex")
    .slice(0, 24)}`;
  const reservation = await repositories.organizations.beginOwnerTransfer({
    organizationId: workspace.id,
    newOwnerUserId: ownerUserId,
    actorUserId: actorUser.id,
    idempotency,
    ip: requestContext.ip || req.socket.remoteAddress || "",
    userAgent: requestContext.userAgent || readString(req.headers["user-agent"], 240),
  });
  let approval = reservation;
  let identitySaga = null;
  if (reservation.state !== "completed") {
    const canonicalOwner = reservation.replacementOwner;
    if (!canonicalOwner) {
      throw httpError(404, "Không tìm thấy tài khoản chủ workspace", "WORKSPACE_OWNER_NOT_FOUND");
    }
    if (reservation.requiresIdentityTransition) {
      const targetState = {
        role: "workspace_owner",
        requestedRole: "workspace_owner",
        roleRequestStatus: "approved",
        organizationId: workspace.id,
        accountStatus: "active",
        hospital: workspace.name || canonicalOwner.hospital || "Shcare",
      };
      identitySaga = await runIdentityProviderSaga(
        req,
        actorUser,
        canonicalOwner,
        "change_role",
        { role: "workspace_owner", organizationId: workspace.id },
        async () => {
          const providerResult = await setFirebaseRoleClaimsForUser(
            canonicalOwner,
            "workspace_owner",
            workspace.id,
          );
          return {
            ...providerResult,
            skipped: !canonicalOwner.firebaseUid,
            firebaseClaims: providerResult.claims,
          };
        },
        {
          targetState,
          protectLastPlatformAdmin: isPlatformAdminUser(canonicalOwner),
          deferBackendFinalization: true,
        },
      );
    }
    approval = await repositories.organizations.completeOwnerTransfer({
      organizationId: workspace.id,
      newOwnerUserId: ownerUserId,
      actorUserId: actorUser.id,
      identityOperationId: identitySaga?.completed.identityOperation.id || reservation.identityOperationId || "",
      idempotency,
      ip: requestContext.ip || req.socket.remoteAddress || "",
      userAgent: requestContext.userAgent || readString(req.headers["user-agent"], 240),
    });
  }
  const replayed = approval.replayed === true || reservation.state === "completed";
  return {
    workspace: approval.organization || reservation.organization || workspace,
    ownerApproval: {
      userId: ownerUserId,
      role: "workspace_owner",
      requestedRole: "workspace_owner",
      roleRequestStatus: "approved",
      identityOperationId: approval.identityOperationId || identitySaga?.completed.identityOperation.id || "",
    },
    operationId,
    idempotent: replayed,
    replayed,
  };
}

function publicServicePackage(servicePackage) {
  if (!servicePackage) return null;
  return {
    id: servicePackage.id,
    name: servicePackage.name || servicePackage.id,
    type: servicePackage.type || "",
    segment: servicePackage.segment || "",
    price: Number(servicePackage.price || 0),
    currency: servicePackage.currency || "VND",
    duration: servicePackage.duration || "monthly",
    maxDevices: Number(servicePackage.maxDevices || 0),
    maxDoctors: Number(servicePackage.maxDoctors || 0),
    maxPatients: Number(servicePackage.maxPatients || 0),
    storageGb: Number(servicePackage.storageGb || 0),
    aiMonthly: Number(servicePackage.aiMonthly || 0),
    retentionDays: Number(servicePackage.retentionDays || 0),
    features: servicePackage.features && typeof servicePackage.features === "object" ? servicePackage.features : {},
    status: servicePackage.status || "active",
    createdAt: servicePackage.createdAt || "",
    updatedAt: servicePackage.updatedAt || "",
  };
}

function getBillingUsageRows(usage, quota) {
  return [
    { key: "doctors", label: "Bác sĩ / nhân sự", used: Number(usage.doctors || 0), limit: Number(quota.maxDoctors || 0), unit: "người" },
    { key: "patients", label: "Bệnh nhân", used: Number(usage.patients || 0), limit: Number(quota.maxPatients || 0), unit: "hồ sơ" },
    { key: "devices", label: "Thiết bị", used: Number(usage.devices || 0), limit: Number(quota.maxDevices || 0), unit: "thiết bị" },
    { key: "aiMonthly", label: "Lượt AI tháng", used: Number(usage.aiMonthly || 0), limit: Number(quota.aiMonthly || 0), unit: "lượt" },
    { key: "storageGb", label: "Dung lượng lưu trữ", used: Number(usage.storageGb || 0), limit: Number(quota.storageGb || 0), unit: "GB" },
  ].map((row) => {
    const percent = row.limit > 0 ? Math.min(100, Math.round((row.used / row.limit) * 100)) : null;
    return {
      ...row,
      percent,
      status: percent === null ? "unlimited" : percent >= 100 ? "exceeded" : percent >= 80 ? "warning" : "ok",
    };
  });
}

function getWorkspaceBillingSubscription(workspace, servicePackage) {
  const subscriptions = Array.isArray(db.subscriptions) ? db.subscriptions : [];
  const existing =
    subscriptions.find((item) => item.organizationId === workspace.id && item.packageId === workspace.packageId && !item.canceledAt) ||
    subscriptions.find((item) => item.organizationId === workspace.id && !item.canceledAt) ||
    subscriptions.find((item) => item.organizationId === workspace.id) ||
    null;
  const status = existing?.status || workspace.subscriptionStatus || "trial";
  const billingCycle = existing?.billingCycle || workspace.billingCycle || servicePackage?.duration || "monthly";
  return {
    id: existing?.id || "",
    organizationId: workspace.id,
    packageId: existing?.packageId || workspace.packageId || servicePackage?.id || "",
    status,
    billingCycle,
    source: existing ? "subscription" : "workspace",
    startedAt: existing?.startedAt || workspace.createdAt || "",
    renewsAt: existing?.renewsAt || "",
    canceledAt: existing?.canceledAt || "",
    createdAt: existing?.createdAt || workspace.createdAt || "",
    updatedAt: existing?.updatedAt || workspace.updatedAt || "",
  };
}

function buildPortalBillingSummary(user) {
  const workspaceContext = getUserWorkspaceContext(user);
  const workspaceId = workspaceContext.currentWorkspaceId || user.organizationId || "";
  const workspace = getClinicById(workspaceId);
  if (!workspace) {
    throw httpError(404, "Không tìm thấy workspace hiện tại");
  }
  const servicePackage = db.servicePackages.find((item) => item.id === workspace.packageId) || null;
  const usage = getWorkspaceUsage(workspace.id);
  const quota = getPackageQuota(workspace.packageId);
  const publicPackage = publicServicePackage(servicePackage);
  return {
    generatedAt: nowIso(),
    workspace: publicWorkspace(workspace),
    package: publicPackage,
    subscription: getWorkspaceBillingSubscription(workspace, servicePackage),
    usage,
    quota,
    usageRows: getBillingUsageRows(usage, quota),
    currentCharge: publicPackage
      ? {
          packageId: publicPackage.id,
          amount: publicPackage.price,
          currency: publicPackage.currency,
          cycle: workspace.billingCycle || publicPackage.duration || "monthly",
          source: "service_package",
        }
      : null,
    billingContact: {
      name: workspace.representative || workspace.name || "",
      email: workspace.email || "",
      phone: workspace.phone || "",
      address: workspace.address || "",
    },
    invoicePolicy: {
      mode: "manual",
      providerConfigured: false,
      message: "Shcare đang ghi nhận gói dịch vụ và liên hệ thanh toán ở cấp workspace.",
    },
  };
}

function getActiveClinics() {
  const byId = new Map();
  const archivedIds = new Set(
    db.organizations.filter((item) => item.deletedAt).map((item) => item.id),
  );
  for (const org of db.organizations.filter((item) => !item.deletedAt && String(item.status || "active") === "active")) {
    byId.set(org.id, publicClinic(org));
  }
  for (const clinic of DEFAULT_CLINIC_CATALOG) {
    if (!archivedIds.has(clinic.id) && !byId.has(clinic.id)) {
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
    id: readString(detail.id, 160) || createId("log"),
    action,
    device: detail.device || "Ứng dụng Android",
    location: detail.location || "Mạng nội bộ",
    ip: detail.ip || "",
    userId: detail.userId || "",
    organizationId: detail.organizationId || "",
    operationId: readString(detail.operationId, 160),
    severity: detail.severity || "info",
    createdAt: detail.createdAt || nowIso(),
  };
  db.accessLogs.unshift(log);
  db.accessLogs = db.accessLogs.slice(0, 200);
  return log;
}

function sanitizeNotificationMetadata(metadata = {}) {
  const safe = {};
  const source = metadata && typeof metadata === "object" ? metadata : {};
  for (const [key, value] of Object.entries(source)) {
    const normalizedKey = readString(key, 80);
    if (!normalizedKey || /password|token|secret|api.?key|credential|private/i.test(normalizedKey)) {
      continue;
    }
    if (value === null || value === undefined) {
      continue;
    }
    if (typeof value === "string") {
      const cleaned = readString(value, 500);
      if (cleaned) safe[normalizedKey] = cleaned;
      continue;
    }
    if (Array.isArray(value)) {
      const cleaned = value
        .map((item) => readString(item, 120))
        .filter(Boolean)
        .slice(0, 20);
      if (cleaned.length > 0) safe[normalizedKey] = cleaned.join(", ");
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      safe[normalizedKey] = value;
      continue;
    }
    if (value instanceof Date) {
      safe[normalizedKey] = value.toISOString();
    }
  }
  return safe;
}

function applyRuntimeNotificationPreferenceStatuses(notification) {
  const userId = readString(notification?.userId, 120);
  if (!userId) return notification;
  const targetUser = db.users.find((candidate) => candidate.id === userId);
  const decision = targetUser
    ? resolveNotificationPreferenceDecision(
        targetUser.notificationPreferences,
        notification,
      )
    : {
        allowed: false,
        reasonCode: "NOTIFICATION_RECIPIENT_UNAVAILABLE",
      };
  if (decision.allowed) {
    if (!notification.inAppStatus) notification.inAppStatus = "ready";
    if (!notification.pushStatus) notification.pushStatus = "ready";
    return notification;
  }
  notification.inAppStatus = "skipped";
  notification.emailStatus = "skipped";
  notification.emailErrorMessage = decision.reasonCode;
  notification.pushStatus = "skipped";
  notification.pushErrorMessage = decision.reasonCode;
  return notification;
}

function createNotification(type, title, message, metadata = {}) {
  const notification = applyRuntimeNotificationPreferenceStatuses({
    id: createId("noti"),
    type,
    title,
    message,
    userId: readString(metadata.userId, 120),
    organizationId: readString(metadata.organizationId, 120),
    channel: readString(metadata.channel, 40) || "in_app",
    metadata: sanitizeNotificationMetadata(metadata),
    pushAttempts: [],
    read: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
  db.notifications.unshift(notification);
  db.notifications = db.notifications.slice(0, 200);
  if (notification.pushStatus !== "skipped") {
    queueNotificationPush(notification);
  }
  return notification;
}

async function createBackendNotification(input) {
  const createdAfter = Date.now() - 5000;
  const inputMetadata = sanitizeNotificationMetadata(input.metadata || input);
  const inputMetadataKey = JSON.stringify(stableJsonValue(inputMetadata));
  const duplicate = db.notifications.find((notification) => {
    const createdAt = new Date(notification.createdAt || 0).getTime();
    return (
      createdAt >= createdAfter &&
      notification.type === input.type &&
      notification.title === input.title &&
      notification.message === input.message &&
      readString(notification.userId, 120) === readString(input.userId, 120) &&
      readString(notification.organizationId, 120) === readString(input.organizationId, 120) &&
      JSON.stringify(stableJsonValue(notification.metadata || {})) === inputMetadataKey
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
    const preferenceDecision = await resolveCanonicalNotificationPreferenceDecision({
      ...input,
      metadata: inputMetadata,
    });
    const preferencePatch =
      input.userId && !preferenceDecision.allowed
        ? {
            inAppStatus: "skipped",
            emailStatus: "skipped",
            emailErrorMessage: preferenceDecision.reasonCode,
            pushStatus: "skipped",
            pushErrorMessage: preferenceDecision.reasonCode,
          }
        : {};
    const persisted =
      input.createOnce === true && repositories.notifications.createOnce
        ? await repositories.notifications.createOnce({
            ...input,
            ...preferencePatch,
            metadata: inputMetadata,
          })
        : {
            notification: await repositories.notifications.create({
              ...input,
              ...preferencePatch,
              metadata: inputMetadata,
            }),
            created: true,
          };
    const notification = persisted.notification;
    if (persisted.created && notification.pushStatus === "ready") {
      queueNotificationPush(notification);
    }
    return notification;
  }
  return createNotification(input.type, input.title, input.message, input);
}

async function appendAudit(action, req, detail = {}) {
  const context = getRequestContext(req) || createRequestContext(req);
  const actorUserId = detail.actorUserId || (context.actor ? context.actor.id : "");
  const log = {
    id: detail.id || "",
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
  log.id = log.id || createId("audit");
  log.createdAt = nowIso();
  db.auditLogs.unshift(log);
  return log;
}

async function saveDeviceRecord(device) {
  if (repositories) {
    await repositories.devices.save(device);
    return;
  }
  saveDb();
}

async function saveDeviceOtaLifecycleRecord(device, otaInput, options = {}) {
  const ota = sanitizeDeviceOtaLifecycle(otaInput);
  const otaStatus = normalizeDeviceOtaStatus(ota.status);
  if (!device?.id || !ota.id || !ota.commandId || !otaStatus) {
    throw httpError(
      500,
      "Canonical OTA lifecycle persistence is unavailable",
      "DEVICE_OTA_LIFECYCLE_INVALID",
    );
  }
  ota.status = otaStatus;
  if (repositories) {
    if (!repositories.devices?.saveOtaLifecycle) {
      throw httpError(
        503,
        "Durable OTA lifecycle persistence is unavailable",
        "DEVICE_OTA_REPOSITORY_UNAVAILABLE",
      );
    }
    const result = await repositories.devices.saveOtaLifecycle(device.id, ota, options);
    if (result?.device) Object.assign(device, result.device);
    return result;
  }
  device.ota = ota;
  device.otaStatus = otaStatus;
  device.updatedAt = ota.updatedAt || nowIso();
  await saveDb();
  return { device, command: options.command || null };
}

const ACTIVE_DEVICE_ROTATION_STATES = new Set([
  "initiated",
  "pending_device_ack",
  "confirming",
]);

function credentialRotationExpectation(device = {}) {
  const rotation = sanitizeDeviceCredentialRotation(device.credentialRotation);
  return {
    id: rotation.id || "",
    state: rotation.state || "",
    updatedAt: rotation.updatedAt || "",
  };
}

async function appendDeviceRotationAudit(action, device, rotation, metadata = {}) {
  const log = {
    action,
    actorUserId: rotation.requestedByUserId || "",
    organizationId: device.organizationId || "",
    resourceType: "device",
    resourceId: device.id,
    metadata: sanitizeAuditMetadata({
      protocolVersion: Number(rotation.protocolVersion || 1),
      rotationId: rotation.id,
      state: rotation.state,
      commandId: rotation.commandId || "",
      ...metadata,
    }),
  };
  if (repositories?.auditLogs?.append) return repositories.auditLogs.append(log);
  const item = { id: createId("audit"), ...log, createdAt: nowIso() };
  db.auditLogs.unshift(item);
  await saveDb();
  return item;
}

async function expireDeviceCredentialRotation(device, at = new Date()) {
  const rotation = sanitizeDeviceCredentialRotation(device?.credentialRotation);
  const expectedRotation = credentialRotationExpectation(device);
  const atMs = at instanceof Date ? at.getTime() : new Date(at).getTime();
  const expiresAtMs = Date.parse(rotation.expiresAt || "");
  if (
    !rotation.id ||
    !ACTIVE_DEVICE_ROTATION_STATES.has(rotation.state) ||
    !Number.isFinite(atMs) ||
    !Number.isFinite(expiresAtMs) ||
    atMs < expiresAtMs
  ) {
    return false;
  }
  const expiredAt = new Date(atMs).toISOString();
  rotation.state = "expired";
  rotation.expiredAt = expiredAt;
  rotation.updatedAt = expiredAt;
  rotation.failureCode = "ROTATION_EXPIRED";
  rotation.nextSecretHash = "";
  device.credentialRotation = rotation;
  device.updatedAt = expiredAt;
  const command = rotation.commandId
    ? await findDeviceCommand(device.id, rotation.commandId)
    : null;
  if (command && !["applied", "failed", "expired"].includes(command.state)) {
    transitionDeviceCommand(command, "expired", {
      at: expiredAt,
      code: "ROTATION_EXPIRED",
      detail: "Credential candidate was not confirmed by an authenticated reconnect before expiry",
    });
    device.lastCommand = publicDeviceCommand(command);
  }
  const expiryAuditInput = {
    action: "device.secret_rotation.expired",
    actorUserId: rotation.requestedByUserId || "",
    organizationId: device.organizationId || "",
    resourceType: "device",
    resourceId: device.id,
    metadata: {
      protocolVersion: Number(command?.protocolVersion || rotation.protocolVersion || 1),
      rotationId: rotation.id,
      commandId: rotation.commandId || "",
      state: rotation.state,
      oldCredentialRetained: true,
    },
  };
  if (repositories?.devices?.saveCredentialRotationWithAudit) {
    await repositories.devices.saveCredentialRotationWithAudit(
      device,
      expiryAuditInput,
      null,
      200,
      command,
      expectedRotation,
    );
  } else {
    if (command) await saveDeviceCommandRecord(command);
    await saveDeviceRecord(device);
    await appendDeviceRotationAudit("device.secret_rotation.expired", device, rotation, {
      oldCredentialRetained: true,
    });
  }
  await appendDeviceEvent(device.id, "credential_rotation.expired", {
    protocolVersion: Number(command?.protocolVersion || rotation.protocolVersion || 1),
    rotationId: rotation.id,
    commandId: rotation.commandId || "",
    state: rotation.state,
  });
  return true;
}

async function updateCredentialRotationFromCommand(deviceId, command) {
  if (!command || command.type !== "device.rotate_secret") return false;
  const device = repositories
    ? await repositories.devices.findById(deviceId)
    : findDevice(deviceId);
  const rotation = sanitizeDeviceCredentialRotation(device?.credentialRotation);
  if (!device || !rotation.id || rotation.commandId !== command.id) return false;
  if (!ACTIVE_DEVICE_ROTATION_STATES.has(rotation.state)) return false;
  const expectedRotation = credentialRotationExpectation(device);
  const updatedAt = command.updatedAt || nowIso();
  let action = "";
  if (["acknowledged", "applying"].includes(command.state)) {
    rotation.state = "confirming";
    rotation.acknowledgedAt = rotation.acknowledgedAt || command.acknowledgedAt || updatedAt;
    rotation.confirmingAt = rotation.confirmingAt || updatedAt;
    action = "device.secret_rotation.confirming";
  } else if (command.state === "failed") {
    rotation.state = "rolled_back";
    rotation.rolledBackAt = updatedAt;
    rotation.failureCode = command.code || "ROTATION_DEVICE_FAILED";
    rotation.nextSecretHash = "";
    action = "device.secret_rotation.rolled_back";
  } else if (command.state === "expired") {
    rotation.state = "expired";
    rotation.expiredAt = updatedAt;
    rotation.failureCode = command.code || "ROTATION_EXPIRED";
    rotation.nextSecretHash = "";
    action = "device.secret_rotation.expired";
  } else {
    return false;
  }
  rotation.updatedAt = updatedAt;
  device.credentialRotation = rotation;
  device.updatedAt = updatedAt;
  device.lastCommand = publicDeviceCommand(command);
  const auditInput = {
    action,
    actorUserId: rotation.requestedByUserId || "",
    organizationId: device.organizationId || "",
    resourceType: "device",
    resourceId: device.id,
    metadata: {
      protocolVersion: Number(command.protocolVersion || rotation.protocolVersion || 1),
      rotationId: rotation.id,
      commandId: rotation.commandId || "",
      state: rotation.state,
      oldCredentialRetained: ["rolled_back", "expired"].includes(rotation.state),
      code: rotation.failureCode || command.code || "",
    },
  };
  if (repositories?.devices?.saveCredentialRotationWithAudit) {
    await repositories.devices.saveCredentialRotationWithAudit(
      device,
      auditInput,
      null,
      200,
      command,
      expectedRotation,
    );
  } else {
    await saveDeviceCommandRecord(command);
    await saveDeviceRecord(device);
    await appendDeviceRotationAudit(action, device, rotation, auditInput.metadata);
  }
  return true;
}

async function confirmDeviceCredentialRotation(device, authResult) {
  const rotation = sanitizeDeviceCredentialRotation(device?.credentialRotation);
  const expectedRotation = credentialRotationExpectation(device);
  if (
    !rotation.id ||
    rotation.id !== authResult.rotationId ||
    !ACTIVE_DEVICE_ROTATION_STATES.has(rotation.state) ||
    !rotation.nextSecretHash
  ) {
    throw httpError(409, "Credential rotation is no longer active", "DEVICE_SECRET_ROTATION_NOT_ACTIVE");
  }
  const expiresAtMs = Date.parse(rotation.expiresAt || "");
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
    await expireDeviceCredentialRotation(device);
    throw httpError(410, "Credential rotation expired before reconnect confirmation", "DEVICE_SECRET_ROTATION_EXPIRED");
  }
  const confirmedAt = nowIso();
  device.secretHash = rotation.nextSecretHash;
  rotation.state = "confirmed";
  rotation.confirmedAt = confirmedAt;
  rotation.confirmedSessionId = authResult.sessionId;
  rotation.updatedAt = confirmedAt;
  rotation.nextSecretHash = "";
  device.credentialRotation = rotation;
  device.updatedAt = confirmedAt;
  const command = rotation.commandId
    ? await findDeviceCommand(device.id, rotation.commandId)
    : null;
  if (command && !["applied", "failed", "expired"].includes(command.state)) {
    transitionDeviceCommand(command, "applied", {
      at: confirmedAt,
      code: "ROTATION_RECONNECT_CONFIRMED",
      detail: "Device authenticated a new session with the candidate credential",
    });
    device.lastCommand = publicDeviceCommand(command);
  }
  const confirmationAuditInput = {
    action: "device.secret_rotation.confirmed",
    actorUserId: rotation.requestedByUserId || "",
    organizationId: device.organizationId || "",
    resourceType: "device",
    resourceId: device.id,
    metadata: {
      protocolVersion: Number(command?.protocolVersion || rotation.protocolVersion || 1),
      rotationId: rotation.id,
      commandId: rotation.commandId || "",
      state: rotation.state,
      confirmedByAuthenticatedReconnect: true,
    },
  };
  if (repositories?.devices?.saveCredentialRotationWithAudit) {
    await repositories.devices.saveCredentialRotationWithAudit(
      device,
      confirmationAuditInput,
      null,
      200,
      command,
      expectedRotation,
    );
  } else {
    if (command) await saveDeviceCommandRecord(command);
    await saveDeviceRecord(device);
    await appendDeviceRotationAudit(
      "device.secret_rotation.confirmed",
      device,
      rotation,
      { confirmedByAuthenticatedReconnect: true },
    );
  }
  await appendDeviceEvent(device.id, "credential_rotation.confirmed", {
    protocolVersion: Number(command?.protocolVersion || rotation.protocolVersion || 1),
    rotationId: rotation.id,
    commandId: rotation.commandId || "",
    state: rotation.state,
  });
  return rotation;
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
    if (repositories.audioProcessing?.save) {
      await repositories.audioProcessing.save({
        scan,
        audioFile,
        aiResult,
        processingGeneration: scan.processingGeneration,
        processingRunId: scan.processingRunId,
      });
      return;
    }
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

async function buildAudioArtifactFingerprint(filePath) {
  const hash = crypto.createHash("sha256");
  const stream = fs.createReadStream(filePath);
  try {
    for await (const chunk of stream) {
      hash.update(chunk);
    }
    return hash.digest("hex");
  } finally {
    stream.destroy();
  }
}

function buildAudioProcessingRunId(scan, artifactFingerprint) {
  const hash = crypto.createHash("sha256");
  for (const part of [
    scan.id,
    scan.sampleRate || SAMPLE_RATE,
    artifactFingerprint || scan.processingArtifactFingerprint || "",
    getAudioProcessingGeneration(scan, 1),
    getAudioProcessingIntent(scan, "initial"),
    SIGNAL_QUALITY_ANALYZER_VERSION,
  ]) {
    hash.update(String(part ?? ""), "utf8");
    hash.update("\0", "utf8");
  }
  return `run_v1_${hash.digest("hex").slice(0, 40)}`;
}

function deterministicAudioProcessingId(prefix, ...parts) {
  const hash = crypto.createHash("sha256");
  for (const part of parts) {
    hash.update(String(part ?? ""), "utf8");
    hash.update("\0", "utf8");
  }
  return `${prefix}_${hash.digest("hex").slice(0, 40)}`;
}

function getAudioProcessingGeneration(scan, fallback = 1) {
  const candidate = Number(scan?.processingGeneration);
  if (Number.isSafeInteger(candidate) && candidate >= 1) {
    return candidate;
  }
  const persistedTimestamp = Date.parse(
    readString(scan?.processingStartedAt || scan?.updatedAt || scan?.endedAt, 80),
  );
  if (Number.isSafeInteger(persistedTimestamp) && persistedTimestamp >= 1) {
    return persistedTimestamp;
  }
  return fallback;
}

function getAudioProcessingIntent(scan, fallback = "initial") {
  const intent = readString(scan?.processingIntent, 80);
  if (intent) return intent;
  if (
    scan?.aiResultId &&
    ["processing", "queued"].includes(scan.status || scan.processingStatus)
  ) {
    return "reprocess";
  }
  return fallback;
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

function parseScanWaveformArtifact(buffer, scan) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > MAX_SCAN_WAVEFORM_BYTES) {
    throw httpError(
      502,
      "Dữ liệu dạng sóng không hợp lệ",
      "SCAN_WAVEFORM_ARTIFACT_INVALID",
    );
  }
  let raw;
  try {
    raw = JSON.parse(buffer.toString("utf8"));
  } catch {
    throw httpError(
      502,
      "Dữ liệu dạng sóng không hợp lệ",
      "SCAN_WAVEFORM_ARTIFACT_INVALID",
    );
  }
  const scanId = readString(raw?.scanId, 120);
  const sampleRate = Number(raw?.sampleRate);
  const points = Array.isArray(raw?.points) ? raw.points : [];
  const generatedAt = readString(raw?.generatedAt, 80);
  if (
    !scanId ||
    scanId !== scan.id ||
    !Number.isSafeInteger(sampleRate) ||
    sampleRate < 1 ||
    sampleRate > 192000 ||
    points.length < 1 ||
    points.length > MAX_SCAN_WAVEFORM_POINTS ||
    points.some((point) => !Number.isFinite(point) || point < 0 || point > 1) ||
    !generatedAt ||
    !Number.isFinite(Date.parse(generatedAt))
  ) {
    throw httpError(
      502,
      "Dữ liệu dạng sóng không hợp lệ",
      "SCAN_WAVEFORM_ARTIFACT_INVALID",
    );
  }
  return {
    scanId,
    sampleRate,
    points: points.map((point) => Number(point)),
    generatedAt: new Date(generatedAt).toISOString(),
  };
}

async function enqueueAudioProcessing(scan, wavFilePath, processing = {}) {
  if (!audioQueue?.enabled) {
    return false;
  }
  const processingGeneration =
    processing.processingGeneration ?? getAudioProcessingGeneration(scan, 1);
  const processingIntent = readString(
    processing.processingIntent ?? scan.processingIntent,
    80,
  ) || "initial";
  const artifactFingerprint =
    readString(
      processing.artifactFingerprint ?? scan.processingArtifactFingerprint,
      512,
    ) || (await buildAudioArtifactFingerprint(wavFilePath));
  if (
    scan.processingGeneration !== processingGeneration ||
    scan.processingIntent !== processingIntent ||
    scan.processingArtifactFingerprint !== artifactFingerprint
  ) {
    Object.assign(scan, {
      processingGeneration,
      processingIntent,
      processingArtifactFingerprint: artifactFingerprint,
      updatedAt: nowIso(),
    });
    await saveScanRecord(scan);
  }
  return audioQueue.enqueue({
    scanId: scan.id,
    patientId: scan.patientId,
    organizationId: getScanOrgId(scan),
    wavFilePath,
    sampleRate: scan.sampleRate || SAMPLE_RATE,
    processingGeneration,
    processingIntent,
    artifactFingerprint,
  });
}

async function queueAudioProcessingIfAvailable(scan, wavFilePath, processing = {}) {
  try {
    return await enqueueAudioProcessing(scan, wavFilePath, processing);
  } catch (error) {
    console.warn(`Audio queue unavailable for scan ${scan.id}: ${error.message}`);
    return false;
  }
}

async function handleDeviceTelemetry(deviceId, payload = {}) {
  if (containsSensitiveDeviceCredential(payload)) {
    throw httpError(400, "Device telemetry contains a forbidden credential field");
  }
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
  if (device.revokedAt || device.status === "revoked") {
    await appendDeviceEvent(device.id, "telemetry_rejected", { reason: "revoked" });
    return;
  }
  device.connected = true;
  device.status = "connected";
  device.signal = readOptionalNumber(payload.signal ?? payload.rssi) ?? device.signal;
  device.wifiRssi = readOptionalNumber(payload.wifiRssi ?? payload.rssi) ?? device.wifiRssi;
  device.battery = readOptionalNumber(payload.battery) ?? device.battery;
  device.connectionMethod = payload.connectionMethod || device.connectionMethod || "MQTT";
  const reportedFirmwareVersion = readString(payload.firmwareVersion || payload.firmware, 80);
  const reportedOtaBootOutcome = readString(payload.otaBootOutcome, 40);
  device.firmwareVersion = reportedFirmwareVersion || device.firmwareVersion;
  device.ipAddress = readString(payload.ipAddress || payload.ip, 80) || device.ipAddress;
  device.wifiSsid = readString(payload.wifiSsid, 120) || device.wifiSsid;
  device.audioStatus = readString(payload.audioStatus, 80) || device.audioStatus || "ready";
  device.backendHost = readString(payload.backendHost, 160) || device.backendHost;
  device.backendPort = readOptionalNumber(payload.backendPort) ?? device.backendPort;
  device.lastSeenAt = nowIso();
  device.updatedAt = nowIso();
  const incomingTelemetry = sanitizeDeviceTelemetry(payload);
  const previousTelemetry = sanitizeDeviceTelemetry(device.telemetry);
  if (Object.keys(incomingTelemetry).length > 0) {
    device.telemetry = {
      ...previousTelemetry,
      ...incomingTelemetry,
    };
  } else if (Object.keys(previousTelemetry).length > 0) {
    device.telemetry = previousTelemetry;
  }
  let confirmedOta = null;
  const storedOtaCommand = device.ota?.commandId
    ? await findDeviceCommand(device.id, device.ota.commandId)
    : null;
  // Delivery and execution have separate durable deadlines. Refresh every
  // nonterminal state so a reconnect cannot confirm an OTA after the bounded
  // execution window has elapsed.
  const otaCommand = await refreshDeviceCommandExpiry(storedOtaCommand);
  const authenticatedSocket = getAuthenticatedDeviceSocket(device);
  const authenticatedSessionId = readString(authenticatedSocket?._deviceAuth?.sessionId, 128);
  const otaTelemetryEvidenceValid = Boolean(
    reportedFirmwareVersion &&
    device.ota &&
    device.ota.firmwareVersion === reportedFirmwareVersion &&
    authenticatedSessionId &&
    device.ota.requestedSessionId &&
    authenticatedSessionId !== device.ota.requestedSessionId &&
    reportedOtaBootOutcome === "confirmed"
  );
  if (otaTelemetryEvidenceValid && otaCommand) {
    reconcileOtaCommandFromOperationalEvent(otaCommand, "confirmed", device.updatedAt);
  }
  if (
    otaTelemetryEvidenceValid &&
    device.ota.status !== "confirmed" &&
    otaCommand &&
    ["acknowledged", "applying", "applied"].includes(otaCommand.state)
  ) {
    const transition = transitionDeviceOtaLifecycle(device.ota, "confirmed", {
      allowConfirmed: true,
      at: device.updatedAt,
      metadata: {
        firmwareVersion: reportedFirmwareVersion,
        detail: "Device reported boot-health confirmation after rollback cancellation",
      },
    });
    if (transition.changed && transition.ota.status === "confirmed") {
      device.ota = transition.ota;
      device.otaStatus = transition.ota.status;
      confirmedOta = {
        protocolVersion: Number(otaCommand.protocolVersion || device.ota.protocolVersion || 1),
        otaId: device.ota.id,
        commandId: device.ota.commandId || device.ota.id,
        correlationId: device.ota.correlationId || "",
        firmwareVersion: reportedFirmwareVersion,
        otaBootOutcome: reportedOtaBootOutcome,
        confirmedAt: device.ota.confirmedAt,
      };
      if (["acknowledged", "applying"].includes(otaCommand.state)) {
        transitionDeviceCommand(otaCommand, "applied", {
          at: device.updatedAt,
          code: "OTA_BOOT_HEALTH_CONFIRMED",
          detail: "Device reconnected and reported confirmed boot health for the requested firmware",
        });
        device.lastCommand = publicDeviceCommand(otaCommand);
      }
      await saveDeviceOtaLifecycleRecord(device, device.ota, {
        allowConfirmed: true,
        expectedOtaId: device.ota.id,
        command: otaCommand,
      });
      device.lastCommand = publicDeviceCommand(otaCommand);
      await syncDeviceLastCommand(otaCommand);
    }
  }
  await saveDeviceRecord(device);
  await appendDeviceEvent(device.id, "telemetry", payload);
  if (confirmedOta) {
    await appendDeviceEvent(device.id, "ota.confirmed", confirmedOta);
  }
}

const DEVICE_OTA_EVENT_STATUS_MAP = new Map([
  ["ota.downloading", new Set(["downloading"])],
  ["ota.verifying", new Set(["verifying"])],
  ["ota.rebooting", new Set(["rebooting"])],
  ["ota.rollback", new Set(["rolling_back", "rolled_back"])],
  ["ota.confirmed", new Set(["confirmed"])],
  ["ota.failed", new Set(["failed"])],
]);

function reconcileOtaCommandFromOperationalEvent(command, nextStatus, at) {
  if (!command) return false;
  let changed = false;
  if (["downloading", "verifying", "rebooting", "rolling_back", "confirmed"].includes(nextStatus)) {
    if (["accepted", "queued"].includes(command.state)) {
      changed = transitionDeviceCommand(command, "delivered", {
        at,
        code: "OTA_EVENT_DELIVERY_CONFIRMED",
        detail: "Authenticated correlated OTA progress proved command delivery",
        delivery: { websocket: true, mqtt: false, delivered: true },
      }).changed || changed;
    }
    if (command.state === "delivered") {
      changed = transitionDeviceCommand(command, "acknowledged", {
        at,
        code: "OTA_EVENT_ACKNOWLEDGED",
        detail: "Authenticated correlated OTA progress proved command acknowledgement",
      }).changed || changed;
    }
    if (command.state === "acknowledged") {
      changed = transitionDeviceCommand(command, "applying", {
        at,
        code: "OTA_EVENT_APPLYING",
        detail: "Authenticated correlated OTA progress proved command execution",
      }).changed || changed;
    }
  }
  return changed;
}

async function handleAudioFailureEvent(deviceId, device, payload = {}) {
  const recording = getActiveRecordingForDevice(deviceId);
  const authenticatedSessionId = readString(
    deviceSockets.get(deviceId)?._deviceAuth?.sessionId,
    128,
  );
  const reportedScanId = readString(payload.scanId, 120);
  const reportedSessionId = readString(payload.sessionId || payload.audioSessionId, 128);
  const bindingMatches = Boolean(
    recording &&
    authenticatedSessionId &&
    recording.deviceSessionId === authenticatedSessionId &&
    (!reportedScanId || reportedScanId === recording.scanId) &&
    (!reportedSessionId || reportedSessionId === recording.sessionId)
  );
  if (!bindingMatches) {
    await appendDeviceEvent(deviceId, "audio.failed_rejected", {
      protocolVersion: Number(payload.protocolVersion || 0),
      scanId: reportedScanId,
      sessionId: reportedSessionId,
      code: recording ? "AUDIO_SESSION_BINDING_MISMATCH" : "AUDIO_SESSION_NOT_ACTIVE",
    });
    return {
      accepted: false,
      code: recording ? "AUDIO_SESSION_BINDING_MISMATCH" : "AUDIO_SESSION_NOT_ACTIVE",
    };
  }

  const failureCode = readString(payload.code || payload.failureCode, 80) || "AUDIO_CAPTURE_FAILED";
  const detail = readString(payload.detail, 500) || "device audio capture failed";
  const scan = await interruptRecording(
    recording,
    `The audio session was interrupted because the device reported ${failureCode}: ${detail}.`,
  );
  if (device) {
    device.audioStatus = "failed";
    device.lastSeenAt = nowIso();
    device.updatedAt = device.lastSeenAt;
    await saveDeviceRecord(device);
  }
  await appendDeviceEvent(deviceId, "audio.failed", {
    protocolVersion: Number(payload.protocolVersion || 0),
    scanId: recording.scanId,
    sessionId: recording.sessionId,
    code: failureCode,
    detail,
    terminalScanStatus: scan?.status || "interrupted",
  });
  return { accepted: true, code: "AUDIO_FAILURE_TERMINALIZED" };
}

async function handleDeviceEvent(deviceId, payload = {}) {
  if (containsSensitiveDeviceCredential(payload)) {
    throw httpError(400, "Device event contains a forbidden credential field");
  }
  const eventType = readString(payload.type || payload.eventType, 120) || "event";
  let device = repositories ? await repositories.devices.findById(deviceId) : db.devices.find((item) => item.id === deviceId);
  if (device && (device.revokedAt || device.status === "revoked")) {
    await appendDeviceEvent(device.id, "event_rejected", { reason: "revoked", eventType });
    return { accepted: false, code: "DEVICE_REVOKED" };
  }
  if (eventType === "command.status") {
    const accepted = await handleDeviceCommandStatus(deviceId, payload);
    return { accepted, code: accepted ? "COMMAND_STATUS_ACCEPTED" : "COMMAND_STATUS_REJECTED" };
  }
  if (eventType === "audio.failed") {
    return handleAudioFailureEvent(deviceId, device, payload);
  }
  let accepted = !eventType.startsWith("ota.");
  let resultCode = accepted ? "EVENT_RECORDED" : "DEVICE_OTA_STATUS_INVALID";
  if (device) {
    if (eventType.startsWith("ota.")) {
      const activeOta = sanitizeDeviceOtaLifecycle(device.ota);
      const reportedCommandId = readString(payload.commandId, 128);
      const reportedCorrelationId = readString(payload.correlationId, 128);
      const reportedOtaId = readString(payload.otaId, 128);
      const bindingMatches = Boolean(
        activeOta.id &&
        activeOta.commandId &&
        reportedCommandId === activeOta.commandId &&
        activeOta.correlationId &&
        reportedCorrelationId === activeOta.correlationId &&
        reportedOtaId === activeOta.id,
      );
      const nextStatus = normalizeDeviceOtaStatus(payload.otaStatus, eventType);
      const allowedEventStatuses = DEVICE_OTA_EVENT_STATUS_MAP.get(eventType);
      let otaCommand = bindingMatches && activeOta.commandId
        ? await findDeviceCommand(device.id, activeOta.commandId)
        : null;
      let rejectionCode = "";
      if (!bindingMatches) rejectionCode = "DEVICE_OTA_EVENT_BINDING_MISMATCH";
      else if (!nextStatus) rejectionCode = "DEVICE_OTA_STATUS_INVALID";
      else if (!allowedEventStatuses || !allowedEventStatuses.has(nextStatus)) {
        rejectionCode = "DEVICE_OTA_EVENT_STATUS_MISMATCH";
      } else if (!otaCommand) {
        rejectionCode = "DEVICE_OTA_COMMAND_MISSING";
      } else {
        otaCommand = await refreshDeviceCommandExpiry(otaCommand);
        if (otaCommand?.state === "expired") {
          rejectionCode = "DEVICE_OTA_EXECUTION_EXPIRED";
          const refreshedDevice = repositories?.devices?.findById
            ? await repositories.devices.findById(device.id)
            : findDevice(device.id);
          if (refreshedDevice) Object.assign(device, refreshedDevice);
        }
      }
      if (!rejectionCode && nextStatus === "confirmed") {
        const reportedFirmwareVersion = readString(payload.firmwareVersion, 80);
        const reportedBootOutcome = readString(payload.otaBootOutcome, 40);
        const authenticatedSessionId = readString(
          getAuthenticatedDeviceSocket(device)?._deviceAuth?.sessionId,
          128,
        );
        const confirmationEvidenceValid = Boolean(
          reportedFirmwareVersion &&
          reportedFirmwareVersion === activeOta.firmwareVersion &&
          reportedBootOutcome === "confirmed" &&
          authenticatedSessionId &&
          activeOta.requestedSessionId &&
          authenticatedSessionId !== activeOta.requestedSessionId
        );
        if (confirmationEvidenceValid) {
          reconcileOtaCommandFromOperationalEvent(otaCommand, "confirmed", nowIso());
        }
        const confirmationAuthorized = Boolean(
          confirmationEvidenceValid &&
          otaCommand &&
          ["acknowledged", "applying", "applied"].includes(otaCommand.state),
        );
        if (!confirmationAuthorized) {
          rejectionCode = "DEVICE_OTA_BOOT_HEALTH_PROOF_REQUIRED";
        } else {
          const transition = transitionDeviceOtaLifecycle(activeOta, "confirmed", {
            allowConfirmed: true,
            at: nowIso(),
            eventType,
            metadata: {
              firmwareVersion: reportedFirmwareVersion,
              detail: "Device reported confirmed boot health after rollback cancellation",
            },
          });
          if (transition.changed || activeOta.status === "confirmed") {
            device.ota = transition.ota;
            device.otaStatus = transition.ota.status;
            device.firmwareVersion = reportedFirmwareVersion;
            if (["acknowledged", "applying"].includes(otaCommand.state)) {
              transitionDeviceCommand(otaCommand, "applied", {
                at: device.ota.updatedAt,
                code: "OTA_BOOT_HEALTH_CONFIRMED",
                detail: "Firmware boot health was confirmed on the authenticated reconnect",
              });
            }
            await saveDeviceOtaLifecycleRecord(device, device.ota, {
              allowConfirmed: true,
              expectedOtaId: activeOta.id,
              command: otaCommand,
            });
            device.lastCommand = publicDeviceCommand(otaCommand);
            await syncDeviceLastCommand(otaCommand);
            accepted = true;
            resultCode = "DEVICE_OTA_BOOT_HEALTH_ACCEPTED";
          }
        }
      }
      if (rejectionCode) {
        accepted = false;
        resultCode = rejectionCode;
        await appendDeviceEvent(deviceId, "ota.status_rejected", {
          protocolVersion: Number(payload.protocolVersion || activeOta.protocolVersion || 1),
          eventType,
          commandId: reportedCommandId,
          correlationId: reportedCorrelationId,
          otaId: reportedOtaId,
          reportedStatus: nextStatus || readString(payload.otaStatus, 80),
          code: rejectionCode,
        });
      } else {
        const statusAt = nowIso();
        const otaCommandChanged = reconcileOtaCommandFromOperationalEvent(
          otaCommand,
          nextStatus,
          statusAt,
        );
        const transition = nextStatus === "confirmed"
          ? { ota: device.ota, changed: false }
          : transitionDeviceOtaLifecycle(activeOta, nextStatus, {
          at: statusAt,
          eventType,
          metadata: {
            detail: readString(payload.detail, 500),
            failureCode: nextStatus === "failed"
              ? readString(payload.code || payload.failureCode, 80)
              : "",
          },
          });
        if (transition.changed) {
          device.ota = transition.ota;
          device.otaStatus = transition.ota.status;
          if (
            otaCommand &&
            ["failed", "rolled_back", "expired"].includes(nextStatus) &&
            !["applied", "failed", "expired"].includes(otaCommand.state)
          ) {
            transitionDeviceCommand(
              otaCommand,
              nextStatus === "expired" ? "expired" : "failed",
              {
                at: device.ota.updatedAt,
                code: nextStatus === "rolled_back" ? "OTA_ROLLED_BACK" :
                  nextStatus === "expired" ? "OTA_EXPIRED" :
                    readString(payload.code || payload.failureCode, 80) || "OTA_FAILED",
                detail: readString(payload.detail, 240) || `OTA ${nextStatus}`,
              },
            );
          }
          await saveDeviceOtaLifecycleRecord(device, device.ota, {
            expectedOtaId: activeOta.id,
            command: otaCommand,
          });
          if (otaCommand) {
            device.lastCommand = publicDeviceCommand(otaCommand);
            await syncDeviceLastCommand(otaCommand);
          }
          accepted = true;
          resultCode = "DEVICE_OTA_STATUS_ACCEPTED";
        } else if (normalizeDeviceOtaStatus(activeOta.status) === nextStatus) {
          if (otaCommandChanged) {
            await saveDeviceOtaLifecycleRecord(device, activeOta, {
              expectedOtaId: activeOta.id,
              command: otaCommand,
            });
            device.lastCommand = publicDeviceCommand(otaCommand);
            await syncDeviceLastCommand(otaCommand);
          }
          accepted = true;
          resultCode = "DEVICE_OTA_STATUS_REPLAYED";
        } else if (nextStatus !== "confirmed") {
          accepted = false;
          resultCode = "DEVICE_OTA_TRANSITION_REJECTED";
          await appendDeviceEvent(deviceId, "ota.status_rejected", {
            protocolVersion: Number(payload.protocolVersion || activeOta.protocolVersion || 1),
            eventType,
            commandId: reportedCommandId,
            correlationId: reportedCorrelationId,
            otaId: reportedOtaId,
            reportedStatus: nextStatus,
            code: resultCode,
          });
        }
      }
    }
    if (payload.audioStatus) {
      device.audioStatus = readString(payload.audioStatus, 80);
    }
    device.lastSeenAt = nowIso();
    device.updatedAt = nowIso();
    await saveDeviceRecord(device);
  }
  await appendDeviceEvent(deviceId, eventType, payload);
  return { accepted, code: resultCode };
}

async function waitForDeviceAuthenticationFenceTestGate(deviceId) {
  if (
    process.env.NODE_ENV !== "test" ||
    readString(process.env.DEVICE_AUTH_FENCE_TEST_DEVICE_ID, 120) !== deviceId
  ) {
    return;
  }
  const readyPath = readString(process.env.DEVICE_AUTH_FENCE_TEST_READY_FILE, 1000);
  const releasePath = readString(process.env.DEVICE_AUTH_FENCE_TEST_RELEASE_FILE, 1000);
  if (!readyPath || !releasePath) return;
  fs.writeFileSync(readyPath, "ready", "utf8");
  const deadline = Date.now() + 5_000;
  while (!fs.existsSync(releasePath)) {
    if (Date.now() >= deadline) {
      const error = new Error("Timed out waiting for the device authentication fence test gate");
      error.code = "DEVICE_AUTH_FENCE_TEST_TIMEOUT";
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function authenticateDeviceSocket(socket, payload = {}) {
  const result = await deviceAuthenticator.authenticate(socket, payload);
  if (socket._cleanedUp || socket.destroyed || !socket.writable) {
    return false;
  }
  if (!result.ok) {
    sendText(socket, JSON.stringify({ type: "auth.rejected", code: result.code }));
    closeSocket(socket, 1008, result.code);
    return false;
  }

  let confirmedRotation = null;
  try {
    if (result.credentialSlot === "rotation_candidate") {
      confirmedRotation = await confirmDeviceCredentialRotation(result.device, result);
    } else {
      await expireDeviceCredentialRotation(result.device);
    }
  } catch (error) {
    if (Buffer.isBuffer(result.rotationWrapKey)) result.rotationWrapKey.fill(0);
    sendText(socket, JSON.stringify({
      type: "auth.rejected",
      code: error.code || "DEVICE_SECRET_ROTATION_CONFIRMATION_FAILED",
    }));
    closeSocket(socket, 1011, error.code || "ROTATION_CONFIRMATION_FAILED");
    return false;
  }

  try {
    await waitForDeviceAuthenticationFenceTestGate(result.deviceId);
    if (!repositories?.devices?.withAuthenticationFence) {
      const error = new Error("Canonical device authentication fence is unavailable");
      error.code = "DEVICE_AUTH_FENCE_UNAVAILABLE";
      throw error;
    }
    await repositories.devices.withAuthenticationFence(
      result.deviceId,
      async (currentDevice) => {
        assertDeviceAuthenticationFence(currentDevice, result);
        if (socket._cleanedUp || socket.destroyed || !socket.writable) {
          const error = new Error("Device socket closed before authentication registration");
          error.code = "DEVICE_AUTH_SOCKET_CLOSED";
          throw error;
        }
        const previousSocket = deviceSockets.get(result.deviceId);
        socket._deviceId = result.deviceId;
        socket._deviceAuth = {
          protocolVersion: 1,
          deviceId: result.deviceId,
          organizationId: currentDevice.organizationId || "",
          sessionId: result.sessionId,
          credentialSlot: result.credentialSlot,
          rotationId: result.rotationId || "",
        };
        deviceRotationSessionKeys.set(socket, Buffer.from(result.rotationWrapKey));
        if (socket._authTimeout) {
          clearTimeout(socket._authTimeout);
          socket._authTimeout = null;
        }
        espClients.add(socket);
        deviceSockets.set(result.deviceId, socket);
        if (previousSocket && previousSocket !== socket) {
          closeSocket(
            previousSocket,
            1008,
            confirmedRotation ? "CREDENTIAL_ROTATED" : "SESSION_REPLACED",
          );
        }
      },
    );
  } catch (error) {
    if (Buffer.isBuffer(result.rotationWrapKey)) result.rotationWrapKey.fill(0);
    if (!socket._cleanedUp && !socket.destroyed && socket.writable) {
      sendText(socket, JSON.stringify({
        type: "auth.rejected",
        code: error.code || "DEVICE_AUTH_FENCE_REJECTED",
      }));
      closeSocket(socket, 1008, error.code || "DEVICE_AUTH_FENCE_REJECTED");
    }
    return false;
  }
  result.rotationWrapKey.fill(0);
  // Older ESP images put network telemetry beside the auth envelope while
  // newer images nest it under `telemetry`. Preserve either wire shape so an
  // authenticated device immediately reports WiFi/IP instead of appearing
  // online with empty network fields.
  const authTelemetry = payload.telemetry && typeof payload.telemetry === "object"
    ? payload.telemetry
    : {
        name: payload.name,
        firmwareVersion: payload.firmwareVersion || payload.firmware,
        wifiSsid: payload.wifiSsid,
        wifiRssi: payload.wifiRssi,
        ipAddress: payload.ipAddress || payload.ip,
        battery: payload.battery,
        audioStatus: payload.audioStatus,
        backendHost: payload.backendHost,
        backendPort: payload.backendPort,
      };
  await handleDeviceTelemetry(result.deviceId, {
    ...authTelemetry,
    connectionMethod: "WSS",
    status: "connected",
    audioStatus: readString(payload?.telemetry?.audioStatus, 80) || "ready",
  });
  if (
    socket._cleanedUp ||
    socket.destroyed ||
    !socket.writable ||
    deviceSockets.get(result.deviceId) !== socket
  ) {
    return false;
  }
  sendText(
    socket,
    JSON.stringify({
      type: "auth.accepted",
      protocolVersion: 1,
      challengeId: result.challengeId,
      deviceId: result.deviceId,
      sessionId: result.sessionId,
      serverTime: nowIso(),
      telemetryIntervalMs: 5_000,
      credentialSlot: result.credentialSlot,
      rotationId: result.rotationId || "",
      rotationState: confirmedRotation ? "confirmed" : "",
    })
  );
  broadcastStatus();
  return true;
}

function publishDeviceCommand(deviceId, command) {
  const socket = deviceSockets.get(deviceId);
  const device = findDevice(deviceId);
  if (!device || device.revokedAt || device.status === "revoked") {
    return { websocket: false, mqtt: false, delivered: false };
  }
  let websocket = false;
  if (
    socket &&
    socket._deviceAuth?.deviceId === deviceId &&
    socket.writable &&
    !socket.destroyed
  ) {
    websocket = sendText(socket, JSON.stringify(command));
  }
  let mqtt = false;
  if (mqttControlPlane && mqttControlPlane.enabled) {
    mqttControlPlane.publishCommand(deviceId, command);
    mqtt = true;
  }
  return { websocket, mqtt, delivered: websocket || mqtt };
}

function publishDeviceCommandWssOnly(deviceId, command, expectedSessionId = "") {
  const device = findDevice(deviceId);
  const socket = deviceSockets.get(deviceId);
  const sessionId = readString(socket?._deviceAuth?.sessionId, 128);
  const websocket = Boolean(
    device &&
    !device.revokedAt &&
    device.status !== "revoked" &&
    socket &&
    socket._deviceAuth?.deviceId === deviceId &&
    (!expectedSessionId || sessionId === expectedSessionId) &&
    socket.writable &&
    !socket.destroyed &&
    sendText(socket, JSON.stringify(command))
  );
  // The OTA payload may contain a transient download bearer. MQTT is an
  // optional scaffold whose broker can queue/persist QoS messages, so OTA is
  // deliberately confined to the authenticated WSS session.
  return { websocket, mqtt: false, delivered: websocket };
}

function buildDeviceCommand(type, payload, correlationId, ttlMs = 30_000) {
  return createDeviceCommandEnvelope({
    id: createId("cmd"),
    type,
    payload,
    correlationId: readString(correlationId, 128) || createId("correlation"),
    ttlMs,
  });
}

async function findDeviceCommand(deviceId, commandId) {
  const scopedDeviceId = readString(deviceId, 120);
  const scopedCommandId = readString(commandId, 128);
  if (repositories?.deviceCommands?.findById) {
    return repositories.deviceCommands.findById(scopedDeviceId, scopedCommandId);
  }
  return db.deviceCommands.find(
    (command) => command.deviceId === scopedDeviceId && command.id === scopedCommandId,
  ) || null;
}

async function listDeviceCommands(deviceId, limit = 100) {
  const scopedDeviceId = readString(deviceId, 120);
  const boundedLimit = Math.max(1, Math.min(500, Number(limit) || 100));
  if (repositories?.deviceCommands?.listForDevice) {
    return repositories.deviceCommands.listForDevice(scopedDeviceId, boundedLimit);
  }
  return db.deviceCommands
    .filter((command) => command.deviceId === scopedDeviceId)
    .sort((left, right) => String(right.issuedAt || "").localeCompare(String(left.issuedAt || "")))
    .slice(0, boundedLimit);
}

async function saveDeviceCommandRecord(command) {
  if (repositories?.deviceCommands?.save) {
    return repositories.deviceCommands.save(command);
  }
  db.deviceCommands = Array.isArray(db.deviceCommands) ? db.deviceCommands : [];
  const index = db.deviceCommands.findIndex((item) => item.id === command.id);
  if (index >= 0) {
    db.deviceCommands[index] = command;
  } else {
    db.deviceCommands.unshift(command);
  }
  db.deviceCommands = db.deviceCommands.slice(0, 1000);
  await saveDb();
  return command;
}

async function syncDeviceLastCommand(command) {
  const device = findDevice(command.deviceId);
  if (!device) return;
  device.lastCommand = publicDeviceCommand(command);
  device.updatedAt = nowIso();
  await saveDeviceRecord(device);
}

async function refreshDeviceCommandExpiry(command) {
  if (!command) return null;
  const result = expireDeviceCommandIfOverdue(command);
  // OTA delivery may already be acknowledged/applying when the device becomes
  // unreachable. Unlike a generic command, its signed download authority has
  // a hard deadline and must not permanently block later safe updates.
  if (
    !result.changed &&
    command.type === "ota.update" &&
    !["applied", "failed", "expired"].includes(command.state) &&
    Number.isFinite(Date.parse(command.expiresAt || "")) &&
    Date.parse(command.expiresAt) <= Date.now()
  ) {
    result.changed = transitionDeviceCommand(command, "expired", {
      at: nowIso(),
      code: "OTA_EXECUTION_EXPIRED",
      detail: "OTA did not reach authenticated boot-health confirmation before expiry",
    }).changed;
  }
  if (result.changed) {
    let commandPersistedWithOta = false;
    if (command.type === "ota.update" && command.state === "expired") {
      const device = repositories?.devices?.findById
        ? await repositories.devices.findById(command.deviceId)
        : findDevice(command.deviceId);
      if (
        device?.ota?.id &&
        device.ota.commandId === command.id &&
        !OTA_TERMINAL_STATUSES.has(normalizeDeviceOtaStatus(device.ota.status))
      ) {
        const otaTransition = transitionDeviceOtaLifecycle(device.ota, "expired", {
          at: command.updatedAt,
          metadata: {
            failureCode: command.code,
            detail: command.detail,
          },
        });
        if (otaTransition.changed) {
          await saveDeviceOtaLifecycleRecord(device, otaTransition.ota, {
            expectedOtaId: device.ota.id,
            command,
          });
          commandPersistedWithOta = true;
          await appendDeviceEvent(command.deviceId, "ota.expired", {
            protocolVersion: command.protocolVersion,
            otaId: device.ota.id,
            commandId: command.id,
            correlationId: command.correlationId,
            otaStatus: "expired",
            code: command.code,
          });
        }
      }
    }
    if (!commandPersistedWithOta) await saveDeviceCommandRecord(command);
    await syncDeviceLastCommand(command);
    await appendDeviceEvent(command.deviceId, "command.expired", {
      protocolVersion: command.protocolVersion,
      commandId: command.id,
      correlationId: command.correlationId,
      type: command.type,
      state: command.state,
      code: command.code,
    });
  }
  return command;
}

async function reconcileAudioSessionCommand(command) {
  if (!command || !["audio.session.start", "audio.session.stop"].includes(command.type)) return;
  const recording = getActiveRecordingByCommandId(command.id);
  if (!recording) return;
  if (command.type === "audio.session.start") {
    if (command.state === "applied") {
      await markRecordingStarted(recording, "device_command_ack");
      return;
    }
    if (["failed", "expired"].includes(command.state)) {
      await interruptRecording(
        recording,
        `The audio session was interrupted because the device reported ${command.state}: ${command.code || "unknown"}.`,
      );
    }
    return;
  }
  if (command.state === "applied") {
    await finalizeRecording(recording);
    return;
  }
  if (["failed", "expired"].includes(command.state)) {
    await interruptRecording(
      recording,
      `The audio session was interrupted because the stop command ${command.state}: ${command.code || "unknown"}.`,
    );
  }
}

async function handleDeviceCommandStatus(deviceId, payload) {
  const commandId = readString(payload.commandId, 128);
  const command = await findDeviceCommand(deviceId, commandId);
  if (!command) {
    await appendDeviceEvent(deviceId, "command.status_rejected", {
      protocolVersion: Number(payload.protocolVersion || 0),
      commandId,
      correlationId: readString(payload.correlationId, 128),
      reportedState: readString(payload.state, 40),
      code: "DEVICE_COMMAND_NOT_FOUND",
    });
    return false;
  }

  try {
    if (command.type === "device.rotate_secret" && readString(payload.state, 40) === "applied") {
      await appendDeviceEvent(deviceId, "command.status_rejected", {
        protocolVersion: command.protocolVersion,
        commandId: command.id,
        correlationId: command.correlationId,
        reportedState: "applied",
        code: "ROTATION_RECONNECT_REQUIRED",
      });
      return false;
    }
    const transition = applyDeviceReportedCommandStatus(command, payload, deviceId);
    // Keep the scan projection in lockstep with the device ACK before any
    // command persistence await can expose a terminal command with a stale
    // `created` recording to concurrent readers.
    await reconcileAudioSessionCommand(command);
    if (transition.changed) {
      let otaPersisted = false;
      if (command.type === "ota.update") {
        const device = repositories
          ? await repositories.devices.findById(deviceId)
          : findDevice(deviceId);
        if (device?.ota?.commandId === command.id) {
          const otaState = command.state === "applying" && command.code === "OTA_REBOOTING"
            ? "rebooting"
            : normalizeDeviceOtaStatus(command.state);
          const otaTransition = transitionDeviceOtaLifecycle(device.ota, otaState, {
            at: command.updatedAt,
            metadata: {
              failureCode: command.state === "failed" ? command.code : "",
              detail: command.detail,
            },
          });
          device.ota = otaTransition.ota;
          device.otaStatus = otaTransition.ota.status;
          await saveDeviceOtaLifecycleRecord(device, device.ota, {
            expectedOtaId: device.ota.id,
            command,
          });
          otaPersisted = true;
        }
      }
      const rotationPersisted =
        command.type === "device.rotate_secret"
          ? await updateCredentialRotationFromCommand(deviceId, command)
          : false;
      if (!rotationPersisted && !otaPersisted) {
        await saveDeviceCommandRecord(command);
      }
      if (!rotationPersisted) await syncDeviceLastCommand(command);
    }
    await appendDeviceEvent(deviceId, transition.changed ? `command.${command.state}` : "command.status_replay", {
      protocolVersion: command.protocolVersion,
      commandId: command.id,
      correlationId: command.correlationId,
      state: command.state,
      reportedState: readString(payload.state, 40),
      code: command.code,
      detail: command.detail,
    });
    return true;
  } catch (error) {
    await appendDeviceEvent(deviceId, "command.status_rejected", {
      protocolVersion: Number(command?.protocolVersion || payload.protocolVersion || 0),
      commandId,
      correlationId: readString(payload.correlationId, 128),
      reportedState: readString(payload.state, 40),
      code: error.code || "DEVICE_COMMAND_STATUS_INVALID",
    });
    return false;
  }
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

async function markInterruptedRecordings() {
  const recoveredAt = nowIso();
  const stranded = db.scans.filter((scan) => ["created", "recording"].includes(scan.status));
  for (const scan of stranded) {
    Object.assign(scan, {
      status: "interrupted",
      processingStatus: "interrupted",
      endedAt: scan.endedAt || recoveredAt,
      aiLabel: "interrupted",
      aiConfidence: null,
      aiSummary:
        scan.aiSummary ||
        "Lượt ghi còn mở khi máy chủ khởi động lại. Hãy tạo lượt đo mới để có file WAV hoàn chỉnh.",
      updatedAt: recoveredAt,
    });
    await saveScanRecord(scan);
  }
  return stranded.length;
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

function websocketAcceptKey(key) {
  return crypto
    .createHash("sha1")
    .update(key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11")
    .digest("base64");
}

function sendFrame(socket, opcode, payload) {
  if (!socket.writable || socket.destroyed) {
    return false;
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
    return true;
  } catch {
    cleanupSocket(socket);
    socket.destroy();
    return false;
  }
}

function sendText(socket, value) {
  return sendFrame(socket, 0x1, value);
}

function sendBinary(socket, value) {
  return sendFrame(socket, 0x2, value);
}

function getActiveRecordingsForListener(listener = null) {
  const recordings = listActiveRecordings();
  if (!listener) return recordings;
  return recordings.filter((recording) =>
    canListenerAccessScan(listener, findScan(recording.scanId)),
  );
}

function getPrimaryActiveRecordingForListener(listener = null) {
  const visibleRecordings = getActiveRecordingsForListener(listener);
  if (!listener) {
    return visibleRecordings.find((recording) => recording.confirmed) || visibleRecordings[0] || null;
  }
  if (listener._listenerRequestedScanId) {
    const requested = visibleRecordings.find(
      (recording) => recording.scanId === listener._listenerRequestedScanId,
    ) || null;
    listener._listenerScanId = requested?.scanId || null;
    return requested;
  }
  const existing = listener._listenerScanId
    ? visibleRecordings.find((recording) => recording.scanId === listener._listenerScanId)
    : null;
  if (existing) return existing;
  const selected = visibleRecordings.find((recording) => recording.confirmed) || visibleRecordings[0] || null;
  listener._listenerScanId = selected?.scanId || null;
  return selected;
}

function getStatusPayload(listener = null, expectedWorkspaceId = "") {
  const espCount = getAudioSourceCount();
  const allVisibleRecordings = getActiveRecordingsForListener(listener);
  const normalizedWorkspaceId =
    typeof expectedWorkspaceId === "string" ? expectedWorkspaceId.trim() : "";
  const visibleRecordings = normalizedWorkspaceId
    ? allVisibleRecordings.filter(
        (recording) => recording.organizationId === normalizedWorkspaceId,
      )
    : allVisibleRecordings;
  const primaryRecording = normalizedWorkspaceId
    ? selectWorkspaceRecording(visibleRecordings, normalizedWorkspaceId)
    : listener
      ? getPrimaryActiveRecordingForListener(listener)
      : visibleRecordings.find((recording) => recording.confirmed) ||
        visibleRecordings[0] ||
        null;
  const exposeInfrastructure = !listener?._wsUser;
  return {
    type: "status",
    ...(exposeInfrastructure
      ? {
          esp: espCount,
          wsEsp: espClients.size,
          udpEsp: Math.max(0, espCount - espClients.size),
          listeners: listenClients.size,
        }
      : {}),
    recording: Boolean(primaryRecording?.confirmed),
    workspaceId: primaryRecording?.confirmed ? primaryRecording.organizationId : null,
    patientId: primaryRecording?.confirmed ? primaryRecording.patientId : null,
    deviceId: primaryRecording?.confirmed ? primaryRecording.deviceId : null,
    scanId: primaryRecording?.confirmed ? primaryRecording.scanId : null,
    sessionId: primaryRecording?.confirmed ? primaryRecording.sessionId : null,
    activeScanId: primaryRecording?.confirmed ? primaryRecording.scanId : null,
    activeScanIds: visibleRecordings.map((recording) => recording.scanId),
    activeScanStartedAt: primaryRecording?.startedAt || null,
    activeScans: visibleRecordings.map((recording) => ({
      scanId: recording.scanId,
      deviceId: recording.deviceId,
      startedAt: recording.startedAt,
      state: findScan(recording.scanId)?.status || "created",
    })),
    sampleRate: SAMPLE_RATE,
    ...(exposeInfrastructure
      ? {
          udpPort: AUDIO_UDP_PORT,
          httpPort: PORT,
        }
      : {}),
    updatedAt: nowIso(),
  };
}

function broadcastStatus() {
  const status = getStatusPayload();
  lastAudioSourceCount = status.esp;

  for (const socket of listenClients) {
    sendText(socket, JSON.stringify(getStatusPayload(socket)));
  }
}

function broadcastScanEvent(type, scan) {
  for (const socket of listenClients) {
    if (canListenerAccessScan(socket, scan)) {
      const visibleRecordings = getActiveRecordingsForListener(socket);
      const primaryRecording = visibleRecordings[0] || null;
      const message = JSON.stringify({
        type,
        scan,
        activeScanId: primaryRecording?.scanId || null,
        activeScanIds: visibleRecordings.map((recording) => recording.scanId),
      });
      sendText(socket, message);
    }
  }

  broadcastStatus();
}

function cleanupSocket(socket) {
  if (socket._cleanedUp) {
    return;
  }

  socket._cleanedUp = true;
  if (socket._authTimeout) {
    clearTimeout(socket._authTimeout);
    socket._authTimeout = null;
  }
  if (socket._authSessionInterval) {
    clearInterval(socket._authSessionInterval);
    socket._authSessionInterval = null;
  }
  if (socket._firebaseExpiryTimeout) {
    clearTimeout(socket._firebaseExpiryTimeout);
    socket._firebaseExpiryTimeout = null;
  }
  const disconnectedDeviceId = socket._deviceId || socket._deviceAuth?.deviceId || "";
  deviceAuthenticator.clear(socket);
  const rotationSessionKey = deviceRotationSessionKeys.get(socket);
  if (Buffer.isBuffer(rotationSessionKey)) rotationSessionKey.fill(0);
  deviceRotationSessionKeys.delete(socket);

  if (socket._wsRole === "esp") {
    espClients.delete(socket);
    if (socket._deviceId && deviceSockets.get(socket._deviceId) === socket) {
      deviceSockets.delete(socket._deviceId);
      void markDeviceSocketDisconnected(socket._deviceId).catch((err) =>
        console.error(`Device socket cleanup error: ${err.message}`)
      );
    }
    if (disconnectedDeviceId) {
      void interruptRecordingForDevice(
        disconnectedDeviceId,
        "Lượt ghi bị ngắt vì kết nối bảo mật với thiết bị đã đóng.",
      ).catch((err) => console.error(`Recording disconnect cleanup error: ${err.message}`));
    }
    console.log("ESP disconnected");
  } else if (socket._wsRole === "listen") {
    listenClients.delete(socket);
    console.log("App/browser disconnected");
  }

  socket._deviceAuth = null;

  broadcastStatus();
}

async function markDeviceSocketDisconnected(deviceId) {
  const device = findDevice(deviceId);
  if (device) {
    device.connected = false;
    device.status = device.revokedAt || device.status === "revoked" ? "revoked" : "available";
    device.audioStatus = "offline";
    device.updatedAt = nowIso();
    await saveDeviceRecord(device);
  }
  await appendDeviceEvent(deviceId, "socket_disconnected", {});
}

function closeSocket(socket, code = 1000, reason = "") {
  cleanupSocket(socket);
  deviceAuthenticator.clear(socket);
  try {
    const safeReason = Buffer.from(String(reason || ""), "utf8").subarray(0, 123);
    const payload = Buffer.alloc(2 + safeReason.length);
    payload.writeUInt16BE(code, 0);
    safeReason.copy(payload, 2);
    sendFrame(socket, 0x8, payload);
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
  const activeSocketDeviceIds = new Set();
  for (const [deviceId, socket] of deviceSockets.entries()) {
    const device = findDevice(deviceId);
    if (
      socket &&
      socket._deviceAuth?.deviceId === deviceId &&
      device &&
      !device.revokedAt &&
      device.status !== "revoked" &&
      socket.writable &&
      !socket.destroyed
    ) {
      activeSocketDeviceIds.add(deviceId);
    }
  }
  const now = nowIso();

  for (const device of db.devices) {
    const isActive = activeSocketDeviceIds.has(device.id);
    if (isActive) {
      device.connected = true;
      device.status = "connected";
      device.lastSeenAt = now;
      device.updatedAt = now;
      continue;
    }

    if (device.connected || device.status === "connected") {
      device.connected = false;
      device.status = device.revokedAt ? "revoked" : "available";
      device.updatedAt = now;
    }
  }
}

function closeRealtimeSocketsForSession(userId, session) {
  if (!userId || !session) return;
  for (const socket of listenClients) {
    if (
      socket._wsUser?.id === userId &&
      (socket._authSessionId === session.id ||
        (session.sessionKey && socket._authSessionKey === session.sessionKey))
    ) {
      closeSocket(socket, 1008, "AUTH_SESSION_REVOKED");
    }
  }
}

function closeRealtimeSocketsForUser(userId, reason = "ACCOUNT_ACCESS_REVOKED") {
  if (!userId) return;
  for (const socket of listenClients) {
    if (socket._wsUser?.id === userId) closeSocket(socket, 1008, reason);
  }
}

async function isRealtimeFirebaseIdentityActive(socket) {
  if (!socket._firebaseUid) return true;
  const firebaseAdmin = getFirebaseAdmin(process.env);
  if (!firebaseAdmin) throw new Error("Firebase Admin is unavailable");
  try {
    const record = await firebaseAdmin.auth().getUser(socket._firebaseUid);
    if (record.disabled) return false;
    const validAfter = Date.parse(record.tokensValidAfterTime || "");
    const authenticatedAt = Number(socket._firebaseAuthTime || 0) * 1000;
    return !Number.isFinite(validAfter) || authenticatedAt >= validAfter;
  } catch (error) {
    if (error?.code === "auth/user-not-found") return false;
    throw error;
  }
}

function startRealtimeAuthSessionMonitor(socket) {
  if (!socket._wsUser?.id || !socket._authSessionId || !repositories?.authSessions?.isActiveForUser) {
    return;
  }
  socket._authSessionInterval = setInterval(async () => {
    if (socket._cleanedUp || socket._authSessionCheckPending) return;
    socket._authSessionCheckPending = true;
    try {
      if (socket._firebaseExpiresAt && Date.now() >= socket._firebaseExpiresAt) {
        closeSocket(socket, 1008, "FIREBASE_TOKEN_EXPIRED");
        return;
      }
      const active = await repositories.authSessions.isActiveForUser(
        socket._wsUser.id,
        socket._authSessionId,
      );
      if (!active && !socket._cleanedUp) {
        closeSocket(socket, 1008, "AUTH_SESSION_REVOKED");
        return;
      }
      const canonicalUser = await refreshAuthenticatedAuthorization(socket._wsUser);
      if (!canonicalUser || !isActiveUserAccount(canonicalUser)) {
        closeSocket(socket, 1008, "ACCOUNT_ACCESS_REVOKED");
        return;
      }
      socket._wsUser = canonicalUser;
      if (
        socket._firebaseUid &&
        Date.now() - Number(socket._firebaseLastAccountCheckAt || 0) >= REALTIME_FIREBASE_ACCOUNT_RECHECK_MS
      ) {
        socket._firebaseLastAccountCheckAt = Date.now();
        if (!(await isRealtimeFirebaseIdentityActive(socket))) {
          closeSocket(socket, 1008, "FIREBASE_ACCOUNT_REVOKED");
        }
      }
    } catch (error) {
      console.error(`Realtime auth session check failed: ${error.message}`);
      if (!socket._cleanedUp) closeSocket(socket, 1011, "AUTH_SESSION_UNAVAILABLE");
    } finally {
      socket._authSessionCheckPending = false;
    }
  }, REALTIME_AUTH_SESSION_RECHECK_MS);
  socket._authSessionInterval.unref?.();
}

function refreshAudioSourceStatus() {
  const count = getAudioSourceCount();
  if (count !== lastAudioSourceCount) {
    lastAudioSourceCount = count;
    refreshDevicePresence();
    broadcastStatus();
  }
}

function getActiveAudioSessionMetadata(recording) {
  if (!recording) return null;
  return {
    type: "audio.session",
    protocolVersion: 2,
    frameEncoding: "shcare_audio_v2",
    workspaceId: recording.organizationId,
    patientId: recording.patientId,
    deviceId: recording.deviceId,
    scanId: recording.scanId,
    sessionId: recording.sessionId,
    sampleRate: SAMPLE_RATE,
    channels: CHANNELS,
    bitsPerSample: BITS_PER_SAMPLE,
    encoding: "pcm_s16le",
    startedAt: recording.startedAt,
  };
}

function listenerFrameForRecording(listener, recording, payload, frameMetadata = {}) {
  const isNewSession = listener._audioFrameSessionId !== recording.sessionId;
  const sourceSequence = Number.isInteger(frameMetadata.sequence)
    ? frameMetadata.sequence
    : null;
  if (isNewSession) {
    listener._audioSourceBaseSequence = sourceSequence;
    listener._audioListenerSequence = 0;
  } else if (
    sourceSequence !== null &&
    Number.isInteger(listener._audioSourceBaseSequence)
  ) {
    listener._audioListenerSequence = sourceSequence - listener._audioSourceBaseSequence;
  } else {
    listener._audioListenerSequence = Number(listener._audioListenerSequence || 0) + 1;
  }

  const flags = new Set(Array.isArray(frameMetadata.flags) ? frameMetadata.flags : []);
  if (isNewSession) flags.add("start");
  else flags.delete("start");
  return encodeAudioFrameV2({
    sessionId: recording.sessionId,
    scanId: recording.scanId,
    sequence: listener._audioListenerSequence,
    timestampMs: Number.isSafeInteger(frameMetadata.timestampMs)
      ? frameMetadata.timestampMs
      : Date.now(),
    sampleCount: payload.length / 2,
    flags: Array.from(flags),
    payload,
  });
}

function broadcastAudio(recording, payload, frameMetadata = {}) {
  if (!recording) return;
  for (const listener of listenClients) {
    if (canListenerAccessActiveScan(listener, recording)) {
      if (
        listener._audioSessionId !== recording.sessionId ||
        listener._audioProtocolVersion !== 2
      ) {
        sendText(listener, JSON.stringify(getActiveAudioSessionMetadata(recording)));
      }
      const listenerFrame = listenerFrameForRecording(
        listener,
        recording,
        payload,
        frameMetadata,
      );
      listener._audioSessionId = recording.sessionId;
      listener._audioFrameSessionId = recording.sessionId;
      listener._audioProtocolVersion = 2;
      sendBinary(listener, listenerFrame);
    }
  }
}

function canListenerAccessScan(listener, scan) {
  if (!scan) return false;
  if (listener._wsUser) return canAccessScan(listener._wsUser, scan);
  return AUTH_MODE !== "production" || ALLOW_DEMO_AUTH;
}

function canListenerAccessActiveScan(listener, recording = null) {
  const boundRecording = getPrimaryActiveRecordingForListener(listener);
  const targetRecording = recording || boundRecording;
  if (!targetRecording || !boundRecording || targetRecording.scanId !== boundRecording.scanId) {
    return false;
  }
  return canListenerAccessScan(listener, findScan(targetRecording.scanId));
}

function updateLiveMetrics(recording, source) {
  const summary = recording.metrics.getSummary();
  recording.liveMetrics = {
    sampleRate: SAMPLE_RATE,
    channels: CHANNELS,
    bitsPerSample: BITS_PER_SAMPLE,
    ...summary,
    workspaceId: recording.organizationId,
    patientId: recording.patientId,
    scanId: recording.scanId,
    deviceId: recording.deviceId,
    sessionId: recording.sessionId,
    source,
    updatedAt: nowIso(),
  };
  liveMetrics = recording.liveMetrics;
  return recording.liveMetrics;
}

function maybeBroadcastLiveMetrics(recording) {
  const now = Date.now();
  if (now - Number(recording.lastMetricBroadcastAt || 0) < LIVE_METRIC_INTERVAL_MS) {
    return;
  }

  recording.lastMetricBroadcastAt = now;
  const message = JSON.stringify({
    type: "metrics",
    ...(recording.liveMetrics || createEmptyLiveMetrics()),
    recording: true,
  });

  for (const socket of listenClients) {
    if (canListenerAccessActiveScan(socket, recording)) {
      sendText(socket, message);
    }
  }
}

function isAudioSourceBoundToRecording(sourceContext = {}, recording = null) {
  const targetRecording = recording || getActiveRecordingForDevice(sourceContext.deviceId);
  if (!targetRecording) return false;
  return Boolean(
    sourceContext.authenticated &&
    sourceContext.deviceId &&
    sourceContext.deviceId === targetRecording.deviceId &&
    (sourceContext.organizationId || "") === (targetRecording.organizationId || "") &&
    sourceContext.authSessionId === targetRecording.deviceSessionId &&
    (!sourceContext.audioSessionId || sourceContext.audioSessionId === targetRecording.sessionId)
  );
}

function handleIncomingAudio(payload, sourceContext = {}, frameMetadata = {}, recording = null) {
  const targetRecording = recording || getActiveRecordingForDevice(sourceContext.deviceId);
  if (payload.length === 0 || payload.length % 2 !== 0) {
    return false;
  }
  if (!isAudioSourceBoundToRecording(sourceContext, targetRecording)) {
    return false;
  }

  if (!recordAudioPayload(targetRecording, payload, sourceContext)) {
    return false;
  }
  updateLiveMetrics(targetRecording, sourceContext.label || sourceContext.transport || "unknown");
  broadcastAudio(targetRecording, payload, frameMetadata);
  maybeBroadcastLiveMetrics(targetRecording);
  return true;
}

function handleBinary(socket, payload) {
  if (socket._wsRole !== "esp") {
    return;
  }

  if (!socket._deviceAuth || socket._deviceAuth.deviceId !== socket._deviceId) {
    closeSocket(socket, 1008, "AUTH_REQUIRED");
    return;
  }
  if (payload.length > MAX_DEVICE_AUDIO_FRAME_BYTES) {
    closeSocket(socket, 1009, "AUDIO_FRAME_TOO_LARGE");
    return;
  }
  const device = findDevice(socket._deviceAuth.deviceId);
  if (!device || device.revokedAt || device.status === "revoked") {
    closeSocket(socket, 1008, "REVOKED");
    return;
  }

  const sourceContext = {
    transport: "websocket",
    label: `websocket:${socket._deviceAuth.deviceId}`,
    authenticated: true,
    deviceId: socket._deviceAuth.deviceId,
    organizationId: socket._deviceAuth.organizationId || "",
    authSessionId: socket._deviceAuth.sessionId,
    audioSessionId: "",
  };
  const recording = getActiveRecordingForDevice(sourceContext.deviceId);
  if (!isAudioSourceBoundToRecording(sourceContext, recording)) {
    return;
  }

  let pcmPayload = payload;
  let frameMetadata = { protocolVersion: 1 };
  const isProtocolV2 =
    payload.length >= AUDIO_V2_MAGIC.length &&
    payload.subarray(0, AUDIO_V2_MAGIC.length).equals(AUDIO_V2_MAGIC);

  if (isProtocolV2) {
    try {
      const decoded = decodeAudioFrameV2(payload);
      if (
        !recording ||
        decoded.sessionId !== recording.sessionId ||
        decoded.scanId !== recording.scanId
      ) {
        closeSocket(socket, 1008, "AUDIO_SESSION_MISMATCH");
        return;
      }
      if (recording.protocolVersion && recording.protocolVersion !== 2) {
        closeSocket(socket, 1008, "AUDIO_PROTOCOL_SWITCH_REJECTED");
        return;
      }
      const sequence = recording.audioSequenceGuard.accept(decoded);
      recording.protocolVersion = 2;
      recording.droppedPackets += sequence.droppedPackets;
      recording.receivedPackets += 1;
      confirmRecordingStartedFromFrame(recording);
      pcmPayload = decoded.payload;
      sourceContext.audioSessionId = decoded.sessionId;
      frameMetadata = {
        protocolVersion: 2,
        sequence: decoded.sequence,
        timestampMs: decoded.timestampMs,
        flags: decoded.flags,
      };
    } catch (error) {
      closeSocket(socket, 1008, error.code || "AUDIO_V2_INVALID_FRAME");
      return;
    }
  } else {
    if (!ALLOW_AUDIO_V1_COMPAT) {
      closeSocket(socket, 1003, "AUDIO_V1_DISABLED");
      return;
    }
    if (recording?.protocolVersion === 2) {
      closeSocket(socket, 1008, "AUDIO_PROTOCOL_DOWNGRADE_REJECTED");
      return;
    }
  }

  const accepted = handleIncomingAudio(pcmPayload, sourceContext, frameMetadata, recording);

  if (accepted && !isProtocolV2 && recording) {
    recording.protocolVersion = 1;
    recording.receivedPackets += 1;
  }

  if (
    accepted &&
    socket._deviceId &&
    (!socket._lastAudioTelemetryAt || Date.now() - socket._lastAudioTelemetryAt > 5000)
  ) {
    socket._lastAudioTelemetryAt = Date.now();
    void handleDeviceTelemetry(socket._deviceId, {
      status: "connected",
      connectionMethod: "WSS",
      audioStatus: "recording",
    }).catch((err) => console.error(`Device audio telemetry error: ${err.message}`));
  }
}

function handleEspText(socket, payload) {
  let message;
  try {
    message = JSON.parse(payload.toString("utf8"));
  } catch {
    return;
  }

  const type = readString(message.type, 80);
  if (!socket._deviceAuth) {
    if (type !== "auth.response") {
      sendText(socket, JSON.stringify({ type: "auth.rejected", code: "INVALID_CREDENTIALS" }));
      closeSocket(socket, 1008, "AUTH_REQUIRED");
      return;
    }
    if (socket._authInFlight) {
      closeSocket(socket, 1008, "INVALID_CREDENTIALS");
      return;
    }
    socket._authInFlight = true;
    void authenticateDeviceSocket(socket, message)
      .catch((err) => {
        console.error(`Device authentication error: ${err.message}`);
        if (!socket._cleanedUp) {
          sendText(socket, JSON.stringify({ type: "auth.rejected", code: "INVALID_CREDENTIALS" }));
          closeSocket(socket, 1008, "INVALID_CREDENTIALS");
        }
      })
      .finally(() => {
        socket._authInFlight = false;
      });
    return;
  }

  const messageDeviceId = readString(message.deviceId, 120);
  if (messageDeviceId && messageDeviceId !== socket._deviceAuth.deviceId) {
    closeSocket(socket, 1008, "IDENTITY_MISMATCH");
    return;
  }
  if (type === "auth.response" || containsSensitiveDeviceCredential(message)) {
    closeSocket(socket, 1008, "FORBIDDEN_CREDENTIAL_FIELD");
    return;
  }
  if (type === "hello" || type === "telemetry") {
    void handleDeviceTelemetry(socket._deviceAuth.deviceId, message.telemetry || message).catch((err) =>
      console.error(`Device telemetry error: ${err.message}`)
    );
    return;
  }
  void deviceEventExecutor.enqueue(
    socket._deviceAuth.deviceId,
    () => handleDeviceEvent(socket._deviceAuth.deviceId, message),
  ).then((result) => {
    const eventType = readString(message.type || message.eventType, 120);
    const otaStatus = normalizeDeviceOtaStatus(message.otaStatus, eventType);
    const commandId = readString(message.commandId, 128);
    const correlationId = readString(message.correlationId, 128);
    const otaId = readString(message.otaId, 128);
    if (
      eventType.startsWith("ota.") &&
      otaStatus &&
      commandId &&
      correlationId &&
      otaId &&
      (!messageDeviceId || socket._deviceAuth?.deviceId === messageDeviceId)
    ) {
      sendText(socket, JSON.stringify({
        type: result?.accepted === true ? "event.accepted" : "event.rejected",
        protocolVersion: 1,
        deviceId: socket._deviceAuth.deviceId,
        eventType,
        otaStatus,
        commandId,
        correlationId,
        otaId,
        code: readString(result?.code, 80) || "DEVICE_EVENT_REJECTED",
      }));
    }
  }).catch((err) =>
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
      const idempotencyKey = getRequiredScanSocketIdempotencyKey(message, "scan start");
      const payload = message.payload && typeof message.payload === "object"
        ? { ...message.payload }
        : Object.fromEntries(
          Object.entries(message).filter(([key]) => !["type", "idempotencyKey"].includes(key)),
        );
      const outcome = await startScanIdempotently(
        payload,
        socket._wsUser || null,
        idempotencyKey,
        payload,
      );
      sendText(socket, JSON.stringify({
        type: "scan_started",
        scan: outcome.resource,
        idempotent: outcome.replayed,
      }));
      return;
    }

    const idempotencyKey = getRequiredScanSocketIdempotencyKey(message, "scan stop");

    const visibleRecordings = getActiveRecordingsForListener(socket);
    if (!message.scanId && visibleRecordings.length > 1) {
      throw httpError(409, "Cáº§n chá»n lÆ°á»£t ghi cá»¥ thá»ƒ", "ACTIVE_SCAN_AMBIGUOUS");
    }
    const scanId = message.scanId || visibleRecordings[0]?.scanId;
    const targetScan = scanId ? findScan(scanId) : null;
    if (!targetScan) {
      throw httpError(409, "Không có lượt ghi đang chạy");
    }
    if (socket._wsUser) {
      assertCanManageScan(socket._wsUser, targetScan);
    } else if (AUTH_MODE === "production" && !ALLOW_DEMO_AUTH) {
      throw httpError(401, "Realtime authentication is required");
    }
    const outcome = scanId
      ? await stopScanIdempotently(
        targetScan,
        socket._wsUser || null,
        idempotencyKey,
        { scanId },
      )
      : await stopActiveScanIdempotently(
        socket._wsUser || null,
        idempotencyKey,
        {},
      );
    sendText(socket, JSON.stringify({
      type: "scan_stopped",
      scan: outcome.resource,
      idempotent: outcome.replayed,
    }));
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
  if (socket._wsBuffer.length + chunk.length > MAX_WS_BUFFER_BYTES) {
    closeSocket(socket, 1009, "FRAME_TOO_LARGE");
    return;
  }
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
    if (socket._cleanedUp) {
      return;
    }
  }
}

function readString(value, maxLength = 200) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().slice(0, maxLength);
}

function readAuthSessionRevokeIdempotencyKey(req, { required = true } = {}) {
  const rawKey = req.headers["idempotency-key"];
  if (typeof rawKey !== "string" || !rawKey.trim()) {
    if (!required) return "";
    throw httpError(
      400,
      "Idempotency-Key is required for auth session revocation",
      "IDEMPOTENCY_KEY_REQUIRED",
    );
  }
  if (rawKey.length > 160) {
    throw httpError(
      400,
      "Idempotency-Key exceeds the supported length",
      "IDEMPOTENCY_KEY_TOO_LONG",
    );
  }
  return rawKey.trim();
}

function readAuthSessionIdSegment(value) {
  let sessionId = "";
  try {
    sessionId = decodeURIComponent(String(value || ""));
  } catch {
    throw httpError(400, "Auth session ID is invalid", "AUTH_SESSION_ID_INVALID");
  }
  if (!sessionId || sessionId !== sessionId.trim() || sessionId.length > 160) {
    throw httpError(400, "Auth session ID is invalid", "AUTH_SESSION_ID_INVALID");
  }
  return sessionId;
}

function createLegacyAuthSessionRevokeIdempotencyKey(userId, sessionId) {
  const digest = createIdempotencyFingerprint({
    operation: "auth.session.revoke",
    userId,
    sessionId,
  });
  return `legacy-auth-session-revoke-${digest.slice(0, 64)}`;
}

function readPasswordSecret(value, fieldCode) {
  if (typeof value !== "string" || value.length === 0) {
    throw httpError(
      400,
      "Password fields are required",
      fieldCode === "current" ? "PASSWORD_CURRENT_REQUIRED" : "PASSWORD_NEW_REQUIRED",
    );
  }
  if (value.length > 200) {
    throw httpError(400, "Password exceeds the supported length", "PASSWORD_TOO_LONG");
  }
  return value;
}

function assertCanonicalPasswordChangePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw httpError(
      400,
      "Password change body must be an object",
      "PASSWORD_CHANGE_REQUEST_INVALID",
      { fieldErrors: { request: "Expected a JSON object" } },
    );
  }
  const unsupported = Object.keys(payload).filter(
    (key) => !["currentPassword", "newPassword"].includes(key),
  );
  if (unsupported.length > 0) {
    throw httpError(
      400,
      "Password change body contains unsupported fields",
      "PASSWORD_CHANGE_REQUEST_INVALID",
      { fieldErrors: { request: "Only currentPassword and newPassword are accepted" } },
    );
  }
}

function assertStrongPasswordSecret(currentPassword, nextPassword) {
  if (
    nextPassword.length < 8 ||
    !/[A-Z]/.test(nextPassword) ||
    !/[a-z]/.test(nextPassword) ||
    !/[0-9]/.test(nextPassword)
  ) {
    throw httpError(
      400,
      "New password must contain at least 8 characters, uppercase, lowercase, and a number",
      "PASSWORD_TOO_WEAK",
    );
  }
  if (nextPassword === currentPassword) {
    throw httpError(
      400,
      "New password must differ from the current password",
      "PASSWORD_UNCHANGED",
    );
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function normalizeEmailRecipients(value) {
  const rawItems = Array.isArray(value) ? value : [value];
  const recipients = [];
  const seen = new Set();
  for (const item of rawItems) {
    if (!item) continue;
    const rawEmail = typeof item === "string" ? item : item.email || item.to || "";
    for (const part of String(rawEmail || "").split(/[;,]/)) {
      const email = readString(part.replace(/[\r\n]/g, ""), 240).toLowerCase();
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || seen.has(email)) {
        continue;
      }
      const name = typeof item === "object" ? readString(item.name || item.fullName || "", 120).replace(/[\r\n]/g, "") : "";
      recipients.push({ email, name });
      seen.add(email);
    }
  }
  return recipients;
}

function formatSmtpRecipient(recipient) {
  const email = readString(recipient.email, 240).replace(/[\r\n]/g, "");
  const name = readString(recipient.name, 120).replace(/[\r\n"]/g, "");
  return name ? `"${name}" <${email}>` : email;
}

function formatVietnamDateTime(value = nowIso()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return readString(value, 80);
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(date);
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

function deriveDeviceClaimCode(device, idempotencyKey, fingerprint) {
  const verificationMaterial = readString(device?.secretHash, 200);
  if (!verificationMaterial) {
    throw httpError(
      503,
      "Device verification material is unavailable for claim provisioning",
      "DEVICE_CLAIM_MATERIAL_UNAVAILABLE",
    );
  }
  return crypto
    .createHmac("sha256", verificationMaterial)
    .update(
      [
        readString(device.id, 120),
        readString(device.organizationId, 120),
        readString(idempotencyKey, 160),
        readString(fingerprint, 128),
      ].join("\n"),
      "utf8",
    )
    .digest("hex")
    .slice(0, 12)
    .toUpperCase();
}

const PUBLIC_DEVICE_FIELDS = Object.freeze([
  "id",
  "organizationId",
  "pairedUserId",
  "ownerUserId",
  "assignedPatientId",
  "ownershipState",
  "revokedByUserId",
  "name",
  "type",
  "manufacturer",
  "model",
  "serialNumber",
  "purchaseDate",
  "status",
  "signal",
  "wifiRssi",
  "wifiSsid",
  "ipAddress",
  "battery",
  "connected",
  "connectionMethod",
  "firmwareVersion",
  "otaStatus",
  "audioStatus",
  "backendHost",
  "backendPort",
  "lastSeenAt",
  "revokedAt",
  "secretRotatedAt",
  "createdAt",
  "updatedAt",
]);

const PUBLIC_DEVICE_OTA_FIELDS = Object.freeze([
  "id",
  "commandId",
  "correlationId",
  "firmwareVersion",
  "checksum",
  "firmwareFileId",
  "firmwareFileName",
  "hardwareTarget",
  "partitionTarget",
  "minimumProtocolVersion",
  "expiresAt",
  "status",
  "createdAt",
  "updatedAt",
]);

const DEVICE_PROVISION_RECEIPT_FIELDS = Object.freeze([
  "id",
  "organizationId",
  "name",
  "type",
  "manufacturer",
  "model",
  "serialNumber",
  "purchaseDate",
  "ownershipState",
  "status",
  "connected",
  "online",
  "createdAt",
  "updatedAt",
]);

const DEVICE_PAIR_RECEIPT_FIELDS = Object.freeze([
  "id",
  "organizationId",
  "ownerUserId",
  "pairedUserId",
  "name",
  "type",
  "ownershipState",
  "status",
  "connected",
  "online",
  "connectionMethod",
  "updatedAt",
]);

function copyOwnFields(source, fieldNames) {
  const result = {};
  if (!source || typeof source !== "object") return result;
  for (const field of fieldNames) {
    if (Object.prototype.hasOwnProperty.call(source, field) && source[field] !== undefined) {
      result[field] = source[field];
    }
  }
  return result;
}

function publicDevice(device) {
  if (!device) return null;
  const safeDevice = copyOwnFields(device, PUBLIC_DEVICE_FIELDS);
  const privateRotation = sanitizeDeviceCredentialRotation(device.credentialRotation);
  if (privateRotation.id) {
    safeDevice.credentialRotation = {
      protocolVersion: privateRotation.protocolVersion,
      id: privateRotation.id,
      state: privateRotation.state,
      commandId: privateRotation.commandId || "",
      requestedAt: privateRotation.requestedAt || "",
      expiresAt: privateRotation.expiresAt || "",
      acknowledgedAt: privateRotation.acknowledgedAt || "",
      confirmingAt: privateRotation.confirmingAt || "",
      confirmedAt: privateRotation.confirmedAt || "",
      expiredAt: privateRotation.expiredAt || "",
      rolledBackAt: privateRotation.rolledBackAt || "",
      failedAt: privateRotation.failedAt || "",
      failureCode: privateRotation.failureCode || "",
      confirmed: privateRotation.state === "confirmed",
    };
  } else {
    delete safeDevice.credentialRotation;
  }
  if (device.telemetry) {
    safeDevice.telemetry = sanitizeDeviceTelemetry(device.telemetry);
  }
  if (isCanonicalDeviceOtaLifecycle(device.ota)) {
    const publicOta = copyOwnFields(device.ota, PUBLIC_DEVICE_OTA_FIELDS);
    safeDevice.ota = {
      protocolVersion: Number(publicOta.protocolVersion || 1),
      id: publicOta.id,
      commandId: publicOta.commandId,
      correlationId: publicOta.correlationId,
      firmwareVersion: publicOta.firmwareVersion,
      checksum: publicOta.checksum,
      firmwareFileId: publicOta.firmwareFileId || "",
      firmwareFileName: publicOta.firmwareFileName || "",
      hardwareTarget: publicOta.hardwareTarget,
      partitionTarget: publicOta.partitionTarget,
      minimumProtocolVersion: Number(publicOta.minimumProtocolVersion),
      expiresAt: publicOta.expiresAt,
      status: normalizeDeviceOtaStatus(publicOta.status),
      createdAt: publicOta.createdAt,
      updatedAt: publicOta.updatedAt,
    };
  } else {
    delete safeDevice.ota;
    delete safeDevice.otaStatus;
  }
  const durableLatestCommand = (Array.isArray(db?.deviceCommands) ? db.deviceCommands : [])
    .filter((command) => command.deviceId === device.id)
    .sort((left, right) => String(right.issuedAt || "").localeCompare(String(left.issuedAt || "")))[0];
  if (durableLatestCommand || device.lastCommand) {
    safeDevice.lastCommand = publicDeviceCommand(durableLatestCommand || device.lastCommand);
  }
  return {
    ...safeDevice,
    online: Boolean(getAuthenticatedDeviceSocket(device)),
  };
}

function publicProvisionedDeviceReceipt(device) {
  return copyOwnFields(publicDevice(device), DEVICE_PROVISION_RECEIPT_FIELDS);
}

function publicPairedDeviceReceipt(device) {
  return copyOwnFields(publicDevice(device), DEVICE_PAIR_RECEIPT_FIELDS);
}

function deviceOwnershipExpectation(device = {}) {
  return {
    organizationId: readString(device.organizationId, 120),
    ownershipState: inferDeviceOwnershipState(device),
    ownerUserId: readString(device.ownerUserId || device.pairedUserId, 160),
    assignedPatientId: readString(device.assignedPatientId, 160),
    revokedAt: readString(device.revokedAt, 80),
  };
}

function publicDevices(devices) {
  return devices.map(publicDevice);
}

function normalizeDevicePairingMethod(value, hasClaimCode = false) {
  const normalized = readString(value, 60).trim().toLowerCase();
  if (!normalized) return hasClaimCode ? "QR" : "Manual";
  if (normalized === "qr") return "QR";
  if (normalized === "manual") return "Manual";
  throw httpError(
    400,
    "Chỉ hỗ trợ ghép thiết bị bằng QR hoặc mã thủ công",
    "DEVICE_PAIRING_METHOD_UNSUPPORTED",
  );
}

function getAuthenticatedDeviceSocket(device) {
  if (!device || device.revokedAt || device.status === "revoked") return null;
  const socket = deviceSockets.get(device.id);
  if (
    !socket ||
    socket._deviceAuth?.deviceId !== device.id ||
    readString(socket._deviceAuth?.organizationId, 120) !== readString(device.organizationId, 120) ||
    !socket.writable ||
    socket.destroyed
  ) {
    return null;
  }
  return socket;
}

function createDevicePairingState(device) {
  const authenticatedSocket = getAuthenticatedDeviceSocket(device);
  const onlineConfirmed = Boolean(authenticatedSocket);
  return {
    outcome: onlineConfirmed ? "success" : "accepted",
    presence: onlineConfirmed ? "online" : "awaiting_online",
    onlineConfirmed,
    authenticatedTransport: onlineConfirmed ? "wss" : null,
  };
}

function getIdempotencyKey(req, payload = {}) {
  return readString(req.headers["idempotency-key"] || payload.idempotencyKey, 160);
}

function getRequiredHeaderIdempotencyKey(req, mutationLabel) {
  const raw = req.headers["idempotency-key"];
  if (Array.isArray(raw)) {
    throw httpError(
      400,
      `Idempotency-Key must be a single header for ${mutationLabel}`,
      "IDEMPOTENCY_KEY_INVALID",
    );
  }
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) {
    throw httpError(
      400,
      `Idempotency-Key is required for ${mutationLabel}`,
      "IDEMPOTENCY_KEY_REQUIRED",
    );
  }
  if (value.length > 160 || value.includes(",")) {
    throw httpError(
      400,
      `Idempotency-Key is invalid for ${mutationLabel}`,
      "IDEMPOTENCY_KEY_INVALID",
    );
  }
  return value;
}

function getRequiredPatientAuthorityHeader(req, headerName, fieldLabel) {
  const raw = req.headers[headerName];
  if (Array.isArray(raw)) {
    throw httpError(
      400,
      `Patient mutation ${fieldLabel} must be a single header`,
      "PATIENT_MUTATION_AUTHORITY_INVALID",
    );
  }
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) {
    throw httpError(
      400,
      `Patient mutation ${fieldLabel} is required`,
      "PATIENT_MUTATION_AUTHORITY_REQUIRED",
    );
  }
  if (value.length > 160 || value.includes(",")) {
    throw httpError(
      400,
      `Patient mutation ${fieldLabel} is invalid`,
      "PATIENT_MUTATION_AUTHORITY_INVALID",
    );
  }
  return value;
}

function requirePatientMutationAuthority(req, user) {
  if (!isPatientUser(user)) return null;
  const expectedUserId = getRequiredPatientAuthorityHeader(
    req,
    "x-shcare-expected-user-id",
    "account authority",
  );
  const expectedWorkspaceId = getRequiredPatientAuthorityHeader(
    req,
    "x-shcare-expected-workspace-id",
    "workspace authority",
  );
  const expectedAuthSessionId = getRequiredPatientAuthorityHeader(
    req,
    "x-shcare-expected-auth-session-id",
    "authentication-session authority",
  );
  const currentWorkspaceId =
    getUserWorkspaceContext(user).currentWorkspaceId ||
    readString(user.organizationId, 120);
  const currentAuthSessionId = readString(req.authSession?.id, 160);
  if (
    expectedUserId !== user.id ||
    !currentWorkspaceId ||
    expectedWorkspaceId !== currentWorkspaceId ||
    !currentAuthSessionId ||
    expectedAuthSessionId !== currentAuthSessionId
  ) {
    throw httpError(
      409,
      "Patient mutation authority changed before dispatch",
      "PATIENT_MUTATION_AUTHORITY_MISMATCH",
    );
  }
  return { expectedUserId, expectedWorkspaceId, expectedAuthSessionId };
}

function getRequiredAvatarMutationAuthorityHeader(req, headerName) {
  const raw = req.headers[headerName];
  if (Array.isArray(raw)) {
    throw httpError(
      400,
      "Avatar mutation authority headers must be singular",
      "AVATAR_MUTATION_AUTHORITY_INVALID",
    );
  }
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) {
    throw httpError(
      400,
      "Avatar mutation requires exact account, workspace and auth-session authority",
      "AVATAR_MUTATION_AUTHORITY_REQUIRED",
    );
  }
  if (value.length > 160 || value.includes(",")) {
    throw httpError(
      400,
      "Avatar mutation authority is invalid",
      "AVATAR_MUTATION_AUTHORITY_INVALID",
    );
  }
  return value;
}

function resolveAvatarMutationAuthority(
  req,
  user,
  organizationId,
  canonicalRequest,
) {
  const userId = readString(user?.id, 160);
  const workspaceId = readString(organizationId, 160);
  const authSessionId = readString(req.authSession?.id, 160);
  if (!userId || !workspaceId || !authSessionId) {
    throw httpError(
      409,
      "Avatar mutation authentication authority is no longer current",
      "AUTH_SESSION_REPLACED",
    );
  }
  if (canonicalRequest) {
    const expectedUserId = getRequiredAvatarMutationAuthorityHeader(
      req,
      "x-shcare-expected-user-id",
    );
    const expectedWorkspaceId = getRequiredAvatarMutationAuthorityHeader(
      req,
      "x-shcare-expected-workspace-id",
    );
    const expectedAuthSessionId = getRequiredAvatarMutationAuthorityHeader(
      req,
      "x-shcare-expected-auth-session-id",
    );
    if (
      expectedUserId !== userId ||
      expectedWorkspaceId !== workspaceId ||
      expectedAuthSessionId !== authSessionId
    ) {
      throw httpError(
        409,
        "Avatar mutation authority changed before dispatch",
        "AUTH_SESSION_REPLACED",
      );
    }
  }
  return { userId, workspaceId, authSessionId };
}

function getIdempotencyScope(user, organizationId = "") {
  const actorId = user ? user.id : "anonymous";
  const workspaceId = readString(organizationId, 120);
  return workspaceId ? `${actorId}:${workspaceId}` : actorId;
}

function stableJsonValue(value) {
  if (Array.isArray(value)) return value.map(stableJsonValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => key !== "idempotencyKey")
      .sort()
      .map((key) => [key, stableJsonValue(value[key])]),
  );
}

function createIdempotencyFingerprint(payload = {}) {
  return crypto.createHash("sha256").update(JSON.stringify(stableJsonValue(payload))).digest("hex");
}

function findIdempotentResource(user, key, operation, options = {}) {
  if (!key) {
    return null;
  }

  const scope = getIdempotencyScope(user, options.organizationId);
  const entry = db.idempotencyKeys.find(
    (item) => item.key === key && item.scope === scope && item.operation === operation
  );
  if (!entry) {
    return null;
  }

  entry.lastSeenAt = nowIso();
  const fingerprint = readString(options.fingerprint, 128);
  if (fingerprint && entry.fingerprint && entry.fingerprint !== fingerprint) {
    throw httpError(
      409,
      "Idempotency-Key was already used with a different request payload",
      "IDEMPOTENCY_KEY_REUSED",
    );
  }
  if (entry.resourceType === "scan") {
    return findScan(entry.resourceId);
  }
  if (entry.resourceType === "appointment") {
    return entry.responseResource && typeof entry.responseResource === "object"
      ? { ...entry.responseResource }
      : findAppointment(entry.resourceId);
  }
  if (entry.resourceType === "device_pairing") {
    return entry.responseResource && typeof entry.responseResource === "object"
      ? { ...entry.responseResource }
      : null;
  }
  if (entry.resourceType === "device_command") {
    return entry.responseResource && typeof entry.responseResource === "object"
      ? { ...entry.responseResource }
      : null;
  }
  if (entry.resourceType === "ai_chat") {
    return entry.responseResource && typeof entry.responseResource === "object"
      ? { ...entry.responseResource }
      : null;
  }
  return null;
}

function rememberIdempotentResource(user, key, operation, resourceType, resourceId, options = {}) {
  if (!key) {
    return;
  }

  const scope = getIdempotencyScope(user, options.organizationId);
  const existing = db.idempotencyKeys.find(
    (item) => item.key === key && item.scope === scope && item.operation === operation
  );

  if (existing) {
    existing.resourceType = resourceType;
    existing.resourceId = resourceId;
    existing.fingerprint = readString(options.fingerprint, 128) || existing.fingerprint || "";
    existing.responseStatus = Number(options.responseStatus || existing.responseStatus || 200);
    if (options.responseResource && typeof options.responseResource === "object") {
      existing.responseResource = { ...options.responseResource };
    }
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
    fingerprint: readString(options.fingerprint, 128),
    responseStatus: Number(options.responseStatus || 200),
    responseResource:
      options.responseResource && typeof options.responseResource === "object"
        ? { ...options.responseResource }
        : undefined,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    lastSeenAt: nowIso(),
  });
  db.idempotencyKeys = db.idempotencyKeys.slice(0, 500);
}

function getScanMutationWorkspaceId(user, payload = {}, scan = null) {
  if (scan) return readString(scan.organizationId || getScanOrgId(scan), 120);
  const workspace = getUserWorkspaceContext(user);
  return readString(
    workspace.currentWorkspaceId || payload.organizationId || user?.organizationId,
    120,
  );
}

function createScanMutationFingerprint({ operation, user, organizationId, scanId = "", payload = {} }) {
  return createIdempotencyFingerprint({
    contractVersion: 1,
    operation,
    actorUserId: readString(user?.id, 120),
    organizationId: readString(organizationId, 120),
    scanId: readString(scanId, 120),
    payload,
  });
}

function getRequiredScanSocketIdempotencyKey(message, mutationLabel) {
  const raw = message?.idempotencyKey;
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) {
    throw httpError(
      400,
      `Idempotency-Key is required for ${mutationLabel}`,
      "IDEMPOTENCY_KEY_REQUIRED",
    );
  }
  if (value.length > 160 || value.includes(",")) {
    throw httpError(
      400,
      `Idempotency-Key is invalid for ${mutationLabel}`,
      "IDEMPOTENCY_KEY_INVALID",
    );
  }
  return value;
}

async function runScanMutationIdempotently({
  user,
  idempotencyKey,
  operation,
  organizationId,
  fingerprint,
  action,
}) {
  const replay = findIdempotentResource(user, idempotencyKey, operation, {
    organizationId,
    fingerprint,
  });
  if (replay) return { resource: replay, replayed: true };

  const inFlightKey = `${getIdempotencyScope(user, organizationId)}:${operation}:${idempotencyKey}`;
  const active = scanMutationInFlight.get(inFlightKey);
  if (active) {
    if (active.fingerprint !== fingerprint) {
      throw httpError(
        409,
        "Idempotency-Key was already used with a different request payload",
        "IDEMPOTENCY_KEY_REUSED",
      );
    }
    const outcome = await active.promise;
    return { resource: outcome.resource, replayed: true };
  }

  const promise = (async () => {
    const durableReplay = findIdempotentResource(user, idempotencyKey, operation, {
      organizationId,
      fingerprint,
    });
    if (durableReplay) return { resource: durableReplay, replayed: true };
    const resource = await action();
    rememberIdempotentResource(
      user,
      idempotencyKey,
      operation,
      "scan",
      resource.id,
      { organizationId, fingerprint, responseStatus: 200 },
    );
    await saveDb();
    return { resource, replayed: false };
  })();
  scanMutationInFlight.set(inFlightKey, { fingerprint, promise });
  try {
    return await promise;
  } finally {
    if (scanMutationInFlight.get(inFlightKey)?.promise === promise) {
      scanMutationInFlight.delete(inFlightKey);
    }
  }
}

function normalizeDateOfBirth(payload = {}, currentValue = "") {
  const hasCanonical = Object.prototype.hasOwnProperty.call(payload, "dateOfBirth");
  const hasAlias = Object.prototype.hasOwnProperty.call(payload, "dob");
  if (!hasCanonical && !hasAlias) return currentValue || "";
  const value = readString(hasCanonical ? payload.dateOfBirth : payload.dob, 40);
  if (!value) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw httpError(400, "Ngày sinh phải có định dạng YYYY-MM-DD", "PATIENT_DATE_OF_BIRTH_INVALID");
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value || parsed.getTime() > Date.now()) {
    throw httpError(400, "Ngày sinh không hợp lệ", "PATIENT_DATE_OF_BIRTH_INVALID");
  }
  return value;
}

function ageFromDateOfBirth(dateOfBirth) {
  if (!dateOfBirth) return null;
  const birth = new Date(`${dateOfBirth}T00:00:00.000Z`);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getUTCFullYear() - birth.getUTCFullYear();
  const monthDelta = today.getUTCMonth() - birth.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && today.getUTCDate() < birth.getUTCDate())) age -= 1;
  return Math.max(0, age);
}

function normalizeBloodType(value, currentValue = "") {
  if (value === undefined) return currentValue || "";
  const normalized = readString(value, 20).toUpperCase();
  if (!normalized) return "";
  if (normalized === "UNKNOWN") return "unknown";
  if (!["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].includes(normalized)) {
    throw httpError(400, "Nhóm máu không hợp lệ", "PATIENT_BLOOD_TYPE_INVALID");
  }
  return normalized;
}

function normalizeAllergies(value, currentValue = []) {
  if (value === undefined) return Array.isArray(currentValue) ? currentValue : [];
  if (!Array.isArray(value)) {
    throw httpError(400, "Danh sách dị ứng phải là một mảng", "PATIENT_ALLERGIES_INVALID");
  }
  return Array.from(new Set(value.map((item) => readString(item, 160)).filter(Boolean))).slice(0, 100);
}

function normalizeEmergencyContact(value, currentValue = {}) {
  if (value === undefined) {
    return currentValue && typeof currentValue === "object" && !Array.isArray(currentValue) ? currentValue : {};
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw httpError(400, "Liên hệ khẩn cấp không hợp lệ", "PATIENT_EMERGENCY_CONTACT_INVALID");
  }
  return {
    name: readString(value.name, 160),
    phone: readString(value.phone, 40),
    relationship: readString(value.relationship, 80),
  };
}

function createPatientRecord(payload = {}, options = {}) {
  const createdAt = nowIso();
  const dateOfBirth = normalizeDateOfBirth(payload);
  const patient = {
    id: createId("pat"),
    patientCode: readString(payload.patientCode, 80) || `PAT-${createdAt.slice(0, 10).replace(/-/g, "")}`,
    name: localizePatientName(payload.name) || "Bệnh nhân chưa xác định",
    age: dateOfBirth ? ageFromDateOfBirth(dateOfBirth) : readOptionalNumber(payload.age),
    dateOfBirth,
    bloodType: normalizeBloodType(payload.bloodType),
    allergies: normalizeAllergies(payload.allergies),
    emergencyContact: normalizeEmergencyContact(payload.emergencyContact),
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

  if (options.addToRuntime !== false) db.patients.unshift(patient);
  return patient;
}

function updatePatientRecord(patient, payload = {}, options = {}) {
  const fields = [
    "patientCode",
    "name",
    "gender",
    "phone",
    "email",
    "address",
    "notes",
    "relationship",
    "primaryDoctorId",
    "doctorName",
  ];

  if (options.allowAdministrativeFields) {
    fields.push("profileType", "familyGroupId", "guardianUserId", "accountUserId");
  }

  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      patient[field] = readString(payload[field], field === "notes" ? 2000 : 240);
    }
  }

  const hasDateOfBirth =
    Object.prototype.hasOwnProperty.call(payload, "dateOfBirth") ||
    Object.prototype.hasOwnProperty.call(payload, "dob");
  if (hasDateOfBirth) {
    patient.dateOfBirth = normalizeDateOfBirth(payload, patient.dateOfBirth);
    patient.age = patient.dateOfBirth ? ageFromDateOfBirth(patient.dateOfBirth) : null;
  } else if (Object.prototype.hasOwnProperty.call(payload, "age") && !patient.dateOfBirth) {
    patient.age = readOptionalNumber(payload.age);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "bloodType")) {
    patient.bloodType = normalizeBloodType(payload.bloodType, patient.bloodType);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "allergies")) {
    patient.allergies = normalizeAllergies(payload.allergies, patient.allergies);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "emergencyContact")) {
    patient.emergencyContact = normalizeEmergencyContact(payload.emergencyContact, patient.emergencyContact);
  }

  patient.updatedAt = nowIso();
  return patient;
}

function getPatientStats(patientId, organizationId = "") {
  const canonicalWorkspaceId = readString(organizationId, 120);
  const scans = db.scans.filter(
    (scan) =>
      scan.patientId === patientId &&
      (!canonicalWorkspaceId || getScanOrgId(scan) === canonicalWorkspaceId),
  );
  const latest = scans.reduce((winner, scan) => {
    const time = scan.startedAt || scan.createdAt || "";
    if (!winner || time > (winner.startedAt || winner.createdAt || "")) {
      return scan;
    }
    return winner;
  }, null);

  return {
    scanCount: scans.length,
    lastScanAt: latest ? latest.startedAt || latest.createdAt || null : null,
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
    age: patient.dateOfBirth ? ageFromDateOfBirth(patient.dateOfBirth) : patient.age,
    primaryDoctorId: doctor?.id || readString(patient.primaryDoctorId, 120),
    doctorName: doctor?.name || readString(patient.doctorName, 160),
    ...getPatientStats(patient.id, patient.organizationId),
  };
}

const APPOINTMENT_TYPES = new Set(["remote_consultation", "clinic_visit", "measurement", "follow_up"]);
const APPOINTMENT_STATUSES = new Set(["scheduled", "confirmed", "completed", "cancelled", "no_show"]);
const APPOINTMENT_ACTIVE_STATUSES = new Set(["scheduled", "confirmed"]);
const APPOINTMENT_STATUS_TRANSITIONS = {
  scheduled: new Set(["confirmed", "cancelled", "no_show"]),
  confirmed: new Set(["completed", "cancelled", "no_show"]),
  completed: new Set(),
  cancelled: new Set(),
  no_show: new Set(),
};

function normalizeAppointmentType(value) {
  const type = readString(value, 60) || "remote_consultation";
  return APPOINTMENT_TYPES.has(type) ? type : "remote_consultation";
}

function normalizeAppointmentStatus(value, fallback = "scheduled") {
  const status = readString(value, 60) || fallback;
  if (!APPOINTMENT_STATUSES.has(status)) {
    throw httpError(400, `Unsupported appointment status: ${status}`, "APPOINTMENT_STATUS_INVALID");
  }
  return status;
}

function assertAppointmentStatusTransition(previousStatus, nextStatus) {
  const previous = normalizeAppointmentStatus(previousStatus || "scheduled");
  const next = normalizeAppointmentStatus(nextStatus, previous);
  if (next === previous) return;
  if (!APPOINTMENT_STATUS_TRANSITIONS[previous]?.has(next)) {
    throw httpError(
      409,
      `Appointment cannot transition from ${previous} to ${next}`,
      "APPOINTMENT_STATUS_TRANSITION_INVALID",
      { previousStatus: previous, nextStatus: next },
    );
  }
}

function parseAppointmentTime(value, label) {
  const raw = readString(value, 120);
  if (!raw) {
    throw httpError(400, `${label} is required`);
  }
  const time = new Date(raw);
  if (Number.isNaN(time.getTime())) {
    throw httpError(400, `${label} must be a valid ISO date`);
  }
  return time.toISOString();
}

function defaultAppointmentEnd(startsAt) {
  return new Date(Date.parse(startsAt) + 30 * 60 * 1000).toISOString();
}

function assertAppointmentWindow(startsAt, endsAt) {
  if (Date.parse(endsAt) <= Date.parse(startsAt)) {
    throw httpError(400, "Appointment end time must be after start time", "APPOINTMENT_TIME_WINDOW_INVALID");
  }
}

function assertAppointmentStartsInFuture(startsAt) {
  if (Date.parse(startsAt) <= Date.now()) {
    throw httpError(400, "Appointment start time must be in the future", "APPOINTMENT_START_IN_PAST");
  }
}

function assertAppointmentCancellationReason(status, cancellationReason) {
  if (status === "cancelled" && !readString(cancellationReason, 1000)) {
    throw httpError(400, "A cancellation reason is required", "APPOINTMENT_CANCELLATION_REASON_REQUIRED");
  }
}

function findAppointmentConflict(candidate, appointments = []) {
  if (!candidate || candidate.deletedAt || !APPOINTMENT_ACTIVE_STATUSES.has(candidate.status)) return null;
  const candidateStart = Date.parse(candidate.startsAt || "");
  const candidateEnd = Date.parse(candidate.endsAt || "");
  return appointments.find((appointment) => {
    if (!appointment || appointment.id === candidate.id) return false;
    if (appointment.deletedAt) return false;
    if (appointment.organizationId !== candidate.organizationId) return false;
    if (!APPOINTMENT_ACTIVE_STATUSES.has(appointment.status)) return false;
    const samePatient = Boolean(candidate.patientId && appointment.patientId === candidate.patientId);
    const sameDoctor = Boolean(candidate.doctorUserId && appointment.doctorUserId === candidate.doctorUserId);
    if (!samePatient && !sameDoctor) return false;
    const otherStart = Date.parse(appointment.startsAt || "");
    const otherEnd = Date.parse(appointment.endsAt || "");
    return candidateStart < otherEnd && candidateEnd > otherStart;
  }) || null;
}

async function assertNoAppointmentConflict(candidate) {
  const appointments = repositories && repositories.appointments
    ? await repositories.appointments.list({ organizationId: candidate.organizationId })
    : db.appointments;
  const conflict = findAppointmentConflict(candidate, appointments);
  if (!conflict) return;
  throw httpError(
    409,
    "Appointment time conflicts with another active appointment",
    "APPOINTMENT_TIME_CONFLICT",
    {
      conflictingAppointmentId: conflict.id,
      patientConflict: Boolean(candidate.patientId && conflict.patientId === candidate.patientId),
      doctorConflict: Boolean(candidate.doctorUserId && conflict.doctorUserId === candidate.doctorUserId),
    },
  );
}

function createAppointmentRecord(payload = {}) {
  const createdAt = nowIso();
  const startsAt = parseAppointmentTime(payload.startsAt, "startsAt");
  const endsAt = payload.endsAt ? parseAppointmentTime(payload.endsAt, "endsAt") : defaultAppointmentEnd(startsAt);
  assertAppointmentWindow(startsAt, endsAt);
  const status = normalizeAppointmentStatus(payload.status);
  if (status !== "scheduled") {
    throw httpError(409, "New appointments must start in scheduled status", "APPOINTMENT_INITIAL_STATUS_INVALID");
  }
  assertAppointmentStartsInFuture(startsAt);
  const appointment = {
    id: createId("appt"),
    organizationId: readString(payload.organizationId, 120) || "org_default_clinic",
    patientId: readString(payload.patientId, 120),
    doctorUserId: readString(payload.doctorUserId || payload.doctorId || payload.assignedDoctorId, 120),
    createdByUserId: readString(payload.createdByUserId, 120),
    type: normalizeAppointmentType(payload.type),
    status,
    startsAt,
    endsAt,
    location: readString(payload.location, 240),
    channel: readString(payload.channel, 80) || (normalizeAppointmentType(payload.type) === "remote_consultation" ? "video" : "clinic"),
    reason: readString(payload.reason, 1000),
    notes: readString(payload.notes, 2000),
    cancellationReason: readString(payload.cancellationReason, 1000),
    cancelledAt: status === "cancelled" ? createdAt : "",
    completedAt: status === "completed" ? createdAt : "",
    createdAt,
    updatedAt: createdAt,
  };
  return appointment;
}

function updateAppointmentRecord(appointment, payload = {}) {
  const nextAppointment = { ...appointment };
  if (Object.prototype.hasOwnProperty.call(payload, "patientId") && readString(payload.patientId, 120) !== appointment.patientId) {
    throw httpError(400, "Cannot move an appointment to another patient; create a new appointment instead");
  }
  for (const field of ["location", "reason", "notes", "cancellationReason"]) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      nextAppointment[field] = readString(payload[field], field === "notes" ? 2000 : 1000);
    }
  }
  if (Object.prototype.hasOwnProperty.call(payload, "type")) {
    nextAppointment.type = normalizeAppointmentType(payload.type);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "channel")) {
    nextAppointment.channel = readString(payload.channel, 80);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "doctorUserId") || Object.prototype.hasOwnProperty.call(payload, "doctorId")) {
    nextAppointment.doctorUserId = readString(payload.doctorUserId || payload.doctorId, 120);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "startsAt")) {
    const previousDuration = Math.max(0, Date.parse(appointment.endsAt || "") - Date.parse(appointment.startsAt || ""));
    nextAppointment.startsAt = parseAppointmentTime(payload.startsAt, "startsAt");
    if (!Object.prototype.hasOwnProperty.call(payload, "endsAt") && previousDuration > 0) {
      nextAppointment.endsAt = new Date(Date.parse(nextAppointment.startsAt) + previousDuration).toISOString();
    }
  }
  if (Object.prototype.hasOwnProperty.call(payload, "endsAt")) {
    nextAppointment.endsAt = parseAppointmentTime(payload.endsAt, "endsAt");
  }
  assertAppointmentWindow(nextAppointment.startsAt, nextAppointment.endsAt || defaultAppointmentEnd(nextAppointment.startsAt));
  if (Object.prototype.hasOwnProperty.call(payload, "startsAt") || Object.prototype.hasOwnProperty.call(payload, "endsAt")) {
    assertAppointmentStartsInFuture(nextAppointment.startsAt);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "status")) {
    const previous = appointment.status;
    const next = normalizeAppointmentStatus(payload.status, previous || "scheduled");
    assertAppointmentStatusTransition(previous, next);
    nextAppointment.status = next;
    if (nextAppointment.status === "cancelled" && previous !== "cancelled") {
      nextAppointment.cancelledAt = nowIso();
    }
    if (nextAppointment.status === "completed" && previous !== "completed") {
      nextAppointment.completedAt = nowIso();
    }
  }
  assertAppointmentCancellationReason(nextAppointment.status, nextAppointment.cancellationReason);
  nextAppointment.updatedAt = nowIso();
  return nextAppointment;
}

function findAppointment(appointmentId, options = {}) {
  const includeDeleted = options.includeDeleted === true;
  return db.appointments.find(
    (appointment) => appointment.id === appointmentId && (includeDeleted || !appointment.deletedAt),
  );
}

function publicAppointment(appointment) {
  const patient = findPatient(appointment.patientId);
  const doctor = appointment.doctorUserId
    ? db.users.find((user) => user.id === appointment.doctorUserId || user.firebaseUid === appointment.doctorUserId)
    : null;
  return {
    id: appointment.id,
    organizationId: appointment.organizationId || "",
    patientId: appointment.patientId || "",
    doctorUserId: appointment.doctorUserId || "",
    type: appointment.type || "remote_consultation",
    status: appointment.status || "scheduled",
    startsAt: appointment.startsAt || "",
    endsAt: appointment.endsAt || "",
    location: appointment.location || "",
    channel: appointment.channel || "",
    reason: appointment.reason || "",
    notes: appointment.notes || "",
    cancellationReason: appointment.cancellationReason || "",
    cancelledAt: appointment.cancelledAt || "",
    completedAt: appointment.completedAt || "",
    createdAt: appointment.createdAt || "",
    updatedAt: appointment.updatedAt || "",
    patient: patient
      ? {
          id: patient.id,
          patientCode: patient.patientCode || "",
          name: patient.name || "",
          organizationId: patient.organizationId || "",
        }
      : null,
    doctor: doctor
      ? {
          id: doctor.id,
          name: doctor.name || doctor.email || doctor.id,
          email: doctor.email || "",
          specialty: doctor.specialty || doctor.department || "",
        }
      : null,
  };
}

function canAccessAppointment(user, appointment) {
  if (!user || !appointment) {
    return false;
  }
  if (isPlatformAdminUser(user)) {
    return true;
  }
  const patient = appointment.patientId ? findPatient(appointment.patientId) : null;
  const isPatientOrGuardian = Boolean(
    patient &&
      (isPatientUser(user) || patient.ownerUserId === user.id || patient.guardianUserId === user.id),
  );
  if (isPatientOrGuardian && canAccessPatient(user, patient.id)) {
    return true;
  }
  const workspaceContext = getUserWorkspaceContext(user);
  return Boolean(
    appointment.organizationId &&
      appointment.organizationId === workspaceContext.currentWorkspaceId &&
      workspaceContext.currentMembership?.operational === true &&
      hasWorkspaceMembership(user, appointment.organizationId) &&
      hasAnyCapability(user, APPOINTMENT_VIEW_CAPABILITIES),
  );
}

function canManageAppointment(user, appointment) {
  return Boolean(
    appointment &&
      canAccessAppointment(user, appointment) &&
      hasAnyCapability(user, APPOINTMENT_MANAGE_CAPABILITIES),
  );
}

function assertCanAccessAppointment(user, appointment) {
  if (!canAccessAppointment(user, appointment)) {
    throw httpError(403, "Appointment is outside current user scope");
  }
}

function assertCanManageAppointment(user, appointment) {
  if (!canManageAppointment(user, appointment)) {
    throw httpError(403, "Cannot manage appointment in current scope");
  }
}

function filterAppointmentsForUser(user, appointments) {
  if (isPlatformAdminUser(user)) {
    return appointments;
  }
  return appointments.filter((appointment) => canAccessAppointment(user, appointment));
}

function validateAppointmentDoctor(doctorUserId, organizationId, actorUser) {
  const id = readString(doctorUserId, 120);
  if (!id) {
    return "";
  }
  const doctor = db.users.find((user) => (user.id === id || user.firebaseUid === id) && user.role === "doctor");
  if (!doctor) {
    throw httpError(404, "Doctor assigned to appointment was not found");
  }
  if (!hasWorkspaceMembership(doctor, organizationId)) {
    throw httpError(
      403,
      "Doctor assigned to appointment is outside the appointment workspace",
      "APPOINTMENT_DOCTOR_OUTSIDE_WORKSPACE",
    );
  }
  return doctor.id;
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
  "platform.exports.manage",
  "workspace.exports.manage",
  "workspace.assigned_data.export",
  "personal.data.export",
];
const AUDIT_LOG_VIEW_CAPABILITIES = ["platform.audit.view", "workspace.audit.view"];
const AUDIT_EXPORT_CAPABILITIES = ["platform.audit.export", "workspace.audit.export"];
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
const APPOINTMENT_VIEW_CAPABILITIES = [
  "platform.appointments.view",
  "platform.appointments.manage",
  "workspace.appointments.view",
  "workspace.appointments.manage",
  "personal.appointments.view",
  "personal.appointments.manage",
];
const APPOINTMENT_MANAGE_CAPABILITIES = [
  "platform.appointments.manage",
  "workspace.appointments.manage",
  "personal.appointments.manage",
];
const NOTIFICATION_MANAGE_CAPABILITIES = [
  "platform.settings.manage",
  "workspace.settings.manage",
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

function canUsePatientProfileAsActive(user, profile, workspaceId = "") {
  if (!user || !profile || profile.deletedAt) return false;
  const canonicalWorkspaceId =
    readString(workspaceId, 120) || readString(user.organizationId, 120);
  if (
    !canonicalWorkspaceId ||
    readString(profile.organizationId, 120) !== canonicalWorkspaceId
  ) {
    return false;
  }
  return [
    profile.ownerUserId,
    profile.accountUserId,
    profile.guardianUserId,
  ]
    .filter(Boolean)
    .includes(user.id);
}

function ensurePatientProfileForUser(user, workspaceId = "") {
  if (!isPatientUser(user)) {
    return null;
  }
  const lockedDoctorRequestTarget = isDoctorRoleRequestTargetLocked(user);
  const canonicalWorkspaceId =
    readString(workspaceId, 120) ||
    (lockedDoctorRequestTarget
      ? readString(getUserWorkspaceContext(user).currentWorkspaceId, 120)
      : readString(user.organizationId, 120));
  if (!canonicalWorkspaceId) {
    return null;
  }

  if (user.patientId) {
    const existing = findPatient(user.patientId);
    if (
      existing &&
      !existing.deletedAt &&
      readString(existing.organizationId, 120) === canonicalWorkspaceId &&
      (existing.accountUserId === user.id ||
        (existing.ownerUserId === user.id && (existing.profileType === "self" || existing.relationship === "self")) ||
        (!existing.ownerUserId && !existing.accountUserId))
    ) {
      existing.ownerUserId = existing.ownerUserId || user.id;
      existing.accountUserId = existing.accountUserId || user.id;
      existing.profileType = "self";
      existing.relationship = "self";
      const selectedProfile = user.activePatientId ? findPatient(user.activePatientId) : null;
      user.activePatientId = canUsePatientProfileAsActive(
        user,
        selectedProfile,
        canonicalWorkspaceId,
      )
        ? selectedProfile.id
        : existing.id;
      return existing;
    }
  }

  const email = readString(user.email, 160).toLowerCase();
  const phone = readString(user.phone, 40).replace(/\s/g, "");
  let patient = db.patients.find((item) => {
    if (item.deletedAt) {
      return false;
    }
    if (readString(item.organizationId, 120) !== canonicalWorkspaceId) {
      return false;
    }
    if (
      item.accountUserId !== user.id &&
      !(item.ownerUserId === user.id && (item.profileType === "self" || item.relationship === "self"))
    ) {
      return false;
    }
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
      organizationId: canonicalWorkspaceId,
      notes: "Patient profile created for app account",
    });
  }

  user.patientId = patient.id;
  const selectedProfile = user.activePatientId ? findPatient(user.activePatientId) : null;
  user.activePatientId = canUsePatientProfileAsActive(
    user,
    selectedProfile,
    canonicalWorkspaceId,
  )
    ? selectedProfile.id
    : patient.id;
  patient.ownerUserId = user.id;
  patient.accountUserId = patient.accountUserId || user.id;
  patient.profileType = "self";
  patient.relationship = "self";
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
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

function getPatientShareStatus(grant) {
  if (grant?.revokedAt) return "revoked";
  if (grant?.expiresAt) {
    const expiresAt = Date.parse(grant.expiresAt);
    if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) return "expired";
  }
  return "active";
}

function derivePatientShareAuthorityType(actor, patient, doctorUserId = "") {
  const patientPrincipalIds = new Set(
    [patient?.ownerUserId, patient?.accountUserId, patient?.guardianUserId].filter(Boolean),
  );
  if (
    actor &&
    actor.role === "patient" &&
    patientPrincipalIds.has(actor.id)
  ) {
    return "patient_consent";
  }
  return doctorUserId ? "clinician_access_grant" : "administrative_assignment";
}

function resolvePatientShareAuthorityType(grant) {
  if (
    [
      "patient_consent",
      "clinician_access_grant",
      "administrative_assignment",
    ].includes(grant?.authorityType)
  ) {
    return grant.authorityType;
  }
  const patient = findPatient(grant?.patientId);
  const grantor = db.users.find((item) => item.id === grant?.grantedByUserId) || null;
  return derivePatientShareAuthorityType(
    grantor,
    patient,
    grant?.doctorUserId || grant?.doctorId || "",
  );
}

function patientShareActorSummary(userId) {
  const actor = db.users.find((item) => item.id === userId) || null;
  if (!actor) return null;
  return {
    id: actor.id,
    name: actor.name || actor.email || actor.id,
    role: normalizeWorkspaceRole(actor.role || ""),
  };
}

function publicPatientShare(grant) {
  const authorityType = resolvePatientShareAuthorityType(grant);
  const doctorUserId = grant.doctorUserId || grant.doctorId || "";
  const doctor = doctorUserId
    ? db.users.find((item) => item.id === doctorUserId) || null
    : null;
  const workspace = grant.organizationId ? getClinicById(grant.organizationId) : null;
  const status = getPatientShareStatus(grant);
  return {
    ...grant,
    authorityType,
    purpose: grant.purpose || "",
    consentedAt:
      authorityType === "patient_consent"
        ? grant.consentedAt || grant.createdAt || ""
        : "",
    status,
    active: status === "active",
    recipient: doctorUserId
      ? {
          type: "doctor",
          id: doctorUserId,
          name: doctor?.name || doctor?.email || doctorUserId,
          workspaceId: doctor?.organizationId || "",
        }
      : {
          type: "workspace",
          id: grant.organizationId || "",
          name: workspace?.name || grant.organizationId || "",
          workspaceId: grant.organizationId || "",
        },
    grantedByActor: patientShareActorSummary(grant.grantedByUserId),
    revokedByActor: patientShareActorSummary(grant.revokedByUserId),
    audit: {
      grantedAt: grant.createdAt || "",
      grantedByUserId: grant.grantedByUserId || "",
      revokedAt: grant.revokedAt || "",
      revokedByUserId: grant.revokedByUserId || "",
    },
  };
}

function grantsPatientProfileAccess(grant) {
  return isActiveAccessGrant(grant) && grant.scope === "patient_profile";
}

function getDoctorPatientGrantIds(user) {
  if (
    !user ||
    !isApprovedActiveDoctorPrincipal(user)
  ) {
    return new Set();
  }
  return new Set(
    db.doctorPatientAccess
      .filter((grant) => (
        (grant.doctorUserId === user.id || grant.doctorId === user.id) &&
        grantsPatientProfileAccess(grant)
      ))
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
      .filter((grant) => grant.organizationId === workspaceId && grantsPatientProfileAccess(grant))
      .map((grant) => grant.patientId)
      .filter(Boolean),
  );
}

function getActivePatientGrantsForUser(user, patientId) {
  if (!user || !patientId) {
    return [];
  }
  const workspaceId = getUserWorkspaceContext(user).currentWorkspaceId;
  const canUseDirectDoctorGrant = isApprovedActiveDoctorPrincipal(user);
  const canUseWorkspaceScanGrant = hasAnyCapability(user, [
    "workspace.patients.view",
    "workspace.patients.manage",
  ]) && hasAnyCapability(user, [
    "workspace.scans.view",
    "workspace.scans.manage",
  ]);
  return db.doctorPatientAccess.filter((grant) => {
    if (grant.patientId !== patientId || !isActiveAccessGrant(grant)) {
      return false;
    }
    if (grant.doctorUserId === user.id || grant.doctorId === user.id) {
      return canUseDirectDoctorGrant;
    }
    return Boolean(
      canUseWorkspaceScanGrant &&
      workspaceId &&
      grant.organizationId === workspaceId
    );
  });
}

function hasDirectPatientAccess(user, patient) {
  if (!user || !patient) {
    return false;
  }
  if (patient.deletedAt) {
    return false;
  }
  if (isPlatformAdminUser(user)) {
    return true;
  }
  if (isPatientUser(user)) {
    const workspaceContext = getUserWorkspaceContext(user);
    const selfProfile = ensurePatientProfileForUser(
      user,
      workspaceContext.currentWorkspaceId,
    );
    return Boolean(
      (selfProfile && selfProfile.id === patient.id) ||
      [patient.ownerUserId, patient.accountUserId, patient.guardianUserId].includes(user.id),
    );
  }
  if ([patient.ownerUserId, patient.accountUserId, patient.guardianUserId].includes(user.id)) {
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
  if (
    [patient.ownerUserId, patient.accountUserId, patient.guardianUserId].includes(user.id) &&
    hasCapability(user, "personal.sharing.manage")
  ) {
    return true;
  }
  const workspaceId = getUserWorkspaceContext(user).currentWorkspaceId;
  return Boolean(
    patient.organizationId &&
    workspaceId === patient.organizationId &&
    canAccessPatient(user, patient.id) &&
    hasAnyCapability(user, SHARING_MANAGE_CAPABILITIES)
  );
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
      if (grant.scope === "patient_profile") return true;
      if (grant.scope === "selected_scans") return scanIds.includes(scan.id);
      return false;
    });
  }
  return false;
}

function canManagePatientScanCollection(user, patientId) {
  if (!user || !patientId) {
    return false;
  }
  const patient = findPatient(patientId);
  if (hasDirectPatientAccess(user, patient)) {
    return true;
  }
  const grants = getActivePatientGrantsForUser(user, patientId);
  return grants.some((grant) => grant.scope === "patient_profile");
}

function assertCanManagePatientScanCollection(user, patientId) {
  if (!canManagePatientScanCollection(user, patientId)) {
    throw httpError(403, "Patient scan collection is outside current user scope");
  }
}

function assertCanAccessScan(user, scan) {
  if (!canAccessScan(user, scan)) {
    throw httpError(403, "Scan is outside current user scope");
  }
}

function filterPatientsForUser(user, patients, workspaceId = "") {
  if (isPlatformAdminUser(user)) {
    return patients;
  }
  if (isPatientUser(user)) {
    const canonicalWorkspaceId =
      readString(workspaceId, 120) ||
      getUserWorkspaceContext(user).currentWorkspaceId ||
      readString(user.organizationId, 120);
    const patient = ensurePatientProfileForUser(user, canonicalWorkspaceId);
    return patient
      ? patients.filter(
          (item) =>
            !item.deletedAt &&
            readString(item.organizationId, 120) === canonicalWorkspaceId &&
            (
              item.id === patient.id ||
              [item.ownerUserId, item.accountUserId, item.guardianUserId].includes(user.id)
            ),
        )
      : [];
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
  return scans.filter((scan) => canAccessScan(user, scan));
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

function hasWorkspaceDeviceCapability(user, workspaceId, capabilities) {
  const targetWorkspaceId = readString(workspaceId, 120);
  if (!user || !targetWorkspaceId) {
    return false;
  }
  const membership = getUserMemberships(user).find(
    (candidate) => candidate.workspaceId === targetWorkspaceId && candidate.operational,
  );
  if (!membership) {
    return false;
  }
  const capabilitySet = new Set(getCapabilitiesForRole(membership.role));
  const workspace = getClinicById(targetWorkspaceId);
  if (
    workspace?.workspaceType === "solo_practice" &&
    workspace.ownerUserId === user.id &&
    normalizeWorkspaceRole(membership.role) === "doctor"
  ) {
    capabilitySet.add("workspace.devices.manage");
  }
  return capabilities.some((capability) => capabilitySet.has(capability));
}

function canAccessDevice(user, device) {
  if (!user || !device) {
    return false;
  }
  if (isPlatformAdminUser(user)) {
    return true;
  }
  const deviceWorkspaceId = getDeviceWorkspaceId(device);
  const isPersonalOwner = Boolean(
    isPatientUser(user) &&
    isActiveUserAccount(user) &&
    [device.ownerUserId, device.pairedUserId].includes(user.id),
  );
  if (
    isPersonalOwner &&
    hasWorkspaceDeviceCapability(user, deviceWorkspaceId, ["personal.devices.manage"])
  ) {
    return true;
  }
  if (device.pairedUserId && device.pairedUserId === user.id) {
    return hasWorkspaceDeviceCapability(user, deviceWorkspaceId, [
      "workspace.devices.view",
      "workspace.devices.manage",
    ]);
  }
  const workspaceContext = getUserWorkspaceContext(user);
  const isSameWorkspace = deviceWorkspaceId === workspaceContext.currentWorkspaceId;
  return (
    isSameWorkspace &&
    hasWorkspaceDeviceCapability(user, deviceWorkspaceId, [
      "workspace.devices.view",
      "workspace.devices.manage",
    ])
  );
}

function canManageDevice(user, device) {
  if (!canAccessDevice(user, device)) {
    return false;
  }
  if (isPlatformAdminUser(user)) {
    return true;
  }
  const deviceWorkspaceId = getDeviceWorkspaceId(device);
  const isPersonalOwner = Boolean(
    isPatientUser(user) &&
    isActiveUserAccount(user) &&
    [device.ownerUserId, device.pairedUserId].includes(user.id),
  );
  if (isPersonalOwner) {
    return hasWorkspaceDeviceCapability(user, deviceWorkspaceId, ["personal.devices.manage"]);
  }
  return hasWorkspaceDeviceCapability(user, deviceWorkspaceId, ["workspace.devices.manage"]);
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
    canAccessScan(user, scan) &&
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
  if (
    ["skipped", "skipped_preference", "disabled"].includes(
      readString(notification.inAppStatus, 40),
    )
  ) {
    return false;
  }
  if (notification.userId && notification.userId === user.id) {
    return !notification.organizationId || hasWorkspaceRelationship(user, notification.organizationId);
  }
  if (notification.organizationId) {
    return hasWorkspaceRelationship(user, notification.organizationId) && hasCapability(user, "notifications.view");
  }
  // There is no safe meaning for an implicit global audience. Platform
  // administrators are handled above; every other notification must bind to
  // an account or an operational workspace.
  return false;
}

function canTargetNotificationUser(actorUser, targetUser, organizationId = "") {
  if (!actorUser || !targetUser) {
    return false;
  }
  const workspaceId = readString(organizationId, 120) || getUserWorkspaceContext(actorUser).currentWorkspaceId || "";
  if (workspaceId) {
    return ["admin", "platform_admin"].includes(targetUser.role) || hasWorkspaceRelationship(targetUser, workspaceId);
  }
  return isPlatformAdminUser(actorUser) || targetUser.id === actorUser.id;
}

function filterNotificationsForUser(user, notifications) {
  const visibleNotifications = notifications.filter(
    (notification) =>
      !["skipped", "skipped_preference", "disabled"].includes(
        readString(notification?.inAppStatus, 40),
      ),
  );
  if (isPlatformAdminUser(user)) {
    return visibleNotifications;
  }
  return visibleNotifications.filter((notification) =>
    canAccessNotification(user, notification),
  );
}

function publicNotificationRecipient(notification) {
  const recipient = (db.users || []).find((candidate) => candidate.id === notification?.userId);
  return {
    ...notification,
    recipientName: recipient?.name || recipient?.email || notification?.userId || "",
    recipientEmail: recipient?.email || "",
  };
}

function requireNotificationInboxAuthority(user) {
  if (!user || !isActiveUserAccount(user)) {
    throw httpError(
      403,
      "An active account is required to access the notification inbox",
      "NOTIFICATION_INBOX_ACCOUNT_UNAVAILABLE",
    );
  }
  const workspaceContext = getUserWorkspaceContext(user);
  const workspaceId = readString(workspaceContext.currentWorkspaceId, 120);
  if (
    !workspaceId ||
    !workspaceContext.currentMembership?.operational ||
    !hasWorkspaceMembership(user, workspaceId)
  ) {
    throw httpError(
      403,
      "An active workspace membership is required to access the notification inbox",
      "NOTIFICATION_INBOX_WORKSPACE_REQUIRED",
    );
  }
  return {
    userId: user.id,
    workspaceId,
  };
}

function publicNotificationInboxMutation(result) {
  return {
    userId: result.userId,
    workspaceId: result.workspaceId,
    action: result.action,
    notification: result.notification || null,
    notifications: Array.isArray(result.notifications)
      ? result.notifications
      : [],
    affectedIds: Array.isArray(result.affectedIds)
      ? result.affectedIds
      : [],
    deletedId: result.deletedId || null,
    updatedAt: result.updatedAt,
    replayed: Boolean(result.replayed),
  };
}

const NOTIFICATION_AUDIENCE_ROLES = [
  "workspace_owner",
  "workspace_admin",
  "doctor",
  "nurse",
  "technician",
  "billing",
  "viewer",
  "patient",
];
const NOTIFICATION_CHANNELS = ["in_app", "email", "push"];

function getNotificationChannelAvailability() {
  const emailRuntime = getEmailRuntimeStatus();
  const emailEnabled = isNotificationEmailEnabled();
  const pushEnabled = isPushNotificationEnabled();
  const firebaseAdmin = pushEnabled ? getFirebaseAdmin(process.env) : null;
  const pushConfigured = Boolean(firebaseAdmin && typeof firebaseAdmin.messaging === "function");
  return {
    in_app: { available: true, status: "ready", provider: "backend" },
    email: {
      available: emailEnabled && emailRuntime.configured,
      status: !emailEnabled ? "disabled" : emailRuntime.configured ? "ready" : "unavailable",
      provider: emailRuntime.provider || "email",
      reasonCode: !emailEnabled
        ? "NOTIFICATION_EMAIL_DISABLED"
        : emailRuntime.configured
          ? ""
          : "NOTIFICATION_EMAIL_PROVIDER_UNAVAILABLE",
    },
    push: {
      available: pushEnabled && pushConfigured,
      status: !pushEnabled ? "disabled" : pushConfigured ? "ready" : "unavailable",
      provider: "fcm",
      reasonCode: !pushEnabled
        ? "PUSH_NOTIFICATIONS_DISABLED"
        : pushConfigured
          ? ""
          : "PUSH_PROVIDER_UNAVAILABLE",
    },
  };
}

function publicNotificationChannelAvailability() {
  const availability = getNotificationChannelAvailability();
  const channel = (value = {}) => ({
    available: Boolean(value.available),
    status: readString(value.status, 40) || "unavailable",
    reasonCode: readString(value.reasonCode, 120),
  });
  return {
    inApp: channel(availability.in_app),
    email: channel(availability.email),
    push: channel(availability.push),
  };
}

function publicCloudNotificationPreferences(value = {}) {
  const normalized = normalizeNotificationPreferences(value);
  return Object.fromEntries(
    CLOUD_NOTIFICATION_PREFERENCE_KEYS.map((key) => [key, Boolean(normalized[key])]),
  );
}

function buildNotificationPreferencesResponse(user, replayed = false) {
  const workspaceContext = getUserWorkspaceContext(user);
  const workspaceId = readString(workspaceContext.currentWorkspaceId, 120);
  return {
    userId: readString(user?.id, 120),
    workspaceId: workspaceId || null,
    ownership: {
      kind: "self",
      userId: readString(user?.id, 120),
    },
    preferences: publicCloudNotificationPreferences(user?.notificationPreferences),
    channels: publicNotificationChannelAvailability(),
    updatedAt: readString(user?.updatedAt, 80) || nowIso(),
    replayed: Boolean(replayed),
  };
}

function buildAccountProfilePersistencePatch(user) {
  return {
    name: user?.name || "",
    title: user?.title || "",
    phone: user?.phone || "",
    license: user?.license || "",
    hospital: user?.hospital || "",
    department: user?.department || "",
    specialty: user?.specialty || "",
    address: user?.address || "",
    avatarFileId: user?.avatarFileId || "",
    avatarUrl: user?.avatarUrl || "",
    avatarStorage:
      user?.avatarStorage && typeof user.avatarStorage === "object"
        ? user.avatarStorage
        : {},
    twoFactorEnabled: Boolean(user?.twoFactorEnabled),
    twoFactorMethod: user?.twoFactorMethod || "",
    notificationPreferences: normalizeNotificationPreferences(user?.notificationPreferences),
    activePatientId: user?.activePatientId || user?.patientId || "",
    organizationId: user?.organizationId || "",
  };
}

async function resolveCanonicalNotificationPreferenceDecision(notification) {
  const userId = readString(notification?.userId, 120);
  if (!userId) {
    return {
      user: null,
      allowed: true,
      preferenceKey: null,
      reasonCode: "",
    };
  }
  const runtimeUser = db.users.find((candidate) => candidate.id === userId) || { id: userId };
  const canonicalUser = await refreshAuthenticatedAuthorization(runtimeUser);
  if (!canonicalUser || !isActiveUserAccount(canonicalUser)) {
    return {
      user: canonicalUser || null,
      allowed: false,
      preferenceKey: null,
      reasonCode: "NOTIFICATION_RECIPIENT_UNAVAILABLE",
    };
  }
  return {
    user: canonicalUser,
    ...resolveNotificationPreferenceDecision(
      canonicalUser.notificationPreferences,
      notification,
    ),
  };
}

function normalizeNotificationAudienceRole(value) {
  const role = normalizeWorkspaceRole(readString(value, 80));
  return NOTIFICATION_AUDIENCE_ROLES.includes(role) ? role : "";
}

function getNotificationAudienceOptions(user) {
  const platformAdmin = isPlatformAdminUser(user);
  const currentWorkspaceId = getUserWorkspaceContext(user).currentWorkspaceId || "";
  const workspaces = db.organizations
    .filter(
      (workspace) =>
        !workspace.deletedAt &&
        String(workspace.status || "active").toLowerCase() === "active" &&
        (platformAdmin || workspace.id === currentWorkspaceId),
    )
    .map((workspace) => ({
      id: workspace.id,
      name: workspace.name || workspace.id,
      workspaceType: workspace.workspaceType || workspace.type || "clinic",
    }))
    .sort((left, right) => left.name.localeCompare(right.name, "vi"));
  const workspaceIds = new Set(workspaces.map((workspace) => workspace.id));
  const memberships = (db.memberships || []).filter(
    (membership) =>
      workspaceIds.has(membership.organizationId) &&
      String(membership.status || "active").toLowerCase() === "active",
  );
  const users = [];
  const seen = new Set();
  for (const membership of memberships) {
    const targetUser = (db.users || []).find((candidate) => candidate.id === membership.userId);
    if (!targetUser || !isActiveUserAccount(targetUser)) continue;
    const key = `${membership.organizationId}:${targetUser.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    users.push({
      id: targetUser.id,
      workspaceId: membership.organizationId,
      name: targetUser.name || targetUser.email || targetUser.id,
      email: targetUser.email || "",
      emailEligible: isDeliverableNotificationEmailAddress(targetUser.email),
      emailReasonCode: isDeliverableNotificationEmailAddress(targetUser.email)
        ? ""
        : "NOTIFICATION_EMAIL_RECIPIENT_NON_DELIVERABLE",
      role: normalizeNotificationAudienceRole(membership.role || targetUser.role) || "viewer",
    });
    if (users.length >= 500) break;
  }
  users.sort((left, right) => left.name.localeCompare(right.name, "vi"));
  return {
    audiences: { workspaces, roles: NOTIFICATION_AUDIENCE_ROLES, users },
    channels: getNotificationChannelAvailability(),
  };
}

function normalizeNotificationCampaignRequest(payload = {}) {
  const legacyUserId = readString(payload.userId, 120);
  const legacyWorkspaceId = readString(payload.organizationId, 120);
  const rawAudience = payload.audience && typeof payload.audience === "object" ? payload.audience : {};
  const type = readString(rawAudience.type, 40) || (legacyUserId ? "users" : legacyWorkspaceId ? "workspace" : "");
  if (!["workspace", "role", "users"].includes(type)) {
    throw httpError(
      400,
      "Audience type must be workspace, role or users",
      "NOTIFICATION_AUDIENCE_TYPE_INVALID",
    );
  }
  const channels = Array.from(
    new Set(
      (Array.isArray(payload.channels) ? payload.channels : [payload.channel || "in_app"])
        .map((channel) => readString(channel, 40).toLowerCase())
        .filter(Boolean),
    ),
  );
  if (channels.length === 0 || channels.some((channel) => !NOTIFICATION_CHANNELS.includes(channel))) {
    throw httpError(
      400,
      "Notification channels must contain in_app, email or push",
      "NOTIFICATION_CHANNEL_INVALID",
    );
  }
  const title = readString(payload.title, 180);
  const message = readString(payload.message, 2000);
  if (!title || !message) {
    throw httpError(
      400,
      "Cần nhập tiêu đề và nội dung thông báo",
      "NOTIFICATION_CONTENT_REQUIRED",
    );
  }
  const workspaceId = readString(rawAudience.workspaceId || legacyWorkspaceId, 120);
  const role = type === "role" ? normalizeNotificationAudienceRole(rawAudience.role) : "";
  const userIds = Array.from(
    new Set(
      (Array.isArray(rawAudience.userIds) ? rawAudience.userIds : legacyUserId ? [legacyUserId] : [])
        .map((id) => readString(id, 120))
        .filter(Boolean),
    ),
  ).sort();
  if (!workspaceId) {
    throw httpError(400, "Workspace audience is required", "NOTIFICATION_WORKSPACE_REQUIRED");
  }
  if (type === "role" && !role) {
    throw httpError(400, "A valid workspace role is required", "NOTIFICATION_AUDIENCE_ROLE_INVALID");
  }
  if (type === "users" && (userIds.length === 0 || userIds.length > 50)) {
    throw httpError(
      400,
      "User audience must contain 1-50 backend user ids",
      "NOTIFICATION_AUDIENCE_USERS_INVALID",
    );
  }
  return {
    type: parseNotificationCampaignType(readString(payload.type, 40) || "info"),
    title,
    message,
    channels,
    audience: { type, workspaceId, ...(role ? { role } : {}), ...(userIds.length ? { userIds } : {}) },
  };
}

function resolveNotificationCampaignAudience(actor, normalized) {
  const options = getNotificationAudienceOptions(actor);
  const workspace = options.audiences.workspaces.find(
    (candidate) => candidate.id === normalized.audience.workspaceId,
  );
  if (!workspace) {
    throw httpError(
      403,
      "Notification workspace is outside the current authority scope",
      "NOTIFICATION_WORKSPACE_FORBIDDEN",
    );
  }
  let users = options.audiences.users.filter((candidate) => candidate.workspaceId === workspace.id);
  if (normalized.audience.type === "role") {
    users = users.filter((candidate) => candidate.role === normalized.audience.role);
  } else if (normalized.audience.type === "users") {
    const requested = new Set(normalized.audience.userIds);
    users = users.filter((candidate) => requested.has(candidate.id));
    if (users.length !== requested.size) {
      throw httpError(
        403,
        "One or more notification users are outside the selected workspace",
        "NOTIFICATION_AUDIENCE_TENANT_MISMATCH",
      );
    }
  }
  if (users.length === 0) {
    throw httpError(
      409,
      "No active recipients match the selected audience",
      "NOTIFICATION_AUDIENCE_EMPTY",
    );
  }
  if (users.length > 200) {
    throw httpError(
      409,
      "Notification audience exceeds the 200-recipient campaign limit",
      "NOTIFICATION_AUDIENCE_TOO_LARGE",
    );
  }
  const channelAvailability = options.channels;
  const recipients = users.map((targetUser) => {
    const canonicalTarget = db.users.find((candidate) => candidate.id === targetUser.id);
    const preferenceDecision = resolveNotificationPreferenceDecision(
      canonicalTarget?.notificationPreferences,
      { type: normalized.type },
    );
    const requestedInApp = normalized.channels.includes("in_app");
    const requestedEmail = normalized.channels.includes("email");
    const requestedPush = normalized.channels.includes("push");
    return {
      userId: targetUser.id,
      inAppStatus:
        requestedInApp && preferenceDecision.allowed ? "ready" : "skipped",
      emailStatus: requestedEmail
        ? !preferenceDecision.allowed
          ? "skipped"
          : !targetUser.email || !targetUser.emailEligible
            ? "no_recipient"
            : channelAvailability.email.available
              ? "ready"
              : channelAvailability.email.status
        : "skipped",
      emailErrorMessage:
        requestedEmail && !preferenceDecision.allowed
          ? preferenceDecision.reasonCode
          : requestedEmail && (!targetUser.email || !targetUser.emailEligible)
            ? targetUser.emailReasonCode || "NOTIFICATION_EMAIL_RECIPIENT_NON_DELIVERABLE"
            : requestedEmail && !channelAvailability.email.available
              ? channelAvailability.email.reasonCode
              : "",
      pushStatus: requestedPush
        ? !preferenceDecision.allowed
          ? "skipped"
          : channelAvailability.push.available
            ? "ready"
            : channelAvailability.push.status
        : "skipped",
      pushErrorMessage:
        requestedPush && !preferenceDecision.allowed
          ? preferenceDecision.reasonCode
          : requestedPush && !channelAvailability.push.available
            ? channelAvailability.push.reasonCode
            : "",
    };
  });
  if (
    normalized.channels.length === 1 &&
    normalized.channels[0] === "email" &&
    !recipients.some((recipient) => recipient.emailStatus === "ready")
  ) {
    throw httpError(
      409,
      "No deliverable email recipients match the selected audience",
      "NOTIFICATION_EMAIL_AUDIENCE_EMPTY",
    );
  }
  return {
    workspace,
    users,
    recipients,
    channelAvailability,
  };
}

function filterExportsForUser(user, exportsList) {
  return exportsList.filter((exportJob) => {
    if (exportJob.dataset === "audit_logs" && !hasAnyCapability(user, AUDIT_EXPORT_CAPABILITIES)) {
      return false;
    }
    if (isPlatformAdminUser(user)) return true;
    if (!exportJob.organizationId || !isSameCurrentWorkspace(user, exportJob.organizationId)) {
      return false;
    }
    if (hasCapability(user, "workspace.exports.manage")) return true;
    return Boolean(exportJob.createdByUserId && exportJob.createdByUserId === user.id);
  });
}

function resolveExportScope(user, organizationId, dataset) {
  if (isPlatformAdminUser(user)) {
    return {
      kind: "platform",
      actorUserId: user.id,
      patientIds: [],
      restrictToPatientIds: false,
    };
  }
  if (!isSameCurrentWorkspace(user, organizationId)) {
    throw httpError(403, "The export workspace is outside the current workspace", "EXPORT_SCOPE_DENIED");
  }
  if (dataset === "audit_logs") {
    requireAnyCapability(user, AUDIT_EXPORT_CAPABILITIES, "Không có quyền xuất audit log của workspace");
    return {
      kind: "workspace",
      actorUserId: user.id,
      patientIds: [],
      restrictToPatientIds: false,
    };
  }
  if (hasCapability(user, "workspace.exports.manage")) {
    return {
      kind: "workspace",
      actorUserId: user.id,
      patientIds: [],
      restrictToPatientIds: false,
    };
  }
  if (hasCapability(user, "workspace.assigned_data.export")) {
    return {
      kind: "assigned_patients",
      actorUserId: user.id,
      patientIds: [...getDoctorPatientGrantIds(user)].sort(),
      restrictToPatientIds: true,
    };
  }
  if (hasCapability(user, "personal.data.export")) {
    const patientIds = filterPatientsForUser(user, db.patients)
      .filter((patient) => patient.organizationId === organizationId)
      .map((patient) => patient.id)
      .filter(Boolean)
      .sort();
    return {
      kind: "personal",
      actorUserId: user.id,
      patientIds,
      restrictToPatientIds: true,
    };
  }
  throw httpError(403, "Không có quyền xuất dữ liệu lâm sàng", "EXPORT_SCOPE_DENIED");
}

function publicExportJob(exportJob) {
  if (!exportJob) return null;
  const safeJob = {
    ...exportJob,
    workspaceId: exportJob.organizationId || "",
  };
  delete safeJob.snapshot;
  delete safeJob.protectedMetadata;
  return safeJob;
}

function normalizeExportDate(value, fieldName) {
  const date = readString(value, 10);
  if (!date) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw httpError(
      400,
      `${fieldName} must use YYYY-MM-DD`,
      "EXPORT_DATE_INVALID",
      { field: fieldName },
    );
  }
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw httpError(
      400,
      `${fieldName} is not a valid calendar date`,
      "EXPORT_DATE_INVALID",
      { field: fieldName },
    );
  }
  return date;
}

function normalizeExportDateRange(payload = {}) {
  const startDate = normalizeExportDate(payload.startDate, "startDate");
  const endDate = normalizeExportDate(payload.endDate, "endDate");
  if (Boolean(startDate) !== Boolean(endDate)) {
    throw httpError(
      400,
      "Both startDate and endDate are required when filtering an export",
      "EXPORT_DATE_RANGE_INCOMPLETE",
    );
  }
  if (startDate && endDate < startDate) {
    throw httpError(
      400,
      "endDate must be the same as or later than startDate",
      "EXPORT_DATE_RANGE_INVALID",
    );
  }
  return { startDate, endDate };
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
  const deviceId = resolveIncomingDeviceId(payload);
  if (!deviceId) {
    throw httpError(400, "Thiết bị là bắt buộc để bắt đầu lượt đo");
  }
  const device = findDevice(deviceId);
  if (!device) {
    throw httpError(404, "Không tìm thấy thiết bị ghi âm");
  }
  if (device.revokedAt || device.status === "revoked") {
    throw httpError(403, "Thiết bị đã bị thu hồi");
  }
  if (device.organizationId && patient.organizationId && device.organizationId !== patient.organizationId) {
    throw httpError(403, "Thiết bị và bệnh nhân phải thuộc cùng workspace");
  }
  if (actorUser) {
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
    audioProtocolVersion: 2,
    sampleCount: 0,
    durationSeconds: 0,
    peak: 0,
    rms: 0,
    levelPercent: 0,
    bpm: 0,
    aiLabel: "created",
    aiConfidence: null,
    aiSummary: "",
    processingGeneration: 0,
    processingIntent: "",
    processingArtifactFingerprint: "",
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

function scanAudioChunkDirectory(scanId) {
  const scanDigest = crypto.createHash("sha256").update(String(scanId || "")).digest("hex");
  return path.join(TMP_DIR, "scan-audio-chunks", scanDigest);
}

function scanAudioChunkRelativePath(scanId, sequence, sha256) {
  const absolutePath = path.join(
    scanAudioChunkDirectory(scanId),
    `${String(sequence).padStart(12, "0")}-${sha256}.pcm`,
  );
  return path.relative(DATA_DIR, absolutePath).split(path.sep).join("/");
}

function resolveScanAudioLedgerPath(relativePath) {
  const dataRoot = path.resolve(DATA_DIR);
  const resolved = path.resolve(DATA_DIR, ...String(relativePath || "").split("/"));
  if (resolved !== dataRoot && !resolved.startsWith(`${dataRoot}${path.sep}`)) {
    throw httpError(500, "Stored audio chunk path is outside the configured data directory", "SCAN_AUDIO_PATH_INVALID");
  }
  return resolved;
}

function parseScanAudioChunkHeaders(req) {
  const idempotencyKey = readString(req.headers["idempotency-key"], 160);
  if (!idempotencyKey) {
    throw httpError(400, "Idempotency-Key is required", "IDEMPOTENCY_KEY_REQUIRED");
  }
  const rawSequence = readString(req.headers["x-chunk-sequence"], 40);
  if (!/^\d+$/.test(rawSequence)) {
    throw httpError(400, "X-Chunk-Sequence must be a nonnegative integer", "SCAN_AUDIO_SEQUENCE_INVALID");
  }
  const sequence = Number(rawSequence);
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw httpError(400, "X-Chunk-Sequence must be a nonnegative integer", "SCAN_AUDIO_SEQUENCE_INVALID");
  }
  const sha256 = readString(req.headers["x-chunk-sha256"], 64).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sha256)) {
    throw httpError(400, "X-Chunk-SHA256 must contain a SHA-256 digest", "SCAN_AUDIO_SHA256_INVALID");
  }
  return { idempotencyKey, sequence, sha256 };
}

async function persistScanAudioChunkFile(scanId, sequence, sha256, chunkBuffer) {
  const relativePath = scanAudioChunkRelativePath(scanId, sequence, sha256);
  const absolutePath = resolveScanAudioLedgerPath(relativePath);
  await fs.promises.mkdir(path.dirname(absolutePath), { recursive: true });
  let created = false;
  try {
    await fs.promises.writeFile(absolutePath, chunkBuffer, { flag: "wx" });
    created = true;
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const existing = await fs.promises.readFile(absolutePath);
    const existingSha256 = crypto.createHash("sha256").update(existing).digest("hex");
    if (existing.length !== chunkBuffer.length || existingSha256 !== sha256) {
      throw httpError(
        409,
        "Stored audio chunk conflicts with the requested payload",
        "SCAN_AUDIO_FILE_CONFLICT",
      );
    }
  }
  return { relativePath, absolutePath, created };
}

async function appendScanAudioChunkUnsafe(scan, actorUser, metadata, chunkBuffer) {
  if (!chunkBuffer.length) {
    throw httpError(400, "Audio chunk is empty", "SCAN_AUDIO_CHUNK_EMPTY");
  }
  const actualSha256 = crypto.createHash("sha256").update(chunkBuffer).digest("hex");
  if (actualSha256 !== metadata.sha256) {
    throw httpError(422, "Audio chunk SHA-256 does not match the request body", "SCAN_AUDIO_SHA256_MISMATCH", {
      expectedSha256: metadata.sha256,
      actualSha256,
    });
  }
  if (!repositories?.scanAudioUploads) {
    throw httpError(503, "Scan audio upload repository is unavailable", "SCAN_AUDIO_REPOSITORY_UNAVAILABLE");
  }
  const persisted = await persistScanAudioChunkFile(scan.id, metadata.sequence, metadata.sha256, chunkBuffer);
  const organizationId = scan.organizationId || getScanOrgId(scan);
  let committed;
  try {
    committed = await repositories.scanAudioUploads.appendChunk({
      scanId: scan.id,
      organizationId,
      actorUserId: actorUser.id,
      idempotencyKey: metadata.idempotencyKey,
      sequence: metadata.sequence,
      sha256: metadata.sha256,
      byteSize: chunkBuffer.length,
      filePath: persisted.relativePath,
    });
  } catch (error) {
    // The file is written before the durable ledger because the ledger stores its
    // content-addressed path. Remove it only when no committed row references it;
    // this keeps an exact concurrent retry from deleting another request's file.
    try {
      const committedChunks = await repositories.scanAudioUploads.listChunks({
        scanId: scan.id,
        organizationId,
      });
      if (persisted.created && !committedChunks.some((chunk) => chunk.filePath === persisted.relativePath)) {
        await fs.promises.rm(persisted.absolutePath, { force: true });
      }
    } catch {
      // A repository outage is not permission to delete a possibly committed file.
      // The bounded scan-audio janitor can remove unreferenced paths later.
    }
    throw error;
  }
  return {
    scan,
    chunk: {
      id: committed.chunk.id,
      sequence: committed.chunk.sequence,
      sha256: committed.chunk.sha256,
      byteSize: committed.chunk.byteSize,
      createdAt: committed.chunk.createdAt,
    },
    uploadedBytes: committed.uploadedBytes,
    nextSequence: committed.nextSequence,
    replayed: committed.replayed,
  };
}

async function appendScanAudioChunk(scan, actorUser, metadata, chunkBuffer) {
  return scanAudioFileMutationExecutor.enqueue(scan.id, () =>
    appendScanAudioChunkUnsafe(scan, actorUser, metadata, chunkBuffer),
  );
}

async function materializeScanAudioChunks(scan, chunks) {
  const chunkFile = path.join(TMP_DIR, `${scan.id}.chunks.pcm`);
  const temporaryFile = `${chunkFile}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  try {
    await fs.promises.writeFile(temporaryFile, Buffer.alloc(0), { flag: "wx" });
    for (const chunk of chunks) {
      const chunkPath = resolveScanAudioLedgerPath(chunk.filePath);
      const payload = await fs.promises.readFile(chunkPath);
      const actualSha256 = crypto.createHash("sha256").update(payload).digest("hex");
      if (payload.length !== Number(chunk.byteSize) || actualSha256 !== chunk.sha256) {
        throw httpError(409, "Committed audio chunk failed integrity verification", "SCAN_AUDIO_CHUNK_INTEGRITY_FAILED", {
          sequence: chunk.sequence,
        });
      }
      await fs.promises.appendFile(temporaryFile, payload);
    }
    await fs.promises.rm(chunkFile, { force: true });
    await fs.promises.rename(temporaryFile, chunkFile);
    return chunkFile;
  } catch (error) {
    await fs.promises.rm(temporaryFile, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function purgeScanAudioChunkFiles(scanId) {
  await fs.promises.rm(scanAudioChunkDirectory(scanId), { recursive: true, force: true });
  await fs.promises.rm(path.join(TMP_DIR, `${scanId}.chunks.pcm`), { force: true });
}

async function purgeScanAudioChunkFilesBestEffort(scanId) {
  try {
    await purgeScanAudioChunkFiles(scanId);
  } catch (error) {
    console.warn(`Unable to purge committed scan-audio chunks for ${scanId}: ${error.message}`);
  }
}

async function completeUploadedScan(scan, chunkFile = path.join(TMP_DIR, `${scan.id}.chunks.pcm`)) {
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
  scan.processingGeneration = getAudioProcessingGeneration(scan, 1);
  scan.processingIntent = getAudioProcessingIntent(scan, "initial");
  scan.processingArtifactFingerprint = await buildAudioArtifactFingerprint(wavFilePath);
  scan.processingRunId = buildAudioProcessingRunId(scan, scan.processingArtifactFingerprint);
  await saveScanRecord(scan);

  if (
    await queueAudioProcessingIfAvailable(scan, wavFilePath, {
      processingGeneration: scan.processingGeneration,
      processingIntent: scan.processingIntent,
      artifactFingerprint: scan.processingArtifactFingerprint,
    })
  ) {
    broadcastScanEvent("scan_processing_queued", scan);
    return scan;
  }

  const processingResult = await runInlineAudioProcessing(scan, wavFilePath);
  const quality = processingResult.processed.quality;
  const audioFile = {
    id: `audio_${scan.id}`,
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
    id: deterministicAudioProcessingId("ai", scan.id, scan.processingRunId, SIGNAL_QUALITY_ANALYZER_VERSION),
    scanId: scan.id,
    modelVersion: SIGNAL_QUALITY_ANALYZER_VERSION,
    label: quality.label,
    confidence: quality.confidence,
    summary: quality.summary,
    rawResult: buildSignalQualityRawResult({
      quality,
      waveformObjectKey: processingResult.waveformObjectKey,
      processingGeneration: scan.processingGeneration,
      processingIntent: scan.processingIntent,
      processingRunId: scan.processingRunId,
      artifactFingerprint: scan.processingArtifactFingerprint,
    }),
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
  if (!repositories) {
    db.audioFiles = db.audioFiles.filter((item) => item.id !== audioFile.id && item.scanId !== scan.id);
    db.aiResults = db.aiResults.filter((item) => item.id !== aiResult.id && item.scanId !== scan.id);
    db.audioFiles.unshift(audioFile);
    db.aiResults.unshift(aiResult);
  }
  await saveAudioArtifacts(scan, audioFile, aiResult);
  broadcastScanEvent("scan_completed", scan);
  return scan;
}

async function completeUploadedScanIdempotently(scan, actorUser, idempotencyKey) {
  if (!repositories?.scanAudioUploads) {
    throw httpError(503, "Scan audio upload repository is unavailable", "SCAN_AUDIO_REPOSITORY_UNAVAILABLE");
  }
  const input = {
    scanId: scan.id,
    organizationId: scan.organizationId || getScanOrgId(scan),
    actorUserId: actorUser.id,
    idempotencyKey,
  };
  const begun = await repositories.scanAudioUploads.beginCompletion(input);
  if (begun.action === "replay") {
    await purgeScanAudioChunkFilesBestEffort(scan.id);
    return { response: begun.response, replayed: true };
  }
  const inFlightKey = `${scan.id}:${actorUser.id}:${idempotencyKey}`;
  if (begun.action === "in_progress") {
    const inFlight = scanAudioCompletionInFlight.get(inFlightKey);
    if (inFlight) {
      return { response: await inFlight, replayed: true };
    }
    if (scan.status === "completed" && scan.wavFile) {
      const response = { scan };
      await repositories.scanAudioUploads.finishCompletion({ ...input, response });
      await purgeScanAudioChunkFilesBestEffort(scan.id);
      return { response, replayed: true };
    }
    if (scan.status === "queued" && scan.wavFile && audioQueue?.enabled) {
      const wavFilePath = path.join(AUDIO_DIR, path.basename(scan.wavFile));
      await enqueueAudioProcessing(scan, wavFilePath);
      const response = { scan };
      await repositories.scanAudioUploads.finishCompletion({ ...input, response });
      await purgeScanAudioChunkFilesBestEffort(scan.id);
      return { response, replayed: true };
    }
    throw httpError(
      409,
      "Scan audio completion is already in progress",
      "SCAN_AUDIO_COMPLETION_IN_PROGRESS",
    );
  }

  const operation = (async () => {
    try {
      const materializedFile = await materializeScanAudioChunks(scan, begun.chunks);
      const completed = await completeUploadedScan(scan, materializedFile);
      const response = { scan: completed };
      await repositories.scanAudioUploads.finishCompletion({ ...input, response });
      await purgeScanAudioChunkFilesBestEffort(scan.id);
      return response;
    } catch (error) {
      await repositories.scanAudioUploads.failCompletion({
        ...input,
        errorCode: normalizeErrorCode(error?.code, Number(error?.statusCode || 500)),
        errorMessage: error?.message || "Audio completion failed",
      }).catch(() => undefined);
      throw error;
    }
  })();
  scanAudioCompletionInFlight.set(inFlightKey, operation);
  try {
    return { response: await operation, replayed: false };
  } finally {
    if (scanAudioCompletionInFlight.get(inFlightKey) === operation) {
      scanAudioCompletionInFlight.delete(inFlightKey);
    }
  }
}

function filterAuditLogsForUser(user, logs) {
  if (isPlatformAdminUser(user)) return logs;
  if (!hasAnyCapability(user, ["workspace.audit.view"])) return [];
  return logs.filter((log) => {
    if (log.actorUserId && log.actorUserId === user.id) return true;
    return log.organizationId && isSameCurrentWorkspace(user, log.organizationId);
  });
}

async function reprocessScanAudio(scan, options = {}) {
  if (!scan.wavFile) {
    throw httpError(400, "Lượt đo này chưa có file WAV để chạy lại AI");
  }

  const wavFilePath = path.join(AUDIO_DIR, path.basename(scan.wavFile));
  if (!fs.existsSync(wavFilePath)) {
    throw httpError(404, "Không tìm thấy file âm thanh để chạy lại AI");
  }

  const artifactFingerprint = await buildAudioArtifactFingerprint(wavFilePath);
  const existingGeneration = getAudioProcessingGeneration(scan, 0);
  const sameQueuedReprocessIntent =
    !options.forceNewProcessingIntent &&
    getAudioProcessingIntent(scan, "initial") === "reprocess" &&
    ["processing", "queued"].includes(scan.status || scan.processingStatus) &&
    (!scan.processingArtifactFingerprint ||
      scan.processingArtifactFingerprint === artifactFingerprint);
  const processingGeneration = sameQueuedReprocessIntent
    ? Math.max(1, existingGeneration)
    : Math.max(1, existingGeneration + 1);
  const processingRunId = buildAudioProcessingRunId({
    ...scan,
    processingGeneration,
    processingIntent: "reprocess",
  }, artifactFingerprint);
  Object.assign(scan, {
    status: "processing",
    processingStatus: "processing",
    processingGeneration,
    processingIntent: "reprocess",
    processingArtifactFingerprint: artifactFingerprint,
    processingRunId,
    updatedAt: nowIso(),
  });
  await saveScanRecord(scan);

  if (
    await queueAudioProcessingIfAvailable(scan, wavFilePath, {
      processingGeneration,
      processingIntent: "reprocess",
      artifactFingerprint,
    })
  ) {
    Object.assign(scan, {
      status: "queued",
      processingStatus: "queued",
      updatedAt: nowIso(),
    });
    await saveScanRecord(scan);
    broadcastScanEvent("scan_processing_queued", scan);
    return scan;
  }

  try {
    const processingResult = await runInlineAudioProcessing(scan, wavFilePath);
    const quality = processingResult.processed.quality;
    const existingAudioFile = repositories
      ? await repositories.audioFiles.findByScanId(scan.id)
      : db.audioFiles.find((file) => file.scanId === scan.id);
    const audioFile = Object.assign(existingAudioFile || {}, {
      id: existingAudioFile?.id || createId("audio"),
      scanId: scan.id,
      patientId: scan.patientId,
      storageProvider: processingResult.audioUpload.provider,
      objectKey: processingResult.audioObjectKey,
      contentType: "audio/wav",
      byteSize: processingResult.audioUpload.byteSize,
      sampleRate: scan.sampleRate || SAMPLE_RATE,
      createdAt: existingAudioFile?.createdAt || nowIso(),
      updatedAt: nowIso(),
    });
    const aiResult = {
      id: deterministicAudioProcessingId("ai", scan.id, processingRunId, SIGNAL_QUALITY_ANALYZER_VERSION),
      scanId: scan.id,
      modelVersion: SIGNAL_QUALITY_ANALYZER_VERSION,
      label: quality.label,
      confidence: quality.confidence,
      summary: quality.summary,
      rawResult: buildSignalQualityRawResult({
        quality,
        waveformObjectKey: processingResult.waveformObjectKey,
        reprocessed: true,
        processingGeneration,
        processingIntent: "reprocess",
        processingRunId,
        artifactFingerprint,
      }),
      status: "completed",
      createdAt: nowIso(),
    };

    if (!repositories) {
      if (!existingAudioFile) {
        db.audioFiles.unshift(audioFile);
      }
      db.aiResults.unshift(aiResult);
      db.audioFiles = db.audioFiles.slice(0, 500);
      db.aiResults = db.aiResults.slice(0, 500);
    }
    Object.assign(scan, {
      status: "completed",
      processingStatus: "completed",
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
    await saveAudioArtifacts(scan, audioFile, aiResult);
    broadcastScanEvent("scan_reprocessed", scan);
    return scan;
  } catch (error) {
    Object.assign(scan, {
      status: "failed",
      processingStatus: "failed",
      aiLabel: "processing_failed",
      aiSummary: error && error.message ? String(error.message) : "Không thể chạy lại AI",
      updatedAt: nowIso(),
    });
    await saveScanRecord(scan);
    throw error;
  }
}

async function deleteScanRecord(scan) {
  const relatedAudioFiles = db.audioFiles.filter((file) => file.scanId === scan.id);
  const relatedAiResults = db.aiResults.filter((result) => result.scanId === scan.id);
  const objectKeys = new Set(
    relatedAudioFiles
      .map((file) => readString(file.objectKey, 1000))
      .filter(Boolean),
  );
  for (const result of relatedAiResults) {
    const rawResult = result && typeof result.rawResult === "object" ? result.rawResult : {};
    const waveformObjectKey = readString(rawResult.waveformObjectKey, 1000);
    if (waveformObjectKey) {
      objectKeys.add(waveformObjectKey);
    }
  }

  if (objectKeys.size > 0) {
    if (!storageAdapter) {
      storageAdapter = createStorageAdapter({ dataDir: DATA_DIR, env: process.env });
    }
    for (const objectKey of objectKeys) {
      await storageAdapter.deleteObject(objectKey).catch((err) => {
        addAccessLog("Không thể xóa object của lượt đo", {
          severity: "warning",
          scanId: scan.id,
          objectKey,
          error: err && err.message ? err.message : String(err),
        });
      });
    }
  }

  if (scan.wavFile) {
    const wavFilePath = path.join(AUDIO_DIR, path.basename(scan.wavFile));
    await fs.promises.rm(wavFilePath, { force: true }).catch(() => undefined);
  }
  await fs.promises.rm(path.join(TMP_DIR, `${scan.id}.chunks.pcm`), { force: true }).catch(() => undefined);
  await fs.promises.rm(path.join(TMP_DIR, `${scan.id}.pcm`), { force: true }).catch(() => undefined);
  await fs.promises.rm(scanAudioChunkDirectory(scan.id), { recursive: true, force: true }).catch(() => undefined);

  if (repositories && repositories.scans && typeof repositories.scans.delete === "function") {
    await repositories.scans.delete(scan.id);
  } else {
    db.aiResults = db.aiResults.filter((result) => result.scanId !== scan.id);
    db.audioFiles = db.audioFiles.filter((file) => file.scanId !== scan.id);
    db.scans = db.scans.filter((item) => item.id !== scan.id);
    await saveDb();
  }
  broadcastScanEvent("scan_deleted", { id: scan.id, patientId: scan.patientId });
}

async function markRecordingStarted(recording, confirmationSource) {
  if (!recording || recording.confirmed) return findScan(recording?.scanId);
  const scan = findScan(recording.scanId);
  if (!scan || scan.status === "interrupted" || scan.status === "completed") return scan;
  recording.confirmed = true;
  recording.confirmedAt = nowIso();
  recording.confirmationSource = confirmationSource;
  if (recording.startExpiryTimer) {
    clearTimeout(recording.startExpiryTimer);
    recording.startExpiryTimer = null;
  }
  Object.assign(scan, {
    status: "recording",
    processingStatus: "recording",
    aiLabel: "recording",
    audioProtocolVersion: recording.protocolVersion || 2,
    audioSessionId: recording.sessionId,
    audioConfirmationSource: confirmationSource,
    audioConfirmedAt: recording.confirmedAt,
    updatedAt: recording.confirmedAt,
  });
  await saveScanRecord(scan);
  broadcastScanEvent("scan_started", scan);
  return scan;
}

async function confirmStartCommandFromAudioFrame(recording) {
  if (!recording?.startCommandId) return null;
  const command = await findDeviceCommand(recording.deviceId, recording.startCommandId);
  if (!command || ["failed", "expired"].includes(command.state)) return command;
  if (command.state === "accepted") {
    applyDeviceCommandDelivery(command, { websocket: true, mqtt: false, delivered: true });
  }
  if (command.state === "delivered") {
    transitionDeviceCommand(command, "acknowledged", {
      code: "AUDIO_FRAME_ACKNOWLEDGED",
      detail: "Authenticated audio v2 frame confirmed the device session",
    });
  }
  if (["acknowledged", "applying"].includes(command.state)) {
    transitionDeviceCommand(command, "applied", {
      code: "AUDIO_FRAME_CONFIRMED",
      detail: "Authenticated audio v2 frame confirmed the device session is active",
    });
  }
  await saveDeviceCommandRecord(command);
  await syncDeviceLastCommand(command);
  return command;
}

function confirmRecordingStartedFromFrame(recording) {
  if (!recording || recording.frameConfirmationInFlight || recording.confirmed) return;
  recording.frameConfirmationInFlight = true;
  void (async () => {
    try {
      await markRecordingStarted(recording, "audio_v2_frame");
      await confirmStartCommandFromAudioFrame(recording);
    } catch (error) {
      console.error(`Cannot confirm audio session ${recording.scanId} from frame: ${error.message}`);
      await interruptRecordingForDevice(
        recording.deviceId,
        "The audio session was interrupted because backend confirmation failed.",
      );
    } finally {
      recording.frameConfirmationInFlight = false;
    }
  })();
}

function scheduleAudioStartExpiry(recording, command) {
  const delayMs = Math.max(1, Date.parse(command.expiresAt) - Date.now() + 5);
  recording.startExpiryTimer = setTimeout(() => {
    void (async () => {
      const current = getActiveRecordingByScanId(recording.scanId);
      if (!current || current.confirmed) return;
      const durableCommand = await findDeviceCommand(recording.deviceId, command.id);
      if (durableCommand) {
        expireDeviceCommandIfOverdue(durableCommand, new Date(Date.parse(command.expiresAt) + 1));
        await saveDeviceCommandRecord(durableCommand);
      }
      await interruptRecordingForDevice(
        recording.deviceId,
        "The audio session was interrupted because the device did not confirm it before expiry.",
      );
    })().catch((error) => console.error(`Audio start expiry cleanup error: ${error.message}`));
  }, delayMs);
  recording.startExpiryTimer.unref?.();
}

function getScanStartOrganizationId(payload, actorUser) {
  const patientId = readString(payload?.patientId, 120);
  const patient = patientId ? findPatient(patientId) : null;
  return readString(
    patient?.organizationId || getScanMutationWorkspaceId(actorUser, payload),
    120,
  );
}

async function startScanIdempotently(payload, actorUser, idempotencyKey, requestPayload = payload) {
  const organizationId = getScanStartOrganizationId(payload, actorUser);
  const fingerprint = createScanMutationFingerprint({
    operation: "start_scan",
    user: actorUser,
    organizationId,
    payload: requestPayload,
  });
  return runScanMutationIdempotently({
    user: actorUser,
    idempotencyKey,
    operation: "start_scan",
    organizationId,
    fingerprint,
    action: () => startRecording(
      { ...payload, idempotencyKey },
      actorUser,
      { idempotencyKey, fingerprint },
    ),
  });
}

async function stopScanIdempotently(scan, actorUser, idempotencyKey, requestPayload = {}) {
  const organizationId = getScanMutationWorkspaceId(actorUser, {}, scan);
  const fingerprint = createScanMutationFingerprint({
    operation: "stop_scan",
    user: actorUser,
    organizationId,
    scanId: scan.id,
    payload: requestPayload,
  });
  return runScanMutationIdempotently({
    user: actorUser,
    idempotencyKey,
    operation: "stop_scan",
    organizationId,
    fingerprint,
    action: () => stopRecording(scan.id, {
      actorUser,
      idempotencyKey,
      requestFingerprint: fingerprint,
    }),
  });
}

async function stopActiveScanIdempotently(actorUser, idempotencyKey, requestPayload = {}) {
  const organizationId = getScanMutationWorkspaceId(actorUser, requestPayload);
  const operation = "stop_active_scan";
  const fingerprint = createScanMutationFingerprint({
    operation,
    user: actorUser,
    organizationId,
    payload: requestPayload,
  });
  return runScanMutationIdempotently({
    user: actorUser,
    idempotencyKey,
    operation,
    organizationId,
    fingerprint,
    action: () => stopActiveRecording(actorUser, {
      actorUser,
      idempotencyKey,
      requestFingerprint: fingerprint,
    }),
  });
}

async function startRecording(payload = {}, actorUser = null, mutation = {}) {
  if (getActiveRecordingForDevice(resolveIncomingDeviceId(payload))) {
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
  const deviceId = resolveIncomingDeviceId(payload);
  if (!deviceId) {
    throw httpError(400, "Thiết bị là bắt buộc để ghi âm");
  }
  const device = findDevice(deviceId);
  if (!device) {
    throw httpError(404, "Không tìm thấy thiết bị ghi âm");
  }
  if (device.revokedAt || device.status === "revoked") {
    throw httpError(403, "Thiết bị đã bị thu hồi");
  }
  if (device.organizationId && patient.organizationId && device.organizationId !== patient.organizationId) {
    throw httpError(403, "Thiết bị và bệnh nhân phải thuộc cùng workspace");
  }
  if (actorUser) {
    assertCanAccessDevice(actorUser, device);
  }
  const authenticatedDeviceSocket = deviceSockets.get(device.id);
  if (
    !authenticatedDeviceSocket ||
    authenticatedDeviceSocket._deviceAuth?.deviceId !== device.id ||
    !authenticatedDeviceSocket.writable ||
    authenticatedDeviceSocket.destroyed
  ) {
    throw httpError(409, "Thiết bị chưa có phiên xác thực trực tuyến");
  }

  const scan = {
    id: scanId,
    organizationId: patient.organizationId || (actorUser ? actorUser.organizationId : "") || "org_default_clinic",
    patientId: patient.id,
    patient: buildPatientSnapshot(patient),
    status: "created",
    mode,
    bodySite,
    deviceId,
    startedAt,
    endedAt: null,
    sampleRate: SAMPLE_RATE,
    channels: CHANNELS,
    bitsPerSample: BITS_PER_SAMPLE,
    audioProtocolVersion: 2,
    sampleCount: 0,
    durationSeconds: 0,
    peak: 0,
    rms: 0,
    levelPercent: 0,
    bpm: 0,
    aiLabel: "created",
    aiConfidence: null,
    aiSummary: "",
    processingGeneration: 0,
    processingIntent: "",
    processingArtifactFingerprint: "",
    processingStatus: "created",
    doctorNotes: readString(payload.doctorNotes || payload.notes, 4000),
    createdByUserId: actorUser ? actorUser.id : "",
    idempotencyKey: readString(mutation.idempotencyKey || payload.idempotencyKey, 160),
    audioUrl: null,
    wavFile: null,
    createdAt: startedAt,
    updatedAt: startedAt,
  };

  const audioSessionId = createId("audio_session");
  const recording = {
    scanId,
    deviceId: device.id,
    organizationId: scan.organizationId || "",
    patientId: scan.patientId,
    deviceSessionId: authenticatedDeviceSocket._deviceAuth.sessionId,
    sessionId: audioSessionId,
    protocolVersion: 0,
    receivedPackets: 0,
    droppedPackets: 0,
    audioSequenceGuard: new AudioSequenceGuard(),
    startedAt,
    rawFilePath,
    wavFilePath,
    wavFile,
    bytes: 0,
    metrics: new RecordingMetrics(),
    stream: fs.createWriteStream(rawFilePath),
    lastSavedAt: 0,
    lastMetricBroadcastAt: 0,
    liveMetrics: createEmptyLiveMetrics(),
    confirmed: false,
  };

  recording.stream.on("error", (err) => {
    console.error(`Recording stream error: ${err.message}`);
    void interruptRecordingForDevice(
      recording.deviceId,
      "The audio session was interrupted because backend recording failed.",
    ).catch((error) => console.error(`Recording stream cleanup error: ${error.message}`));
  });

  const startEnvelope = buildDeviceCommand(
    "audio.session.start",
    {
      protocolVersion: 2,
      workspaceId: recording.organizationId,
      patientId: recording.patientId,
      deviceId: recording.deviceId,
      scanId: recording.scanId,
      sessionId: recording.sessionId,
      sampleRate: SAMPLE_RATE,
      sampleCount: 128,
      frameEncoding: "shcare_audio_v2",
      encoding: "pcm_s16le",
    },
    scan.id,
  );
  const startCommand = createDeviceCommandRecord({
    envelope: startEnvelope,
    deviceId: device.id,
    organizationId: scan.organizationId,
    requestedByUserId: actorUser?.id || "",
    idempotencyKey: readString(mutation.idempotencyKey || payload.idempotencyKey, 160),
    requestFingerprint: readString(mutation.fingerprint, 128) || createIdempotencyFingerprint({
      patientId: scan.patientId,
      deviceId: scan.deviceId,
      mode: scan.mode,
      bodySite: scan.bodySite,
    }),
  });
  recording.startCommandId = startCommand.id;
  scan.audioSessionId = audioSessionId;
  scan.deviceCommandId = startCommand.id;
  db.scans.unshift(scan);
  registerActiveRecording(recording);

  try {
    await saveScanRecord(scan);
    await saveDeviceCommandRecord(startCommand);
  } catch (error) {
    releaseActiveRecording(recording);
    recording.stream.destroy();
    await fs.promises.rm(recording.rawFilePath, { force: true }).catch(() => undefined);
    db.scans = db.scans.filter((item) => item.id !== scan.id);
    throw httpError(503, "Cannot persist audio session before device delivery", "AUDIO_SESSION_PERSIST_FAILED");
  }

  await saveDb();

  const publishedDelivery = publishDeviceCommand(device.id, startEnvelope);
  const delivery = {
    websocket: Boolean(publishedDelivery.websocket),
    mqtt: false,
    delivered: Boolean(publishedDelivery.websocket),
  };
  applyDeviceCommandDelivery(startCommand, delivery);
  await saveDeviceCommandRecord(startCommand);
  if (!delivery.websocket) {
    await interruptRecording(
      recording,
      "The audio session was interrupted because start delivery did not reach authenticated WSS.",
    );
    throw httpError(409, "Không thể gửi yêu cầu bắt đầu lượt ghi đến thiết bị");
  }
  void appendDeviceEvent(device.id, "audio.session.start", {
    commandId: startCommand.id,
    correlationId: scan.id,
    scanId: scan.id,
    protocolVersion: 2,
    delivery,
  });

  scheduleAudioStartExpiry(recording, startCommand);
  broadcastScanEvent("scan_start_accepted", scan);
  return scan;
}

function recordAudioPayload(recording, payload, sourceContext = {}) {
  if (
    !recording ||
    recording.stopping ||
    !isAudioSourceBoundToRecording(sourceContext, recording)
  ) {
    return false;
  }

  const scan = findScan(recording.scanId);
  if (
    !scan ||
    scan.deviceId !== recording.deviceId ||
    scan.patientId !== recording.patientId ||
    (scan.organizationId || "") !== (recording.organizationId || "")
  ) {
    return false;
  }

  recording.stream.write(payload);
  recording.bytes += payload.length;
  recording.metrics.ingestBuffer(payload);
  saveActiveRecordingProgress(recording, false);
  return true;
}

function saveActiveRecordingProgress(recording, force) {
  if (!recording || getActiveRecordingByScanId(recording.scanId) !== recording) {
    return null;
  }

  const now = Date.now();
  if (!force && now - recording.lastSavedAt < 1000) {
    return null;
  }

  const scan = findScan(recording.scanId);
  if (!scan) {
    return null;
  }

  Object.assign(scan, recording.metrics.getSummary(), {
    updatedAt: nowIso(),
  });
  recording.lastSavedAt = now;
  void saveScanRecord(scan);
  return scan;
}

async function stopRecording(scanId, options = {}) {
  if (!scanId) {
    throw httpError(400, "Thiếu mã lượt đo");
  }

  const scan = findScan(scanId);
  if (!scan) {
    throw httpError(404, "Không tìm thấy lượt đo");
  }

  const recording = getActiveRecordingByScanId(scanId);
  if (!recording) {
    if (scan.status === "completed") {
      return scan;
    }
    if (["created", "recording"].includes(scan.status)) {
      return markRecordingInterrupted(scan, "Lượt ghi đã dừng nhưng không còn luồng âm thanh hoạt động. Không tạo được file WAV hoàn chỉnh.");
    }
    return scan;
  }

  if (recording.stopPromise) return recording.stopPromise;
  const operation = stopRecordingSession(recording, scan, options);
  recording.stopPromise = operation;
  return operation;
}

async function stopRecordingSession(recording, scan, options = {}) {
  saveActiveRecordingProgress(recording, true);
  const stopIdempotencyKey =
    readString(options.idempotencyKey, 160) || `audio-stop:${recording.scanId}`;
  const stopRequestFingerprint =
    readString(options.requestFingerprint, 128) || createIdempotencyFingerprint({
      scanId: recording.scanId,
      sessionId: recording.sessionId,
      type: "audio.session.stop",
    });
  recording.stopIdempotencyKey = stopIdempotencyKey;
  recording.stopRequestFingerprint = stopRequestFingerprint;
  const stopEnvelope = buildDeviceCommand(
    "audio.session.stop",
    {
      protocolVersion: recording.protocolVersion || 2,
      scanId: recording.scanId,
      sessionId: recording.sessionId,
    },
    `${recording.scanId}:stop`,
  );
  const stopCommand = createDeviceCommandRecord({
    envelope: stopEnvelope,
    deviceId: recording.deviceId,
    organizationId: recording.organizationId,
    requestedByUserId: readString(options.actorUser?.id, 120) || scan.createdByUserId || "",
    idempotencyKey: stopIdempotencyKey,
    requestFingerprint: stopRequestFingerprint,
  });
  recording.stopCommandId = stopCommand.id;
  await saveDeviceCommandRecord(stopCommand);
  const publishedStopDelivery = publishDeviceCommand(recording.deviceId, stopEnvelope);
  const stopDelivery = {
    websocket: Boolean(publishedStopDelivery.websocket),
    mqtt: false,
    delivered: Boolean(publishedStopDelivery.websocket),
  };
  applyDeviceCommandDelivery(stopCommand, stopDelivery);
  await saveDeviceCommandRecord(stopCommand);
  void appendDeviceEvent(recording.deviceId, "audio.session.stop", {
    commandId: stopCommand.id,
    correlationId: stopCommand.correlationId,
    scanId: recording.scanId,
    protocolVersion: recording.protocolVersion || 0,
    delivery: stopDelivery,
  });
  if (!stopDelivery.websocket) {
    await interruptRecording(
      recording,
      "The audio session was interrupted because stop delivery did not reach authenticated WSS.",
    );
    throw httpError(409, "Cannot deliver audio stop command to the authenticated device", "AUDIO_STOP_DELIVERY_FAILED");
  }
  if (!recording.confirmed || recording.bytes === 0) {
    return interruptRecording(
      recording,
      "The audio session ended before the device confirmed and transmitted a valid audio frame.",
    );
  }
  return finalizeRecording(recording);
}

async function waitForScanStopFinalizeTestGate(recording) {
  if (
    process.env.NODE_ENV !== "test" ||
    readString(process.env.SCAN_STOP_FINALIZE_TEST_IDEMPOTENCY_KEY, 160) !==
      recording.stopIdempotencyKey
  ) {
    return;
  }
  const readyPath = readString(process.env.SCAN_STOP_FINALIZE_TEST_READY_FILE, 1000);
  const releasePath = readString(process.env.SCAN_STOP_FINALIZE_TEST_RELEASE_FILE, 1000);
  if (!readyPath || !releasePath) return;
  fs.writeFileSync(readyPath, recording.scanId, "utf8");
  const deadline = Date.now() + 5_000;
  while (!fs.existsSync(releasePath)) {
    if (Date.now() >= deadline) {
      const error = new Error("Timed out waiting for scan stop finalization test gate");
      error.code = "SCAN_STOP_FINALIZE_TEST_TIMEOUT";
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function finalizeRecording(recording) {
  if (!recording) return null;
  if (recording.finalizePromise) return recording.finalizePromise;
  recording.stopping = true;
  recording.finalizePromise = (async () => {
    const scan = findScan(recording.scanId);
    if (!scan) {
      throw httpError(404, "Không tìm thấy lượt đo", "SCAN_NOT_FOUND");
    }
    if (scan.status === "completed") {
      releaseActiveRecording(recording);
      return scan;
    }
    await waitForScanStopFinalizeTestGate(recording);
    await finishWriteStream(recording.stream);
    await writeWavFile(recording.rawFilePath, recording.wavFilePath, recording.bytes);
    await fs.promises.rm(recording.rawFilePath, { force: true });

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
      modelVersion: SIGNAL_QUALITY_ANALYZER_VERSION,
      label: processingResult.processed.quality.label || signalReview.label,
      confidence: processingResult.processed.quality.confidence || signalReview.confidence,
      summary: processingResult.processed.quality.summary || signalReview.summary,
      rawResult: buildSignalQualityRawResult({
        quality: processingResult.processed.quality,
        waveformObjectKey: processingResult.waveformObjectKey,
      }),
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
      audioProtocolVersion: recording.protocolVersion || 1,
      audioSessionId: recording.sessionId,
      receivedPackets: recording.receivedPackets,
      droppedPackets: recording.droppedPackets,
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
    releaseActiveRecording(recording);
    broadcastScanEvent("scan_stopped", scan);
    return scan;
  })().catch(async (error) => {
    await interruptRecording(
      recording,
      `The audio session was interrupted because backend finalization failed: ${error.code || error.message}.`,
    );
    throw error;
  });
  return recording.finalizePromise;
}

async function stopActiveRecording(actorUser = null, options = {}) {
  const candidates = listActiveRecordings().filter((recording) => {
    if (!actorUser) return true;
    return canAccessScan(actorUser, findScan(recording.scanId));
  });
  if (candidates.length > 1) {
    throw httpError(409, "scanId is required when more than one recording is active", "ACTIVE_SCAN_AMBIGUOUS");
  }
  if (candidates.length === 1) {
    return stopRecording(candidates[0].scanId, options);
  }

  const staleScan = db.scans.find(
    (scan) =>
      ["created", "recording"].includes(scan.status) &&
      (!actorUser || canAccessScan(actorUser, scan)),
  );
  if (staleScan) {
    return markRecordingInterrupted(staleScan, "Lượt ghi được dừng sau khi luồng âm thanh đã đóng. Hãy tạo lượt đo mới để có file WAV đầy đủ.");
  }

  throw httpError(409, "Không có lượt ghi đang chạy");
}

async function interruptRecordingForDevice(deviceId, summary) {
  const recording = getActiveRecordingForDevice(deviceId);
  return interruptRecording(recording, summary);
}

async function interruptRecording(recording, summary) {
  if (!recording) return null;
  if (recording.interruptPromise) return recording.interruptPromise;
  recording.interruptPromise = (async () => {
    const scan = findScan(recording.scanId);
    releaseActiveRecording(recording);
    try {
      await finishWriteStream(recording.stream);
    } catch (error) {
      console.warn(`Cannot close interrupted recording ${recording.scanId}: ${error.message}`);
    }
    await fs.promises.rm(recording.rawFilePath, { force: true }).catch(() => undefined);
    if (!scan) {
      broadcastStatus();
      return null;
    }

    Object.assign(scan, recording.metrics.getSummary(), {
      status: "interrupted",
      processingStatus: "interrupted",
      endedAt: nowIso(),
      audioProtocolVersion: recording.protocolVersion || scan.audioProtocolVersion || 2,
      audioSessionId: recording.sessionId,
      receivedPackets: recording.receivedPackets,
      droppedPackets: recording.droppedPackets,
      aiLabel: "interrupted",
      aiConfidence: null,
      aiSummary: summary,
      updatedAt: nowIso(),
    });
    await saveScanRecord(scan);
    broadcastScanEvent("scan_interrupted", scan);
    return scan;
  })();
  return recording.interruptPromise;
}

async function markRecordingInterrupted(scan, summary) {
  Object.assign(scan, {
    status: "interrupted",
    processingStatus: "interrupted",
    endedAt: scan.endedAt || nowIso(),
    aiLabel: "interrupted",
    aiConfidence: null,
    aiSummary: scan.aiSummary || summary,
    updatedAt: nowIso(),
  });

  await saveScanRecord(scan);
  broadcastScanEvent("scan_interrupted", scan);
  return scan;
}

function finishWriteStream(stream) {
  return new Promise((resolve, reject) => {
    if (!stream || stream.writableFinished || stream.destroyed) {
      resolve();
      return;
    }
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

function setCommonHeaders(res, req = res.__smartHealthRequest) {
  const corsOrigin = resolveCorsOrigin(req?.headers || {});
  if (corsOrigin) {
    res.setHeader("Access-Control-Allow-Origin", corsOrigin);
  }
  if (corsOrigin && corsOrigin !== "*") {
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Idempotency-Key, X-Chunk-Sequence, X-Chunk-SHA256, X-Shcare-2FA-Token, X-Shcare-Expected-User-Id, X-Shcare-Expected-Workspace-Id, X-Shcare-Expected-Auth-Session-Id, X-File-Name, X-Smart-Health-Surface, X-Smart-Health-Client",
  );
  res.setHeader(
    "Access-Control-Expose-Headers",
    "Content-Disposition, Deprecation, Idempotency-Replayed, X-Total-Count, X-Pagination-Total, X-Page, X-Page-Limit, X-Page-Count, X-Shcare-Artifact-SHA256, X-Shcare-Compatibility-Alias, X-Shcare-Renderer-Version",
  );
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

function assertDeviceSetupRateLimit(req, userId, deviceId) {
  const limit = Number(process.env.DEVICE_SETUP_RATE_LIMIT_PER_MINUTE || 10);
  if (!limit || limit <= 0) return;
  const context = getRequestContext(req) || createRequestContext(req);
  const minute = Math.floor(Date.now() / 60000);
  const scopes = [
    `device-setup:ip:${context.ip || "unknown"}:${minute}`,
    `device-setup:user:${userId || "unknown"}:${minute}`,
    `device-setup:device:${deviceId || "unknown"}:${minute}`,
  ];
  const counts = scopes.map((key) => (rateLimitBuckets.get(key) || 0) + 1);
  scopes.forEach((key, index) => rateLimitBuckets.set(key, counts[index]));
  if (rateLimitBuckets.size > 2000) {
    for (const itemKey of rateLimitBuckets.keys()) {
      if (itemKey.startsWith("device-setup:") && !itemKey.endsWith(`:${minute}`)) {
        rateLimitBuckets.delete(itemKey);
      }
    }
  }
  if (counts.some((count) => count > limit)) {
    throw httpError(429, "Too many Wi-Fi setup requests. Please try again shortly.", "DEVICE_WIFI_SETUP_RATE_LIMITED");
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
    "# HELP smart_health_legacy_auth_session_revoke_total Legacy auth session revoke compatibility requests.",
    "# TYPE smart_health_legacy_auth_session_revoke_total counter",
    `smart_health_legacy_auth_session_revoke_total ${requestMetrics.legacyAuthSessionRevoke}`,
    "# HELP smart_health_legacy_workspace_settings_update_total Legacy workspace settings update compatibility requests.",
    "# TYPE smart_health_legacy_workspace_settings_update_total counter",
    `smart_health_legacy_workspace_settings_update_total ${requestMetrics.legacyWorkspaceSettingsUpdate}`,
    "# HELP smart_health_legacy_account_profile_update_total Legacy account profile path compatibility requests.",
    "# TYPE smart_health_legacy_account_profile_update_total counter",
    `smart_health_legacy_account_profile_update_total ${requestMetrics.legacyAccountProfileUpdate}`,
    "# HELP smart_health_legacy_account_profile_workspace_mix_total Mixed profile and workspace compatibility requests.",
    "# TYPE smart_health_legacy_account_profile_workspace_mix_total counter",
    `smart_health_legacy_account_profile_workspace_mix_total ${requestMetrics.legacyAccountProfileWorkspaceMix}`,
    "# HELP smart_health_legacy_workspace_switch_alias_total Legacy workspace field compatibility requests.",
    "# TYPE smart_health_legacy_workspace_switch_alias_total counter",
    `smart_health_legacy_workspace_switch_alias_total ${requestMetrics.legacyWorkspaceSwitchAlias}`,
    "# HELP smart_health_active_recording Active recording flag.",
    "# TYPE smart_health_active_recording gauge",
    `smart_health_active_recording ${activeRecordingsByScanId.size}`,
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

function isCanonicalPasswordChangeRequest(req) {
  const { pathname } = parseRequestPath(req);
  return (
    String(req?.method || "GET").toUpperCase() === "POST" &&
    pathname === "/api/v1/me/password"
  );
}

function sanitizePasswordFieldErrors(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const fieldErrors = {};
  for (const [field, message] of Object.entries(value)) {
    if (!/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(field)) continue;
    if (typeof message !== "string" || message.length === 0) continue;
    fieldErrors[field] = message.slice(0, 500);
  }
  return Object.keys(fieldErrors).length > 0 ? fieldErrors : null;
}

function sendError(req, res, err) {
  const requestedStatus = Number(err?.statusCode ?? err?.status);
  const statusCode = Number.isInteger(requestedStatus) && requestedStatus >= 400 && requestedStatus <= 599
    ? requestedStatus
    : 500;
  const message = statusCode >= 500 ? "Internal server error" : err.message;
  const context = getRequestContext(req) || createRequestContext(req);
  const requestId = readString(context.requestId, 160);
  const code = normalizeErrorCode(err.code, statusCode).slice(0, 120);
  if (statusCode >= 500) {
    console.error({ requestId, err });
  }
  auditForbiddenError(req, err, statusCode, code);
  if (isCanonicalPasswordChangeRequest(req)) {
    const fieldErrors = sanitizePasswordFieldErrors(
      err?.fieldErrors || err?.details?.fieldErrors,
    );
    sendJson(res, statusCode, {
      code,
      message: String(message || "Request failed").slice(0, 500),
      ...(fieldErrors ? { fieldErrors } : {}),
      requestId,
    });
    return;
  }
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

function sendBuffer(res, statusCode, buffer, headers = {}) {
  setCommonHeaders(res);
  requestMetrics.total += 1;
  requestMetrics.byStatus[statusCode] = (requestMetrics.byStatus[statusCode] || 0) + 1;
  if (statusCode >= 400) requestMetrics.errors += 1;
  res.writeHead(statusCode, {
    "Content-Type": "application/octet-stream",
    "Content-Length": buffer.length,
    ...headers,
  });
  res.end(buffer);
}

async function readRequestBody(req, maxBytes = MAX_JSON_BODY_BYTES) {
  const buffer = await readRequestBuffer(req, maxBytes);
  return buffer.toString("utf8");
}

async function readRequestBuffer(req, maxBytes = MAX_BODY_BYTES) {
  const chunks = [];
  let total = 0;
  const contentLength = Number(req.headers["content-length"] || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw httpError(413, "Request body is too large", "REQUEST_BODY_TOO_LARGE", { maxBytes });
  }

  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      throw httpError(413, "Request body is too large", "REQUEST_BODY_TOO_LARGE", { maxBytes });
    }
    chunks.push(chunk);
  }

  return Buffer.concat(chunks);
}

async function readJsonBody(req, maxBytes = MAX_JSON_BODY_BYTES) {
  const text = await readRequestBody(req, maxBytes);
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
  if (!isActiveUserAccount(user)) {
    session.revokedAt = session.revokedAt || nowIso();
    return null;
  }

  session.lastSeenAt = nowIso();
  return { user, session };
}

function getOfferedSocketProtocols(req) {
  return String(req.headers["sec-websocket-protocol"] || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function getRequestedListenerScanId(req) {
  const selectorProtocols = getOfferedSocketProtocols(req).filter((protocol) =>
    protocol.startsWith("shcare.scan."),
  );
  if (selectorProtocols.length > 1) {
    throw httpError(400, "Only one realtime scan selector is allowed", "AUDIO_SOURCE_SELECTOR_INVALID");
  }
  if (!selectorProtocols.length) return "";
  const encoded = selectorProtocols[0].slice("shcare.scan.".length);
  if (!encoded || encoded.length > 240 || !/^[A-Za-z0-9_-]+$/.test(encoded)) {
    throw httpError(400, "Realtime scan selector is invalid", "AUDIO_SOURCE_SELECTOR_INVALID");
  }
  const decoded = Buffer.from(encoded, "base64url").toString("utf8");
  if (!decoded || Buffer.from(decoded, "utf8").toString("base64url") !== encoded) {
    throw httpError(400, "Realtime scan selector is invalid", "AUDIO_SOURCE_SELECTOR_INVALID");
  }
  const scanId = readString(decoded, 160);
  if (scanId !== decoded || Array.from(scanId).some((character) => {
    const codePoint = character.codePointAt(0) || 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  })) {
    throw httpError(400, "Realtime scan selector is invalid", "AUDIO_SOURCE_SELECTOR_INVALID");
  }
  return scanId;
}

function getSocketAccessToken(req) {
  const bearerProtocol = getOfferedSocketProtocols(req).find((protocol) =>
    protocol.startsWith("shcare.bearer."),
  );
  if (bearerProtocol) {
    return readString(bearerProtocol.slice("shcare.bearer.".length), 4000);
  }
  return getBearerToken(req);
}

function getSocketTwoFactorToken(req) {
  const protocol = getOfferedSocketProtocols(req).find((item) => item.startsWith("shcare.2fa."));
  return readString(
    req.headers["x-shcare-2fa-token"] || (protocol ? protocol.slice("shcare.2fa.".length) : ""),
    500,
  );
}

async function isRealtimeTwoFactorSatisfied(req, user) {
  if (!repositories?.twoFactor) return !user.twoFactorEnabled;
  const credential = await repositories.twoFactor.getCredential(user.id);
  user.twoFactorEnabled = Boolean(credential);
  user.twoFactorMethod = credential ? credential.method || "app" : "";
  if (!credential) return true;
  if (!getTwoFactorAvailability().available) return false;
  const token = getSocketTwoFactorToken(req);
  if (!token) return false;
  return repositories.twoFactor.verifyToken({
    userId: user.id,
    tokenHash: hashTwoFactorToken(token),
    primaryBindingHash: hashPrimaryBinding(getTwoFactorPrimaryBinding(req, user)),
  });
}

async function refreshAuthenticatedAuthorization(user) {
  if (!user || !repositories) return user;
  const canonicalUser = repositories.users.findById
    ? await repositories.users.findById(user.id)
    : await repositories.users.findByIdOrFirebaseUid(user.id);
  if (!canonicalUser) return null;
  let memberships = [];
  if (repositories.memberships?.listForUser) {
    memberships = await repositories.memberships.listForUser(canonicalUser.id);
  }
  if (repositories.patientShares?.listActiveForPrincipal) {
    const organizationIds = memberships
      .map((membership) => membership.organizationId || membership.workspaceId || "")
      .filter(Boolean);
    await repositories.patientShares.listActiveForPrincipal(
      canonicalUser.id,
      organizationIds,
      { identityAliases: [canonicalUser.firebaseUid] },
    );
  }
  return canonicalUser;
}

async function authenticateRealtimeSocket(req, url) {
  const token = getSocketAccessToken(req, url);
  if (!token) {
    return null;
  }

  const sessionAuth = findSessionUserByToken(token);
  if (sessionAuth) {
    if (AUTH_MODE === "production" && !ALLOW_DEMO_AUTH) {
      return null;
    }
    const canonicalUser = await refreshAuthenticatedAuthorization(sessionAuth.user);
    if (!canonicalUser || !isActiveUserAccount(canonicalUser)) return null;
    req.authSource = "demo-session";
    req.authUser = canonicalUser;
    req.authSession = sessionAuth.session;
    attachActor(req, canonicalUser);
    if (!(await isRealtimeTwoFactorSatisfied(req, canonicalUser))) return null;
    return canonicalUser;
  }

  if (!FIREBASE_AUTH_ENABLED) {
    return null;
  }

  let decodedToken;
  try {
    decodedToken = await verifyFirebaseIdToken(token, process.env);
  } catch {
    return null;
  }

  if (!decodedToken) {
    return null;
  }

  getFirebaseAuthenticationTime(decodedToken);
  const user = await refreshAuthenticatedAuthorization(await upsertFirebaseUser(decodedToken, req));
  if (!user) return null;
  if (!isActiveUserAccount(user)) {
    return null;
  }
  const authSession = await rememberAuthSession(user, decodedToken, req);
  req.authSource = "firebase";
  req.firebaseToken = decodedToken;
  req.authUser = user;
  req.authSession = authSession;
  attachActor(req, user);
  if (!(await isRealtimeTwoFactorSatisfied(req, user))) return null;
  return user;
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
    // Membership role is authorization state, not a profile field. Existing
    // grants may only be changed by an explicit, guarded role transition.
    return;
  }

  if (!membership) {
    db.memberships.push({
      id: createId("mbr"),
      organizationId: user.organizationId,
      userId: user.id,
      role: user.role || "patient",
      status: "active",
      suspendedAt: "",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  }
}

async function upsertFirebaseUser(decodedToken, req) {
  const firebaseUid = readString(decodedToken.uid, 160);
  if (!firebaseUid) {
    throw httpError(401, "Firebase token is missing uid");
  }

  const rawEmail = readString(decodedToken.email, 160).toLowerCase();
  const emailVerified = decodedToken.email_verified === true;
  const email = emailVerified ? rawEmail : "";
  const phone = readString(decodedToken.phone_number || decodedToken.phoneNumber, 40);
  const displayName = readString(decodedToken.name, 120) || (email ? email.split("@")[0] : "Người dùng Shcare");

  if (repositories?.users.resolveFirebaseIdentityGraph) {
    const context = getRequestContext(req) || createRequestContext(req);
    const resolved = await repositories.users.resolveFirebaseIdentityGraph({
      firebaseUid,
      email,
      emailVerified,
      phone,
      name: displayName,
      ip: context.ip || req.socket.remoteAddress || "",
      userAgent: context.userAgent || readString(req.headers["user-agent"], 240),
    });
    return resolved.user;
  }

  let matchedByEmail = false;
  let createdBackendUser = false;
  let user = repositories?.users.findByFirebaseUid
    ? await repositories.users.findByFirebaseUid(firebaseUid)
    : repositories
      ? await repositories.users.findByIdOrFirebaseUid(firebaseUid)
      : null;
  if (user && user.firebaseUid !== firebaseUid) user = null;
  if (!user) {
    user = db.users.find((item) => item.firebaseUid === firebaseUid) || null;
  }
  if (!user && repositories && email) {
    user = repositories.users.findByEmail
      ? await repositories.users.findByEmail(email)
      : await repositories.users.findByIdOrFirebaseUid(email);
    matchedByEmail = Boolean(user);
  }
  if (!user && email) {
    user = db.users.find((item) => readString(item.email, 160).toLowerCase() === email);
    matchedByEmail = Boolean(user);
  }

  const now = nowIso();
  let onboardingWorkspace = null;
  if (!user) {
    user = {
      id: createId("usr"),
      role: "patient",
      name: displayName,
      email,
      phone,
      firebaseUid,
      organizationId: "",
      verifiedEmail: emailVerified,
      verifiedPhone: Boolean(phone),
      createdAt: now,
      updatedAt: now,
    };
    db.users.unshift(user);
    createdBackendUser = true;
    onboardingWorkspace = ensurePersonalWorkspaceForUser(user);
    user.organizationId = onboardingWorkspace.id;
    user.workspaceType = "personal";
    user.accountType = "personal";
    addAccessLog(`Tạo user từ Firebase ${displayName}`, { ip: req.socket.remoteAddress || "" });
  } else {
    const previousFirebaseUid = user.firebaseUid || "";
    if (previousFirebaseUid && previousFirebaseUid !== firebaseUid) {
      throw httpError(401, "Firebase identity conflicts with the linked account", "FIREBASE_IDENTITY_CONFLICT");
    }
    if (!previousFirebaseUid) {
      user.firebaseUid = firebaseUid;
      if (matchedByEmail) {
        addAccessLog("Đồng bộ Firebase UID từ email đã xác thực", {
          severity: "warning",
          userId: user.id,
          firebaseUid,
        });
      }
    }
    if (email && user.email !== email) {
      user.email = email;
    }
    if (phone && user.phone !== phone) {
      user.phone = phone;
    }
    user.verifiedEmail = user.verifiedEmail || emailVerified;
    user.verifiedPhone = user.verifiedPhone || Boolean(phone);
    user.updatedAt = now;
  }

  if (createdBackendUser) ensureMembershipForUser(user);
  if (onboardingWorkspace && repositories && typeof repositories.organizations?.upsert === "function") {
    await repositories.organizations.upsert(onboardingWorkspace);
  }
  if (isPatientUser(user)) {
    ensurePatientProfileForUser(user);
  }
  if (createdBackendUser && repositories) {
    await repositories.users.save(user);
    if (onboardingWorkspace) await repositories.organizations.upsert(onboardingWorkspace);
    await repositories.memberships.ensureForUser(user);
    if (user.patientId) {
      const selfPatient = findPatient(user.patientId);
      if (selfPatient) {
        await repositories.patients.save(selfPatient);
        await repositories.users.save(user);
      }
    }
  }
  return user;
}

function getFirebaseAuthenticationTime(decodedToken) {
  const authenticatedAt = normalizeFirebaseAuthTime(decodedToken);
  if (!authenticatedAt) {
    throw httpError(
      401,
      "Firebase token is missing the stable authentication-time binding",
      "AUTH_SESSION_BINDING_MISSING",
    );
  }
  return authenticatedAt;
}

function buildFirebaseAuthSessionCandidate(user, decodedToken, req) {
  const userAgent = readString(req.headers["user-agent"] || "Android", 240);
  const authenticatedAt = getFirebaseAuthenticationTime(decodedToken);
  const sessionKey = hashValue(`${user.id}:${decodedToken.uid}:${authenticatedAt}`);
  const now = nowIso();
  return {
    id: createId("authsess"),
    userId: user.id,
    provider: "firebase",
    firebaseUid: decodedToken.uid,
    sessionKey,
    tokenBindingHash: hashValue(`${decodedToken.uid}:${authenticatedAt}`),
    device: userAgent,
    ip: req.socket.remoteAddress || "",
    createdAt: now,
    lastSeenAt: now,
    revokedAt: null,
  };
}

async function findExistingFirebaseUserForSession(decodedToken) {
  const firebaseUid = readString(decodedToken.uid, 160);
  let existingUser = firebaseUid && repositories?.users.findByFirebaseUid
    ? await repositories.users.findByFirebaseUid(firebaseUid)
    : firebaseUid && repositories
      ? await repositories.users.findByIdOrFirebaseUid(firebaseUid)
      : null;
  if (existingUser && existingUser.firebaseUid !== firebaseUid) {
    existingUser = null;
  }
  if (!existingUser && firebaseUid) {
    existingUser = db.users.find(
      (item) => item.firebaseUid === firebaseUid,
    ) || null;
  }
  return existingUser;
}

async function resolveExistingFirebaseAuthSession(decodedToken, req) {
  if (!repositories?.authSessions?.resolveFirebaseSession) return null;
  const existingUser = await findExistingFirebaseUserForSession(decodedToken);
  if (!existingUser) return null;
  const session = await repositories.authSessions.resolveFirebaseSession(
    buildFirebaseAuthSessionCandidate(existingUser, decodedToken, req),
  );
  if (session.revokedAt) {
    throw httpError(401, "Phiên đăng nhập đã bị thu hồi", "AUTH_SESSION_REVOKED");
  }
  return session;
}

async function rememberAuthSession(user, decodedToken, req) {
  const candidate = buildFirebaseAuthSessionCandidate(user, decodedToken, req);
  let session = db.authSessions.find(
    (item) => item.userId === candidate.userId && item.sessionKey === candidate.sessionKey,
  );

  if (!session) {
    session = candidate;
  } else {
    session.lastSeenAt = candidate.lastSeenAt;
    session.ip = candidate.ip || session.ip;
  }

  if (repositories?.authSessions?.resolveFirebaseSession) {
    session = await repositories.authSessions.resolveFirebaseSession(session);
  } else if (!db.authSessions.some((item) => item.id === session.id)) {
    db.authSessions.unshift(session);
    db.authSessions = db.authSessions.slice(0, 500);
  }
  if (session?.revokedAt) throw httpError(401, "Phiên đăng nhập đã bị thu hồi", "AUTH_SESSION_REVOKED");
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
    if (AUTH_MODE === "production" && !ALLOW_DEMO_AUTH) {
      throw httpError(401, "Demo sessions are disabled in production", "DEMO_SESSION_DISABLED");
    }
    const canonicalUser = await refreshAuthenticatedAuthorization(sessionAuth.user);
    if (!canonicalUser) {
      throw httpError(401, "Account no longer exists", "ACCOUNT_NOT_FOUND");
    }
    req.authSource = "demo-session";
    req.authUser = canonicalUser;
    req.authSession = sessionAuth.session;
    attachActor(req, canonicalUser);
    await prepareTwoFactorAccess(req, canonicalUser);
    return;
  }

  if (!token || !FIREBASE_AUTH_ENABLED) {
    return;
  }

  let decodedToken;
  try {
    decodedToken = await verifyFirebaseIdToken(token, process.env);
  } catch (err) {
    const code = getFirebaseIdTokenErrorCode(err);
    const message =
      code === "FIREBASE_ID_TOKEN_REVOKED"
        ? "Firebase ID token was revoked; sign in again before retrying"
        : code === "FIREBASE_ID_TOKEN_EXPIRED"
          ? "Firebase ID token expired; sign in again before retrying"
          : "Invalid Firebase ID token";
    throw httpError(401, message, code);
  }

  if (!decodedToken) {
    return;
  }

  getFirebaseAuthenticationTime(decodedToken);
  req.authSource = "firebase";
  req.firebaseToken = decodedToken;
  req.authUser = await refreshAuthenticatedAuthorization(await upsertFirebaseUser(decodedToken, req));
  if (!req.authUser) {
    throw httpError(401, "Account no longer exists", "ACCOUNT_NOT_FOUND");
  }
  assertUserAccountActive(req.authUser);
  attachActor(req, req.authUser);
  req.authSession = await rememberAuthSession(req.authUser, decodedToken, req);
  await prepareTwoFactorAccess(req, req.authUser);
}

function getRequestUser(req) {
  if (req.authUser) {
    attachActor(req, req.authUser);
    return req.authUser;
  }
  if (getBearerToken(req)) {
    return null;
  }
  return AUTH_MODE === "production" ? null : getCurrentUser();
}

function assertUserAccountActive(user) {
  if (!isActiveUserAccount(user)) {
    const err = httpError(403, "Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.");
    err.code = "account_locked";
    throw err;
  }
  return user;
}

function requirePrimaryUser(req) {
  const user = getRequestUser(req);
  if (!user) {
    throw httpError(401, "Chưa đăng nhập");
  }
  assertUserAccountActive(user);
  attachActor(req, user);
  return user;
}

function requirePrimarySessionUser(req) {
  if (!getBearerToken(req) || !req.authUser) {
    throw httpError(401, "Missing or invalid primary bearer token");
  }
  assertUserAccountActive(req.authUser);
  attachActor(req, req.authUser);
  if (isTwoFactorBootstrapRequest(req)) return req.authUser;
  return assertTwoFactorAccess(req, req.authUser);
}

function assertTwoFactorAccess(req, user) {
  if (!user.twoFactorEnabled || req.twoFactorSatisfied) return user;
  const availability = getTwoFactorAvailability();
  if (!availability.available) {
    throw httpError(
      503,
      "Không thể xác thực yếu tố thứ hai vì cấu hình mã hóa an toàn chưa sẵn sàng.",
      "TWO_FACTOR_UNAVAILABLE",
      { availability },
    );
  }
  const challenge = req.twoFactorChallenge;
  throw httpError(
    403,
    "Cần hoàn tất xác thực hai yếu tố.",
    "TWO_FACTOR_CHALLENGE_REQUIRED",
    {
      challengeId: challenge?.id || "",
      method: "app",
      expiresAt: challenge?.expiresAt || "",
    },
  );
}

function requireUser(req) {
  const user = requirePrimaryUser(req);
  return assertTwoFactorAccess(req, user);
}

function requireSessionUser(req) {
  const token = getBearerToken(req);
  if (!token) {
    throw httpError(401, "Missing bearer token");
  }

  if (req.authUser) {
    assertUserAccountActive(req.authUser);
    attachActor(req, req.authUser);
    return assertTwoFactorAccess(req, req.authUser);
  }

  throw httpError(401, "Invalid or expired session");
}

function assertDemoAuthAllowed() {
  if (AUTH_MODE === "production" && !ALLOW_DEMO_AUTH) {
    throw httpError(403, "Demo password auth is disabled in production mode");
  }
}

function buildSession(user, req) {
  return {
    id: createId("sess"),
    userId: user.id,
    token: crypto.randomBytes(32).toString("hex"),
    device: req.headers["user-agent"] || "Ứng dụng Android",
    ip: req.socket.remoteAddress || "",
    createdAt: nowIso(),
    lastSeenAt: nowIso(),
    revokedAt: null,
  };
}

function persistSession(session) {
  db.sessions.unshift(session);
  db.sessions = db.sessions.slice(0, 100);
  return session;
}

function createSession(user, req) {
  return persistSession(buildSession(user, req));
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

function getTwoFactorPrimaryBinding(req, user) {
  if (req.authSource === "demo-session" && req.authSession?.id) {
    return `demo-session:${user.id}:${req.authSession.id}`;
  }
  if (req.authSource === "firebase" && req.firebaseToken?.uid) {
    const authTime = Number(req.firebaseToken.auth_time || req.firebaseToken.iat || 0);
    return `firebase:${user.id}:${req.firebaseToken.uid}:${authTime}`;
  }
  return `primary:${user.id}:${req.authSource || "local"}`;
}

function isTwoFactorBootstrapRequest(req) {
  const pathname = new URL(req.url || "/", "http://localhost").pathname;
  const method = String(req.method || "GET").toUpperCase();
  return (
    /\/auth\/2fa\/challenge$/.test(pathname) ||
    (method === "POST" && /\/me\/2fa\/verify$/.test(pathname)) ||
    (method === "POST" && /\/me\/2fa\/recovery-codes\/ack$/.test(pathname))
  );
}

async function createTwoFactorChallenge(user, primaryAuthSource, primaryBinding) {
  const availability = getTwoFactorAvailability();
  if (!availability.available) {
    throw httpError(503, "2FA chưa sẵn sàng.", "TWO_FACTOR_UNAVAILABLE", { availability });
  }
  if (!repositories?.twoFactor) {
    throw httpError(503, "Kho lưu trữ 2FA chưa sẵn sàng.", "TWO_FACTOR_STORAGE_UNAVAILABLE");
  }
  const nowMs = Date.now();
  const configuredTtlMs = Number(process.env.TWO_FACTOR_CHALLENGE_TTL_MS || 5 * 60 * 1000);
  const minimumTtlMs = process.env.NODE_ENV === "test" ? 100 : 60 * 1000;
  const ttlMs = Math.min(
    10 * 60 * 1000,
    Math.max(minimumTtlMs, Number.isFinite(configuredTtlMs) ? configuredTtlMs : 5 * 60 * 1000),
  );
  return repositories.twoFactor.createChallenge({
    id: `2fa_challenge_${crypto.randomBytes(24).toString("base64url")}`,
    userId: user.id,
    primaryAuthSource,
    primaryBindingHash: hashPrimaryBinding(primaryBinding),
    attempts: 0,
    maxAttempts: 5,
    createdAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + ttlMs).toISOString(),
    completedAt: null,
  });
}

async function prepareTwoFactorAccess(req, user) {
  req.twoFactorSatisfied = false;
  req.twoFactorChallenge = null;
  if (!repositories?.twoFactor) return;
  const credential = await repositories.twoFactor.getCredential(user.id);
  user.twoFactorEnabled = Boolean(credential);
  user.twoFactorMethod = credential ? credential.method || "app" : "";
  if (!credential) {
    req.twoFactorSatisfied = true;
    return;
  }
  const availability = getTwoFactorAvailability();
  if (!availability.available || isTwoFactorBootstrapRequest(req)) return;
  const primaryBinding = getTwoFactorPrimaryBinding(req, user);
  const suppliedToken = readString(req.headers["x-shcare-2fa-token"], 500);
  if (suppliedToken) {
    req.twoFactorSatisfied = await repositories.twoFactor.verifyToken({
      userId: user.id,
      tokenHash: hashTwoFactorToken(suppliedToken),
      primaryBindingHash: hashPrimaryBinding(primaryBinding),
    });
    if (req.twoFactorSatisfied) return;
  }
  req.twoFactorChallenge = await createTwoFactorChallenge(user, req.authSource || "primary", primaryBinding);
}

function parseSettingsPatch(payload = {}, currentSettings = db.settings) {
  const next = {};
  if (
    payload.ai
    && typeof payload.ai === "object"
    && Object.keys(payload.ai).length > 0
  ) {
    throw httpError(
      422,
      "Cấu hình phân tích tín hiệu do backend quản lý và chưa hỗ trợ cập nhật mô hình",
      "AI_SETTINGS_READ_ONLY",
    );
  }
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
  merged.ai = normalizeAiSettings(merged.ai);
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
    provider: "smtp",
    configured: missing.length === 0,
    missing,
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 0) || null,
    from: process.env.SMTP_FROM || "",
  };
}

function normalizeEmailProvider(value) {
  const provider = readString(value, 40).toLowerCase();
  if (["brevo", "brevo-api", "sendinblue", "sendinblue-api"].includes(provider)) return "brevo";
  if (["smtp", "gmail", "gmail-smtp", "nodemailer"].includes(provider)) return "smtp";
  if (["auto", ""].includes(provider)) return "";
  return provider;
}

function getBrevoRuntimeStatus() {
  const missing = ["BREVO_API_KEY", "BREVO_FROM_EMAIL"].filter((key) => !process.env[key]);
  const apiUrl = readString(process.env.BREVO_API_URL, 500) || "https://api.brevo.com/v3/smtp/email";
  return {
    provider: "brevo",
    configured: missing.length === 0,
    missing,
    apiUrl,
    from: readString(process.env.BREVO_FROM_EMAIL, 240),
    fromName: readString(process.env.BREVO_FROM_NAME, 120) || "Smart Health",
  };
}

function getEmailRuntimeStatus(settings = db.settings) {
  const brevo = getBrevoRuntimeStatus();
  const smtp = getSmtpRuntimeStatus();
  const explicitProvider = normalizeEmailProvider(process.env.EMAIL_PROVIDER || process.env.OUTBOUND_EMAIL_PROVIDER);
  const settingsProvider = normalizeEmailProvider(settings?.outbound?.email?.provider);
  const providerCandidate = explicitProvider || (brevo.configured ? "brevo" : smtp.configured ? "smtp" : settingsProvider || "brevo");
  const provider = providerCandidate === "smtp" ? "smtp" : "brevo";
  const active = provider === "smtp" ? smtp : brevo;
  return {
    provider,
    configured: active.configured,
    missing: active.missing,
    from: active.from || "",
    apiUrl: provider === "brevo" ? brevo.apiUrl : "",
    fallback: {
      brevoConfigured: brevo.configured,
      smtpConfigured: smtp.configured,
    },
    brevo,
    smtp,
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
  const aiRuntime = buildAiRuntimeStatus(process.env);
  return {
    ...settings,
    ai: normalizeAiSettings(settings.ai),
    scope: isPlatformAdminUser(user)
      ? { type: "platform", organizationId: "", name: "Smart Health Platform" }
      : {
          type: "workspace",
          organizationId: getUserWorkspaceContext(user).currentWorkspaceId || "",
          name: getUserWorkspaceContext(user).workspace?.name || "",
        },
    runtime: {
      email: getEmailRuntimeStatus(settings),
      smtp: getSmtpRuntimeStatus(),
      outboundWebhook: getOutboundWebhookRuntimeStatus(settings),
      twoFactorAvailable: true,
      apiKeyRotationAvailable: true,
      backupTestAvailable: true,
      aiModelUpdateAvailable: false,
      ai: aiRuntime,
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
    if (repositories?.configuration?.saveWorkspace) {
      const persisted = await repositories.configuration.saveWorkspace(
        workspace.id,
        settings,
      );
      workspace.settings = persisted;
    } else {
      workspace.settings = settings;
      workspace.updatedAt = nowIso();
      await saveDb();
    }
  } else {
    if (repositories?.configuration?.savePlatform) {
      db.settings = await repositories.configuration.savePlatform(settings);
    } else {
      db.settings = settings;
      await saveDb();
    }
  }
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

function getBrevoEnv() {
  return {
    apiKey: String(process.env.BREVO_API_KEY || "").trim(),
    apiUrl: readString(process.env.BREVO_API_URL, 500) || "https://api.brevo.com/v3/smtp/email",
    fromEmail: readString(process.env.BREVO_FROM_EMAIL, 240),
    fromName: readString(process.env.BREVO_FROM_NAME, 120) || "Smart Health",
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

function describeBrevoFailure(statusCode, responseBody, error) {
  const raw =
    typeof responseBody === "string"
      ? responseBody
      : responseBody && typeof responseBody === "object"
        ? `${responseBody.code || ""} ${responseBody.message || ""}`
        : "";
  const message = String(error && error.message ? error.message : raw || error || "");
  const combined = `${statusCode || ""} ${raw} ${message}`.toLowerCase();

  if (statusCode === 401 || statusCode === 403 || combined.includes("unauthorized") || combined.includes("authentication")) {
    return "Brevo từ chối API key. Hãy kiểm tra BREVO_API_KEY trên Render và redeploy backend.";
  }
  if (statusCode === 429 || combined.includes("rate") || combined.includes("quota") || combined.includes("limit")) {
    return "Brevo đã hết quota hoặc bị giới hạn tốc độ. Gói miễn phí chỉ phù hợp demo/lưu lượng thấp.";
  }
  if (combined.includes("sender") || combined.includes("from") || combined.includes("not verified")) {
    return "Brevo chưa chấp nhận email gửi đi. Hãy xác minh sender/domain trong Brevo và đặt BREVO_FROM_EMAIL đúng địa chỉ đã xác minh.";
  }
  if (combined.includes("timeout") || combined.includes("aborted") || combined.includes("econnrefused") || combined.includes("enetunreach")) {
    return "Backend không kết nối được tới Brevo API qua HTTPS trong thời gian cho phép. Hãy kiểm tra Render đã redeploy sau khi set env và mạng outbound HTTPS.";
  }
  return `Không thể gửi email qua Brevo API: ${message || "lỗi không xác định"}`;
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

async function sendSmtpEmail({ to, subject, text, html }) {
  const recipients = normalizeEmailRecipients(to);
  if (recipients.length === 0) {
    throw httpError(400, "Cần ít nhất một email người nhận hợp lệ", "EMAIL_RECIPIENT_REQUIRED");
  }
  const transporter = createSmtpTransport();
  let info;
  try {
    info = await transporter.sendMail({
      from: getSmtpEnv().from,
      to: recipients.map(formatSmtpRecipient).join(", "),
      subject,
      text,
      html: html || `<p>${escapeHtml(text).replace(/\n/g, "<br />")}</p>`,
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
    provider: "smtp",
    messageId: info.messageId || "",
    accepted: info.accepted || [],
    rejected: info.rejected || [],
  };
}

async function sendBrevoEmail({ to, subject, text, html }) {
  const runtime = getBrevoRuntimeStatus();
  if (!runtime.configured) {
    throw httpError(400, `Brevo API chưa được cấu hình: ${runtime.missing.join(", ")}`, "BREVO_NOT_CONFIGURED", {
      provider: "brevo",
      missing: runtime.missing,
    });
  }
  const recipients = normalizeEmailRecipients(to);
  if (recipients.length === 0) {
    throw httpError(400, "Cần ít nhất một email người nhận hợp lệ", "EMAIL_RECIPIENT_REQUIRED");
  }

  const brevo = getBrevoEnv();
  // Brevo keeps an idempotency key for 30 minutes. Reusing the same UUID on a
  // retry prevents a timeout after provider acceptance from delivering the
  // same transactional email twice.
  const idempotencyKey = crypto.randomUUID();
  const requestBody = JSON.stringify({
    sender: {
      name: brevo.fromName,
      email: brevo.fromEmail,
    },
    to: recipients.map((recipient) => ({
      email: recipient.email,
      ...(recipient.name ? { name: recipient.name } : {}),
    })),
    subject,
    textContent: text,
    htmlContent: html || `<html><head></head><body><p>${escapeHtml(text).replace(/\n/g, "<br />")}</p></body></html>`,
    headers: { idempotencyKey },
  });

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    let response;
    let responseText = "";
    let responseBody = {};
    try {
      response = await fetch(brevo.apiUrl, {
        method: "POST",
        headers: {
          accept: "application/json",
          "api-key": brevo.apiKey,
          "content-type": "application/json",
        },
        body: requestBody,
        signal: controller.signal,
      });
      responseText = await response.text();
      if (responseText) {
        try {
          responseBody = JSON.parse(responseText);
        } catch (_) {
          responseBody = { message: responseText };
        }
      }
    } catch (error) {
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        continue;
      }
      throw httpError(400, describeBrevoFailure(0, responseText, error), "BREVO_SEND_FAILED", {
        provider: "brevo",
        apiUrl: brevo.apiUrl,
        from: brevo.fromEmail,
        attempts: attempt,
      });
    } finally {
      clearTimeout(timeout);
    }

    const providerCode = readString(responseBody.code, 120);
    if (response.ok || (attempt > 1 && providerCode === "duplicate_parameter")) {
      return {
        provider: "brevo",
        messageId: readString(responseBody.messageId, 240),
        accepted: recipients.map((recipient) => recipient.email),
        rejected: [],
        attempts: attempt,
        idempotent: providerCode === "duplicate_parameter",
      };
    }

    const retryable = [408, 425, 429].includes(response.status) || response.status >= 500;
    if (attempt < 2 && retryable) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      continue;
    }
    throw httpError(400, describeBrevoFailure(response.status, responseBody, null), "BREVO_SEND_FAILED", {
      provider: "brevo",
      statusCode: response.status,
      apiUrl: brevo.apiUrl,
      from: brevo.fromEmail,
      providerCode,
      attempts: attempt,
    });
  }

  throw httpError(400, "Brevo delivery did not produce a terminal outcome", "BREVO_SEND_FAILED");
}

async function sendEmail({ to, subject, text, html }) {
  const runtime = getEmailRuntimeStatus();
  if (!runtime.configured) {
    throw httpError(400, `Email chưa được cấu hình: ${runtime.missing.join(", ")}`, "EMAIL_NOT_CONFIGURED", {
      provider: runtime.provider,
      missing: runtime.missing,
    });
  }
  if (runtime.provider === "smtp") {
    return sendSmtpEmail({ to, subject, text, html });
  }
  return sendBrevoEmail({ to, subject, text, html });
}

async function sendSmtpTestEmail({ to, subject, text }) {
  return sendSmtpEmail({ to, subject, text });
}

async function sendBrevoTestEmail({ to, subject, text }) {
  return sendBrevoEmail({ to, subject, text });
}

async function sendTestEmail(payload = {}) {
  const to = readString(payload.to || db.settings.outbound?.email?.testRecipient, 240);
  if (!to) {
    throw httpError(400, "Cần nhập email người nhận để gửi thử", "EMAIL_TEST_RECIPIENT_REQUIRED");
  }
  const subject = readString(payload.subject, 180) || "Smart Health test email";
  const text =
    readString(payload.message, 2000) ||
    "Đây là email kiểm tra từ hệ thống Smart Health. Nếu bạn nhận được email này, cấu hình email outbound đang hoạt động.";
  return sendEmail({ to, subject, text });
}

function isNotificationEmailEnabled() {
  const value = String(process.env.NOTIFICATION_EMAIL_ENABLED || "true").trim().toLowerCase();
  return !["0", "false", "off", "no", "disabled"].includes(value);
}

function getWebAdminBaseUrl() {
  const configured = readString(
    process.env.WEB_ADMIN_URL ||
      process.env.SMART_HEALTH_WEB_ADMIN_URL ||
      process.env.ADMIN_WEB_URL ||
      process.env.FRONTEND_URL,
    500
  );
  return (configured || "https://shcare-admin.web.app").replace(/\/+$/, "");
}

function getWebPortalBaseUrl(req) {
  const configured = readString(
    process.env.WEB_PORTAL_URL ||
      process.env.SHCARE_WEB_URL ||
      process.env.SMART_HEALTH_WEB_URL ||
      process.env.PUBLIC_SITE_URL ||
      process.env.VITE_PUBLIC_SITE_URL,
    500
  );
  if (/^https?:\/\//i.test(configured)) {
    return configured.replace(/\/+$/, "");
  }

  const origin = readString(req?.headers?.origin, 500);
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin) || /^https:\/\/shcare\.web\.app$/i.test(origin)) {
    return origin.replace(/\/+$/, "");
  }

  return "https://shcare.web.app";
}

function getStaffInvitationExpiryIso() {
  return new Date(Date.now() + STAFF_INVITATION_TTL_HOURS * 60 * 60 * 1000).toISOString();
}

function getStaffInvitationPortalBaseUrl() {
  const configured = readString(
    process.env.WEB_PORTAL_URL ||
      process.env.SHCARE_WEB_URL ||
      process.env.SMART_HEALTH_WEB_URL ||
      process.env.PUBLIC_SITE_URL ||
      process.env.VITE_PUBLIC_SITE_URL,
    500,
  );
  const configuredIsHttps = /^https:\/\//i.test(configured);
  const configuredIsLocalDebug =
    AUTH_MODE !== "production" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(configured);
  return configuredIsHttps || configuredIsLocalDebug
    ? configured.replace(/\/+$/, "")
    : "https://shcare.web.app";
}

function getStaffInvitationAcceptanceUrl(token) {
  return `${getStaffInvitationPortalBaseUrl()}/staff-invitations/accept?token=${encodeURIComponent(token)}`;
}

function buildStaffInvitationMessage({ invitation, acceptanceUrl, workspaceName }) {
  const recipient = invitation.name || invitation.email;
  const text = [
    `Xin chào ${recipient},`,
    "",
    `Bạn được mời tham gia ${workspaceName || "workspace Shcare"} với vai trò ${invitation.role}.`,
    "Mở liên kết một lần dưới đây bằng đúng tài khoản email nhận lời mời:",
    acceptanceUrl,
    "",
    `Lời mời hết hạn lúc ${invitation.expiresAt}.`,
    "Nếu bạn không mong đợi lời mời này, hãy bỏ qua email.",
  ].join("\n");
  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f4f8fb;font-family:Arial,sans-serif;color:#102a43;">
    <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
      <div style="background:#ffffff;border:1px solid #d8e3ea;border-radius:16px;padding:28px;">
        <p style="margin:0 0 8px;color:#2457d6;font-weight:700;">Shcare — Smart Health Care</p>
        <h1 style="margin:0 0 16px;font-size:24px;">Lời mời tham gia workspace</h1>
        <p style="line-height:1.6;">Xin chào <strong>${escapeHtml(recipient)}</strong>,</p>
        <p style="line-height:1.6;">Bạn được mời tham gia <strong>${escapeHtml(workspaceName || "workspace Shcare")}</strong> với vai trò <strong>${escapeHtml(invitation.role)}</strong>.</p>
        <p style="margin:24px 0;"><a href="${escapeAttribute(acceptanceUrl)}" style="display:inline-block;background:#2457d6;color:#fff;text-decoration:none;font-weight:700;border-radius:10px;padding:12px 18px;">Chấp nhận lời mời</a></p>
        <p style="color:#52677a;font-size:13px;line-height:1.5;">Liên kết chỉ dùng để chấp nhận lời mời cho đúng email nhận thư và hết hạn lúc ${escapeHtml(invitation.expiresAt)}.</p>
      </div>
    </div>
  </body>
</html>`;
  return { text, html };
}

function getEmailVerificationContinueUrl(req) {
  return `${getWebPortalBaseUrl(req)}/xac-nhan-email`;
}

function getPasswordResetContinueUrl(req) {
  return `${getWebPortalBaseUrl(req)}/dat-lai-mat-khau`;
}

function getFirebaseEmailLinkDomain() {
  return readString(process.env.FIREBASE_AUTH_LINK_DOMAIN || process.env.FIREBASE_LINK_DOMAIN, 240);
}

function describeFirebaseEmailLinkFailure(error) {
  const code = String(error && error.code ? error.code : "");
  const message = String(error && error.message ? error.message : error || "");
  const combined = `${code} ${message}`.toLowerCase();

  if (combined.includes("unauthorized") || combined.includes("continue")) {
    return "Firebase chưa cho phép domain nhận link xác minh. Hãy thêm shcare.web.app vào Firebase Authentication > Settings > Authorized domains.";
  }
  if (combined.includes("user-not-found")) {
    return "Không tìm thấy tài khoản Firebase để tạo link xác minh email.";
  }
  return `Không thể tạo link xác minh Firebase: ${message || "lỗi không xác định"}`;
}

function buildEmailVerificationMessage({ name, email, verificationLink }) {
  const safeName = escapeHtml(name || email || "bạn");
  const safeEmail = escapeHtml(email);
  const safeLink = escapeAttribute(verificationLink);
  const text = [
    `Xin chào ${name || email || "bạn"},`,
    "",
    "Bạn vừa tạo tài khoản Smart Health Care Workspace Portal.",
    "Mở liên kết dưới đây để xác minh email:",
    verificationLink,
    "",
    "Nếu bạn không tạo tài khoản này, hãy bỏ qua email.",
  ].join("\n");
  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f5f7fa;font-family:Inter,Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f7fa;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="padding:28px 28px 8px;">
                <p style="margin:0 0 8px;color:#00a896;font-weight:700;font-size:13px;">Smart Health Care</p>
                <h1 style="margin:0;color:#0f172a;font-size:24px;line-height:1.25;">Xác minh email Workspace Portal</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 28px 0;color:#334155;font-size:15px;line-height:1.65;">
                <p style="margin:0 0 12px;">Xin chào <strong>${safeName}</strong>,</p>
                <p style="margin:0 0 18px;">Hãy xác minh email <strong>${safeEmail}</strong> để hoàn tất tài khoản Smart Health Care Workspace Portal.</p>
                <p style="margin:0 0 24px;">
                  <a href="${safeLink}" style="display:inline-block;background:#0b5c9a;color:#ffffff;text-decoration:none;font-weight:700;border-radius:10px;padding:12px 18px;">Xác minh email</a>
                </p>
                <p style="margin:0;color:#64748b;font-size:13px;">Nếu nút không mở được, hãy copy liên kết này vào trình duyệt:</p>
                <p style="margin:8px 0 0;word-break:break-all;color:#0b5c9a;font-size:12px;">${safeLink}</p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px 28px;color:#64748b;font-size:12px;line-height:1.5;">
                Nếu bạn không tạo tài khoản này, hãy bỏ qua email.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
  return { text, html };
}

function buildPasswordResetMessage({ name, email, resetLink }) {
  const safeName = escapeHtml(name || email || "bạn");
  const safeEmail = escapeHtml(email);
  const safeLink = escapeAttribute(resetLink);
  const text = [
    `Xin chào ${name || email || "bạn"},`,
    "",
    "Bạn vừa yêu cầu đặt lại mật khẩu Shcare.",
    "Mở liên kết dưới đây để tiếp tục:",
    resetLink,
    "",
    "Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua email và kiểm tra các phiên đăng nhập của tài khoản.",
  ].join("\n");
  const html = `
    <p>Xin chào ${safeName},</p>
    <p>Bạn vừa yêu cầu đặt lại mật khẩu cho tài khoản <strong>${safeEmail}</strong>.</p>
    <p><a href="${safeLink}">Đặt lại mật khẩu Shcare</a></p>
    <p>Nếu bạn không thực hiện yêu cầu này, hãy bỏ qua email và kiểm tra các phiên đăng nhập của tài khoản.</p>
  `;
  return { text, html };
}

function getAdminNotificationsUrl() {
  return `${getWebAdminBaseUrl()}/notifications`;
}

function getNotificationActionUrl(notification) {
  const metadata = sanitizeNotificationMetadata(notification.metadata || notification);
  const actionUrl = readString(metadata.actionUrl, 500);
  if (/^https?:\/\//i.test(actionUrl)) {
    return actionUrl;
  }
  const actionPath = readString(metadata.actionPath, 240);
  if (actionPath.startsWith("/")) {
    return `${getWebAdminBaseUrl()}${actionPath}`;
  }
  return getAdminNotificationsUrl();
}

function getNotificationTypePresentation(type) {
  const normalized = readString(type, 40).toLowerCase();
  const map = {
    success: { label: "Thành công", tone: "#10B981", background: "#ECFDF5" },
    warning: { label: "Cảnh báo", tone: "#F59E0B", background: "#FFFBEB" },
    error: { label: "Lỗi", tone: "#EF4444", background: "#FEF2F2" },
    critical: { label: "Khẩn cấp", tone: "#DC2626", background: "#FEF2F2" },
    info: { label: "Thông tin", tone: "#0B5C9A", background: "#EFF6FF" },
  };
  return map[normalized] || { label: normalized || "Thông báo", tone: "#0B5C9A", background: "#EFF6FF" };
}

function getPlatformAdminEmailRecipients() {
  return normalizeEmailRecipients(
    db.users
      .filter((user) => isPlatformAdminUser(user))
      .filter((user) => !["locked", "deleted", "disabled", "inactive"].includes(String(user.accountStatus || "active").toLowerCase()))
      .map((user) => ({
        email: user.email,
        name: user.name || user.email,
      }))
  );
}

function getNotificationUserLabel(userId) {
  const user = db.users.find((item) => item.id === userId || item.firebaseUid === userId);
  if (!user) return userId || "";
  return `${user.name || user.email || user.id}${user.email ? ` (${user.email})` : ""}`;
}

function getNotificationWorkspaceLabel(organizationId) {
  const workspace = getClinicById(organizationId);
  if (!workspace) return organizationId || "Toàn hệ thống";
  const typeLabel =
    workspace.workspaceType === "hospital"
      ? "Bệnh viện"
      : workspace.workspaceType === "clinic"
        ? "Phòng khám"
        : workspace.workspaceType === "solo_practice"
          ? "Phòng khám cá nhân"
          : workspace.workspaceType === "personal"
            ? "Cá nhân/gia đình"
            : "Workspace";
  return `${typeLabel}: ${workspace.name || workspace.id}`;
}

function getNotificationMetadataLabel(key) {
  const labels = {
    actionPath: "Trang xử lý",
    doctorName: "Tên bác sĩ",
    doctorEmail: "Email bác sĩ",
    doctorPhone: "Số điện thoại",
    clinicName: "Phòng khám/cơ sở",
    specialty: "Chuyên khoa",
    license: "Số CCHN",
    registrationReason: "Lý do đăng ký",
    workspaceType: "Loại workspace",
    accountType: "Loại đăng ký",
    roleRequestStatus: "Trạng thái yêu cầu",
    previousRoleRequestStatus: "Trạng thái trước đó",
    requiredFields: "Trường cần bổ sung",
    requestMessage: "Nội dung yêu cầu",
    reason: "Lý do",
  };
  return labels[key] || key;
}

function formatWorkspaceTypeLabel(value) {
  const raw = String(value || "");
  if (raw === "hospital") return "Bệnh viện";
  if (raw === "clinic") return "Phòng khám/cơ sở";
  if (raw === "solo_practice") return "Phòng khám tư";
  if (raw === "personal") return "Cá nhân/gia đình";
  if (raw === "platform") return "Toàn hệ thống";
  return raw;
}

function formatAccountTypeLabel(value) {
  const raw = String(value || "");
  if (raw === "solo_doctor") return "Bác sĩ tư";
  if (raw === "doctor") return "Bác sĩ cơ sở";
  if (raw === "personal") return "Cá nhân";
  if (raw === "patient") return "Bệnh nhân";
  return raw;
}

function formatNotificationMetadataValue(key, value) {
  if (typeof value === "boolean") return value ? "true" : "false";
  if (key === "workspaceType") return formatWorkspaceTypeLabel(value);
  if (key === "accountType") return formatAccountTypeLabel(value);
  return String(value);
}

function buildNotificationInfoRows(notification) {
  const metadata = sanitizeNotificationMetadata(notification.metadata || notification);
  const rows = [
    ["Mã thông báo", notification.id || ""],
    ["Loại", getNotificationTypePresentation(notification.type).label],
    ["Kênh trong hệ thống", notification.channel || "in_app"],
    ["Phạm vi", getNotificationWorkspaceLabel(notification.organizationId)],
    ["Người liên quan", getNotificationUserLabel(notification.userId)],
    ["Thời gian", formatVietnamDateTime(notification.createdAt || nowIso())],
  ];
  for (const [key, value] of Object.entries(metadata)) {
    if (["id", "type", "title", "message", "channel", "read", "createdAt", "updatedAt", "userId", "organizationId"].includes(key)) {
      continue;
    }
    rows.push([getNotificationMetadataLabel(key), formatNotificationMetadataValue(key, value)]);
  }
  return rows.filter(([, value]) => readString(String(value), 800));
}

function renderNotificationRows(rows) {
  return rows
    .map(
      ([label, value]) => `
        <tr>
          <td style="width: 34%; padding: 12px 14px; border-bottom: 1px solid #E2E8F0; color: #64748B; font-size: 13px; font-weight: 600;">${escapeHtml(label)}</td>
          <td style="padding: 12px 14px; border-bottom: 1px solid #E2E8F0; color: #0F172A; font-size: 13px; line-height: 1.55;">${escapeHtml(value)}</td>
        </tr>`
    )
    .join("");
}

function buildPlatformAdminNotificationEmail(notification, recipientCount = 0) {
  const presentation = getNotificationTypePresentation(notification.type);
  const title = readString(notification.title, 180) || "Thông báo Smart Health";
  const message = readString(notification.message, 2400) || "Hệ thống Smart Health vừa ghi nhận một thông báo mới.";
  const notificationUrl = getNotificationActionUrl(notification);
  const rows = buildNotificationInfoRows(notification);
  const subject = `[Smart Health] ${title}`;
  const text = [
    "Smart Health - Thông báo quản trị",
    "",
    `Tiêu đề: ${title}`,
    `Nội dung: ${message}`,
    `Loại: ${presentation.label}`,
    `Phạm vi: ${getNotificationWorkspaceLabel(notification.organizationId)}`,
    `Người liên quan: ${getNotificationUserLabel(notification.userId) || "Không có"}`,
    `Thời gian: ${formatVietnamDateTime(notification.createdAt || nowIso())}`,
    `Mở Web Admin: ${notificationUrl}`,
  ].join("\n");
  const html = `<!doctype html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin: 0; padding: 0; background: #F5F7FA; color: #0F172A; font-family: Inter, Arial, Helvetica, sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #F5F7FA; padding: 28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 680px; background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 16px; overflow: hidden; box-shadow: 0 14px 35px rgba(15, 23, 42, 0.08);">
            <tr>
              <td style="background: #0B5C9A; padding: 26px 28px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td>
                      <div style="display: inline-block; padding: 6px 10px; border: 1px solid rgba(255,255,255,0.35); border-radius: 999px; color: #E0F2FE; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase;">Smart Health Admin</div>
                      <h1 style="margin: 18px 0 6px; color: #FFFFFF; font-size: 26px; line-height: 1.25; font-weight: 800;">${escapeHtml(title)}</h1>
                      <p style="margin: 0; color: #D8EEFF; font-size: 14px; line-height: 1.6;">Thông báo này được gửi tự động đến quản trị viên toàn hệ thống.</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding: 28px;">
                <div style="display: inline-block; margin-bottom: 18px; padding: 7px 12px; border-radius: 999px; background: ${presentation.background}; color: ${presentation.tone}; font-size: 13px; font-weight: 800;">${escapeHtml(presentation.label)}</div>
                <div style="padding: 18px 20px; border: 1px solid #D8E7F3; border-left: 5px solid ${presentation.tone}; border-radius: 12px; background: #FBFDFF;">
                  <p style="margin: 0; color: #0F172A; font-size: 16px; line-height: 1.75;">${escapeHtml(message).replace(/\n/g, "<br />")}</p>
                </div>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top: 22px; border: 1px solid #E2E8F0; border-radius: 12px; overflow: hidden; border-collapse: separate; border-spacing: 0;">
                  ${renderNotificationRows(rows)}
                </table>
                <div style="margin-top: 26px; text-align: center;">
                  <a href="${escapeAttribute(notificationUrl)}" style="display: inline-block; background: #0B5C9A; color: #FFFFFF; text-decoration: none; padding: 13px 20px; border-radius: 10px; font-size: 14px; font-weight: 800;">Mở trong Web Admin</a>
                </div>
                <p style="margin: 22px 0 0; color: #64748B; font-size: 12px; line-height: 1.6;">Email được gửi tới ${recipientCount || "các"} quản trị viên toàn hệ thống đang hoạt động. Nếu thông báo không liên quan, hãy kiểm tra cấu hình phân quyền và phạm vi workspace trong Web Admin.</p>
              </td>
            </tr>
            <tr>
              <td style="background: #F8FAFC; border-top: 1px solid #E2E8F0; padding: 18px 28px;">
                <p style="margin: 0; color: #64748B; font-size: 12px; line-height: 1.6;">Smart Health Digital Stethoscope - hệ thống giám sát, quản trị thiết bị và hồ sơ nghe tim phổi từ xa.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, text, html };
}

async function sendNotificationEmailToPlatformAdmins(notification) {
  const recipients = getPlatformAdminEmailRecipients();
  if (recipients.length === 0) {
    console.warn(`Skip notification email ${notification.id || ""}: no platform admin recipients`);
    await saveNotificationEmailStatus(notification, {
      emailStatus: "no_recipient",
      emailErrorMessage: "PLATFORM_ADMIN_EMAIL_RECIPIENT_UNAVAILABLE",
    });
    return null;
  }
  const runtime = getEmailRuntimeStatus();
  if (!isNotificationEmailEnabled() || !runtime.configured) {
    console.warn(`Skip notification email ${notification.id || ""}: ${runtime.provider} not configured (${runtime.missing.join(", ")})`);
    await saveNotificationEmailStatus(notification, {
      emailStatus: isNotificationEmailEnabled() ? "unavailable" : "disabled",
      emailErrorMessage: isNotificationEmailEnabled()
        ? "NOTIFICATION_EMAIL_PROVIDER_UNAVAILABLE"
        : "NOTIFICATION_EMAIL_DISABLED",
    });
    return null;
  }

  const email = buildPlatformAdminNotificationEmail(notification, recipients.length);
  const result = await sendEmail({
    to: recipients,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });

  await saveNotificationEmailStatus(notification, {
    emailStatus: "sent",
    emailErrorMessage: "",
    sentAt: nowIso(),
  });
  addAccessLog(`Email thông báo đã gửi tới ${recipients.length} quản trị viên toàn hệ thống`, {
    severity: "success",
    organizationId: notification.organizationId || "",
  });
  return result;
}

const doctorRequestAdminEmailDispatchIds = new Set();

// This fanout is deliberately bound to the doctor-review workflow. Generic
// notification factories must not leak private notification content to the
// platform-wide administrator audience as a hidden side effect.
function queueDoctorRequestAdminEmail(notification) {
  const runtime = getEmailRuntimeStatus();
  if (
    !notification?.id ||
    !isNotificationEmailEnabled() ||
    !runtime.configured ||
    doctorRequestAdminEmailDispatchIds.has(notification.id)
  ) {
    return;
  }
  doctorRequestAdminEmailDispatchIds.add(notification.id);
  if (doctorRequestAdminEmailDispatchIds.size > 1000) {
    for (const id of Array.from(doctorRequestAdminEmailDispatchIds).slice(0, 300)) {
      doctorRequestAdminEmailDispatchIds.delete(id);
    }
  }
  setTimeout(() => {
    sendNotificationEmailToPlatformAdmins(notification).catch(async (error) => {
      const errorMessage = readString(error?.message || String(error), 500);
      await saveNotificationEmailStatus(notification, {
        emailStatus: "failed",
        emailErrorMessage: errorMessage,
        failedAt: nowIso(),
        retryCount: Number(notification.retryCount || 0) + 1,
      }).catch(() => {});
      addAccessLog("Không gửi được email yêu cầu duyệt bác sĩ", {
        severity: "warning",
        organizationId: notification.organizationId || "",
      });
      console.error(`Doctor request admin email failed (${notification.id}): ${errorMessage}`);
    });
  }, 0);
}

const notificationCampaignEmailDispatchIds = new Set();

function getDirectNotificationActionUrl(notification) {
  const metadata = sanitizeNotificationMetadata(notification.metadata || notification);
  const actionUrl = readString(metadata.actionUrl, 500);
  if (/^https:\/\//i.test(actionUrl)) return actionUrl;
  const actionPath = readString(metadata.actionPath, 240);
  const baseUrl = getStaffInvitationPortalBaseUrl();
  if (actionPath.startsWith("/")) return `${baseUrl}${actionPath}`;
  return `${baseUrl}/portal/notifications`;
}

function buildDirectNotificationEmail(notification, recipient) {
  const title = readString(notification.title, 180) || "Thông báo Shcare";
  const message = readString(notification.message, 2400) || "Bạn có một thông báo mới từ Shcare.";
  const recipientName = readString(recipient?.name || recipient?.email, 180) || "bạn";
  const actionUrl = getDirectNotificationActionUrl(notification);
  const subject = `[Shcare] ${title}`;
  const text = [
    `Xin chào ${recipientName},`,
    "",
    title,
    message,
    "",
    `Mở Shcare: ${actionUrl}`,
  ].join("\n");
  const html = `<!doctype html>
<html lang="vi">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
  <body style="margin:0;padding:0;background:#F4F8FB;color:#102A43;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:28px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#FFFFFF;border:1px solid #D8E3EA;border-radius:16px;overflow:hidden;">
          <tr><td style="background:#2457D6;padding:24px 28px;color:#FFFFFF;"><strong style="font-size:20px;">Shcare</strong><div style="margin-top:4px;color:#DBEAFE;font-size:13px;">Smart Health Care</div></td></tr>
          <tr><td style="padding:28px;">
            <p style="margin:0 0 16px;">Xin chào <strong>${escapeHtml(recipientName)}</strong>,</p>
            <h1 style="margin:0 0 12px;font-size:22px;line-height:1.35;color:#0B1F33;">${escapeHtml(title)}</h1>
            <p style="margin:0;color:#52677A;font-size:15px;line-height:1.7;">${escapeHtml(message).replace(/\n/g, "<br />")}</p>
            <p style="margin:24px 0 0;"><a href="${escapeAttribute(actionUrl)}" style="display:inline-block;background:#2457D6;color:#FFFFFF;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700;">Mở Shcare</a></p>
          </td></tr>
          <tr><td style="border-top:1px solid #D8E3EA;padding:16px 28px;color:#52677A;font-size:12px;">Trạng thái gửi được ghi nhận riêng cho từng kênh trong hệ thống Shcare.</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
  return { subject, text, html };
}

async function saveNotificationEmailStatus(notification, patch) {
  const next = {
    ...notification,
    ...patch,
    deliveryStatus: patch.emailStatus || notification.emailStatus || notification.deliveryStatus,
    updatedAt: nowIso(),
  };
  if (repositories?.notifications?.updateDeliveryStatus) {
    const persisted = await repositories.notifications.updateDeliveryStatus(next);
    if (!persisted) {
      throw httpError(
        404,
        "Notification delivery ledger row was not found",
        "NOTIFICATION_DELIVERY_NOT_FOUND",
      );
    }
    Object.assign(notification, persisted);
    return;
  }
  Object.assign(notification, next);
  const existing = db.notifications.find((item) => item.id === notification.id);
  if (existing) Object.assign(existing, notification);
  await saveDb();
}

async function sendDirectNotificationEmail(notification) {
  const preferenceDecision =
    await resolveCanonicalNotificationPreferenceDecision(notification);
  if (!preferenceDecision.allowed) {
    await saveNotificationEmailStatus(notification, {
      emailStatus: "skipped",
      emailErrorMessage:
        preferenceDecision.reasonCode || "NOTIFICATION_EMAIL_RECIPIENT_UNAVAILABLE",
    });
    return null;
  }
  const recipient = preferenceDecision.user;
  const workspaceId = readString(notification.organizationId, 120);
  const workspaceAuthorized =
    !workspaceId ||
    isPlatformAdminUser(recipient) ||
    hasWorkspaceRelationship(recipient, workspaceId);
  if (
    !recipient ||
    !isActiveUserAccount(recipient) ||
    !workspaceAuthorized ||
    !isDeliverableNotificationEmailAddress(recipient.email)
  ) {
    await saveNotificationEmailStatus(notification, {
      emailStatus: "no_recipient",
      emailErrorMessage: workspaceAuthorized
        ? "NOTIFICATION_EMAIL_RECIPIENT_UNAVAILABLE"
        : "NOTIFICATION_EMAIL_WORKSPACE_ACCESS_REVOKED",
    });
    return null;
  }
  const runtime = getEmailRuntimeStatus();
  if (!isNotificationEmailEnabled() || !runtime.configured) {
    await saveNotificationEmailStatus(notification, {
      emailStatus: isNotificationEmailEnabled() ? "unavailable" : "disabled",
      emailErrorMessage: isNotificationEmailEnabled()
        ? "NOTIFICATION_EMAIL_PROVIDER_UNAVAILABLE"
        : "NOTIFICATION_EMAIL_DISABLED",
    });
    return null;
  }
  const email = buildDirectNotificationEmail(notification, recipient);
  const result = await sendEmail({
    to: [{ email: recipient.email, name: recipient.name || recipient.email }],
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
  await saveNotificationEmailStatus(notification, {
    emailStatus: "sent",
    emailErrorMessage: "",
    sentAt: nowIso(),
    metadata: {
      emailProvider: result.provider || runtime.provider,
      ...(result.messageId ? { emailMessageId: result.messageId } : {}),
    },
  });
  addAccessLog("Email thông báo đã được provider chấp nhận", {
    severity: "success",
    organizationId: notification.organizationId || "",
    resourceType: "notification",
    resourceId: notification.id,
  });
  await saveDb();
  return result;
}

async function fetchBrevoNotificationEvents(messageId) {
  const brevo = getBrevoEnv();
  if (!brevo.apiKey || !messageId) return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(buildBrevoEventReportUrl(brevo.apiUrl, messageId), {
      method: "GET",
      headers: {
        accept: "application/json",
        "api-key": brevo.apiKey,
      },
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw httpError(
        502,
        "Brevo delivery status is temporarily unavailable",
        "BREVO_EVENT_REPORT_FAILED",
        { provider: "brevo", statusCode: response.status },
      );
    }
    return Array.isArray(body?.events) ? body.events : [];
  } finally {
    clearTimeout(timeout);
  }
}

async function refreshBrevoNotificationDelivery(notification) {
  const metadata = notification?.metadata && typeof notification.metadata === "object"
    ? notification.metadata
    : {};
  if (
    metadata.emailProvider !== "brevo" ||
    !metadata.emailMessageId ||
    !["sent", "deferred", "soft_bounce"].includes(notification.emailStatus)
  ) {
    return notification;
  }
  const events = await fetchBrevoNotificationEvents(metadata.emailMessageId);
  const patch = resolveBrevoDeliveryPatch(events);
  if (!patch || patch.emailStatus === notification.emailStatus) return notification;
  await saveNotificationEmailStatus(notification, {
    ...patch,
    metadata: {
      emailProviderLastCheckedAt: nowIso(),
      emailProviderEvent: patch.emailStatus,
    },
  });
  return notification;
}

function buildNotificationCampaignReceipt(notifications) {
  const rows = Array.isArray(notifications) ? notifications : [];
  const first = rows[0];
  if (!first) return null;
  const requestedChannels = Array.isArray(first.requestedChannels)
    ? first.requestedChannels
    : [first.channel || "in_app"];
  const outcome = summarizeNotificationCampaignDelivery(rows, requestedChannels);
  const audienceType = readString(first.audienceType, 40) || "users";
  const audience = {
    type: audienceType,
    workspaceId: first.organizationId,
    ...(first.audienceRole ? { role: first.audienceRole } : {}),
    ...(audienceType === "users"
      ? { userIds: rows.map((row) => row.userId).filter(Boolean).sort() }
      : {}),
  };
  return {
    campaign: {
      id: first.campaignId,
      operationId: first.campaignId,
      organizationId: first.organizationId,
      audience,
      requestedChannels,
      recipientCount: rows.length,
      notificationIds: rows.map((row) => row.id),
      channelSummary: outcome.channelSummary,
      status: outcome.status,
      createdAt: first.createdAt,
    },
    notifications: rows.map(publicNotificationRecipient),
    notification: rows[0] ? publicNotificationRecipient(rows[0]) : null,
    idempotent: false,
    channelAvailability: getNotificationChannelAvailability(),
  };
}

function queueDirectNotificationEmail(notification) {
  if (!notification?.id || notification.emailStatus !== "ready") return;
  if (notificationCampaignEmailDispatchIds.has(notification.id)) return;
  notificationCampaignEmailDispatchIds.add(notification.id);
  if (notificationCampaignEmailDispatchIds.size > 1000) {
    const stale = Array.from(notificationCampaignEmailDispatchIds).slice(0, 300);
    for (const id of stale) notificationCampaignEmailDispatchIds.delete(id);
  }
  setTimeout(() => {
    sendDirectNotificationEmail(notification).catch(async (error) => {
      await saveNotificationEmailStatus(notification, {
        emailStatus: "failed",
        emailErrorMessage: readString(error?.message || String(error), 500),
        failedAt: nowIso(),
        retryCount: Number(notification.retryCount || 0) + 1,
      }).catch(() => {});
      console.error(`Notification email failed (${notification.id}): ${error?.message || error}`);
    });
  }, 0);
}

const notificationPushDispatchIds = new Set();

function isPushNotificationEnabled() {
  return String(process.env.PUSH_NOTIFICATIONS_ENABLED || "true").toLowerCase() !== "false";
}

function isInvalidFcmTokenError(error) {
  const code = readString(error && error.code, 160);
  return [
    "messaging/invalid-registration-token",
    "messaging/registration-token-not-registered",
    "messaging/invalid-argument",
  ].includes(code);
}

function hashPushToken(token) {
  const value = readString(token, 4096);
  if (!value) return "";
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function getPushRetryMax() {
  const value = Number(process.env.PUSH_NOTIFICATION_MAX_RETRIES || 1);
  if (!Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(3, Math.trunc(value)));
}

function getPushRetryDelayMs() {
  const value = Number(process.env.PUSH_NOTIFICATION_RETRY_MS || 30000);
  if (!Number.isFinite(value)) return 30000;
  return Math.max(1000, Math.min(300000, Math.trunc(value)));
}

function buildNotificationPushAttempt(notification, detail = {}) {
  const attemptNumber = Number(detail.attemptNumber || 1);
  return {
    id: createId("push_attempt"),
    notificationId: readString(notification && notification.id, 120),
    userId: readString(notification && notification.userId, 120),
    organizationId: readString(notification && notification.organizationId, 120),
    attemptNumber: Number.isFinite(attemptNumber) ? Math.max(1, Math.trunc(attemptNumber)) : 1,
    tokenHash: hashPushToken(detail.token),
    status: readString(detail.status, 40) || "failed",
    provider: "fcm",
    retryable: Boolean(detail.retryable),
    invalidToken: Boolean(detail.invalidToken),
    errorMessage: readString(detail.errorMessage || (detail.error && detail.error.message) || "", 500),
    createdAt: nowIso(),
  };
}

function appendNotificationPushAttempts(notification, attempts = []) {
  const existing = Array.isArray(notification && notification.pushAttempts) ? notification.pushAttempts : [];
  const nextAttempts = attempts.filter((attempt) => attempt && typeof attempt === "object");
  return [...existing, ...nextAttempts].slice(-50);
}

async function saveNotificationPushStatus(notification, patch) {
  const next = { ...notification, ...patch, updatedAt: nowIso() };
  if (repositories?.notifications?.updateDeliveryStatus) {
    const persisted = await repositories.notifications.updateDeliveryStatus(next);
    if (!persisted) {
      throw httpError(
        404,
        "Notification delivery ledger row was not found",
        "NOTIFICATION_DELIVERY_NOT_FOUND",
      );
    }
    Object.assign(notification, persisted);
  } else {
    Object.assign(notification, next);
    const existing = db.notifications.find((item) => item.id === notification.id);
    if (existing) Object.assign(existing, notification);
    await saveDb();
  }
}

async function listEligibleNotificationDevices(notification, options = {}) {
  return resolveEligibleNotificationDevices({
    notification,
    deviceIds: options.deviceIds,
    loadCanonicalUser: (userId) =>
      refreshAuthenticatedAuthorization({ id: userId }),
    isUserActive: isActiveUserAccount,
    hasWorkspaceAccess: hasWorkspaceMembership,
    listDevices: (userId, workspaceId) =>
      repositories?.notificationDevices
        ? repositories.notificationDevices.listForUser(userId, workspaceId, {
            minimumProtocolVersion: 2,
          })
        : (db.notificationDevices || []).filter(
            (device) =>
              device.userId === userId &&
              device.workspaceId === workspaceId &&
              Number(device.notificationProtocolVersion || 0) >= 2 &&
              device.enabled !== false,
          ),
    isSessionActive: (userId, authSessionId) =>
      repositories?.authSessions?.isActiveForUser
        ? repositories.authSessions.isActiveForUser(userId, authSessionId)
        : [...(db.sessions || []), ...(db.authSessions || [])].some(
            (session) =>
              session.id === authSessionId &&
              session.userId === userId &&
              !session.revokedAt,
          ),
  });
}

async function sendNotificationPush(notification, options = {}) {
  if (!notification || !notification.id || !notification.userId) {
    return null;
  }
  const attemptNumber = Number.isFinite(Number(options.attemptNumber))
    ? Math.max(1, Math.trunc(Number(options.attemptNumber)))
    : 1;
  const preferenceDecision =
    await resolveCanonicalNotificationPreferenceDecision(notification);
  if (!preferenceDecision.allowed) {
    const attempts = [
      buildNotificationPushAttempt(notification, {
        attemptNumber,
        status: "skipped",
        errorMessage:
          preferenceDecision.reasonCode || "NOTIFICATION_RECIPIENT_UNAVAILABLE",
      }),
    ];
    await saveNotificationPushStatus(notification, {
      pushStatus: mergeNotificationPushStatus(
        notification.pushStatus,
        "skipped",
      ),
      pushErrorMessage:
        preferenceDecision.reasonCode || "NOTIFICATION_RECIPIENT_UNAVAILABLE",
      pushAttempts: appendNotificationPushAttempts(notification, attempts),
    });
    return null;
  }
  if (!isPushNotificationEnabled()) {
    const attempts = [
      buildNotificationPushAttempt(notification, {
        attemptNumber,
        status: "disabled",
        errorMessage: "PUSH_NOTIFICATIONS_DISABLED",
      }),
    ];
    await saveNotificationPushStatus(notification, {
      pushStatus: mergeNotificationPushStatus(
        notification.pushStatus,
        "disabled",
      ),
      pushErrorMessage: "PUSH_NOTIFICATIONS_DISABLED",
      pushAttempts: appendNotificationPushAttempts(notification, attempts),
    });
    return null;
  }
  const admin = getFirebaseAdmin(process.env);
  if (!admin || typeof admin.messaging !== "function") {
    const errorMessage = "Firebase Admin messaging is not configured";
    const attempts = [
      buildNotificationPushAttempt(notification, {
        attemptNumber,
        status: "skipped",
        errorMessage,
      }),
    ];
    await saveNotificationPushStatus(notification, {
      pushStatus: mergeNotificationPushStatus(
        notification.pushStatus,
        "skipped",
      ),
      pushErrorMessage: errorMessage,
      pushAttempts: appendNotificationPushAttempts(notification, attempts),
    });
    return null;
  }
  const devices = selectBoundedNotificationDevices(
    await listEligibleNotificationDevices(notification, {
      deviceIds: options.deviceIds,
    }),
  );
  if (devices.length === 0) {
    const attempts = [
      buildNotificationPushAttempt(notification, {
        attemptNumber,
        status: "no_devices",
        errorMessage: "PUSH_NOTIFICATION_NO_ELIGIBLE_DEVICES",
      }),
    ];
    await saveNotificationPushStatus(notification, {
      pushStatus: mergeNotificationPushStatus(
        notification.pushStatus,
        "no_devices",
      ),
      pushErrorMessage: "PUSH_NOTIFICATION_NO_ELIGIBLE_DEVICES",
      pushAttempts: appendNotificationPushAttempts(notification, attempts),
    });
    return null;
  }

  const messaging = admin.messaging();
  const payload = buildPushNotificationPayload(notification);
  let successCount = 0;
  const failures = [];
  const retryableFailedDeviceIds = [];
  const attempts = [];
  for (const device of devices) {
    const token = readString(device.fcmToken, 4096);
    if (!token) continue;
    try {
      await messaging.send({ ...payload, token });
      successCount += 1;
      attempts.push(
        buildNotificationPushAttempt(notification, {
          attemptNumber,
          token,
          status: "sent",
        })
      );
    } catch (error) {
      const message = readString(error && error.message ? error.message : String(error), 500);
      const invalidToken = isInvalidFcmTokenError(error);
      const retryable = !invalidToken;
      failures.push(message);
      attempts.push(
        buildNotificationPushAttempt(notification, {
          attemptNumber,
          token,
          status: "failed",
          retryable,
          invalidToken,
          errorMessage: message,
        })
      );
      if (invalidToken && repositories && repositories.notificationDevices) {
        await repositories.notificationDevices.disableToken(notification.userId, token, {
          workspaceId: device.workspaceId,
          authSessionId: device.authSessionId,
        });
      } else if (retryable) {
        retryableFailedDeviceIds.push(device.id);
      }
    }
  }

  const pushAttempts = appendNotificationPushAttempts(notification, attempts);
  if (successCount > 0) {
    await saveNotificationPushStatus(notification, {
      pushStatus: mergeNotificationPushStatus(
        notification.pushStatus,
        failures.length ? "partial" : "sent",
      ),
      pushSentAt: nowIso(),
      pushFailedAt: failures.length ? nowIso() : "",
      pushErrorMessage: failures.slice(0, 3).join("; "),
      pushAttempts,
    });
  } else {
    await saveNotificationPushStatus(notification, {
      pushStatus: mergeNotificationPushStatus(
        notification.pushStatus,
        "failed",
      ),
      pushFailedAt: nowIso(),
      pushErrorMessage: failures.slice(0, 3).join("; ") || "FCM send failed",
      pushAttempts,
    });
  }

  if (retryableFailedDeviceIds.length > 0 && attemptNumber <= getPushRetryMax()) {
    setTimeout(() => {
      sendNotificationPush(notification, {
        deviceIds: retryableFailedDeviceIds,
        attemptNumber: attemptNumber + 1,
      }).catch((error) => {
        const message = readString(error && error.message ? error.message : String(error), 500);
        console.error(`Notification push retry failed (${notification.id}): ${message}`);
      });
    }, getPushRetryDelayMs());
  }
  return { successCount, failureCount: failures.length };
}

function queueNotificationPush(notification) {
  if (!notification || !notification.id || !notification.userId) {
    return;
  }
  if (notificationPushDispatchIds.has(notification.id)) {
    return;
  }
  notificationPushDispatchIds.add(notification.id);
  if (notificationPushDispatchIds.size > 1000) {
    const stale = Array.from(notificationPushDispatchIds).slice(0, 300);
    for (const id of stale) notificationPushDispatchIds.delete(id);
  }

  setTimeout(() => {
    sendNotificationPush(notification).catch((error) => {
      notification.pushStatus = "failed";
      notification.pushFailedAt = nowIso();
      notification.pushErrorMessage = readString(error && error.message ? error.message : String(error), 500);
      const attempts = [
        buildNotificationPushAttempt(notification, {
          attemptNumber: 1,
          status: "failed",
          errorMessage: notification.pushErrorMessage,
        }),
      ];
      void saveNotificationPushStatus(notification, {
        pushStatus: notification.pushStatus,
        pushFailedAt: notification.pushFailedAt,
        pushErrorMessage: notification.pushErrorMessage,
        pushAttempts: appendNotificationPushAttempts(notification, attempts),
      });
      console.error(`Notification push failed (${notification.id}): ${notification.pushErrorMessage}`);
    });
  }, 0);
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
  let outboundResult;
  try {
    outboundResult = await postOutboundWebhook({
      url,
      headers,
      bodyText,
      env: process.env,
      tenantManaged: !process.env.OUTBOUND_WEBHOOK_URL,
    });
  } catch (error) {
    const statusCode = error?.code === "OUTBOUND_WEBHOOK_DESTINATION_NOT_ALLOWED" ? 403 :
      error?.code === "OUTBOUND_WEBHOOK_DESTINATION_INVALID" ? 422 :
      error?.code === "OUTBOUND_WEBHOOK_TIMEOUT" ? 504 : 502;
    throw httpError(
      statusCode,
      error?.message || "Outbound webhook request failed",
      error?.code || "OUTBOUND_WEBHOOK_REQUEST_FAILED",
      error?.details,
    );
  }
  const { response, responseText } = outboundResult;
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
  const sameFirebaseIdentity = Boolean(
    actorUser.firebaseUid && targetUser.firebaseUid && actorUser.firebaseUid === targetUser.firebaseUid,
  );
  if (actorUser.id === targetUser.id || sameFirebaseIdentity) {
    throw httpError(400, `Không thể ${action} tài khoản đang đăng nhập`);
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
  if (Object.prototype.hasOwnProperty.call(payload, "password")) {
    const password = readString(payload.password, 200);
    if (password.length < 8) {
      throw httpError(400, "Mật khẩu mới cần tối thiểu 8 ký tự", "PASSWORD_TOO_SHORT");
    }
    updates.password = password;
  }
  if (Object.keys(updates).length > 0) {
    await firebaseAdminApp.auth().updateUser(targetUser.firebaseUid, updates);
  }
  return { updated: true };
}

async function updateFirebaseLinkedAccount(targetUser, payload = {}) {
  const firebaseUid = targetUser.firebaseUid || "";
  if (!firebaseUid) {
    return {
      updated: true,
      skipped: true,
      firebaseUid,
    };
  }
  if (!FIREBASE_AUTH_ENABLED) {
    return { updated: false, firebaseUid, providerUnavailable: true };
  }
  const firebaseAdminApp = getFirebaseAdmin(process.env);
  if (!firebaseAdminApp) {
    return {
      updated: false,
      firebaseUid,
      warning: "Firebase Admin chưa sẵn sàng, backend đã cập nhật trạng thái nhưng chưa cập nhật được Firebase Auth.",
    };
  }

  const updates = {};
  if (Object.prototype.hasOwnProperty.call(payload, "displayName")) {
    updates.displayName = readString(payload.displayName, 160);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "disabled")) {
    updates.disabled = Boolean(payload.disabled);
  }
  if (Object.prototype.hasOwnProperty.call(payload, "password")) {
    const password = typeof payload.password === "string" ? payload.password : "";
    if (password.length < 8) {
      throw httpError(400, "Mật khẩu mới cần tối thiểu 8 ký tự", "PASSWORD_TOO_SHORT");
    }
    if (password.length > 200) {
      throw httpError(400, "Mật khẩu vượt quá độ dài cho phép", "PASSWORD_TOO_LONG");
    }
    updates.password = password;
  }

  try {
    if (Object.keys(updates).length > 0) {
      await firebaseAdminApp.auth().updateUser(firebaseUid, updates);
    }
    // Firebase revokes refresh tokens as part of a password update. Explicit
    // revocation remains available for non-password lock flows.
    let firebaseTokensRevoked =
      Object.prototype.hasOwnProperty.call(updates, "password");
    if (payload.revokeRefreshTokens) {
      await firebaseAdminApp.auth().revokeRefreshTokens(firebaseUid);
      firebaseTokensRevoked = true;
    }
    return {
      updated: true,
      firebaseUid,
      firebaseDisabled: Object.prototype.hasOwnProperty.call(updates, "disabled") ? updates.disabled : undefined,
      firebaseTokensRevoked,
    };
  } catch (err) {
    const code = err && err.code ? String(err.code) : "";
    const message = err && err.message ? String(err.message) : String(err);
    if (code === "auth/user-not-found") {
      return {
        updated: false,
        firebaseUid,
        firebaseAlreadyMissing: true,
        warning: "Tài khoản Firebase Auth không còn tồn tại, backend đã cập nhật trạng thái.",
      };
    }
    return {
      updated: false,
      firebaseUid,
      warning: `Không thể cập nhật Firebase Auth: ${message}`,
    };
  }
}

async function deleteFirebaseLinkedAccount(targetUser) {
  const firebaseUid = targetUser.firebaseUid || "";
  if (!firebaseUid) {
    return { updated: true, skipped: true, firebaseDeleted: false, firebaseAlreadyMissing: false };
  }
  if (!FIREBASE_AUTH_ENABLED) {
    return {
      updated: false,
      providerUnavailable: true,
      firebaseDeleted: false,
      firebaseAlreadyMissing: false,
    };
  }
  const firebaseAdminApp = getFirebaseAdmin(process.env);
  if (!firebaseAdminApp) {
    return { updated: false, firebaseDeleted: false, firebaseAlreadyMissing: false };
  }
  try {
    await firebaseAdminApp.auth().deleteUser(firebaseUid);
    return { updated: true, firebaseDeleted: true, firebaseAlreadyMissing: false };
  } catch (error) {
    if (error?.code === "auth/user-not-found") {
      return { updated: true, firebaseDeleted: false, firebaseAlreadyMissing: true };
    }
    throw error;
  }
}

function sanitizeIdentityProviderResult(result = {}) {
  return {
    updated: result.updated === true,
    skipped: result.skipped === true,
    firebaseDeleted: result.firebaseDeleted === true,
    firebaseAlreadyMissing: result.firebaseAlreadyMissing === true,
    providerUnavailable: result.providerUnavailable === true,
    firebaseDisabled: typeof result.firebaseDisabled === "boolean" ? result.firebaseDisabled : undefined,
    firebaseTokensRevoked: result.firebaseTokensRevoked === true,
    firebaseClaims:
      result.firebaseClaims && typeof result.firebaseClaims === "object" && !Array.isArray(result.firebaseClaims)
        ? { ...result.firebaseClaims }
        : undefined,
    warning: readString(result.warning, 320) || undefined,
  };
}

function resolveDurablePasswordProvider(identityOperation = {}) {
  if (identityOperation.operation !== "reset_password") return "";
  const providers = new Set();
  const addProvider = (value) => {
    const provider = readString(value, 20).toLowerCase();
    if (["firebase", "demo"].includes(provider)) providers.add(provider);
  };
  addProvider(identityOperation.targetState?.provider);
  const operationId = readString(identityOperation.id, 160);
  if (operationId) {
    const audit = (db.auditLogs || []).find(
      (entry) =>
        entry.id === `audit_password_change_${operationId}` &&
        entry.action === "account.password.change",
    );
    addProvider(audit?.metadata?.provider);
    const notification = (db.notifications || []).find(
      (entry) => entry.id === `noti_password_change_${operationId}`,
    );
    addProvider(notification?.metadata?.provider);
  }
  if (identityOperation.providerResult?.skipped === true) {
    providers.add("demo");
  }
  if (identityOperation.providerResult?.firebaseTokensRevoked === true) {
    providers.add("firebase");
  }
  return providers.size === 1 ? [...providers][0] : "";
}

async function runIdentityProviderSaga(
  req,
  actorUser,
  targetUser,
  operation,
  fingerprintPayload,
  providerAction,
  sagaOptions = {},
) {
  if (!repositories?.identityOperations) {
    throw httpError(503, "Identity operation storage is unavailable", "IDENTITY_OPERATION_STORAGE_UNAVAILABLE");
  }
  const context = getRequestContext(req) || createRequestContext(req);
  const explicitIdempotencyKey = getIdempotencyKey(req, fingerprintPayload || {});
  const fingerprintInput = {
    operation,
    targetUserId: targetUser.id,
    payload: fingerprintPayload || {},
  };
  const requestFingerprint =
    operation === "reset_password"
      ? createPasswordIdempotencyFingerprint(fingerprintInput, process.env)
      : createIdempotencyFingerprint(fingerprintInput);
  const idempotencyKey = explicitIdempotencyKey || `implicit:${requestFingerprint}`;
  const existing = typeof repositories.identityOperations.findByIntent === "function"
    ? await repositories.identityOperations.findByIntent({
        targetUserId: targetUser.id,
        operation,
        idempotencyKey,
        requestFingerprint,
      })
    : null;
  const existingIdentityOperation = existing?.identityOperation || null;
  if (
    operation === "reset_password" &&
    ["pending_provider", "provider_failed"].includes(
      existingIdentityOperation?.status || "",
    )
  ) {
    const durableProvider = readString(
      existingIdentityOperation.targetState?.provider,
      20,
    ).toLowerCase();
    const requestedProvider = readString(
      sagaOptions.targetState?.provider,
      20,
    ).toLowerCase();
    if (
      existingIdentityOperation.status === "provider_failed" ||
      !["firebase", "demo"].includes(durableProvider) ||
      durableProvider !== requestedProvider
    ) {
      throw reconciliationError(existingIdentityOperation.id);
    }
  }
  if (
    existingIdentityOperation?.status === "pending_provider" &&
    existingIdentityOperation.providerStatus === "applying"
  ) {
    throw reconciliationError(existingIdentityOperation.id);
  }
  if (
    !["completed", "provider_applied"].includes(
      existing?.identityOperation?.status || "",
    ) &&
    typeof sagaOptions.beforeBegin === "function"
  ) {
    await sagaOptions.beforeBegin();
  }
  const started = await repositories.identityOperations.begin({
    targetUserId: targetUser.id,
    actorUserId: actorUser.id,
    organizationId: targetUser.organizationId || "",
    operation,
    idempotencyKey,
    requestFingerprint,
    targetState: sagaOptions.targetState || {},
    expectedCurrentPassword: sagaOptions.expectedCurrentPassword,
    requireActiveTarget: sagaOptions.requireActiveTarget,
    preserveAccountStatus: sagaOptions.preserveAccountStatus,
    preserveSessionId: sagaOptions.preserveSessionId,
    protectLastPlatformAdmin: Object.prototype.hasOwnProperty.call(sagaOptions, "protectLastPlatformAdmin")
      ? Boolean(sagaOptions.protectLastPlatformAdmin)
      : isPlatformAdminUser(targetUser) && ["lock", "delete"].includes(operation),
    ip: context.ip || req.socket.remoteAddress || "",
    userAgent: context.userAgent || readString(req.headers["user-agent"], 240),
  });
  if (operation !== "unlock" && !started.replayed) {
    closeRealtimeSocketsForUser(targetUser.id, "AUTH_SESSION_REVOKED");
  }
  if (started.identityOperation.status === "completed") {
    return {
      started,
      completed: {
        identityOperation: started.identityOperation,
        user: started.user,
        deleted: operation === "delete",
        replayed: true,
      },
      providerResult: started.identityOperation.providerResult || {},
      replayed: true,
      idempotencyKeyProvided: Boolean(explicitIdempotencyKey),
    };
  }
  if (
    started.identityOperation.status === "pending_provider" &&
    started.identityOperation.providerStatus === "applying"
  ) {
    throw reconciliationError(started.identityOperation.id);
  }

  let providerResult = started.identityOperation.status === "provider_applied"
    ? started.identityOperation.providerResult || {}
    : null;
  if (!providerResult) {
    const execution = await executeIdentityProviderMutationOnce({
      operationId: started.identityOperation.id,
      identityOperations: repositories.identityOperations,
      providerAction,
      sanitizeResult: sanitizeIdentityProviderResult,
      isConfirmed: (result) =>
        isFirebaseProviderMutationConfirmed(targetUser, result, operation),
    });
    providerResult = execution.providerResult;
  }

  if (sagaOptions.deferBackendFinalization) {
    const providerApplied = {
      ...started.identityOperation,
      status: "provider_applied",
      providerStatus: providerResult?.skipped ? "skipped" : "applied",
      providerResult,
    };
    return {
      started,
      completed: {
        identityOperation: providerApplied,
        user: started.user,
        deleted: false,
        replayed: Boolean(started.replayed),
      },
      providerResult,
      replayed: Boolean(started.replayed),
      deferredBackendFinalization: true,
      idempotencyKeyProvided: Boolean(explicitIdempotencyKey),
    };
  }

  const completed = await repositories.identityOperations.complete({
    operationId: started.identityOperation.id,
    providerSucceeded: true,
    providerStatus: providerResult?.skipped ? "skipped" : "applied",
    providerResult,
  });
  return {
    started,
    completed,
    providerResult,
    replayed: Boolean(started.replayed || completed.replayed),
    idempotencyKeyProvided: Boolean(explicitIdempotencyKey),
  };
}

async function revokeUserSessions(userId, auditInput = {}) {
  if (repositories?.authSessions?.revokeAllForUser) {
    const result = await repositories.authSessions.revokeAllForUser(userId, auditInput);
    closeRealtimeSocketsForUser(userId, "AUTH_SESSION_REVOKED");
    return result;
  }
  const revokedAt = nowIso();
  let demoSessionsRevoked = 0;
  let firebaseSessionsRevoked = 0;
  db.sessions = db.sessions.map((session) => {
    if (session.userId === userId && !session.revokedAt) {
      demoSessionsRevoked += 1;
      return { ...session, revokedAt };
    }
    return session;
  });
  db.authSessions = db.authSessions.map((session) => {
    if (session.userId === userId && !session.revokedAt) {
      firebaseSessionsRevoked += 1;
      return { ...session, revokedAt };
    }
    return session;
  });
  closeRealtimeSocketsForUser(userId, "AUTH_SESSION_REVOKED");
  return { revokedAt, demoSessionsRevoked, firebaseSessionsRevoked };
}

function prepareManagedAdminRoleTransition(targetUser, roleValue, organizationIdValue) {
  const roleInfo = roleValue && typeof roleValue === "object" && roleValue.role
    ? roleValue
    : normalizeManagedAdminRole(roleValue || targetUser.role || "workspace_admin");
  let organizationId = readString(organizationIdValue || targetUser.organizationId, 120);
  let organization = null;
  if (roleInfo.requiresWorkspace) {
    if (!organizationId) {
      throw httpError(400, "Admin bệnh viện phải được gán workspace/bệnh viện");
    }
    organization = getClinicById(organizationId);
    if (!organization) {
      throw httpError(404, "Không tìm thấy workspace/bệnh viện để cấp quyền");
    }
  } else {
    organizationId = organizationId || "org_default_clinic";
    organization = getClinicById(organizationId);
  }
  assertActiveManagedAdminWorkspace(roleInfo.role, organization);

  return {
    roleInfo,
    organization,
    targetState: {
      role: roleInfo.role,
      requestedRole: roleInfo.role,
      organizationId,
      accountStatus: "active",
    },
  };
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
  const requestedTitle = readString(payload.title, 120);
  const requestedHospital = readString(payload.hospital, 160);
  const roleInfo = normalizeManagedAdminRole(payload.role || "workspace_admin");
  assertManagedAdminAssignableRole({ targetRole: roleInfo.role, operation: "create" });
  if (!isValidEmailAddress(email)) {
    throw httpError(400, "Email admin không hợp lệ");
  }
  if (!name) {
    throw httpError(400, "Họ tên admin là bắt buộc");
  }
  if (password.length < 8) {
    throw httpError(400, "Mật khẩu tạm thời phải có ít nhất 8 ký tự");
  }

  let organizationId = readString(payload.organizationId || payload.workspaceId, 120);
  let organization = null;
  if (roleInfo.requiresWorkspace) {
    if (!organizationId) {
      throw httpError(400, "Admin bệnh viện phải được gán workspace/bệnh viện");
    }
    organization = getClinicById(organizationId);
    if (!organization) {
      throw httpError(404, "Không tìm thấy workspace/bệnh viện để cấp quyền");
    }
  } else {
    organizationId = organizationId || "org_default_clinic";
    organization = getClinicById(organizationId);
  }
  assertActiveManagedAdminWorkspace(roleInfo.role, organization);

  const idempotencyKey = readString(req.headers["idempotency-key"], 160);
  if (!idempotencyKey) {
    throw httpError(
      400,
      "Idempotency-Key is required when creating a managed admin account",
      "IDEMPOTENCY_KEY_REQUIRED",
    );
  }
  if (
    !repositories?.users?.beginManagedAdminCreate ||
    !repositories?.users?.createManagedAdminWithAudit ||
    !repositories?.users?.confirmManagedAdminProviderActivation
  ) {
    throw httpError(503, "Managed admin identity storage is unavailable", "IDENTITY_STORAGE_UNAVAILABLE");
  }

  const publicClaims = {
    role: roleInfo.claimRole,
    organizationId,
    smartHealth: { role: roleInfo.claimRole, organizationId },
  };
  const timestamp = nowIso();
  const candidateUser = {
    id: createId("usr"),
    role: roleInfo.role,
    requestedRole: roleInfo.role,
    roleRequestStatus: "approved",
    accountStatus: "provisioning_pending",
    name,
    title: requestedTitle || roleInfo.title,
    email,
    phone,
    organizationId,
    hospital: requestedHospital || organization?.name || "Smart Health",
    verifiedEmail: true,
    verifiedPhone: Boolean(phone),
    roleRequestedAt: timestamp,
    roleApprovedAt: timestamp,
    firebaseClaims: publicClaims,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const idempotency = {
    scope: getIdempotencyScope(actorUser, organizationId),
    operation: "admin.user.create",
    key: idempotencyKey,
    fingerprint: createIdempotencyFingerprint(managedAdminIdempotencyPayload({
      email,
      name,
      phone,
      role: roleInfo.role,
      organizationId,
      // Only explicit request fields belong in the fingerprint. Derived labels
      // may change after a workspace rename or copy update while the request is
      // being safely replayed.
      title: requestedTitle,
      hospital: requestedHospital,
    })),
  };
  const inFlightKey = `${idempotency.scope}:${idempotency.operation}:${idempotency.key}`;
  const active = managedAdminCreateInFlight.get(inFlightKey);
  if (active) {
    if (active.fingerprint !== idempotency.fingerprint) {
      throw httpError(
        409,
        "Idempotency-Key was already used with a different request payload",
        "IDEMPOTENCY_KEY_REUSED",
      );
    }
    const replay = await active.promise;
    return { ...replay, replayed: true, firebase: { ...replay.firebase, created: false } };
  }

  let managedAdminCreatePhase = "reservation";
  const creationPromise = (async () => {
    const begin = await repositories.users.beginManagedAdminCreate({ user: candidateUser, idempotency });
    const reservation = begin.reservation || {};
    if (!reservation.operationId || !reservation.userId || !reservation.providerUid) {
      throw httpError(
        409,
        "Managed admin creation reservation is incomplete",
        "MANAGED_ADMIN_CREATE_RECONCILIATION_REQUIRED",
      );
    }

    const activateCommittedManagedAdmin = async (
      committed,
      providerUser,
      providerCreatedByCurrentAttempt = false,
    ) => {
      managedAdminCreatePhase = "provider_activation";
      const activation = await activateManagedAdminProvider({
        backendUser: committed.user,
        reservation: committed.reservation,
        providerUser,
        expectedClaims: publicClaims,
        email,
        role: roleInfo.role,
        organizationId,
        enableProvider: (uid) => firebaseAdminApp.auth().updateUser(uid, { disabled: false }),
        reloadProvider: (uid) => firebaseAdminApp.auth().getUser(uid),
        disableProvider: (uid) => firebaseAdminApp.auth().updateUser(uid, { disabled: true }),
        confirmActivation: () => repositories.users.confirmManagedAdminProviderActivation({
          idempotency,
          userId: committed.reservation.userId,
          firebaseUid: committed.reservation.firebaseUid,
          operationId: committed.reservation.activationOperationId,
        }),
        readActivationState: () => repositories.users.beginManagedAdminCreate({
          user: candidateUser,
          idempotency,
        }),
      });
      const confirmed = activation.confirmation || {};
      if (!confirmed.user || confirmed.reservation?.state !== "completed") {
        throw httpError(
          409,
          "Managed admin activation did not produce a canonical active account",
          "MANAGED_ADMIN_CREATE_RECONCILIATION_REQUIRED",
        );
      }
      if (!committed.replayed && !confirmed.replayed) {
        addAccessLog(`Tạo tài khoản ${roleInfo.label}: ${email}`, {
          severity: "success",
          userId: actorUser.id,
          organizationId,
        });
        await createBackendNotification({
          type: "success",
          title: "Đã tạo tài khoản admin",
          message: `${name} đã được cấp quyền ${roleInfo.label}.`,
          userId: actorUser.id,
          organizationId,
          metadata: { targetUserId: confirmed.user.id },
        });
        await saveDb();
      }
      return {
        user: publicUser(confirmed.user),
        firebase: {
          uid: activation.providerUser.uid,
          email,
          created: providerCreatedByCurrentAttempt,
          claims: publicClaims,
        },
        operationId: reservation.operationId,
        replayed: Boolean(begin.replayed || committed.replayed || confirmed.replayed || activation.recovered),
      };
    };

    if (reservation.state === "completed") {
      const replayUser = begin.user || await repositories.users.findById(reservation.userId);
      if (!replayUser || !reservation.firebaseUid || replayUser.firebaseUid !== reservation.firebaseUid) {
        throw httpError(
          409,
          "Completed managed admin account no longer matches its provider identity",
          "MANAGED_ADMIN_CREATE_RECONCILIATION_REQUIRED",
        );
      }
      assertManagedAdminReplayBackendState({
        backendUser: replayUser,
        reservation,
        email,
        role: roleInfo.role,
        organizationId,
      });
      let replayProvider = null;
      try {
        replayProvider = await firebaseAdminApp.auth().getUser(reservation.firebaseUid);
      } catch (error) {
        if (error?.code !== "auth/user-not-found") throw error;
      }
      assertManagedAdminReplayProvider({
        providerUser: replayProvider,
        reservation,
        expectedClaims: publicClaims,
        email,
      });
      return {
        user: publicUser(replayUser),
        firebase: { uid: replayProvider.uid, email, created: false, claims: publicClaims },
        operationId: reservation.operationId,
        replayed: true,
      };
    }

    if (reservation.state === "activation_pending") {
      const activationUser = begin.user || await repositories.users.findById(reservation.userId);
      assertManagedAdminReplayBackendState({
        backendUser: activationUser,
        reservation,
        email,
        role: roleInfo.role,
        organizationId,
      });
      let activationProvider = null;
      try {
        activationProvider = await firebaseAdminApp.auth().getUser(reservation.firebaseUid);
      } catch (error) {
        if (error?.code !== "auth/user-not-found") throw error;
      }
      return activateCommittedManagedAdmin(
        { ...begin, user: activationUser, reservation, replayed: true },
        activationProvider,
        false,
      );
    }

    if (reservation.state !== "provider_pending") {
      throw httpError(
        409,
        "Managed admin creation reservation is in an unsupported state",
        "MANAGED_ADMIN_CREATE_RECONCILIATION_REQUIRED",
      );
    }

    candidateUser.id = reservation.userId;
    managedAdminCreatePhase = "provider_identity";
    const provisioningClaims = {
      ...publicClaims,
      shcareProvisioningOperationId: reservation.operationId,
      smartHealth: {
        ...publicClaims.smartHealth,
        provisioningOperationId: reservation.operationId,
      },
    };
    let firebaseUser = null;
    let providerCreatedByCurrentAttempt = false;
    let backendCommitted = false;
    try {
      try {
        firebaseUser = await firebaseAdminApp.auth().getUserByEmail(email);
      } catch (error) {
        if (error?.code !== "auth/user-not-found") throw error;
      }
      if (firebaseUser) {
        assertPendingManagedAdminProvider({ providerUser: firebaseUser, reservation, email });
      } else {
        try {
          firebaseUser = await firebaseAdminApp.auth().createUser({
            uid: reservation.providerUid,
            email,
            password,
            displayName: name,
            emailVerified: true,
            // The new provider identity cannot authenticate before this saga
            // durably marks it as owned by the reservation below.
            disabled: true,
          });
          providerCreatedByCurrentAttempt = true;
        } catch (error) {
          if (error?.code !== "auth/email-already-exists") throw error;
          firebaseUser = await firebaseAdminApp.auth().getUserByEmail(email);
          assertPendingManagedAdminProvider({ providerUser: firebaseUser, reservation, email });
        }
      }

      managedAdminCreatePhase = "provider_claims";
      await firebaseAdminApp.auth().setCustomUserClaims(firebaseUser.uid, provisioningClaims);
      await firebaseAdminApp.auth().updateUser(firebaseUser.uid, {
        displayName: name,
        emailVerified: true,
        disabled: true,
      });
      firebaseUser = await firebaseAdminApp.auth().getUser(firebaseUser.uid);
      candidateUser.firebaseUid = firebaseUser.uid;
      // The durable provider ownership marker stays provider-side. Backend and
      // API models retain only the authorization claims clients need.
      candidateUser.firebaseClaims = publicClaims;
      managedAdminCreatePhase = "backend_commit";
      const committed = await repositories.users.createManagedAdminWithAudit({
        user: candidateUser,
        idempotency,
        auditInput: {
          actorUserId: actorUser.id,
          organizationId,
          action: "admin.user.create",
          resourceType: "user",
          resourceId: candidateUser.id,
          ip: (getRequestContext(req) || createRequestContext(req)).ip || req.socket.remoteAddress || "",
          userAgent: readString(req.headers["user-agent"], 300),
          metadata: {
            role: candidateUser.role,
            email,
            firebaseUid: firebaseUser.uid,
            workspaceName: organization?.name || "",
            provisioningOperationId: reservation.operationId,
          },
        },
      });
      backendCommitted = true;
      return activateCommittedManagedAdmin(committed, firebaseUser, providerCreatedByCurrentAttempt);
    } catch (error) {
      if (
        firebaseUser?.uid &&
        providerCreatedByCurrentAttempt &&
        !backendCommitted &&
        !error?.backendCommitted
      ) {
        try {
          let providerAlreadyMissing = false;
          try {
            await firebaseAdminApp.auth().updateUser(firebaseUser.uid, { disabled: true });
          } catch (disableError) {
            if (disableError?.code === "auth/user-not-found") providerAlreadyMissing = true;
            else throw disableError;
          }
          if (!providerAlreadyMissing) {
            try {
              await firebaseAdminApp.auth().deleteUser(firebaseUser.uid);
            } catch (deleteError) {
              if (deleteError?.code !== "auth/user-not-found") throw deleteError;
            }
          }
        } catch (cleanupError) {
          throw httpError(
            502,
            "Managed admin creation failed and its newly-created provider account could not be cleaned up",
            "MANAGED_ADMIN_PROVIDER_COMPENSATION_FAILED",
            {
              providerUid: firebaseUser.uid,
              provisioningOperationId: reservation.operationId,
              createError: readString(error?.code || error?.message, 200),
              cleanupError: readString(cleanupError?.code || cleanupError?.message, 200),
            },
          );
        }
      }
      throw error;
    }
  })();
  managedAdminCreateInFlight.set(inFlightKey, {
    fingerprint: idempotency.fingerprint,
    promise: creationPromise,
  });
  try {
    return await creationPromise;
  } catch (error) {
    if (error?.statusCode) throw error;
    if (error?.managedAdminCreatePhase) {
      managedAdminCreatePhase = `backend_commit.${readString(error.managedAdminCreatePhase, 80)}`;
    }
    const providerCode = readString(error?.code || "", 120);
    const providerFailure = providerCode.startsWith("auth/");
    console.error("Managed admin creation failed", {
      phase: managedAdminCreatePhase,
      providerCode: providerCode || "unexpected_error",
    });
    throw httpError(
      providerFailure ? 502 : 500,
      providerFailure
        ? "Không thể tạo danh tính đăng nhập cho tài khoản quản trị"
        : "Không thể hoàn tất quy trình tạo tài khoản quản trị",
      providerFailure ? "MANAGED_ADMIN_PROVIDER_CREATE_FAILED" : "MANAGED_ADMIN_CREATE_FAILED",
      {
        phase: managedAdminCreatePhase,
        providerCode: providerCode || "unexpected_error",
      },
    );
  } finally {
    const current = managedAdminCreateInFlight.get(inFlightKey);
    if (current?.promise === creationPromise) managedAdminCreateInFlight.delete(inFlightKey);
  }
}

function getStorageSummary() {
  const files = buildStorageFileRecords();
  const cloudUsedBytes = files.reduce((total, file) => total + Number(file.byteSize || 0), 0);
  const audioFiles = files.filter((file) =>
    ["wav", "mp3", "m4a", "flac"].includes(String(file.type || "").toLowerCase()) ||
    String(file.contentType || "").toLowerCase().startsWith("audio/"));
  const audioBytes = audioFiles.reduce((total, file) => total + Number(file.byteSize || 0), 0);
  const audioMb = Math.round(audioBytes / 1024 / 1024);
  return {
    ...db.settings.storage,
    autoSync: false,
    cloudBackup: false,
    localUsedMb: 0,
    localTotalMb: 0,
    cloudUsedMb: Math.round(cloudUsedBytes / 1024 / 1024),
    cloudTotalMb: 0,
    cacheMb: 0,
    scanCount: db.scans.length,
    patientCount: db.patients.length,
    audioFileCount: audioFiles.length,
    audioUsedMb: audioMb,
    cloudUsedBytes,
    audioUsedBytes: audioBytes,
    storageFileCount: files.length,
    updatedAt: nowIso(),
  };
}

function getStorageSummaryForUser(user) {
  const files = buildStorageFileRecords(user);
  const cloudUsedBytes = files.reduce((total, file) => total + Number(file.byteSize || 0), 0);
  const audioFiles = files.filter((file) =>
    ["wav", "mp3", "m4a", "flac"].includes(String(file.type || "").toLowerCase()) ||
    String(file.contentType || "").toLowerCase().startsWith("audio/"));
  const audioBytes = audioFiles.reduce((total, file) => total + Number(file.byteSize || 0), 0);
  return {
    ...db.settings.storage,
    autoSync: false,
    cloudBackup: false,
    localUsedMb: 0,
    localTotalMb: 0,
    cloudUsedMb: Math.round(cloudUsedBytes / 1024 / 1024),
    cloudTotalMb: 0,
    cacheMb: 0,
    scanCount: filterScansForUser(user, db.scans).length,
    patientCount: filterPatientsForUser(user, db.patients).length,
    audioFileCount: audioFiles.length,
    audioUsedMb: Math.round(audioBytes / 1024 / 1024),
    cloudUsedBytes,
    audioUsedBytes: audioBytes,
    storageFileCount: files.length,
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

function buildOtaFirmwareDownloadUrl(req, deviceId, otaId) {
  return `${getBackendPublicBaseUrl(req)}/api/v1/devices/${encodeURIComponent(deviceId)}/ota/${encodeURIComponent(otaId)}/firmware`;
}

function getMaxOtaFirmwareBytes() {
  return Math.max(
    1024 * 1024,
    Math.min(
      32 * 1024 * 1024,
      Number(process.env.OTA_MAX_FIRMWARE_BYTES) || 16 * 1024 * 1024,
    ),
  );
}

function resolvePrivateFirmwareStorageBinding(firmwareFileIdInput) {
  const firmwareFileId = readString(firmwareFileIdInput, 120);
  const record = firmwareFileId ? getStorageRecord(firmwareFileId) : null;
  if (
    !record ||
    record.id !== firmwareFileId ||
    record.bucket !== "device-firmware"
  ) {
    throw httpError(
      404,
      "Firmware file not found in device-firmware bucket",
      "OTA_FIRMWARE_RECORD_UNAVAILABLE",
    );
  }
  const { storageFile } = getStorageFileSource(record);
  const objectKey = readString(storageFile?.objectKey, 800);
  const byteSize = Number(storageFile?.byteSize);
  if (
    !storageFile ||
    storageFile.id !== firmwareFileId ||
    (storageFile.status || "active") !== "active" ||
    storageFile.bucket !== "device-firmware" ||
    !objectKey ||
    !Number.isSafeInteger(byteSize) ||
    byteSize <= 0
  ) {
    throw httpError(
      404,
      "Firmware storage binding is unavailable",
      "OTA_FIRMWARE_BINDING_INVALID",
    );
  }
  if (byteSize > getMaxOtaFirmwareBytes()) {
    throw httpError(
      413,
      "Firmware exceeds the configured OTA size limit",
      "OTA_FIRMWARE_SIZE_INVALID",
    );
  }
  return {
    record,
    storageFile,
    binding: {
      firmwareFileId,
      firmwareStorageBucket: "device-firmware",
      firmwareObjectKey: objectKey,
      firmwareByteSize: byteSize,
    },
  };
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

  for (const file of db.storageFiles.filter((item) => (item.status || "active") === "active")) {
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
      visibility: "private",
      tags: Array.isArray(file.tags) ? file.tags : [],
      checksum: file.checksum || file.sha256 || "",
      sha256: file.sha256 || file.checksum || "",
      firmwareVersion: file.firmwareVersion || inferFirmwareVersionFromName(file.name),
      downloadUrl: `/api/admin/storage-files/${encodeURIComponent(file.id)}/download`,
      previewUrl: String(file.contentType || "").startsWith("image/")
        ? `/api/admin/storage-files/${encodeURIComponent(file.id)}/download`
        : "",
    });
  }

  return records.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
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

function privateDeviceOtaAuthoritySnapshot(device, otaInput = device?.ota) {
  return createDeviceOtaAuthoritySnapshot(
    {
      ...device,
      ownershipState: inferDeviceOwnershipState(device),
    },
    otaInput,
  );
}

function isPrivateOtaBoundToCurrentOwnership(device, otaInput = device?.ota) {
  const authority = privateDeviceOtaAuthoritySnapshot(device, otaInput);
  const expectedBinding = createDeviceOtaOwnershipBinding({
    organizationId: authority.organizationId,
    ownerUserId: authority.ownerUserId,
    ownershipState: authority.ownershipState,
  });
  return Boolean(
    authority.organizationId &&
    authority.ownershipState &&
    authority.grantOrganizationId === authority.organizationId &&
    authority.grantOwnerUserId === authority.ownerUserId &&
    authority.grantOwnershipState === authority.ownershipState &&
    authority.ownershipBinding === expectedBinding
  );
}

function isPrivateOtaPersistenceRace(error) {
  return [
    "DEVICE_OTA_STATE_CHANGED",
    "DEVICE_OTA_AUTHORITY_CHANGED",
    "DEVICE_OTA_LIFECYCLE_CHANGED",
    "DEVICE_OTA_AUTHORIZATION_EXPIRED",
    "DEVICE_REVOKED",
  ].includes(error?.code);
}

async function expirePrivateFirmwareDownload(device, otaInput, expectedAuthority) {
  const ota = sanitizeDeviceOtaLifecycle(otaInput);
  const expiredAt = nowIso();
  const code = "OTA_DOWNLOAD_TOKEN_EXPIRED";
  const message = "Firmware download authorization expired";
  const transition = transitionDeviceOtaLifecycle(ota, "expired", {
    at: expiredAt,
    metadata: { failureCode: code, error: message, detail: message },
  });
  let command = ota.commandId ? await findDeviceCommand(device.id, ota.commandId) : null;
  command = command ? structuredClone(command) : null;
  if (command && !["applied", "failed", "expired"].includes(command.state)) {
    transitionDeviceCommand(command, "expired", {
      at: expiredAt,
      code,
      detail: message,
    });
  }
  let persisted;
  try {
    persisted = await saveDeviceOtaLifecycleRecord(device, transition.ota, {
      expectedOtaId: ota.id,
      expectedAuthority: expectedAuthority || privateDeviceOtaAuthoritySnapshot(device, ota),
      allowedCurrentStatuses: ["pending", "delivered", "downloading"],
      command,
    });
  } catch (error) {
    if (isPrivateOtaPersistenceRace(error)) {
      throw httpError(404, "Firmware OTA is invalid or expired", "OTA_DOWNLOAD_AUTHORITY_CHANGED");
    }
    throw error;
  }
  if (persisted?.device) Object.assign(device, persisted.device);
  const canonicalCommand = persisted?.command || command;
  if (canonicalCommand) {
    device.lastCommand = publicDeviceCommand(canonicalCommand);
    await syncDeviceLastCommand(canonicalCommand);
  }
  await appendDeviceEvent(device.id, "ota.download_expired", {
    protocolVersion: Number(ota.protocolVersion || 1),
    otaId: ota.id,
    commandId: ota.commandId || "",
    correlationId: ota.correlationId || "",
    code,
  });
  throw httpError(410, "Firmware OTA Ä‘Ă£ háº¿t háº¡n", code);
}

async function failPrivateFirmwareDownload(device, otaInput, failure = {}) {
  const ota = sanitizeDeviceOtaLifecycle(otaInput);
  const expectedAuthority = failure.expectedAuthority ||
    privateDeviceOtaAuthoritySnapshot(device, ota);
  const expiresAt = Date.parse(ota.expiresAt || "");
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return expirePrivateFirmwareDownload(device, ota, expectedAuthority);
  }
  const failedAt = nowIso();
  const code = readString(failure.code, 80) || "OTA_FIRMWARE_DOWNLOAD_FAILED";
  const message = readString(failure.message, 240) || "Firmware artifact is unavailable";
  const transition = transitionDeviceOtaLifecycle(ota, "failed", {
    at: failedAt,
    metadata: {
      failureCode: code,
      error: message,
      detail: message,
    },
  });
  let command = ota.commandId ? await findDeviceCommand(device.id, ota.commandId) : null;
  command = command ? structuredClone(command) : null;
  if (command && !["applied", "failed", "expired"].includes(command.state)) {
    transitionDeviceCommand(command, "failed", {
      at: failedAt,
      code,
      detail: message,
    });
  }
  let persisted;
  try {
    persisted = await saveDeviceOtaLifecycleRecord(device, transition.ota, {
      expectedOtaId: ota.id,
      expectedAuthority,
      allowedCurrentStatuses: ["pending", "delivered"],
      requireCanonicalOwnershipBinding: failure.requireCanonicalOwnershipBinding !== false,
      command,
    });
  } catch (error) {
    if (isPrivateOtaPersistenceRace(error)) {
      throw httpError(404, "Firmware OTA is invalid or expired", "OTA_DOWNLOAD_AUTHORITY_CHANGED");
    }
    throw error;
  }
  if (persisted?.device) Object.assign(device, persisted.device);
  const canonicalCommand = persisted?.command || command;
  if (canonicalCommand) {
    device.lastCommand = publicDeviceCommand(canonicalCommand);
    await syncDeviceLastCommand(canonicalCommand);
  }
  await appendDeviceEvent(device.id, "ota.download_failed", {
    protocolVersion: Number(ota.protocolVersion || 1),
    otaId: ota.id,
    commandId: ota.commandId,
    correlationId: ota.correlationId || "",
    otaStatus: "failed",
    code,
  });
  throw httpError(Number(failure.statusCode) || 404, message, code);
}

const PRIVATE_OTA_DOWNLOAD_COMMAND_STATES = new Set([
  "accepted",
  "queued",
  "delivered",
  "acknowledged",
  "applying",
]);

async function refreshPrivateFirmwareDownloadCommandAuthority(deviceId, otaId, options = {}) {
  if (!repositories?.devices?.refreshOtaDownloadAuthority) {
    throw httpError(
      503,
      "Durable OTA command authorization is unavailable",
      "DEVICE_OTA_REPOSITORY_UNAVAILABLE",
    );
  }
  let refreshed;
  try {
    refreshed = await repositories.devices.refreshOtaDownloadAuthority(
      deviceId,
      otaId,
      options.checkedAt || nowIso(),
      options,
    );
  } catch (error) {
    if (error?.code === "DEVICE_OTA_AUTHORIZATION_EXPIRED") throw error;
    if (
      [
        "DEVICE_NOT_FOUND",
        "DEVICE_REVOKED",
        "DEVICE_OTA_LIFECYCLE_CHANGED",
        "DEVICE_OTA_COMMAND_MISSING",
        "DEVICE_OTA_STATE_CHANGED",
        "DEVICE_OTA_AUTHORITY_CHANGED",
      ].includes(error?.code)
    ) {
      throw httpError(404, "Firmware OTA is invalid or expired", "OTA_DOWNLOAD_AUTHORITY_CHANGED");
    }
    throw error;
  }
  if (refreshed?.expired || refreshed?.command?.state === "expired") {
    throw httpError(
      410,
      "Firmware OTA command delivery authorization expired",
      "OTA_DOWNLOAD_COMMAND_EXPIRED",
    );
  }
  if (!PRIVATE_OTA_DOWNLOAD_COMMAND_STATES.has(refreshed?.command?.state)) {
    throw httpError(404, "Firmware OTA is invalid or expired", "OTA_DOWNLOAD_AUTHORITY_CHANGED");
  }
  return refreshed;
}

async function serveDeviceOtaFirmwareDownload(req, res, url, segments) {
  const deviceId = decodeURIComponent(segments[2] || "");
  const otaId = decodeURIComponent(segments[4] || "");
  const authorization = readString(req.headers.authorization, 400);
  const bearerMatch = authorization.match(/^Bearer ([A-Za-z0-9_-]{32,180})$/);
  const token = bearerMatch ? bearerMatch[1] : "";
  if (!repositories?.devices?.withAuthenticationFence) {
    throw httpError(
      503,
      "Durable OTA download authorization is unavailable",
      "DEVICE_OTA_REPOSITORY_UNAVAILABLE",
    );
  }
  const device = await repositories.devices.withAuthenticationFence(
    deviceId,
    async (canonicalDevice) => canonicalDevice,
  );
  let ota = sanitizeDeviceOtaLifecycle(device?.ota);
  const otaTokenHash = ota.tokenHash || "";
  const downloadStatus = normalizeDeviceOtaStatus(ota.status);
  const downloadAllowed = new Set(["pending", "delivered", "downloading"]);

  if (
    !device ||
    device.revokedAt ||
    inferDeviceOwnershipState(device) === "revoked" ||
    !ota.id ||
    ota.id !== otaId ||
    !downloadAllowed.has(downloadStatus) ||
    !verifyOtaDownloadToken(token, otaTokenHash)
  ) {
    throw httpError(404, "Firmware OTA không hợp lệ hoặc đã hết hạn");
  }
  let downloadAuthority = privateDeviceOtaAuthoritySnapshot(device, ota);
  const expiresAt = Date.parse(ota.expiresAt || "");
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    await expirePrivateFirmwareDownload(device, ota, downloadAuthority);
  }
  if (
    !isCanonicalPrivateDeviceOtaGrant(ota) ||
    !isPrivateOtaBoundToCurrentOwnership(device, ota)
  ) {
    await failPrivateFirmwareDownload(device, ota, {
      statusCode: 404,
      code: "OTA_DOWNLOAD_AUTHORITY_INVALID",
      message: "Private OTA ownership or storage authority is invalid",
      expectedAuthority: downloadAuthority,
      requireCanonicalOwnershipBinding: false,
    });
  }
  const refreshedDownload = await refreshPrivateFirmwareDownloadCommandAuthority(
    device.id,
    ota.id,
  );
  Object.assign(device, refreshedDownload.device);
  ota = sanitizeDeviceOtaLifecycle(device.ota);
  if (
    !["pending", "delivered", "downloading"].includes(normalizeDeviceOtaStatus(ota.status)) ||
    !verifyOtaDownloadToken(token, ota.tokenHash || "") ||
    !isCanonicalPrivateDeviceOtaGrant(ota) ||
    !isPrivateOtaBoundToCurrentOwnership(device, ota)
  ) {
    throw httpError(404, "Firmware OTA is invalid or expired", "OTA_DOWNLOAD_AUTHORITY_CHANGED");
  }
  downloadAuthority = privateDeviceOtaAuthoritySnapshot(device, ota);
  const firmwareFileId = readString(ota.firmwareFileId, 120);
  let resolvedFirmware;
  try {
    resolvedFirmware = resolvePrivateFirmwareStorageBinding(firmwareFileId);
  } catch (error) {
    await failPrivateFirmwareDownload(device, ota, {
      statusCode: Number(error?.statusCode) || 404,
      code: readString(error?.code, 80) || "OTA_FIRMWARE_RECORD_UNAVAILABLE",
      message: readString(error?.message, 240) || "Firmware storage binding is unavailable",
    });
  }
  const { record, storageFile, binding } = resolvedFirmware;
  if (
    ota.firmwareFileId !== binding.firmwareFileId ||
    ota.firmwareStorageBucket !== binding.firmwareStorageBucket ||
    ota.firmwareObjectKey !== binding.firmwareObjectKey ||
    Number(ota.firmwareByteSize) !== binding.firmwareByteSize
  ) {
    await failPrivateFirmwareDownload(device, ota, {
      statusCode: 409,
      code: "OTA_FIRMWARE_BINDING_CHANGED",
      message: "Firmware storage binding changed after OTA authorization",
    });
  }

  const maxFirmwareBytes = getMaxOtaFirmwareBytes();
  let firmwareBuffer;
  try {
    firmwareBuffer = await storageAdapter.getBuffer(binding.firmwareObjectKey, maxFirmwareBytes);
  } catch (error) {
    await failPrivateFirmwareDownload(device, ota, {
      statusCode: error?.code === "STORAGE_OBJECT_TOO_LARGE" ? 413 : 404,
      code: error?.code === "STORAGE_OBJECT_TOO_LARGE"
        ? "OTA_FIRMWARE_SIZE_INVALID"
        : "OTA_FIRMWARE_OBJECT_UNAVAILABLE",
      message: error?.code === "STORAGE_OBJECT_TOO_LARGE"
        ? "Firmware exceeds the configured OTA size limit"
        : "Firmware object is unavailable",
    });
  }
  if (!firmwareBuffer?.length) {
    await failPrivateFirmwareDownload(device, ota, {
      statusCode: 404,
      code: "OTA_FIRMWARE_OBJECT_UNAVAILABLE",
      message: "Firmware object is empty or unavailable",
    });
  }
  if (firmwareBuffer.length !== binding.firmwareByteSize) {
    await failPrivateFirmwareDownload(device, ota, {
      statusCode: 409,
      code: "OTA_FIRMWARE_SIZE_MISMATCH",
      message: "Firmware object size no longer matches the authorized artifact",
    });
  }
  const actualChecksum = crypto.createHash("sha256").update(firmwareBuffer).digest("hex");
  if (actualChecksum !== ota.checksum) {
    await failPrivateFirmwareDownload(device, ota, {
      statusCode: 409,
      code: "OTA_FIRMWARE_CHECKSUM_MISMATCH",
      message: "Firmware object checksum no longer matches the signed manifest",
    });
  }

  const downloadCheckedAt = nowIso();
  let canonicalDownload;
  try {
    canonicalDownload = await refreshPrivateFirmwareDownloadCommandAuthority(
      device.id,
      ota.id,
      {
        checkedAt: downloadCheckedAt,
        expectedAuthority: downloadAuthority,
        allowedCurrentStatuses: ["pending", "delivered", "downloading"],
        requireCanonicalOwnershipBinding: true,
        requireFutureExpiryAt: downloadCheckedAt,
        transitionToDownloading: true,
      },
    );
  } catch (error) {
    if (error?.code === "DEVICE_OTA_AUTHORIZATION_EXPIRED") {
      await expirePrivateFirmwareDownload(device, ota, downloadAuthority);
    }
    throw error;
  }
  const canonicalDevice = canonicalDownload.device;
  const canonicalOta = sanitizeDeviceOtaLifecycle(canonicalDevice?.ota);
  const canonicalAuthority = privateDeviceOtaAuthoritySnapshot(canonicalDevice, canonicalOta);
  if (
    !canonicalDevice ||
    canonicalDevice.revokedAt ||
    inferDeviceOwnershipState(canonicalDevice) === "revoked" ||
    canonicalOta.id !== ota.id ||
    !["pending", "delivered", "downloading"].includes(normalizeDeviceOtaStatus(canonicalOta.status)) ||
    !verifyOtaDownloadToken(token, canonicalOta.tokenHash || "") ||
    canonicalOta.firmwareFileId !== binding.firmwareFileId ||
    canonicalOta.firmwareStorageBucket !== binding.firmwareStorageBucket ||
    canonicalOta.firmwareObjectKey !== binding.firmwareObjectKey ||
    Number(canonicalOta.firmwareByteSize) !== binding.firmwareByteSize ||
    JSON.stringify(canonicalAuthority) !== JSON.stringify(downloadAuthority) ||
    !isPrivateOtaBoundToCurrentOwnership(canonicalDevice, canonicalOta)
  ) {
    throw httpError(404, "Firmware OTA is invalid or expired", "OTA_DOWNLOAD_AUTHORITY_CHANGED");
  }
  Object.assign(device, canonicalDevice);
  ota = canonicalOta;
  const canonicalExpiresAt = Date.parse(ota.expiresAt || "");
  if (!Number.isFinite(canonicalExpiresAt) || canonicalExpiresAt <= Date.now()) {
    await expirePrivateFirmwareDownload(device, ota, canonicalAuthority);
  }
  if (!isCanonicalPrivateDeviceOtaGrant(ota)) {
    throw httpError(404, "Firmware OTA is invalid or expired", "OTA_DOWNLOAD_AUTHORITY_CHANGED");
  }
  if (normalizeDeviceOtaStatus(ota.status) !== "downloading") {
    throw httpError(404, "Firmware OTA is no longer downloadable", "OTA_DOWNLOAD_AUTHORITY_CHANGED");
  }

  await appendDeviceEvent(device.id, "ota.download", {
    protocolVersion: Number(ota.protocolVersion || 1),
    otaId,
    firmwareFileId: record.id,
    firmwareVersion: ota.firmwareVersion || record.firmwareVersion || "",
    byteSize: firmwareBuffer.length,
  });
  setCommonHeaders(res, req);
  res.writeHead(200, {
    "Content-Type": storageFile.contentType || "application/octet-stream",
    "Content-Length": firmwareBuffer.length,
    "Content-Disposition": `attachment; filename="${path.basename(record.name || "firmware.bin")}"`,
    "Cache-Control": "no-store",
    "X-Smart-Health-Firmware-Version": ota.firmwareVersion || record.firmwareVersion || "",
    "X-Smart-Health-SHA256": ota.checksum,
  });
  res.end(firmwareBuffer);
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
      files: bucketFiles.length,
      createdAt: bucket.createdAt ? formatDateTime(bucket.createdAt) : "",
      allowedExtensions: bucket.allowedExtensions || [],
      allowedMimeTypes: bucket.allowedMimeTypes || [],
      maxFileSizeMb: Number(bucket.maxFileSizeMb || 500),
      system: Boolean(bucket.system),
    };
  });
}

async function handleAuthApi(req, res, segments) {
  const method = req.method || "GET";

  if (segments.length === 4 && segments[2] === "2fa" && segments[3] === "challenge" && method === "POST") {
    const availability = getTwoFactorAvailability();
    if (!availability.available) {
      throw httpError(503, "2FA chưa sẵn sàng.", "TWO_FACTOR_UNAVAILABLE", { availability });
    }
    if (!repositories?.twoFactor) {
      throw httpError(503, "Kho lưu trữ 2FA chưa sẵn sàng.", "TWO_FACTOR_STORAGE_UNAVAILABLE");
    }
    const payload = await readJsonBody(req);
    const challengeId = readString(payload.challengeId, 200);
    if (!challengeId) {
      throw httpError(400, "Thiếu challengeId.", "TWO_FACTOR_CHALLENGE_ID_REQUIRED");
    }
    const challenge = await repositories.twoFactor.getChallenge(challengeId);
    if (!challenge) {
      throw httpError(404, "Không tìm thấy challenge.", "TWO_FACTOR_CHALLENGE_NOT_FOUND");
    }
    if (challenge.primaryAuthSource !== "demo-password") {
      const primaryUser = requirePrimaryUser(req);
      if (primaryUser.id !== challenge.userId) {
        throw httpError(403, "Challenge không thuộc tài khoản hiện tại.", "TWO_FACTOR_CHALLENGE_SCOPE_MISMATCH");
      }
    }
    const user = db.users.find((item) => item.id === challenge.userId);
    if (!user || !isActiveUserAccount(user)) {
      throw httpError(401, "Tài khoản không còn khả dụng.", "TWO_FACTOR_PRIMARY_AUTH_INVALID");
    }
    const credential = await repositories.twoFactor.getCredential(user.id);
    if (!credential) {
      throw httpError(409, "2FA chưa được bật.", "TWO_FACTOR_NOT_ENABLED");
    }
    const pendingSession = challenge.primaryAuthSource === "demo-password" ? buildSession(user, req) : null;
    const primaryBinding = pendingSession
      ? `demo-session:${user.id}:${pendingSession.id}`
      : getTwoFactorPrimaryBinding(req, user);
    const issuedToken = createTwoFactorToken({
      id: createId("2fa_token"),
      userId: user.id,
      primaryBinding,
    });
    const otp = readString(payload.otp || payload.code, 20);
    const recoveryCode = readString(payload.recoveryCode, 80);
    await repositories.twoFactor.completeChallenge({
      challengeId,
      userId: user.id,
      tokenRecord: issuedToken.record,
      verifyFactor: async (currentCredential) => {
        if (recoveryCode) {
          const match = verifyRecoveryCode(currentCredential, recoveryCode);
          return match
            ? { valid: true, recoveryCodeId: match.id, usedAt: nowIso() }
            : { valid: false, code: "TWO_FACTOR_RECOVERY_CODE_INVALID" };
        }
        if (!otp) return { valid: false, code: "TWO_FACTOR_CODE_REQUIRED" };
        const result = await verifyTotpCode(currentCredential, otp, {
          afterTimeStep: Number(currentCredential.lastUsedTimeStep),
        });
        if (result.replayed) return { valid: false, code: "TWO_FACTOR_CODE_REPLAYED" };
        return result.valid
          ? { valid: true, timeStep: Number(result.timeStep) }
          : { valid: false, code: "TWO_FACTOR_CODE_INVALID" };
      },
      auditInput: {
        organizationId: user.organizationId || "",
        ip: (getRequestContext(req) || createRequestContext(req)).ip || "",
        userAgent: (getRequestContext(req) || createRequestContext(req)).userAgent || "",
        metadata: { method: recoveryCode ? "recovery_code" : "app", primaryAuthSource: challenge.primaryAuthSource },
      },
    });
    if (pendingSession) persistSession(pendingSession);
    addAccessLog("Đăng nhập thành công sau xác thực hai yếu tố", {
      userId: user.id,
      organizationId: user.organizationId || "",
      ip: req.socket.remoteAddress || "",
    });
    await saveDb();
    sendJson(res, 200, {
      ...(pendingSession ? { token: pendingSession.token } : {}),
      twoFactorToken: issuedToken.token,
      expiresAt: issuedToken.record.expiresAt,
      user: publicUser(user),
    });
    return;
  }

  if (segments.length === 3 && segments[2] === "firebase" && (method === "GET" || method === "POST")) {
    const user = requireSessionUser(req);
    sendJson(res, 200, {
      provider: req.authSource,
      user: publicUser(user),
      session: req.authSession || null,
    });
    return;
  }

  if (segments.length === 3 && segments[2] === "email-verification" && method === "POST") {
    const user = requireSessionUser(req);
    if (!FIREBASE_AUTH_ENABLED) {
      throw httpError(503, "Firebase Auth chưa được cấu hình trên backend.", "FIREBASE_AUTH_NOT_CONFIGURED");
    }
    if (!user.firebaseUid) {
      throw httpError(400, "Tài khoản chưa liên kết Firebase Auth nên không thể gửi email xác minh.", "FIREBASE_UID_MISSING");
    }

    const firebaseAdminApp = getFirebaseAdmin(process.env);
    if (!firebaseAdminApp) {
      throw httpError(503, "Firebase Admin chưa sẵn sàng để tạo link xác minh email.", "FIREBASE_ADMIN_NOT_READY");
    }

    let firebaseUser;
    try {
      firebaseUser = await firebaseAdminApp.auth().getUser(user.firebaseUid);
    } catch (error) {
      const code = String(error && error.code ? error.code : "");
      if (code === "auth/user-not-found") {
        throw httpError(404, "Không tìm thấy tài khoản Firebase để gửi email xác minh.", "FIREBASE_USER_NOT_FOUND");
      }
      throw error;
    }

    const email = readString(firebaseUser.email || user.email, 180).toLowerCase();
    if (!isValidEmailAddress(email)) {
      throw httpError(400, "Tài khoản Firebase chưa có email hợp lệ để xác minh.", "FIREBASE_EMAIL_INVALID");
    }

    if (firebaseUser.emailVerified) {
      user.verifiedEmail = true;
      await persistUserRecord(user);
      sendJson(res, 200, { status: "verified", email, user: publicUser(user) });
      return;
    }

    const actionCodeSettings = {
      url: getEmailVerificationContinueUrl(req),
    };
    const linkDomain = getFirebaseEmailLinkDomain();
    if (linkDomain) {
      actionCodeSettings.linkDomain = linkDomain;
    }

    let verificationLink;
    try {
      verificationLink = await firebaseAdminApp.auth().generateEmailVerificationLink(email, actionCodeSettings);
    } catch (error) {
      throw httpError(400, describeFirebaseEmailLinkFailure(error), "FIREBASE_EMAIL_LINK_FAILED", {
        providerCode: String(error && error.code ? error.code : ""),
        continueUrl: actionCodeSettings.url,
      });
    }

    const emailMessage = buildEmailVerificationMessage({
      name: user.name || firebaseUser.displayName || email,
      email,
      verificationLink,
    });
    const delivery = await sendEmail({
      to: { email, name: user.name || firebaseUser.displayName || "" },
      subject: "Xác minh email Smart Health Care",
      text: emailMessage.text,
      html: emailMessage.html,
    });

    const sentAt = nowIso();
    user.lastEmailVerificationSentAt = sentAt;
    user.emailVerificationProvider = delivery.provider || "";
    user.emailVerificationMessageId = delivery.messageId || "";
    await persistUserRecord(user);
    await appendAudit("auth.email_verification.send", req, {
      actorUserId: user.id,
      organizationId: user.organizationId || "",
      resourceType: "user",
      resourceId: user.id,
      metadata: {
        provider: delivery.provider || "",
        email,
        continueUrl: actionCodeSettings.url,
      },
    });

    sendJson(res, 200, {
      status: "sent",
      email,
      provider: delivery.provider || "",
      sentAt,
    });
    return;
  }

  if (segments.length === 3 && segments[2] === "role-request-document" && method === "POST") {
    const user = requireSessionUser(req);
    const requestedName = readString(req.headers["x-file-name"], 240);
    if (!requestedName) {
      throw httpError(
        400,
        "X-File-Name is required for role request document upload",
        "ROLE_REQUEST_DOCUMENT_NAME_REQUIRED",
      );
    }
    const originalName = path.basename(requestedName);
    const contentType = readString(req.headers["content-type"], 160) || "application/octet-stream";
    if (!new Set(["application/pdf", "image/jpeg", "image/png"]).has(contentType)) {
      throw httpError(
        400,
        "Tài liệu xác minh chỉ hỗ trợ PDF, JPG hoặc PNG",
        "ROLE_REQUEST_DOCUMENT_TYPE_UNSUPPORTED",
      );
    }
    const idempotencyKey = getRequiredIdempotencyKey(
      req,
      {},
      "role request document upload",
    );
    const buffer = await readRequestBuffer(
      req,
      MAX_ROLE_REQUEST_DOCUMENT_BYTES,
    );
    if (!buffer.length) {
      throw httpError(
        400,
        "Tài liệu xác minh phải có dung lượng từ 1 byte đến 10 MB",
        "ROLE_REQUEST_DOCUMENT_SIZE_INVALID",
      );
    }
    const organizationId = user.organizationId || "org_default_clinic";
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex");
    const fingerprint = createIdempotencyFingerprint({
      userId: user.id,
      organizationId,
      name: originalName,
      contentType,
      byteSize: buffer.length,
      sha256,
    });
    const operation = "auth.role_request.document.upload";
    const idempotency = {
      scope: user.id,
      operation,
      key: idempotencyKey,
      fingerprint,
    };
    if (!repositories?.roleRequestDocuments) {
      throw httpError(
        503,
        "Role request document repository is unavailable",
        "ROLE_REQUEST_DOCUMENT_REPOSITORY_UNAVAILABLE",
      );
    }
    const replay = await repositories.roleRequestDocuments.findReplay({
      userId: user.id,
      organizationId,
      idempotency,
    });
    if (replay) {
      res.setHeader("Idempotency-Replayed", "true");
      sendJson(res, 201, replay);
      return;
    }
    const stableIdentity = crypto
      .createHash("sha256")
      .update(`${user.id}\n${operation}\n${idempotencyKey}`)
      .digest("hex")
      .slice(0, 24);
    const documentId = `doctor_doc_${stableIdentity}`;
    const operationId = `role_request_document_${stableIdentity}`;
    const uploadAttemptId = crypto.randomBytes(12).toString("hex");
    const objectKey = `org/${organizationId}/doctor-documents/${user.id}/${documentId}-${sha256}-${fingerprint}-${uploadAttemptId}-${originalName}`;
    const requestContext = getRequestContext(req) || createRequestContext(req);
    const result = await persistRoleRequestDocumentUpload({
      storageAdapter,
      repository: repositories.roleRequestDocuments,
      objectKey,
      objectOwnership: {
        userId: user.id,
        organizationId,
        documentId,
      },
      buffer,
      contentType,
      createSaveInput: (upload) => ({
        userId: user.id,
        organizationId,
        operationId,
        document: {
          id: documentId,
          userId: user.id,
          organizationId,
          name: originalName,
          contentType,
          byteSize: upload.byteSize || buffer.length,
          sha256,
          objectKey,
          storageProvider: upload.provider,
          uploadedAt: nowIso(),
        },
        idempotency,
        audit: {
          action: "doctor.role_request.document.upload",
          actorUserId: user.id,
          organizationId,
          ip: requestContext.ip || req.socket.remoteAddress || "",
          userAgent:
            requestContext.userAgent ||
            readString(req.headers["user-agent"], 240),
        },
      }),
      onCleanupError: (cleanupError, failedObjectKey) => {
        console.warn(
          `[role-request-document] failed to clean uncommitted object ${failedObjectKey}: ${cleanupError.message}`,
        );
      },
    });
    if (result.replayed) {
      res.setHeader("Idempotency-Replayed", "true");
    }
    sendJson(res, 201, {
      document: result.document,
      operationId: result.operationId,
      replayed: result.replayed,
    });
    return;
  }

  if (segments.length === 3 && segments[2] === "workspace-request" && method === "POST") {
    const sessionUser = requireSessionUser(req);
    if (sessionUser.role !== "patient") {
      throw httpError(
        409,
        "Tài khoản đang có quyền vận hành không thể tự đổi vai trò qua luồng đăng ký workspace",
        "ROLE_TRANSITION_REQUIRES_ADMIN",
      );
    }
    const payload = await readJsonBody(req);
    const name = readString(payload.name || payload.clinicName, 180);
    if (!name) throw httpError(400, "Tên cơ sở y tế là bắt buộc");
    const idempotencyKey = getRequiredIdempotencyKey(req, payload, "workspace request");
    if (!repositories?.organizations?.submitRequest) {
      throw httpError(
        503,
        "Kho dữ liệu yêu cầu workspace chưa sẵn sàng",
        "WORKSPACE_REQUEST_REPOSITORY_UNAVAILABLE",
      );
    }
    const existingRequest = db.organizations.find(
      (item) =>
        !item.deletedAt &&
        item.ownerUserId === sessionUser.id &&
        ["pending", "needs_info", "rejected"].includes(String(item.status || "")),
    );
    const workspaceId = existingRequest?.id || createId("org");
    const workspaceType = normalizeWorkspaceType(
      payload.workspaceType || payload.clinicType,
      "clinic",
    );
    const requestPayload = {
      name,
      type: workspaceType,
      workspaceType,
      address: readString(payload.address, 500),
      phone: readString(payload.phone || payload.clinicPhone, 80),
      email: readString(payload.email || payload.clinicEmail, 180),
      website: readString(payload.website, 500),
      legalName: readString(payload.legalName || payload.taxCode || payload.licenseCode, 200),
      representative:
        readString(payload.representative || payload.repName, 180) || sessionUser.name || "",
      requestMetadata:
        payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {},
    };
    const requestContext = getRequestContext(req) || createRequestContext(req);
    const result = await repositories.organizations.submitRequest({
      organizationId: workspaceId,
      actorUserId: sessionUser.id,
      payload: requestPayload,
      idempotency: {
        scope: getIdempotencyScope(sessionUser),
        operation: "workspace.request.submit",
        key: idempotencyKey,
        fingerprint: createIdempotencyFingerprint({ workspaceId, payload: requestPayload }),
      },
      audit: {
        actorUserId: sessionUser.id,
        organizationId: workspaceId,
        ip: requestContext.ip || "",
        userAgent: requestContext.userAgent || readString(req.headers["user-agent"], 240),
      },
    });
    Object.assign(sessionUser, result.user || {});
    let notificationDelivery = "skipped";
    if (!result.replayed) {
      try {
        await createBackendNotification({
          type: "info",
          userId: sessionUser.id,
          organizationId: workspaceId,
          title: existingRequest ? "Hồ sơ workspace đã được gửi lại" : "Yêu cầu duyệt workspace mới",
          message: `${result.workspace.name} đang chờ Platform Admin xác minh và kích hoạt.`,
          metadata: {
            actionPath: "/clinics",
            workspaceId,
            ownerEmail: sessionUser.email || "",
            operationId: result.operationId,
          },
        });
        notificationDelivery = "ready";
      } catch {
        notificationDelivery = "failed";
      }
    }
    if (result.replayed) res.setHeader("Idempotency-Replayed", "true");
    sendJson(res, result.responseStatus || 201, {
      workspace: publicWorkspace(result.workspace),
      user: publicUser(sessionUser),
      operationId: result.operationId,
      idempotent: result.replayed === true,
      notificationDelivery,
    });
    return;
  }

  if (segments.length === 3 && segments[2] === "role-request" && method === "POST") {
    const user = requireSessionUser(req);
    const payload = await readJsonBody(req);
    for (const authorityField of [
      "userId",
      "actorUserId",
      "firebaseUid",
      "operationId",
      "replayed",
    ]) {
      if (Object.prototype.hasOwnProperty.call(payload, authorityField)) {
        throw httpError(
          400,
          "Role request authority is derived from the authenticated account",
          "ROLE_REQUEST_AUTHORITY_FIELDS_FORBIDDEN",
        );
      }
    }
    const idempotencyKey = readString(
      req.headers["idempotency-key"],
      160,
    );
    if (!idempotencyKey) {
      throw httpError(
        400,
        "Idempotency-Key is required for role request",
        "IDEMPOTENCY_KEY_REQUIRED",
      );
    }
    const unsupportedFields = Object.keys(payload).filter(
      (field) => !ROLE_REQUEST_INPUT_FIELDS.has(field),
    );
    if (unsupportedFields.length) {
      throw httpError(
        400,
        "Role request contains fields outside the versioned request contract",
        "ROLE_REQUEST_FIELDS_UNSUPPORTED",
        { fields: unsupportedFields.sort() },
      );
    }
    const expectedUserId = readString(payload.expectedUserId, 120);
    const expectedWorkspaceId = readString(payload.expectedWorkspaceId, 120);
    for (const [field, value] of [
      ["expectedUserId", expectedUserId],
      ["expectedWorkspaceId", expectedWorkspaceId],
    ]) {
      if (Object.prototype.hasOwnProperty.call(payload, field) && !value) {
        throw httpError(
          400,
          `${field} must be a non-empty mutation precondition when supplied`,
          "ROLE_REQUEST_PRECONDITION_INVALID",
          { field },
        );
      }
    }
    if (expectedUserId && expectedUserId !== user.id) {
      throw httpError(
        409,
        "The authenticated account no longer matches the role-request screen owner",
        "ROLE_REQUEST_EXPECTED_USER_MISMATCH",
      );
    }
    const currentWorkspaceId = readString(
      getUserWorkspaceContext(user).currentWorkspaceId,
      120,
    );
    if (expectedWorkspaceId && expectedWorkspaceId !== currentWorkspaceId) {
      throw httpError(
        409,
        "The authenticated workspace no longer matches the role-request screen owner",
        "ROLE_REQUEST_EXPECTED_WORKSPACE_MISMATCH",
      );
    }
    const canonicalRequestedRole = readString(payload.requestedRole, 40);
    const compatibilityRequestedRole = readString(payload.role, 40);
    if (
      canonicalRequestedRole &&
      compatibilityRequestedRole &&
      canonicalRequestedRole !== compatibilityRequestedRole
    ) {
      throw httpError(
        400,
        "requestedRole and its compatibility alias role must match",
        "ROLE_REQUEST_ROLE_MISMATCH",
      );
    }
    const requestedRole = readString(payload.requestedRole || payload.role, 40);
    if (!["doctor", "patient"].includes(requestedRole)) {
      throw httpError(400, "Requested role is not supported");
    }
    const previousRoleRequestStatus = user.roleRequestStatus || "";

    const currentWorkspace = getClinicById(user.organizationId);
    const currentWorkspaceType = normalizeWorkspaceType(
      user.workspaceType || currentWorkspace?.workspaceType || currentWorkspace?.type,
      "clinic"
    );
    const requestedWorkspaceType = normalizeWorkspaceType(
      payload.workspaceType || payload.accountType,
      payload.accountType === "solo_doctor" ? "solo_practice" : currentWorkspaceType
    );
    const explicitCanonicalWorkspaceIds = ["organizationId", "clinicId"]
      .filter((key) => Object.prototype.hasOwnProperty.call(payload, key))
      .map((key) => readString(payload[key], 120));
    if (
      explicitCanonicalWorkspaceIds.length > 1 &&
      new Set(explicitCanonicalWorkspaceIds).size > 1
    ) {
      throw httpError(
        400,
        "Role request workspace aliases must identify the same workspace",
        "ROLE_REQUEST_WORKSPACE_MISMATCH",
      );
    }
    let selectedClinic = requestedWorkspaceType === "solo_practice" ? null : getClinicFromPayload(payload);
    if (requestedRole === "patient" && requestedWorkspaceType === "personal") {
      selectedClinic = getPersonalWorkspaceCandidate(user);
    }
    if (requestedRole === "doctor" && requestedWorkspaceType === "solo_practice") {
      selectedClinic = getSoloPracticeWorkspaceCandidate(user, payload);
    }
    const requestedClinicId = getRequestedWorkspaceId(payload);
    if (
      hasExplicitWorkspaceSelection(payload) &&
      (!selectedClinic ||
        (["personal", "solo_practice"].includes(requestedWorkspaceType) &&
          requestedClinicId !== selectedClinic.id))
    ) {
      throw httpError(
        400,
        selectedClinic
          ? "Requested workspace is not available for this role request"
          : "Clinic is not available",
        selectedClinic
          ? "ROLE_REQUEST_WORKSPACE_MISMATCH"
          : "ROLE_REQUEST_WORKSPACE_NOT_FOUND",
      );
    }
    if (
      requestedRole === "patient" &&
      requestedWorkspaceType !== "personal" &&
      selectedClinic &&
      !hasWorkspaceMembership(user, selectedClinic.id)
    ) {
      throw httpError(
        403,
        "Patient role requests cannot create access to another workspace",
        "ROLE_REQUEST_PATIENT_WORKSPACE_DENIED",
      );
    }

    const accountType =
      payload.accountType ||
      (requestedRole === "doctor"
        ? requestedWorkspaceType === "solo_practice"
          ? "solo_doctor"
          : "doctor"
        : requestedWorkspaceType === "personal"
          ? "personal"
          : user.accountType || "personal");
    const roleRequestStatus =
      requestedRole === "doctor"
        ? isApprovedDoctorRole(user) || user.role === "admin"
          ? "approved"
          : "pending"
        : "approved";
    const roleRequestTargetOrganizationId = readString(
      selectedClinic?.id || user.organizationId,
      120,
    );
    const hasApprovedTargetAuthority = getUserMemberships(user).some(
      (membership) =>
        membership.organizationId === roleRequestTargetOrganizationId &&
        membership.operational === true &&
        (membership.role === "doctor" ||
          (user.role === "admin" && membership.role === "platform_admin")),
    );
    if (
      requestedRole === "doctor" &&
      roleRequestStatus === "approved" &&
      !hasApprovedTargetAuthority
    ) {
      throw httpError(
        409,
        "An approved account cannot use role request to grant a new workspace membership",
        "ROLE_REQUEST_APPROVED_TARGET_DENIED",
      );
    }
    const nextRole =
      requestedRole === "doctor" &&
      user.role !== "admin" &&
      roleRequestStatus !== "approved"
        ? "patient"
        : requestedRole === "patient"
          ? "patient"
          : user.role;
    const roleRequestPatch = {
      requestedRole,
      role: nextRole,
      roleRequestStatus,
      accountStatus: user.accountStatus || "active",
      roleRequestedAt: nowIso(),
      roleApprovedAt:
        roleRequestStatus === "approved" ? user.roleApprovedAt || "" : "",
      roleRejectedAt: "",
      roleRejectReason: "",
      roleInfoRequestAt: "",
      roleInfoRequestMessage: "",
      roleInfoRequiredFields: [],
      name: readString(payload.name || payload.fullName, 160) || user.name,
      phone: readString(payload.phone, 40) || user.phone,
      license: readString(payload.license, 120) || user.license,
      workspaceType: requestedWorkspaceType,
      accountType,
      // A pending request must not move the account's operational workspace.
      // The user/patient inverse identity remains in the personal workspace
      // until an administrator grants membership to the requested target.
      organizationId:
        requestedRole === "doctor" && roleRequestStatus !== "approved"
          ? user.organizationId || "org_default_clinic"
          : roleRequestTargetOrganizationId,
      roleRequestOrganizationId: roleRequestTargetOrganizationId,
      hospital:
        selectedClinic?.name ||
        readString(payload.hospital || payload.clinicName, 160) ||
        user.hospital,
      clinicSuggestion: selectedClinic
        ? ""
        : readString(payload.hospital || payload.clinicName, 160),
      department:
        readString(payload.department || payload.specialty, 160) ||
        user.department,
      registrationReason:
        readString(payload.reason || payload.registrationReason, 1000) ||
        user.registrationReason ||
        "",
    };
    if (!repositories?.users?.submitRoleRequestWithAudit) {
      throw httpError(
        503,
        "Role request repository is unavailable",
        "ROLE_REQUEST_REPOSITORY_UNAVAILABLE",
      );
    }
    const requestContext = getRequestContext(req) || createRequestContext(req);
    const fingerprintInput = {
      expectedUserId,
      expectedWorkspaceId,
      requestedRole,
      accountType,
      workspaceType: requestedWorkspaceType,
      organizationId: roleRequestTargetOrganizationId,
      explicitWorkspaceSelection: hasExplicitWorkspaceSelection(payload),
      clinicName: readString(
        payload.clinicName || payload.hospital || payload.clinic,
        160,
      ),
      name: readString(payload.name || payload.fullName, 160),
      phone: readString(payload.phone, 40),
      license: readString(payload.license, 120),
      department: readString(
        payload.department || payload.specialty,
        160,
      ),
      registrationReason: readString(
        payload.reason || payload.registrationReason,
        1000,
      ),
      workspaceName: readString(payload.workspaceName, 160),
      workspaceAddress: readString(payload.address, 240),
      workspaceEmail: readString(payload.email, 160).toLowerCase(),
    };
    const result = await repositories.users.submitRoleRequestWithAudit(
      user.id,
      roleRequestPatch,
      {
        action: "auth.role.request",
        actorUserId: user.id,
        organizationId: roleRequestTargetOrganizationId,
        ip: requestContext.ip || req.socket.remoteAddress || "",
        userAgent:
          requestContext.userAgent ||
          readString(req.headers["user-agent"], 240),
        authorization: {
          kind: "self",
          actorUserId: user.id,
          organizationId: roleRequestTargetOrganizationId,
        },
        metadata: {
          previousRoleRequestStatus,
          requestedRole,
          workspaceType: requestedWorkspaceType,
          accountType,
        },
      },
      {
        scope: user.id,
        operation: "auth.role.request",
        key: idempotencyKey,
        fingerprint: createIdempotencyFingerprint(fingerprintInput),
      },
      selectedClinic,
    );
    if (!result?.user) {
      throw httpError(
        404,
        "Authenticated account no longer exists",
        "ACCOUNT_NOT_FOUND",
      );
    }
    if (
      result.roleRequest.requestedRole !== result.user.requestedRole ||
      result.roleRequest.status !== result.user.roleRequestStatus ||
      result.roleRequest.requestedAt !== result.user.roleRequestedAt
    ) {
      throw httpError(
        500,
        "Role request repository returned an inconsistent receipt",
        "ROLE_REQUEST_RECEIPT_INVALID",
      );
    }
    if (selectedClinic) {
      const existingTargetWorkspace = getClinicById(selectedClinic.id);
      if (!result.replayed || !existingTargetWorkspace) {
        let materializedWorkspace = null;
        if (requestedWorkspaceType === "personal") {
          materializedWorkspace = ensurePersonalWorkspaceForUser(user);
        } else if (requestedWorkspaceType === "solo_practice") {
          materializedWorkspace = ensureSoloPracticeWorkspaceForUser(user, payload);
        } else {
          materializedWorkspace = ensureOrganizationFromCatalog(selectedClinic);
        }
        if (
          materializedWorkspace &&
          typeof repositories.organizations?.upsert === "function"
        ) {
          await repositories.organizations.upsert(materializedWorkspace);
        }
      }
    }
    if (result.roleRequest.status === "approved") {
      const membershipUser =
        db.users.find((candidate) => candidate.id === result.user.id) ||
        result.user;
      ensureMembershipForUser(membershipUser);
      await repositories.memberships.ensureForUser(membershipUser);
    }

    if (
      result.roleRequest.requestedRole === "doctor" &&
      result.user.role !== "doctor" &&
      result.user.role !== "admin"
    ) {
      const wasNeedsInfo = previousRoleRequestStatus === "needs_info";
      const registrationReason = result.user.registrationReason || "";
      const doctorRequestTitle = wasNeedsInfo ? "Bác sĩ đã gửi lại hồ sơ" : "Yêu cầu duyệt bác sĩ";
      const doctorRequestMessage = [
        wasNeedsInfo
          ? `${result.user.name || result.user.email || result.user.id} đã bổ sung hồ sơ và đang chờ admin duyệt lại.`
          : `${result.user.name || result.user.email || result.user.id} đang chờ admin cấp quyền bác sĩ.`,
        registrationReason ? `Lý do đăng ký: ${registrationReason}` : "",
      ].filter(Boolean).join("\n");
      const roleRequestReviewer = db.users.find(
        (candidate) =>
          isActiveUserAccount(candidate) &&
          ["admin", "platform_admin"].includes(
            readString(candidate.role, 40).toLowerCase(),
          ),
      );
      const doctorRequestNotification = await createBackendNotification({
        id: `noti_${result.operationId}`,
        createOnce: true,
        type: "info",
        userId: roleRequestReviewer?.id || "",
        // Keep clinical application details out of the requested workspace's
        // shared notification audience. Platform admins can still resolve the
        // target through the metadata below.
        organizationId: "",
        title: doctorRequestTitle,
        message: doctorRequestMessage,
        metadata: {
          actionPath: "/doctor-approval",
          operationId: result.operationId,
          doctorName: result.user.name || "",
          doctorEmail: result.user.email || "",
          doctorPhone: result.user.phone || "",
          clinicName:
            result.user.hospital ||
            getClinicById(result.user.organizationId)?.name ||
            "",
          specialty:
            result.user.department || result.user.specialty || "",
          license: result.user.license || "",
          registrationReason,
          workspaceType:
            result.user.workspaceType ||
            getClinicById(result.user.organizationId)?.workspaceType ||
            "",
          accountType: result.user.accountType || "",
          roleRequestStatus: result.user.roleRequestStatus || "",
          previousRoleRequestStatus,
        },
      });
      if (!result.replayed) {
        queueDoctorRequestAdminEmail(doctorRequestNotification);
        addAccessLog("Doctor role approval requested", {
          id: `log_${result.operationId}`,
          operationId: result.operationId,
          userId: result.user.id,
          organizationId: result.user.organizationId || "",
          ip: req.socket.remoteAddress || "",
          previousRoleRequestStatus,
        });
      }
    }

    await saveDb();
    if (result.replayed) {
      res.setHeader("Idempotency-Replayed", "true");
    }
    sendJson(res, 200, {
      user: result.user,
      roleRequest: result.roleRequest,
      operationId: result.operationId,
      replayed: result.replayed === true,
    });
    return;
  }

  if (segments.length === 3 && segments[2] === "login" && method === "POST") {
    assertDemoAuthAllowed();
    const payload = await readJsonBody(req);
    const user = findUserByLogin(payload.email || payload.phone || payload.login);
    const password =
      typeof payload.password === "string" && payload.password.length <= 200
        ? payload.password
        : "";
    const demoPasswordAllowed =
      Boolean(user) &&
      !user.password &&
      (AUTH_MODE !== "production" || ALLOW_DEMO_AUTH) &&
      (password === "Shcare-Demo-2026!" || password === "12345678");
    if (!user || (!verifyPasswordSecret(password, user.password) && !demoPasswordAllowed)) {
      addAccessLog("Đăng nhập thất bại", { severity: "warning", ip: req.socket.remoteAddress || "" });
      saveDb();
      throw httpError(401, "Email/số điện thoại hoặc mật khẩu không đúng");
    }
    assertUserAccountActive(user);
    if (!isPasswordHash(user.password)) {
      if (repositories?.users?.updatePasswordExact) {
        await repositories.users.updatePasswordExact(user.id, password);
      } else {
        user.password = normalizePasswordHash(password);
        await saveDb();
      }
    }
    if (payload.role && user.role !== payload.role) {
      throw httpError(403, "Tài khoản không đúng vai trò đăng nhập");
    }
    const credential = repositories?.twoFactor
      ? await repositories.twoFactor.getCredential(user.id)
      : db.twoFactorCredentials.find((item) => item.userId === user.id && !item.disabledAt) || null;
    user.twoFactorEnabled = Boolean(credential);
    user.twoFactorMethod = credential ? credential.method || "app" : "";
    if (credential) {
      const loginBinding = `demo-password:${user.id}:${crypto.randomBytes(24).toString("base64url")}`;
      const challenge = await createTwoFactorChallenge(user, "demo-password", loginBinding);
      const requestId = (getRequestContext(req) || createRequestContext(req)).requestId || "";
      sendJson(res, 202, {
        error: {
          code: "TWO_FACTOR_CHALLENGE_REQUIRED",
          requestId,
          message: "Cần hoàn tất xác thực hai yếu tố.",
          details: {
            challengeId: challenge.id,
            method: "app",
            expiresAt: challenge.expiresAt,
          },
        },
      });
      return;
    }
    const session = createSession(user, req);
    addAccessLog("Đăng nhập thành công", { ip: req.socket.remoteAddress || "" });
    await saveDb();
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
    ensureMembershipForUser(user);
    if (repositories) {
      await repositories.users.save(user);
      await repositories.memberships.ensureForUser(user);
      if (user.patientId) {
        const selfPatient = findPatient(user.patientId);
        if (selfPatient) await repositories.patients.save(selfPatient);
      }
    }
    const session = createSession(user, req);
    createNotification(
      "success",
      "Tạo tài khoản thành công",
      "Tài khoản Smart Health đã được tạo.",
      {
        userId: user.id,
        organizationId: user.organizationId || "",
      },
    );
    addAccessLog("Tạo tài khoản mới", { ip: req.socket.remoteAddress || "" });
    await saveDb();
    sendJson(res, 201, { token: session.token, user: publicUser(user) });
    return;
  }

  if (segments.length === 3 && segments[2] === "logout" && method === "POST") {
    const user = requireSessionUser(req);
    const token = getBearerToken(req);
    const session = req.authSession || db.sessions.find((item) => item.token === token && item.userId === user.id);
    if (!session) throw httpError(404, "Session not found", "AUTH_SESSION_NOT_FOUND");
    const context = getRequestContext(req) || createRequestContext(req);
    if (repositories?.authSessions) {
      await repositories.authSessions.revokeForUser(user.id, session.id, {
        action: "auth.session.logout",
        organizationId: user.organizationId || "",
        ip: context.ip || "",
        userAgent: context.userAgent || "",
      });
    } else {
      session.revokedAt = session.revokedAt || nowIso();
      await appendAudit("auth.session.logout", req, {
        actorUserId: user.id,
        organizationId: user.organizationId || "",
        resourceType: "auth_session",
        resourceId: session.id,
      });
    }
    closeRealtimeSocketsForSession(user.id, session);
    addAccessLog("Đăng xuất");
    await saveDb();
    sendJson(res, 200, { ok: true });
    return;
  }

  if (segments.length === 3 && segments[2] === "sessions" && method === "GET") {
    const token = getBearerToken(req);
    const user = requireSessionUser(req);
    const sessions = repositories?.authSessions
      ? await repositories.authSessions.listForUser(user.id)
      : [
          ...db.authSessions.filter((item) => item.userId === user.id && !item.revokedAt),
          ...db.sessions.filter((item) => item.userId === user.id && !item.revokedAt),
        ];
    sendJson(res, 200, {
      sessions: sessions.map((item) =>
        publicAuthSession(
          item,
          Boolean((req.authSession && req.authSession.id === item.id) || (token && item.token === token)),
        ),
      ),
    });
    return;
  }

  if (segments.length === 5 && segments[2] === "sessions" && segments[4] === "revoke" && method === "POST") {
    const user = requireSessionUser(req);
    if (!req.authSession?.id) {
      throw httpError(
        401,
        "The current auth session binding is unavailable",
        "AUTH_SESSION_BINDING_MISSING",
      );
    }
    const sessionId = readAuthSessionIdSegment(segments[3]);
    const requestPath = parseRequestPath(req).pathname;
    const isCanonicalV1Request = requestPath.startsWith("/api/v1/");
    const isLegacyCompatibilityRequest = /^\/api\/auth\/sessions\/[^/]+\/revoke$/.test(requestPath);
    const suppliedIdempotencyKey = readAuthSessionRevokeIdempotencyKey(req, {
      required: isCanonicalV1Request,
    });
    const idempotencyKey = suppliedIdempotencyKey || createLegacyAuthSessionRevokeIdempotencyKey(
      user.id,
      sessionId,
    );
    if (isLegacyCompatibilityRequest) {
      requestMetrics.legacyAuthSessionRevoke += 1;
      res.setHeader("Deprecation", "true");
      res.setHeader("X-Shcare-Compatibility-Alias", "auth-session-revoke");
    }
    const operation = "auth.session.revoke";
    const idempotency = {
      scope: user.id,
      operation,
      key: idempotencyKey,
      fingerprint: createIdempotencyFingerprint({ sessionId }),
    };
    const operationId = `auth_session_revoke_${createIdempotencyFingerprint({
      userId: user.id,
      operation,
      key: idempotencyKey,
    }).slice(0, 24)}`;
    const context = getRequestContext(req) || createRequestContext(req);
    const revoked = repositories?.authSessions
      ? await repositories.authSessions.revokeForUser(user.id, sessionId, {
          action: operation,
          organizationId: user.organizationId || "",
          ip: context.ip || "",
          userAgent: context.userAgent || "",
          metadata: { operationId },
        }, idempotency, {
          id: req.authSession.id,
          sessionKey: req.authSession.sessionKey || "",
        })
      : null;
    if (!revoked) throw httpError(404, "Session not found", "AUTH_SESSION_NOT_FOUND");
    closeRealtimeSocketsForSession(user.id, revoked.session);
    addAccessLog("Revoke auth session", { severity: "warning" });
    await saveDb();
    if (revoked.replayed) res.setHeader("Idempotency-Replayed", "true");
    sendJson(res, 200, {
      session: publicAuthSession(revoked.session, false),
      revoked: true,
      replayed: Boolean(revoked.replayed),
    });
    return;
  }

  if (segments.length === 3 && segments[2] === "password-reset" && method === "POST") {
    const payload = await readJsonBody(req);
    const email = readString(payload.email || payload.login, 180).toLowerCase();
    if (!FIREBASE_AUTH_ENABLED) {
      throw httpError(503, "Firebase Auth chưa được cấu hình", "FIREBASE_AUTH_NOT_CONFIGURED");
    }
    const firebaseAdminApp = getFirebaseAdmin(process.env);
    if (!firebaseAdminApp) {
      throw httpError(503, "Firebase Admin chưa sẵn sàng", "FIREBASE_ADMIN_NOT_READY");
    }

    let firebaseUser = null;
    if (isValidEmailAddress(email)) {
      try {
        firebaseUser = await firebaseAdminApp.auth().getUserByEmail(email);
      } catch (error) {
        if (error?.code !== "auth/user-not-found" && error?.code !== "auth/invalid-email") throw error;
      }
    }

    if (firebaseUser?.email) {
      const actionCodeSettings = { url: getPasswordResetContinueUrl(req) };
      const linkDomain = getFirebaseEmailLinkDomain();
      if (linkDomain) actionCodeSettings.linkDomain = linkDomain;
      const resetLink = await firebaseAdminApp.auth().generatePasswordResetLink(
        firebaseUser.email,
        actionCodeSettings,
      );
      const backendUser = repositories?.users?.findByEmail
        ? await repositories.users.findByEmail(firebaseUser.email)
        : findUserByLogin(firebaseUser.email);
      const message = buildPasswordResetMessage({
        name: backendUser?.name || firebaseUser.displayName || firebaseUser.email,
        email: firebaseUser.email,
        resetLink,
      });
      const delivery = await sendEmail({
        to: { email: firebaseUser.email, name: backendUser?.name || firebaseUser.displayName || "" },
        subject: "Đặt lại mật khẩu Shcare",
        text: message.text,
        html: message.html,
      });
      if (backendUser) {
        await appendAudit("auth.password_reset.send", req, {
          actorUserId: backendUser.id,
          organizationId: backendUser.organizationId || "",
          resourceType: "user",
          resourceId: backendUser.id,
          metadata: { provider: delivery.provider || "" },
        });
      }
    }

    // Keep the same response for known and unknown addresses to avoid account
    // enumeration. "accepted" does not claim that an account exists.
    sendJson(res, 200, {
      ok: true,
      status: "accepted",
      message: "Nếu tài khoản tồn tại, hướng dẫn đặt lại mật khẩu sẽ được gửi qua email.",
    });
    return;
  }

  sendJson(res, 404, { error: "Auth route not found" });
}

function requireStaffInvitationStore() {
  if (!repositories?.staffInvitations) {
    throw httpError(
      503,
      "Staff invitation storage is unavailable",
      "STAFF_INVITATION_STORAGE_UNAVAILABLE",
    );
  }
  return repositories.staffInvitations;
}

function resolveStaffInvitationWorkspaceId(user, requestedOrganizationId, options = {}) {
  const requested = readString(requestedOrganizationId, 120);
  if (isPlatformAdminUser(user)) {
    requireAnyCapability(
      user,
      ["platform.users.manage"],
      "Platform user management permission is required",
    );
    if (options.required && !requested) {
      throw httpError(
        400,
        "A workspace is required for the staff invitation",
        "STAFF_INVITATION_WORKSPACE_REQUIRED",
      );
    }
    return requested;
  }

  requireAnyCapability(
    user,
    ["workspace.staff.manage"],
    "Workspace staff management permission is required",
  );
  const workspaceId = getUserWorkspaceContext(user).currentWorkspaceId || "";
  if (!workspaceId || !hasWorkspaceMembership(user, workspaceId)) {
    throw httpError(
      403,
      "An operational workspace membership is required",
      "WORKSPACE_MEMBERSHIP_REQUIRED",
    );
  }
  if (requested && requested !== workspaceId) {
    throw httpError(
      403,
      "Staff invitations are restricted to the current workspace",
      "STAFF_INVITATION_WORKSPACE_SCOPE_MISMATCH",
    );
  }
  return workspaceId;
}

function getRequiredIdempotencyKey(req, payload, mutationLabel) {
  const key = getIdempotencyKey(req, payload);
  if (!key) {
    throw httpError(
      400,
      `Idempotency-Key is required for ${mutationLabel}`,
      "IDEMPOTENCY_KEY_REQUIRED",
    );
  }
  return key;
}

function staffInvitationAuditInput(req, user, organizationId, action, metadata = {}) {
  return {
    actorUserId: user.id,
    organizationId,
    action,
    resourceType: "staff_invitation",
    ip: req.socket.remoteAddress || "",
    userAgent: readString(req.headers["user-agent"], 240),
    metadata,
  };
}

async function deliverStaffInvitation(req, user, invitation, rawToken) {
  const runtime = getEmailRuntimeStatus();
  if (!runtime.configured) return invitation;
  const workspace = getClinicById(invitation.organizationId);
  const acceptanceUrl = getStaffInvitationAcceptanceUrl(rawToken);
  const message = buildStaffInvitationMessage({
    invitation,
    acceptanceUrl,
    workspaceName: workspace?.name || invitation.organizationId,
  });
  let delivery;
  try {
    const result = await sendEmail({
      to: invitation.email,
      subject: `Lời mời tham gia ${workspace?.name || "Shcare"}`,
      ...message,
    });
    const acceptedRecipients = (Array.isArray(result.accepted) ? result.accepted : [])
      .map((recipient) => readString(recipient?.address || recipient, 254).toLowerCase());
    const rejectedRecipients = (Array.isArray(result.rejected) ? result.rejected : [])
      .map((recipient) => readString(recipient?.address || recipient, 254).toLowerCase());
    const recipientAccepted = acceptedRecipients.includes(invitation.email.toLowerCase());
    const recipientRejected = rejectedRecipients.includes(invitation.email.toLowerCase());
    delivery = recipientAccepted && !recipientRejected
      ? {
          email: "sent",
          provider: result.provider || runtime.provider,
          messageId: result.messageId || "",
          errorCode: "",
        }
      : {
          email: "failed",
          provider: result.provider || runtime.provider,
          messageId: result.messageId || "",
          errorCode: "STAFF_INVITATION_RECIPIENT_REJECTED",
        };
  } catch (error) {
    delivery = {
      email: "failed",
      provider: runtime.provider,
      messageId: "",
      errorCode: readString(error?.code || "STAFF_INVITATION_EMAIL_FAILED", 120),
    };
  }
  const recorded = await requireStaffInvitationStore().recordDelivery({
    invitationId: invitation.id,
    organizationId: invitation.organizationId,
    ...delivery,
    audit: staffInvitationAuditInput(
      req,
      user,
      invitation.organizationId,
      "staff.invitation.delivery",
      {
        email: invitation.email,
        deliveryEmail: delivery.email,
        provider: delivery.provider,
        errorCode: delivery.errorCode,
      },
    ),
  });
  return recorded.invitation;
}

async function handleAdminStaffInvitationApi(req, res, url, segments, adminUser) {
  const method = req.method || "GET";
  requireAnyCapability(
    adminUser,
    ["platform.users.manage", "workspace.staff.manage"],
    "Staff invitation management permission is required",
  );
  const store = requireStaffInvitationStore();

  if (segments.length === 3 && method === "GET") {
    const organizationId = resolveStaffInvitationWorkspaceId(
      adminUser,
      url.searchParams.get("organizationId"),
    );
    const status = readString(url.searchParams.get("status"), 40).toLowerCase();
    if (status && !STAFF_INVITATION_STATUSES.includes(status)) {
      throw httpError(
        400,
        "The selected staff invitation status is not supported",
        "STAFF_INVITATION_STATUS_INVALID",
        { allowedStatuses: [...STAFF_INVITATION_STATUSES] },
      );
    }
    const invitations = await store.list({
      organizationId,
      role: readString(url.searchParams.get("role"), 80),
      status,
    });
    sendJson(res, 200, { invitations });
    return;
  }

  if (segments.length === 3 && method === "POST") {
    const payload = await readJsonBody(req);
    const organizationId = resolveStaffInvitationWorkspaceId(
      adminUser,
      payload.organizationId,
      { required: true },
    );
    const normalizedPayload = normalizeStaffInvitationCreate({
      ...payload,
      organizationId,
    });
    const idempotencyKey = getRequiredIdempotencyKey(req, payload, "staff invitation creation");
    const rawToken = generateStaffInvitationToken();
    const runtime = getEmailRuntimeStatus();
    const result = await store.create({
      payload: normalizedPayload,
      tokenHash: hashStaffInvitationToken(rawToken),
      expiresAt: getStaffInvitationExpiryIso(),
      deliveryEmail: runtime.configured ? "ready" : "unavailable",
      deliveryProvider: runtime.provider,
      idempotency: {
        scope: getIdempotencyScope(adminUser, organizationId),
        operation: "staff.invitation.create",
        key: idempotencyKey,
        fingerprint: createIdempotencyFingerprint(normalizedPayload),
      },
      audit: staffInvitationAuditInput(
        req,
        adminUser,
        organizationId,
        "staff.invitation.create",
        { email: normalizedPayload.email, role: normalizedPayload.role },
      ),
    });
    if (result.replayed) {
      res.setHeader("Idempotency-Replayed", "true");
      const replayedInvitation = result.responseBody.invitation;
      const invitation = await store.findById(replayedInvitation.id) || replayedInvitation;
      sendJson(res, 200, {
        invitation,
        delivery: invitation.delivery,
        idempotent: true,
      });
      return;
    }
    let invitation = result.responseBody.invitation;
    invitation = await deliverStaffInvitation(req, adminUser, invitation, rawToken);
    sendJson(res, 201, {
      invitation,
      delivery: invitation.delivery,
      oneTimeAcceptanceToken: rawToken,
      oneTimeAcceptanceUrl: getStaffInvitationAcceptanceUrl(rawToken),
      idempotent: false,
    });
    return;
  }

  if (
    segments.length === 5 &&
    method === "POST" &&
    ["resend", "revoke"].includes(segments[4])
  ) {
    const invitationId = decodeURIComponent(segments[3]);
    const workspaceScope = isPlatformAdminUser(adminUser)
      ? ""
      : resolveStaffInvitationWorkspaceId(adminUser, "", { required: true });
    const current = workspaceScope
      ? (await store.list({ organizationId: workspaceScope })).find(
          (invitation) => invitation.id === invitationId,
        ) || null
      : await store.findById(invitationId);
    if (!current) {
      throw httpError(404, "Staff invitation was not found", "STAFF_INVITATION_NOT_FOUND");
    }
    const organizationId = workspaceScope || resolveStaffInvitationWorkspaceId(
      adminUser,
      current.organizationId,
      { required: true },
    );
    const payload = await readJsonBody(req);
    const action = segments[4];
    const idempotencyKey = getRequiredIdempotencyKey(req, payload, `staff invitation ${action}`);
    if (action === "resend") {
      const rawToken = generateStaffInvitationToken();
      const runtime = getEmailRuntimeStatus();
      const result = await store.resend({
        invitationId,
        organizationId,
        tokenHash: hashStaffInvitationToken(rawToken),
        expiresAt: getStaffInvitationExpiryIso(),
        deliveryEmail: runtime.configured ? "ready" : "unavailable",
        deliveryProvider: runtime.provider,
        idempotency: {
          scope: getIdempotencyScope(adminUser, organizationId),
          operation: "staff.invitation.resend",
          key: idempotencyKey,
          fingerprint: createIdempotencyFingerprint({ invitationId, organizationId }),
        },
        audit: staffInvitationAuditInput(
          req,
          adminUser,
          organizationId,
          "staff.invitation.resend",
          { invitationId, email: current.email },
        ),
      });
      if (result.replayed) {
        res.setHeader("Idempotency-Replayed", "true");
        const replayedInvitation = result.responseBody.invitation;
        const invitation = await store.findById(replayedInvitation.id) || replayedInvitation;
        sendJson(res, 200, {
          invitation,
          delivery: invitation.delivery,
          idempotent: true,
        });
        return;
      }
      let invitation = result.responseBody.invitation;
      invitation = await deliverStaffInvitation(req, adminUser, invitation, rawToken);
      sendJson(res, 200, {
        invitation,
        delivery: invitation.delivery,
        oneTimeAcceptanceToken: rawToken,
        oneTimeAcceptanceUrl: getStaffInvitationAcceptanceUrl(rawToken),
        idempotent: false,
      });
      return;
    }

    const revoke = normalizeStaffInvitationRevoke(payload);
    const result = await store.revoke({
      invitationId,
      organizationId,
      ...revoke,
      idempotency: {
        scope: getIdempotencyScope(adminUser, organizationId),
        operation: "staff.invitation.revoke",
        key: idempotencyKey,
        fingerprint: createIdempotencyFingerprint({ invitationId, organizationId, ...revoke }),
      },
      audit: staffInvitationAuditInput(
        req,
        adminUser,
        organizationId,
        "staff.invitation.revoke",
        { invitationId, email: current.email, reason: revoke.reason },
      ),
    });
    if (result.replayed) res.setHeader("Idempotency-Replayed", "true");
    sendJson(res, 200, {
      invitation: result.responseBody.invitation,
      idempotent: result.replayed,
    });
    return;
  }

  throw httpError(404, "Staff invitation route not found", "STAFF_INVITATION_ROUTE_NOT_FOUND");
}

async function handleStaffInvitationAcceptanceApi(req, res, segments) {
  const method = req.method || "GET";
  if (segments.length !== 3 || segments[2] !== "accept" || method !== "POST") {
    throw httpError(404, "Staff invitation route not found", "STAFF_INVITATION_ROUTE_NOT_FOUND");
  }
  const user = requireSessionUser(req);
  if (AUTH_MODE === "production" && user.verifiedEmail !== true) {
    throw httpError(
      403,
      "Verify the authenticated email before accepting a staff invitation",
      "STAFF_INVITATION_EMAIL_VERIFICATION_REQUIRED",
    );
  }
  const payload = await readJsonBody(req);
  const rawToken = assertStaffInvitationToken(payload.token);
  const tokenHash = hashStaffInvitationToken(rawToken);
  const idempotencyKey = getRequiredIdempotencyKey(req, payload, "staff invitation acceptance");
  const result = await requireStaffInvitationStore().accept({
    tokenHash,
    actorUserId: user.id,
    actorEmail: user.email,
    organizationId: readString(payload.organizationId, 120),
    idempotency: {
      scope: getIdempotencyScope(user),
      operation: "staff.invitation.accept",
      key: idempotencyKey,
      fingerprint: createIdempotencyFingerprint({ tokenHash, actorUserId: user.id }),
    },
    audit: staffInvitationAuditInput(
      req,
      user,
      readString(payload.organizationId, 120),
      "staff.invitation.accept",
      { acceptedByUserId: user.id },
    ),
  });
  if (result.replayed) res.setHeader("Idempotency-Replayed", "true");
  const acceptedUser = repositories
    ? await repositories.users.findByIdOrFirebaseUid(user.id)
    : db.users.find((candidate) => candidate.id === user.id);
  sendJson(res, 200, {
    invitation: result.responseBody.invitation,
    membership: result.responseBody.membership,
    user: publicUser(acceptedUser || user),
    idempotent: result.replayed,
  });
}

async function handleAdminApi(req, res, url, segments) {
  const method = req.method || "GET";
  const adminUser = requireUser(req);

  if (segments[2] === "staff-invitations") {
    await handleAdminStaffInvitationApi(req, res, url, segments, adminUser);
    return;
  }

  if (segments[2] === "overview-stats" && method === "GET") {
    requireAnyCapability(adminUser, DASHBOARD_VIEW_CAPABILITIES, "Không có quyền xem tổng quan workspace");
    const workspaceId = getUserWorkspaceContext(adminUser).currentWorkspaceId || "";
    const scopedPatients = filterPatientsForUser(adminUser, db.patients);
    const scopedDevices = filterDevicesForUser(adminUser, db.devices);
    const scopedScans = filterScansForUser(adminUser, db.scans);
    const scopedFiles = buildStorageFileRecords(adminUser);
    const pendingDoctors = db.users
      .filter(isAwaitingDoctorApproval)
      .filter((user) => isPlatformAdminUser(adminUser) || (workspaceId && user.organizationId === workspaceId)).length;
    // Match the device list and workspace summaries: only an authenticated,
    // currently open WSS session counts as online.
    const devicesOnline = scopedDevices.filter((device) => Boolean(getAuthenticatedDeviceSocket(device))).length;
    const devicesOffline = Math.max(0, scopedDevices.length - devicesOnline);
    let overviewSnapshot;
    try {
      overviewSnapshot = buildOverviewRangeSnapshot(scopedScans, {
        range: url.searchParams.get("range") || "today",
        timezoneOffsetMinutes: url.searchParams.get("timezoneOffsetMinutes") || 0,
        now: new Date(),
      });
    } catch (error) {
      throw httpError(400, error.message, error.code || "OVERVIEW_FILTER_INVALID");
    }
    const rangedScans = overviewSnapshot.scans;
    const scansCount = rangedScans.length;
    const failedScans = rangedScans.filter((scan) => ["failed", "error"].includes(String(scan.status || "").toLowerCase()));
    const processingScans = rangedScans.filter((scan) =>
      ["created", "uploading", "queued", "processing", "recording"].includes(String(scan.status || "").toLowerCase()),
    );
    const completedScans = rangedScans.filter((scan) => {
      const status = String(scan.status || "").toLowerCase();
      return !["failed", "error", "created", "uploading", "queued", "processing", "recording"].includes(status) &&
        (status === "completed" || Boolean(scan.aiLabel));
    });
    const categorizedScanIds = new Set(
      [...failedScans, ...processingScans, ...completedScans].map((scan) => String(scan.id || "")),
    );
    const pendingScans = rangedScans.filter((scan) => !categorizedScanIds.has(String(scan.id || "")));
    const aiJobsFailed = failedScans.length;
    const storageUsedGb = scopedFiles.reduce((sum, file) => sum + Number(file.byteSize || 0), 0) / 1024 / 1024 / 1024;
    const storageBytes = scopedFiles.reduce((sum, file) => sum + Number(file.byteSize || 0), 0);

    const deviceData = [
      { key: "online", name: "Đang hoạt động", value: devicesOnline, color: "#18794E" },
      { key: "offline", name: "Mất kết nối", value: devicesOffline, color: "#D8E3EA" },
    ];

    const aiJobData = [
      { key: "processing", name: "Đang xử lý", value: processingScans.length, color: "#2563A6" },
      { key: "completed", name: "Hoàn tất", value: completedScans.length, color: "#18794E" },
      { key: "failed", name: "Thất bại", value: aiJobsFailed, color: "#B4233A" },
      { key: "pending", name: "Chờ xử lý", value: pendingScans.length, color: "#A15C00" },
    ];

    const canonicalWorkspacePage = isPlatformAdminUser(adminUser)
      ? await requireWorkspaceLifecycleRepository().list({ page: 1, limit: 1 })
      : null;
    const canonicalWorkspaceCount = isPlatformAdminUser(adminUser)
      ? Number(canonicalWorkspacePage?.total || 0)
      : workspaceId
        ? 1
        : 0;
    sendJson(res, 200, {
      generatedAt: overviewSnapshot.generatedAt,
      workspaceId,
      range: overviewSnapshot.range,
      stats: {
        clinics: canonicalWorkspaceCount,
        workspaces: canonicalWorkspaceCount,
        patientsCount: scopedPatients.length,
        pendingDoctors,
        devicesCount: scopedDevices.length,
        devicesOnline,
        scansCount,
        aiJobsFailed,
        storageBytes,
        storageUsed: storageUsedGb >= 1 ? `${storageUsedGb.toFixed(1)} GB` : `${Math.round(storageUsedGb * 1024)} MB`
      },
      measureData: overviewSnapshot.measureData,
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
      const day = String(file.createdAt || "").slice(0, 10);
      if (!day) continue;
      byDay.set(day, Number(byDay.get(day) || 0) + Number(file.byteSize || 0));
    }
    const growthData = Array.from(byDay.entries())
      .map(([day, bytes]) => ({ day, gb: bytesToGb(bytes) }))
      .sort((left, right) => left.day.localeCompare(right.day))
      .slice(-30);
    const recentActivity = files.slice(0, 8).map((file) => ({
      who: file.uploader,
      what: "đã tải tệp lên storage",
      target: file.name,
      when: file.uploadedAt,
      action: "upload",
    }));
    const orgUsage = new Map();
    for (const file of files) {
      const organizationId = file.organizationId || "org_default_clinic";
      orgUsage.set(
        organizationId,
        Number(orgUsage.get(organizationId) || 0) + Number(file.byteSize || 0),
      );
    }
    const topClinicUsage = Array.from(orgUsage.entries())
      .map(([organizationId, bytes]) => ({
        name:
          getClinicById(organizationId)?.name || organizationId,
        gb: bytesToGb(bytes),
        percent: totalBytes > 0 ? Math.round((Number(bytes) / totalBytes) * 100) : 0,
      }))
      .sort((a, b) => b.gb - a.gb);

    sendJson(res, 200, {
      totalUsed: buckets.reduce((sum, bucket) => sum + bucket.used, 0),
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
    if (!isPlatformAdminUser(adminUser)) {
      throw httpError(
        403,
        "Only Platform Admin can create storage buckets",
        "STORAGE_BUCKET_PLATFORM_ADMIN_REQUIRED",
      );
    }
    requireAnyCapability(adminUser, ["platform.storage.manage"], "Không có quyền tạo bucket storage");
    if (!repositories?.storageMetadata?.buckets) {
      throw httpError(
        503,
        "Canonical storage metadata repository is unavailable",
        "STORAGE_METADATA_REPOSITORY_UNAVAILABLE",
      );
    }
    const payload = await readJsonBody(req);
    const id = sanitizeStorageId(payload.id || payload.name);
    const reservedBucket = getStorageBucket(id);
    if (reservedBucket?.system) {
      throw httpError(409, "A system bucket already uses this id", "STORAGE_SYSTEM_BUCKET_RESERVED");
    }
    const idempotencyKey = readString(req.headers["idempotency-key"], 160);
    if (!idempotencyKey) {
      throw httpError(
        400,
        "Idempotency-Key is required for storage bucket creation",
        "IDEMPOTENCY_KEY_REQUIRED",
      );
    }
    const requestContext = getRequestContext(req) || createRequestContext(req);
    const result = await repositories.storageMetadata.buckets.create({
      payload,
      idempotency: {
        scope: getIdempotencyScope(adminUser),
        operation: "storage.bucket.create",
        key: idempotencyKey,
        fingerprint: createIdempotencyFingerprint(payload),
      },
      audit: {
        action: "storage.bucket.create",
        actorUserId: adminUser.id,
        organizationId: adminUser.organizationId || "",
        ip: requestContext.ip || "",
        userAgent: requestContext.userAgent || readString(req.headers["user-agent"], 240),
        metadata: { fields: Object.keys(payload).sort() },
      },
    });
    const canonicalBucket = buildStorageBucketSummaries().find(
      (item) => item.id === result.responseBody?.bucket?.id,
    );
    sendJson(res, result.responseStatus, {
      bucket: canonicalBucket || result.responseBody?.bucket,
      ...(result.replayed ? { idempotent: true } : {}),
    });
    return;
  }

  if (segments[2] === "storage-buckets" && segments.length === 4 && method === "DELETE") {
    if (!isPlatformAdminUser(adminUser)) {
      throw httpError(
        403,
        "Only Platform Admin can delete storage buckets",
        "STORAGE_BUCKET_PLATFORM_ADMIN_REQUIRED",
      );
    }
    requireAnyCapability(adminUser, ["platform.storage.manage"], "Không có quyền xóa bucket storage");
    if (!repositories?.storageMetadata?.buckets) {
      throw httpError(
        503,
        "Canonical storage metadata repository is unavailable",
        "STORAGE_METADATA_REPOSITORY_UNAVAILABLE",
      );
    }
    const bucketId = decodeURIComponent(segments[3]);
    const bucket = getStorageBucket(bucketId);
    if (bucket?.system) {
      throw httpError(
        409,
        "System storage buckets cannot be deleted",
        "STORAGE_SYSTEM_BUCKET_IMMUTABLE",
      );
    }
    const idempotencyKey = readString(req.headers["idempotency-key"], 160);
    if (!idempotencyKey) {
      throw httpError(
        400,
        "Idempotency-Key is required for storage bucket deletion",
        "IDEMPOTENCY_KEY_REQUIRED",
      );
    }
    const requestContext = getRequestContext(req) || createRequestContext(req);
    const result = await repositories.storageMetadata.buckets.remove({
      bucketId,
      idempotency: {
        scope: getIdempotencyScope(adminUser),
        operation: "storage.bucket.delete",
        key: idempotencyKey,
        fingerprint: createIdempotencyFingerprint({ bucketId }),
      },
      audit: {
        action: "storage.bucket.delete",
        actorUserId: adminUser.id,
        organizationId: adminUser.organizationId || "",
        ip: requestContext.ip || "",
        userAgent: requestContext.userAgent || readString(req.headers["user-agent"], 240),
        metadata: { lifecycle: "delete" },
      },
    });
    sendJson(res, result.responseStatus, {
      ...result.responseBody,
      ...(result.replayed ? { idempotent: true } : {}),
    });
    return;
  }

  if (segments.length === 5 && segments[2] === "storage-files" && segments[4] === "share" && method === "POST") {
    requireAnyCapability(adminUser, STORAGE_MANAGE_CAPABILITIES, "Không có quyền tạo signed URL chia sẻ file");
    if (!repositories?.storageMetadata?.files) {
      throw httpError(
        503,
        "Canonical storage metadata repository is unavailable",
        "STORAGE_METADATA_REPOSITORY_UNAVAILABLE",
      );
    }
    const fileId = decodeURIComponent(segments[3]);
    const record = getStorageRecord(fileId);
    if (!record) {
      throw httpError(404, "Không tìm thấy tệp lưu trữ");
    }
    assertCanManageStorageRecord(adminUser, record);
    const idempotencyKey = readString(req.headers["idempotency-key"], 160);
    if (!idempotencyKey) {
      throw httpError(
        400,
        "Idempotency-Key is required for storage share links",
        "IDEMPOTENCY_KEY_REQUIRED",
      );
    }
    const { audioFile, storageFile } = getStorageFileSource(record);
    const objectFile = storageFile || audioFile;
    if (!objectFile?.objectKey) {
      throw httpError(
        409,
        "Storage object is unavailable for signed sharing",
        "STORAGE_OBJECT_UNAVAILABLE",
      );
    }
    if (storageAdapter.provider !== "s3") {
      throw httpError(
        503,
        "Signed storage sharing is unavailable without the S3 provider",
        "STORAGE_SHARE_PROVIDER_UNAVAILABLE",
      );
    }
    const requestContext = getRequestContext(req) || createRequestContext(req);
    const result = await repositories.storageMetadata.files.recordShare({
      fileId: record.id,
      createResponse: async () => {
        const shareUrl = await storageAdapter.getSignedUrl(objectFile.objectKey, 900);
        return { url: shareUrl, shareUrl, expiresInSeconds: 900 };
      },
      idempotency: {
        scope: getIdempotencyScope(
          adminUser,
          record.organizationId || adminUser.organizationId || "",
        ),
        operation: "storage.file.share",
        key: idempotencyKey,
        fingerprint: createIdempotencyFingerprint({
          fileId: record.id,
          expiresInSeconds: 900,
        }),
      },
      audit: {
        action: "storage.share",
        actorUserId: adminUser.id,
        organizationId: record.organizationId || adminUser.organizationId || "",
        ip: requestContext.ip || "",
        userAgent: requestContext.userAgent || readString(req.headers["user-agent"], 240),
        metadata: { name: record.name, bucket: record.bucket, expiresInSeconds: 900 },
      },
    });
    sendJson(res, result.responseStatus, {
      ...result.responseBody,
      ...(result.replayed ? { idempotent: true } : {}),
    });
    return;
  }

  if (segments[2] === "storage-files" && segments.length === 3 && method === "GET") {
    requireAnyCapability(adminUser, STORAGE_READ_CAPABILITIES, "Không có quyền xem tệp storage");
    const bucketFilter = readString(url.searchParams.get("bucket"), 120);
    const typeFilter = readString(url.searchParams.get("type"), 80).toLowerCase();
    const storageSource = buildStorageFileRecords(adminUser).filter(
      (item) =>
        (!bucketFilter || bucketFilter === "all" || item.bucket === bucketFilter) &&
        (!typeFilter || typeFilter === "all" || String(item.type || "").toLowerCase() === typeFilter),
    );
    const pageResult = resolveAdminListPage(storageSource, url, {
      searchFields: [
        (item) => item.id,
        (item) => item.name,
        (item) => item.bucket,
        (item) => item.type,
        (item) => item.uploader,
        (item) => item.organizationId,
        (item) => Array.isArray(item.tags) ? item.tags.join(" ") : "",
      ],
      sortFields: {
        name: (item) => item.name,
        createdAt: (item) => item.createdAt || item.uploadedAt,
        byteSize: (item) => item.byteSize,
        bucket: (item) => item.bucket,
        type: (item) => item.type,
      },
      defaultSort: "createdAt:desc",
    });
    setWorkspacePaginationHeaders(res, pageResult);
    sendJson(res, 200, { files: pageResult.items });
    return;
  }

  if (segments[2] === "storage-files" && segments.length === 3 && method === "POST") {
    requireAnyCapability(adminUser, STORAGE_MANAGE_CAPABILITIES, "Không có quyền upload storage");
    if (!repositories?.storageMetadata?.files) {
      throw httpError(
        503,
        "Canonical storage metadata repository is unavailable",
        "STORAGE_METADATA_REPOSITORY_UNAVAILABLE",
      );
    }
    const idempotencyKey = readString(req.headers["idempotency-key"], 160);
    if (!idempotencyKey) {
      throw httpError(
        400,
        "Idempotency-Key is required for storage uploads",
        "IDEMPOTENCY_KEY_REQUIRED",
      );
    }
    const bucketId = sanitizeStorageId(url.searchParams.get("bucket") || req.headers["x-storage-bucket"], "heart-audio");
    const bucket = getStorageBucket(bucketId);
    if (!bucket) {
      throw httpError(404, "Không tìm thấy bucket");
    }
    const originalName = readString(url.searchParams.get("filename") || req.headers["x-file-name"], 240) || `${createId("file")}.bin`;
    const contentType = readString(req.headers["content-type"], 160) || "application/octet-stream";
    const requestedVisibility = readString(url.searchParams.get("visibility"), 40).toLowerCase();
    if (requestedVisibility && requestedVisibility !== "private") {
      throw httpError(
        422,
        "Storage uploads are private; public visibility is unavailable",
        "STORAGE_VISIBILITY_UNSUPPORTED",
      );
    }
    const buffer = await readRequestBuffer(req);
    if (!buffer.length) {
      throw httpError(400, "File tải lên đang rỗng");
    }
    assertStorageUploadAllowed(bucket, originalName, contentType, buffer.length);
    const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
    const fileId = createId("file");
    const organizationId = getWritableWorkspaceIdForUser(adminUser, url.searchParams.get("organizationId") || req.headers["x-organization-id"]);
    if (!getClinicById(organizationId)) {
      throw httpError(
        404,
        "The target workspace was not found",
        "STORAGE_WORKSPACE_NOT_FOUND",
      );
    }
    const objectKey = buildStorageObjectKey(organizationId, bucket.id, fileId, originalName);
    const firmwareVersion =
      bucket.id === "device-firmware"
        ? readString(url.searchParams.get("firmwareVersion") || req.headers["x-firmware-version"], 80) ||
          inferFirmwareVersionFromName(originalName)
        : "";
    const tags = parseCsvList(url.searchParams.get("tags") || req.headers["x-file-tags"]);
    const requestContext = getRequestContext(req) || createRequestContext(req);
    const result = await repositories.storageMetadata.files.create({
      prepareFile: async () => {
        const upload = await storageAdapter.putBuffer(objectKey, buffer, contentType);
        return {
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
          tags,
          uploader: adminUser.name || adminUser.email || "Quản trị hệ thống",
          createdByUserId: adminUser.id,
          organizationId,
        };
      },
      cleanupFile: async (file) => {
        if (file.objectKey && storageAdapter.deleteObject) {
          await storageAdapter.deleteObject(file.objectKey);
        }
      },
      idempotency: {
        scope: getIdempotencyScope(adminUser, organizationId),
        operation: "storage.file.upload",
        key: idempotencyKey,
        fingerprint: createIdempotencyFingerprint({
          organizationId,
          bucketId: bucket.id,
          originalName: path.basename(originalName),
          contentType,
          byteSize: buffer.length,
          checksum,
          firmwareVersion,
          tags,
        }),
      },
      audit: {
        action: "storage.upload",
        actorUserId: adminUser.id,
        organizationId,
        ip: requestContext.ip || "",
        userAgent: requestContext.userAgent || readString(req.headers["user-agent"], 240),
        metadata: {
          name: path.basename(originalName),
          bucket: bucket.id,
          byteSize: buffer.length,
          checksum,
        },
      },
    });
    const file = buildStorageFileRecords(adminUser).find(
      (item) => item.id === result.responseBody?.file?.id,
    );
    sendJson(res, result.responseStatus, {
      file: file || result.responseBody?.file,
      ...(result.replayed ? { idempotent: true } : {}),
    });
    return;
  }

  if (segments[2] === "storage-files" && segments.length === 4 && method === "DELETE") {
    requireAnyCapability(adminUser, STORAGE_MANAGE_CAPABILITIES, "Không có quyền xóa tệp storage");
    if (!repositories?.storageMetadata?.files) {
      throw httpError(
        503,
        "Canonical storage metadata repository is unavailable",
        "STORAGE_METADATA_REPOSITORY_UNAVAILABLE",
      );
    }
    const idempotencyKey = readString(req.headers["idempotency-key"], 160);
    if (!idempotencyKey) {
      throw httpError(
        400,
        "Idempotency-Key is required for storage file deletion",
        "IDEMPOTENCY_KEY_REQUIRED",
      );
    }
    const fileId = decodeURIComponent(segments[3]);
    const record =
      getStorageRecord(fileId) ||
      (await repositories.storageMetadata.files.findById(fileId, { includeDeleted: true }));
    if (!record) {
      throw httpError(404, "Không tìm thấy tệp lưu trữ");
    }
    assertCanManageStorageRecord(adminUser, record);
    const { storageFile } = getStorageFileSource(record);
    if (!storageFile) {
      throw httpError(400, "Chỉ có thể xóa tệp được tải lên thủ công từ trang lưu trữ");
    }
    const requestContext = getRequestContext(req) || createRequestContext(req);
    const result = await repositories.storageMetadata.files.remove({
      fileId: storageFile.id,
      deleteObject: async (file) => {
        if (file.objectKey && storageAdapter.deleteObject) {
          await storageAdapter.deleteObject(file.objectKey);
        }
      },
      idempotency: {
        scope: getIdempotencyScope(
          adminUser,
          storageFile.organizationId || adminUser.organizationId || "",
        ),
        operation: "storage.file.delete",
        key: idempotencyKey,
        fingerprint: createIdempotencyFingerprint({ fileId: storageFile.id }),
      },
      audit: {
        action: "storage.delete",
        actorUserId: adminUser.id,
        organizationId: storageFile.organizationId || adminUser.organizationId || "",
        ip: requestContext.ip || "",
        userAgent: requestContext.userAgent || readString(req.headers["user-agent"], 240),
        metadata: { name: storageFile.name, bucket: storageFile.bucket },
      },
    });
    sendJson(res, result.responseStatus, {
      ...result.responseBody,
      ...(result.replayed ? { idempotent: true } : {}),
    });
    return;
  }

  if (segments.length === 5 && segments[2] === "storage-files" && segments[4] === "download" && method === "GET") {
    requireAnyCapability(adminUser, STORAGE_READ_CAPABILITIES, "Không có quyền tải file storage");
    await serveStorageFileDownload(req, res, decodeURIComponent(segments[3]));
    return;
  }

  if (segments[2] === "sync-firebase" && method === "POST") {
    requireAnyCapability(adminUser, ["platform.users.manage"], "Chỉ platform admin mới được đồng bộ Firebase");
    if (!FIREBASE_AUTH_ENABLED) {
      throw httpError(
        503,
        "Firebase Admin chưa được cấu hình; không thể đối soát tài khoản",
        "IDENTITY_PROVIDER_UNAVAILABLE",
      );
    }
    const firebaseAdminApp = getFirebaseAdmin(process.env);
    if (!firebaseAdminApp) {
      throw httpError(
        503,
        "Không thể khởi tạo Firebase Admin để đối soát tài khoản",
        "IDENTITY_PROVIDER_UNAVAILABLE",
      );
    }

    try {
      const firebaseUsers = [];
      let pageToken;
      do {
        const page = await firebaseAdminApp.auth().listUsers(1000, pageToken);
        firebaseUsers.push(...page.users);
        pageToken = page.pageToken;
      } while (pageToken);

      const firebaseUids = new Set(firebaseUsers.map((user) => user.uid));
      const backendFirebaseUids = new Set(
        db.users.map((user) => readString(user.firebaseUid, 160)).filter(Boolean),
      );
      const missingProviderAccounts = db.users
        .filter((user) => {
          const firebaseUid = readString(user.firebaseUid, 160);
          return firebaseUid && !firebaseUids.has(firebaseUid);
        })
        .map((user) => ({
          userId: user.id,
          firebaseUid: user.firebaseUid,
          email: readString(user.email, 160),
          role: readString(user.role, 60),
          accountStatus: readString(user.accountStatus || "active", 40),
        }));
      const missingBackendAccounts = firebaseUsers
        .filter((user) => !backendFirebaseUids.has(user.uid))
        .map((user) => ({
          firebaseUid: user.uid,
          email: readString(user.email, 160),
          disabled: user.disabled === true,
        }));

      await appendAudit("firebase.reconcile.scan", req, {
        actorUserId: adminUser.id,
        resourceType: "identity_reconciliation",
        resourceId: "firebase",
        metadata: {
          providerAccountCount: firebaseUsers.length,
          backendLinkedAccountCount: backendFirebaseUids.size,
          missingProviderAccountCount: missingProviderAccounts.length,
          missingBackendAccountCount: missingBackendAccounts.length,
          destructiveAction: false,
        },
      });
      addAccessLog("Admin đối soát tài khoản Firebase (chỉ báo cáo)", {
        severity: missingProviderAccounts.length || missingBackendAccounts.length ? "warning" : "info",
        userId: adminUser.id,
        missingProviderAccountCount: missingProviderAccounts.length,
        missingBackendAccountCount: missingBackendAccounts.length,
      });
      await saveDb();

      sendJson(res, 200, {
        mode: "report_only",
        deletedCount: 0,
        destructiveAction: false,
        providerAccountCount: firebaseUsers.length,
        backendLinkedAccountCount: backendFirebaseUids.size,
        missingProviderAccountCount: missingProviderAccounts.length,
        missingBackendAccountCount: missingBackendAccounts.length,
        missingProviderAccounts: missingProviderAccounts.slice(0, 200),
        missingBackendAccounts: missingBackendAccounts.slice(0, 200),
        resultsTruncated: missingProviderAccounts.length > 200 || missingBackendAccounts.length > 200,
      });
    } catch (err) {
      if (err?.statusCode) throw err;
      throw httpError(
        502,
        "Không thể đối soát tài khoản với Firebase Admin",
        "IDENTITY_PROVIDER_RECONCILIATION_FAILED",
        { providerCode: readString(err?.code || "", 120) },
      );
    }
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

    const roleChanged = nextRole.role !== currentRole.role || nextOrganizationId !== currentOrganizationId;
    const hasAccountStatusMutation = Object.prototype.hasOwnProperty.call(payload, "accountStatus");
    if (roleChanged) {
      assertManagedAdminAssignableRole({
        currentRole: currentRole.role,
        targetRole: nextRole.role,
        operation: "transition",
      });
    }
    if (roleChanged && hasAccountStatusMutation) {
      throw httpError(
        400,
        "Hãy thay đổi vai trò/workspace và trạng thái tài khoản bằng hai yêu cầu riêng biệt",
        "IDENTITY_MUTATIONS_MUST_BE_SEPARATE",
      );
    }

    let roleSaga = null;
    let roleTransition = null;
    if (roleChanged) {
      if (targetUser.id === adminUser.id) {
        throw httpError(400, "Không thể tự thay đổi vai trò/workspace của tài khoản đang đăng nhập");
      }
      roleTransition = prepareManagedAdminRoleTransition(targetUser, nextRole, nextOrganizationId);
      const targetState = {
        ...roleTransition.targetState,
        roleRequestStatus: "approved",
        hospital: roleTransition.organization?.name || targetUser.hospital || "Smart Health",
      };
      roleSaga = await runIdentityProviderSaga(
        req,
        adminUser,
        targetUser,
        "change_role",
        { role: targetState.role, organizationId: targetState.organizationId },
        async () => {
          const result = await setFirebaseRoleClaimsForUser(
            targetUser,
            roleTransition.roleInfo.claimRole,
            targetState.organizationId,
          );
          return { ...result, skipped: !targetUser.firebaseUid, firebaseClaims: result.claims };
        },
        {
          targetState,
          protectLastPlatformAdmin:
            isPlatformAdminUser(targetUser) && targetState.role !== "admin",
        },
      );
      Object.assign(targetUser, roleSaga.completed.user || targetState);
      targetUser.roleRequestStatus = "approved";
      targetUser.hospital = targetState.hospital;
      targetUser.title = targetUser.title || roleTransition.roleInfo.title;
      if (roleSaga.providerResult.firebaseClaims) {
        targetUser.firebaseClaims = roleSaga.providerResult.firebaseClaims;
      }
    }

    let accountStatusSaga = null;
    if (hasAccountStatusMutation) {
      const nextStatus = readString(payload.accountStatus, 40) || "active";
      if (!["active", "locked"].includes(nextStatus)) {
        throw httpError(400, "Trạng thái tài khoản admin không hợp lệ");
      }
      if (nextStatus === "locked") {
        assertAdminAccountCanBeLockedOrDeleted(adminUser, targetUser, "khóa");
      }
      accountStatusSaga = await runIdentityProviderSaga(
        req,
        adminUser,
        targetUser,
        nextStatus === "locked" ? "lock" : "unlock",
        { accountStatus: nextStatus },
        () => updateFirebaseLinkedAccount(targetUser, {
          disabled: nextStatus === "locked",
          revokeRefreshTokens: nextStatus === "locked",
        }),
      );
      Object.assign(targetUser, accountStatusSaga.completed.user || { accountStatus: nextStatus });
    }

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
    sendJson(res, 200, {
      user: publicManagedAdminAccount(targetUser),
      operationId: roleSaga?.completed.identityOperation.id || accountStatusSaga?.completed.identityOperation.id,
      replayed: roleSaga?.replayed || accountStatusSaga?.replayed || false,
    });
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
    const passwordProvider = FIREBASE_AUTH_ENABLED ? "firebase" : "demo";
    const saga = await runIdentityProviderSaga(
      req,
      adminUser,
      targetUser,
      "reset_password",
      { password: nextPassword },
      async () => {
        if (!FIREBASE_AUTH_ENABLED) {
          assertDemoAuthAllowed();
          await repositories.users.updatePasswordExact(
            targetUser.id,
            nextPassword,
          );
          return { updated: true, skipped: true };
        }
        if (!targetUser.firebaseUid) {
          const error = httpError(400, "Tài khoản này chưa liên kết Firebase Auth nên không thể đặt lại mật khẩu");
          error.code = "IDENTITY_NOT_LINKED";
          throw error;
        }
        const firebaseAdminApp = getFirebaseAdmin(process.env);
        if (!firebaseAdminApp) {
          const error = httpError(503, "Firebase Admin chưa sẵn sàng");
          error.code = "IDENTITY_PROVIDER_UNAVAILABLE";
          throw error;
        }
        await firebaseAdminApp.auth().updateUser(targetUser.firebaseUid, { password: nextPassword, disabled: false });
        return { updated: true, firebaseDisabled: false, firebaseTokensRevoked: true };
      },
      {
        targetState: { provider: passwordProvider },
      },
    );
    Object.assign(targetUser, saga.completed.user || { accountStatus: "active" });
    createNotification("warning", "Mật khẩu admin đã được đặt lại", `Tài khoản ${targetUser.email} vừa được cấp mật khẩu mới.`, {
      userId: adminUser.id,
      organizationId: targetUser.organizationId || "",
      targetUserId: targetUser.id,
    });
    sendJson(res, 200, {
      ok: true,
      user: publicManagedAdminAccount(targetUser),
      operationId: saga.completed.identityOperation.id,
      replayed: saga.replayed,
    });
    return;
  }

  if (segments[2] === "admin-users" && segments.length === 5 && ["lock", "unlock"].includes(segments[4]) && method === "POST") {
    requireAnyCapability(adminUser, ["platform.users.manage"], "Chỉ platform admin mới được khóa/mở khóa admin");
    const targetUser = await findManagedAdminAccount(decodeURIComponent(segments[3]));
    const action = segments[4];
    if (action === "lock") {
      assertAdminAccountCanBeLockedOrDeleted(adminUser, targetUser, "khóa");
    }
    const saga = await runIdentityProviderSaga(
      req,
      adminUser,
      targetUser,
      action,
      { accountStatus: action === "lock" ? "locked" : "active" },
      () => updateFirebaseLinkedAccount(targetUser, {
        disabled: action === "lock",
        revokeRefreshTokens: action === "lock",
      }),
    );
    Object.assign(targetUser, saga.completed.user || {
      accountStatus: action === "lock" ? "locked" : "active",
    });
    sendJson(res, 200, {
      user: publicManagedAdminAccount(targetUser),
      operationId: saga.completed.identityOperation.id,
      replayed: saga.replayed,
    });
    return;
  }

  if (segments[2] === "admin-users" && segments.length === 4 && method === "DELETE") {
    requireAnyCapability(adminUser, ["platform.users.manage"], "Chỉ platform admin mới được xóa tài khoản admin");
    const targetUser = await findManagedAdminAccount(decodeURIComponent(segments[3]));
    assertAdminAccountCanBeLockedOrDeleted(adminUser, targetUser, "xóa");
    const saga = await runIdentityProviderSaga(
      req,
      adminUser,
      targetUser,
      "delete",
      { targetUserId: targetUser.id },
      () => deleteFirebaseLinkedAccount(targetUser),
    );
    const firebaseDeleted = saga.providerResult.firebaseDeleted === true;
    const firebaseAlreadyMissing = saga.providerResult.firebaseAlreadyMissing === true;
    sendJson(res, 200, {
      deleted: saga.completed.deleted === true,
      userId: targetUser.id,
      firebaseUid: targetUser.firebaseUid || "",
      firebaseDeleted,
      firebaseAlreadyMissing,
      operationId: saga.completed.identityOperation.id,
      replayed: saga.replayed,
    });
    return;
  }

  if (segments[2] === "clinics" || segments[2] === "workspaces") {
    if (segments.length === 3 && method === "GET") {
      requireAnyCapability(adminUser, WORKSPACE_VIEW_CAPABILITIES, "Không có quyền xem workspace");
      const currentWorkspaceId = getUserWorkspaceContext(adminUser).currentWorkspaceId;
      const pageResult = await requireWorkspaceLifecycleRepository().list({
        organizationId: isPlatformAdminUser(adminUser) ? "" : currentWorkspaceId,
        q: readString(url.searchParams.get("q"), 160),
        status: readString(url.searchParams.get("status"), 40),
        workspaceType: readString(url.searchParams.get("workspaceType"), 80),
        page: url.searchParams.get("page"),
        limit: url.searchParams.get("limit"),
        sort: readString(url.searchParams.get("sort"), 80),
      });
      setWorkspacePaginationHeaders(res, pageResult);
      const clinics = pageResult.items.map(publicWorkspace);
      sendJson(res, 200, { clinics, workspaces: clinics });
      return;
    }

    if (segments.length === 3 && method === "POST") {
      requireAnyCapability(adminUser, ["platform.workspaces.manage"], "Chỉ platform admin mới được tạo workspace");
      const payload = await readJsonBody(req);
      const idempotencyKey = readString(req.headers["idempotency-key"], 160);
      if (!idempotencyKey) {
        throw httpError(400, "Idempotency-Key is required for workspace creation", "IDEMPOTENCY_KEY_REQUIRED");
      }
      const workspaceId = readString(payload.id, 120) || createId("org");
      const requestContext = getRequestContext(req) || createRequestContext(req);
      const result = await requireWorkspaceLifecycleRepository().create({
        workspaceId,
        payload,
        idempotency: {
          scope: getIdempotencyScope(adminUser),
          operation: "workspace.create",
          key: idempotencyKey,
          fingerprint: createIdempotencyFingerprint({ workspaceId, payload }),
        },
        audit: {
          action: "workspace.create",
          actorUserId: adminUser.id,
          organizationId: workspaceId,
          resourceType: "organization",
          resourceId: workspaceId,
          ip: requestContext.ip || "",
          userAgent: requestContext.userAgent || readString(req.headers["user-agent"], 240),
        },
      });
      if (result.replayed) res.setHeader("Idempotency-Replayed", "true");
      const workspace = publicWorkspace(result.responseBody.workspace);
      sendJson(res, result.responseStatus, { ...result.responseBody, workspace, clinic: workspace });
      return;
    }

    if (segments.length === 5 && segments[4] === "owner-approval" && method === "POST") {
      requireAnyCapability(
        adminUser,
        ["platform.workspaces.manage"],
        "Chỉ platform admin mới được xác nhận chủ workspace",
      );
      const workspaceId = decodeURIComponent(segments[3]);
      const payload = await readJsonBody(req);
      const expectedVersion = Number(getWorkspaceExpectedVersion(req, payload, url));
      if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
        throw httpError(
          400,
          "A positive integer workspace version is required",
          "WORKSPACE_VERSION_REQUIRED",
        );
      }
      const workspace = await requireWorkspaceLifecycleRepository().findById(workspaceId);
      if (!workspace) {
        throw httpError(404, "Không tìm thấy workspace", "WORKSPACE_NOT_FOUND");
      }
      if (Number(workspace.version || 1) !== expectedVersion) {
        throw httpError(
          409,
          "Workspace was changed by another operation",
          "WORKSPACE_VERSION_CONFLICT",
          { expectedVersion, currentVersion: Number(workspace.version || 1) },
        );
      }
      if (workspace.status !== "pending") {
        throw httpError(
          409,
          "Workspace owner can only be approved while the workspace is pending",
          "WORKSPACE_OWNER_APPROVAL_STATUS_INVALID",
          { currentStatus: workspace.status, requiredStatus: "pending" },
        );
      }
      const approval = await approveWorkspaceOwnerIdentity(req, adminUser, workspace, payload);
      if (approval.replayed) res.setHeader("Idempotency-Replayed", "true");
      const canonicalWorkspace = publicWorkspace(approval.workspace);
      sendJson(res, 200, {
        ...approval,
        workspace: canonicalWorkspace,
        clinic: canonicalWorkspace,
      });
      return;
    }

    if (segments.length === 5 && segments[4] === "package" && method === "POST") {
      requireAnyCapability(adminUser, PACKAGE_MANAGE_CAPABILITIES, "Không có quyền gán gói dịch vụ");
      throw httpError(
        410,
        "Legacy package assignment is retired; update package fields through the versioned workspace PATCH contract",
        "WORKSPACE_PACKAGE_ROUTE_RETIRED",
      );
    }

    if (segments.length === 4 && method === "DELETE") {
      requireAnyCapability(adminUser, ["platform.workspaces.manage"], "Chỉ platform admin mới được xóa workspace");
      const workspaceId = decodeURIComponent(segments[3]);
      const idempotencyKey = readString(req.headers["idempotency-key"], 160);
      if (!idempotencyKey) {
        throw httpError(400, "Idempotency-Key is required for workspace archival", "IDEMPOTENCY_KEY_REQUIRED");
      }
      let payload = {};
      const contentLength = Number(req.headers["content-length"] || 0);
      if (contentLength > 0 || String(req.headers["transfer-encoding"] || "").toLowerCase() === "chunked") {
        payload = await readJsonBody(req);
      }
      const expectedVersion = getWorkspaceExpectedVersion(req, payload, url);
      const requestContext = getRequestContext(req) || createRequestContext(req);
      const result = await requireWorkspaceLifecycleRepository().archive({
        workspaceId,
        expectedVersion,
        idempotency: {
          scope: getIdempotencyScope(adminUser, workspaceId),
          operation: "workspace.archive",
          key: idempotencyKey,
          fingerprint: createIdempotencyFingerprint({ workspaceId, expectedVersion }),
        },
        audit: {
          action: "workspace.archive",
          actorUserId: adminUser.id,
          organizationId: workspaceId,
          resourceType: "organization",
          resourceId: workspaceId,
          ip: requestContext.ip || "",
          userAgent: requestContext.userAgent || readString(req.headers["user-agent"], 240),
        },
      });
      if (result.replayed) res.setHeader("Idempotency-Replayed", "true");
      sendJson(res, result.responseStatus, { ...result.responseBody, clinicId: workspaceId });
      return;
    }

    if (segments.length === 4 && method === "PATCH") {
      const clinicId = decodeURIComponent(segments[3]);
      const storedClinic = getClinicById(clinicId);
      requireAnyCapability(adminUser, WORKSPACE_MANAGE_CAPABILITIES, "Không có quyền cập nhật workspace");
      if (!isPlatformAdminUser(adminUser) && clinicId !== getUserWorkspaceContext(adminUser).currentWorkspaceId) {
        throw httpError(403, "Workspace nam ngoai pham vi hien tai");
      }
      if (!storedClinic) {
        throw httpError(404, "Không tìm thấy phòng khám");
      }
      const clinic = { ...storedClinic };

      const payload = await readJsonBody(req);
      if (!isPlatformAdminUser(adminUser)) {
        for (const restrictedField of ["type", "workspaceType", "status", "ownerUserId", "packageId", "subscriptionStatus", "billingCycle"]) {
          if (Object.prototype.hasOwnProperty.call(payload, restrictedField)) {
            throw httpError(403, "Workspace Portal không được sửa gói, billing hoặc loại workspace");
          }
        }
      }
      if (Object.prototype.hasOwnProperty.call(payload, "ownerUserId")) {
        if (!isPlatformAdminUser(adminUser)) {
          throw httpError(403, "Chỉ platform admin mới được chuyển chủ workspace");
        }
        const nextOwnerUserId = readString(payload.ownerUserId, 120);
        if (!nextOwnerUserId) {
          throw httpError(400, "Chủ workspace mới là bắt buộc", "WORKSPACE_OWNER_REQUIRED");
        }
        const combinedFields = Object.keys(payload).filter(
          (field) => !["ownerUserId", "idempotencyKey", "version", "expectedVersion"].includes(field),
        );
        if (combinedFields.length > 0) {
          throw httpError(
            400,
            "Hãy chuyển chủ workspace bằng một yêu cầu riêng",
            "WORKSPACE_OWNER_TRANSFER_MUST_BE_SEPARATE",
            { combinedFields },
          );
        }
        const idempotencyKey = getIdempotencyKey(req, payload);
        if (!idempotencyKey) {
          throw httpError(400, "Idempotency-Key là bắt buộc khi chuyển chủ workspace", "IDEMPOTENCY_KEY_REQUIRED");
        }
        if (
          !repositories?.organizations?.beginOwnerTransfer ||
          !repositories?.organizations?.completeOwnerTransfer
        ) {
          throw httpError(503, "Kho dữ liệu chuyển chủ workspace chưa sẵn sàng", "WORKSPACE_OWNER_TRANSFER_UNAVAILABLE");
        }
        if (nextOwnerUserId === adminUser.id) {
          throw httpError(
            400,
            "Không thể tự chuyển tài khoản platform admin hiện tại thành chủ workspace",
            "WORKSPACE_OWNER_SELF_TRANSFER_NOT_ALLOWED",
          );
        }
        const expectedVersion = Number(getWorkspaceExpectedVersion(req, payload, url));
        if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
          throw httpError(
            400,
            "A positive integer workspace version is required for owner transfer",
            "WORKSPACE_VERSION_REQUIRED",
          );
        }
        const requestContext = getRequestContext(req) || createRequestContext(req);
        const idempotency = {
          scope: getIdempotencyScope(adminUser, clinicId),
          operation: "workspace.owner.transfer",
          key: idempotencyKey,
          fingerprint: createIdempotencyFingerprint({
            organizationId: clinicId,
            newOwnerUserId: nextOwnerUserId,
            expectedVersion,
          }),
        };
        const reservation = await repositories.organizations.beginOwnerTransfer({
          organizationId: clinicId,
          newOwnerUserId: nextOwnerUserId,
          actorUserId: adminUser.id,
          expectedVersion,
          idempotency,
          ip: requestContext.ip || req.socket.remoteAddress || "",
          userAgent: requestContext.userAgent || readString(req.headers["user-agent"], 240),
        });

        let transfer = reservation;
        let ownerIdentitySaga = null;
        if (reservation.state !== "completed") {
          const replacementOwner = reservation.replacementOwner;
          if (!replacementOwner) {
            throw httpError(404, "Không tìm thấy tài khoản chủ workspace mới", "WORKSPACE_OWNER_NOT_FOUND");
          }
          if (reservation.requiresIdentityTransition) {
            const targetState = {
              role: "workspace_owner",
              requestedRole: "workspace_owner",
              roleRequestStatus: "approved",
              organizationId: clinicId,
              accountStatus: "active",
              hospital: reservation.organization?.name || replacementOwner.hospital || "Shcare",
            };
            ownerIdentitySaga = await runIdentityProviderSaga(
              req,
              adminUser,
              replacementOwner,
              "change_role",
              { role: "workspace_owner", organizationId: clinicId },
              async () => {
                const providerResult = await setFirebaseRoleClaimsForUser(
                  replacementOwner,
                  "workspace_owner",
                  clinicId,
                );
                return {
                  ...providerResult,
                  skipped: !replacementOwner.firebaseUid,
                  firebaseClaims: providerResult.claims,
                };
              },
              {
                targetState,
                protectLastPlatformAdmin: isPlatformAdminUser(replacementOwner),
                deferBackendFinalization: true,
              },
            );
          }
          transfer = await repositories.organizations.completeOwnerTransfer({
            organizationId: clinicId,
            newOwnerUserId: nextOwnerUserId,
            actorUserId: adminUser.id,
            identityOperationId: ownerIdentitySaga?.completed.identityOperation.id || reservation.identityOperationId || "",
            expectedVersion,
            idempotency,
            ip: requestContext.ip || req.socket.remoteAddress || "",
            userAgent: requestContext.userAgent || readString(req.headers["user-agent"], 240),
          });
        }
        Object.assign(clinic, transfer.organization || { ownerUserId: nextOwnerUserId });
        if (!transfer.replayed) {
          addAccessLog("Chuyển chủ workspace", {
            severity: "warning",
            userId: adminUser.id,
            workspaceId: clinicId,
            previousOwnerUserId: transfer.previousOwnerUserId || "",
            newOwnerUserId: nextOwnerUserId,
          });
          await saveDb();
        }
        sendJson(res, 200, {
          clinic: publicWorkspace(clinic),
          workspace: publicWorkspace(clinic),
          ownerTransfer: {
            previousOwnerUserId: transfer.previousOwnerUserId || "",
            newOwnerUserId: nextOwnerUserId,
            membership: transfer.membership || null,
          },
          operationId:
            transfer.operationId ||
            reservation.operationId ||
            transfer.identityOperationId ||
            ownerIdentitySaga?.completed.identityOperation.id ||
            "",
          replayed: transfer.replayed === true || reservation.state === "completed",
        });
        return;
      }
      const idempotencyKey = getIdempotencyKey(req, payload);
      if (!idempotencyKey) {
        throw httpError(400, "Idempotency-Key is required for workspace mutations", "IDEMPOTENCY_KEY_REQUIRED");
      }
      const expectedVersion = getWorkspaceExpectedVersion(req, payload, url);
      const hasStatusTransition = Object.prototype.hasOwnProperty.call(payload, "status");
      if (hasStatusTransition) {
        const combinedFields = Object.keys(payload).filter(
          (field) => ![
            "status",
            "version",
            "expectedVersion",
            "idempotencyKey",
            "reason",
            "rejectReason",
            "message",
            "requestInfoMessage",
            "requiredFields",
          ].includes(field),
        );
        if (combinedFields.length > 0) {
          throw httpError(
            400,
            "Hãy chuyển trạng thái workspace bằng một yêu cầu riêng",
            "WORKSPACE_TRANSITION_MUST_BE_SEPARATE",
            { combinedFields },
          );
        }
      }

      const requestContext = getRequestContext(req) || createRequestContext(req);
      const nextStatus = readString(payload.status, 40).toLowerCase();
      const operation = hasStatusTransition ? "workspace.transition" : "workspace.update";
      const idempotency = {
        scope: getIdempotencyScope(adminUser, clinicId),
        operation,
        key: idempotencyKey,
        fingerprint: createIdempotencyFingerprint({ clinicId, expectedVersion, payload }),
      };
      const audit = {
        action: operation,
        actorUserId: adminUser.id,
        organizationId: clinicId,
        resourceType: "organization",
        resourceId: clinicId,
        ip: requestContext.ip || "",
        userAgent: requestContext.userAgent || readString(req.headers["user-agent"], 240),
        metadata: {},
      };
      const result = hasStatusTransition
        ? await requireWorkspaceLifecycleRepository().transition({
            workspaceId: clinicId,
            expectedVersion,
            nextStatus,
            reason: readString(payload.reason || payload.rejectReason, 1000),
            message: readString(payload.message || payload.requestInfoMessage || payload.reason, 1000),
            requiredFields: normalizeRoleInfoFields(payload.requiredFields),
            idempotency,
            audit,
          })
        : await requireWorkspaceLifecycleRepository().update({
            workspaceId: clinicId,
            expectedVersion,
            payload,
            idempotency,
            audit,
          });
      if (result.replayed) res.setHeader("Idempotency-Replayed", "true");
      const workspace = publicWorkspace(result.responseBody.workspace);
      sendJson(res, result.responseStatus, {
        ...result.responseBody,
        workspace,
        clinic: workspace,
      });
      return;
    }
  }

  if (segments[2] === "packages") {
    if (!isPlatformAdminUser(adminUser)) {
      throw httpError(
        403,
        "Only Platform Admin can manage the service package catalog",
        "PACKAGE_PLATFORM_ADMIN_REQUIRED",
      );
    }
    if (!repositories?.servicePackages) {
      throw httpError(
        503,
        "The canonical service package repository is unavailable",
        "PACKAGE_REPOSITORY_UNAVAILABLE",
      );
    }

    if (segments.length === 3 && method === "GET") {
      requireAnyCapability(adminUser, ["platform.packages.manage"], "Không có quyền xem gói dịch vụ hệ thống");
      const allPackages = await repositories.servicePackages.list();
      const packageSummary = allPackages.reduce(
        (summary, item) => {
          summary.total += 1;
          if (item.status === "archived") summary.archived += 1;
          else summary.active += 1;
          return summary;
        },
        { total: 0, active: 0, archived: 0 },
      );
      const assignedByPackage = db.organizations.reduce((counts, workspace) => {
        const packageId = readString(workspace.packageId, 120);
        if (packageId && !workspace.deletedAt) counts[packageId] = (counts[packageId] || 0) + 1;
        return counts;
      }, {});
      packageSummary.assignedByPackage = assignedByPackage;
      packageSummary.assignedWorkspaceCount = Object.values(assignedByPackage).reduce(
        (total, count) => total + Number(count || 0),
        0,
      );
      const packageStatus = readString(url.searchParams.get("status"), 40).toLowerCase();
      const packageSource = allPackages.filter(
        (item) => !packageStatus || packageStatus === "all" ||
          (packageStatus === "active" ? item.status !== "archived" : item.status === packageStatus),
      );
      const pageResult = resolveAdminListPage(packageSource, url, {
        searchFields: [
          (item) => item.id,
          (item) => item.name,
          (item) => item.type,
          (item) => item.segment,
        ],
        sortFields: {
          name: (item) => item.name,
          createdAt: (item) => item.createdAt,
          updatedAt: (item) => item.updatedAt,
          status: (item) => item.status,
        },
        defaultSort: "updatedAt:desc",
      });
      setWorkspacePaginationHeaders(res, pageResult);
      sendJson(res, 200, { packages: pageResult.items, summary: packageSummary });
      return;
    }

    if (segments.length === 3 && method === "POST") {
      requireAnyCapability(adminUser, PACKAGE_MANAGE_CAPABILITIES, "Không có quyền tạo gói dịch vụ");
      const payload = await readJsonBody(req);
      const idempotencyKey = readString(req.headers["idempotency-key"], 160);
      if (!idempotencyKey) {
        throw httpError(400, "Idempotency-Key is required for package creation", "IDEMPOTENCY_KEY_REQUIRED");
      }
      const requestContext = getRequestContext(req) || createRequestContext(req);
      const result = await repositories.servicePackages.create({
        packageId: Object.prototype.hasOwnProperty.call(payload, "id") ? payload.id : createId("pkg"),
        payload,
        idempotency: {
          scope: getIdempotencyScope(adminUser),
          operation: "package.create",
          key: idempotencyKey,
          fingerprint: createIdempotencyFingerprint(payload),
        },
        audit: {
          action: "package.create",
          actorUserId: adminUser.id,
          ip: requestContext.ip || "",
          userAgent: requestContext.userAgent || readString(req.headers["user-agent"], 240),
          metadata: { fields: Object.keys(payload).sort() },
        },
      });
      sendJson(res, result.responseStatus, {
        ...result.responseBody,
        ...(result.replayed ? { idempotent: true } : {}),
      });
      return;
    }

    if (segments.length === 4 && method === "PATCH") {
      requireAnyCapability(adminUser, PACKAGE_MANAGE_CAPABILITIES, "Không có quyền sửa gói dịch vụ");
      const packageId = decodeURIComponent(segments[3]);
      const payload = await readJsonBody(req);
      const idempotencyKey = readString(req.headers["idempotency-key"], 160);
      if (!idempotencyKey) {
        throw httpError(400, "Idempotency-Key is required for package updates", "IDEMPOTENCY_KEY_REQUIRED");
      }
      const requestContext = getRequestContext(req) || createRequestContext(req);
      const result = await repositories.servicePackages.update({
        packageId,
        payload,
        idempotency: {
          scope: getIdempotencyScope(adminUser),
          operation: "package.update",
          key: idempotencyKey,
          fingerprint: createIdempotencyFingerprint({ packageId, payload }),
        },
        audit: {
          action: "package.update",
          actorUserId: adminUser.id,
          ip: requestContext.ip || "",
          userAgent: requestContext.userAgent || readString(req.headers["user-agent"], 240),
          metadata: { fields: Object.keys(payload).sort() },
        },
      });
      sendJson(res, result.responseStatus, {
        ...result.responseBody,
        ...(result.replayed ? { idempotent: true } : {}),
      });
      return;
    }

    if (segments.length === 4 && method === "DELETE") {
      requireAnyCapability(adminUser, PACKAGE_MANAGE_CAPABILITIES, "Không có quyền xóa gói dịch vụ");
      const packageId = decodeURIComponent(segments[3]);
      const idempotencyKey = readString(req.headers["idempotency-key"], 160);
      if (!idempotencyKey) {
        throw httpError(400, "Idempotency-Key is required for package archival", "IDEMPOTENCY_KEY_REQUIRED");
      }
      const requestContext = getRequestContext(req) || createRequestContext(req);
      const result = await repositories.servicePackages.archive({
        packageId,
        idempotency: {
          scope: getIdempotencyScope(adminUser),
          operation: "package.archive",
          key: idempotencyKey,
          fingerprint: createIdempotencyFingerprint({ packageId }),
        },
        audit: {
          action: "package.archive",
          actorUserId: adminUser.id,
          ip: requestContext.ip || "",
          userAgent: requestContext.userAgent || readString(req.headers["user-agent"], 240),
          metadata: { lifecycle: "archive" },
        },
      });
      sendJson(res, result.responseStatus, {
        ...result.responseBody,
        ...(result.replayed ? { idempotent: true } : {}),
      });
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
    let targetUser = repositories
      ? await repositories.users.findByIdOrFirebaseUid(targetUserId)
      : db.users.find((user) => user.id === targetUserId || user.firebaseUid === targetUserId);
    if (!targetUser) {
      throw httpError(404, "Doctor request not found");
    }

    if (segments[4] === "approve" && method === "POST") {
      const payload = await readJsonBody(req);
      const persistedTargetOrganizationId = readString(
        targetUser.roleRequestOrganizationId || targetUser.organizationId,
        120,
      );
      const requestedApprovalOrganizationId = readString(
        payload.organizationId,
        120,
      );
      if (!persistedTargetOrganizationId) {
        throw httpError(
          409,
          "The doctor request does not have a persisted target workspace",
          "DOCTOR_REQUEST_TARGET_REQUIRED",
        );
      }
      if (
        requestedApprovalOrganizationId &&
        requestedApprovalOrganizationId !== persistedTargetOrganizationId
      ) {
        throw httpError(
          409,
          "The approval workspace must match the persisted doctor-request target",
          "DOCTOR_REQUEST_TARGET_MISMATCH",
        );
      }
      const organizationId = persistedTargetOrganizationId;
      const organization = getClinicById(organizationId);
      if (!organization) {
        throw httpError(404, "Không tìm thấy workspace để cấp quyền bác sĩ", "WORKSPACE_NOT_FOUND");
      }
      if (String(organization.status || "active") !== "active") {
        throw httpError(409, "Workspace phải hoạt động trước khi cấp quyền bác sĩ", "WORKSPACE_NOT_ACTIVE");
      }
      if (targetUser.requestedRole !== "doctor") {
        throw httpError(409, "Tài khoản chưa gửi yêu cầu cấp quyền bác sĩ", "DOCTOR_REQUEST_NOT_PENDING");
      }
      const currentRequestStatus = String(targetUser.roleRequestStatus || "pending");
      const alreadyApproved = currentRequestStatus === "approved" && targetUser.role === "doctor";
      if (!alreadyApproved && currentRequestStatus !== "pending") {
        throw httpError(
          409,
          "Yêu cầu phải ở trạng thái chờ duyệt; hồ sơ cần bổ sung phải được gửi lại trước",
          "DOCTOR_REQUEST_NOT_PENDING",
          { currentStatus: currentRequestStatus },
        );
      }

      const targetState = {
        role: "doctor",
        requestedRole: "doctor",
        roleRequestStatus: "approved",
        organizationId,
        accountStatus: "active",
        hospital: organization.name || targetUser.hospital || "Shcare",
        workspaceType: readString(organization.workspaceType || organization.type, 40),
        // A solo-doctor approval preserves the account owner's workspace
        // capability while granting the doctor operational role. Shared
        // clinic doctors keep the ordinary doctor membership role.
        membershipRole:
          "doctor",
        roleRequestApproval:
          String(organization.ownerUserId || "") === String(targetUser.id || "") &&
          String(organization.workspaceType || organization.type || "").toLowerCase() === "solo_practice",
      };
      const approvalSaga = await runIdentityProviderSaga(
        req,
        adminUser,
        targetUser,
        "change_role",
        { role: "doctor", organizationId },
        async () => {
          const providerResult = await setFirebaseRoleClaimsForUser(targetUser, "doctor", organizationId);
          return {
            ...providerResult,
            skipped: !targetUser.firebaseUid,
            firebaseClaims: providerResult.claims,
          };
        },
        { targetState },
      );
      targetUser = approvalSaga.completed.user || { ...targetUser, ...targetState };
      targetUser.roleApprovedAt = targetUser.roleApprovedAt || nowIso();
      targetUser.roleRejectedAt = "";
      targetUser.roleRejectReason = "";
      targetUser.roleInfoRequestAt = "";
      targetUser.roleInfoRequestMessage = "";
      targetUser.roleInfoRequiredFields = [];
      targetUser.firebaseClaims = approvalSaga.providerResult.firebaseClaims || targetUser.firebaseClaims || {};
      targetUser.updatedAt = nowIso();

      if (repositories && typeof repositories.users.updateDoctorRequestState === "function") {
        const persistedUser = await repositories.users.updateDoctorRequestState(targetUser.id, {
          role: targetUser.role,
          roleRequestStatus: targetUser.roleRequestStatus,
          accountStatus: targetUser.accountStatus,
          roleRequestedAt: targetUser.roleRequestedAt,
          roleApprovedAt: targetUser.roleApprovedAt,
          roleRejectedAt: targetUser.roleRejectedAt,
          roleRejectReason: targetUser.roleRejectReason,
          roleInfoRequestAt: targetUser.roleInfoRequestAt,
          roleInfoRequestMessage: targetUser.roleInfoRequestMessage,
          roleInfoRequiredFields: targetUser.roleInfoRequiredFields,
          organizationId: targetUser.organizationId,
          firebaseClaims: targetUser.firebaseClaims || {},
        });
        if (!persistedUser || persistedUser.roleRequestStatus !== "approved" || persistedUser.role !== "doctor") {
          throw httpError(500, "Không thể lưu trạng thái phê duyệt bác sĩ vào cơ sở dữ liệu.");
        }
        targetUser = persistedUser;
      } else if (repositories) {
        await repositories.users.save(targetUser);
      }
      ensureMembershipForUser(targetUser);
      if (repositories?.memberships?.ensureForUser) {
        await repositories.memberships.ensureForUser(targetUser);
      }
      if (!approvalSaga.replayed) {
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
          metadata: {
            firebaseUid: targetUser.firebaseUid || "",
            firebaseClaims: approvalSaga.providerResult.firebaseClaims || {},
            operationId: approvalSaga.completed.identityOperation.id,
          },
        });
      }
      await saveDb();

      sendJson(res, 200, {
        request: publicDoctorRoleRequest(targetUser),
        firebaseClaims: approvalSaga.providerResult.firebaseClaims || {},
        operationId: approvalSaga.completed.identityOperation.id,
        replayed: approvalSaga.replayed,
      });
      return;
    }

    if (segments[4] === "reject" && method === "POST") {
      const payload = await readJsonBody(req);
      const reason = readString(payload.reason, 1000);
      if (!reason) {
        throw httpError(400, "Reject reason is required");
      }
      if (
        targetUser.requestedRole !== "doctor" ||
        targetUser.role === "doctor" ||
        !["pending", "needs_info"].includes(String(targetUser.roleRequestStatus || "pending"))
      ) {
        throw httpError(
          409,
          "Chỉ có thể từ chối hồ sơ bác sĩ đang chờ xử lý; hãy dùng luồng đổi vai trò để thu hồi quyền đã cấp",
          "DOCTOR_REQUEST_NOT_REJECTABLE",
          { currentStatus: targetUser.roleRequestStatus || "", currentRole: targetUser.role || "" },
        );
      }

      targetUser.requestedRole = "doctor";
      targetUser.role = targetUser.role === "admin" ? "admin" : "patient";
      targetUser.roleRequestStatus = "rejected";
      targetUser.accountStatus = "active";
      targetUser.roleRejectedAt = nowIso();
      targetUser.roleRejectReason = reason;
      targetUser.roleApprovedAt = "";
      targetUser.roleInfoRequestAt = "";
      targetUser.roleInfoRequestMessage = "";
      targetUser.roleInfoRequiredFields = [];
      targetUser.updatedAt = nowIso();
      if (repositories && typeof repositories.users.updateDoctorRequestState === "function") {
        const persistedUser = await repositories.users.updateDoctorRequestState(targetUser.id, {
          role: targetUser.role,
          roleRequestStatus: targetUser.roleRequestStatus,
          accountStatus: targetUser.accountStatus,
          roleRequestedAt: targetUser.roleRequestedAt,
          roleApprovedAt: targetUser.roleApprovedAt,
          roleRejectedAt: targetUser.roleRejectedAt,
          roleRejectReason: targetUser.roleRejectReason,
          roleInfoRequestAt: targetUser.roleInfoRequestAt,
          roleInfoRequestMessage: targetUser.roleInfoRequestMessage,
          roleInfoRequiredFields: targetUser.roleInfoRequiredFields,
          organizationId: targetUser.organizationId,
        });
        if (!persistedUser || persistedUser.roleRequestStatus !== "rejected") {
          throw httpError(500, "Không thể lưu trạng thái từ chối bác sĩ vào cơ sở dữ liệu.");
        }
        targetUser = persistedUser;
      } else if (repositories) {
        await repositories.users.save(targetUser);
      }
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
        organizationId:
          getUserWorkspaceContext(targetUser).currentWorkspaceId || "",
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
      if (
        targetUser.requestedRole !== "doctor" ||
        targetUser.role === "doctor" ||
        !["pending", "needs_info"].includes(String(targetUser.roleRequestStatus || "pending"))
      ) {
        throw httpError(
          409,
          "Chỉ có thể yêu cầu bổ sung đối với hồ sơ bác sĩ chưa được phê duyệt",
          "DOCTOR_REQUEST_NOT_EDITABLE",
          { currentStatus: targetUser.roleRequestStatus || "", currentRole: targetUser.role || "" },
        );
      }

      targetUser.requestedRole = "doctor";
      targetUser.role = targetUser.role === "admin" ? "admin" : "patient";
      targetUser.roleRequestStatus = "needs_info";
      targetUser.accountStatus = "active";
      targetUser.roleInfoRequestAt = nowIso();
      targetUser.roleInfoRequestMessage = message;
      targetUser.roleInfoRequiredFields = requiredFields;
      targetUser.updatedAt = nowIso();
      if (repositories && typeof repositories.users.updateDoctorRequestState === "function") {
        const persistedUser = await repositories.users.updateDoctorRequestState(targetUser.id, {
          role: targetUser.role,
          roleRequestStatus: targetUser.roleRequestStatus,
          accountStatus: targetUser.accountStatus,
          roleRequestedAt: targetUser.roleRequestedAt,
          roleApprovedAt: targetUser.roleApprovedAt || "",
          roleRejectedAt: targetUser.roleRejectedAt || "",
          roleRejectReason: targetUser.roleRejectReason || "",
          roleInfoRequestAt: targetUser.roleInfoRequestAt,
          roleInfoRequestMessage: targetUser.roleInfoRequestMessage,
          roleInfoRequiredFields: targetUser.roleInfoRequiredFields,
          organizationId: targetUser.organizationId,
        });
        if (!persistedUser || persistedUser.roleRequestStatus !== "needs_info") {
          throw httpError(500, "Không thể lưu trạng thái cần bổ sung vào cơ sở dữ liệu.");
        }
        targetUser = persistedUser;
      } else if (repositories) {
        await repositories.users.save(targetUser);
      }
      addAccessLog("Doctor role request needs additional information", {
        severity: "warning",
        userId: adminUser.id,
        ip: req.socket.remoteAddress || "",
      });
      await createBackendNotification({
        type: "doctor_info_requested",
        title: "Yêu cầu bổ sung hồ sơ bác sĩ",
        message: `${targetUser.name || targetUser.email || targetUser.id}: ${message}`,
        userId: targetUser.id,
        organizationId:
          getUserWorkspaceContext(targetUser).currentWorkspaceId || "",
        metadata: {
          roleRequestStatus: targetUser.roleRequestStatus,
          requiredFields,
          requestMessage: message,
        },
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
    const currentWorkspaceId = getUserWorkspaceContext(adminUser).currentWorkspaceId;
    const users = (repositories ? await repositories.users.listApprovedDoctors() : db.users
      .filter((user) => user.requestedRole === "doctor" && user.roleRequestStatus === "approved"))
      .filter(
        (user) =>
          isPlatformAdminUser(adminUser) ||
          db.memberships.some(
            (membership) =>
              membership.userId === user.id &&
              membership.organizationId === currentWorkspaceId &&
              readString(membership.status || "active", 40).toLowerCase() !== "revoked",
          ),
      )
      .sort((a, b) => String(b.roleApprovedAt || b.updatedAt || "").localeCompare(String(a.roleApprovedAt || a.updatedAt || "")));
    const statusFilter = readString(url.searchParams.get("status"), 40).toLowerCase();
    const specialtyFilter = readString(url.searchParams.get("specialty"), 160);
    const clinicFilter = readString(url.searchParams.get("clinic"), 160);
    const doctorSource = users.filter((item) => {
      const status = item.accountStatus === "locked" ? "inactive" :
        item.accountStatus === "active" ? "active" : "unknown";
      const specialty = readString(item.department || item.specialty, 160);
      const clinic = readString(item.hospital || item.clinicName, 160);
      return (
        (!statusFilter || statusFilter === "all" || status === statusFilter) &&
        (!specialtyFilter || specialtyFilter === "all" || specialty === specialtyFilter) &&
        (!clinicFilter || clinicFilter === "all" || clinic === clinicFilter)
      );
    });
    const pageResult = resolveAdminListPage(doctorSource, url, {
      searchFields: [
        (item) => item.id,
        (item) => item.name,
        (item) => item.email,
        (item) => item.phone,
        (item) => item.specialty,
        (item) => item.organizationId,
      ],
      sortFields: {
        name: (item) => item.name,
        createdAt: (item) => item.createdAt,
        updatedAt: (item) => item.updatedAt,
        roleApprovedAt: (item) => item.roleApprovedAt,
        status: (item) => item.accountStatus,
      },
      defaultSort: "roleApprovedAt:desc",
    });
    setWorkspacePaginationHeaders(res, pageResult);
    sendJson(res, 200, {
      doctors: pageResult.items.map(publicUser),
      facets: {
        specialties: [...new Set(users.map((item) => readString(item.department || item.specialty, 160)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi")),
        clinics: [...new Set(users.map((item) => readString(item.hospital || item.clinicName, 160)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi")),
      },
    });
    return;
  }

  if (segments[2] === "doctors" && segments.length === 3 && method === "POST") {
    requireAnyCapability(adminUser, DOCTOR_MANAGE_CAPABILITIES, "Không có quyền tạo tài khoản bác sĩ");
    throw httpError(
      501,
      "Tạo bác sĩ trực tiếp đã bị khóa vì không tạo được danh tính đăng nhập an toàn; hãy dùng quy trình mời nhân sự khi được bật",
      "DOCTOR_INVITATION_REQUIRED",
      { plannedSurface: "staff-invitations" },
    );
  }

  if (segments[2] === "doctors" && segments.length === 4 && method === "DELETE") {
    requireAnyCapability(
      adminUser,
      ["platform.users.manage"],
      "Chỉ platform admin mới được xóa danh tính bác sĩ toàn hệ thống",
    );
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
    const saga = await runIdentityProviderSaga(
      req,
      adminUser,
      targetUser,
      "delete",
      { targetUserId: targetUser.id },
      () => deleteFirebaseLinkedAccount(targetUser),
    );
    const firebaseDeleted = saga.providerResult.firebaseDeleted === true;
    const firebaseAlreadyMissing = saga.providerResult.firebaseAlreadyMissing === true;
    const warning = saga.providerResult.warning || "";
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
      deleted: saga.completed.deleted === true,
      userId: targetUser.id,
      firebaseDeleted,
      firebaseAlreadyMissing,
      firebaseUid: targetUser.firebaseUid || "",
      warning,
      operationId: saga.completed.identityOperation.id,
      replayed: saga.replayed,
    });
    return;
  }

  // A platform administrator can repair the operational workspace of an
  // already-approved doctor.  This is intentionally separate from profile
  // editing and from the self-service workspace switch: changing the tenant
  // also refreshes Firebase claims and revokes stale sessions so the mobile
  // and Portal surfaces cannot loop on the previous persona.
  if (segments[2] === "doctors" && segments.length === 5 && segments[4] === "workspace" && method === "PATCH") {
    requireAnyCapability(adminUser, ["platform.users.manage"], "Chá»‰ platform admin má»›i Ä‘Æ°á»£c chuyá»ƒn workspace cho bĂ¡c sÄ©");
    const targetUserId = decodeURIComponent(segments[3]);
    const targetUser = repositories
      ? await repositories.users.findByIdOrFirebaseUid(targetUserId)
      : db.users.find((candidate) => candidate.id === targetUserId || candidate.firebaseUid === targetUserId);
    if (!targetUser || (targetUser.role !== "doctor" && targetUser.requestedRole !== "doctor")) {
      throw httpError(404, "KhĂ´ng tĂ¬m tháº¥y há»“ sÆ¡ bĂ¡c sÄ©", "DOCTOR_NOT_FOUND");
    }
    if (targetUser.role !== "doctor" || targetUser.roleRequestStatus !== "approved") {
      throw httpError(409, "Chá»‰ bĂ¡c sÄ© Ä‘Ă£ Ä‘Æ°á»£c phĂª duyá»‡t má»›i cĂ³ thá»ƒ gĂ¡n workspace", "APPROVED_DOCTOR_REQUIRED");
    }
    const payload = await readJsonBody(req);
    const organizationId = readString(payload.organizationId || payload.workspaceId, 120);
    if (!organizationId) {
      throw httpError(400, "Cáº§n organizationId/workspaceId Ä‘á»ƒ gĂ¡n workspace", "DOCTOR_WORKSPACE_REQUIRED");
    }
    const organization = getClinicById(organizationId);
    if (!organization) throw httpError(404, "KhĂ´ng tĂ¬m tháº¥y workspace Ä‘Ă­ch", "WORKSPACE_NOT_FOUND");
    if (["archived", "suspended", "inactive"].includes(readString(organization.status, 40).toLowerCase())) {
      throw httpError(409, "Workspace Ä‘Ă­ch Ä‘ang táº¡m ngÆ°ng hoáº·c Ä‘Ă£ lÆ°u trá»¯", "WORKSPACE_NOT_ACTIVE");
    }
    const idempotencyKey = getRequiredHeaderIdempotencyKey(req, "doctor workspace assignment");
    const previousOrganizationId = readString(targetUser.organizationId, 120);
    const targetState = {
      role: "doctor",
      requestedRole: "doctor",
      roleRequestStatus: "approved",
      organizationId,
      hospital: organization.name || targetUser.hospital || "Smart Health",
      accountStatus: targetUser.accountStatus || "active",
    };
    const saga = await runIdentityProviderSaga(
      req,
      adminUser,
      targetUser,
      "doctor_workspace_assign",
      { organizationId },
      async () => {
        if (!targetUser.firebaseUid || !FIREBASE_AUTH_ENABLED) {
          return { skipped: true, firebaseClaims: targetUser.firebaseClaims || null };
        }
        const claims = await setFirebaseRoleClaimsForUser(targetUser, "doctor", organizationId);
        return { ...claims, firebaseClaims: claims.claims || claims.firebaseClaims };
      },
      { targetState, preserveAccountStatus: true },
    );
    Object.assign(targetUser, saga.completed.user || targetState);
    targetUser.organizationId = organizationId;
    targetUser.hospital = targetState.hospital;
    targetUser.role = "doctor";
    targetUser.requestedRole = "doctor";
    targetUser.roleRequestStatus = "approved";
    await persistUserRecord(targetUser);
    if (repositories?.memberships?.ensureForUser) await repositories.memberships.ensureForUser(targetUser);
    await appendAudit("admin.doctor.workspace.assign", req, {
      actorUserId: adminUser.id,
      organizationId,
      resourceType: "user",
      resourceId: targetUser.id,
      metadata: { previousOrganizationId, organizationId, role: "doctor" },
    });
    sendJson(res, 200, {
      doctor: publicUser(targetUser),
      workspace: publicWorkspace(organization),
      previousOrganizationId,
      sessionsRevoked: saga.started.demoSessionsRevoked || saga.started.firebaseSessionsRevoked || 0,
      operationId: saga.completed.identityOperation.id,
      replayed: saga.replayed,
    });
    return;
  }

  // Platform administrators may correct a reviewed doctor's profile without
  // bypassing the identity/approval workflow. Workspace/role transfers stay
  // on their dedicated audited routes; this endpoint is deliberately limited
  // to contact and reviewed profile fields.
  if (segments[2] === "doctors" && segments.length === 5 && segments[4] === "profile" && method === "PATCH") {
    requireAnyCapability(adminUser, ["platform.users.manage"], "Chỉ platform admin mới được chỉnh sửa hồ sơ bác sĩ");
    const targetUserId = decodeURIComponent(segments[3]);
    const targetUser = repositories
      ? await repositories.users.findByIdOrFirebaseUid(targetUserId)
      : db.users.find((candidate) => candidate.id === targetUserId || candidate.firebaseUid === targetUserId);
    if (!targetUser || (targetUser.role !== "doctor" && targetUser.requestedRole !== "doctor")) {
      throw httpError(404, "Không tìm thấy hồ sơ bác sĩ", "DOCTOR_NOT_FOUND");
    }
    const payload = await readJsonBody(req);
    const allowedFields = ["name", "phone", "title", "address", "license", "hospital", "department", "specialty"];
    const unsupported = Object.keys(payload).find((field) => !allowedFields.includes(field));
    if (unsupported) {
      throw httpError(400, `Trường hồ sơ không được phép cập nhật: ${unsupported}`, "DOCTOR_PROFILE_FIELD_UNSUPPORTED", { field: unsupported });
    }
    if (Object.keys(payload).length === 0) {
      throw httpError(400, "Cần ít nhất một trường hồ sơ để cập nhật", "DOCTOR_PROFILE_EMPTY");
    }
    const idempotencyKey = getRequiredHeaderIdempotencyKey(req, "doctor profile update");
    const patch = {};
    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(payload, field)) {
        patch[field] = readString(payload[field], field === "address" ? 1000 : 240);
      }
    }
    const context = getRequestContext(req) || createRequestContext(req);
    const persisted = repositories?.users?.updateAccountProfileWithAudit
      ? await repositories.users.updateAccountProfileWithAudit(
          targetUser.id,
          patch,
          {
            action: "admin.doctor.profile.update",
            actorUserId: adminUser.id,
            organizationId: targetUser.organizationId || "",
            authorization: { kind: "platform_admin", actorUserId: adminUser.id, organizationId: targetUser.organizationId || "" },
            ip: context.ip || "",
            userAgent: context.userAgent || "",
            metadata: { fields: Object.keys(patch).sort(), targetUserId: targetUser.id },
          },
          {
            scope: getIdempotencyScope(adminUser),
            operation: `admin.doctor.profile.update:${targetUser.id}`,
            key: idempotencyKey,
            fingerprint: createIdempotencyFingerprint(patch),
          },
        )
      : null;
    if (!persisted?.user) throw httpError(503, "Không thể lưu hồ sơ bác sĩ", "DOCTOR_PROFILE_STORAGE_UNAVAILABLE");
    sendJson(res, 200, { doctor: publicUser(persisted.user), replayed: Boolean(persisted.replayed) });
    return;
  }

  if (segments[2] === "doctors" && segments.length === 5 && segments[4] === "lock" && method === "PATCH") {
    requireAnyCapability(
      adminUser,
      ["platform.users.manage"],
      "Chỉ platform admin mới được khóa danh tính bác sĩ toàn hệ thống",
    );
    const targetUserId = decodeURIComponent(segments[3]);
    const targetUser = repositories
      ? await repositories.users.findByIdOrFirebaseUid(targetUserId)
      : db.users.find((u) => u.id === targetUserId || u.firebaseUid === targetUserId);
    if (!targetUser) {
      throw httpError(404, "User not found");
    }
    if (targetUser.role !== "doctor" && targetUser.requestedRole !== "doctor") {
      throw httpError(400, "Only doctor accounts can be locked from this endpoint");
    }
    const saga = await runIdentityProviderSaga(
      req,
      adminUser,
      targetUser,
      "lock",
      { accountStatus: "locked" },
      () => updateFirebaseLinkedAccount(targetUser, {
        disabled: true,
        revokeRefreshTokens: true,
      }),
    );
    Object.assign(targetUser, saga.completed.user || { accountStatus: "locked" });
    const firebaseResult = saga.providerResult;
    const sessionResult = {
      demoSessionsRevoked: saga.started.demoSessionsRevoked || 0,
      firebaseSessionsRevoked: saga.started.firebaseSessionsRevoked ?? saga.started.revokedCount,
    };
    
    addAccessLog("Admin khóa tài khoản bác sĩ", { severity: "warning", userId: adminUser.id });
    await saveDb();
    
    sendJson(res, 200, {
      request: publicUser(targetUser),
      ...firebaseResult,
      ...sessionResult,
      warning: firebaseResult.warning || "",
      operationId: saga.completed.identityOperation.id,
      replayed: saga.replayed,
    });
    return;
  }

  if (segments[2] === "doctors" && segments.length === 5 && segments[4] === "unlock" && method === "PATCH") {
    requireAnyCapability(
      adminUser,
      ["platform.users.manage"],
      "Chỉ platform admin mới được mở khóa danh tính bác sĩ toàn hệ thống",
    );
    const targetUserId = decodeURIComponent(segments[3]);
    const targetUser = repositories
      ? await repositories.users.findByIdOrFirebaseUid(targetUserId)
      : db.users.find((u) => u.id === targetUserId || u.firebaseUid === targetUserId);
    if (!targetUser) {
      throw httpError(404, "User not found");
    }
    if (targetUser.role !== "doctor" || targetUser.roleRequestStatus !== "approved") {
      throw httpError(
        409,
        "Chỉ tài khoản bác sĩ đã được phê duyệt mới có thể mở khóa từ endpoint này",
        "APPROVED_DOCTOR_REQUIRED",
      );
    }
    const saga = await runIdentityProviderSaga(
      req,
      adminUser,
      targetUser,
      "unlock",
      { accountStatus: "active", role: "doctor", organizationId: targetUser.organizationId || "" },
      async () => {
        const accountResult = await updateFirebaseLinkedAccount(targetUser, { disabled: false });
        let firebaseClaims;
        if (targetUser.firebaseUid && FIREBASE_AUTH_ENABLED &&
          (accountResult.updated || accountResult.firebaseAlreadyMissing)) {
          firebaseClaims = await setFirebaseRoleClaimsForUser(targetUser, "doctor", targetUser.organizationId);
        }
        return { ...accountResult, firebaseClaims };
      },
    );
    Object.assign(targetUser, saga.completed.user || { accountStatus: "active" });
    const firebaseAccountResult = saga.providerResult;
    const firebaseClaims = firebaseAccountResult.firebaseClaims;
    const warning = firebaseAccountResult.warning || "";
    
    addAccessLog("Admin mở khóa tài khoản bác sĩ", { severity: "success", userId: adminUser.id });
    await saveDb();
    
    sendJson(res, 200, {
      request: publicUser(targetUser),
      ...firebaseAccountResult,
      firebaseClaims,
      warning,
      operationId: saga.completed.identityOperation.id,
      replayed: saga.replayed,
    });
    return;
  }

  sendJson(res, 404, { error: "Admin route not found" });
}

async function handleMeApi(req, res, segments) {
  const method = req.method || "GET";
  const user = segments[2] === "2fa" ? requirePrimarySessionUser(req) : requireUser(req);
  const isActiveProfileMutation =
    segments.length === 3 &&
    segments[2] === "active-profile" &&
    method === "PATCH";
  if (isPatientUser(user) && !isActiveProfileMutation) {
    ensurePatientProfileForUser(user);
  }

  if (
    segments.length === 3 &&
    segments[2] === "notification-preferences" &&
    method === "GET"
  ) {
    const canonicalUser = await refreshAuthenticatedAuthorization(user);
    if (!canonicalUser || !isActiveUserAccount(canonicalUser)) {
      throw httpError(
        401,
        "Notification preferences require an active account",
        "NOTIFICATION_PREFERENCE_ACCOUNT_UNAVAILABLE",
      );
    }
    sendJson(res, 200, buildNotificationPreferencesResponse(canonicalUser));
    return;
  }

  if (
    segments.length === 3 &&
    segments[2] === "notification-preferences" &&
    method === "PATCH"
  ) {
    const payload = await readJsonBody(req);
    const preferencePatch = parseNotificationPreferencePatch(payload);
    const idempotencyKey = getRequiredIdempotencyKey(
      req,
      {},
      "notification preference mutation",
    );
    const canonicalUser = await refreshAuthenticatedAuthorization(user);
    if (!canonicalUser || !isActiveUserAccount(canonicalUser)) {
      throw httpError(
        401,
        "Notification preferences require an active account",
        "NOTIFICATION_PREFERENCE_ACCOUNT_UNAVAILABLE",
      );
    }
    const context = getRequestContext(req) || createRequestContext(req);
    const persisted = repositories?.users.patchNotificationPreferenceWithAudit
      ? await repositories.users.patchNotificationPreferenceWithAudit(
          canonicalUser.id,
          preferencePatch.key,
          preferencePatch.enabled,
          {
            action: "notification.preferences.patch",
            actorUserId: canonicalUser.id,
            organizationId: getUserWorkspaceContext(canonicalUser).currentWorkspaceId || "",
            authorization: {
              kind: "account_owner",
              actorUserId: canonicalUser.id,
            },
            ip: context.ip || "",
            userAgent: context.userAgent || "",
            metadata: {
              field: preferencePatch.key,
              enabled: preferencePatch.enabled,
            },
          },
          {
            scope: getIdempotencyScope(canonicalUser, ""),
            operation: "notification.preferences.patch",
            key: idempotencyKey,
            fingerprint: createIdempotencyFingerprint(preferencePatch),
          },
        )
      : null;
    if (!persisted?.user) {
      throw httpError(
        503,
        "Cannot persist notification preferences",
        "NOTIFICATION_PREFERENCE_STORAGE_UNAVAILABLE",
      );
    }
    const confirmed = normalizeNotificationPreferences(persisted.preferences);
    if (confirmed[preferencePatch.key] !== preferencePatch.enabled) {
      throw httpError(
        503,
        "Notification preference persistence was not confirmed",
        "NOTIFICATION_PREFERENCE_CONFIRMATION_FAILED",
      );
    }
    const receiptUser = {
      ...persisted.user,
      notificationPreferences: confirmed,
      updatedAt: persisted.updatedAt || persisted.user.updatedAt,
    };
    sendJson(res, 200, buildNotificationPreferencesResponse(receiptUser, persisted.replayed));
    return;
  }

  if (segments.length === 3 && segments[2] === "2fa" && method === "GET") {
    const credential = repositories?.twoFactor
      ? await repositories.twoFactor.getCredential(user.id)
      : db.twoFactorCredentials.find((item) => item.userId === user.id && !item.disabledAt) || null;
    const enrollment = repositories?.twoFactor
      ? await repositories.twoFactor.getPendingEnrollment(user.id)
      : db.twoFactorEnrollments.find(
          (item) => item.userId === user.id && !item.consumedAt && Date.parse(item.expiresAt || "") > Date.now(),
        ) || null;
    user.twoFactorEnabled = Boolean(credential);
    user.twoFactorMethod = credential ? credential.method || "app" : "";
    sendJson(res, 200, {
      availability: getTwoFactorAvailability(),
      twoFactor: {
        enabled: Boolean(credential),
        method: credential ? credential.method || "app" : "",
        enrollmentPending: Boolean(enrollment),
      },
    });
    return;
  }

  if (segments.length === 4 && segments[2] === "2fa" && segments[3] === "enroll" && method === "POST") {
    const payload = await readJsonBody(req);
    const idempotencyKey = getRequiredHeaderIdempotencyKey(req, "2FA enrollment start");
    const methodName = readString(payload.method, 40) || "app";
    if (methodName !== "app") {
      throw httpError(
        503,
        "Phương thức 2FA này chưa có provider thật.",
        "TWO_FACTOR_METHOD_UNAVAILABLE",
        { method: methodName, availability: getTwoFactorAvailability() },
      );
    }
    const availability = getTwoFactorAvailability();
    if (!availability.available) {
      throw httpError(
        503,
        "2FA chưa sẵn sàng vì thiếu cấu hình mã hóa an toàn.",
        "TWO_FACTOR_UNAVAILABLE",
        { availability },
      );
    }
    if (!repositories?.twoFactor?.createEnrollment) {
      throw httpError(
        503,
        "2FA enrollment storage is unavailable.",
        "TWO_FACTOR_STORAGE_UNAVAILABLE",
      );
    }
    const primaryBinding = getTwoFactorPrimaryBinding(req, user);
    const startIntent = createEnrollmentStartBinding({
      userId: user.id,
      idempotencyKey,
      primaryBinding,
      method: methodName,
    });
    const enrollmentId = createId("2fa_enroll");
    const enrollment = await createTotpEnrollment({
      id: enrollmentId,
      userId: user.id,
      accountLabel: user.id,
    });
    enrollment.record.startIntent = startIntent;
    const persisted = await repositories.twoFactor.createEnrollment(enrollment.record, {
      auditInput: {
        actorUserId: user.id,
        organizationId: user.organizationId || "",
        ip: (getRequestContext(req) || createRequestContext(req)).ip || req.socket.remoteAddress || "",
        userAgent: (getRequestContext(req) || createRequestContext(req)).userAgent || "",
        metadata: { method: methodName },
      },
    });
    const bootstrap = await materializeTotpEnrollment(
      persisted.enrollment,
      { accountLabel: user.id },
    );
    sendJson(res, 201, {
      userId: user.id,
      twoFactor: { enabled: false, method: "", enrollmentPending: true },
      enrollment: {
        id: persisted.enrollment.id,
        method: "app",
        manualKey: bootstrap.manualKey,
        otpauthUri: bootstrap.otpauthUri,
        expiresAt: persisted.enrollment.expiresAt,
      },
      replayed: persisted.replayed,
      superseded: persisted.superseded,
    });
    return;
  }

  if (segments.length === 4 && segments[2] === "2fa" && segments[3] === "verify" && method === "POST") {
    const availability = getTwoFactorAvailability();
    if (!availability.available) {
      throw httpError(503, "2FA chưa sẵn sàng.", "TWO_FACTOR_UNAVAILABLE", { availability });
    }
    const payload = await readJsonBody(req);
    const idempotencyKey = getRequiredIdempotencyKey(req, {}, "2FA enrollment verification");
    const enrollmentId = readString(payload.enrollmentId, 200);
    const otp = readString(payload.otp || payload.code, 20);
    const primaryBinding = getTwoFactorPrimaryBinding(req, user);
    if (!enrollmentId) {
      throw httpError(400, "Thiếu enrollmentId.", "TWO_FACTOR_ENROLLMENT_ID_REQUIRED");
    }
    const enrollment = repositories?.twoFactor
      ? await repositories.twoFactor.getEnrollment(user.id, enrollmentId)
      : db.twoFactorEnrollments.find((item) => item.id === enrollmentId && item.userId === user.id) || null;
    if (!enrollment) {
      throw httpError(404, "Không tìm thấy enrollment.", "TWO_FACTOR_ENROLLMENT_NOT_FOUND");
    }
    const enrollmentPrimaryBindingHash = readString(
      enrollment.startIntent?.primaryBindingHash,
      100,
    );
    if (
      !enrollmentPrimaryBindingHash ||
      enrollmentPrimaryBindingHash !== hashPrimaryBinding(primaryBinding)
    ) {
      throw httpError(
        409,
        "Enrollment start belongs to a different primary session.",
        "TWO_FACTOR_ENROLLMENT_SCOPE_MISMATCH",
      );
    }
    const credentialId = `2fa_credential_${user.id}`;
    if (enrollment.pendingActivation) {
      const replay = createEnrollmentRecoveryDelivery({
        userId: user.id,
        credentialId,
        enrollmentId,
        idempotencyKey,
        primaryBinding,
        verificationCode: otp,
        verifiedAtMs: Date.parse(enrollment.pendingActivation.verifiedAt || ""),
      });
      if (!isEnrollmentRecoveryDeliveryReplay(enrollment.pendingActivation, replay)) {
        throw httpError(
          409,
          "Idempotency-Key was reused for a different enrollment verification intent.",
          "IDEMPOTENCY_KEY_REUSED",
        );
      }
      const delivery = getEnrollmentRecoveryDelivery(enrollment.pendingActivation);
      if (!delivery || Date.parse(delivery.expiresAt) <= Date.now()) {
        throw httpError(
          410,
          "Recovery-code delivery acknowledgement window has expired.",
          "TWO_FACTOR_DELIVERY_EXPIRED",
        );
      }
      sendJson(res, 200, {
        userId: user.id,
        enrollmentId,
        twoFactor: { enabled: false, method: "", enrollmentPending: true },
        recoveryCodes: replay.codes,
        recoveryDelivery: {
          id: delivery.id,
          expiresAt: delivery.expiresAt,
          acknowledged: false,
        },
        recoveryAckToken: replay.recoveryAckToken,
        replayed: true,
      });
      return;
    }
    if (enrollment.consumedAt) {
      throw httpError(
        410,
        "Enrollment is no longer available for recovery-code delivery.",
        "TWO_FACTOR_ENROLLMENT_ALREADY_USED",
      );
    }
    if (Date.parse(enrollment.expiresAt || "") <= Date.now()) {
      throw httpError(410, "Enrollment đã hết hạn.", "TWO_FACTOR_ENROLLMENT_EXPIRED");
    }
    if (Number(enrollment.attempts || 0) >= Number(enrollment.maxAttempts || 5)) {
      throw httpError(429, "Đã vượt quá số lần thử.", "TWO_FACTOR_ATTEMPTS_EXCEEDED");
    }
    const verification = await verifyTotpCode(enrollment, otp);
    if (!verification.valid || !Number.isFinite(verification.timeStep)) {
      const failed = repositories?.twoFactor
        ? await repositories.twoFactor.recordEnrollmentFailure(user.id, enrollmentId)
        : enrollment;
      if (!repositories?.twoFactor) {
        failed.attempts = Math.min(Number(failed.maxAttempts || 5), Number(failed.attempts || 0) + 1);
        await saveDb();
      }
      const attemptsRemaining = Math.max(0, Number(failed.maxAttempts || 5) - Number(failed.attempts || 0));
      throw httpError(
        attemptsRemaining ? 401 : 429,
        attemptsRemaining ? "Mã TOTP không hợp lệ." : "Đã vượt quá số lần thử.",
        attemptsRemaining ? "TWO_FACTOR_CODE_INVALID" : "TWO_FACTOR_ATTEMPTS_EXCEEDED",
        { attemptsRemaining },
      );
    }
    const verifiedAt = nowIso();
    const pendingRecovery = createEnrollmentRecoveryDelivery({
      userId: user.id,
      credentialId,
      enrollmentId,
      idempotencyKey,
      primaryBinding,
      verificationCode: otp,
      verifiedAtMs: Date.parse(verifiedAt),
    });
    const pendingActivation = {
      version: 1,
      userId: user.id,
      credentialId,
      enrollmentId,
      recoverySalt: pendingRecovery.recoverySalt,
      recoveryCodes: pendingRecovery.recoveryCodes,
      recoveryAckTokenHash: pendingRecovery.recoveryAckTokenHash,
      lastUsedTimeStep: verification.timeStep,
      verifiedAt,
      delivery: pendingRecovery.delivery,
    };
    if (!repositories?.twoFactor) {
      throw httpError(503, "2FA storage is unavailable.", "TWO_FACTOR_STORAGE_UNAVAILABLE");
    }
    const staged = await repositories.twoFactor.stageEnrollmentVerification({
      userId: user.id,
      enrollmentId,
      pendingActivation,
      auditInput: {
        organizationId: user.organizationId || "",
        ip: (getRequestContext(req) || createRequestContext(req)).ip || "",
        userAgent: (getRequestContext(req) || createRequestContext(req)).userAgent || "",
        metadata: { method: "app", state: "recovery_ack_pending" },
      },
    });
    sendJson(res, 200, {
      userId: user.id,
      enrollmentId,
      twoFactor: { enabled: false, method: "", enrollmentPending: true },
      recoveryCodes: pendingRecovery.codes,
      recoveryDelivery: {
        id: pendingRecovery.delivery.id,
        expiresAt: pendingRecovery.delivery.expiresAt,
        acknowledged: false,
      },
      recoveryAckToken: pendingRecovery.recoveryAckToken,
      replayed: staged.replayed,
    });
    return;
  }

  if (
    segments.length === 5 &&
    segments[2] === "2fa" &&
    segments[3] === "recovery-codes" &&
    segments[4] === "ack" &&
    method === "POST"
  ) {
    const availability = getTwoFactorAvailability();
    if (!availability.available) {
      throw httpError(503, "2FA chưa sẵn sàng.", "TWO_FACTOR_UNAVAILABLE", { availability });
    }
    if (!repositories?.twoFactor) {
      throw httpError(503, "Kho lưu trữ 2FA chưa sẵn sàng.", "TWO_FACTOR_STORAGE_UNAVAILABLE");
    }
    const payload = await readJsonBody(req);
    const idempotencyKey = getRequiredIdempotencyKey(req, {}, "2FA recovery-code acknowledgement");
    const deliveryId = readString(payload.deliveryId, 200);
    const recoveryAckToken = readString(payload.recoveryAckToken, 1024);
    if (!deliveryId) {
      throw httpError(400, "Thiếu deliveryId.", "TWO_FACTOR_DELIVERY_ID_REQUIRED");
    }
    if (!recoveryAckToken || !/^[A-Za-z0-9_-]+$/.test(recoveryAckToken)) {
      throw httpError(
        400,
        "A bounded recovery acknowledgement token is required.",
        "TWO_FACTOR_RECOVERY_ACK_TOKEN_REQUIRED",
      );
    }
    const ackPendingEnrollment = await repositories.twoFactor.getEnrollmentByRecoveryDelivery(
      user.id,
      deliveryId,
    );
    const ackCredential = ackPendingEnrollment
      ? null
      : await repositories.twoFactor.getCredential(user.id);
    const ackRecord = ackPendingEnrollment?.pendingActivation || ackCredential;
    const ackDelivery = getEnrollmentRecoveryDelivery(ackRecord);
    const ackEnrollmentId = String(
      ackPendingEnrollment?.id || ackCredential?.enrollmentId || "",
    );
    const ackCredentialId = String(
      ackPendingEnrollment?.pendingActivation?.credentialId ||
        ackCredential?.id ||
        `2fa_credential_${user.id}`,
    );
    if (
      !ackRecord ||
      !ackDelivery ||
      ackDelivery.id !== deliveryId ||
      !ackEnrollmentId ||
      !verifyRecoveryAckToken(ackRecord, recoveryAckToken)
    ) {
      throw httpError(
        409,
        "Recovery acknowledgement proof does not match this account delivery.",
        "TWO_FACTOR_DELIVERY_SCOPE_MISMATCH",
      );
    }
    const ackBinding = createEnrollmentRecoveryAcknowledgementBinding({
      userId: user.id,
      credentialId: ackCredentialId,
      enrollmentId: ackEnrollmentId,
      idempotencyKey,
      primaryBinding: getTwoFactorPrimaryBinding(req, user),
    });
    if (
      ackDelivery.primaryBindingHash !== ackBinding.primaryBindingHash ||
      ackDelivery.acknowledgementKeyHash !== ackBinding.acknowledgementKeyHash
    ) {
      throw httpError(
        409,
        "Recovery acknowledgement key or primary session changed.",
        "TWO_FACTOR_DELIVERY_SCOPE_MISMATCH",
      );
    }
    const completedSession = createCompletedEnrollmentSession({
      userId: user.id,
      credentialId: ackCredentialId,
      enrollmentId: ackEnrollmentId,
      recoveryAckToken,
      primaryBindingHash: ackBinding.primaryBindingHash,
      verifiedAt: ackRecord.verifiedAt || ackCredential?.enabledAt,
      deliveryExpiresAt: ackDelivery.expiresAt,
    });
    const activated = await repositories.twoFactor.activateEnrollmentFromRecoveryAck({
      userId: user.id,
      enrollmentId: ackEnrollmentId,
      deliveryId,
      operationHash: ackDelivery.operationHash,
      primaryBindingHash: ackBinding.primaryBindingHash,
      acknowledgementKeyHash: ackBinding.acknowledgementKeyHash,
      recoveryAckTokenHash: ackDelivery.recoveryAckTokenHash,
      tokenRecord: completedSession.record,
      auditInput: {
        organizationId: user.organizationId || "",
        ip: (getRequestContext(req) || createRequestContext(req)).ip || "",
        userAgent: (getRequestContext(req) || createRequestContext(req)).userAgent || "",
        metadata: { method: "app", recoveryDeliveryAcknowledged: true },
      },
    });
    user.twoFactorEnabled = true;
    user.twoFactorMethod = "app";
    sendJson(res, 200, {
      userId: user.id,
      enrollmentId: ackEnrollmentId,
      twoFactor: { enabled: true, method: "app", enrollmentPending: false },
      recoveryDelivery: {
        id: activated.delivery.id,
        expiresAt: activated.delivery.expiresAt,
        acknowledged: true,
        acknowledgedAt: activated.delivery.acknowledgedAt,
      },
      twoFactorToken: completedSession.token,
      tokenExpiresAt: completedSession.record.expiresAt,
      replayed: activated.replayed,
    });
    return;
  }

  if (segments.length === 4 && segments[2] === "2fa" && segments[3] === "disable" && method === "POST") {
    const availability = getTwoFactorAvailability();
    if (!availability.available) {
      throw httpError(503, "2FA chưa sẵn sàng.", "TWO_FACTOR_UNAVAILABLE", { availability });
    }
    if (!repositories?.twoFactor) {
      throw httpError(503, "Kho lưu trữ 2FA chưa sẵn sàng.", "TWO_FACTOR_STORAGE_UNAVAILABLE");
    }
    const payload = await readJsonBody(req);
    const otp = readString(payload.otp || payload.code, 20);
    const recoveryCode = readString(payload.recoveryCode, 80);
    await repositories.twoFactor.disable({
      userId: user.id,
      verifyFactor: async (credential) => {
        if (recoveryCode) {
          const match = verifyRecoveryCode(credential, recoveryCode);
          return match
            ? { valid: true, recoveryCodeId: match.id, usedAt: nowIso() }
            : { valid: false, code: "TWO_FACTOR_RECOVERY_CODE_INVALID" };
        }
        if (!otp) return { valid: false, code: "TWO_FACTOR_CODE_REQUIRED" };
        const result = await verifyTotpCode(credential, otp, {
          afterTimeStep: Number(credential.lastUsedTimeStep),
        });
        if (result.replayed) return { valid: false, code: "TWO_FACTOR_CODE_REPLAYED" };
        return result.valid
          ? { valid: true, timeStep: Number(result.timeStep) }
          : { valid: false, code: "TWO_FACTOR_CODE_INVALID" };
      },
      auditInput: {
        organizationId: user.organizationId || "",
        ip: (getRequestContext(req) || createRequestContext(req)).ip || "",
        userAgent: (getRequestContext(req) || createRequestContext(req)).userAgent || "",
        metadata: { method: recoveryCode ? "recovery_code" : "app" },
      },
    });
    user.twoFactorEnabled = false;
    user.twoFactorMethod = "";
    sendJson(res, 200, { twoFactor: { enabled: false, method: "", enrollmentPending: false } });
    return;
  }

  if (segments.length === 2 && method === "GET") {
    sendJson(res, 200, { user: publicUser(user) });
    return;
  }

  if (segments.length === 3 && segments[2] === "active-profile" && method === "PATCH") {
    if (!isPatientUser(user) || !hasCapability(user, "personal.profiles.manage")) {
      throw httpError(403, "Không có quyền chuyển hồ sơ đang hoạt động", "PROFILE_SCOPE_DENIED");
    }
    const payload = await readJsonBody(req);
    const patientId = readString(payload.patientId, 120);
    if (!patientId) throw httpError(400, "Thiếu patientId", "ACTIVE_PROFILE_REQUIRED");
    const activePatient = repositories ? await repositories.patients.findById(patientId) : findPatient(patientId);
    if (!activePatient) throw httpError(404, "Không tìm thấy hồ sơ sức khỏe", "PROFILE_NOT_FOUND");
    if (activePatient.deletedAt) {
      throw httpError(404, "Hồ sơ sức khỏe không còn hoạt động", "PROFILE_NOT_FOUND");
    }
    const workspaceContext = getUserWorkspaceContext(user);
    const patientPrincipalIds = new Set(
      [
        activePatient.ownerUserId,
        activePatient.accountUserId,
        activePatient.guardianUserId,
      ].filter(Boolean),
    );
    const isLegacySelfProfile = Boolean(
      activePatient.id === user.patientId &&
      patientPrincipalIds.size === 0 &&
      (activePatient.profileType === "self" || activePatient.relationship === "self"),
    );
    if (!patientPrincipalIds.has(user.id) && !isLegacySelfProfile) {
      throw httpError(403, "Hồ sơ nằm ngoài phạm vi gia đình hiện tại", "PROFILE_SCOPE_DENIED");
    }
    if (
      !workspaceContext.currentWorkspaceId ||
      activePatient.organizationId !== workspaceContext.currentWorkspaceId
    ) {
      throw httpError(
        409,
        "Hồ sơ không thuộc workspace đang hoạt động",
        "PROFILE_WORKSPACE_MISMATCH",
      );
    }
    const idempotencyKey = getIdempotencyKey(req, payload);
    if (!idempotencyKey) {
      throw httpError(
        400,
        "Idempotency-Key là bắt buộc khi chuyển hồ sơ đang hoạt động",
        "IDEMPOTENCY_KEY_REQUIRED",
      );
    }
    const preserveDoctorRequestTarget = isDoctorRoleRequestTargetLocked(user);
    const nextUser = {
      ...user,
      organizationId: preserveDoctorRequestTarget
        ? user.organizationId
        : workspaceContext.currentWorkspaceId,
      activePatientId: activePatient.id,
      updatedAt: nowIso(),
    };
    const context = getRequestContext(req) || createRequestContext(req);
    const persisted = repositories?.users.updateAccountProfileWithAudit
      ? await repositories.users.updateAccountProfileWithAudit(
          user.id,
          {
            name: nextUser.name || "",
            title: nextUser.title || "",
            phone: nextUser.phone || "",
            license: nextUser.license || "",
            hospital: nextUser.hospital || "",
            department: nextUser.department || "",
            specialty: nextUser.specialty || "",
            address: nextUser.address || "",
            avatarFileId: nextUser.avatarFileId || "",
            avatarUrl: nextUser.avatarUrl || "",
            avatarStorage: nextUser.avatarStorage && typeof nextUser.avatarStorage === "object" ? nextUser.avatarStorage : {},
            twoFactorEnabled: Boolean(nextUser.twoFactorEnabled),
            twoFactorMethod: nextUser.twoFactorMethod || "",
            notificationPreferences: normalizeNotificationPreferences(nextUser.notificationPreferences),
            activePatientId: activePatient.id,
            organizationId: nextUser.organizationId || "",
          },
          {
            action: "profile.active.switch",
            actorUserId: user.id,
            organizationId: workspaceContext.currentWorkspaceId,
            authorization: {
              kind: "active_profile",
              actorUserId: user.id,
              patientId: activePatient.id,
              organizationId: workspaceContext.currentWorkspaceId,
            },
            ip: context.ip || "",
            userAgent: context.userAgent || "",
            metadata: {
              previousPatientId: user.activePatientId || user.patientId || "",
              patientId: activePatient.id,
              previousOrganizationId: user.organizationId || "",
              organizationId: nextUser.organizationId || "",
              profileWorkspaceId: workspaceContext.currentWorkspaceId,
            },
          },
          idempotencyKey
            ? {
                scope: getIdempotencyScope(user, workspaceContext.currentWorkspaceId),
                operation: "profile.active.switch",
                key: idempotencyKey,
                fingerprint: createIdempotencyFingerprint({
                  patientId: activePatient.id,
                  organizationId: workspaceContext.currentWorkspaceId,
                }),
              }
            : null,
        )
      : null;
    if (!persisted?.user) throw httpError(503, "Không thể lưu hồ sơ đang hoạt động", "PROFILE_STORAGE_UNAVAILABLE");
    sendJson(res, 200, {
      user: publicUser(persisted.user),
      activePatient: withPatientStats(activePatient),
      replayed: Boolean(persisted.replayed),
    });
    return;
  }

  if (segments.length === 2 && method === "PATCH") {
    const payload = await readJsonBody(req);
    const requestPath = parseRequestPath(req).pathname;
    const canonicalProfilePath = requestPath === "/api/v1/me";
    const legacyProfilePath = requestPath === "/api/me";
    const workspaceSelections = assertConsistentWorkspaceSelection(payload);
    const workspaceSelectionRequested = workspaceSelections.length > 0;
    const legacyWorkspaceAliasUsed = workspaceSelections.some(
      (selection) => selection.key !== "organizationId",
    );
    const canonicalProfileFields = [
      "name",
      "title",
      "phone",
      "license",
      "hospital",
      "department",
      "specialty",
      "address",
    ];
    const suppliedProfileFields = canonicalProfileFields.filter((field) =>
      Object.prototype.hasOwnProperty.call(payload, field),
    );
    const mixedProfileWorkspaceMutation =
      workspaceSelectionRequested && suppliedProfileFields.length > 0;
    if (canonicalProfilePath) {
      if (!workspaceSelectionRequested || mixedProfileWorkspaceMutation) {
        getRequiredHeaderIdempotencyKey(req, "account profile update");
      }
      const supportedFields = new Set([
        ...canonicalProfileFields,
        ...(workspaceSelectionRequested
          ? ["organizationId", "clinicId", "clinic"]
          : []),
      ]);
      const unsupportedField = Object.keys(payload).find(
        (field) => !supportedFields.has(field),
      );
      if (unsupportedField) {
        throw httpError(
          400,
          `Account profile field is owned by another mutation route: ${unsupportedField}`,
          "ACCOUNT_PROFILE_FIELD_UNSUPPORTED",
          { field: unsupportedField },
        );
      }
    }
    const approvalEvidenceFields = ["license", "hospital", "department", "specialty"];
    if (isApprovedDoctorRole(user) && approvalEvidenceFields.some(
      (field) => Object.prototype.hasOwnProperty.call(payload, field),
    )) {
      throw httpError(
        409,
        "Approved clinician credentials require a reviewed change request",
        "APPROVAL_EVIDENCE_IMMUTABLE",
      );
    }
    const requestedWorkspaceId = getRequestedWorkspaceId(payload);
    if (workspaceSelectionRequested && !requestedWorkspaceId) {
      throw httpError(400, "Thiếu workspace cần chuyển", "WORKSPACE_REQUIRED");
    }
    if (
      workspaceSelectionRequested &&
      isDoctorRoleRequestTargetLocked(user)
    ) {
      throw httpError(
        409,
        "The doctor-request target cannot change before the request is approved",
        "ROLE_REQUEST_TARGET_LOCKED",
        {
          targetWorkspaceId: readString(
            user.roleRequestOrganizationId || user.organizationId,
            120,
          ),
        },
      );
    }
    const selectedClinic = workspaceSelectionRequested ? getExplicitWorkspaceSelectionFromPayload(payload) : null;
    if (workspaceSelectionRequested && !selectedClinic) {
      throw httpError(404, "Không tìm thấy workspace", "WORKSPACE_NOT_FOUND");
    }
    const previousOrganizationId = user.organizationId || "";
    const nextUser = { ...user };
    const mutationPatch = {};
    const profileFieldsForPath = legacyProfilePath
      ? [...canonicalProfileFields, "avatarFileId", "avatarUrl"]
      : canonicalProfileFields;
    for (const field of profileFieldsForPath.filter((item) => item !== "specialty")) {
      if (Object.prototype.hasOwnProperty.call(payload, field)) {
        const maxLength = field === "address" || field === "avatarUrl" ? 1000 : 160;
        nextUser[field] = readString(payload[field], maxLength);
        mutationPatch[field] = nextUser[field];
      }
    }
    if (Object.prototype.hasOwnProperty.call(payload, "specialty")) {
      nextUser.specialty = readString(payload.specialty, 160);
      mutationPatch.specialty = nextUser.specialty;
      if (
        !Object.prototype.hasOwnProperty.call(payload, "department") &&
        !readString(nextUser.department, 160)
      ) {
        nextUser.department = nextUser.specialty;
        mutationPatch.department = nextUser.department;
      }
    }
    if (
      legacyProfilePath &&
      Object.prototype.hasOwnProperty.call(payload, "notificationPreferences")
    ) {
      nextUser.notificationPreferences = mergeNotificationPreferences(
        user.notificationPreferences,
        payload.notificationPreferences,
      );
      mutationPatch.notificationPreferences = normalizeNotificationPreferences(
        nextUser.notificationPreferences,
      );
    }
    if (selectedClinic) {
      if (!isPlatformAdminUser(user) && !hasWorkspaceMembership(user, selectedClinic.id)) {
        throw httpError(403, "Không thể tự chuyển sang workspace khi chưa có membership", "WORKSPACE_MEMBERSHIP_REQUIRED");
      }
      assertWorkspaceSelectionSurfaceCompatible(user, selectedClinic.id);
      nextUser.organizationId = selectedClinic.id;
      nextUser.hospital = selectedClinic.name;
      mutationPatch.organizationId = nextUser.organizationId;
      mutationPatch.hospital = nextUser.hospital;
      if (repositories && typeof repositories.organizations?.upsert === "function") {
        await repositories.organizations.upsert(ensureOrganizationFromCatalog(selectedClinic) || selectedClinic);
      }
    }
    if (legacyProfilePath) {
      requestMetrics.legacyAccountProfileUpdate += 1;
      res.setHeader("Deprecation", "true");
      res.setHeader("X-Shcare-Compatibility-Alias", "account-profile-update");
    } else if (mixedProfileWorkspaceMutation) {
      requestMetrics.legacyAccountProfileWorkspaceMix += 1;
      res.setHeader("Deprecation", "true");
      res.setHeader(
        "X-Shcare-Compatibility-Alias",
        "account-profile-workspace-mix",
      );
    } else if (legacyWorkspaceAliasUsed) {
      requestMetrics.legacyWorkspaceSwitchAlias += 1;
      res.setHeader("Deprecation", "true");
      res.setHeader("X-Shcare-Compatibility-Alias", "workspace-switch-alias");
    }
    const context = getRequestContext(req) || createRequestContext(req);
    const idempotencyKey = canonicalProfilePath
      ? workspaceSelectionRequested && !mixedProfileWorkspaceMutation
        ? getIdempotencyKey(req, {}) || createId("workspace_switch")
        : getRequiredHeaderIdempotencyKey(req, "account profile update")
      : getIdempotencyKey(req, payload) || createId("legacy_account_profile");
    const persisted = repositories?.users.updateAccountProfileWithAudit
      ? await repositories.users.updateAccountProfileWithAudit(
          user.id,
          mutationPatch,
          {
            action: workspaceSelectionRequested ? "workspace.switch" : "account.profile.update",
            actorUserId: user.id,
            organizationId: nextUser.organizationId || previousOrganizationId,
            authorization: {
              kind: workspaceSelectionRequested
                ? isPlatformAdminUser(user)
                  ? "platform_workspace_switch"
                  : "workspace_switch"
                : "account_owner",
              actorUserId: user.id,
              organizationId: nextUser.organizationId || previousOrganizationId,
            },
            ip: context.ip || "",
            userAgent: context.userAgent || "",
            metadata: workspaceSelectionRequested
              ? {
                  previousOrganizationId,
                  organizationId: nextUser.organizationId || "",
                  ...(mixedProfileWorkspaceMutation
                    ? { compatibilityProfileFields: [...suppliedProfileFields].sort() }
                    : {}),
                }
              : { fields: [...suppliedProfileFields].sort() },
          },
          {
            scope: getIdempotencyScope(user, ""),
            operation: workspaceSelectionRequested ? "workspace.switch" : "account.profile.update",
            key: idempotencyKey,
            fingerprint: createIdempotencyFingerprint(payload),
          },
        )
      : null;
    if (!persisted?.user) {
      throw httpError(503, "Cannot persist account profile to database", "ACCOUNT_STORAGE_UNAVAILABLE");
    }
    if (!persisted.replayed) {
      addAccessLog("Cập nhật thông tin cá nhân");
    }
    res.setHeader("Idempotency-Replayed", String(Boolean(persisted.replayed)));
    if (canonicalProfilePath && !workspaceSelectionRequested) {
      const receipt = persisted.responseSnapshot;
      if (
        !receipt ||
        String(receipt.userId || "") !== String(user.id) ||
        String(receipt.user?.id || "") !== String(user.id) ||
        receipt.intent !== "profile_update"
      ) {
        throw httpError(
          503,
          "Cannot verify the account profile mutation receipt",
          "ACCOUNT_PROFILE_RECEIPT_UNAVAILABLE",
        );
      }
      sendJson(res, 200, {
        ...receipt,
        replayed: Boolean(persisted.replayed),
      });
      return;
    }
    sendJson(res, 200, { user: publicUser(persisted.user), replayed: Boolean(persisted.replayed) });
    return;
  }

  if (
    segments.length === 4 &&
    segments[2] === "avatar" &&
    segments[3] === "cleanup" &&
    method === "GET"
  ) {
    if (!repositories?.avatarMutations?.getCleanupStatus) {
      throw httpError(
        503,
        "Avatar cleanup status is unavailable",
        "AVATAR_CLEANUP_STATUS_UNAVAILABLE",
      );
    }
    const canonicalUser = await refreshAuthenticatedAuthorization(user);
    if (!canonicalUser || !isActiveUserAccount(canonicalUser)) {
      throw httpError(
        403,
        "Avatar cleanup status requires an active account",
        "ACCOUNT_INACTIVE",
      );
    }
    const organizationId =
      getUserWorkspaceContext(canonicalUser).currentWorkspaceId ||
      canonicalUser.organizationId;
    if (!organizationId || !hasWorkspaceMembership(canonicalUser, organizationId)) {
      throw httpError(
        403,
        "Avatar cleanup status requires an active workspace membership",
        "WORKSPACE_MEMBERSHIP_REQUIRED",
      );
    }
    const cleanup = await repositories.avatarMutations.getCleanupStatus({
      userId: canonicalUser.id,
      organizationId,
    });
    sendJson(res, 200, cleanup);
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
    if (!repositories?.avatarMutations) {
      throw httpError(503, "Avatar mutation storage is unavailable", "AVATAR_STORAGE_UNAVAILABLE");
    }
    const requestPath = parseRequestPath(req).pathname;
    const canonicalRequest = requestPath === "/api/v1/me/avatar";
    if (!canonicalRequest) {
      requestMetrics.legacyAvatarMutation += 1;
      res.setHeader("Deprecation", "true");
      res.setHeader("X-Shcare-Compatibility-Alias", "account-avatar");
    }
    const canonicalUser = await refreshAuthenticatedAuthorization(user);
    if (!canonicalUser || !isActiveUserAccount(canonicalUser)) {
      throw httpError(403, "Avatar upload requires an active account", "ACCOUNT_INACTIVE");
    }
    const organizationId = canonicalUser.organizationId || getUserWorkspaceContext(canonicalUser).currentWorkspaceId;
    if (!organizationId) {
      throw httpError(403, "Avatar upload requires an active workspace", "AVATAR_WORKSPACE_SCOPE_DENIED");
    }
    const authority = resolveAvatarMutationAuthority(
      req,
      canonicalUser,
      organizationId,
      canonicalRequest,
    );
    const requestedName = readString(req.headers["x-file-name"], 240);
    if (canonicalRequest && (!requestedName || requestedName !== path.basename(requestedName))) {
      throw httpError(400, "X-File-Name must contain one safe file name", "AVATAR_FILE_NAME_INVALID");
    }
    const originalName = path.basename(requestedName || `${canonicalUser.id || "avatar"}.png`);
    const contentType = readString(req.headers["content-type"], 160).toLowerCase();
    const buffer = await readRequestBuffer(req, MAX_AVATAR_BYTES);
    const validatedFile = validateAvatarUpload({ buffer, contentType, fileName: originalName });
    const checksum = crypto.createHash("sha256").update(buffer).digest("hex");
    const fingerprint = createIdempotencyFingerprint({
      userId: authority.userId,
      organizationId: authority.workspaceId,
      authSessionId: authority.authSessionId,
      name: validatedFile.name,
      contentType: validatedFile.contentType,
      byteSize: buffer.length,
      sha256: checksum,
    });
    const suppliedIdempotencyKey = getIdempotencyKey(req, {});
    if (canonicalRequest && !suppliedIdempotencyKey) {
      getRequiredIdempotencyKey(req, {}, "avatar upload");
    }
    const idempotencyKey = suppliedIdempotencyKey || `legacy-avatar-upload-${createId("idem")}`;
    const operationId = `avatar_upload_${createIdempotencyFingerprint({
      userId: authority.userId,
      authSessionId: authority.authSessionId,
      operation: "account.avatar.upload",
      key: idempotencyKey,
    }).slice(0, 24)}`;
    const fileId = `file_avatar_${createIdempotencyFingerprint({ operationId, fingerprint }).slice(0, 32)}`;
    const objectKey = `org/${authority.workspaceId}/avatars/${authority.userId}/${fileId}-${validatedFile.name}`;
    if (!storageAdapter) {
      storageAdapter = createStorageAdapter({ dataDir: DATA_DIR, env: process.env });
    }
    const context = getRequestContext(req) || createRequestContext(req);
    const receipt = await executeAvatarUploadMutation({
      repository: repositories.avatarMutations,
      storageAdapter,
      buffer,
      contentType: validatedFile.contentType,
      input: {
        userId: authority.userId,
        organizationId: authority.workspaceId,
        authSessionId: authority.authSessionId,
        operationId,
        avatar: {
          id: fileId,
          ownerUserId: authority.userId,
          organizationId: authority.workspaceId,
          name: validatedFile.name,
          objectKey,
          storageProvider: storageAdapter.provider,
          contentType: validatedFile.contentType,
          type: validatedFile.type,
          byteSize: buffer.length,
          sha256: checksum,
          uploadedAt: nowIso(),
        },
        idempotency: {
          scope: authority.userId,
          operation: "account.avatar.upload",
          key: idempotencyKey,
          fingerprint,
        },
        audit: {
          actorUserId: authority.userId,
          organizationId: authority.workspaceId,
          action: "account.avatar.update",
          ip: context.ip || req.socket.remoteAddress || "",
          userAgent: context.userAgent || readString(req.headers["user-agent"], 240),
          metadata: {
            contentType: validatedFile.contentType,
            byteSize: buffer.length,
            sha256: checksum,
          },
        },
      },
    });
    if (receipt.replayed) res.setHeader("Idempotency-Replayed", "true");
    if (!canonicalRequest) {
      const refreshedUser =
        (await refreshAuthenticatedAuthorization(user)) ||
        (await repositories?.users?.findById?.(user.id)) ||
        db.users.find((u) => u.id === user.id);
      sendJson(res, receipt.replayed ? 200 : 201, {
        ...receipt,
        user: publicUser(refreshedUser || user),
      });
      return;
    }
    sendJson(res, receipt.replayed ? 200 : 201, receipt);
    return;
  }

  if (segments.length === 3 && segments[2] === "avatar" && method === "DELETE") {
    if (!repositories?.avatarMutations) {
      throw httpError(503, "Avatar mutation storage is unavailable", "AVATAR_STORAGE_UNAVAILABLE");
    }
    const requestPath = parseRequestPath(req).pathname;
    const canonicalRequest = requestPath === "/api/v1/me/avatar";
    if (!canonicalRequest) {
      requestMetrics.legacyAvatarMutation += 1;
      res.setHeader("Deprecation", "true");
      res.setHeader("X-Shcare-Compatibility-Alias", "account-avatar");
    }
    const canonicalUser = await refreshAuthenticatedAuthorization(user);
    if (!canonicalUser || !isActiveUserAccount(canonicalUser)) {
      throw httpError(403, "Avatar deletion requires an active account", "ACCOUNT_INACTIVE");
    }
    const organizationId = canonicalUser.organizationId || getUserWorkspaceContext(canonicalUser).currentWorkspaceId;
    if (!organizationId) {
      throw httpError(403, "Avatar deletion requires an active workspace", "AVATAR_WORKSPACE_SCOPE_DENIED");
    }
    const authority = resolveAvatarMutationAuthority(
      req,
      canonicalUser,
      organizationId,
      canonicalRequest,
    );
    let expectedAvatarFileId = readString(canonicalUser.avatarFileId, 160);
    if (canonicalRequest) {
      const payload = await readJsonBody(req);
      if (
        !payload ||
        typeof payload !== "object" ||
        Array.isArray(payload) ||
        Object.keys(payload).length !== 1 ||
        !Object.prototype.hasOwnProperty.call(payload, "expectedAvatarFileId")
      ) {
        throw httpError(400, "Avatar deletion accepts only expectedAvatarFileId", "AVATAR_DELETE_PAYLOAD_INVALID");
      }
      expectedAvatarFileId = readString(payload.expectedAvatarFileId, 160);
    }
    if (!expectedAvatarFileId) {
      throw httpError(400, "Active avatar identity is required", "AVATAR_PRECONDITION_REQUIRED");
    }
    const suppliedIdempotencyKey = getIdempotencyKey(req, {});
    if (canonicalRequest && !suppliedIdempotencyKey) {
      getRequiredIdempotencyKey(req, {}, "avatar deletion");
    }
    const idempotencyKey = suppliedIdempotencyKey || `legacy-avatar-delete-${createId("idem")}`;
    const fingerprint = createIdempotencyFingerprint({
      userId: authority.userId,
      organizationId: authority.workspaceId,
      authSessionId: authority.authSessionId,
      expectedAvatarFileId,
    });
    const operationId = `avatar_delete_${createIdempotencyFingerprint({
      userId: authority.userId,
      authSessionId: authority.authSessionId,
      operation: "account.avatar.delete",
      key: idempotencyKey,
    }).slice(0, 24)}`;
    if (!storageAdapter) {
      storageAdapter = createStorageAdapter({ dataDir: DATA_DIR, env: process.env });
    }
    const context = getRequestContext(req) || createRequestContext(req);
    const receipt = await executeAvatarDeleteMutation({
      repository: repositories.avatarMutations,
      storageAdapter,
      input: {
        userId: authority.userId,
        organizationId: authority.workspaceId,
        authSessionId: authority.authSessionId,
        operationId,
        expectedAvatarFileId,
        idempotency: {
          scope: authority.userId,
          operation: "account.avatar.delete",
          key: idempotencyKey,
          fingerprint,
        },
        audit: {
          actorUserId: authority.userId,
          organizationId: authority.workspaceId,
          action: "account.avatar.delete",
          ip: context.ip || req.socket.remoteAddress || "",
          userAgent: context.userAgent || readString(req.headers["user-agent"], 240),
        },
      },
    });
    if (receipt.replayed) res.setHeader("Idempotency-Replayed", "true");
    if (!canonicalRequest) {
      const refreshedUser =
        (await refreshAuthenticatedAuthorization(user)) ||
        (await repositories?.users?.findById?.(user.id)) ||
        db.users.find((u) => u.id === user.id);
      sendJson(res, 200, {
        ...receipt,
        user: publicUser(refreshedUser || user),
      });
      return;
    }
    sendJson(res, 200, receipt);
    return;
  }

  if (segments.length === 3 && segments[2] === "password" && method === "POST") {
    const payload = await readJsonBody(req);
    getRequiredIdempotencyKey(req, {}, "password change");
    const canonicalPasswordRoute = isCanonicalPasswordChangeRequest(req);
    if (canonicalPasswordRoute) {
      assertCanonicalPasswordChangePayload(payload);
    }
    const currentPassword = readPasswordSecret(payload.currentPassword, "current");
    const nextPassword = readPasswordSecret(
      canonicalPasswordRoute ||
        Object.prototype.hasOwnProperty.call(payload, "newPassword")
        ? payload.newPassword
        : payload.password,
      "new",
    );
    assertStrongPasswordSecret(currentPassword, nextPassword);

    const canonicalUser = await refreshAuthenticatedAuthorization(user);
    if (
      !canonicalUser ||
      canonicalUser.id !== user.id ||
      !isActiveUserAccount(canonicalUser)
    ) {
      throw httpError(
        403,
        "Password changes require the same active account that opened the screen",
        "PASSWORD_CHANGE_AUTHORITY_STALE",
      );
    }

    const provider =
      FIREBASE_AUTH_ENABLED && canonicalUser.firebaseUid ? "firebase" : "demo";
    let firebasePasswordProof = null;

    const saga = await runIdentityProviderSaga(
      req,
      canonicalUser,
      canonicalUser,
      "reset_password",
      { currentPassword, newPassword: nextPassword },
      provider === "firebase"
        ? () => {
            if (!firebasePasswordProof) {
              throw httpError(
                503,
                "Firebase current-password proof is unavailable",
                "FIREBASE_PASSWORD_VERIFIER_UNAVAILABLE",
              );
            }
            return updateFirebaseLinkedAccount(canonicalUser, {
              password: nextPassword,
            });
          }
        : async () => {
            await repositories.users.updatePasswordExact(
              canonicalUser.id,
              nextPassword,
            );
            return { updated: true, skipped: true };
          },
      {
        targetState: { provider },
        requireActiveTarget: true,
        preserveAccountStatus: true,
        ...(provider === "demo"
          ? { expectedCurrentPassword: currentPassword }
          : {}),
        preserveSessionId: req.authSession?.id || "",
        beforeBegin:
          provider === "firebase"
            ? async () => {
                if (req.authSource !== "firebase" || !req.firebaseToken) {
                  throw httpError(
                    401,
                    "Đổi mật khẩu Firebase cần phiên Firebase đã xác thực",
                    "FIREBASE_REAUTH_REQUIRED",
                  );
                }
                const authenticatedFirebaseUid = readString(
                  req.firebaseToken.uid || req.firebaseToken.sub,
                  160,
                );
                if (
                  !authenticatedFirebaseUid ||
                  authenticatedFirebaseUid !== canonicalUser.firebaseUid
                ) {
                  throw httpError(
                    403,
                    "Firebase password proof belongs to another account",
                    "FIREBASE_PASSWORD_PROOF_ACCOUNT_MISMATCH",
                  );
                }
                const authenticatedAt = Number(
                  getFirebaseAuthenticationTime(req.firebaseToken),
                );
                if (
                  !Number.isFinite(authenticatedAt) ||
                  Date.now() / 1000 - authenticatedAt > 300
                ) {
                  throw httpError(
                    401,
                    "Hãy xác thực lại tài khoản Firebase trước khi đổi mật khẩu",
                    "FIREBASE_RECENT_LOGIN_REQUIRED",
                  );
                }
                const firebaseAdminApp = getFirebaseAdmin(process.env);
                if (!firebaseAdminApp) {
                  throw httpError(
                    503,
                    "Firebase current-password verification is unavailable",
                    "FIREBASE_PASSWORD_VERIFIER_UNAVAILABLE",
                  );
                }
                firebasePasswordProof = await createFirebasePasswordProof({
                  targetUser: canonicalUser,
                  authenticatedFirebaseUid,
                  currentPassword,
                  env: process.env,
                  verifyIdToken: (idToken) =>
                    firebaseAdminApp.auth().verifyIdToken(idToken, true),
                });
                firebasePasswordProof.consume(canonicalUser);
              }
            : async () => {
                assertDemoAuthAllowed();
              },
      },
    );
    const receiptUser = saga.completed.user;
    if (
      !receiptUser ||
      receiptUser.id !== canonicalUser.id ||
      !isActiveUserAccount(receiptUser)
    ) {
      throw httpError(
        409,
        "Password change receipt does not match an active account",
        "PASSWORD_CHANGE_RECEIPT_INVALID",
      );
    }
    let identityOperation = saga.completed.identityOperation;
    const operationId = identityOperation.id;
    const receiptProvider = resolveDurablePasswordProvider(
      identityOperation,
    );
    if (!["firebase", "demo"].includes(receiptProvider)) {
      throw httpError(
        409,
        "Password change receipt is missing its durable identity provider",
        "PASSWORD_CHANGE_RECEIPT_INVALID",
      );
    }
    if (!readString(identityOperation.targetState?.provider, 20)) {
      if (
        typeof repositories.identityOperations.backfillPasswordProvider !==
        "function"
      ) {
        throw httpError(
          503,
          "Password provider receipt repair is unavailable",
          "IDENTITY_OPERATION_STORAGE_UNAVAILABLE",
        );
      }
      const repaired =
        await repositories.identityOperations.backfillPasswordProvider({
          operationId,
          provider: receiptProvider,
        });
      identityOperation = repaired.identityOperation;
    }
    await appendAudit("account.password.change", req, {
      id: `audit_password_change_${operationId}`,
      actorUserId: receiptUser.id,
      organizationId: receiptUser.organizationId || "",
      resourceType: "user",
      resourceId: receiptUser.id,
      metadata: { operationId, provider: receiptProvider },
    });
    await createBackendNotification({
      id: `noti_password_change_${operationId}`,
      createOnce: true,
      type: "success",
      title: "Đã đổi mật khẩu",
      message:
        receiptProvider === "firebase"
          ? "Mật khẩu Firebase của tài khoản vừa được cập nhật."
          : "Mật khẩu tài khoản vừa được cập nhật.",
      userId: receiptUser.id,
      organizationId: receiptUser.organizationId || "",
      metadata: {
        operationId,
        provider: receiptProvider,
        destination: "security_settings",
      },
    });
    const completedAt = identityOperation.completedAt || nowIso();
    let ancillaryChanged = false;
    const priorPasswordUpdatedAt = Date.parse(
      db.settings.privacy.passwordUpdatedAt || "",
    );
    const completedAtMs = Date.parse(completedAt);
    if (
      !Number.isFinite(priorPasswordUpdatedAt) ||
      (Number.isFinite(completedAtMs) &&
        completedAtMs > priorPasswordUpdatedAt)
    ) {
      db.settings.privacy.passwordUpdatedAt = completedAt;
      ancillaryChanged = true;
    }
    const accessLogId = `log_password_change_${operationId}`;
    if (
      !db.accessLogs.some(
        (entry) =>
          entry.id === accessLogId ||
          (entry.operationId === operationId &&
            entry.userId === receiptUser.id),
      )
    ) {
      addAccessLog("Đổi mật khẩu tài khoản", {
        id: accessLogId,
        severity: "success",
        userId: receiptUser.id,
        operationId,
        createdAt: completedAt,
      });
      ancillaryChanged = true;
    }
    if (ancillaryChanged) {
      await saveDb();
    }
    sendJson(res, 200, {
      ok: true,
      user: { id: receiptUser.id },
      provider: receiptProvider,
      operationId,
      replayed: Boolean(saga.replayed),
    });
    return;
  }

  if (segments.length === 3 && segments[2] === "2fa" && method === "POST") {
    throw httpError(
      410,
      "Endpoint bật 2FA cũ đã bị loại bỏ; hãy dùng quy trình enroll và verify.",
      "TWO_FACTOR_LEGACY_ENDPOINT_REMOVED",
      {
        statusPath: "/api/v1/me/2fa",
        enrollPath: "/api/v1/me/2fa/enroll",
        verifyPath: "/api/v1/me/2fa/verify",
        disablePath: "/api/v1/me/2fa/disable",
      },
    );
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
    sendJson(res, 200, {
      ok: true,
      update: buildAiUpdateStatus(process.env),
    });
    return;
  }

  if (segments.length === 4 && segments[2] === "ai" && segments[3] === "update" && method === "POST") {
    requireAnyCapability(user, ["platform.settings.manage", "workspace.settings.manage"], "Không có quyền cập nhật AI");
    throw httpError(
      503,
      "Chưa có nhà cung cấp cập nhật mô hình lâm sàng được cấu hình",
      "AI_MODEL_UPDATE_UNAVAILABLE",
      { update: buildAiUpdateStatus(process.env) },
    );
  }

  if (segments.length === 2 && method === "PATCH") {
    requireAnyCapability(user, ["platform.settings.manage", "workspace.settings.manage"], "Không có quyền cập nhật cài đặt");
    const payload = await readJsonBody(req);
    const currentSettings = getEffectiveSettingsForUser(user);
    const patch = parseSettingsPatch(payload, currentSettings);
    const { settings, workspace } = getMutableSettingsForUser(user);
    const nextSettings = {
      ...settings,
      ...patch,
    };
    await persistMutableSettings(user, nextSettings, workspace);
    addAccessLog(isPlatformAdminUser(user) ? "Cập nhật cài đặt nền tảng" : "Cập nhật cài đặt workspace");
    sendJson(res, 200, { settings: publicSettings(user) });
    return;
  }

  sendJson(res, 404, { error: "Settings route not found" });
}

async function handleNotificationsApi(req, res, segments) {
  const method = req.method || "GET";
  const user = requireUser(req);
  const context = getRequestContext(req) || createRequestContext(req);

  if (
    segments.length === 3 &&
    segments[2] === "inbox" &&
    method === "GET"
  ) {
    const authority = requireNotificationInboxAuthority(user);
    const notifications = await repositories.notifications.listInbox(authority);
    sendJson(res, 200, {
      ...authority,
      notifications,
      updatedAt: nowIso(),
    });
    return;
  }

  if (
    segments.length === 4 &&
    segments[2] === "inbox" &&
    segments[3] === "read-all" &&
    method === "POST"
  ) {
    const authority = requireNotificationInboxAuthority(user);
    const payload = await readJsonBody(req);
    const idempotencyKey = getRequiredIdempotencyKey(
      req,
      payload,
      "notification inbox read-all",
    );
    const action = "read_all";
    const result = await repositories.notifications.mutateInboxWithAudit(
      {
        ...authority,
        action,
      },
      {
        actorUserId: user.id,
        organizationId: authority.workspaceId,
        authorization: {
          kind: "self",
          actorUserId: user.id,
        },
        ip: context.ip || "",
        userAgent: context.userAgent || "",
      },
      {
        scope: `${authority.userId}:${authority.workspaceId}`,
        operation: `notification.inbox.${action}`,
        key: idempotencyKey,
        fingerprint: createIdempotencyFingerprint({
          ...authority,
          action,
          notificationId: "",
        }),
      },
    );
    sendJson(
      res,
      result.responseStatus || 200,
      publicNotificationInboxMutation(result),
    );
    return;
  }

  if (
    segments.length === 5 &&
    segments[2] === "inbox" &&
    segments[4] === "read" &&
    method === "POST"
  ) {
    const authority = requireNotificationInboxAuthority(user);
    const notificationId = decodeURIComponent(segments[3]);
    const payload = await readJsonBody(req);
    const idempotencyKey = getRequiredIdempotencyKey(
      req,
      payload,
      "notification inbox read",
    );
    const action = "read";
    const result = await repositories.notifications.mutateInboxWithAudit(
      {
        ...authority,
        action,
        notificationId,
      },
      {
        actorUserId: user.id,
        organizationId: authority.workspaceId,
        authorization: {
          kind: "self",
          actorUserId: user.id,
        },
        ip: context.ip || "",
        userAgent: context.userAgent || "",
      },
      {
        scope: `${authority.userId}:${authority.workspaceId}`,
        operation: `notification.inbox.${action}`,
        key: idempotencyKey,
        fingerprint: createIdempotencyFingerprint({
          ...authority,
          action,
          notificationId,
        }),
      },
    );
    sendJson(
      res,
      result.responseStatus || 200,
      publicNotificationInboxMutation(result),
    );
    return;
  }

  if (
    segments.length === 4 &&
    segments[2] === "inbox" &&
    method === "DELETE"
  ) {
    const authority = requireNotificationInboxAuthority(user);
    const notificationId = decodeURIComponent(segments[3]);
    const idempotencyKey = getRequiredIdempotencyKey(
      req,
      {},
      "notification inbox delete",
    );
    const action = "delete";
    const result = await repositories.notifications.mutateInboxWithAudit(
      {
        ...authority,
        action,
        notificationId,
      },
      {
        actorUserId: user.id,
        organizationId: authority.workspaceId,
        authorization: {
          kind: "self",
          actorUserId: user.id,
        },
        ip: context.ip || "",
        userAgent: context.userAgent || "",
      },
      {
        scope: `${authority.userId}:${authority.workspaceId}`,
        operation: `notification.inbox.${action}`,
        key: idempotencyKey,
        fingerprint: createIdempotencyFingerprint({
          ...authority,
          action,
          notificationId,
        }),
      },
    );
    sendJson(
      res,
      result.responseStatus || 200,
      publicNotificationInboxMutation(result),
    );
    return;
  }

  if (segments.length === 3 && segments[2] === "options" && method === "GET") {
    requireAnyCapability(
      user,
      NOTIFICATION_MANAGE_CAPABILITIES,
      "Không có quyền xem tùy chọn gửi thông báo",
    );
    sendJson(res, 200, getNotificationAudienceOptions(user));
    return;
  }

  if (
    segments.length === 5 &&
    segments[2] === "campaigns" &&
    segments[4] === "refresh" &&
    method === "POST"
  ) {
    requireAnyCapability(
      user,
      NOTIFICATION_MANAGE_CAPABILITIES,
      "KhĂ´ng cĂ³ quyá»n xem tráº¡ng thĂ¡i chiáº¿n dá»‹ch thĂ´ng bĂ¡o",
    );
    const campaignId = readString(segments[3], 160);
    const campaignRows = await repositories.notifications.listCampaign(campaignId);
    if (campaignRows.length === 0) {
      throw httpError(404, "Notification campaign was not found", "NOTIFICATION_CAMPAIGN_NOT_FOUND");
    }
    const organizationId = readString(campaignRows[0].organizationId, 120);
    const allowedWorkspaceIds = new Set(
      getNotificationAudienceOptions(user).audiences.workspaces.map((workspace) => workspace.id),
    );
    if (
      !organizationId ||
      !allowedWorkspaceIds.has(organizationId) ||
      campaignRows.some((notification) => notification.organizationId !== organizationId)
    ) {
      throw httpError(
        403,
        "Notification campaign is outside the current authority scope",
        "NOTIFICATION_CAMPAIGN_FORBIDDEN",
      );
    }
    let providerRefreshFailures = 0;
    for (let offset = 0; offset < campaignRows.length; offset += 4) {
      const batch = campaignRows.slice(offset, offset + 4);
      await Promise.all(
        batch.map((notification) =>
          refreshBrevoNotificationDelivery(notification).catch(() => {
            providerRefreshFailures += 1;
            return notification;
          }),
        ),
      );
    }
    const refreshedRows = await repositories.notifications.listCampaign(campaignId);
    sendJson(res, 200, {
      ...buildNotificationCampaignReceipt(refreshedRows),
      providerRefresh: {
        attempted: campaignRows.filter((notification) =>
          ["sent", "deferred", "soft_bounce"].includes(notification.emailStatus),
        ).length,
        failed: providerRefreshFailures,
      },
    });
    return;
  }

  if (segments.length === 2 && method === "GET") {
    const notifications = repositories ? await repositories.notifications.list() : db.notifications;
    sendJson(res, 200, {
      notifications: filterNotificationsForUser(user, notifications).map(publicNotificationRecipient),
    });
    return;
  }

  if (segments.length === 2 && method === "POST") {
    requireAnyCapability(
      user,
      NOTIFICATION_MANAGE_CAPABILITIES,
      "Không có quyền tạo thông báo cho workspace",
    );
    const payload = await readJsonBody(req);
    const idempotencyKey = getRequiredIdempotencyKey(req, payload, "notification campaign creation");
    const normalized = normalizeNotificationCampaignRequest({
      ...payload,
      organizationId:
        readString(payload.organizationId, 120) ||
        (!isPlatformAdminUser(user) ? getUserWorkspaceContext(user).currentWorkspaceId || "" : ""),
    });
    const resolved = resolveNotificationCampaignAudience(user, normalized);
    const fingerprint = createIdempotencyFingerprint({
      ...normalized,
      recipientUserIds: resolved.users.map((targetUser) => targetUser.id).sort(),
    });
    const result = await repositories.notifications.createCampaignWithAudit(
      {
        actorUserId: user.id,
        organizationId: resolved.workspace.id,
        audience: normalized.audience,
        requestedChannels: normalized.channels,
        recipients: resolved.recipients,
        type: normalized.type,
        title: normalized.title,
        message: normalized.message,
        metadata: { actionPath: "/portal/notifications" },
      },
      {
        actorUserId: user.id,
        organizationId: resolved.workspace.id,
        ip: context.ip || "",
        userAgent: context.userAgent || "",
      },
      {
        scope: `${user.id}:${resolved.workspace.id}`,
        operation: "notification.campaign.create",
        key: idempotencyKey,
        fingerprint,
      },
    );
    if (!result.replayed) {
      for (const notification of result.notifications) {
        if (notification.emailStatus === "ready") queueDirectNotificationEmail(notification);
        if (notification.pushStatus === "ready") queueNotificationPush(notification);
      }
    }
    sendJson(res, result.responseStatus || 201, {
      campaign: result.campaign,
      notifications: result.notifications.map(publicNotificationRecipient),
      notification: result.notifications[0]
        ? publicNotificationRecipient(result.notifications[0])
        : null,
      idempotent: result.replayed,
      channelAvailability: resolved.channelAvailability,
    });
    return;
  }

  if (segments.length === 2 && method === "DELETE") {
    requireAnyCapability(
      user,
      NOTIFICATION_MANAGE_CAPABILITIES,
      "Không có quyền xóa thông báo của workspace",
    );
    const scopedNotifications = filterNotificationsForUser(user, repositories ? await repositories.notifications.list() : db.notifications);
    const count = scopedNotifications.length;
    if (repositories) {
      await repositories.notifications.mutateMany(
        "delete",
        scopedNotifications.map((notification) => notification.id),
        context,
      );
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
      await repositories.notifications.mutateMany(
        "read",
        notifications.map((notification) => notification.id),
        context,
      );
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
    const sessionUser = requirePrimarySessionUser(req);
    const payload = await readJsonBody(req);
    const fcmToken = readString(payload.fcmToken, 4096);
    if (!isValidFcmRegistrationToken(fcmToken)) {
      throw httpError(
        400,
        "FCM token has an invalid format",
        "INVALID_NOTIFICATION_DEVICE_TOKEN",
      );
    }
    const authSessionId = readString(req.authSession?.id, 160);
    if (!authSessionId) {
      throw httpError(
        401,
        "Notification registration requires a current authenticated session",
        "AUTH_SESSION_BINDING_MISSING",
      );
    }
    const authSessionActive = await repositories.authSessions.isActiveForUser(
      sessionUser.id,
      authSessionId,
    );
    if (!authSessionActive) {
      throw httpError(401, "Authentication session has been revoked", "AUTH_SESSION_REVOKED");
    }
    const workspaceContext = getUserWorkspaceContext(sessionUser);
    const workspaceId = readString(workspaceContext.currentWorkspaceId, 120);
    if (
      !workspaceId ||
      !workspaceContext.currentMembership?.operational ||
      !hasWorkspaceMembership(sessionUser, workspaceId)
    ) {
      throw httpError(
        403,
        "An active workspace membership is required to register notifications",
        "WORKSPACE_ACCESS_REQUIRED",
      );
    }
    const notificationProtocolVersion = Number(
      payload.notificationProtocolVersion ?? payload.protocolVersion,
    );
    if (
      !Number.isInteger(notificationProtocolVersion) ||
      notificationProtocolVersion < 2
    ) {
      throw httpError(
        400,
        "Notification protocol version 2 or newer is required",
        "NOTIFICATION_PROTOCOL_UNSUPPORTED",
      );
    }
    const device = await repositories.notificationDevices.register({
      userId: sessionUser.id,
      workspaceId,
      platform: readString(payload.platform, 40) || "android",
      fcmToken,
      authSessionId,
      notificationProtocolVersion,
      appVersion: readString(payload.appVersion, 80),
      enabled: payload.enabled !== false,
    });
    const [sessionStillActive, canonicalUser] = await Promise.all([
      repositories.authSessions.isActiveForUser(sessionUser.id, authSessionId),
      refreshAuthenticatedAuthorization(sessionUser),
    ]);
    const canonicalWorkspaceId = canonicalUser
      ? getUserWorkspaceContext(canonicalUser).currentWorkspaceId || ""
      : "";
    if (
      !sessionStillActive ||
      !canonicalUser ||
      !isActiveUserAccount(canonicalUser) ||
      canonicalWorkspaceId !== workspaceId ||
      !hasWorkspaceMembership(canonicalUser, workspaceId)
    ) {
      await repositories.notificationDevices.disableToken(sessionUser.id, fcmToken, {
        workspaceId,
        authSessionId,
      });
      if (!sessionStillActive || !canonicalUser || !isActiveUserAccount(canonicalUser)) {
        throw httpError(
          401,
          "Notification registration lost its authenticated account binding",
          "NOTIFICATION_REGISTRATION_REAUTH_REQUIRED",
        );
      }
      throw httpError(
        409,
        "The active workspace changed while registering notifications",
        "NOTIFICATION_WORKSPACE_BINDING_CHANGED",
      );
    }
    let acknowledgedDevice = device;
    if (device.enabled !== false) {
      acknowledgedDevice = (
        await repositories.notificationDevices.listForUser(sessionUser.id, workspaceId, {
          minimumProtocolVersion: notificationProtocolVersion,
        })
      ).find(
        (candidate) =>
          candidate.id === device.id &&
          candidate.fcmToken === fcmToken &&
          candidate.authSessionId === authSessionId,
      );
      if (!acknowledgedDevice) {
        throw httpError(
          409,
          "The notification token binding changed before registration was acknowledged",
          "NOTIFICATION_TOKEN_BINDING_CHANGED",
        );
      }
    }
    sendJson(res, 200, { device: acknowledgedDevice });
    return;
  }

  if (segments.length === 3 && segments[2] === "unregister-device" && method === "POST") {
    const sessionUser = requirePrimarySessionUser(req);
    const payload = await readJsonBody(req);
    const fcmToken = readString(payload.fcmToken, 4096);
    if (!fcmToken) {
      throw httpError(400, "FCM token is required");
    }
    const workspaceId = getUserWorkspaceContext(sessionUser).currentWorkspaceId || "";
    const authSessionId = readString(req.authSession?.id, 160);
    if (!workspaceId || !authSessionId) {
      throw httpError(
        401,
        "Notification unregistration requires the current workspace session",
        "AUTH_SESSION_BINDING_MISSING",
      );
    }
    const device = await repositories.notificationDevices.disableToken(
      sessionUser.id,
      fcmToken,
      { workspaceId, authSessionId },
    );
    sendJson(res, 200, { unregistered: Boolean(device) });
    return;
  }

  const notificationSource = repositories
    ? await repositories.notifications.list()
    : db.notifications;
  const notification = segments[2]
    ? filterNotificationsForUser(user, notificationSource).find(
        (item) => item.id === decodeURIComponent(segments[2]),
      )
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

  if (segments.length === 3 && method === "DELETE") {
    const ownsDirectNotification = Boolean(notification.userId && notification.userId === user.id);
    if (!ownsDirectNotification) {
      requireAnyCapability(
        user,
        NOTIFICATION_MANAGE_CAPABILITIES,
        "Không có quyền xóa thông báo dùng chung",
      );
    }
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

function publicAuditLog(log) {
  const actor = db.users.find((user) => user.id === log.actorUserId) || null;
  const organization = db.organizations.find((workspace) => workspace.id === log.organizationId) || null;
  const metadata = sanitizeAuditMetadata(log.metadata || {});
  const declaredOutcome = String(metadata.outcome || metadata.status || "").toLowerCase();
  return {
    id: log.id || "",
    actorUserId: log.actorUserId || "",
    actorName: actor?.name || actor?.email || "",
    actorRole: actor?.role || "",
    workspaceId: log.organizationId || "",
    organizationId: log.organizationId || "",
    organizationName: organization?.name || "",
    action: log.action || "",
    resourceType: log.resourceType || "",
    resourceId: log.resourceId || "",
    outcome: ["success", "failure", "warning", "denied"].includes(declaredOutcome)
      ? declaredOutcome
      : "recorded",
    ip: log.ip || "",
    userAgent: log.userAgent || "",
    metadata,
    createdAt: log.createdAt || "",
  };
}

async function handleAuditLogsApi(req, res, url, segments) {
  const user = requireUser(req);
  if (segments.length === 2 && (req.method || "GET") === "GET") {
    requireAnyCapability(user, AUDIT_LOG_VIEW_CAPABILITIES, "Không có quyền xem audit log");
    const workspaceContext = getUserWorkspaceContext(user);
    const requestedOrganizationId = readString(url.searchParams.get("organizationId"), 120);
    if (
      !isPlatformAdminUser(user) &&
      requestedOrganizationId &&
      requestedOrganizationId !== workspaceContext.currentWorkspaceId
    ) {
      throw httpError(403, "Audit log workspace is outside the current workspace", "AUDIT_SCOPE_DENIED");
    }
    const organizationId = isPlatformAdminUser(user)
      ? requestedOrganizationId
      : workspaceContext.currentWorkspaceId || "";
    if (!isPlatformAdminUser(user) && !organizationId) {
      throw httpError(403, "Select an operational workspace before viewing audit logs", "AUDIT_WORKSPACE_REQUIRED");
    }
    let filters;
    try {
      filters = normalizeAuditLogQuery({
        organizationId,
        q: url.searchParams.get("q"),
        action: url.searchParams.get("action"),
        resourceType: url.searchParams.get("resourceType"),
        actorUserId: url.searchParams.get("actorUserId"),
        startDate: url.searchParams.get("startDate"),
        endDate: url.searchParams.get("endDate"),
        page: url.searchParams.get("page"),
        limit: url.searchParams.get("limit"),
        sort: url.searchParams.get("sort"),
      });
    } catch (error) {
      throw httpError(400, error.message, error.code || "AUDIT_FILTER_INVALID", {
        field: error.field || "",
      });
    }
    const pageResult = await repositories.auditLogs.list(filters);
    setWorkspacePaginationHeaders(res, pageResult);
    const pageCount = pageResult.total === 0 ? 0 : Math.ceil(pageResult.total / pageResult.limit);
    sendJson(res, 200, {
      logs: pageResult.items.map(publicAuditLog),
      pagination: {
        page: pageResult.page,
        limit: pageResult.limit,
        total: pageResult.total,
        pageCount,
        hasNextPage: pageResult.page < pageCount,
        sort: pageResult.sort,
      },
    });
    return;
  }
  sendJson(res, 404, { error: "Audit log route not found" });
}

async function handleDevicesApi(req, res, url, segments) {
  const method = req.method || "GET";
  const user = requireUser(req);
  const requestPath = String(req.url || "").split("?", 1)[0];
  if (/^\/api\/devices(?:\/|$)/.test(requestPath)) {
    res.setHeader("Deprecation", "true");
    res.setHeader("X-Shcare-Compatibility-Alias", "/api/v1/devices");
  }

  if (segments.length === 2 && method === "GET") {
    if (repositories) {
      await repositories.devices.list();
    }
    refreshDevicePresence();
    const deviceStatus = readString(url.searchParams.get("status"), 40).toLowerCase();
    const scopedDevices = filterDevicesForUser(user, db.devices);
    const deviceSummary = scopedDevices.reduce(
      (summary, item) => {
        const online = Boolean(getAuthenticatedDeviceSocket(item));
        summary.total += 1;
        summary.online += online ? 1 : 0;
        summary.offline += online ? 0 : 1;
        summary.revoked += item.status === "revoked" || item.revokedAt ? 1 : 0;
        const otaStatus = item.ota ? normalizeDeviceOtaStatus(item.ota.status) : "";
        if (otaStatus && !["confirmed", "rolled_back", "failed"].includes(otaStatus)) {
          summary.otaPending += 1;
        }
        return summary;
      },
      { total: 0, online: 0, offline: 0, revoked: 0, otaPending: 0 },
    );
    const deviceSource = scopedDevices.filter((item) => {
      const online = Boolean(getAuthenticatedDeviceSocket(item));
      const matchesStatus =
        !deviceStatus ||
        deviceStatus === "all" ||
        (deviceStatus === "online" && online) ||
        (deviceStatus === "offline" && !online) ||
        (deviceStatus === "revoked" && (item.status === "revoked" || Boolean(item.revokedAt)));
      return matchesStatus;
    });
    const pageResult = resolveAdminListPage(deviceSource, url, {
      searchFields: [
        (item) => item.id,
        (item) => item.name,
        (item) => item.serialNumber,
        (item) => item.firmwareVersion,
        (item) => item.wifiSsid,
        (item) => item.ipAddress || item.ip,
        (item) => item.organizationId,
      ],
      sortFields: {
        name: (item) => item.name,
        createdAt: (item) => item.createdAt,
        updatedAt: (item) => item.updatedAt,
        lastSeenAt: (item) => item.lastSeenAt,
        status: (item) => item.presenceStatus || item.status,
      },
      defaultSort: "lastSeenAt:desc",
    });
    setWorkspacePaginationHeaders(res, pageResult);
    sendJson(res, 200, { devices: publicDevices(pageResult.items), summary: deviceSummary });
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
    if (!isPlatformAdminUser(user)) {
      throw httpError(
        403,
        "Only a platform device administrator can provision device identity and claim material",
        "DEVICE_PROVISION_PLATFORM_ADMIN_REQUIRED",
      );
    }
    const payload = await readJsonBody(req);
    const allowedProvisionFields = new Set([
      "deviceId",
      "organizationId",
      "name",
      "type",
      "manufacturer",
      "model",
      "serialNumber",
      "purchaseDate",
      "idempotencyKey",
    ]);
    const forbiddenProvisionField = Object.keys(payload).find(
      (field) => !allowedProvisionFields.has(field),
    );
    if (forbiddenProvisionField) {
      const isCredentialField = [
        "deviceSecret",
        "secret",
        "secretHash",
        "enrollmentSecret",
      ].includes(forbiddenProvisionField);
      throw httpError(
        400,
        isCredentialField
          ? "Device credentials can only be installed by the factory-enrollment channel"
          : `Field ${forbiddenProvisionField} cannot be supplied while provisioning claim material`,
        isCredentialField
          ? "DEVICE_PROVISION_CREDENTIAL_FIELD_FORBIDDEN"
          : "DEVICE_PROVISION_FIELD_FORBIDDEN",
        { field: forbiddenProvisionField },
      );
    }
    if (!Object.prototype.hasOwnProperty.call(payload, "deviceId")) {
      throw httpError(
        400,
        "An existing factory-enrolled device id is required for claim provisioning",
        "DEVICE_ID_REQUIRED",
      );
    }
    const deviceId = assertCanonicalDeviceId(payload.deviceId);
    const idempotencyKey = getIdempotencyKey(req, payload);
    const idempotencyOperation = "device.provision";
    const idempotencyFingerprint = createIdempotencyFingerprint(payload);
    if (!idempotencyKey) {
      throw httpError(
        400,
        "Idempotency-Key is required for device provisioning",
        "IDEMPOTENCY_KEY_REQUIRED",
      );
    }
    const requestedType = readString(payload.type, 40);
    if (requestedType && !["stethoscope", "respiratory", "other"].includes(requestedType)) {
      throw httpError(400, "Device type is unsupported", "DEVICE_TYPE_UNSUPPORTED");
    }
    const purchaseDate = readString(payload.purchaseDate, 20);
    if (purchaseDate) {
      const parsedPurchaseDate = new Date(`${purchaseDate}T00:00:00.000Z`);
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(purchaseDate) ||
        Number.isNaN(parsedPurchaseDate.getTime()) ||
        parsedPurchaseDate.toISOString().slice(0, 10) !== purchaseDate
      ) {
        throw httpError(400, "Purchase date must use a valid YYYY-MM-DD date", "DEVICE_PURCHASE_DATE_INVALID");
      }
    }
    const existingDevice = repositories
      ? await repositories.devices.findById(deviceId)
      : db.devices.find((item) => item.id === deviceId);
    const requestedOrganizationId = readString(payload.organizationId, 120);
    if (!existingDevice) {
      throw httpError(
        404,
        "The device must be enrolled by the factory channel before claim material can be provisioned",
        "DEVICE_FACTORY_ENROLLMENT_REQUIRED",
      );
    }
    assertCanAccessDevice(user, existingDevice);
    if (inferDeviceOwnershipState(existingDevice) !== "provisioned") {
      throw httpError(
        409,
        "An owned or revoked device cannot be reprovisioned; use the audited transfer or revoke workflow",
        "DEVICE_ALREADY_OWNED",
      );
    }
    if (
      requestedOrganizationId &&
      existingDevice.organizationId &&
      requestedOrganizationId !== existingDevice.organizationId
    ) {
      throw httpError(
        403,
        "Use the platform transfer endpoint to change a device workspace",
        "DEVICE_PROVISION_WORKSPACE_TRANSFER_REQUIRED",
      );
    }
    // Keep the hydrated runtime row unchanged until the audited mutation
    // commits, so a storage failure cannot leave a partial provision.
    const device = { ...existingDevice };
    if (!device.secretHash && device.secret) {
      device.secretHash = canonicalDeviceSecretHash(device.secret);
      delete device.secret;
    }
    if (!device.secretHash) {
      throw httpError(
        503,
        "The factory-enrolled device has no credential verification material",
        "DEVICE_FACTORY_CREDENTIAL_UNAVAILABLE",
      );
    }

    device.name = readString(payload.name, 120) || device.name;
    if (requestedType) device.type = requestedType;
    for (const [field, maximum] of [
      ["manufacturer", 120],
      ["model", 120],
      ["serialNumber", 120],
    ]) {
      if (Object.prototype.hasOwnProperty.call(payload, field)) {
        device[field] = readString(payload[field], maximum);
      }
    }
    if (Object.prototype.hasOwnProperty.call(payload, "purchaseDate")) {
      device.purchaseDate = purchaseDate;
    }
    device.organizationId =
      device.organizationId || getWritableWorkspaceIdForUser(user, requestedOrganizationId || device.organizationId);
    const claimCode = deriveDeviceClaimCode(device, idempotencyKey, idempotencyFingerprint);
    device.claimCodeHash = hashValue(`${device.id}:${claimCode}`);
    device.claimCodeExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    device.status = "unclaimed";
    device.updatedAt = nowIso();
    const claim = {
      id: createId("claim"),
      deviceId: device.id,
      organizationId: device.organizationId,
      createdByUserId: user.id,
      claimCodeHash: device.claimCodeHash,
      expiresAt: device.claimCodeExpiresAt,
      claimedAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    // Validate the cross-client device identity and derive the setup material
    // before committing anything. The derived PoP is returned once/replayed
    // deterministically, but is never stored in the idempotency ledger.
    buildSecureSetupQrPayload(
      {
        deviceId: device.id,
        secretHash: device.secretHash,
        claimCode,
        claimExpiresAt: device.claimCodeExpiresAt,
      },
      { now: Date.now() },
    );
    const context = getRequestContext(req) || createRequestContext(req);
    const auditInput = {
      action: "device.provision",
      actorUserId: user.id,
      resourceType: "device",
      resourceId: device.id,
      organizationId: device.organizationId || "",
      ip: context.ip || "",
      userAgent: context.userAgent || "",
      metadata: {
        type: device.type,
        claimExpiresAt: device.claimCodeExpiresAt,
        hasManufacturer: Boolean(device.manufacturer),
        hasModel: Boolean(device.model),
        hasSerialNumber: Boolean(device.serialNumber),
        hasPurchaseDate: Boolean(device.purchaseDate),
      },
    };
    const safeResponseBody = {
      device: publicProvisionedDeviceReceipt(device),
      claim: {
        deviceId: device.id,
        expiresAt: device.claimCodeExpiresAt,
        qrPayload: {
          deviceId: device.id,
        },
      },
    };
    if (!repositories?.devices?.saveProvisionWithAudit) {
      throw httpError(
        503,
        "Audited device provisioning storage is unavailable",
        "DEVICE_PROVISION_STORAGE_UNAVAILABLE",
      );
    }
    const persistenceResult = await repositories.devices.saveProvisionWithAudit(
      device,
      claim,
      auditInput,
      {
        scope: getIdempotencyScope(user, device.organizationId),
        operation: idempotencyOperation,
        key: idempotencyKey,
        fingerprint: idempotencyFingerprint,
      },
      safeResponseBody,
      201,
    );
    const persistedResponse = persistenceResult.responseBody || safeResponseBody;
    const persistedDevice = persistedResponse.device || safeResponseBody.device;
    const replayClaimCode = deriveDeviceClaimCode(
      {
        ...device,
        id: persistedDevice.id,
        organizationId: persistedDevice.organizationId || device.organizationId,
      },
      idempotencyKey,
      idempotencyFingerprint,
    );
    const secureSetupQrPayload = buildSecureSetupQrPayload(
      {
        deviceId: persistedDevice.id,
        secretHash: device.secretHash,
        claimCode: replayClaimCode,
        claimExpiresAt: persistedResponse.claim?.expiresAt || device.claimCodeExpiresAt,
      },
      { now: Date.now() },
    );
    if (!persistenceResult.replayed) {
      addAccessLog(`Tạo QR claim cho thiết bị ${device.name}`, {
        userId: user.id,
        organizationId: device.organizationId,
        ip: context.ip || "",
        severity: "info",
      });
      await saveDb();
    }
    sendJson(res, persistenceResult.responseStatus || 201, {
      ...persistedResponse,
      claim: {
        ...(persistedResponse.claim || {}),
        claimCode: replayClaimCode,
        qrPayload: secureSetupQrPayload,
      },
      ...(persistenceResult.replayed ? { idempotent: true } : {}),
    });
    return;
  }

  if (segments.length === 3 && segments[2] === "pair" && method === "POST") {
    const payload = await readJsonBody(req);
    const allowedPairingFields = new Set([
      "deviceId",
      "claimCode",
      "connectionMethod",
      "organizationId",
      "idempotencyKey",
    ]);
    const forbiddenPairingField = Object.keys(payload).find(
      (field) => !allowedPairingFields.has(field),
    );
    if (forbiddenPairingField) {
      throw httpError(
        400,
        `Field ${forbiddenPairingField} cannot be supplied while claiming a provisioned device`,
        "DEVICE_PAIRING_FIELD_FORBIDDEN",
        { field: forbiddenPairingField },
      );
    }
    if (!Object.prototype.hasOwnProperty.call(payload, "deviceId")) {
      throw httpError(
        400,
        "A provisioned device id is required for device claim",
        "DEVICE_ID_REQUIRED",
      );
    }
    const deviceId = assertCanonicalDeviceId(payload.deviceId);
    const claimCode = readString(payload.claimCode, 80);
    if (!claimCode) {
      throw httpError(
        400,
        "A one-time claim code is required for device claim",
        "DEVICE_CLAIM_REQUIRED",
      );
    }
    const connectionMethod = normalizeDevicePairingMethod(payload.connectionMethod, Boolean(claimCode));
    const requestedOrganizationId = readString(payload.organizationId, 120);
    if (!requestedOrganizationId) {
      throw httpError(
        400,
        "The active workspace organizationId is required for device claim",
        "DEVICE_CLAIM_WORKSPACE_REQUIRED",
        { field: "organizationId" },
      );
    }
    if (!isPlatformAdminUser(user)) {
      const workspaceContext = getUserWorkspaceContext(user);
      const currentWorkspaceId = readString(workspaceContext.currentWorkspaceId, 120);
      if (
        !currentWorkspaceId ||
        !workspaceContext.currentMembership?.operational
      ) {
        throw httpError(
          403,
          "An active exact workspace membership is required for device claim",
          "DEVICE_CLAIM_ACTIVE_WORKSPACE_REQUIRED",
        );
      }
      if (requestedOrganizationId !== currentWorkspaceId) {
        throw httpError(
          403,
          "Switch to the requested workspace before claiming this device",
          "DEVICE_CLAIM_ACTIVE_WORKSPACE_MISMATCH",
          {
            requestedOrganizationId,
            currentWorkspaceId,
          },
        );
      }
      const exactActiveMembership = workspaceContext.memberships.find(
        (membership) =>
          membership.workspaceId === requestedOrganizationId &&
          membership.operational === true,
      );
      if (!exactActiveMembership) {
        throw httpError(
          403,
          "An active exact workspace membership is required for device claim",
          "DEVICE_CLAIM_ACTIVE_WORKSPACE_REQUIRED",
        );
      }
    }
    const idempotencyKey = getIdempotencyKey(req, payload);
    const idempotencyOperation = "device.pair";
    const idempotencyFingerprint = createIdempotencyFingerprint({
      deviceId,
      organizationId: requestedOrganizationId,
      claimCode,
      connectionMethod,
    });
    let device = repositories ? await repositories.devices.findById(deviceId) : db.devices.find((item) => item.id === deviceId);
    if (!device) {
      throw httpError(
        404,
        "The device must be provisioned by a platform administrator before it can be claimed",
        "DEVICE_NOT_PROVISIONED",
      );
    }
    // Keep the hydrated projection unchanged until the audited transaction
    // consumes the claim and commits the ownership state.
    device = { ...device };
    if (inferDeviceOwnershipState(device) === "revoked") {
      throw httpError(
        403,
        "Thiết bị đã bị thu hồi",
        "DEVICE_CLAIM_REVOKED",
      );
    }
    if (!device.organizationId) {
      throw httpError(
        403,
        "The provisioned device is not bound to a workspace",
        "DEVICE_CLAIM_WORKSPACE_UNBOUND",
      );
    }
    if (requestedOrganizationId !== device.organizationId) {
      throw httpError(
        403,
        "The device claim belongs to a different workspace",
        "DEVICE_CLAIM_WORKSPACE_MISMATCH",
      );
    }
    const deviceWorkspaceId = getDeviceWorkspaceId(device);
    const isWorkspaceDeviceManager = hasWorkspaceDeviceCapability(
      user,
      deviceWorkspaceId,
      ["workspace.devices.manage"],
    );
    const isPersonalDeviceClaimant = Boolean(
      isPatientUser(user) &&
      isActiveUserAccount(user) &&
      hasWorkspaceDeviceCapability(user, deviceWorkspaceId, ["personal.devices.manage"]),
    );
    if (!isPlatformAdminUser(user) && !isWorkspaceDeviceManager && !isPersonalDeviceClaimant) {
      throw httpError(
        403,
        "The current actor cannot claim devices in this workspace",
        "DEVICE_CLAIM_CAPABILITY_REQUIRED",
      );
    }
    if (!idempotencyKey) {
      throw httpError(
        400,
        "Idempotency-Key is required for device pairing",
        "IDEMPOTENCY_KEY_REQUIRED",
      );
    }
    const initialOwnershipState = inferDeviceOwnershipState(device);
    if (!device.secretHash && device.secret) {
      device.secretHash = canonicalDeviceSecretHash(device.secret);
      delete device.secret;
    }
    if (!device.secretHash) {
      throw httpError(
        503,
        "The provisioned device has no verification material",
        "DEVICE_CLAIM_MATERIAL_UNAVAILABLE",
      );
    }

    const claimMutation = {
      organizationId: device.organizationId,
      claimCodeHash: hashValue(`${device.id}:${claimCode}`),
      claimedByUserId: user.id,
      at: nowIso(),
    };

    // The repository owns the idempotency receipt lookup and the canonical
    // ownership check under the same per-device lock/SQL transaction. A
    // claimed/assigned projection can therefore reach the repository only so
    // it can decide whether this is an authorized replay; a fresh mutation is
    // still accepted exclusively from the provisioned state there.
    if (initialOwnershipState === "provisioned") {
      Object.assign(
        device,
        applyDeviceOwnershipTransition(device, "claimed", {
          ownerUserId: user.id,
          at: claimMutation?.at || nowIso(),
        }),
      );
    }
    const pairing = createDevicePairingState(device);
    device.connected = pairing.onlineConfirmed;
    device.status = device.connected ? "connected" : "available";
    device.connectionMethod = connectionMethod;
    device.updatedAt = nowIso();
    const responseBody = {
      device: {
        ...publicPairedDeviceReceipt(device),
        connected: pairing.onlineConfirmed,
        online: pairing.onlineConfirmed,
      },
      pairing,
    };
    const context = getRequestContext(req) || createRequestContext(req);
    const auditInput = {
      action: "device.pair",
      actorUserId: user.id,
      organizationId: device.organizationId,
      resourceType: "device",
      resourceId: device.id,
      ip: context.ip || "",
      userAgent: context.userAgent || "",
      metadata: {
        connectionMethod,
        pairingOutcome: pairing.outcome,
        presence: pairing.presence,
        onlineConfirmed: pairing.onlineConfirmed,
      },
    };
    const notificationInput = {
      type: pairing.onlineConfirmed ? "success" : "info",
      userId: user.id,
      organizationId: device.organizationId,
      title: pairing.onlineConfirmed
        ? "Thiết bị đã kết nối"
        : "Yêu cầu ghép thiết bị đã được chấp nhận",
      message: pairing.onlineConfirmed
        ? `${device.name} đã xác thực trực tuyến và sẵn sàng sử dụng.`
        : `${device.name} đang chờ xác thực trực tuyến trước khi báo sẵn sàng.`,
      metadata: sanitizeNotificationMetadata({
        deviceId: device.id,
        destination: "device_detail",
        actionPath: `/devices/${encodeURIComponent(device.id)}`,
        pairingOutcome: pairing.outcome,
        presence: pairing.presence,
        onlineConfirmed: pairing.onlineConfirmed,
        connectionMethod,
      }),
    };
    if (!repositories || typeof repositories.devices.savePairingWithAudit !== "function") {
      throw httpError(
        503,
        "The transactional device pairing repository is unavailable",
        "DEVICE_PAIRING_REPOSITORY_UNAVAILABLE",
      );
    }
    const persistenceResult = await repositories.devices.savePairingWithAudit(
      device,
      auditInput,
      notificationInput,
      {
        scope: getIdempotencyScope(user, device.organizationId),
        operation: idempotencyOperation,
        key: idempotencyKey,
        fingerprint: idempotencyFingerprint,
      },
      responseBody,
      200,
      claimMutation,
    );
    if (!persistenceResult.replayed) {
      addAccessLog(`Ghép nối thiết bị ${device.name}`, {
        userId: user.id,
        organizationId: device.organizationId,
        ip: context.ip || "",
        severity: pairing.onlineConfirmed ? "success" : "info",
      });
      if (persistenceResult.notification && repositories?.devices?.savePairingWithAudit) {
        queueNotificationPush(persistenceResult.notification);
      }
      await saveDb();
    }
    sendJson(res, persistenceResult.responseStatus || 200, {
      ...(persistenceResult.responseBody || responseBody),
      ...(persistenceResult.replayed ? { idempotent: true } : {}),
    });
    return;
  }

  const device = segments[2]
    ? repositories
      ? await repositories.devices.findById(decodeURIComponent(segments[2]))
      : db.devices.find((item) => item.id === decodeURIComponent(segments[2]))
    : null;
  if (!device) {
    throw httpError(404, "Không tìm thấy thiết bị");
  }

  if (segments.length === 4 && segments[3] === "setup-session" && method === "POST") {
    // Device assignment and DeviceManage remain the boundary before an app may
    // open an encrypted SmartConfig session for this tenant-scoped device.
    assertCanManageDevice(user, device);
    const payload = await readJsonBody(req);
    const requestedTransports = Array.isArray(payload.supportedTransports)
      ? payload.supportedTransports.map((item) => readString(item, 80))
      : [];
    if (!requestedTransports.includes(SMART_CONFIG_TRANSPORT)) {
      throw httpError(
        426,
        "This app version does not support encrypted ESPTouch V2. Update the app and try again.",
        "DEVICE_WIFI_SETUP_TRANSPORT_UPGRADE_REQUIRED",
      );
    }
    assertDeviceSetupRateLimit(req, user.id, device.id);
    if (inferDeviceOwnershipState(device) !== "claimed") {
      throw httpError(
        409,
        "The device must be assigned before Wi-Fi setup can be opened",
        "DEVICE_WIFI_SETUP_NOT_ASSIGNED",
      );
    }
    if (!device.secretHash && device.secret) {
      device.secretHash = canonicalDeviceSecretHash(device.secret);
      delete device.secret;
    }
    if (!device.secretHash) {
      throw httpError(
        503,
        "The device has no SmartConfig verification material",
        "DEVICE_WIFI_SETUP_MATERIAL_UNAVAILABLE",
      );
    }
    const setupMaterial = buildSmartConfigV2Material({
      deviceId: device.id,
      secretHash: device.secretHash,
    });
    const context = getRequestContext(req) || createRequestContext(req);
    let activation = {
      requested: false,
      state: "device_offline",
    };
    const authenticatedDeviceSocket = getAuthenticatedDeviceSocket(device);
    if (authenticatedDeviceSocket) {
      if (!repositories?.deviceCommands?.reserve) {
        throw httpError(
          503,
          "Durable device command reservation is unavailable",
          "DEVICE_COMMAND_RESERVATION_UNAVAILABLE",
        );
      }
      const activationRequest = {
        type: "wifi.setup.open",
        deviceId: device.id,
      };
      const activationIdempotency = {
        scope: getIdempotencyScope(user, device.organizationId),
        operation: `device.wifi_setup.open:${device.id}`,
        key: createId("wifi_setup_open"),
        fingerprint: createIdempotencyFingerprint(activationRequest),
      };
      const envelope = buildDeviceCommand(
        "wifi.setup.open",
        {},
        `wifi-setup-${createId("activation")}`,
        60_000,
      );
      let command = createDeviceCommandRecord({
        envelope,
        deviceId: device.id,
        organizationId: device.organizationId || "",
        requestedByUserId: user.id,
        idempotencyKey: activationIdempotency.key,
        requestFingerprint: activationIdempotency.fingerprint,
      });
      const reservation = await repositories.deviceCommands.reserve(
        command,
        activationIdempotency,
        {
          action: "device.wifi_setup.open",
          actorUserId: user.id,
          organizationId: device.organizationId || "",
          ip: context.ip || "",
          userAgent: context.userAgent || "",
          metadata: {
            protocolVersion: command.protocolVersion,
            commandId: command.id,
            correlationId: command.correlationId,
            type: command.type,
            state: command.state,
          },
        },
      );
      command = reservation.command;
      if (!reservation.replayed) {
        await appendDeviceEvent(device.id, "command.accepted", {
          protocolVersion: command.protocolVersion,
          commandId: command.id,
          correlationId: command.correlationId,
          type: command.type,
          state: command.state,
          expiresAt: command.expiresAt,
        });
        const delivery = publishDeviceCommand(device.id, envelope);
        applyDeviceCommandDelivery(command, delivery);
        await saveDeviceCommandRecord(command);
        await syncDeviceLastCommand(command);
        await appendDeviceEvent(device.id, `command.${command.state}`, {
          protocolVersion: command.protocolVersion,
          commandId: command.id,
          correlationId: command.correlationId,
          type: command.type,
          state: command.state,
          delivery: command.delivery,
        });
      }
      activation = {
        requested: true,
        commandId: command.id,
        state: command.state,
        delivery: command.delivery || {},
      };
    }
    addAccessLog(`Opened Wi-Fi setup session for device ${device.name}`, {
      userId: user.id,
      organizationId: device.organizationId,
      ip: context.ip || "",
      severity: "info",
    });
    await saveDb();
    res.setHeader("Cache-Control", "no-store");
    sendJson(res, 200, {
      device: publicPairedDeviceReceipt(device),
      setup: {
        ...setupMaterial,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
        activation,
      },
    });
    return;
  }

  if (segments.length === 4 && segments[3] === "events" && method === "GET") {
    assertCanAccessDevice(user, device);
    const events = db.deviceEvents
      .filter((event) => event.deviceId === device.id)
      .slice(0, 100)
      .map((event) => ({
        ...event,
        payload: sanitizePublicDeviceEventPayload(event.payload || {}),
      }));
    sendJson(res, 200, { events });
    return;
  }

  if (segments.length === 4 && segments[3] === "commands" && method === "GET") {
    assertCanAccessDevice(user, device);
    const commands = await listDeviceCommands(device.id, 100);
    for (const command of commands) {
      await refreshDeviceCommandExpiry(command);
    }
    sendJson(res, 200, {
      commands: commands.map(publicDeviceCommand),
    });
    return;
  }

  if (segments.length === 5 && segments[3] === "commands" && method === "GET") {
    assertCanAccessDevice(user, device);
    const command = await refreshDeviceCommandExpiry(
      await findDeviceCommand(device.id, decodeURIComponent(segments[4])),
    );
    if (!command) {
      throw httpError(404, "Device command not found", "DEVICE_COMMAND_NOT_FOUND");
    }
    sendJson(res, 200, { command: publicDeviceCommand(command) });
    return;
  }

  if (segments.length === 3 && method === "GET") {
    assertCanAccessDevice(user, device);
    await expireDeviceCredentialRotation(device);
    sendJson(res, 200, { device: publicDevice(device) });
    return;
  }

  if (segments.length === 4 && segments[3] === "release" && method === "POST") {
    const ownershipState = inferDeviceOwnershipState(device);
    const ownerUserId = readString(device.ownerUserId || device.pairedUserId, 120);
    const workspaceId = getDeviceWorkspaceId(device);
    const workspaceContext = getUserWorkspaceContext(user);
    const mayReplayReleasedReceipt = Boolean(
      ownershipState === "provisioned" &&
      !ownerUserId &&
      workspaceContext.currentWorkspaceId === workspaceId &&
      hasWorkspaceDeviceCapability(user, workspaceId, [
        "personal.devices.manage",
        "workspace.devices.manage",
      ]),
    );
    if (!canManageDevice(user, device) && !mayReplayReleasedReceipt) {
      throw httpError(403, "Device is outside current user management scope");
    }
    const idempotencyKey = getIdempotencyKey(req);
    if (!idempotencyKey) {
      throw httpError(
        400,
        "Idempotency-Key is required for device account release",
        "IDEMPOTENCY_KEY_REQUIRED",
      );
    }
    if (!repositories?.devices?.saveOwnershipMutationWithAudit) {
      throw httpError(
        503,
        "Audited device ownership storage is unavailable",
        "DEVICE_OWNERSHIP_STORAGE_UNAVAILABLE",
      );
    }
    const at = nowIso();
    const context = getRequestContext(req) || createRequestContext(req);
    const persisted = await repositories.devices.saveOwnershipMutationWithAudit(
      {
        deviceId: device.id,
        operation: "release",
        expected: deviceOwnershipExpectation(device),
        actorUserId: user.id,
        at,
        revokeOpenClaims: true,
        claimOrganizationId: device.organizationId || "",
        idempotency: {
          scope: getIdempotencyScope(user, device.organizationId),
          operation: `device.release:${device.id}`,
          key: idempotencyKey,
          fingerprint: createIdempotencyFingerprint({
            deviceId: device.id,
            operation: "release",
          }),
        },
      },
      [{
        action: "device.release",
        actorUserId: user.id,
        organizationId: device.organizationId || "",
        resourceType: "device",
        resourceId: device.id,
        ip: context.ip || "",
        userAgent: context.userAgent || "",
        metadata: {
          previousOwnershipState: ownershipState,
          historyRetained: true,
        },
      }],
    );
    if (!persisted.replayed) {
      const activeDeviceSocket = deviceSockets.get(device.id);
      if (activeDeviceSocket) closeSocket(activeDeviceSocket, 1008, "OWNERSHIP_RELEASED");
      await appendDeviceEvent(device.id, "ownership.release", { actorUserId: user.id });
      await interruptRecordingForDevice(
        device.id,
        "Lượt ghi bị ngắt vì thiết bị đã được gỡ khỏi tài khoản.",
      );
    }
    sendJson(res, 200, {
      release: {
        deviceId: persisted.device.id,
        released: inferDeviceOwnershipState(persisted.device) === "provisioned",
        historyRetained: true,
      },
      replayed: Boolean(persisted.replayed),
    });
    return;
  }

  assertCanManageDevice(user, device);

  if (segments.length === 3 && method === "DELETE") {
    throw httpError(
      409,
      "Device history must be retained; revoke the device instead of deleting it",
      "DEVICE_REVOKE_REQUIRED",
    );
  }

  if (segments.length === 3 && method === "PATCH") {
    const payload = await readJsonBody(req);
    const idempotencyKey = getIdempotencyKey(req, payload);
    if (!idempotencyKey) {
      throw httpError(
        400,
        "Idempotency-Key is required for device ownership mutations",
        "IDEMPOTENCY_KEY_REQUIRED",
      );
    }
    const devicePatch = {};
    const operatorUpdatedFields = [];
    const auditInputs = [];
    const mutationAt = nowIso();
    let ownershipOperation = "update";
    let assignedPatientId = "";
    const context = getRequestContext(req) || createRequestContext(req);
    const auditOrganizationId =
      device.organizationId || getUserWorkspaceContext(user).currentWorkspaceId || "";
    const forbiddenReportedField = ["status", "signal", "battery", "connected", "lastSeenAt"]
      .find((field) => Object.prototype.hasOwnProperty.call(payload, field));
    if (forbiddenReportedField) {
      throw httpError(
        400,
        `Field ${forbiddenReportedField} is device-reported and cannot be changed by an operator`,
        "DEVICE_REPORTED_FIELD_FORBIDDEN",
      );
    }
    for (const field of ["name"]) {
      if (Object.prototype.hasOwnProperty.call(payload, field)) {
        devicePatch[field] = readString(payload[field], 120);
        operatorUpdatedFields.push(field);
      }
    }
    if (Object.prototype.hasOwnProperty.call(payload, "assignedPatientId")) {
      assignedPatientId = readString(payload.assignedPatientId, 120);
      if (assignedPatientId) {
        const patient = findPatient(assignedPatientId);
        if (!patient) {
          throw httpError(404, "Không tìm thấy bệnh nhân cần gán thiết bị");
        }
        assertCanAccessPatient(user, patient.id);
        if (patient.organizationId && device.organizationId && patient.organizationId !== device.organizationId) {
          throw httpError(403, "Không thể gán thiết bị cho bệnh nhân ngoài workspace");
        }
      }
      ownershipOperation = assignedPatientId ? "assign" : "unassign";
      auditInputs.push({
        action: assignedPatientId ? "device.assign_patient" : "device.unassign_patient",
        actorUserId: user.id,
        organizationId: auditOrganizationId,
        resourceType: "device",
        resourceId: device.id,
        ip: context.ip || "",
        userAgent: context.userAgent || "",
        metadata: { patientId: assignedPatientId },
      });
    }
    if (operatorUpdatedFields.length > 0) {
      auditInputs.push({
        action: "device.update",
        actorUserId: user.id,
        organizationId: auditOrganizationId,
        resourceType: "device",
        resourceId: device.id,
        ip: context.ip || "",
        userAgent: context.userAgent || "",
        metadata: { fields: operatorUpdatedFields },
      });
    }
    if (auditInputs.length === 0) {
      throw httpError(400, "No supported device field was provided", "DEVICE_UPDATE_EMPTY");
    }
    if (!repositories?.devices?.saveOwnershipMutationWithAudit) {
      throw httpError(
        503,
        "Audited device mutation storage is unavailable",
        "DEVICE_OWNERSHIP_STORAGE_UNAVAILABLE",
      );
    }
    const persisted = await repositories.devices.saveOwnershipMutationWithAudit(
      {
        deviceId: device.id,
        operation: ownershipOperation,
        expected: deviceOwnershipExpectation(device),
        patch: devicePatch,
        assignedPatientId,
        actorUserId: user.id,
        at: mutationAt,
        idempotency: {
          scope: getIdempotencyScope(user, auditOrganizationId),
          operation: `device.ownership.update:${device.id}`,
          key: idempotencyKey,
          fingerprint: createIdempotencyFingerprint({
            deviceId: device.id,
            assignedPatientId,
            patch: devicePatch,
          }),
        },
      },
      auditInputs,
    );
    sendJson(res, 200, {
      device: publicDevice(persisted.device),
      replayed: Boolean(persisted.replayed),
    });
    return;
  }

  if (segments.length === 4 && segments[3] === "connect" && method === "POST") {
    throw httpError(
      409,
      "Device presence can only be confirmed by an authenticated device transport",
      "DEVICE_PRESENCE_DEVICE_REPORTED_ONLY",
    );
  }

  if (segments.length === 4 && segments[3] === "disconnect" && method === "POST") {
    throw httpError(
      409,
      "Device presence can only be changed by transport disconnect or heartbeat expiry",
      "DEVICE_PRESENCE_DEVICE_REPORTED_ONLY",
    );
  }

  if (segments.length === 4 && segments[3] === "calibrate" && method === "POST") {
    throw httpError(
      409,
      "Device calibration is unavailable until a validated firmware algorithm exists",
      "DEVICE_CALIBRATION_UNAVAILABLE",
    );
  }

  if (segments.length === 4 && segments[3] === "unpair" && method === "POST") {
    throw httpError(
      409,
      "Device ownership cannot be erased by unpairing; use unassign, audited transfer, or revoke",
      "DEVICE_UNPAIR_REQUIRES_TRANSFER_OR_REVOKE",
    );
  }

  if (segments.length === 4 && segments[3] === "revoke" && method === "POST") {
    if (!isPlatformAdminUser(user)) {
      throw httpError(
        403,
        "Only a platform device administrator can revoke a device",
        "DEVICE_REVOKE_PLATFORM_ADMIN_REQUIRED",
      );
    }
    const idempotencyKey = getIdempotencyKey(req);
    if (!idempotencyKey) {
      throw httpError(
        400,
        "Idempotency-Key is required for device revocation",
        "IDEMPOTENCY_KEY_REQUIRED",
      );
    }
    const at = nowIso();
    const context = getRequestContext(req) || createRequestContext(req);
    if (!repositories?.devices?.saveOwnershipMutationWithAudit) {
      throw httpError(
        503,
        "Audited device ownership storage is unavailable",
        "DEVICE_OWNERSHIP_STORAGE_UNAVAILABLE",
      );
    }
    const persisted = await repositories.devices.saveOwnershipMutationWithAudit(
      {
        deviceId: device.id,
        operation: "revoke",
        expected: deviceOwnershipExpectation(device),
        actorUserId: user.id,
        at,
        revokeOpenClaims: true,
        idempotency: {
          scope: getIdempotencyScope(user, device.organizationId),
          operation: `device.revoke:${device.id}`,
          key: idempotencyKey,
          fingerprint: createIdempotencyFingerprint({ deviceId: device.id, operation: "revoke" }),
        },
      },
      [{
        action: "device.revoke",
        actorUserId: user.id,
        organizationId: device.organizationId || "",
        resourceType: "device",
        resourceId: device.id,
        ip: context.ip || "",
        userAgent: context.userAgent || "",
        metadata: { previousOwnershipState: inferDeviceOwnershipState(device) },
      }],
    );
    if (!persisted.replayed) {
      addAccessLog(`Thu hồi thiết bị ${device.name}`, { severity: "warning" });
      const activeDeviceSocket = deviceSockets.get(device.id);
      if (activeDeviceSocket) {
        closeSocket(activeDeviceSocket, 1008, "REVOKED");
      }
      await appendDeviceEvent(device.id, "revoke", { actorUserId: user.id });
      await interruptRecordingForDevice(device.id, "Lượt ghi bị ngắt vì thiết bị đã được thu hồi.");
    }
    sendJson(res, 200, {
      device: publicDevice(persisted.device),
      replayed: Boolean(persisted.replayed),
    });
    return;
  }

  if (segments.length === 4 && segments[3] === "rotate-secret" && method === "POST") {
    if (!isPlatformAdminUser(user)) {
      throw httpError(
        403,
        "Only a platform device administrator can rotate device credentials",
        "DEVICE_SECRET_ROTATION_PLATFORM_ADMIN_REQUIRED",
      );
    }
    const payload = await readJsonBody(req);
    if (Object.keys(payload).some((field) => field !== "idempotencyKey")) {
      throw httpError(
        400,
        "The next device credential is generated by the backend and cannot be supplied by an operator",
        "DEVICE_SECRET_SERVER_GENERATED_ONLY",
      );
    }
    const idempotencyKey = getIdempotencyKey(req, payload);
    if (!idempotencyKey) {
      throw httpError(
        400,
        "Idempotency-Key is required for device credential rotation",
        "IDEMPOTENCY_KEY_REQUIRED",
      );
    }
    const idempotencyFingerprint = createIdempotencyFingerprint({ deviceId: device.id });
    await expireDeviceCredentialRotation(device);
    const existingRotation = sanitizeDeviceCredentialRotation(device.credentialRotation);
    if (existingRotation.id && existingRotation.idempotencyKey === idempotencyKey) {
      if (
        existingRotation.requestedByUserId !== user.id ||
        existingRotation.requestFingerprint !== idempotencyFingerprint
      ) {
        throw httpError(
          409,
          "Idempotency-Key was already used by a different rotation request",
          "IDEMPOTENCY_KEY_REUSED",
        );
      }
      const existingCommand = existingRotation.commandId
        ? await findDeviceCommand(device.id, existingRotation.commandId)
        : null;
      sendJson(res, 202, {
        device: publicDevice(device),
        rotation: publicDevice(device).credentialRotation,
        command: publicDeviceCommand(existingCommand),
        confirmed: existingRotation.state === "confirmed",
        idempotent: true,
      });
      return;
    }
    if (existingRotation.id && ACTIVE_DEVICE_ROTATION_STATES.has(existingRotation.state)) {
      throw httpError(
        409,
        "Another credential rotation is already awaiting device confirmation",
        "DEVICE_SECRET_ROTATION_IN_PROGRESS",
      );
    }
    const expectedRotation = credentialRotationExpectation(device);
    const authenticatedDeviceSocket = getAuthenticatedDeviceSocket(device);
    const rotationWrapKey = authenticatedDeviceSocket
      ? deviceRotationSessionKeys.get(authenticatedDeviceSocket)
      : null;
    if (
      !authenticatedDeviceSocket ||
      authenticatedDeviceSocket._deviceAuth?.credentialSlot !== "current" ||
      !Buffer.isBuffer(rotationWrapKey) ||
      rotationWrapKey.length !== 32
    ) {
      throw httpError(
        409,
        "The device must be online on its current authenticated WSS session before rotating credentials",
        "DEVICE_SECRET_ROTATION_DEVICE_OFFLINE",
      );
    }

    const requestedAt = nowIso();
    const expiresAt = new Date(Date.parse(requestedAt) + DEVICE_SECRET_ROTATION_TTL_MS).toISOString();
    const rotationId = createId("rotation");
    const generatedSecret = generateDeviceCredentialBuffer(64);
    let nextSecretHash;
    let wrappedSecret;
    try {
      nextSecretHash = canonicalDeviceSecretHash(generatedSecret);
      wrappedSecret = wrapDeviceRotationSecret(generatedSecret, rotationWrapKey, {
        rotationId,
        deviceId: device.id,
        sessionId: authenticatedDeviceSocket._deviceAuth.sessionId,
      });
    } finally {
      generatedSecret.fill(0);
    }
    const envelope = createDeviceCommandEnvelope({
      id: createId("cmd"),
      type: "device.rotate_secret",
      correlationId: rotationId,
      issuedAt: requestedAt,
      expiresAt,
      payload: {
        rotationId,
        expiresAt,
        wrapAlgorithm: wrappedSecret.algorithm,
        wrapKeyDerivation: wrappedSecret.keyDerivation,
        wrapIv: wrappedSecret.iv,
        wrapCiphertext: wrappedSecret.ciphertext,
        wrapTag: wrappedSecret.tag,
      },
    });
    const command = createDeviceCommandRecord({
      envelope,
      deviceId: device.id,
      organizationId: device.organizationId || "",
      requestedByUserId: user.id,
      idempotencyKey,
      requestFingerprint: idempotencyFingerprint,
    });
    const rotation = {
      protocolVersion: command.protocolVersion,
      id: rotationId,
      state: "initiated",
      nextSecretHash,
      requestedByUserId: user.id,
      requestedSessionId: authenticatedDeviceSocket._deviceAuth.sessionId,
      commandId: command.id,
      correlationId: command.correlationId,
      idempotencyKey,
      requestFingerprint: idempotencyFingerprint,
      requestedAt,
      expiresAt,
      updatedAt: requestedAt,
    };
    device.credentialRotation = rotation;
    device.updatedAt = requestedAt;
    const requestContext = getRequestContext(req) || createRequestContext(req);
    const rotationAuditInput = {
      action: "device.secret_rotation.initiated",
      actorUserId: user.id,
      organizationId: device.organizationId || "",
      resourceType: "device",
      resourceId: device.id,
      ip: requestContext.ip || "",
      userAgent: requestContext.userAgent || "",
      metadata: {
        protocolVersion: command.protocolVersion,
        rotationId,
        commandId: command.id,
        state: rotation.state,
        expiresAt,
      },
    };
    let rotationPersistence = null;
    if (repositories?.devices?.saveCredentialRotationWithAudit) {
      rotationPersistence = await repositories.devices.saveCredentialRotationWithAudit(
        device,
        rotationAuditInput,
        {
          scope: getIdempotencyScope(user, device.organizationId),
          operation: `device.secret_rotation:${device.id}`,
          key: idempotencyKey,
          fingerprint: idempotencyFingerprint,
        },
        202,
        command,
        expectedRotation,
      );
      if (rotationPersistence.replayed) {
        const replayDevice = rotationPersistence.device || device;
        const replayRotation = sanitizeDeviceCredentialRotation(replayDevice.credentialRotation);
        const replayCommand = replayRotation.commandId
          ? await findDeviceCommand(replayDevice.id, replayRotation.commandId)
          : null;
        sendJson(res, 202, {
          device: publicDevice(replayDevice),
          rotation: publicDevice(replayDevice).credentialRotation,
          command: publicDeviceCommand(replayCommand),
          confirmed: replayRotation.state === "confirmed",
          idempotent: true,
        });
        return;
      }
    } else {
      await saveDeviceCommandRecord(command);
      await saveDeviceRecord(device);
      await appendAudit("device.secret_rotation.initiated", req, rotationAuditInput);
    }
    await appendDeviceEvent(device.id, "credential_rotation.initiated", {
      protocolVersion: command.protocolVersion,
      rotationId,
      commandId: command.id,
      state: rotation.state,
      expiresAt,
    });

    const sameAuthenticatedSession =
      deviceSockets.get(device.id) === authenticatedDeviceSocket &&
      authenticatedDeviceSocket._deviceAuth?.sessionId === rotation.requestedSessionId &&
      authenticatedDeviceSocket.writable &&
      !authenticatedDeviceSocket.destroyed;
    const delivery = { websocket: sameAuthenticatedSession, mqtt: false, delivered: sameAuthenticatedSession };
    if (sameAuthenticatedSession) sendText(authenticatedDeviceSocket, JSON.stringify(envelope));
    applyDeviceCommandDelivery(command, delivery);
    rotation.state = delivery.delivered ? "pending_device_ack" : "failed";
    rotation.updatedAt = command.updatedAt;
    if (!delivery.delivered) {
      rotation.failedAt = command.updatedAt;
      rotation.failureCode = "ROTATION_SESSION_LOST";
      rotation.nextSecretHash = "";
    }
    device.credentialRotation = rotation;
    device.updatedAt = command.updatedAt;
    device.lastCommand = publicDeviceCommand(command);
    const deliveryAuditInput = {
      action: delivery.delivered
        ? "device.secret_rotation.delivered"
        : "device.secret_rotation.delivery_failed",
      actorUserId: user.id,
      organizationId: device.organizationId || "",
      resourceType: "device",
      resourceId: device.id,
      metadata: {
        protocolVersion: command.protocolVersion,
        rotationId,
        commandId: command.id,
        state: rotation.state,
        delivered: delivery.delivered,
      },
    };
    if (repositories?.devices?.saveCredentialRotationWithAudit) {
      await repositories.devices.saveCredentialRotationWithAudit(
        device,
        deliveryAuditInput,
        null,
        202,
        command,
        {
          id: rotationId,
          state: "initiated",
          updatedAt: requestedAt,
        },
      );
    } else {
      await saveDeviceCommandRecord(command);
      await saveDeviceRecord(device);
      await appendAudit(deliveryAuditInput.action, req, deliveryAuditInput);
    }
    await appendDeviceEvent(device.id, `credential_rotation.${rotation.state}`, {
      protocolVersion: command.protocolVersion,
      rotationId,
      commandId: command.id,
      state: rotation.state,
    });
    sendJson(res, 202, {
      device: publicDevice(device),
      rotation: publicDevice(device).credentialRotation,
      command: publicDeviceCommand(command),
      confirmed: false,
    });
    return;
  }

  if (segments.length === 4 && segments[3] === "transfer" && method === "POST") {
    if (!isPlatformAdminUser(user)) {
      throw httpError(403, "Only platform admin can transfer devices between workspaces");
    }
    const payload = await readJsonBody(req);
    const idempotencyKey = getIdempotencyKey(req, payload);
    if (!idempotencyKey) {
      throw httpError(
        400,
        "Idempotency-Key is required for device transfer",
        "IDEMPOTENCY_KEY_REQUIRED",
      );
    }
    const nextOrganizationId = readString(payload.organizationId, 120);
    const nextOwnerUserId = readString(payload.ownerUserId, 120);
    let nextOwner = null;
    if (nextOrganizationId && !getClinicById(nextOrganizationId)) {
      throw httpError(404, "Target workspace not found");
    }
    const transferOrganizationId = nextOrganizationId || device.organizationId || "";
    if (nextOwnerUserId) {
      nextOwner = db.users.find(
        (candidate) => candidate.id === nextOwnerUserId || candidate.firebaseUid === nextOwnerUserId,
      );
      if (!nextOwner) {
        throw httpError(404, "Target device owner user not found");
      }
      if (
        transferOrganizationId &&
        !isPlatformAdminUser(nextOwner) &&
        nextOwner.organizationId !== transferOrganizationId &&
        !hasWorkspaceMembership(nextOwner, transferOrganizationId)
      ) {
        throw httpError(403, "Target device owner is outside the target workspace");
      }
    }
    const previousOrganizationId = device.organizationId || "";
    const at = nowIso();
    const context = getRequestContext(req) || createRequestContext(req);
    if (!repositories?.devices?.saveOwnershipMutationWithAudit) {
      throw httpError(
        503,
        "Audited device ownership storage is unavailable",
        "DEVICE_OWNERSHIP_STORAGE_UNAVAILABLE",
      );
    }
    const transferMetadata = {
      previousOrganizationId,
      organizationId: transferOrganizationId,
      previousOwnerUserId: device.ownerUserId || device.pairedUserId || "",
      ownerUserId: nextOwner?.id || "",
    };
    const transferAuditInputs =
      previousOrganizationId && previousOrganizationId !== transferOrganizationId
        ? [
            {
              action: "device.transfer_out",
              actorUserId: user.id,
              organizationId: previousOrganizationId,
              resourceType: "device",
              resourceId: device.id,
              ip: context.ip || "",
              userAgent: context.userAgent || "",
              metadata: transferMetadata,
            },
            {
              action: "device.transfer_in",
              actorUserId: user.id,
              organizationId: transferOrganizationId,
              resourceType: "device",
              resourceId: device.id,
              ip: context.ip || "",
              userAgent: context.userAgent || "",
              metadata: transferMetadata,
            },
          ]
        : [
            {
              action: "device.transfer",
              actorUserId: user.id,
              organizationId: transferOrganizationId,
              resourceType: "device",
              resourceId: device.id,
              ip: context.ip || "",
              userAgent: context.userAgent || "",
              metadata: transferMetadata,
            },
          ];
    const persisted = await repositories.devices.saveOwnershipMutationWithAudit(
      {
        deviceId: device.id,
        operation: "transfer",
        expected: deviceOwnershipExpectation(device),
        organizationId: transferOrganizationId,
        ownerUserId: nextOwner?.id || "",
        actorUserId: user.id,
        at,
        revokeOpenClaims: previousOrganizationId !== transferOrganizationId,
        claimOrganizationId: previousOrganizationId,
        idempotency: {
          scope: getIdempotencyScope(user),
          operation: `device.transfer:${device.id}`,
          key: idempotencyKey,
          fingerprint: createIdempotencyFingerprint({
            deviceId: device.id,
            organizationId: transferOrganizationId,
            ownerUserId: nextOwner?.id || "",
          }),
        },
      },
      transferAuditInputs,
    );
    const transferredDevice = persisted.device;
    if (!persisted.replayed) {
      const activeDeviceSocket = deviceSockets.get(device.id);
      if (activeDeviceSocket) {
        closeSocket(activeDeviceSocket, 1008, "WORKSPACE_TRANSFERRED");
      }
      await interruptRecordingForDevice(device.id, "Lượt ghi bị ngắt vì thiết bị đã được chuyển workspace.");
      await appendDeviceEvent(device.id, "transfer", {
        previousOrganizationId,
        organizationId: transferredDevice.organizationId,
        ownerUserId: transferredDevice.ownerUserId || transferredDevice.pairedUserId,
      });
    }
    sendJson(res, 200, {
      device: publicDevice(transferredDevice),
      replayed: Boolean(persisted.replayed),
    });
    return;
  }

  if (segments.length === 4 && segments[3] === "commands" && method === "POST") {
    if (!isPlatformAdminUser(user)) {
      throw httpError(
        403,
        "Only a platform device administrator can issue generic fleet commands",
        "DEVICE_COMMAND_PLATFORM_ADMIN_REQUIRED",
      );
    }
    const payload = await readJsonBody(req);
    const commandType = readString(payload.type, 80);
    if (!isSupportedDeviceCommandType(commandType)) {
      throw httpError(400, "Device command type is unsupported", "DEVICE_COMMAND_TYPE_UNSUPPORTED");
    }
    if (commandType === "wifi.update") {
      throw httpError(
        409,
        "Wi-Fi credentials must be configured through the device-local secure setup AP",
        "DEVICE_WIFI_UPDATE_LOCAL_SETUP_REQUIRED",
        {
          commandType,
          setupFlow: "secure_setup_ap",
        },
      );
    }
    if (!isGenericSafeDeviceCommandType(commandType)) {
      const specializedRoute = getSpecializedDeviceCommandRoute(commandType);
      throw httpError(
        409,
        `Device command ${commandType} must use its specialized audited workflow`,
        "DEVICE_COMMAND_SPECIALIZED_ROUTE_REQUIRED",
        {
          commandType,
          specializedRoute,
        },
      );
    }
    const idempotencyKey = getIdempotencyKey(req, payload);
    if (!idempotencyKey) {
      throw httpError(
        400,
        "Idempotency-Key is required for device commands",
        "IDEMPOTENCY_KEY_REQUIRED",
      );
    }
    const idempotencyOperation = `device.command:${device.id}`;
    const idempotencyFingerprint = createIdempotencyFingerprint(payload);
    const commandIdempotency = {
      scope: getIdempotencyScope(user, device.organizationId),
      operation: idempotencyOperation,
      key: idempotencyKey,
      fingerprint: idempotencyFingerprint,
    };
    const authenticatedDeviceSocket = getAuthenticatedDeviceSocket(device);
    if (!authenticatedDeviceSocket) {
      throw httpError(
        409,
        "The device is offline; reconnect it before retrying this command",
        "DEVICE_COMMAND_DEVICE_OFFLINE",
      );
    }

    const envelope = buildDeviceCommand(
      commandType,
      payload.payload && typeof payload.payload === "object" ? payload.payload : {},
      payload.correlationId,
      readOptionalNumber(payload.ttlMs) || 30_000,
    );
    let command = createDeviceCommandRecord({
      envelope,
      deviceId: device.id,
      organizationId: device.organizationId || "",
      requestedByUserId: user.id,
      idempotencyKey,
      requestFingerprint: idempotencyFingerprint,
    });
    if (!repositories?.deviceCommands?.reserve) {
      throw httpError(
        503,
        "Durable device command reservation is unavailable",
        "DEVICE_COMMAND_RESERVATION_UNAVAILABLE",
      );
    }
    const context = getRequestContext(req) || createRequestContext(req);
    const reservation = await repositories.deviceCommands.reserve(
      command,
      commandIdempotency,
      {
        action: "device.command",
        actorUserId: user.id,
        organizationId: device.organizationId || "",
        ip: context.ip || "",
        userAgent: context.userAgent || "",
        metadata: {
          protocolVersion: command.protocolVersion,
          commandId: command.id,
          correlationId: command.correlationId,
          type: command.type,
          state: command.state,
        },
      },
    );
    command = reservation.command;
    if (reservation.replayed) {
      const currentCommand = await refreshDeviceCommandExpiry(command);
      res.setHeader("Idempotency-Replayed", "true");
      sendJson(res, Number(reservation.responseStatus || 202), {
        device: publicDevice(device),
        command: publicDeviceCommand(currentCommand),
        delivery: currentCommand?.delivery || {},
        idempotent: true,
      });
      return;
    }
    await appendDeviceEvent(device.id, "command.accepted", {
      protocolVersion: command.protocolVersion,
      commandId: command.id,
      correlationId: command.correlationId,
      type: command.type,
      state: command.state,
      expiresAt: command.expiresAt,
    });
    const delivery = publishDeviceCommand(device.id, envelope);
    applyDeviceCommandDelivery(command, delivery);
    await saveDeviceCommandRecord(command);
    await syncDeviceLastCommand(command);
    await appendDeviceEvent(device.id, `command.${command.state}`, {
      protocolVersion: command.protocolVersion,
      commandId: command.id,
      correlationId: command.correlationId,
      type: command.type,
      state: command.state,
      delivery: command.delivery,
    });
    const responseBody = {
      device: publicDevice(device),
      command: publicDeviceCommand(command),
      delivery: command.delivery,
      responseStatus: 202,
    };
    await saveDb();
    sendJson(res, 202, responseBody);
    return;
  }

  if (segments.length === 4 && segments[3] === "ota" && method === "POST") {
    if (!isPlatformAdminUser(user)) {
      throw httpError(403, "Only a platform device administrator can start OTA", "OTA_PLATFORM_ADMIN_REQUIRED");
    }
    const payload = await readJsonBody(req);
    const idempotencyKey = getIdempotencyKey(req, payload);
    if (!idempotencyKey) {
      throw httpError(
        400,
        "Idempotency-Key is required for OTA commands",
        "IDEMPOTENCY_KEY_REQUIRED",
      );
    }
    const idempotencyOperation = `device.ota:${device.id}`;
    const idempotencyFingerprint = createIdempotencyFingerprint(payload);
    const otaIdempotency = {
      scope: getIdempotencyScope(user, device.organizationId),
      operation: idempotencyOperation,
      key: idempotencyKey,
      fingerprint: idempotencyFingerprint,
    };
    if (!repositories?.deviceCommands?.findAuthorizedReservation) {
      throw httpError(
        503,
        "Durable OTA replay authorization is unavailable",
        "DEVICE_OTA_REPOSITORY_UNAVAILABLE",
      );
    }
    const authorizedReplay = await repositories.deviceCommands.findAuthorizedReservation(
      otaIdempotency,
      {
        deviceId: device.id,
        organizationId: device.organizationId || "",
        requestedByUserId: user.id,
        commandType: "ota.update",
      },
    );
    if (authorizedReplay) {
      const currentCommand = await refreshDeviceCommandExpiry(
        authorizedReplay.command,
      );
      const replayCanonicalDevice = repositories?.devices?.findById
        ? await repositories.devices.findById(device.id)
        : findDevice(device.id);
      const replayDevice = publicDevice(replayCanonicalDevice || authorizedReplay.device);
      res.setHeader("Idempotency-Replayed", "true");
      sendJson(res, Number(authorizedReplay.responseStatus || 202), {
        device: replayDevice,
        ota: replayDevice.ota || authorizedReplay.responseResource?.ota || null,
        command: publicDeviceCommand(currentCommand),
        delivery: currentCommand?.delivery || {},
        idempotent: true,
      });
      return;
    }
    if (device.ota?.commandId) {
      const activeOtaCommand = await findDeviceCommand(device.id, device.ota.commandId);
      await refreshDeviceCommandExpiry(activeOtaCommand);
      const reconciledDevice = repositories?.devices?.findById
        ? await repositories.devices.findById(device.id)
        : findDevice(device.id);
      if (reconciledDevice) Object.assign(device, reconciledDevice);
    }
    const otaDeviceSocket = getAuthenticatedDeviceSocket(device);
    if (!otaDeviceSocket) {
      throw httpError(
        409,
        "The device is offline; reconnect it before starting OTA",
        "DEVICE_COMMAND_DEVICE_OFFLINE",
      );
    }

    const firmwareFileId = readString(payload.firmwareFileId || payload.fileId, 120);
    let firmwareRecord = null;
    let firmwareStorageBinding = null;
    if (firmwareFileId) {
      const resolvedFirmware = resolvePrivateFirmwareStorageBinding(firmwareFileId);
      firmwareRecord = resolvedFirmware.record;
      firmwareStorageBinding = resolvedFirmware.binding;
      assertCanAccessStorageRecord(user, firmwareRecord);
    }
    const otaId = createId("cmd");
    const token = firmwareFileId ? crypto.randomBytes(32).toString("base64url") : "";
    const firmwareUrl = firmwareFileId
      ? buildOtaFirmwareDownloadUrl(req, device.id, otaId)
      : readString(payload.url || payload.downloadUrl, 800);
    const firmwareVersion =
      readString(payload.firmwareVersion, 80) ||
      readString(firmwareRecord?.firmwareVersion, 80) ||
      inferFirmwareVersionFromName(firmwareRecord?.name || "");
    const checksum =
      readString(payload.checksum, 160) ||
      readString(firmwareRecord?.checksum || firmwareRecord?.sha256, 160);
    let manifest;
    try {
      assertOtaUpgradeVersion(device.firmwareVersion, firmwareVersion);
      manifest = buildSignedOtaManifest({
        url: firmwareUrl,
        firmwareVersion,
        checksum,
        hardwareTarget: payload.hardwareTarget,
        partitionTarget: payload.partitionTarget,
        minimumProtocolVersion: payload.minimumProtocolVersion,
      });
      if (token) manifest.downloadAuthorization = token;
    } catch (error) {
      const statusCode = ["OTA_SIGNER_UNAVAILABLE", "OTA_SIGNER_INVALID"].includes(error.code)
        ? 503
        : error.code === "OTA_DOWNGRADE_FORBIDDEN"
          ? 409
          : 400;
      throw httpError(statusCode, error.message || "OTA manifest is invalid", error.code || "OTA_MANIFEST_INVALID");
    }
    const otaExecutionTtlMs = Math.max(
      10 * 60_000,
      Math.min(
        24 * 60 * 60_000,
        Number(process.env.OTA_EXECUTION_TTL_MS) || 2 * 60 * 60_000,
      ),
    );
    const executionExpiresAt = new Date(Date.now() + otaExecutionTtlMs).toISOString();
    const envelope = createDeviceCommandEnvelope({
      id: otaId,
      type: "ota.update",
      payload: manifest,
      correlationId: readString(payload.correlationId, 128) || createId("correlation"),
      ttlMs: Math.max(30_000, Math.min(10 * 60_000, Number(payload.ttlMs) || 5 * 60_000)),
    });
    let command = createDeviceCommandRecord({
      envelope,
      deviceId: device.id,
      organizationId: device.organizationId || "",
      requestedByUserId: user.id,
      idempotencyKey,
      requestFingerprint: idempotencyFingerprint,
      executionExpiresAt,
    });
    const otaOwnershipAuthority = {
      organizationId: readString(device.organizationId, 120),
      ownerUserId: readString(device.ownerUserId || device.pairedUserId, 160),
      ownershipState: inferDeviceOwnershipState(device),
    };
    const ota = {
      protocolVersion: command.protocolVersion,
      id: otaId,
      commandId: otaId,
      correlationId: envelope.correlationId,
      firmwareVersion: manifest.firmwareVersion,
      checksum: manifest.checksum,
      hardwareTarget: manifest.hardwareTarget,
      partitionTarget: manifest.partitionTarget,
      minimumProtocolVersion: manifest.minimumProtocolVersion,
      firmwareFileId,
      firmwareFileName: firmwareRecord?.name || "",
      firmwareStorageBucket: firmwareStorageBinding?.firmwareStorageBucket || "",
      firmwareObjectKey: firmwareStorageBinding?.firmwareObjectKey || "",
      firmwareByteSize: firmwareStorageBinding?.firmwareByteSize,
      tokenHash: token ? hashOtaDownloadToken(token) : "",
      expiresAt: executionExpiresAt,
      status: "pending",
      requestedByUserId: user.id,
      ...otaOwnershipAuthority,
      ownershipBinding: createDeviceOtaOwnershipBinding(otaOwnershipAuthority),
      createdAt: envelope.issuedAt,
      updatedAt: envelope.issuedAt,
      requestedSessionId: readString(otaDeviceSocket._deviceAuth?.sessionId, 128),
    };
    if (!repositories?.deviceCommands?.reserve || !repositories?.devices?.saveOtaLifecycle) {
      throw httpError(
        503,
        "Durable OTA command and lifecycle persistence is unavailable",
        "DEVICE_OTA_REPOSITORY_UNAVAILABLE",
      );
    }
    const context = getRequestContext(req) || createRequestContext(req);
    const safeOtaReceipt = {
      protocolVersion: ota.protocolVersion,
      id: ota.id,
      commandId: ota.commandId,
      correlationId: ota.correlationId,
      firmwareVersion: ota.firmwareVersion,
      checksum: ota.checksum,
      hardwareTarget: ota.hardwareTarget,
      partitionTarget: ota.partitionTarget,
      minimumProtocolVersion: ota.minimumProtocolVersion,
      firmwareFileId: ota.firmwareFileId,
      firmwareFileName: ota.firmwareFileName,
      expiresAt: ota.expiresAt,
      status: ota.status,
      requestedByUserId: ota.requestedByUserId,
      createdAt: ota.createdAt,
      updatedAt: ota.updatedAt,
    };
    const reservation = await repositories.deviceCommands.reserve(
      command,
      otaIdempotency,
      {
        action: "device.ota",
        actorUserId: user.id,
        organizationId: device.organizationId || "",
        ip: context.ip || "",
        userAgent: context.userAgent || "",
        metadata: {
          protocolVersion: command.protocolVersion,
          commandId: command.id,
          correlationId: command.correlationId,
          firmwareVersion: ota.firmwareVersion,
          checksum: ota.checksum,
          hardwareTarget: ota.hardwareTarget,
          partitionTarget: ota.partitionTarget,
          minimumProtocolVersion: ota.minimumProtocolVersion,
          state: command.state,
        },
      },
      { ota: safeOtaReceipt },
      { ota },
    );
    command = reservation.command;
    if (reservation.replayed) {
      const currentCommand = await refreshDeviceCommandExpiry(command);
      const replayDevice = publicDevice(device);
      res.setHeader("Idempotency-Replayed", "true");
      sendJson(res, Number(reservation.responseStatus || 202), {
        device: replayDevice,
        ota: reservation.responseResource?.ota || replayDevice.ota || null,
        command: publicDeviceCommand(currentCommand),
        delivery: currentCommand?.delivery || {},
        idempotent: true,
      });
      return;
    }
    if (!reservation.device) {
      throw httpError(
        500,
        "The OTA lifecycle reservation did not return a canonical device",
        "DEVICE_OTA_RESERVATION_INVALID",
      );
    }
    Object.assign(device, reservation.device);
    device.lastCommand = publicDeviceCommand(command);
    await appendDeviceEvent(device.id, "command.accepted", {
      protocolVersion: command.protocolVersion,
      commandId: command.id,
      correlationId: command.correlationId,
      type: command.type,
      state: command.state,
      expiresAt: command.expiresAt,
    });
    const delivery = publishDeviceCommandWssOnly(
      device.id,
      envelope,
      ota.requestedSessionId,
    );
    if (delivery.delivered) {
      applyDeviceCommandDelivery(command, delivery);
    } else {
      transitionDeviceCommand(command, "failed", {
        code: "TRANSPORT_LOST",
        detail: "Authenticated device transport disconnected before OTA delivery",
        delivery,
      });
    }
    const otaTransition = transitionDeviceOtaLifecycle(device.ota, command.state, {
      at: command.updatedAt,
      metadata: {
        failureCode: command.state === "failed" ? command.code : "",
        detail: command.detail,
      },
    });
    device.ota = otaTransition.ota;
    device.otaStatus = otaTransition.ota.status;
    device.lastCommand = publicDeviceCommand(command);
    await saveDeviceOtaLifecycleRecord(device, device.ota, {
      expectedOtaId: ota.id,
      command,
    });
    await syncDeviceLastCommand(command);
    await appendDeviceEvent(device.id, "ota.requested", {
      protocolVersion: command.protocolVersion,
      otaId,
      commandId: command.id,
      correlationId: command.correlationId,
      firmwareVersion: ota.firmwareVersion,
      checksum: ota.checksum,
      hardwareTarget: ota.hardwareTarget,
      partitionTarget: ota.partitionTarget,
      minimumProtocolVersion: ota.minimumProtocolVersion,
      state: command.state,
      delivery: command.delivery,
    });
    const safeDevice = publicDevice(device);
    const responseBody = {
      device: safeDevice,
      ota: safeDevice.ota,
      command: publicDeviceCommand(command),
      delivery: command.delivery,
      responseStatus: 202,
    };
    await saveDb();
    sendJson(res, 202, responseBody);
    return;
  }

  sendJson(res, 404, { error: "Device route not found" });
}

async function handleAiApi(req, res, segments) {
  const method = req.method || "GET";
  const user = requireUser(req);
  const workspaceContext = getUserWorkspaceContext(user);
  const organizationId = workspaceContext.currentWorkspaceId || user.organizationId || "";
  const scopedMessages = async () => {
    if (repositories && typeof repositories.chatMessages?.listByScope === "function") {
      return repositories.chatMessages.listByScope(user.id, organizationId);
    }
    return db.chatMessages
      .filter((message) => message.userId === user.id && message.organizationId === organizationId)
      .slice(-100);
  };

  if (segments.length === 3 && segments[2] === "chat" && method === "GET") {
    sendJson(res, 200, { messages: await scopedMessages(), availability: getAiProviderAvailability() });
    return;
  }

  if (segments.length === 3 && segments[2] === "settings" && method === "GET") {
    sendJson(res, 200, {
      settings: normalizeAiSettings(getEffectiveSettingsForUser(user).ai),
      runtime: buildAiRuntimeStatus(process.env),
    });
    return;
  }

  if (segments.length === 3 && segments[2] === "chat" && method === "POST") {
    const availability = getAiProviderAvailability();
    if (!availability.available) {
      throw httpError(
        503,
        "AI provider is not configured",
        "AI_PROVIDER_UNAVAILABLE",
        { availability },
      );
    }
    const payload = await readJsonBody(req);
    const content = readString(payload.message, 2000);
    if (!content) {
      throw httpError(400, "AI message is required", "AI_MESSAGE_REQUIRED");
    }
    const idempotencyKey = getIdempotencyKey(req, payload);
    const idempotencyOperation = "ai.chat";
    const idempotencyFingerprint = createIdempotencyFingerprint(payload);
    const replayedResponse = findIdempotentResource(user, idempotencyKey, idempotencyOperation, {
      organizationId,
      fingerprint: idempotencyFingerprint,
    });
    if (replayedResponse) {
      sendJson(res, 200, { ...replayedResponse, idempotent: true });
      await saveDb();
      return;
    }

    const createExchange = async (previousMessages) => {
      const providerResult = await requestAiChat([
        ...previousMessages.map((message) => ({ role: message.role, content: message.content })),
        { role: "user", content },
      ]);
      const createdAt = nowIso();
      const userMessage = {
        id: createId("msg"),
        role: "user",
        content,
        userId: user.id,
        organizationId,
        createdAt,
      };
      const assistantMessage = {
        id: createId("msg"),
        role: "assistant",
        content: providerResult.content,
        userId: user.id,
        organizationId,
        provider: providerResult.availability.provider,
        model: providerResult.availability.model,
        createdAt: nowIso(),
      };
      return {
        messages: [userMessage, assistantMessage],
        responseStatus: 200,
        responseBody: {
          message: assistantMessage,
          messages: [...previousMessages, userMessage, assistantMessage].slice(-100),
          availability: providerResult.availability,
        },
        auditInput: {
          action: "ai.chat",
          actorUserId: user.id,
          organizationId,
          resourceType: "ai_message",
          resourceId: assistantMessage.id,
          ip: (getRequestContext(req) || createRequestContext(req)).ip || "",
          userAgent: (getRequestContext(req) || createRequestContext(req)).userAgent || "",
          metadata: {
            provider: providerResult.availability.provider,
            model: providerResult.availability.model,
            ...(idempotencyKey ? { idempotencyKey } : {}),
          },
        },
      };
    };
    const idempotency = idempotencyKey
      ? {
          scope: getIdempotencyScope(user, organizationId),
          operation: idempotencyOperation,
          key: idempotencyKey,
          fingerprint: idempotencyFingerprint,
        }
      : null;
    let persistenceResult;
    if (repositories && typeof repositories.chatMessages?.executeWithAudit === "function") {
      persistenceResult = await repositories.chatMessages.executeWithAudit({
        userId: user.id,
        organizationId,
        idempotency,
        responseStatus: 200,
        createExchange,
      });
    } else {
      const exchange = await createExchange(await scopedMessages());
      db.chatMessages.push(...exchange.messages);
      db.chatMessages = db.chatMessages.slice(-500);
      await appendAudit("ai.chat", req, exchange.auditInput);
      rememberIdempotentResource(user, idempotencyKey, idempotencyOperation, "ai_chat", exchange.responseBody.message.id, {
        organizationId,
        fingerprint: idempotencyFingerprint,
        responseStatus: 200,
        responseResource: exchange.responseBody,
      });
      persistenceResult = {
        responseBody: exchange.responseBody,
        responseStatus: 200,
        replayed: false,
      };
    }
    if (!persistenceResult.replayed) {
      addAccessLog("Sử dụng trợ lý AI", { userId: user.id, organizationId });
      await saveDb();
    }
    sendJson(res, persistenceResult.responseStatus || 200, {
      ...persistenceResult.responseBody,
      ...(persistenceResult.replayed ? { idempotent: true } : {}),
    });
    return;
  }

  if (segments.length === 3 && segments[2] === "settings" && method === "PATCH") {
    requireAnyCapability(user, ["platform.settings.manage", "workspace.settings.manage"], "Không có quyền cập nhật AI");
    await readJsonBody(req);
    throw httpError(
      422,
      "Cấu hình phân tích tín hiệu do backend quản lý và chưa hỗ trợ cập nhật mô hình",
      "AI_SETTINGS_READ_ONLY",
      { settings: normalizeAiSettings(getEffectiveSettingsForUser(user).ai) },
    );
  }

  if (segments.length === 3 && segments[2] === "update" && method === "POST") {
    requireAnyCapability(user, ["platform.settings.manage", "workspace.settings.manage"], "Không có quyền cập nhật AI");
    throw httpError(
      503,
      "Chưa có nhà cung cấp cập nhật mô hình lâm sàng được cấu hình",
      "AI_MODEL_UPDATE_UNAVAILABLE",
      { update: buildAiUpdateStatus(process.env) },
    );
  }

  throw httpError(404, "AI route not found", "AI_ROUTE_NOT_FOUND");
}

async function handleExportsApi(req, res, url, segments) {
  const method = req.method || "GET";
  const user = requireUser(req);

  if (segments.length === 2 && method === "GET") {
    requireAnyCapability(user, REPORT_EXPORT_CAPABILITIES, "Không có quyền xem bản xuất dữ liệu");
    const workspaceContext = getUserWorkspaceContext(user);
    const requestedOrganizationId = readString(url.searchParams.get("organizationId"), 120);
    if (
      !isPlatformAdminUser(user) &&
      requestedOrganizationId &&
      requestedOrganizationId !== workspaceContext.currentWorkspaceId
    ) {
      throw httpError(403, "The export workspace is outside the current workspace", "EXPORT_SCOPE_DENIED");
    }
    const organizationId = isPlatformAdminUser(user)
      ? requestedOrganizationId
      : workspaceContext.currentWorkspaceId || "";
    if (!isPlatformAdminUser(user) && !organizationId) {
      throw httpError(403, "Select an operational workspace before viewing exports", "EXPORT_WORKSPACE_REQUIRED");
    }
    const requestedFormat = readString(url.searchParams.get("format"), 20);
    const format = requestedFormat ? normalizeExportFormat(requestedFormat) : "";
    if (requestedFormat && !format) {
      throw httpError(400, "The export format filter is unsupported", "EXPORT_FORMAT_UNSUPPORTED", {
        supportedFormats: EXPORT_FORMATS,
      });
    }
    const pageResult = await repositories.exports.listPage({
      organizationId,
      createdByUserId:
        !isPlatformAdminUser(user) && !hasCapability(user, "workspace.exports.manage") ? user.id : "",
      format,
      dataset: readString(url.searchParams.get("dataset"), 40),
      status: readString(url.searchParams.get("status"), 40),
      page: url.searchParams.get("page"),
      limit: url.searchParams.get("limit"),
      sort: readString(url.searchParams.get("sort"), 40),
    });
    setWorkspacePaginationHeaders(res, pageResult);
    const pageCount = pageResult.total === 0 ? 0 : Math.ceil(pageResult.total / pageResult.limit);
    sendJson(res, 200, {
      exports: filterExportsForUser(user, pageResult.items).map(publicExportJob),
      pagination: {
        page: pageResult.page,
        limit: pageResult.limit,
        total: pageResult.total,
        pageCount,
        hasNextPage: pageResult.page < pageCount,
        sort: pageResult.sort,
      },
    });
    return;
  }

  if (segments.length === 2 && method === "POST") {
    requireAnyCapability(user, REPORT_EXPORT_CAPABILITIES, "Không có quyền tạo bản xuất dữ liệu");
    const payload = await readJsonBody(req);
    const format = normalizeExportFormat(readString(payload.format, 20) || "json");
    if (!format) {
      throw httpError(
        422,
        "The requested export format is unsupported",
        "EXPORT_FORMAT_UNSUPPORTED",
        { supportedFormats: EXPORT_FORMATS },
      );
    }
    const dataset = readString(payload.dataset, 40) || "clinical_bundle";
    if (!["clinical_bundle", "audit_logs"].includes(dataset)) {
      throw httpError(422, "The requested export dataset is unsupported", "EXPORT_DATASET_UNSUPPORTED", {
        supportedDatasets: ["clinical_bundle", "audit_logs"],
      });
    }
    const idempotencyKey = getIdempotencyKey(req, payload);
    if (!idempotencyKey) {
      throw httpError(400, "Idempotency-Key is required", "IDEMPOTENCY_KEY_REQUIRED");
    }
    const rawFilters =
      payload.filters && typeof payload.filters === "object" && !Array.isArray(payload.filters)
        ? payload.filters
        : {};
    const { startDate, endDate } = normalizeExportDateRange({ ...payload, ...rawFilters });
    const workspaceContext = getUserWorkspaceContext(user);
    const requestedOrganizationId = readString(payload.organizationId, 120);
    if (
      !isPlatformAdminUser(user) &&
      requestedOrganizationId &&
      requestedOrganizationId !== workspaceContext.currentWorkspaceId
    ) {
      throw httpError(
        403,
        "The requested export workspace is outside the current workspace",
        "EXPORT_SCOPE_DENIED",
      );
    }
    const organizationId = isPlatformAdminUser(user)
      ? requestedOrganizationId ||
        (dataset === "audit_logs" ? "" : workspaceContext.currentWorkspaceId || "")
      : workspaceContext.currentWorkspaceId || "";
    if (!organizationId && !(isPlatformAdminUser(user) && dataset === "audit_logs")) {
      throw httpError(
        400,
        "Select an operational workspace before creating an export",
        "EXPORT_WORKSPACE_REQUIRED",
      );
    }
    if (organizationId && !getClinicById(organizationId)) {
      throw httpError(404, "Target export workspace was not found", "EXPORT_WORKSPACE_NOT_FOUND");
    }
    if (!isPlatformAdminUser(user) && !isSameCurrentWorkspace(user, organizationId)) {
      throw httpError(
        403,
        "The requested export workspace is outside the current workspace",
        "EXPORT_SCOPE_DENIED",
      );
    }
    const scope = resolveExportScope(user, organizationId, dataset);
    let auditFilters = {};
    if (dataset === "audit_logs") {
      requireAnyCapability(user, AUDIT_EXPORT_CAPABILITIES, "Không có quyền xuất audit log");
      try {
        auditFilters = normalizeAuditLogQuery({
          q: rawFilters.q,
          action: rawFilters.action,
          resourceType: rawFilters.resourceType,
          actorUserId: rawFilters.actorUserId,
          startDate,
          endDate,
          sort: rawFilters.sort,
        });
      } catch (error) {
        throw httpError(400, error.message, error.code || "AUDIT_FILTER_INVALID", {
          field: error.field || "",
        });
      }
      delete auditFilters.page;
      delete auditFilters.limit;
      delete auditFilters.organizationId;
    }
    const includeAudio = payload.includeAudio !== false;
    const includeReports = payload.includeReports !== false;
    const includeHistory = payload.includeHistory !== false;
    const exportId = createId("export");
    const generatedAt = nowIso();
    const snapshot = await repositories.exports.buildSnapshot({
      exportId,
      organizationId,
      generatedAt,
      dataset,
      scopeKind: scope.kind,
      actorUserId: scope.actorUserId,
      patientIds: scope.patientIds,
      restrictToPatientIds: scope.restrictToPatientIds,
      auditFilters,
      startDate,
      endDate,
      includeAudio,
      includeReports,
      includeHistory,
    });
    const exportJob = {
      id: exportId,
      organizationId,
      createdByUserId: user.id,
      format,
      dataset,
      scopeKind: scope.kind,
      filters: snapshot.filters,
      rendererVersion: EXPORT_ARTIFACT_RENDERER_VERSION,
      includeAudio,
      includeReports,
      includeHistory,
      startDate,
      endDate,
      status: "ready",
      recordCount: Number(snapshot.counts?.total || 0),
      downloadUrl: `/api/v1/exports/download/${encodeURIComponent(exportId)}`,
      snapshot,
      createdAt: generatedAt,
      updatedAt: generatedAt,
    };
    const context = getRequestContext(req) || createRequestContext(req);
    const result = await repositories.exports.createWithAudit(
      exportJob,
      {
        action: "export.create",
        actorUserId: user.id,
        organizationId,
        ip: context.ip || "",
        userAgent: context.userAgent || "",
        metadata: {
          format,
          dataset,
          scopeKind: scope.kind,
          rendererVersion: EXPORT_ARTIFACT_RENDERER_VERSION,
          filters: snapshot.filters,
        },
      },
      {
        scope: getIdempotencyScope(user, organizationId),
        operation: "export.create",
        key: idempotencyKey,
        fingerprint: createIdempotencyFingerprint({
          organizationId,
          format,
          dataset,
          scope,
          filters: snapshot.filters,
          rendererVersion: EXPORT_ARTIFACT_RENDERER_VERSION,
          startDate,
          endDate,
          includeAudio,
          includeReports,
          includeHistory,
        }),
      },
      201,
    );
    if (result.replayed) {
      res.setHeader("Idempotency-Replayed", "true");
    }
    sendJson(res, Number(result.responseStatus || 201), {
      export: publicExportJob(result.exportJob),
      replayed: Boolean(result.replayed),
    });
    return;
  }

  if (segments.length === 4 && segments[2] === "download" && method === "GET") {
    requireAnyCapability(user, REPORT_EXPORT_CAPABILITIES, "Không có quyền tải bản xuất dữ liệu");
    const requestedExportId = path.basename(decodeURIComponent(segments[3] || ""));
    const canonicalExportId = requestedExportId.replace(/\.(json|csv|xlsx|pdf)$/i, "");
    const exportJob = await repositories.exports.findById(canonicalExportId);
    if (!exportJob) {
      throw httpError(404, "Export was not found", "EXPORT_NOT_FOUND");
    }
    if (filterExportsForUser(user, [exportJob]).length === 0) {
      throw httpError(
        403,
        "The export is outside the current workspace",
        "EXPORT_SCOPE_DENIED",
      );
    }
    if (
      !normalizeExportFormat(exportJob.format) ||
      exportJob.status !== "ready" ||
      !exportJob.snapshot ||
      exportJob.snapshot.exportId !== exportJob.id ||
      exportJob.snapshot.scope?.organizationId !== exportJob.organizationId
    ) {
      throw httpError(
        409,
        "The export artifact is not ready or is no longer valid",
        "EXPORT_NOT_READY",
      );
    }
    let artifact;
    try {
      artifact = await buildExportArtifact(
        exportJob.snapshot,
        exportJob.format,
        exportJob.rendererVersion || EXPORT_ARTIFACT_RENDERER_VERSION,
      );
    } catch (error) {
      throw httpError(
        409,
        "The export renderer required by this artifact is unavailable",
        error.code || "EXPORT_RENDERER_UNAVAILABLE",
      );
    }
    const artifactSha256 = crypto.createHash("sha256").update(artifact.buffer).digest("hex");
    if (exportJob.artifactSha256 && exportJob.artifactSha256 !== artifactSha256) {
      throw httpError(
        409,
        "The export artifact failed its integrity check",
        "EXPORT_ARTIFACT_INTEGRITY_FAILED",
      );
    }
    const context = getRequestContext(req) || createRequestContext(req);
    const persisted = await repositories.exports.markDownloadedWithAudit(exportJob.id, {
      action: "export.download",
      actorUserId: user.id,
      organizationId: exportJob.organizationId,
      ip: context.ip || "",
      userAgent: context.userAgent || "",
      metadata: {
        format: exportJob.format,
        dataset: exportJob.dataset || "clinical_bundle",
        scopeKind: exportJob.scopeKind || "workspace",
        rendererVersion: exportJob.rendererVersion || EXPORT_ARTIFACT_RENDERER_VERSION,
        recordCount: Number(exportJob.recordCount || 0),
        artifactSha256,
      },
    });
    if (!persisted) {
      throw httpError(404, "Export was not found", "EXPORT_NOT_FOUND");
    }
    const filePrefix = exportJob.dataset === "audit_logs" ? "shcare-audit" : "shcare-export";
    const safeExportId = String(exportJob.id || "export").replace(/[^a-zA-Z0-9._-]/g, "-");
    sendBuffer(res, 200, artifact.buffer, {
      "Content-Type": artifact.contentType,
      "Content-Disposition": `attachment; filename="${filePrefix}-${safeExportId}.${artifact.extension}"`,
      "Cache-Control": "private, no-store",
      "X-Shcare-Artifact-SHA256": artifactSha256,
      "X-Shcare-Renderer-Version": exportJob.rendererVersion || EXPORT_ARTIFACT_RENDERER_VERSION,
    });
    return;
  }

  throw httpError(404, "Export route not found", "EXPORT_ROUTE_NOT_FOUND");
}

async function handleDataApi(req, res, segments) {
  const method = req.method || "GET";
  const user = requireUser(req);

  if (segments.length === 3 && segments[2] === "summary" && method === "GET") {
    requireAnyCapability(user, STORAGE_READ_CAPABILITIES, "Không có quyền xem tổng hợp storage");
    sendJson(res, 200, { storage: getStorageSummaryForUser(user) });
    return;
  }

  if (segments.length === 3 && segments[2] === "cache" && method === "DELETE") {
    requireAnyCapability(user, STORAGE_MANAGE_CAPABILITIES, "Không có quyền xóa cache storage");
    db.settings.storage.cacheMb = 0;
    addAccessLog("Xóa bộ nhớ tạm");
    saveDb();
    sendJson(res, 200, { storage: getStorageSummaryForUser(user) });
    return;
  }

  if (segments.length === 3 && segments[2] === "all" && method === "DELETE") {
    requireAnyCapability(user, ["platform.storage.manage"], "Chỉ platform admin mới được xóa toàn bộ dữ liệu");
    const payload = await readJsonBody(req);
    if (readString(payload.confirm, 40) !== "XOA DU LIEU") {
      throw httpError(400, "Cần nhập XOA DU LIEU để xác nhận");
    }
    for (const recording of listActiveRecordings()) {
      await stopRecording(recording.scanId);
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
    createNotification(
      "warning",
      "Đã xóa dữ liệu",
      "Toàn bộ hồ sơ và bản ghi âm đã được xóa theo yêu cầu.",
      {
        userId: user.id,
        organizationId: getUserWorkspaceContext(user).currentWorkspaceId || "",
      },
    );
    saveDb();
    sendJson(res, 200, { deleted: true, storage: getStorageSummary() });
    return;
  }

  sendJson(res, 404, { error: "Data route not found" });
}

async function handlePatientPortalApi(req, res, url, segments) {
  const method = req.method || "GET";
  const user = requireRole(req, ["patient"]);
  const isDashboardRead =
    segments.length === 3 &&
    segments[2] === "dashboard" &&
    method === "GET";
  let preauthorizedDashboardAccess = null;
  if (isDashboardRead) {
    try {
      preauthorizedDashboardAccess = assertPatientDashboardAccess({
        userId: user.id,
        role: user.role,
        workspaceContext: getUserWorkspaceContext(user),
      });
    } catch (error) {
      throw httpError(403, error.message, error.code || "PATIENT_DASHBOARD_ACCESS_DENIED");
    }
  }
  const dashboardWorkspaceId = preauthorizedDashboardAccess?.workspaceId || "";
  const dashboardProfiles = isDashboardRead
    ? db.patients.filter(
        (item) =>
          !item.deletedAt &&
          readString(item.organizationId, 120) === dashboardWorkspaceId &&
          [item.ownerUserId, item.accountUserId, item.guardianUserId].includes(user.id),
      )
    : null;
  const patient = isDashboardRead
    ? (
        dashboardProfiles.find((item) => item.id === user.patientId) ||
        dashboardProfiles.find(
          (item) =>
            item.accountUserId === user.id &&
            (item.profileType === "self" || item.relationship === "self"),
        ) ||
        null
      )
    : ensurePatientProfileForUser(user);
  const accessibleProfileIds = new Set(
    (isDashboardRead
      ? dashboardProfiles
      : filterPatientsForUser(user, db.patients)
    ).map((item) => item.id),
  );
  const ownScans = db.scans.filter((scan) => accessibleProfileIds.has(scan.patientId));

  if (isDashboardRead) {
    const dashboardAccess = preauthorizedDashboardAccess;
    const { workspaceId } = dashboardAccess;

    const activePatient = findPatient(user.activePatientId || patient?.id);
    if (
      !activePatient ||
      activePatient.deletedAt ||
      !accessibleProfileIds.has(activePatient.id)
    ) {
      throw httpError(
        403,
        "Hồ sơ đang chọn không thuộc tài khoản hiện tại",
        "PATIENT_DASHBOARD_PROFILE_SCOPE_DENIED",
      );
    }
    if (readString(activePatient.organizationId, 120) !== workspaceId) {
      throw httpError(
        409,
        "Hồ sơ đang chọn không thuộc workspace hiện tại",
        "PATIENT_DASHBOARD_PROFILE_WORKSPACE_MISMATCH",
      );
    }

    const activeScans = db.scans
      .filter(
        (scan) =>
          scan.patientId === activePatient.id &&
          getScanOrgId(scan) === workspaceId,
      )
      .map((scan) => ({
        ...scan,
        organizationId: getScanOrgId(scan),
      }));
    const dashboard = buildPatientDashboardSnapshot({
      userId: user.id,
      workspaceId,
      activePatient: withPatientStats(activePatient),
      scans: activeScans,
      devices: publicDevices(db.devices),
      canViewScans: dashboardAccess.canViewScans,
      canViewDevices: dashboardAccess.canViewDevices,
    });
    sendJson(res, 200, {
      dashboard,
      patient: dashboard.patient,
      stats: buildPatientDashboardLegacyStats(
        activeScans,
        dashboardAccess.canViewScans,
      ),
      recentScans: dashboard.recentScans,
    });
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
    const requestPayload = { ...payload };
    const idempotencyKey = getRequiredHeaderIdempotencyKey(req, "scan start");
    delete payload.patient;
    delete payload.patientName;
    delete payload.patientCode;
    delete payload.doctorNotes;
    delete payload.notes;
    const outcome = await startScanIdempotently(payload, user, idempotencyKey, requestPayload);
    sendJson(
      res,
      outcome.replayed ? 200 : 201,
      { scan: outcome.resource, ...(outcome.replayed ? { idempotent: true } : {}) },
    );
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
      const idempotencyKey = getRequiredHeaderIdempotencyKey(req, "scan stop");
      const outcome = await stopScanIdempotently(scan, user, idempotencyKey);
      sendJson(res, 200, {
        scan: outcome.resource,
        ...(outcome.replayed ? { idempotent: true } : {}),
      });
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

  if (segments.length === 3 && segments[2] === "status" && method === "GET") {
    requireAnyCapability(user, [
      "platform.dashboard.view",
      "workspace.dashboard.view",
    ]);
    const workspaceId = getUserWorkspaceContext(user).currentWorkspaceId;
    if (!workspaceId) {
      throw httpError(
        403,
        "An operational workspace is required",
        "WORKSPACE_MEMBERSHIP_REQUIRED",
      );
    }
    const devices = filterDevicesForUser(user, db.devices).filter(
      (device) => getDeviceWorkspaceId(device) === workspaceId,
    );
    const devicesOnline = devices.filter(
      (device) => publicDevice(device).online,
    ).length;
    sendJson(
      res,
      200,
      buildClinicalDashboardStatus({
        workspaceId,
        devicesCount: devices.length,
        devicesOnline,
        realtimeStatus: getStatusPayload({ _wsUser: user }, workspaceId),
        updatedAt: nowIso(),
      }),
    );
    return;
  }

  if (segments.length === 3 && segments[2] === "dashboard" && method === "GET") {
    requireAnyCapability(user, [
      "platform.dashboard.view",
      "workspace.dashboard.view",
    ]);
    const workspaceId = getUserWorkspaceContext(user).currentWorkspaceId;
    if (!workspaceId) {
      throw httpError(
        403,
        "An operational workspace is required",
        "WORKSPACE_MEMBERSHIP_REQUIRED",
      );
    }
    const devices = filterDevicesForUser(user, db.devices).filter(
      (device) => getDeviceWorkspaceId(device) === workspaceId,
    );
    const devicesOnline = devices.filter(
      (device) => publicDevice(device).online,
    ).length;
    const activeScans = listActiveRecordings()
      .map((recording) => findScan(recording.scanId))
      .filter(
        (scan) =>
          scan &&
          getScanOrgId(scan) === workspaceId &&
          canAccessScan(user, scan),
      );
    sendJson(res, 200, {
      workspaceId,
      status: buildClinicalDashboardStatus({
        workspaceId,
        devicesCount: devices.length,
        devicesOnline,
        realtimeStatus: getStatusPayload({ _wsUser: user }, workspaceId),
        updatedAt: nowIso(),
      }),
      stats: {
        patientCount: filterPatientsForUser(user, db.patients).filter(
          (patient) => patient.organizationId === workspaceId,
        ).length,
        scanCount: filterScansForUser(user, db.scans).filter(
          (scan) => getScanOrgId(scan) === workspaceId,
        ).length,
        activeScanId: activeScans[0]?.id || null,
        activeScanIds: activeScans.map((scan) => scan.id),
      },
      recentScans: filterScansForUser(user, db.scans)
        .filter((scan) => getScanOrgId(scan) === workspaceId)
        .slice(0, 5),
    });
    return;
  }

  if (segments[2] === "patients") {
    await handlePatientsApi(req, res, url, ["api", ...segments.slice(2)]);
    return;
  }

  if (segments[2] === "appointments") {
    await handleAppointmentsApi(req, res, url, ["api", ...segments.slice(2)]);
    return;
  }

  if (segments[2] === "scans") {
    await handleScansApi(req, res, url, ["api", ...segments.slice(2)]);
    return;
  }

  sendJson(res, 404, { error: "Doctor route not found" });
}

function clinicalWorkflowAuditInput(req, user) {
  const context = getRequestContext(req) || createRequestContext(req);
  return {
    actorUserId: user.id,
    ip: context.ip || "",
    userAgent: context.userAgent || readString(req.headers["user-agent"], 240),
  };
}

function clinicalWorkflowIdempotency(req, payload, user, organizationId, operation) {
  const key = getIdempotencyKey(req, payload);
  if (!key) {
    throw httpError(
      400,
      "Idempotency-Key is required for this clinical workflow mutation",
      "IDEMPOTENCY_KEY_REQUIRED",
    );
  }
  return {
    scope: getIdempotencyScope(user, organizationId),
    operation,
    key,
    fingerprint: createIdempotencyFingerprint(payload),
  };
}

async function findCanonicalClinicalScan(scanId) {
  const id = readString(scanId, 120);
  if (!id) return null;
  return repositories?.scans ? repositories.scans.findById(id) : findScan(id);
}

async function findCanonicalClinicalDevice(deviceId) {
  const id = readString(deviceId, 120);
  if (!id) return null;
  return repositories?.devices ? repositories.devices.findById(id) : findDevice(id);
}

async function assertClinicalAlertSourceAccess(user, alert, requireManage = false) {
  const workspaceId = getUserWorkspaceContext(user).currentWorkspaceId;
  if (!alert || alert.organizationId !== workspaceId) {
    throw httpError(403, "Alert is outside the current workspace", "ALERT_SCOPE_DENIED");
  }
  if (alert.sourceType === "device") {
    const device = await findCanonicalClinicalDevice(alert.deviceId || alert.sourceId);
    if (!device) throw httpError(404, "Alert device source was not found", "ALERT_SOURCE_NOT_FOUND");
    if (getDeviceWorkspaceId(device) !== alert.organizationId) {
      throw httpError(403, "Alert source is outside the alert workspace", "ALERT_SCOPE_DENIED");
    }
    if (requireManage) assertCanManageDevice(user, device);
    else assertCanAccessDevice(user, device);
  } else if (alert.sourceType === "scan") {
    const scan = await findCanonicalClinicalScan(alert.scanId || alert.sourceId);
    if (!scan) throw httpError(404, "Alert scan source was not found", "ALERT_SOURCE_NOT_FOUND");
    if (getScanOrgId(scan) !== alert.organizationId) {
      throw httpError(403, "Alert source is outside the alert workspace", "ALERT_SCOPE_DENIED");
    }
    if (requireManage) assertCanManageScan(user, scan);
    else assertCanAccessScan(user, scan);
  } else {
    throw httpError(409, "Alert source type is not supported", "ALERT_SOURCE_INVALID");
  }
}

async function handlePortalReviewQueueApi(req, res, url, segments, user) {
  const method = req.method || "GET";
  const workspaceId = getUserWorkspaceContext(user).currentWorkspaceId;
  if (!workspaceId) throw httpError(403, "An operational workspace is required", "WORKSPACE_MEMBERSHIP_REQUIRED");

  if (segments.length === 3 && method === "GET") {
    requireAnyCapability(user, ["platform.review.view", "workspace.review.view", "workspace.review.manage"]);
    const reviews = await repositories.clinicalReviews.list({
      organizationId: workspaceId,
      status: readString(url.searchParams.get("status"), 40),
      limit: Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || 50))),
    });
    const scopedReviews = (
      await Promise.all(
        reviews.map(async (review) => {
          const scan = await findCanonicalClinicalScan(review.scanId);
          return scan && canAccessScan(user, scan) ? review : null;
        }),
      )
    ).filter(Boolean);
    sendJson(res, 200, {
      workspaceId,
      reviews: scopedReviews,
      reviewQueue: scopedReviews,
    });
    return;
  }

  if (segments.length === 5 && segments[4] === "decision" && method === "POST") {
    requireAnyCapability(user, ["platform.review.manage", "workspace.review.manage"]);
    const scanId = decodeURIComponent(segments[3]);
    const scan = repositories?.scans ? await repositories.scans.findById(scanId) : findScan(scanId);
    if (!scan) throw httpError(404, "Scan was not found", "REVIEW_SCAN_NOT_FOUND");
    assertCanManageScan(user, scan);
    if (getScanOrgId(scan) !== workspaceId) {
      throw httpError(403, "Scan review is outside the current workspace", "REVIEW_SCOPE_DENIED");
    }
    const payload = await readJsonBody(req);
    const operation = `scan.review.decision:${scan.id}`;
    const result = await repositories.clinicalReviews.decide({
      organizationId: workspaceId,
      scanId: scan.id,
      decision: readString(payload.decision, 80),
      note: readString(payload.note, 4000),
      reviewerUserId: user.id,
      expectedVersion: payload.expectedVersion,
      idempotency: clinicalWorkflowIdempotency(req, payload, user, workspaceId, operation),
      audit: clinicalWorkflowAuditInput(req, user),
    });
    if (result.replayed) res.setHeader("Idempotency-Replayed", "true");
    sendJson(res, 200, { workspaceId, review: result.review });
    return;
  }

  throw httpError(404, "Review queue route not found", "REVIEW_ROUTE_NOT_FOUND");
}

async function handlePortalAlertsApi(req, res, url, segments, user) {
  const method = req.method || "GET";
  const workspaceId = getUserWorkspaceContext(user).currentWorkspaceId;
  if (!workspaceId) throw httpError(403, "An operational workspace is required", "WORKSPACE_MEMBERSHIP_REQUIRED");

  if (segments.length === 3 && method === "GET") {
    requireAnyCapability(user, ["platform.alerts.view", "workspace.alerts.view", "workspace.alerts.manage"]);
    const alerts = await repositories.clinicalAlerts.list({
      organizationId: workspaceId,
      status: readString(url.searchParams.get("status"), 40),
      limit: Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || 50))),
    });
    const scopedAlerts = (
      await Promise.all(
        alerts.map(async (alert) => {
          try {
            await assertClinicalAlertSourceAccess(user, alert, false);
            return alert;
          } catch {
            return null;
          }
        }),
      )
    ).filter(Boolean);
    sendJson(res, 200, { workspaceId, alerts: scopedAlerts });
    return;
  }

  if (segments.length === 3 && method === "POST") {
    requireAnyCapability(user, ["platform.alerts.manage", "workspace.alerts.manage"]);
    const payload = await readJsonBody(req);
    const sourceType = readString(payload.sourceType, 60).toLowerCase();
    const sourceId = readString(payload.sourceId, 160);
    let sourcePatientId = "";
    let sourceDeviceId = "";
    let sourceScanId = "";
    if (sourceType === "device") {
      const device = await findCanonicalClinicalDevice(sourceId);
      if (!device) throw httpError(404, "Alert device source was not found", "ALERT_SOURCE_NOT_FOUND");
      assertCanManageDevice(user, device);
      if (getDeviceWorkspaceId(device) !== workspaceId) throw httpError(403, "Alert source is outside the current workspace", "ALERT_SCOPE_DENIED");
      sourcePatientId = readString(device.assignedPatientId, 120);
      sourceDeviceId = device.id;
    } else if (sourceType === "scan") {
      const scan = await findCanonicalClinicalScan(sourceId);
      if (!scan) throw httpError(404, "Alert scan source was not found", "ALERT_SOURCE_NOT_FOUND");
      assertCanManageScan(user, scan);
      if (getScanOrgId(scan) !== workspaceId) throw httpError(403, "Alert source is outside the current workspace", "ALERT_SCOPE_DENIED");
      sourcePatientId = readString(scan.patientId, 120);
      sourceDeviceId = readString(scan.deviceId, 120);
      sourceScanId = scan.id;
    } else {
      throw httpError(400, "sourceType must be device or scan", "ALERT_SOURCE_INVALID");
    }
    const operation = `alert.source:${sourceType}:${sourceId}`;
    const result = await repositories.clinicalAlerts.upsertSource({
      organizationId: workspaceId,
      sourceType,
      sourceId,
      severity: readString(payload.severity, 40),
      title: readString(payload.title, 240),
      message: readString(payload.message, 2000),
      patientId: sourcePatientId,
      deviceId: sourceDeviceId,
      scanId: sourceScanId,
      metadata: payload.metadata,
      actorUserId: user.id,
      idempotency: clinicalWorkflowIdempotency(req, payload, user, workspaceId, operation),
      audit: clinicalWorkflowAuditInput(req, user),
    });
    if (result.replayed) res.setHeader("Idempotency-Replayed", "true");
    sendJson(res, result.deduplicated || result.replayed ? 200 : 201, {
      workspaceId,
      alert: result.alert,
      deduplicated: result.deduplicated,
    });
    return;
  }

  if (segments.length === 5 && ["acknowledge", "resolve"].includes(segments[4]) && method === "POST") {
    requireAnyCapability(user, ["platform.alerts.manage", "workspace.alerts.manage"]);
    const alertId = decodeURIComponent(segments[3]);
    const alert = await repositories.clinicalAlerts.findById(alertId);
    if (!alert) throw httpError(404, "Alert was not found", "ALERT_NOT_FOUND");
    await assertClinicalAlertSourceAccess(user, alert, true);
    const payload = await readJsonBody(req);
    const action = segments[4];
    const operation = `alert.${action}:${alert.id}`;
    const result = await repositories.clinicalAlerts.transition({
      organizationId: workspaceId,
      alertId: alert.id,
      action,
      actorUserId: user.id,
      expectedVersion: payload.expectedVersion,
      note: readString(payload.note || payload.reason, 2000),
      idempotency: clinicalWorkflowIdempotency(req, payload, user, workspaceId, operation),
      audit: clinicalWorkflowAuditInput(req, user),
    });
    if (result.replayed) res.setHeader("Idempotency-Replayed", "true");
    sendJson(res, 200, { workspaceId, alert: result.alert });
    return;
  }

  throw httpError(404, "Alert route not found", "ALERT_ROUTE_NOT_FOUND");
}

async function handlePortalStaffApi(req, res, url, segments, user) {
  const method = req.method || "GET";

  if (segments.length === 3 && method === "GET") {
    requireAnyCapability(user, ["workspace.staff.manage"], "Không có quyền xem nhân sự workspace");
    const workspaceId = getUserWorkspaceContext(user).currentWorkspaceId;
    if (!workspaceId || !hasWorkspaceMembership(user, workspaceId)) {
      throw httpError(403, "An operational workspace membership is required", "WORKSPACE_MEMBERSHIP_REQUIRED");
    }
    const workspace = getClinicById(workspaceId);
    const workspaceMemberships = db.memberships
      .filter(
        (membership) =>
          membership.organizationId === workspaceId &&
          readString(membership.status || "active", 40).toLowerCase() !== "revoked",
      )
      .sort((left, right) => String(left.createdAt || "").localeCompare(String(right.createdAt || "")));
    const staff = workspaceMemberships
      .map((membership) => {
        const account = db.users.find((candidate) => candidate.id === membership.userId);
        if (!account) return null;
        const membershipRole = normalizeWorkspaceRole(membership.role || "viewer");
        const membershipStatus =
          readString(membership.status || "active", 40).toLowerCase() ||
          "active";
        return {
          id: account.id,
          role:
            account.role === "admin"
              ? "platform_admin"
              : normalizeWorkspaceRole(account.role || membershipRole),
          name: readString(account.name, 240),
          title: readString(account.title, 160),
          email: readString(account.email, 320).toLowerCase(),
          phone: readString(account.phone, 80),
          avatarUrl: readString(account.avatarUrl, 500),
          license: readString(account.license, 160),
          hospital: readString(account.hospital || workspace?.name, 240),
          department: readString(account.department, 160),
          specialty: readString(
            account.specialty || account.department,
            160,
          ),
          accountStatus:
            readString(account.accountStatus || "active", 40).toLowerCase() ||
            "active",
          roleRequestStatus:
            readString(account.roleRequestStatus || "pending", 40).toLowerCase() ||
            "pending",
          verifiedEmail: Boolean(account.verifiedEmail),
          workspaceMembership: {
            id: membership.id,
            userId: account.id,
            organizationId: membership.organizationId,
            workspaceId: membership.organizationId,
            role: membershipRole,
            status: membershipStatus,
            operational: isOperationalWorkspaceMembership(account, membership, workspace),
            suspendedAt: membership.suspendedAt || "",
            createdAt: membership.createdAt || "",
            updatedAt: membership.updatedAt || membership.createdAt || "",
          },
        };
      })
      .filter(Boolean);
    sendJson(res, 200, {
      workspaceId,
      generatedAt: nowIso(),
      staff,
      doctors: staff.filter(
        (member) =>
          member.workspaceMembership?.role === "doctor" &&
          member.workspaceMembership?.operational === true,
      ),
    });
    return;
  }

  if (segments.length === 3 && method === "POST") {
    await handleAdminApi(req, res, url, ["api", "admin", "doctors"]);
    return;
  }

  const targetUserId = segments.length >= 4 ? decodeURIComponent(segments[3]) : "";
  const rawAction = segments.length >= 5 ? readString(segments[4], 40).toLowerCase() : "";
  let action = "";
  if (method === "DELETE" && segments.length === 4) action = "revoke";
  if (method === "PATCH" && ["lock", "suspend"].includes(rawAction)) action = "suspend";
  if (method === "PATCH" && ["unlock", "reactivate"].includes(rawAction)) action = "reactivate";
  if (method === "PATCH" && rawAction === "role") action = "change_role";
  if (!action || !targetUserId) {
    throw httpError(404, "Workspace staff route not found", "WORKSPACE_STAFF_ROUTE_NOT_FOUND");
  }

  requireAnyCapability(user, ["workspace.staff.manage"], "Không có quyền quản lý nhân sự workspace");
  const workspaceId = getUserWorkspaceContext(user).currentWorkspaceId;
  if (!workspaceId || !hasWorkspaceMembership(user, workspaceId)) {
    throw httpError(403, "An operational workspace membership is required", "WORKSPACE_MEMBERSHIP_REQUIRED");
  }
  const targetUser = repositories
    ? await repositories.users.findByIdOrFirebaseUid(targetUserId)
    : db.users.find((item) => item.id === targetUserId || item.firebaseUid === targetUserId);
  if (!targetUser) {
    throw httpError(404, "Workspace staff account was not found", "WORKSPACE_STAFF_NOT_FOUND");
  }

  if (action === "change_role") {
    if (targetUser.id === user.id) {
      throw httpError(
        409,
        "The current actor cannot change their own workspace role",
        "MEMBERSHIP_ROLE_SELF_CHANGE_DENIED",
      );
    }
    const payload = await readJsonBody(req);
    const role = readString(payload.role, 40).toLowerCase();
    const allowedRoles = new Set([
      "workspace_admin",
      "doctor",
      "nurse",
      "technician",
      "billing",
      "viewer",
    ]);
    if (!allowedRoles.has(role)) {
      throw httpError(
        400,
        "A valid workspace staff role is required",
        "MEMBERSHIP_ROLE_INVALID",
      );
    }
    const idempotencyKey = getIdempotencyKey(req);
    if (!idempotencyKey) {
      throw httpError(
        400,
        "Idempotency-Key is required for workspace membership mutations",
        "IDEMPOTENCY_KEY_REQUIRED",
      );
    }
    if (!repositories?.memberships?.changeRole) {
      throw httpError(
        503,
        "Workspace membership storage is unavailable",
        "MEMBERSHIP_STORAGE_UNAVAILABLE",
      );
    }
    const operation = `workspace.membership.${action}`;
    const fingerprint = createIdempotencyFingerprint({
      action,
      organizationId: workspaceId,
      targetUserId: targetUser.id,
      role,
    });
    const result = await repositories.memberships.changeRole({
      organizationId: workspaceId,
      targetUserId: targetUser.id,
      role,
      actorUserId: user.id,
      idempotency: {
        scope: getIdempotencyScope(user, workspaceId),
        operation: `${operation}:${targetUser.id}`,
        key: idempotencyKey,
        fingerprint,
      },
      audit: {
        actorUserId: user.id,
        organizationId: workspaceId,
        action: operation,
        resourceType: "membership",
        ip: req.socket.remoteAddress || "",
        userAgent: readString(req.headers["user-agent"], 240),
        metadata: {
          action,
          targetUserId: targetUser.id,
          role,
          globalIdentityChanged: false,
        },
      },
    });
    if (result.replayed) res.setHeader("Idempotency-Replayed", "true");
    sendJson(res, 200, {
      action,
      membership: result.membership,
      replayed: result.replayed,
      user: publicUser(targetUser),
    });
    return;
  }

  const idempotencyKey = getIdempotencyKey(req);
  if (!idempotencyKey) {
    throw httpError(
      400,
      "Idempotency-Key is required for workspace membership mutations",
      "IDEMPOTENCY_KEY_REQUIRED",
    );
  }
  if (!repositories?.memberships?.changeLifecycle) {
    throw httpError(
      503,
      "Workspace membership storage is unavailable",
      "MEMBERSHIP_STORAGE_UNAVAILABLE",
    );
  }

  const operation = `workspace.membership.${action}`;
  const fingerprint = createIdempotencyFingerprint({
    action,
    organizationId: workspaceId,
    targetUserId: targetUser.id,
  });
  const result = await repositories.memberships.changeLifecycle({
    organizationId: workspaceId,
    targetUserId: targetUser.id,
    action,
    actorUserId: user.id,
    idempotency: {
      scope: getIdempotencyScope(user, workspaceId),
      operation: `${operation}:${targetUser.id}`,
      key: idempotencyKey,
      fingerprint,
    },
    audit: {
      actorUserId: user.id,
      organizationId: workspaceId,
      action: operation,
      resourceType: "membership",
      ip: req.socket.remoteAddress || "",
      userAgent: readString(req.headers["user-agent"], 240),
      metadata: {
        action,
        targetUserId: targetUser.id,
        globalIdentityChanged: false,
      },
    },
  });
  if (result.replayed) res.setHeader("Idempotency-Replayed", "true");
  sendJson(res, 200, {
    action,
    membership: result.membership,
    revoked: action === "revoke",
    replayed: result.replayed,
    user: publicUser(targetUser),
  });
}

async function handlePortalApi(req, res, url, segments) {
  const method = req.method || "GET";
  const user = requirePortalSurfaceUser(req);
  const resource = segments[2] || "";

  if (resource === "status" && segments.length === 3 && method === "GET") {
    requireAnyCapability(user, ["workspace.dashboard.view", "workspace.devices.view", "workspace.scans.view"]);
    const workspaceContext = getUserWorkspaceContext(user);
    const currentWorkspaceId = workspaceContext.currentWorkspaceId || user.organizationId || "";
    const workspace = getClinicById(currentWorkspaceId);
    const patients = filterPatientsForUser(user, db.patients).filter(
      (patient) => patient.organizationId === currentWorkspaceId,
    );
    const devices = filterDevicesForUser(user, db.devices).filter(
      (device) => getDeviceWorkspaceId(device) === currentWorkspaceId,
    );
    const scans = filterScansForUser(user, db.scans).filter(
      (scan) => getScanOrgId(scan) === currentWorkspaceId,
    );
    const onlineDevices = devices.filter((device) => publicDevice(device).online);
    const alertsCount = devices.filter((device) => {
      const status = String(device.status || "").toLowerCase();
      return device.connected === false || status.includes("offline") || status.includes("error") || status.includes("fail");
    }).length;
    sendJson(res, 200, {
      ok: true,
      service: "smart-health-backend",
      now: nowIso(),
      workspace: {
        id: currentWorkspaceId,
        name: workspace?.name || user.currentWorkspace?.name || currentWorkspaceId || "Workspace",
        type: workspace?.workspaceType || workspace?.type || user.currentWorkspace?.workspaceType || "",
      },
      scoped: {
        patientsCount: patients.length,
        devicesCount: devices.length,
        devicesOnline: onlineDevices.length,
        scansCount: scans.length,
        alertsCount,
      },
      status: buildClinicalDashboardStatus({
        workspaceId: currentWorkspaceId,
        devicesCount: devices.length,
        devicesOnline: onlineDevices.length,
        realtimeStatus: getStatusPayload({ _wsUser: user }, currentWorkspaceId),
        updatedAt: nowIso(),
      }),
    });
    return;
  }

  if ((resource === "overview" || resource === "dashboard") && segments.length === 3 && method === "GET") {
    await handleAdminApi(req, res, url, ["api", "admin", "overview-stats"]);
    return;
  }

  if (resource === "patients") {
    await handlePatientsApi(req, res, url, ["api", ...segments.slice(2)]);
    return;
  }

  if (resource === "appointments") {
    await handleAppointmentsApi(req, res, url, ["api", ...segments.slice(2)]);
    return;
  }

  if (resource === "review-queue" || resource === "reviews") {
    await handlePortalReviewQueueApi(req, res, url, segments, user);
    return;
  }

  if (resource === "alerts") {
    await handlePortalAlertsApi(req, res, url, segments, user);
    return;
  }

  if (resource === "devices") {
    if (segments.length === 3 && method === "GET") {
      requireAnyCapability(user, [
        "workspace.devices.view",
        "workspace.devices.manage",
        "platform.devices.view",
        "platform.devices.manage",
        "personal.devices.manage",
      ]);
      const workspaceId = getUserWorkspaceContext(user).currentWorkspaceId;
      if (!workspaceId) {
        throw httpError(
          403,
          "An operational workspace is required",
          "WORKSPACE_MEMBERSHIP_REQUIRED",
        );
      }
      if (repositories) {
        await repositories.devices.list();
      }
      refreshDevicePresence();
      const devices = publicDevices(
        filterDevicesForUser(user, db.devices).filter(
          (device) => getDeviceWorkspaceId(device) === workspaceId,
        ),
      );
      sendJson(res, 200, {
        generatedAt: nowIso(),
        workspaceId,
        devices,
      });
      return;
    }
    await handleDevicesApi(req, res, url, ["api", ...segments.slice(2)]);
    return;
  }

  if (resource === "scans" || resource === "monitoring") {
    if (resource === "monitoring" && segments.length === 3 && method === "GET") {
      requireAnyCapability(user, ["workspace.dashboard.view", "workspace.devices.view", "workspace.scans.view"]);
      const workspaceId = getUserWorkspaceContext(user).currentWorkspaceId;
      if (!workspaceId) {
        throw httpError(
          403,
          "An operational workspace is required",
          "WORKSPACE_MEMBERSHIP_REQUIRED",
        );
      }
      const devices = publicDevices(
        filterDevicesForUser(user, db.devices).filter(
          (device) => getDeviceWorkspaceId(device) === workspaceId,
        ),
      );
      const scans = filterScansForUser(user, db.scans)
        .filter((scan) => getScanOrgId(scan) === workspaceId)
        .slice(0, 50)
        .map((scan) => ({
          ...scan,
          organizationId: getScanOrgId(scan),
        }));
      const attentionDevices = devices.filter((device) => {
        const status = String(device.status || "").toLowerCase();
        return !device.online || status.includes("offline") || status.includes("error") || status.includes("fail");
      });
      const ledgerAlerts = repositories?.clinicalAlerts
        ? await repositories.clinicalAlerts.list({
            organizationId: workspaceId,
            limit: 50,
          })
        : [];
      const scopedLedgerAlerts = (
        await Promise.all(
          ledgerAlerts.map(async (alert) => {
            try {
              await assertClinicalAlertSourceAccess(user, alert, false);
              return alert;
            } catch {
              return null;
            }
          }),
        )
      ).filter(Boolean);
      const scopedRealtimeStatus = getStatusPayload({ _wsUser: user }, workspaceId);
      const response = {
        generatedAt: nowIso(),
        workspaceId,
        status: {
          type: "status",
          recording: scopedRealtimeStatus.recording,
          workspaceId: scopedRealtimeStatus.workspaceId,
          patientId: scopedRealtimeStatus.patientId,
          deviceId: scopedRealtimeStatus.deviceId,
          scanId: scopedRealtimeStatus.scanId,
          sessionId: scopedRealtimeStatus.sessionId,
          updatedAt: scopedRealtimeStatus.updatedAt,
        },
        devices,
        scans,
        alerts: scopedLedgerAlerts,
      };
      if (!url.pathname.startsWith("/api/v1/")) {
        response.attentionSignals = attentionDevices.map((device) => ({
          id: device.id,
          type: "device",
          severity: "warning",
          title: "Thiết bị cần kiểm tra",
          message: `${device.name || device.id} đang mất kết nối hoặc có trạng thái bất thường.`,
          deviceId: device.id,
          createdAt: device.lastSeenAt || device.updatedAt || nowIso(),
        }));
      }
      sendJson(res, 200, response);
      return;
    }
    await handleScansApi(req, res, url, ["api", ...(resource === "monitoring" ? ["scans", ...segments.slice(3)] : segments.slice(2))]);
    return;
  }

  if (resource === "staff" || resource === "doctors") {
    await handlePortalStaffApi(req, res, url, segments, user);
    return;
  }

  if (resource === "billing" && segments.length === 3 && method === "GET") {
    requireAnyCapability(user, ["billing.view"], "Không có quyền xem thông tin billing workspace");
    sendJson(res, 200, buildPortalBillingSummary(user));
    return;
  }

  if (resource === "reports" && segments.length === 3 && method === "GET") {
    requireAnyCapability(user, ["workspace.reports.view"]);
    const patients = filterPatientsForUser(user, db.patients);
    const devices = filterDevicesForUser(user, db.devices);
    const scans = filterScansForUser(user, db.scans);
    sendJson(res, 200, {
      summary: {
        patientsCount: patients.length,
        devicesCount: devices.length,
        scansCount: scans.length,
        abnormalScansCount: scans.filter((scan) => String(scan.aiLabel || scan.status || "").toLowerCase().includes("abnormal")).length,
      },
      latestScans: scans.slice(0, 20),
    });
    return;
  }

  if (resource === "notifications") {
    await handleNotificationsApi(req, res, ["api", ...segments.slice(2)]);
    return;
  }

  if (resource === "audit-log") {
    await handleAuditLogsApi(req, res, url, ["api", "audit-logs"]);
    return;
  }

  if (resource === "settings") {
    if (segments.length === 3 && method === "GET") {
      const workspaceId = getUserWorkspaceContext(user).currentWorkspaceId;
      const workspace = getClinicById(workspaceId);
      if (!workspace) {
        throw httpError(
          404,
          "Không tìm thấy workspace hiện tại",
          "WORKSPACE_NOT_FOUND",
        );
      }
      sendJson(res, 200, {
        settings: publicSettings(user),
        workspace: publicClinic(workspace),
      });
      return;
    }
    if (segments[3] === "workspace" && segments.length === 4 && method === "PATCH") {
      requireAnyCapability(user, ["workspace.settings.manage"], "Không có quyền cập nhật thông tin workspace");
      const workspace = getClinicById(getUserWorkspaceContext(user).currentWorkspaceId);
      if (!workspace) {
        throw httpError(404, "Không tìm thấy workspace hiện tại");
      }
      if (!repositories?.workspaceLifecycle) {
        throw httpError(
          503,
          "Kho dữ liệu workspace chưa sẵn sàng",
          "WORKSPACE_LIFECYCLE_REPOSITORY_UNAVAILABLE",
        );
      }
      const requestPath = parseRequestPath(req).pathname;
      const canonicalPath = "/api/v1/portal/settings/workspace";
      const legacyPath = "/api/portal/settings/workspace";
      const isCanonicalRequest = requestPath === canonicalPath;
      const isLegacyCompatibilityRequest = requestPath === legacyPath;
      const rawIdempotencyKey = req.headers["idempotency-key"];
      if (Array.isArray(rawIdempotencyKey) || String(rawIdempotencyKey || "").trim().length > 160) {
        throw httpError(
          400,
          "Idempotency-Key must be a single value no longer than 160 characters",
          "IDEMPOTENCY_KEY_INVALID",
        );
      }
      const suppliedIdempotencyKey = String(rawIdempotencyKey || "").trim();
      if (isCanonicalRequest && !suppliedIdempotencyKey) {
        throw httpError(
          400,
          "Idempotency-Key is required for workspace settings update",
          "IDEMPOTENCY_KEY_REQUIRED",
        );
      }
      if (isLegacyCompatibilityRequest) {
        requestMetrics.legacyWorkspaceSettingsUpdate += 1;
        res.setHeader("Deprecation", "true");
        res.setHeader("X-Shcare-Compatibility-Alias", "workspace-settings-update");
      }
      const payload = await readJsonBody(req);
      const normalized = normalizeWorkspaceSettingsUpdate(payload, {
        requireComplete: isCanonicalRequest,
        fallbackExpectedVersion: workspace.version,
      });
      const idempotencyKey = suppliedIdempotencyKey || createId("legacy_workspace_settings");
      const operation = "workspace.settings.update";
      const context = getRequestContext(req) || createRequestContext(req);
      const result = await repositories.workspaceLifecycle.update({
        workspaceId: workspace.id,
        expectedVersion: normalized.expectedVersion,
        payload: normalized.patch,
        idempotency: {
          scope: getIdempotencyScope(user, workspace.id),
          operation,
          key: idempotencyKey,
          fingerprint: createIdempotencyFingerprint({
            expectedVersion: normalized.expectedVersion,
            payload: normalized.patch,
          }),
        },
        audit: {
          action: operation,
          actorUserId: user.id,
          organizationId: workspace.id,
          resourceType: "workspace",
          resourceId: workspace.id,
          ip: context.ip || "",
          userAgent: context.userAgent || "",
          metadata: {
            fields: Object.keys(normalized.patch).sort(),
            expectedVersion: normalized.expectedVersion,
          },
        },
      });
      const confirmedWorkspace = result.responseBody?.workspace;
      const operationId = readString(result.responseBody?.operationId, 160);
      if (!confirmedWorkspace?.id || !operationId) {
        throw httpError(
          500,
          "Workspace settings repository returned an incomplete receipt",
          "WORKSPACE_SETTINGS_RECEIPT_INCOMPLETE",
        );
      }
      if (result.replayed) res.setHeader("Idempotency-Replayed", "true");
      sendJson(res, 200, {
        ownership: {
          userId: user.id,
          workspaceId: confirmedWorkspace.id,
        },
        workspace: {
          id: confirmedWorkspace.id,
          name: confirmedWorkspace.name || "",
          address: confirmedWorkspace.address || "",
          phone: confirmedWorkspace.phone || "",
          email: confirmedWorkspace.email || "",
          website: confirmedWorkspace.website || "",
          version: Number(confirmedWorkspace.version || 0),
          updatedAt: confirmedWorkspace.updatedAt || "",
        },
        operationId,
        replayed: result.replayed === true,
      });
      return;
    }
    await handleSettingsApi(req, res, ["api", "settings", ...segments.slice(3)]);
    return;
  }

  if (resource === "storage") {
    if (segments[3] === "stats" || segments.length === 3) {
      await handleAdminApi(req, res, url, ["api", "admin", "storage-stats"]);
      return;
    }
    if (segments[3] === "files") {
      await handleAdminApi(req, res, url, ["api", "admin", "storage-files", ...segments.slice(4)]);
      return;
    }
    if (segments[3] === "buckets") {
      await handleAdminApi(req, res, url, ["api", "admin", "storage-buckets", ...segments.slice(4)]);
      return;
    }
  }

  if (resource === "support" && segments.length === 3 && method === "POST") {
    if (!repositories?.supportTickets) {
      throw httpError(
        503,
        "Kho dữ liệu yêu cầu hỗ trợ chưa sẵn sàng",
        "SUPPORT_TICKET_REPOSITORY_UNAVAILABLE",
      );
    }
    const payload = await readJsonBody(req);
    const workspaceId =
      getUserWorkspaceContext(user).currentWorkspaceId ||
      user.organizationId ||
      "";
    if (!workspaceId || !hasWorkspaceMembership(user, workspaceId)) {
      throw httpError(
        403,
        "Cần membership workspace đang hoạt động để gửi yêu cầu hỗ trợ",
        "WORKSPACE_MEMBERSHIP_REQUIRED",
      );
    }
    const requestPayload = normalizeSupportTicketCreate(payload, {
      workspaceId,
      requesterUserId: user.id,
    });
    const idempotencyKey = getRequiredIdempotencyKey(
      req,
      payload,
      "support ticket creation",
    );
    const requestContext =
      getRequestContext(req) || createRequestContext(req);
    const result = await repositories.supportTickets.create({
      payload: requestPayload,
      idempotency: {
        scope: getIdempotencyScope(user, workspaceId),
        operation: "support.ticket.create",
        key: idempotencyKey,
        fingerprint: createIdempotencyFingerprint(requestPayload),
      },
      audit: {
        actorUserId: user.id,
        organizationId: workspaceId,
        action: "support.ticket.create",
        ip: requestContext.ip || "",
        userAgent:
          requestContext.userAgent ||
          readString(req.headers["user-agent"], 240),
      },
    });
    if (result.replayed) {
      res.setHeader("Idempotency-Replayed", "true");
    }
    sendJson(res, result.replayed ? 200 : 201, {
      ticket: result.ticket,
      replayed: result.replayed,
    });
    return;
  }

  sendJson(res, 404, { error: "Portal route not found" });
}

function isActiveUserAccount(user) {
  const status = readString(user?.accountStatus || "active", 40).toLowerCase();
  return Boolean(user) && !user.deletedAt && status === "active";
}

function shareTargetWorkspace(org) {
  const clinic = publicClinic(org);
  return {
    id: clinic.id,
    name: clinic.name,
    type: clinic.workspaceType || clinic.type || "",
    address: clinic.address || "",
  };
}

function shareTargetDoctor(user) {
  const clinic = getClinicById(user.organizationId);
  return {
    id: user.id,
    name: user.name || user.email || user.id,
    specialty: user.department || user.specialty || "",
    organizationId: user.organizationId || "",
    clinicName: user.hospital || clinic?.name || "",
  };
}

function matchesShareTargetQuery(target, query) {
  if (!query) return true;
  return [target.id, target.name, target.specialty, target.clinicName, target.type, target.address]
    .filter(Boolean)
    .some((value) => normalizeLookup(value).includes(query));
}

function getVisibleShareWorkspaces(user) {
  const activeWorkspaces = db.organizations.filter(
    (org) => !org.deletedAt && String(org.status || "active") === "active",
  );
  if (isPlatformAdminUser(user) || isPatientUser(user)) {
    return activeWorkspaces;
  }

  const workspaceContext = getUserWorkspaceContext(user);
  const visibleIds = new Set(
    [
      user.organizationId,
      workspaceContext.currentWorkspaceId,
      ...workspaceContext.memberships.map((membership) => membership.workspaceId || membership.organizationId),
    ]
      .map((id) => readString(id, 120))
      .filter(Boolean),
  );
  return activeWorkspaces.filter((workspace) => visibleIds.has(workspace.id));
}

async function handleShareTargetsApi(req, res, url, segments) {
  const method = req.method || "GET";
  const user = requireUser(req);
  if (segments.length !== 2 || method !== "GET") {
    sendJson(res, 404, { error: "Share targets route not found" });
    return;
  }

  const query = normalizeLookup(url.searchParams.get("q") || "");
  const visibleWorkspaces = getVisibleShareWorkspaces(user);
  const visibleWorkspaceIds = new Set(visibleWorkspaces.map((workspace) => workspace.id));
  const canSeeAllDoctors = isPlatformAdminUser(user) || isPatientUser(user);

  const doctors = db.users
    .filter(isApprovedActiveDoctorPrincipal)
    .filter((candidate) => candidate.id !== user.id)
    .filter((candidate) => canSeeAllDoctors || visibleWorkspaceIds.has(candidate.organizationId))
    .map(shareTargetDoctor)
    .filter((target) => matchesShareTargetQuery(target, query))
    .slice(0, 50);

  const workspaces = visibleWorkspaces
    .map(shareTargetWorkspace)
    .filter((target) => matchesShareTargetQuery(target, query))
    .slice(0, 50);

  const workspaceId =
    getUserWorkspaceContext(user).currentWorkspaceId ||
    readString(user.organizationId, 120);
  if (!workspaceId) {
    throw httpError(
      403,
      "An operational workspace is required",
      "WORKSPACE_MEMBERSHIP_REQUIRED",
    );
  }
  sendJson(res, 200, {
    generatedAt: nowIso(),
    workspaceId,
    doctors,
    workspaces,
  });
}

async function handleApi(req, res, url) {
  const method = req.method || "GET";
  let segments = url.pathname.split("/").filter(Boolean);
  if (segments[1] === "v1") {
    segments = [segments[0], ...segments.slice(2)];
  }

  if (method === "GET" && segments[1] === "health" && segments[2] === "data-summary") {
    const user = requireUser(req);
    requireAnyCapability(
      user,
      ["platform.settings.manage"],
      "Không có quyền xem chẩn đoán dữ liệu production",
    );
    const deviceIds = db.devices.map((d) => d.id);
    sendJson(res, 200, {
      ok: true,
      counts: {
        users: db.users.length,
        devices: db.devices.length,
        patients: db.patients.length,
        scans: db.scans.length,
        organizations: (db.organizations || []).length,
      },
      deviceIds,
      dataBackend: DATA_BACKEND,
      authMode: AUTH_MODE,
    });
    return;
  }

  if (method === "POST" && segments[1] === "health" && segments[2] === "force-seed") {
    const user = requireUser(req);
    requireAnyCapability(
      user,
      ["platform.settings.manage"],
      "Không có quyền nạp dữ liệu khởi tạo",
    );
    if (AUTH_MODE === "production" || process.env.NODE_ENV === "production") {
      throw httpError(404, "Not found");
    }
    const seedKey = req.headers["x-seed-key"] || "";
    const configuredSeedKey = readString(process.env.FORCE_SEED_KEY, 240);
    if (!configuredSeedKey || seedKey !== configuredSeedKey) {
      throw httpError(403, "Invalid seed key");
    }
    const seedFile = path.join(__dirname, "db", "seeds", "seed-database.json");
    if (DATA_BACKEND === "postgres") {
      const { spawnSync } = require("node:child_process");
      const seedProc = spawnSync(process.execPath, [path.join(__dirname, "scripts", "seedProductionIncremental.js")], {
        stdio: "pipe",
        env: { ...process.env, DB_FILE: seedFile },
        timeout: 120000,
      });
      const stdout = seedProc.stdout?.toString() || "";
      const stderr = seedProc.stderr?.toString() || "";
      if (seedProc.status === 0) {
        // Reload in-memory db from postgres
        if (dataStore && typeof dataStore.reload === "function") {
          await dataStore.reload();
        }
      }
      sendJson(res, 200, {
        ok: seedProc.status === 0,
        exitCode: seedProc.status,
        message: seedProc.status === 0 ? "Incremental seed completed successfully" : "Seed failed",
        stdout: stdout.slice(-2000),
        stderr: stderr.slice(-2000),
      });
      return;
    }
    sendJson(res, 200, { ok: true, message: "Not postgres backend, skipping" });
    return;
  }

  if (method === "GET" && segments[1] === "health") {
    const publicHealthStatus = buildPublicHealthStatus(nowIso());
    sendJson(res, 200, {
      ok: true,
      service: "smart-health-backend",
      release: buildReleaseIdentity(process.env),
      status: publicHealthStatus,
      now: publicHealthStatus.updatedAt,
    });
    return;
  }

  if (method === "GET" && segments[1] === "status") {
    sendJson(res, 200, buildPublicHealthStatus(nowIso()));
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

  if (method === "POST" && segments[1] === "contact" && segments.length === 2) {
    const payload = await readJsonBody(req);
    const name = readString(payload.name, 160);
    const email = readString(payload.email, 180).toLowerCase();
    const message = readString(payload.message, 3000);
    if (!name || !isValidEmailAddress(email) || !message) {
      throw httpError(400, "Họ tên, email hợp lệ và nội dung liên hệ là bắt buộc");
    }
    const notification = await createBackendNotification({
      type: "info",
      title: `Liên hệ triển khai từ ${name}`,
      message,
      metadata: {
        actionPath: "/notifications",
        contactName: name,
        contactEmail: email,
        contactPhone: readString(payload.phone, 80),
        contactRole: readString(payload.role, 120),
        clinicName: readString(payload.clinic, 180),
        scale: readString(payload.scale, 120),
      },
    });
    addAccessLog("Tiếp nhận liên hệ từ website", { ip: req.socket.remoteAddress || "" });
    await saveDb();
    sendJson(res, 201, { ok: true, requestId: notification.id });
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

  if (segments[1] === "staff-invitations") {
    await handleStaffInvitationAcceptanceApi(req, res, segments);
    return;
  }

  if (segments[1] === "auth") {
    await handleAuthApi(req, res, segments);
    return;
  }

  if (segments[1] === "admin") {
    await handleAdminApi(req, res, url, segments);
    return;
  }

  if (segments[1] === "portal") {
    await handlePortalApi(req, res, url, segments);
    return;
  }

  if (segments[1] === "me") {
    await handleMeApi(req, res, segments);
    return;
  }

  if (segments[1] === "share-targets") {
    await handleShareTargetsApi(req, res, url, segments);
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

  if (segments[1] === "access-logs" || segments[1] === "audit-logs") {
    await handleAuditLogsApi(req, res, url, segments);
    return;
  }

  if (segments[1] === "devices") {
    await handleDevicesApi(req, res, url, segments);
    return;
  }

  if (segments[1] === "ai") {
    await handleAiApi(req, res, segments);
    return;
  }

  if (segments[1] === "exports") {
    await handleExportsApi(req, res, url, segments);
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

  if (segments[1] === "appointments") {
    await handleAppointmentsApi(req, res, url, segments);
    return;
  }

  if (segments[1] === "scans") {
    await handleScansApi(req, res, url, segments);
    return;
  }

  sendJson(res, 404, { error: "API route not found" });
}

function getPatientMutationAuthorization(user, patient, operation, authority = null) {
  return {
    kind: isPlatformAdminUser(user) ? "platform" : isPatientUser(user) ? "personal" : "workspace",
    actorUserId: user.id,
    patientId: patient.id || "",
    organizationId: patient.organizationId || "",
    operation,
    ...(authority || {}),
  };
}

function publicPatientMutationPatient(patient) {
  const source = Object.prototype.hasOwnProperty.call(patient || {}, "scanCount")
    ? patient
    : withPatientStats(patient || {});
  const emergencyContact =
    source.emergencyContact &&
    typeof source.emergencyContact === "object" &&
    !Array.isArray(source.emergencyContact)
      ? source.emergencyContact
      : {};
  return {
    id: readString(source.id, 120),
    patientCode: readString(source.patientCode, 120),
    name: readString(source.name, 160),
    age:
      source.age === null || source.age === undefined || source.age === ""
        ? null
        : Number(source.age),
    dateOfBirth: readString(source.dateOfBirth || source.dob, 32),
    bloodType: readString(source.bloodType, 20),
    allergies: Array.isArray(source.allergies)
      ? source.allergies.map((item) => readString(item, 160)).filter(Boolean)
      : [],
    emergencyContact: {
      name: readString(emergencyContact.name, 160),
      phone: readString(emergencyContact.phone, 40),
      relationship: readString(emergencyContact.relationship, 80),
    },
    gender: readString(source.gender, 40),
    phone: readString(source.phone, 40),
    email: readString(source.email, 120),
    address: readString(source.address, 240),
    notes: readString(source.notes, 2000),
    organizationId: readString(source.organizationId, 120),
    ownerUserId: readString(source.ownerUserId, 120),
    guardianUserId: readString(source.guardianUserId, 120),
    profileType: readString(source.profileType, 60),
    relationship: readString(source.relationship, 80),
    familyGroupId: readString(source.familyGroupId, 120),
    accountUserId: readString(source.accountUserId, 120),
    primaryDoctorId: readString(source.primaryDoctorId, 120),
    doctorName: readString(source.doctorName, 160),
    createdAt: readString(source.createdAt, 64),
    updatedAt: readString(source.updatedAt, 64),
    scanCount: Math.max(0, Number(source.scanCount || 0)),
    lastScanAt: source.lastScanAt ? readString(source.lastScanAt, 64) : null,
    lastAiLabel: source.lastAiLabel ? readString(source.lastAiLabel, 240) : null,
  };
}

function buildPatientMutationReceipt(user, patient, intent, replayed = false) {
  const patientId = readString(patient?.id, 120);
  const workspaceId = readString(patient?.organizationId, 120);
  if (!user?.id || !patientId || !workspaceId) {
    throw httpError(
      503,
      "Patient mutation receipt is missing canonical identity",
      "PATIENT_MUTATION_RECEIPT_UNAVAILABLE",
    );
  }
  const receipt = {
    userId: user.id,
    workspaceId,
    patientId,
    intent,
  };
  if (intent === "delete") {
    return { ...receipt, deleted: true, replayed: Boolean(replayed) };
  }
  return {
    ...receipt,
    patient: publicPatientMutationPatient(patient),
    replayed: Boolean(replayed),
  };
}

function resolvePatientMutationReceipt(
  user,
  patient,
  intent,
  replayed,
  responseResource = null,
) {
  const canonical = buildPatientMutationReceipt(user, patient, intent, replayed);
  const stored =
    responseResource &&
    typeof responseResource === "object" &&
    !Array.isArray(responseResource)
      ? responseResource
      : null;
  const hasCanonicalStoredReceipt = Boolean(
    stored?.userId && stored?.workspaceId && stored?.patientId && stored?.intent,
  );
  if (!hasCanonicalStoredReceipt) {
    return canonical;
  }
  const storedPatient = stored.patient;
  if (
    stored.userId !== canonical.userId ||
    stored.workspaceId !== canonical.workspaceId ||
    stored.patientId !== canonical.patientId ||
    stored.intent !== intent ||
    typeof stored.replayed !== "boolean" ||
    !storedPatient ||
    typeof storedPatient !== "object" ||
    Array.isArray(storedPatient) ||
    storedPatient.id !== canonical.patientId ||
    storedPatient.organizationId !== canonical.workspaceId
  ) {
    throw httpError(
      409,
      "Stored patient mutation receipt does not match the requested mutation",
      "IDEMPOTENT_PATIENT_MUTATION_MISMATCH",
    );
  }
  return {
    userId: canonical.userId,
    workspaceId: canonical.workspaceId,
    patientId: canonical.patientId,
    intent,
    patient: publicPatientMutationPatient(storedPatient),
    replayed: Boolean(replayed),
  };
}

function publicPatientImportBatch(batch) {
  if (!batch) return null;
  const expired =
    !["committed", "expired"].includes(batch.status) &&
    Number.isFinite(Date.parse(batch.expiresAt || "")) &&
    Date.parse(batch.expiresAt) <= Date.now();
  return {
    id: batch.id,
    organizationId: batch.organizationId || "",
    fileName: batch.fileName || "patients.csv",
    fileSizeBytes: Number(batch.fileSizeBytes || 0),
    status: expired ? "expired" : batch.status,
    rowCount: Number(batch.rowCount || 0),
    validCount: Number(batch.validCount || 0),
    invalidCount: Number(batch.invalidCount || 0),
    duplicateCount: Number(batch.duplicateCount || 0),
    importedCount: Number(batch.importedCount || 0),
    patientIds: Array.isArray(batch.patientIds) ? [...batch.patientIds] : [],
    rows: (Array.isArray(batch.rows) ? batch.rows : []).map((row) => ({
      rowNumber: Number(row.rowNumber || 0),
      status: row.status === "valid" ? "valid" : "invalid",
      issues: Array.isArray(row.issues) ? row.issues : [],
      patient: row.patient && typeof row.patient === "object"
        ? {
            id: row.patient.id || "",
            patientCode: row.patient.patientCode || "",
            name: row.patient.name || "",
            dateOfBirth: row.patient.dateOfBirth || "",
            gender: row.patient.gender || "",
            phone: row.patient.phone || "",
            email: row.patient.email || "",
            address: row.patient.address || "",
            bloodType: row.patient.bloodType || "",
            allergies: Array.isArray(row.patient.allergies) ? row.patient.allergies : [],
            emergencyContact:
              row.patient.emergencyContact && typeof row.patient.emergencyContact === "object"
                ? row.patient.emergencyContact
                : {},
            notes: row.patient.notes || "",
            profileType: "patient",
          }
        : {},
    })),
    version: Number(batch.version || 1),
    expiresAt: batch.expiresAt || "",
    committedAt: batch.committedAt || "",
    createdAt: batch.createdAt || "",
    updatedAt: batch.updatedAt || batch.createdAt || "",
  };
}

function getPatientImportWorkspaceId(user, url) {
  const workspace = getUserWorkspaceContext(user);
  if (isPlatformAdminUser(user)) {
    return readString(url.searchParams.get("workspaceId"), 120) || user.organizationId || "org_default_clinic";
  }
  return workspace.currentWorkspaceId || user.organizationId || "";
}

function assertPatientImportBatchAccess(user, batch) {
  if (!batch) throw httpError(404, "Không tìm thấy batch import", "PATIENT_IMPORT_BATCH_NOT_FOUND");
  if (isPlatformAdminUser(user)) return;
  const workspaceId = getUserWorkspaceContext(user).currentWorkspaceId || user.organizationId || "";
  if (!workspaceId || workspaceId !== batch.organizationId) {
    throw httpError(403, "Batch import nằm ngoài workspace hiện tại", "PATIENT_IMPORT_SCOPE_DENIED");
  }
}

function patientImportAuditInput(req, user, batch, operation) {
  const context = getRequestContext(req) || createRequestContext(req);
  return {
    actorUserId: user.id,
    organizationId: batch.organizationId || "",
    authorization: getPatientMutationAuthorization(
      user,
      { id: `import_auth_${batch.id}`, organizationId: batch.organizationId || "" },
      operation,
    ),
    ip: context.ip || "",
    userAgent: context.userAgent || "",
  };
}

async function handlePatientImportApi(req, res, url, segments, user) {
  const method = req.method || "GET";
  requireAnyCapability(
    user,
    ["platform.patients.manage", "workspace.patients.manage"],
    "Không có quyền import bệnh nhân trong workspace hiện tại",
  );
  if (!repositories?.patientImports) {
    throw httpError(503, "Kho batch import chưa sẵn sàng", "PATIENT_IMPORT_STORAGE_UNAVAILABLE");
  }

  if (segments.length === 4 && segments[3] === "validate" && method === "POST") {
    const idempotencyKey = getIdempotencyKey(req);
    if (!idempotencyKey) {
      throw httpError(400, "Idempotency-Key is required", "IDEMPOTENCY_KEY_REQUIRED");
    }
    const contentType = readString(req.headers["content-type"], 160).toLowerCase().split(";")[0];
    if (!["text/csv", "application/csv", "application/vnd.ms-excel"].includes(contentType)) {
      throw httpError(415, "Nội dung import phải là file CSV", "PATIENT_IMPORT_CONTENT_TYPE_INVALID");
    }
    const organizationId = getPatientImportWorkspaceId(user, url);
    if (!organizationId || !getClinicById(organizationId)) {
      throw httpError(404, "Không tìm thấy workspace", "WORKSPACE_NOT_FOUND");
    }
    const buffer = await readRequestBuffer(req, PATIENT_IMPORT_MAX_BYTES + 1);
    let fileName = readString(req.headers["x-file-name"], 720) || "patients.csv";
    try {
      fileName = decodeURIComponent(fileName);
    } catch {
      throw httpError(400, "Tên file CSV không hợp lệ", "PATIENT_IMPORT_FILE_NAME_INVALID");
    }
    fileName = path.basename(fileName).slice(0, 240) || "patients.csv";
    const allPatients = await repositories.patients.list();
    const validation = validatePatientImportCsv(buffer, {
      fileName,
      existingPatients: allPatients.filter((patient) => patient.organizationId === organizationId),
    });
    const createdAt = nowIso();
    const batchId = createId("pimport");
    const rows = validation.rows.map((row) => ({
      ...row,
      patient:
        row.status === "valid"
          ? createPatientRecord(
              { ...row.patient, organizationId, profileType: "patient" },
              { addToRuntime: false },
            )
          : { ...row.patient, id: "", organizationId, profileType: "patient" },
    }));
    const batch = {
      id: batchId,
      organizationId,
      actorUserId: user.id,
      fileName: validation.fileName,
      fileSizeBytes: validation.fileSizeBytes,
      fileSha256: validation.fileSha256,
      status: validation.status,
      rowCount: validation.rowCount,
      validCount: validation.validCount,
      invalidCount: validation.invalidCount,
      duplicateCount: validation.duplicateCount,
      rows,
      patientIds: [],
      importedCount: 0,
      version: 1,
      expiresAt: new Date(Date.now() + PATIENT_IMPORT_TTL_MS).toISOString(),
      committedAt: "",
      createdAt,
      updatedAt: createdAt,
    };
    const persisted = await repositories.patientImports.createWithAudit(
      batch,
      patientImportAuditInput(req, user, batch, "create"),
      {
        scope: getIdempotencyScope(user, organizationId),
        operation: "patient.import.validate",
        key: idempotencyKey,
        fingerprint: createIdempotencyFingerprint({
          organizationId,
          fileName: validation.fileName,
          fileSha256: validation.fileSha256,
        }),
      },
      201,
    );
    if (persisted.replayed) res.setHeader("Idempotency-Replayed", "true");
    sendJson(res, Number(persisted.responseStatus || 201), {
      batch: publicPatientImportBatch(persisted.batch),
      replayed: Boolean(persisted.replayed),
    });
    return;
  }

  const batchId = segments[3] ? decodeURIComponent(segments[3]) : "";
  const batch = batchId ? await repositories.patientImports.findById(batchId) : null;
  assertPatientImportBatchAccess(user, batch);

  if (segments.length === 4 && method === "GET") {
    sendJson(res, 200, { batch: publicPatientImportBatch(batch) });
    return;
  }

  if (segments.length === 5 && segments[4] === "commit" && method === "POST") {
    const idempotencyKey = getIdempotencyKey(req);
    if (!idempotencyKey) {
      throw httpError(400, "Idempotency-Key is required", "IDEMPOTENCY_KEY_REQUIRED");
    }
    const persisted = await repositories.patientImports.commitWithAudit(
      batch.id,
      patientImportAuditInput(req, user, batch, "create"),
      {
        scope: getIdempotencyScope(user, batch.organizationId),
        operation: `patient.import.commit:${batch.id}`,
        key: idempotencyKey,
        fingerprint: createIdempotencyFingerprint({ batchId: batch.id }),
      },
      201,
    );
    if (persisted.replayed) res.setHeader("Idempotency-Replayed", "true");
    sendJson(res, Number(persisted.responseStatus || 201), {
      batch: publicPatientImportBatch(persisted.batch),
      importedCount: Number(persisted.importedCount || 0),
      patientIds: Array.isArray(persisted.patientIds) ? persisted.patientIds : [],
      replayed: Boolean(persisted.replayed),
    });
    return;
  }

  sendJson(res, 404, { error: "Patient import route not found" });
}

async function handlePatientsApi(req, res, url, segments) {
  const method = req.method || "GET";
  const user = requireUser(req);
  if (segments[2] === "import") {
    await handlePatientImportApi(req, res, url, segments, user);
    return;
  }
  const patientId = segments[2] ? decodeURIComponent(segments[2]) : "";
  const isPatientDelete = segments.length === 3 && method === "DELETE";
  let patientDeleteIdempotency = null;
  let patientDeleteAuthority = null;

  if (isPatientDelete) {
    requireAnyCapability(
      user,
      ["platform.patients.manage", "workspace.patients.manage", "personal.profiles.manage"],
      "Không có quyền xóa hồ sơ bệnh nhân này",
    );
    const patientDeleteIdempotencyKey = getRequiredHeaderIdempotencyKey(
      req,
      "patient deletion",
    );
    patientDeleteAuthority = requirePatientMutationAuthority(req, user);
    patientDeleteIdempotency = {
      scope: getIdempotencyScope(user),
      operation: `patient.delete:${patientId}`,
      key: patientDeleteIdempotencyKey,
      fingerprint: createIdempotencyFingerprint(
        patientDeleteAuthority
          ? { patientId, authority: patientDeleteAuthority }
          : { patientId },
      ),
    };
    const replay = repositories?.patients.findMutationReplay
      ? await repositories.patients.findMutationReplay(
          patientDeleteIdempotency,
          patientDeleteAuthority
            ? getPatientMutationAuthorization(
                user,
                { id: patientId, organizationId: patientDeleteAuthority.expectedWorkspaceId },
                "delete",
                patientDeleteAuthority,
              )
            : null,
        )
      : null;
    if (replay) {
      const storedReceipt = replay.responseResource;
      const activeWorkspaceId =
        getUserWorkspaceContext(user).currentWorkspaceId ||
        readString(user.organizationId, 120);
      if (
        replay.resourceType !== "patient_delete" ||
        replay.resourceId !== patientId ||
        storedReceipt?.userId !== user.id ||
        !storedReceipt?.workspaceId ||
        storedReceipt.patientId !== patientId ||
        storedReceipt.intent !== "delete" ||
        storedReceipt.deleted !== true ||
        typeof storedReceipt.replayed !== "boolean" ||
        (!isPlatformAdminUser(user) && storedReceipt.workspaceId !== activeWorkspaceId)
      ) {
        throw httpError(
          409,
          "Kết quả chống gửi lặp không khớp với hồ sơ cần xóa",
          "IDEMPOTENT_PATIENT_DELETE_MISMATCH",
        );
      }
      res.setHeader("Idempotency-Replayed", "true");
      sendJson(res, Number(replay.responseStatus || 200), {
        userId: storedReceipt.userId,
        workspaceId: storedReceipt.workspaceId,
        patientId: storedReceipt.patientId,
        intent: "delete",
        deleted: true,
        replayed: true,
      });
      return;
    }
  }

  if (segments.length === 2 && method === "GET") {
    if (repositories) {
      await repositories.patients.list();
    }
    const pageResult = resolveAdminListPage(
      filterPatientsForUser(user, db.patients).map(withPatientStats),
      url,
      {
        searchFields: [
          (item) => item.id,
          (item) => item.name,
          (item) => item.patientCode,
          (item) => item.phone,
          (item) => item.email,
          (item) => item.organizationId,
        ],
        sortFields: {
          name: (item) => item.name,
          createdAt: (item) => item.createdAt,
          updatedAt: (item) => item.updatedAt,
          lastScanAt: (item) => item.lastScanAt,
          patientCode: (item) => item.patientCode,
        },
        defaultSort: "updatedAt:desc",
      },
    );
    const patients = pageResult.items;

    const workspaceId =
      getUserWorkspaceContext(user).currentWorkspaceId ||
      readString(user.organizationId, 120) ||
      readString(patients[0]?.organizationId, 120);
    setWorkspacePaginationHeaders(res, pageResult);
    sendJson(res, 200, { workspaceId, patients });
    return;
  }

  if (segments.length === 2 && method === "POST") {
    requireAnyCapability(
      user,
      ["platform.patients.manage", "workspace.patients.manage", "personal.profiles.manage"],
      "Không có quyền tạo hồ sơ bệnh nhân trong workspace hiện tại",
    );
    const idempotencyKey = getRequiredHeaderIdempotencyKey(req, "patient creation");
    const patientMutationAuthority = requirePatientMutationAuthority(req, user);
    const payload = await readJsonBody(req);
    const workspaceContext = getUserWorkspaceContext(user);
    const isPlatformAdmin = isPlatformAdminUser(user);
    if (
      !isPlatformAdmin &&
      !isPatientUser(user) &&
      ["ownerUserId", "guardianUserId", "accountUserId", "familyGroupId"].some((field) =>
        Object.prototype.hasOwnProperty.call(payload, field),
      )
    ) {
      throw httpError(403, "Liên kết tài khoản bệnh nhân phải dùng workflow được kiểm soát", "PATIENT_LINKAGE_FORBIDDEN");
    }
    const organizationId = isPlatformAdmin
      ? readString(payload.organizationId, 120) || user.organizationId || "org_default_clinic"
      : workspaceContext.currentWorkspaceId || user.organizationId || "org_default_clinic";
    if (!getClinicById(organizationId)) {
      throw httpError(404, "Không tìm thấy workspace", "WORKSPACE_NOT_FOUND");
    }
    const requestedOwnerUserId = isPlatformAdmin ? readString(payload.ownerUserId, 120) : "";
    const requestedGuardianUserId = isPlatformAdmin ? readString(payload.guardianUserId, 120) : "";
    for (const linkedUserId of [requestedOwnerUserId, requestedGuardianUserId].filter(Boolean)) {
      if (!db.users.some((candidate) => candidate.id === linkedUserId)) {
        throw httpError(404, "Không tìm thấy tài khoản liên kết", "PATIENT_LINKED_USER_NOT_FOUND");
      }
    }
    const patient = createPatientRecord({
      ...payload,
      organizationId,
      ownerUserId: isPatientUser(user) ? user.id : requestedOwnerUserId,
      guardianUserId: isPatientUser(user) ? user.id : requestedGuardianUserId,
      profileType: isPatientUser(user) ? "dependent" : readString(payload.profileType, 60) || "patient",
    }, { addToRuntime: false });
    const responseSnapshot = buildPatientMutationReceipt(user, patient, "create", false);
    const context = getRequestContext(req) || createRequestContext(req);
    const persisted = repositories?.patients.saveWithAudit
      ? await repositories.patients.saveWithAudit(
          patient,
          {
            action: "patient.create",
            actorUserId: user.id,
            organizationId: patient.organizationId || "",
            authorization: getPatientMutationAuthorization(
              user,
              patient,
              "create",
              patientMutationAuthority,
            ),
            ip: context.ip || "",
            userAgent: context.userAgent || "",
            metadata: { profileType: patient.profileType || "patient" },
          },
          {
            scope: getIdempotencyScope(user, patient.organizationId),
            operation: "patient.create",
            key: idempotencyKey,
            fingerprint: createIdempotencyFingerprint(
              patientMutationAuthority
                ? { payload, authority: patientMutationAuthority }
                : payload,
            ),
          },
          201,
          responseSnapshot,
        )
      : null;
    if (!persisted?.patient) throw httpError(503, "Không thể lưu hồ sơ sức khỏe", "PATIENT_STORAGE_UNAVAILABLE");
    if (persisted.replayed) res.setHeader("Idempotency-Replayed", "true");
    sendJson(
      res,
      Number(persisted.responseStatus || 201),
      resolvePatientMutationReceipt(
        user,
        persisted.patient,
        "create",
        Boolean(persisted.replayed),
        persisted.responseResource,
      ),
    );
    return;
  }

  const patient = repositories ? await repositories.patients.findById(patientId) : findPatient(patientId);
  if (!patient) {
    throw httpError(404, "Không tìm thấy hồ sơ sức khỏe");
  }

  if (segments.length === 4 && segments[3] === "shares" && method === "GET") {
    assertCanAccessPatient(user, patient.id);
    assertCanManagePatientSharing(user, patient);
    const grants = repositories && repositories.patientShares
      ? await repositories.patientShares.listForPatient(patient.id, { includeRevoked: true })
      : db.doctorPatientAccess.filter((grant) => grant.patientId === patient.id);
    const shares = grants.map(publicPatientShare);
    sendJson(res, 200, {
      generatedAt: nowIso(),
      workspaceId: patient.organizationId || "",
      patientId: patient.id,
      shares,
    });
    return;
  }

  if (segments.length === 4 && segments[3] === "shares" && method === "POST") {
    assertCanAccessPatient(user, patient.id);
    assertCanManagePatientSharing(user, patient);
    const payload = await readJsonBody(req);
    const idempotencyKey = getIdempotencyKey(req, payload);
    if (!idempotencyKey) {
      throw httpError(400, "Idempotency-Key is required", "IDEMPOTENCY_KEY_REQUIRED");
    }
    let doctorUserId = readString(payload.doctorUserId || payload.targetDoctorUserId || payload.targetUserId, 120);
    const organizationId = readString(payload.organizationId || payload.targetWorkspaceId || payload.workspaceId, 120);
    if (!doctorUserId && !organizationId) {
      throw httpError(400, "Cần chọn bác sĩ hoặc workspace để chia sẻ", "SHARE_PRINCIPAL_REQUIRED");
    }
    if (doctorUserId && organizationId) {
      throw httpError(
        400,
        "Chỉ được chọn đúng một đối tượng nhận chia sẻ: bác sĩ hoặc workspace",
        "SHARE_PRINCIPAL_EXCLUSIVE",
      );
    }
    if (doctorUserId) {
      const doctor = repositories
        ? await repositories.users.findByIdOrFirebaseUid(doctorUserId)
        : db.users.find((item) => item.id === doctorUserId || item.firebaseUid === doctorUserId);
      if (!isApprovedActiveDoctorPrincipal(doctor)) {
        throw httpError(404, "Không tìm thấy bác sĩ nhận chia sẻ");
      }
      doctorUserId = doctor.id;
    }
    // Canonical workspace validation belongs to the repository transaction;
    // a local cache may lag behind another SQL-backed server instance.
    if (organizationId && !repositories?.patientShares?.saveWithAudit) {
      const targetWorkspace = getClinicById(organizationId);
      if (!targetWorkspace || String(targetWorkspace.status || "active") !== "active") {
        throw httpError(404, "Không tìm thấy workspace nhận chia sẻ", "SHARE_WORKSPACE_NOT_FOUND");
      }
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
    const accessLevel = readString(payload.accessLevel, 40) || "read";
    if (accessLevel !== "read") {
      throw httpError(
        422,
        "Only read access is supported for patient data grants",
        "SHARE_ACCESS_LEVEL_UNSUPPORTED",
        { supportedAccessLevels: ["read"] },
      );
    }
    const authorityType = derivePatientShareAuthorityType(user, patient, doctorUserId);
    const createdAt = nowIso();
    let grant = {
      id: createId("share"),
      patientId: patient.id,
      doctorUserId,
      doctorId: doctorUserId,
      organizationId,
      accessLevel,
      authorityType,
      purpose: readString(payload.purpose, 2000),
      consentedAt: authorityType === "patient_consent" ? createdAt : "",
      scope: readString(payload.scope, 80) || (scanIds.length ? "selected_scans" : "patient_profile"),
      scanIds,
      expiresAt: readString(payload.expiresAt, 80),
      grantedByUserId: user.id,
      createdAt,
      updatedAt: createdAt,
    };
    const auditInput = {
      action:
        authorityType === "patient_consent"
          ? "patient.consent.grant"
          : authorityType === "clinician_access_grant"
            ? "patient.access.clinician_grant"
            : "patient.access.administrative_assignment",
      actorUserId: user.id,
      organizationId: patient.organizationId || getUserWorkspaceContext(user).currentWorkspaceId || "",
      resourceType: "patient",
      resourceId: patient.id,
      authorization: getPatientMutationAuthorization(user, patient, "share"),
      ip: (getRequestContext(req) || createRequestContext(req)).ip || "",
      userAgent: (getRequestContext(req) || createRequestContext(req)).userAgent || "",
      metadata: {
        doctorUserId,
        organizationId,
        authorityType,
        accessLevel,
        purpose: grant.purpose,
        scope: grant.scope,
        scanIds,
        expiresAt: grant.expiresAt || "",
      },
    };
    const idempotency = {
      scope: getIdempotencyScope(user, patient.organizationId),
      operation: "patient.share",
      key: idempotencyKey,
      fingerprint: createIdempotencyFingerprint({
        patientId: patient.id,
        doctorUserId,
        organizationId,
        authorityType,
        accessLevel,
        purpose: grant.purpose,
        scope: grant.scope,
        scanIds: [...scanIds].sort(),
        expiresAt: grant.expiresAt || "",
      }),
    };
    let replayed = false;
    let responseStatus = 201;
    if (repositories?.patientShares?.saveWithAudit) {
      const persisted = await repositories.patientShares.saveWithAudit(
        grant,
        auditInput,
        idempotency,
        201,
      );
      grant = persisted.grant;
      replayed = Boolean(persisted.replayed);
      responseStatus = Number(persisted.responseStatus || 201);
    } else {
      db.doctorPatientAccess.unshift(grant);
      db.doctorPatientAccess = db.doctorPatientAccess.slice(0, 1000);
      await appendAudit(auditInput.action, req, auditInput);
      await saveDb();
    }
    if (replayed) res.setHeader("Idempotency-Replayed", "true");
    sendJson(res, responseStatus, {
      generatedAt: nowIso(),
      workspaceId: patient.organizationId || "",
      patientId: patient.id,
      share: publicPatientShare(grant),
      replayed,
    });
    return;
  }

  if (segments.length === 5 && segments[3] === "shares" && method === "DELETE") {
    assertCanAccessPatient(user, patient.id);
    assertCanManagePatientSharing(user, patient);
    const idempotencyKey = getIdempotencyKey(req);
    if (!idempotencyKey) {
      throw httpError(400, "Idempotency-Key is required", "IDEMPOTENCY_KEY_REQUIRED");
    }
    const grantId = decodeURIComponent(segments[4]);
    const grant = repositories && repositories.patientShares
      ? await repositories.patientShares.findForPatient(patient.id, grantId)
      : db.doctorPatientAccess.find((item) => item.id === grantId && item.patientId === patient.id);
    if (!grant) {
      throw httpError(404, "Không tìm thấy quyền chia sẻ");
    }
    const authorityType = resolvePatientShareAuthorityType(grant);
    const auditInput = {
      action:
        authorityType === "patient_consent"
          ? "patient.consent.revoke"
          : "patient.access.revoke",
      actorUserId: user.id,
      organizationId: patient.organizationId || getUserWorkspaceContext(user).currentWorkspaceId || "",
      resourceType: "patient_share",
      resourceId: grant.id,
      authorization: getPatientMutationAuthorization(user, patient, "share_revoke"),
      ip: (getRequestContext(req) || createRequestContext(req)).ip || "",
      userAgent: (getRequestContext(req) || createRequestContext(req)).userAgent || "",
      metadata: {
        patientId: patient.id,
        authorityType,
        recipientType: grant.doctorUserId || grant.doctorId ? "doctor" : "workspace",
        recipientId: grant.doctorUserId || grant.doctorId || grant.organizationId || "",
      },
    };
    const idempotency = {
      scope: getIdempotencyScope(user, patient.organizationId),
      operation: "patient.share.revoke",
      key: idempotencyKey,
      fingerprint: createIdempotencyFingerprint({
        patientId: patient.id,
        grantId,
        authorityType,
      }),
    };
    let revokedGrant = grant;
    let replayed = false;
    let responseStatus = 200;
    if (repositories?.patientShares?.revokeWithAudit) {
      const persisted = await repositories.patientShares.revokeWithAudit(
        patient.id,
        grantId,
        user.id,
        auditInput,
        idempotency,
        200,
      );
      if (!persisted.grant) {
        throw httpError(404, "KhĂ´ng tĂ¬m tháº¥y quyá»n chia sáº»", "PATIENT_SHARE_NOT_FOUND");
      }
      revokedGrant = persisted.grant;
      replayed = Boolean(persisted.replayed);
      responseStatus = Number(persisted.responseStatus || 200);
    } else {
      grant.revokedAt = nowIso();
      grant.revokedByUserId = user.id;
      grant.updatedAt = nowIso();
      revokedGrant = grant;
      await appendAudit(auditInput.action, req, auditInput);
      await saveDb();
    }
    if (replayed) res.setHeader("Idempotency-Replayed", "true");
    sendJson(res, responseStatus, {
      generatedAt: nowIso(),
      workspaceId: patient.organizationId || "",
      patientId: patient.id,
      revoked: true,
      share: publicPatientShare(revokedGrant),
      replayed,
    });
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
    const idempotencyKey = getRequiredHeaderIdempotencyKey(req, "patient update");
    const patientMutationAuthority = requirePatientMutationAuthority(req, user);
    const payload = await readJsonBody(req);
    const nextPatient = {
      ...patient,
      allergies: Array.isArray(patient.allergies) ? [...patient.allergies] : [],
      emergencyContact: patient.emergencyContact && typeof patient.emergencyContact === "object" ? { ...patient.emergencyContact } : {},
    };
    updatePatientRecord(nextPatient, payload, { allowAdministrativeFields: isPlatformAdminUser(user) });
    if (isPatientUser(user)) {
      nextPatient.organizationId = patient.organizationId;
      nextPatient.ownerUserId = user.id;
      nextPatient.guardianUserId = patient.guardianUserId || user.id;
      nextPatient.accountUserId = patient.accountUserId || "";
      nextPatient.profileType = patient.profileType === "self" ? "self" : "dependent";
    } else {
      nextPatient.organizationId = patient.organizationId;
      nextPatient.ownerUserId = patient.ownerUserId || "";
    }
    const context = getRequestContext(req) || createRequestContext(req);
    const persisted = repositories?.patients.saveWithAudit
      ? await repositories.patients.saveWithAudit(
          nextPatient,
          {
            action: "patient.update",
            actorUserId: user.id,
            organizationId: nextPatient.organizationId || "",
            authorization: getPatientMutationAuthorization(
              user,
              nextPatient,
              "update",
              patientMutationAuthority,
            ),
            ip: context.ip || "",
            userAgent: context.userAgent || "",
            metadata: { fields: Object.keys(payload).filter((key) => key !== "idempotencyKey") },
          },
          {
            scope: getIdempotencyScope(user, nextPatient.organizationId),
            operation: `patient.update:${nextPatient.id}`,
            key: idempotencyKey,
            fingerprint: createIdempotencyFingerprint(
              patientMutationAuthority
                ? { payload, authority: patientMutationAuthority }
                : payload,
            ),
          },
          200,
          buildPatientMutationReceipt(user, nextPatient, "update", false),
        )
      : null;
    if (!persisted?.patient) throw httpError(503, "Không thể cập nhật hồ sơ sức khỏe", "PATIENT_STORAGE_UNAVAILABLE");
    if (persisted.replayed) res.setHeader("Idempotency-Replayed", "true");
    sendJson(
      res,
      Number(persisted.responseStatus || 200),
      resolvePatientMutationReceipt(
        user,
        persisted.patient,
        "update",
        Boolean(persisted.replayed),
        persisted.responseResource,
      ),
    );
    return;
  }

  if (segments.length === 3 && method === "DELETE") {
    assertCanAccessPatient(user, patient.id);
    requireAnyCapability(
      user,
      ["platform.patients.manage", "workspace.patients.manage", "personal.profiles.manage"],
      "Không có quyền xóa hồ sơ bệnh nhân này",
    );
    const linkedSelfUser = db.users.find((item) => item.patientId === patient.id);
    if (patient.profileType === "self" || linkedSelfUser) {
      throw httpError(409, "Không thể xóa hồ sơ self của tài khoản", "SELF_PROFILE_DELETE_FORBIDDEN");
    }
    const selfProfile = isPatientUser(user) ? ensurePatientProfileForUser(user) : null;
    const activeProfileUserId = isPatientUser(user) && user.activePatientId === patient.id ? user.id : "";
    const fallbackPatientId = activeProfileUserId ? selfProfile?.id || user.patientId || "" : "";
    const context = getRequestContext(req) || createRequestContext(req);
    const responseSnapshot = buildPatientMutationReceipt(user, patient, "delete", false);
    const deletion = repositories?.patients.deleteWithAudit
      ? await repositories.patients.deleteWithAudit(
          patient.id,
          {
            action: "patient.delete",
            actorUserId: user.id,
            organizationId: patient.organizationId || "",
            authorization: getPatientMutationAuthorization(
              user,
              patient,
              "delete",
              patientDeleteAuthority,
            ),
            ip: context.ip || "",
            userAgent: context.userAgent || "",
            metadata: { profileType: patient.profileType || "patient" },
          },
          {
            activeProfileUserId,
            fallbackPatientId,
            idempotency: patientDeleteIdempotency,
            responseResource: responseSnapshot,
          },
        )
      : null;
    if (!deletion?.patient) throw httpError(503, "Không thể xóa hồ sơ sức khỏe", "PATIENT_STORAGE_UNAVAILABLE");
    if (deletion.replayed) res.setHeader("Idempotency-Replayed", "true");
    const storedDeleteReceipt = deletion.responseResource;
    if (
      storedDeleteReceipt?.userId !== responseSnapshot.userId ||
      storedDeleteReceipt?.workspaceId !== responseSnapshot.workspaceId ||
      storedDeleteReceipt?.patientId !== responseSnapshot.patientId ||
      storedDeleteReceipt?.intent !== "delete" ||
      storedDeleteReceipt?.deleted !== true ||
      typeof storedDeleteReceipt?.replayed !== "boolean"
    ) {
      throw httpError(
        409,
        "Stored patient deletion receipt does not match the requested mutation",
        "IDEMPOTENT_PATIENT_DELETE_MISMATCH",
      );
    }
    sendJson(res, Number(deletion.responseStatus || 200), {
      userId: storedDeleteReceipt.userId,
      workspaceId: storedDeleteReceipt.workspaceId,
      patientId: storedDeleteReceipt.patientId,
      intent: "delete",
      deleted: true,
      replayed: Boolean(deletion.replayed),
    });
    return;
  }

  sendJson(res, 404, { error: "Patient route not found" });
}

function getAppointmentNotificationRecipient(appointment, actorUserId = "") {
  const patient = appointment.patientId ? findPatient(appointment.patientId) : null;
  const candidates = [appointment.doctorUserId, patient?.ownerUserId].filter(Boolean);
  return candidates.find((userId) => userId !== actorUserId) || candidates[0] || "";
}

async function notifyAppointmentMutation(appointment, event, actorUserId = "") {
  const eventCopy = {
    created: ["Lịch hẹn mới", "Lịch hẹn đã được tạo."],
    updated: ["Lịch hẹn đã cập nhật", "Thông tin lịch hẹn đã được cập nhật."],
    rescheduled: ["Lịch hẹn đã đổi giờ", "Thời gian lịch hẹn đã được cập nhật."],
    confirmed: ["Lịch hẹn đã xác nhận", "Lịch hẹn đã được xác nhận."],
    completed: ["Lịch hẹn đã hoàn tất", "Lịch hẹn đã được đánh dấu hoàn tất."],
    cancelled: ["Lịch hẹn đã hủy", "Lịch hẹn đã được hủy."],
    no_show: ["Lịch hẹn vắng mặt", "Lịch hẹn đã được đánh dấu vắng mặt."],
  }[event] || ["Lịch hẹn đã cập nhật", "Thông tin lịch hẹn đã được cập nhật."];
  return createBackendNotification({
    type: event === "cancelled" || event === "no_show" ? "warning" : "info",
    userId: getAppointmentNotificationRecipient(appointment, actorUserId),
    organizationId: appointment.organizationId || "",
    title: eventCopy[0],
    message: eventCopy[1],
    metadata: {
      preferenceKey: "appointments",
      appointmentId: appointment.id,
      patientId: appointment.patientId,
      destination: "appointment_detail",
      actionPath: `/appointments/${appointment.id}`,
      status: appointment.status,
    },
  });
}

function upsertRuntimeAppointment(appointment) {
  const index = db.appointments.findIndex((item) => item.id === appointment.id);
  if (index >= 0) {
    db.appointments[index] = appointment;
  } else {
    db.appointments.unshift(appointment);
  }
}

async function persistAppointmentMutation(appointment, req, detail = {}) {
  const context = getRequestContext(req) || createRequestContext(req);
  const auditInput = {
    action: detail.action || "appointment.update",
    actorUserId: detail.actorUserId,
    organizationId: appointment.organizationId || "",
    resourceType: "appointment",
    resourceId: appointment.id,
    ip: context.ip || "",
    userAgent: context.userAgent || "",
    metadata: sanitizeAuditMetadata(detail.metadata || {}),
  };
  const idempotency = detail.idempotencyKey
    ? {
        scope: getIdempotencyScope(detail.user, appointment.organizationId),
        operation: detail.idempotencyOperation,
        key: detail.idempotencyKey,
        fingerprint: detail.idempotencyFingerprint,
      }
    : null;
  if (repositories && typeof repositories.appointments?.saveWithAudit === "function") {
    return repositories.appointments.saveWithAudit(
      appointment,
      auditInput,
      idempotency,
      detail.responseStatus || 200,
    );
  }
  if (repositories && repositories.appointments) {
    await repositories.appointments.save(appointment);
  } else {
    upsertRuntimeAppointment(appointment);
  }
  await appendAudit(auditInput.action, req, auditInput);
  if (detail.idempotencyKey) {
    rememberIdempotentResource(
      detail.user,
      detail.idempotencyKey,
      detail.idempotencyOperation,
      "appointment",
      appointment.id,
      {
        organizationId: appointment.organizationId,
        fingerprint: detail.idempotencyFingerprint,
        responseStatus: detail.responseStatus || 200,
        responseResource: appointment,
      },
    );
  }
  await saveDb();
  return {
    appointment,
    auditLog: null,
    replayed: false,
    responseStatus: detail.responseStatus || 200,
  };
}

function sendAppointmentReplay(res, statusCode, appointment) {
  res.setHeader("Idempotency-Replayed", "true");
  sendJson(res, statusCode, { appointment: publicAppointment(appointment) });
}

function sendAppointmentDeleteReceipt(res, appointment, replayed = false) {
  if (replayed) res.setHeader("Idempotency-Replayed", "true");
  sendJson(res, 200, {
    deleted: true,
    appointmentId: appointment.id,
    workspaceId: appointment.organizationId || "",
    deletedAt: appointment.deletedAt,
    replayed: Boolean(replayed),
  });
}

async function handleAppointmentsApi(req, res, url, segments) {
  const method = req.method || "GET";
  const user = requireUser(req);
  const appointmentId = segments[2] ? decodeURIComponent(segments[2]) : "";
  const action = segments[3] ? decodeURIComponent(segments[3]) : "";

  if (segments.length === 2 && method === "GET") {
    requireAnyCapability(user, APPOINTMENT_VIEW_CAPABILITIES);
    const sourceAppointments = repositories && repositories.appointments
      ? await repositories.appointments.list()
      : db.appointments;
    const patientId = readString(url.searchParams.get("patientId"), 120);
    const doctorUserId = readString(url.searchParams.get("doctorUserId") || url.searchParams.get("doctorId"), 120);
    const status = readString(url.searchParams.get("status"), 60);
    const from = readString(url.searchParams.get("from"), 120);
    const to = readString(url.searchParams.get("to"), 120);
    const appointments = filterAppointmentsForUser(user, sourceAppointments)
      .filter((appointment) => !patientId || appointment.patientId === patientId)
      .filter((appointment) => !doctorUserId || appointment.doctorUserId === doctorUserId)
      .filter((appointment) => !status || appointment.status === status)
      .filter((appointment) => !from || Date.parse(appointment.startsAt || "") >= Date.parse(from))
      .filter((appointment) => !to || Date.parse(appointment.startsAt || "") <= Date.parse(to))
      .sort((left, right) => String(left.startsAt || "").localeCompare(String(right.startsAt || "")))
      .map(publicAppointment);
    sendJson(res, 200, { appointments });
    return;
  }

  if (segments.length === 2 && method === "POST") {
    requireAnyCapability(user, APPOINTMENT_MANAGE_CAPABILITIES);
    const payload = await readJsonBody(req);
    const patientId = readString(payload.patientId, 120);
    if (!patientId) {
      throw httpError(400, "patientId is required", "APPOINTMENT_PATIENT_REQUIRED");
    }
    const patient = repositories ? await repositories.patients.findById(patientId) : findPatient(patientId);
    if (!patient) {
      throw httpError(404, "Patient assigned to appointment was not found", "APPOINTMENT_PATIENT_NOT_FOUND");
    }
    assertCanAccessPatient(user, patient.id);
    const organizationId = isPlatformAdminUser(user)
      ? readString(payload.organizationId, 120) || patient.organizationId || user.organizationId || "org_default_clinic"
      : patient.organizationId || getUserWorkspaceContext(user).currentWorkspaceId || user.organizationId || "org_default_clinic";
    if (patient.organizationId && patient.organizationId !== organizationId) {
      throw httpError(403, "Patient is outside the appointment workspace", "APPOINTMENT_PATIENT_OUTSIDE_WORKSPACE");
    }
    const idempotencyKey = getIdempotencyKey(req, payload);
    const idempotencyOperation = "appointment.create";
    const idempotencyFingerprint = createIdempotencyFingerprint(payload);
    const replayedAppointment = findIdempotentResource(user, idempotencyKey, idempotencyOperation, {
      organizationId,
      fingerprint: idempotencyFingerprint,
    });
    if (replayedAppointment) {
      assertCanAccessAppointment(user, replayedAppointment);
      sendAppointmentReplay(res, 201, replayedAppointment);
      return;
    }
    const doctorUserId = validateAppointmentDoctor(
      readString(payload.doctorUserId || payload.doctorId, 120) || (user.role === "doctor" ? user.id : ""),
      organizationId,
      user,
    );
    const appointment = createAppointmentRecord({
      ...payload,
      patientId: patient.id,
      doctorUserId,
      organizationId,
      createdByUserId: user.id,
    });
    await assertNoAppointmentConflict(appointment);
    const persisted = await persistAppointmentMutation(appointment, req, {
      action: "appointment.create",
      actorUserId: user.id,
      metadata: { patientId: patient.id, doctorUserId },
      user,
      idempotencyKey,
      idempotencyOperation,
      idempotencyFingerprint,
      responseStatus: 201,
    });
    if (persisted.replayed) {
      sendAppointmentReplay(res, persisted.responseStatus || 201, persisted.appointment);
      return;
    }
    await notifyAppointmentMutation(persisted.appointment, "created", user.id);
    sendJson(res, 201, { appointment: publicAppointment(persisted.appointment) });
    return;
  }

  const isDelete = segments.length === 3 && method === "DELETE";
  const appointment = repositories && repositories.appointments
    ? await repositories.appointments.findById(appointmentId, { includeDeleted: isDelete })
    : findAppointment(appointmentId, { includeDeleted: isDelete });
  if (!appointment) {
    throw httpError(404, "Appointment was not found", "APPOINTMENT_NOT_FOUND");
  }

  if (segments.length === 3 && method === "GET") {
    assertCanAccessAppointment(user, appointment);
    sendJson(res, 200, { appointment: publicAppointment(appointment) });
    return;
  }

  if (isDelete) {
    assertCanManageAppointment(user, appointment);
    const idempotencyKey = getRequiredHeaderIdempotencyKey(req, "appointment deletion");
    const idempotencyOperation = `appointment.delete:${appointment.id}`;
    const idempotencyFingerprint = createIdempotencyFingerprint({
      appointmentId: appointment.id,
      organizationId: appointment.organizationId || "",
    });
    const replayedAppointment = findIdempotentResource(
      user,
      idempotencyKey,
      idempotencyOperation,
      {
        organizationId: appointment.organizationId,
        fingerprint: idempotencyFingerprint,
      },
    );
    if (replayedAppointment) {
      assertCanManageAppointment(user, replayedAppointment);
      sendAppointmentDeleteReceipt(res, replayedAppointment, true);
      return;
    }
    if (appointment.deletedAt) {
      throw httpError(404, "Appointment was not found", "APPOINTMENT_NOT_FOUND");
    }
    const deletedAppointment = {
      ...appointment,
      deletedAt: nowIso(),
      deletedByUserId: user.id,
      updatedAt: nowIso(),
    };
    const persisted = await persistAppointmentMutation(deletedAppointment, req, {
      action: "appointment.delete",
      actorUserId: user.id,
      metadata: { softDelete: true },
      user,
      idempotencyKey,
      idempotencyOperation,
      idempotencyFingerprint,
      responseStatus: 200,
    });
    if (!persisted.appointment?.deletedAt) {
      throw httpError(500, "Appointment deletion was not durably confirmed", "APPOINTMENT_DELETE_NOT_CONFIRMED");
    }
    sendAppointmentDeleteReceipt(res, persisted.appointment, persisted.replayed);
    return;
  }

  const isPatchUpdate = segments.length === 3 && method === "PATCH";
  const isReschedule = segments.length === 4 && action === "reschedule" && method === "POST";
  const isCancel = segments.length === 4 && action === "cancel" && method === "POST";
  if (isPatchUpdate || isReschedule || isCancel) {
    assertCanManageAppointment(user, appointment);
    const payload = await readJsonBody(req);
    const idempotencyOperation = isReschedule
      ? `appointment.reschedule:${appointment.id}`
      : isCancel
        ? `appointment.cancel:${appointment.id}`
        : `appointment.update:${appointment.id}`;
    const idempotencyKey = getIdempotencyKey(req, payload);
    const idempotencyFingerprint = createIdempotencyFingerprint(payload);
    const replayedAppointment = findIdempotentResource(user, idempotencyKey, idempotencyOperation, {
      organizationId: appointment.organizationId,
      fingerprint: idempotencyFingerprint,
    });
    if (replayedAppointment) {
      assertCanManageAppointment(user, replayedAppointment);
      sendAppointmentReplay(res, 200, replayedAppointment);
      return;
    }

    const updatePayload = { ...payload };
    if (isReschedule) {
      if (!readString(payload.startsAt, 120)) {
        throw httpError(400, "startsAt is required to reschedule an appointment", "APPOINTMENT_RESCHEDULE_TIME_REQUIRED");
      }
      delete updatePayload.status;
    }
    if (isCancel) {
      updatePayload.status = "cancelled";
      updatePayload.cancellationReason = readString(payload.cancellationReason || payload.reason, 1000);
    }
    if (Object.prototype.hasOwnProperty.call(updatePayload, "doctorUserId") || Object.prototype.hasOwnProperty.call(updatePayload, "doctorId")) {
      updatePayload.doctorUserId = validateAppointmentDoctor(
        updatePayload.doctorUserId || updatePayload.doctorId,
        appointment.organizationId,
        user,
      );
    }
    const updatedAppointment = updateAppointmentRecord(appointment, updatePayload);
    if (isReschedule) {
      updatedAppointment.rescheduleReason = readString(payload.reason, 1000);
      updatedAppointment.rescheduledAt = nowIso();
      updatedAppointment.rescheduledByUserId = user.id;
    }
    await assertNoAppointmentConflict(updatedAppointment);
    const beforeStatus = appointment.status;
    const event = isReschedule
      ? "rescheduled"
      : beforeStatus !== updatedAppointment.status
        ? updatedAppointment.status
        : "updated";
    const persisted = await persistAppointmentMutation(updatedAppointment, req, {
      action: isReschedule ? "appointment.reschedule" : isCancel ? "appointment.cancel" : "appointment.update",
      actorUserId: user.id,
      metadata: {
        previousStatus: beforeStatus,
        status: updatedAppointment.status,
        startsAt: updatedAppointment.startsAt,
        endsAt: updatedAppointment.endsAt,
        reason: isCancel ? updatedAppointment.cancellationReason : isReschedule ? updatedAppointment.rescheduleReason : "",
      },
      user,
      idempotencyKey,
      idempotencyOperation,
      idempotencyFingerprint,
      responseStatus: 200,
    });
    if (persisted.replayed) {
      sendAppointmentReplay(res, persisted.responseStatus || 200, persisted.appointment);
      return;
    }
    await notifyAppointmentMutation(persisted.appointment, event, user.id);
    sendJson(res, 200, { appointment: publicAppointment(persisted.appointment) });
    return;
  }

  sendJson(res, 404, { error: "Appointment route not found" });
}

function readScanPageInteger(value, fallback, label, maximum) {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw httpError(400, `${label} must be a positive integer no greater than ${maximum}`, `SCAN_${label.toUpperCase()}_INVALID`);
  }
  return parsed;
}

function readScanDateFilter(value, label) {
  const raw = readString(value, 80);
  if (!raw) return "";
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) {
    throw httpError(400, `${label} must be a valid date-time`, "SCAN_DATE_FILTER_INVALID");
  }
  return new Date(timestamp).toISOString();
}

function getScanListAuthorizationScope(user) {
  if (isPlatformAdminUser(user)) {
    return { authorizedPatientIds: undefined, authorizedScanIds: undefined };
  }
  const authorizedPatientIds = filterPatientsForUser(user, db.patients).map((patient) => patient.id);
  const authorizedScanIds = new Set();
  for (const grant of db.doctorPatientAccess || []) {
    if (!isActiveAccessGrant(grant) || grant.scope !== "selected_scans") continue;
    const appliesToUser = getActivePatientGrantsForUser(user, grant.patientId).includes(grant);
    if (!appliesToUser) continue;
    for (const id of Array.isArray(grant.scanIds) ? grant.scanIds : []) {
      if (id) authorizedScanIds.add(String(id));
    }
  }
  return { authorizedPatientIds, authorizedScanIds: [...authorizedScanIds] };
}

async function handleScansApi(req, res, url, segments) {
  const method = req.method || "GET";
  const user = requireUser(req);
  const scanId = segments[2] ? decodeURIComponent(segments[2]) : "";

  if (segments.length === 2 && method === "GET") {
    requireAnyCapability(user, ["platform.scans.view", "workspace.scans.view", "workspace.scans.manage", "personal.scans.manage"]);
    const patientId = readString(url.searchParams.get("patientId"), 120);
    const status = readString(url.searchParams.get("status"), 60);
    const requestedOrganizationId = readString(url.searchParams.get("organizationId"), 120);
    const deviceId = readString(url.searchParams.get("deviceId"), 120);
    const createdFrom = readScanDateFilter(url.searchParams.get("createdFrom"), "createdFrom");
    const createdTo = readScanDateFilter(url.searchParams.get("createdTo"), "createdTo");
    const q = readString(url.searchParams.get("q"), 200);
    const page = readScanPageInteger(url.searchParams.get("page"), 1, "page", 100000);
    const limit = readScanPageInteger(url.searchParams.get("limit"), 50, "limit", 200);
    const sort = readString(url.searchParams.get("sort"), 80) || "createdAt:desc";
    const currentWorkspaceId = getUserWorkspaceContext(user).currentWorkspaceId;
    if (
      requestedOrganizationId &&
      !isPlatformAdminUser(user) &&
      currentWorkspaceId &&
      requestedOrganizationId !== currentWorkspaceId
    ) {
      throw httpError(403, "Scan list is outside the current workspace", "SCAN_SCOPE_DENIED");
    }
    const organizationId = isPlatformAdminUser(user) ? requestedOrganizationId : requestedOrganizationId || "";
    const authorization = getScanListAuthorizationScope(user);
    let pageResult;
    if (repositories?.scans?.listPage) {
      pageResult = await repositories.scans.listPage({
        patientId,
        status,
        organizationId,
        deviceId,
        createdFrom,
        createdTo,
        q,
        page,
        limit,
        sort,
        ...authorization,
      });
    } else {
      const sourceScans = filterScansForUser(user, db.scans)
        .filter((scan) => !patientId || scan.patientId === patientId)
        .filter((scan) => !status || scan.status === status)
        .filter((scan) => !organizationId || scan.organizationId === organizationId)
        .filter((scan) => !deviceId || scan.deviceId === deviceId);
      const total = sourceScans.length;
      pageResult = {
        items: sourceScans.slice((page - 1) * limit, page * limit),
        total,
        page,
        limit,
        sort,
      };
    }
    const scans = pageResult.items;
    const total = Number(pageResult.total || 0);
    const pageCount = total === 0 ? 0 : Math.ceil(total / limit);
    const pagination = {
      page,
      limit,
      total,
      pageCount,
      hasNextPage: page < pageCount,
      sort,
    };
    res.setHeader("X-Total-Count", String(total));
    res.setHeader("X-Pagination-Total", String(total));
    res.setHeader("X-Page", String(page));
    res.setHeader("X-Page-Limit", String(limit));
    res.setHeader("X-Page-Count", String(pageCount));
    sendJson(res, 200, { scans, pagination });
    return;
  }

  if (segments.length === 2 && method === "POST") {
    requireAnyCapability(user, ["platform.scans.manage", "workspace.scans.manage", "personal.scans.manage"]);
    const payload = await readJsonBody(req);
    if (isDoctorUser(user) && payload.patientId) {
      const requestedPatientId = readString(payload.patientId, 120);
      assertCanAccessPatient(user, requestedPatientId);
      assertCanManagePatientScanCollection(user, requestedPatientId);
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
    const requestPayload = { ...payload };
    const idempotencyKey = getRequiredHeaderIdempotencyKey(req, "scan start");
    if (isDoctorUser(user) && payload.patientId) {
      const requestedPatientId = readString(payload.patientId, 120);
      assertCanAccessPatient(user, requestedPatientId);
      assertCanManagePatientScanCollection(user, requestedPatientId);
    }
    if (isPatientUser(user)) {
      delete payload.doctorNotes;
      delete payload.notes;
    }
    const outcome = await startScanIdempotently(payload, user, idempotencyKey, requestPayload);
    sendJson(
      res,
      outcome.replayed ? 200 : 201,
      { scan: outcome.resource, ...(outcome.replayed ? { idempotent: true } : {}) },
    );
    return;
  }

  if (segments.length === 4 && segments[2] === "active" && segments[3] === "stop" && method === "POST") {
    const idempotencyKey = getRequiredHeaderIdempotencyKey(req, "active scan stop");
    const outcome = await stopActiveScanIdempotently(user, idempotencyKey);
    sendJson(res, 200, {
      scan: outcome.resource,
      ...(outcome.replayed ? { idempotent: true } : {}),
    });
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
    const backendOwnedAnalysisFields = ["aiLabel", "aiConfidence", "aiSummary", "aiResultId", "processingStatus"];
    if (backendOwnedAnalysisFields.some((field) => Object.prototype.hasOwnProperty.call(payload, field))) {
      throw httpError(
        403,
        "Analysis fields can only be written by the authenticated processing pipeline",
        "SCAN_ANALYSIS_FIELDS_READ_ONLY",
      );
    }
    const editableFields = ["bodySite", "mode", "doctorNotes"];
    for (const field of editableFields) {
      if (Object.prototype.hasOwnProperty.call(payload, field)) {
        scan[field] = readString(payload[field], field === "doctorNotes" ? 4000 : 200);
      }
    }
    scan.updatedAt = nowIso();
    await saveScanRecord(scan);
    sendJson(res, 200, { scan });
    return;
  }

  if (segments.length === 3 && method === "DELETE") {
    requireAnyCapability(user, ["platform.scans.manage", "workspace.scans.manage"]);
    assertCanManageScan(user, scan);
    await deleteScanRecord(scan);
    await appendAudit("scan.delete", req, {
      resourceType: "scan",
      resourceId: scan.id,
      organizationId: scan.organizationId || getScanOrgId(scan),
      metadata: {
        patientId: scan.patientId,
        deviceId: scan.deviceId || "",
        status: scan.status || "",
      },
    });
    sendJson(res, 200, { deleted: true, scanId: scan.id });
    return;
  }

  if (segments.length === 4 && segments[3] === "stop" && method === "POST") {
    assertCanManageScan(user, scan);
    const idempotencyKey = getRequiredHeaderIdempotencyKey(req, "scan stop");
    const outcome = await stopScanIdempotently(scan, user, idempotencyKey);
    sendJson(res, 200, {
      scan: outcome.resource,
      ...(outcome.replayed ? { idempotent: true } : {}),
    });
    return;
  }

  if (segments.length === 4 && segments[3] === "reprocess" && method === "POST") {
    requireAnyCapability(user, ["platform.scans.manage", "workspace.scans.manage"]);
    assertCanManageScan(user, scan);
    const idempotencyKey = getIdempotencyKey(req);
    if (!idempotencyKey) {
      throw httpError(400, "Idempotency-Key is required", "IDEMPOTENCY_KEY_REQUIRED");
    }
    const idempotencyFingerprint = createIdempotencyFingerprint({
      operation: "reprocess_scan",
      scanId: scan.id,
    });
    const outcome = await scanAudioReprocessExecutor.enqueue(scan.id, async () => {
      const existingReprocess = findIdempotentResource(user, idempotencyKey, "reprocess_scan", {
        organizationId: scan.organizationId || getScanOrgId(scan),
        fingerprint: idempotencyFingerprint,
      });
      if (existingReprocess) {
        return { scan: existingReprocess, replayed: true };
      }
      const currentScan = repositories
        ? await repositories.scans.findById(scan.id)
        : findScan(scan.id);
      if (!currentScan) {
        throw httpError(404, "KhĂ´ng tĂ¬m tháº¥y lÆ°á»£t Ä‘o");
      }
      const reprocessed = await reprocessScanAudio(currentScan, {
        forceNewProcessingIntent: true,
      });
      rememberIdempotentResource(
        user,
        idempotencyKey,
        "reprocess_scan",
        "scan",
        reprocessed.id,
        {
          organizationId: reprocessed.organizationId || getScanOrgId(reprocessed),
          fingerprint: idempotencyFingerprint,
        },
      );
      await saveDb();
      return { scan: reprocessed, replayed: false };
    });
    if (outcome.replayed) {
      res.setHeader("Idempotency-Replayed", "true");
      sendJson(res, 200, { scan: outcome.scan, idempotent: true });
      return;
    }
    await appendAudit("scan.reprocess", req, {
      resourceType: "scan",
      resourceId: outcome.scan.id,
      organizationId: outcome.scan.organizationId || getScanOrgId(outcome.scan),
      metadata: {
        aiLabel: outcome.scan.aiLabel || "",
        aiConfidence: outcome.scan.aiConfidence ?? null,
      },
    });
    sendJson(res, 200, { scan: outcome.scan });
    return;
  }

  if (segments.length === 4 && segments[3] === "audio" && method === "GET") {
    assertCanAccessScan(user, scan);
    serveScanAudio(res, scan);
    return;
  }

  if (segments.length === 4 && segments[3] === "audio-chunks" && method === "POST") {
    assertCanManageScan(user, scan);
    const metadata = parseScanAudioChunkHeaders(req);
    const chunk = await readRequestBuffer(req, MAX_SCAN_AUDIO_CHUNK_BYTES);
    const result = await appendScanAudioChunk(scan, user, metadata, chunk);
    if (result.replayed) res.setHeader("Idempotency-Replayed", "true");
    sendJson(res, 200, result);
    return;
  }

  if (segments.length === 4 && segments[3] === "complete" && method === "POST") {
    assertCanManageScan(user, scan);
    const idempotencyKey = readString(req.headers["idempotency-key"], 160);
    if (!idempotencyKey) {
      throw httpError(400, "Idempotency-Key is required", "IDEMPOTENCY_KEY_REQUIRED");
    }
    const completed = await completeUploadedScanIdempotently(scan, user, idempotencyKey);
    if (completed.replayed) res.setHeader("Idempotency-Replayed", "true");
    if (!completed.replayed) {
      await appendAudit("scan.complete", req, {
        resourceType: "scan",
        resourceId: completed.response.scan.id,
        organizationId: completed.response.scan.organizationId || getScanOrgId(completed.response.scan),
      });
    }
    sendJson(res, 200, completed.response);
    return;
  }

  if (segments.length === 4 && segments[3] === "audio-url" && method === "GET") {
    assertCanAccessScan(user, scan);
    const audioFile = repositories ? await repositories.audioFiles.findByScanId(scan.id) : db.audioFiles.find((file) => file.scanId === scan.id);
    if (!audioFile) {
      throw httpError(
        404,
        "Chưa có file âm thanh cho lượt đo này",
        "SCAN_AUDIO_UNAVAILABLE",
      );
    }
    const url = await storageAdapter.getSignedUrl(audioFile.objectKey, 900);
    await appendAudit("scan.audio_url", req, {
      resourceType: "scan",
      resourceId: scan.id,
      organizationId: scan.organizationId || getScanOrgId(scan),
    });
    sendJson(res, 200, {
      url,
      expiresInSeconds: 900,
      contentType: audioFile.contentType || "audio/wav",
      fileName: `${scan.id}.wav`,
      // Compatibility-only. New clients must not persist or display storage keys.
      objectKey: audioFile.objectKey,
    });
    return;
  }

  if (segments.length === 4 && segments[3] === "waveform" && method === "GET") {
    assertCanAccessScan(user, scan);
    const aiResult = repositories?.aiResults?.findByScanId
      ? await repositories.aiResults.findByScanId(scan.id)
      : (db.aiResults || [])
        .filter((result) => result.scanId === scan.id)
        .sort((left, right) => {
          const rightTime = Date.parse(right.updatedAt || right.createdAt || "") || 0;
          const leftTime = Date.parse(left.updatedAt || left.createdAt || "") || 0;
          return rightTime - leftTime;
        })[0];
    const waveformObjectKey = readString(aiResult?.rawResult?.waveformObjectKey, 1000);
    const expectedObjectKey = buildScanObjectKey(
      getScanOrgId(scan),
      scan.patientId,
      scan.id,
      "waveform.json",
    );
    if (!waveformObjectKey || waveformObjectKey !== expectedObjectKey) {
      throw httpError(
        404,
        "Chưa có dữ liệu dạng sóng cho lượt đo này",
        "SCAN_WAVEFORM_UNAVAILABLE",
      );
    }
    let waveformBuffer;
    try {
      waveformBuffer = await storageAdapter.getBuffer(
        waveformObjectKey,
        MAX_SCAN_WAVEFORM_BYTES,
      );
    } catch (error) {
      if (error?.code === "STORAGE_OBJECT_TOO_LARGE") {
        throw httpError(
          502,
          "Dữ liệu dạng sóng vượt giới hạn cho phép",
          "SCAN_WAVEFORM_ARTIFACT_INVALID",
        );
      }
      if (error?.code === "ENOENT" || error?.name === "NoSuchKey") {
        throw httpError(
          404,
          "Chưa có dữ liệu dạng sóng cho lượt đo này",
          "SCAN_WAVEFORM_UNAVAILABLE",
        );
      }
      throw httpError(
        503,
        "Không thể đọc dữ liệu dạng sóng",
        "SCAN_WAVEFORM_STORAGE_UNAVAILABLE",
      );
    }
    const waveform = parseScanWaveformArtifact(waveformBuffer, scan);
    await appendAudit("scan.waveform", req, {
      resourceType: "scan",
      resourceId: scan.id,
      organizationId: scan.organizationId || getScanOrgId(scan),
      metadata: {
        sampleRate: waveform.sampleRate,
        pointCount: waveform.points.length,
      },
    });
    sendJson(res, 200, { waveform });
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
  const accepted = handleIncomingAudio(message, {
    transport: "udp",
    label: sourceLabel,
    authenticated: false,
    deviceId: "",
    organizationId: "",
    sessionId: "",
  });

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

server.on("upgrade", async (req, socket) => {
  socket.setNoDelay(true);

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const role =
      url.pathname === "/esp" || url.pathname === "/device"
        ? "esp"
        : url.pathname === "/listen" || url.pathname === "/app"
          ? "listen"
          : "";
    const key = req.headers["sec-websocket-key"];
    const selectedProtocol =
      role === "listen" && getOfferedSocketProtocols(req).includes("shcare.realtime.v1")
          ? "shcare.realtime.v1"
          : "";
    const requestedListenerScanId = role === "listen" ? getRequestedListenerScanId(req) : "";
    const hasForbiddenListenerQueryCredential =
      role === "listen" &&
      ["token", "access_token", "authorization"].some((name) => url.searchParams.has(name));

    if (!role || !key) {
      socket.destroy();
      return;
    }

    if (role === "listen" && !hasForbiddenListenerQueryCredential) {
      const realtimeToken = getSocketAccessToken(req, url);
      const requiresAuth = AUTH_MODE === "production" && !ALLOW_DEMO_AUTH;
      let wsUser = null;
      if (realtimeToken) {
        wsUser = await authenticateRealtimeSocket(req, url);
        if (!wsUser) {
          socket.destroy();
          return;
        }
      } else if (requiresAuth) {
        socket.destroy();
        return;
      }
      socket._wsUser = wsUser;
      socket._authSessionId = req.authSession?.id || "";
      socket._authSessionKey = req.authSession?.sessionKey || "";
      socket._firebaseUid = readString(req.firebaseToken?.uid, 160);
      socket._firebaseAuthTime = normalizeFirebaseAuthTime(req.firebaseToken || {});
      socket._firebaseExpiresAt = Number(req.firebaseToken?.exp || 0) > 0
        ? Number(req.firebaseToken.exp) * 1000
        : 0;
    }

    const handshakeHeaders = [
        "HTTP/1.1 101 Switching Protocols",
        "Upgrade: websocket",
        "Connection: Upgrade",
        `Sec-WebSocket-Accept: ${websocketAcceptKey(key)}`,
      ];
    if (selectedProtocol) {
      handshakeHeaders.push(`Sec-WebSocket-Protocol: ${selectedProtocol}`);
    }
    handshakeHeaders.push("", "");
    socket.write(handshakeHeaders.join("\r\n"));

    socket._wsRole = role;
    socket._wsBuffer = Buffer.alloc(0);
    if (hasForbiddenListenerQueryCredential) {
      closeSocket(socket, 1008, "URL_CREDENTIALS_FORBIDDEN");
      return;
    }
    if (role === "esp") {
      console.log("ESP authentication pending");
    } else {
      if (requestedListenerScanId) {
        const requestedRecording = getActiveRecordingByScanId(requestedListenerScanId);
        const requestedScan = findScan(requestedListenerScanId);
        if (
          !requestedRecording ||
          !requestedScan ||
          !canListenerAccessScan(socket, requestedScan)
        ) {
          closeSocket(socket, 1008, "AUDIO_SOURCE_UNAVAILABLE");
          return;
        }
        socket._listenerRequestedScanId = requestedListenerScanId;
        socket._listenerScanId = requestedListenerScanId;
      }
      listenClients.add(socket);
      startRealtimeAuthSessionMonitor(socket);
      if (socket._firebaseExpiresAt) {
        const expiresInMs = socket._firebaseExpiresAt - Date.now();
        if (expiresInMs <= 0) {
          closeSocket(socket, 1008, "FIREBASE_TOKEN_EXPIRED");
          return;
        }
        socket._firebaseExpiryTimeout = setTimeout(
          () => closeSocket(socket, 1008, "FIREBASE_TOKEN_EXPIRED"),
          expiresInMs,
        );
        socket._firebaseExpiryTimeout.unref?.();
      }
      console.log("App/browser connected");
      sendText(socket, JSON.stringify(getStatusPayload(socket)));
      const recording = getPrimaryActiveRecordingForListener(socket);
      if (recording?.confirmed) {
        sendText(socket, JSON.stringify(getActiveAudioSessionMetadata(recording)));
        socket._audioSessionId = recording.sessionId;
        socket._audioProtocolVersion = 2;
        sendText(
          socket,
          JSON.stringify({
            type: "metrics",
            ...(recording.liveMetrics || createEmptyLiveMetrics()),
            workspaceId: recording.organizationId,
            patientId: recording.patientId,
            deviceId: recording.deviceId,
            scanId: recording.scanId,
            sessionId: recording.sessionId,
            sampleRate: SAMPLE_RATE,
            recording: true,
            updatedAt: recording.liveMetrics?.updatedAt || nowIso(),
          })
        );
      }
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

    if (role === "esp") {
      sendText(socket, JSON.stringify(deviceAuthenticator.issueChallenge(socket)));
      socket._authTimeout = setTimeout(() => {
        if (!socket._deviceAuth && !socket._cleanedUp) {
          closeSocket(socket, 1008, "AUTH_TIMEOUT");
        }
      }, DEVICE_AUTH_CHALLENGE_TTL_MS + 50);
      socket._authTimeout.unref?.();
    }

    broadcastStatus();
  } catch (err) {
    console.error(`WebSocket upgrade error: ${err.message}`);
    socket.destroy();
  }
});

async function reconcileIdentityProviderOperations() {
  if (!repositories?.identityOperations?.reconcileProviderApplied) return [];
  const outcomes = await repositories.identityOperations.reconcileProviderApplied(25);
  const failed = outcomes.filter((item) => !item.completed);
  if (outcomes.length > 0) {
    console.log(`Identity provider reconciliation: completed=${outcomes.length - failed.length}, failed=${failed.length}`);
  }
  return outcomes;
}

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
  const identityReconciliationInterval = setInterval(() => {
    void reconcileIdentityProviderOperations().catch((error) => {
      console.error(`Identity provider reconciliation failed: ${error.message}`);
    });
  }, 60 * 1000);
  identityReconciliationInterval.unref?.();
}

async function startRuntime() {
  assertRuntimeSecurity(process.env);
  ensureDataDirs();
  dataStore = createDataStore({
    backend: DATA_BACKEND,
    databaseUrl: process.env.DATABASE_URL,
    dbFile: DB_FILE,
    ensureDataDirs,
    createEmptyDb,
    normalizeDb,
    env: process.env,
  });
  await dataStore.init();
  db = normalizeDb(await dataStore.load());
  storageAdapter = createStorageAdapter({ dataDir: DATA_DIR, env: process.env });
  audioQueue = createAudioQueue(process.env);
  repositories = createRepositories({
    getDb: () => db,
    saveDb: DATA_BACKEND === "postgres" || DATA_BACKEND === "postgresql" ? saveDb : saveDbStrict,
    createId,
    nowIso,
    getPool: () => (dataStore && dataStore.pool ? dataStore.pool : null),
    projectRoleRequestUser: publicUser,
  });
  const otaBackfill = await repositories.devices.backfillOtaLifecycleFromRuntime();
  if (otaBackfill.backfilled > 0) {
    console.log(
      `PostgreSQL OTA lifecycle backfill: scanned=${otaBackfill.scanned}, backfilled=${otaBackfill.backfilled}, skipped=${otaBackfill.skipped}`,
    );
  }
  const hydratedCounts = await repositories.hydrateCoreState();
  if (hydratedCounts) {
    console.log(`PostgreSQL normalized state loaded: users=${hydratedCounts.users}, patients=${hydratedCounts.patients}, appointments=${hydratedCounts.appointments || 0}, devices=${hydratedCounts.devices}, scans=${hydratedCounts.scans}, audioFiles=${hydratedCounts.audioFiles}, aiResults=${hydratedCounts.aiResults}, organizations=${hydratedCounts.organizations}, notifications=${hydratedCounts.notifications}, auditLogs=${hydratedCounts.auditLogs}`);
  }
  await reconcileIdentityProviderOperations();
  ensureAppDefaults();
  localizeLegacyDbText();
  await markInterruptedRecordings();
  await saveDb();
  avatarCleanupWorker = createAvatarCleanupWorker({
    repository: repositories.avatarMutations,
    storageAdapter,
    workerId: `avatar-cleanup-${String(process.env.RENDER_INSTANCE_ID || process.pid).slice(0, 120)}`,
    intervalMillis: Number(process.env.AVATAR_CLEANUP_INTERVAL_MS || 30_000),
    leaseMillis: Number(process.env.AVATAR_CLEANUP_LEASE_MS || 60_000),
    operationTimeoutMillis: Number(
      process.env.AVATAR_CLEANUP_PROVIDER_TIMEOUT_MS || 30_000,
    ),
    batchSize: Number(process.env.AVATAR_CLEANUP_BATCH_SIZE || 20),
    maxAttempts: Number(process.env.AVATAR_CLEANUP_MAX_ATTEMPTS || 8),
    baseBackoffMillis: Number(
      process.env.AVATAR_CLEANUP_BASE_BACKOFF_MS || 30_000,
    ),
    maxBackoffMillis: Number(
      process.env.AVATAR_CLEANUP_MAX_BACKOFF_MS || 30 * 60_000,
    ),
    retentionMillis: Number(
      process.env.AVATAR_CLEANUP_RETENTION_MS || 30 * 24 * 60 * 60_000,
    ),
    onError: (error) => {
      console.error(
        `Avatar cleanup worker failed: ${String(error?.code || "AVATAR_CLEANUP_FAILED")}`,
      );
    },
  });
  void avatarCleanupWorker.start().then((result) => {
    if (result.claimed > 0) {
      console.log(
        `Avatar cleanup startup sweep: claimed=${result.claimed}, completed=${result.completed}, failed=${result.failed}, deadLettered=${result.deadLettered}`,
      );
    }
  }).catch((error) => {
    console.error(
      `Avatar cleanup startup sweep failed: ${String(error?.code || "AVATAR_CLEANUP_FAILED")}`,
    );
  });
  mqttControlPlane = createMqttControlPlane({
    env: process.env,
    onTelemetry: (deviceId, payload) => {
      void handleDeviceTelemetry(deviceId, payload).catch((err) => console.error(`MQTT telemetry error: ${err.message}`));
    },
    onEvent: (deviceId, payload) => {
      void deviceEventExecutor.enqueue(
        deviceId,
        () => handleDeviceEvent(deviceId, payload),
      ).catch((err) => console.error(`MQTT event error: ${err.message}`));
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

let shutdownStarted = false;

async function shutdownRuntime(signal) {
  if (shutdownStarted) return;
  shutdownStarted = true;
  try {
    if (avatarCleanupWorker) {
      await avatarCleanupWorker.stop();
    }
    for (const recording of listActiveRecordings()) {
      await stopRecording(recording.scanId);
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
    console.error(`Cannot complete ${signal} shutdown: ${err.message}`);
  } finally {
    audioUdp.close();
    if (server.listening) server.close(() => process.exit(0));
    else process.exit(0);
  }
}

process.on("SIGINT", () => {
  void shutdownRuntime("SIGINT");
});

process.on("SIGTERM", () => {
  void shutdownRuntime("SIGTERM");
});
