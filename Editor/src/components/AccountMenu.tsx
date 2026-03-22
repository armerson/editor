import { useState } from "react"
import { useAuth } from "../context/AuthContext"
import { TIER_COLORS, TIER_LABELS, TIER_RENDER_LIMIT } from "../lib/auth"

export function AccountMenu({ onUpgrade }: { onUpgrade: () => void }) {
  const { email, tier, rendersUsed, renderLimit, logout } = useAuth()
  const [open, setOpen] = useState(false)

  const limit = renderLimit === Infinity ? TIER_RENDER_LIMIT.pro : renderLimit
  const isUnlimited = renderLimit === Infinity
  const rendersLeft = isUnlimited ? Infinity : Math.max(0, renderLimit - rendersUsed)
  const isAtLimit = !isUnlimited && rendersUsed >= renderLimit
  const pct = isUnlimited ? 0 : Math.min(100, (rendersUsed / (limit || 1)) * 100)

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm hover:bg-neutral-800"
      >
        <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${TIER_COLORS[tier]}`}>
          {TIER_LABELS[tier]}
        </span>
        <span className={isAtLimit ? "text-red-400 font-medium" : "text-neutral-400"}>
          {isUnlimited ? "∞" : rendersLeft} renders
        </span>
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />

          <div className="absolute right-0 top-full z-50 mt-1 w-72 rounded-xl border border-neutral-700 bg-neutral-900 p-4 shadow-2xl">
            {/* Email */}
            <p className="mb-3 truncate text-xs text-neutral-500">{email ?? "Signed in"}</p>

            {/* Tier + usage */}
            <div className="mb-1 flex items-center justify-between">
              <span className={`rounded px-2 py-0.5 text-xs font-semibold ${TIER_COLORS[tier]}`}>
                {TIER_LABELS[tier]} plan
              </span>
              <span className="text-sm">
                <span className={isAtLimit ? "font-semibold text-red-400" : "text-white"}>
                  {rendersUsed}
                </span>
                <span className="text-neutral-500">
                  {" "}/ {isUnlimited ? "∞" : renderLimit} renders
                </span>
              </span>
            </div>

            {/* Progress bar */}
            {!isUnlimited && (
              <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-neutral-800">
                <div
                  className={`h-full rounded-full transition-all ${
                    isAtLimit ? "bg-red-500" : pct > 75 ? "bg-amber-500" : "bg-emerald-500"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}

            {/* Upgrade CTA */}
            {tier !== "pro" && (
              <button
                type="button"
                onClick={() => { setOpen(false); onUpgrade() }}
                className="mb-2 w-full rounded-lg bg-amber-500 py-2 text-sm font-semibold text-black hover:bg-amber-400"
              >
                Upgrade plan
              </button>
            )}

            <button
              type="button"
              onClick={logout}
              className="w-full rounded-lg border border-neutral-700 py-1.5 text-sm text-neutral-400 hover:bg-neutral-800 hover:text-white"
            >
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  )
}
