import { createBrowserRouter } from "react-router";
import Root from "./Root";
import SplashScreen from "./components/SplashScreen";
import LoginScreen from "./components/LoginScreen";
import Dashboard from "./components/Dashboard";
import LiveMonitoring from "./components/LiveMonitoring";
import MedicalRecords from "./components/MedicalRecords";
import RecordDetail from "./components/RecordDetail";
import AIAssistant from "./components/AIAssistant";
import BluetoothPairing from "./components/BluetoothPairing";
import Settings from "./components/Settings";
import NewScan from "./components/NewScan";
import NotFound from "./components/NotFound";
import PatientDashboard from "./components/PatientDashboard";

// Authentication
import ForgotPassword from "./components/ForgotPassword";
import SignUp from "./components/SignUp";
import PhoneLogin from "./components/PhoneLogin";
import VerifyEmail from "./components/VerifyEmail";
import ReVerifyContact from "./components/ReVerifyContact";
import VerifyPhoneSettings from "./components/VerifyPhoneSettings";

// Notifications
import Notifications from "./components/Notifications";

// Settings Pages
import Profile from "./components/Profile";
import Privacy from "./components/Privacy";
import StethoscopeSettings from "./components/StethoscopeSettings";
import AICalibration from "./components/AICalibration";
import NotificationSettings from "./components/NotificationSettings";
import DataStorage from "./components/DataStorage";

// New Settings Pages
import ChangePassword from "./components/ChangePassword";
import DataAccess from "./components/DataAccess";
import AccessLog from "./components/AccessLog";
import BluetoothSettingsPage from "./components/BluetoothSettingsPage";
import DeleteData from "./components/DeleteData";
import ExportData from "./components/ExportData";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Root,
    children: [
      { index: true, Component: SplashScreen },
      { path: "login", Component: LoginScreen },
      { path: "forgot-password", Component: ForgotPassword },
      { path: "signup", Component: SignUp },
      { path: "phone-login", Component: PhoneLogin },
      { path: "verify-email", Component: VerifyEmail },
      { path: "re-verify", Component: ReVerifyContact },
      { path: "verify-phone-settings", Component: VerifyPhoneSettings },
      { path: "dashboard", Component: Dashboard },
      { path: "patient-dashboard", Component: PatientDashboard },
      { path: "monitoring", Component: LiveMonitoring },
      { path: "records", Component: MedicalRecords },
      { path: "records/detail", Component: RecordDetail },
      { path: "assistant", Component: AIAssistant },
      { path: "bluetooth", Component: BluetoothPairing },
      { path: "settings", Component: Settings },
      { path: "notifications", Component: Notifications },
      { path: "profile", Component: Profile },
      { path: "privacy", Component: Privacy },
      { path: "stethoscope-settings", Component: StethoscopeSettings },
      { path: "ai-calibration", Component: AICalibration },
      { path: "notification-settings", Component: NotificationSettings },
      { path: "data-storage", Component: DataStorage },
      { path: "new-scan", Component: NewScan },
      
      // Additional utilities
      { path: "change-password", Component: ChangePassword },
      { path: "data-access", Component: DataAccess },
      { path: "access-log", Component: AccessLog },
      { path: "bluetooth-settings", Component: BluetoothSettingsPage },
      { path: "delete-data", Component: DeleteData },
      { path: "export-data", Component: ExportData },
      
      { path: "*", Component: NotFound },
    ],
  },
]);
