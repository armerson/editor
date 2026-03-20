import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import type { DragEndEvent } from "@dnd-kit/core"
import {
  arrayMove,
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { useMemo, useRef, useState } from "react"
import type { Clip, ClipRole, GoalEvent } from "../types"

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

// ── Drag handle icon ──────────────────────────────────────────────────────────

function GripIcon() {
  return (
    <svg
      className="h-3 w-3 shrink-0 text-neutral-500"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
    >
      <circle cx="5" cy="4" r="1.2" />
      <circle cx="5" cy="8" r="1.2" />
      <circle cx="5" cy="12" r="1.2" />
      <circle cx="11" cy="4" r="1.2" />
      <circle cx="11" cy="8" r="1.2" />
      <circle cx="11" cy="12" r="1.2" />
    </svg>
  )
}

// ── Single sortable clip cell ─────────────────────────────────────────────────

const ROLE_BADGE: Record<Exclude<ClipRole, "normal">, { label: string; cls: string }> = {
  intro: { label: "IN", cls: "bg-blue-500/80 text-white" },
  outro: { label: "OUT", cls: "bg-purple-500/80 text-white" },
}

// ── Snapping ──────────────────────────────────────────────────────────────────

/** Seconds within which a dragged trim handle will snap to a target value. */
const SNAP_THRESHOLD_S = 0.3

function snapToTargets(value: number, targets: number[]): number {
  for (const t of targets) {
    if (Math.abs(value - t) <= SNAP_THRESHOLD_S) return t
  }
  return value
}

// ── Trim handle ───────────────────────────────────────────────────────────────

type TrimHandleProps = {
  side: "left" | "right"
  clip: Clip
  pxPerSec: number
  /** Goal times (in clip seconds) used as extra snap targets. */
  goalTimesInClip: number[]
  onTrim: (clipId: string, trimStart: number, trimEnd: number) => void
}

function TrimHandle({ side, clip, pxPerSec, goalTimesInClip, onTrim }: TrimHandleProps) {
  const dragRef = useRef<{ startX: number; startTrim: number } | null>(null)

  return (
    <div
      className={`absolute top-0 bottom-0 z-20 flex w-2.5 items-center justify-center ${
        side === "left" ? "left-0" : "right-0"
      } cursor-ew-resize`}
      onPointerDown={(e) => {
        e.stopPropagation()
        e.currentTarget.setPointerCapture(e.pointerId)
        dragRef.current = {
          startX: e.clientX,
          startTrim: side === "left" ? clip.trimStart : clip.trimEnd,
        }
      }}
      onPointerMove={(e) => {
        if (!dragRef.current) return
        const dSec = (e.clientX - dragRef.current.startX) / pxPerSec
        if (side === "left") {
          // Snap to 0 (clip start) and any goal times in this clip
          const raw = dragRef.current.startTrim + dSec
          const snapped = snapToTargets(raw, [0, ...goalTimesInClip])
          const newStart = Math.max(0, Math.min(snapped, clip.trimEnd - 0.5))
          onTrim(clip.id, newStart, clip.trimEnd)
        } else {
          // Snap to clip natural end and any goal times in this clip
          const raw = dragRef.current.startTrim + dSec
          const snapped = snapToTargets(raw, [clip.duration, ...goalTimesInClip])
          const newEnd = Math.max(clip.trimStart + 0.5, Math.min(clip.duration, snapped))
          onTrim(clip.id, clip.trimStart, newEnd)
        }
      }}
      onPointerUp={(e) => {
        dragRef.current = null
        e.currentTarget.releasePointerCapture(e.pointerId)
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="h-full w-0.5 rounded-full bg-yellow-400/80" />
    </div>
  )
}

// ── Single sortable clip cell ─────────────────────────────────────────────────

type ClipCellProps = {
  clip: Clip
  isSelected: boolean
  hasGoals: boolean
  widthPx: number
  pxPerSec: number
  goalTimesInClip: number[]
  onSelect: (id: string) => void
  onTrim: (clipId: string, trimStart: number, trimEnd: number) => void
}

function ClipCell({ clip, isSelected, hasGoals, widthPx, pxPerSec, goalTimesInClip, onSelect, onTrim }: ClipCellProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: clip.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    width: widthPx,
    minWidth: Math.min(56, widthPx),
    opacity: isDragging ? 0.5 : 1,
  }

  const trimmedDuration = clip.trimEnd - clip.trimStart

  return (
    <button
      ref={setNodeRef}
      style={style}
      type="button"
      onClick={(e) => { e.stopPropagation(); onSelect(clip.id) }}
      className={`group relative flex shrink-0 flex-col overflow-hidden rounded-lg border transition-colors ${
        isSelected
          ? "border-yellow-500 ring-1 ring-yellow-500/40"
          : "border-neutral-700 hover:border-neutral-500"
      } bg-neutral-900`}
      {...attributes}
      {...listeners}
    >
      {/* Role badge (intro / outro only) */}
      {clip.role && clip.role !== "normal" && ROLE_BADGE[clip.role] && (
        <span
          className={`absolute left-1 top-1 z-10 rounded px-1 text-[8px] font-bold leading-none ${ROLE_BADGE[clip.role].cls}`}
        >
          {ROLE_BADGE[clip.role].label}
        </span>
      )}

      {/* Thumbnail */}
      <div className="relative h-8 w-full overflow-hidden bg-neutral-800">
        {clip.thumbnail ? (
          <img
            src={clip.thumbnail}
            alt={clip.name}
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <svg className="h-5 w-5 text-neutral-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
            </svg>
          </div>
        )}
        {/* Upload-status indicator: orange dot if no src http URL */}
        {!clip.url.startsWith("http") && (
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-orange-400 ring-1 ring-neutral-900" title="Not yet uploaded" />
        )}
      </div>

      {/* Label row */}
      <div className="flex items-center justify-between gap-1 px-1.5 py-1">
        <div className="flex min-w-0 items-center gap-1">
          <GripIcon />
          <span className="truncate text-[10px] font-medium text-neutral-300">{clip.name}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1 text-[10px] tabular-nums text-neutral-500">
          {hasGoals && <span title="Has goals">⚽</span>}
          {formatTime(trimmedDuration)}
        </div>
      </div>

      {/* Trim handles — only visible on hover/selection */}
      <TrimHandle side="left" clip={clip} pxPerSec={pxPerSec} goalTimesInClip={goalTimesInClip} onTrim={onTrim} />
      <TrimHandle side="right" clip={clip} pxPerSec={pxPerSec} goalTimesInClip={goalTimesInClip} onTrim={onTrim} />
    </button>
  )
}

// ── Timeline track ────────────────────────────────────────────────────────────

type GoalMarker = GoalEvent & { reelTimeSec: number }

function buildGoalMarkers(
  goals: GoalEvent[],
  clips: Clip[],
  introDurationSeconds: number
): GoalMarker[] {
  let clipStart = introDurationSeconds
  const clipStartTimes: Map<string, { start: number; trimStart: number }> = new Map()

  for (const clip of clips) {
    clipStartTimes.set(clip.id, { start: clipStart, trimStart: clip.trimStart })
    clipStart += Math.max(0, clip.trimEnd - clip.trimStart)
  }

  return goals.flatMap((g) => {
    const info = clipStartTimes.get(g.clipId)
    if (!info) return []
    const reelTimeSec = info.start + (g.timeInClip - info.trimStart)
    return [{ ...g, reelTimeSec }]
  })
}

// ── Intro duration handle ─────────────────────────────────────────────────────

type IntroTrimHandleProps = {
  introDurationSeconds: number
  pxPerSec: number
  onTrimIntro: (newDuration: number) => void
}

function IntroTrimHandle({ introDurationSeconds, pxPerSec, onTrimIntro }: IntroTrimHandleProps) {
  const dragRef = useRef<{ startX: number; startDuration: number } | null>(null)

  return (
    <div
      className="absolute top-0 bottom-0 right-0 z-20 flex w-2.5 items-center justify-center cursor-ew-resize"
      onPointerDown={(e) => {
        e.stopPropagation()
        e.currentTarget.setPointerCapture(e.pointerId)
        dragRef.current = { startX: e.clientX, startDuration: introDurationSeconds }
      }}
      onPointerMove={(e) => {
        if (!dragRef.current) return
        const dSec = (e.clientX - dragRef.current.startX) / pxPerSec
        const clamped = Math.max(1, Math.min(10, dragRef.current.startDuration + dSec))
        onTrimIntro(clamped)
      }}
      onPointerUp={(e) => {
        dragRef.current = null
        e.currentTarget.releasePointerCapture(e.pointerId)
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="h-full w-0.5 rounded-full bg-yellow-400/80" />
    </div>
  )
}

// ── Timeline track props ──────────────────────────────────────────────────────

type Props = {
  clips: Clip[]
  goals: GoalEvent[]
  selectedClipId: string | null
  introSelected: boolean
  outroSelected: boolean
  currentReelTime: number
  introDurationSeconds: number
  outroDurationSeconds: number
  onSelectClip: (id: string) => void
  onSelectIntro: () => void
  onSelectOutro: () => void
  onTrimIntro: (newDuration: number) => void
  onReorder: (from: number, to: number) => void
  onTrimClip: (clipId: string, trimStart: number, trimEnd: number) => void
  /** If provided, clicking the timeline background at a time position opens the
   *  goal dialog at that reel position. */
  onAddGoalAtReelTime?: (reelTimeSec: number) => void
}

const MIN_PX_PER_SEC = 20
const MAX_PX_PER_SEC = 120
const DEFAULT_PX_PER_SEC = 36

export function TimelineTrack({
  clips,
  goals,
  selectedClipId,
  introSelected,
  outroSelected,
  currentReelTime,
  introDurationSeconds,
  outroDurationSeconds,
  onSelectClip,
  onSelectIntro,
  onSelectOutro,
  onTrimIntro,
  onReorder,
  onTrimClip,
  onAddGoalAtReelTime,
}: Props) {
  const [pxPerSec, setPxPerSec] = useState(DEFAULT_PX_PER_SEC)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  // Map clipId → goal times (in clip seconds) for snapping and ClipCell badge
  const goalTimesByClip = useMemo(() => {
    const m = new Map<string, number[]>()
    for (const g of goals) {
      const existing = m.get(g.clipId) ?? []
      existing.push(g.timeInClip)
      m.set(g.clipId, existing)
    }
    return m
  }, [goals])

  const introDuration = introDurationSeconds
  const outroDuration = outroDurationSeconds
  const clipsTrimmedDuration = clips.reduce(
    (s, c) => s + Math.max(0, c.trimEnd - c.trimStart),
    0
  )
  const totalReelDuration = introDuration + clipsTrimmedDuration + outroDuration
  const timelineWidthPx = Math.max(totalReelDuration * pxPerSec, 320)

  const goalMarkers = buildGoalMarkers(goals, clips, introDuration)

  // Time ruler ticks
  const step = totalReelDuration <= 15 ? 2 : totalReelDuration <= 45 ? 5 : 10
  const ticks: number[] = []
  for (let t = 0; t <= Math.ceil(totalReelDuration); t += step) ticks.push(t)

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = clips.findIndex((c) => c.id === active.id)
    const newIndex = clips.findIndex((c) => c.id === over.id)
    if (oldIndex !== -1 && newIndex !== -1) onReorder(oldIndex, newIndex)
  }

  if (clips.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-700 bg-neutral-900 p-4 text-sm text-neutral-400">
        Your uploaded clips will appear here.
      </div>
    )
  }

  return (
    <div>
      {/* Zoom control */}
      <div className="mb-1.5 flex items-center gap-2">
        <svg className="h-3 w-3 shrink-0 text-neutral-500" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <path d="M6.5 1a5.5 5.5 0 100 11A5.5 5.5 0 006.5 1zM0 6.5a6.5 6.5 0 1111.56 4.06l3.69 3.69a.75.75 0 11-1.06 1.06l-3.69-3.69A6.5 6.5 0 010 6.5zM5 4.75a.75.75 0 011.5 0V6h1.25a.75.75 0 010 1.5H6.5v1.25a.75.75 0 01-1.5 0V7.5H3.75a.75.75 0 010-1.5H5V4.75z" />
        </svg>
        <input
          type="range"
          min={MIN_PX_PER_SEC}
          max={MAX_PX_PER_SEC}
          step={4}
          value={pxPerSec}
          onChange={(e) => setPxPerSec(Number(e.target.value))}
          className="h-1 w-24 cursor-pointer accent-yellow-500"
          title={`Timeline zoom: ${pxPerSec}px/s`}
        />
        <span className="text-[10px] tabular-nums text-neutral-500">{totalReelDuration > 0 ? `${Math.round(totalReelDuration)}s` : ""}</span>
      </div>

      <div className="overflow-x-auto pb-2">
      <div
        className={`relative${onAddGoalAtReelTime ? " cursor-crosshair" : ""}`}
        style={{ width: timelineWidthPx, minWidth: "100%" }}
        onClick={(e) => {
          if (!onAddGoalAtReelTime || totalReelDuration <= 0) return
          const rect = e.currentTarget.getBoundingClientRect()
          const offsetX = e.clientX - rect.left
          const reelTimeSec = (offsetX / timelineWidthPx) * totalReelDuration
          onAddGoalAtReelTime(Math.max(0, Math.min(reelTimeSec, totalReelDuration)))
        }}
      >
        {/* Time ruler */}
        <div className="relative mb-1 h-5 border-b border-neutral-700 bg-neutral-950">
          {ticks.map((t) => (
            <div
              key={t}
              className="absolute bottom-0 flex flex-col items-start"
              style={{ left: (t / totalReelDuration) * timelineWidthPx }}
            >
              <span className="pl-0.5 text-[10px] text-neutral-500">{formatTime(t)}</span>
              <div className="h-1.5 w-px bg-neutral-600" />
            </div>
          ))}
        </div>

        {/* Segments row */}
        <div className="relative flex gap-px">
          {/* Intro block */}
          {introDuration > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSelectIntro() }}
              className={`group relative flex shrink-0 flex-col overflow-hidden rounded-lg border transition-colors ${
                introSelected
                  ? "border-yellow-500 ring-1 ring-yellow-500/40"
                  : "border-blue-800 hover:border-blue-600"
              } bg-blue-950/60`}
              style={{ width: Math.max(32, (introDuration / totalReelDuration) * timelineWidthPx) }}
            >
              <div className="flex h-8 w-full items-center justify-center bg-blue-900/30">
                <span className="text-[10px] font-bold tracking-wide text-blue-300">INTRO</span>
              </div>
              <div className="flex items-center justify-center px-1.5 py-1">
                <span className="text-[10px] tabular-nums text-blue-400">{introDuration.toFixed(1)}s</span>
              </div>
              <IntroTrimHandle
                introDurationSeconds={introDuration}
                pxPerSec={pxPerSec}
                onTrimIntro={onTrimIntro}
              />
            </button>
          )}

          {/* Sortable clips */}
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={clips.map((c) => c.id)}
              strategy={horizontalListSortingStrategy}
            >
              <div className="flex gap-px">
                {clips.map((clip) => {
                  const trimmedDuration = Math.max(0, clip.trimEnd - clip.trimStart)
                  const widthPx =
                    totalReelDuration > 0
                      ? Math.max(56, (trimmedDuration / totalReelDuration) * timelineWidthPx)
                      : 80
                  const hasGoals = goals.some((g) => g.clipId === clip.id)
                  return (
                    <ClipCell
                      key={clip.id}
                      clip={clip}
                      isSelected={selectedClipId === clip.id}
                      hasGoals={hasGoals}
                      widthPx={widthPx}
                      pxPerSec={pxPerSec}
                      goalTimesInClip={goalTimesByClip.get(clip.id) ?? []}
                      onSelect={onSelectClip}
                      onTrim={onTrimClip}
                    />
                  )
                })}
              </div>
            </SortableContext>
          </DndContext>

          {/* Outro block */}
          {outroDuration > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSelectOutro() }}
              className={`relative flex shrink-0 flex-col overflow-hidden rounded-lg border transition-colors ${
                outroSelected
                  ? "border-yellow-500 ring-1 ring-yellow-500/40"
                  : "border-purple-800 hover:border-purple-600"
              } bg-purple-950/60`}
              style={{ width: Math.max(32, (outroDuration / totalReelDuration) * timelineWidthPx) }}
            >
              <div className="flex h-8 w-full items-center justify-center bg-purple-900/30">
                <span className="text-[10px] font-bold tracking-wide text-purple-300">OUTRO</span>
              </div>
              <div className="flex items-center justify-center px-1.5 py-1">
                <span className="text-[10px] tabular-nums text-purple-400">{outroDuration.toFixed(1)}s</span>
              </div>
            </button>
          )}
        </div>

        {/* Goal markers */}
        {goalMarkers.map((gm) => {
          const leftPx = totalReelDuration > 0
            ? (gm.reelTimeSec / totalReelDuration) * timelineWidthPx
            : 0
          return (
            <div
              key={gm.id}
              className="pointer-events-none absolute bottom-0 z-20"
              style={{ left: leftPx - 8, top: 0 }}
              title={`⚽ ${gm.scorerName} (${gm.side}) @ ${gm.reelTimeSec.toFixed(1)}s`}
            >
              <div className="flex flex-col items-center">
                <div className="rounded bg-yellow-500/90 px-1 py-0.5 text-[9px] font-bold text-black leading-none whitespace-nowrap">
                  ⚽
                </div>
                <div className="h-full w-px bg-yellow-500/60" style={{ height: 40 }} />
              </div>
            </div>
          )
        })}

        {/* Playhead */}
        {totalReelDuration > 0 && (
          <div
            className="pointer-events-none absolute top-0 bottom-0 z-10 w-0.5 bg-yellow-500 shadow-[0_0_6px_rgba(234,179,8,0.8)]"
            style={{
              left: Math.min(
                (currentReelTime / totalReelDuration) * timelineWidthPx,
                timelineWidthPx - 2
              ),
            }}
          >
            <div className="absolute -left-1.5 top-0 h-2 w-3 border-b-4 border-l-4 border-r-4 border-b-yellow-500 border-l-transparent border-r-transparent" />
          </div>
        )}
      </div>
    </div>
    </div>
  )
}

/** Re-export arrayMove for use in App */
export { arrayMove }
