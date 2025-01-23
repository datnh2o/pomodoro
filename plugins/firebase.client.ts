// plugins/firebase.client.ts
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyCoZkevb7FW_A_e5w6DtfYGPs8cXMXNmmI",
  authDomain: "pomodoro-eeb4a.firebaseapp.com",
  projectId: "pomodoro-eeb4a",
  storageBucket: "pomodoro-eeb4a.firebasestorage.app",
  messagingSenderId: "7821237700",
  appId: "1:7821237700:web:f26953593f22f046e8d891",
  measurementId: "G-51JC7PQQ15"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const firestore = getFirestore(firebaseApp);
const provider = new GoogleAuthProvider();

export { firebaseApp, firestore, auth, provider, signInWithPopup, onAuthStateChanged, signOut };
