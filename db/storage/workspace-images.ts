import { supabase } from "@/lib/supabase/browser-client"
import { Tables } from "@/supabase/types"

export const uploadWorkspaceImage = async (
  workspace: Tables<"workspaces">,
  image: File
) => {
  const bucket = "workspace_images"

  const imageSizeLimit = 6000000 // 6MB

  if (image.size > imageSizeLimit) {
    throw new Error(`Image must be less than ${imageSizeLimit / 1000000}MB`)
  }

  const currentPath = workspace.image_path
  let filePath = `${workspace.user_id}/${workspace.id}/${Date.now()}`

  if (currentPath.length > 0) {
    const { error: deleteError } = await supabase.storage
      .from(bucket)
      .remove([currentPath])

    if (deleteError) {
      throw new Error("Error deleting old image")
    }
  }

  const { error } = await supabase.storage
    .from(bucket)
    .upload(filePath, image, {
      upsert: true
    })

  if (error) {
    throw new Error("Error uploading image")
  }

  return filePath
}

export const getWorkspaceImageFromStorage = async (filePath: string) => {
  try {
    const { data, error } = await supabase.storage
      .from("workspace_images")
      .createSignedUrl(filePath, 60 * 60 * 24 * 7) // 7 days (increased from 24hrs)

    if (error) {
      throw new Error("Error downloading workspace image")
    }

    return data.signedUrl
  } catch (error) {
    console.error(error)
  }
}

/**
 * Get multiple workspace image signed URLs in a single batch request
 * @param filePaths - Array of file paths to get signed URLs for
 * @returns Record mapping file paths to their signed URLs
 */
export const getBulkWorkspaceImageUrls = async (
  filePaths: string[]
): Promise<Record<string, string>> => {
  // Return empty object for empty array
  if (filePaths.length === 0) return {}

  try {
    const { data, error } = await supabase.storage
      .from("workspace_images")
      .createSignedUrls(filePaths, 60 * 60 * 24 * 7) // 7 days cache

    if (error) {
      console.error(
        "[getBulkWorkspaceImageUrls] Error creating bulk signed URLs:",
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
    console.error("[getBulkWorkspaceImageUrls] Unexpected error:", error)
    return {}
  }
}
