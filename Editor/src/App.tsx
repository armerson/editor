import { useEffect, useMemo, useRef, useState } from "react"

/**
 * If `url` is a proxy-wrapped URL (e.g. http://localhost:3000/proxy?src=<encoded>),
 * extract and return the direct underlying URL. Otherwise return `url` unchanged.
 * This ensures render payloads always contain direct Firebase/S3 URLs that the
 * compositor can fetch, regardless of what proxy the browser used for preview.
 */
function unwrapProxyUrl(url: string): string {
  if (!url) return url
  try {
    const u = new URL(url)
    if (u.pathname === "/proxy") {
      const src = u.searchParams.get("src")
      if (src) return decodeURIComponent(src)
    }
  } catch {
    // Not a valid URL — return as-is
  }
  return url
}
import type { ChangeEvent } from "react"
import { isFirebaseConfigured, uploadMediaToStorage } from "./firebase"
import { idbSave, idbGet, idbDelete } from "./idb"
import { validateProjectForExport } from "./lib/validateProject"
import { getRenderStatus, startRender } from "./lib/renderApi"
import type {
  AspectRatioPreset,
  Clip,
  ClipRole,
  ClubProfile,
  GoalEvent,
  IntroData,
  OutroData,
  ProjectData,
  RenderState,
  ScoreboardData,
} from "./types"
import { ClubProfilePanel } from "./components/ClubProfilePanel"
import { useClubProfiles } from "./hooks/useClubProfiles"
import { IntroCard } from "./components/IntroCard"
import { OutroCard } from "./components/OutroCard"
import { ScoreboardOverlay } from "./components/ScoreboardOverlay"
import { AspectRatioPicker } from "./components/AspectRatioPicker"
import { ValidationPanel } from "./components/ValidationPanel"
import { RenderPanel } from "./components/RenderPanel"
import { MusicSearch } from "./components/MusicSearch"
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
  matchDate: "",
  ageGroup: "",
  competition: "",
  homeBadgeUrl: "",
  awayBadgeUrl: "",
  durationSeconds: 3,
}

const DEFAULT_OUTRO: OutroData = {
  enabled: true,
  finalScore: "",
  sponsorLogoUrls: [],
  durationSeconds: 5,
}

const ASPECT_RATIO_CLASS: Record<AspectRatioPreset, string> = {
  landscape: "aspect-video",
  square: "aspect-square",
  vertical: "aspect-[9/16]",
}

