import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// ⚠️ Firebase Config (Auth only - Database moved to Turso)
const firebaseConfig = {
    apiKey: "AIzaSyBhkmmMm93sbMmYHHSJprqfQutZIL5AYfM",
    authDomain: "lpdatabase-ca2a0.firebaseapp.com",
    projectId: "lpdatabase-ca2a0",
    storageBucket: "lpdatabase-ca2a0.firebasestorage.app",
    messagingSenderId: "359410309752",
    appId: "1:359410309752:web:4ac8bd58a4cf789aac6b8d",
    measurementId: "G-YVX36D2Z90"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// API Base URL
const API_BASE = '/api';

export { auth, API_BASE };
