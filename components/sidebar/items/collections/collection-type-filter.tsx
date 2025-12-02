import { Badge } from "@/components/ui/badge"
import { IconFilter, IconX } from "@tabler/icons-react"
import { FC } from "react"

type CollectionType =
  | "all"
  | "general"
  | "health_plan"
  | "insurance"
  | "financial"

interface CollectionTypeFilterProps {
  selectedType: CollectionType
  onTypeChange: (type: CollectionType) => void
  counts?: Record<CollectionType, number>
}

const typeConfig: Record<
  CollectionType,
  { label: string; color: string; bgColor: string }
> = {
  all: { label: "Todos", color: "text-foreground", bgColor: "bg-muted" },
  general: {
    label: "Geral",
    color: "text-gray-500",
    bgColor: "bg-gray-500/10"
  },
  health_plan: {
    label: "Plano de Saúde",
    color: "text-green-500",
    bgColor: "bg-green-500/10"
  },
  insurance: {
    label: "Seguro",
    color: "text-blue-500",
    bgColor: "bg-blue-500/10"
  },
  financial: {
    label: "Financeiro",
    color: "text-purple-500",
    bgColor: "bg-purple-500/10"
  }
}

export const CollectionTypeFilter: FC<CollectionTypeFilterProps> = ({
  selectedType,
  onTypeChange,
  counts
}) => {
  const types: CollectionType[] = [
    "all",
    "health_plan",
    "general",
    "insurance",
    "financial"
  ]

  return (
    <div className="space-y-2">
      <div className="text-muted-foreground flex items-center gap-2 text-xs font-medium">
        <IconFilter size={14} />
        <span>Filtrar por tipo</span>
        {selectedType !== "all" && (
          <button
            onClick={() => onTypeChange("all")}
            className="hover:text-foreground ml-auto"
            title="Limpar filtro"
          >
            <IconX size={14} />
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1">
        {types.map(type => {
          const config = typeConfig[type]
          const count = counts?.[type]
          const isSelected = selectedType === type

          return (
            <Badge
              key={type}
              variant={isSelected ? "default" : "outline"}
              className={`cursor-pointer text-xs transition-colors ${
                isSelected
                  ? `${config.bgColor} ${config.color} hover:opacity-80`
                  : "hover:bg-muted"
              }`}
              onClick={() => onTypeChange(type)}
            >
              {config.label}
              {count !== undefined && count > 0 && (
                <span className="ml-1 opacity-70">({count})</span>
              )}
            </Badge>
          )
        })}
      </div>
    </div>
  )
}

export { type CollectionType }
