import { ContentType } from "@/types"
import { Search } from "lucide-react"
import { FC } from "react"
import { Input } from "../ui/input"

interface SidebarSearchProps {
  contentType: ContentType
  searchTerm: string
  setSearchTerm: Function
}

export const SidebarSearch: FC<SidebarSearchProps> = ({
  contentType,
  searchTerm,
  setSearchTerm
}) => {
  return (
    <div className="relative">
      <Input
        placeholder={`Search ${contentType}...`}
        value={searchTerm}
        onChange={e => setSearchTerm(e.target.value)}
        className="bg-background/50 pl-8"
      />
      <Search
        className="text-muted-foreground absolute left-2 top-1/2 -translate-y-1/2"
        size={18}
      />
    </div>
  )
}
