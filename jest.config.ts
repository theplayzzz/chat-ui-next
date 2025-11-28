import type { Config } from "jest"
import nextJest from "next/jest.js"

const createJestConfig = nextJest({
  // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
  dir: "./"
})

// Add any custom config to be passed to Jest
const config: Config = {
  coverageProvider: "v8",
  testEnvironment: "jsdom",
  // Add more setup options before each test is run
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  // Transform ESM modules
  transformIgnorePatterns: [
    "/node_modules/(?!(react-markdown|remark-gfm|unist-util-visit|unified|bail|is-plain-obj|trough|vfile|vfile-message|unist-util-stringify-position|mdast-util-from-markdown|mdast-util-to-string|micromark|decode-named-character-reference|character-entities|mdast-util-to-hast|hast-util-to-jsx-runtime|comma-separated-tokens|hast-util-whitespace|property-information|space-separated-tokens|estree-util-is-identifier-name|unist-util-position|devlop|html-url-attributes|ccount|escape-string-regexp|markdown-table|unist-util-find-after|mdast-util-phrasing|mdast-util-gfm-table|mdast-util-gfm-task-list-item|mdast-util-gfm-strikethrough|mdast-util-gfm-footnote|mdast-util-gfm-autolink-literal|mdast-util-gfm|micromark-util-combine-extensions|micromark-extension-gfm-table|micromark-extension-gfm-task-list-item|micromark-extension-gfm-strikethrough|micromark-extension-gfm-footnote|micromark-extension-gfm-autolink-literal|micromark-extension-gfm)/)"
  ],
  // Module name mapper for path aliases and ESM mocks
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    "^react-markdown$": "<rootDir>/__mocks__/react-markdown.tsx",
    "^remark-gfm$": "<rootDir>/__mocks__/remark-gfm.ts"
  },
  // Test path ignore patterns
  testPathIgnorePatterns: [
    "<rootDir>/node_modules/",
    "<rootDir>/.next/",
    "<rootDir>/components/health-plan/__tests__/setup.ts"
  ]
}

// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
export default createJestConfig(config)
