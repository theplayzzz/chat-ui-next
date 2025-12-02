import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { COLLECTION_DESCRIPTION_MAX, COLLECTION_NAME_MAX } from "@/db/limits"
import { Tables } from "@/supabase/types"
import { CollectionFile } from "@/types"
import { IconBooks, IconHeartbeat } from "@tabler/icons-react"
import { FC, useState } from "react"
import { SidebarItem } from "../all/sidebar-display-item"
import { ChunkPreview } from "./chunk-preview"
import { CollectionFileSelect } from "./collection-file-select"
import { CollectionStats } from "./collection-stats"
import { AssistantCollectionLink } from "./assistant-collection-link"
import { ProcessingStatus } from "./processing-status"

type CollectionType = "general" | "health_plan" | "insurance" | "financial"

const collectionTypeLabels: Record<
  CollectionType,
  { label: string; color: string }
> = {
  general: { label: "Geral", color: "bg-gray-500/10 text-gray-500" },
  health_plan: {
    label: "Plano de Saúde",
    color: "bg-green-500/10 text-green-500"
  },
  insurance: { label: "Seguro", color: "bg-blue-500/10 text-blue-500" },
  financial: { label: "Financeiro", color: "bg-purple-500/10 text-purple-500" }
}

interface CollectionItemProps {
  collection: Tables<"collections">
}

export const CollectionItem: FC<CollectionItemProps> = ({ collection }) => {
  const [name, setName] = useState(collection.name)
  const [isTyping, setIsTyping] = useState(false)
  const [description, setDescription] = useState(collection.description)
  const [chunkSize, setChunkSize] = useState(collection.chunk_size ?? 4000)
  const [chunkOverlap, setChunkOverlap] = useState(
    collection.chunk_overlap ?? 200
  )
  const [collectionType, setCollectionType] = useState<CollectionType>(
    (collection.collection_type as CollectionType) ?? "general"
  )

  const typeInfo = collectionTypeLabels[collectionType]

  const handleFileSelect = (
    file: CollectionFile,
    setSelectedCollectionFiles: React.Dispatch<
      React.SetStateAction<CollectionFile[]>
    >
  ) => {
    setSelectedCollectionFiles(prevState => {
      const isFileAlreadySelected = prevState.find(
        selectedFile => selectedFile.id === file.id
      )

      if (isFileAlreadySelected) {
        return prevState.filter(selectedFile => selectedFile.id !== file.id)
      } else {
        return [...prevState, file]
      }
    })
  }

  return (
    <SidebarItem
      item={collection}
      isTyping={isTyping}
      contentType="collections"
      icon={
        collectionType === "health_plan" ? (
          <IconHeartbeat size={30} className="text-green-500" />
        ) : (
          <IconBooks size={30} />
        )
      }
      updateState={{
        name,
        description,
        chunk_size: chunkSize,
        chunk_overlap: chunkOverlap,
        collection_type: collectionType
      }}
      renderInputs={(renderState: {
        startingCollectionFiles: CollectionFile[]
        setStartingCollectionFiles: React.Dispatch<
          React.SetStateAction<CollectionFile[]>
        >
        selectedCollectionFiles: CollectionFile[]
        setSelectedCollectionFiles: React.Dispatch<
          React.SetStateAction<CollectionFile[]>
        >
      }) => {
        return (
          <>
            <div className="space-y-1">
              <Label>Files</Label>

              <CollectionFileSelect
                selectedCollectionFiles={
                  renderState.selectedCollectionFiles.length === 0
                    ? renderState.startingCollectionFiles
                    : [
                        ...renderState.startingCollectionFiles.filter(
                          startingFile =>
                            !renderState.selectedCollectionFiles.some(
                              selectedFile =>
                                selectedFile.id === startingFile.id
                            )
                        ),
                        ...renderState.selectedCollectionFiles.filter(
                          selectedFile =>
                            !renderState.startingCollectionFiles.some(
                              startingFile =>
                                startingFile.id === selectedFile.id
                            )
                        )
                      ]
                }
                onCollectionFileSelect={file =>
                  handleFileSelect(file, renderState.setSelectedCollectionFiles)
                }
              />
            </div>

            <div className="space-y-1">
              <Label>Name</Label>

              <Input
                placeholder="Collection name..."
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={COLLECTION_NAME_MAX}
              />
            </div>

            <div className="space-y-1">
              <Label>Description</Label>

              <Input
                placeholder="Collection description..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                maxLength={COLLECTION_DESCRIPTION_MAX}
              />
            </div>

            <div className="space-y-1">
              <Label>Collection Type</Label>
              <select
                value={collectionType}
                onChange={e =>
                  setCollectionType(e.target.value as CollectionType)
                }
                className="bg-background border-input w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="general">Geral</option>
                <option value="health_plan">Plano de Saúde</option>
                <option value="insurance">Seguro</option>
                <option value="financial">Financeiro</option>
              </select>
            </div>

            <div className="space-y-1">
              <Label className="flex items-center justify-between">
                <span>Chunk Size</span>
                <span className="text-muted-foreground text-xs">
                  {chunkSize}
                </span>
              </Label>
              <Slider
                value={[chunkSize]}
                onValueChange={([v]) => {
                  setChunkSize(v)
                  if (chunkOverlap >= v) {
                    setChunkOverlap(Math.max(0, v - 100))
                  }
                }}
                min={500}
                max={8000}
                step={100}
              />
              <p className="text-muted-foreground text-xs">
                Tamanho de cada chunk em caracteres (500-8000)
              </p>
            </div>

            <div className="space-y-1">
              <Label className="flex items-center justify-between">
                <span>Chunk Overlap</span>
                <span className="text-muted-foreground text-xs">
                  {chunkOverlap}
                </span>
              </Label>
              <Slider
                value={[chunkOverlap]}
                onValueChange={([v]) =>
                  setChunkOverlap(Math.min(v, chunkSize - 100))
                }
                min={0}
                max={Math.min(2000, chunkSize - 100)}
                step={50}
              />
              <p className="text-muted-foreground text-xs">
                Sobreposição entre chunks (0-{Math.min(2000, chunkSize - 100)})
              </p>
            </div>

            <div className="pt-2">
              <ChunkPreview chunkSize={chunkSize} chunkOverlap={chunkOverlap} />
            </div>

            <div className="space-y-1 pt-2">
              <Label>Estatísticas</Label>
              <CollectionStats
                collectionId={collection.id}
                chunkSize={chunkSize}
              />
            </div>

            <div className="pt-2">
              <AssistantCollectionLink collectionId={collection.id} />
            </div>

            <div className="space-y-1 pt-2">
              <Label>Status de Processamento</Label>
              <ProcessingStatus collectionId={collection.id} />
            </div>

            {collectionType !== "general" && (
              <div
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${typeInfo.color}`}
              >
                {collectionType === "health_plan" && (
                  <IconHeartbeat size={16} />
                )}
                <span>{typeInfo.label}</span>
              </div>
            )}
          </>
        )
      }}
    />
  )
}
