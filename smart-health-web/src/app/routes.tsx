import type { ComponentType } from "react";
import { createBrowserRouter } from "react-router";

function RouteHydrateFallback() {
  return (
    <div
      aria-hidden="true"
      className="min-h-screen bg-[var(--shc-page-bg,#f5f9fb)] text-transparent"
    />
  );
}

const hydrateFallbackElement = <RouteHydrateFallback />;

const lazyPublicLayout = async () => ({
  Component: (await import("./layouts/PublicLayout")).default,
});

const lazyPortalLayout = async () => ({
  Component: (await import("./layouts/PortalLayout")).default,
});

const lazyAuthLayout = async () => ({
  Component: (await import("./layouts/AuthLayout")).AuthLayout,
});

const lazyPage = (importer: () => Promise<{ default: ComponentType }>) => async () => ({
  Component: (await importer()).default,
});

const lazyApprovalPage = (state?: "info_requested" | "rejected" | "approved") =>
  async () => {
    const { default: ApprovalPendingPage } = await import("./pages/auth/ApprovalPendingPage");
    return {
      Component: function ApprovalStatePage() {
        return <ApprovalPendingPage state={state} />;
      },
    };
  };

const lazyMaintenancePage = async () => {
  const { default: NotFoundPage } = await import("./pages/public/NotFoundPage");
  return {
    Component: function MaintenancePage() {
      return <NotFoundPage maintenance />;
    },
  };
};

