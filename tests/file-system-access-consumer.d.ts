export {}

interface ConsumerFileHandle {
  readonly kind: 'file'
  createWritable: (options?: {
    keepExistingData?: boolean
  }) => Promise<ConsumerWritable>
}

interface ConsumerPickerOptions {
  id?: string
  suggestedName?: string
  types?: Array<{
    accept: Record<string, string[]>
    description?: string
  }>
}

interface ConsumerWritable {
  close: () => Promise<void>
  write: (data: Blob | BufferSource | string) => Promise<void>
}

declare global {
  interface Window {
    showSaveFilePicker?: (
      options?: ConsumerPickerOptions,
    ) => Promise<ConsumerFileHandle>
  }
}
