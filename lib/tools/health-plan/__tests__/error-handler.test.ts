/**
 * Error Handler Tests
 *
 * Tests for error classification, retry logic, and timeout handling
 *
 * Task #10.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  ErrorHandler,
  ErrorType,
  TimeoutError,
  executeWithTimeout,
  withRetry,
  formatErrorForLogging
} from "../error-handler"

describe("ErrorHandler", () => {
  let handler: ErrorHandler

  beforeEach(() => {
    handler = new ErrorHandler(2)
  })

  describe("classifyError", () => {
    it("should classify timeout errors", () => {
      const error = new TimeoutError("Step 1", 10000)
      const result = handler.classifyError(error, 1)

      expect(result.type).toBe(ErrorType.TIMEOUT)
      expect(result.retryable).toBe(true)
      expect(result.httpStatus).toBe(504)
      expect(result.userMessage).toContain("demorando")
    })

    it("should classify rate limit errors", () => {
      const error = new Error("Rate limit exceeded - 429")
      const result = handler.classifyError(error, 2)

      expect(result.type).toBe(ErrorType.RATE_LIMIT)
      expect(result.retryable).toBe(true)
      expect(result.httpStatus).toBe(429)
    })

    it("should classify API errors", () => {
      const error = new Error("OpenAI API error 500")
      const result = handler.classifyError(error, 3)

      expect(result.type).toBe(ErrorType.API)
      expect(result.retryable).toBe(true)
      expect(result.httpStatus).toBe(502)
    })

    it("should classify database errors", () => {
      const error = new Error("Supabase database query failed")
      const result = handler.classifyError(error, 2)

      expect(result.type).toBe(ErrorType.DATABASE)
      expect(result.retryable).toBe(true)
      expect(result.httpStatus).toBe(500)
    })

    it("should classify authorization errors", () => {
      const error = new Error("Unauthorized - 401")
      const result = handler.classifyError(error, 1)

      expect(result.type).toBe(ErrorType.AUTH)
      expect(result.retryable).toBe(false)
      expect(result.httpStatus).toBe(403)
    })

    it("should classify network errors", () => {
      const error = new Error("Network fetch failed ECONNREFUSED")
      const result = handler.classifyError(error, 4)

      expect(result.type).toBe(ErrorType.NETWORK)
      expect(result.retryable).toBe(true)
      expect(result.httpStatus).toBe(503)
    })

    it("should classify validation errors", () => {
      const error = new Error("Invalid age: required field missing")
      const result = handler.classifyError(error, 1)

      expect(result.type).toBe(ErrorType.VALIDATION)
      expect(result.retryable).toBe(false)
      expect(result.httpStatus).toBe(400)
    })

    it("should default to UNKNOWN for unrecognized errors", () => {
      const error = new Error("Something weird happened")
      const result = handler.classifyError(error, 5)

      expect(result.type).toBe(ErrorType.UNKNOWN)
      expect(result.retryable).toBe(true)
      expect(result.httpStatus).toBe(500)
    })

    it("should handle non-Error objects", () => {
      const result = handler.classifyError("string error", 1)

      expect(result.type).toBe(ErrorType.UNKNOWN)
      expect(result.message).toBe("string error")
    })

    it("should include step information in result", () => {
      const error = new Error("Test error")
      const result = handler.classifyError(error, 3)

      expect(result.step).toBe(3)
      expect(result.stepName).toBe("Análise de Compatibilidade")
    })
  })

  describe("shouldRetry", () => {
    it("should return true for retryable errors on first attempt", () => {
      const error = handler.classifyError(new TimeoutError("Test", 1000), 1)
      expect(handler.shouldRetry(error, 0)).toBe(true)
    })

    it("should return true for retryable errors on second attempt", () => {
      const error = handler.classifyError(new TimeoutError("Test", 1000), 1)
      expect(handler.shouldRetry(error, 1)).toBe(true)
    })

    it("should return false after max attempts", () => {
      const error = handler.classifyError(new TimeoutError("Test", 1000), 1)
      expect(handler.shouldRetry(error, 2)).toBe(false)
    })

    it("should return false for non-retryable errors", () => {
      const error = handler.classifyError(new Error("Unauthorized"), 1)
      expect(handler.shouldRetry(error, 0)).toBe(false)
    })
  })

  describe("getRetryDelay", () => {
    it("should return 1s for first retry", () => {
      expect(handler.getRetryDelay(0)).toBe(1000)
    })

    it("should return 2s for second retry", () => {
      expect(handler.getRetryDelay(1)).toBe(2000)
    })

    it("should cap at 4s", () => {
      expect(handler.getRetryDelay(5)).toBe(4000)
    })
  })

  describe("getUserFriendlyMessage", () => {
    it("should return localized message for validation error with age", () => {
      const error = new Error("Invalid age field")
      const result = handler.classifyError(error, 1)
      expect(result.userMessage).toContain("idade")
    })

    it("should return localized message for validation error with city", () => {
      const error = new Error("Missing city field")
      const result = handler.classifyError(error, 1)
      expect(result.userMessage).toContain("localização")
    })

    it("should return localized message for validation error with budget", () => {
      const error = new Error("Invalid budget value")
      const result = handler.classifyError(error, 1)
      expect(result.userMessage).toContain("orçamento")
    })

    it("should not expose internal error details", () => {
      const error = new Error(
        "Internal server error: database connection pool exhausted at line 42"
      )
      const result = handler.classifyError(error, 2)
      expect(result.userMessage).not.toContain("pool")
      expect(result.userMessage).not.toContain("line 42")
    })
  })
})

describe("TimeoutError", () => {
  it("should create error with step and timeout info", () => {
    const error = new TimeoutError("extractClientInfo", 10000)

    expect(error.name).toBe("TimeoutError")
    expect(error.step).toBe("extractClientInfo")
    expect(error.timeoutMs).toBe(10000)
    expect(error.message).toContain("extractClientInfo")
    expect(error.message).toContain("10000ms")
  })
})

describe("executeWithTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("should resolve when promise completes before timeout", async () => {
    const promise = Promise.resolve("success")
    const result = await executeWithTimeout(promise, 1000, "test")
    expect(result).toBe("success")
  })

  it("should reject with TimeoutError when timeout is exceeded", async () => {
    const slowPromise = new Promise(resolve => setTimeout(resolve, 2000))

    const resultPromise = executeWithTimeout(slowPromise, 1000, "slowStep")

    vi.advanceTimersByTime(1001)

    await expect(resultPromise).rejects.toThrow(TimeoutError)
    await expect(resultPromise).rejects.toThrow("slowStep")
  })

  it("should include step name in timeout error", async () => {
    const slowPromise = new Promise(resolve => setTimeout(resolve, 2000))

    const resultPromise = executeWithTimeout(slowPromise, 1000, "myStep")

    vi.advanceTimersByTime(1001)

    try {
      await resultPromise
    } catch (error) {
      expect(error).toBeInstanceOf(TimeoutError)
      expect((error as TimeoutError).step).toBe("myStep")
    }
  })
})

describe("withRetry", () => {
  it("should return result on first successful attempt", async () => {
    const fn = vi.fn().mockResolvedValue("success")

    const result = await withRetry(fn, 2, 1)

    expect(result).toBe("success")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("should retry on failure and return on success", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce("success")

    const result = await withRetry(fn, 2, 1)

    expect(result).toBe("success")
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it("should throw after max retries", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Persistent error"))

    await expect(withRetry(fn, 2, 1)).rejects.toThrow("Persistent error")
    expect(fn).toHaveBeenCalledTimes(3) // initial + 2 retries
  })

  it("should not retry non-retryable errors", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("Unauthorized"))

    await expect(withRetry(fn, 2, 1)).rejects.toThrow()
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe("formatErrorForLogging", () => {
  it("should include safe fields", () => {
    const handler = new ErrorHandler()
    const stepError = handler.classifyError(new Error("Test"), 1)

    const formatted = formatErrorForLogging(stepError)

    expect(formatted).toHaveProperty("step")
    expect(formatted).toHaveProperty("stepName")
    expect(formatted).toHaveProperty("type")
    expect(formatted).toHaveProperty("message")
    expect(formatted).toHaveProperty("retryable")
    expect(formatted).toHaveProperty("httpStatus")
  })

  it("should exclude originalError for security", () => {
    const handler = new ErrorHandler()
    const stepError = handler.classifyError(new Error("Test"), 1)

    const formatted = formatErrorForLogging(stepError)

    expect(formatted).not.toHaveProperty("originalError")
    expect(formatted).not.toHaveProperty("userMessage")
  })
})
