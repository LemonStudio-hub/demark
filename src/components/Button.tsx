import { ReactNode, useState } from 'react'

interface ButtonProps {
  children: ReactNode
  className?: string
  icon?: ReactNode
  primary?: boolean
  disabled?: boolean
  title?: string
  style?: {
    [key: string]: string
  }
  onClick?: () => void
  onDown?: () => void
  onUp?: () => void
  onEnter?: () => void
  onLeave?: () => void
}

export default function Button(props: ButtonProps) {
  const {
    children,
    className,
    icon,
    primary,
    disabled,
    title,
    style,
    onClick,
    onDown,
    onUp,
    onEnter,
    onLeave,
  } = props
  const [active, setActive] = useState(false)
  let background = ''
  if (primary) {
    background =
      'bg-primary-400 text-surface hover:bg-primary-500 shadow-sm shadow-primary-400/20'
  }
  if (active) {
    background = 'bg-primary-500 text-white scale-95'
  }
  if (!primary && !active) {
    background = 'hover:bg-surface-100 text-gray-300 hover:text-gray-100'
  }
  if (disabled) {
    background = 'opacity-40 pointer-events-none'
  }
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      onPointerDown={() => {
        if (disabled) return
        setActive(true)
        onDown?.()
      }}
      onPointerUp={() => {
        setActive(false)
        onUp?.()
      }}
      onPointerEnter={() => {
        onEnter?.()
      }}
      onPointerLeave={() => {
        onLeave?.()
      }}
      className={[
        'inline-flex items-center gap-2 py-2.5 px-4 rounded-xl cursor-pointer transition-all duration-200 select-none focus-ring text-sm font-medium',
        background,
        className,
      ].join(' ')}
      style={style}
    >
      {icon}
      <span className="whitespace-nowrap select-none">{children}</span>
    </button>
  )
}
