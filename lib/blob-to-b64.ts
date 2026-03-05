/**
 * @deprecated This function is deprecated and will be removed in v2.0.0
 *
 * Use direct Supabase Storage signed URLs instead of base64 encoding for better performance.
 * Base64 encoding causes:
 * - 70% increase in memory usage (base64 strings are large)
 * - CPU-bound blocking on main thread (FileReader is synchronous)
 * - No browser caching (unlike URLs)
 *
 * Migration:
 * - Instead of: `const base64 = await convertBlobToBase64(blob)`
 * - Use: URLs from `getBulkWorkspaceImageUrls()`, `getBulkAssistantImageUrls()`, etc.
 *
 * This function is kept temporarily only for image upload flows (if needed).
 */
export const convertBlobToBase64 = async (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
