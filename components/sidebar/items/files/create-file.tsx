import { UploadWizard } from "@/components/files/upload/UploadWizard"
import { FC } from "react"

interface CreateFileProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
}

export const CreateFile: FC<CreateFileProps> = ({ isOpen, onOpenChange }) => {
  return <UploadWizard isOpen={isOpen} onOpenChange={onOpenChange} />
}
