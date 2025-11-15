import { FileItemChunk } from "@/types"
import { encode } from "gpt-tokenizer"
import { ChunkConfig, createConfigurableTextSplitter } from "."

export const processTxt = async (
  txt: Blob,
  config?: Partial<ChunkConfig>
): Promise<FileItemChunk[]> => {
  const fileBuffer = Buffer.from(await txt.arrayBuffer())
  const textDecoder = new TextDecoder("utf-8")
  const textContent = textDecoder.decode(fileBuffer)

  const splitter = createConfigurableTextSplitter(config)
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
