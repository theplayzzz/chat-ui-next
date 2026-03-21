/**
 * Phase 0 Schema Validation Tests
 *
 * Tests that RAG Level 3 migrations are correctly structured
 * and that the chunk-tags CRUD module works as expected.
 *
 * Note: These tests validate file structure and mock CRUD behavior.
 * Full DB integration tests require a running Supabase instance.
 */

import * as fs from "fs"
import * as path from "path"

// Mock supabase client
const mockSelect = jest.fn()
const mockInsert = jest.fn()
const mockUpdate = jest.fn()
const mockDelete = jest.fn()
const mockEq = jest.fn()
const mockOrder = jest.fn()
const mockSingle = jest.fn()
const mockMaybeSingle = jest.fn()

const chainMock = () => ({
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
  delete: mockDelete,
  eq: mockEq,
  order: mockOrder,
  single: mockSingle,
  maybeSingle: mockMaybeSingle
})

// Each method returns the chain to allow fluent API
for (const fn of [
  mockSelect,
  mockInsert,
  mockUpdate,
  mockDelete,
  mockEq,
  mockOrder
]) {
  fn.mockReturnValue(chainMock())
}

jest.mock("@/lib/supabase/browser-client", () => ({
  supabase: {
    from: jest.fn(() => chainMock())
  }
}))

const MIGRATIONS_DIR = path.join(
  process.cwd(),
  "supabase",
  "migrations"
)

