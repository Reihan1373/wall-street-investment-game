// Firebase Web SDK configuration (public project identifiers).
// Do not place private service-account keys or administrator passwords here.
const firebaseConfig = {
  apiKey: "AIzaSyCa5Dhz0oSO0AYru__cJcDGKagrISsYcss",
  authDomain: "wall-street-investment-game.firebaseapp.com",
  projectId: "wall-street-investment-game",
  storageBucket: "wall-street-investment-game.firebasestorage.app",
  messagingSenderId: "352943883143",
  appId: "1:352943883143:web:38f70a9c8b2f7518c38922"
};

// shared.js imports both named exports.
export const firebaseConfigured = true;
Boolean(firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith('REPLACE_')) &&
  Boolean(firebaseConfig.projectId && !firebaseConfig.projectId.startsWith('REPLACE_'));
