import { DownloadIcon, EyeIcon, ViewBoardsIcon } from '@heroicons/react/outline'
import { useCallback, useEffect, useState, useRef } from 'react'
import { useWindowSize } from 'react-use'
import inpaint from './adapters/inpainting'
import superResolution from './adapters/superResolution'
import Button from './components/Button'
import ExportModal from './components/ExportModal'
import Slider from './components/Slider'
import { loadImage, useImage } from './utils'
import Progress from './components/Progress'
import { modelExists, downloadModel } from './adapters/cache'
import Modal from './components/Modal'
import * as m from './paraglide/messages'

interface EditorProps {
  file: File
  onError?: (message: string) => void
}

interface Line {
  size?: number
  pts: { x: number; y: number }[]
  src: string
}

function drawLines(
  ctx: CanvasRenderingContext2D,
  lines: Line[],
  color = 'rgba(129, 140, 248, 0.5)'
) {
  ctx.strokeStyle = color
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  lines.forEach(line => {
    if (!line?.pts.length || !line.size) {
      return
    }
    ctx.lineWidth = line.size
    ctx.beginPath()
    ctx.moveTo(line.pts[0].x, line.pts[0].y)
    line.pts.forEach(pt => ctx.lineTo(pt.x, pt.y))
    ctx.stroke()
  })
}

