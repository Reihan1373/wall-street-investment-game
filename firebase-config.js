// Firebase WEB app configuration: Firebase Console > Project settings > Your apps.
// Values in this object are public app identifiers, NOT admin credentials.
// Never put service-account JSON, admin passwords, join codes, or historical
// answers in this file or anywhere in a public GitHub repository.
export const firebaseConfig = {
  apiKey: "REPLACE_WITH_WEB_API_KEY",
  authDomain: "REPLACE_WITH_PROJECT_ID.firebaseapp.com",
  projectId: "REPLACE_WITH_PROJECT_ID",
  storageBucket: "REPLACE_WITH_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "REPLACE_WITH_SENDER_ID",
  appId: "REPLACE_WITH_APP_ID"
};

export const firebaseConfigured =
  Boolean(firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("REPLACE_")) &&
  Boolean(firebaseConfig.projectId && !firebaseConfig.projectId.startsWith("REPLACE_"));
