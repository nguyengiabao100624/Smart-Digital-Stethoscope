import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertOctagon,
  Bell,
  BrainCircuit,
  Building,
  CheckCircle2,
  Copy,
  KeyRound,
  MessageSquare,
  RefreshCw,
  Save,
  Shield,
  UploadCloud,
} from "lucide-react";
import * as Tabs from "@radix-ui/react-tabs";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { smartHealthApi, type SmartHealthProductionReadiness, type SmartHealthReadinessItem } from "@/lib/smart-health-api";
import { toVietnameseErrorMessage } from "@/lib/error-messages";

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
    selectedModel: string;
    version: string;
    minConfidence: number;
    maxNoiseDb: number;
    timeoutSeconds: number;
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
  twoFactorAvailable: boolean;
  apiKeyRotationAvailable: boolean;
  backupTestAvailable: boolean;
  aiModelUpdateAvailable: boolean;
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
    selectedModel: "balanced",
    version: "AI Medical Analysis v3.2.1",
    minConfidence: 85,
    maxNoiseDb: 45,
    timeoutSeconds: 120,
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
    apiKeys: [
      {
        id: "key_production",
        name: "API Key Production",
        keyPreview: "sk_live_********1234",
        status: "active",
        scope: "platform",
      },
      {
        id: "key_staging",
        name: "API Key Staging",
        keyPreview: "sk_test_********7788",
        status: "active",
        scope: "workspace",
      },
    ],
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
  twoFactorAvailable: false,
  apiKeyRotationAvailable: false,
  backupTestAvailable: false,
  aiModelUpdateAvailable: false,
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
      abnormalResults: asBool(notifications.abnormalResults, defaults.notifications.abnormalResults),
      deviceConnection: asBool(notifications.deviceConnection, defaults.notifications.deviceConnection),
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
      selectedModel: asString(ai.selectedModel, defaults.ai.selectedModel),
      version: asString(ai.version, defaults.ai.version),
      minConfidence: asNumber(ai.minConfidence, defaults.ai.minConfidence),
      maxNoiseDb: asNumber(ai.maxNoiseDb, defaults.ai.maxNoiseDb),
      timeoutSeconds: asNumber(ai.timeoutSeconds, defaults.ai.timeoutSeconds),
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
          deviceOffline: asBool(events.deviceOffline, defaults.outbound.webhook.events.deviceOffline),
          aiJobFailed: asBool(events.aiJobFailed, defaults.outbound.webhook.events.aiJobFailed),
          doctorRegistered: asBool(events.doctorRegistered, defaults.outbound.webhook.events.doctorRegistered),
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
        minLength: asNumber(passwordRules.minLength, defaults.securityPolicy.passwordRules.minLength),
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
        expireDays: asNumber(passwordRules.expireDays, defaults.securityPolicy.passwordRules.expireDays),
      },
    },
  };
}

