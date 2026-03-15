import { useEffect, useRef, useState } from "react"
import type { ChangeEvent } from "react"
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
import { isFirebaseConfigured, uploadMediaToStorage } from "./firebase"
import { validateProjectForExport } from "./lib/validateProject"
import { getRenderStatus, startRender } from "./lib/renderApi"

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

const PROJECT_STORAGE_KEY = "ambassadors-fc-highlight-editor-project"
const DRAFT_STORAGE_KEY = "ambassadors-fc-highlight-editor-draft"
const SAVE_LOAD_STATUS_DURATION_MS = 3000

export type IntroData = {
  teamName: string
  opponent: string
  score: string
  matchDate: string
  ageGroup: string
  clubBadgeUrl: string
  durationSeconds: number
}

const DEFAULT_INTRO: IntroData = {
  teamName: "Ambassadors FC",
  opponent: "",
  score: "",
  matchDate: "",
  ageGroup: "",
  clubBadgeUrl: "",
  durationSeconds: 2,
}

type IntroCardProps = {
  intro: IntroData
  className?: string
}

function IntroCard({ intro, className = "" }: IntroCardProps) {
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

type ScoreboardData = {
  homeTeamName: string
  awayTeamName: string
  homeScore: number
  awayScore: number
}

type GoalEvent = {
  id: string
  clipId: string
  timeInClip: number
  side: "home" | "away"
  scorerName: string
}

/** Serializable project for save/load. Blob URLs are not persisted as stable render sources. */
export type ProjectData = {
  version: number
  projectTitle: string
  clips: Array<{
    id: string
    name: string
    thumbnail?: string
    duration: number
    trimStart: number
    trimEnd: number
    showScoreboard: boolean
    minuteMarker: string
    showScorerAfterGoal: boolean
    src?: string
  }>
  intro: IntroData
  scoreboard: ScoreboardData
  goals: GoalEvent[]
  lowerThird?: {
    defaultShowScoreboard: boolean
    defaultShowScorerAfterGoal: boolean
  }
  music: {
    musicFileName: string
    musicVolume: number
    musicStartInReel: number
    musicStartInTrack: number
    musicEndInReel: number | ""
    fadeOutDuration: number
    clipAudioOn: boolean
    musicUrl?: string
  }
  transitions?: Array<{ type?: string; durationSeconds?: number }>
}

type Clip = {
  id: string
  name: string
  url: string
  thumbnail: string
  duration: number
  trimStart: number
  trimEnd: number
  showScoreboard: boolean
  minuteMarker: string
  showScorerAfterGoal: boolean
}

type ScoreboardOverlayProps = {
  scoreboard: ScoreboardData
  minuteMarker: string
  goals: GoalEvent[]
  clips: Clip[]
  clipId: string
  currentTimeInClip: number
  showScorerAfterGoal: boolean
  className?: string
}

function ScoreboardOverlay({
  scoreboard,
  minuteMarker,
  goals,
  clips,
  clipId,
  currentTimeInClip,
  showScorerAfterGoal,
  className = "",
}: ScoreboardOverlayProps) {
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
          const clipAIndex = clips.findIndex((c) => c.id === a.clipId)
          const clipBIndex = clips.findIndex((c) => c.id === b.clipId)

          if (clipAIndex !== clipBIndex) return clipBIndex - clipAIndex
          return b.timeInClip - a.timeInClip
        })[0]
      : null

  return (
    <div
      className={`absolute left-3 top-3 z-10 rounded-lg bg-black/70 px-3 py-2 shadow-lg ${className}`}
      style={{ minWidth: "140px" }}
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

type TimelineClipProps = {
  clip: Clip
  isSelected: boolean
  onSelect: (id: string) => void
  widthPx: number
}

function TimelineClip({ clip, isSelected, onSelect, widthPx }: TimelineClipProps) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: clip.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    width: widthPx,
    minWidth: Math.min(80, widthPx),
  }

  return (
    <button
      ref={setNodeRef}
      style={style}
      type="button"
      onClick={() => onSelect(clip.id)}
      className={`shrink-0 rounded-xl border p-3 text-left ${
        isSelected
          ? "border-yellow-500 bg-neutral-800"
          : "border-neutral-800 bg-neutral-900"
      }`}
      {...attributes}
      {...listeners}
    >
      {clip.thumbnail ? (
        <img
          src={clip.thumbnail}
          className="mb-2 h-12 w-full rounded object-cover"
          alt={clip.name}
        />
      ) : (
        <div className="mb-2 h-12 w-full rounded bg-neutral-800" />
      )}
      <p className="truncate text-sm">{clip.name}</p>
    </button>
  )
}

function revokeIfBlobUrl(url?: string | null) {
  if (url && url.startsWith("blob:")) {
    URL.revokeObjectURL(url)
  }
}

