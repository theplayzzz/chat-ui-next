import { FileItemChunk } from "@/types"
import { encode } from "gpt-tokenizer"
import { CSVLoader } from "langchain/document_loaders/fs/csv"
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter"
import { ChunkConfig, DEFAULT_CHUNK_OVERLAP, DEFAULT_CHUNK_SIZE } from "."

export const processCSV = async (
  csv: Blob,
  config?: Partial<ChunkConfig>
): Promise<FileItemChunk[]> => {
  const loader = new CSVLoader(csv)
  const docs = await loader.load()
  let completeText = docs.map(doc => doc.pageContent).join("\n\n")

  const chunkSize = config?.chunkSize ?? DEFAULT_CHUNK_SIZE
  const chunkOverlap = config?.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap,
    separators: ["\n\n"]
  })
  const splitDocs = await splitter.createDocuments([completeText])

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
