import { useCallback, useState } from 'react'
import { ToastContainer } from '../components/Toast'
import type { ToastItem, ToastType } from '../components/Toast'

let toastId = 0

export default function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    toastId += 1
    const id = toastId
    setToasts(prev => {
      const next = [...prev, { id, message, type }]
      return next.length > 3 ? next.slice(-3) : next
    })
  }, [])

  const ToastContainerComponent = useCallback(
    () => <ToastContainer toasts={toasts} onRemove={removeToast} />,
    [toasts, removeToast]
  )

  return { toast, ToastContainer: ToastContainerComponent }
}
