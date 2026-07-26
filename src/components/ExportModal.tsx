import { useCallback, useState } from 'react'
import pica from 'pica'
import Button from './Button'
import Modal from './Modal'
import * as m from '../paraglide/messages'

export type ExportFormat = 'image/png' | 'image/jpeg' | 'image/webp'

interface ExportModalProps {
  source: HTMLCanvasElement | HTMLImageElement
  cropRect?: { x: number; y: number; w: number; h: number }
  filename: string
  onClose: () => void
}

const FORMAT_OPTIONS: { value: ExportFormat; label: string; ext: string }[] = [
  { value: 'image/png', label: 'PNG', ext: '.png' },
  { value: 'image/jpeg', label: 'JPEG', ext: '.jpg' },
  { value: 'image/webp', label: 'WebP', ext: '.webp' },
]

const picaInstance = pica()

export default function ExportModal({
  source,
  cropRect,
  filename,
  onClose,
}: ExportModalProps) {
  const [format, setFormat] = useState<ExportFormat>('image/png')
  const [quality, setQuality] = useState(92)
  const [exporting, setExporting] = useState(false)

  const isLossy = format === 'image/jpeg' || format === 'image/webp'

  const getSourceCanvas = useCallback(() => {
    let canvas: HTMLCanvasElement
    if (source instanceof HTMLCanvasElement) {
      canvas = source
    } else {
      canvas = document.createElement('canvas')
      canvas.width = source.naturalWidth || source.width
      canvas.height = source.naturalHeight || source.height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(source, 0, 0)
    }

    // Apply crop if provided
    if (cropRect) {
      const cropped = document.createElement('canvas')
      cropped.width = cropRect.w
      cropped.height = cropRect.h
      const ctx = cropped.getContext('2d')!
      ctx.drawImage(
        canvas,
        cropRect.x,
        cropRect.y,
        cropRect.w,
        cropRect.h,
        0,
        0,
        cropRect.w,
        cropRect.h
      )
      return cropped
    }

    return canvas
  }, [source, cropRect])

  const handleExport = useCallback(async () => {
    setExporting(true)
    try {
      let canvas = getSourceCanvas()

      // For JPEG, fill white background (no alpha channel)
      if (format === 'image/jpeg') {
        const tmp = document.createElement('canvas')
        tmp.width = canvas.width
        tmp.height = canvas.height
        const ctx = tmp.getContext('2d')!
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, tmp.width, tmp.height)
        ctx.drawImage(canvas, 0, 0)
        canvas = tmp
      }

      // Use pica for high-quality blob conversion
      const qualityValue = isLossy ? quality / 100 : 1
      let blob: Blob | null

      try {
        blob = await picaInstance.toBlob(canvas, format, qualityValue)
      } catch {
        // Fallback to native toBlob
        blob = await new Promise<Blob | null>(resolve => {
          canvas.toBlob(resolve, format, qualityValue)
        })
      }

      if (!blob) return

      const ext = FORMAT_OPTIONS.find(f => f.value === format)?.ext || '.png'
      const baseName = filename.replace(/\.[^.]+$/, '')
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${baseName}${ext}`
      link.dispatchEvent(
        new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          view: window,
        })
      )
      setTimeout(() => {
        URL.revokeObjectURL(url)
        link.remove()
      }, 100)

      onClose()
    } finally {
      setExporting(false)
    }
  }, [source, format, quality, isLossy, filename, onClose, getSourceCanvas])

  const getEstimatedSize = () => {
    const canvas = getSourceCanvas()
    const pixels = canvas.width * canvas.height
    if (format === 'image/png') {
      return `~${Math.round(((pixels * 3) / 1024 / 1024) * 1.5)}MB`
    }
    const q = quality / 100
    if (format === 'image/jpeg') {
      return `~${Math.round(((pixels * 3) / 1024 / 1024) * q * 0.3)}MB`
    }
    return `~${Math.round(((pixels * 3) / 1024 / 1024) * q * 0.2)}MB`
  }

  return (
    <Modal onClose={onClose}>
      <div className="space-y-6">
        <h2 className="text-xl font-semibold">{m.export_image()}</h2>

        {/* Format selector */}
        <div className="space-y-2">
          <span className="text-sm font-medium text-gray-300">
            {m.format()}
          </span>
          <div className="flex gap-2">
            {FORMAT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFormat(opt.value)}
                className={[
                  'px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200',
                  format === opt.value
                    ? 'bg-primary-400 text-surface'
                    : 'bg-surface-100 text-gray-300 hover:bg-surface-200',
                ].join(' ')}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Quality slider */}
        {isLossy && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-300">
                {m.quality()}
              </span>
              <span className="text-sm font-mono text-surface-300">
                {quality}%
              </span>
            </div>
            <input
              type="range"
              min={10}
              max={100}
              value={quality}
              onChange={e => setQuality(parseInt(e.target.value, 10))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-surface-300">
              <span>Smaller file</span>
              <span>Better quality</span>
            </div>
          </div>
        )}

        {/* Info */}
        <div className="text-sm text-surface-300">{getEstimatedSize()}</div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button onClick={onClose}>{m.cancel()}</Button>
          <Button primary onClick={handleExport} disabled={exporting}>
            {exporting ? '...' : m.save_as()}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
