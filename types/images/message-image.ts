export interface MessageImage {
  messageId: string
  path: string
  base64?: string
  url: string
  file: File | null
}
