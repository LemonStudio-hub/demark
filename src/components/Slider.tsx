type SliderProps = {
  label?: string
  value?: number
  min?: number
  max?: number
  onChange: (value: number) => void
  onStart?: () => void
}

export default function Slider(props: SliderProps) {
  const { value, label, min, max, onChange, onStart } = props

  const step = ((max || 100) - (min || 0)) / 100

  return (
    <div className="inline-flex items-center gap-3 text-gray-300">
      <span className="text-sm font-medium">
        {label}: {value}
      </span>
      <input
        className="w-32 sm:w-48"
        type="range"
        step={step}
        min={min}
        max={max}
        value={value}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        onPointerDown={onStart}
        onChange={ev => {
          ev.preventDefault()
          ev.stopPropagation()
          onChange(parseInt(ev.currentTarget.value, 10))
        }}
      />
    </div>
  )
}
