import { initializeApp, getApps, type FirebaseOptions } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  getAuth,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  type User,
} from "firebase/auth";

const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const isProductionAuthMode = () =>
  import.meta.env.VITE_AUTH_MODE === "production";
export const hasFirebaseWebConfig = () =>
  Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId,
  );

function auth() {
  if (typeof window === "undefined")
    throw new Error("Firebase Auth chỉ chạy trong trình duyệt.");
  if (!hasFirebaseWebConfig())
    throw new Error("Chưa cấu hình Firebase Web Auth cho Shcare Portal.");
  return getAuth(
    getApps().length ? getApps()[0] : initializeApp(firebaseConfig),
  );
}

function firebaseAuthErrorMessage(error: unknown) {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
  if (
    [
      "auth/invalid-credential",
      "auth/user-not-found",
      "auth/wrong-password",
    ].includes(code)
  ) {
    return "Email hoặc mật khẩu không đúng. Nếu đây là tài khoản quản trị hệ thống, hãy dùng shcare-admin.web.app hoặc đặt lại mật khẩu.";
  }
  if (code === "auth/user-disabled") {
    return "Tài khoản Firebase này đang bị khóa. Vui lòng liên hệ quản trị viên Smart Health.";
  }
  if (code === "auth/invalid-email") {
    return "Email đăng nhập không đúng định dạng.";
  }
  if (code === "auth/weak-password") {
    return "Mật khẩu mới quá yếu. Vui lòng dùng ít nhất 8 ký tự, có chữ và số.";
  }
  if (code === "auth/requires-recent-login") {
    return "Phiên Firebase đã quá cũ. Vui lòng đăng xuất, đăng nhập lại rồi đổi mật khẩu.";
  }
  if (code === "auth/too-many-requests") {
    return "Firebase tạm khóa đăng nhập do thử sai quá nhiều lần. Vui lòng đợi một lúc hoặc đặt lại mật khẩu.";
  }
  if (code === "auth/network-request-failed") {
    return "Không kết nối được Firebase Auth. Hãy kiểm tra mạng rồi thử lại.";
  }
  return error instanceof Error
    ? error.message
    : "Đăng nhập Firebase thất bại.";
}

export const onFirebaseAuthStateChange = (
  callback: (user: User | null) => void,
) => onAuthStateChanged(auth(), callback);

export async function signInWithFirebaseEmail(email: string, password: string) {
  try {
    const credential = await signInWithEmailAndPassword(
      auth(),
      email.trim(),
      password,
    );
    return credential.user.getIdToken(true);
  } catch (error) {
    throw new Error(firebaseAuthErrorMessage(error));
  }
}

export async function createFirebaseAccount(email: string, password: string) {
  const credential = await createUserWithEmailAndPassword(
    auth(),
    email,
    password,
  );
  return {
    user: credential.user,
    idToken: await credential.user.getIdToken(true),
  };
}

export const signOutFirebase = () => signOut(auth());
export const sendFirebasePasswordReset = (email: string) =>
  sendPasswordResetEmail(auth(), email.trim(), {
    url: `${window.location.origin}/login`,
  });

export async function changeFirebasePassword(
  currentPassword: string,
  newPassword: string,
) {
  const user = auth().currentUser;
  if (!user || !user.email) {
    throw new Error("Không tìm thấy phiên Firebase. Vui lòng đăng nhập lại.");
  }

  try {
    const credential = EmailAuthProvider.credential(
      user.email,
      currentPassword,
    );
    await reauthenticateWithCredential(user, credential);
    await updatePassword(user, newPassword);
    return user.getIdToken(true);
  } catch (error) {
    throw new Error(firebaseAuthErrorMessage(error));
  }
}

export async function refreshFirebaseVerification() {
  const user = auth().currentUser;
  if (!user)
    throw new Error("Không tìm thấy phiên đăng ký. Vui lòng đăng nhập lại.");
  await user.reload();
  return { verified: user.emailVerified, idToken: await user.getIdToken(true) };
}
