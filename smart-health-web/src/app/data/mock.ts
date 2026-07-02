export type PatientStatus =
  | "active"
  | "pending_consent"
  | "consent_accepted"
  | "consent_revoked"
  | "paused";
export type DeviceStatus =
  | "online"
  | "offline"
  | "measuring"
  | "low_battery"
  | "unassigned"
  | "revoked";
export type ConsentStatus = "pending" | "accepted" | "revoked" | "expired";
export type AlertSeverity = "high" | "medium" | "low";
export type AlertType =
  | "device_offline"
  | "low_battery"
  | "scan_error"
  | "scan_review"
  | "consent_expired"
  | "no_measurement"
  | "sync_error";
export type ScanStatus = "new" | "processing" | "reviewed" | "needs_review" | "error";
export type StaffRole = "doctor" | "nurse" | "technician" | "clinic_manager";
export type InviteStatus = "pending" | "accepted" | "expired" | "revoked";

export interface Patient {
  id: string;
  name: string;
  recordCode: string;
  age: number;
  gender: "male" | "female";
  phone: string;
  email?: string;
  assignedDoctor: string;
  deviceId?: string;
  lastScan?: string;
  consentStatus: ConsentStatus;
  alertCount: number;
  trackingStatus: PatientStatus;
  joinedAt: string;
  dob: string;
}

export interface Device {
  id: string;
  serialId: string;
  assignedPatient?: string;
  assignedPatientId?: string;
  status: DeviceStatus;
  batteryPercent: number;
  firmware: string;
  workspace: string;
  lastSeen: string;
  alertCount: number;
  rssi?: number;
}

export interface Scan {
  id: string;
  patientId: string;
  patientName: string;
  deviceId: string;
  timestamp: string;
  location: string;
  status: ScanStatus;
  aiResult?: string;
  aiConfidence?: number;
  aiSummary?: string;
  alertLevel?: AlertSeverity;
  reviewedBy?: string;
  doctorNote?: string;
}

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  patientId?: string;
  patientName?: string;
  deviceId?: string;
  createdAt: string;
  status: "new" | "processing" | "resolved" | "ignored";
  ownerId?: string;
  ownerName?: string;
  ageMinutes: number;
}

export interface Staff {
  id: string;
  name: string;
  role: StaffRole;
  specialty?: string;
  email: string;
  phone: string;
  patientCount: number;
  inviteStatus: "active" | "pending" | "suspended";
  lastActive: string;
}

export interface Invitation {
  id: string;
  patientId: string;
  patientName: string;
  channel: "email" | "phone";
  channelValue: string;
  sentBy: string;
  scope: string[];
  status: InviteStatus;
  sentAt: string;
  expiresAt: string;
}

export interface Notification {
  id: string;
  type:
    | "scan_new"
    | "device_alert"
    | "consent"
    | "invitation"
    | "patient_assigned"
    | "device_offline"
    | "low_battery";
  title: string;
  description: string;
  read: boolean;
  createdAt: string;
  patientId?: string;
  deviceId?: string;
  scanId?: string;
}

