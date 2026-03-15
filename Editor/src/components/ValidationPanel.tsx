type Props = {
  errors: string[]
}

export function ValidationPanel({ errors }: Props) {
  if (errors.length === 0) return null

  return (
    <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4">
      <div className="mb-2 flex items-center gap-2">
        <svg
          className="h-4 w-4 shrink-0 text-red-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
          />
        </svg>
        <span className="text-sm font-semibold text-red-400">Cannot render yet</span>
      </div>
      <ul className="space-y-1">
        {errors.map((err) => (
          <li key={err} className="flex items-start gap-2 text-xs text-red-300">
            <span className="mt-0.5 shrink-0 text-red-500">•</span>
            <span>{err}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
