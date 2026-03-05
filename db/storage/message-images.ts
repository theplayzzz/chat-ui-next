import { supabase } from "@/lib/supabase/browser-client"

export const uploadMessageImage = async (path: string, image: File) => {
  const bucket = "message_images"

  const imageSizeLimit = 6000000 // 6MB

  if (image.size > imageSizeLimit) {
    throw new Error(`Image must be less than ${imageSizeLimit / 1000000}MB`)
  }

  const { error } = await supabase.storage.from(bucket).upload(path, image, {
    upsert: true
  })

  if (error) {
    throw new Error("Error uploading image")
  }

  return path
}

export const getMessageImageFromStorage = async (filePath: string) => {
  const { data, error } = await supabase.storage
    .from("message_images")
    .createSignedUrl(filePath, 60 * 60 * 24 * 7) // 7 days (increased from 24hrs)

  if (error) {
    throw new Error("Error downloading message image")
  }

  return data.signedUrl
}

/**
 * Get multiple message image signed URLs in a single batch request
 * @param filePaths - Array of file paths to get signed URLs for
 * @returns Record mapping file paths to their signed URLs
 */
export const getBulkMessageImageUrls = async (
  filePaths: string[]
): Promise<Record<string, string>> => {
  // Return empty object for empty array
  if (filePaths.length === 0) return {}

  try {
    const { data, error } = await supabase.storage
      .from("message_images")
      .createSignedUrls(filePaths, 60 * 60 * 24 * 7) // 7 days cache

    if (error) {
      console.error(
        "[getBulkMessageImageUrls] Error creating bulk signed URLs:",
        error
      )
      return {}
    }

    // Transform array response to path->url map
    // data is array: [{ path, signedUrl, error }, ...]
    const urlMap: Record<string, string> = {}

    filePaths.forEach((path, idx) => {
      if (data[idx]?.signedUrl) {
        urlMap[path] = data[idx].signedUrl
      }
    })

    return urlMap
  } catch (error) {
    console.error("[getBulkMessageImageUrls] Unexpected error:", error)
    return {}
  }
}
