export type Tier = "free" | "club" | "pro"

export const TIER_LABELS: Record<Tier, string> = {
  free: "Free",
  club: "Club",
  pro: "Pro",
}

export const TIER_COLORS: Record<Tier, string> = {
  free: "text-neutral-400 bg-neutral-800",
  club: "text-amber-400 bg-amber-900/40",
  pro: "text-emerald-400 bg-emerald-900/40",
}

export const TIER_RENDER_LIMIT: Record<Tier, number> = {
  free: 2,
  club: 20,
  pro: Infinity,
}

export const JWT_KEY = "auth_jwt"
export const BYPASS_KEY = "beta_token"

export interface JwtClaims {
  sub?: string
  email?: string
  tier?: Tier
  renders_used?: number
  render_limit?: number
  exp?: number
}

/** Decode the payload section of a JWT without verifying the signature. */
export function decodeJwtClaims(token: string): JwtClaims {
  try {
    const payload = token.split(".")[1]
    if (!payload) return {}
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"))
    return JSON.parse(json) as JwtClaims
  } catch {
    return {}
  }
}

export function getStoredJwt(): string | null {
  return localStorage.getItem(JWT_KEY)
}

export function clearAuth(): void {
  localStorage.removeItem(JWT_KEY)
  localStorage.removeItem(BYPASS_KEY)
}

export function getCurrentClaims(): JwtClaims | null {
  const jwt = getStoredJwt()
  if (!jwt) return null
  return decodeJwtClaims(jwt)
}
