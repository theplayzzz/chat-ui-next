import { ImageLoaderProps } from "next/image"

/**
 * Custom Next.js Image loader for Supabase Storage
 *
 * Applies Supabase Image Transformations API to optimize images on-the-fly:
 * - Automatic WebP/AVIF conversion
 * - Responsive sizing
 * - Quality optimization
 *
 * @see https://supabase.com/docs/guides/storage/serving/image-transformations
 */
export default function supabaseLoader({
  src,
  width,
  quality
}: ImageLoaderProps): string {
  // If src is a full Supabase Storage URL, apply transformations
  if (src.startsWith("http") && src.includes("supabase")) {
    const url = new URL(src)

    // Apply Supabase Image Transformations
    url.searchParams.set("width", width.toString())
    url.searchParams.set("quality", (quality || 75).toString())
    url.searchParams.set("format", "webp") // Automatic WebP conversion

    return url.toString()
  }

  // Fallback for relative paths or non-Supabase URLs
  return src
}
