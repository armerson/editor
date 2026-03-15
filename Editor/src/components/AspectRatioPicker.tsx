import type { AspectRatioPreset } from "../types"

type Option = {
  value: AspectRatioPreset
  label: string
  /** SVG proportions for the mini icon */
  iconW: number
  iconH: number
  hint: string
}

const OPTIONS: Option[] = [
  { value: "landscape", label: "16:9", iconW: 16, iconH: 9, hint: "YouTube / TV" },
  { value: "square", label: "1:1", iconW: 10, iconH: 10, hint: "Instagram feed" },
  { value: "vertical", label: "9:16", iconW: 9, iconH: 16, hint: "Reels / TikTok" },
]

type Props = {
  value: AspectRatioPreset
  onChange: (v: AspectRatioPreset) => void
}

export function AspectRatioPicker({ value, onChange }: Props) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-neutral-400 whitespace-nowrap">Format</span>
      <div className="flex gap-1.5">
        {OPTIONS.map((opt) => {
          const active = value === opt.value
          // Normalise icon to fit in a 20×14 bounding box
          const scale = Math.min(20 / opt.iconW, 14 / opt.iconH)
          const w = Math.round(opt.iconW * scale)
          const h = Math.round(opt.iconH * scale)

          return (
            <button
              key={opt.value}
              type="button"
              title={`${opt.label} — ${opt.hint}`}
              onClick={() => onChange(opt.value)}
              className={`group flex flex-col items-center gap-1 rounded-lg border px-2.5 py-1.5 transition-colors ${
                active
                  ? "border-yellow-500 bg-yellow-500/10 text-yellow-400"
                  : "border-neutral-700 bg-neutral-800 text-neutral-400 hover:border-neutral-500 hover:bg-neutral-700"
              }`}
            >
              {/* Aspect-ratio icon */}
              <svg
                width={20}
                height={14}
                viewBox="0 0 20 14"
                className="block shrink-0"
                aria-hidden
              >
                <rect
                  x={(20 - w) / 2}
                  y={(14 - h) / 2}
                  width={w}
                  height={h}
                  rx={1}
                  className={active ? "fill-yellow-500/20 stroke-yellow-400" : "fill-neutral-700 stroke-neutral-500"}
                  strokeWidth={1.5}
                />
              </svg>
              <span className="text-[10px] font-semibold leading-none">{opt.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
