import { smartHealthApi } from "./smart-health-api";
import type { ExportSheet } from "./export-utils";

export type DataKey = "measurements" | "patients" | "doctors" | "clinics" | "devices";

export const DATA_KEYS: DataKey[] = ["measurements", "patients", "doctors", "clinics", "devices"];

export const DATA_LABELS: Record<DataKey, string> = {
  measurements: "Lượt đo",
  patients: "Bệnh nhân",
  doctors: "Bác sĩ",
  clinics: "Phòng khám",
  devices: "Thiết bị",
};

export function isDataKey(value: string): value is DataKey {
  return (DATA_KEYS as string[]).includes(value);
}

function text(value: unknown, fallback = "--") {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  return String(value);
}

function percent(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return "--";
  }
  return `${Math.round(number <= 1 ? number * 100 : number)}%`;
}

function formatDateTime(value?: string | null) {
  if (!value) {
    return "--";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function statusLabel(value?: string) {
  switch ((value || "").toLowerCase()) {
    case "active":
    case "approved":
    case "completed":
    case "connected":
    case "online":
      return "Hoạt động";
    case "locked":
    case "inactive":
      return "Tạm khóa";
    case "pending":
    case "processing":
    case "queued":
      return "Đang xử lý";
    case "failed":
    case "error":
      return "Thất bại";
    case "recording":
      return "Đang ghi";
    case "uploading":
      return "Đang tải lên";
    default:
      return value || "--";
  }
}

export async function buildLiveExportSheets(keys: DataKey[]) {
  const uniqueKeys = Array.from(new Set(keys));
  const entries = await Promise.all(
    uniqueKeys.map(async (key) => [key, await buildSheet(key)] as const),
  );
  return Object.fromEntries(entries) as Partial<Record<DataKey, ExportSheet>>;
}

async function buildSheet(key: DataKey): Promise<ExportSheet> {
  switch (key) {
    case "measurements": {
      const { scans } = await smartHealthApi.listScans({ limit: 500 });
      return {
        name: DATA_LABELS.measurements,
        headers: [
          "Scan ID",
          "Bệnh nhân",
          "Thiết bị",
          "Vùng nghe",
          "Trạng thái",
          "Độ tin cậy",
          "Thời gian",
        ],
        rows: scans.map((scan) => [
          scan.id,
          scan.patient?.name || scan.patientId || "--",
          scan.deviceId || "--",
          [scan.mode, scan.bodySite].filter(Boolean).join(" / ") || "--",
          statusLabel(scan.status),
          percent(scan.aiConfidence),
          formatDateTime(scan.startedAt || scan.createdAt),
        ]),
        align: ["left", "left", "left", "left", "center", "right", "left"],
      };
    }
    case "patients": {
      const { patients } = await smartHealthApi.listPatients();
      return {
        name: DATA_LABELS.patients,
        headers: [
          "Mã bệnh nhân",
          "Họ tên",
          "Giới tính",
          "Tuổi",
          "Số điện thoại",
          "Phòng khám",
          "Lượt đo",
          "Lần đo gần nhất",
        ],
        rows: patients.map((patient) => [
          patient.patientCode || patient.id,
          text(patient.name),
          text(patient.gender),
          Number.isFinite(Number(patient.age)) ? Number(patient.age) : "--",
          text(patient.phone),
          text(patient.organizationId, "Smart Health"),
          patient.scanCount || 0,
          formatDateTime(patient.lastScanAt || patient.updatedAt || patient.createdAt),
        ]),
        align: ["left", "left", "center", "right", "left", "left", "right", "left"],
      };
    }
    case "doctors": {
      const { doctors } = await smartHealthApi.listApprovedDoctors();
      return {
        name: DATA_LABELS.doctors,
        headers: [
          "UID",
          "Họ tên",
          "Email",
          "Số điện thoại",
          "Chuyên khoa",
          "Phòng khám",
          "Trạng thái",
          "Ngày duyệt",
        ],
        rows: doctors.map((doctor) => [
          doctor.firebaseUid || doctor.id,
          doctor.name || doctor.email || "--",
          text(doctor.email),
          text(doctor.phone),
          text(doctor.department, "Chưa cung cấp"),
          text(doctor.hospital || doctor.organizationId, "Chưa xác định"),
          statusLabel(doctor.accountStatus || doctor.roleRequestStatus || doctor.status),
          formatDateTime(doctor.roleApprovedAt || doctor.approvedAt || doctor.updatedAt),
        ]),
        align: ["left", "left", "left", "left", "left", "left", "center", "left"],
      };
    }
    case "clinics": {
      const { clinics } = await smartHealthApi.listClinics();
      return {
        name: DATA_LABELS.clinics,
        headers: [
          "Mã phòng khám",
          "Tên phòng khám",
          "Loại",
          "Địa chỉ",
          "Số bác sĩ",
          "Số bệnh nhân",
          "Số thiết bị",
          "Trạng thái",
        ],
        rows: clinics.map((clinic) => [
          clinic.id,
          clinic.name,
          text(clinic.type),
          text(clinic.address),
          clinic.doctorCount || 0,
          clinic.patientCount || 0,
          clinic.deviceCount || 0,
          statusLabel(clinic.status),
        ]),
        align: ["left", "left", "left", "left", "right", "right", "right", "center"],
      };
    }
    case "devices": {
      const { devices } = await smartHealthApi.listDevices();
      return {
        name: DATA_LABELS.devices,
        headers: [
          "Device ID",
          "Tên thiết bị",
          "Phòng khám",
          "Người dùng",
          "Kết nối",
          "Pin",
          "Trạng thái",
          "Heartbeat cuối",
        ],
        rows: devices.map((device) => [
          device.id,
          text(device.name, "Ống nghe Smart Health"),
          text(device.organizationId, "Smart Health"),
          text(device.pairedUserId, "Chưa ghép người dùng"),
          text(device.connectionMethod, "Chưa xác định"),
          Number.isFinite(Number(device.battery)) ? `${Math.round(Number(device.battery))}%` : "--",
          device.connected ? "Đang hoạt động" : statusLabel(device.status || "offline"),
          formatDateTime(device.lastSeenAt || device.updatedAt),
        ]),
        align: ["left", "left", "left", "left", "left", "right", "center", "left"],
      };
    }
  }
}

export function buildLiveKpis(key: DataKey, sheet: ExportSheet) {
  const rows = sheet.rows;
  const count = rows.length;
  switch (key) {
    case "measurements":
      return [
        { label: "Tổng lượt đo", value: count.toLocaleString("vi-VN") },
        {
          label: "Hoàn tất",
          value: String(rows.filter((row) => String(row[4]).includes("Hoạt động")).length),
        },
        {
          label: "Thất bại",
          value: String(rows.filter((row) => String(row[4]).includes("Thất bại")).length),
        },
        { label: "Thiết bị", value: String(new Set(rows.map((row) => row[2])).size) },
      ];
    case "patients":
      return [
        { label: "Tổng bệnh nhân", value: count.toLocaleString("vi-VN") },
        { label: "Có lượt đo", value: String(rows.filter((row) => Number(row[6]) > 0).length) },
        { label: "Phòng khám", value: String(new Set(rows.map((row) => row[5])).size) },
        { label: "Dữ liệu", value: "Backend" },
      ];
    case "doctors":
      return [
        { label: "Tổng bác sĩ", value: count.toLocaleString("vi-VN") },
        {
          label: "Đã duyệt",
          value: String(rows.filter((row) => String(row[6]).includes("Hoạt động")).length),
        },
        {
          label: "Chưa có chuyên khoa",
          value: String(rows.filter((row) => String(row[4]).includes("Chưa")).length),
        },
        { label: "Dữ liệu", value: "Backend" },
      ];
    case "clinics":
      return [
        { label: "Tổng phòng khám", value: count.toLocaleString("vi-VN") },
        {
          label: "Bác sĩ",
          value: rows.reduce((sum, row) => sum + Number(row[4] || 0), 0).toLocaleString("vi-VN"),
        },
        {
          label: "Bệnh nhân",
          value: rows.reduce((sum, row) => sum + Number(row[5] || 0), 0).toLocaleString("vi-VN"),
        },
        {
          label: "Thiết bị",
          value: rows.reduce((sum, row) => sum + Number(row[6] || 0), 0).toLocaleString("vi-VN"),
        },
      ];
    case "devices":
      return [
        { label: "Tổng thiết bị", value: count.toLocaleString("vi-VN") },
        {
          label: "Đang hoạt động",
          value: String(rows.filter((row) => String(row[6]).includes("Đang")).length),
        },
        {
          label: "Mất kết nối",
          value: String(
            rows.filter(
              (row) => String(row[6]).includes("offline") || String(row[6]).includes("Offline"),
            ).length,
          ),
        },
        { label: "Phòng khám", value: String(new Set(rows.map((row) => row[2])).size) },
      ];
  }
}
