import type { IntroData } from "../types"

type Props = {
  intro: IntroData
  className?: string
}

function BadgePlaceholder({ label }: { label: string }) {
  return (
    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-neutral-600 bg-neutral-800 text-neutral-500 sm:h-24 sm:w-24">
      <span className="text-xs">{label}</span>
    </div>
  )
}

function BadgeImg({ src, alt }: { src: string; alt: string }) {
  return (
    <img
      src={src}
      alt={alt}
      className="h-20 w-20 shrink-0 rounded-full border-2 border-neutral-600 object-cover sm:h-24 sm:w-24"
    />
  )
}

export function IntroCard({ intro, className = "" }: Props) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-5 bg-neutral-900 px-8 py-12 ${className}`}
    >
      {/* Dual badge row */}
      <div className="flex items-center gap-5 sm:gap-8">
        <div className="flex flex-col items-center gap-1.5">
          {intro.homeBadgeUrl ? (
            <BadgeImg src={intro.homeBadgeUrl} alt={intro.teamName || "Home"} />
          ) : (
            <BadgePlaceholder label="Home" />
          )}
          <span className="max-w-[80px] truncate text-center text-[11px] font-medium text-neutral-400">
            {intro.teamName || "Home"}
          </span>
        </div>

        <span className="text-xl font-bold text-neutral-500">vs</span>

        <div className="flex flex-col items-center gap-1.5">
          {intro.awayBadgeUrl ? (
            <BadgeImg src={intro.awayBadgeUrl} alt={intro.opponent || "Away"} />
          ) : (
            <BadgePlaceholder label="Away" />
          )}
          <span className="max-w-[80px] truncate text-center text-[11px] font-medium text-neutral-400">
            {intro.opponent || "Away"}
          </span>
        </div>
      </div>

      {/* Score and metadata */}
      <div className="text-center">
        {intro.score && (
          <p className="text-3xl font-bold tabular-nums text-yellow-500 sm:text-4xl">
            {intro.score}
          </p>
        )}
        {intro.matchDate && (
          <p className="mt-2 text-sm text-neutral-400">{intro.matchDate}</p>
        )}
        {intro.ageGroup && (
          <p className="mt-1 text-sm text-neutral-500">{intro.ageGroup}</p>
        )}
      </div>
    </div>
  )
}
