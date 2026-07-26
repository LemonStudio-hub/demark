import { useState } from 'react'
import { UploadIcon } from '@heroicons/react/outline'
import * as m from '../paraglide/messages'

type FileSelectProps = {
  onSelection: (file: File) => void
  onError?: (message: string) => void
}

export default function FileSelect(props: FileSelectProps) {
  const { onSelection, onError } = props

  const [dragHover, setDragHover] = useState(false)
  const [uploadElemId] = useState(`file-upload-${Math.random().toString()}`)

  function onFileSelected(file: File) {
    if (!file) {
      return
    }
    // Skip non-image files
    const isImage = file.type.match('image.*')
    if (!isImage) {
      onError?.(m.unsupported_file())
      return
    }
    // Check if file is larger than 10mb
    if (file.size > 10 * 1024 * 1024) {
      onError?.(m.file_too_large())
      return
    }
    onSelection(file)
  }

  async function getFile(entry: any): Promise<File> {
    return new Promise((resolve, reject) => {
      entry.file(
        (file: File) => resolve(file),
        (err: Error) => reject(err)
      )
    })
  }

  /* eslint-disable no-await-in-loop */

  // Drop handler function to get all files
  async function getAllFileEntries(items: DataTransferItemList) {
    const fileEntries: Array<File> = []
    // Use BFS to traverse entire directory/file structure
    const queue = []
    // Unfortunately items is not iterable i.e. no forEach
    for (let i = 0; i < items.length; i += 1) {
      queue.push(items[i].webkitGetAsEntry())
    }
    while (queue.length > 0) {
      const entry = queue.shift()
      if (entry?.isFile) {
        // Only append images
        const file = await getFile(entry)
        fileEntries.push(file)
      } else if (entry?.isDirectory) {
        queue.push(
          ...(await readAllDirectoryEntries((entry as any).createReader()))
        )
      }
    }
    return fileEntries
  }

  // Get all the entries (files or sub-directories) in a directory
  // by calling readEntries until it returns empty array
  async function readAllDirectoryEntries(directoryReader: any) {
    const entries = []
    let readEntries = await readEntriesPromise(directoryReader)
    while (readEntries.length > 0) {
      entries.push(...readEntries)
      readEntries = await readEntriesPromise(directoryReader)
    }
    return entries
  }

  /* eslint-enable no-await-in-loop */

  // Wrap readEntries in a promise to make working with readEntries easier
  // readEntries will return only some of the entries in a directory
  // e.g. Chrome returns at most 100 entries at a time
  async function readEntriesPromise(directoryReader: any): Promise<any> {
    return new Promise((resolve, reject) => {
      directoryReader.readEntries(resolve, reject)
    })
  }

  async function handleDrop(ev: React.DragEvent) {
    ev.preventDefault()
    const items = await getAllFileEntries(ev.dataTransfer.items)
    setDragHover(false)
    if (items.length > 0) {
      onFileSelected(items[0])
    }
  }

  return (
    <label
      htmlFor={uploadElemId}
      className="block w-full h-full group relative cursor-pointer rounded-2xl font-medium focus-within:outline-none"
    >
      <div
        className={[
          'w-full h-full flex flex-col items-center justify-center px-6 pt-5 pb-6',
          'border-2 border-dashed rounded-2xl',
          'transition-all duration-300',
          'text-center group',
          dragHover
            ? 'border-primary-400 bg-primary-400/10 scale-[1.02]'
            : 'bg-surface-50/50 border-surface-200 hover:border-primary-400/50 hover:bg-surface-50',
        ].join(' ')}
        onDrop={handleDrop}
        onDragOver={ev => {
          ev.stopPropagation()
          ev.preventDefault()
          setDragHover(true)
        }}
        onDragLeave={() => setDragHover(false)}
      >
        <input
          id={uploadElemId}
          name={uploadElemId}
          type="file"
          className="sr-only"
          onChange={ev => {
            const file = ev.currentTarget.files?.[0]
            if (file) {
              onFileSelected(file)
            }
          }}
          accept="image/png, image/jpeg, image/webp"
        />
        <div className="flex flex-col items-center gap-3">
          <UploadIcon className="w-12 h-12 text-surface-300 group-hover:text-primary-400 transition-colors duration-300" />
          <p className="text-surface-300 group-hover:text-gray-200 transition-colors duration-300 text-base font-medium">
            {m.drop_zone()}
          </p>
          <p className="text-surface-300/60 text-xs">{m.supported_formats()}</p>
        </div>
      </div>
    </label>
  )
}