const BRUSH_HIDE_ON_SLIDER_CHANGE_TIMEOUT = 2000
export default function Editor(props: EditorProps) {
  const { file, onError } = props
  const [brushSize, setBrushSize] = useState(40)
  const [original, isOriginalLoaded] = useImage(file)
  const [renders, setRenders] = useState<HTMLImageElement[]>([])
  const [context, setContext] = useState<CanvasRenderingContext2D>()
  const [maskCanvas] = useState<HTMLCanvasElement>(() => {
    return document.createElement('canvas')
  })
  const [lines, setLines] = useState<Line[]>([{ pts: [], src: '' }])
  const brushRef = useRef<HTMLDivElement>(null)
  const [showBrush, setShowBrush] = useState(false)
  const [hideBrushTimeout, setHideBrushTimeout] = useState(0)
  const [showOriginal, setShowOriginal] = useState(false)
  const [isInpaintingLoading, setIsProcessingLoading] = useState(false)
  const [generateProgress, setGenerateProgress] = useState(0)
  const modalRef = useRef(null)
  const [separator, setSeparator] = useState<HTMLDivElement>()
  const [useSeparator, setUseSeparator] = useState(false)
  const [originalImg, setOriginalImg] = useState<HTMLDivElement>()
  const [separatorLeft, setSeparatorLeft] = useState(0)
  const historyListRef = useRef<HTMLDivElement>(null)
  const isBrushSizeChange = useRef<boolean>(false)
  const canvasDiv = useRef<HTMLDivElement>(null)
  const [downloaded, setDownloaded] = useState(true)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [showExport, setShowExport] = useState(false)
  const windowSize = useWindowSize()

  const draw = useCallback(
    (index = -1) => {
      if (!context) {
        return
      }
      context.clearRect(0, 0, context.canvas.width, context.canvas.height)
      const currRender =
        renders[index === -1 ? renders.length - 1 : index] ?? original
      const { canvas } = context

      if (!canvasDiv.current) return
      const divWidth = canvasDiv.current.offsetWidth
      const divHeight = canvasDiv.current.offsetHeight

      const imgAspectRatio = currRender.width / currRender.height
      const divAspectRatio = divWidth / divHeight

      let canvasWidth
      let canvasHeight

      if (divAspectRatio > imgAspectRatio) {
        canvasHeight = divHeight
        canvasWidth = currRender.width * (divHeight / currRender.height)
      } else {
        canvasWidth = divWidth
        canvasHeight = currRender.height * (divWidth / currRender.width)
      }

      canvas.width = canvasWidth
      canvas.height = canvasHeight

      if (currRender?.src) {
        context.drawImage(currRender, 0, 0, canvas.width, canvas.height)
      } else {
        context.drawImage(original, 0, 0, canvas.width, canvas.height)
      }
      const currentLine = lines[lines.length - 1]
      drawLines(context, [currentLine])
    },
    [context, lines, original, renders]
  )

  const refreshCanvasMask = useCallback(() => {
    if (!context?.canvas.width || !context?.canvas.height) {
      throw new Error('canvas has invalid size')
    }
    maskCanvas.width = context?.canvas.width
    maskCanvas.height = context?.canvas.height
    const ctx = maskCanvas.getContext('2d')
    if (!ctx) {
      throw new Error('could not retrieve mask canvas')
    }
    const line = lines.slice(-1)[0]
    if (line) drawLines(ctx, [line], 'white')
  }, [context?.canvas.height, context?.canvas.width, lines, maskCanvas])

  // Draw once the original image is loaded
  useEffect(() => {
    if (!context?.canvas) {
      return
    }
    if (isOriginalLoaded) {
      draw()
    }
  }, [context?.canvas, draw, original, isOriginalLoaded, windowSize])

  // Handle mouse interactions
  useEffect(() => {
    const canvas = context?.canvas
    if (!canvas) {
      return
    }
    const onMouseMove = (ev: MouseEvent) => {
      if (brushRef.current) {
        const x = ev.pageX - brushSize / 2
        const y = ev.pageY - brushSize / 2

        brushRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`
      }
    }
    const onPaint = (px: number, py: number) => {
      const currLine = lines[lines.length - 1]
      currLine.pts.push({ x: px, y: py })
      draw()
    }
    const onMouseDrag = (ev: MouseEvent) => {
      const px = ev.offsetX - canvas.offsetLeft
      const py = ev.offsetY - canvas.offsetTop
      onPaint(px, py)
    }

    const onPointerUp = async () => {
      if (!original.src || showOriginal) {
        return
      }
      if (lines.slice(-1)[0]?.pts.length === 0) {
        return
      }
      const loading = onloading()
      canvas.removeEventListener('mousemove', onMouseDrag)
      canvas.removeEventListener('mouseup', onPointerUp)
      refreshCanvasMask()
      try {
        const start = Date.now()
        // eslint-disable-next-line no-console
        console.log('inpaint_start')
        const newFile = renders.slice(-1)[0] ?? file
        const res = await inpaint(newFile, maskCanvas.toDataURL())
        if (!res) {
          throw new Error('empty response')
        }
        const newRender = new Image()
        newRender.dataset.id = Date.now().toString()
        await loadImage(newRender, res)
        setRenders(prev => [...prev, newRender])
        setLines(prev => [...prev, { pts: [], src: '' } as Line])
        // eslint-disable-next-line no-console
        console.log('inpaint_processed', {
          duration: Date.now() - start,
        })
      } catch (e: any) {
        // eslint-disable-next-line no-console
        console.log('inpaint_failed', { error: e })
        onError?.(e.message || e.toString())
      }
      if (historyListRef.current) {
        const { scrollWidth, clientWidth } = historyListRef.current
        if (scrollWidth > clientWidth) {
          historyListRef.current.scrollTo(scrollWidth, 0)
        }
      }
      loading.close()
      draw()
    }
    canvas.addEventListener('mousemove', onMouseMove)

    const onTouchMove = (ev: TouchEvent) => {
      ev.preventDefault()
      ev.stopPropagation()
      if (ev.touches.length === 0) return
      const currLine = lines[lines.length - 1]
      const coords = canvas.getBoundingClientRect()
      currLine.pts.push({
        x: ev.touches[0].clientX - coords.x,
        y: ev.touches[0].clientY - coords.y,
      })
      draw()
    }
    const onPointerStart = () => {
      if (!original.src || showOriginal) {
        return
      }
      const currLine = lines[lines.length - 1]
      currLine.size = brushSize
      canvas.addEventListener('mousemove', onMouseDrag)
      canvas.addEventListener('mouseup', onPointerUp)
    }

    canvas.addEventListener('touchstart', onPointerStart)
    canvas.addEventListener('touchmove', onTouchMove)
    canvas.addEventListener('touchend', onPointerUp)
    canvas.onmouseenter = () => {
      window.clearTimeout(hideBrushTimeout)
      setShowBrush(true && !showOriginal)
    }
    canvas.onmouseleave = () => setShowBrush(false)
    canvas.onmousedown = onPointerStart

    return () => {
      canvas.removeEventListener('mousemove', onMouseDrag)
      canvas.removeEventListener('mousemove', onMouseMove)
      canvas.removeEventListener('mouseup', onPointerUp)
      canvas.removeEventListener('touchstart', onPointerStart)
      canvas.removeEventListener('touchmove', onTouchMove)
      canvas.removeEventListener('touchend', onPointerUp)
      canvas.onmouseenter = null
      canvas.onmouseleave = null
      canvas.onmousedown = null
    }
  }, [
    brushSize,
    context,
    file,
    draw,
    lines,
    refreshCanvasMask,
    maskCanvas,
    original.src,
    renders,
    showOriginal,
    hideBrushTimeout,
    onloading,
    onError,
  ])

  useEffect(() => {
    if (!separator || !originalImg) return

    const separatorMove = (ev: MouseEvent) => {
      ev.preventDefault()
      ev.stopPropagation()
      if (context?.canvas) {
        const { width } = context?.canvas
        const canvasRect = context?.canvas.getBoundingClientRect()
        const separatorOffsetLeft = ev.pageX - canvasRect.left
        if (separatorOffsetLeft <= width && separatorOffsetLeft >= 0) {
          setSeparatorLeft(separatorOffsetLeft)
        } else if (separatorOffsetLeft < 0) {
          setSeparatorLeft(0)
        } else if (separatorOffsetLeft > width) {
          setSeparatorLeft(width)
        }
      }
    }

    const separatorDown = () => {
      window.addEventListener('mousemove', separatorMove)
      setUseSeparator(true)
    }

    const separatorUp = () => {
      window.removeEventListener('mousemove', separatorMove)
      setUseSeparator(false)
    }

    separator.addEventListener('mousedown', separatorDown)
    window.addEventListener('mouseup', separatorUp)

    return () => {
      separator.removeEventListener('mousedown', separatorDown)
      window.removeEventListener('mouseup', separatorUp)
    }
  }, [separator, context, originalImg])

  function download() {
    setShowExport(true)
  }

  function getExportSource(): HTMLCanvasElement | HTMLImageElement {
    if (!context) return original
    // Return the current canvas (which has the latest render + brush strokes)
    return context.canvas
  }

  function getExportFilename(): string {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')
    return `inpaint-${timestamp}.png`
  }

  const undo = useCallback(() => {
    setLines(prev => {
      const next = prev.slice(0, -2)
      return [...next, { pts: [], src: '' }]
    })
    setRenders(prev => prev.slice(0, -1))
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      // Ctrl+Z / Cmd+Z — undo
      if ((event.metaKey || event.ctrlKey) && event.key === 'z') {
        if (renders.length > 0) {
          event.preventDefault()
          undo()
        }
        return
      }
      // Ctrl+S / Cmd+S — download
      if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault()
        download()
        return
      }
      // [ / ] — brush size
      if (event.key === '[') {
        event.preventDefault()
        setBrushSize(prev => Math.max(10, prev - 10))
        return
      }
      if (event.key === ']') {
        event.preventDefault()
        setBrushSize(prev => Math.min(200, prev + 10))
        return
      }
      // Escape — toggle show original off
      if (event.key === 'Escape' && showOriginal) {
        event.preventDefault()
        setShowOriginal(false)
        setTimeout(() => setSeparatorLeft(0), 300)
      }
    }
    window.addEventListener('keydown', handler)
    return () => {
      window.removeEventListener('keydown', handler)
    }
  }, [renders, undo, showOriginal, download])

  const backTo = useCallback((index: number) => {
    setLines(prev => [...prev.slice(0, index + 1), { pts: [], src: '' }])
    setRenders(prev => prev.slice(0, index + 1))
  }, [])

  const History = renders.map((render, index) => {
    return (
      <div
        key={render.dataset.id}
        className="relative inline-block flex-shrink-0 group rounded-lg overflow-hidden"
      >
        <img
          src={render.src}
          alt="render"
          className="rounded-lg transition-transform duration-200 group-hover:scale-105"
          style={{ height: '96px' }}
        />
        <Button
          className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-pointer rounded-lg"
          onClick={() => backTo(index)}
          onEnter={() => draw(index)}
          onLeave={draw}
        >
          <div className="text-white text-xs text-center font-medium">
            {m.back_to_this()}
          </div>
        </Button>
      </div>
    )
  })

  const handleSliderStart = () => {
    setShowBrush(true)
  }
  const handleSliderChange = (sliderValue: number) => {
    if (!isBrushSizeChange.current) {
      isBrushSizeChange.current = true
    }
    if (brushRef.current) {
      const x = document.documentElement.clientWidth / 2 - brushSize / 2
      const y = document.documentElement.clientHeight / 2 - brushSize / 2

      brushRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`
    }
    setBrushSize(sliderValue)
    window.clearTimeout(hideBrushTimeout)
    setHideBrushTimeout(
      window.setTimeout(() => {
        setShowBrush(false)
      }, BRUSH_HIDE_ON_SLIDER_CHANGE_TIMEOUT)
    )
  }

  const onloading = useCallback(() => {
    setIsProcessingLoading(true)
    setGenerateProgress(0)
    const progressTimer = window.setInterval(() => {
      setGenerateProgress(p => {
        if (p < 90) return p + 10 * Math.random()
        if (p >= 90 && p < 99) return p + 1 * Math.random()
        return p
      })
    }, 1000)
    return {
      close: () => {
        clearInterval(progressTimer)
        setGenerateProgress(100)
        setIsProcessingLoading(false)
      },
    }
  }, [])

  const onSuperResolution = useCallback(async () => {
    try {
      if (!(await modelExists('superResolution'))) {
        setDownloaded(false)
        await downloadModel('superResolution', setDownloadProgress)
        setDownloaded(true)
      }
    } catch (err: any) {
      onError?.(err.message || m.download_failed())
      setDownloaded(true)
      return
    }
    setIsProcessingLoading(true)
    try {
      const start = Date.now()
      // eslint-disable-next-line no-console
      console.log('superResolution_start')
      const newFile = renders.at(-1) ?? file
      const res = await superResolution(newFile, setGenerateProgress)
      if (!res) {
        throw new Error('empty response')
      }
      const newRender = new Image()
      newRender.dataset.id = Date.now().toString()
      await loadImage(newRender, res)
      setRenders(prev => [...prev, newRender])
      setLines(prev => [...prev, { pts: [], src: '' } as Line])
      // eslint-disable-next-line no-console
      console.log('superResolution_processed', {
        duration: Date.now() - start,
      })
    } catch (error: any) {
      // eslint-disable-next-line no-console
      console.error('superResolution', error)
      onError?.(error.message || 'Super resolution failed')
    } finally {
      setIsProcessingLoading(false)
    }
  }, [file, renders, onError])

  return (
    <div
      className={[
        'flex flex-col items-center h-full justify-between',
        isInpaintingLoading ? 'animate-pulse-fast pointer-events-none' : '',
      ].join(' ')}
    >
      {/* History */}
      {renders.length > 0 && (
        <div
          ref={historyListRef}
          style={{ height: '120px' }}
          className={[
            'flex-shrink-0',
            'mt-4 p-3 rounded-xl',
            'flex items-center w-full max-w-4xl',
            'flex-row gap-4',
            'scrollbar-thin overflow-x-auto',
            'glass',
          ].join(' ')}
        >
          {History}
        </div>
      )}
      {/* Canvas */}
      <div
        className="flex-grow flex justify-center my-2 relative"
        style={{ width: '75vw' }}
        ref={canvasDiv}
      >
        <div className="relative">
          <canvas
            className="rounded-lg shadow-2xl shadow-black/50"
            style={showBrush ? { cursor: 'none' } : {}}
            ref={r => {
              if (r && !context) {
                const ctx = r.getContext('2d')
                if (ctx) {
                  setContext(ctx)
                }
              }
            }}
          />
          <div
            className={[
              'absolute top-0 right-0 pointer-events-none',
              showOriginal ? '' : 'overflow-hidden',
            ].join(' ')}
            style={{
              width: showOriginal ? `${context?.canvas.width}px` : '0px',
              height: context?.canvas.height,
              transitionProperty: 'width, height',
              transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
              transitionDuration: '300ms',
            }}
            ref={r => {
              if (r && !originalImg) {
                setOriginalImg(r)
              }
            }}
          >
            <div
              className={[
                'absolute top-0 right-0 pointer-events-none z-10',
                useSeparator ? 'bg-surface text-white' : 'bg-primary-400',
                'w-1',
                'flex items-center justify-center',
                'separator',
              ].join(' ')}
              style={{
                left: `${separatorLeft}px`,
                height: context?.canvas.height,
                transitionProperty: 'width, height',
                transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
                transitionDuration: '300ms',
              }}
            >
              <span className="absolute left-1 bottom-0 p-1 bg-black/40 backdrop-blur-sm rounded-md text-white text-xs font-medium select-none">
                {m.original()}
              </span>
              <div
                className={[
                  'absolute py-2 px-1 rounded-md pointer-events-auto',
                  useSeparator ? 'bg-surface' : 'bg-primary-400',
                ].join(' ')}
                style={{ cursor: 'ew-resize' }}
                ref={r => {
                  if (r && !separator) {
                    setSeparator(r)
                  }
                }}
              >
                <ViewBoardsIcon
                  className="w-5 h-5"
                  style={{ cursor: 'ew-resize' }}
                />
              </div>
            </div>
            <img
              className="absolute right-0"
              src={original.src}
              alt="original"
              width={`${context?.canvas.width}px`}
              height={`${context?.canvas.height}px`}
              style={{
                width: `${context?.canvas.width}px`,
                height: `${context?.canvas.height}px`,
                maxWidth: 'none',
                clipPath: `inset(0 0 0 ${separatorLeft}px)`,
              }}
            />
          </div>
          {isInpaintingLoading && (
            <div className="z-10 absolute inset-0 bg-surface/80 backdrop-blur-sm flex justify-center items-center animate-fade-in">
              <div
                ref={modalRef}
                className="text-lg space-y-4 w-4/5 sm:w-1/2 text-center"
              >
                <p>{m.processing_message()}</p>
                <Progress percent={generateProgress} />
              </div>
            </div>
          )}
        </div>
      </div>

      {!downloaded && (
        <Modal>
          <div className="text-lg space-y-4">
            <p>{m.upscaleing_model_download_message()}</p>
            <Progress percent={downloadProgress} />
          </div>
        </Modal>
      )}
      {showBrush && (
        <div
          className="fixed rounded-full pointer-events-none left-0 top-0 border-2 border-primary-400/70 bg-primary-400/10 transition-[width,height] duration-100"
          style={{
            width: `${brushSize}px`,
            height: `${brushSize}px`,
            transform: `translate3d(-100px, -100px, 0)`,
          }}
          ref={brushRef}
        />
      )}
      {/* Toolbar */}
      <div
        className={[
          'flex-shrink-0',
          'glass rounded-2xl p-4',
          'flex items-center w-full max-w-4xl py-4 mb-4 justify-between',
          'flex-col gap-2 sm:gap-4 sm:flex-row',
          'animate-slide-up',
        ].join(' ')}
      >
        {renders.length > 0 && (
          <Button
            primary
            onClick={undo}
            title={`${m.undo()} (Ctrl+Z)`}
            icon={
              <svg
                className="w-6 h-6"
                width="19"
                height="9"
                viewBox="0 0 19 9"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M2 1C2 0.447715 1.55228 0 1 0C0.447715 0 0 0.447715 0 1H2ZM1 8H0V9H1V8ZM8 9C8.55228 9 9 8.55229 9 8C9 7.44771 8.55228 7 8 7V9ZM16.5963 7.42809C16.8327 7.92721 17.429 8.14016 17.9281 7.90374C18.4272 7.66731 18.6402 7.07103 18.4037 6.57191L16.5963 7.42809ZM16.9468 5.83205L17.8505 5.40396L16.9468 5.83205ZM0 1V8H2V1H0ZM1 9H8V7H1V9ZM1.66896 8.74329L6.66896 4.24329L5.33104 2.75671L0.331035 7.25671L1.66896 8.74329ZM16.043 6.26014L16.5963 7.42809L18.4037 6.57191L17.8505 5.40396L16.043 6.26014ZM6.65079 4.25926C9.67554 1.66661 14.3376 2.65979 16.043 6.26014L17.8505 5.40396C15.5805 0.61182 9.37523 -0.710131 5.34921 2.74074L6.65079 4.25926Z"
                  fill="currentColor"
                />
              </svg>
            }
          >
            {m.undo()}
          </Button>
        )}
        <Slider
          label={m.bruch_size()}
          min={10}
          max={200}
          value={brushSize}
          onChange={handleSliderChange}
          onStart={handleSliderStart}
        />
        <Button
          primary={showOriginal}
          icon={<EyeIcon className="w-6 h-6" />}
          title={`${m.original()} (Esc)`}
          onUp={() => {
            setShowOriginal(!showOriginal)
            setTimeout(() => setSeparatorLeft(0), 300)
          }}
        >
          {m.original()}
        </Button>
        {!showOriginal && (
          <Button onUp={onSuperResolution}>{m.upscale()}</Button>
        )}

        <Button
          primary
          icon={<DownloadIcon className="w-6 h-6" />}
          title={`${m.download()} (Ctrl+S)`}
          onClick={download}
        >
          {m.download()}
        </Button>
      </div>

      {showExport && (
        <ExportModal
          source={getExportSource()}
          filename={getExportFilename()}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  )
}