export const mockPatients: Patient[] = [
  {
    id: "p001",
    name: "Nguyễn Văn An",
    recordCode: "BN-2406-001",
    age: 58,
    gender: "male",
    phone: "0901234567",
    email: "nguyenvanan@email.com",
    assignedDoctor: "BS. Nguyễn Minh Anh",
    deviceId: "SHS-2406-001",
    lastScan: "2026-06-12T08:30:00",
    consentStatus: "accepted",
    alertCount: 2,
    trackingStatus: "active",
    joinedAt: "2026-04-10",
    dob: "1968-03-15",
  },
  {
    id: "p002",
    name: "Trần Minh Châu",
    recordCode: "BN-2406-002",
    age: 45,
    gender: "female",
    phone: "0912345678",
    email: "tranminhchau@email.com",
    assignedDoctor: "ThS.BS. Trần Quốc Huy",
    deviceId: "SHS-2406-014",
    lastScan: "2026-06-11T14:20:00",
    consentStatus: "accepted",
    alertCount: 0,
    trackingStatus: "active",
    joinedAt: "2026-05-02",
    dob: "1981-07-22",
  },
  {
    id: "p003",
    name: "Lê Hoàng Phúc",
    recordCode: "BN-2406-003",
    age: 72,
    gender: "male",
    phone: "0923456789",
    assignedDoctor: "BS. Lê Thu Hà",
    deviceId: "SHS-2501-008",
    lastScan: "2026-06-10T09:15:00",
    consentStatus: "pending",
    alertCount: 1,
    trackingStatus: "pending_consent",
    joinedAt: "2026-06-08",
    dob: "1954-11-05",
  },
  {
    id: "p004",
    name: "Phạm Ngọc Mai",
    recordCode: "BN-2406-004",
    age: 35,
    gender: "female",
    phone: "0934567890",
    email: "phamngocmai@email.com",
    assignedDoctor: "BS. Nguyễn Minh Anh",
    consentStatus: "accepted",
    alertCount: 0,
    trackingStatus: "active",
    joinedAt: "2026-05-20",
    dob: "1991-02-14",
  },
  {
    id: "p005",
    name: "Đỗ Quang Huy",
    recordCode: "BN-2406-005",
    age: 63,
    gender: "male",
    phone: "0945678901",
    assignedDoctor: "ThS.BS. Trần Quốc Huy",
    consentStatus: "revoked",
    alertCount: 0,
    trackingStatus: "consent_revoked",
    joinedAt: "2026-03-15",
    dob: "1963-09-28",
  },
];

export const mockDevices: Device[] = [
  {
    id: "d001",
    serialId: "SHS-2406-001",
    assignedPatient: "Nguyễn Văn An",
    assignedPatientId: "p001",
    status: "online",
    batteryPercent: 78,
    firmware: "v2.4.1",
    workspace: "Phòng khám Tim mạch An Khang",
    lastSeen: "2026-06-12T10:45:00",
    alertCount: 0,
    rssi: -62,
  },
  {
    id: "d002",
    serialId: "SHS-2406-014",
    assignedPatient: "Trần Minh Châu",
    assignedPatientId: "p002",
    status: "offline",
    batteryPercent: 12,
    firmware: "v2.4.1",
    workspace: "Phòng khám Tim mạch An Khang",
    lastSeen: "2026-06-12T08:33:00",
    alertCount: 2,
  },
  {
    id: "d003",
    serialId: "SHS-2501-008",
    assignedPatient: "Lê Hoàng Phúc",
    assignedPatientId: "p003",
    status: "measuring",
    batteryPercent: 65,
    firmware: "v2.5.0",
    workspace: "Phòng khám Tim mạch An Khang",
    lastSeen: "2026-06-12T10:50:00",
    alertCount: 0,
    rssi: -55,
  },
];

export const mockScans: Scan[] = [
  {
    id: "s001",
    patientId: "p001",
    patientName: "Nguyễn Văn An",
    deviceId: "SHS-2406-001",
    timestamp: "2026-06-12T08:30:00",
    location: "Vị trí 1 - Đỉnh phổi phải",
    status: "needs_review",
    aiResult: "Phát hiện tiếng rít nhẹ",
    aiConfidence: 0.82,
    aiSummary:
      "Hệ thống hỗ trợ phân tích phát hiện âm thanh bất thường nhẹ ở vùng đỉnh phổi phải. Đề nghị bác sĩ xem xét thêm.",
    alertLevel: "medium",
  },
  {
    id: "s002",
    patientId: "p002",
    patientName: "Trần Minh Châu",
    deviceId: "SHS-2406-014",
    timestamp: "2026-06-11T14:20:00",
    location: "Vị trí 2 - Phổi trái",
    status: "reviewed",
    aiResult: "Bình thường",
    aiConfidence: 0.94,
    aiSummary: "Âm thanh phổi trong giới hạn bình thường. Không phát hiện dấu hiệu bất thường.",
    alertLevel: "low",
    reviewedBy: "ThS.BS. Trần Quốc Huy",
    doctorNote: "Kết quả ổn. Hẹn đo lại sau 1 tuần.",
  },
  {
    id: "s003",
    patientId: "p003",
    patientName: "Lê Hoàng Phúc",
    deviceId: "SHS-2501-008",
    timestamp: "2026-06-10T09:15:00",
    location: "Vị trí 3 - Tim",
    status: "new",
    aiResult: "Cần xem lại",
    aiConfidence: 0.71,
    aiSummary: "Hệ thống phát hiện nhịp tim không đều. Cần bác sĩ xem lại để xác nhận.",
    alertLevel: "high",
  },
];

