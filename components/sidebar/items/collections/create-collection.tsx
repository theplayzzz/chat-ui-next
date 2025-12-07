import { SidebarCreateItem } from "@/components/sidebar/items/all/sidebar-create-item"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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

  const isFormValid = name.trim() && description.trim()

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
            <Label>Description *</Label>

            <Textarea
              placeholder="Descreva o conteúdo desta coleção. Ex: 'Documentos de planos de saúde Amil com preços e coberturas para SP'..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              maxLength={COLLECTION_DESCRIPTION_MAX}
              rows={3}
              className="resize-none"
            />
            <p className="text-muted-foreground text-xs">
              A descrição ajuda o sistema a encontrar documentos relevantes
            </p>
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

          {!isFormValid && (
            <p className="text-destructive text-xs">
              * Campos obrigatórios: preencha o nome e a descrição da coleção
            </p>
          )}
        </>
      )}
    />
  )
}
