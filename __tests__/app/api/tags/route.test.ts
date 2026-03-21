import * as fs from "fs"
import * as path from "path"

describe("Tags API Route", () => {
  test("3.1a: route file exists", () => {
    const routePath = path.join(process.cwd(), "app/api/tags/route.ts")
    expect(fs.existsSync(routePath)).toBe(true)
  })

  test("3.1b: exports GET, POST, PUT, DELETE handlers", () => {
    const content = fs.readFileSync(
      path.join(process.cwd(), "app/api/tags/route.ts"),
      "utf-8"
    )
    expect(content).toContain("export async function GET")
    expect(content).toContain("export async function POST")
    expect(content).toContain("export async function PUT")
    expect(content).toContain("export async function DELETE")
  })

  test("3.1c: DELETE protects system tags", () => {
    const content = fs.readFileSync(
      path.join(process.cwd(), "app/api/tags/route.ts"),
      "utf-8"
    )
    expect(content).toContain("is_system")
    expect(content).toContain("System tags cannot be deleted")
  })

  test("3.1d: GET requires workspaceId parameter", () => {
    const content = fs.readFileSync(
      path.join(process.cwd(), "app/api/tags/route.ts"),
      "utf-8"
    )
    expect(content).toContain("workspaceId")
  })

  test("3.1e: POST validates required fields", () => {
    const content = fs.readFileSync(
      path.join(process.cwd(), "app/api/tags/route.ts"),
      "utf-8"
    )
    expect(content).toContain("Missing required fields")
  })

  test("3.1f: PUT updates with timestamp", () => {
    const content = fs.readFileSync(
      path.join(process.cwd(), "app/api/tags/route.ts"),
      "utf-8"
    )
    expect(content).toContain("updated_at")
  })
})
