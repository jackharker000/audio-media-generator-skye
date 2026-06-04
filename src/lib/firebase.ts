import {
  cert,
  getApps,
  initializeApp,
  applicationDefault,
  type App,
} from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getProjectId, getServiceAccount, getStorageBucket } from "./googleCreds";

/** Lazily-initialized Firebase Admin app (Firestore + Cloud Storage). */
let app: App | null = null;
let db: Firestore | null = null;

export function getApp(): App {
  if (app) return app;
  if (getApps().length) {
    app = getApps()[0]!;
    return app;
  }
  const sa = getServiceAccount();
  app = initializeApp({
    credential: sa
      ? cert({ projectId: sa.projectId, clientEmail: sa.clientEmail, privateKey: sa.privateKey })
      : applicationDefault(),
    projectId: getProjectId(),
    storageBucket: getStorageBucket(),
  });
  return app;
}

export function getFirestoreDb(): Firestore {
  if (db) return db;
  db = getFirestore(getApp());
  try {
    // Our documents intentionally omit optional fields; don't choke on undefined.
    db.settings({ ignoreUndefinedProperties: true });
  } catch {
    /* settings can only be set once */
  }
  return db;
}

export function getBucket() {
  return getStorage(getApp()).bucket();
}
