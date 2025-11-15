import { FileItemChunk } from "@/types"
import { encode } from "gpt-tokenizer"
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter"
import { ChunkConfig, DEFAULT_CHUNK_OVERLAP, DEFAULT_CHUNK_SIZE } from "."

export const processMarkdown = async (
  markdown: Blob,
  config?: Partial<ChunkConfig>
): Promise<FileItemChunk[]> => {
  const fileBuffer = Buffer.from(await markdown.arrayBuffer())
  const textDecoder = new TextDecoder("utf-8")
  const textContent = textDecoder.decode(fileBuffer)

  const chunkSize = config?.chunkSize ?? DEFAULT_CHUNK_SIZE
  const chunkOverlap = config?.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP

  const splitter = RecursiveCharacterTextSplitter.fromLanguage("markdown", {
    chunkSize,
    chunkOverlap
  })

  const splitDocs = await splitter.createDocuments([textContent])

  let chunks: FileItemChunk[] = []

  for (let i = 0; i < splitDocs.length; i++) {
    const doc = splitDocs[i]

    chunks.push({
      content: doc.pageContent,
      tokens: encode(doc.pageContent).length
    })
  }

  return chunks
}
