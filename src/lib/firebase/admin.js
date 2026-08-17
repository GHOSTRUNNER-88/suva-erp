import { initializeApp, getApps, getApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";

function adminApp() {
  if (getApps().length) {
    return getApp();
  }

  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // .env files can't hold real newlines in a single-line value — the
      // key is stored with literal "\n" escapes and converted back here.
      privateKey: (process.env.FIREBASE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    }),
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  });
}

export function getAdminAuth() {
  return getAuth(adminApp());
}

export function getAdminStorageBucket() {
  return getStorage(adminApp()).bucket();
}
