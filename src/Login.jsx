import { useState } from "react"
import { auth } from "./firebase"
import { signInWithEmailAndPassword } from "firebase/auth"

function Login() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
    } catch {
      setError("Couldn't sign in — check your email and password")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#F5F5F0] max-w-sm mx-auto flex flex-col">
      <div className="bg-green-700 px-4 pt-10 pb-4">
        <h1 className="text-white text-xl font-semibold">PharmaSnap</h1>
        <p className="text-green-200 text-sm">Sign in to continue</p>
      </div>

      <form onSubmit={handleSubmit} className="px-4 mt-6 flex flex-col gap-4">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <label className="text-xs text-gray-500 font-medium uppercase tracking-wide">Email</label>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full mt-2 text-sm text-gray-800 outline-none border-b border-gray-200 pb-1 focus:border-green-500"
          />
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <label className="text-xs text-gray-500 font-medium uppercase tracking-wide">Password</label>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full mt-2 text-sm text-gray-800 outline-none border-b border-gray-200 pb-1 focus:border-green-500"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-green-700 text-white font-semibold py-4 rounded-xl active:bg-green-800 disabled:opacity-60"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  )
}

export default Login
