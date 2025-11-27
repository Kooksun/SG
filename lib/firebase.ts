import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDSjYzPd8ISPF_pSSX5RPm0qFH-5chi51s",
  authDomain: "stock-8ff9e.firebaseapp.com",
  projectId: "stock-8ff9e",
  storageBucket: "stock-8ff9e.firebasestorage.app",
  messagingSenderId: "330927132230",
  appId: "1:330927132230:web:ccee9651520c103dcc4447"
};

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
