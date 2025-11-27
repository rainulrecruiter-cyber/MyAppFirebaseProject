// src/firebaseConfig.js

// ------------------------------------------
// 🔥 CORE FIREBASE SDK
// ------------------------------------------
import { initializeApp } from "firebase/app";

// ------------------------------------------
// 🔥 AUTH (React Native REQUIRED)
// DO NOT use getAuth() in React Native.
// ------------------------------------------
import {
  initializeAuth,
  getReactNativePersistence,
} from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";

// ------------------------------------------
// 🔥 FIRESTORE / STORAGE / FUNCTIONS
// ------------------------------------------
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

// ------------------------------------------
// 🔹 YOUR FIREBASE CONFIGURATION
// ------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyD779-0A0A0w-gG5I2yN0c5nwampgRzi9rus",
  authDomain: "cloudcode-d6961.firebaseapp.com",
  projectId: "cloudcode-d6961",
  storageBucket: "cloudcode-d6961.firebasestorage.app",
  messagingSenderId: "501333188686",
  appId: "1:501333188686:web:fa2e21c8716241033b631f",
  measurementId: "G-E97RGMD8RX",
};

// ------------------------------------------
// 🔥 INITIALIZE FIREBASE APP
// ------------------------------------------
const app = initializeApp(firebaseConfig);

// ------------------------------------------
// 🔥 AUTH CONFIG FOR REACT NATIVE (VERY IMPORTANT)
// This fixes:
// - INTERNAL ASSERTION FAILED
// - persistence warnings
// - login not being saved
// ------------------------------------------
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

// ------------------------------------------
// 🔥 FIRESTORE / STORAGE / FUNCTIONS
// ------------------------------------------
const db = getFirestore(app);
const storage = getStorage(app);

// Asian region functions
const functions = getFunctions(app, "asia-south1");

// ------------------------------------------
// ❌ GOOGLE PROVIDER (Web only)
// React Native cannot use GoogleAuthProvider or signInWithPopup.
// Your other files import it, so we export null instead.
// ------------------------------------------
const googleProvider = null;

// ------------------------------------------
// ❌ FCM MESSAGING NOT SUPPORTED IN EXPO GO
// Exporting null to avoid breaking imports.
// ------------------------------------------
const messaging = null;

// ------------------------------------------
// 🔥 EXPORT EVERYTHING
// ------------------------------------------
export { app, auth, db, storage, googleProvider, functions, messaging };
