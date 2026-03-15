import type { IntroData } from "../types"

type Props = {
  intro: IntroData
  className?: string
}

export function IntroCard({ intro, className = "" }: Props) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-4 bg-neutral-900 px-8 py-12 ${className}`}
    >
      {intro.clubBadgeUrl ? (
        <img
          src={intro.clubBadgeUrl}
          alt="Club badge"
          className="h-24 w-24 shrink-0 rounded-full border-2 border-neutral-600 object-cover sm:h-28 sm:w-28"
        />
      ) : (
        <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-neutral-600 bg-neutral-800 text-neutral-500 sm:h-28 sm:w-28">
          <span className="text-xs">Badge</span>
        </div>
      )}
      <div className="text-center">
        <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
          {intro.teamName || "Team"} vs {intro.opponent || "Opponent"}
        </h2>
        {intro.score && (
          <p className="mt-2 text-3xl font-bold tabular-nums text-yellow-500 sm:text-4xl">
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
