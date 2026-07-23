import type { ComponentType } from "react";
import { createBrowserRouter } from "react-router";
import { routeChildPath, routePath } from "./contracts/route-contract";

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
      path: routePath("public.home"),
      lazy: lazyPublicLayout,
      hydrateFallbackElement,
      children: [
        { index: true, lazy: lazyPage(() => import("./pages/public/HomePage")) },

        // Product pages
        { path: routeChildPath("public.product"), lazy: lazyPage(() => import("./pages/public/ProductPage")) },
        {
          path: routeChildPath("public.product.device"),
          lazy: lazyPage(() => import("./pages/public/DevicePage")),
        },
        {
          path: routeChildPath("public.product.rpm"),
          lazy: lazyPage(() => import("./pages/public/DevicePage")),
        },
        { path: routeChildPath("public.product.records"), lazy: lazyPage(() => import("./pages/public/ProductPage")) },

        // Solution pages
        {
          path: routeChildPath("public.solution.doctor"),
          lazy: lazyPage(() => import("./pages/public/DoctorSolutionPage")),
        },
        {
          path: routeChildPath("public.solution.clinic"),
          lazy: lazyPage(() => import("./pages/public/ClinicSolutionPage")),
        },
        {
          path: routeChildPath("public.solution.patient"),
          lazy: lazyPage(() => import("./pages/public/PatientHomePage")),
        },
        { path: routeChildPath("public.solutions"), lazy: lazyPage(() => import("./pages/public/DoctorSolutionPage")) },

        // Other public
        { path: routeChildPath("public.pricing"), lazy: lazyPage(() => import("./pages/public/PricingPage")) },
        { path: routeChildPath("public.contact"), lazy: lazyPage(() => import("./pages/public/ContactPage")) },
        { path: routeChildPath("public.resources"), lazy: lazyPage(() => import("./pages/public/FAQPage")) },
        { path: routeChildPath("public.resources.faq"), lazy: lazyPage(() => import("./pages/public/FAQPage")) },
        { path: routeChildPath("public.resources.rpm"), lazy: lazyPage(() => import("./pages/public/RPMGuidePage")) },
        { path: routeChildPath("public.security-consent"), lazy: lazyPage(() => import("./pages/public/SecurityPage")) },
        { path: routeChildPath("public.security"), lazy: lazyPage(() => import("./pages/public/SecurityPage")) },
        { path: routeChildPath("public.privacy"), lazy: lazyPage(() => import("./pages/public/LegalPage")) },
        { path: routeChildPath("public.terms"), lazy: lazyPage(() => import("./pages/public/LegalPage")) },
        { path: routeChildPath("public.legal"), lazy: lazyPage(() => import("./pages/public/LegalPage")) },
        { path: routeChildPath("public.not-found"), lazy: lazyPage(() => import("./pages/public/NotFoundPage")) },
        { path: routeChildPath("public.maintenance"), lazy: lazyMaintenancePage },
      ],
    },

    // ─── Auth flows ───────────────────────────────────────────────────────────
    {
      lazy: lazyAuthLayout,
      hydrateFallbackElement,
      children: [
        { path: routeChildPath("auth.login"), lazy: lazyPage(() => import("./pages/auth/LoginPage")) },
        { path: routeChildPath("auth.register"), lazy: lazyPage(() => import("./pages/auth/RegisterDoctorPage")) },
        { path: routeChildPath("auth.register.doctor"), lazy: lazyPage(() => import("./pages/auth/RegisterDoctorPage")) },
        { path: routeChildPath("auth.register.doctor-alias"), lazy: lazyPage(() => import("./pages/auth/RegisterDoctorPage")) },
        { path: routeChildPath("auth.register.clinic"), lazy: lazyPage(() => import("./pages/auth/RegisterClinicPage")) },
        { path: routeChildPath("auth.register.clinic-alias"), lazy: lazyPage(() => import("./pages/auth/RegisterClinicPage")) },
        { path: routeChildPath("auth.forgot-password"), lazy: lazyPage(() => import("./pages/auth/ForgotPasswordPage")) },
        { path: routeChildPath("auth.reset-password"), lazy: lazyPage(() => import("./pages/auth/ForgotPasswordPage")) },
        { path: routeChildPath("auth.verify-email"), lazy: lazyPage(() => import("./pages/auth/EmailVerificationPage")) },
        { path: routeChildPath("auth.verify-email-alias"), lazy: lazyPage(() => import("./pages/auth/EmailVerificationPage")) },
        {
          path: routeChildPath("auth.staff-invitation.accept"),
          lazy: lazyPage(() => import("./pages/auth/StaffInvitationAcceptancePage")),
        },
        { path: routeChildPath("auth.approval.pending"), lazy: lazyApprovalPage() },
        { path: routeChildPath("auth.approval.info"), lazy: lazyApprovalPage("info_requested") },
        { path: routeChildPath("auth.approval.rejected"), lazy: lazyApprovalPage("rejected") },
        { path: routeChildPath("auth.approval.approved"), lazy: lazyApprovalPage("approved") },
      ],
    },

    // ─── Portal (authenticated) ───────────────────────────────────────────────
    {
      path: routePath("portal.root"),
      lazy: lazyPortalLayout,
      hydrateFallbackElement,
      children: [
        { index: true, lazy: lazyPage(() => import("./pages/portal/DashboardRouter")) },
        { path: routeChildPath("portal.dashboard"), lazy: lazyPage(() => import("./pages/portal/DashboardRouter")) },
        { path: routeChildPath("portal.dashboard.overview"), lazy: lazyPage(() => import("./pages/portal/DashboardPage")) },
        { path: routeChildPath("portal.dashboard.doctor"), lazy: lazyPage(() => import("./pages/portal/DoctorDashboard")) },
        { path: routeChildPath("portal.dashboard.clinic"), lazy: lazyPage(() => import("./pages/portal/ClinicDashboard")) },

        // Patients
        { path: routeChildPath("portal.patients"), lazy: lazyPage(() => import("./pages/portal/PatientsPage")) },
        { path: routeChildPath("portal.patients.import"), lazy: lazyPage(() => import("./pages/portal/PatientImportPage")) },
        { path: routeChildPath("portal.patients.detail"), lazy: lazyPage(() => import("./pages/portal/PatientDetail")) },

        // Appointments
        { path: routeChildPath("portal.appointments"), lazy: lazyPage(() => import("./pages/portal/AppointmentsPage")) },

        // Live monitoring
        { path: routeChildPath("portal.live"), lazy: lazyPage(() => import("./pages/portal/LiveMonitoring")) },

        // Records — IMPORTANT: static segment "review" must come before dynamic ":id"
        { path: routeChildPath("portal.records.review"), lazy: lazyPage(() => import("./pages/portal/ReviewQueuePage")) },
        { path: routeChildPath("portal.records.detail"), lazy: lazyPage(() => import("./pages/portal/ScanDetail")) },
        { path: routeChildPath("portal.records"), lazy: lazyPage(() => import("./pages/portal/RecordsPage")) },

        // Devices
        { path: routeChildPath("portal.devices"), lazy: lazyPage(() => import("./pages/portal/DevicesPage")) },
        { path: routeChildPath("portal.devices.claim"), lazy: lazyPage(() => import("./pages/portal/ClaimDevicePage")) },
        { path: routeChildPath("portal.devices.assign"), lazy: lazyPage(() => import("./pages/portal/AssignDevicePage")) },

        // Invitations & Consent
        { path: routeChildPath("portal.consent"), lazy: lazyPage(() => import("./pages/portal/InvitationsPage")) },

        // Staff management
        { path: routeChildPath("portal.staff"), lazy: lazyPage(() => import("./pages/portal/StaffPage")) },

        // Reports
        { path: routeChildPath("portal.reports"), lazy: lazyPage(() => import("./pages/portal/ReportsPage")) },

        // Settings & workspace
        { path: routeChildPath("portal.settings"), lazy: lazyPage(() => import("./pages/portal/WorkspaceSettings")) },
        { path: routeChildPath("portal.workspace"), lazy: lazyPage(() => import("./pages/portal/WorkspaceSwitcher")) },

        // Alerts & Notifications
        { path: routeChildPath("portal.alerts"), lazy: lazyPage(() => import("./pages/portal/AlertCenterPage")) },
        { path: routeChildPath("portal.notifications"), lazy: lazyPage(() => import("./pages/portal/NotificationsPage")) },

        // Billing & Audit
        { path: routeChildPath("portal.billing"), lazy: lazyPage(() => import("./pages/portal/BillingSummaryPage")) },
        { path: routeChildPath("portal.audit"), lazy: lazyPage(() => import("./pages/portal/AuditLogPage")) },

        // Help & Onboarding
        { path: routeChildPath("portal.help"), lazy: lazyPage(() => import("./pages/portal/HelpPage")) },
        { path: routeChildPath("portal.onboarding"), lazy: lazyPage(() => import("./pages/portal/OnboardingChecklist")) },

        // Access control
        { path: routeChildPath("portal.permission-denied"), lazy: lazyPage(() => import("./pages/portal/PermissionDeniedPage")) },
      ],
    },

    // ─── Catch-all ────────────────────────────────────────────────────────────
    {
      path: routeChildPath("public.not-found.catch-all"),
      lazy: lazyPage(() => import("./pages/public/NotFoundPage")),
      hydrateFallbackElement,
    },
  ]);
