"use client"

import { Dashboard } from "@/components/ui/dashboard"
import { ChatbotUIContext } from "@/context/context"
import { getAssistantWorkspacesByWorkspaceId } from "@/db/assistants"
import { getChatsByWorkspaceId } from "@/db/chats"
import { getCollectionWorkspacesByWorkspaceId } from "@/db/collections"
import { getFileWorkspacesByWorkspaceId } from "@/db/files"
import { getFoldersByWorkspaceId } from "@/db/folders"
import { getModelWorkspacesByWorkspaceId } from "@/db/models"
import { getPresetWorkspacesByWorkspaceId } from "@/db/presets"
import { getPromptWorkspacesByWorkspaceId } from "@/db/prompts"
import { getBulkAssistantImageUrls } from "@/db/storage/assistant-images"
import { getToolWorkspacesByWorkspaceId } from "@/db/tools"
import { getWorkspaceById } from "@/db/workspaces"
import { supabase } from "@/lib/supabase/browser-client"
import { LLMID } from "@/types"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import { ReactNode, useContext, useEffect, useState } from "react"
import Loading from "../loading"

interface WorkspaceLayoutProps {
  children: ReactNode
}

export default function WorkspaceLayout({ children }: WorkspaceLayoutProps) {
  const router = useRouter()

  const params = useParams()
  const searchParams = useSearchParams()
  const workspaceId = params.workspaceid as string

  const {
    setChatSettings,
    setAssistants,
    setAssistantImages,
    setChats,
    setCollections,
    setFolders,
    setFiles,
    setPresets,
    setPrompts,
    setTools,
    setModels,
    selectedWorkspace,
    setSelectedWorkspace,
    setSelectedChat,
    setSelectedAssistant,
    setChatMessages,
    setUserInput,
    setIsGenerating,
    setFirstTokenReceived,
    setChatFiles,
    setChatImages,
    setNewMessageFiles,
    setNewMessageImages,
    setShowFilesDisplay
  } = useContext(ChatbotUIContext)

  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const session = (await supabase.auth.getSession()).data.session

      if (!session) {
        return router.push("/login")
      } else {
        await fetchWorkspaceData(workspaceId)
      }
    })()
  }, [])

  useEffect(() => {
    ;(async () => await fetchWorkspaceData(workspaceId))()

    setUserInput("")
    setChatMessages([])
    setSelectedChat(null)

    setIsGenerating(false)
    setFirstTokenReceived(false)

    setChatFiles([])
    setChatImages([])
    setNewMessageFiles([])
    setNewMessageImages([])
    setShowFilesDisplay(false)
  }, [workspaceId])

  const fetchWorkspaceData = async (workspaceId: string) => {
    setLoading(true)

    // Parallelize all independent workspace data fetches
    const [
      workspace,
      assistantData,
      chats,
      collectionData,
      folders,
      fileData,
      presetData,
      promptData,
      toolData,
      modelData
    ] = await Promise.all([
      getWorkspaceById(workspaceId),
      getAssistantWorkspacesByWorkspaceId(workspaceId),
      getChatsByWorkspaceId(workspaceId),
      getCollectionWorkspacesByWorkspaceId(workspaceId),
      getFoldersByWorkspaceId(workspaceId),
      getFileWorkspacesByWorkspaceId(workspaceId),
      getPresetWorkspacesByWorkspaceId(workspaceId),
      getPromptWorkspacesByWorkspaceId(workspaceId),
      getToolWorkspacesByWorkspaceId(workspaceId),
      getModelWorkspacesByWorkspaceId(workspaceId)
    ])

    // Set all workspace data
    setSelectedWorkspace(workspace)
    setAssistants(assistantData.assistants)
    setChats(chats)
    setCollections(collectionData.collections)
    setFolders(folders)
    setFiles(fileData.files)
    setPresets(presetData.presets)
    setPrompts(promptData.prompts)
    setTools(toolData.tools)
    setModels(modelData.models)

    // Auto-select Health Plan V2 as default assistant
    const healthPlanV2 = assistantData.assistants.find(a => {
      const name = a.name.toLowerCase()
      return (
        name.includes("health plan v2") ||
        name.includes("health-plan-v2") ||
        name.includes("health plan 2")
      )
    })
    if (healthPlanV2) {
      setSelectedAssistant(healthPlanV2)
    }

    // Fetch assistant images in bulk (no base64 conversion)
    const assistantImagePaths = assistantData.assistants
      .filter(a => a.image_path)
      .map(a => a.image_path)

    if (assistantImagePaths.length > 0) {
      const imageUrls = await getBulkAssistantImageUrls(assistantImagePaths)

      const assistantImagesData = assistantData.assistants.map(a => ({
        assistantId: a.id,
        path: a.image_path,
        url: a.image_path ? imageUrls[a.image_path] || "" : ""
      }))

      setAssistantImages(assistantImagesData)
    } else {
      // No assistants have images
      setAssistantImages([])
    }

    // Use Health Plan V2 settings if auto-selected, otherwise workspace defaults
    if (healthPlanV2) {
      setChatSettings({
        model: healthPlanV2.model as LLMID,
        prompt: healthPlanV2.prompt,
        temperature: healthPlanV2.temperature,
        contextLength: healthPlanV2.context_length,
        includeProfileContext: healthPlanV2.include_profile_context,
        includeWorkspaceInstructions:
          healthPlanV2.include_workspace_instructions,
        embeddingsProvider:
          (healthPlanV2.embeddings_provider as "openai" | "local") || "openai"
      })
    } else {
      setChatSettings({
        model: (searchParams.get("model") ||
          workspace?.default_model ||
          "gpt-4-1106-preview") as LLMID,
        prompt:
          workspace?.default_prompt ||
          "You are a friendly, helpful AI assistant.",
        temperature: workspace?.default_temperature || 0.5,
        contextLength: workspace?.default_context_length || 4096,
        includeProfileContext: workspace?.include_profile_context || true,
        includeWorkspaceInstructions:
          workspace?.include_workspace_instructions || true,
        embeddingsProvider:
          (workspace?.embeddings_provider as "openai" | "local") || "openai"
      })
    }

    setLoading(false)
  }

  if (loading) {
    return <Loading />
  }

  return <Dashboard>{children}</Dashboard>
}
