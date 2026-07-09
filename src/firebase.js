import { initializeApp } from "firebase/app"
import { getFirestore } from "firebase/firestore"

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDQDikL0W291OoG-Y649AQulKZiSwatA9g",
  authDomain: "pharmasnap-1c2aa.firebaseapp.com",
  projectId: "pharmasnap-1c2aa",
  storageBucket: "pharmasnap-1c2aa.firebasestorage.app",
  messagingSenderId: "486138817897",
  appId: "1:486138817897:web:667b2b8503c45b9d0c21f8",
  measurementId: "G-928NQQNVF7"
};

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)