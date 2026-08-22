import { initializeApp, getApps, type FirebaseOptions } from "firebase/app";
import {
  EmailAuthProvider,
  getAuth,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";

const firebaseConfig: FirebaseOptions = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

export function isProductionAuthMode() {
  return import.meta.env.VITE_AUTH_MODE === "production";
}

export function hasFirebaseWebConfig() {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId,
  );
}

function getFirebaseAuth() {
  if (typeof window === "undefined") {
    throw new Error("Firebase Auth chỉ chạy trong trình duyệt.");
  }

  if (!hasFirebaseWebConfig()) {
    throw new Error("Chưa cấu hình Firebase Web Auth cho admin dashboard.");
  }

  const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
  return getAuth(app);
}

export function onFirebaseAuthStateChange(callback: (user: User | null) => void) {
  return onAuthStateChanged(getFirebaseAuth(), callback);
}

export async function signInWithFirebaseEmail(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
  return credential.user.getIdToken(true);
}

export async function signOutFirebase() {
  await signOut(getFirebaseAuth());
}

export function getCurrentFirebaseUid() {
  return getFirebaseAuth().currentUser?.uid || null;
}

export async function signOutFirebaseIfUidMatches(expectedUid: string) {
  const auth = getFirebaseAuth();
  if (!expectedUid || auth.currentUser?.uid !== expectedUid) {
    return false;
  }
  await signOut(auth);
  return true;
}

export async function reauthenticateFirebasePassword(currentPassword: string) {
  const auth = getFirebaseAuth();
  const user = auth.currentUser;
  const email = user?.email || "";
  if (!user || !email) {
    throw new Error("Bạn cần đăng nhập lại trước khi đổi mật khẩu.");
  }

  const credential = EmailAuthProvider.credential(email, currentPassword);
  await reauthenticateWithCredential(user, credential);
  return {
    idToken: await user.getIdToken(true),
    uid: user.uid,
  };
}

export async function sendFirebasePasswordReset(email: string) {
  const normalizedEmail = email.trim();
  if (!normalizedEmail) {
    throw new Error("Vui lòng nhập email.");
  }

  const actionCodeSettings =
    typeof window !== "undefined"
      ? {
          url: `${window.location.origin}/login`,
          handleCodeInApp: false,
        }
      : undefined;

  await sendPasswordResetEmail(getFirebaseAuth(), normalizedEmail, actionCodeSettings);
}
