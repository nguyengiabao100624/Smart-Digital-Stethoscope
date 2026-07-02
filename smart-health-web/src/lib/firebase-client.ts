import { initializeApp, getApps, type FirebaseOptions } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
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

export const onFirebaseAuthStateChange = (
  callback: (user: User | null) => void,
) => onAuthStateChanged(auth(), callback);

export async function signInWithFirebaseEmail(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(auth(), email, password);
  return credential.user.getIdToken(true);
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

export async function refreshFirebaseVerification() {
  const user = auth().currentUser;
  if (!user)
    throw new Error("Không tìm thấy phiên đăng ký. Vui lòng đăng nhập lại.");
  await user.reload();
  return { verified: user.emailVerified, idToken: await user.getIdToken(true) };
}
