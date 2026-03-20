import type { IntroData, OutroData } from "../types"

const KEYFRAMES = `
@keyframes oc-fade-up {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0);   }
}
@keyframes oc-fade {
  from { opacity: 0; }
  to   { opacity: 1; }
}
`

type Props = {
  outro: OutroData
  intro?: IntroData
  className?: string
}

export function OutroCard({ outro, intro, className = "" }: Props) {
  const anim = {
    score:    "oc-fade-up 0.4s 0.1s both",
    label:    "oc-fade 0.35s 0.05s both",
    divider:  "oc-fade 0.3s 0.3s both",
    thanks:   "oc-fade-up 0.4s 0.45s both",
    sponsors: "oc-fade 0.5s 0.6s both",
  }

  const logos = (outro.sponsorLogoUrls ?? []).filter(Boolean)

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
        minHeight: 220,
      }}
    >
      <style>{KEYFRAMES}</style>

      {/* Subtle radial spotlight */}
      <div style={{
        pointerEvents: "none",
        position: "absolute",
        inset: 0,
        background: "radial-gradient(ellipse 70% 50% at 50% 44%, rgba(99,102,241,0.10) 0%, rgba(250,204,21,0.04) 40%, transparent 70%)",
      }} />

      {/* Team badges and names from intro */}
      {intro && (intro.teamName || intro.opponent) && (
        <div style={{
          animation: anim.label,
          display: "flex",
          alignItems: "center",
          gap: 16,
          marginBottom: 20,
        }}>
          {/* Home side */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            {intro.homeBadgeUrl && (
              <img src={intro.homeBadgeUrl} alt={intro.teamName} style={{ height: 52, width: 52, objectFit: "contain" }} />
            )}
            {intro.teamName && (
              <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.9)", textAlign: "center", maxWidth: 120, fontFamily: "system-ui, -apple-system, sans-serif" }}>
                {intro.teamName}
              </span>
            )}
          </div>
          {/* VS */}
          <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.25)", letterSpacing: 2, fontFamily: "system-ui, -apple-system, sans-serif" }}>
            vs
          </span>
          {/* Away side */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            {intro.awayBadgeUrl && (
              <img src={intro.awayBadgeUrl} alt={intro.opponent} style={{ height: 52, width: 52, objectFit: "contain" }} />
            )}
            {intro.opponent && (
              <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.9)", textAlign: "center", maxWidth: 120, fontFamily: "system-ui, -apple-system, sans-serif" }}>
                {intro.opponent}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Final Score */}
      {outro.finalScore && (
        <>
          <p style={{
            animation: anim.label,
            margin: 0,
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: 3,
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.35)",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}>
            Final Score
          </p>
          <p style={{
            animation: anim.score,
            margin: "6px 0 0",
            fontSize: 72,
            fontWeight: 800,
            color: "#facc15",
            lineHeight: 1,
            letterSpacing: -1,
            fontVariantNumeric: "tabular-nums",
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}>
            {outro.finalScore}
          </p>
        </>
      )}

      {/* Divider */}
      <div style={{
        animation: anim.divider,
        width: 160,
        height: 1,
        background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.10) 30%, rgba(255,255,255,0.10) 70%, transparent 100%)",
        margin: "20px 0 16px",
        flexShrink: 0,
      }} />

      {/* Thanks to our Sponsors */}
      <p style={{
        animation: anim.thanks,
        margin: "0 0 16px",
        fontSize: 17,
        fontWeight: 600,
        color: "rgba(255,255,255,0.65)",
        letterSpacing: 0.5,
        fontFamily: "system-ui, -apple-system, sans-serif",
        textAlign: "center",
      }}>
        Thanks to our Sponsors
      </p>

      {/* Sponsor logo grid */}
      {logos.length > 0 ? (
        <div style={{
          animation: anim.sponsors,
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          justifyContent: "center",
          alignItems: "center",
          maxWidth: 480,
        }}>
          {logos.map((url, i) => (
            <div key={i} style={{
              background: "rgba(255,255,255,0.06)",
              borderRadius: 8,
              padding: "6px 10px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
              <img
                src={url}
                alt={`Sponsor ${i + 1}`}
                style={{ height: 59, maxWidth: 160, objectFit: "contain", opacity: 0.85 }}
              />
            </div>
          ))}
        </div>
      ) : (
        <div style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 8,
          justifyContent: "center",
        }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{
              width: 90,
              height: 52,
              borderRadius: 8,
              border: "1px dashed rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.02)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}>
              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.2)" }}>Logo {i + 1}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
