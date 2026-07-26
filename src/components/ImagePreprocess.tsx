import { useCallback, useEffect, useRef, useState } from 'react'
import pica from 'pica'
import Button from './Button'
import ExportModal from './ExportModal'
import * as m from '../paraglide/messages'

interface ImagePreprocessProps {
  file: File
  onApply: (file: File) => void
  onCancel: () => void
}

interface CropRect {
  x: number
  y: number
  w: number
  h: number
}

type HandleDir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'move'

const picaInstance = pica()

export default function ImagePreprocess({
  file,
  onApply,
  onCancel,
}: ImagePreprocessProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [rotation, setRotation] = useState(0)
  const [flipH, setFlipH] = useState(false)
  const [flipV, setFlipV] = useState(false)
  const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, w: 0, h: 0 })
  const [dragging, setDragging] = useState<HandleDir | null>(null)
  const [showExport, setShowExport] = useState(false)
  const dragStart = useRef({
    x: 0,
    y: 0,
    crop: { x: 0, y: 0, w: 0, h: 0 },
  })

  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 })
  const [transformedSize, setTransformedSize] = useState({ w: 0, h: 0 })

  // Load image
  useEffect(() => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      imgRef.current = img
      setImgLoaded(true)
      const isRotated = rotation % 180 !== 0
      const w = isRotated ? img.naturalHeight : img.naturalWidth
      const h = isRotated ? img.naturalWidth : img.naturalHeight
      setTransformedSize({ w, h })
      setCrop({ x: 0, y: 0, w, h })
    }
    img.src = url
  }, [file])

  // Update transformed size on rotation change
  useEffect(() => {
    const img = imgRef.current
    if (!img) return
    const isRotated = rotation % 180 !== 0
    const w = isRotated ? img.naturalHeight : img.naturalWidth
    const h = isRotated ? img.naturalWidth : img.naturalHeight
    setTransformedSize({ w, h })
    setCrop({ x: 0, y: 0, w, h })
  }, [rotation])

  // Draw the transformed image on canvas
  const drawImage = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    const img = imgRef.current
    if (!canvas || !container || !img) return

    const isRotated = rotation % 180 !== 0
    const srcW = isRotated ? img.naturalHeight : img.naturalWidth
    const srcH = isRotated ? img.naturalWidth : img.naturalHeight

    const maxW = container.clientWidth - 32
    const maxH = container.clientHeight - 32
    const scale = Math.min(maxW / srcW, maxH / srcH, 1)
    const dispW = Math.round(srcW * scale)
    const dispH = Math.round(srcH * scale)

    canvas.width = dispW
    canvas.height = dispH
    setDisplaySize({ w: dispW, h: dispH })

    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, dispW, dispH)
    ctx.save()
    ctx.translate(dispW / 2, dispH / 2)
    ctx.rotate((rotation * Math.PI) / 180)
    ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1)

    const drawW = img.naturalWidth * scale
    const drawH = img.naturalHeight * scale
    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH)
    ctx.restore()
  }, [rotation, flipH, flipV])

  // Redraw when image loads, rotation/flip changes, or window resizes
  useEffect(() => {
    if (!imgLoaded) return
    const timer = setTimeout(drawImage, 10)
    return () => clearTimeout(timer)
  }, [imgLoaded, drawImage])

  useEffect(() => {
    const handleResize = () => drawImage()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [drawImage])

  const toDisplay = useCallback(
    (c: CropRect) => {
      if (!transformedSize.w || !displaySize.w) return c
      const sx = displaySize.w / transformedSize.w
      const sy = displaySize.h / transformedSize.h
      return {
        x: Math.round(c.x * sx),
        y: Math.round(c.y * sy),
        w: Math.round(c.w * sx),
        h: Math.round(c.h * sy),
      }
    },
    [transformedSize, displaySize]
  )

  const displayCrop = toDisplay(crop)
  const MIN_SIZE = 10

  const clampCrop = useCallback(
    (c: CropRect): CropRect => {
      const maxW = transformedSize.w
      const maxH = transformedSize.h
      let { x, y, w, h } = c
      w = Math.max(MIN_SIZE, Math.min(w, maxW))
      h = Math.max(MIN_SIZE, Math.min(h, maxH))
      x = Math.max(0, Math.min(x, maxW - w))
      y = Math.max(0, Math.min(y, maxH - h))
      return { x, y, w, h }
    },
    [transformedSize]
  )

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  const handlePointerDown = (
    e: React.MouseEvent | React.TouchEvent,
    dir: HandleDir
  ) => {
    e.preventDefault()
    e.stopPropagation()
    const pos = getPos(e)
    setDragging(dir)
    dragStart.current = { x: pos.x, y: pos.y, crop: { ...crop } }
  }

  useEffect(() => {
    if (!dragging) return

    const handleMove = (e: MouseEvent | TouchEvent) => {
      e.preventDefault()
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
      const x = clientX - rect.left
      const y = clientY - rect.top
      const dx = x - dragStart.current.x
      const dy = y - dragStart.current.y

      const sx = transformedSize.w / displaySize.w
      const sy = transformedSize.h / displaySize.h
      const idx = dx * sx
      const idy = dy * sy

      const { crop: startCrop } = dragStart.current
      const newCrop = { ...startCrop }

      if (dragging === 'move') {
        newCrop.x = startCrop.x + idx
        newCrop.y = startCrop.y + idy
      } else {
        if (dragging.includes('w')) {
          newCrop.x = startCrop.x + idx
          newCrop.w = startCrop.w - idx
        }
        if (dragging.includes('e')) {
          newCrop.w = startCrop.w + idx
        }
        if (dragging.includes('n')) {
          newCrop.y = startCrop.y + idy
          newCrop.h = startCrop.h - idy
        }
        if (dragging.includes('s')) {
          newCrop.h = startCrop.h + idy
        }
      }

      setCrop(clampCrop(newCrop))
    }

    const handleUp = () => setDragging(null)

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    window.addEventListener('touchmove', handleMove, { passive: false })
    window.addEventListener('touchend', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      window.removeEventListener('touchmove', handleMove)
      window.removeEventListener('touchend', handleUp)
    }
  }, [dragging, clampCrop, transformedSize, displaySize])

  const rotateLeft = () => setRotation(r => (r + 270) % 360)
  const rotateRight = () => setRotation(r => (r + 90) % 360)

  // Build the full transformed canvas (rotation + flip) from original image
  const buildTransformedCanvas = useCallback(() => {
    const img = imgRef.current!
    const isRotated = rotation % 180 !== 0
    const fullW = isRotated ? img.naturalHeight : img.naturalWidth
    const fullH = isRotated ? img.naturalWidth : img.naturalHeight

    const tmp = document.createElement('canvas')
    tmp.width = fullW
    tmp.height = fullH
    const tmpCtx = tmp.getContext('2d')!

    // Use high-quality rendering
    tmpCtx.imageSmoothingEnabled = true
    tmpCtx.imageSmoothingQuality = 'high'

    tmpCtx.translate(fullW / 2, fullH / 2)
    tmpCtx.rotate((rotation * Math.PI) / 180)
    tmpCtx.scale(flipH ? -1 : 1, flipV ? -1 : 1)
    tmpCtx.drawImage(
      img,
      -img.naturalWidth / 2,
      -img.naturalHeight / 2,
      img.naturalWidth,
      img.naturalHeight
    )
    return tmp
  }, [rotation, flipH, flipV])

  // High-quality crop using pica for resampling
  const createProcessedCanvas = useCallback(async () => {
    const transformed = buildTransformedCanvas()

    // Extract crop region at original resolution
    const croppedCanvas = document.createElement('canvas')
    croppedCanvas.width = crop.w
    croppedCanvas.height = crop.h
    const croppedCtx = croppedCanvas.getContext('2d')!
    croppedCtx.drawImage(
      transformed,
      crop.x,
      crop.y,
      crop.w,
      crop.h,
      0,
      0,
      crop.w,
      crop.h
    )

    // Use pica for high-quality output (Lanczos resampling preserves edges)
    const outputCanvas = document.createElement('canvas')
    outputCanvas.width = crop.w
    outputCanvas.height = crop.h

    try {
      await picaInstance.resize(croppedCanvas, outputCanvas, {
        filter: 'mks2013',
      })
    } catch {
      // Fallback: if pica fails, use the direct crop
      return croppedCanvas
    }

    return outputCanvas
  }, [buildTransformedCanvas, crop])

  const handleApply = async () => {
    const outCanvas = await createProcessedCanvas()
    // Use pica's toBlob for consistent quality
    try {
      const blob = await picaInstance.toBlob(outCanvas, 'image/png')
      const croppedFile = new File([blob], file.name, { type: 'image/png' })
      onApply(croppedFile)
    } catch {
      // Fallback to native toBlob
      outCanvas.toBlob(blob => {
        if (blob) {
          const croppedFile = new File([blob], file.name, {
            type: 'image/png',
          })
          onApply(croppedFile)
        }
      }, 'image/png')
    }
  }

  const renderHandle = (dir: HandleDir, style: React.CSSProperties) => (
    <div
      key={dir}
      className="absolute z-20"
      role="button"
      tabIndex={0}
      aria-label={`Crop ${dir}`}
      style={{
        ...style,
        cursor: dir === 'move' ? 'move' : `${dir}-resize`,
        touchAction: 'none',
      }}
      onMouseDown={e => handlePointerDown(e, dir)}
      onTouchStart={e => handlePointerDown(e, dir)}
    >
      {dir !== 'move' && (
        <div
          className="w-3 h-3 bg-white rounded-full border-2 border-primary-400 shadow-md"
          style={{ transform: 'translate(-50%, -50%)' }}
        />
      )}
    </div>
  )

  const clipPathValue = `polygon(
    0 0, 100% 0, 100% 100%, 0 100%, 0 0,
    ${displayCrop.x}px ${displayCrop.y}px,
    ${displayCrop.x}px ${displayCrop.y + displayCrop.h}px,
    ${displayCrop.x + displayCrop.w}px ${displayCrop.y + displayCrop.h}px,
    ${displayCrop.x + displayCrop.w}px ${displayCrop.y}px,
    ${displayCrop.x}px ${displayCrop.y}px
  )`

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface/95 backdrop-blur-sm animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between px-4 sm:px-6 h-14 border-b border-surface-100/50">
        <span className="text-lg font-semibold text-gray-100">
          {m.preprocess()}
        </span>
        <div className="flex items-center gap-2">
          <Button onClick={onCancel}>{m.cancel()}</Button>
          <Button onClick={() => setShowExport(true)}>{m.export_btn()}</Button>
          <Button primary onClick={handleApply}>
            {m.apply()}
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-center gap-2 py-3 border-b border-surface-100/50">
        <Button
          onClick={rotateLeft}
          icon={
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
                d="M3 10h10a5 5 0 015 5v2M3 10l4-4M3 10l4 4"
              />
            </svg>
          }
        >
          {m.rotate_left()}
        </Button>
        <Button
          onClick={rotateRight}
          icon={
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
                d="M21 10H11a5 5 0 00-5 5v2M21 10l-4-4M21 10l-4 4"
              />
            </svg>
          }
        >
          {m.rotate_right()}
        </Button>
        <Button
          onClick={() => setFlipH(v => !v)}
          icon={
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
                d="M8 7l4-4v18M16 7l4 4-4 4"
              />
            </svg>
          }
        >
          {m.flip_h()}
        </Button>
        <Button
          onClick={() => setFlipV(v => !v)}
          icon={
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
                d="M7 8l-4 4h18M7 16l4 4 4-4"
              />
            </svg>
          }
        >
          {m.flip_v()}
        </Button>
      </div>

      {/* Canvas area */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center overflow-hidden relative"
      >
        <div
          className="relative"
          style={{
            width: displaySize.w || 1,
            height: displaySize.h || 1,
          }}
        >
          <canvas
            ref={canvasRef}
            className="rounded-lg shadow-2xl shadow-black/50"
          />

          {/* Dark overlay outside crop */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.6)',
              clipPath: clipPathValue,
            }}
          />

          {/* Crop border */}
          <div
            className="absolute border-2 border-white/80 pointer-events-none"
            style={{
              left: displayCrop.x,
              top: displayCrop.y,
              width: displayCrop.w,
              height: displayCrop.h,
            }}
          />

          {/* Rule of thirds grid */}
          <div
            className="absolute pointer-events-none"
            style={{
              left: displayCrop.x,
              top: displayCrop.y,
              width: displayCrop.w,
              height: displayCrop.h,
            }}
          >
            <div className="absolute left-1/3 top-0 w-px h-full bg-white/20" />
            <div className="absolute left-2/3 top-0 w-px h-full bg-white/20" />
            <div className="absolute top-1/3 left-0 h-px w-full bg-white/20" />
            <div className="absolute top-2/3 left-0 h-px w-full bg-white/20" />
          </div>

          {/* Move area */}
          {renderHandle('move', {
            left: displayCrop.x,
            top: displayCrop.y,
            width: displayCrop.w,
            height: displayCrop.h,
          })}

          {/* Corner handles */}
          {renderHandle('nw', { left: displayCrop.x, top: displayCrop.y })}
          {renderHandle('ne', {
            left: displayCrop.x + displayCrop.w,
            top: displayCrop.y,
          })}
          {renderHandle('sw', {
            left: displayCrop.x,
            top: displayCrop.y + displayCrop.h,
          })}
          {renderHandle('se', {
            left: displayCrop.x + displayCrop.w,
            top: displayCrop.y + displayCrop.h,
          })}

          {/* Edge handles */}
          {renderHandle('n', {
            left: displayCrop.x + displayCrop.w / 2,
            top: displayCrop.y,
          })}
          {renderHandle('s', {
            left: displayCrop.x + displayCrop.w / 2,
            top: displayCrop.y + displayCrop.h,
          })}
          {renderHandle('w', {
            left: displayCrop.x,
            top: displayCrop.y + displayCrop.h / 2,
          })}
          {renderHandle('e', {
            left: displayCrop.x + displayCrop.w,
            top: displayCrop.y + displayCrop.h / 2,
          })}
        </div>
      </div>

      {/* Footer info */}
      <div className="flex items-center justify-center gap-4 py-2 border-t border-surface-100/50 text-xs text-surface-300">
        <span>
          {m.crop()}: {crop.w} × {crop.h}
        </span>
        <span>
          {transformedSize.w} × {transformedSize.h}
        </span>
      </div>

      {showExport && imgRef.current && (
        <ExportModal
          source={buildTransformedCanvas()}
          cropRect={crop}
          filename={file.name}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  )
}