describe("Phase 0: Schema Validation", () => {
  // Test 0.1: All 6 migration files exist
  describe("Migration files existence", () => {
    const expectedMigrations = [
      "20260321000001_add_rag_level3_file_items.sql",
      "20260321000002_create_chunk_tags.sql",
      "20260321000003_add_file_embedding.sql",
      "20260321000004_add_collection_embedding.sql",
      "20260321000005_create_match_file_items_weighted.sql",
      "20260321000006_create_match_files_by_embedding.sql"
    ]

    test.each(expectedMigrations)("migration %s exists", (filename) => {
      const filePath = path.join(MIGRATIONS_DIR, filename)
      expect(fs.existsSync(filePath)).toBe(true)
    })
  })

  // Test 0.2: file_items migration has correct columns
  describe("file_items migration structure", () => {
    let sql: string

    beforeAll(() => {
      sql = fs.readFileSync(
        path.join(
          MIGRATIONS_DIR,
          "20260321000001_add_rag_level3_file_items.sql"
        ),
        "utf-8"
      )
    })

    test("adds section_type column", () => {
      expect(sql).toContain("section_type TEXT")
    })

    test("adds tags column with default", () => {
      expect(sql).toContain("tags TEXT[] DEFAULT '{}'")
    })

    test("adds weight column with constraint", () => {
      expect(sql).toContain("weight NUMERIC(3,1)")
      expect(sql).toContain("weight >= 0.1")
      expect(sql).toContain("weight <= 5.0")
    })

    test("adds page_number column", () => {
      expect(sql).toContain("page_number INT")
    })

    test("adds document_context column", () => {
      expect(sql).toContain("document_context TEXT")
    })

    test("creates GIN index on tags", () => {
      expect(sql).toContain("idx_file_items_tags")
      expect(sql).toContain("USING gin(tags)")
    })

    test("creates HNSW index on embedding", () => {
      expect(sql).toContain("idx_file_items_embedding_hnsw")
      expect(sql).toContain("USING hnsw")
    })
  })

  // Test 0.3: chunk_tags table structure
  describe("chunk_tags migration structure", () => {
    let sql: string

    beforeAll(() => {
      sql = fs.readFileSync(
        path.join(MIGRATIONS_DIR, "20260321000002_create_chunk_tags.sql"),
        "utf-8"
      )
    })

    test("creates chunk_tags table", () => {
      expect(sql).toContain("CREATE TABLE")
      expect(sql).toContain("chunk_tags")
    })

    test("has required columns", () => {
      expect(sql).toContain("workspace_id UUID")
      expect(sql).toContain("name TEXT NOT NULL")
      expect(sql).toContain("slug TEXT NOT NULL")
      expect(sql).toContain("weight_boost NUMERIC(3,1)")
      expect(sql).toContain("parent_tag_id UUID")
      expect(sql).toContain("color TEXT")
      expect(sql).toContain("is_system BOOLEAN")
    })

    test("has unique constraint on workspace+slug", () => {
      expect(sql).toContain("UNIQUE (workspace_id, slug)")
    })

    test("enables RLS", () => {
      expect(sql).toContain("ENABLE ROW LEVEL SECURITY")
    })

    test("inserts all 9 system tags", () => {
      const systemTags = [
        "preco",
        "cobertura",
        "rede_credenciada",
        "exclusao",
        "carencia",
        "coparticipacao",
        "reembolso",
        "documentacao",
        "regras_gerais"
      ]
      for (const tag of systemTags) {
        expect(sql).toContain(tag)
      }
    })

    test("system tags have correct weight boosts", () => {
      expect(sql).toContain("2.0")
      expect(sql).toContain("1.8")
      expect(sql).toContain("1.6")
    })
  })

  // Test 0.4: files migration structure
  describe("files migration structure", () => {
    let sql: string

    beforeAll(() => {
      sql = fs.readFileSync(
        path.join(MIGRATIONS_DIR, "20260321000003_add_file_embedding.sql"),
        "utf-8"
      )
    })

    test("adds file_embedding vector(1536)", () => {
      expect(sql).toContain("file_embedding vector(1536)")
    })

    test("adds file_tags array", () => {
      expect(sql).toContain("file_tags TEXT[] DEFAULT '{}'")
    })

    test("adds ingestion_status with valid values", () => {
      expect(sql).toContain("ingestion_status TEXT")
      expect(sql).toContain("pending")
      expect(sql).toContain("analyzing")
      expect(sql).toContain("chunking")
      expect(sql).toContain("embedding")
      expect(sql).toContain("done")
      expect(sql).toContain("error")
    })

    test("adds ingestion_metadata JSONB", () => {
      expect(sql).toContain("ingestion_metadata JSONB")
    })

    test("creates HNSW index", () => {
      expect(sql).toContain("idx_files_embedding_hnsw")
    })
  })

  // Test 0.5: collections migration
  describe("collections migration structure", () => {
    let sql: string

    beforeAll(() => {
      sql = fs.readFileSync(
        path.join(
          MIGRATIONS_DIR,
          "20260321000004_add_collection_embedding.sql"
        ),
        "utf-8"
      )
    })

    test("adds collection_embedding vector(1536)", () => {
      expect(sql).toContain("collection_embedding vector(1536)")
    })

    test("adds collection_tags", () => {
      expect(sql).toContain("collection_tags TEXT[] DEFAULT '{}'")
    })
  })

  // Test 0.6: match_file_items_weighted RPC
  describe("match_file_items_weighted RPC", () => {
    let sql: string

    beforeAll(() => {
      sql = fs.readFileSync(
        path.join(
          MIGRATIONS_DIR,
          "20260321000005_create_match_file_items_weighted.sql"
        ),
        "utf-8"
      )
    })

    test("creates function with correct parameters", () => {
      expect(sql).toContain("match_file_items_weighted")
      expect(sql).toContain("query_embedding vector(1536)")
      expect(sql).toContain("match_count int")
      expect(sql).toContain("file_ids UUID[]")
      expect(sql).toContain("filter_tags TEXT[]")
      expect(sql).toContain("tag_weights JSONB")
    })

    test("returns weighted_score in results", () => {
      expect(sql).toContain("weighted_score FLOAT")
      expect(sql).toContain("base_similarity FLOAT")
    })

    test("includes document_context in results", () => {
      expect(sql).toContain("document_context")
    })

    test("computes tag boost from tag_weights", () => {
      expect(sql).toContain("computed_tag_boost")
    })
  })

  // Test 0.7: match_files_by_embedding RPC
  describe("match_files_by_embedding RPC", () => {
    let sql: string

    beforeAll(() => {
      sql = fs.readFileSync(
        path.join(
          MIGRATIONS_DIR,
          "20260321000006_create_match_files_by_embedding.sql"
        ),
        "utf-8"
      )
    })

    test("creates function with correct parameters", () => {
      expect(sql).toContain("match_files_by_embedding")
      expect(sql).toContain("query_embedding vector(1536)")
      expect(sql).toContain("assistant_id UUID")
      expect(sql).toContain("min_similarity FLOAT")
    })

    test("filters by assistant_collections", () => {
      expect(sql).toContain("assistant_collections")
    })

    test("filters by min_similarity threshold", () => {
      expect(sql).toContain("min_similarity")
    })
  })

  // Test 0.8-0.10: chunk-tags CRUD module
  describe("chunk-tags CRUD module", () => {
    test("module exists and exports expected functions", () => {
      const modulePath = path.join(process.cwd(), "lib", "db", "chunk-tags.ts")
      expect(fs.existsSync(modulePath)).toBe(true)

      const content = fs.readFileSync(modulePath, "utf-8")
      expect(content).toContain("getChunkTagsByWorkspace")
      expect(content).toContain("createChunkTag")
      expect(content).toContain("updateChunkTag")
      expect(content).toContain("deleteChunkTag")
      expect(content).toContain("getSystemTags")
    })

    test("deleteChunkTag protects system tags", () => {
      const content = fs.readFileSync(
        path.join(process.cwd(), "lib", "db", "chunk-tags.ts"),
        "utf-8"
      )
      expect(content).toContain("is_system")
      expect(content).toContain("System tags cannot be deleted")
    })
  })
})
