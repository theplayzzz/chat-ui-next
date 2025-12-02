import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { ChatbotUIContext } from "@/context/context"
import {
  createAssistantCollection,
  deleteAssistantCollection
} from "@/db/assistant-collections"
import { supabase } from "@/lib/supabase/browser-client"
import { Tables } from "@/supabase/types"
import { IconAlertTriangle, IconRobot } from "@tabler/icons-react"
import { FC, useContext, useEffect, useState } from "react"

interface AssistantCollectionLinkProps {
  collectionId: string
}

export const AssistantCollectionLink: FC<AssistantCollectionLinkProps> = ({
  collectionId
}) => {
  const { profile, selectedWorkspace, assistants } =
    useContext(ChatbotUIContext)
  const [linkedAssistantIds, setLinkedAssistantIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)

  // Load which assistants are linked to this collection
  useEffect(() => {
    const loadLinkedAssistants = async () => {
      if (!collectionId) return

      try {
        const { data, error } = await supabase
          .from("assistant_collections")
          .select("assistant_id")
          .eq("collection_id", collectionId)

        if (error) throw error

        setLinkedAssistantIds(data?.map(ac => ac.assistant_id) || [])
      } catch (error) {
        console.error("Error loading linked assistants:", error)
      } finally {
        setLoading(false)
      }
    }

    loadLinkedAssistants()
  }, [collectionId])

  const handleToggle = async (
    assistant: Tables<"assistants">,
    isCurrentlyLinked: boolean
  ) => {
    if (!profile) return

    setToggling(assistant.id)
    try {
      if (isCurrentlyLinked) {
        await deleteAssistantCollection(assistant.id, collectionId)
        setLinkedAssistantIds(prev => prev.filter(id => id !== assistant.id))
      } else {
        await createAssistantCollection({
          user_id: profile.user_id,
          assistant_id: assistant.id,
          collection_id: collectionId
        })
        setLinkedAssistantIds(prev => [...prev, assistant.id])
      }
    } catch (error) {
      console.error("Error toggling assistant collection link:", error)
    } finally {
      setToggling(null)
    }
  }

  // Filter assistants by current workspace
  const workspaceAssistants = assistants.filter(
    a => a.folder_id === null || selectedWorkspace?.id
  )

  if (loading) {
    return (
      <div className="space-y-2">
        <Label>Assistentes Associados</Label>
        <div className="text-muted-foreground animate-pulse text-sm">
          Carregando...
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>Assistentes Associados</Label>
        <Badge variant="secondary" className="text-xs">
          {linkedAssistantIds.length} vinculado
          {linkedAssistantIds.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      {linkedAssistantIds.length === 0 && (
        <div className="flex items-center gap-2 rounded-md bg-yellow-500/10 px-3 py-2 text-sm text-yellow-600 dark:text-yellow-500">
          <IconAlertTriangle size={16} />
          <span>Collection não associada a nenhum assistente</span>
        </div>
      )}

      <div className="max-h-48 space-y-2 overflow-y-auto">
        {workspaceAssistants.length === 0 ? (
          <div className="text-muted-foreground text-sm">
            Nenhum assistente disponível neste workspace
          </div>
        ) : (
          workspaceAssistants.map(assistant => {
            const isLinked = linkedAssistantIds.includes(assistant.id)
            const isToggling = toggling === assistant.id

            return (
              <div
                key={assistant.id}
                className="hover:bg-muted/50 flex items-center justify-between rounded-md px-2 py-1.5"
              >
                <div className="flex items-center gap-2">
                  <IconRobot size={16} className="text-muted-foreground" />
                  <span className="text-sm">{assistant.name}</span>
                </div>
                <Switch
                  checked={isLinked}
                  onCheckedChange={() => handleToggle(assistant, isLinked)}
                  disabled={isToggling}
                />
              </div>
            )
          })
        )}
      </div>

      {linkedAssistantIds.length > 0 && (
        <p className="text-muted-foreground text-xs">
          Os assistentes vinculados terão acesso aos documentos desta collection
          para RAG.
        </p>
      )}
    </div>
  )
}
