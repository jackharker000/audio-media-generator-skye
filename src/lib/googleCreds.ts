import fs from "node:fs";

/**
 * Resolves a Google service account from the environment, supporting both:
 *  - inline JSON in FIREBASE_SERVICE_ACCOUNT_JSON / GOOGLE_SERVICE_ACCOUNT_JSON
 *    (best for Vercel — no filesystem needed), and
 *  - a file path in GOOGLE_APPLICATION_CREDENTIALS (best for local dev).
 *
 * The SAME service account powers Firestore, Cloud Storage, and Text-to-Speech.
 */
export interface GoogleServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

let cached: GoogleServiceAccount | null | undefined;

function resolve(): GoogleServiceAccount | null {
  let raw =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!raw && path) {
    try {
      raw = fs.readFileSync(path, "utf8");
    } catch {
      /* ignore */
    }
  }
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    const projectId =
      j.project_id ?? j.projectId ?? process.env.FIREBASE_PROJECT_ID ?? process.env.GOOGLE_CLOUD_PROJECT;
    const clientEmail = j.client_email ?? j.clientEmail;
    let privateKey: string | undefined = j.private_key ?? j.privateKey;
    if (privateKey) privateKey = privateKey.replace(/\\n/g, "\n");
    if (!projectId || !clientEmail || !privateKey) return null;
    return { projectId, clientEmail, privateKey };
  } catch {
    return null;
  }
}

export function getServiceAccount(): GoogleServiceAccount | null {
  if (cached === undefined) cached = resolve();
  return cached;
}

export function getProjectId(): string | undefined {
  return (
    getServiceAccount()?.projectId ??
    process.env.FIREBASE_PROJECT_ID ??
    process.env.GOOGLE_CLOUD_PROJECT
  );
}

export function getStorageBucket(): string | undefined {
  const explicit = process.env.FIREBASE_STORAGE_BUCKET;
  if (explicit) return explicit;
  const pid = getProjectId();
  return pid ? `${pid}.firebasestorage.app` : undefined;
}

/** Client options for @google-cloud libraries (Text-to-Speech) on any host. */
export function getGoogleClientOptions(): {
  credentials?: { client_email: string; private_key: string };
  projectId?: string;
} {
  const sa = getServiceAccount();
  if (!sa) return {};
  return {
    credentials: { client_email: sa.clientEmail, private_key: sa.privateKey },
    projectId: sa.projectId,
  };
}