export default function App() {
  const [clips, setClips] = useState<Clip[]>([])
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null)
  const [introSelected, setIntroSelected] = useState(false)
  const [outroSelected, setOutroSelected] = useState(false)
  const [isPlayingReel, setIsPlayingReel] = useState(false)
  const [showIntroCard, setShowIntroCard] = useState(false)
  const [introEnabled, setIntroEnabled] = useState(true)
  const [intro, setIntro] = useState<IntroData>(() => ({ ...DEFAULT_INTRO }))
  const [outro, setOutro] = useState<OutroData>(() => ({ ...DEFAULT_OUTRO }))
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
  const [autoTrimOnGoal, setAutoTrimOnGoal] = useState(true)
  const [videoCurrentTime, setVideoCurrentTime] = useState(0)
  const [goalScorerSide, setGoalScorerSide] = useState<"home" | "away">("home")
  const [goalScorerName, setGoalScorerName] = useState("")
  const [currentReelTime, setCurrentReelTime] = useState(0)
  const [projectTitle, setProjectTitle] = useState("Untitled Project")
  const [saveLoadStatus, setSaveLoadStatus] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [autoSaveStatus, setAutoSaveStatus] = useState<"saved" | "pending" | null>(null)
  const [draftBanner, setDraftBanner] = useState<"visible" | "dismissed" | null>(null)
  const [aspectRatio, setAspectRatio] = useState<AspectRatioPreset>("landscape")
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768)
  const [renderState, setRenderState] = useState<RenderState>({
    status: "idle",
    jobId: null,
    progress: 0,
    downloadUrl: null,
    error: null,
  })

  const { profiles: clubProfiles, addProfile: addClubProfile, deleteProfile: deleteClubProfile } = useClubProfiles()

  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const homeBadgeInputRef = useRef<HTMLInputElement | null>(null)
  const awayBadgeInputRef = useRef<HTMLInputElement | null>(null)
  const sponsorLogoInputRefs = useRef<Array<HTMLInputElement | null>>(Array(8).fill(null))
  const musicInputRef = useRef<HTMLInputElement | null>(null)
  // videoRef always points to whichever video is currently active/visible
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const primaryRef = useRef<HTMLVideoElement | null>(null)
  const bufferRef = useRef<HTMLVideoElement | null>(null)
  const activePrimaryRef = useRef(true)
  const [activePrimary, setActivePrimary] = useState(true)
  // Mirrors showIntroCard state for use inside RAF closure
  const showIntroCardRef = useRef(false)
  showIntroCardRef.current = showIntroCard
  const [showOutroCard, setShowOutroCard] = useState(false)
  const showOutroCardRef = useRef(false)
  showOutroCardRef.current = showOutroCard
  const outroStartTimeRef = useRef<number>(0)
  const effectiveOutroDurationRef = useRef(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const reelStartTimeRef = useRef<number>(0)
  const musicStartedThisReelRef = useRef(false)
  const rafIdRef = useRef<number>(0)
  const isPlayingReelRef = useRef(false)
  const musicVolumeRef = useRef(musicVolume)
  musicVolumeRef.current = musicVolume
  isPlayingReelRef.current = isPlayingReel
  // Refs that mirror their state counterparts so the RAF tick can always read
  // the latest values without being in the effect's dependency list.
  const musicEndInReelRef = useRef<number | "">(musicEndInReel)
  musicEndInReelRef.current = musicEndInReel
  const fadeOutDurationRef = useRef(fadeOutDuration)
  fadeOutDurationRef.current = fadeOutDuration
  // Always-fresh total reel duration so the RAF loop can use it as the
  // effective music end when musicEndInReel is left blank.
  const totalReelDurationRef = useRef(0)
  // Stable ref to the latest handleGoalClick — used by keyboard shortcut effect
  // so it never needs to be torn down and re-registered.
  const handleGoalClickRef = useRef<(() => void) | null>(null)

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
  const effectiveOutroDuration = outro.enabled ? outro.durationSeconds : 0
  const totalReelDuration =
    effectiveIntroDuration + clips.reduce((s, c) => s + Math.max(0, c.trimEnd - c.trimStart), 0) + effectiveOutroDuration
  // Keep refs in sync so the RAF loop always has the latest values.
  totalReelDurationRef.current = totalReelDuration
  effectiveOutroDurationRef.current = effectiveOutroDuration

  // Role-based playback ordering
  const introRoleClips = clips.filter(c => c.role === 'intro')
  const normalClips = clips.filter(c => !c.role || c.role === 'normal')
  const outroRoleClips = clips.filter(c => c.role === 'outro')
  const reelPlaybackOrder = [...introRoleClips, ...normalClips, ...outroRoleClips]

  // Precompute reel start time for each clip in reelPlaybackOrder
  const reelClipStartTimes: number[] = []
  {
    let t = introRoleClips.length === 0 ? effectiveIntroDuration : 0
    for (let i = 0; i < reelPlaybackOrder.length; i++) {
      reelClipStartTimes.push(t)
      t += Math.max(0, reelPlaybackOrder[i].trimEnd - reelPlaybackOrder[i].trimStart)
      if (introRoleClips.length > 0 && i === introRoleClips.length - 1) t += effectiveIntroDuration
      if (outroRoleClips.length > 0 && i === introRoleClips.length + normalClips.length - 1) t += effectiveOutroDuration
    }
  }

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
        ...(c.url.startsWith("http") ? { src: unwrapProxyUrl(c.url) } : {}),
        // Always persist thumbnails (data URLs are small; needed in sidebar after restore)
        ...(c.thumbnail ? { thumbnail: c.thumbnail } : {}),
      })),
      intro: {
        ...intro,
        homeBadgeUrl: intro.homeBadgeUrl.startsWith("http") ? intro.homeBadgeUrl : "",
        awayBadgeUrl: intro.awayBadgeUrl.startsWith("http") ? intro.awayBadgeUrl : "",
        // durationSeconds: 0 signals the renderer to skip the intro entirely.
        durationSeconds: introEnabled ? intro.durationSeconds : 0,
      },
      outro: {
        ...outro,
        sponsorLogoUrls: outro.sponsorLogoUrls.filter((u) => u.startsWith("http")),
        durationSeconds: outro.enabled ? outro.durationSeconds : 0,
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
        ...(musicTrack?.url?.startsWith("http") ? { musicUrl: unwrapProxyUrl(musicTrack.url) } : {}),
      },
      transitions: clips.map(() => ({ type: "cut", durationSeconds: 0 })),
    }
  }

  async function applyProjectToState(project: ProjectData) {
    setProjectTitle(project.projectTitle)
    setAspectRatio((project.presetId as AspectRatioPreset | undefined) ?? "landscape")
    // durationSeconds === 0 means intro was disabled when the project was saved.
    setIntroEnabled((project.intro.durationSeconds ?? 1) > 0)

    // For clips that have no HTTP src (e.g. Firebase not configured, or saved
    // before upload finished), try to recover a preview from IndexedDB where
    // the original File was stored at upload time.
    const blobUrls = new Map<string, string>()
    await Promise.all(
      project.clips
        .filter((c) => !c.src)
        .map(async (c) => {
          try {
            const file = await idbGet(c.id)
            if (file) blobUrls.set(c.id, URL.createObjectURL(file))
          } catch {
            // IDB unavailable or entry missing — clip will show as missing
          }
        })
    )

    setClips(
      project.clips.map((c) => ({
        ...c,
        url: c.src ?? blobUrls.get(c.id) ?? "",
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
    if (project.outro) {
      setOutro({
        ...DEFAULT_OUTRO,
        ...project.outro,
        enabled: (project.outro.durationSeconds ?? 1) > 0,
      })
    }
    setScoreboard(project.scoreboard)
    setGoals(project.goals)
    const musicUrl = project.music.musicUrl
    if (musicUrl) {
      setMusicTrack({ name: project.music.musicFileName || "Track", url: musicUrl })
    } else {
      // No HTTP URL saved (blob-URL session or pre-Firebase project).
      // Try to recover the file from IndexedDB so the editor can preview it.
      const musicFile = await idbGet("__music__").catch(() => undefined)
      const musicFileName = project.music.musicFileName
      if (musicFile && musicFileName && musicFile.name === musicFileName) {
        setMusicTrack({ name: musicFileName, url: URL.createObjectURL(musicFile) })
      } else {
        setMusicTrack(null)
      }
    }
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
      toast(err instanceof DOMException && err.name === "QuotaExceededError" ? "Save failed – storage full (try removing unused clips)" : "Save failed")
    }
  }

  const handleSaveDraft = () => {
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(buildProjectSnapshot()))
      toast("Draft saved")
    } catch (err) {
      toast(err instanceof DOMException && err.name === "QuotaExceededError" ? "Save failed – storage full (try removing unused clips)" : "Save failed")
    }
  }

  const handleLoadProject = async () => {
    try {
      const raw = localStorage.getItem(PROJECT_STORAGE_KEY)
      if (!raw) { toast("No saved project"); return }
      const project = JSON.parse(raw) as ProjectData
      if (!project?.version || !Array.isArray(project.clips)) { toast("Invalid project"); return }
      await applyProjectToState(project)
      toast("Project loaded")
    } catch { toast("Load failed") }
  }

  const handleSaveClubProfile = (name: string) => {
    // Exclude blob:// URLs — they're session-only and won't survive a page reload
    const homeBadge = intro.homeBadgeUrl.startsWith("blob:") ? "" : intro.homeBadgeUrl
    const sponsors = outro.sponsorLogoUrls.filter((u) => u && !u.startsWith("blob:"))
    const hadBlobs =
      (intro.homeBadgeUrl !== "" && intro.homeBadgeUrl.startsWith("blob:")) ||
      outro.sponsorLogoUrls.some((u) => u && u.startsWith("blob:"))
    addClubProfile({
      name,
      teamName: intro.teamName,
      homeBadgeUrl: homeBadge,
      ageGroup: intro.ageGroup,
      introDurationSeconds: intro.durationSeconds,
      scoreboardHomeTeamName: scoreboard.homeTeamName,
      outroEnabled: outro.enabled,
      sponsorLogoUrls: sponsors,
      outroDurationSeconds: outro.durationSeconds,
    })
    toast(hadBlobs ? `Profile "${name}" saved (locally-uploaded images not included — re-upload via Firebase to persist them)` : `Profile "${name}" saved`)
  }

  const handleApplyClubProfile = (profile: ClubProfile) => {
    setIntro((prev) => ({
      ...prev,
      teamName: profile.teamName,
      homeBadgeUrl: profile.homeBadgeUrl,
      ageGroup: profile.ageGroup,
      durationSeconds: profile.introDurationSeconds,
    }))
    setScoreboard((prev) => ({ ...prev, homeTeamName: profile.scoreboardHomeTeamName }))
    setOutro((prev) => ({
      ...prev,
      enabled: profile.outroEnabled,
      sponsorLogoUrls: profile.sponsorLogoUrls,
      durationSeconds: profile.outroDurationSeconds,
    }))
    toast(`Profile "${profile.name}" applied`)
  }

  const handleRestoreDraft = async () => {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY)
      if (!raw) return
      const project = JSON.parse(raw) as ProjectData
      if (!project?.version || !Array.isArray(project.clips)) return
      await applyProjectToState(project)
      setDraftBanner("dismissed")
      toast("Draft restored")
    } catch { setDraftBanner("dismissed") }
  }

  // On mount: show restore banner if a non-empty draft exists
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY)
      if (!raw) return
      const project = JSON.parse(raw) as ProjectData
      if (project?.version && Array.isArray(project.clips) && project.clips.length > 0) {
        setDraftBanner("visible")
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Ctrl+S — quick save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault()
        handleSaveProject()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Track viewport width for mobile layout
  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener("resize", update)
    return () => window.removeEventListener("resize", update)
  }, [])

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
        const MAX_W = 160
        const srcW = video.videoWidth || 320; const srcH = video.videoHeight || 180
        const scale = Math.min(1, MAX_W / srcW)
        canvas.width = Math.round(srcW * scale); canvas.height = Math.round(srcH * scale)
        const ctx = canvas.getContext("2d")
        if (!ctx) { URL.revokeObjectURL(url); resolve({ thumbnail: "", duration }); return }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        URL.revokeObjectURL(url)
        resolve({ thumbnail: canvas.toDataURL("image/jpeg", 0.6), duration })
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
    // Persist raw files in IndexedDB so previews survive across sessions even
    // without Firebase (blob URLs are session-only and can't be serialised).
    fileArray.forEach((file, i) => {
      idbSave(newClips[i].id, file).catch(console.error)
    })
    if (isFirebaseConfigured()) {
      fileArray.forEach((file, i) => {
        const clip = newClips[i]
        uploadMediaToStorage("clips", file, clip.id)
          .then((url) => {
            setClips((p) => p.map((c) => c.id === clip.id ? { ...c, url } : c))
            revokeIfBlobUrl(clip.url)
            // Firebase URL is now the source of truth; IDB copy no longer needed
            idbDelete(clip.id).catch(console.error)
          })
          .catch((err) => console.error("[clips] upload failed", clip.id, err))
      })
    }
    event.target.value = ""
  }

  const handleDeleteClip = (clipId: string) => {
    setClips((prev) => { revokeIfBlobUrl(prev.find((c) => c.id === clipId)?.url); return prev.filter((c) => c.id !== clipId) })
    idbDelete(clipId).catch(console.error)
    setGoals((prev) => prev.filter((g) => g.clipId !== clipId))
    setPendingGoal((prev) => (prev?.clipId === clipId ? null : prev))
    setSelectedClipId((prevId) => {
      if (prevId !== clipId) return prevId
      return clips.filter((c) => c.id !== clipId)[0]?.id ?? null
    })
  }

  const handleSelectClip = (id: string) => {
    setIsPlayingReel(false); setShowIntroCard(false); setShowOutroCard(false); setSelectedClipId(id); setIntroSelected(false); setOutroSelected(false); audioRef.current?.pause()
  }

  const handleSelectIntro = () => {
    setIsPlayingReel(false); setShowIntroCard(false); setShowOutroCard(false); setSelectedClipId(null); setIntroSelected(true); setOutroSelected(false); audioRef.current?.pause()
  }

  const handleSelectOutro = () => {
    setIsPlayingReel(false); setShowIntroCard(false); setShowOutroCard(false); setSelectedClipId(null); setIntroSelected(false); setOutroSelected(true); audioRef.current?.pause()
  }

  const updateIntroDuration = (newDuration: number) => {
    setIntro((p) => ({ ...p, durationSeconds: Math.max(1, Math.min(10, newDuration)) }))
  }

  const updateOutroDuration = (newDuration: number) => {
    setOutro((p) => ({ ...p, durationSeconds: Math.max(2, Math.min(20, newDuration)) }))
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
  // Keep ref in sync so the keyboard handler always calls the latest version
  handleGoalClickRef.current = handleGoalClick

  /** Open the goal dialog for whichever clip lives at `reelTimeSec`. */
  const handleAddGoalAtReelTime = (reelTimeSec: number) => {
    if (reelTimeSec < effectiveIntroDuration) return // inside intro card
    let t = effectiveIntroDuration
    for (const clip of clips) {
      const clipDur = Math.max(0, clip.trimEnd - clip.trimStart)
      if (reelTimeSec >= t && reelTimeSec < t + clipDur) {
        const isNormal = !clip.role || clip.role === "normal"
        if (!isNormal) return // no goals on intro/outro clips
        const timeInClip = clip.trimStart + (reelTimeSec - t)
        setPendingGoal({ clipId: clip.id, timeInClip })
        setGoalScorerSide("home"); setGoalScorerName("")
        return
      }
      t += clipDur
    }
  }

  const handleGoalSubmit = () => {
    if (!pendingGoal) return
    setGoals((prev) => [...prev, { id: crypto.randomUUID(), clipId: pendingGoal.clipId,
      timeInClip: pendingGoal.timeInClip, side: goalScorerSide, scorerName: goalScorerName.trim() || "Unknown" }])
    // Optional auto-trim: centre the clip on [goalTime-4s, goalTime+2s]
    if (autoTrimOnGoal) {
      const clip = clips.find((c) => c.id === pendingGoal.clipId)
      if (clip) {
        const newStart = Math.max(0, pendingGoal.timeInClip - 4)
        const newEnd = Math.min(clip.duration, pendingGoal.timeInClip + 2)
        if (newEnd > newStart) updateClipTrim(clip.id, newStart, newEnd)
      }
    }
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

  const handleSponsorLogoUpload = async (index: number, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    let url: string
    if (isFirebaseConfigured()) {
      try {
        url = await uploadMediaToStorage("badge", file, crypto.randomUUID())
        toast("Sponsor uploaded")
      } catch {
        url = URL.createObjectURL(file)
        toast("Upload failed – local preview only")
      }
    } else {
      url = URL.createObjectURL(file)
    }
    setOutro((prev) => {
      const next = [...prev.sponsorLogoUrls]
      if (next[index]) URL.revokeObjectURL(next[index])
      next[index] = url
      return { ...prev, sponsorLogoUrls: next }
    })
    e.target.value = ""
  }

  const handleRemoveSponsorLogo = (index: number) => {
    setOutro((prev) => {
      const next = [...prev.sponsorLogoUrls]
      if (next[index]) URL.revokeObjectURL(next[index])
      next.splice(index, 1)
      return { ...prev, sponsorLogoUrls: next }
    })
  }

  const handleMusicUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    // Persist raw file to IDB immediately so preview survives session restore
    idbSave("__music__", file).catch(console.error)
    if (isFirebaseConfigured()) {
      try {
        const url = await uploadMediaToStorage("music", file, crypto.randomUUID())
        setMusicTrack((prev) => { revokeIfBlobUrl(prev?.url); return { name: file.name, url } })
        // Firebase URL is now the source of truth; IDB copy no longer needed
        idbDelete("__music__").catch(console.error)
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

  /** Use a track from the Jamendo library — URL is a direct MP3, no upload needed. */
  const handleLibraryTrackSelected = ({ name, url }: { name: string; url: string }) => {
    revokeIfBlobUrl(musicTrack?.url)
    setMusicTrack({ name, url })
  }

  // ── Reel playback ──────────────────────────────────────────────────────────

  // ── Dual-video reel playback ────────────────────────────────────────────────

  /** Swap to the pre-buffered video, then load the clip after next into the
   *  new buffer so it's ready for the following transition. */
  const doTransition = (nextIdx: number) => {
    // Insert intro card between intro-role clips and normal clips
    if (introRoleClips.length > 0 && nextIdx === introRoleClips.length && introEnabled && effectiveIntroDuration > 0) {
      const firstPostIntro = normalClips[0] ?? outroRoleClips[0]
      const bufVideo = activePrimaryRef.current ? bufferRef.current : primaryRef.current
      if (firstPostIntro && bufVideo && bufVideo.src !== firstPostIntro.url) {
        bufVideo.src = firstPostIntro.url; bufVideo.currentTime = firstPostIntro.trimStart; bufVideo.muted = true; bufVideo.load()
      }
      setShowIntroCard(true); setSelectedClipId(null); return
    }
    // Insert outro card between normal clips and outro-role clips
    if (outroRoleClips.length > 0 && nextIdx === introRoleClips.length + normalClips.length && outro.enabled && outro.durationSeconds > 0) {
      const firstOutroRole = outroRoleClips[0]
      const bufVideo = activePrimaryRef.current ? bufferRef.current : primaryRef.current
      if (firstOutroRole && bufVideo && bufVideo.src !== firstOutroRole.url) {
        bufVideo.src = firstOutroRole.url; bufVideo.currentTime = firstOutroRole.trimStart; bufVideo.muted = true; bufVideo.load()
      }
      outroStartTimeRef.current = performance.now(); setShowOutroCard(true); setSelectedClipId(null); return
    }
    const next = reelPlaybackOrder[nextIdx]
    if (!next) {
      if (outro.enabled && outro.durationSeconds > 0) {
        outroStartTimeRef.current = performance.now(); setShowOutroCard(true); setSelectedClipId(null)
      } else { setIsPlayingReel(false) }
      return
    }
    const bufVideo = activePrimaryRef.current ? bufferRef.current : primaryRef.current
    if (bufVideo) {
      if (bufVideo.src !== next.url) { bufVideo.src = next.url; bufVideo.currentTime = next.trimStart }
      bufVideo.muted = !clipAudioOn || (next.muteAudio ?? false)
      void bufVideo.play().catch((e) => console.warn("[reel] buffer play failed", e))
    }
    activePrimaryRef.current = !activePrimaryRef.current
    videoRef.current = activePrimaryRef.current ? primaryRef.current : bufferRef.current
    setActivePrimary(activePrimaryRef.current); setSelectedClipId(next.id)
    const afterNext = reelPlaybackOrder[nextIdx + 1]
    const newBuf = activePrimaryRef.current ? bufferRef.current : primaryRef.current
    if (afterNext && newBuf && newBuf.src !== afterNext.url) {
      newBuf.src = afterNext.url; newBuf.currentTime = afterNext.trimStart; newBuf.muted = true; newBuf.load()
    }
    console.log("[reel] transition →", nextIdx, next.id.slice(0, 8))
  }

  /** Called by onTimeUpdate on whichever video is currently active. */
  const handleVideoTimeUpdate = () => {
    const v = videoRef.current
    if (!v || !selectedClip) return
    const vt = v.currentTime
    setVideoCurrentTime(vt)

    if (isPlayingReel) {
      // Derive reel time directly from the video position — eliminates timer drift
      const reelIdx = reelPlaybackOrder.findIndex((c) => c.id === selectedClip.id)
      if (reelIdx !== -1) {
        const reelT = (reelClipStartTimes[reelIdx] ?? 0) + Math.max(0, vt - selectedClip.trimStart)
        setCurrentReelTime(reelT)
        console.debug("[reel]", selectedClip.id.slice(0, 8), "vt:", vt.toFixed(2), "→ reelT:", reelT.toFixed(2))
      }
      if (vt >= selectedClip.trimEnd) {
        v.pause()
        const idx = reelPlaybackOrder.findIndex((c) => c.id === selectedClip.id)
        console.log("[reel] trimEnd at", vt.toFixed(2), "clip idx", idx)
        doTransition(idx + 1)
      }
    }
  }

  const handleVideoEnded = () => {
    if (!isPlayingReel || !selectedClip) return
    const idx = reelPlaybackOrder.findIndex((c) => c.id === selectedClip.id)
    console.log("[reel] video ended, clip idx", idx)
    doTransition(idx + 1)
  }

  const handlePlayReel = () => {
    if (reelPlaybackOrder.length === 0 && !introEnabled && !outro.enabled) return
    activePrimaryRef.current = true; videoRef.current = primaryRef.current; setActivePrimary(true)
    const firstClip = introRoleClips.length > 0 ? reelPlaybackOrder[0] : (normalClips[0] ?? outroRoleClips[0])
    if (primaryRef.current && firstClip) { primaryRef.current.src = firstClip.url; primaryRef.current.currentTime = firstClip.trimStart }
    const secondClip = introRoleClips.length > 0 ? reelPlaybackOrder[1] : (normalClips[1] ?? outroRoleClips[0])
    if (bufferRef.current && secondClip) { console.log("[reel] preloading clip 1 into buffer on start"); bufferRef.current.src = secondClip.url; bufferRef.current.currentTime = secondClip.trimStart; bufferRef.current.load() }
    const showIntroNow = introRoleClips.length === 0 && introEnabled
    setShowIntroCard(showIntroNow); setShowOutroCard(false); setIsPlayingReel(true)
    setSelectedClipId(showIntroNow ? null : (firstClip?.id ?? null)); setCurrentReelTime(0)
    reelStartTimeRef.current = performance.now(); musicStartedThisReelRef.current = false
  }

  // During non-reel mode, keep audio.volume in sync with the slider.
  // During reel playback this is handled by the continuous fade effect below.
  useEffect(() => {
    if (isPlayingReel) return
    if (audioRef.current) audioRef.current.volume = musicVolume
  }, [musicVolume, musicTrack, isPlayingReel])

  // RAF loop: wall-clock intro timing + music start + music fade.
  // All three run at ~60 fps inside a single loop so fade never misses a tick.
  // Fade uses wall-clock elapsed (not currentReelTime) so it stays locked to
  // where the music actually is, independent of React render batching.
  useEffect(() => {
    if (!isPlayingReel) { audioRef.current?.pause(); return }
    const tick = () => {
      if (!isPlayingReelRef.current) return
      const elapsed = (performance.now() - reelStartTimeRef.current) / 1000

      // Wall-clock drives reelTime during the intro card and outro card.
      if (showIntroCardRef.current) setCurrentReelTime(elapsed)
      if (showOutroCardRef.current) {
        const outroElapsed = (performance.now() - outroStartTimeRef.current) / 1000
        setCurrentReelTime(
          totalReelDurationRef.current - effectiveOutroDurationRef.current + outroElapsed
        )
      }

      const audio = audioRef.current

      // ── Music start ────────────────────────────────────────────────────────
      if (audio && musicTrack && !musicStartedThisReelRef.current && elapsed >= musicStartInReel) {
        musicStartedThisReelRef.current = true
        audio.currentTime = Math.max(0, musicStartInTrack)
        audio.volume = musicVolumeRef.current
        void audio.play().catch(() => {})
      }

      // ── Music fade ─────────────────────────────────────────────────────────
      // Only act after music has started; read latest values via refs so the
      // effect doesn't need musicEndInReel / fadeOutDuration in its dep list.
      //
      // effectiveMusicEnd: if the user set an explicit end time, use it;
      // otherwise fall back to the total reel duration so music always fades
      // out at the end of the reel even when the audio file is longer.
      if (audio && musicStartedThisReelRef.current) {
        const rawEnd = musicEndInReelRef.current
        const endSec = rawEnd !== "" ? Number(rawEnd) : totalReelDurationRef.current
        if (endSec > 0) {
          const dur = Math.max(fadeOutDurationRef.current, 0.001)
          const fadeStart = endSec - dur
          if (elapsed >= endSec) {
            // Past end — silence and stop (idempotent)
            if (!audio.paused) { audio.volume = 0; audio.pause() }
          } else if (elapsed >= fadeStart) {
            // Inside fade zone — linear interpolation at 60 fps
            audio.volume = Math.max(0, musicVolumeRef.current * (1 - (elapsed - fadeStart) / dur))
          } else {
            // Before fade zone — keep slider changes live
            audio.volume = musicVolumeRef.current
          }
        }
      }

      rafIdRef.current = requestAnimationFrame(tick)
    }
    rafIdRef.current = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(rafIdRef.current) }
  }, [isPlayingReel, musicTrack, musicStartInReel, musicStartInTrack])

  useEffect(() => {
    if (!isPlayingReel || !showIntroCard) return
    const firstAfterIntroId = normalClips[0]?.id ?? outroRoleClips[0]?.id
    const t = setTimeout(() => {
      setShowIntroCard(false)
      if (firstAfterIntroId) {
        setSelectedClipId(firstAfterIntroId)
      } else if (outro.enabled && outro.durationSeconds > 0) {
        outroStartTimeRef.current = performance.now(); setShowOutroCard(true)
      } else {
        setIsPlayingReel(false)
      }
    }, effectiveIntroDuration * 1000)
    return () => clearTimeout(t)
  }, [isPlayingReel, showIntroCard, clips, effectiveIntroDuration, outro.enabled, outro.durationSeconds])

  useEffect(() => {
    if (!isPlayingReel || !showOutroCard) return
    const firstOutroRoleId = outroRoleClips[0]?.id
    const t = setTimeout(() => {
      setShowOutroCard(false)
      if (firstOutroRoleId) { setSelectedClipId(firstOutroRoleId) }
      else { setIsPlayingReel(false) }
    }, effectiveOutroDuration * 1000)
    return () => clearTimeout(t)
  }, [isPlayingReel, showOutroCard, clips, effectiveOutroDuration])

  // When the intro/outro card ends, the primary video was already loaded; just press play.
  useEffect(() => {
    if (!isPlayingReel || showIntroCard || showOutroCard) return
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      if (v.src !== (selectedClip?.url ?? "")) v.src = selectedClip?.url ?? ""
      v.currentTime = selectedClip?.trimStart ?? 0
      void v.play().catch(() => {})
      console.log("[reel] starting clip after intro:", selectedClip?.id?.slice(0, 8))
    }
  }, [isPlayingReel, showIntroCard, showOutroCard])

  // Manual clip selection (not during reel): always reset to primary and load the clip.
  useEffect(() => {
    if (isPlayingReel) return
    // Ensure primary is the active element after reel ends or for manual selection
    if (!activePrimaryRef.current) {
      activePrimaryRef.current = true
      videoRef.current = primaryRef.current
      setActivePrimary(true)
    }
    const v = primaryRef.current
    if (!v || !selectedClip) return
    if (v.src !== selectedClip.url) v.src = selectedClip.url
    v.currentTime = selectedClip.trimStart
  }, [isPlayingReel, selectedClip?.id])

  useEffect(() => { if (!selectedClip || !videoRef.current || isPlayingReel) return; videoRef.current.currentTime = selectedClip.trimStart }, [selectedClip?.trimStart, selectedClip?.trimEnd, isPlayingReel])
  useEffect(() => { if (!selectedClip) setVideoCurrentTime(0); else if (videoRef.current) setVideoCurrentTime(videoRef.current.currentTime) }, [selectedClip?.id])

  useEffect(() => {
    if (isPlayingReel) return
    if (!selectedClip || reelPlaybackOrder.length === 0) { setCurrentReelTime(0); return }
    const reelIdx = reelPlaybackOrder.findIndex((c) => c.id === selectedClip.id)
    if (reelIdx === -1) { setCurrentReelTime(0); return }
    const timeInClip = Math.max(0, Math.min(videoCurrentTime - selectedClip.trimStart, selectedClip.trimEnd - selectedClip.trimStart))
    setCurrentReelTime((reelClipStartTimes[reelIdx] ?? 0) + timeInClip)
  }, [isPlayingReel, selectedClip?.id, videoCurrentTime, clips, effectiveIntroDuration, effectiveOutroDuration])

  useEffect(() => {
    if (!videoRef.current) return
    videoRef.current.volume = (clipAudioOn && !(selectedClip?.muteAudio ?? false)) ? 1 : 0
  }, [clipAudioOn, selectedClip?.id, selectedClip?.muteAudio])

  // ── Badge preload ───────────────────────────────────────────────────────────
  // Kick the browser's image cache as soon as badge URLs are known so the
  // images are ready before the intro card appears (no "pop-in" delay).
  useEffect(() => {
    if (intro.homeBadgeUrl) { const img = new Image(); img.src = intro.homeBadgeUrl }
    if (intro.awayBadgeUrl) { const img = new Image(); img.src = intro.awayBadgeUrl }
  }, [intro.homeBadgeUrl, intro.awayBadgeUrl])

  // ── Auto-save (draft) ───────────────────────────────────────────────────────
  // Debounced: writes to DRAFT_STORAGE_KEY 3 s after the last change so the
  // user never loses work without hitting Save manually.
  useEffect(() => {
    setAutoSaveStatus("pending")
    const tid = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(buildProjectSnapshot()))
        setAutoSaveStatus("saved")
      } catch {
        // QuotaExceededError or private-browsing restriction — silently ignore
        setAutoSaveStatus(null)
      }
    }, 3000)
    return () => clearTimeout(tid)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips, intro, scoreboard, goals, musicTrack, musicVolume, musicStartInReel,
      musicStartInTrack, musicEndInReel, fadeOutDuration, clipAudioOn, projectTitle,
      aspectRatio, introEnabled])

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────

  // G / g — add goal at current playhead position (mirrors the ⚽ GOAL button)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "g" && e.key !== "G") return
      // Don't fire when user is typing in a form field
      const tag = (e.target as HTMLElement).tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement).isContentEditable) return
      if (pendingGoal) return // dialog already open
      handleGoalClickRef.current?.()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [pendingGoal]) // re-register only when dialog open/closes

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
            <label className="mb-4 flex cursor-pointer items-start gap-2">
              <input type="checkbox" checked={autoTrimOnGoal}
                onChange={(e) => setAutoTrimOnGoal(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded accent-yellow-500" />
              <span className="text-xs text-neutral-400">
                Auto-trim clip to{" "}
                <span className="tabular-nums text-neutral-300">
                  {Math.max(0, (pendingGoal?.timeInClip ?? 0) - 4).toFixed(1)}s
                  {" – "}
                  {((pendingGoal?.timeInClip ?? 0) + 2).toFixed(1)}s
                </span>
                {" "}around goal
              </span>
            </label>
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
            <div className="flex items-center gap-4">
              <div className="shrink-0 rounded-lg bg-black p-1">
                <img src="/logo.png" alt="QuickCut Match" className="h-10 w-auto md:h-16" />
              </div>
              <input type="text" value={projectTitle} onChange={(e) => setProjectTitle(e.target.value)}
                className="hidden min-w-0 max-w-[240px] border-0 border-b border-transparent bg-transparent px-0 text-sm text-neutral-400 focus:border-neutral-600 focus:outline-none md:block"
                placeholder="Project title" />
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {saveLoadStatus && <span className="text-xs text-neutral-400">{saveLoadStatus}</span>}
            {!saveLoadStatus && !isMobile && autoSaveStatus === "saved" && (
              <span className="text-xs text-neutral-600">● draft saved</span>
            )}
            {!saveLoadStatus && !isMobile && autoSaveStatus === "pending" && (
              <span className="text-xs text-neutral-700">saving…</span>
            )}
            {/* Mobile: open sidebar */}
            <button type="button" onClick={() => setSidebarOpen(true)}
              className="md:hidden rounded-lg border border-neutral-700 bg-neutral-900 p-2 hover:bg-neutral-800"
              title="Open settings">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            {!isMobile && <button type="button" onClick={handleSaveProject} className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm hover:bg-neutral-800">Save</button>}
            {!isMobile && <button type="button" onClick={handleSaveDraft} className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm hover:bg-neutral-800">Draft</button>}
            {!isMobile && <button type="button" onClick={handleLoadProject} className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm hover:bg-neutral-800">Load</button>}
            {!isMobile && (
              <button type="button" onClick={handlePlayReel} disabled={clips.length === 0}
                className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-1.5 text-sm hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40">
                ▶ Play Reel
              </button>
            )}
            {!isMobile && (
              <button type="button" onClick={handleExportProject}
                className="rounded-lg border border-yellow-700/50 bg-yellow-500/10 px-3 py-1.5 text-sm font-medium text-yellow-400 hover:bg-yellow-500/20">
                Export JSON
              </button>
            )}
            <button type="button" disabled={!canRender} onClick={handleRenderVideo}
              title={!canRender && validationErrors.length > 0 ? validationErrors.join(" · ") : undefined}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${canRender ? "bg-emerald-500 text-black hover:bg-emerald-400" : "cursor-not-allowed bg-neutral-700 text-neutral-500"}`}>
              Render Video
            </button>
          </div>
        </div>
      </header>

      {/* Draft restore banner */}
      {draftBanner === "visible" && (
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-yellow-600/30 bg-yellow-500/10 px-6 py-2.5">
          <span className="text-sm text-yellow-300">
            You have an unsaved draft from your last session.
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleRestoreDraft}
              className="rounded-lg bg-yellow-500 px-3 py-1 text-xs font-semibold text-black hover:bg-yellow-400"
            >
              Restore Draft
            </button>
            <button
              type="button"
              onClick={() => setDraftBanner("dismissed")}
              className="rounded-lg border border-neutral-700 px-3 py-1 text-xs text-neutral-400 hover:bg-neutral-800"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Mobile sidebar backdrop */}
      {isMobile && sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/60" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Body */}
      <main className="flex min-h-0 flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className={[
            "border-r border-neutral-800 bg-neutral-950 z-40",
            isMobile
              ? `fixed inset-y-0 left-0 w-72 transition-transform duration-200 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`
              : "relative shrink-0 transition-[width] duration-200",
          ].join(" ")}
          style={isMobile ? undefined : { width: sidebarOpen ? 288 : 40 }}
        >
          {/* Collapse / expand toggle — always visible */}
          <button
            type="button"
            onClick={() => setSidebarOpen((v) => !v)}
            title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            className="absolute -right-3 top-4 z-20 hidden h-6 w-6 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900 text-neutral-400 shadow hover:text-white md:flex"
          >
            <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
              {sidebarOpen
                ? <path d="M10.5 3.5 5.5 8l5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                : <path d="M5.5 3.5 10.5 8l-5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />}
            </svg>
          </button>

          {/* Collapsed strip — icon shortcuts */}
          {!sidebarOpen && (
            <div className="flex h-full flex-col items-center gap-3 pt-12 pb-4">
              <button type="button" onClick={() => { setSidebarOpen(true); fileInputRef.current?.click() }}
                title="Upload clip"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-yellow-500 text-black hover:bg-yellow-400">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
              </button>
            </div>
          )}

          {/* Full sidebar content */}
          <div className={`h-full overflow-y-auto p-4 ${sidebarOpen ? "" : "hidden"}`}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">Media</h2>
            <div className="flex items-center gap-2">
              {/* Mobile: close sidebar */}
              <button type="button" onClick={() => setSidebarOpen(false)}
                className="md:hidden rounded-lg border border-neutral-700 bg-neutral-800 p-1.5 text-neutral-400 hover:text-white"
                title="Close">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 rounded-lg bg-yellow-500 px-3 py-1.5 text-xs font-bold text-black hover:bg-yellow-400">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                Upload
              </button>
            </div>
          </div>
          <input ref={fileInputRef} type="file" accept="video/*" multiple className="hidden" onChange={handleFilesSelected} />
          <input ref={homeBadgeInputRef} type="file" accept="image/*" className="hidden" onChange={handleHomeBadgeUpload} />
          <input ref={awayBadgeInputRef} type="file" accept="image/*" className="hidden" onChange={handleAwayBadgeUpload} />
          {Array.from({ length: 8 }).map((_, i) => (
            <input key={i} ref={(el) => { sponsorLogoInputRefs.current[i] = el }} type="file" accept="image/*" className="hidden" onChange={(e) => handleSponsorLogoUpload(i, e)} />
          ))}
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

          {/* Match Day Sponsor */}
          <div className="mb-4 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <h2 className="mb-3 text-sm font-semibold text-neutral-200">Match Day Sponsor</h2>
            <p className="mb-2 text-[10px] text-neutral-500">Logo shown in the corner during playback</p>
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => sponsorLogoInputRefs.current[0]?.click()}
                className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-700">
                {outro.sponsorLogoUrls[0] ? "Change" : "Upload logo"}
              </button>
              {outro.sponsorLogoUrls[0] && (
                <>
                  <img src={outro.sponsorLogoUrls[0]} alt="Sponsor" className="h-10 max-w-[80px] rounded border border-neutral-700 bg-neutral-800 object-contain p-1" />
                  <button type="button" onClick={() => handleRemoveSponsorLogo(0)}
                    className="text-[10px] text-neutral-500 hover:text-red-400">Remove</button>
                </>
              )}
            </div>
          </div>

          {/* Club Profile */}
          <ClubProfilePanel
            profiles={clubProfiles}
            currentTeamName={intro.teamName}
            onSave={handleSaveClubProfile}
            onApply={handleApplyClubProfile}
            onDelete={deleteClubProfile}
          />

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
                { label: "Match date", key: "matchDate" as const, placeholder: "11 Mar 2026" },
                { label: "Age group", key: "ageGroup" as const, placeholder: "U12" },
                { label: "Competition", key: "competition" as const, placeholder: "Premier League" },
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

          {/* Outro */}
          <div className="mb-4 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-200">Outro</h2>
              <label className="flex cursor-pointer items-center gap-2">
                <span className="text-[10px] text-neutral-400">{outro.enabled ? "Enabled" : "Disabled"}</span>
                <button type="button" onClick={() => setOutro((v) => ({ ...v, enabled: !v.enabled }))}
                  className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors ${outro.enabled ? "bg-yellow-500" : "bg-neutral-600"}`}>
                  <span className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${outro.enabled ? "translate-x-4" : "translate-x-0.5"}`} />
                </button>
              </label>
            </div>
            <div className={`space-y-3 ${outro.enabled ? "" : "pointer-events-none opacity-40"}`}>
              <div>
                <label className="mb-1 block text-[10px] font-medium text-neutral-400">Final score</label>
                <input type="text" value={outro.finalScore} onChange={(e) => setOutro((p) => ({ ...p, finalScore: e.target.value }))}
                  placeholder="2 – 1"
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-xs text-white placeholder-neutral-600 focus:border-neutral-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-medium text-neutral-400">Outro duration (s)</label>
                <input type="number" min={2} max={20} step={0.5} value={outro.durationSeconds}
                  onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) setOutro((p) => ({ ...p, durationSeconds: Math.max(2, Math.min(20, v)) })) }}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-xs text-white focus:border-neutral-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-2 block text-[10px] font-medium text-neutral-400">Sponsors (up to 8)</label>
                <div className="grid grid-cols-2 gap-2">
                  {Array.from({ length: 8 }).map((_, i) => {
                    const url = outro.sponsorLogoUrls[i]
                    return (
                      <div key={i} className="flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800 p-1.5">
                        {url ? (
                          <>
                            <img src={url} alt={`Sponsor ${i + 1}`} className="h-8 w-12 rounded object-contain" />
                            <div className="flex flex-col gap-0.5">
                              <button type="button" onClick={() => sponsorLogoInputRefs.current[i]?.click()}
                                className="text-[9px] text-neutral-400 hover:text-white">Change</button>
                              <button type="button" onClick={() => handleRemoveSponsorLogo(i)}
                                className="text-[9px] text-neutral-500 hover:text-red-400">Remove</button>
                            </div>
                          </>
                        ) : (
                          <button type="button" onClick={() => sponsorLogoInputRefs.current[i]?.click()}
                            className="flex w-full items-center justify-center gap-1 py-1 text-[10px] text-neutral-500 hover:text-neutral-300">
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                            Logo {i + 1}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="overflow-hidden rounded-lg border border-neutral-700">
                <p className="mb-1 px-2 pt-2 text-[9px] text-neutral-500">Outro preview</p>
                <OutroCard outro={outro} intro={intro} />
              </div>
            </div>
          </div>

          </div>{/* end full sidebar content */}
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
                {/* ── Dual-video: both elements always in DOM for preloading ── */}
                {/* Primary */}
                <video
                  ref={(el) => { primaryRef.current = el; if (activePrimaryRef.current) videoRef.current = el }}
                  preload="auto"
                  playsInline
                  controls={activePrimary && !!selectedClip?.url && !isPlayingReel}
                  muted={!clipAudioOn || (selectedClip?.muteAudio ?? false)}
                  className="absolute inset-0 h-full w-full object-contain"
                  style={{ opacity: (activePrimary && !!selectedClip?.url && !(isPlayingReel && showIntroCard && introEnabled)) ? 1 : 0, pointerEvents: activePrimary ? "auto" : "none", transition: "opacity 0.08s linear" }}
                  onTimeUpdate={() => { if (activePrimaryRef.current) handleVideoTimeUpdate() }}
                  onEnded={() => { if (activePrimaryRef.current) handleVideoEnded() }}
                />
                {/* Buffer — hidden, preloading next clip */}
                <video
                  ref={(el) => { bufferRef.current = el; if (!activePrimaryRef.current) videoRef.current = el }}
                  preload="auto"
                  playsInline
                  controls={!activePrimary && !!selectedClip?.url && !isPlayingReel}
                  muted={!clipAudioOn || (selectedClip?.muteAudio ?? false)}
                  className="absolute inset-0 h-full w-full object-contain"
                  style={{ opacity: (!activePrimary && !!selectedClip?.url && !(isPlayingReel && showIntroCard && introEnabled)) ? 1 : 0, pointerEvents: activePrimary ? "none" : "auto", transition: "opacity 0.08s linear" }}
                  onTimeUpdate={() => { if (!activePrimaryRef.current) handleVideoTimeUpdate() }}
                  onEnded={() => { if (!activePrimaryRef.current) handleVideoEnded() }}
                />

                {/* Intro card overlay */}
                {isPlayingReel && showIntroCard && introEnabled && (
                  <IntroCard intro={intro} className="absolute inset-0 h-full w-full" />
                )}

                {/* Outro card overlay */}
                {isPlayingReel && showOutroCard && outro.enabled && (
                  <OutroCard outro={outro} intro={intro} className="absolute inset-0 h-full w-full" />
                )}

                {/* Placeholders */}
                {!selectedClip?.url && !isPlayingReel && (
                  selectedClip ? (
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
                  )
                )}

                {/* Goal button — only when a clip is visible */}
                {selectedClip?.url && isNormalClip && !(isPlayingReel && showIntroCard) && (
                  <button type="button" onClick={handleGoalClick}
                    className="absolute right-3 top-3 z-10 rounded-lg bg-yellow-500 px-3 py-1.5 text-xs font-bold text-black shadow-lg hover:bg-yellow-400">
                    ⚽ GOAL
                  </button>
                )}
                {selectedClip?.url && isNormalClip && selectedClip.showScoreboard && !(isPlayingReel && (showIntroCard || showOutroCard)) && (
                  <ScoreboardOverlay scoreboard={scoreboard} minuteMarker={selectedClip.minuteMarker ?? ""} goals={goals} clips={clips} clipId={selectedClip.id} currentTimeInClip={videoCurrentTime} showScorerAfterGoal={selectedClip.showScorerAfterGoal} />
                )}

                {/* Primary sponsor logo — corner for 16:9, centred in bottom black bar for 1:1 / 9:16 */}
                {outro.sponsorLogoUrls[0] && selectedClip?.url && isNormalClip && !(isPlayingReel && (showIntroCard || showOutroCard)) && (
                  aspectRatio === "landscape" ? (
                    <div style={{
                      position: "absolute", bottom: 10, right: 10,
                      background: "rgba(0,0,0,0.45)", borderRadius: 6, padding: "4px 6px",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      pointerEvents: "none",
                    }}>
                      <img src={outro.sponsorLogoUrls[0]} alt="Sponsor" style={{ height: 56, maxWidth: 140, objectFit: "contain" }} />
                    </div>
                  ) : (
                    <div style={{
                      position: "absolute", bottom: 0, left: 0, right: 0,
                      height: aspectRatio === "square" ? "21.875%" : "34.18%",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      pointerEvents: "none",
                    }}>
                      <img src={outro.sponsorLogoUrls[0]} alt="Sponsor" style={{ height: "65%", maxWidth: "55%", objectFit: "contain" }} />
                    </div>
                  )
                )}

              </div>
            </div>

            {/* Timeline */}
            <div className="mx-auto mt-3 w-full max-w-2xl">
              <div className="mb-1.5 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-neutral-200">Timeline</h2>
                <p className="text-xs text-neutral-500">
                  {clips.length === 0
                    ? "Upload clips to build your reel"
                    : "Drag to reorder · handles to trim · click to add ⚽ · G key"}
                </p>
              </div>
              <TimelineTrack clips={clips} goals={goals} selectedClipId={selectedClipId}
                introSelected={introSelected} outroSelected={outroSelected}
                currentReelTime={currentReelTime}
                introDurationSeconds={effectiveIntroDuration}
                outroDurationSeconds={effectiveOutroDuration}
                onSelectClip={handleSelectClip} onSelectIntro={handleSelectIntro} onSelectOutro={handleSelectOutro}
                onTrimIntro={updateIntroDuration}
                onTrimOutro={updateOutroDuration}
                onReorder={handleReorderClips}
                onTrimClip={updateClipTrim} onAddGoalAtReelTime={handleAddGoalAtReelTime} />
            </div>

            {/* Intro settings panel */}
            {introSelected && introEnabled && (
              <div className="mx-auto mt-4 w-full max-w-2xl rounded-xl border border-neutral-800 bg-neutral-900 p-4">
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-semibold text-neutral-200">Intro Card</h3>
                  <span className="rounded-md bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">{intro.durationSeconds.toFixed(1)}s</span>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <label className="text-xs text-neutral-400" htmlFor="intro-duration-panel">Duration</label>
                  <input id="intro-duration-panel" type="number" min={1} max={10} step={0.5}
                    value={intro.durationSeconds}
                    onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) updateIntroDuration(v) }}
                    className="w-20 rounded-md border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-200 [appearance:textfield]" />
                  <span className="text-xs text-neutral-500">seconds · drag the right edge on the timeline to resize</span>
                </div>
              </div>
            )}

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
                fileName={projectTitle.trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, "-") || "highlight"}
                defaultCaption={[
                  scoreboard.homeTeamName && scoreboard.awayTeamName
                    ? `${scoreboard.homeTeamName} ${scoreboard.homeScore ?? 0} - ${scoreboard.awayScore ?? 0} ${scoreboard.awayTeamName}`
                    : scoreboard.homeTeamName || projectTitle,
                  intro.matchDate ? `📅 ${intro.matchDate}` : "",
                  intro.ageGroup ? `⚽ ${intro.ageGroup}` : "",
                  "\n#MatchHighlights #Football",
                ].filter(Boolean).join(" · ").replace(" · \n", "\n")}
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
                  <button type="button" onClick={() => { revokeIfBlobUrl(musicTrack.url); setMusicTrack(null); idbDelete("__music__").catch(console.error) }}
                    className="text-xs text-neutral-500 hover:text-red-400">Remove</button>
                )}
              </div>
              <div className="mb-3">
                <MusicSearch onSelectTrack={handleLibraryTrackSelected} />
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
