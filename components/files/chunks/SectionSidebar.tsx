"use client"

interface SectionSidebarProps {
  sections: string[]
  selectedSection: string | null
  onSelect: (section: string | null) => void
  chunkCounts: Record<string, number>
}

export function SectionSidebar({
  sections,
  selectedSection,
  onSelect,
  chunkCounts
}: SectionSidebarProps) {
  return (
    <div className="w-48 shrink-0 space-y-1">
      <h3 className="mb-2 text-sm font-semibold">Sections</h3>
      <button
        onClick={() => onSelect(null)}
        className={`w-full rounded px-2 py-1 text-left text-sm ${
          !selectedSection ? "bg-primary/10 text-primary" : "hover:bg-muted"
        }`}
      >
        All sections
      </button>
      {sections.map(section => (
        <button
          key={section}
          onClick={() => onSelect(section)}
          className={`flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm ${
            selectedSection === section
              ? "bg-primary/10 text-primary"
              : "hover:bg-muted"
          }`}
        >
          <span>{section}</span>
          <span className="text-muted-foreground text-xs">
            {chunkCounts[section] || 0}
          </span>
        </button>
      ))}
    </div>
  )
}
