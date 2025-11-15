import { FileItemChunk } from "@/types"
import { encode } from "gpt-tokenizer"
import { JSONLoader } from "langchain/document_loaders/fs/json"
import { ChunkConfig, createConfigurableTextSplitter } from "."

export const processJSON = async (
  json: Blob,
  config?: Partial<ChunkConfig>
): Promise<FileItemChunk[]> => {
  const loader = new JSONLoader(json)
  const docs = await loader.load()
  let completeText = docs.map(doc => doc.pageContent).join(" ")

  const splitter = createConfigurableTextSplitter(config)
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
