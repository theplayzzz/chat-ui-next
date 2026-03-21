import * as fs from "fs"
import * as path from "path"

describe("Pre-Analysis Upload Components", () => {
  test("3.4a: PreAnalysisStep component exists", () => {
    expect(
      fs.existsSync(path.join(process.cwd(), "components/files/upload/PreAnalysisStep.tsx"))
    ).toBe(true)
  })

  test("3.4b: ConfirmationStep component exists", () => {
    expect(
      fs.existsSync(path.join(process.cwd(), "components/files/upload/ConfirmationStep.tsx"))
    ).toBe(true)
  })

  test("3.8a: ReChunkModal component exists", () => {
    expect(
      fs.existsSync(path.join(process.cwd(), "components/files/chunks/ReChunkModal.tsx"))
    ).toBe(true)
  })

  test("3.4c: PreAnalysisStep calls analyze API", () => {
    const content = fs.readFileSync(
      path.join(process.cwd(), "components/files/upload/PreAnalysisStep.tsx"),
      "utf-8"
    )
    expect(content).toContain("/api/files/analyze")
  })

  test("3.8b: ReChunkModal calls rechunk API", () => {
    const content = fs.readFileSync(
      path.join(process.cwd(), "components/files/chunks/ReChunkModal.tsx"),
      "utf-8"
    )
    expect(content).toContain("/api/files/rechunk")
  })
})
