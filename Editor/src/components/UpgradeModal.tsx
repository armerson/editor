import { useAuth } from "../context/AuthContext"
import type { Tier } from "../lib/auth"

const TIERS: {
  id: Tier
  name: string
  price: string
  renders: string
  features: string[]
  highlight?: boolean
}[] = [
  {
    id: "free",
    name: "Free",
    price: "£0",
    renders: "2 renders / month",
    features: ["720p output", "QuickCut watermark", "Landscape only"],
  },
  {
    id: "club",
    name: "Club",
    price: "£10 / mo",
    renders: "20 renders / month",
    features: [
      "1080p output",
      "No watermark",
      "All aspect ratios",
      "Save & load projects",
      "Sponsor logo slot",
    ],
    highlight: true,
  },
  {
    id: "pro",
    name: "Pro",
    price: "£25 / mo",
    renders: "Unlimited renders",
    features: [
      "Everything in Club",
      "Multiple team profiles",
      "Priority render queue",
    ],
  },
]

export function UpgradeModal({ onClose }: { onClose: () => void }) {
  const { tier, rendersUsed, renderLimit } = useAuth()
  const isAtLimit = renderLimit !== Infinity && rendersUsed >= renderLimit

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 pt-16">
      <div className="w-full max-w-2xl rounded-2xl border border-neutral-700 bg-neutral-900 p-6 shadow-2xl">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">Upgrade your plan</h2>
            <p className="mt-1 text-sm text-neutral-400">
              {isAtLimit
                ? `You've used all ${renderLimit} renders on the ${tier} plan this month.`
                : `You're on the ${tier} plan.`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1 text-neutral-500 hover:text-white"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tier cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          {TIERS.map((t) => {
            const isCurrent = tier === t.id
            return (
              <div
                key={t.id}
                className={[
                  "flex flex-col rounded-xl border p-4",
                  t.highlight
                    ? "border-amber-500/50 bg-amber-500/5"
                    : "border-neutral-700 bg-neutral-800/50",
                  isCurrent ? "ring-2 ring-white/10" : "",
                ].join(" ")}
              >
                {t.highlight && (
                  <span className="mb-2 inline-block self-start rounded bg-amber-500 px-2 py-0.5 text-xs font-semibold text-black">
                    Most popular
                  </span>
                )}
                <h3 className="font-bold">{t.name}</h3>
                <p className="mt-1 text-2xl font-bold">{t.price}</p>
                <p className="mb-3 text-sm text-neutral-400">{t.renders}</p>

                <ul className="mb-4 flex-1 space-y-1.5">
                  {t.features.map((f) => (
                    <li key={f} className="flex items-start gap-1.5 text-sm text-neutral-300">
                      <svg
                        className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <span className="block w-full rounded-lg border border-neutral-600 py-2 text-center text-sm text-neutral-500">
                    Current plan
                  </span>
                ) : t.id !== "free" ? (
                  <a
                    href={`mailto:hello@quickcut.app?subject=Upgrade to ${t.name} plan`}
                    className={[
                      "block w-full rounded-lg py-2 text-center text-sm font-semibold transition-colors",
                      t.highlight
                        ? "bg-amber-500 text-black hover:bg-amber-400"
                        : "bg-neutral-700 text-white hover:bg-neutral-600",
                    ].join(" ")}
                  >
                    Upgrade to {t.name}
                  </a>
                ) : null}
              </div>
            )
          })}
        </div>

        <p className="mt-4 text-center text-xs text-neutral-600">
          Email us at{" "}
          <a href="mailto:hello@quickcut.app" className="text-neutral-400 hover:text-white">
            hello@quickcut.app
          </a>{" "}
          to upgrade — we'll get you set up same day.
        </p>
      </div>
    </div>
  )
}
