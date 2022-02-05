import { initializeApp } from "firebase/app";
import {
  initializeFirestore,
  WriteBatch,
  writeBatch,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getAnalytics } from "firebase/analytics";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string,
  messagingSenderId: import.meta.env
    .VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID as string,
};

export const app = initializeApp(firebaseConfig);
export const firestore = initializeFirestore(app, {
  ignoreUndefinedProperties: true,
});
export const auth = getAuth(app);
export const analytics = getAnalytics(app);

export const withBatch = (f: (batch: WriteBatch) => void) => {
  const batch = writeBatch(firestore);
  f(batch);
  batch.commit();
};
