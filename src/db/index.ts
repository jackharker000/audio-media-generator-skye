import type { Firestore } from "firebase-admin/firestore";
import { getFirestoreDb } from "@/lib/firebase";

/** Firestore handle (Google Cloud / Firebase) — our database. */
export function getDb(): Firestore {
  return getFirestoreDb();
}

/** Collection names for the app's own data (Auth.js manages its own). */
export const COLLECTIONS = {
  projects: "projects",
  sources: "sources",
  knowledgeMaps: "knowledgeMaps",
  jobs: "jobs",
  songs: "songs",
  shares: "shares",
  usage: "usageCounters",
  blobs: "blobs",
  friendships: "friendships",
  notifications: "notifications",
} as const;

export * from "./types";
