import { ReactNode, useEffect } from 'react'

interface ModalProps {
  children?: ReactNode
  onClose?: () => void
}

export default function Modal(props: ModalProps) {
  const { children, onClose } = props

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose?.()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      role="dialog"
      aria-modal="true"
      className={[
        'fixed inset-0 z-50 flex justify-center items-center p-4',
        'bg-black/60 backdrop-blur-md',
        'animate-fade-in',
      ].join(' ')}
      onClick={e => {
        if (e.target === e.currentTarget) onClose?.()
      }}
      onKeyDown={e => {
        if (e.key === 'Escape') onClose?.()
      }}
    >
      <div className="relative glass rounded-2xl p-8 sm:p-12 max-w-lg w-full animate-scale-in text-gray-100">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-1 rounded-lg hover:bg-surface-100 text-surface-300 hover:text-gray-100 transition-colors"
            aria-label="Close"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
        {children}
      </div>
    </div>
  )
}
