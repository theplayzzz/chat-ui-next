/**
 * Jest setup file
 *
 * Configures global test utilities and mocks
 */

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
