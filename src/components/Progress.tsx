interface ProgressProps {
  percent: number
}

export default function Progress({ percent }: ProgressProps) {
  return (
    <div
      className="w-full flex items-center gap-3"
      role="progressbar"
      aria-valuenow={Math.round(percent)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="relative flex-1 bg-surface-100 rounded-full h-2 overflow-hidden">
        <div
          className="absolute left-0 top-0 h-full bg-gradient-to-r from-primary-500 to-primary-400 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      <span className="w-12 text-right text-sm font-mono text-surface-300">
        {Math.round(percent)}%
      </span>
    </div>
  )
}
