/**
 * Message image metadata
 * Note: base64 field removed in favor of direct Supabase Storage URLs
 * for better performance and reduced memory usage
 */
export interface MessageImage {
  messageId: string
  path: string
  url: string // Direct Supabase Storage signed URL
  file: File | null
}
