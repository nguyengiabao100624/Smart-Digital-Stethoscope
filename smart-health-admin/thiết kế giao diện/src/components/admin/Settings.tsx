import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertOctagon,
  Bell,
  BrainCircuit,
  Building,
  CheckCircle2,
  MessageSquare,
  RefreshCw,
  Save,
  Shield,
  UploadCloud,
} from "lucide-react";
import * as Tabs from "@radix-ui/react-tabs";
import { toast } from "sonner";
import {
  smartHealthApi,
  type SmartHealthProductionReadiness,
  type SmartHealthReadinessItem,
} from "@/lib/smart-health-api";
import { toVietnameseErrorMessage } from "@/lib/error-messages";
import {
  createStorageOperationIdempotencyKey,
  parseStorageFileOutcome,
} from "@/lib/storage-operations";
import { useLocation } from "./router-shim";

type SettingsState = {
  system: {
    name: string;
    supportEmail: string;
    supportHotline: string;
    timezone: string;
    source: string;
    updatedAt: string;
  };
  branding: {
    logoFileId: string;
    logoUrl: string;
    primaryColor: string;
    accentColor: string;
    updatedAt: string;
  };
  notifications: {
    enabled: boolean;
    abnormalResults: boolean;
    deviceConnection: boolean;
    appointments: boolean;
    aiUpdates: boolean;
    messages: boolean;
  };
  privacy: {
    biometric: boolean;
    twoFactor: boolean;
    encryption: boolean;
  };
  storage: {
    autoSync: boolean;
    cloudBackup: boolean;
    localTotalMb: number;
    cloudTotalMb: number;
  };
  stethoscope: {
    volume: number;
    sensitivity: number;
    noiseCancel: boolean;
    autoConnect: boolean;
  };
  ai: {
    analysisKind: string;
    selectedModel: string;
    version: string;
    analyzerVersion: string;
    status: string;
    updateSupported: boolean;
    clinicalDecisionSupport: boolean;
    accuracyMetricsAvailable: boolean;
    lastUpdateStatus: string;
  };
  outbound: {
    email: {
      enabled: boolean;
      provider: string;
      host: string;
      port: number;
      encryption: string;
      from: string;
      testRecipient: string;
    };
    webhook: {
      enabled: boolean;
      url: string;
      events: {
        deviceOffline: boolean;
        aiJobFailed: boolean;
        doctorRegistered: boolean;
      };
    };
    sms: {
      enabled: boolean;
      provider: string;
      testRecipient: string;
    };
    zalo: {
      enabled: boolean;
      provider: string;
      testRecipient: string;
    };
  };
  securityPolicy: {
    sessionTimeoutMinutes: number;
    maxSessionsPerUser: number;
    requireAdmin2fa: boolean;
    ipWhitelist: string;
    retentionDays: number;
    rateLimitPerMinute: number;
    backupCheckEnabled: boolean;
    lastBackupCheckAt: string;
    lastBackupStatus: string;
    apiKeys: Array<{
      id: string;
      name: string;
      keyPreview: string;
      status: string;
      scope?: string;
      createdAt?: string;
      updatedAt?: string;
      lastRotatedAt?: string;
    }>;
    passwordRules: {
      minLength: number;
      requireMixedCase: boolean;
      requireNumber: boolean;
      requireSpecial: boolean;
      expireDays: number;
    };
  };
};

type RuntimeState = {
  email: {
    provider: string;
    configured: boolean;
    missing: string[];
    from: string;
    apiUrl: string;
  };
  smtp: { configured: boolean; missing: string[]; host: string; port: number | null; from: string };
  outboundWebhook: { configured: boolean; missing: string[]; urlConfiguredIn: string };
  ai: {
    scanAnalysis: {
      available: boolean;
      analysisKind: string;
      analyzerVersion: string;
      clinicalDecisionSupport: boolean;
    };
    chatProvider: {
      available: boolean;
      status: string;
      provider: string;
      model: string;
      reason: string;
    };
    modelUpdate: {
      available: boolean;
      reason: string;
    };
  };
};

type SettingsScope = {
  type: "platform" | "workspace" | string;
  organizationId?: string;
  name?: string;
};

const defaults: SettingsState = {
  system: {
    name: "Smart Health B2B Platform",
    supportEmail: "support@smarthealth.vn",
    supportHotline: "1900 8888",
    timezone: "Asia/Ho_Chi_Minh",
    source: "web-admin",
    updatedAt: "",
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
  },
  storage: {
    autoSync: true,
    cloudBackup: true,
    localTotalMb: 8192,
    cloudTotalMb: 51200,
  },
  stethoscope: {
    volume: 75,
    sensitivity: 60,
    noiseCancel: true,
    autoConnect: true,
  },
  ai: {
    analysisKind: "",
    selectedModel: "",
    version: "",
    analyzerVersion: "",
    status: "unavailable",
    updateSupported: false,
    clinicalDecisionSupport: false,
    accuracyMetricsAvailable: false,
    lastUpdateStatus: "unavailable",
  },
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
    rateLimitPerMinute: 300,
    backupCheckEnabled: false,
    lastBackupCheckAt: "",
    lastBackupStatus: "",
    apiKeys: [],
    passwordRules: {
      minLength: 8,
      requireMixedCase: true,
      requireNumber: true,
      requireSpecial: false,
      expireDays: 0,
    },
  },
};

const runtimeDefaults: RuntimeState = {
  email: {
    provider: "brevo",
    configured: false,
    missing: ["BREVO_API_KEY", "BREVO_FROM_EMAIL"],
    from: "",
    apiUrl: "https://api.brevo.com/v3/smtp/email",
  },
  smtp: {
    configured: false,
    missing: ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"],
    host: "",
    port: null,
    from: "",
  },
  outboundWebhook: {
    configured: false,
    missing: ["OUTBOUND_WEBHOOK_URL or settings.outbound.webhook.url"],
    urlConfiguredIn: "",
  },
  ai: {
    scanAnalysis: {
      available: false,
      analysisKind: "",
      analyzerVersion: "",
      clinicalDecisionSupport: false,
    },
    chatProvider: {
      available: false,
      status: "unavailable",
      provider: "",
      model: "",
      reason: "not_configured",
    },
    modelUpdate: {
      available: false,
      reason: "not_supported",
    },
  },
};

function objectOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function asBool(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeSettings(raw: Record<string, unknown>): SettingsState {
  const system = objectOf(raw.system);
  const branding = objectOf(raw.branding);
  const notifications = objectOf(raw.notifications);
  const privacy = objectOf(raw.privacy);
  const storage = objectOf(raw.storage);
  const stethoscope = objectOf(raw.stethoscope);
  const ai = objectOf(raw.ai);
  const outbound = objectOf(raw.outbound);
  const email = objectOf(outbound.email);
  const webhook = objectOf(outbound.webhook);
  const events = objectOf(webhook.events);
  const sms = objectOf(outbound.sms);
  const zalo = objectOf(outbound.zalo);
  const securityPolicy = objectOf(raw.securityPolicy);
  const passwordRules = objectOf(securityPolicy.passwordRules);
  const apiKeys = Array.isArray(securityPolicy.apiKeys)
    ? securityPolicy.apiKeys
        .map((item) => {
          const value = objectOf(item);
          return {
            id: asString(value.id),
            name: asString(value.name, "API Key"),
            keyPreview: asString(value.keyPreview, "sh_live_********0000"),
            status: asString(value.status, "active"),
            scope: asString(value.scope),
            createdAt: asString(value.createdAt),
            updatedAt: asString(value.updatedAt),
            lastRotatedAt: asString(value.lastRotatedAt),
          };
        })
        .filter((item) => item.id)
    : defaults.securityPolicy.apiKeys;

  return {
    system: {
      name: asString(system.name, defaults.system.name),
      supportEmail: asString(system.supportEmail, defaults.system.supportEmail),
      supportHotline: asString(system.supportHotline, defaults.system.supportHotline),
      timezone: asString(system.timezone, defaults.system.timezone),
      source: asString(system.source, defaults.system.source),
      updatedAt: asString(system.updatedAt),
    },
    branding: {
      logoFileId: asString(branding.logoFileId),
      logoUrl: asString(branding.logoUrl),
      primaryColor: asString(branding.primaryColor, defaults.branding.primaryColor),
      accentColor: asString(branding.accentColor, defaults.branding.accentColor),
      updatedAt: asString(branding.updatedAt),
    },
    notifications: {
      enabled: asBool(notifications.enabled, defaults.notifications.enabled),
      abnormalResults: asBool(
        notifications.abnormalResults,
        defaults.notifications.abnormalResults,
      ),
      deviceConnection: asBool(
        notifications.deviceConnection,
        defaults.notifications.deviceConnection,
      ),
      appointments: asBool(notifications.appointments, defaults.notifications.appointments),
      aiUpdates: asBool(notifications.aiUpdates, defaults.notifications.aiUpdates),
      messages: asBool(notifications.messages, defaults.notifications.messages),
    },
    privacy: {
      biometric: asBool(privacy.biometric, defaults.privacy.biometric),
      twoFactor: asBool(privacy.twoFactor, defaults.privacy.twoFactor),
      encryption: asBool(privacy.encryption, defaults.privacy.encryption),
    },
    storage: {
      autoSync: asBool(storage.autoSync, defaults.storage.autoSync),
      cloudBackup: asBool(storage.cloudBackup, defaults.storage.cloudBackup),
      localTotalMb: asNumber(storage.localTotalMb, defaults.storage.localTotalMb),
      cloudTotalMb: asNumber(storage.cloudTotalMb, defaults.storage.cloudTotalMb),
    },
    stethoscope: {
      volume: asNumber(stethoscope.volume, defaults.stethoscope.volume),
      sensitivity: asNumber(stethoscope.sensitivity, defaults.stethoscope.sensitivity),
      noiseCancel: asBool(stethoscope.noiseCancel, defaults.stethoscope.noiseCancel),
      autoConnect: asBool(stethoscope.autoConnect, defaults.stethoscope.autoConnect),
    },
    ai: {
      analysisKind: asString(ai.analysisKind, defaults.ai.analysisKind),
      selectedModel: asString(ai.selectedModel, defaults.ai.selectedModel),
      version: asString(ai.version, defaults.ai.version),
      analyzerVersion: asString(ai.analyzerVersion, defaults.ai.analyzerVersion),
      status: asString(ai.status, defaults.ai.status),
      updateSupported: asBool(ai.updateSupported, false),
      clinicalDecisionSupport: asBool(ai.clinicalDecisionSupport, false),
      accuracyMetricsAvailable: asBool(ai.accuracyMetricsAvailable, false),
      lastUpdateStatus: asString(ai.lastUpdateStatus, defaults.ai.lastUpdateStatus),
    },
    outbound: {
      email: {
        enabled: asBool(email.enabled, defaults.outbound.email.enabled),
        provider: asString(email.provider, defaults.outbound.email.provider),
        host: asString(email.host, defaults.outbound.email.host),
        port: asNumber(email.port, defaults.outbound.email.port),
        encryption: asString(email.encryption, defaults.outbound.email.encryption),
        from: asString(email.from),
        testRecipient: asString(email.testRecipient),
      },
      webhook: {
        enabled: asBool(webhook.enabled, defaults.outbound.webhook.enabled),
        url: asString(webhook.url),
        events: {
          deviceOffline: asBool(
            events.deviceOffline,
            defaults.outbound.webhook.events.deviceOffline,
          ),
          aiJobFailed: asBool(events.aiJobFailed, defaults.outbound.webhook.events.aiJobFailed),
          doctorRegistered: asBool(
            events.doctorRegistered,
            defaults.outbound.webhook.events.doctorRegistered,
          ),
        },
      },
      sms: {
        enabled: asBool(sms.enabled, defaults.outbound.sms.enabled),
        provider: asString(sms.provider, defaults.outbound.sms.provider),
        testRecipient: asString(sms.testRecipient),
      },
      zalo: {
        enabled: asBool(zalo.enabled, defaults.outbound.zalo.enabled),
        provider: asString(zalo.provider, defaults.outbound.zalo.provider),
        testRecipient: asString(zalo.testRecipient),
      },
    },
    securityPolicy: {
      sessionTimeoutMinutes: asNumber(
        securityPolicy.sessionTimeoutMinutes,
        defaults.securityPolicy.sessionTimeoutMinutes,
      ),
      maxSessionsPerUser: asNumber(
        securityPolicy.maxSessionsPerUser,
        defaults.securityPolicy.maxSessionsPerUser,
      ),
      requireAdmin2fa: asBool(
        securityPolicy.requireAdmin2fa,
        defaults.securityPolicy.requireAdmin2fa,
      ),
      ipWhitelist: asString(securityPolicy.ipWhitelist),
      retentionDays: asNumber(securityPolicy.retentionDays, defaults.securityPolicy.retentionDays),
      rateLimitPerMinute: asNumber(
        securityPolicy.rateLimitPerMinute,
        defaults.securityPolicy.rateLimitPerMinute,
      ),
      backupCheckEnabled: asBool(
        securityPolicy.backupCheckEnabled,
        defaults.securityPolicy.backupCheckEnabled,
      ),
      lastBackupCheckAt: asString(securityPolicy.lastBackupCheckAt),
      lastBackupStatus: asString(securityPolicy.lastBackupStatus),
      apiKeys,
      passwordRules: {
        minLength: asNumber(
          passwordRules.minLength,
          defaults.securityPolicy.passwordRules.minLength,
        ),
        requireMixedCase: asBool(
          passwordRules.requireMixedCase,
          defaults.securityPolicy.passwordRules.requireMixedCase,
        ),
        requireNumber: asBool(
          passwordRules.requireNumber,
          defaults.securityPolicy.passwordRules.requireNumber,
        ),
        requireSpecial: asBool(
          passwordRules.requireSpecial,
          defaults.securityPolicy.passwordRules.requireSpecial,
        ),
        expireDays: asNumber(
          passwordRules.expireDays,
          defaults.securityPolicy.passwordRules.expireDays,
        ),
      },
    },
  };
}

function normalizeRuntime(raw: Record<string, unknown>): RuntimeState {
  const runtime = objectOf(raw.runtime);
  const email = objectOf(runtime.email);
  const smtp = objectOf(runtime.smtp);
  const outboundWebhook = objectOf(runtime.outboundWebhook);
  const ai = objectOf(runtime.ai);
  const scanAnalysis = objectOf(ai.scanAnalysis);
  const chatProvider = objectOf(ai.chatProvider);
  const modelUpdate = objectOf(ai.modelUpdate);
  const smtpPort = smtp.port === null ? null : asNumber(smtp.port, 0) || null;
  const smtpState = {
    configured: asBool(smtp.configured, false),
    missing: Array.isArray(smtp.missing) ? smtp.missing.map(String) : runtimeDefaults.smtp.missing,
    host: asString(smtp.host),
    port: smtpPort,
    from: asString(smtp.from),
  };
  const hasEmailRuntime = Object.keys(email).length > 0;
  const emailState = {
    provider:
      asString(email.provider) || (smtpState.configured ? "smtp" : runtimeDefaults.email.provider),
    configured: hasEmailRuntime ? asBool(email.configured, false) : smtpState.configured,
    missing: Array.isArray(email.missing)
      ? email.missing.map(String)
      : smtpState.configured
        ? []
        : runtimeDefaults.email.missing,
    from: asString(email.from) || smtpState.from,
    apiUrl: asString(email.apiUrl) || runtimeDefaults.email.apiUrl,
  };

  return {
    email: emailState,
    smtp: smtpState,
    outboundWebhook: {
      configured: asBool(outboundWebhook.configured, false),
      missing: Array.isArray(outboundWebhook.missing)
        ? outboundWebhook.missing.map(String)
        : runtimeDefaults.outboundWebhook.missing,
      urlConfiguredIn: asString(outboundWebhook.urlConfiguredIn),
    },
    ai: {
      scanAnalysis: {
        available: asBool(scanAnalysis.available, runtimeDefaults.ai.scanAnalysis.available),
        analysisKind: asString(
          scanAnalysis.analysisKind,
          runtimeDefaults.ai.scanAnalysis.analysisKind,
        ),
        analyzerVersion: asString(
          scanAnalysis.analyzerVersion,
          runtimeDefaults.ai.scanAnalysis.analyzerVersion,
        ),
        clinicalDecisionSupport: asBool(scanAnalysis.clinicalDecisionSupport, false),
      },
      chatProvider: {
        available: asBool(chatProvider.available, false),
        status: asString(chatProvider.status, runtimeDefaults.ai.chatProvider.status),
        provider: asString(chatProvider.provider),
        model: asString(chatProvider.model),
        reason: asString(chatProvider.reason, runtimeDefaults.ai.chatProvider.reason),
      },
      modelUpdate: {
        available: asBool(modelUpdate.available, false),
        reason: asString(modelUpdate.reason, runtimeDefaults.ai.modelUpdate.reason),
      },
    },
  };
}

function normalizeScope(raw: Record<string, unknown>): SettingsScope {
  const scope = objectOf(raw.scope);
  return {
    type: asString(scope.type, "platform"),
    organizationId: asString(scope.organizationId),
    name: asString(scope.name),
  };
}

function chatProviderReasonLabel(reason: string) {
  switch (reason) {
    case "not_configured":
      return "Chưa cấu hình endpoint, API key và model trên backend.";
    case "invalid_configuration":
      return "Cấu hình provider không hợp lệ; backend đã khóa kết nối.";
    default:
      return "Provider hỗ trợ hội thoại hiện không khả dụng.";
  }
}

function chatProviderLabel(provider: string) {
  if (!provider) return "Chưa cấu hình";
  if (provider === "openai_compatible") return "OpenAI-compatible";
  return provider.replaceAll("_", " ");
}

function buildPayload(settings: SettingsState) {
  return {
    system: {
      ...settings.system,
      source: "web-admin",
      updatedAt: new Date().toISOString(),
    },
    branding: settings.branding,
    outbound: {
      webhook: {
        url: settings.outbound.webhook.url.trim(),
      },
    },
  };
}

export function Settings() {
  const location = useLocation();
  const requestedTab =
    location.search && typeof location.search === "object"
      ? String((location.search as Record<string, unknown>).section || "")
      : "";
  const initialTab = ["general", "ai", "notifications", "security", "deployment"].includes(
    requestedTab,
  )
    ? requestedTab
    : "general";
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const logoUploadAttemptRef = useRef<{
    fingerprint: string;
    idempotencyKey: string;
  } | null>(null);
  const [settings, setSettings] = useState<SettingsState>(defaults);
  const [runtime, setRuntime] = useState<RuntimeState>(runtimeDefaults);
  const [scope, setScope] = useState<SettingsScope>({ type: "platform" });
  const [readiness, setReadiness] = useState<SmartHealthProductionReadiness | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [readinessError, setReadinessError] = useState("");
  const [logoPreview, setLogoPreview] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "success">("idle");
  const [emailTesting, setEmailTesting] = useState(false);
  const [outboundTesting, setOutboundTesting] = useState<"sms" | "zalo" | null>(null);

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const { settings: raw } = await smartHealthApi.getSettings();
      setSettings(normalizeSettings(raw));
      setRuntime(normalizeRuntime(raw));
      setScope(normalizeScope(raw));
    } catch (error) {
      const message = toVietnameseErrorMessage(error, "Không thể tải cài đặt vận hành.");
      setLoadError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadProductionReadiness = useCallback(async () => {
    setReadinessLoading(true);
    setReadinessError("");
    try {
      const { readiness: nextReadiness } = await smartHealthApi.getProductionReadiness();
      setReadiness(nextReadiness);
    } catch (error) {
      if ((error as { status?: number }).status === 403) {
        setReadiness(null);
        setReadinessError("");
        return;
      }
      setReadiness(null);
      setReadinessError(toVietnameseErrorMessage(error, "Không thể tải checklist triển khai."));
    } finally {
      setReadinessLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    void loadProductionReadiness();
  }, [loadProductionReadiness]);

  useEffect(() => {
    let objectUrl = "";
    let cancelled = false;
    if (!settings.branding.logoFileId) {
      setLogoPreview(settings.branding.logoUrl || "");
      return undefined;
    }
    smartHealthApi
      .downloadStorageFile(settings.branding.logoFileId, settings.branding.logoUrl)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setLogoPreview(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setLogoPreview(settings.branding.logoUrl || "");
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [settings.branding.logoFileId, settings.branding.logoUrl]);

  const patchSettings = (patch: Partial<SettingsState>) => {
    setSettings((current) => ({ ...current, ...patch }));
  };

  const saveSettings = async (showToast = true) => {
    setSaveStatus("saving");
    try {
      const { settings: raw } = await smartHealthApi.updateSettings(buildPayload(settings));
      setSettings(normalizeSettings(raw));
      setRuntime(normalizeRuntime(raw));
      setScope(normalizeScope(raw));
      setSaveStatus("success");
      if (showToast) toast.success("Đã lưu cài đặt hệ thống.");
      window.setTimeout(() => setSaveStatus("idle"), 1600);
      return raw;
    } catch (error) {
      setSaveStatus("idle");
      toast.error(toVietnameseErrorMessage(error, "Không thể lưu cài đặt hệ thống."));
    }
  };

  const handleLogoFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Logo phải là ảnh PNG, JPG hoặc WebP.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo tối đa 2MB.");
      return;
    }

    setLogoUploading(true);
    try {
      const fingerprint = [file.name, file.size, file.type, file.lastModified].join(":");
      const idempotencyKey =
        logoUploadAttemptRef.current?.fingerprint === fingerprint
          ? logoUploadAttemptRef.current.idempotencyKey
          : createStorageOperationIdempotencyKey("file-upload", "branding-logo");
      logoUploadAttemptRef.current = { fingerprint, idempotencyKey };
      const uploadResponse = await smartHealthApi.uploadStorageFile({
        bucket: "avatars",
        file,
        tags: ["branding", "logo"],
        idempotencyKey,
      });
      const storageFile = parseStorageFileOutcome(uploadResponse, {
        name: file.name,
        bucket: "avatars",
      });
      const branding = {
        ...settings.branding,
        logoFileId: storageFile.id,
        logoUrl: storageFile.downloadUrl || storageFile.previewUrl || "",
        updatedAt: new Date().toISOString(),
      };
      const { settings: raw } = await smartHealthApi.updateSettings({ branding });
      setSettings(normalizeSettings(raw));
      setRuntime(normalizeRuntime(raw));
      setScope(normalizeScope(raw));
      logoUploadAttemptRef.current = null;
      toast.success("Đã cập nhật logo hệ thống.");
    } catch (error) {
      toast.error(toVietnameseErrorMessage(error, "Không thể tải logo."));
    } finally {
      setLogoUploading(false);
    }
  };

  const clearLogo = async () => {
    const branding = {
      ...settings.branding,
      logoFileId: "",
      logoUrl: "",
      updatedAt: new Date().toISOString(),
    };
    try {
      const { settings: raw } = await smartHealthApi.updateSettings({ branding });
      setSettings(normalizeSettings(raw));
      setRuntime(normalizeRuntime(raw));
      setScope(normalizeScope(raw));
      toast.success("Đã gỡ logo hệ thống.");
    } catch (error) {
      toast.error(toVietnameseErrorMessage(error, "Không thể gỡ logo."));
    }
  };

  const testEmail = async () => {
    if (!settings.outbound.email.testRecipient.trim()) {
      toast.error("Nhập email nhận thử trước khi gửi.");
      return;
    }
    setEmailTesting(true);
    try {
      await smartHealthApi.testEmail({
        to: settings.outbound.email.testRecipient,
        subject: "Smart Health test email",
        message:
          "Email kiểm tra từ Web Admin Smart Health. Email outbound đang hoạt động nếu bạn nhận được email này.",
      });
      toast.success("Đã gửi email kiểm tra.");
    } catch (error) {
      toast.error(toVietnameseErrorMessage(error, "Không thể gửi email kiểm tra."));
    } finally {
      setEmailTesting(false);
    }
  };

  const testOutbound = async (channel: "sms" | "zalo") => {
    const recipient =
      channel === "sms"
        ? settings.outbound.sms.testRecipient
        : settings.outbound.zalo.testRecipient;
    if (!recipient.trim()) {
      toast.error(`Nhập người nhận test ${channel.toUpperCase()} trước khi gửi.`);
      return;
    }
    setOutboundTesting(channel);
    try {
      if (settings.outbound.webhook.url && !runtime.outboundWebhook.configured) {
        const { settings: raw } = await smartHealthApi.updateSettings({
          outbound: {
            webhook: {
              url: settings.outbound.webhook.url.trim(),
            },
          },
        });
        setSettings(normalizeSettings(raw));
        setRuntime(normalizeRuntime(raw));
        setScope(normalizeScope(raw));
      }
      await smartHealthApi.testOutbound({
        channel,
        to: recipient,
        message: `Smart Health test ${channel.toUpperCase()} qua webhook cấu hình miễn phí.`,
      });
      toast.success(`Đã gửi test ${channel.toUpperCase()} qua webhook.`);
    } catch (error) {
      toast.error(toVietnameseErrorMessage(error, `Không thể gửi test ${channel.toUpperCase()}.`));
    } finally {
      setOutboundTesting(null);
    }
  };

  const emailProviderLabel =
    runtime.email.provider === "brevo"
      ? "Brevo API"
      : runtime.email.provider === "smtp"
        ? "SMTP fallback"
        : runtime.email.provider || "email";
  const emailReason = runtime.email.configured
    ? ""
    : `Thiếu cấu hình env: ${runtime.email.missing.join(", ")}. Render Free nên dùng Brevo API qua HTTPS; SMTP/Gmail chỉ là fallback khi hosting cho phép SMTP.`;
  const webhookReady =
    runtime.outboundWebhook.configured || Boolean(settings.outbound.webhook.url.trim());
  const webhookReason = webhookReady
    ? ""
    : "Chưa có OUTBOUND_WEBHOOK_URL hoặc Webhook URL trong settings.";
  const isWorkspaceScope = scope.type === "workspace";
  const settingsTitle = isWorkspaceScope ? "Cài đặt bệnh viện" : "Cài đặt hệ thống";
  const settingsDescription = isWorkspaceScope
    ? `Cấu hình áp dụng cho ${scope.name || "workspace hiện tại"}; dữ liệu được lưu riêng theo bệnh viện.`
    : "Cấu hình nền tảng, branding, phân tích tín hiệu, kênh gửi thông báo và chính sách bảo mật.";
  const signalAnalysisAvailable = runtime.ai.scanAnalysis.available;
  const analyzerVersion =
    runtime.ai.scanAnalysis.analyzerVersion || settings.ai.analyzerVersion || settings.ai.version;
  const chatProviderAvailable = runtime.ai.chatProvider.available;
  const modelUpdateAvailable = settings.ai.updateSupported && runtime.ai.modelUpdate.available;

  if (isLoading) {
    return (
      <div className="flex h-[360px] items-center justify-center rounded-xl border border-border bg-card text-sm text-muted-foreground">
        Đang tải cài đặt...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="mx-auto flex min-h-[360px] w-full max-w-4xl items-center justify-center">
        <div
          role="alert"
          className="w-full rounded-xl border border-destructive/30 bg-card p-6 text-center"
        >
          <AlertOctagon className="mx-auto h-8 w-8 text-destructive" aria-hidden="true" />
          <h1 className="mt-3 text-lg font-semibold text-foreground">
            Không thể tải cài đặt vận hành
          </h1>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">{loadError}</p>
          <button
            type="button"
            onClick={() => void loadSettings()}
            className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Thử tải lại
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 h-full flex flex-col max-w-4xl mx-auto w-full">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">{settingsTitle}</h1>
          <p className="text-muted-foreground mt-1 text-sm">{settingsDescription}</p>
        </div>
        <button
          onClick={() => void saveSettings()}
          disabled={saveStatus === "saving"}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saveStatus === "saving"
            ? "Đang lưu..."
            : saveStatus === "success"
              ? "Đã lưu"
              : "Lưu thay đổi"}
        </button>
      </div>

      <Tabs.Root defaultValue={initialTab} className="flex-1 flex flex-col">
        <Tabs.List className="flex space-x-6 border-b border-border mb-6 overflow-x-auto">
          <TabTrigger value="general" icon={Building} label="Chung" />
          <TabTrigger value="ai" icon={BrainCircuit} label="Phân tích & thiết bị" />
          <TabTrigger value="notifications" icon={Bell} label="Kênh thông báo" />
          <TabTrigger value="security" icon={Shield} label="Bảo mật" />
          <TabTrigger value="deployment" icon={CheckCircle2} label="Triển khai" />
        </Tabs.List>

        <Tabs.Content value="general" className="space-y-6">
          <Panel title="Thông tin nền tảng">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <TextField
                label="Tên hệ thống"
                value={settings.system.name}
                onChange={(name) => patchSettings({ system: { ...settings.system, name } })}
              />
              <TextField
                label="Email hỗ trợ chung"
                type="email"
                value={settings.system.supportEmail}
                onChange={(supportEmail) =>
                  patchSettings({ system: { ...settings.system, supportEmail } })
                }
              />
              <TextField
                label="Hotline hỗ trợ kỹ thuật"
                value={settings.system.supportHotline}
                onChange={(supportHotline) =>
                  patchSettings({ system: { ...settings.system, supportHotline } })
                }
              />
              <SelectField
                label="Khu vực (timezone)"
                value={settings.system.timezone}
                onChange={(timezone) => patchSettings({ system: { ...settings.system, timezone } })}
                options={["Asia/Ho_Chi_Minh", "Asia/Bangkok"]}
              />
            </div>
          </Panel>

          <Panel title="Branding">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                className="flex h-24 w-24 shrink-0 flex-col items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted text-muted-foreground hover:bg-muted/80"
              >
                {logoPreview ? (
                  <img src={logoPreview} alt="Logo" className="h-full w-full object-cover" />
                ) : (
                  <>
                    <Building className="mb-2 h-8 w-8" />
                    <span className="text-xs">Tải logo</span>
                  </>
                )}
              </button>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={handleLogoFile}
              />
              <div className="flex-1 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Logo upload qua bucket avatars, sau đó lưu logoFileId/logoUrl vào
                  settings.branding.
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <TextField
                    label="Màu chính"
                    type="color"
                    value={settings.branding.primaryColor}
                    onChange={(primaryColor) =>
                      patchSettings({ branding: { ...settings.branding, primaryColor } })
                    }
                  />
                  <TextField
                    label="Màu nhấn"
                    type="color"
                    value={settings.branding.accentColor}
                    onChange={(accentColor) =>
                      patchSettings({ branding: { ...settings.branding, accentColor } })
                    }
                  />
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={() => logoInputRef.current?.click()}
                    disabled={logoUploading}
                    className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-60"
                  >
                    <UploadCloud className="h-4 w-4" />{" "}
                    {logoUploading ? "Đang tải..." : "Chọn file"}
                  </button>
                  <button
                    onClick={clearLogo}
                    disabled={!settings.branding.logoFileId && !settings.branding.logoUrl}
                    className="rounded-md px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  >
                    Gỡ logo
                  </button>
                </div>
              </div>
            </div>
          </Panel>

          <UnavailablePanel
            title="Storage và đồng bộ"
            description="Chưa có hợp đồng thực thi cho lịch backup, đồng bộ app hoặc quota storage từ trang Settings. Quota thật được quản lý tại Gói dịch vụ và Storage; trạng thái provider được kiểm tra trong tab Triển khai."
          />
        </Tabs.Content>

        <Tabs.Content value="ai" className="space-y-6">
          <Panel title="Phân tích tín hiệu">
            <section
              className="overflow-hidden rounded-xl border border-border"
              aria-labelledby="signal-analysis-status-heading"
            >
              <div className="flex flex-col gap-4 bg-muted/20 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
                <div className="flex min-w-0 gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <BrainCircuit className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <h3
                      id="signal-analysis-status-heading"
                      className="text-sm font-semibold text-foreground"
                    >
                      Chỉ kiểm tra chất lượng tín hiệu
                    </h3>
                    <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                      Backend dùng bộ quy tắc cục bộ để đánh giá dữ liệu âm thanh đầu vào. Đây không
                      phải mô hình chẩn đoán.
                    </p>
                  </div>
                </div>
                <StatusBadge
                  status={signalAnalysisAvailable ? "pass" : "warn"}
                  label={signalAnalysisAvailable ? "Đang khả dụng" : "Không khả dụng"}
                />
              </div>

              <dl className="grid divide-y divide-border border-t border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                <div className="p-4">
                  <dt className="text-xs text-muted-foreground">Phạm vi</dt>
                  <dd className="mt-1 text-sm font-medium text-foreground">
                    Chất lượng tín hiệu âm thanh
                  </dd>
                </div>
                <div className="p-4">
                  <dt className="text-xs text-muted-foreground">Bộ phân tích</dt>
                  <dd className="mt-1 break-all font-mono text-sm font-medium text-foreground">
                    {analyzerVersion || "Chưa có dữ liệu"}
                  </dd>
                </div>
                <div className="p-4">
                  <dt className="text-xs text-muted-foreground">Số liệu lâm sàng</dt>
                  <dd className="mt-1 text-sm font-medium text-foreground">
                    {settings.ai.accuracyMetricsAvailable
                      ? "Backend đã cung cấp"
                      : "Không có số liệu xác thực"}
                  </dd>
                </div>
              </dl>

              <div className="border-t border-border p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 gap-3">
                    <MessageSquare
                      className="mt-0.5 h-5 w-5 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <div>
                      <h4 className="text-sm font-semibold text-foreground">
                        Provider hỗ trợ hội thoại
                      </h4>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {chatProviderAvailable
                          ? `${chatProviderLabel(runtime.ai.chatProvider.provider)}${runtime.ai.chatProvider.model ? ` · ${runtime.ai.chatProvider.model}` : ""}`
                          : chatProviderReasonLabel(runtime.ai.chatProvider.reason)}
                      </p>
                    </div>
                  </div>
                  <StatusBadge
                    status={chatProviderAvailable ? "pass" : "warn"}
                    label={chatProviderAvailable ? "Đã cấu hình" : "Chưa cấu hình"}
                  />
                </div>
              </div>

              <div className="border-t border-border p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-foreground">
                      Cập nhật mô hình lâm sàng
                    </h4>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {modelUpdateAvailable
                        ? "Backend đã báo có bản cập nhật; giao diện chưa bật thao tác này."
                        : "Hệ thống chưa có provider hoặc quy trình cập nhật mô hình được xác thực."}
                    </p>
                  </div>
                  <StatusBadge
                    status={modelUpdateAvailable ? "manual" : "unavailable"}
                    label={modelUpdateAvailable ? "Chờ quy trình" : "Không hỗ trợ"}
                  />
                </div>
              </div>
            </section>

            <div
              role="note"
              className="flex gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4"
            >
              <Shield className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
              <div>
                <h4 className="text-sm font-semibold text-foreground">Giới hạn lâm sàng</h4>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Không phát hiện bệnh, không đưa ra chẩn đoán và không thay thế đánh giá của người
                  có chuyên môn.
                </p>
              </div>
            </div>
          </Panel>

          <UnavailablePanel
            title="Ống nghe điện tử"
            description="Chưa có hợp đồng thực thi để đẩy âm lượng, độ nhạy, khử nhiễu hoặc tự kết nối từ Settings tới app và firmware. Cấu hình thiết bị chỉ được coi là áp dụng sau khi backend nhận lệnh và firmware ACK."
          />
        </Tabs.Content>

        <Tabs.Content value="notifications" className="space-y-6">
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
            Email gửi thật ưu tiên Brevo API qua HTTPS để chạy được trên Render Free. SMS/Zalo không
            có gói production miễn phí ổn định nên dùng webhook tự cấu hình hoặc để hướng phát
            triển.
          </div>

          <Panel title="Email thông báo / Brevo API">
            <RuntimeNotice
              ok={runtime.email.configured}
              okText={`Email provider ${emailProviderLabel} đã cấu hình${runtime.email.from ? `: ${runtime.email.from}` : ""}`}
              failText={emailReason}
            />
            <div className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Provider, sender và thông tin SMTP được đọc từ runtime backend. Trang này không ghi đè
              biến môi trường hoặc lưu credential.
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <ReadinessMeta label="Provider đang dùng" value={emailProviderLabel} />
              <ReadinessMeta label="Sender runtime" value={runtime.email.from || "Chưa cấu hình"} />
              <ReadinessMeta
                label="SMTP fallback"
                value={
                  runtime.smtp.configured
                    ? `${runtime.smtp.host || "SMTP"}${runtime.smtp.port ? `:${runtime.smtp.port}` : ""}`
                    : "Không khả dụng"
                }
              />
            </div>
            <div className="max-w-md">
              <TextField
                label="Email nhận test (không lưu)"
                type="email"
                value={settings.outbound.email.testRecipient}
                onChange={(testRecipient) =>
                  patchSettings({
                    outbound: {
                      ...settings.outbound,
                      email: { ...settings.outbound.email, testRecipient },
                    },
                  })
                }
              />
            </div>
            <button
              onClick={testEmail}
              disabled={
                !runtime.email.configured ||
                emailTesting ||
                !settings.outbound.email.testRecipient.trim()
              }
              title={emailReason || undefined}
              className="mt-4 inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />{" "}
              {emailTesting ? "Đang gửi..." : "Gửi email kiểm tra"}
            </button>
          </Panel>

          <Panel title="Webhook SMS/Zalo">
            <RuntimeNotice
              ok={webhookReady}
              okText={`Webhook đã cấu hình${
                runtime.outboundWebhook.urlConfiguredIn
                  ? ` qua ${runtime.outboundWebhook.urlConfiguredIn}`
                  : " trong settings"
              }.`}
              failText={webhookReason}
            />
            <div className="space-y-4">
              <TextField
                label="Webhook URL"
                type="url"
                value={settings.outbound.webhook.url}
                mono
                onChange={(url) =>
                  patchSettings({
                    outbound: {
                      ...settings.outbound,
                      webhook: { ...settings.outbound.webhook, url },
                    },
                  })
                }
              />
              <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-foreground">
                <span className="font-medium">Chưa có hợp đồng thực thi cho bộ lọc sự kiện.</span>{" "}
                Webhook này hiện chỉ được backend xác nhận khi chạy test SMS/Zalo; Settings không
                tuyên bố đã bật phát sự kiện thiết bị, phân tích hoặc đăng ký bác sĩ.
              </div>
            </div>
          </Panel>

          <Panel title="SMS và Zalo OA qua webhook">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ChannelTester
                title="SMS"
                value={settings.outbound.sms.testRecipient}
                provider={settings.outbound.sms.provider}
                onProviderChange={(provider) =>
                  patchSettings({
                    outbound: { ...settings.outbound, sms: { ...settings.outbound.sms, provider } },
                  })
                }
                onRecipientChange={(testRecipient) =>
                  patchSettings({
                    outbound: {
                      ...settings.outbound,
                      sms: { ...settings.outbound.sms, testRecipient },
                    },
                  })
                }
                onTest={() => void testOutbound("sms")}
                disabled={!webhookReady || outboundTesting !== null}
                loading={outboundTesting === "sms"}
                reason={webhookReason}
              />
              <ChannelTester
                title="Zalo OA"
                value={settings.outbound.zalo.testRecipient}
                provider={settings.outbound.zalo.provider}
                onProviderChange={(provider) =>
                  patchSettings({
                    outbound: {
                      ...settings.outbound,
                      zalo: { ...settings.outbound.zalo, provider },
                    },
                  })
                }
                onRecipientChange={(testRecipient) =>
                  patchSettings({
                    outbound: {
                      ...settings.outbound,
                      zalo: { ...settings.outbound.zalo, testRecipient },
                    },
                  })
                }
                onTest={() => void testOutbound("zalo")}
                disabled={!webhookReady || outboundTesting !== null}
                loading={outboundTesting === "zalo"}
                reason={webhookReason}
              />
            </div>
          </Panel>

          <UnavailablePanel
            title="Loại thông báo hệ thống"
            description="Chưa có hợp đồng thực thi để bật/tắt toàn cục từng loại notification từ Platform Settings. Audience và kênh gửi thật được quản lý trong Thông báo; tùy chọn cá nhân được quản lý ở Cài đặt tài khoản."
          />
        </Tabs.Content>

        <Tabs.Content value="security" className="space-y-6">
          <UnavailablePanel
            title="Chính sách phiên đăng nhập"
            description="Chưa có hợp đồng thực thi cho thời gian hết phiên, giới hạn số phiên hoặc bắt buộc 2FA toàn cục. Phiên và 2FA của từng tài khoản được quản lý trong Cài đặt tài khoản; Settings không thay đổi enforcement đăng nhập."
          />

          <UnavailablePanel
            title="Chính sách mật khẩu"
            description="Chưa có hợp đồng thực thi để áp dụng bộ quy tắc mật khẩu từ Platform Settings cho Firebase Auth và luồng đổi mật khẩu. Các giá trị từng được lưu ở đây chỉ là metadata, không được hiển thị như chính sách đang hoạt động."
          />

          <UnavailablePanel
            title="IP whitelist, retention, rate limit và mã hóa"
            description="Chưa có hợp đồng thực thi cho các control này. Rate limit và khóa mã hóa do cấu hình backend quyết định; retention phải được áp dụng bằng job xóa có audit. Tab Triển khai chỉ báo trạng thái thật, không cho đổi local state."
          />

          <UnavailablePanel
            title="Backup và API keys"
            description="Chưa có hợp đồng thực thi để xác minh bản backup có thể khôi phục hoặc dùng API key làm credential. Vì vậy trang này không tạo, rotate, thu hồi key hay báo kiểm tra backup thành công. Các hàng key mẫu/preview cũ không được coi là khóa hoạt động."
          />
        </Tabs.Content>

        <Tabs.Content value="deployment" className="space-y-6">
          <Panel title="Sẵn sàng triển khai thực tế">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm text-muted-foreground">
                  Checklist này kiểm tra cấu hình hạ tầng qua backend, chỉ hiển thị tên biến môi
                  trường và trạng thái, không hiển thị secret.
                </div>
                {readiness ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <StatusBadge
                      status={readiness.ok ? "pass" : "fail"}
                      label={readiness.ok ? "Đủ cấu hình bắt buộc" : "Còn thiếu cấu hình bắt buộc"}
                    />
                    <StatusBadge status="pass" label={`Pass ${readiness.counts?.pass || 0}`} />
                    <StatusBadge status="warn" label={`Warn ${readiness.counts?.warn || 0}`} />
                    <StatusBadge status="fail" label={`Fail ${readiness.counts?.fail || 0}`} />
                    <StatusBadge
                      status="manual"
                      label={`Manual ${readiness.counts?.manual || 0}`}
                    />
                  </div>
                ) : null}
              </div>
              <button
                onClick={() => void loadProductionReadiness()}
                disabled={readinessLoading}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
              >
                <RefreshCw className="h-4 w-4" />
                {readinessLoading ? "Đang kiểm tra..." : "Kiểm tra lại"}
              </button>
            </div>

            {readinessError ? (
              <div className="rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {readinessError}
              </div>
            ) : null}

            {!readiness && !readinessLoading && !readinessError ? (
              <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                Tài khoản hiện tại không có quyền xem checklist hạ tầng toàn hệ thống hoặc backend
                chưa trả dữ liệu checklist.
              </div>
            ) : null}

            {readiness ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <ReadinessMeta
                    label="Auth mode"
                    value={readiness.environment?.authMode || "--"}
                  />
                  <ReadinessMeta
                    label="Data backend"
                    value={readiness.environment?.dataBackend || "--"}
                  />
                  <ReadinessMeta
                    label="Storage"
                    value={readiness.environment?.storageProvider || "--"}
                  />
                  <ReadinessMeta
                    label="Public API"
                    value={readiness.environment?.publicBackendUrl || "--"}
                    mono
                  />
                </div>

                {groupReadinessItems(readiness.items).map((group) => (
                  <div key={group.name} className="rounded-lg border border-border">
                    <div className="border-b border-border px-4 py-3 text-sm font-semibold text-foreground">
                      {readinessGroupLabel(group.name)}
                    </div>
                    <div className="divide-y divide-border">
                      {group.items.map((item) => (
                        <ReadinessRow key={item.id} item={item} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </Panel>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

function TabTrigger({
  value,
  icon: Icon,
  label,
}: {
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Tabs.Trigger
      value={value}
      className="pb-3 text-sm font-medium text-muted-foreground hover:text-foreground data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary transition-all flex items-center gap-2 whitespace-nowrap flex-shrink-0"
    >
      <Icon className="w-4 h-4" /> {label}
    </Tabs.Trigger>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-6 space-y-4">
      <h3 className="text-base font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function UnavailablePanel({ title, description }: { title: string; description: string }) {
  return (
    <Panel title={title}>
      <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning/10 p-4">
        <AlertOctagon className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
        <div className="min-w-0">
          <StatusBadge status="unavailable" label="Chưa hỗ trợ" />
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
        </div>
      </div>
    </Panel>
  );
}

function groupReadinessItems(items: SmartHealthReadinessItem[]) {
  const groups = new Map<string, SmartHealthReadinessItem[]>();
  items.forEach((item) => {
    const key = item.group || "other";
    groups.set(key, [...(groups.get(key) || []), item]);
  });
  return Array.from(groups.entries()).map(([name, groupItems]) => ({ name, items: groupItems }));
}

function readinessGroupLabel(group: string) {
  const labels: Record<string, string> = {
    identity: "Định danh Firebase",
    network: "Domain, HTTPS và CORS",
    data: "Cơ sở dữ liệu và queue",
    storage: "Object storage",
    security: "Bảo mật",
    outbound: "Email, SMS, Zalo",
    device: "Thiết bị, MQTT và OTA",
    clients: "Web Admin và Android",
  };
  return labels[group] || group;
}

function statusClass(status: string) {
  switch (status) {
    case "pass":
      return "border-success/30 bg-success/10 text-success";
    case "fail":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    case "warn":
      return "border-warning/30 bg-warning/10 text-warning";
    case "manual":
      return "border-primary/30 bg-primary/10 text-primary";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass(status)}`}
    >
      {label}
    </span>
  );
}

function ReadinessMeta({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`mt-1 break-all text-sm font-medium text-foreground ${mono ? "font-mono" : ""}`}
      >
        {value}
      </div>
    </div>
  );
}

function ReadinessRow({ item }: { item: SmartHealthReadinessItem }) {
  const label =
    item.status === "pass"
      ? "PASS"
      : item.status === "fail"
        ? "FAIL"
        : item.status === "manual"
          ? "MANUAL"
          : "WARN";
  return (
    <div className="space-y-2 px-4 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-sm font-medium text-foreground">{item.label}</div>
          {item.detail ? (
            <div className="mt-1 text-xs text-muted-foreground">{item.detail}</div>
          ) : null}
        </div>
        <StatusBadge status={item.status} label={label} />
      </div>
      {item.env?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {item.env.map((name) => (
            <code
              key={name}
              className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
            >
              {name}
            </code>
          ))}
        </div>
      ) : null}
      {item.status !== "pass" && item.setup ? (
        <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          {item.setup}
        </div>
      ) : null}
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = "text",
  mono = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring ${
          mono ? "font-mono" : ""
        }`}
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">{label}</label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

function RuntimeNotice({
  ok,
  okText,
  failText,
}: {
  ok: boolean;
  okText: string;
  failText: string;
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 text-sm ${
        ok
          ? "border-success/20 bg-success/10 text-success"
          : "border-warning/30 bg-warning/10 text-[#B45309]"
      }`}
    >
      {ok ? okText : failText}
    </div>
  );
}

function ChannelTester({
  title,
  value,
  provider,
  onRecipientChange,
  onProviderChange,
  onTest,
  disabled,
  loading,
  reason,
}: {
  title: string;
  value: string;
  provider: string;
  onRecipientChange: (value: string) => void;
  onProviderChange: (value: string) => void;
  onTest: () => void;
  disabled: boolean;
  loading: boolean;
  reason: string;
}) {
  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <MessageSquare className="h-4 w-4 text-primary" /> {title}
      </div>
      <SelectField
        label="Provider"
        value={provider}
        onChange={onProviderChange}
        options={["webhook"]}
      />
      <TextField label="Người nhận test (không lưu)" value={value} onChange={onRecipientChange} />
      <button
        onClick={onTest}
        disabled={disabled || loading || !value.trim()}
        title={reason || undefined}
        className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
      >
        <RefreshCw className="h-3.5 w-3.5" /> {loading ? "Đang gửi..." : `Gửi test ${title}`}
      </button>
    </div>
  );
}
