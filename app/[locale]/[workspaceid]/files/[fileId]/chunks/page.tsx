"use client"

import { useParams } from "next/navigation"
import { ChunkList } from "@/components/files/chunks/ChunkList"

export default function ChunksPage() {
  const params = useParams()
  const fileId = params.fileId as string

  return (
    <div className="mx-auto max-w-6xl p-6">
      <h1 className="mb-6 text-2xl font-bold">Chunk Viewer</h1>
      <ChunkList fileId={fileId} />
    </div>
  )
}