export const createAppRouter = () =>
  createBrowserRouter([
    // ─── Public website ───────────────────────────────────────────────────────
    {
      path: "/",
      lazy: lazyPublicLayout,
      hydrateFallbackElement,
      children: [
        { index: true, lazy: lazyPage(() => import("./pages/public/HomePage")) },

        // Product pages
        { path: "san-pham", lazy: lazyPage(() => import("./pages/public/ProductPage")) },
        {
          path: "san-pham/ong-nghe-thong-minh",
          lazy: lazyPage(() => import("./pages/public/DevicePage")),
        },
        {
          path: "san-pham/theo-doi-tu-xa",
          lazy: lazyPage(() => import("./pages/public/DevicePage")),
        },
        { path: "san-pham/ho-so-luot-do", lazy: lazyPage(() => import("./pages/public/ProductPage")) },

        // Solution pages
        {
          path: "giai-phap/bac-si-ca-nhan",
          lazy: lazyPage(() => import("./pages/public/DoctorSolutionPage")),
        },
        {
          path: "giai-phap/phong-kham",
          lazy: lazyPage(() => import("./pages/public/ClinicSolutionPage")),
        },
        {
          path: "giai-phap/benh-nhan-tai-nha",
          lazy: lazyPage(() => import("./pages/public/PatientHomePage")),
        },
        { path: "giai-phap", lazy: lazyPage(() => import("./pages/public/DoctorSolutionPage")) },

        // Other public
        { path: "bang-gia", lazy: lazyPage(() => import("./pages/public/PricingPage")) },
        { path: "lien-he", lazy: lazyPage(() => import("./pages/public/ContactPage")) },
        { path: "tai-nguyen", lazy: lazyPage(() => import("./pages/public/FAQPage")) },
        { path: "tai-nguyen/faq", lazy: lazyPage(() => import("./pages/public/FAQPage")) },
        { path: "tai-nguyen/kien-thuc-rpm", lazy: lazyPage(() => import("./pages/public/RPMGuidePage")) },
        { path: "bao-mat-consent", lazy: lazyPage(() => import("./pages/public/SecurityPage")) },
        { path: "bao-mat", lazy: lazyPage(() => import("./pages/public/SecurityPage")) },
        { path: "chinh-sach-bao-mat", lazy: lazyPage(() => import("./pages/public/LegalPage")) },
        { path: "dieu-khoan", lazy: lazyPage(() => import("./pages/public/LegalPage")) },
        { path: "phap-ly", lazy: lazyPage(() => import("./pages/public/LegalPage")) },
        { path: "404", lazy: lazyPage(() => import("./pages/public/NotFoundPage")) },
        { path: "bao-tri", lazy: lazyMaintenancePage },
      ],
    },

    // ─── Auth flows ───────────────────────────────────────────────────────────
    {
      lazy: lazyAuthLayout,
      hydrateFallbackElement,
      children: [
        { path: "login", lazy: lazyPage(() => import("./pages/auth/LoginPage")) },
        { path: "register", lazy: lazyPage(() => import("./pages/auth/RegisterDoctorPage")) },
        { path: "register/bac-si", lazy: lazyPage(() => import("./pages/auth/RegisterDoctorPage")) },
        { path: "register/doctor", lazy: lazyPage(() => import("./pages/auth/RegisterDoctorPage")) },
        { path: "register/phong-kham", lazy: lazyPage(() => import("./pages/auth/RegisterClinicPage")) },
        { path: "register/clinic", lazy: lazyPage(() => import("./pages/auth/RegisterClinicPage")) },
        { path: "quen-mat-khau", lazy: lazyPage(() => import("./pages/auth/ForgotPasswordPage")) },
        { path: "dat-lai-mat-khau", lazy: lazyPage(() => import("./pages/auth/ForgotPasswordPage")) },
        { path: "xac-nhan-email", lazy: lazyPage(() => import("./pages/auth/EmailVerificationPage")) },
        { path: "xac-thuc-email", lazy: lazyPage(() => import("./pages/auth/EmailVerificationPage")) },
        { path: "cho-duyet", lazy: lazyApprovalPage() },
        { path: "can-bo-sung", lazy: lazyApprovalPage("info_requested") },
        { path: "bi-tu-choi", lazy: lazyApprovalPage("rejected") },
        { path: "da-duoc-duyet", lazy: lazyApprovalPage("approved") },
      ],
    },

    // ─── Portal (authenticated) ───────────────────────────────────────────────
    {
      path: "/portal",
      lazy: lazyPortalLayout,
      hydrateFallbackElement,
      children: [
        { index: true, lazy: lazyPage(() => import("./pages/portal/DashboardRouter")) },
        { path: "dashboard", lazy: lazyPage(() => import("./pages/portal/DashboardRouter")) },
        { path: "dashboard/overview", lazy: lazyPage(() => import("./pages/portal/DashboardPage")) },
        { path: "dashboard/doctor", lazy: lazyPage(() => import("./pages/portal/DoctorDashboard")) },
        { path: "dashboard/clinic", lazy: lazyPage(() => import("./pages/portal/ClinicDashboard")) },

        // Patients
        { path: "patients", lazy: lazyPage(() => import("./pages/portal/PatientsPage")) },
        { path: "patients/import", lazy: lazyPage(() => import("./pages/portal/PatientImportPage")) },
        { path: "patients/:id", lazy: lazyPage(() => import("./pages/portal/PatientDetail")) },

        // Appointments
        { path: "appointments", lazy: lazyPage(() => import("./pages/portal/AppointmentsPage")) },

        // Live monitoring
        { path: "live", lazy: lazyPage(() => import("./pages/portal/LiveMonitoring")) },

        // Records — IMPORTANT: static segment "review" must come before dynamic ":id"
        { path: "records/review", lazy: lazyPage(() => import("./pages/portal/ReviewQueuePage")) },
        { path: "records/:id", lazy: lazyPage(() => import("./pages/portal/ScanDetail")) },
        { path: "records", lazy: lazyPage(() => import("./pages/portal/RecordsPage")) },

        // Devices
        { path: "devices", lazy: lazyPage(() => import("./pages/portal/DevicesPage")) },
        { path: "devices/claim", lazy: lazyPage(() => import("./pages/portal/ClaimDevicePage")) },
        { path: "devices/assign", lazy: lazyPage(() => import("./pages/portal/AssignDevicePage")) },

        // Invitations & Consent
        { path: "consent", lazy: lazyPage(() => import("./pages/portal/InvitationsPage")) },

        // Staff management
        { path: "staff", lazy: lazyPage(() => import("./pages/portal/StaffPage")) },

        // Reports
        { path: "reports", lazy: lazyPage(() => import("./pages/portal/ReportsPage")) },

        // Settings & workspace
        { path: "settings", lazy: lazyPage(() => import("./pages/portal/WorkspaceSettings")) },
        { path: "workspace", lazy: lazyPage(() => import("./pages/portal/WorkspaceSwitcher")) },

        // Alerts & Notifications
        { path: "alerts", lazy: lazyPage(() => import("./pages/portal/AlertCenterPage")) },
        { path: "notifications", lazy: lazyPage(() => import("./pages/portal/NotificationsPage")) },

        // Billing & Audit
        { path: "billing", lazy: lazyPage(() => import("./pages/portal/BillingSummaryPage")) },
        { path: "audit", lazy: lazyPage(() => import("./pages/portal/AuditLogPage")) },

        // Help & Onboarding
        { path: "help", lazy: lazyPage(() => import("./pages/portal/HelpPage")) },
        { path: "onboarding", lazy: lazyPage(() => import("./pages/portal/OnboardingChecklist")) },

        // Access control
        { path: "permission-denied", lazy: lazyPage(() => import("./pages/portal/PermissionDeniedPage")) },
      ],
    },

    // ─── Catch-all ────────────────────────────────────────────────────────────
    {
      path: "*",
      lazy: lazyPage(() => import("./pages/public/NotFoundPage")),
      hydrateFallbackElement,
    },
  ]);
