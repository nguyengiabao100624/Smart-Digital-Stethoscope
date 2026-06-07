import React, { useState } from "react";
import {
  Plus,
  FileText,
  Database,
  Package,
  Bell,
  Wifi,
  Building2,
  UserPlus,
  Users,
  Stethoscope,
  Download,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { AddClinicDialog } from "./dialogs/AddClinicDialog";
import { AddDoctorDialog } from "./dialogs/AddDoctorDialog";
import { AddPatientDialog } from "./dialogs/AddPatientDialog";
import { AddDeviceDialog } from "./dialogs/AddDeviceDialog";
import { ActivateDeviceDialog } from "./dialogs/ActivateDeviceDialog";
import { CreateAdminAccountDialog } from "./dialogs/CreateAdminAccountDialog";
import { ExportReportDialog } from "./dialogs/ExportReportDialog";
import { ExportDataDialog } from "./dialogs/ExportDataDialog";
import { CreatePackageDialog } from "./dialogs/CreatePackageDialog";
import { NotificationSettingsDialog } from "./dialogs/NotificationSettingsDialog";
import { useAdminAccess } from "./AdminAccessContext";
import {
  DEVICE_MANAGE_CAPABILITIES,
  NOTIFICATION_MANAGE_CAPABILITIES,
  PACKAGE_MANAGE_CAPABILITIES,
  PATIENT_MANAGE_CAPABILITIES,
  PLATFORM_USER_MANAGE_CAPABILITIES,
  REPORT_EXPORT_CAPABILITIES,
  STAFF_MANAGE_CAPABILITIES,
  STORAGE_MANAGE_CAPABILITIES,
  WORKSPACE_MANAGE_CAPABILITIES,
} from "./action-permissions";

export function AdminActions() {
  const [openDialog, setOpenDialog] = useState<string | null>(null);
  const { accessCheckComplete, hasAnyCapability } = useAdminAccess();

  const actions = [
    {
      id: "add-clinic",
      title: "Thêm phòng khám",
      description: "Đăng ký cơ sở y tế mới",
      icon: Building2,
      color: "bg-blue-500",
      capabilities: WORKSPACE_MANAGE_CAPABILITIES,
      category: "Quản lý",
    },
    {
      id: "add-doctor",
      title: "Thêm bác sĩ",
      description: "Tạo tài khoản bác sĩ mới",
      icon: UserPlus,
      color: "bg-green-500",
      capabilities: STAFF_MANAGE_CAPABILITIES,
      category: "Quản lý",
    },
    {
      id: "create-admin-account",
      title: "Tạo tài khoản admin",
      description: "Tạo Firebase user và cấp quyền quản trị",
      icon: ShieldCheck,
      color: "bg-sky-600",
      capabilities: PLATFORM_USER_MANAGE_CAPABILITIES,
      category: "Quản lý",
    },
    {
      id: "add-patient",
      title: "Thêm hồ sơ",
      description: "Tạo hồ sơ bệnh nhân mới",
      icon: Users,
      color: "bg-purple-500",
      capabilities: PATIENT_MANAGE_CAPABILITIES,
      category: "Quản lý",
    },
    {
      id: "add-device",
      title: "Thêm thiết bị",
      description: "Đăng ký thiết bị y tế mới",
      icon: Stethoscope,
      color: "bg-orange-500",
      capabilities: DEVICE_MANAGE_CAPABILITIES,
      category: "Thiết bị",
    },
    {
      id: "activate-device",
      title: "Kích hoạt thiết bị",
      description: "Kích hoạt thiết bị mới",
      icon: Wifi,
      color: "bg-cyan-500",
      capabilities: DEVICE_MANAGE_CAPABILITIES,
      category: "Thiết bị",
    },
    {
      id: "create-package",
      title: "Tạo gói mới",
      description: "Tạo gói dịch vụ mới",
      icon: Package,
      color: "bg-pink-500",
      capabilities: PACKAGE_MANAGE_CAPABILITIES,
      category: "Gói dịch vụ",
    },
    {
      id: "export-report",
      title: "Xuất báo cáo",
      description: "Tạo và tải xuống báo cáo",
      icon: FileText,
      color: "bg-indigo-500",
      capabilities: REPORT_EXPORT_CAPABILITIES,
      category: "Dữ liệu",
    },
    {
      id: "export-data",
      title: "Xuất dữ liệu",
      description: "Sao lưu dữ liệu hệ thống",
      icon: Database,
      color: "bg-red-500",
      capabilities: STORAGE_MANAGE_CAPABILITIES,
      category: "Dữ liệu",
    },
    {
      id: "notification-settings",
      title: "Cài đặt thông báo",
      description: "Quản lý thông báo",
      icon: Bell,
      color: "bg-yellow-500",
      capabilities: NOTIFICATION_MANAGE_CAPABILITIES,
      category: "Cài đặt",
    },
  ];

  const categories = ["Quản lý", "Thiết bị", "Gói dịch vụ", "Dữ liệu", "Cài đặt"];
  const visibleActions = accessCheckComplete
    ? actions.filter((action) => hasAnyCapability(action.capabilities))
    : [];
  const canOpenDialog = (id: string) => {
    const action = actions.find((item) => item.id === id);
    return action ? hasAnyCapability(action.capabilities) : false;
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">Hành động quản trị</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Tất cả các chức năng quản lý hệ thống ở một nơi
          </p>
        </div>
      </div>

      <div className="flex-1 space-y-8">
        {categories.map((category) => {
          const categoryActions = visibleActions.filter((a) => a.category === category);
          if (categoryActions.length === 0) return null;

          return (
            <div key={category}>
              <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <div className="w-1 h-5 bg-primary rounded-full"></div>
                {category}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {categoryActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.id}
                      onClick={() => {
                        if (hasAnyCapability(action.capabilities)) setOpenDialog(action.id);
                      }}
                      className="group relative bg-card border border-border rounded-xl p-6 hover:border-primary/50 hover:shadow-lg transition-all duration-200 text-left overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-primary/5 to-transparent rounded-bl-full opacity-0 group-hover:opacity-100 transition-opacity"></div>

                      <div className="relative flex items-start gap-4">
                        <div
                          className={`w-12 h-12 ${action.color} rounded-lg flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform`}
                        >
                          <Icon className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                            {action.title}
                          </h3>
                          <p className="text-sm text-muted-foreground mt-1">{action.description}</p>
                        </div>
                      </div>

                      <div className="mt-4 flex items-center gap-2 text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="font-medium">Nhấn để mở</span>
                        <svg
                          className="w-3 h-3"
                          viewBox="0 0 12 12"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M1 6h10M7 2l4 4-4 4"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-muted/30 rounded-xl p-6 border border-border">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
            <Settings className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-foreground">Hướng dẫn sử dụng</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Các chức năng trên giúp bạn quản lý toàn bộ hệ thống y tế một cách hiệu quả. Nhấp vào
              từng thẻ để mở dialog tương ứng và thực hiện thao tác.
            </p>
            <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                Tất cả dữ liệu đều được mã hóa và bảo mật
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                Các thay đổi được ghi lại trong nhật ký hệ thống
              </li>
              <li className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                Bạn có thể xuất dữ liệu bất cứ lúc nào
              </li>
            </ul>
          </div>
        </div>
      </div>

      <AddClinicDialog
        open={canOpenDialog("add-clinic") && openDialog === "add-clinic"}
        onOpenChange={(open) => !open && setOpenDialog(null)}
      />
      <AddDoctorDialog
        open={canOpenDialog("add-doctor") && openDialog === "add-doctor"}
        onOpenChange={(open) => !open && setOpenDialog(null)}
      />
      <CreateAdminAccountDialog
        open={canOpenDialog("create-admin-account") && openDialog === "create-admin-account"}
        onOpenChange={(open) => !open && setOpenDialog(null)}
      />
      <AddPatientDialog
        open={canOpenDialog("add-patient") && openDialog === "add-patient"}
        onOpenChange={(open) => !open && setOpenDialog(null)}
      />
      <AddDeviceDialog
        open={canOpenDialog("add-device") && openDialog === "add-device"}
        onOpenChange={(open) => !open && setOpenDialog(null)}
      />
      <ActivateDeviceDialog
        open={canOpenDialog("activate-device") && openDialog === "activate-device"}
        onOpenChange={(open) => !open && setOpenDialog(null)}
      />
      <ExportReportDialog
        open={canOpenDialog("export-report") && openDialog === "export-report"}
        onOpenChange={(open) => !open && setOpenDialog(null)}
      />
      <ExportDataDialog
        open={canOpenDialog("export-data") && openDialog === "export-data"}
        onOpenChange={(open) => !open && setOpenDialog(null)}
      />
      <CreatePackageDialog
        open={canOpenDialog("create-package") && openDialog === "create-package"}
        onOpenChange={(open) => !open && setOpenDialog(null)}
      />
      <NotificationSettingsDialog
        open={canOpenDialog("notification-settings") && openDialog === "notification-settings"}
        onOpenChange={(open) => !open && setOpenDialog(null)}
      />
    </div>
  );
}
