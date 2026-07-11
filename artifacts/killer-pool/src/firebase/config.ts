import { initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getDatabase, type Database } from "firebase/database";

// Firebase web config is supplied via environment variables (Vite exposes any
// var prefixed with VITE_). The web API key is not a secret — it identifies the
// project to Firebase's public endpoints — but we still keep it out of source so
// each deployment can point at its own Firebase project.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as
    | string
    | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string | undefined,
};

// The values that must be present for Auth + Firestore to function.
const REQUIRED_KEYS = ["apiKey", "authDomain", "projectId", "appId"] as const;

export const missingFirebaseConfig: string[] = REQUIRED_KEYS.filter(
  (k) => !firebaseConfig[k],
).map((k) => `VITE_FIREBASE_${k.replace(/([A-Z])/g, "_$1").toUpperCase()}`);

export const isFirebaseConfigured = missingFirebaseConfig.length === 0;

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;
let rtdbInstance: Database | null = null;

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig as Record<string, string>);
  authInstance = getAuth(app);
  dbInstance = getFirestore(app);
  rtdbInstance = getDatabase(app);
}

// Non-null accessors. These throw a clear error rather than failing silently if
// the app is used before Firebase is configured.
export function getAuthInstance(): Auth {
  if (!authInstance) {
    throw new Error(
      `Firebase is not configured. Missing: ${missingFirebaseConfig.join(", ")}`,
    );
  }
  return authInstance;
}

export function getDb(): Firestore {
  if (!dbInstance) {
    throw new Error(
      `Firebase is not configured. Missing: ${missingFirebaseConfig.join(", ")}`,
    );
  }
  return dbInstance;
}

export function getRtdb(): Database {
  if (!rtdbInstance) {
    throw new Error(`Firebase Realtime Database is not configured.`);
  }
  return rtdbInstance;
}

export const googleProvider = new GoogleAuthProvider();
