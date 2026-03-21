import * as fs from "fs"
import * as path from "path"

describe("Chunk Viewer Components", () => {
  const componentDir = path.join(process.cwd(), "components/files/chunks")

  test("3.6a: ChunkList component exists", () => {
    expect(fs.existsSync(path.join(componentDir, "ChunkList.tsx"))).toBe(true)
  })

  test("3.6b: ChunkCard component exists", () => {
    expect(fs.existsSync(path.join(componentDir, "ChunkCard.tsx"))).toBe(true)
  })

  test("3.6c: SectionSidebar component exists", () => {
    expect(fs.existsSync(path.join(componentDir, "SectionSidebar.tsx"))).toBe(true)
  })

  test("3.6d: ChunkFilterBar component exists", () => {
    expect(fs.existsSync(path.join(componentDir, "ChunkFilterBar.tsx"))).toBe(true)
  })

  test("3.7a: ChunkEditModal component exists", () => {
    expect(fs.existsSync(path.join(componentDir, "ChunkEditModal.tsx"))).toBe(true)
  })

  test("3.7b: ChunkEditModal supports tag editing", () => {
    const content = fs.readFileSync(
      path.join(componentDir, "ChunkEditModal.tsx"),
      "utf-8"
    )
    expect(content).toContain("tags")
    expect(content).toContain("weight")
  })
})
