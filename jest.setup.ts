/**
 * Jest setup file
 *
 * Configures global test utilities and mocks
 */

// Polyfill TextEncoder/TextDecoder for Node.js test environment
// Required by LangChain libraries
import { TextEncoder, TextDecoder } from "util"
import { ReadableStream, TransformStream, WritableStream } from "stream/web"

if (typeof global.TextEncoder === "undefined") {
  global.TextEncoder = TextEncoder
  global.TextDecoder = TextDecoder as typeof global.TextDecoder
}

// Polyfill Web Streams API for LangChain
if (typeof global.ReadableStream === "undefined") {
  global.ReadableStream = ReadableStream as typeof global.ReadableStream
  global.TransformStream = TransformStream as typeof global.TransformStream
  global.WritableStream = WritableStream as typeof global.WritableStream
}

import "@testing-library/jest-dom"
import { toHaveNoViolations } from "jest-axe"

// Extend Jest matchers with jest-axe
expect.extend(toHaveNoViolations)

// Mock next/navigation
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn()
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams()
}))

// Mock next-themes
jest.mock("next-themes", () => ({
  useTheme: () => ({
    theme: "light",
    setTheme: jest.fn(),
    resolvedTheme: "light"
  }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => children
}))

// Suppress console warnings for tests
const originalWarn = console.warn
beforeAll(() => {
  console.warn = (...args: any[]) => {
    // Suppress specific warnings
    if (
      args[0]?.includes?.("ReactDOM.render") ||
      args[0]?.includes?.("componentWillReceiveProps")
    ) {
      return
    }
    originalWarn.apply(console, args)
  }
})

afterAll(() => {
  console.warn = originalWarn
})
