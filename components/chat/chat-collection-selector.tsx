"use client"

import { ChatbotUIContext } from "@/context/context"
import { FC, useContext, useEffect, useState } from "react"
import {
  IconBooks,
  IconChevronDown,
  IconChevronRight,
  IconFileTypePdf,
  IconFileFilled,
  IconCheck
} from "@tabler/icons-react"
import { Tables } from "@/supabase/types"
import { supabase } from "@/lib/supabase/browser-client"

interface CollectionWithFiles {
  id: string
  name: string
  description: string
  files: Array<{
    id: string
    name: string
    type: string
    tokens: number
  }>
}

interface ChatCollectionSelectorProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  selectedFileIds: string[]
  onSelectedFileIdsChange: (fileIds: string[]) => void
}

export const ChatCollectionSelector: FC<ChatCollectionSelectorProps> = ({
  isOpen,
  onOpenChange,
  selectedFileIds,
  onSelectedFileIdsChange
}) => {
  const { selectedAssistant } = useContext(ChatbotUIContext)
  const [collectionsWithFiles, setCollectionsWithFiles] = useState<
    CollectionWithFiles[]
  >([])
  const [expandedCollections, setExpandedCollections] = useState<Set<string>>(
    new Set()
  )
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen && selectedAssistant) {
      loadCollections()
    }
  }, [isOpen, selectedAssistant?.id])

  const loadCollections = async () => {
    if (!selectedAssistant) return
    setLoading(true)

    try {
      // Get collections linked to this assistant
      const { data: assistantCollections } = await supabase
        .from("assistant_collections")
        .select("collection_id")
        .eq("assistant_id", selectedAssistant.id)

      if (!assistantCollections || assistantCollections.length === 0) {
        setCollectionsWithFiles([])
        setLoading(false)
        return
      }

      const collectionIds = assistantCollections.map(ac => ac.collection_id)

      // Get collections with their files
      const { data: collections } = await supabase
        .from("collections")
        .select("id, name, description")
        .in("id", collectionIds)

      const result: CollectionWithFiles[] = []

      for (const coll of collections || []) {
        const { data: collFiles } = await supabase
          .from("collection_files")
          .select("file_id")
          .eq("collection_id", coll.id)

        const fileIds = collFiles?.map(cf => cf.file_id) || []

        if (fileIds.length > 0) {
          const { data: files } = await supabase
            .from("files")
            .select("id, name, type, tokens")
            .in("id", fileIds)

          result.push({
            id: coll.id,
            name: coll.name,
            description: coll.description || "",
            files: files || []
          })
        } else {
          result.push({
            id: coll.id,
            name: coll.name,
            description: coll.description || "",
            files: []
          })
        }
      }

      setCollectionsWithFiles(result)
      // Expand all by default
      setExpandedCollections(new Set(result.map(c => c.id)))
    } catch (error) {
      console.error("[collection-selector] Error loading:", error)
    } finally {
      setLoading(false)
    }
  }

  const toggleCollection = (collectionId: string) => {
    setExpandedCollections(prev => {
      const next = new Set(prev)
      if (next.has(collectionId)) {
        next.delete(collectionId)
      } else {
        next.add(collectionId)
      }
      return next
    })
  }

  const isCollectionFullySelected = (coll: CollectionWithFiles) => {
    return (
      coll.files.length > 0 &&
      coll.files.every(f => selectedFileIds.includes(f.id))
    )
  }

  const isCollectionPartiallySelected = (coll: CollectionWithFiles) => {
    return (
      coll.files.some(f => selectedFileIds.includes(f.id)) &&
      !isCollectionFullySelected(coll)
    )
  }

  const toggleCollectionSelection = (coll: CollectionWithFiles) => {
    if (isCollectionFullySelected(coll)) {
      // Deselect all files in this collection
      onSelectedFileIdsChange(
        selectedFileIds.filter(id => !coll.files.some(f => f.id === id))
      )
    } else {
      // Select all files in this collection
      const newIds = new Set(selectedFileIds)
      coll.files.forEach(f => newIds.add(f.id))
      onSelectedFileIdsChange(Array.from(newIds))
    }
  }

  const toggleFileSelection = (fileId: string) => {
    if (selectedFileIds.includes(fileId)) {
      onSelectedFileIdsChange(selectedFileIds.filter(id => id !== fileId))
    } else {
      onSelectedFileIdsChange([...selectedFileIds, fileId])
    }
  }

  const totalFiles = collectionsWithFiles.reduce(
    (sum, c) => sum + c.files.length,
    0
  )
  const selectedCount = selectedFileIds.length

  if (!isOpen) return null

  return (
    <div className="bg-background absolute bottom-full left-0 z-50 mb-2 w-full max-w-md rounded-lg border shadow-lg">
      <div className="border-b p-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconBooks size={18} className="text-primary" />
            <span className="text-sm font-medium">
              Documentos para consulta
            </span>
          </div>
          <span className="text-muted-foreground text-xs">
            {selectedCount}/{totalFiles} selecionados
          </span>
        </div>
        {selectedAssistant && (
          <p className="text-muted-foreground mt-1 text-xs">
            Collections vinculadas a {selectedAssistant.name}
          </p>
        )}
      </div>

      <div className="max-h-[300px] overflow-y-auto p-2">
        {loading ? (
          <div className="text-muted-foreground p-4 text-center text-sm">
            Carregando...
          </div>
        ) : collectionsWithFiles.length === 0 ? (
          <div className="text-muted-foreground p-4 text-center text-sm">
            Nenhuma collection vinculada ao assistente
          </div>
        ) : (
          collectionsWithFiles.map(coll => (
            <div key={coll.id} className="mb-1">
              {/* Collection header */}
              <div
                className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5"
                onClick={() => toggleCollection(coll.id)}
              >
                {expandedCollections.has(coll.id) ? (
                  <IconChevronDown
                    size={14}
                    className="text-muted-foreground"
                  />
                ) : (
                  <IconChevronRight
                    size={14}
                    className="text-muted-foreground"
                  />
                )}
                <div
                  className={`flex size-4 items-center justify-center rounded border ${
                    isCollectionFullySelected(coll)
                      ? "border-primary bg-primary"
                      : isCollectionPartiallySelected(coll)
                        ? "border-primary bg-primary/30"
                        : "border-muted-foreground"
                  }`}
                  onClick={e => {
                    e.stopPropagation()
                    toggleCollectionSelection(coll)
                  }}
                >
                  {isCollectionFullySelected(coll) && (
                    <IconCheck size={12} className="text-white" />
                  )}
                </div>
                <IconBooks size={16} className="text-primary" />
                <span className="text-sm font-medium">{coll.name}</span>
                <span className="text-muted-foreground ml-auto text-xs">
                  {coll.files.length} arquivo
                  {coll.files.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Files list */}
              {expandedCollections.has(coll.id) && (
                <div className="ml-6 space-y-0.5">
                  {coll.files.length === 0 ? (
                    <div className="text-muted-foreground px-2 py-1 text-xs italic">
                      Nenhum arquivo
                    </div>
                  ) : (
                    coll.files.map(file => (
                      <div
                        key={file.id}
                        className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded-md px-2 py-1"
                        onClick={() => toggleFileSelection(file.id)}
                      >
                        <div
                          className={`flex size-3.5 items-center justify-center rounded border ${
                            selectedFileIds.includes(file.id)
                              ? "border-primary bg-primary"
                              : "border-muted-foreground"
                          }`}
                        >
                          {selectedFileIds.includes(file.id) && (
                            <IconCheck size={10} className="text-white" />
                          )}
                        </div>
                        <IconFileTypePdf
                          size={14}
                          className="text-muted-foreground"
                        />
                        <span className="max-w-[250px] truncate text-xs">
                          {file.name}
                        </span>
                        {file.tokens > 0 && (
                          <span className="text-muted-foreground ml-auto text-[10px]">
                            {(file.tokens / 1000).toFixed(1)}K
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="flex items-center justify-between border-t p-2">
        <button
          className="text-muted-foreground text-xs hover:underline"
          onClick={() => {
            const allIds = collectionsWithFiles.flatMap(c =>
              c.files.map(f => f.id)
            )
            if (selectedCount === totalFiles) {
              onSelectedFileIdsChange([])
            } else {
              onSelectedFileIdsChange(allIds)
            }
          }}
        >
          {selectedCount === totalFiles
            ? "Desselecionar todos"
            : "Selecionar todos"}
        </button>
        <button
          className="bg-primary text-primary-foreground rounded px-3 py-1 text-xs"
          onClick={() => onOpenChange(false)}
        >
          Confirmar
        </button>
      </div>
    </div>
  )
}
