import { ChatbotUIContext } from "@/context/context"
import { getFileFromStorage } from "@/db/storage/files"
import useHotkey from "@/lib/hooks/use-hotkey"
import { cn } from "@/lib/utils"
import { ChatFile, MessageImage } from "@/types"
import {
  IconCircleFilled,
  IconFileFilled,
  IconFileTypeCsv,
  IconFileTypeDocx,
  IconFileTypePdf,
  IconFileTypeTxt,
  IconJson,
  IconLoader2,
  IconMarkdown,
  IconX
} from "@tabler/icons-react"
import Image from "next/image"
import { FC, useContext, useState } from "react"
import { Button } from "../ui/button"
import { FilePreview } from "../ui/file-preview"
import { WithTooltip } from "../ui/with-tooltip"
import { ChatRetrievalSettings } from "./chat-retrieval-settings"

interface ChatFilesDisplayProps {}

export const ChatFilesDisplay: FC<ChatFilesDisplayProps> = ({}) => {
  useHotkey("f", () => setShowFilesDisplay(prev => !prev))
  useHotkey("e", () => setUseRetrieval(prev => !prev))

  const {
    files,
    newMessageImages,
    setNewMessageImages,
    newMessageFiles,
    setNewMessageFiles,
    setShowFilesDisplay,
    showFilesDisplay,
    chatFiles,
    chatImages,
    setChatImages,
    setChatFiles,
    setUseRetrieval
  } = useContext(ChatbotUIContext)

  const [selectedFile, setSelectedFile] = useState<ChatFile | null>(null)
  const [selectedImage, setSelectedImage] = useState<MessageImage | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  const messageImages = [
    ...newMessageImages.filter(
      image =>
        !chatImages.some(chatImage => chatImage.messageId === image.messageId)
    )
  ]

  const combinedChatFiles = [
    ...newMessageFiles.filter(
      file => !chatFiles.some(chatFile => chatFile.id === file.id)
    ),
    ...chatFiles
  ]

  const combinedMessageFiles = [...messageImages, ...combinedChatFiles]

  const getLinkAndView = async (file: ChatFile) => {
    const fileRecord = files.find(f => f.id === file.id)

    if (!fileRecord) return

    const link = await getFileFromStorage(fileRecord.file_path)
    window.open(link, "_blank")
  }

  return showFilesDisplay && combinedMessageFiles.length > 0 ? (
    <>
      {showPreview && selectedImage && (
        <FilePreview
          type="image"
          item={selectedImage}
          isOpen={showPreview}
          onOpenChange={(isOpen: boolean) => {
            setShowPreview(isOpen)
            setSelectedImage(null)
          }}
        />
      )}

      {showPreview && selectedFile && (
        <FilePreview
          type="file"
          item={selectedFile}
          isOpen={showPreview}
          onOpenChange={(isOpen: boolean) => {
            setShowPreview(isOpen)
            setSelectedFile(null)
          }}
        />
      )}

      <div className="bg-secondary/30 mx-auto w-full max-w-3xl rounded-lg border p-3">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RetrievalToggle />
            <span className="text-muted-foreground text-xs font-medium">
              {combinedChatFiles.length} arquivo
              {combinedChatFiles.length !== 1 ? "s" : ""} anexado
              {combinedChatFiles.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <div onClick={e => e.stopPropagation()}>
              <ChatRetrievalSettings />
            </div>
            <button
              onClick={() => setShowFilesDisplay(false)}
              className="text-muted-foreground hover:text-foreground rounded p-1 text-xs transition-colors"
            >
              Ocultar
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {messageImages.map((image, index) => (
            <div key={index} className="group relative cursor-pointer">
              <Image
                className="rounded-md"
                style={{
                  minWidth: "48px",
                  minHeight: "48px",
                  maxHeight: "48px",
                  maxWidth: "48px"
                }}
                src={image.base64 || image.url}
                alt="File image"
                width={48}
                height={48}
                onClick={() => {
                  setSelectedImage(image)
                  setShowPreview(true)
                }}
              />
              <IconX
                className="absolute -right-1 -top-1 hidden size-4 cursor-pointer rounded-full bg-red-500 p-0.5 text-white group-hover:flex"
                onClick={e => {
                  e.stopPropagation()
                  setNewMessageImages(
                    newMessageImages.filter(
                      f => f.messageId !== image.messageId
                    )
                  )
                  setChatImages(
                    chatImages.filter(f => f.messageId !== image.messageId)
                  )
                }}
              />
            </div>
          ))}

          {combinedChatFiles.map((file, index) =>
            file.id === "loading" ? (
              <div
                key={index}
                className="bg-background flex items-center gap-2 rounded-md border px-3 py-1.5"
              >
                <IconLoader2 className="size-4 animate-spin text-blue-500" />
                <span className="max-w-[150px] truncate text-xs">
                  {file.name}
                </span>
              </div>
            ) : (
              <div
                key={file.id}
                className="bg-background group relative flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 transition-colors hover:border-blue-500/50"
                onClick={() => getLinkAndView(file)}
              >
                <div className="shrink-0 text-blue-500">
                  {(() => {
                    let fileExtension = file.type.includes("/")
                      ? file.type.split("/")[1]
                      : file.type

                    switch (fileExtension) {
                      case "pdf":
                        return <IconFileTypePdf size={16} />
                      case "markdown":
                        return <IconMarkdown size={16} />
                      case "txt":
                        return <IconFileTypeTxt size={16} />
                      case "json":
                        return <IconJson size={16} />
                      case "csv":
                        return <IconFileTypeCsv size={16} />
                      case "docx":
                        return <IconFileTypeDocx size={16} />
                      default:
                        return <IconFileFilled size={16} />
                    }
                  })()}
                </div>
                <span className="max-w-[150px] truncate text-xs">
                  {file.name}
                </span>
                <IconX
                  className="hidden size-3.5 shrink-0 cursor-pointer text-red-400 hover:text-red-600 group-hover:block"
                  onClick={e => {
                    e.stopPropagation()
                    setNewMessageFiles(
                      newMessageFiles.filter(f => f.id !== file.id)
                    )
                    setChatFiles(chatFiles.filter(f => f.id !== file.id))
                  }}
                />
              </div>
            )
          )}
        </div>
      </div>
    </>
  ) : (
    combinedMessageFiles.length > 0 && (
      <div className="mx-auto flex w-full max-w-3xl items-center justify-center">
        <button
          className="bg-secondary/50 hover:bg-secondary flex items-center gap-2 rounded-lg border px-4 py-1.5 text-sm transition-colors"
          onClick={() => setShowFilesDisplay(true)}
        >
          <RetrievalToggle />
          <span>
            {combinedMessageFiles.length} arquivo
            {combinedMessageFiles.length !== 1 ? "s" : ""}
          </span>
          <div onClick={e => e.stopPropagation()}>
            <ChatRetrievalSettings />
          </div>
        </button>
      </div>
    )
  )
}

const RetrievalToggle = ({}) => {
  const { useRetrieval, setUseRetrieval } = useContext(ChatbotUIContext)

  return (
    <div className="flex items-center">
      <WithTooltip
        delayDuration={0}
        side="top"
        display={
          <div>
            {useRetrieval
              ? "File retrieval is enabled on the selected files for this message. Click the indicator to disable."
              : "Click the indicator to enable file retrieval for this message."}
          </div>
        }
        trigger={
          <IconCircleFilled
            className={cn(
              "p-1",
              useRetrieval ? "text-green-500" : "text-red-500",
              useRetrieval ? "hover:text-green-200" : "hover:text-red-200"
            )}
            size={24}
            onClick={e => {
              e.stopPropagation()
              setUseRetrieval(prev => !prev)
            }}
          />
        }
      />
    </div>
  )
}
