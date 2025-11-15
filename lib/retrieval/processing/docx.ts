import { FileItemChunk } from "@/types"
import { encode } from "gpt-tokenizer"
import { ChunkConfig, createConfigurableTextSplitter } from "."

export const processDocX = async (
  text: string,
  config?: Partial<ChunkConfig>
): Promise<FileItemChunk[]> => {
  const splitter = createConfigurableTextSplitter(config)
  const splitDocs = await splitter.createDocuments([text])

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
