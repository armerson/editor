import { type ReactNode, useState, useEffect } from "react"

const API_BASE = ((import.meta.env.VITE_RENDER_API_BASE as string | undefined) ?? "http://localhost:3001").replace(/\/$/, "")

const JWT_KEY = "auth_jwt"
const BYPASS_KEY = "beta_token"

type Props = { children: ReactNode }

export function BetaGate({ children }: Props) {
  const [unlocked, setUnlocked] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // 1. URL bypass: ?bypass=<token> — auto-authenticate and clean the URL
    const params = new URLSearchParams(window.location.search)
    const bypass = params.get("bypass")
    if (bypass) {
      localStorage.setItem(BYPASS_KEY, bypass)
      params.delete("bypass")
      const clean = window.location.pathname + (params.size ? "?" + params.toString() : "")
      window.history.replaceState({}, "", clean)
      setUnlocked(true)
      return
    }

    // 2. Restore existing session (JWT login or previous bypass)
    if (localStorage.getItem(JWT_KEY) || localStorage.getItem(BYPASS_KEY)) {
      setUnlocked(true)
      return
    }
  }, [])

  if (unlocked) return <>{children}</>

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      })
      const data = await res.json().catch(() => ({})) as { token?: string; error?: string }
      if (!res.ok || !data.token) {
        setError(data.error ?? "Login failed. Check your credentials.")
        return
      }
      localStorage.setItem(JWT_KEY, data.token)
      setUnlocked(true)
    } catch {
      setError("Could not reach server. Is the backend running?")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-8 shadow-2xl">
        {/* Logo / title */}
        <div className="mb-6 text-center">
          <span className="text-3xl">⚽</span>
          <h1 className="mt-2 text-xl font-bold text-white">Highlight Reel Editor</h1>
          <p className="mt-1 text-sm text-neutral-400">Sign in to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="mb-1.5 block text-xs font-medium text-neutral-300">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              autoFocus
              autoComplete="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setError(null) }}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-neutral-700 px-4 py-2.5 text-sm bg-neutral-800 text-white placeholder-neutral-500 outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
            />
          </div>

          <div>
            <label htmlFor="login-password" className="mb-1.5 block text-xs font-medium text-neutral-300">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null) }}
              placeholder="••••••••"
              className={`w-full rounded-lg border px-4 py-2.5 text-sm bg-neutral-800 text-white placeholder-neutral-500 outline-none focus:ring-2 ${
                error
                  ? "border-red-500 focus:ring-red-500/40"
                  : "border-neutral-700 focus:ring-amber-500/40 focus:border-amber-500"
              }`}
            />
            {error && (
              <p className="mt-1.5 text-xs text-red-400">{error}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={!email || !password || loading}
            className="w-full rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  )
}
