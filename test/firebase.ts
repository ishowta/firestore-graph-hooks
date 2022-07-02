import {
  connectFirestoreEmulator,
  initializeFirestore,
} from 'firebase/firestore';
import { initializeApp } from 'firebase/app';

export const app = initializeApp({
  projectId: 'demo-firebase-graph-hooks',
});
export const firestore = initializeFirestore(app, {});

connectFirestoreEmulator(firestore, 'localhost', 8080);