export const mockAlerts: Alert[] = [
  {
    id: "a001",
    type: "device_offline",
    severity: "high",
    title: "Thiết bị offline",
    description: "Thiết bị SHS-2406-014 đã offline 12 phút.",
    patientId: "p002",
    patientName: "Trần Minh Châu",
    deviceId: "SHS-2406-014",
    createdAt: "2026-06-12T10:33:00",
    status: "new",
    ownerId: "doc002",
    ownerName: "ThS.BS. Trần Quốc Huy",
    ageMinutes: 12,
  },
  {
    id: "a002",
    type: "low_battery",
    severity: "medium",
    title: "Pin yếu",
    description: "Thiết bị SHS-2406-014 còn 12% pin. Cần sạc sớm.",
    patientId: "p002",
    patientName: "Trần Minh Châu",
    deviceId: "SHS-2406-014",
    createdAt: "2026-06-12T09:00:00",
    status: "new",
    ownerId: "doc002",
    ownerName: "ThS.BS. Trần Quốc Huy",
    ageMinutes: 105,
  },
  {
    id: "a003",
    type: "scan_review",
    severity: "high",
    title: "Scan cần xem lại",
    description: "Lượt đo của Lê Hoàng Phúc có dấu hiệu cần bác sĩ xem lại.",
    patientId: "p003",
    patientName: "Lê Hoàng Phúc",
    deviceId: "SHS-2501-008",
    createdAt: "2026-06-10T09:15:00",
    status: "new",
    ownerId: "doc003",
    ownerName: "BS. Lê Thu Hà",
    ageMinutes: 1535,
  },
  {
    id: "a004",
    type: "no_measurement",
    severity: "low",
    title: "Lâu chưa đo",
    description: "Bệnh nhân Nguyễn Văn An chưa đo trong 2 ngày.",
    patientId: "p001",
    patientName: "Nguyễn Văn An",
    createdAt: "2026-06-12T07:00:00",
    status: "new",
    ownerId: "doc001",
    ownerName: "BS. Nguyễn Minh Anh",
    ageMinutes: 225,
  },
];

export const mockStaff: Staff[] = [
  {
    id: "doc001",
    name: "BS. Nguyễn Minh Anh",
    role: "doctor",
    specialty: "Tim mạch",
    email: "minhanh@ankhang.vn",
    phone: "0901111111",
    patientCount: 12,
    inviteStatus: "active",
    lastActive: "2026-06-12T10:30:00",
  },
  {
    id: "doc002",
    name: "ThS.BS. Trần Quốc Huy",
    role: "doctor",
    specialty: "Hô hấp",
    email: "quochuy@ankhang.vn",
    phone: "0902222222",
    patientCount: 8,
    inviteStatus: "active",
    lastActive: "2026-06-12T09:15:00",
  },
  {
    id: "doc003",
    name: "BS. Lê Thu Hà",
    role: "doctor",
    specialty: "Nội tổng quát",
    email: "thuha@ankhang.vn",
    phone: "0903333333",
    patientCount: 5,
    inviteStatus: "active",
    lastActive: "2026-06-11T16:00:00",
  },
  {
    id: "nur001",
    name: "ĐD. Phạm Thị Linh",
    role: "nurse",
    email: "thilinh@ankhang.vn",
    phone: "0904444444",
    patientCount: 0,
    inviteStatus: "active",
    lastActive: "2026-06-12T10:00:00",
  },
  {
    id: "mgr001",
    name: "Nguyễn Hoàng Nam",
    role: "clinic_manager",
    email: "hoangnam@ankhang.vn",
    phone: "0905555555",
    patientCount: 0,
    inviteStatus: "active",
    lastActive: "2026-06-12T08:00:00",
  },
];