export default function App() {
  const [clips, setClips] = useState<Clip[]>([])
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null)
  const [isPlayingReel, setIsPlayingReel] = useState(false)
  const [showIntroCard, setShowIntroCard] = useState(false)
  const [intro, setIntro] = useState<IntroData>(() => ({ ...DEFAULT_INTRO }))
  const [scoreboard, setScoreboard] = useState<ScoreboardData>(() => ({
    homeTeamName: DEFAULT_INTRO.teamName,
    awayTeamName: "",
    homeScore: 0,
    awayScore: 0,
  }))
  const [musicTrack, setMusicTrack] = useState<{ name: string; url: string } | null>(null)
  const [musicVolume, setMusicVolume] = useState(0.7)
  const [musicStartInReel, setMusicStartInReel] = useState(0)
  const [musicStartInTrack, setMusicStartInTrack] = useState(0)
  const [musicEndInReel, setMusicEndInReel] = useState<number | "">("")
  const [fadeOutDuration, setFadeOutDuration] = useState(1)
  const [clipAudioOn, setClipAudioOn] = useState(true)
  const [goals, setGoals] = useState<GoalEvent[]>([])
  const [pendingGoal, setPendingGoal] = useState<{ clipId: string; timeInClip: number } | null>(null)
  const [videoCurrentTime, setVideoCurrentTime] = useState(0)
  const [goalScorerSide, setGoalScorerSide] = useState<"home" | "away">("home")
  const [goalScorerName, setGoalScorerName] = useState("")
  const [currentReelTime, setCurrentReelTime] = useState(0)
  const [projectTitle, setProjectTitle] = useState("Untitled Project")
  const [saveLoadStatus, setSaveLoadStatus] = useState<string | null>(null)
  const [exportErrors, setExportErrors] = useState<string[]>([])

  type RenderState = {
    status: "idle" | "submitting" | "rendering" | "done" | "error"
    jobId: string | null
    progress: number
    downloadUrl: string | null
    error: string | null
  }

  const [renderState, setRenderState] = useState<RenderState>({
    status: "idle",
    jobId: null,
    progress: 0,
    downloadUrl: null,
    error: null,
  })

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const badgeInputRef = useRef<HTMLInputElement | null>(null)
  const musicInputRef = useRef<HTMLInputElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const reelStartTimeRef = useRef<number>(0)
  const musicStartedThisReelRef = useRef(false)
  const fadeOutStartedRef = useRef(false)
  const rafIdRef = useRef<number>(0)
  const isPlayingReelRef = useRef(false)
  const musicVolumeRef = useRef(musicVolume)
  musicVolumeRef.current = musicVolume

  function buildProjectFromState(): ProjectData {
    return {
      version: 1,
      projectTitle,
      clips: clips.map((c) => ({
        id: c.id,
        name: c.name,
        duration: c.duration,
        trimStart: c.trimStart,
        trimEnd: c.trimEnd,
        showScoreboard: c.showScoreboard,
        minuteMarker: c.minuteMarker,
        showScorerAfterGoal: c.showScorerAfterGoal,
        ...(c.url.startsWith("http") ? { src: c.url } : {}),
        ...(c.thumbnail.startsWith("http") ? { thumbnail: c.thumbnail } : {}),
      })),
      intro: {
        ...intro,
        clubBadgeUrl: intro.clubBadgeUrl.startsWith("http") ? intro.clubBadgeUrl : "",
      },
      scoreboard: { ...scoreboard },
      goals: [...goals],
      lowerThird: {
        defaultShowScoreboard: true,
        defaultShowScorerAfterGoal: true,
      },
      music: {
        musicFileName: musicTrack?.name ?? "",
        musicVolume,
        musicStartInReel,
        musicStartInTrack,
        musicEndInReel,
        fadeOutDuration,
        clipAudioOn,
        ...(musicTrack?.url && musicTrack.url.startsWith("http") ? { musicUrl: musicTrack.url } : {}),
      },
      transitions: clips.map(() => ({ type: "cut", durationSeconds: 0 })),
    }
  }

  function applyProjectToState(project: ProjectData) {
    setProjectTitle(project.projectTitle)
    setClips(
      project.clips.map((c) => ({
        ...c,
        url: c.src ?? "",
        thumbnail: c.thumbnail ?? "",
      }))
    )
    setIntro(project.intro)
    setScoreboard(project.scoreboard)
    setGoals(project.goals)
    const musicUrl = project.music.musicUrl
    setMusicTrack(
      musicUrl ? { name: project.music.musicFileName || "Track", url: musicUrl } : null
    )
    setMusicVolume(project.music.musicVolume)
    setMusicStartInReel(project.music.musicStartInReel)
    setMusicStartInTrack(project.music.musicStartInTrack)
    setMusicEndInReel(project.music.musicEndInReel)
    setFadeOutDuration(project.music.fadeOutDuration)
    setClipAudioOn(project.music.clipAudioOn)
    setSelectedClipId(project.clips[0]?.id ?? null)
    setIsPlayingReel(false)
    setShowIntroCard(false)
    setPendingGoal(null)
  }

  const handleSaveProject = () => {
    try {
      const project = buildProjectFromState()
      localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(project))
      setSaveLoadStatus("Project saved")
      setTimeout(() => setSaveLoadStatus(null), SAVE_LOAD_STATUS_DURATION_MS)
    } catch (err) {
      console.error("Save project failed:", err)
      const msg =
        err instanceof DOMException && err.name === "QuotaExceededError"
          ? "Save failed - browser storage limit reached"
          : "Save failed"
      setSaveLoadStatus(msg)
      setTimeout(() => setSaveLoadStatus(null), SAVE_LOAD_STATUS_DURATION_MS)
    }
  }

  const handleSaveDraft = () => {
    try {
      const project = buildProjectFromState()
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(project))
      setSaveLoadStatus("Draft saved")
      setTimeout(() => setSaveLoadStatus(null), SAVE_LOAD_STATUS_DURATION_MS)
    } catch (err) {
      console.error("Save draft failed:", err)
      const msg =
        err instanceof DOMException && err.name === "QuotaExceededError"
          ? "Save failed - browser storage limit reached"
          : "Save failed"
      setSaveLoadStatus(msg)
      setTimeout(() => setSaveLoadStatus(null), SAVE_LOAD_STATUS_DURATION_MS)
    }
  }

  const handleLoadProject = () => {
    try {
      const raw = localStorage.getItem(PROJECT_STORAGE_KEY)
      if (!raw) {
        setSaveLoadStatus("No saved project")
        setTimeout(() => setSaveLoadStatus(null), SAVE_LOAD_STATUS_DURATION_MS)
        return
      }
      const project = JSON.parse(raw) as ProjectData
      if (!project || !project.version || !Array.isArray(project.clips)) {
        setSaveLoadStatus("Invalid project")
        setTimeout(() => setSaveLoadStatus(null), SAVE_LOAD_STATUS_DURATION_MS)
        return
      }
      applyProjectToState(project)
      setSaveLoadStatus("Project loaded")
      setTimeout(() => setSaveLoadStatus(null), SAVE_LOAD_STATUS_DURATION_MS)
    } catch {
      setSaveLoadStatus("Load failed")
      setTimeout(() => setSaveLoadStatus(null), SAVE_LOAD_STATUS_DURATION_MS)
    }
  }

  // Downloads project JSON locally. Does not render video.
  const handleExportProject = () => {
    try {
      const project = buildProjectFromState()
      const errors = validateProjectForExport(project)
      setExportErrors(errors)
      if (errors.length > 0) {
        alert(errors.join("\n"))
        setSaveLoadStatus("Cannot export")
        setTimeout(() => setSaveLoadStatus(null), SAVE_LOAD_STATUS_DURATION_MS)
        return
      }
      const json = JSON.stringify(project, null, 2)
      const blob = new Blob([json], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const name =
        project.projectTitle.trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-") ||
        "highlight-project"
      const filename = `${name}.json`
      const a = document.createElement("a")
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      setSaveLoadStatus("Project exported")
      setTimeout(() => setSaveLoadStatus(null), SAVE_LOAD_STATUS_DURATION_MS)
    } catch {
      setSaveLoadStatus("Export failed")
      setTimeout(() => setSaveLoadStatus(null), SAVE_LOAD_STATUS_DURATION_MS)
    }
  }

  const handleRenderVideo = async () => {
    try {
      const project = buildProjectFromState()
      const errors = validateProjectForExport(project)
      setExportErrors(errors)
      if (errors.length > 0) {
        alert(errors.join("\n"))
        setSaveLoadStatus("Cannot render")
        setTimeout(() => setSaveLoadStatus(null), SAVE_LOAD_STATUS_DURATION_MS)
        return
      }

      if (renderState.status === "submitting" || renderState.status === "rendering") return

      setRenderState({
        status: "submitting",
        jobId: null,
        progress: 0,
        downloadUrl: null,
        error: null,
      })

      const { jobId } = await startRender(project)
      setRenderState({
        status: "rendering",
        jobId,
        progress: 0,
        downloadUrl: null,
        error: null,
      })
    } catch (err) {
      console.error("Render start failed:", err)
      setRenderState({
        status: "error",
        jobId: null,
        progress: 0,
        downloadUrl: null,
        error: err instanceof Error ? err.message : "Render start failed",
      })
    }
  }

  useEffect(() => {
    if (renderState.status !== "rendering" || !renderState.jobId) return

    let cancelled = false
    let timeoutId: number | undefined

    const poll = async () => {
      try {
        const res = await getRenderStatus(renderState.jobId!)
        if (cancelled) return

        if (res.status === "queued" || res.status === "rendering") {
          setRenderState((prev) => ({
            ...prev,
            status: res.status,
            progress: res.progress ?? prev.progress,
          }))
          timeoutId = window.setTimeout(poll, 2000)
          return
        }

        if (res.status === "done") {
          setRenderState({
            status: "done",
            jobId: renderState.jobId,
            progress: res.progress ?? 100,
            downloadUrl: res.downloadUrl ?? null,
            error: null,
          })
          return
        }

        setRenderState({
          status: "error",
          jobId: renderState.jobId,
          progress: res.progress ?? renderState.progress,
          downloadUrl: null,
          error: res.error ?? "Render failed",
        })
      } catch (err) {
        console.error("Render status poll failed:", err)
        setRenderState((prev) => ({
          ...prev,
          status: "error",
          error: err instanceof Error ? err.message : "Render status failed",
        }))
      }
    }

    timeoutId = window.setTimeout(poll, 2000)

    return () => {
      cancelled = true
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
    }
  }, [renderState.status, renderState.jobId])

  useEffect(() => {
    // Clear export errors when project changes; they will be recomputed on export.
    if (exportErrors.length > 0) {
      setExportErrors([])
    }
  }, [
    clips,
    intro,
    scoreboard,
    goals,
    musicTrack,
    musicVolume,
    musicStartInReel,
    musicStartInTrack,
    musicEndInReel,
    fadeOutDuration,
    clipAudioOn,
    projectTitle,
  ])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleBadgeUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (isFirebaseConfigured()) {
      try {
        const url = await uploadMediaToStorage("badge", file, crypto.randomUUID())
        setIntro((prev) => {
          revokeIfBlobUrl(prev.clubBadgeUrl)
          return { ...prev, clubBadgeUrl: url }
        })
        setSaveLoadStatus("Badge uploaded")
        setTimeout(() => setSaveLoadStatus(null), SAVE_LOAD_STATUS_DURATION_MS)
      } catch (err) {
        console.error("Badge upload failed:", err)
        const url = URL.createObjectURL(file)
        setIntro((prev) => {
          revokeIfBlobUrl(prev.clubBadgeUrl)
          return { ...prev, clubBadgeUrl: url }
        })
        setSaveLoadStatus("Badge upload failed - using local preview")
        setTimeout(() => setSaveLoadStatus(null), SAVE_LOAD_STATUS_DURATION_MS)
      }
    } else {
      const url = URL.createObjectURL(file)
      setIntro((prev) => {
        revokeIfBlobUrl(prev.clubBadgeUrl)
        return { ...prev, clubBadgeUrl: url }
      })
      setSaveLoadStatus("Firebase not configured - using local badge")
      setTimeout(() => setSaveLoadStatus(null), SAVE_LOAD_STATUS_DURATION_MS)
    }

    e.target.value = ""
  }

  const handleMusicUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (isFirebaseConfigured()) {
      try {
        console.log("[music] starting upload", {
          name: file.name,
        })
        const url = await uploadMediaToStorage("music", file, crypto.randomUUID())
        setMusicTrack((prev) => {
          revokeIfBlobUrl(prev?.url)
          console.log("[music] upload succeeded", {
            name: file.name,
            downloadUrl: url,
          })
          return { name: file.name, url }
        })
        setSaveLoadStatus("Music uploaded")
        setTimeout(() => setSaveLoadStatus(null), SAVE_LOAD_STATUS_DURATION_MS)
      } catch (err) {
        console.error("[music] upload failed:", err)
        const url = URL.createObjectURL(file)
        setMusicTrack((prev) => {
          revokeIfBlobUrl(prev?.url)
          return { name: file.name, url }
        })
        setSaveLoadStatus("Music upload failed - using local preview")
        setTimeout(() => setSaveLoadStatus(null), SAVE_LOAD_STATUS_DURATION_MS)
      }
    } else {
      const url = URL.createObjectURL(file)
      setMusicTrack((prev) => {
        revokeIfBlobUrl(prev?.url)
        return { name: file.name, url }
      })
      setSaveLoadStatus("Firebase not configured - using local music")
      setTimeout(() => setSaveLoadStatus(null), SAVE_LOAD_STATUS_DURATION_MS)
    }

    e.target.value = ""
  }

  const generateThumbnail = (file: File): Promise<{ thumbnail: string; duration: number }> => {
    return new Promise((resolve) => {
      const video = document.createElement("video")
      const canvas = document.createElement("canvas")
      const url = URL.createObjectURL(file)

      video.src = url
      video.muted = true
      video.playsInline = true
      video.preload = "metadata"

      let duration = 0

      video.onloadedmetadata = () => {
        duration = Number.isFinite(video.duration) ? video.duration : 0
        const targetTime = Math.min(1, Math.max(0.1, video.duration / 4 || 0.1))
        video.currentTime = targetTime
      }

      video.onseeked = () => {
        canvas.width = video.videoWidth || 320
        canvas.height = video.videoHeight || 180

        const ctx = canvas.getContext("2d")
        if (!ctx) {
          URL.revokeObjectURL(url)
          resolve({ thumbnail: "", duration })
          return
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const thumbnail = canvas.toDataURL("image/png")
        URL.revokeObjectURL(url)
        resolve({ thumbnail, duration })
      }

      video.onerror = () => {
        URL.revokeObjectURL(url)
        resolve({ thumbnail: "", duration: 0 })
      }
    })
  }

  const handleFilesSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files) return

    const newClips: Clip[] = []
    const fileArray = Array.from(files)

    for (const file of fileArray) {
      const { thumbnail, duration } = await generateThumbnail(file)
      const safeDuration = Math.max(0, duration)
      const id = crypto.randomUUID()
      const blobUrl = URL.createObjectURL(file)

      newClips.push({
        id,
        name: file.name,
        url: blobUrl,
        thumbnail,
        duration: safeDuration,
        trimStart: 0,
        trimEnd: safeDuration,
        showScoreboard: true,
        minuteMarker: "",
        showScorerAfterGoal: true,
      })
    }

    setClips((prev) => {
      const updated = [...prev, ...newClips]
      if (!selectedClipId && updated.length > 0) {
        setSelectedClipId(updated[0].id)
      }
      return updated
    })

    if (isFirebaseConfigured()) {
      fileArray.forEach((file, i) => {
        const clip = newClips[i]
        console.log("[clips] starting upload", {
          clipId: clip.id,
          name: file.name,
          localUrl: clip.url,
        })
        uploadMediaToStorage("clips", file, clip.id)
          .then((url) => {
            console.log("[clips] upload succeeded", {
              clipId: clip.id,
              name: file.name,
              downloadUrl: url,
            })
            setClips((prev) => {
              const updated = prev.map((c) =>
                c.id === clip.id ? { ...c, url } : c
              )
              const updatedClip = updated.find((c) => c.id === clip.id)
              console.log("[clips] updated clip in state", {
                clipId: clip.id,
                name: updatedClip?.name,
                url: updatedClip?.url,
                isBlob: updatedClip?.url.startsWith("blob:") ?? false,
                isHttp: updatedClip?.url.startsWith("http") ?? false,
              })
              return updated
            })
            revokeIfBlobUrl(clip.url)
          })
          .catch((err) => {
            console.error("[clips] upload failed", {
              clipId: clip.id,
              name: file.name,
              error: err,
            })
          })
      })
    }

    event.target.value = ""
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (!over || active.id === over.id) return

    setClips((currentClips) => {
      const oldIndex = currentClips.findIndex((clip) => clip.id === active.id)
      const newIndex = currentClips.findIndex((clip) => clip.id === over.id)

      if (oldIndex === -1 || newIndex === -1) return currentClips

      return arrayMove(currentClips, oldIndex, newIndex)
    })
  }

  const handleDeleteClip = (clipId: string) => {
    setClips((prev) => {
      const toDelete = prev.find((c) => c.id === clipId)
      revokeIfBlobUrl(toDelete?.url)
      const next = prev.filter((c) => c.id !== clipId)
      return next
    })

    setGoals((prev) => prev.filter((g) => g.clipId !== clipId))

    setPendingGoal((prev) => (prev && prev.clipId === clipId ? null : prev))

    setSelectedClipId((prevId) => {
      if (prevId !== clipId) return prevId
      const remaining = clips.filter((c) => c.id !== clipId)
      return remaining[0]?.id ?? null
    })
  }

  const handleSelectClip = (id: string) => {
    setIsPlayingReel(false)
    setShowIntroCard(false)
    setSelectedClipId(id)
    audioRef.current?.pause()
  }

  const handlePlayReel = () => {
    if (clips.length === 0) return

    setShowIntroCard(true)
    setIsPlayingReel(true)
    setSelectedClipId(null)
    setCurrentReelTime(0)
    reelStartTimeRef.current = performance.now()
    musicStartedThisReelRef.current = false
    fadeOutStartedRef.current = false
  }

  const updateClipTrim = (clipId: string, trimStart: number, trimEnd: number) => {
    setClips((prev) =>
      prev.map((c) => {
        if (c.id !== clipId) return c
        const duration = c.duration
        const start = Math.max(0, Math.min(trimStart, duration, trimEnd))
        const end = Math.max(0, Math.min(trimEnd, duration), start)
        return { ...c, trimStart: start, trimEnd: end }
      })
    )
  }

  const updateClipScoreboardOverlay = (
    clipId: string,
    showScoreboard: boolean,
    minuteMarker: string
  ) => {
    setClips((prev) =>
      prev.map((c) => (c.id === clipId ? { ...c, showScoreboard, minuteMarker } : c))
    )
  }

  const setClipShowScorerAfterGoal = (clipId: string, showScorerAfterGoal: boolean) => {
    setClips((prev) =>
      prev.map((c) => (c.id === clipId ? { ...c, showScorerAfterGoal } : c))
    )
  }

  const handleGoalClick = () => {
    if (!selectedClip || !videoRef.current) return
    setPendingGoal({
      clipId: selectedClip.id,
      timeInClip: videoRef.current.currentTime,
    })
    setGoalScorerSide("home")
    setGoalScorerName("")
  }

  const handleGoalSubmit = () => {
    if (!pendingGoal) return
    setGoals((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        clipId: pendingGoal.clipId,
        timeInClip: pendingGoal.timeInClip,
        side: goalScorerSide,
        scorerName: goalScorerName.trim() || "Unknown",
      },
    ])
    setPendingGoal(null)
    setGoalScorerName("")
  }

  const handleGoalCancel = () => {
    setPendingGoal(null)
    setGoalScorerName("")
  }

  const handleDeleteGoal = (goalId: string) => {
    setGoals((prev) => prev.filter((g) => g.id !== goalId))
  }

  const handleUpdateGoalScorer = (goalId: string, scorerName: string) => {
    setGoals((prev) => prev.map((g) => (g.id === goalId ? { ...g, scorerName } : g)))
  }

  const selectedClip =
    clips.find((clip) => clip.id === selectedClipId) ?? clips[0] ?? null

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = musicVolume
  }, [musicVolume, musicTrack])

  isPlayingReelRef.current = isPlayingReel

  useEffect(() => {
    if (!isPlayingReel) {
      audioRef.current?.pause()
      return
    }

    const tick = () => {
      if (!isPlayingReelRef.current) return

      const elapsed = (performance.now() - reelStartTimeRef.current) / 1000
      setCurrentReelTime(elapsed)
      const audio = audioRef.current
      const hasTrack = !!musicTrack

      if (hasTrack && audio && !musicStartedThisReelRef.current && elapsed >= musicStartInReel) {
        musicStartedThisReelRef.current = true
        audio.currentTime = Math.max(0, musicStartInTrack)
        audio.volume = musicVolumeRef.current
        void audio.play().catch(() => {})
      }

      const endSec = musicEndInReel === "" ? null : Number(musicEndInReel)
      if (endSec != null && elapsed >= endSec && audio) {
        if (!fadeOutStartedRef.current) {
          fadeOutStartedRef.current = true
          const fadeStart = performance.now()
          const startVol = musicVolumeRef.current

          const doFade = () => {
            const el = audioRef.current
            if (!el) return
            if (!isPlayingReelRef.current) return

            const fadeElapsed = (performance.now() - fadeStart) / 1000
            if (fadeElapsed >= fadeOutDuration) {
              el.pause()
              return
            }

            el.volume = Math.max(0, startVol * (1 - fadeElapsed / fadeOutDuration))
            rafIdRef.current = requestAnimationFrame(doFade)
          }

          rafIdRef.current = requestAnimationFrame(doFade)
        }
      }

      rafIdRef.current = requestAnimationFrame(tick)
    }

    rafIdRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafIdRef.current)
  }, [isPlayingReel, musicTrack, musicStartInReel, musicStartInTrack, musicEndInReel, fadeOutDuration])

  useEffect(() => {
    if (!isPlayingReel || !showIntroCard || clips.length === 0) return

    const ms = intro.durationSeconds * 1000
    const t = setTimeout(() => {
      setShowIntroCard(false)
      setSelectedClipId(clips[0].id)
    }, ms)

    return () => clearTimeout(t)
  }, [isPlayingReel, showIntroCard, clips, intro.durationSeconds])

  useEffect(() => {
    if (!isPlayingReel || !selectedClip || !videoRef.current || showIntroCard) return

    const video = videoRef.current
    video.currentTime = selectedClip.trimStart

    void video.play().catch(() => {
      // browser may block autoplay
    })
  }, [isPlayingReel, selectedClip, showIntroCard])

  useEffect(() => {
    if (!selectedClip || !videoRef.current) return
    videoRef.current.currentTime = selectedClip.trimStart
  }, [selectedClip?.id])

  useEffect(() => {
    if (!selectedClip || !videoRef.current || isPlayingReel) return
    videoRef.current.currentTime = selectedClip.trimStart
  }, [selectedClip?.trimStart, selectedClip?.trimEnd, isPlayingReel])

  useEffect(() => {
    if (!selectedClip) setVideoCurrentTime(0)
    else if (videoRef.current) setVideoCurrentTime(videoRef.current.currentTime)
  }, [selectedClip?.id])

  const totalReelDuration =
    intro.durationSeconds +
    clips.reduce((sum, c) => sum + (c.trimEnd - c.trimStart), 0)

  const PIXELS_PER_SECOND = 60
  const timelineWidthPx = Math.max(totalReelDuration * PIXELS_PER_SECOND, 320)

  useEffect(() => {
    if (isPlayingReel) return

    if (!selectedClip || clips.length === 0) {
      setCurrentReelTime(0)
      return
    }

    const beforeSelected = clips.findIndex((c) => c.id === selectedClip.id)
    const timeBeforeSelected =
      intro.durationSeconds +
      clips
        .slice(0, beforeSelected)
        .reduce((s, c) => s + (c.trimEnd - c.trimStart), 0)

    const timeInClip = Math.max(
      0,
      Math.min(
        videoCurrentTime - selectedClip.trimStart,
        selectedClip.trimEnd - selectedClip.trimStart
      )
    )

    setCurrentReelTime(timeBeforeSelected + timeInClip)
  }, [isPlayingReel, selectedClip?.id, videoCurrentTime, clips, intro.durationSeconds])

  useEffect(() => {
    if (!videoRef.current) return
    videoRef.current.volume = clipAudioOn ? 1 : 0
  }, [clipAudioOn, selectedClip?.id])

  const canExport = exportErrors.length === 0
  const canRender = renderState.status !== "submitting" && renderState.status !== "rendering"

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex flex-col">
      {musicTrack && (
        <audio ref={audioRef} key={musicTrack.url} src={musicTrack.url} loop className="hidden" />
      )}

      {pendingGoal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-xl border border-neutral-700 bg-neutral-900 p-5 shadow-xl">
            <h3 className="mb-1 text-lg font-semibold">Who scored?</h3>
            <p className="mb-4 text-xs text-neutral-400">
              Goal at {pendingGoal.timeInClip.toFixed(1)}s in this clip
            </p>

            <div className="mb-4 flex gap-2">
              <button
                type="button"
                onClick={() => setGoalScorerSide("home")}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                  goalScorerSide === "home"
                    ? "border-yellow-500 bg-yellow-500/20 text-yellow-400"
                    : "border-neutral-600 bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                }`}
              >
                {scoreboard.homeTeamName || "Home"}
              </button>

              <button
                type="button"
                onClick={() => setGoalScorerSide("away")}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                  goalScorerSide === "away"
                    ? "border-yellow-500 bg-yellow-500/20 text-yellow-400"
                    : "border-neutral-600 bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                }`}
              >
                {scoreboard.awayTeamName || "Away"}
              </button>
            </div>

            <div className="mb-4">
              <label className="mb-1 block text-xs text-neutral-400">Scorer name</label>
              <input
                type="text"
                value={goalScorerName}
                onChange={(e) => setGoalScorerName(e.target.value)}
                placeholder="e.g. J. Smith"
                className="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleGoalSubmit()
                  if (e.key === "Escape") handleGoalCancel()
                }}
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleGoalCancel}
                className="rounded-lg border border-neutral-600 bg-neutral-800 px-4 py-2 text-sm hover:bg-neutral-700"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleGoalSubmit}
                className="flex-1 rounded-lg bg-yellow-500 px-4 py-2 text-sm font-semibold text-black hover:bg-yellow-400"
              >
                Record goal
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="relative z-20 h-16 border-b border-neutral-800 flex items-center justify-between px-6 shrink-0">
        <div>
          <h1 className="text-xl font-bold">Ambassadors FC Highlight Editor</h1>
          <p className="text-sm text-neutral-400">Matchday Reel Builder</p>
          <input
            type="text"
            value={projectTitle}
            onChange={(e) => setProjectTitle(e.target.value)}
            className="mt-0.5 block w-48 border-0 border-b border-transparent bg-transparent p-0 text-xs text-neutral-500 focus:border-neutral-600 focus:outline-none"
            placeholder="Project title"
          />
        </div>

        <div className="flex items-center gap-3">
          {saveLoadStatus && (
            <span className="text-sm text-neutral-400">{saveLoadStatus}</span>
          )}

          <button
            type="button"
            onClick={handleSaveProject}
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm hover:bg-neutral-800"
          >
            Save Project
          </button>

          <button
            type="button"
            onClick={handleLoadProject}
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm hover:bg-neutral-800"
          >
            Load Project
          </button>

          <div className="text-sm text-neutral-400">
            {isPlayingReel ? "Reel playing" : "Preview mode"}
          </div>

          <button
            type="button"
            onClick={handlePlayReel}
            className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-2 text-sm hover:bg-neutral-800"
          >
            Play Reel
          </button>

          <button
            type="button"
            onClick={handleSaveDraft}
            className="rounded-lg bg-neutral-800 px-4 py-2 text-sm hover:bg-neutral-700"
          >
            Save Draft
          </button>

          <button
            type="button"
            disabled={!canExport}
            onClick={handleExportProject}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              canExport
                ? "bg-yellow-500 text-black hover:bg-yellow-400"
                : "cursor-not-allowed bg-neutral-700 text-neutral-500"
            }`}
          >
            Export JSON
          </button>
          <button
            type="button"
            disabled={!canRender}
            onClick={handleRenderVideo}
            className={`rounded-lg px-4 py-2 text-sm font-semibold ${
              canRender
                ? "bg-emerald-500 text-black hover:bg-emerald-400"
                : "cursor-not-allowed bg-neutral-700 text-neutral-500"
            }`}
          >
            Render Video
          </button>
          <div className="max-w-xs text-xs text-neutral-400">
            {renderState.status === "idle" && <div>Render: idle</div>}
            {renderState.status === "submitting" && <div>Render: submitting…</div>}
            {renderState.status === "rendering" && (
              <div>Render: rendering… {Math.round(renderState.progress)}%</div>
            )}
            {renderState.status === "done" && renderState.downloadUrl && (
              <div className="flex items-center gap-2">
                <span>Render: done</span>
                <a
                  href={renderState.downloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-400 underline"
                >
                  Download Video
                </a>
              </div>
            )}
            {renderState.status === "error" && (
              <div className="text-red-400">
                Render error: {renderState.error ?? "Unknown error"}
              </div>
            )}
          </div>
          {exportErrors.length > 0 && (
            <div className="max-w-xs text-xs text-red-400">
              {exportErrors.map((err) => (
                <div key={err}>{err}</div>
              ))}
            </div>
          )}
        </div>
      </header>

      <main className="min-h-0 flex flex-1 overflow-hidden">
        <aside className="w-72 border-r border-neutral-800 p-4 overflow-y-auto shrink-0">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Media</h2>
            <button
              type="button"
              onClick={handleUploadClick}
              className="rounded-md bg-neutral-800 px-3 py-1 text-sm hover:bg-neutral-700"
            >
              Upload
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            multiple
            className="hidden"
            onChange={handleFilesSelected}
          />

          <div className="mb-6 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <h2 className="mb-3 text-lg font-semibold">Match & Intro</h2>

            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-neutral-400">Team name</label>
                <input
                  type="text"
                  value={intro.teamName}
                  onChange={(e) => setIntro((p) => ({ ...p, teamName: e.target.value }))}
                  placeholder="e.g. Ambassadors FC"
                  className="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-neutral-400">Opponent</label>
                <input
                  type="text"
                  value={intro.opponent}
                  onChange={(e) => setIntro((p) => ({ ...p, opponent: e.target.value }))}
                  placeholder="e.g. Rivals United"
                  className="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-neutral-400">Score</label>
                <input
                  type="text"
                  value={intro.score}
                  onChange={(e) => setIntro((p) => ({ ...p, score: e.target.value }))}
                  placeholder="e.g. 2-1"
                  className="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-neutral-400">Match date</label>
                <input
                  type="text"
                  value={intro.matchDate}
                  onChange={(e) => setIntro((p) => ({ ...p, matchDate: e.target.value }))}
                  placeholder="e.g. 11 Mar 2026"
                  className="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-neutral-400">Age group</label>
                <input
                  type="text"
                  value={intro.ageGroup}
                  onChange={(e) => setIntro((p) => ({ ...p, ageGroup: e.target.value }))}
                  placeholder="e.g. U12, U14, First Team"
                  className="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs text-neutral-400">Club badge</label>
                <input
                  ref={badgeInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleBadgeUpload}
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => badgeInputRef.current?.click()}
                    className="rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700"
                  >
                    {intro.clubBadgeUrl ? "Change badge" : "Upload badge"}
                  </button>

                  {intro.clubBadgeUrl && (
                    <img
                      src={intro.clubBadgeUrl}
                      alt="Badge"
                      className="h-10 w-10 rounded-full border border-neutral-600 object-cover"
                    />
                  )}
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs text-neutral-400">
                  Intro duration (s)
                </label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  step={0.5}
                  value={intro.durationSeconds}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value)
                    if (Number.isFinite(v)) {
                      setIntro((p) => ({
                        ...p,
                        durationSeconds: Math.max(1, Math.min(10, v)),
                      }))
                    }
                  }}
                  className="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-white"
                />
              </div>

              <div className="border-t border-neutral-700 pt-3">
                <h3 className="mb-2 text-sm font-semibold text-neutral-300">Scoreboard overlay</h3>
                <p className="mb-2 text-xs text-neutral-500">
                  Used when you enable the scoreboard on a clip.
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-neutral-400">Home team</label>
                    <input
                      type="text"
                      value={scoreboard.homeTeamName}
                      onChange={(e) =>
                        setScoreboard((s) => ({ ...s, homeTeamName: e.target.value }))
                      }
                      placeholder="Home"
                      className="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-neutral-400">Away team</label>
                    <input
                      type="text"
                      value={scoreboard.awayTeamName}
                      onChange={(e) =>
                        setScoreboard((s) => ({ ...s, awayTeamName: e.target.value }))
                      }
                      placeholder="Away"
                      className="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-neutral-400">Home score</label>
                    <input
                      type="number"
                      min={0}
                      value={scoreboard.homeScore}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10)
                        if (!Number.isNaN(v) && v >= 0) {
                          setScoreboard((s) => ({ ...s, homeScore: v }))
                        }
                      }}
                      className="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-white"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-neutral-400">Away score</label>
                    <input
                      type="number"
                      min={0}
                      value={scoreboard.awayScore}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10)
                        if (!Number.isNaN(v) && v >= 0) {
                          setScoreboard((s) => ({ ...s, awayScore: v }))
                        }
                      }}
                      className="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-white"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            {clips.length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-700 bg-neutral-900 p-4 text-sm text-neutral-400">
                No clips yet. Upload some match footage.
              </div>
            ) : (
              clips.map((clip) => {
                const isSelected = selectedClip?.id === clip.id

                return (
                  <button
                    key={clip.id}
                    type="button"
                    onClick={() => handleSelectClip(clip.id)}
                    className={`w-full rounded-xl border p-3 text-left ${
                      isSelected
                        ? "border-yellow-500 bg-neutral-800"
                        : "border-neutral-800 bg-neutral-900"
                    }`}
                  >
                    {clip.thumbnail ? (
                      <img
                        src={clip.thumbnail}
                        className="mb-2 h-20 w-full rounded object-cover"
                        alt={clip.name}
                      />
                    ) : (
                      <div className="mb-2 flex h-20 w-full items-center justify-center rounded bg-neutral-800 text-xs text-neutral-500">
                        No preview
                      </div>
                    )}
                    <p className="truncate text-sm font-medium">{clip.name}</p>
                  </button>
                )
              })
            )}
          </div>
        </aside>

        <section className="min-w-0 flex flex-1 flex-col">
          <div className="flex-1 p-6 min-h-0">
            <div className="mx-auto flex h-full max-w-5xl flex-col items-center justify-center rounded-2xl border border-neutral-800 bg-neutral-900">
              <div className="aspect-video w-full max-w-4xl overflow-hidden rounded-xl border border-neutral-700 bg-black relative">
                {isPlayingReel && showIntroCard ? (
                  <IntroCard intro={intro} className="h-full w-full" />
                ) : selectedClip?.url ? (
                  <>
                    <video
                      ref={videoRef}
                      key={selectedClip.id}
                      src={selectedClip.url}
                      controls
                      muted={!clipAudioOn}
                      className="h-full w-full"
                      onLoadedMetadata={() => {
                        if (videoRef.current) {
                          videoRef.current.currentTime = selectedClip.trimStart
                        }
                      }}
                      onTimeUpdate={() => {
                        if (videoRef.current) {
                          setVideoCurrentTime(videoRef.current.currentTime)
                        }

                        if (!isPlayingReel || !videoRef.current) return

                        if (videoRef.current.currentTime >= selectedClip.trimEnd) {
                          videoRef.current.pause()
                          const currentIndex = clips.findIndex((c) => c.id === selectedClip.id)
                          const nextIndex = currentIndex + 1

                          if (nextIndex >= clips.length) {
                            setIsPlayingReel(false)
                            return
                          }

                          setSelectedClipId(clips[nextIndex].id)
                        }
                      }}
                      onEnded={() => {
                        if (!isPlayingReel) return

                        const currentIndex = clips.findIndex((clip) => clip.id === selectedClip.id)
                        const nextIndex = currentIndex + 1

                        if (nextIndex >= clips.length) {
                          setIsPlayingReel(false)
                          return
                        }

                        const nextClip = clips[nextIndex]
                        setSelectedClipId(nextClip.id)
                      }}
                    />

                    <button
                      type="button"
                      onClick={handleGoalClick}
                      className="absolute right-3 top-3 z-10 rounded-lg bg-yellow-500 px-4 py-2 text-sm font-bold text-black shadow-lg hover:bg-yellow-400"
                    >
                      ⚽ GOAL
                    </button>

                    {(selectedClip.showScoreboard ?? false) && (
                      <ScoreboardOverlay
                        scoreboard={scoreboard}
                        minuteMarker={selectedClip.minuteMarker ?? ""}
                        goals={goals}
                        clips={clips}
                        clipId={selectedClip.id}
                        currentTimeInClip={videoCurrentTime}
                        showScorerAfterGoal={selectedClip.showScorerAfterGoal ?? false}
                        className="h-auto w-auto"
                      />
                    )}
                  </>
                ) : selectedClip ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-neutral-500">
                    <p>Re-upload this clip to restore video playback.</p>
                    <p className="text-xs text-neutral-600">
                      Load project restores structure and settings only.
                    </p>
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-neutral-500">
                    Video Preview
                  </div>
                )}
              </div>

              {selectedClip && (
                <div className="mt-4 w-full max-w-4xl rounded-xl border border-neutral-700 bg-neutral-900 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <h3 className="text-sm font-semibold text-neutral-200">Trim</h3>
                      <span className="text-sm text-neutral-400">
                        Duration: {formatTime(selectedClip.trimEnd - selectedClip.trimStart)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteClip(selectedClip.id)}
                      className="rounded-md border border-red-500/60 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-400 hover:bg-red-500/20"
                    >
                      Delete video
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs text-neutral-400">
                        Trim Start (s)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="range"
                          min={0}
                          max={selectedClip.trimEnd}
                          step={0.1}
                          value={selectedClip.trimStart}
                          onChange={(e) => {
                            const start = parseFloat(e.target.value)
                            updateClipTrim(
                              selectedClip.id,
                              start,
                              Math.max(start, selectedClip.trimEnd)
                            )
                          }}
                          className="h-2 flex-1 accent-yellow-500"
                        />
                        <input
                          type="number"
                          min={0}
                          max={selectedClip.trimEnd}
                          step={0.1}
                          value={selectedClip.trimStart.toFixed(1)}
                          onChange={(e) => {
                            const start = parseFloat(e.target.value)
                            if (!Number.isFinite(start)) return
                            updateClipTrim(
                              selectedClip.id,
                              Math.max(0, Math.min(start, selectedClip.trimEnd)),
                              selectedClip.trimEnd
                            )
                          }}
                          className="w-16 rounded border border-neutral-600 bg-neutral-800 px-2 py-1 text-sm text-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs text-neutral-400">
                        Trim End (s)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="range"
                          min={selectedClip.trimStart}
                          max={selectedClip.duration}
                          step={0.1}
                          value={selectedClip.trimEnd}
                          onChange={(e) => {
                            const end = parseFloat(e.target.value)
                            updateClipTrim(selectedClip.id, selectedClip.trimStart, end)
                          }}
                          className="h-2 flex-1 accent-yellow-500"
                        />
                        <input
                          type="number"
                          min={selectedClip.trimStart}
                          max={selectedClip.duration}
                          step={0.1}
                          value={selectedClip.trimEnd.toFixed(1)}
                          onChange={(e) => {
                            const end = parseFloat(e.target.value)
                            if (!Number.isFinite(end)) return
                            updateClipTrim(
                              selectedClip.id,
                              selectedClip.trimStart,
                              Math.max(selectedClip.trimStart, Math.min(end, selectedClip.duration))
                            )
                          }}
                          className="w-16 rounded border border-neutral-600 bg-neutral-800 px-2 py-1 text-sm text-white"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 border-t border-neutral-700 pt-4">
                    <h3 className="mb-2 text-sm font-semibold text-neutral-200">
                      Scoreboard overlay
                    </h3>

                    <label className="mb-2 flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedClip.showScoreboard ?? false}
                        onChange={(e) =>
                          updateClipScoreboardOverlay(
                            selectedClip.id,
                            e.target.checked,
                            selectedClip.minuteMarker ?? ""
                          )
                        }
                        className="h-4 w-4 rounded border-neutral-600 bg-neutral-800 accent-yellow-500"
                      />
                      <span className="text-sm text-neutral-300">Show scoreboard on this clip</span>
                    </label>

                    <div>
                      <label className="mb-1 block text-xs text-neutral-400">Minute marker</label>
                      <input
                        type="text"
                        value={selectedClip.minuteMarker ?? ""}
                        onChange={(e) =>
                          updateClipScoreboardOverlay(
                            selectedClip.id,
                            selectedClip.showScoreboard ?? false,
                            e.target.value
                          )
                        }
                        placeholder="e.g. 64'"
                        className="w-full max-w-[120px] rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500"
                      />
                    </div>

                    <label className="mt-3 flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedClip.showScorerAfterGoal ?? false}
                        onChange={(e) =>
                          setClipShowScorerAfterGoal(selectedClip.id, e.target.checked)
                        }
                        className="h-4 w-4 rounded border-neutral-600 bg-neutral-800 accent-yellow-500"
                      />
                      <span className="text-sm text-neutral-300">
                        Show scorer name under scoreboard after each goal (until end of clip)
                      </span>
                    </label>
                  </div>

                  {goals.filter((g) => g.clipId === selectedClip.id).length > 0 && (
                    <div className="mt-4 border-t border-neutral-700 pt-4">
                      <h3 className="mb-2 text-sm font-semibold text-neutral-200">
                        Goals in this clip
                      </h3>

                      <ul className="space-y-2">
                        {[...goals]
                          .filter((g) => g.clipId === selectedClip.id)
                          .sort((a, b) => a.timeInClip - b.timeInClip)
                          .map((goal) => (
                            <li
                              key={goal.id}
                              className="flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm"
                            >
                              <span className="shrink-0 tabular-nums text-neutral-400">
                                {goal.timeInClip.toFixed(1)}s
                              </span>

                              <span className="shrink-0 text-neutral-500">
                                {goal.side === "home"
                                  ? scoreboard.homeTeamName || "Home"
                                  : scoreboard.awayTeamName || "Away"}
                              </span>

                              <input
                                type="text"
                                value={goal.scorerName}
                                onChange={(e) => handleUpdateGoalScorer(goal.id, e.target.value)}
                                onBlur={(e) => {
                                  const v = e.target.value.trim() || "Unknown"
                                  if (v !== goal.scorerName) handleUpdateGoalScorer(goal.id, v)
                                }}
                                className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-neutral-200 focus:border-neutral-500 focus:bg-neutral-700 focus:outline-none"
                                placeholder="Scorer name"
                              />

                              <button
                                type="button"
                                onClick={() => handleDeleteGoal(goal.id)}
                                className="shrink-0 rounded p-1 text-neutral-400 hover:bg-neutral-700 hover:text-red-400"
                                title="Remove goal"
                                aria-label="Remove goal"
                              >
                                ×
                              </button>
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-neutral-800 bg-neutral-950 p-4 shrink-0">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Timeline</h2>
              <p className="text-sm text-neutral-400">
                {clips.length === 0 ? "Drag clips here later" : "Drag clips to change order"}
              </p>
            </div>

            {clips.length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-700 bg-neutral-900 p-4 text-sm text-neutral-400">
                Your uploaded clips will appear here.
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={clips.map((clip) => clip.id)}
                  strategy={horizontalListSortingStrategy}
                >
                  <div className="overflow-x-auto pb-2">
                    <div className="relative min-w-0" style={{ width: timelineWidthPx }}>
                      <div className="mb-1 flex h-6 items-end border-b border-neutral-700 bg-neutral-900/80">
                        {totalReelDuration > 0 &&
                          (() => {
                            const step =
                              totalReelDuration <= 15 ? 2 : totalReelDuration <= 45 ? 5 : 10
                            const ticks: number[] = []

                            for (let t = 0; t <= totalReelDuration; t += step) ticks.push(t)
                            if (ticks[ticks.length - 1] !== totalReelDuration) {
                              ticks.push(totalReelDuration)
                            }

                            return ticks.map((t) => (
                              <div
                                key={t}
                                className="absolute shrink-0 border-l border-neutral-600 pl-0.5 text-[10px] text-neutral-500"
                                style={{
                                  left: (t / totalReelDuration) * timelineWidthPx,
                                }}
                              >
                                {t}s
                              </div>
                            ))
                          })()}
                      </div>

                      <div className="flex gap-px">
                        {clips.map((clip) => {
                          const trimmedDuration = clip.trimEnd - clip.trimStart
                          const widthPx =
                            totalReelDuration > 0
                              ? Math.max(
                                  80,
                                  (trimmedDuration / totalReelDuration) * timelineWidthPx
                                )
                              : 120

                          return (
                            <TimelineClip
                              key={clip.id}
                              clip={clip}
                              isSelected={selectedClip?.id === clip.id}
                              onSelect={handleSelectClip}
                              widthPx={widthPx}
                            />
                          )
                        })}
                      </div>

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
                </SortableContext>
              </DndContext>
            )}
          </div>

          <div className="border-t border-neutral-800 bg-neutral-950 p-4 shrink-0">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Music</h2>
            </div>

            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
              <input
                ref={musicInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={handleMusicUpload}
              />

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => musicInputRef.current?.click()}
                  className="rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm hover:bg-neutral-700"
                >
                  {musicTrack ? "Change track" : "Upload music"}
                </button>

                {musicTrack && (
                  <span className="truncate text-sm text-neutral-300">{musicTrack.name}</span>
                )}
              </div>

              {musicTrack && (
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="mb-1 block text-xs text-neutral-400">Music volume</label>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={musicVolume}
                      onChange={(e) => setMusicVolume(parseFloat(e.target.value))}
                      className="h-2 w-full accent-yellow-500"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-neutral-400">
                      Music start in reel (s)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={musicStartInReel}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value)
                        if (Number.isFinite(v) && v >= 0) setMusicStartInReel(v)
                      }}
                      className="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-white"
                    />
                    <p className="mt-0.5 text-xs text-neutral-500">
                      When in the reel to start the music
                    </p>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-neutral-400">
                      Music start in track (s)
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={musicStartInTrack}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value)
                        if (Number.isFinite(v) && v >= 0) setMusicStartInTrack(v)
                      }}
                      className="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-white"
                    />
                    <p className="mt-0.5 text-xs text-neutral-500">
                      Position in the audio file to start from
                    </p>
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-neutral-400">
                      Music end in reel (s) <span className="text-neutral-500">optional</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={musicEndInReel === "" ? "" : musicEndInReel}
                      onChange={(e) => {
                        const raw = e.target.value
                        if (raw === "") setMusicEndInReel("")
                        else {
                          const v = parseFloat(raw)
                          if (Number.isFinite(v) && v >= 0) setMusicEndInReel(v)
                        }
                      }}
                      placeholder="Leave empty to play through"
                      className="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs text-neutral-400">
                      Fade out duration (s)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={30}
                      step={0.1}
                      value={fadeOutDuration}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value)
                        if (Number.isFinite(v)) {
                          setFadeOutDuration(Math.max(0, Math.min(30, v)))
                        }
                      }}
                      className="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-white"
                    />
                    <p className="mt-0.5 text-xs text-neutral-500">
                      Used when music end in reel is set
                    </p>
                  </div>

                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={clipAudioOn}
                      onChange={(e) => setClipAudioOn(e.target.checked)}
                      className="h-4 w-4 rounded border-neutral-600 bg-neutral-800 accent-yellow-500"
                    />
                    <span className="text-sm text-neutral-300">Clip audio on</span>
                  </label>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}