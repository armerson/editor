import type { ScoreboardData, GoalEvent, Clip } from "../types"

type Props = {
  scoreboard: ScoreboardData
  minuteMarker: string
  goals: GoalEvent[]
  clips: Clip[]
  clipId: string
  currentTimeInClip: number
  showScorerAfterGoal: boolean
  className?: string
}

export function ScoreboardOverlay({
  scoreboard,
  minuteMarker,
  goals,
  clips,
  clipId,
  currentTimeInClip,
  showScorerAfterGoal,
  className = "",
}: Props) {
  const currentClipIndex = clips.findIndex((c) => c.id === clipId)
  const previousClipIds =
    currentClipIndex === -1 ? [] : clips.slice(0, currentClipIndex).map((c) => c.id)

  const previousGoals = goals.filter((g) => previousClipIds.includes(g.clipId))
  const currentClipGoalsUpToNow = goals.filter(
    (g) => g.clipId === clipId && g.timeInClip <= currentTimeInClip
  )
  const allGoalsUpToNow = [...previousGoals, ...currentClipGoalsUpToNow]

  const homeGoals = allGoalsUpToNow.filter((g) => g.side === "home").length
  const awayGoals = allGoalsUpToNow.filter((g) => g.side === "away").length

  const displayHome = scoreboard.homeScore + homeGoals
  const displayAway = scoreboard.awayScore + awayGoals

  const latestGoalSoFar =
    allGoalsUpToNow.length > 0
      ? [...allGoalsUpToNow].sort((a, b) => {
          const ai = clips.findIndex((c) => c.id === a.clipId)
          const bi = clips.findIndex((c) => c.id === b.clipId)
          if (ai !== bi) return bi - ai
          return b.timeInClip - a.timeInClip
        })[0]
      : null

  return (
    <div
      className={`absolute left-3 top-3 z-10 rounded-lg bg-black/70 px-3 py-2 shadow-lg ${className}`}
      style={{ minWidth: 140 }}
    >
      <div className="flex items-center justify-between gap-4 text-sm font-medium text-white">
        <span className="truncate">{scoreboard.homeTeamName || "Home"}</span>
        <span className="tabular-nums shrink-0">
          {displayHome} – {displayAway}
        </span>
        <span className="truncate text-right">{scoreboard.awayTeamName || "Away"}</span>
      </div>

      {minuteMarker && (
        <div className="mt-1 border-t border-white/20 pt-1 text-xs text-white/90">
          {minuteMarker}
        </div>
      )}

      {showScorerAfterGoal && latestGoalSoFar && (
        <div className="mt-1 border-t border-white/20 pt-1 text-xs text-yellow-400/95">
          ⚽ {latestGoalSoFar.scorerName}
        </div>
      )}
    </div>
  )
}
