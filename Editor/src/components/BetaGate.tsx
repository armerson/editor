import { type ReactNode, useState, useEffect } from "react"

const STORAGE_KEY = "beta_token"
// VITE_BETA_TOKEN is baked in at build time. If unset the gate is open.
const EXPECTED = import.meta.env.VITE_BETA_TOKEN as string | undefined

type Props = { children: ReactNode }

export function BetaGate({ children }: Props) {
  const [unlocked, setUnlocked] = useState(false)
  const [input, setInput] = useState("")
  const [error, setError] = useState(false)

  useEffect(() => {
    // No token configured → always open
    if (!EXPECTED) { setUnlocked(true); return }
    // Already authenticated in a previous session
    if (localStorage.getItem(STORAGE_KEY) === EXPECTED) setUnlocked(true)
  }, [])

  if (unlocked) return <>{children}</>

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (input === EXPECTED) {
      localStorage.setItem(STORAGE_KEY, input)
      setUnlocked(true)
    } else {
      setError(true)
      setInput("")
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-neutral-800 bg-neutral-900 p-8 shadow-2xl">
        {/* Logo / title */}
        <div className="mb-6 text-center">
          <span className="text-3xl">⚽</span>
          <h1 className="mt-2 text-xl font-bold text-white">Highlight Reel Editor</h1>
          <p className="mt-1 text-sm text-neutral-400">Private beta — enter your access token to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="beta-token" className="mb-1.5 block text-xs font-medium text-neutral-300">
              Access token
            </label>
            <input
              id="beta-token"
              type="password"
              autoFocus
              value={input}
              onChange={(e) => { setInput(e.target.value); setError(false) }}
              placeholder="••••••••"
              className={`w-full rounded-lg border px-4 py-2.5 text-sm bg-neutral-800 text-white placeholder-neutral-500 outline-none focus:ring-2 ${
                error
                  ? "border-red-500 focus:ring-red-500/40"
                  : "border-neutral-700 focus:ring-amber-500/40 focus:border-amber-500"
              }`}
            />
            {error && (
              <p className="mt-1.5 text-xs text-red-400">Incorrect token — please try again.</p>
            )}
          </div>

          <button
            type="submit"
            disabled={!input}
            className="w-full rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Enter
          </button>
        </form>
      </div>
    </div>
  )
}
