import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import {
  clearAuth,
  decodeJwtClaims,
  getStoredJwt,
  TIER_RENDER_LIMIT,
  type JwtClaims,
  type Tier,
} from "../lib/auth"

export interface AuthUser {
  email: string | null
  tier: Tier
  rendersUsed: number
  renderLimit: number
}

export interface AuthContextValue extends AuthUser {
  logout: () => void
  refreshUser: () => Promise<void>
  incrementRendersUsed: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const API_BASE = (
  (import.meta.env.VITE_RENDER_API_BASE as string | undefined) ?? "http://localhost:3001"
).replace(/\/$/, "")

function claimsToUser(claims: JwtClaims | null): AuthUser {
  const tier: Tier = (claims?.tier as Tier | undefined) ?? "free"
  // Pro is always unlimited on the frontend; the backend sends 9999 as a JSON-safe sentinel.
  const renderLimit = tier === "pro" ? Infinity : (claims?.render_limit ?? TIER_RENDER_LIMIT[tier])
  return {
    email: claims?.email ?? claims?.sub ?? null,
    tier,
    rendersUsed: claims?.renders_used ?? 0,
    renderLimit,
  }
}

export function AuthProvider({
  children,
  onLogout,
}: {
  children: ReactNode
  onLogout: () => void
}) {
  const [user, setUser] = useState<AuthUser>(() => {
    const jwt = getStoredJwt()
    return claimsToUser(jwt ? decodeJwtClaims(jwt) : null)
  })

  // Keep onLogout stable so logout useCallback doesn't recreate on every render
  const onLogoutRef = useRef(onLogout)
  onLogoutRef.current = onLogout

  const logout = useCallback(() => {
    clearAuth()
    onLogoutRef.current()
  }, [])

  const refreshUser = useCallback(async () => {
    const jwt = getStoredJwt()
    if (!jwt) return
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${jwt}` },
      })
      if (res.ok) {
        const data = (await res.json()) as JwtClaims
        setUser(claimsToUser(data))
      }
    } catch {
      // Silently ignore — stale JWT claims are fine as a fallback
    }
  }, [])

  // Refresh on mount to get up-to-date render counts from the server
  useEffect(() => {
    refreshUser()
  }, [refreshUser])

  const incrementRendersUsed = useCallback(() => {
    setUser((u) => ({ ...u, rendersUsed: u.rendersUsed + 1 }))
  }, [])

  return (
    <AuthContext.Provider value={{ ...user, logout, refreshUser, incrementRendersUsed }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}
