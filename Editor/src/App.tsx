import { useEffect, useMemo, useRef, useState } from "react"
import type { ChangeEvent } from "react"
import { isFirebaseConfigured, uploadMediaToStorage } from "./firebase"
import { validateProjectForExport } from "./lib/validateProject"
import { getRenderStatus, startRender } from "./lib/renderApi"
import type {
  AspectRatioPreset,
  Clip,
  ClipRole,
  GoalEvent,
  IntroData,
  ProjectData,
  RenderState,
  ScoreboardData,
} from "./types"
import { IntroCard } from "./components/IntroCard"
import { ScoreboardOverlay } from "./components/ScoreboardOverlay"
import { AspectRatioPicker } from "./components/AspectRatioPicker"
import { ValidationPanel } from "./components/ValidationPanel"
import { RenderPanel } from "./components/RenderPanel"
import { TimelineTrack, arrayMove } from "./components/TimelineTrack"

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

function revokeIfBlobUrl(url?: string | null) {
  if (url && url.startsWith("blob:")) URL.revokeObjectURL(url)
}

const PROJECT_STORAGE_KEY = "ambassadors-fc-highlight-editor-project"
const DRAFT_STORAGE_KEY = "ambassadors-fc-highlight-editor-draft"
const SAVE_LOAD_STATUS_DURATION_MS = 3000

const DEFAULT_INTRO: IntroData = {
  teamName: "Ambassadors FC",
  opponent: "",
  score: "",
  matchDate: "",
  ageGroup: "",
  homeBadgeUrl: "",
  awayBadgeUrl: "",
  durationSeconds: 2,
}

const ASPECT_RATIO_CLASS: Record<AspectRatioPreset, string> = {
  landscape: "aspect-video",
  square: "aspect-square",
  vertical: "aspect-[9/16]",
}