export const mockInvitations: Invitation[] = [
  {
    id: "inv001",
    patientId: "p003",
    patientName: "Lê Hoàng Phúc",
    channel: "phone",
    channelValue: "0923456789",
    sentBy: "BS. Lê Thu Hà",
    scope: ["Xem hồ sơ", "Xem lượt đo", "Live monitoring"],
    status: "pending",
    sentAt: "2026-06-10T08:00:00",
    expiresAt: "2026-06-17T08:00:00",
  },
  {
    id: "inv002",
    patientId: "p001",
    patientName: "Nguyễn Văn An",
    channel: "email",
    channelValue: "nguyenvanan@email.com",
    sentBy: "BS. Nguyễn Minh Anh",
    scope: ["Xem hồ sơ", "Xem lượt đo", "Live monitoring", "Ghi chú"],
    status: "accepted",
    sentAt: "2026-04-10T10:00:00",
    expiresAt: "2027-04-10T10:00:00",
  },
  {
    id: "inv003",
    patientId: "p005",
    patientName: "Đỗ Quang Huy",
    channel: "phone",
    channelValue: "0945678901",
    sentBy: "ThS.BS. Trần Quốc Huy",
    scope: ["Xem hồ sơ", "Xem lượt đo"],
    status: "revoked",
    sentAt: "2026-03-15T09:00:00",
    expiresAt: "2027-03-15T09:00:00",
  },
];

export const mockNotifications: Notification[] = [
  {
    id: "n001",
    type: "device_offline",
    title: "Thiết bị offline",
    description: "SHS-2406-014 - Trần Minh Châu đã offline 12 phút",
    read: false,
    createdAt: "2026-06-12T10:33:00",
    patientId: "p002",
    deviceId: "SHS-2406-014",
  },
  {
    id: "n002",
    type: "scan_new",
    title: "Scan mới cần xem",
    description: "Lê Hoàng Phúc có lượt đo mới cần bác sĩ xem lại",
    read: false,
    createdAt: "2026-06-10T09:15:00",
    patientId: "p003",
    scanId: "s003",
  },
  {
    id: "n003",
    type: "consent",
    title: "Bệnh nhân chấp nhận quyền theo dõi",
    description: "Nguyễn Văn An đã chấp nhận lời mời theo dõi",
    read: true,
    createdAt: "2026-04-10T11:30:00",
    patientId: "p001",
  },
  {
    id: "n004",
    type: "low_battery",
    title: "Pin yếu",
    description: "SHS-2406-014 còn 12% pin",
    read: false,
    createdAt: "2026-06-12T09:00:00",
    deviceId: "SHS-2406-014",
  },
];

export const mockAuditLog = [
  {
    id: "log001",
    action: "Mời bệnh nhân",
    actor: "BS. Lê Thu Hà",
    target: "Lê Hoàng Phúc",
    createdAt: "2026-06-10T08:00:00",
    detail: "Gửi lời mời consent qua SMS",
  },
  {
    id: "log002",
    action: "Gán thiết bị",
    actor: "ĐD. Phạm Thị Linh",
    target: "SHS-2501-008 → Lê Hoàng Phúc",
    createdAt: "2026-06-09T14:00:00",
    detail: "Gán thiết bị cho bệnh nhân",
  },
  {
    id: "log003",
    action: "Bệnh nhân chấp nhận consent",
    actor: "Trần Minh Châu",
    target: "ThS.BS. Trần Quốc Huy",
    createdAt: "2026-05-02T09:00:00",
    detail: "Chấp nhận qua Android app",
  },
  {
    id: "log004",
    action: "Mời nhân sự",
    actor: "Nguyễn Hoàng Nam",
    target: "BS. Lê Thu Hà",
    createdAt: "2026-04-01T10:00:00",
    detail: "Mời với vai trò Bác sĩ",
  },
  {
    id: "log005",
    action: "Thu hồi consent",
    actor: "Đỗ Quang Huy",
    target: "ThS.BS. Trần Quốc Huy",
    createdAt: "2026-06-01T15:00:00",
    detail: "Bệnh nhân thu hồi quyền theo dõi qua app",
  },
];
