import { useState, useEffect } from "react"
import { auth } from "./firebase"
import { onAuthStateChanged } from "firebase/auth"
import Login from "./Login"

function AuthGate({ children }) {
  const [user, setUser] = useState(undefined) // undefined = still checking, null = signed out

  useEffect(() => onAuthStateChanged(auth, setUser), [])

  if (user === undefined) {
    return <div className="min-h-screen bg-[#F5F5F0] flex items-center justify-center text-gray-400 text-sm">Loading…</div>
  }
  return user ? children : <Login />
}

export default AuthGate