export default function App() {
  const [clips, setClips] = useState<Clip[]>([])
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null)
  const [isPlayingReel, setIsPlayingReel] = useState(false)
  const [showIntroCard, setShowIntroCard] = useState(false)
  const [introEnabled, setIntroEnabled] = useState(true)
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
  const [aspectRatio, setAspectRatio] = useState<AspectRatioPreset>("landscape")
  const [renderState, setRenderState] = useState<RenderState>({
    status: "idle",
    jobId: null,
    progress: 0,
    downloadUrl: null,
    error: null,
  })

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const homeBadgeInputRef = useRef<HTMLInputElement | null>(null)
  const awayBadgeInputRef = useRef<HTMLInputElement | null>(null)
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
  isPlayingReelRef.current = isPlayingReel

  // Real-time validation drives the Render button disabled state
  const validationErrors = useMemo(
    () => validateProjectForExport(buildProjectSnapshot()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [clips, intro, scoreboard, goals, musicTrack, musicVolume, musicStartInReel,
     musicStartInTrack, musicEndInReel, fadeOutDuration, clipAudioOn, projectTitle, aspectRatio]
  )

  const canRender =
    validationErrors.length === 0 &&
    renderState.status !== "submitting" &&
    renderState.status !== "queued" &&
    renderState.status !== "rendering"

  const selectedClip = clips.find((c) => c.id === selectedClipId) ?? clips[0] ?? null
  /** True when the selected clip is a "normal" gameplay clip (not intro/outro). */
  const isNormalClip = !selectedClip?.role || selectedClip.role === "normal"
  const effectiveIntroDuration = introEnabled ? intro.durationSeconds : 0
  const totalReelDuration =
    effectiveIntroDuration + clips.reduce((s, c) => s + Math.max(0, c.trimEnd - c.trimStart), 0)

  // ── Serialisation ──────────────────────────────────────────────────────────

  function buildProjectSnapshot(): ProjectData {
    return {
      version: 1,
      projectTitle,
      presetId: aspectRatio,
      clips: clips.map((c) => ({
        id: c.id,
        name: c.name,
        duration: c.duration,
        trimStart: c.trimStart,
        trimEnd: c.trimEnd,
        showScoreboard: c.showScoreboard,
        minuteMarker: c.minuteMarker,
        showScorerAfterGoal: c.showScorerAfterGoal,
        role: c.role ?? "normal",
        muteAudio: c.muteAudio ?? false,
        ...(c.url.startsWith("http") ? { src: c.url } : {}),
        ...(c.thumbnail.startsWith("http") ? { thumbnail: c.thumbnail } : {}),
      })),
      intro: {
        ...intro,
        homeBadgeUrl: intro.homeBadgeUrl.startsWith("http") ? intro.homeBadgeUrl : "",
        awayBadgeUrl: intro.awayBadgeUrl.startsWith("http") ? intro.awayBadgeUrl : "",
        // durationSeconds: 0 signals the renderer to skip the intro entirely.
        durationSeconds: introEnabled ? intro.durationSeconds : 0,
      },
      scoreboard: { ...scoreboard },
      goals: [...goals],
      lowerThird: { defaultShowScoreboard: true, defaultShowScorerAfterGoal: true },
      music: {
        musicFileName: musicTrack?.name ?? "",
        musicVolume,
        musicStartInReel,
        musicStartInTrack,
        musicEndInReel,
        fadeOutDuration,
        clipAudioOn,
        ...(musicTrack?.url?.startsWith("http") ? { musicUrl: musicTrack.url } : {}),
      },
      transitions: clips.map(() => ({ type: "cut", durationSeconds: 0 })),
    }
  }

  function applyProjectToState(project: ProjectData) {
    setProjectTitle(project.projectTitle)
    setAspectRatio((project.presetId as AspectRatioPreset | undefined) ?? "landscape")
    // durationSeconds === 0 means intro was disabled when the project was saved.
    setIntroEnabled((project.intro.durationSeconds ?? 1) > 0)
    setClips(
      project.clips.map((c) => ({
        ...c,
        url: c.src ?? "",
        thumbnail: c.thumbnail ?? "",
        role: (c.role ?? "normal") as ClipRole,
        muteAudio: c.muteAudio ?? false,
      }))
    )
    // Backward compat: old projects use clubBadgeUrl; map it to homeBadgeUrl.
    const rawIntro = project.intro as IntroData & { clubBadgeUrl?: string }
    setIntro({
      ...rawIntro,
      homeBadgeUrl: rawIntro.homeBadgeUrl ?? rawIntro.clubBadgeUrl ?? "",
      awayBadgeUrl: rawIntro.awayBadgeUrl ?? "",
    })
    setScoreboard(project.scoreboard)
    setGoals(project.goals)
    const musicUrl = project.music.musicUrl
    setMusicTrack(musicUrl ? { name: project.music.musicFileName || "Track", url: musicUrl } : null)
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

  // ── Persistence ────────────────────────────────────────────────────────────

  const toast = (msg: string) => {
    setSaveLoadStatus(msg)
    setTimeout(() => setSaveLoadStatus(null), SAVE_LOAD_STATUS_DURATION_MS)
  }

  const handleSaveProject = () => {
    try {
      localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(buildProjectSnapshot()))
      toast("Project saved")
    } catch (err) {
      toast(err instanceof DOMException && err.name === "QuotaExceededError" ? "Save failed – storage limit" : "Save failed")
    }
  }

  const handleSaveDraft = () => {
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(buildProjectSnapshot()))
      toast("Draft saved")
    } catch (err) {
      toast(err instanceof DOMException && err.name === "QuotaExceededError" ? "Save failed – storage limit" : "Save failed")
    }
  }

  const handleLoadProject = () => {
    try {
      const raw = localStorage.getItem(PROJECT_STORAGE_KEY)
      if (!raw) { toast("No saved project"); return }
      const project = JSON.parse(raw) as ProjectData
      if (!project?.version || !Array.isArray(project.clips)) { toast("Invalid project"); return }
      applyProjectToState(project)
      toast("Project loaded")
    } catch { toast("Load failed") }
  }

  const handleExportProject = () => {
    const project = buildProjectSnapshot()
    const errors = validateProjectForExport(project)
    if (errors.length > 0) { toast("Fix validation errors before exporting"); return }
    const json = JSON.stringify(project, null, 2)
    const blob = new Blob([json], { type: "application/json" })
    const url = URL.createObjectURL(blob)
    const name = project.projectTitle.trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-") || "highlight-project"
    const a = document.createElement("a")
    a.href = url; a.download = `${name}.json`; a.click()
    URL.revokeObjectURL(url)
    toast("Project exported")
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const handleRenderVideo = async () => {
    if (!canRender) return
    const project = buildProjectSnapshot()
    setRenderState({ status: "submitting", jobId: null, progress: 0, downloadUrl: null, error: null })
    try {
      const { jobId } = await startRender(project)
      setRenderState({ status: "rendering", jobId, progress: 0, downloadUrl: null, error: null })
    } catch (err) {
      setRenderState({ status: "error", jobId: null, progress: 0, downloadUrl: null,
        error: err instanceof Error ? err.message : "Render start failed" })
    }
  }

  // Polling
  useEffect(() => {
    const active = ["queued", "rendering"] as const
    if (!active.includes(renderState.status as typeof active[number])) return
    if (!renderState.jobId) return
    let cancelled = false
    let tid: number | undefined
    const poll = async () => {
      try {
        const res = await getRenderStatus(renderState.jobId!)
        if (cancelled) return
        if (res.status === "queued" || res.status === "rendering") {
          setRenderState((p) => ({ ...p, status: res.status, progress: res.progress ?? p.progress }))
          tid = window.setTimeout(poll, 2000)
          return
        }
        if (res.status === "done") {
          setRenderState({ status: "done", jobId: renderState.jobId, progress: 100,
            downloadUrl: res.downloadUrl ?? null, error: null })
          return
        }
        setRenderState({ status: "error", jobId: renderState.jobId, progress: renderState.progress,
          downloadUrl: null, error: res.error ?? "Render failed" })
      } catch (err) {
        if (!cancelled) setRenderState((p) => ({ ...p, status: "error",
          error: err instanceof Error ? err.message : "Status check failed" }))
      }
    }
    tid = window.setTimeout(poll, 2000)
    return () => { cancelled = true; if (tid !== undefined) window.clearTimeout(tid) }
  }, [renderState.status, renderState.jobId])

  // ── Clip management ────────────────────────────────────────────────────────

  const generateThumbnail = (file: File): Promise<{ thumbnail: string; duration: number }> =>
    new Promise((resolve) => {
      const video = document.createElement("video")
      const canvas = document.createElement("canvas")
      const url = URL.createObjectURL(file)
      video.src = url; video.muted = true; video.playsInline = true; video.preload = "metadata"
      let duration = 0
      video.onloadedmetadata = () => {
        duration = Number.isFinite(video.duration) ? video.duration : 0
        video.currentTime = Math.min(1, Math.max(0.1, video.duration / 4 || 0.1))
      }
      video.onseeked = () => {
        canvas.width = video.videoWidth || 320; canvas.height = video.videoHeight || 180
        const ctx = canvas.getContext("2d")
        if (!ctx) { URL.revokeObjectURL(url); resolve({ thumbnail: "", duration }); return }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        URL.revokeObjectURL(url)
        resolve({ thumbnail: canvas.toDataURL("image/png"), duration })
      }
      video.onerror = () => { URL.revokeObjectURL(url); resolve({ thumbnail: "", duration: 0 }) }
    })

  const handleFilesSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files) return
    const newClips: Clip[] = []
    const fileArray = Array.from(files)
    for (const file of fileArray) {
      const { thumbnail, duration } = await generateThumbnail(file)
      const safeDuration = Math.max(0, duration)
      const id = crypto.randomUUID()
      newClips.push({
        id, name: file.name, url: URL.createObjectURL(file), thumbnail,
        duration: safeDuration, trimStart: 0, trimEnd: safeDuration,
        showScoreboard: true, minuteMarker: "", showScorerAfterGoal: true,
        role: "normal" as ClipRole, muteAudio: false,
      })
    }
    setClips((prev) => {
      const updated = [...prev, ...newClips]
      if (!selectedClipId && updated.length > 0) setSelectedClipId(updated[0].id)
      return updated
    })
    if (isFirebaseConfigured()) {
      fileArray.forEach((file, i) => {
        const clip = newClips[i]
        uploadMediaToStorage("clips", file, clip.id)
          .then((url) => { setClips((p) => p.map((c) => c.id === clip.id ? { ...c, url } : c)); revokeIfBlobUrl(clip.url) })
          .catch((err) => console.error("[clips] upload failed", clip.id, err))
      })
    }
    event.target.value = ""
  }

  const handleDeleteClip = (clipId: string) => {
    setClips((prev) => { revokeIfBlobUrl(prev.find((c) => c.id === clipId)?.url); return prev.filter((c) => c.id !== clipId) })
    setGoals((prev) => prev.filter((g) => g.clipId !== clipId))
    setPendingGoal((prev) => (prev?.clipId === clipId ? null : prev))
    setSelectedClipId((prevId) => {
      if (prevId !== clipId) return prevId
      return clips.filter((c) => c.id !== clipId)[0]?.id ?? null
    })
  }

  const handleSelectClip = (id: string) => {
    setIsPlayingReel(false); setShowIntroCard(false); setSelectedClipId(id); audioRef.current?.pause()
  }

  const handleReorderClips = (from: number, to: number) =>
    setClips((prev) => arrayMove(prev, from, to))

  const updateClipTrim = (clipId: string, trimStart: number, trimEnd: number) => {
    setClips((prev) => prev.map((c) => {
      if (c.id !== clipId) return c
      const start = Math.max(0, Math.min(trimStart, c.duration, trimEnd))
      const end = Math.max(0, Math.min(trimEnd, c.duration), start)
      return { ...c, trimStart: start, trimEnd: end }
    }))
  }

  const updateClipScoreboardOverlay = (clipId: string, showScoreboard: boolean, minuteMarker: string) =>
    setClips((prev) => prev.map((c) => c.id === clipId ? { ...c, showScoreboard, minuteMarker } : c))

  const setClipShowScorerAfterGoal = (clipId: string, val: boolean) =>
    setClips((prev) => prev.map((c) => c.id === clipId ? { ...c, showScorerAfterGoal: val } : c))

  const setClipRole = (clipId: string, role: ClipRole) =>
    setClips((prev) => prev.map((c) => c.id === clipId ? { ...c, role } : c))

  const setClipMuteAudio = (clipId: string, mute: boolean) =>
    setClips((prev) => prev.map((c) => c.id === clipId ? { ...c, muteAudio: mute } : c))

  // ── Goals ──────────────────────────────────────────────────────────────────

  const handleGoalClick = () => {
    if (!selectedClip || !videoRef.current) return
    setPendingGoal({ clipId: selectedClip.id, timeInClip: videoRef.current.currentTime })
    setGoalScorerSide("home"); setGoalScorerName("")
  }

  const handleGoalSubmit = () => {
    if (!pendingGoal) return
    setGoals((prev) => [...prev, { id: crypto.randomUUID(), clipId: pendingGoal.clipId,
      timeInClip: pendingGoal.timeInClip, side: goalScorerSide, scorerName: goalScorerName.trim() || "Unknown" }])
    setPendingGoal(null); setGoalScorerName("")
  }

  const handleGoalCancel = () => { setPendingGoal(null); setGoalScorerName("") }
  const handleDeleteGoal = (goalId: string) => setGoals((prev) => prev.filter((g) => g.id !== goalId))
  const handleUpdateGoalScorer = (goalId: string, scorerName: string) =>
    setGoals((prev) => prev.map((g) => g.id === goalId ? { ...g, scorerName } : g))

  // ── Media uploads ──────────────────────────────────────────────────────────

  const uploadBadge = async (
    file: File,
    field: "homeBadgeUrl" | "awayBadgeUrl",
    e: ChangeEvent<HTMLInputElement>
  ) => {
    if (isFirebaseConfigured()) {
      try {
        const url = await uploadMediaToStorage("badge", file, crypto.randomUUID())
        setIntro((prev) => { revokeIfBlobUrl(prev[field]); return { ...prev, [field]: url } })
        toast("Badge uploaded")
      } catch {
        const url = URL.createObjectURL(file)
        setIntro((prev) => { revokeIfBlobUrl(prev[field]); return { ...prev, [field]: url } })
        toast("Badge upload failed – local preview only")
      }
    } else {
      const url = URL.createObjectURL(file)
      setIntro((prev) => { revokeIfBlobUrl(prev[field]); return { ...prev, [field]: url } })
    }
    e.target.value = ""
  }

  const handleHomeBadgeUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    void uploadBadge(file, "homeBadgeUrl", e)
  }

  const handleAwayBadgeUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    void uploadBadge(file, "awayBadgeUrl", e)
  }

  const handleMusicUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    if (isFirebaseConfigured()) {
      try {
        const url = await uploadMediaToStorage("music", file, crypto.randomUUID())
        setMusicTrack((prev) => { revokeIfBlobUrl(prev?.url); return { name: file.name, url } })
        toast("Music uploaded")
      } catch {
        const url = URL.createObjectURL(file)
        setMusicTrack((prev) => { revokeIfBlobUrl(prev?.url); return { name: file.name, url } })
        toast("Music upload failed – local preview only")
      }
    } else {
      const url = URL.createObjectURL(file)
      setMusicTrack((prev) => { revokeIfBlobUrl(prev?.url); return { name: file.name, url } })
    }
    e.target.value = ""
  }

  // ── Reel playback ──────────────────────────────────────────────────────────

  const handlePlayReel = () => {
    if (clips.length === 0) return
    // Skip intro card in preview when intro is disabled.
    setShowIntroCard(introEnabled); setIsPlayingReel(true)
    setSelectedClipId(introEnabled ? null : (clips[0]?.id ?? null)); setCurrentReelTime(0)
    reelStartTimeRef.current = performance.now()
    musicStartedThisReelRef.current = false; fadeOutStartedRef.current = false
  }

  useEffect(() => { if (audioRef.current) audioRef.current.volume = musicVolume }, [musicVolume, musicTrack])

  useEffect(() => {
    if (!isPlayingReel) { audioRef.current?.pause(); return }
    const tick = () => {
      if (!isPlayingReelRef.current) return
      const elapsed = (performance.now() - reelStartTimeRef.current) / 1000
      setCurrentReelTime(elapsed)
      const audio = audioRef.current
      if (audio && musicTrack && !musicStartedThisReelRef.current && elapsed >= musicStartInReel) {
        musicStartedThisReelRef.current = true
        audio.currentTime = Math.max(0, musicStartInTrack)
        audio.volume = musicVolumeRef.current
        void audio.play().catch(() => {})
      }
      const endSec = musicEndInReel === "" ? null : Number(musicEndInReel)
      if (endSec != null && elapsed >= endSec && audio && !fadeOutStartedRef.current) {
        fadeOutStartedRef.current = true
        const fadeStart = performance.now(); const startVol = musicVolumeRef.current
        const doFade = () => {
          const el = audioRef.current; if (!el || !isPlayingReelRef.current) return
          const fe = (performance.now() - fadeStart) / 1000
          if (fe >= fadeOutDuration) { el.pause(); return }
          el.volume = Math.max(0, startVol * (1 - fe / fadeOutDuration))
          rafIdRef.current = requestAnimationFrame(doFade)
        }
        rafIdRef.current = requestAnimationFrame(doFade)
      }
      rafIdRef.current = requestAnimationFrame(tick)
    }
    rafIdRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafIdRef.current)
  }, [isPlayingReel, musicTrack, musicStartInReel, musicStartInTrack, musicEndInReel, fadeOutDuration])

  useEffect(() => {
    if (!isPlayingReel || !showIntroCard || clips.length === 0) return
    const t = setTimeout(() => { setShowIntroCard(false); setSelectedClipId(clips[0].id) }, effectiveIntroDuration * 1000)
    return () => clearTimeout(t)
  }, [isPlayingReel, showIntroCard, clips, effectiveIntroDuration])

  useEffect(() => {
    if (!isPlayingReel || !selectedClip || !videoRef.current || showIntroCard) return
    const v = videoRef.current; v.currentTime = selectedClip.trimStart
    void v.play().catch(() => {})
  }, [isPlayingReel, selectedClip, showIntroCard])

  useEffect(() => { if (!selectedClip || !videoRef.current) return; videoRef.current.currentTime = selectedClip.trimStart }, [selectedClip?.id])
  useEffect(() => { if (!selectedClip || !videoRef.current || isPlayingReel) return; videoRef.current.currentTime = selectedClip.trimStart }, [selectedClip?.trimStart, selectedClip?.trimEnd, isPlayingReel])
  useEffect(() => { if (!selectedClip) setVideoCurrentTime(0); else if (videoRef.current) setVideoCurrentTime(videoRef.current.currentTime) }, [selectedClip?.id])

  useEffect(() => {
    if (isPlayingReel) return
    if (!selectedClip || clips.length === 0) { setCurrentReelTime(0); return }
    const beforeSelected = clips.findIndex((c) => c.id === selectedClip.id)
    const timeBeforeSelected = effectiveIntroDuration + clips.slice(0, beforeSelected).reduce((s, c) => s + Math.max(0, c.trimEnd - c.trimStart), 0)
    const timeInClip = Math.max(0, Math.min(videoCurrentTime - selectedClip.trimStart, selectedClip.trimEnd - selectedClip.trimStart))
    setCurrentReelTime(timeBeforeSelected + timeInClip)
  }, [isPlayingReel, selectedClip?.id, videoCurrentTime, clips, effectiveIntroDuration])

  useEffect(() => {
    if (!videoRef.current) return
    videoRef.current.volume = (clipAudioOn && !(selectedClip?.muteAudio ?? false)) ? 1 : 0
  }, [clipAudioOn, selectedClip?.id, selectedClip?.muteAudio])

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen flex-col bg-neutral-950 text-white">
      {musicTrack && <audio ref={audioRef} key={musicTrack.url} src={musicTrack.url} loop className="hidden" />}

      {/* Goal dialog */}
      {pendingGoal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-xl border border-neutral-700 bg-neutral-900 p-5 shadow-xl">
            <h3 className="mb-1 text-lg font-semibold">Who scored?</h3>
            <p className="mb-4 text-xs text-neutral-400">Goal at {pendingGoal.timeInClip.toFixed(1)}s in this clip</p>
            <div className="mb-4 flex gap-2">
              {(["home", "away"] as const).map((side) => (
                <button key={side} type="button" onClick={() => setGoalScorerSide(side)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${goalScorerSide === side ? "border-yellow-500 bg-yellow-500/20 text-yellow-400" : "border-neutral-600 bg-neutral-800 text-neutral-400 hover:bg-neutral-700"}`}>
                  {side === "home" ? scoreboard.homeTeamName || "Home" : scoreboard.awayTeamName || "Away"}
                </button>
              ))}
            </div>
            <div className="mb-4">
              <label className="mb-1 block text-xs text-neutral-400">Scorer name</label>
              <input type="text" value={goalScorerName} onChange={(e) => setGoalScorerName(e.target.value)}
                placeholder="e.g. J. Smith" autoFocus
                className="w-full rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500"
                onKeyDown={(e) => { if (e.key === "Enter") handleGoalSubmit(); if (e.key === "Escape") handleGoalCancel() }} />
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={handleGoalCancel} className="rounded-lg border border-neutral-600 bg-neutral-800 px-4 py-2 text-sm hover:bg-neutral-700">Cancel</button>
              <button type="button" onClick={handleGoalSubmit} className="flex-1 rounded-lg bg-yellow-500 px-4 py-2 text-sm font-semibold text-black hover:bg-yellow-400">Record goal</button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="relative z-20 shrink-0 border-b border-neutral-800 px-6 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-baseline gap-3">
              <h1 className="shrink-0 text-lg font-bold leading-none">
                Ambassadors FC
                <span className="ml-1.5 font-normal text-neutral-400">Highlight Editor</span>
              </h1>
              <input type="text" value={projectTitle} onChange={(e) => setProjectTitle(e.target.value)}
                className="min-w-0 max-w-[200px] border-0 border-b border-transparent bg-transparent px-0 text-sm text-neutral-400 focus:border-neutral-600 focus:outline-none"
                placeholder="Project title" />
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {saveLoadStatus && <span className="text-xs text-neutral-400">{saveLoadStatus}</span>}
            <button type="button" onClick={handleSaveProject} className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm hover:bg-neutral-800">Save</button>
            <button type="button" onClick={handleSaveDraft} className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm hover:bg-neutral-800">Draft</button>
            <button type="button" onClick={handleLoadProject} className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm hover:bg-neutral-800">Load</button>
            <button type="button" onClick={handlePlayReel} disabled={clips.length === 0}
              className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40">
              ▶ Play Reel
            </button>
            <button type="button" onClick={handleExportProject}
              className="rounded-lg border border-yellow-700/50 bg-yellow-500/10 px-3 py-1.5 text-sm font-medium text-yellow-400 hover:bg-yellow-500/20">
              Export JSON
            </button>
            <button type="button" disabled={!canRender} onClick={handleRenderVideo}
              title={!canRender && validationErrors.length > 0 ? validationErrors.join(" · ") : undefined}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${canRender ? "bg-emerald-500 text-black hover:bg-emerald-400" : "cursor-not-allowed bg-neutral-700 text-neutral-500"}`}>
              Render Video
            </button>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="flex min-h-0 flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-72 shrink-0 overflow-y-auto border-r border-neutral-800 p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">Media</h2>
            <button type="button" onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-lg bg-yellow-500 px-3 py-1.5 text-xs font-bold text-black hover:bg-yellow-400">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              Upload
            </button>
          </div>
          <input ref={fileInputRef} type="file" accept="video/*" multiple className="hidden" onChange={handleFilesSelected} />
          <input ref={homeBadgeInputRef} type="file" accept="image/*" className="hidden" onChange={handleHomeBadgeUpload} />
          <input ref={awayBadgeInputRef} type="file" accept="image/*" className="hidden" onChange={handleAwayBadgeUpload} />
          <input ref={musicInputRef} type="file" accept="audio/*" className="hidden" onChange={handleMusicUpload} />

          {/* Clip list */}
          <div className="mb-6 space-y-2">
            {clips.length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-700 bg-neutral-900 p-4 text-xs text-neutral-500">No clips yet. Upload match footage above.</div>
            ) : (
              clips.map((clip) => (
                <button key={clip.id} type="button" onClick={() => handleSelectClip(clip.id)}
                  className={`w-full overflow-hidden rounded-xl border text-left transition-colors ${selectedClip?.id === clip.id ? "border-yellow-500 bg-neutral-800" : "border-neutral-800 bg-neutral-900 hover:border-neutral-600"}`}>
                  {clip.thumbnail ? (
                    <img src={clip.thumbnail} className="h-16 w-full object-cover" alt={clip.name} />
                  ) : (
                    <div className="flex h-16 w-full items-center justify-center bg-neutral-800 text-xs text-neutral-500">No preview</div>
                  )}
                  <div className="flex items-center justify-between px-2 py-1.5">
                    <p className="truncate text-xs font-medium text-neutral-200">{clip.name}</p>
                    <div className="ml-1 flex shrink-0 items-center gap-1">
                      {clip.role === "intro" && (
                        <span className="rounded bg-blue-500/20 px-1 text-[9px] font-semibold text-blue-400">Intro</span>
                      )}
                      {clip.role === "outro" && (
                        <span className="rounded bg-purple-500/20 px-1 text-[9px] font-semibold text-purple-400">Outro</span>
                      )}
                      {!clip.url.startsWith("http") && <span className="text-[10px] text-orange-400" title="Uploading…">↑</span>}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Match & Intro */}
          <div className="mb-4 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-200">Match & Intro</h2>
              <label className="flex cursor-pointer items-center gap-2">
                <span className="text-[10px] text-neutral-400">{introEnabled ? "Enabled" : "Disabled"}</span>
                <button type="button" onClick={() => setIntroEnabled((v) => !v)}
                  className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${introEnabled ? "bg-yellow-500" : "bg-neutral-600"}`}>
                  <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${introEnabled ? "translate-x-4" : "translate-x-0.5"}`} />
                </button>
              </label>
            </div>
            <div className={`space-y-2.5 ${introEnabled ? "" : "pointer-events-none opacity-40"}`}>
              {[
                { label: "Team name", key: "teamName" as const, placeholder: "Ambassadors FC" },
                { label: "Opponent", key: "opponent" as const, placeholder: "Rivals United" },
                { label: "Score", key: "score" as const, placeholder: "2-1" },
                { label: "Match date", key: "matchDate" as const, placeholder: "11 Mar 2026" },
                { label: "Age group", key: "ageGroup" as const, placeholder: "U12" },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="mb-1 block text-[10px] font-medium text-neutral-400">{label}</label>
                  <input type="text" value={intro[key]} onChange={(e) => setIntro((p) => ({ ...p, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-xs text-white placeholder-neutral-600 focus:border-neutral-500 focus:outline-none" />
                </div>
              ))}
              {/* Dual badge upload */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-neutral-400">Home badge</label>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => homeBadgeInputRef.current?.click()}
                      className="rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-xs hover:bg-neutral-700">
                      {intro.homeBadgeUrl ? "Change" : "Upload"}
                    </button>
                    {intro.homeBadgeUrl && (
                      <img src={intro.homeBadgeUrl} alt="Home badge" className="h-8 w-8 rounded-full border border-neutral-600 object-cover" />
                    )}
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium text-neutral-400">Away badge</label>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => awayBadgeInputRef.current?.click()}
                      className="rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-xs hover:bg-neutral-700">
                      {intro.awayBadgeUrl ? "Change" : "Upload"}
                    </button>
                    {intro.awayBadgeUrl && (
                      <img src={intro.awayBadgeUrl} alt="Away badge" className="h-8 w-8 rounded-full border border-neutral-600 object-cover" />
                    )}
                  </div>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium text-neutral-400">Intro duration (s)</label>
                <input type="number" min={1} max={10} step={0.5} value={intro.durationSeconds}
                  onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) setIntro((p) => ({ ...p, durationSeconds: Math.max(1, Math.min(10, v)) })) }}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-xs text-white focus:border-neutral-500 focus:outline-none" />
              </div>
              <div className="border-t border-neutral-700 pt-3">
                <h3 className="mb-2 text-xs font-semibold text-neutral-300">Scoreboard overlay</h3>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: "Home team", key: "homeTeamName" as const, placeholder: "Home", isText: true },
                    { label: "Away team", key: "awayTeamName" as const, placeholder: "Away", isText: true },
                    { label: "Home score", key: "homeScore" as const, placeholder: "0", isText: false },
                    { label: "Away score", key: "awayScore" as const, placeholder: "0", isText: false },
                  ].map(({ label, key, placeholder, isText }) => (
                    <div key={key}>
                      <label className="mb-1 block text-[10px] text-neutral-500">{label}</label>
                      {isText ? (
                        <input type="text" value={scoreboard[key as "homeTeamName" | "awayTeamName"]}
                          onChange={(e) => setScoreboard((s) => ({ ...s, [key]: e.target.value }))}
                          placeholder={placeholder}
                          className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-white placeholder-neutral-600 focus:border-neutral-500 focus:outline-none" />
                      ) : (
                        <input type="number" min={0} value={scoreboard[key as "homeScore" | "awayScore"]}
                          onChange={(e) => { const v = parseInt(e.target.value, 10); if (!Number.isNaN(v) && v >= 0) setScoreboard((s) => ({ ...s, [key]: v })) }}
                          className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-white focus:border-neutral-500 focus:outline-none" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <section className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          <div className="p-5">
            {/* Aspect ratio + reel time row */}
            <div className="mb-3 flex items-center justify-between gap-4">
              <AspectRatioPicker value={aspectRatio} onChange={setAspectRatio} />
              <span className="text-xs text-neutral-500">
                {isPlayingReel ? "▶ Playing" : "Preview"} · {formatTime(currentReelTime)} / {formatTime(totalReelDuration)}
              </span>
            </div>

            {/* Video preview */}
            <div className="mx-auto w-full max-w-2xl">
              <div className={`relative w-full overflow-hidden rounded-xl border border-neutral-700 bg-black ${ASPECT_RATIO_CLASS[aspectRatio]}`}>
                {isPlayingReel && showIntroCard && introEnabled ? (
                  <IntroCard intro={intro} className="absolute inset-0 h-full w-full" />
                ) : selectedClip?.url ? (
                  <>
                    <video ref={videoRef} key={selectedClip.id} src={selectedClip.url}
                      controls muted={!clipAudioOn || (selectedClip.muteAudio ?? false)}
                      className="absolute inset-0 h-full w-full object-contain"
                      onLoadedMetadata={() => { if (videoRef.current) videoRef.current.currentTime = selectedClip.trimStart }}
                      onTimeUpdate={() => {
                        if (videoRef.current) setVideoCurrentTime(videoRef.current.currentTime)
                        if (!isPlayingReel || !videoRef.current) return
                        if (videoRef.current.currentTime >= selectedClip.trimEnd) {
                          videoRef.current.pause()
                          const idx = clips.findIndex((c) => c.id === selectedClip.id)
                          if (idx + 1 >= clips.length) { setIsPlayingReel(false); return }
                          setSelectedClipId(clips[idx + 1].id)
                        }
                      }}
                      onEnded={() => {
                        if (!isPlayingReel) return
                        const idx = clips.findIndex((c) => c.id === selectedClip.id)
                        if (idx + 1 >= clips.length) { setIsPlayingReel(false); return }
                        setSelectedClipId(clips[idx + 1].id)
                      }} />
                    {isNormalClip && (
                      <button type="button" onClick={handleGoalClick}
                        className="absolute right-3 top-3 z-10 rounded-lg bg-yellow-500 px-3 py-1.5 text-xs font-bold text-black shadow-lg hover:bg-yellow-400">
                        ⚽ GOAL
                      </button>
                    )}
                    {isNormalClip && selectedClip.showScoreboard && (
                      <ScoreboardOverlay scoreboard={scoreboard} minuteMarker={selectedClip.minuteMarker ?? ""} goals={goals} clips={clips} clipId={selectedClip.id} currentTimeInClip={videoCurrentTime} showScorerAfterGoal={selectedClip.showScorerAfterGoal} />
                    )}
                  </>
                ) : selectedClip ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center text-neutral-500">
                    <p className="text-sm">Re-upload this clip to restore playback.</p>
                    <p className="text-xs text-neutral-600">Load project restores settings only.</p>
                  </div>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center text-neutral-600">
                      <svg className="mx-auto mb-3 h-12 w-12 text-neutral-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" /></svg>
                      <p className="text-sm">Upload clips to get started</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Timeline */}
            <div className="mx-auto mt-3 w-full max-w-2xl">
              <div className="mb-1.5 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-neutral-200">Timeline</h2>
                <p className="text-xs text-neutral-500">
                  {clips.length === 0 ? "Upload clips to build your reel" : "Drag to reorder · handles to trim · ⚽ goals"}
                </p>
              </div>
              <TimelineTrack clips={clips} goals={goals} selectedClipId={selectedClipId}
                currentReelTime={currentReelTime} introDurationSeconds={effectiveIntroDuration}
                onSelectClip={handleSelectClip} onReorder={handleReorderClips}
                onTrimClip={updateClipTrim} />
            </div>

            {/* Clip settings */}
            {selectedClip && (
              <div className="mx-auto mt-4 w-full max-w-2xl rounded-xl border border-neutral-800 bg-neutral-900 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-semibold text-neutral-200">{selectedClip.name}</h3>
                    <span className="rounded-md bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">{formatTime(selectedClip.trimEnd - selectedClip.trimStart)}</span>
                  </div>
                  <button type="button" onClick={() => handleDeleteClip(selectedClip.id)}
                    className="rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-400 hover:bg-red-500/20">
                    Delete
                  </button>
                </div>

                {/* Clip role picker */}
                <div className="mb-3 flex items-center gap-3">
                  <span className="shrink-0 text-xs text-neutral-400">Clip role</span>
                  <div className="flex gap-1">
                    {(["normal", "intro", "outro"] as ClipRole[]).map((r) => (
                      <button key={r} type="button"
                        onClick={() => setClipRole(selectedClip.id, r)}
                        className={`rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors ${
                          (selectedClip.role ?? "normal") === r
                            ? r === "intro" ? "bg-blue-500/20 text-blue-400 border border-blue-500/40"
                              : r === "outro" ? "bg-purple-500/20 text-purple-400 border border-purple-500/40"
                              : "bg-yellow-500/20 text-yellow-400 border border-yellow-500/40"
                            : "bg-neutral-800 text-neutral-500 border border-neutral-700 hover:border-neutral-600"
                        }`}>
                        {r}
                      </button>
                    ))}
                  </div>
                  {!isNormalClip && (
                    <span className="text-[10px] text-neutral-500">Scoreboard &amp; goals disabled</span>
                  )}
                </div>

                {/* Mute audio */}
                <label className="mb-3 flex cursor-pointer items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-xs text-neutral-300">
                    <svg className="h-3.5 w-3.5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      {selectedClip.muteAudio
                        ? <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                        : <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072M12 6v12m0-12L7.757 9.757A1 1 0 017 10.414H5a1 1 0 00-1 1v1.172a1 1 0 001 1H7a1 1 0 01.707.293L12 18m0-12v12" />}
                    </svg>
                    Mute clip audio
                  </span>
                  <input type="checkbox" checked={selectedClip.muteAudio ?? false}
                    onChange={(e) => setClipMuteAudio(selectedClip.id, e.target.checked)}
                    className="h-3.5 w-3.5 rounded accent-yellow-500" />
                </label>

                {/* Trim */}
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: "Trim Start (s)", min: 0, max: selectedClip.trimEnd, value: selectedClip.trimStart,
                      onChange: (v: number) => updateClipTrim(selectedClip.id, v, Math.max(v, selectedClip.trimEnd)) },
                    { label: "Trim End (s)", min: selectedClip.trimStart, max: selectedClip.duration, value: selectedClip.trimEnd,
                      onChange: (v: number) => updateClipTrim(selectedClip.id, selectedClip.trimStart, v) },
                  ].map(({ label, min, max, value, onChange }) => (
                    <div key={label}>
                      <label className="mb-1 block text-xs text-neutral-400">{label}</label>
                      <div className="flex gap-2">
                        <input type="range" min={min} max={max} step={0.1} value={value}
                          onChange={(e) => onChange(parseFloat(e.target.value))} className="h-2 flex-1 accent-yellow-500" />
                        <input type="number" min={min} max={max} step={0.1} value={value.toFixed(1)}
                          onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) onChange(Math.max(min, Math.min(v, max))) }}
                          className="w-16 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-white" />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Scoreboard — only for normal clips */}
                {isNormalClip && (
                  <div className="mt-4 border-t border-neutral-800 pt-4">
                    <h4 className="mb-2 text-xs font-semibold text-neutral-300">Scoreboard overlay</h4>
                    <div className="space-y-2">
                      <label className="flex cursor-pointer items-center gap-2">
                        <input type="checkbox" checked={selectedClip.showScoreboard}
                          onChange={(e) => updateClipScoreboardOverlay(selectedClip.id, e.target.checked, selectedClip.minuteMarker)}
                          className="h-3.5 w-3.5 rounded accent-yellow-500" />
                        <span className="text-xs text-neutral-300">Show scoreboard on this clip</span>
                      </label>
                      <div className="flex items-center gap-3">
                        <label className="text-xs text-neutral-400">Minute marker</label>
                        <input type="text" value={selectedClip.minuteMarker}
                          onChange={(e) => updateClipScoreboardOverlay(selectedClip.id, selectedClip.showScoreboard, e.target.value)}
                          placeholder="e.g. 64'"
                          className="w-24 rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs text-white placeholder-neutral-600 focus:border-neutral-500 focus:outline-none" />
                      </div>
                      <label className="flex cursor-pointer items-center gap-2">
                        <input type="checkbox" checked={selectedClip.showScorerAfterGoal}
                          onChange={(e) => setClipShowScorerAfterGoal(selectedClip.id, e.target.checked)}
                          className="h-3.5 w-3.5 rounded accent-yellow-500" />
                        <span className="text-xs text-neutral-300">Show scorer name after goal</span>
                      </label>
                    </div>
                  </div>
                )}

                {/* Goals list — only for normal clips */}
                {isNormalClip && goals.filter((g) => g.clipId === selectedClip.id).length > 0 && (
                  <div className="mt-4 border-t border-neutral-800 pt-4">
                    <h4 className="mb-2 text-xs font-semibold text-neutral-300">Goals in this clip</h4>
                    <ul className="space-y-1.5">
                      {[...goals].filter((g) => g.clipId === selectedClip.id).sort((a, b) => a.timeInClip - b.timeInClip).map((goal) => (
                        <li key={goal.id} className="flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-1.5">
                          <span className="shrink-0 text-xs tabular-nums text-neutral-400">{goal.timeInClip.toFixed(1)}s</span>
                          <span className="shrink-0 rounded-full bg-yellow-500/20 px-2 py-0.5 text-[10px] font-semibold text-yellow-400">
                            {goal.side === "home" ? scoreboard.homeTeamName || "Home" : scoreboard.awayTeamName || "Away"}
                          </span>
                          <input type="text" value={goal.scorerName}
                            onChange={(e) => handleUpdateGoalScorer(goal.id, e.target.value)}
                            onBlur={(e) => { const v = e.target.value.trim() || "Unknown"; if (v !== goal.scorerName) handleUpdateGoalScorer(goal.id, v) }}
                            className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-xs text-neutral-200 focus:border-neutral-600 focus:bg-neutral-700 focus:outline-none"
                            placeholder="Scorer name" />
                          <button type="button" onClick={() => handleDeleteGoal(goal.id)}
                            className="shrink-0 rounded p-1 text-neutral-500 hover:bg-neutral-700 hover:text-red-400" aria-label="Remove goal">×</button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Validation panel */}
            <div className="mx-auto mt-4 w-full max-w-2xl">
              <ValidationPanel errors={validationErrors} />
            </div>

            {/* Render panel */}
            <div className="mx-auto mt-4 w-full max-w-2xl">
              <RenderPanel renderState={renderState}
                onReset={() => setRenderState({ status: "idle", jobId: null, progress: 0, downloadUrl: null, error: null })} />
            </div>
          </div>

          {/* Music */}
          <div className="shrink-0 border-t border-neutral-800 bg-neutral-950 px-5 py-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-200">Music</h2>
              {musicTrack && <span className="truncate text-xs text-neutral-400">{musicTrack.name}</span>}
            </div>
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-4">
              <div className="mb-3 flex items-center gap-3">
                <button type="button" onClick={() => musicInputRef.current?.click()}
                  className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs hover:bg-neutral-700">
                  {musicTrack ? "Change track" : "Upload music"}
                </button>
                {musicTrack && (
                  <button type="button" onClick={() => { revokeIfBlobUrl(musicTrack.url); setMusicTrack(null) }}
                    className="text-xs text-neutral-500 hover:text-red-400">Remove</button>
                )}
              </div>

              {musicTrack && (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <div className="col-span-2 sm:col-span-3">
                    <label className="mb-1 block text-[10px] font-medium text-neutral-400">Volume · {Math.round(musicVolume * 100)}%</label>
                    <input type="range" min={0} max={1} step={0.05} value={musicVolume}
                      onChange={(e) => setMusicVolume(parseFloat(e.target.value))} className="h-2 w-full accent-yellow-500" />
                  </div>
                  {[
                    { label: "Start in reel (s)", value: musicStartInReel, setter: setMusicStartInReel },
                    { label: "Start in track (s)", value: musicStartInTrack, setter: setMusicStartInTrack },
                    { label: "Fade out (s)", value: fadeOutDuration, setter: setFadeOutDuration },
                  ].map(({ label, value, setter }) => (
                    <div key={label}>
                      <label className="mb-1 block text-[10px] font-medium text-neutral-400">{label}</label>
                      <input type="number" min={0} step={0.5} value={value}
                        onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v >= 0) setter(v) }}
                        className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-xs text-white focus:border-neutral-500 focus:outline-none" />
                    </div>
                  ))}
                  <div>
                    <label className="mb-1 block text-[10px] font-medium text-neutral-400">End in reel (s) <span className="text-neutral-600">optional</span></label>
                    <input type="number" min={0} step={0.5} value={musicEndInReel === "" ? "" : musicEndInReel}
                      onChange={(e) => { const raw = e.target.value; if (raw === "") setMusicEndInReel(""); else { const v = parseFloat(raw); if (Number.isFinite(v) && v >= 0) setMusicEndInReel(v) } }}
                      placeholder="Play through"
                      className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-xs text-white placeholder-neutral-600 focus:border-neutral-500 focus:outline-none" />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input type="checkbox" checked={clipAudioOn} onChange={(e) => setClipAudioOn(e.target.checked)} className="h-3.5 w-3.5 rounded accent-yellow-500" />
                      <span className="text-xs text-neutral-300">Clip audio on</span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
