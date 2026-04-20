export const readBlobAsArrayBuffer = (blob: Blob) =>
  new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(reader.error)
    // oxlint-disable-next-line unicorn/prefer-blob-reading-methods
    reader.readAsArrayBuffer(blob)
  })

export const readBlobAsText = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    // oxlint-disable-next-line unicorn/prefer-blob-reading-methods
    reader.readAsText(blob)
  })
