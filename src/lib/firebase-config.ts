const normalizeEnv = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const firebaseConfig = {
  apiKey: normalizeEnv(import.meta.env.VITE_FIREBASE_API_KEY),
  authDomain: normalizeEnv(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
  projectId: normalizeEnv(import.meta.env.VITE_FIREBASE_PROJECT_ID),
  messagingSenderId: normalizeEnv(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
  appId: normalizeEnv(import.meta.env.VITE_FIREBASE_APP_ID)
};

export const vapidKey = normalizeEnv(import.meta.env.VITE_FIREBASE_VAPID_KEY);

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.messagingSenderId &&
    firebaseConfig.appId &&
    vapidKey
);
