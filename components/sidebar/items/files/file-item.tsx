import { FileIcon } from "@/components/ui/file-icon"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import { FILE_DESCRIPTION_MAX, FILE_NAME_MAX } from "@/db/limits"
import { getFileFromStorage } from "@/db/storage/files"
import { Tables } from "@/supabase/types"
import { FC, useState } from "react"
import { SidebarItem } from "../all/sidebar-display-item"

interface FileItemProps {
  file: Tables<"files">
}

export const FileItem: FC<FileItemProps> = ({ file }) => {
  const [name, setName] = useState(file.name)
  const [isTyping, setIsTyping] = useState(false)
  const [description, setDescription] = useState(file.description)
  const [chunkSize, setChunkSize] = useState(file.chunk_size ?? 4000)
  const [chunkOverlap, setChunkOverlap] = useState(file.chunk_overlap ?? 200)

  const getLinkAndView = async () => {
    const link = await getFileFromStorage(file.file_path)
    window.open(link, "_blank")
  }

  return (
    <SidebarItem
      item={file}
      isTyping={isTyping}
      contentType="files"
      icon={<FileIcon type={file.type} size={30} />}
      updateState={{
        name,
        description,
        chunk_size: chunkSize,
        chunk_overlap: chunkOverlap
      }}
      renderInputs={() => (
        <>
          <div
            className="cursor-pointer underline hover:opacity-50"
            onClick={getLinkAndView}
          >
            View {file.name}
          </div>

          <div className="flex flex-col justify-between">
            <div>{file.type}</div>

            <div>{formatFileSize(file.size)}</div>

            <div>{file.tokens.toLocaleString()} tokens</div>
          </div>

          <div className="space-y-1">
            <Label>Name</Label>

            <Input
              placeholder="File name..."
              value={name}
              onChange={e => setName(e.target.value)}
              maxLength={FILE_NAME_MAX}
            />
          </div>

          <div className="space-y-1">
            <Label>Description</Label>

            <Textarea
              placeholder="File description..."
              value={description}
              onChange={e => setDescription(e.target.value)}
              maxLength={FILE_DESCRIPTION_MAX}
              rows={4}
              className="resize-none"
            />
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

          <p className="text-muted-foreground text-xs">
            Nota: Alterar chunk settings requer reprocessar o arquivo.
          </p>
        </>
      )}
    />
  )
}

export const formatFileSize = (sizeInBytes: number): string => {
  let size = sizeInBytes
  let unit = "bytes"

  if (size >= 1024) {
    size /= 1024
    unit = "KB"
  }

  if (size >= 1024) {
    size /= 1024
    unit = "MB"
  }

  if (size >= 1024) {
    size /= 1024
    unit = "GB"
  }

  return `${size.toFixed(2)} ${unit}`
}
