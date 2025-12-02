import { SidebarCreateItem } from "@/components/sidebar/items/all/sidebar-create-item"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { ChatbotUIContext } from "@/context/context"
import { COLLECTION_DESCRIPTION_MAX, COLLECTION_NAME_MAX } from "@/db/limits"
import { TablesInsert } from "@/supabase/types"
import { CollectionFile } from "@/types"
import { FC, useContext, useState } from "react"
import { CollectionFileSelect } from "./collection-file-select"

type CollectionType = "general" | "health_plan" | "insurance" | "financial"

interface CreateCollectionProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
}

export const CreateCollection: FC<CreateCollectionProps> = ({
  isOpen,
  onOpenChange
}) => {
  const { profile, selectedWorkspace } = useContext(ChatbotUIContext)

  const [name, setName] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const [description, setDescription] = useState("")
  const [selectedCollectionFiles, setSelectedCollectionFiles] = useState<
    CollectionFile[]
  >([])
  const [chunkSize, setChunkSize] = useState(4000)
  const [chunkOverlap, setChunkOverlap] = useState(200)
  const [collectionType, setCollectionType] =
    useState<CollectionType>("general")

  const handleFileSelect = (file: CollectionFile) => {
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

  if (!profile) return null
  if (!selectedWorkspace) return null

  return (
    <SidebarCreateItem
      contentType="collections"
      createState={
        {
          collectionFiles: selectedCollectionFiles.map(file => ({
            user_id: profile.user_id,
            collection_id: "",
            file_id: file.id
          })),
          user_id: profile.user_id,
          name,
          description,
          chunk_size: chunkSize,
          chunk_overlap: chunkOverlap,
          collection_type: collectionType
        } as TablesInsert<"collections">
      }
      isOpen={isOpen}
      isTyping={isTyping}
      onOpenChange={onOpenChange}
      renderInputs={() => (
        <>
          <div className="space-y-1">
            <Label>Files</Label>

            <CollectionFileSelect
              selectedCollectionFiles={selectedCollectionFiles}
              onCollectionFileSelect={handleFileSelect}
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
              <span className="text-muted-foreground text-xs">{chunkSize}</span>
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
        </>
      )}
    />
  )
}
