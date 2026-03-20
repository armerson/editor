import type { IntroData } from "../types"

// ─── Keyframe definitions injected once ──────────────────────────────────────
const KEYFRAMES = `
@keyframes ic-badge-in {
  from { transform: scale(0.72); opacity: 0; }
  to   { transform: scale(1);    opacity: 1; }
}
@keyframes ic-fade-up {
  from { opacity: 0; transform: translateY(7px); }
  to   { opacity: 1; transform: translateY(0);   }
}
@keyframes ic-fade {
  from { opacity: 0; }
  to   { opacity: 1; }
}
`

type Props = {
  intro: IntroData
  className?: string
}

// ─── Badge components ─────────────────────────────────────────────────────────

function BadgePlaceholder({
  label,
  animStyle,
}: {
  label: string
  animStyle: React.CSSProperties
}) {
  return (
    <div
      style={{
        ...animStyle,
        width: 128,
        height: 128,
        borderRadius: "50%",
        border: "2px dashed rgba(255,255,255,0.15)",
        background: "rgba(255,255,255,0.04)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{label}</span>
    </div>
  )
}

function BadgeImg({
  src,
  alt,
  animStyle,
}: {
  src: string
  alt: string
  animStyle: React.CSSProperties
}) {
  return (
    <img
      src={src}
      alt={alt}
      style={{
        ...animStyle,
        width: 128,
        height: 128,
        borderRadius: "50%",
        objectFit: "contain",
        flexShrink: 0,
        boxShadow: "0 6px 24px rgba(0,0,0,0.6), 0 0 0 2px rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.03)",
      }}
    />
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function IntroCard({ intro, className = "" }: Props) {
  // Animation timing (CSS animation shorthand: duration delay fill-mode)
  const anim = {
    homeTeam: "ic-badge-in 0.45s cubic-bezier(0.34,1.56,0.64,1) both",
    awayTeam: "ic-badge-in 0.45s 0.1s cubic-bezier(0.34,1.56,0.64,1) both",
    vs: "ic-fade 0.3s 0.35s both",
    homeLabel: "ic-fade-up 0.35s 0.42s both",
    awayLabel: "ic-fade-up 0.35s 0.48s both",
    divider: "ic-fade 0.4s 0.62s both",
    subtitle: "ic-fade-up 0.4s 0.75s both",
  }

  const hasHome = !!intro.homeBadgeUrl
  const hasAway = !!intro.awayBadgeUrl
  const hasBoth = hasHome && hasAway

  return (
    <div
      className={className}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0a0f",
        overflow: "hidden",
        padding: "40px 32px",
      }}
    >
      {/* Inject keyframes */}
      <style>{KEYFRAMES}</style>

      {/* Radial gradient spotlight */}
      <div
        style={{
          pointerEvents: "none",
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 75% 55% at 50% 46%, rgba(99,102,241,0.10) 0%, rgba(59,130,246,0.04) 40%, transparent 70%)",
        }}
      />

      {/* ── Team badge row ───────────────────────────────────────── */}
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 32,
          marginBottom: 20,
        }}
      >
        {/* Home team */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
            width: 140,
          }}
        >
          {hasHome ? (
            <BadgeImg
              src={intro.homeBadgeUrl}
              alt={intro.teamName || "Home"}
              animStyle={{ animation: anim.homeTeam }}
            />
          ) : (
            <BadgePlaceholder label="Home" animStyle={{ animation: anim.homeTeam }} />
          )}
          <span
            style={{
              animation: anim.homeLabel,
              fontSize: 13,
              fontWeight: 700,
              color: "rgba(255,255,255,0.92)",
              textAlign: "center",
              lineHeight: 1.3,
              letterSpacing: 0.2,
              fontFamily: "system-ui, -apple-system, sans-serif",
              wordBreak: "break-word",
              overflowWrap: "anywhere",
            }}
          >
            {intro.teamName || "Home"}
          </span>
        </div>

        {/* VS + away team — only when both badges provided */}
        {hasBoth && (
          <>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                paddingTop: 44,
              }}
            >
              <span
                style={{
                  animation: anim.vs,
                  fontSize: 26,
                  fontWeight: 900,
                  color: "rgba(255,255,255,0.55)",
                  letterSpacing: 2,
                  fontFamily: "system-ui, -apple-system, sans-serif",
                  lineHeight: 1,
                }}
              >
                VS
              </span>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 10,
                width: 140,
              }}
            >
              <BadgeImg
                src={intro.awayBadgeUrl}
                alt={intro.opponent || "Away"}
                animStyle={{ animation: anim.awayTeam }}
              />
              <span
                style={{
                  animation: anim.awayLabel,
                  fontSize: 13,
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.92)",
                  textAlign: "center",
                  lineHeight: 1.3,
                  letterSpacing: 0.2,
                  fontFamily: "system-ui, -apple-system, sans-serif",
                  wordBreak: "break-word",
                  overflowWrap: "anywhere",
                }}
              >
                {intro.opponent || "Away"}
              </span>
            </div>
          </>
        )}
      </div>

      {/* ── Divider ──────────────────────────────────────────────── */}
      <div
        style={{
          animation: anim.divider,
          width: 160,
          height: 1,
          background:
            "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.12) 30%, rgba(255,255,255,0.12) 70%, transparent 100%)",
          marginBottom: 16,
          flexShrink: 0,
        }}
      />

      {/* ── Subtitle block ───────────────────────────────────────── */}
      <div
        style={{
          animation: anim.subtitle,
          textAlign: "center",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        {intro.matchDate && (
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.45)", margin: 0 }}>
            {intro.matchDate}
          </p>
        )}
        {intro.ageGroup && (
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: "rgba(255,255,255,0.35)", margin: 0 }}>
            {intro.ageGroup}
          </p>
        )}
        {intro.competition && (
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase", color: "rgba(255,255,255,0.4)", margin: 0 }}>
            {intro.competition}
          </p>
        )}
        <p
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 3,
            textTransform: "uppercase",
            color: "rgba(99,102,241,0.85)",
            margin: "4px 0 0",
          }}
        >
          Match Highlights
        </p>
      </div>

    </div>
  )
}
