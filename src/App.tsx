import { ArrowLeftIcon, InformationCircleIcon } from '@heroicons/react/outline'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useClickAway } from 'react-use'
import Button from './components/Button'
import FileSelect from './components/FileSelect'
import ImagePreprocess from './components/ImagePreprocess'
import Modal from './components/Modal'
import Editor from './Editor'
import { resizeImageFile } from './utils'
import Progress from './components/Progress'
import { downloadModel, modelExists } from './adapters/cache'
import useToast from './hooks/useToast'
import * as m from './paraglide/messages'
import {
  languageTag,
  onSetLanguageTag,
  setLanguageTag,
} from './paraglide/runtime'

type ModelState = 'checking' | 'prompt' | 'downloading' | 'ready'

function App() {
  const [file, setFile] = useState<File>()
  const [pendingFile, setPendingFile] = useState<File>()
  const [, setStateLanguageTag] = useState<'en' | 'zh'>('zh')
  const { toast, ToastContainer } = useToast()

  useEffect(() => {
    onSetLanguageTag(() => setStateLanguageTag(languageTag()))
  }, [])

  const [showAbout, setShowAbout] = useState(false)
  const modalRef = useRef(null)

  // Model download state machine
  const [modelState, setModelState] = useState<ModelState>('checking')
  const [downloadProgress, setDownloadProgress] = useState(0)

  useEffect(() => {
    modelExists('inpaint').then(exists => {
      setModelState(exists ? 'ready' : 'prompt')
    })
  }, [])

  function handleDownloadModel() {
    setModelState('downloading')
    setDownloadProgress(0)
    downloadModel('inpaint', setDownloadProgress)
      .then(() => setModelState('ready'))
      .catch(err => {
        toast(err.message || m.download_failed(), 'error')
        setModelState('prompt')
      })
  }

  function handleSkipDownload() {
    setModelState('ready')
  }

  useClickAway(modalRef, () => {
    setShowAbout(false)
  })

  const handleFileSelect = useCallback(async (f: File) => {
    const { file: resizedFile } = await resizeImageFile(f, 1024 * 4)
    setPendingFile(resizedFile)
  }, [])

  async function startWithDemoImage(img: string) {
    try {
      const imgBlob = await fetch(`/examples/${img}.jpeg`).then(r => r.blob())
      setPendingFile(new File([imgBlob], `${img}.jpeg`, { type: 'image/jpeg' }))
    } catch {
      toast(m.download_failed(), 'error')
    }
  }

  // Global paste handler
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (file || pendingFile) return
      const items = e.clipboardData?.items
      if (!items) return
      for (let i = 0; i < items.length; i += 1) {
        if (items[i].type.startsWith('image/')) {
          const blob = items[i].getAsFile()
          if (blob) {
            e.preventDefault()
            handleFileSelect(blob)
            break
          }
        }
      }
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [file, pendingFile, handleFileSelect])

  function handleStartNew() {
    if (pendingFile) {
      setPendingFile(undefined)
      return
    }
    if (file && !window.confirm(m.confirm_discard())) {
      return
    }
    setFile(undefined)
  }

  function handlePreprocessApply(processedFile: File) {
    setPendingFile(undefined)
    setFile(processedFile)
  }

  function handlePreprocessCancel() {
    setPendingFile(undefined)
  }

  return (
    <div className="min-h-full flex flex-col bg-surface text-gray-100">
      <header className="z-10 flex flex-row items-center md:justify-between h-14 px-4 sm:px-6 border-b border-surface-100/50">
        <Button
          className={[
            file || pendingFile ? '' : 'opacity-50 pointer-events-none',
            'pl-1 pr-1 mx-1 sm:mx-5 transition-all duration-200',
          ].join(' ')}
          icon={<ArrowLeftIcon className="w-6 h-6" />}
          onClick={handleStartNew}
        >
          <div className="md:w-[290px]">
            <span className="hidden sm:inline select-none">
              {m.start_new()}
            </span>
          </div>
        </Button>
        <div className="text-2xl font-semibold text-gray-100 tracking-tight select-none">
          Inpaint-web
        </div>
        <div className="hidden md:flex justify-end items-center gap-2 w-[300px] mx-1 sm:mx-5">
          <Button
            className="mr-5 flex"
            onClick={() => {
              if (languageTag() === 'zh') {
                setLanguageTag('en')
              } else {
                setLanguageTag('zh')
              }
            }}
          >
            <p>{m.switch_language()}</p>
          </Button>
          <Button
            className="w-38 flex sm:visible"
            icon={<InformationCircleIcon className="w-6 h-6" />}
            onClick={() => {
              setShowAbout(true)
            }}
          >
            <p>{m.feedback()}</p>
          </Button>
        </div>
      </header>

      <main className="relative flex-1 overflow-hidden">
        {pendingFile && (
          <ImagePreprocess
            file={pendingFile}
            onApply={handlePreprocessApply}
            onCancel={handlePreprocessCancel}
          />
        )}
        {!pendingFile && file && (
          <Editor file={file} onError={msg => toast(msg, 'error')} />
        )}
        {!pendingFile && !file && (
          <>
            <div className="flex h-full flex-1 flex-col items-center justify-center overflow-hidden animate-fade-in">
              <div className="h-72 w-4/5 sm:w-1/2 max-w-2xl">
                <FileSelect
                  onSelection={handleFileSelect}
                  onError={msg => toast(msg, 'error')}
                />
              </div>
              <div className="flex flex-col sm:flex-row pt-8 items-center justify-center cursor-pointer animate-slide-up">
                <span className="text-surface-300 text-sm font-medium uppercase tracking-widest mb-3 sm:mb-0 sm:mr-4">
                  {m.try_it_images()}
                </span>
                <div className="flex gap-2 sm:gap-3 px-4">
                  {['bag', 'dog', 'car', 'bird', 'jacket', 'shoe', 'paris'].map(
                    image => (
                      <button
                        key={image}
                        type="button"
                        onClick={() => startWithDemoImage(image)}
                        className="focus:outline-none focus:ring-2 focus:ring-primary-400/50 rounded-lg"
                      >
                        <img
                          className="rounded-lg w-auto object-cover transition-all duration-300 hover:scale-105 hover:ring-2 hover:ring-primary-400/50 opacity-80 hover:opacity-100"
                          src={`examples/${image}.jpeg`}
                          alt={`${image} example`}
                          style={{ height: '80px' }}
                        />
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Model download prompt */}
      {modelState === 'prompt' && (
        <Modal>
          <div className="text-lg space-y-6">
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">
                {m.model_download_title()}
              </h2>
              <p className="text-gray-300">{m.model_download_confirm()}</p>
            </div>
            <div className="flex justify-end gap-3">
              <Button onClick={handleSkipDownload}>{m.later()}</Button>
              <Button primary onClick={handleDownloadModel}>
                {m.download_now()}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Model download progress */}
      {modelState === 'downloading' && (
        <Modal>
          <div className="text-lg space-y-4">
            <p>{m.inpaint_model_download_message()}</p>
            <Progress percent={downloadProgress} />
          </div>
        </Modal>
      )}

      {showAbout && (
        <Modal onClose={() => setShowAbout(false)}>
          <div ref={modalRef} className="text-lg space-y-4 pr-6">
            <p>
              {m.feedback_message([
                // @ts-ignore
                <a
                  key="link"
                  href="https://github.com/lxfater/inpaint-web"
                  className="text-primary-400 hover:text-primary-300 underline underline-offset-2 transition-colors"
                  rel="noreferrer"
                  target="_blank"
                >
                  Inpaint-web
                </a>,
              ])}
            </p>
          </div>
        </Modal>
      )}
      <ToastContainer />
    </div>
  )
}

export default App
