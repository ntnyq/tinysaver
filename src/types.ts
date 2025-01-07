export interface AutoBomOptions {
  /**
   * Add BOM to text files
   *
   * @default true
   */
  autoBom?: boolean
}

export interface SaveAsOptions extends AutoBomOptions {
  /**
   * Last modified date
   */
  lastModified?: number
  /**
   * MIME type
   */
  type?: string
}
