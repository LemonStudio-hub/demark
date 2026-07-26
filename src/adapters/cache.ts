export type modelType = 'inpaint' | 'superResolution'

interface ModelInfo {
  name: string
  url: string
  backupUrl: string
}

function getModel(modelType: modelType): ModelInfo {
  if (modelType === 'inpaint') {
    return {
      name: 'migan-pipeline-v2.onnx',
      url: 'https://huggingface.co/andraniksargsyan/migan/resolve/main/migan_pipeline_v2.onnx',
      backupUrl:
        'https://worker-share-proxy-01f5.lxfater.workers.dev/andraniksargsyan/migan/resolve/main/migan_pipeline_v2.onnx',
    }
  }
  if (modelType === 'superResolution') {
    return {
      name: 'realesrgan-x4.onnx',
      url: 'https://huggingface.co/lxfater/inpaint-web/resolve/main/realesrgan-x4.onnx',
      backupUrl:
        'https://worker-share-proxy-01f5.lxfater.workers.dev/lxfater/inpaint-web/resolve/main/realesrgan-x4.onnx',
    }
  }
  throw new Error('wrong modelType')
}

async function getModelsDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory()
  return root.getDirectoryHandle('models', { create: true })
}

export async function saveModel(
  modelType: modelType,
  data: ArrayBuffer | Uint8Array
) {
  const dir = await getModelsDir()
  const fileHandle = await dir.getFileHandle(getModel(modelType).name, {
    create: true,
  })
  const writable = await fileHandle.createWritable()
  await writable.write(data)
  await writable.close()
}

export async function loadModel(
  modelType: modelType
): Promise<ArrayBuffer | null> {
  try {
    const dir = await getModelsDir()
    const fileHandle = await dir.getFileHandle(getModel(modelType).name)
    const file = await fileHandle.getFile()
    return await file.arrayBuffer()
  } catch {
    return null
  }
}

export async function modelExists(modelType: modelType): Promise<boolean> {
  const model = await loadModel(modelType)
  return model !== null && model.byteLength > 0
}

export async function ensureModel(modelType: modelType): Promise<ArrayBuffer> {
  const cached = await loadModel(modelType)
  if (cached) {
    return cached
  }
  const model = getModel(modelType)
  const response = await fetch(model.url)
  const buffer = await response.arrayBuffer()
  await saveModel(modelType, new Uint8Array(buffer))
  return buffer
}

export async function downloadModel(
  modelType: modelType,
  setDownloadProgress: (progress: number) => void
): Promise<void> {
  if (await modelExists(modelType)) {
    setDownloadProgress(100)
    return
  }

  async function downloadFromUrl(url: string): Promise<void> {
    // eslint-disable-next-line no-console
    console.log('start download from', url)
    setDownloadProgress(0)
    const response = await fetch(url)
    const fullSize = response.headers.get('content-length')
    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('ReadableStream not supported')
    }
    const total: Uint8Array[] = []
    let downloaded = 0
    const totalSize = fullSize ? parseInt(fullSize, 10) : 0

    let done = false
    while (!done) {
      const result = await reader.read()
      done = result.done
      const { value } = result

      if (done) {
        break
      }

      downloaded += value?.length || 0

      if (value) {
        total.push(value)
      }

      if (totalSize > 0) {
        setDownloadProgress((downloaded / totalSize) * 100)
      }
    }

    const buffer = new Uint8Array(downloaded)
    let offset = 0
    for (const chunk of total) {
      buffer.set(chunk, offset)
      offset += chunk.length
    }

    await saveModel(modelType, buffer)
    setDownloadProgress(100)
  }

  const model = getModel(modelType)
  try {
    await downloadFromUrl(model.url)
  } catch (primaryError) {
    if (model.backupUrl) {
      try {
        await downloadFromUrl(model.backupUrl)
        return
      } catch {
        // Both failed — fall through to throw
      }
    }
    throw new Error(
      'Model download failed. Please check your network connection.'
    )
  }
}
