import * as fs from "fs"
import * as path from "path"

describe("TagTable Component", () => {
  test("3.2a: component file exists", () => {
    expect(
      fs.existsSync(path.join(process.cwd(), "components/tags/TagTable.tsx"))
    ).toBe(true)
  })

  test("3.2b: uses client directive", () => {
    const content = fs.readFileSync(
      path.join(process.cwd(), "components/tags/TagTable.tsx"),
      "utf-8"
    )
    expect(content).toContain('"use client"')
  })

  test("3.2c: has search functionality", () => {
    const content = fs.readFileSync(
      path.join(process.cwd(), "components/tags/TagTable.tsx"),
      "utf-8"
    )
    expect(content).toContain("search")
    expect(content).toContain("filter")
  })
})
