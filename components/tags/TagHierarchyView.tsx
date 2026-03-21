"use client"

interface ChunkTag {
  id: string
  name: string
  slug: string
  color: string
  weight_boost: number
  is_system: boolean
  parent_tag_id: string | null
}

interface TagHierarchyViewProps {
  tags: ChunkTag[]
}

interface TagNode extends ChunkTag {
  children: TagNode[]
}

function buildTree(tags: ChunkTag[]): TagNode[] {
  const map = new Map<string, TagNode>()
  const roots: TagNode[] = []

  for (const tag of tags) {
    map.set(tag.id, { ...tag, children: [] })
  }

  for (const tag of tags) {
    const node = map.get(tag.id)!
    if (tag.parent_tag_id && map.has(tag.parent_tag_id)) {
      map.get(tag.parent_tag_id)!.children.push(node)
    } else {
      roots.push(node)
    }
  }

  return roots
}

function TagNodeView({ node, depth = 0 }: { node: TagNode; depth?: number }) {
  return (
    <div style={{ paddingLeft: depth * 20 }}>
      <div className="hover:bg-muted/50 flex items-center gap-2 rounded px-2 py-1">
        <div
          className="size-3 rounded-full"
          style={{ backgroundColor: node.color }}
        />
        <span className="text-sm font-medium">{node.name}</span>
        <span className="text-muted-foreground text-xs">
          {node.weight_boost}x
        </span>
        {node.is_system && (
          <span className="text-xs text-blue-500">system</span>
        )}
      </div>
      {node.children.map(child => (
        <TagNodeView key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  )
}

export function TagHierarchyView({ tags }: TagHierarchyViewProps) {
  const tree = buildTree(tags)

  if (tags.length === 0) {
    return <p className="text-muted-foreground text-sm">No tags found.</p>
  }

  return (
    <div className="space-y-1">
      {tree.map(node => (
        <TagNodeView key={node.id} node={node} />
      ))}
    </div>
  )
}
