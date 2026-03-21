import { supabase } from "@/lib/supabase/browser-client"

export interface ChunkTag {
  id: string
  workspace_id: string
  name: string
  slug: string
  description: string | null
  weight_boost: number
  parent_tag_id: string | null
  color: string
  is_system: boolean
  created_at: string
  updated_at: string
}

export interface CreateChunkTagInput {
  workspace_id: string
  name: string
  slug: string
  description?: string | null
  weight_boost?: number
  parent_tag_id?: string | null
  color?: string
}

export interface UpdateChunkTagInput {
  name?: string
  slug?: string
  description?: string | null
  weight_boost?: number
  parent_tag_id?: string | null
  color?: string
}

export const getChunkTagsByWorkspace = async (
  workspaceId: string
): Promise<ChunkTag[]> => {
  const { data, error } = await supabase
    .from("chunk_tags")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("name", { ascending: true })

  if (error) {
    throw new Error(error.message)
  }

  return (data || []) as ChunkTag[]
}

export const getChunkTagById = async (tagId: string): Promise<ChunkTag> => {
  const { data, error } = await supabase
    .from("chunk_tags")
    .select("*")
    .eq("id", tagId)
    .single()

  if (!data) {
    throw new Error(error?.message || "Tag not found")
  }

  return data as ChunkTag
}

export const getChunkTagBySlug = async (
  workspaceId: string,
  slug: string
): Promise<ChunkTag | null> => {
  const { data, error } = await supabase
    .from("chunk_tags")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("slug", slug)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return data as ChunkTag | null
}

export const createChunkTag = async (
  input: CreateChunkTagInput
): Promise<ChunkTag> => {
  const { data, error } = await supabase
    .from("chunk_tags")
    .insert([input])
    .select("*")
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data as ChunkTag
}

export const updateChunkTag = async (
  tagId: string,
  input: UpdateChunkTagInput
): Promise<ChunkTag> => {
  const { data, error } = await supabase
    .from("chunk_tags")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", tagId)
    .select("*")
    .single()

  if (error) {
    throw new Error(error.message)
  }

  return data as ChunkTag
}

export const deleteChunkTag = async (tagId: string): Promise<boolean> => {
  // First check if it's a system tag
  const tag = await getChunkTagById(tagId)
  if (tag.is_system) {
    throw new Error("System tags cannot be deleted")
  }

  const { error } = await supabase.from("chunk_tags").delete().eq("id", tagId)

  if (error) {
    throw new Error(error.message)
  }

  return true
}

export const getSystemTags = async (
  workspaceId: string
): Promise<ChunkTag[]> => {
  const { data, error } = await supabase
    .from("chunk_tags")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("is_system", true)
    .order("weight_boost", { ascending: false })

  if (error) {
    throw new Error(error.message)
  }

  return (data || []) as ChunkTag[]
}
