import { initializeApp, getApps, type FirebaseOptions } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";

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

export async function signInWithFirebaseEmail(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
  return credential.user.getIdToken(true);
}