function normalizeRuntime(raw: Record<string, unknown>): RuntimeState {
  const runtime = objectOf(raw.runtime);
  const email = objectOf(runtime.email);
  const smtp = objectOf(runtime.smtp);
  const outboundWebhook = objectOf(runtime.outboundWebhook);
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
    provider: asString(email.provider) || (smtpState.configured ? "smtp" : runtimeDefaults.email.provider),
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
    twoFactorAvailable: asBool(runtime.twoFactorAvailable, false),
    apiKeyRotationAvailable: asBool(runtime.apiKeyRotationAvailable, false),
    backupTestAvailable: asBool(runtime.backupTestAvailable, false),
    aiModelUpdateAvailable: asBool(runtime.aiModelUpdateAvailable, false),
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

function buildPayload(settings: SettingsState) {
  return {
    ...settings,
    system: {
      ...settings.system,
      source: "web-admin",
      updatedAt: new Date().toISOString(),
    },
  };
}

export function Settings() {
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [settings, setSettings] = useState<SettingsState>(defaults);
  const [runtime, setRuntime] = useState<RuntimeState>(runtimeDefaults);
  const [scope, setScope] = useState<SettingsScope>({ type: "platform" });
  const [readiness, setReadiness] = useState<SmartHealthProductionReadiness | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);
  const [readinessError, setReadinessError] = useState("");
  const [logoPreview, setLogoPreview] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [logoUploading, setLogoUploading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "success">("idle");
  const [emailTesting, setEmailTesting] = useState(false);
  const [outboundTesting, setOutboundTesting] = useState<"sms" | "zalo" | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [backupChecking, setBackupChecking] = useState(false);
  const [apiKeyAction, setApiKeyAction] = useState<string | null>(null);
  const [aiUpdating, setAiUpdating] = useState(false);

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const { settings: raw } = await smartHealthApi.getSettings();
      setSettings(normalizeSettings(raw));
      setRuntime(normalizeRuntime(raw));
      setScope(normalizeScope(raw));
    } catch (error) {
      toast.error(toVietnameseErrorMessage(error, "Không thể tải cài đặt."));
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
      throw error;
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
      const { file: storageFile } = await smartHealthApi.uploadStorageFile({
        bucket: "avatars",
        file,
        visibility: "public",
        tags: ["branding", "logo"],
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

  const handleCopy = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error("Không thể sao chép vào clipboard.");
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
      channel === "sms" ? settings.outbound.sms.testRecipient : settings.outbound.zalo.testRecipient;
    if (!recipient.trim()) {
      toast.error(`Nhập người nhận test ${channel.toUpperCase()} trước khi gửi.`);
      return;
    }
    setOutboundTesting(channel);
    try {
      if (settings.outbound.webhook.url && !runtime.outboundWebhook.configured) {
        const { settings: raw } = await smartHealthApi.updateSettings({ outbound: settings.outbound });
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

  const refreshSettingsFromResponse = (raw: Record<string, unknown>) => {
    setSettings(normalizeSettings(raw));
    setRuntime(normalizeRuntime(raw));
    setScope(normalizeScope(raw));
  };

  const runBackupCheck = async () => {
    setBackupChecking(true);
    try {
      const { settings: raw } = await smartHealthApi.runBackupCheck();
      refreshSettingsFromResponse(raw);
      toast.success("Đã kiểm tra trạng thái backup và storage.");
    } catch (error) {
      toast.error(toVietnameseErrorMessage(error, "Không thể kiểm tra backup."));
    } finally {
      setBackupChecking(false);
    }
  };

  const createApiKey = async () => {
    setApiKeyAction("create");
    try {
      const { settings: raw, secret } = await smartHealthApi.createApiKey({
        name: isWorkspaceScope ? "Workspace API Key" : "Platform API Key",
      });
      refreshSettingsFromResponse(raw);
      if (secret) await navigator.clipboard.writeText(secret).catch(() => undefined);
      toast.success(secret ? "Đã tạo API key mới và sao chép secret một lần." : "Đã tạo API key mới.");
    } catch (error) {
      toast.error(toVietnameseErrorMessage(error, "Không thể tạo API key."));
    } finally {
      setApiKeyAction(null);
    }
  };

  const rotateApiKey = async (keyId: string) => {
    setApiKeyAction(`rotate-${keyId}`);
    try {
      const { settings: raw, secret } = await smartHealthApi.rotateApiKey(keyId);
      refreshSettingsFromResponse(raw);
      if (secret) await navigator.clipboard.writeText(secret).catch(() => undefined);
      toast.success(secret ? "Đã rotate API key và sao chép secret mới." : "Đã rotate API key.");
    } catch (error) {
      toast.error(toVietnameseErrorMessage(error, "Không thể rotate API key."));
    } finally {
      setApiKeyAction(null);
    }
  };

  const revokeApiKey = async (keyId: string) => {
    setApiKeyAction(`revoke-${keyId}`);
    try {
      const { settings: raw } = await smartHealthApi.revokeApiKey(keyId);
      refreshSettingsFromResponse(raw);
      toast.success("Đã thu hồi API key.");
    } catch (error) {
      toast.error(toVietnameseErrorMessage(error, "Không thể thu hồi API key."));
    } finally {
      setApiKeyAction(null);
    }
  };

  const updateAiModel = async () => {
    setAiUpdating(true);
    try {
      const check = await smartHealthApi.checkAiModelUpdate();
      const update = check.update as { latestVersion?: string; available?: boolean } | undefined;
      if (!update?.available) {
        toast.success("AI model đã ở phiên bản mới nhất.");
        return;
      }
      const { settings: raw } = await smartHealthApi.updateAiModel();
      refreshSettingsFromResponse(raw);
      toast.success(`Đã cập nhật AI model ${update.latestVersion || ""}.`);
    } catch (error) {
      toast.error(toVietnameseErrorMessage(error, "Không thể cập nhật AI model."));
    } finally {
      setAiUpdating(false);
    }
  };

  const emailProviderLabel =
    runtime.email.provider === "brevo" ? "Brevo API" : runtime.email.provider === "smtp" ? "SMTP fallback" : runtime.email.provider || "email";
  const emailReason = runtime.email.configured
    ? ""
    : `Thiếu cấu hình env: ${runtime.email.missing.join(", ")}. Render Free nên dùng Brevo API qua HTTPS; SMTP/Gmail chỉ là fallback khi hosting cho phép SMTP.`;
  const webhookReady = runtime.outboundWebhook.configured || Boolean(settings.outbound.webhook.url.trim());
  const webhookReason = webhookReady
    ? ""
    : "Chưa có OUTBOUND_WEBHOOK_URL hoặc Webhook URL trong settings.";
  const unavailableReason = "Cần cấu hình backend/provider triển khai trước khi bật chức năng này.";
  const isWorkspaceScope = scope.type === "workspace";
  const settingsTitle = isWorkspaceScope ? "Cài đặt bệnh viện" : "Cài đặt hệ thống";
  const settingsDescription = isWorkspaceScope
    ? `Cấu hình áp dụng cho ${scope.name || "workspace hiện tại"}; dữ liệu được lưu riêng theo bệnh viện.`
    : "Cấu hình nền tảng, branding, AI, kênh gửi thông báo và chính sách bảo mật.";

  if (isLoading) {
    return (
      <div className="flex h-[360px] items-center justify-center rounded-xl border border-border bg-card text-sm text-muted-foreground">
        Đang tải cài đặt...
      </div>
    );
  }

  return (
    <div className="space-y-6 h-full flex flex-col max-w-4xl mx-auto w-full">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">{settingsTitle}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {settingsDescription}
          </p>
        </div>
        <button
          onClick={() => void saveSettings()}
          disabled={saveStatus === "saving"}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {saveStatus === "saving" ? "Đang lưu..." : saveStatus === "success" ? "Đã lưu" : "Lưu thay đổi"}
        </button>
      </div>

      <Tabs.Root defaultValue="general" className="flex-1 flex flex-col">
        <Tabs.List className="flex space-x-6 border-b border-border mb-6 overflow-x-auto">
          <TabTrigger value="general" icon={Building} label="Chung" />
          <TabTrigger value="ai" icon={BrainCircuit} label="AI & thiết bị" />
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
                  Logo upload qua bucket avatars, sau đó lưu logoFileId/logoUrl vào settings.branding.
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
                    <UploadCloud className="h-4 w-4" /> {logoUploading ? "Đang tải..." : "Chọn file"}
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

          <Panel title="Storage và đồng bộ">
            <div className="space-y-3">
              <ToggleRow
                title="Tự động đồng bộ dữ liệu"
                description="Cho phép app đồng bộ metadata khi có mạng"
                checked={settings.storage.autoSync}
                onChange={(autoSync) => patchSettings({ storage: { ...settings.storage, autoSync } })}
              />
              <ToggleRow
                title="Cloud backup"
                description="Bật backup metadata và file quan trọng theo lịch backend"
                checked={settings.storage.cloudBackup}
                onChange={(cloudBackup) =>
                  patchSettings({ storage: { ...settings.storage, cloudBackup } })
                }
              />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <NumberField
                  label="Local quota MB"
                  value={settings.storage.localTotalMb}
                  onChange={(localTotalMb) =>
                    patchSettings({ storage: { ...settings.storage, localTotalMb } })
                  }
                />
                <NumberField
                  label="Cloud quota MB"
                  value={settings.storage.cloudTotalMb}
                  onChange={(cloudTotalMb) =>
                    patchSettings({ storage: { ...settings.storage, cloudTotalMb } })
                  }
                />
              </div>
            </div>
          </Panel>
        </Tabs.Content>

        <Tabs.Content value="ai" className="space-y-6">
          <Panel title="Mô hình phân tích AI">
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-muted/20 p-4">
                <div>
                  <div className="font-medium text-foreground">{settings.ai.version}</div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    Model đang chọn: {settings.ai.selectedModel}
                  </div>
                </div>
                <button
                  onClick={updateAiModel}
                  disabled={!runtime.aiModelUpdateAvailable || aiUpdating}
                  title={runtime.aiModelUpdateAvailable ? undefined : unavailableReason}
                  className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
                >
                  {aiUpdating ? "Đang cập nhật..." : "Kiểm tra & cập nhật"}
                </button>
              </div>
              <SelectField
                label="Chế độ AI"
                value={settings.ai.selectedModel}
                onChange={(selectedModel) => patchSettings({ ai: { ...settings.ai, selectedModel } })}
                options={["fast", "balanced", "high_accuracy"]}
              />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <NumberField
                  label="Độ tin cậy tối thiểu (%)"
                  value={settings.ai.minConfidence}
                  onChange={(minConfidence) => patchSettings({ ai: { ...settings.ai, minConfidence } })}
                />
                <NumberField
                  label="Độ nhiễu tối đa (dB)"
                  value={settings.ai.maxNoiseDb}
                  onChange={(maxNoiseDb) => patchSettings({ ai: { ...settings.ai, maxNoiseDb } })}
                />
                <NumberField
                  label="Timeout AI job (giây)"
                  value={settings.ai.timeoutSeconds}
                  onChange={(timeoutSeconds) =>
                    patchSettings({ ai: { ...settings.ai, timeoutSeconds } })
                  }
                />
              </div>
            </div>
          </Panel>

          <Panel title="Ống nghe điện tử">
            <div className="space-y-3">
              <NumberField
                label="Âm lượng mặc định"
                value={settings.stethoscope.volume}
                onChange={(volume) =>
                  patchSettings({ stethoscope: { ...settings.stethoscope, volume } })
                }
              />
              <NumberField
                label="Độ nhạy microphone"
                value={settings.stethoscope.sensitivity}
                onChange={(sensitivity) =>
                  patchSettings({ stethoscope: { ...settings.stethoscope, sensitivity } })
                }
              />
              <ToggleRow
                title="Khử nhiễu"
                description="Áp dụng noise cancellation khi thu âm"
                checked={settings.stethoscope.noiseCancel}
                onChange={(noiseCancel) =>
                  patchSettings({ stethoscope: { ...settings.stethoscope, noiseCancel } })
                }
              />
              <ToggleRow
                title="Tự kết nối thiết bị"
                description="App sẽ ưu tiên kết nối thiết bị đã ghép đôi"
                checked={settings.stethoscope.autoConnect}
                onChange={(autoConnect) =>
                  patchSettings({ stethoscope: { ...settings.stethoscope, autoConnect } })
                }
              />
            </div>
          </Panel>
        </Tabs.Content>

        <Tabs.Content value="notifications" className="space-y-6">
          <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
            Email gửi thật ưu tiên Brevo API qua HTTPS để chạy được trên Render Free. SMS/Zalo không có gói production miễn phí ổn định nên dùng webhook tự cấu hình hoặc để hướng phát triển.
          </div>

          <Panel title="Email thông báo / Brevo API">
            <RuntimeNotice
              ok={runtime.email.configured}
              okText={`Email provider ${emailProviderLabel} đã cấu hình${runtime.email.from ? `: ${runtime.email.from}` : ""}`}
              failText={emailReason}
            />
            <div className="mt-3 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Brevo API key và sender được lưu bằng env trên backend Render. Các ô SMTP bên dưới chỉ là thông tin hiển thị/fallback cho hosting cho phép SMTP.
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TextField
                label="SMTP Host fallback"
                value={settings.outbound.email.host}
                onChange={(host) =>
                  patchSettings({
                    outbound: { ...settings.outbound, email: { ...settings.outbound.email, host } },
                  })
                }
              />
              <NumberField
                label="SMTP Port fallback"
                value={settings.outbound.email.port}
                onChange={(port) =>
                  patchSettings({
                    outbound: { ...settings.outbound, email: { ...settings.outbound.email, port } },
                  })
                }
              />
              <TextField
                label="Email gửi đi hiển thị"
                type="email"
                value={settings.outbound.email.from}
                onChange={(from) =>
                  patchSettings({
                    outbound: { ...settings.outbound, email: { ...settings.outbound.email, from } },
                  })
                }
              />
              <SelectField
                label="Mã hóa SMTP fallback"
                value={settings.outbound.email.encryption}
                onChange={(encryption) =>
                  patchSettings({
                    outbound: {
                      ...settings.outbound,
                      email: { ...settings.outbound.email, encryption },
                    },
                  })
                }
                options={["tls", "ssl", "none"]}
              />
              <TextField
                label="Email nhận test"
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
              disabled={!runtime.email.configured || emailTesting || !settings.outbound.email.testRecipient.trim()}
              title={emailReason || undefined}
              className="mt-4 inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" /> {emailTesting ? "Đang gửi..." : "Gửi email kiểm tra"}
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
                    outbound: { ...settings.outbound, webhook: { ...settings.outbound.webhook, url } },
                  })
                }
              />
              <ToggleRow
                title="Sự kiện thiết bị offline"
                description="Kích hoạt khi thiết bị mất kết nối quá 30 phút"
                checked={settings.outbound.webhook.events.deviceOffline}
                onChange={(deviceOffline) =>
                  patchSettings({
                    outbound: {
                      ...settings.outbound,
                      webhook: {
                        ...settings.outbound.webhook,
                        events: { ...settings.outbound.webhook.events, deviceOffline },
                      },
                    },
                  })
                }
              />
              <ToggleRow
                title="Sự kiện AI job thất bại"
                description="Kích hoạt khi job AI không hoàn thành"
                checked={settings.outbound.webhook.events.aiJobFailed}
                onChange={(aiJobFailed) =>
                  patchSettings({
                    outbound: {
                      ...settings.outbound,
                      webhook: {
                        ...settings.outbound.webhook,
                        events: { ...settings.outbound.webhook.events, aiJobFailed },
                      },
                    },
                  })
                }
              />
              <ToggleRow
                title="Sự kiện bác sĩ đăng ký mới"
                description="Kích hoạt khi có bác sĩ cần duyệt"
                checked={settings.outbound.webhook.events.doctorRegistered}
                onChange={(doctorRegistered) =>
                  patchSettings({
                    outbound: {
                      ...settings.outbound,
                      webhook: {
                        ...settings.outbound.webhook,
                        events: { ...settings.outbound.webhook.events, doctorRegistered },
                      },
                    },
                  })
                }
              />
            </div>
          </Panel>

          <Panel title="SMS và Zalo OA qua webhook">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ChannelTester
                title="SMS"
                value={settings.outbound.sms.testRecipient}
                provider={settings.outbound.sms.provider}
                onProviderChange={(provider) =>
                  patchSettings({ outbound: { ...settings.outbound, sms: { ...settings.outbound.sms, provider } } })
                }
                onRecipientChange={(testRecipient) =>
                  patchSettings({
                    outbound: { ...settings.outbound, sms: { ...settings.outbound.sms, testRecipient } },
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
                    outbound: { ...settings.outbound, zalo: { ...settings.outbound.zalo, provider } },
                  })
                }
                onRecipientChange={(testRecipient) =>
                  patchSettings({
                    outbound: { ...settings.outbound, zalo: { ...settings.outbound.zalo, testRecipient } },
                  })
                }
                onTest={() => void testOutbound("zalo")}
                disabled={!webhookReady || outboundTesting !== null}
                loading={outboundTesting === "zalo"}
                reason={webhookReason}
              />
            </div>
          </Panel>

          <Panel title="Loại thông báo hệ thống">
            <div className="space-y-3">
              <ToggleRow
                title="Bật hệ thống thông báo"
                description="Cho phép backend tạo notification in-app"
                checked={settings.notifications.enabled}
                onChange={(enabled) =>
                  patchSettings({ notifications: { ...settings.notifications, enabled } })
                }
              />
              <ToggleRow
                title="Cảnh báo AI bất thường"
                description="Thông báo khi AI phát hiện kết quả cần chú ý"
                checked={settings.notifications.abnormalResults}
                onChange={(abnormalResults) =>
                  patchSettings({ notifications: { ...settings.notifications, abnormalResults } })
                }
              />
              <ToggleRow
                title="Thiết bị kết nối/offline"
                description="Thông báo tình trạng thiết bị"
                checked={settings.notifications.deviceConnection}
                onChange={(deviceConnection) =>
                  patchSettings({ notifications: { ...settings.notifications, deviceConnection } })
                }
              />
              <ToggleRow
                title="Tin nhắn và trao đổi"
                description="Thông báo tin nhắn giữa admin, bác sĩ và phòng khám"
                checked={settings.notifications.messages}
                onChange={(messages) =>
                  patchSettings({ notifications: { ...settings.notifications, messages } })
                }
              />
            </div>
          </Panel>
        </Tabs.Content>

        <Tabs.Content value="security" className="space-y-6">
          <Panel title="Chính sách phiên đăng nhập">
            <div className="space-y-4">
              <NumberField
                label="Thời gian hết phiên (phút)"
                value={settings.securityPolicy.sessionTimeoutMinutes}
                onChange={(sessionTimeoutMinutes) =>
                  patchSettings({
                    securityPolicy: { ...settings.securityPolicy, sessionTimeoutMinutes },
                  })
                }
              />
              <NumberField
                label="Số thiết bị đăng nhập tối đa / tài khoản"
                value={settings.securityPolicy.maxSessionsPerUser}
                onChange={(maxSessionsPerUser) =>
                  patchSettings({ securityPolicy: { ...settings.securityPolicy, maxSessionsPerUser } })
                }
              />
              <ToggleRow
                title="Bắt buộc 2FA cho admin"
                description={runtime.twoFactorAvailable ? "Áp dụng cho mọi tài khoản admin" : unavailableReason}
                checked={settings.securityPolicy.requireAdmin2fa}
                disabled={!runtime.twoFactorAvailable}
                onChange={(requireAdmin2fa) =>
                  patchSettings({ securityPolicy: { ...settings.securityPolicy, requireAdmin2fa } })
                }
              />
            </div>
          </Panel>

          <Panel title="Chính sách mật khẩu">
            <div className="space-y-3">
              <NumberField
                label="Độ dài tối thiểu"
                value={settings.securityPolicy.passwordRules.minLength}
                onChange={(minLength) =>
                  patchSettings({
                    securityPolicy: {
                      ...settings.securityPolicy,
                      passwordRules: { ...settings.securityPolicy.passwordRules, minLength },
                    },
                  })
                }
              />
              <ToggleRow
                title="Bắt buộc chữ hoa và chữ thường"
                description="Áp dụng cho luồng đổi mật khẩu backend"
                checked={settings.securityPolicy.passwordRules.requireMixedCase}
                onChange={(requireMixedCase) =>
                  patchSettings({
                    securityPolicy: {
                      ...settings.securityPolicy,
                      passwordRules: { ...settings.securityPolicy.passwordRules, requireMixedCase },
                    },
                  })
                }
              />
              <ToggleRow
                title="Bắt buộc ít nhất 1 số"
                description="Áp dụng cho luồng đổi mật khẩu backend"
                checked={settings.securityPolicy.passwordRules.requireNumber}
                onChange={(requireNumber) =>
                  patchSettings({
                    securityPolicy: {
                      ...settings.securityPolicy,
                      passwordRules: { ...settings.securityPolicy.passwordRules, requireNumber },
                    },
                  })
                }
              />
              <ToggleRow
                title="Bắt buộc ký tự đặc biệt"
                description="Áp dụng cho luồng đổi mật khẩu backend"
                checked={settings.securityPolicy.passwordRules.requireSpecial}
                onChange={(requireSpecial) =>
                  patchSettings({
                    securityPolicy: {
                      ...settings.securityPolicy,
                      passwordRules: { ...settings.securityPolicy.passwordRules, requireSpecial },
                    },
                  })
                }
              />
              <NumberField
                label="Hết hạn mật khẩu sau số ngày (0 = tắt)"
                value={settings.securityPolicy.passwordRules.expireDays}
                onChange={(expireDays) =>
                  patchSettings({
                    securityPolicy: {
                      ...settings.securityPolicy,
                      passwordRules: { ...settings.securityPolicy.passwordRules, expireDays },
                    },
                  })
                }
              />
            </div>
          </Panel>

          <Panel title="IP whitelist, retention và rate limit">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Danh sách IP cho phép</label>
                <textarea
                  value={settings.securityPolicy.ipWhitelist}
                  onChange={(event) =>
                    patchSettings({
                      securityPolicy: { ...settings.securityPolicy, ipWhitelist: event.target.value },
                    })
                  }
                  rows={3}
                  className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-ring"
                  placeholder="Mỗi dòng một IP hoặc CIDR"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <NumberField
                  label="Data retention (ngày)"
                  value={settings.securityPolicy.retentionDays}
                  onChange={(retentionDays) =>
                    patchSettings({ securityPolicy: { ...settings.securityPolicy, retentionDays } })
                  }
                />
                <NumberField
                  label="Rate limit / phút"
                  value={settings.securityPolicy.rateLimitPerMinute}
                  onChange={(rateLimitPerMinute) =>
                    patchSettings({
                      securityPolicy: { ...settings.securityPolicy, rateLimitPerMinute },
                    })
                  }
                />
              </div>
              <ToggleRow
                title="Mã hóa dữ liệu nhạy cảm"
                description="Giữ bật để hiển thị cảnh báo vận hành"
                checked={settings.privacy.encryption}
                onChange={(encryption) => patchSettings({ privacy: { ...settings.privacy, encryption } })}
              />
            </div>
          </Panel>

          <Panel title="Backup và API keys">
            <div className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/20 p-4">
                <div className="font-medium text-sm">Backup/restore</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Kiểm tra trạng thái dữ liệu, storage và phạm vi vận hành hiện tại.
                  {settings.securityPolicy.lastBackupCheckAt
                    ? ` Lần kiểm tra gần nhất: ${settings.securityPolicy.lastBackupCheckAt}.`
                    : ""}
                </div>
                <button
                  onClick={runBackupCheck}
                  disabled={!runtime.backupTestAvailable || backupChecking}
                  title={runtime.backupTestAvailable ? undefined : unavailableReason}
                  className="mt-3 rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                >
                  {backupChecking ? "Đang kiểm tra..." : "Kiểm tra backup"}
                </button>
              </div>
              {settings.securityPolicy.apiKeys.map((apiKey, idx) => {
                const isRevoked = apiKey.status === "revoked";
                return (
                  <div
                    key={apiKey.id}
                    className={`flex items-center justify-between gap-4 rounded-lg border p-4 ${
                      isRevoked ? "border-border bg-muted/10 opacity-70" : "border-border bg-muted/20"
                    }`}
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        <span>{apiKey.name}</span>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                          {apiKey.status}
                        </span>
                      </div>
                      <div className="mt-1 font-mono text-xs text-muted-foreground">{apiKey.keyPreview}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        Scope: {apiKey.scope || "workspace"}
                        {apiKey.lastRotatedAt ? ` • Rotate: ${apiKey.lastRotatedAt}` : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => void handleCopy(`key-${idx}`, apiKey.keyPreview)}
                        className="rounded border border-border p-1.5 hover:bg-muted"
                        title="Sao chép"
                      >
                        {copied === `key-${idx}` ? (
                          <CheckCircle2 className="h-4 w-4 text-success" />
                        ) : (
                          <Copy className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>
                      <button
                        onClick={() => void rotateApiKey(apiKey.id)}
                        disabled={!runtime.apiKeyRotationAvailable || isRevoked || apiKeyAction !== null}
                        title="Rotate API key"
                        className="rounded border border-border p-1.5 hover:bg-muted disabled:opacity-50"
                      >
                        <RefreshCw className="h-4 w-4 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => void revokeApiKey(apiKey.id)}
                        disabled={isRevoked || apiKeyAction !== null}
                        title="Thu hồi API key"
                        className="rounded border border-destructive/30 p-1.5 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                      >
                        <AlertOctagon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
              <button
                onClick={createApiKey}
                disabled={!runtime.apiKeyRotationAvailable || apiKeyAction !== null}
                title={runtime.apiKeyRotationAvailable ? undefined : unavailableReason}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                <KeyRound className="w-4 h-4" /> {apiKeyAction === "create" ? "Đang tạo..." : "Tạo API Key mới"}
              </button>
            </div>
          </Panel>
        </Tabs.Content>

        <Tabs.Content value="deployment" className="space-y-6">
          <Panel title="Sẵn sàng triển khai thực tế">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm text-muted-foreground">
                  Checklist này kiểm tra cấu hình hạ tầng qua backend, chỉ hiển thị tên biến môi trường và trạng thái, không hiển thị secret.
                </div>
                {readiness ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <StatusBadge status={readiness.ok ? "pass" : "fail"} label={readiness.ok ? "Đủ cấu hình bắt buộc" : "Còn thiếu cấu hình bắt buộc"} />
                    <StatusBadge status="pass" label={`Pass ${readiness.counts?.pass || 0}`} />
                    <StatusBadge status="warn" label={`Warn ${readiness.counts?.warn || 0}`} />
                    <StatusBadge status="fail" label={`Fail ${readiness.counts?.fail || 0}`} />
                    <StatusBadge status="manual" label={`Manual ${readiness.counts?.manual || 0}`} />
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
                Tài khoản hiện tại không có quyền xem checklist hạ tầng toàn hệ thống hoặc backend chưa trả dữ liệu checklist.
              </div>
            ) : null}

            {readiness ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <ReadinessMeta label="Auth mode" value={readiness.environment?.authMode || "--"} />
                  <ReadinessMeta label="Data backend" value={readiness.environment?.dataBackend || "--"} />
                  <ReadinessMeta label="Storage" value={readiness.environment?.storageProvider || "--"} />
                  <ReadinessMeta label="Public API" value={readiness.environment?.publicBackendUrl || "--"} mono />
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
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${statusClass(status)}`}>
      {label}
    </span>
  );
}

function ReadinessMeta({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 break-all text-sm font-medium text-foreground ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}

function ReadinessRow({ item }: { item: SmartHealthReadinessItem }) {
  const label =
    item.status === "pass" ? "PASS" : item.status === "fail" ? "FAIL" : item.status === "manual" ? "MANUAL" : "WARN";
  return (
    <div className="space-y-2 px-4 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-sm font-medium text-foreground">{item.label}</div>
          {item.detail ? <div className="mt-1 text-xs text-muted-foreground">{item.detail}</div> : null}
        </div>
        <StatusBadge status={item.status} label={label} />
      </div>
      {item.env?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {item.env.map((name) => (
            <code key={name} className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
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

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-ring"
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

function ToggleRow({
  title,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{description}</div>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} aria-label={title} />
    </div>
  );
}

function RuntimeNotice({ ok, okText, failText }: { ok: boolean; okText: string; failText: string }) {
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
      <SelectField label="Provider" value={provider} onChange={onProviderChange} options={["webhook"]} />
      <TextField label="Người nhận test" value={value} onChange={onRecipientChange} />
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
