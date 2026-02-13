// Firebase Configuration loaded from .env
const firebaseConfig = {
  apiKey: "AIzaSyAHujAdFgROeQRVhb4qT-qTfdlRLgzLY90",
  authDomain: "jeepsystem.firebaseapp.com",
  databaseURL: "https://jeepsystem-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "jeepsystem",
  storageBucket: "jeepsystem.firebasestorage.app",
  messagingSenderId: "858677889972",
  appId: "1:858677889972:web:8eb3bcb2388fb3675b40e1",
  measurementId: "G-LPHB5V5E1L"
};

// Initialize Firebase (if using ES6 modules)
// import { initializeApp } from "firebase/app";
// import { getAnalytics } from "firebase/analytics";
// const app = initializeApp(firebaseConfig);
// const analytics = getAnalytics(app);

// Export config for use in other files
window.firebaseConfig = firebaseConfig;
